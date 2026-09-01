"""
CrankcaseML Model Definition
Subsystem: CRANKCASE BLOCK
Algorithm: RandomForest / Gradient Boosted Regressors (scikit-learn)
Inputs: obs_vib_rms, dominant_freq, bpfo_peak, obs_rpm, engine_hours, res_vib
Outputs: vibrationRMS, dominantFreqHz, bpfoPeak, structuralHealth, bearingFatigueIndex, estimatedRUL
"""

import os
import joblib

class CrankcaseML:
    def __init__(self, artifact_path="ml/artifacts/CrankcaseML/model.joblib"):
        self.model_name = "CrankcaseML"
        self.algorithm = "RandomForest / Gradient Boosted Decision Trees (scikit-learn)"
        self.inputs = [
            "obs_vib_rms", "dominant_freq", "bpfo_peak", "obs_rpm", "engine_hours", "res_vib"
        ]
        self.outputs = ["vibrationRMS", "dominantFreqHz", "bpfoPeak", "structuralHealth", "bearingFatigueIndex", "pistonSlapProbability", "estimatedRUL"]
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
                features.get("obs_vib_rms", 0.45),
                features.get("dominant_freq", 80.0),
                features.get("bpfo_peak", 0.12),
                features.get("obs_rpm", 4800.0),
                features.get("engine_hours", 250.0),
                features.get("res_vib", 0.0),
            ]]
            preds = self.estimator.predict(X)[0]
            struct_health, bearing_fatigue, estimated_rul = preds[:3]
            vib = features.get("obs_vib_rms", 0.45)
            bpfo_peak = features.get("bpfo_peak", 0.12)
            dominant_freq = 140 if bearing_fatigue > 60 or bpfo_peak > 1.0 else 80
            piston_slap = min(100.0, max(0.0, (vib - 1.0) * 40.0))

            status = "CRITICAL" if bearing_fatigue > 75 or vib > 1.8 else "WARNING" if bearing_fatigue > 50 or vib > 1.2 else "NOMINAL"

            return {
                "id": "CrankcaseML",
                "subsystemName": "CRANKCASE BLOCK",
                "vibrationRMS": round(float(vib), 2),
                "dominantFreqHz": int(dominant_freq),
                "bpfoPeak": round(float(bpfo_peak), 2),
                "structuralHealth": round(float(struct_health), 1),
                "bearingFatigueIndex": round(float(bearing_fatigue), 1),
                "pistonSlapProbability": round(float(piston_slap), 1),
                "estimatedRUL": round(float(estimated_rul), 0),
                "status": status,
                "health": round(max(0.0, min(1.0, struct_health / 100.0)), 2),
            }

        vib = features.get("obs_vib_rms", 0.42)
        bearing_fault = features.get("fault_bearing_fail") or features.get("res_vib", 0) > 1.0
        bpfo = 1.85 if bearing_fault else 0.12
        fatigue = 94.0 if bearing_fault else min(100.0, max(0.0, (vib - 0.5) * 60.0))

        return {
            "id": "CrankcaseML",
            "subsystemName": "CRANKCASE BLOCK",
            "vibrationRMS": round(vib, 2),
            "dominantFreqHz": 140 if bearing_fault else 80,
            "bpfoPeak": round(bpfo, 2),
            "structuralHealth": round(max(0.0, 100.0 - vib * 35.0 - (50.0 if bearing_fault else 0.0)), 1),
            "bearingFatigueIndex": round(fatigue, 1),
            "pistonSlapProbability": round(min(100.0, max(0.0, (vib - 1.0) * 40.0)), 1),
            "estimatedRUL": round(max(10.0, 480.0 * (1.0 - fatigue / 150.0)), 0),
            "status": "CRITICAL" if bearing_fault else "NOMINAL",
            "health": round(max(0.0, min(1.0, (100 - fatigue) / 100.0)), 2),
        }
