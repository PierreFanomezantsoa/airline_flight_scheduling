"""
Télécharge 100 observations météorologiques horaires réelles (sans données modèle)
depuis Meteostat pour les aéroports utilisés dans le projet, puis produit un CSV
compatible avec weather_ml/train_weather_model.py.

Les variables météo proviennent des observations Meteostat.
La colonne `severity` n'est pas une mesure fournie par la station : elle est
calculée localement à partir des conditions observées pour servir de cible ML.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse

import numpy as np
import pandas as pd
import meteostat as ms


STATIONS = {
    "TNR": "67083",  # Antananarivo / Ivato (FMMI)
    "CDG": "07157",  # Paris Charles-de-Gaulle (LFPG)
    "JFK": "74486",  # John F. Kennedy (KJFK)
    "DXB": "41194",  # Dubai International (OMDB)
    "RUN": "61980",  # Saint-Denis / Gillot (FMEE)
    "MRU": "61990",  # Plaisance Mauritius (FIMP)
}

# 17 + 17 + 17 + 17 + 16 + 16 = 100
QUOTAS = {
    "TNR": 17,
    "CDG": 17,
    "JFK": 17,
    "DXB": 17,
    "RUN": 16,
    "MRU": 16,
}


def finite(value) -> bool:
    try:
        return bool(np.isfinite(float(value)))
    except (TypeError, ValueError):
        return False


def severity_from_observation(row: pd.Series) -> float:
    """
    Score de risque météo [0, 1] dérivé des mesures réelles.
    Le score est une cible métier calculée, pas une observation fournie par Meteostat.
    """
    risks = [0.05]

    wspd = row.get("wspd")
    if finite(wspd):
        v = float(wspd)
        if v >= 60:
            risks.append(0.95)
        elif v >= 45:
            risks.append(0.82)
        elif v >= 30:
            risks.append(0.62)
        elif v >= 20:
            risks.append(0.38)
        elif v >= 12:
            risks.append(0.20)

    wpgt = row.get("wpgt")
    if finite(wpgt):
        v = float(wpgt)
        if v >= 90:
            risks.append(1.00)
        elif v >= 70:
            risks.append(0.90)
        elif v >= 55:
            risks.append(0.75)
        elif v >= 40:
            risks.append(0.52)
        elif v >= 25:
            risks.append(0.28)

    prcp = row.get("prcp")
    if finite(prcp):
        v = float(prcp)
        if v >= 20:
            risks.append(0.92)
        elif v >= 10:
            risks.append(0.78)
        elif v >= 5:
            risks.append(0.58)
        elif v >= 2:
            risks.append(0.38)
        elif v > 0:
            risks.append(0.18)

    # Codes Meteostat :
    # 5 brouillard, 6 brouillard givrant, 23 foudre,
    # 25 orage, 26 orage fort, 27 tempête.
    coco = row.get("coco")
    if finite(coco):
        code = int(float(coco))
        condition_risk = {
            5: 0.65,
            6: 0.78,
            9: 0.72,   # forte pluie
            11: 0.82,  # forte pluie verglaçante
            16: 0.72,  # fortes chutes de neige
            18: 0.70,  # forte averse
            20: 0.78,  # forte averse de grésil
            22: 0.78,  # forte averse de neige
            23: 0.82,  # foudre
            24: 0.82,  # grêle
            25: 0.90,  # orage
            26: 0.97,  # orage fort
            27: 1.00,  # tempête
        }.get(code)
        if condition_risk is not None:
            risks.append(condition_risk)

    pres = row.get("pres")
    if finite(pres):
        v = float(pres)
        if v < 985:
            risks.append(0.72)
        elif v < 995:
            risks.append(0.50)

    # Un ciel totalement couvert seul n'est pas critique,
    # mais peut augmenter légèrement le niveau de vigilance.
    cldc = row.get("cldc")
    if finite(cldc):
        v = float(cldc)
        if v >= 8:
            risks.append(0.20)
        elif v >= 6:
            risks.append(0.14)

    return round(float(np.clip(max(risks), 0.0, 1.0)), 3)


def evenly_spaced_sample(df: pd.DataFrame, n: int) -> pd.DataFrame:
    if len(df) < n:
        raise RuntimeError(
            f"Seulement {len(df)} observations exploitables disponibles, "
            f"alors que {n} sont demandées."
        )
    idx = np.linspace(0, len(df) - 1, n, dtype=int)
    return df.iloc[idx].copy()


def fetch_station(airport: str, station_id: str, start: datetime, end: datetime) -> pd.DataFrame:
    params = [
        ms.Parameter.TEMP,
        ms.Parameter.RHUM,
        ms.Parameter.PRCP,
        ms.Parameter.WSPD,
        ms.Parameter.WPGT,
        ms.Parameter.PRES,
        ms.Parameter.CLDC,
        ms.Parameter.COCO,
    ]

    ts = ms.hourly(
        ms.Station(id=station_id),
        start,
        end,
        timezone="UTC",
        parameters=params,
        providers=[ms.Provider.HOURLY],
    )
    df = ts.fetch()

    if df.empty:
        raise RuntimeError(f"Aucune observation reçue pour {airport} / {station_id}.")

    # Écarter les lignes trop incomplètes pour l'entraînement.
    essential = [c for c in ["temp", "rhum", "wspd", "pres"] if c in df.columns]
    df = df.dropna(subset=essential).copy()

    if df.empty:
        raise RuntimeError(f"Aucune observation suffisamment complète pour {airport}.")

    df["airport"] = airport
    df["station_id"] = station_id
    df["observed_at"] = pd.to_datetime(df.index, utc=True)
    df["severity"] = df.apply(severity_from_observation, axis=1)

    # Conversion du couvert nuageux Meteostat (okta 0..8) vers %
    if "cldc" in df.columns:
        df["cloud_cover_pct"] = pd.to_numeric(df["cldc"], errors="coerce") * 12.5
    else:
        df["cloud_cover_pct"] = np.nan

    # visibility n'est pas disponible dans le provider Hourly global.
    # On conserve la colonne pour compatibilité ; le trainer sait gérer les valeurs manquantes.
    df["visibility_km"] = np.nan

    coco = pd.to_numeric(df.get("coco"), errors="coerce")
    df["thunderstorm"] = np.where(
        coco.isna(),
        np.nan,
        coco.isin([23, 25, 26, 27]).astype(float),
    )
    df["fog"] = np.where(
        coco.isna(),
        np.nan,
        coco.isin([5, 6]).astype(float),
    )

    out = pd.DataFrame(
        {
            "airport": df["airport"],
            "station_id": df["station_id"],
            "observed_at": df["observed_at"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "severity": df["severity"],
            "temperature_c": pd.to_numeric(df.get("temp"), errors="coerce"),
            "wind_speed_kmh": pd.to_numeric(df.get("wspd"), errors="coerce"),
            "wind_gust_kmh": pd.to_numeric(df.get("wpgt"), errors="coerce"),
            "visibility_km": df["visibility_km"],
            "precipitation_mm": pd.to_numeric(df.get("prcp"), errors="coerce"),
            "humidity_pct": pd.to_numeric(df.get("rhum"), errors="coerce"),
            "pressure_hpa": pd.to_numeric(df.get("pres"), errors="coerce"),
            "cloud_cover_pct": df["cloud_cover_pct"],
            "thunderstorm": df["thunderstorm"],
            "fog": df["fog"],
            "condition_code": coco,
            "source": "Meteostat observation-only",
        }
    )

    return out.sort_values("observed_at").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Construit un weather_history.csv à partir d'observations Meteostat réelles."
    )
    parser.add_argument(
        "--output",
        default="data/weather_history.csv",
        help="Chemin du CSV de sortie",
    )
    parser.add_argument("--year", type=int, default=2025)
    args = parser.parse_args()

    # IMPORTANT : désactive le remplacement des observations manquantes
    # par des valeurs issues de modèles météo.
    ms.config.include_model_data = False

    start = datetime(args.year, 1, 1, 0, 0)
    end = datetime(args.year, 12, 31, 23, 59)

    chunks = []
    for airport, station_id in STATIONS.items():
        print(f"Téléchargement {airport} ({station_id})...")
        raw = fetch_station(airport, station_id, start, end)
        sample = evenly_spaced_sample(raw, QUOTAS[airport])
        chunks.append(sample)
        print(f"  {len(raw)} observations réelles disponibles ; {len(sample)} retenues.")

    result = (
        pd.concat(chunks, ignore_index=True)
        .sort_values("observed_at")
        .reset_index(drop=True)
    )

    if len(result) != 100:
        raise RuntimeError(f"Le fichier devait contenir 100 lignes, obtenu : {len(result)}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output, index=False, encoding="utf-8")

    print("=" * 72)
    print("weather_history.csv créé")
    print("=" * 72)
    print(f"Fichier          : {output.resolve()}")
    print(f"Observations     : {len(result)}")
    print(f"Aéroports        : {result['airport'].nunique()}")
    print(f"Début            : {result['observed_at'].min()}")
    print(f"Fin              : {result['observed_at'].max()}")
    print("Répartition :")
    print(result["airport"].value_counts().sort_index().to_string())
    print("-")
    print(
        "NB : les paramètres météo proviennent d'observations réelles ; "
        "la colonne severity est une cible métier calculée."
    )


if __name__ == "__main__":
    main()
