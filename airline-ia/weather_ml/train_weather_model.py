"""Entraînement du modèle météo local de secours / conseil OCC.

Le modèle principal reste volontairement compatible avec l'ancien provider :
`joblib.load(path)` retourne directement un estimateur scikit-learn exposant
`.predict(DataFrame)` et utilisant les colonnes :

    airport, month, day, day_of_year, hour, weekday

Améliorations par rapport à la version initiale :
- nettoyage et contrôle des données plus stricts ;
- découpage CHRONOLOGIQUE train/test pour éviter la fuite temporelle ;
- validation croisée temporelle lorsque le volume le permet ;
- ExtraTreesRegressor robuste pour une climatologie locale non linéaire ;
- métriques MAE / RMSE / R² / erreur P90 ;
- métadonnées JSON (version, couverture, aéroports, qualité) ;
- profil climatologique par aéroport pour fallback / confiance ;
- modèle enrichi optionnel lorsqu'un historique contient des variables météo ;
- aucun changement de statut opérationnel automatique à partir du ML local.

CSV minimal :
    airport,observed_at,severity

Colonnes optionnelles reconnues pour un SECOND modèle enrichi :
    temperature_c, wind_speed_kmh, wind_gust_kmh, visibility_km,
    precipitation_mm, humidity_pct, pressure_hpa, cloud_cover_pct,
    thunderstorm, fog

Le modèle principal minimal reste toujours généré afin de ne pas casser les
intégrations existantes.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

MODEL_VERSION = "2.0.0"
CORE_FEATURES = ["airport", "month", "day", "day_of_year", "hour", "weekday"]
OPTIONAL_WEATHER_FEATURES = [
    "temperature_c",
    "wind_speed_kmh",
    "wind_gust_kmh",
    "visibility_km",
    "precipitation_mm",
    "humidity_pct",
    "pressure_hpa",
    "cloud_cover_pct",
    "thunderstorm",
    "fog",
]


@dataclass
class Metrics:
    rows_train: int
    rows_test: int
    mae: float
    rmse: float
    r2: float | None
    absolute_error_p90: float


def _safe_float(value: float | np.floating | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def _prepare_dataframe(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)

    required = {"airport", "observed_at", "severity"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Colonnes manquantes: {sorted(missing)}")

    dt = pd.to_datetime(df["observed_at"], utc=True, errors="coerce")
    severity = pd.to_numeric(df["severity"], errors="coerce")

    valid = dt.notna() & severity.notna()
    df = df.loc[valid].copy()
    dt = dt.loc[valid]

    if df.empty:
        raise ValueError("Aucune ligne exploitable après nettoyage.")

    df["observed_at"] = dt
    df["severity"] = severity.loc[valid].clip(0.0, 1.0)
    df["airport"] = df["airport"].astype(str).str.strip().str.upper()
    df = df[df["airport"].str.len().between(3, 8)]

    # Retirer les doublons exacts : mêmes aéroport / instant / cible.
    df = df.drop_duplicates(subset=["airport", "observed_at", "severity"])

    dt = pd.DatetimeIndex(df["observed_at"])
    df["month"] = dt.month
    df["day"] = dt.day
    df["day_of_year"] = dt.dayofyear
    df["hour"] = dt.hour
    df["weekday"] = dt.weekday

    # Normaliser les colonnes optionnelles si elles existent.
    for col in OPTIONAL_WEATHER_FEATURES:
        if col not in df.columns:
            continue
        if col in {"thunderstorm", "fog"}:
            # Accepte bool, 0/1, yes/no, true/false.
            raw = df[col]
            if raw.dtype == bool:
                df[col] = raw.astype(float)
            else:
                mapping = {
                    "true": 1.0,
                    "yes": 1.0,
                    "oui": 1.0,
                    "1": 1.0,
                    "false": 0.0,
                    "no": 0.0,
                    "non": 0.0,
                    "0": 0.0,
                }
                as_text = raw.astype(str).str.strip().str.lower().map(mapping)
                numeric = pd.to_numeric(raw, errors="coerce")
                df[col] = as_text.fillna(numeric)
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.sort_values("observed_at").reset_index(drop=True)

    if len(df) < 30:
        raise ValueError(
            "Historique insuffisant : au moins 30 observations sont recommandées "
            "pour entraîner un modèle local exploitable."
        )

    return df


def _build_core_model(random_state: int = 42) -> Pipeline:
    preprocessor = ColumnTransformer(
        [
            (
                "airport",
                OneHotEncoder(handle_unknown="ignore", min_frequency=2),
                ["airport"],
            ),
            (
                "time",
                "passthrough",
                ["month", "day", "day_of_year", "hour", "weekday"],
            ),
        ],
        remainder="drop",
    )

    # ExtraTrees est très rapide en inférence locale, robuste aux relations non
    # linéaires et permet d'estimer une dispersion entre arbres au runtime.
    regressor = ExtraTreesRegressor(
        n_estimators=500,
        max_depth=18,
        min_samples_leaf=2,
        max_features=0.85,
        bootstrap=False,
        random_state=random_state,
        n_jobs=-1,
    )

    return Pipeline(
        [
            ("preprocessor", preprocessor),
            ("regressor", regressor),
        ]
    )


def _build_enhanced_model(weather_features: list[str], random_state: int = 42) -> Pipeline:
    categorical = ["airport"]
    time_features = ["month", "day", "day_of_year", "hour", "weekday"]
    numeric = time_features + weather_features

    preprocessor = ColumnTransformer(
        [
            (
                "airport",
                OneHotEncoder(handle_unknown="ignore", min_frequency=2),
                categorical,
            ),
            (
                "numeric",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric,
            ),
        ],
        remainder="drop",
    )

    # RandomForest avec bootstrap : bon compromis pour données météo bruitées et
    # estimation de dispersion par arbres.
    regressor = RandomForestRegressor(
        n_estimators=450,
        max_depth=20,
        min_samples_leaf=2,
        max_features=0.8,
        bootstrap=True,
        random_state=random_state,
        n_jobs=-1,
    )

    return Pipeline(
        [
            ("preprocessor", preprocessor),
            ("regressor", regressor),
        ]
    )


def _chronological_split(df: pd.DataFrame, test_ratio: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    test_ratio = min(max(test_ratio, 0.1), 0.4)
    split_idx = max(1, int(len(df) * (1.0 - test_ratio)))
    split_idx = min(split_idx, len(df) - 1)
    return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()


def _evaluate(model: Pipeline, test_df: pd.DataFrame, features: list[str]) -> Metrics:
    y_true = test_df["severity"].to_numpy(dtype=float)
    y_pred = np.clip(model.predict(test_df[features]), 0.0, 1.0)
    abs_err = np.abs(y_true - y_pred)

    r2: float | None
    if len(y_true) >= 2 and float(np.var(y_true)) > 0:
        r2 = _safe_float(r2_score(y_true, y_pred))
    else:
        r2 = None

    return Metrics(
        rows_train=0,
        rows_test=len(test_df),
        mae=float(mean_absolute_error(y_true, y_pred)),
        rmse=float(mean_squared_error(y_true, y_pred) ** 0.5),
        r2=r2,
        absolute_error_p90=float(np.quantile(abs_err, 0.90)),
    )


def _time_series_cv_mae(df: pd.DataFrame, features: list[str], model_factory, max_splits: int = 4) -> list[float]:
    if len(df) < 80:
        return []

    n_splits = min(max_splits, max(2, len(df) // 60))
    splitter = TimeSeriesSplit(n_splits=n_splits)
    maes: list[float] = []

    X = df[features]
    y = df["severity"]

    for train_idx, test_idx in splitter.split(X):
        model = model_factory()
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        pred = np.clip(model.predict(X.iloc[test_idx]), 0.0, 1.0)
        maes.append(float(mean_absolute_error(y.iloc[test_idx], pred)))

    return maes


def _airport_profiles(df: pd.DataFrame) -> dict[str, dict[str, float | int]]:
    profiles: dict[str, dict[str, float | int]] = {}
    for airport, group in df.groupby("airport"):
        profiles[str(airport)] = {
            "count": int(len(group)),
            "meanSeverity": round(float(group["severity"].mean()), 6),
            "medianSeverity": round(float(group["severity"].median()), 6),
            "p90Severity": round(float(group["severity"].quantile(0.9)), 6),
        }
    return profiles


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Entraîne le ML météo local OCC")
    parser.add_argument("--csv", required=True, help="Historique météo CSV")
    parser.add_argument(
        "--output",
        default="models/weather_severity_model.joblib",
        help="Modèle principal compatible avec l'ancien provider",
    )
    parser.add_argument(
        "--enhanced-output",
        default=None,
        help="Modèle enrichi optionnel (défaut : <output>.enhanced.joblib)",
    )
    parser.add_argument("--test-ratio", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument(
        "--skip-cv",
        action="store_true",
        help="Désactive la validation croisée temporelle",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    output = Path(args.output)
    enhanced_output = (
        Path(args.enhanced_output)
        if args.enhanced_output
        else output.with_name(f"{output.stem}.enhanced{output.suffix}")
    )
    metadata_path = output.with_suffix(output.suffix + ".metadata.json")

    df = _prepare_dataframe(csv_path)
    train_df, test_df = _chronological_split(df, args.test_ratio)

    core_model = _build_core_model(args.random_state)
    core_model.fit(train_df[CORE_FEATURES], train_df["severity"])
    core_metrics = _evaluate(core_model, test_df, CORE_FEATURES)
    core_metrics.rows_train = len(train_df)

    cv_mae = []
    if not args.skip_cv:
        cv_mae = _time_series_cv_mae(
            train_df,
            CORE_FEATURES,
            lambda: _build_core_model(args.random_state),
        )

    # Refit final sur toutes les données après évaluation.
    core_model.fit(df[CORE_FEATURES], df["severity"])
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(core_model, output, compress=3)

    available_weather_features = [
        c for c in OPTIONAL_WEATHER_FEATURES if c in df.columns and df[c].notna().mean() >= 0.35
    ]

    enhanced_metrics: Metrics | None = None
    if available_weather_features:
        enhanced_features = CORE_FEATURES + available_weather_features
        enhanced_model = _build_enhanced_model(available_weather_features, args.random_state)
        enhanced_model.fit(train_df[enhanced_features], train_df["severity"])
        enhanced_metrics = _evaluate(enhanced_model, test_df, enhanced_features)
        enhanced_metrics.rows_train = len(train_df)
        enhanced_model.fit(df[enhanced_features], df["severity"])
        enhanced_output.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(enhanced_model, enhanced_output, compress=3)

    coverage_start = df["observed_at"].min()
    coverage_end = df["observed_at"].max()

    metadata = {
        "modelVersion": MODEL_VERSION,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCsv": str(csv_path),
        "rows": int(len(df)),
        "airports": sorted(df["airport"].unique().tolist()),
        "airportCount": int(df["airport"].nunique()),
        "coverageStart": coverage_start.isoformat() if pd.notna(coverage_start) else None,
        "coverageEnd": coverage_end.isoformat() if pd.notna(coverage_end) else None,
        "coreModelPath": str(output),
        "coreFeatures": CORE_FEATURES,
        "coreMetrics": asdict(core_metrics),
        "timeSeriesCvMae": [round(v, 6) for v in cv_mae],
        "timeSeriesCvMaeMean": round(float(np.mean(cv_mae)), 6) if cv_mae else None,
        "enhancedModelPath": str(enhanced_output) if available_weather_features else None,
        "enhancedFeatures": available_weather_features,
        "enhancedMetrics": asdict(enhanced_metrics) if enhanced_metrics else None,
        "globalMeanSeverity": round(float(df["severity"].mean()), 6),
        "airportProfiles": _airport_profiles(df),
        "trustedForAutomaticStatus": False,
        "purpose": "Fallback et signal consultatif OCC; jamais décision automatique seule.",
    }
    _write_json(metadata_path, metadata)

    print("=" * 72)
    print("ML météo local entraîné")
    print("=" * 72)
    print(f"Lignes exploitées        : {len(df)}")
    print(f"Aéroports                : {df['airport'].nunique()}")
    print(f"Couverture               : {coverage_start} -> {coverage_end}")
    print(f"MAE test chronologique   : {core_metrics.mae:.4f}")
    print(f"RMSE test chronologique  : {core_metrics.rmse:.4f}")
    print(f"Erreur absolue P90       : {core_metrics.absolute_error_p90:.4f}")
    if core_metrics.r2 is not None:
        print(f"R² test                  : {core_metrics.r2:.4f}")
    if cv_mae:
        print(f"MAE CV temporelle        : {np.mean(cv_mae):.4f} ± {np.std(cv_mae):.4f}")
    print(f"Modèle principal         : {output.resolve()}")
    print(f"Métadonnées              : {metadata_path.resolve()}")

    if available_weather_features and enhanced_metrics:
        print("-")
        print(f"Modèle enrichi           : {enhanced_output.resolve()}")
        print(f"Variables météo          : {', '.join(available_weather_features)}")
        print(f"MAE enrichi              : {enhanced_metrics.mae:.4f}")
    else:
        print("-")
        print("Modèle enrichi           : non généré (variables météo optionnelles insuffisantes)")

    print("-")
    print("Sécurité opérationnelle  : trustedForAutomaticStatus = false")


if __name__ == "__main__":
    main()
