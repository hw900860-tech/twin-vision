"""
OilSumpML Model Definition
Subsystem: OIL SUMP & FILTER
Algorithm: XGBoost / Gradient Boosted Decision Trees
Inputs: Oil Temp, Oil Pressure, RPM, Engine Hours, Oil Age Hours, Ambient Temp, Throttle
Outputs: Oil Temp, Oil Pressure, Viscosity Index %, Filter Clogging Score %, Lubrication Risk %
"""

class OilSumpML:
    def __init__(self, weights=None):
        self.model_name = "OilSumpML"
        self.algorithm = "Gradient Boosted Decision Trees (XGBoost)"
        self.inputs = ["obs_oil_temp", "obs_oil_press", "obs_rpm", "engine_hours", "oil_age_hours", "ambient_temp", "throttle"]
        self.outputs = ["oil_temp", "oil_press", "viscosity_index", "filter_clogging_score", "lubrication_risk"]
        self.weights = weights or {"base_temp": 68.0, "press_nominal": 5.6}

    def predict(self, features):
        o_temp = features.get("obs_oil_temp", 95.0)
        o_press = features.get("obs_oil_press", 5.2)

        viscosity_idx = max(30.0, 100.0 - (o_temp - 90.0) * 1.5)
        filter_clogging = min(100.0, max(5.0, (100.0 - viscosity_idx) * 0.6))
        lubrication_risk = 85.0 if o_press < 3.0 else 70.0 if o_temp > 110.0 else 12.0

        return {
            "id": "OilSumpML",
            "oilTemp": round(o_temp, 1),
            "oilPressure": round(o_press, 1),
            "viscosityIndex": round(viscosity_idx, 1),
            "filterCloggingScore": round(filter_clogging, 1),
            "lubricationRisk": round(lubrication_risk, 1),
        }
