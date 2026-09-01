"""
Evaluation Script for All 6 Engine Subsystem ML Models
Loads actual saved model.joblib artifacts, executes predictions on the test dataset split,
computes metrics directly, and outputs ml/artifacts/evaluation_summary.json.
"""

import os
import json
import math
import numpy as np
import joblib
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

from ml.training.train_all import load_dataset

def evaluate_all():
    print("======================================================================")
    print("      AERIS-TWIN 6-SUBSYSTEM ML MODEL EVALUATION PIPELINE             ")
    print("======================================================================")

    data = load_dataset()
    test_rows = [r for r in data if r["split"] == "test"]
    print(f"Loaded {len(test_rows)} test samples for evaluation.")

    artifacts = [
        ("CylinderHeadML", ["obs_rpm", "throttle", "coolant_flow_lmin", "ambient_temp", "altitude", "air_density_ratio", "obs_map", "iat_celsius", "res_cht2"], ["obs_cht1", "obs_cht2", "obs_cht3", "obs_cht4", "thermal_stress", "overheat_risk"]),
        ("ExhaustML", ["obs_rpm", "obs_map", "throttle", "obs_cht1", "obs_cht2", "res_egt1", "ambient_temp", "air_density_ratio"], ["obs_egt1", "obs_egt2", "obs_egt3", "obs_egt4", "runner_balance", "combustion_eff", "injector_risk"]),
        ("TurboIntakeML", ["altitude", "baro_pressure_kpa", "air_density_ratio", "iat_celsius", "throttle", "obs_rpm", "obs_map", "res_boost"], ["true_turbo_rpm", "true_boost", "compressor_eff", "wastegate_risk"]),
        ("CrankcaseML", ["obs_vib_rms", "dominant_freq", "bpfo_peak", "obs_rpm", "engine_hours", "res_vib"], ["structural_health", "bearing_fatigue", "estimated_rul"]),
        ("OilSumpML", ["obs_oil_temp", "obs_oil_press", "obs_rpm", "engine_hours", "oil_age_hours", "ambient_temp", "throttle"], ["viscosity_idx", "lubrication_risk"]),
        ("PropGearboxML", ["prop_rpm", "prop_vib", "gearbox_temp", "engine_hours", "obs_vib_rms", "throttle", "res_vib"], ["gear_wear_idx", "gear_pitting_risk"]),
    ]

    summary = {
        "title": "AERIS-TWIN 6-Subsystem Engine Digital Twin Model Evaluation Summary",
        "dataset_version": "AERIS-TWIN Synthetic v1.0",
        "total_samples": len(data),
        "test_samples": len(test_rows),
        "seed": 42,
        "models": {}
    }

    for name, features, targets in artifacts:
        art_path = os.path.join("ml/artifacts", name, "model.joblib")
        if not os.path.exists(art_path):
            print(f"[WARN] Missing artifact: {art_path}")
            continue

        estimator = joblib.load(art_path)
        X_test = np.array([[r[f] for f in features] for r in test_rows])
        y_test = np.array([[r[t] for t in targets] for r in test_rows])

        y_pred = estimator.predict(X_test)
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = math.sqrt(mean_squared_error(y_test, y_pred))

        summary["models"][name] = {
            "artifact_path": art_path,
            "features": features,
            "targets": targets,
            "metrics": {
                "r2_score": round(float(r2), 4),
                "mae": round(float(mae), 4),
                "rmse": round(float(rmse), 4),
            }
        }
        print(f"[EVALUATED] {name} -> R²: {r2:.4f}, MAE: {mae:.4f}, RMSE: {rmse:.4f}")

    output_path = "ml/artifacts/evaluation_summary.json"
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)

    print("----------------------------------------------------------------------")
    print(f"[SUCCESS] Summary exported -> {output_path}")
    print("======================================================================")

if __name__ == "__main__":
    evaluate_all()
