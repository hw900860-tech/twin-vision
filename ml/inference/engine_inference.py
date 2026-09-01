"""
AERIS-TWIN Inference Engine Service
Performs real-time predictions for all 6 Rotax 914 engine subsystems
using the trained ML model modules.
"""

from ml.models.cylinder_head import CylinderHeadML
from ml.models.exhaust import ExhaustML
from ml.models.turbo import TurboIntakeML
from ml.models.crankcase import CrankcaseML
from ml.models.oil import OilSumpML
from ml.models.gearbox import PropGearboxML

_cyl_model = CylinderHeadML()
_exh_model = ExhaustML()
_turbo_model = TurboIntakeML()
_crank_model = CrankcaseML()
_oil_model = OilSumpML()
_gear_model = PropGearboxML()

def predict_cylinder_head(state):
    return _cyl_model.predict(state)

def predict_exhaust(state):
    return _exh_model.predict(state)

def predict_turbo(state):
    return _turbo_model.predict(state)

def predict_crankcase(state):
    return _crank_model.predict(state)

def predict_oil(state):
    return _oil_model.predict(state)

def predict_gearbox(state):
    return _gear_model.predict(state)

def predict_all_subsystems(state):
    """
    Takes an EngineState dictionary and runs predictions across all 6 ML model modules.
    Returns JSON-serializable dictionary.
    """
    return {
        "status": "success",
        "mlActive": True,
        "modelOutputs": {
            "cylhead": predict_cylinder_head(state),
            "exhaust": predict_exhaust(state),
            "turbo": predict_turbo(state),
            "crankcase": predict_crankcase(state),
            "oil": predict_oil(state),
            "gearbox": predict_gearbox(state),
        }
    }
