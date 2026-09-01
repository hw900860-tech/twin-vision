"""
PropGearboxML Model Definition
Subsystem: GEARBOX & PROP FLANGE
Algorithm: IsolationForest / RandomForest Regressors (scikit-learn)
Inputs: prop_rpm, prop_vib, gearbox_temp, engine_hours, obs_vib_rms, throttle, res_vib
Outputs: propVibration, torsionalAnomaly, gearWearIndex, gearPittingRisk, slippageRisk
"""

import os
import joblib

class PropGearboxML:
    def __init__(self, artifact_path="ml/artifacts/PropGearboxML/model.joblib"):
        self.model_name = "PropGearboxML"
        self.algorithm = "IsolationForest & RandomForest (scikit-learn)"
        self.inputs = [
            "prop_rpm", "prop_vib", "gearbox_temp", "engine_hours",
            "obs_vib_rms", "throttle", "res_vib"
        ]
        self.outputs = ["propVibration", "torsionalAnomaly", "gearWearIndex", "gearPittingRisk", "slippageRisk"]
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
                features.get("prop_rpm", 1975.0),
                features.get("prop_vib", 0.45),
                features.get("gearbox_temp", 104.0),
                features.get("engine_hours", 250.0),
                features.get("obs_vib_rms", 0.45),
                features.get("throttle", 65.0),
                features.get("res_vib", 0.0),
            ]]
            preds = self.estimator.predict(X)[0]
            wear_idx, pitting_risk = preds[:2]
            prop_vib = features.get("prop_vib", 0.45)
            torsional_anomaly = min(100.0, max(0.0, (prop_vib - 0.6) * 60.0))
            slippage_risk = min(100.0, max(0.0, (wear_idx - 50.0) * 1.5))

            status = "CRITICAL" if pitting_risk > 75 or prop_vib > 1.4 else "WARNING" if pitting_risk > 50 or prop_vib > 1.0 else "NOMINAL"

            return {
                "id": "PropGearboxML",
                "subsystemName": "GEARBOX & PROP FLANGE",
                "propVibration": round(float(prop_vib), 2),
                "torsionalAnomaly": round(float(torsional_anomaly), 1),
                "gearWearIndex": round(float(wear_idx), 1),
                "gearPittingRisk": round(float(pitting_risk), 1),
                "slippageRisk": round(float(slippage_risk), 1),
                "status": status,
                "health": round(max(0.0, min(1.0, (100.0 - gear_wear_idx) / 100.0)), 2) if 'gear_wear_idx' in locals() else round(max(0.0, min(1.0, (100.0 - wear_idx) / 100.0)), 2),
            }

        prop_rpm = features.get("obs_rpm", 4800) / 2.43
        prop_vib = features.get("obs_vib_rms", 0.45) * 0.72 + (0.5 if features.get("fault_gear_wear") else 0.0)
        wear_idx = min(100.0, max(10.0, features.get("engine_hours", 250) * 0.06 + (45.0 if features.get("fault_gear_wear") else 0.0)))
        pitting_risk = min(100.0, max(0.0, (prop_vib - 0.8) * 50.0))

        return {
            "id": "PropGearboxML",
            "subsystemName": "GEARBOX & PROP FLANGE",
            "propVibration": round(prop_vib, 2),
            "torsionalAnomaly": round(min(100.0, max(0.0, (prop_vib - 0.6) * 60.0)), 1),
            "gearWearIndex": round(wear_idx, 1),
            "gearPittingRisk": round(pitting_risk, 1),
            "slippageRisk": round(min(100.0, max(0.0, (wear_idx - 50.0) * 1.5)), 1),
            "status": "CRITICAL" if pitting_risk > 75 else "NOMINAL",
            "health": round(max(0.0, min(1.0, (100.0 - wear_idx) / 100.0)), 2),
        }
