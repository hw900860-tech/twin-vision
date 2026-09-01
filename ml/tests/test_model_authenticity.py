"""
AERIS-TWIN Model Authenticity Test Suite
Verifies that all 6 subsystem models use genuine serialized joblib estimators,
load successfully, produce non-constant outputs for different telemetry inputs,
and contain valid computed test metrics.
"""

import os
import sys
import json
import joblib
import numpy as np

def run_authenticity_tests():
    print("======================================================================")
    print("      AERIS-TWIN MODEL AUTHENTICITY & SERIALIZATION TEST SUITE       ")
    print("======================================================================")

    passed = 0
    failed = 0

    def assert_test(name, condition, details=""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"[PASS] {name} {details}")
        else:
            failed += 1
            print(f"[FAIL] {name} {details}")

    models = [
        "CylinderHeadML",
        "ExhaustML",
        "TurboIntakeML",
        "CrankcaseML",
        "OilSumpML",
        "PropGearboxML",
    ]

    for model_name in models:
        art_path = os.path.join("ml/artifacts", model_name, "model.joblib")
        meta_path = os.path.join("ml/artifacts", model_name, "metadata.json")

        # 1. Artifact Existence Test
        art_exists = os.path.exists(art_path)
        assert_test(f"1. {model_name} Joblib Artifact Exists", art_exists, f"Path: {art_path}")
        if not art_exists:
            continue

        # 2. Joblib Load Test
        try:
            estimator = joblib.load(art_path)
            assert_test(f"2. {model_name} Joblib Load", True, f"Loaded: {type(estimator).__name__}")
        except Exception as e:
            assert_test(f"2. {model_name} Joblib Load", False, f"Error: {e}")
            continue

        # 3. Fitted Estimator API Test
        has_predict = hasattr(estimator, "predict")
        assert_test(f"3. {model_name} Fitted Estimator API", has_predict, "hasattr(predict) == True")

        # 4. Non-Constant Output Test (State A: Throttle 20% vs State B: Throttle 80%)
        try:
            if model_name == "CylinderHeadML":
                xA = np.array([[2400, 20, 35, 15, 2000, 0.93, 20, 20, 0]])
                xB = np.array([[3800, 80, 60, -5, 12000, 0.65, 30, 10, 0]])
            elif model_name == "ExhaustML":
                xA = np.array([[2400, 20, 20, 140, 140, 0, 15, 0.93]])
                xB = np.array([[3800, 30, 80, 180, 180, 0, -5, 0.65]])
            elif model_name == "TurboIntakeML":
                xA = np.array([[2000, 95.0, 0.93, 20, 20, 2400, 20, 0]])
                xB = np.array([[18000, 52.0, 0.58, 10, 80, 3800, 30, 0]])
            elif model_name == "CrankcaseML":
                xA = np.array([[0.45, 80, 0.12, 2400, 100, 0]])
                xB = np.array([[2.30, 140, 1.85, 3800, 800, 1.5]])
            elif model_name == "OilSumpML":
                xA = np.array([[80.0, 5.2, 2400, 100, 10, 15, 20]])
                xB = np.array([[115.0, 3.1, 3800, 600, 120, -5, 80]])
            else:
                xA = np.array([[1000, 0.45, 90, 100, 0.45, 20, 0]])
                xB = np.array([[1600, 1.20, 120, 600, 1.20, 80, 0.8]])

            predA = estimator.predict(xA)
            predB = estimator.predict(xB)
            is_different = not np.allclose(predA, predB)
            assert_test(f"4. {model_name} Dynamic Non-Constant Output", is_different, f"State A != State B (diff: {np.abs(predA - predB).max():.4f})")
        except Exception as e:
            assert_test(f"4. {model_name} Dynamic Non-Constant Output", False, f"Error: {e}")

        # 5. Metadata Validation Test
        meta_exists = os.path.exists(meta_path)
        if meta_exists:
            with open(meta_path, "r") as f:
                meta = json.load(f)
                r2 = meta.get("metrics", {}).get("r2_score", -1)
                assert_test(f"5. {model_name} Metadata R² Score Valid", r2 > 0.0, f"R² = {r2}")

    # 6. Model Registry Test
    reg_path = "ml/artifacts/model_registry.json"
    reg_exists = os.path.exists(reg_path)
    assert_test("6. Model Registry Exists", reg_exists, f"Path: {reg_path}")

    print("----------------------------------------------------------------------")
    print(f"AUTHENTICITY AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
    print("======================================================================")
    return failed == 0

if __name__ == "__main__":
    success = run_authenticity_tests()
    sys.exit(0 if success else 1)
