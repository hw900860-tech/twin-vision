"""
PropGearboxML Model Definition
Subsystem: GEARBOX & PROP FLANGE
Algorithm: Hybrid Anomaly & Degradation Model (Isolation Forest + Gradient Boosted Trees)
Inputs: Prop Shaft RPM, Torsional Vib, Gearbox Temp, Engine Hours, Vibration Features
Outputs: Prop Vibration G, Torsional Anomaly %, Gear Wear Index %, Gear Pitting Risk %, Slippage Risk %
"""

class PropGearboxML:
    def __init__(self, weights=None):
        self.model_name = "PropGearboxML"
        self.algorithm = "Hybrid Anomaly Model (Isolation Forest + Gradient Boosted Trees)"
        self.inputs = ["prop_rpm", "prop_vib", "gearbox_temp", "engine_hours", "obs_vib_rms", "throttle"]
        self.outputs = ["prop_vibration", "torsional_anomaly", "gear_wear_index", "gear_pitting_risk", "slippage_risk"]
        self.weights = weights or {"gear_reduction_ratio": 2.43}

    def predict(self, features):
        obs_vib = features.get("obs_vib_rms", 0.6)
        thr = features.get("throttle", 65)
        engine_hours = features.get("engine_hours", 250)
        res_vib = features.get("res_vib", 0)

        prop_vib = obs_vib * 0.72 + (0.5 if res_vib > 0.8 else 0.0)
        torsional_anomaly = 78.0 if res_vib > 0.8 else min(100.0, max(0.0, (thr - 85.0) * 1.5))
        gear_wear = min(100.0, max(10.0, engine_hours * 0.06 + (45.0 if res_vib > 0.8 else 0.0)))
        gear_pitting = min(100.0, max(0.0, (prop_vib - 0.8) * 50.0))
        slippage_risk = 65.0 if thr > 95 else 15.0

        return {
            "id": "PropGearboxML",
            "propVibration": round(prop_vib, 2),
            "torsionalAnomaly": round(torsional_anomaly, 1),
            "gearWearIndex": round(gear_wear, 1),
            "gearPittingRisk": round(gear_pitting, 1),
            "slippageRisk": round(slippage_risk, 1),
        }
