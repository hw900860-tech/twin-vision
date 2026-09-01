"""
TurboIntakeML Model Definition
Subsystem: INTAKE / TURBO & CARBS
Algorithm: RandomForest / Gradient Boosted Regressors (scikit-learn)
Inputs: altitude, baro_pressure_kpa, air_density_ratio, iat_celsius, throttle, obs_rpm, obs_map, res_boost
Outputs: turboRPM, boostPressure, boostDeviation, compressorEfficiency, wastegateAnomaly, stallRisk
"""

import os
import joblib

class TurboIntakeML:
    def __init__(self, artifact_path="ml/artifacts/TurboIntakeML/model.joblib"):
        self.model_name = "TurboIntakeML"
        self.algorithm = "RandomForest / Gradient Boosted Decision Trees (scikit-learn)"
        self.inputs = [
            "altitude", "baro_pressure_kpa", "air_density_ratio", "iat_celsius",
            "throttle", "obs_rpm", "obs_map", "res_boost"
        ]
        self.outputs = ["turboRPM", "boostPressure", "boostDeviation", "compressorEfficiency", "wastegateAnomaly", "stallRisk"]
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
                features.get("altitude", 6000.0),
                features.get("baro_pressure_kpa", 81.0),
                features.get("air_density_ratio", 0.80),
                features.get("iat_celsius", 9.0),
                features.get("throttle", 65.0),
                features.get("obs_rpm", 4800.0),
                features.get("obs_map", 27.0),
                features.get("res_boost", 0.0),
            ]]
            preds = self.estimator.predict(X)[0]
            turbo_rpm, boost_press, compressor_eff, wastegate_anomaly = preds[:4]
            exp_boost = 18.0 + features.get("throttle", 65.0) * 0.14
            boost_dev = abs(boost_press - exp_boost)
            stall_risk = min(100.0, max(0.0, wastegate_anomaly * 0.9))

            status = "CRITICAL" if wastegate_anomaly > 80 or boost_press < 15.0 else "WARNING" if wastegate_anomaly > 50 or boost_dev > 5.0 else "NOMINAL"

            return {
                "id": "TurboIntakeML",
                "subsystemName": "INTAKE / TURBO & CARBS",
                "turboRPM": round(float(turbo_rpm), 0),
                "boostPressure": round(float(boost_press), 1),
                "boostDeviation": round(float(boost_dev), 1),
                "compressorEfficiency": round(float(compressor_eff), 1),
                "wastegateAnomaly": round(float(wastegate_anomaly), 1),
                "stallRisk": round(float(stall_risk), 1),
                "status": status,
                "health": round(max(0.0, min(1.0, compressor_eff / 100.0)), 2),
            }

        alt = features.get("altitude", 6000)
        thr = features.get("throttle", 65)
        alt_factor = features.get("air_density_ratio", 0.8)
        turbo_comp = (1.0 - alt_factor) * 100.0
        turbo_rpm = 85000.0 + (thr / 100.0) * 45000.0 + turbo_comp * 400.0
        boost_press = features.get("obs_map", 27) * 1.05
        wastegate_anomaly = 92.0 if features.get("fault_turbo_fail") else min(100.0, max(0.0, (alt - 15000.0) / 200.0))

        return {
            "id": "TurboIntakeML",
            "subsystemName": "INTAKE / TURBO & CARBS",
            "turboRPM": round(turbo_rpm, 0),
            "boostPressure": round(boost_press, 1),
            "boostDeviation": round(abs(boost_press - (18 + thr * 0.14)), 1),
            "compressorEfficiency": round(max(30.0, 95.0 - turbo_comp * 0.8), 1),
            "wastegateAnomaly": round(wastegate_anomaly, 1),
            "stallRisk": round(wastegate_anomaly * 0.9, 1),
            "status": "CRITICAL" if wastegate_anomaly > 80 else "NOMINAL",
            "health": round(max(0.0, min(1.0, (100 - wastegate_anomaly) / 100.0)), 2),
        }
