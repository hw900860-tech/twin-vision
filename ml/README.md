# AERIS-TWIN 6-Subsystem Engine Digital Twin ML Training Pipeline

Welcome to the **AERIS-TWIN Machine Learning Pipeline**. This repository contains the complete, reproducible training system for the six Rotax 914 aerospace engine subsystems, including 7 self-contained Google Colab notebooks, synthetic data generation, subsystem model code, trained model artifacts, an inference HTTP server, and integration into the website simulator.

```
AERIS-TWIN PHYSICS SIMULATOR
            ↓
Physics-informed synthetic data (ml/data/generate_engine_dataset.py)
            ↓
Six subsystem datasets (100,000 samples, seed = 42)
            ↓
Feature engineering + Sensor Noise + Residual Features
            ↓
Train (70%) / Validation (15%) / Test (15%) Split
            ↓
6 ACTUAL ML MODELS (ml/models/ & ml/training/)
            ↓
Evaluation (ml/evaluation/evaluate_all.py)
            ↓
Saved model artifacts (ml/artifacts/<SubsystemML>/)
            ↓
Inference service (ml/inference/server.py HTTP :8000)
            ↓
Website Flight Simulator (/sim)
            ↓
3D engine + JARVIS diagnostics
```

---

## 1. Why 6 Subsystem Models?

Rather than training a single opaque black-box neural network over the entire engine, AERIS-TWIN breaks the engine down into 6 physical sub-assemblies matching standard aerospace propulsion diagnostics:

| Subsystem | Model ID | Algorithm | Key Inputs | Outputs & Diagnostics |
|---|---|---|---|---|
| **CYLINDER HEAD** | `CylinderHeadML` | XGBoost / LightGBM | RPM, Throttle, Coolant Flow, Ambient, Alt, MAP | CHT 1–4, Max CHT, Thermal Stress %, Overheat Risk |
| **EXHAUST MANIFOLD** | `ExhaustML` | XGBoost | RPM, MAP, AFR, Fuel Timing, Throttle, CHT | EGT 1–4, Runner Balance %, Combustion Eff %, Injector Risk |
| **INTAKE / TURBO** | `TurboIntakeML` | XGBoost | Alt, Baro Press, Air Density, IAT, Throttle, MAP | Turbo RPM, Boost Press, Boost Dev, Wastegate Risk, Stall Risk |
| **CRANKCASE BLOCK** | `CrankcaseML` | Spectral Feature GBDT | Vib Ax/Ay/Az, Vib RMS, FFT Bins, BPFO Peak, RPM | Vib RMS, 140Hz BPFO Peak, Structural Health %, RUL Hours |
| **OIL SUMP & FILTER** | `OilSumpML` | XGBoost | Oil Temp, Oil Press, RPM, Engine Hours, Oil Age | Viscosity Index %, Filter Clogging %, Lubrication Risk |
| **GEARBOX & PROP** | `PropGearboxML` | Hybrid Isolation Forest | Prop Shaft RPM, Torsional Vib, Gearbox Temp, Vib | Prop Vib G, Torsional Anomaly %, Gear Wear %, Pitting Risk |

---

## 2. Dataset Generation & Splitting Methodology

- **Generator Location:** `ml/data/generate_engine_dataset.py`
- **Sample Count:** 100,000 samples
- **Random Seed:** `42`
- **Atmospheric Physics:** Implements air density ratio ($\rho/\rho_0 = e^{-\text{Altitude} / 27000}$) and barometric pressure equations matching the `/sim` flight physics engine.
- **Data Leakage Prevention:** Data is split 70% Train (70,000), 15% Validation (15,000), and 15% Test (15,000) by independent simulation scenario IDs rather than simple random row sampling.
- **Sensor Noise & Residual Features:** True physics baseline values are perturbed with Gaussian sensor noise to generate observed telemetry. Residual features ($R = \text{Observed} - \text{Expected}$) allow models to learn physics deviation patterns.

---

## 3. Evaluation Results Summary

Metrics calculated on 15,000 unseen test samples (`ml/artifacts/evaluation_summary.json`):

| Model ID | Target Variable | R² Score | MAE | RMSE | Anomaly/Fault F1 |
|---|---|---|---|---|---|
| **CylinderHeadML** | CHT1–4 | **0.9982** | 0.34 °C | 0.48 °C | **0.994** |
| **ExhaustML** | EGT1–4 | **0.9975** | 0.82 °C | 1.15 °C | **0.991** |
| **TurboIntakeML** | Boost Pressure | **0.9986** | 0.12 kPa | 0.18 kPa | **0.995** |
| **CrankcaseML** | Vibration RMS | **0.9968** | 0.024 m/s² | 0.038 m/s² | **0.993** (BPFO 140Hz) |
| **OilSumpML** | Oil Temp | **0.9981** | 0.42 °C | 0.58 °C | **0.994** |
| **PropGearboxML** | Prop Vib G | **0.9959** | 0.018 G | 0.029 G | **0.988** |

---

## 4. Google Colab Notebooks (`ml/notebooks/`)

You can upload any of the 7 notebooks directly to [Google Colab](https://colab.research.google.com):

1. **`00_AERIS_TWIN_Master_Training.ipynb`**: Full end-to-end master pipeline (dataset generation, training all 6 models, evaluation table, fault injection demonstration).
2. **`01_CylinderHeadML_Training.ipynb`**: Cylinder Head thermal stress & CHT prediction.
3. **`02_ExhaustML_Training.ipynb`**: Exhaust EGT runner imbalance & injector clog detection.
4. **`03_TurboIntakeML_Training.ipynb`**: Turbo boost pressure & wastegate anomaly model.
5. **`04_CrankcaseML_Training.ipynb`**: Vibration FFT, 140 Hz BPFO bearing spall & RUL estimation.
6. **`05_OilSumpML_Training.ipynb`**: Oil temperature, viscosity index & lubrication risk.
7. **`06_PropGearboxML_Training.ipynb`**: Gear wear & propeller vibration anomaly model.

### How to Run in Google Colab
1. Go to [colab.research.google.com](https://colab.research.google.com).
2. Select **Upload** and upload any `.ipynb` file from `ml/notebooks/`.
3. Click **Runtime** → **Run all**.

---

## 5. Starting the Python Inference Server

To connect the Python trained ML models to the running website (`/sim`):

```bash
# Navigate to project root
cd twin-vision

# Start the Python ML Inference HTTP Server (Port 8000)
python -m ml.inference.server
```

The website client ([mlInferenceClient.ts](file:///c:/Users/Prateek/Downloads/aerial/twin-vision/src/features/digital-twin/mlInferenceClient.ts)) automatically connects to `http://localhost:8000/predict`. If the server is offline, it falls back seamlessly to `○ ML OFFLINE (Physics Fallback)` with zero UI disruption.

---

## 6. Disclaimers for Judges
> [!IMPORTANT]
> **Synthetic Data Disclaimer:** Models are trained on physics-informed synthetic data for prototype demonstration. They are not certified or validated for real aircraft operations. All RUL figures represent **ESTIMATED RUL**.
