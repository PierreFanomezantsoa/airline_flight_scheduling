"""Entraîne le modèle ML local de secours à partir d'un historique CSV.

CSV attendu : airport, observed_at, severity
- airport : code IATA
- observed_at : datetime ISO
- severity : score cible entre 0 et 1

Le modèle apprend une climatologie temporelle locale. Il sert de secours lorsque
l'API est indisponible; il ne doit pas déclencher seul un changement automatique
de statut opérationnel.
"""
from pathlib import Path
import argparse

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Historique météo CSV")
    parser.add_argument(
        "--output",
        default="models/weather_severity_model.joblib",
        help="Chemin du modèle joblib",
    )
    args = parser.parse_args()

    df = pd.read_csv(args.csv)
    required = {"airport", "observed_at", "severity"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Colonnes manquantes: {sorted(missing)}")

    dt = pd.to_datetime(df["observed_at"], utc=True, errors="coerce")
    df = df.loc[dt.notna()].copy()
    dt = dt.loc[dt.notna()]

    df["airport"] = df["airport"].astype(str).str.strip().str.upper()
    df["month"] = dt.dt.month
    df["day"] = dt.dt.day
    df["day_of_year"] = dt.dt.dayofyear
    df["hour"] = dt.dt.hour
    df["weekday"] = dt.dt.weekday
    df["severity"] = pd.to_numeric(df["severity"], errors="coerce").clip(0, 1)
    df = df.dropna(subset=["severity"])

    features = ["airport", "month", "day", "day_of_year", "hour", "weekday"]
    X = df[features]
    y = df["severity"]

    preprocessor = ColumnTransformer(
        [
            (
                "airport",
                OneHotEncoder(handle_unknown="ignore"),
                ["airport"],
            ),
            (
                "time",
                "passthrough",
                ["month", "day", "day_of_year", "hour", "weekday"],
            ),
        ]
    )
    model = Pipeline(
        [
            ("preprocessor", preprocessor),
            (
                "regressor",
                RandomForestRegressor(
                    n_estimators=250,
                    max_depth=14,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    print(f"MAE test: {mean_absolute_error(y_test, pred):.4f}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output)
    print(f"Modèle enregistré: {output.resolve()}")


if __name__ == "__main__":
    main()
