"""
CylinderHeadML Model Definition
Subsystem: CYLINDER HEAD (ROTAX RED)
Algorithm: RandomForest / Gradient Boosted Regressors & Classifiers
Inputs: obs_rpm, throttle, coolant_flow_lmin, ambient_temp, altitude, air_density_ratio, obs_map, iat_celsius, res_cht2
Outputs: cht1, cht2, cht3, cht4, thermal_stress, overheat_risk, imbalance
"""

import os
import joblib

class CylinderHeadML:
    def __init__(self, artifact_path="ml/artifacts/CylinderHeadML/model.joblib"):
        self.model_name = "CylinderHeadML"
        self.algorithm = "RandomForest / Gradient Boosted Decision Trees (scikit-learn)"
        self.inputs = [
            "obs_rpm", "throttle", "coolant_flow_lmin", "ambient_temp",
            "altitude", "air_density_ratio", "obs_map", "iat_celsius", "res_cht2"
        ]
        self.outputs = ["cht1", "cht2", "cht3", "cht4", "maxCHT", "thermalStress", "overheatRisk", "imbalance"]
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
                features.get("obs_rpm", 4800.0),
                features.get("throttle", 65.0),
                features.get("coolant_flow_lmin", 54.0),
                features.get("ambient_temp", -5.0),
                features.get("altitude", 6000.0),
                features.get("air_density_ratio", 0.80),
                features.get("obs_map", 27.0),
                features.get("iat_celsius", 9.0),
                features.get("res_cht2", 0.0),
            ]]
            preds = self.estimator.predict(X)[0]
            c1, c2, c3, c4, thermal_stress, overheat_risk = preds[:6]
            max_cht = max(c1, c2, c3, c4)
            min_cht = min(c1, c2, c3, c4)
            imbalance = max_cht - min_cht
            return {
                "id": "CylinderHeadML",
                "subsystemName": "CYLINDER HEAD (ROTAX RED)",
                "cht1": round(float(c1), 1),
                "cht2": round(float(c2), 1),
                "cht3": round(float(c3), 1),
                "cht4": round(float(c4), 1),
                "maxCHT": round(float(max_cht), 1),
                "thermalStress": round(float(thermal_stress), 1),
                "overheatRisk": round(float(overheat_risk), 1),
                "imbalance": round(float(imbalance), 1),
                "status": "CRITICAL" if overheat_risk > 80 else "WARNING" if overheat_risk > 50 else "NOMINAL",
                "health": round(max(0.0, min(1.0, 1.0 - overheat_risk / 100.0)), 2),
            }

        # Fallback if artifact not yet generated
        c1 = 96.0 + features.get("throttle", 65) * 0.96
        c2 = c1 + (122.0 if features.get("fault_c2_overheat") or features.get("res_cht2", 0) > 40 else 0)
        c3, c4 = c1, c1
        max_cht = max(c1, c2, c3, c4)
        overheat_risk = min(100.0, max(0.0, ((max_cht - 170.0) / 50.0) * 100.0))
        return {
            "id": "CylinderHeadML",
            "subsystemName": "CYLINDER HEAD (ROTAX RED)",
            "cht1": round(c1, 1),
            "cht2": round(c2, 1),
            "cht3": round(c3, 1),
            "cht4": round(c4, 1),
            "maxCHT": round(max_cht, 1),
            "thermalStress": round(min(100.0, max(0.0, (max_cht - 140.0) / 80.0 * 100.0)), 1),
            "overheatRisk": round(overheat_risk, 1),
            "imbalance": round(max_cht - min(c1, c2, c3, c4), 1),
            "status": "CRITICAL" if overheat_risk > 80 else "WARNING" if overheat_risk > 50 else "NOMINAL",
            "health": round(max(0.0, min(1.0, 1.0 - overheat_risk / 100.0)), 2),
        }
