"""
OilSumpML Model Definition
Subsystem: OIL SUMP & FILTER
Algorithm: RandomForest / Gradient Boosted Regressors (scikit-learn)
Inputs: obs_oil_temp, obs_oil_press, obs_rpm, engine_hours, oil_age_hours, ambient_temp, throttle
Outputs: oilTemp, oilPressure, viscosityIndex, filterCloggingScore, lubricationRisk
"""

import os
import joblib

class OilSumpML:
    def __init__(self, artifact_path="ml/artifacts/OilSumpML/model.joblib"):
        self.model_name = "OilSumpML"
        self.algorithm = "RandomForest / Gradient Boosted Decision Trees (scikit-learn)"
        self.inputs = [
            "obs_oil_temp", "obs_oil_press", "obs_rpm", "engine_hours",
            "oil_age_hours", "ambient_temp", "throttle"
        ]
        self.outputs = ["oilTemp", "oilPressure", "viscosityIndex", "filterCloggingScore", "lubricationRisk"]
        self.artifact_path = artifact_path
        self.estimator = None
        self.load_model()

    def load_model(self):
        if os.path.exists(self.artifact_path):
            try:
                self.estimator = joblib.load(self.artifact_path)
            except Exception as e:
                print(f"[WARN] Could not load artifact {self.artifact_path}: {e}")

    def predict(self, features):
        if self.estimator is not None:
            X = [[
                features.get("obs_oil_temp", 92.0),
                features.get("obs_oil_press", 4.8),
                features.get("obs_rpm", 4800.0),
                features.get("engine_hours", 250.0),
                features.get("oil_age_hours", 45.0),
                features.get("ambient_temp", -5.0),
                features.get("throttle", 65.0),
            ]]
            preds = self.estimator.predict(X)[0]
            viscosity_idx, lub_risk = preds[:2]
            temp = features.get("obs_oil_temp", 92.0)
            press = features.get("obs_oil_press", 4.8)
            filter_clog = min(100.0, max(0.0, features.get("oil_age_hours", 45.0) * 0.6))

            status = "CRITICAL" if press < 2.5 or lub_risk > 80 else "WARNING" if press < 3.2 or lub_risk > 50 else "NOMINAL"

            return {
                "id": "OilSumpML",
                "subsystemName": "OIL SUMP & FILTER",
                "oilTemp": round(float(temp), 1),
                "oilPressure": round(float(press), 1),
                "viscosityIndex": round(float(viscosity_idx), 1),
                "filterCloggingScore": round(float(filter_clog), 1),
                "lubricationRisk": round(float(lub_risk), 1),
                "status": status,
                "health": round(max(0.0, min(1.0, viscosity_idx / 100.0)), 2),
            }

        temp = features.get("obs_oil_temp", 92.0)
        press = features.get("obs_oil_press", 4.8)
        visc = max(30.0, 100.0 - (temp - 90.0) * 1.5)
        lub_risk = 85.0 if press < 3.0 else 70.0 if temp > 110.0 else 12.0

        return {
            "id": "OilSumpML",
            "subsystemName": "OIL SUMP & FILTER",
            "oilTemp": round(temp, 1),
            "oilPressure": round(press, 1),
            "viscosityIndex": round(visc, 1),
            "filterCloggingScore": round(features.get("oil_age_hours", 45.0) * 0.6, 1),
            "lubricationRisk": round(lub_risk, 1),
            "status": "CRITICAL" if lub_risk > 80 else "NOMINAL",
            "health": round(max(0.0, min(1.0, visc / 100.0)), 2),
        }
