"""
AERIS-TWIN Master 6-Subsystem ML Model Training & Artifact Generator
Fits legitimate scikit-learn estimators for all 6 engine subsystem models,
computes metrics directly from test predictions, serializes joblib artifacts,
and updates metadata JSON files and the model registry.
"""

import os
import json
import csv
import math
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, RandomForestClassifier
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error, accuracy_score, precision_score, recall_score, f1_score
import joblib

from ml.data.generate_engine_dataset import generate_dataset

def load_dataset(csv_path="ml/data/engine_telemetry_dataset.csv"):
    if not os.path.exists(csv_path):
        print(f"[INFO] Dataset file not found at {csv_path}. Generating dataset...")
        generate_dataset(num_samples=100000, seed=42, output_dir="ml/data")

    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed = {}
            for k, v in row.items():
                if k in ["split"]:
                    parsed[k] = v
                elif "." in v:
                    parsed[k] = float(v)
                else:
                    parsed[k] = int(v) if v.isdigit() or (v.startswith("-") and v[1:].isdigit()) else float(v)
            rows.append(parsed)
    return rows

def train_all_models():
    print("======================================================================")
    print("      AERIS-TWIN LEGITIMATE 6-SUBSYSTEM ML MODEL TRAINING PIPELINE    ")
    print("======================================================================")

    data = load_dataset()
    train_rows = [r for r in data if r["split"] == "train"]
    val_rows = [r for r in data if r["split"] == "val"]
    test_rows = [r for r in data if r["split"] == "test"]

    print(f"Dataset Loaded: Train={len(train_rows)} | Val={len(val_rows)} | Test={len(test_rows)}")

    registry = {
        "title": "AERIS-TWIN 6-Subsystem Engine Digital Twin Model Registry",
        "dataset_version": "AERIS-TWIN Synthetic v1.0",
        "seed": 42,
        "models": {}
    }

    # =========================================================================
    # 1. MODEL 1 — CylinderHeadML
    # =========================================================================
    print("\n--- Training Model 1/6: CylinderHeadML ---")
    ch_features = ["obs_rpm", "throttle", "coolant_flow_lmin", "ambient_temp", "altitude", "air_density_ratio", "obs_map", "iat_celsius", "res_cht2"]
    ch_targets = ["obs_cht1", "obs_cht2", "obs_cht3", "obs_cht4", "thermal_stress", "overheat_risk"]

    X_train_ch = np.array([[r[f] for f in ch_features] for r in train_rows])
    y_train_ch = np.array([[r[t] for t in ch_targets] for r in train_rows])
    X_test_ch = np.array([[r[f] for f in ch_features] for r in test_rows])
    y_test_ch = np.array([[r[t] for t in ch_targets] for r in test_rows])

    ch_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    ch_regressor.fit(X_train_ch, y_train_ch)
    y_pred_ch = ch_regressor.predict(X_test_ch)

    r2_ch = r2_score(y_test_ch, y_pred_ch)
    mae_ch = mean_absolute_error(y_test_ch, y_pred_ch)
    rmse_ch = math.sqrt(mean_squared_error(y_test_ch, y_pred_ch))

    ch_dir = "ml/artifacts/CylinderHeadML"
    os.makedirs(ch_dir, exist_ok=True)
    ch_art_path = os.path.join(ch_dir, "model.joblib")
    joblib.dump(ch_regressor, ch_art_path)

    ch_meta = {
        "model_name": "CylinderHeadML",
        "subsystem": "CYLINDER HEAD (ROTAX RED)",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": ch_art_path,
        "training_seed": 42,
        "sample_count": len(data),
        "train_samples": len(train_rows),
        "test_samples": len(test_rows),
        "features": ch_features,
        "targets": ch_targets,
        "metrics": {
            "r2_score": round(float(r2_ch), 4),
            "mae_cht_degC": round(float(mae_ch), 4),
            "rmse_cht_degC": round(float(rmse_ch), 4),
        }
    }
    with open(os.path.join(ch_dir, "metadata.json"), "w") as f:
        json.dump(ch_meta, f, indent=2)
    registry["models"]["CylinderHeadML"] = ch_meta
    print(f"[SUCCESS] CylinderHeadML Fitted -> R²: {r2_ch:.4f}, MAE: {mae_ch:.4f}°C")

    # =========================================================================
    # 2. MODEL 2 — ExhaustML
    # =========================================================================
    print("\n--- Training Model 2/6: ExhaustML ---")
    ex_features = ["obs_rpm", "obs_map", "throttle", "obs_cht1", "obs_cht2", "res_egt1", "ambient_temp", "air_density_ratio"]
    ex_targets = ["obs_egt1", "obs_egt2", "obs_egt3", "obs_egt4", "runner_balance", "combustion_eff", "injector_risk"]

    X_train_ex = np.array([[r[f] for f in ex_features] for r in train_rows])
    y_train_ex = np.array([[r[t] for t in ex_targets] for r in train_rows])
    X_test_ex = np.array([[r[f] for f in ex_features] for r in test_rows])
    y_test_ex = np.array([[r[t] for t in ex_targets] for r in test_rows])

    ex_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    ex_regressor.fit(X_train_ex, y_train_ex)
    y_pred_ex = ex_regressor.predict(X_test_ex)

    r2_ex = r2_score(y_test_ex, y_pred_ex)
    mae_ex = mean_absolute_error(y_test_ex, y_pred_ex)
    rmse_ex = math.sqrt(mean_squared_error(y_test_ex, y_pred_ex))

    ex_dir = "ml/artifacts/ExhaustML"
    os.makedirs(ex_dir, exist_ok=True)
    ex_art_path = os.path.join(ex_dir, "model.joblib")
    joblib.dump(ex_regressor, ex_art_path)

    ex_meta = {
        "model_name": "ExhaustML",
        "subsystem": "EXHAUST MANIFOLD",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": ex_art_path,
        "features": ex_features,
        "targets": ex_targets,
        "metrics": {
            "r2_score": round(float(r2_ex), 4),
            "mae_egt_degC": round(float(mae_ex), 4),
            "rmse_egt_degC": round(float(rmse_ex), 4),
        }
    }
    with open(os.path.join(ex_dir, "metadata.json"), "w") as f:
        json.dump(ex_meta, f, indent=2)
    registry["models"]["ExhaustML"] = ex_meta
    print(f"[SUCCESS] ExhaustML Fitted -> R²: {r2_ex:.4f}, MAE: {mae_ex:.4f}°C")

    # =========================================================================
    # 3. MODEL 3 — TurboIntakeML
    # =========================================================================
    print("\n--- Training Model 3/6: TurboIntakeML ---")
    tb_features = ["altitude", "baro_pressure_kpa", "air_density_ratio", "iat_celsius", "throttle", "obs_rpm", "obs_map", "res_boost"]
    tb_targets = ["true_turbo_rpm", "true_boost", "compressor_eff", "wastegate_risk"]

    X_train_tb = np.array([[r[f] for f in tb_features] for r in train_rows])
    y_train_tb = np.array([[r[t] for t in tb_targets] for r in train_rows])
    X_test_tb = np.array([[r[f] for f in tb_features] for r in test_rows])
    y_test_tb = np.array([[r[t] for t in tb_targets] for r in test_rows])

    tb_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    tb_regressor.fit(X_train_tb, y_train_tb)
    y_pred_tb = tb_regressor.predict(X_test_tb)

    r2_tb = r2_score(y_test_tb, y_pred_tb)
    mae_tb = mean_absolute_error(y_test_tb, y_pred_tb)
    rmse_tb = math.sqrt(mean_squared_error(y_test_tb, y_pred_tb))

    tb_dir = "ml/artifacts/TurboIntakeML"
    os.makedirs(tb_dir, exist_ok=True)
    tb_art_path = os.path.join(tb_dir, "model.joblib")
    joblib.dump(tb_regressor, tb_art_path)

    tb_meta = {
        "model_name": "TurboIntakeML",
        "subsystem": "INTAKE / TURBO & CARBS",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": tb_art_path,
        "features": tb_features,
        "targets": tb_targets,
        "metrics": {
            "r2_score": round(float(r2_tb), 4),
            "mae_score": round(float(mae_tb), 4),
            "rmse_score": round(float(rmse_tb), 4),
        }
    }
    with open(os.path.join(tb_dir, "metadata.json"), "w") as f:
        json.dump(tb_meta, f, indent=2)
    registry["models"]["TurboIntakeML"] = tb_meta
    print(f"[SUCCESS] TurboIntakeML Fitted -> R²: {r2_tb:.4f}, MAE: {mae_tb:.4f}")

    # =========================================================================
    # 4. MODEL 4 — CrankcaseML
    # =========================================================================
    print("\n--- Training Model 4/6: CrankcaseML ---")
    cc_features = ["obs_vib_rms", "dominant_freq", "bpfo_peak", "obs_rpm", "engine_hours", "res_vib"]
    cc_targets = ["structural_health", "bearing_fatigue", "estimated_rul"]

    X_train_cc = np.array([[r[f] for f in cc_features] for r in train_rows])
    y_train_cc = np.array([[r[t] for t in cc_targets] for r in train_rows])
    X_test_cc = np.array([[r[f] for f in cc_features] for r in test_rows])
    y_test_cc = np.array([[r[t] for t in cc_targets] for r in test_rows])

    cc_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    cc_regressor.fit(X_train_cc, y_train_cc)
    y_pred_cc = cc_regressor.predict(X_test_cc)

    r2_cc = r2_score(y_test_cc, y_pred_cc)
    mae_cc = mean_absolute_error(y_test_cc, y_pred_cc)
    rmse_cc = math.sqrt(mean_squared_error(y_test_cc, y_pred_cc))

    # Calculate RUL specific MAE
    rul_test = y_test_cc[:, 2]
    rul_pred = y_pred_cc[:, 2]
    rul_mae = mean_absolute_error(rul_test, rul_pred)

    cc_dir = "ml/artifacts/CrankcaseML"
    os.makedirs(cc_dir, exist_ok=True)
    cc_art_path = os.path.join(cc_dir, "model.joblib")
    joblib.dump(cc_regressor, cc_art_path)

    cc_meta = {
        "model_name": "CrankcaseML",
        "subsystem": "CRANKCASE BLOCK",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": cc_art_path,
        "features": cc_features,
        "targets": cc_targets,
        "metrics": {
            "r2_score": round(float(r2_cc), 4),
            "mae_score": round(float(mae_cc), 4),
            "rmse_score": round(float(rmse_cc), 4),
            "rul_mae_hours": round(float(rul_mae), 2),
        }
    }
    with open(os.path.join(cc_dir, "metadata.json"), "w") as f:
        json.dump(cc_meta, f, indent=2)
    registry["models"]["CrankcaseML"] = cc_meta
    print(f"[SUCCESS] CrankcaseML Fitted -> R²: {r2_cc:.4f}, RUL MAE: {rul_mae:.2f} hours")

    # =========================================================================
    # 5. MODEL 5 — OilSumpML
    # =========================================================================
    print("\n--- Training Model 5/6: OilSumpML ---")
    ol_features = ["obs_oil_temp", "obs_oil_press", "obs_rpm", "engine_hours", "oil_age_hours", "ambient_temp", "throttle"]
    ol_targets = ["viscosity_idx", "lubrication_risk"]

    X_train_ol = np.array([[r[f] for f in ol_features] for r in train_rows])
    y_train_ol = np.array([[r[t] for t in ol_targets] for r in train_rows])
    X_test_ol = np.array([[r[f] for f in ol_features] for r in test_rows])
    y_test_ol = np.array([[r[t] for t in ol_targets] for r in test_rows])

    ol_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    ol_regressor.fit(X_train_ol, y_train_ol)
    y_pred_ol = ol_regressor.predict(X_test_ol)

    r2_ol = r2_score(y_test_ol, y_pred_ol)
    mae_ol = mean_absolute_error(y_test_ol, y_pred_ol)
    rmse_ol = math.sqrt(mean_squared_error(y_test_ol, y_pred_ol))

    ol_dir = "ml/artifacts/OilSumpML"
    os.makedirs(ol_dir, exist_ok=True)
    ol_art_path = os.path.join(ol_dir, "model.joblib")
    joblib.dump(ol_regressor, ol_art_path)

    ol_meta = {
        "model_name": "OilSumpML",
        "subsystem": "OIL SUMP & FILTER",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": ol_art_path,
        "features": ol_features,
        "targets": ol_targets,
        "metrics": {
            "r2_score": round(float(r2_ol), 4),
            "mae_score": round(float(mae_ol), 4),
            "rmse_score": round(float(rmse_ol), 4),
        }
    }
    with open(os.path.join(ol_dir, "metadata.json"), "w") as f:
        json.dump(ol_meta, f, indent=2)
    registry["models"]["OilSumpML"] = ol_meta
    print(f"[SUCCESS] OilSumpML Fitted -> R²: {r2_ol:.4f}, MAE: {mae_ol:.4f}")

    # =========================================================================
    # 6. MODEL 6 — PropGearboxML
    # =========================================================================
    print("\n--- Training Model 6/6: PropGearboxML ---")
    gb_features = ["prop_rpm", "prop_vib", "gearbox_temp", "engine_hours", "obs_vib_rms", "throttle", "res_vib"]
    gb_targets = ["gear_wear_idx", "gear_pitting_risk"]

    X_train_gb = np.array([[r[f] for f in gb_features] for r in train_rows])
    y_train_gb = np.array([[r[t] for t in gb_targets] for r in train_rows])
    X_test_gb = np.array([[r[f] for f in gb_features] for r in test_rows])
    y_test_gb = np.array([[r[t] for t in gb_targets] for r in test_rows])

    gb_regressor = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
    gb_regressor.fit(X_train_gb, y_train_gb)
    y_pred_gb = gb_regressor.predict(X_test_gb)

    r2_gb = r2_score(y_test_gb, y_pred_gb)
    mae_gb = mean_absolute_error(y_test_gb, y_pred_gb)
    rmse_gb = math.sqrt(mean_squared_error(y_test_gb, y_pred_gb))

    gb_dir = "ml/artifacts/PropGearboxML"
    os.makedirs(gb_dir, exist_ok=True)
    gb_art_path = os.path.join(gb_dir, "model.joblib")
    joblib.dump(gb_regressor, gb_art_path)

    gb_meta = {
        "model_name": "PropGearboxML",
        "subsystem": "GEARBOX & PROP FLANGE",
        "version": "1.0.0",
        "algorithm": "RandomForestRegressor (scikit-learn)",
        "artifact_path": gb_art_path,
        "features": gb_features,
        "targets": gb_targets,
        "metrics": {
            "r2_score": round(float(r2_gb), 4),
            "mae_score": round(float(mae_gb), 4),
            "rmse_score": round(float(rmse_gb), 4),
        }
    }
    with open(os.path.join(gb_dir, "metadata.json"), "w") as f:
        json.dump(gb_meta, f, indent=2)
    registry["models"]["PropGearboxML"] = gb_meta
    print(f"[SUCCESS] PropGearboxML Fitted -> R²: {r2_gb:.4f}, MAE: {mae_gb:.4f}")

    # =========================================================================
    # Write Registry Artifact
    # =========================================================================
    reg_path = "ml/artifacts/model_registry.json"
    with open(reg_path, "w") as f:
        json.dump(registry, f, indent=2)

    print("\n======================================================================")
    print(f" ALL 6 SUBSYSTEM MODELS TRAINED & SERIALIZED TO ml/artifacts/")
    print(f" Registry Updated -> {reg_path}")
    print("======================================================================")

if __name__ == "__main__":
    train_all_models()
