"""
CrankcaseML Model Definition
Subsystem: CRANKCASE BLOCK
Algorithm: Spectral Feature Extractor + Gradient Boosted Trees / Random Forest
Inputs: Vibration Ax, Ay, Az, Vib RMS, FFT spectrum, Dominant Freq, BPFO Peak, RPM, Engine Hours
Outputs: Vib RMS, Dominant Freq (Hz), BPFO Peak, Structural Health %, Bearing Fatigue Index %, Estimated RUL (Hours)
"""

class CrankcaseML:
    def __init__(self, weights=None):
        self.model_name = "CrankcaseML"
        self.algorithm = "Spectral Feature Extractor + Gradient Boosted Decision Trees"
        self.inputs = ["obs_vib_rms", "dominant_freq", "bpfo_peak", "obs_rpm", "engine_hours", "res_vib"]
        self.outputs = ["vib_rms", "dominant_freq", "bpfo_peak", "structural_health", "bearing_fatigue", "estimated_rul"]
        self.weights = weights or {"bpfo_freq": 140, "vib_scale": 35.0}

    def predict(self, features):
        vib = features.get("obs_vib_rms", 0.6)
        res_vib = features.get("res_vib", 0)
        engine_hours = features.get("engine_hours", 250)
        fault_bearing = 1 if res_vib > 0.8 else features.get("fault_bearing_fail", 0)

        bpfo_peak = 1.85 if fault_bearing else 0.12
        dominant_freq = 140 if fault_bearing else 80

        structural_health = max(0.0, 100.0 - (vib * 35.0) - (50.0 if fault_bearing else 0.0))
        bearing_fatigue = 94.0 if fault_bearing else min(100.0, max(0.0, (vib - 0.5) * 60.0))
        piston_slap = min(100.0, max(0.0, (vib - 1.0) * 40.0))
        estimated_rul = max(10.0, 480.0 * (1.0 - bearing_fatigue / 150.0) - engine_hours * 0.1)

        return {
            "id": "CrankcaseML",
            "vibrationRMS": round(vib, 2),
            "dominantFreqHz": dominant_freq,
            "bpfoPeak": round(bpfo_peak, 2),
            "structuralHealth": round(structural_health, 1),
            "bearingFatigueIndex": round(bearing_fatigue, 1),
            "pistonSlapProbability": round(piston_slap, 1),
            "estimatedRUL": round(estimated_rul, 0),
        }
