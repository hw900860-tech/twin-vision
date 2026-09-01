"""
ExhaustML Model Definition
Subsystem: EXHAUST MANIFOLD
Algorithm: RandomForest / Gradient Boosted Regressors (scikit-learn)
Inputs: obs_rpm, obs_map, throttle, obs_cht1, obs_cht2, res_egt1, ambient_temp, air_density_ratio
Outputs: egt1, egt2, egt3, egt4, avgEGT, runnerBalance, combustionEfficiency, injectorAnomalyRisk
"""

import os
import joblib

class ExhaustML:
    def __init__(self, artifact_path="ml/artifacts/ExhaustML/model.joblib"):
        self.model_name = "ExhaustML"
        self.algorithm = "RandomForest / Gradient Boosted Decision Trees (scikit-learn)"
        self.inputs = [
            "obs_rpm", "obs_map", "throttle", "obs_cht1",
            "obs_cht2", "res_egt1", "ambient_temp", "air_density_ratio"
        ]
        self.outputs = ["egt1", "egt2", "egt3", "egt4", "avgEGT", "runnerBalance", "combustionEfficiency", "injectorAnomalyRisk"]
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
                features.get("obs_map", 27.0),
                features.get("throttle", 65.0),
                features.get("obs_cht1", 160.0),
                features.get("obs_cht2", 160.0),
                features.get("res_egt1", 0.0),
                features.get("ambient_temp", -5.0),
                features.get("air_density_ratio", 0.80),
            ]]
            preds = self.estimator.predict(X)[0]
            e1, e2, e3, e4, runner_bal, comb_eff, injector_risk = preds[:7]
            avg_egt = (e1 + e2 + e3 + e4) / 4.0
            return {
                "id": "ExhaustML",
                "subsystemName": "EXHAUST MANIFOLD",
                "egt1": round(float(e1), 1),
                "egt2": round(float(e2), 1),
                "egt3": round(float(e3), 1),
                "egt4": round(float(e4), 1),
                "avgEGT": round(float(avg_egt), 1),
                "runnerBalance": round(float(runner_bal), 1),
                "combustionEfficiency": round(float(comb_eff), 1),
                "injectorAnomalyRisk": round(float(injector_risk), 1),
                "status": "CRITICAL" if injector_risk > 80 or avg_egt > 780 else "WARNING" if injector_risk > 50 or avg_egt > 720 else "NOMINAL",
                "health": round(max(0.0, min(1.0, (runner_bal / 100.0) * (1.0 - injector_risk / 200.0))), 2),
            }

        base_egt = 528.0 + features.get("throttle", 65) * 2.36
        clog = 68.0 if features.get("fault_injector_clog") or features.get("res_egt1", 0) > 30 else 0.0
        e1, e2, e3, e4 = base_egt + clog, base_egt - 12.0, base_egt + 8.0, base_egt - 5.0
        avg_egt = (e1 + e2 + e3 + e4) / 4.0
        injector_risk = 88.0 if clog > 0 else min(100.0, max(0.0, (avg_egt - 680.0) * 0.4))
        return {
            "id": "ExhaustML",
            "subsystemName": "EXHAUST MANIFOLD",
            "egt1": round(e1, 1),
            "egt2": round(e2, 1),
            "egt3": round(e3, 1),
            "egt4": round(e4, 1),
            "avgEGT": round(avg_egt, 1),
            "runnerBalance": round(max(0.0, 100.0 - clog * 0.8), 1),
            "combustionEfficiency": round(max(40.0, 98.0 - clog * 0.4), 1),
            "injectorAnomalyRisk": round(injector_risk, 1),
            "status": "CRITICAL" if injector_risk > 80 else "NOMINAL",
            "health": round(max(0.0, min(1.0, 1.0 - injector_risk / 150.0)), 2),
        }
