# AERIS-TWIN — AI-Enabled Digital Engine Intelligence System for MALE UAVs

> **What if we could predict an engine failure 6 hours before it happens — and tell the pilot exactly which part is about to break and why?**

---

## Table of Contents

1. [The Big Picture — Why This Exists](#the-big-picture--why-this-exists)
2. [The TAPAS BH-201 Story — What Went Wrong](#the-tapas-bh-201-story--what-went-wrong)
3. [The Engine — Rotax 914, Heart of the Problem](#the-engine--rotax-914-heart-of-the-problem)
4. [Core Concepts — A Glossary You Can Actually Read](#core-concepts--a-glossary-you-can-actually-read)
5. [How AERIS-TWIN Solves This](#how-aeris-twin-solves-this)
6. [The 3 Pages — What Each One Does](#the-3-pages--what-each-one-does)
7. [The Physics Engine — How Values Change](#the-physics-engine--how-values-change)
8. [The Fault Sandbox — Breaking Things on Purpose](#the-fault-sandbox--breaking-things-on-purpose)
9. [Real-World Challenges — What Happens When You Deploy This](#real-world-challenges--what-happens-when-you-deploy-this)
10. [How to Run](#how-to-run)
11. [File Structure](#file-structure)

---

## The Big Picture — Why This Exists

### The Problem

India's MALE (Medium-Altitude Long-Endurance) UAV program — the **TAPAS BH-201** — spent 8 years and ₹1,786 crore (~$220M) trying to build an indigenous surveillance drone like the American MQ-1 Predator. It **failed**.

Not because the airframe was bad. Not because the sensors didn't work. The drone was grounded by a combination of:

1. **Weight** — planned 1,800 kg, actual 2,200 kg (22% overweight)
2. **Engine** — the Rotax 914 couldn't deliver enough power at 30,000 ft
3. **No predictive intelligence** — when the engine overheated at altitude, nobody knew until it was too late

The Indian Armed Forces required **30,000 ft altitude** and **24-hour endurance**. TAPAS achieved **28,000 ft for 18 hours**. Close, but not enough. The project was officially closed as a Mission Mode Project in January 2024.

### What If We Had a Digital Twin?

Here's the thing: **the engine didn't fail suddenly**. There were signs — rising CHT, fluctuating EGT, increasing vibration — that preceded the performance shortfalls. But in 2024, there was no system that could:

- **Watch** the engine in real time at 20 Hz (50ms updates)
- **Understand** what each temperature/vibration change meant
- **Predict** which component would fail next and how long it had
- **Advise** the ground operator what to do about it

That's exactly what AERIS-TWIN does.

---

## The TAPAS BH-201 Story — What Went Wrong

### Timeline of Struggles

| Year | Event | What Happened |
|------|-------|---------------|
| 2010 | Design starts | "We'll build India's Predator" — target: 30,000 ft, 24hr endurance |
| 2013 | Taxi trials begin | At Kolar airfield near Bengaluru |
| 2016 | First flight | 15 November at Challakere, Karnataka |
| 2019 | **Prototype AF-6 CRASHES** | Link loss with ground station, activated return-home mode, but turbulence overwhelmed the control law |
| 2020 | 16,000 ft / 8hr | Achieved — but 14,000 ft short of target |
| 2021 | 25,000 ft / 10hr | Improved — but still 5,000 ft and 14 hours short |
| 2022 | **28,000 ft / 18hr** | Best performance — but engine was maxed out |
| 2022 | Weight crisis | 2,200 kg vs planned 1,800 kg — every extra kg costs altitude |
| 2024 | **PROJECT CLOSED** | Officially removed from Mission Mode status |

### The 5 Root Causes

#### 1. The Engine Was Too Weak
The Rotax 914 produces 115 HP at sea level. At 30,000 ft, with only 40% of sea-level air density, the turbocharger cannot compensate enough. The engine simply **cannot produce the power needed** to maintain 30,000 ft with a 2,200 kg airframe.

> **Analogy:** It's like trying to run a marathon at the top of Mount Everest. Your lungs (the engine) can only process so thin an air.

#### 2. Weight Spiral
Each system addition added weight → less altitude → needed a bigger engine → more weight. The twin NPO-Saturn 36MT turboprops (74.57 kW each) were an attempt to fix this, but the airframe was already overweight.

#### 3. No Engine Health Intelligence
When the engine started running hot at 28,000 ft, the operators had **no way to know** if this was normal for the altitude or a sign of impending failure. Without a digital twin, they couldn't distinguish between "engine is stressed but fine" and "engine is about to seize."

#### 4. Single Point of Failure
The AF-6 crash happened because of a **communication link loss** that triggered an automatic return-home mode, but the turbulence overwhelmed the control law. There was no predictive system to say "don't fly this route — turbulence is forecast" or "your engine health is at 40% — land now."

#### 5. No Prognostic Capability
Even when the engine showed warning signs (rising EGT, slight vibration increase), there was no system to calculate **Remaining Useful Life (RUL)** — how many more flight hours the engine could safely operate before requiring maintenance.

---

## The Engine — Rotax 914, Heart of the Problem

### What Is It?

The **Rotax 914** is a **turbocharged, 4-cylinder, horizontally-opposed (flat-4) piston engine** made by BRP-Rotax in Austria. It's the most common engine in light sport aircraft and MALE UAVs worldwide.

### Specifications

| Spec | Value | What It Means |
|------|-------|---------------|
| **Type** | Flat-4 (horizontally opposed) | 4 cylinders arranged in a flat "boxer" layout — low center of gravity |
| **Displacement** | 1,211.2 cc | Total volume of all 4 cylinders |
| **Bore × Stroke** | 79.5 mm × 61 mm | Wide, short cylinders — optimized for high RPM |
| **Power (sea level)** | 115 HP | Enough for a light aircraft, marginal for a 2-ton UAV |
| **Power (25,000 ft)** | ~65-75 HP (estimated) | Turbo can't fully compensate for thin air |
| **Max RPM** | 5,500 | Higher RPM than most piston engines |
| **TBO** | 1,200 hours | Time Between Overhauls — after this, mandatory rebuild |
| **Cooling** | Liquid-cooled heads, air-cooled cylinders | Hybrid — the heads use coolant, the barrels use airflow |
| **Turbocharger** | Yes, with automatic wastegate | Boosts air pressure at altitude |
| **Weight** | 77.4 kg (dry) | Relatively light for 115 HP |
| **Fuel** | Mogas (100LL also acceptable) | Can run on automotive gasoline |

### How the Engine Works (Simplified)

```
    AIR IN → [Turbocharger] → [Intake Manifold] → [Cylinders 1-4] → [Exhaust] → OUT
                                                ↓                         ↓
                                          Combustion happens          Exhaust gases
                                          (fuel + air ignite)        spin the turbo
                                                ↓
                                          [Crankshaft] → [Propeller]
```

**The 4-stroke cycle for each cylinder:**

1. **Intake Stroke** — Piston moves down, intake valve opens, air-fuel mixture enters
2. **Compression Stroke** — Both valves close, piston moves up, mixture compresses
3. **Power Stroke** — Spark plug fires, explosion pushes piston down, turns crankshaft
4. **Exhaust Stroke** — Exhaust valve opens, piston pushes spent gases out

### The Firing Order

The Rotax 914 fires in order: **1 → 3 → 4 → 2** (not 1-2-3-4!). This is a specific flat-4 firing order that balances the engine and reduces vibration. Each cylinder fires every 180° of crankshaft rotation (720° total for all 4 cylinders).

### Why Engine Health Matters for TAPAS

At 30,000 ft:
- Air density is **40% of sea level** — the engine is starving for air
- Turbocharger runs at **maximum boost** — bearing wear accelerates
- Cylinder Head Temperature (CHT) can spike if cooling airflow is blocked
- Exhaust Gas Temperature (EGT) rises as the engine works harder
- Any vibration from a damaged bearing becomes **catastrophic** because there's no altitude margin for error

---

## Core Concepts — A Glossary You Can Actually Read

### Telemetry Channels (What We Monitor)

| Term | What It Is | Normal Range | Why It Matters |
|------|-----------|-------------|----------------|
| **CHT** (Cylinder Head Temperature) | How hot the top of each cylinder is | 140-170°C | Too hot = metal fatigue, head gasket failure, engine seizure |
| **EGT** (Exhaust Gas Temperature) | How hot the exhaust gases are leaving each cylinder | 550-700°C | Too lean (hot) = fuel starvation; Too rich (cool) = flooding |
| **MAP** (Manifold Absolute Pressure) | Pressure of air entering the cylinders | 20-32 kPa | Low MAP = not enough air = engine can't produce power |
| **Oil Pressure** | Pressure of lubricating oil in the engine | 3.5-5.5 bar | Low = oil leak or pump failure; bearings will destroy themselves in minutes |
| **Oil Temperature** | Temperature of the engine oil | 80-100°C | Too hot = oil breaks down, loses lubrication |
| **Vibration RMS** | Root Mean Square vibration level | 0.3-0.8 m/s² | High = something is mechanically wrong — bearing, imbalance, loose part |
| **FFT Spectrum** | Frequency analysis of vibration (like an audio equalizer for engine shake) | Peaks at specific frequencies | Different frequencies = different problems. 140 Hz peak = bearing failure |
| **RPM** | Engine revolutions per minute | 4,500-5,500 | Too low = engine struggling; Too high = over-speeding |
| **RUL** (Remaining Useful Life) | How many flight hours until mandatory maintenance | 100-600 hours | The single most important number for mission planning |

### Key Terms Explained

**Digital Twin** — A virtual copy of a real engine that runs the same physics equations in real time. If the real engine's CHT is 185°C, the digital twin's CHT is also 185°C. The twin can then run "what-if" scenarios: "If this temperature keeps rising at this rate, when will it hit the failure threshold?"

**Predictive Maintenance** — Instead of servicing the engine every 1,200 hours (whether it needs it or not), you service it **exactly when the digital twin says it's needed**. This catches problems early and avoids unnecessary maintenance.

**Anomaly Detection** — The system learns what "normal" engine behavior looks like, then flags anything abnormal. A cylinder running 30°C hotter than its neighbors is abnormal — even if neither has hit the "red zone" yet.

**Isolation Forest** — A machine learning algorithm that finds outliers in multi-dimensional data. Think of it as a guard that watches 10 engine parameters simultaneously and says "something is wrong here" when the combination doesn't match any known healthy pattern.

**Weibull Distribution** — A statistical model used to predict when mechanical parts fail. Most engine parts follow a Weibull curve — they're reliable early in life, then failure probability increases with age and stress.

**BPFO** (Ball Pass Frequency Outer race) — When a ball bearing rolls over a damaged spot on its outer race, it creates a vibration pulse at a specific frequency. For the Rotax 914, this frequency is approximately **140 Hz**. Detecting this peak means you have a bearing problem.

**Firing Order 1-3-4-2** — The sequence in which cylinders ignite. Not 1-2-3-4 because flat engines need alternating left-right firing for balance. This affects vibration patterns — you know which cylinder is misfiring by the vibration signature.

**CHT vs EGT** — CHT tells you about the combustion chamber (too much heat = structural damage). EGT tells you about the fuel-air mixture (too hot = running lean, too cool = running rich). You need both to diagnose engine health.

---

## How AERIS-TWIN Solves This

### The 3-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  LAYER 3: DECISION INTELLIGENCE                 │
│  • Health Index (0-100%)                        │
│  • Remaining Useful Life (hours)                │
│  • Advisory Banner (Green/Yellow/Red)           │
│  • Explainable Diagnostics (WHY something is wrong) │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│  LAYER 2: PHYSICS ENGINE (20 Hz)                │
│  • Air density calculation                      │
│  • CHT/EGT/MAP thermodynamic model              │
│  • Vibration FFT synthesis                      │
│  • Oil pressure/temperature relationship        │
│  • Anomaly scoring (Isolation Forest)           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│  LAYER 1: DATA INPUTS                           │
│  • Throttle position                            │
│  • Altitude                                     │
│  • Ambient temperature                          │
│  • Engine wear factor                           │
│  • Active faults                                │
└─────────────────────────────────────────────────┘
```

### What Makes This Different From Traditional Monitoring

| Traditional Monitoring | AERIS-TWIN Digital Twin |
|----------------------|------------------------|
| Shows **current values** only | Shows current values + **predicted future values** |
| Red light = "problem exists" | Yellow light = "problem **will** exist in 2 hours" |
| Manual inspection every 1,200 hours | Automatic RUL calculation — inspect **exactly when needed** |
| Operator guesses what's wrong | System says "Cylinder 2 overheating due to blocked cooling duct" |
| Single parameter thresholds | **Multi-parameter** anomaly detection (10 channels simultaneously) |
| No what-if capability | "What happens if I climb to 30,000 ft with this engine wear?" |

---

## The 3 Pages — What Each One Does

### Page 1: Landing Page (`/`)

A scrollable overview of the entire AERIS-TWIN concept with 12 sections:
- Interactive 3D engine model you can rotate and click
- Live telemetry sparklines that update in real time
- Side-by-side comparison of "traditional monitoring" vs "digital twin"
- What-if simulation controls
- Mission replay demonstration

### Page 2: Flight Simulator (`/sim`)

**This is the "pilot's view"** — you fly a TAPAS BH-201 UAV across 3 operational environments:

| Terrain | What You'll See | Why It Matters |
|---------|----------------|----------------|
| **Himalayan High Altitude** | Snow-capped peaks up to 30,000 ft, cold thin air (-5°C) | Tests engine at maximum altitude — turbo at full boost, CHT rising |
| **Thar Desert Patrol** | Sandy dunes, 48°C ambient temperature, thermal turbulence | Tests engine in extreme heat — oil overheating, cooling marginal |
| **Coastal Maritime** | Sea-level coastline, high humidity, dense air | Best engine performance — but salt air corrodes components |

**What you control:**
- Throttle (0-100%)
- Heading (left/right)
- Altitude (500-30,000 ft)
- Mouse drag on screen to steer

**What you see in real-time:**
- Airspeed, altitude, temperature, RPM, GPS coordinates
- 4 individual cylinder temperatures
- Engine health percentage
- Color-coded advisory banner (green/yellow/red)
- **Fault injection buttons** — deliberately break things to see what happens

### Page 3: GCS Command Center (`/gcs`)

**This is the "ground operator's view"** — the command center where engineers monitor the fleet:

- **3D Engine Digital Twin** — your actual GLB model with live CHT colors on each cylinder, explode/implode animation, and floating labels
- **Engine Alerts Panel** — auto-generated warnings and critical alerts based on live telemetry
- **Telemetry Dashboard** — 10 sparkline charts showing every parameter
- **Diagnostics** — explainable fault analysis with contributing factors
- **RUL Estimation** — Weibull-based countdown showing hours remaining
- **Mission Replay** — rewind and replay any flight segment

---

## The Physics Engine — How Values Change

### The Core Equation Chain

Every value in the simulation is connected. Here's how a single input — say, **climbing to 25,000 ft** — cascades through the system:

```
ALTITUDE increases to 25,000 ft
    │
    ├→ AIR DENSITY drops to 0.395 (40% of sea level)
    │      │
    │      ├→ MAP drops to 23.5 kPa (less air entering cylinders)
    │      │      │
    │      │      ├→ TURBOCHARGER spins faster to compensate
    │      │      │      │
    │      │      │      └→ TURBO BEARING WEAR increases
    │      │      │
    │      │      └→ If TURBO FAILS → MAP collapses to 14 kPa → engine loses 40% power
    │      │
    │      ├→ CHT DECREASES slightly (thinner air = less combustion heat)
    │      │
    │      ├→ EGT INCREASES slightly (turbo working harder, exhaust hotter)
    │      │
    │      └→ RPM DECREASES slightly (less air mass = less torque)
    │
    ├→ AMBIENT TEMP drops to -17°C (standard atmosphere)
    │      │
    │      └→ OIL TEMP drops (better cooling) → OIL PRESSURE increases
    │
    └→ OXYGEN decreases → Engine runs LEANER → EGT increases further
```

### The 10 Physics Formulas

#### 1. Air Density (the master variable)
```
densityRatio = e^(-altitude / 27000)
```
Everything else depends on this. At sea level = 1.0, at 25,000 ft = 0.395.

#### 2. RPM
```
RPM = 2400 + throttle × 1600 × (0.86 + 0.14 × densityRatio)
```
More throttle = more RPM. Denser air = slightly more RPM.

#### 3. Manifold Pressure (MAP)
```
MAP = 18 + throttle × 14 × densityRatio
```
MAP tells you how much air is available for combustion. Drops sharply with altitude.

#### 4. Cylinder Head Temperature (CHT)
```
CHT = 96 + throttle × 96 + ambientTemp × 0.72 - densityRatio × 12
```
**The most dangerous parameter.** Throttle heats it up. Altitude cools it slightly. Ambient temp heats it up. If CHT > 220°C, the cylinder head gasket is at risk of blowing.

#### 5. Exhaust Gas Temperature (EGT)
```
EGT = 528 + throttle × 236 + ambientTemp × 0.5
```
EGT tells you about combustion efficiency. High EGT = lean mixture (not enough fuel). Low EGT = rich mixture (too much fuel).

#### 6. Oil Pressure
```
oilPressure = clamp(5.6 - (oilTemp - 90) × 0.012, 1.6, 6.2)
```
**Inverse relationship with oil temperature.** Hot oil thins out → pressure drops → bearings starve → catastrophic failure.

#### 7. Oil Temperature
```
oilTemp = 68 + throttle × 34 + ambientTemp × 0.5
```
Hot desert + full throttle = oil approaching breakdown temperature.

#### 8. Vibration RMS
```
vibration = 0.42 + throttle × 0.36
```
Baseline vibration increases with RPM. Abnormal vibration spikes indicate mechanical damage.

#### 9. FFT Spectrum (64 frequency bins, 0-630 Hz)
The vibration spectrum has:
- **80 Hz** fundamental (normal engine rotation)
- **160 Hz** 2nd harmonic (normal)
- **240 Hz** 3rd harmonic (normal)
- **140 Hz** BPFO peak (BEARING FAILURE if present)

#### 10. Health Index
```
health = thermalHealth × 0.3 + vibrationHealth × 0.3 + (1 - anomalyScore) × 0.4
```
Weighted combination of all subsystems. Below 60% = yellow caution. Below 30% = red critical.

### Value Relationships — Quick Reference

| If you increase... | RPM | CHT | EGT | MAP | Oil Press | Vibration | Health |
|---|---|---|---|---|---|---|---|
| **Throttle** | ↑↑ | ↑↑ | ↑↑ | ↑↑ | ↓ | ↑↑ | ↓ |
| **Altitude** | ↓ | ↓ | ↑ | ↓↓ | — | — | ↓ |
| **Ambient Temp** | — | ↑ | ↑ | — | ↓ | — | ↓ |
| **Engine Wear** | — | ↑ | ↑ | — | ↓↓ | ↑ | ↓↓↓ |
| **Fault Severity** | ↓ | ↑↑ | ↑↑ | ↓ | ↓ | ↑↑↑ | ↓↓↓ |

---

## The Fault Sandbox — Breaking Things on Purpose

The simulator includes 4 fault injection buttons that simulate real-world engine problems:

### 🔴 Fault 1: Cylinder 2 Overheat

**What you press:** "CYL 2 OVERHEAT"
**What happens:**
- Cylinder 2 CHT jumps from ~140°C to **~260°C** (+120°C)
- Cylinder 1 CHT rises to ~220°C (+80°C) — shared cooling system
- Cylinders 3-4 stay normal (~140°C)
- The 3D engine model: Cylinder 2 **glows red**, Cylinder 1 **glows amber**
- Advisory banner turns **RED**: "CRITICAL: CHT OVERLIMIT — REDUCE THROTTLE"
- Alerts panel shows: "CYL 2 OVERHEAT — Cylinder 2 CHT at 260°C exceeds critical limit of 220°C"

**Real-world cause:** Blocked oil cooler duct, failed cylinder head gasket, or damaged cooling fin.

**What a real operator would do:** Reduce throttle to 75% immediately, or descend to 12,000 ft where denser air provides more cooling.

### 🔴 Fault 2: Wastegate Turbo Failure

**What you press:** "TURBO FAILURE"
**What happens:**
- MAP drops to 60% of normal (e.g., 28 kPa → 17 kPa)
- RPM drops (less air = less power)
- EGT drops 40°C (less fuel burned)
- Engine exhaust glow dims
- Health index drops significantly

**Real-world cause:** Wastegate stuck open (bypassing exhaust gas, turbo stops spinning) or turbo bearing failure.

**What a real operator would do:** At high altitude, this is **catastrophic** — the engine can't maintain altitude. Immediate descent to below 15,000 ft required.

### 🔴 Fault 3: Bearing Fatigue Spall

**What you press:** "BEARING SPALL"
**What happens:**
- Vibration jumps from ~0.8 to **~2.6 m/s²**
- FFT spectrum shows massive spike at **140 Hz** (BPFO frequency)
- Anomaly score rises rapidly
- Health index drops over time

**Real-world cause:** A micro-crack in the bearing race that grows with each rotation, eventually causing metal flakes to break off.

**What a real operator would do:** Land at the nearest airfield. Bearing failure leads to seizure, which leads to engine stoppage, which leads to forced landing.

### 🔴 Fault 4: Fuel Injector Clog

**What you press:** "INJECTOR CLOG"
**What happens:**
- EGT rises 60°C with random noise (imbalance between cylinders)
- Fuel flow becomes unstable
- Health index decreases gradually

**Real-world cause:** Dirty fuel, carbon deposits, or manufacturing defect in the injector nozzle.

**What a real operator would do:** Run fuel system cleaner, check fuel quality, replace injector at next maintenance.

---

## Real-World Challenges — What Happens When You Deploy This

### Challenge 1: The Physics Model Is an Approximation

**The problem:** Our formulas are based on standard atmosphere tables and published Rotax 914 performance data. Real engines don't follow perfect equations. Each engine has its own quirks — manufacturing tolerances, wear patterns, altitude acclimation.

**The mitigation:** The anomaly detection system learns from **actual data**. After 100 flights, the model knows what YOUR engine's "normal" looks like, not just the textbook normal. The Isolation Forest algorithm adapts its thresholds to the specific engine.

**Real-world example:** Engine Serial #4721 consistently runs 8°C hotter on Cylinder 3 than the book value. The system learns this is normal for THIS engine and doesn't flag it as an anomaly.

### Challenge 2: Satellite Communication Latency

**The problem:** TAPAS uses SATCOM to relay telemetry to the ground station. Satellite links have **200-500ms latency** and occasional **packet loss (5-15%)**. If the digital twin is running on the ground, it's always 0.5 seconds behind reality.

**The mitigation:** The system includes a "SATCOM simulation" mode that adds artificial latency and packet loss. The physics engine interpolates between received packets to maintain a continuous telemetry stream. Critical alerts can be computed on-board with edge processing.

**Real-world example:** At 250 km range, the telemetry link drops to 70% reliability. The system must reconstruct missing data points rather than showing "NO DATA" gaps.

### Challenge 3: Altitude Changes Everything

**The problem:** At 30,000 ft, the engine is operating at the extreme edge of its envelope. Air density is 40% of sea level. The turbocharger is at maximum boost. Oil temperature is 15°C higher than at sea level. Vibration is elevated. Everything is stressed.

**The mitigation:** The simulation models altitude effects on every parameter. The fault thresholds are **altitude-adjusted** — what's "normal" at 30,000 ft is different from what's "normal" at sea level.

**Real-world example:** CHT of 185°C at sea level = yellow caution. CHT of 185°C at 28,000 ft = expected (thinner air provides less cooling, engine works harder). The system accounts for this.

### Challenge 4: Weight Is the Enemy of Altitude

**The problem:** Every extra kilogram of system weight costs approximately 0.5-1 ft of maximum altitude. The digital twin's compute hardware (sensors, processors, communication modules) adds weight. This creates a paradox: the system designed to help the engine reach 30,000 ft might prevent it from reaching 30,000 ft.

**The mitigation:** Edge computing on lightweight embedded processors (Raspberry Pi-class). The heavy analysis runs on the ground station. Only critical alerts and compressed telemetry are transmitted via SATCOM.

**Real-world example:** The TAPAS BH-201 was 400 kg overweight. If the health monitoring system adds 5 kg but prevents one engine failure that costs ₹50 crore, the ROI is clear.

### Challenge 5: False Alarms Kill Trust

**The problem:** If the system cries wolf 10 times and is wrong every time, operators will ignore it on the 11th time — when it's actually right. False alarms are worse than no alarm.

**The mitigation:** The system uses a **confidence threshold**. Alerts are only shown when the anomaly score exceeds a tunable threshold (default: 70%). The "explainable diagnostics" feature shows operators **WHY** the alert was triggered — which parameters contributed and by how much — so they can make informed decisions.

**Real-world example:** "VIBRATION elevated to 0.85 m/s², but FFT spectrum shows normal harmonic pattern — no bearing fault peak detected. Likely cause: propeller imbalance from insect strike. ADVISORY: Schedule propeller balance at next maintenance. No immediate action required."

### Challenge 6: The Engine Model Needs Calibration

**The problem:** The physics formulas in AERIS-TWIN are based on theoretical models. Real engines need **calibration data** from the specific engine being monitored — hours since overhaul, historical CHT patterns, known vibration signatures.

**The mitigation:** The "Simulation Lab" allows operators to adjust model parameters (wear factor, altitude, throttle) and compare predicted vs actual values. Over time, the model calibrates itself to match the real engine's behavior.

**Real-world example:** After 500 hours of operation, the model learns that this engine's CHT is consistently 5°C higher than the textbook model predicts. It adjusts its baseline accordingly.

### Challenge 7: Regulatory Certification

**The problem:** Any predictive maintenance system used on certified aircraft must be validated and approved by aviation authorities (DGCA in India, FAA in US, EASA in Europe). The system must prove its predictions are reliable enough to base safety decisions on.

**The mitigation:** The system maintains a complete **audit trail** of every prediction, every alert, every operator action. This data is used for validation and certification. The "Reports" tab in the GCS generates compliance documentation.

**Real-world example:** DGCA requires proof that the RUL prediction is accurate within ±10% for the past 1,000 flight hours before it can be used as the basis for extending maintenance intervals.

---

## How to Run

```bash
# 1. Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# 2. Clone and install
git clone https://github.com/hw900860-tech/twin-vision.git
cd twin-vision
bun install

# 3. Start dev server
bun run dev
```

Open `http://localhost:5173` in your browser.

### Available Routes

| Route | Page | What You'll See |
|-------|------|----------------|
| `/` | Landing Page | Product overview, 3D engine hero, all concepts explained |
| `/sim` | Flight Simulator | Fly a TAPAS BH-201 across 3 terrains with live engine telemetry |
| `/gcs` | GCS Command Center | Monitor engine health, run diagnostics, explode the 3D engine model |

### Production Build
```bash
bun run build
bun run preview
```

---

## File Structure

```
src/
├── routes/
│   ├── __root.tsx              # Root layout (HTML, fonts, meta)
│   ├── index.tsx               # Landing page
│   ├── gcs.tsx                 # GCS Command Center
│   └── sim.tsx                 # Flight Simulator
├── components/
│   ├── landing/
│   │   ├── Nav.tsx             # Navigation bar with FLIGHT SIM link
│   │   ├── Hero.tsx            # Hero section with 3D engine
│   │   └── sections.tsx        # All 12 landing page sections
│   ├── hud/
│   │   └── primitives.tsx      # Panel, Bar, Readout, StatusDot components
│   └── ClientOnly.tsx          # SSR-safe client component wrapper
├── features/
│   ├── flight-sim/
│   │   ├── flightStore.ts      # ★ Zustand store — ALL flight + engine physics
│   │   ├── FlightSimulator.tsx  # Three.js Canvas with lighting and fog
│   │   ├── Terrain.tsx          # Infinite chunk-based procedural terrain
│   │   ├── UAVModel.tsx         # TAPAS BH-201 GLB model + controls
│   │   ├── FlightHUD.tsx        # Military HUD overlay (speed, alt, heading)
│   │   └── ControlPanel.tsx     # Right panel — terrain, missions, faults
│   ├── digital-twin/
│   │   ├── EngineModel.tsx      # ★ Your GLB engine with explode + labels
│   │   ├── EngineCanvas.tsx     # Three.js Canvas for engine model
│   │   └── EngineAlerts.tsx     # Auto-generated alerts from live telemetry
│   ├── telemetry/
│   │   └── TelemetryDashboard.tsx  # 10 sparkline charts
│   ├── simulation/
│   │   └── SimulationLab.tsx    # What-if scenario controls
│   ├── mission-replay/
│   │   └── ReplayConsole.tsx    # 4-hour mission playback
│   ├── predictive-maintenance/
│   │   └── Diagnostics.tsx      # Explainable fault diagnosis + RUL
│   └── fleet/
│       └── FleetPanel.tsx       # Multi-UAV fleet overview
├── lib/
│   └── domain/engine/
│       └── model.ts             # ★ Core engine physics (all 10 formulas)
├── styles.css                   # Tailwind + design system
├── router.tsx                   # TanStack Router config
└── start.ts                     # TanStack Start entry

public/
├── engine.glb                   # 3D engine model (for GCS)
├── uav.glb                      # 3D UAV model (TAPAS BH-201)
```

---

## Design System

Dark military/aviation theme with oklch colors:

| Token | Color | Usage |
|-------|-------|-------|
| `--cyan` | `oklch(0.82 0.11 200)` | Primary accent, healthy values, readouts |
| `--amber` | `oklch(0.8 0.13 76)` | Warning, caution, degraded health |
| `--critical` | `oklch(0.63 0.2 25)` | Danger, fault indicators, red alerts |
| `--nominal` | `oklch(0.78 0.13 158)` | Good/healthy indicators, green status |
| `--panel` | `oklch(0.203 0.009 240)` | Panel backgrounds |
| `--background` | `oklch(0.16 0.008 240)` | Page background |

Typography:
- **Space Grotesk** — Headings, UI labels (clean, technical)
- **IBM Plex Mono** — Data readouts, telemetry values (monospaced, tabular numbers for alignment)

---

## Key Takeaway

AERIS-TWIN demonstrates that the difference between a failed UAV program and a successful one isn't just about building a better airframe or a more powerful engine. It's about having **intelligent systems that understand the engine's health in real time**, predict failures before they happen, and give ground operators actionable advice.

The TAPAS BH-201 was a ₹1,786 crore lesson that **raw performance metrics aren't enough**. You need:
- **Visibility** — know what every sensor is reading (telemetry dashboard)
- **Intelligence** — understand what those readings mean (physics engine)
- **Prediction** — forecast what will happen next (anomaly detection + RUL)
- **Action** — tell the operator what to do (advisory banner + alerts)

That's what a Digital Twin does. And that's what AERIS-TWIN is.

---

## UAV → Ground Datalink — the live communication path

### The question we get asked
> "How does telemetry actually reach the control centre, at what latency, and in what format? You can't send CSV files live."

Correct — CSV never crosses the link. The link carries **compact binary frames** at 20 Hz; CSV is a debrief *report* the ground station generates after flight. This repo implements the full path for real: an airborne browser session, a ground-station gateway process, and a ground console receiving over a genuine network hop.

### Architecture
```
/sim window (AIRBORNE)              server/relay.ts (:3010)              /gcs window (GROUND)
flightStore.tick() 20 Hz   ──encode──▶  binary frames 112 B  ──decode+CRC──▶  writes flightStore
channel model (LOS/SATCOM) ──ws──▶  hub: telemetry→grounds,  ◀──0x02 CMD──  operator controls
0x03 ACK ◀────────────────────────  commands→airborne                     retry ×3 + ACK UI
```
- **Format** — fixed-layout binary (magic/ver/type/seq/txSec header, 24 × f32 payload, fault+emergency flags, CRC-16). ~112 B/frame @ 20 Hz ≈ **18 kbps**, decode < 1 ms, integrity verified per frame. Production would swap the hand-rolled codec for generated MAVLink 2 / Protobuf — same interface.
- **Latency budget (sample → screen)** — LOS datalink ≈ **20–40 ms** one-way; Iridium-class SATCOM ≈ **220–520 ms** one-way. "Sub-50 ms" is a *designed, measured* budget over LOS/ground links, never a claim over SATCOM physics. The GCS bar shows measured one-way latency (frame timestamp vs local clock — accurate here because both windows share one machine; real deployments use NTP/PTP), gateway RTT, loss %, seq gaps and last-frame age.
- **QoS classes** — telemetry is an unacknowledged, latest-wins stream (UDP-like); operator commands are acknowledged with retry ×3 (TCP-like). Command RTT is displayed live ("THROTTLE ACK 4 ms").
- **Channel model** — LOS / SATCOM / OUTAGE buttons on the flight-sim's DATALINK MODEM panel simulate the RF link (delay, jitter, loss). The WebSocket hop itself is real: flip SATCOM on the sim window and the GCS latency readout jumps; kill the relay and the GCS shows NO LINK instead of silently faking data.
- **Store-and-forward (next phase)** — on reconnect the ground requests missing sequence numbers and the airborne bursts the gap; a binary session recorder on the relay turns the raw stream into the debrief CSV ground-side.

### Running the demo (two windows)
1. `npm run relay` → ground-station gateway on `ws://localhost:3010` (or `RELAY_PORT=3010 node server/relay.ts`).
2. `npm run dev` → app on :5174.
3. Open **/sim** in one browser window (AIRBORNE) and **/gcs** in a second window (GROUND). Watch the GCS link bar: LIVE + one-way latency, RTT, loss, CRC, gaps. Drag the GCS throttle or inject a fault — it travels down the link (ACK shown), and the UAV responds.
4. Flip the sim's DATALINK modem to SATCOM → GCS latency jumps to ~250 ms with small loss. Switch to OUTAGE → NO LINK, frame age climbing. Back to LOS → stream resumes, gaps counted.

### Deployment honesty
WebSockets need a persistent process. Local demo = the relay on your laptop. A public preview would host the relay as a small always-on Node service or Cloudflare Durable Objects (this repo already targets Cloudflare via Nitro). The local two-window demo is what we present — the network hop is real.
