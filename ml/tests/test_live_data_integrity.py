"""
AERIS-TWIN Live Data Integrity & Dependency Chain Automated Test Suite
Verifies physics telemetry propagation, ML feature payload responsiveness,
fault injection isolation, health fusion, and cross-subsystem consistency.
"""

import sys
import math
from ml.inference.engine_inference import predict_all_subsystems

def simulate_physics_step(state):
    """
    Python implementation of the authoritative physics simulation equations in flightStore.ts.
    Used for automated verification of data flow and dependency chains.
    """
    altitude = state.get("altitude", 6000)
    throttle = state.get("throttle", 65)
    speed = state.get("speed", 130)
    pitch = state.get("pitchAngle", 0.0)
    bank = state.get("bankAngle", 0.0)
    rudder = state.get("rudder", 0.0)
    faults = state.get("faults", {"c2Overheat": False, "turboFail": False, "bearingFail": False, "injectorClog": False})
    ambientTemp = state.get("ambientTemp", -5)

    alt_factor = math.exp(-altitude / 27000)
    thr = throttle / 100.0
    air_density = 1.225 * alt_factor
    speed_ms = speed * 0.5144
    dynamic_pressure = (0.5 * air_density * (speed_ms ** 2)) / 1000.0

    Lx = math.sin(bank * math.pi / 180) * (speed_ms / 50.0)
    Ly = math.sin(pitch) + 1.0
    Lz = math.cos(pitch) * (speed_ms / 100.0)

    rpm = 2400 + thr * 1600 * (0.86 + 0.14 * alt_factor)
    map_press = (18 + thr * 14 * alt_factor) * (0.58 if faults.get("turboFail") else 1.0)

    cht_base = 96 + thr * 96 + ambientTemp * 0.72 - alt_factor * 12
    c2_overheat = 122 if faults.get("c2Overheat") else 0
    cht = [cht_base, cht_base + c2_overheat, cht_base, cht_base]

    egt_base = 528 + thr * 236 + ambientTemp * 0.5
    clog_boost = 68 if faults.get("injectorClog") else 0
    egt = egt_base + clog_boost

    oil_temp = 68 + thr * 34 + ambientTemp * 0.5 + (18 if faults.get("c2Overheat") else 0)
    oil_press = max(1.6, min(6.2, 5.6 - (oil_temp - 90) * 0.012 - (0.4 if faults.get("c2Overheat") else 0)))

    vib_base = 0.42 + thr * 0.36
    vib_bearing = 1.88 if faults.get("bearingFail") else 0
    vibration = vib_base + vib_bearing

    rudder_load = abs(rudder) * 0.55
    gearbox_stress = max(0.0, min(1.0, thr * 0.55 + (speed_ms / 100) * 0.3 + rudder_load * 0.85 + (0.3 if faults.get("bearingFail") else 0)))

    return {
        "altitude": altitude,
        "ambientTemp": ambientTemp,
        "throttle": throttle,
        "rpm": rpm,
        "map": map_press,
        "cht": cht,
        "egt": egt,
        "oilPressure": oil_press,
        "oilTemp": oil_temp,
        "vibrationRMS": vibration,
        "airDensity": air_density,
        "dynamicPressure": dynamic_pressure,
        "loadVector": [Lx, Ly, Lz],
        "gearboxStress": gearbox_stress,
        "faults": faults
    }

def run_audit_tests():
    print("======================================================================")
    print("   AERIS-TWIN LIVE DATA INTEGRITY & DEPENDENCY CHAIN AUDIT SUITE      ")
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

    # TEST 1: Initial Baseline State
    s0 = simulate_physics_step({"throttle": 50, "altitude": 5000, "rudder": 0.0})
    ml0 = predict_all_subsystems(s0)
    assert_test("1. Initial Baseline State", ml0.get("status") == "success", f"RPM={s0['rpm']:.1f}, Health={ml0['modelOutputs']['cylhead']['health']:.2f}")

    # TEST 2: Throttle Dependency (20% -> 90%)
    s_low_thr = simulate_physics_step({"throttle": 20, "altitude": 5000})
    s_high_thr = simulate_physics_step({"throttle": 90, "altitude": 5000})
    assert_test("2. Throttle -> RPM & Thermal Response", s_high_thr["rpm"] > s_low_thr["rpm"] and s_high_thr["egt"] > s_low_thr["egt"], f"RPM: {s_low_thr['rpm']:.0f} -> {s_high_thr['rpm']:.0f}, EGT: {s_low_thr['egt']:.0f} -> {s_high_thr['egt']:.0f}°C")

    # TEST 3: Altitude Dependency (5,000 ft -> 20,000 ft)
    s_low_alt = simulate_physics_step({"throttle": 70, "altitude": 5000})
    s_high_alt = simulate_physics_step({"throttle": 70, "altitude": 20000})
    assert_test("3. Altitude -> Air Density & MAP Compensation", s_high_alt["airDensity"] < s_low_alt["airDensity"] and s_high_alt["map"] < s_low_alt["map"], f"AirDensity: {s_low_alt['airDensity']:.3f} -> {s_high_alt['airDensity']:.3f} kg/m³")

    # TEST 4: Rudder -> Drivetrain Load Vector Response
    s_rudder_center = simulate_physics_step({"throttle": 60, "rudder": 0.0})
    s_rudder_deflect = simulate_physics_step({"throttle": 60, "rudder": 0.85})
    assert_test("4. Rudder -> Gearbox Torque & Load Stress", s_rudder_deflect["gearboxStress"] > s_rudder_center["gearboxStress"], f"Gearbox Stress: {s_rudder_center['gearboxStress']:.2f} -> {s_rudder_deflect['gearboxStress']:.2f}")

    # TEST 5: Fault Injection Isolation — CYL 2 OVERHEAT
    s_no_fault = simulate_physics_step({"throttle": 65, "faults": {"c2Overheat": False}})
    s_c2_fault = simulate_physics_step({"throttle": 65, "faults": {"c2Overheat": True}})
    ml_c2 = predict_all_subsystems(s_c2_fault)
    assert_test("5. Fault Injection -> CHT2 & ML Thermal Risk", s_c2_fault["cht"][1] > s_no_fault["cht"][1] + 100 and ml_c2["modelOutputs"]["cylhead"]["overheatRisk"] > 50, f"CHT2: {s_c2_fault['cht'][1]:.1f}°C, OverheatRisk: {ml_c2['modelOutputs']['cylhead']['overheatRisk']:.1f}%")

    # TEST 6: Fault Injection Isolation — BEARING SPALL
    s_bearing = simulate_physics_step({"throttle": 65, "faults": {"bearingFail": True}})
    ml_bearing = predict_all_subsystems(s_bearing)
    assert_test("6. Fault Injection -> Vibration & BPFO Spike", s_bearing["vibrationRMS"] > 2.0 and ml_bearing["modelOutputs"]["crankcase"]["bearingFatigueIndex"] > 80, f"Vib RMS: {s_bearing['vibrationRMS']:.2f} m/s², BPFO Fatigue: {ml_bearing['modelOutputs']['crankcase']['bearingFatigueIndex']:.1f}%")

    print("----------------------------------------------------------------------")
    print(f"AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
    print("======================================================================")

    return failed == 0

if __name__ == '__main__':
    success = run_audit_tests()
    sys.exit(0 if success else 1)
