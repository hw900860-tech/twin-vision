# AERIS-TWIN — AI-Enabled Digital Engine Intelligence

A production-ready, interactive WebGL application that merges a **gamified 3D UAV Flight Simulator** with an **Air Traffic Control (ATC) / Ground Control Station (GCS) Aero Engine Digital Twin Command Center** for MALE UAVs equipped with Rotax 914 / Austro AE300 piston engines.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack](#tech-stack)
3. [Page Architecture](#page-architecture)
4. [Module 1 — Landing Page](#module-1--landing-page)
5. [Module 2 — Flight Simulator (`/sim`)](#module-2--flight-simulator-sim)
6. [Module 3 — GCS Command Center (`/gcs`)](#module-3--gcs-command-center-gcs)
7. [Engine Thermodynamic Physics Core](#engine-thermodynamic-physics-core)
8. [Flight Dynamics Model](#flight-dynamics-model)
9. [Fault Injection Sandbox](#fault-injection-sandbox)
10. [Terrain Generation System](#terrain-generation-system)
11. [3D Engine Digital Twin](#3d-engine-digital-twin)
12. [Simulation Lab — Value Relationships](#simulation-lab--value-relationships)
13. [How to Run](#how-to-run)

---

## System Overview

AERIS-TWIN is a **read-only advisory system** that demonstrates how digital twin technology can provide predictive engine intelligence for MALE (Medium-Altitude Long-Endurance) UAVs. It runs entirely in the browser with no backend server — all physics, telemetry, and diagnostics are computed client-side in real time.

The system has three interconnected pages:

| Route | Purpose |
|---|---|
| `/` | Landing page — product overview, architecture, interactive 3D engine model |
| `/sim` | **Flight Simulator** — fly a TAPAS BH-201 UAV across 3 terrains with live engine telemetry |
| `/gcs` | **GCS Command Center** — monitor engine health, run diagnostics, replay missions |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TanStack Start (SSR) |
| Routing | TanStack Router (file-based) |
| 3D Rendering | Three.js via `@react-three/fiber` + `@react-three/drei` |
| Styling | Tailwind CSS v4 (oklch design system) |
| Charts | Recharts (sparklines, area charts) |
| Icons | Lucide React |
| Animation | GSAP, CSS animations |
| State | Zustand (flight simulator), React state (GCS) |
| Build | Vite 8, Bun package manager |
| Fonts | Space Grotesk (display), IBM Plex Mono (readouts) |

---

## Page Architecture

### Landing Page (`/`)
A scrollable marketing page with 12 sections explaining the AERIS-TWIN concept:
- **Hero** — 3D rotating engine model with live telemetry overlays
- **The Problem** — why conventional threshold monitoring fails
- **Digital Twin** — interactive 3D engine cutaway (click cylinders to inspect)
- **Live Twin** — real-time telemetry dashboard with sparklines
- **Physics vs Reality** — residual charts showing model divergence
- **Predictive Intelligence** — detection lead time demonstration
- **Explainable Diagnostics** — contributing factor breakdown
- **RUL Estimation** — Weibull-based remaining useful life with confidence bands
- **Mission Intelligence** — mission risk assessment
- **What-If Simulation** — adjustable scenario controls
- **Mission Replay** — deterministic 4-hour mission playback
- **Maintenance Advisory** — predictive maintenance recommendations

### Flight Simulator (`/sim`)
A full-screen 3D flight simulator with:
- Procedural textured terrain (3 biomes)
- TAPAS BH-201 UAV with spinning propeller
- Chase camera following the UAV
- Military-grade HUD overlay
- Right-side control panel

### GCS Command Center (`/gcs`)
A dashboard with 7 tabbed views:
- Fleet overview, Live Twin, Diagnostics, Mission Replay, Simulation Lab, Maintenance, Reports

---

## Module 1 — Landing Page

### 3D Engine Hero
The hero section renders a Three.js `Canvas` with an `EngineModel` component — a stylized 4-cylinder piston engine that slowly rotates. Floating telemetry labels (RPM, CHT, EGT, Oil Pressure, Fuel Flow, Vibration) update every frame using a deterministic `simulate()` function.

### Boot Overlay
On first load, a typewriter-style boot sequence displays:
```
SYSTEM GRID .......... OK
AERIS-TWIN CORE ...... v1.4
TELEMETRY LINK ....... ESTABLISHED
SENSOR ARRAY ......... 24 NODES
PHYSICS MODEL ........ AE-P4 LOADED
ANOMALY ENGINE ....... ARMED
TWIN SYNCHRONIZED
```
This is purely cosmetic and hides the 3D engine loading time.

---

## Module 2 — Flight Simulator (`/sim`)

### Core Components

| File | Purpose |
|---|---|
| `flightStore.ts` | Zustand store — all flight state, physics, engine telemetry |
| `FlightSimulator.tsx` | Three.js Canvas with lighting, fog, stars, terrain, UAV |
| `UAVModel.tsx` | TAPAS BH-201 3D model with chase camera + input handling |
| `Terrain.tsx` | Infinite chunk-based procedural terrain |
| `FlightHUD.tsx` | Military HUD overlay (airspeed, altitude, heading, engine data) |
| `ControlPanel.tsx` | Right panel — terrain, missions, throttle, fault injection |

### Flight Controls

**Mouse Drag:**
- Drag **left/right** → Changes UAV heading (0.5° per pixel)
- Drag **up/down** → Changes altitude (20 ft per pixel)

**Keyboard:**
| Key | Action |
|---|---|
| W / ↑ | Increase throttle (+2%) |
| S / ↓ | Decrease throttle (-2%) |
| Q / ← | Turn left (heading -3°) |
| E / → | Turn right (heading +3°) |
| A | Climb (altitude +200 ft) |
| D | Descend (altitude -200 ft) |

### Chase Camera
The camera follows behind and above the UAV relative to its heading:
```
camX = uavX + sin(heading) × 18
camZ = uavZ + cos(heading) × 18
camY = uavAltitude × 0.0015 + 2.5 + 6
```
Position is smoothed with lerp damping (`factor = 0.05`) for buttery tracking.

### HUD Overlay

| Indicator | Source | Color Logic |
|---|---|---|
| AIRSPEED (KTS) | `40 + (throttle/100) × 160 × densityFactor` | Cyan |
| ALTITUDE (FT) | Tracked from target with climb rate limit | Cyan |
| AMBIENT TEMP (°C) | Set by biome selection | Amber |
| ENGINE RPM | `baseRPM + throttle × 1600 × (0.86 + 0.14 × densityFactor)` | Cyan |
| HEADING (°) | Smoothly interpolated toward target | Cyan |
| CHT 1-4 (°C) | Per-cylinder with fault modifiers | Cyan→Amber→Red |
| EGT / MAP | Combined exhaust/manifold readout | Cyan |
| OIL PRESS/TEMP | Inverse temperature relationship | Cyan |
| VIBRATION RMS | Throttle + fault dependent | Cyan→Amber→Red |
| GPS LAT/LON | Derived from world position | Cyan |
| ENGINE HEALTH | Composite score 0-100% | Green→Amber→Red |
| Advisory Banner | Changes based on max CHT | Green/Yellow/Red |

---

## Module 3 — GCS Command Center (`/gcs`)

### Tab Navigation

| Tab | Content |
|---|---|
| FLEET | 5-UAV fleet health overview with status indicators |
| LIVE TWIN | Real-time telemetry dashboard + interactive 3D engine model |
| DIAGNOSTICS | Explainable fault diagnosis + RUL estimation |
| MISSION REPLAY | Deterministic 4-hour mission playback with phase markers |
| SIMULATION LAB | What-if scenario controls (altitude, throttle, wear, duration) |
| MAINTENANCE | Predictive maintenance advisory + audit history |
| REPORTS | Mission reports, model cards, audit trail |

### Telemetry Dashboard (LIVE TWIN tab)
Displays 10 channels with sparkline charts:

| Channel | Unit | What It Shows |
|---|---|---|
| RPM | — | Engine revolutions per minute |
| CHT | °C | Cylinder Head Temperature |
| EGT | °C | Exhaust Gas Temperature |
| OIL PRESSURE | BAR | Lubrication system pressure |
| OIL TEMP | °C | Oil temperature |
| FUEL FLOW | L/h | Fuel consumption rate |
| VIBRATION | G | Vibration RMS acceleration |
| BUS VOLTAGE | V | Alternator output |
| ALTERNATOR | % | Electrical system health |
| INJECTION EFF. | % | Fuel injector efficiency |

---

## Engine Thermodynamic Physics Core

The engine simulation runs a deterministic physics model (`simulate()` in `lib/domain/engine/model.ts`) that calculates all telemetry values from first principles. Every value is a function of **throttle**, **altitude**, **ambient temperature**, **engine wear**, and **fault severity**.

### Core Physics Formulas

#### 1. Air Density Ratio
As altitude increases, air becomes thinner. This is the most important environmental factor:

```
densityRatio = exp(-altitudeFt / 27000)
```

| Altitude (ft) | densityRatio | Effect |
|---|---|---|
| 0 (sea level) | 1.000 | Maximum air density, best engine performance |
| 10,000 | 0.690 | ~31% less air, turbo must boost |
| 18,000 | 0.516 | ~48% less air, significant performance loss |
| 25,000 | 0.395 | ~60% less air, near maximum turbo boost |

#### 2. RPM (Revolutions Per Minute)
```
rpm = baseRPM + throttle × 1600 × (0.86 + 0.14 × densityRatio) + noise
```
- `baseRPM`: 2400 (Himalaya), 2500 (Desert), 2450 (Coastal)
- At 100% throttle and sea level: ~4060 RPM
- At 100% throttle and 25,000 ft: ~3830 RPM (denser air = more RPM)

#### 3. Manifold Absolute Pressure (MAP)
```
MAP = 18 + throttle × 14 × densityRatio
```
- Represents the pressure of air entering the cylinders
- At sea level, 100% throttle: 32 kPa (natural aspiration)
- At 25,000 ft, 100% throttle: 23.5 kPa (turbo must compensate)
- **Turbo Failure fault**: MAP × 0.6 → sudden power loss

#### 4. Cylinder Head Temperature (CHT)
```
CHT_base = 96 + throttle × 96 + ambientTemp × 0.72 - densityRatio × 12
CHT = CHT_base + faultModifier + noise
```

**What affects CHT:**
| Factor | Effect | Why |
|---|---|---|
| ↑ Throttle | ↑ CHT | More combustion = more heat |
| ↑ Ambient Temp | ↑ CHT | Less cooling margin |
| ↑ Altitude | ↓ CHT | Thinner air = less combustion heat |
| ↑ Engine Wear | ↑ CHT | Less efficient combustion |
| Cylinder 2 Overheat fault | +80°C (Cyl 1), +120°C (Cyl 2) | Blocked cooling airflow |

**CHT thresholds:**
- < 170°C: **Normal** (cyan)
- 170-200°C: **Caution** (amber)
- > 200°C: **Critical** (red)
- > 220°C: **Advisory banner turns red** — "Initiate immediate descent"

#### 5. Exhaust Gas Temperature (EGT)
```
EGT = 528 + throttle × 236 + ambientTemp × 0.5
```
- At 100% throttle, sea level: ~764°C
- At 100% throttle, 48°C ambient (Thar Desert): ~788°C
- **Injector Clog fault**: EGT + 60°C + noise (imbalance between cylinders)
- **Turbo Failure**: EGT - 40°C (less fuel burned due to MAP drop)

#### 6. Oil Pressure and Temperature
```
oilTemp = 68 + throttle × 34 + ambientTemp × 0.5
oilPressure = clamp(5.6 - (oilTemp - 90) × 0.012, 1.6, 6.2)
```
Oil pressure is **inversely proportional** to oil temperature — as oil gets hotter, it thins and pressure drops. This is why high oil temperature is a warning sign.

#### 7. Vibration RMS
```
vibration = 0.42 + throttle × 0.36
```
- At idle: 0.42 m/s²
- At 100% throttle: 0.78 m/s²
- **Bearing Spall fault**: +1.8 m/s² + random noise → severe vibration spike

#### 8. FFT Frequency Spectrum (64 bins, 0-630 Hz)
A synthetic vibration spectrum with:
- **Fundamental frequency** at ~80 Hz (bins 7-9): amplitude scales with throttle
- **2nd harmonic** at ~160 Hz (bins 15-17): 25% of fundamental
- **3rd harmonic** at ~240 Hz (bins 23-25): 15% of fundamental
- **Bearing fault peak** at 140 Hz (bins 13-15): +1.5 amplitude when bearing spall is active

#### 9. Composite Health Index
```
health = thermalHealth × 0.3 + vibrationHealth × 0.3 + (1 - anomalyScore) × 0.4
```
Where:
- `thermalHealth = max(0, 1 - (maxCHT - 150) / 130)`
- `vibrationHealth = max(0, 1 - (vibration - 0.5) / 1.6)`

#### 10. Remaining Useful Life (RUL)
```
RUL = 26 × health / stress × (1 - fault × 0.55)
stress = 1 + (throttle/100) × 0.55 + max(0, ambient - 25) / 45
```
RUL decreases over time at a rate of 0.01 hours per simulated second.

---

## Flight Dynamics Model

### Position Update
```
speedKnots = 40 + (throttle/100) × 160 × (0.7 + 0.3 × altitudeFactor)
speedMetersPerSecond = speedKnots × 0.5144
dx = sin(heading) × speedM/s × dt
dz = -cos(heading) × speedM/s × dt
```

### Heading
- Target heading set by mouse drag or keyboard
- Actual heading interpolates toward target at max 30°/s
- Rudder adds direct heading change at 60°/s
- Bank angle = `clamp(hdgDiff × 0.8, -35°, +35°)`

### Altitude
- Target altitude set by mouse drag or keyboard
- Actual altitude climbs/descends at max 800 ft/s
- Clamped to 500 ft minimum, 30,000 ft maximum

---

## Fault Injection Sandbox

Four toggleable faults that modify engine telemetry in real time:

### 1. 🔴 Cylinder 2 Overheat (`c2Overheat`)
**What happens:**
- Cyl 2 CHT spikes by +120°C (from ~140°C to ~260°C)
- Cyl 1 CHT rises by +80°C (shared cooling system)
- Cylinders 3-4 remain normal
- Engine exhaust glow turns red
- Advisory banner: "CRITICAL: CHT OVERLIMIT — REDUCE THROTTLE IMMEDIATELY"

**Real-world analog:** Blocked oil cooler duct or failed cylinder head gasket causing localized overheating.

### 2. 🔴 Wastegate Turbo Failure (`turboFail`)
**What happens:**
- MAP drops to 60% of normal → sudden manifold pressure collapse
- EGT drops by 40°C (less fuel burned)
- RPM decreases due to less air
- Health index drops significantly

**Real-world analog:** Turbocharger wastegate stuck open, bypassing exhaust gas and losing boost pressure. At high altitude this is catastrophic — the engine can't produce enough power.

### 3. 🔴 Bearing Fatigue Spall (`bearingFail`)
**What happens:**
- Vibration RMS jumps from ~0.8 to ~2.6 m/s²
- FFT spectrum shows massive peak at 140 Hz (BPFO — Ball Pass Frequency Outer race)
- Anomaly score increases rapidly

**Real-world analog:** A spall (surface fatigue crack) on a main bearing race creates periodic impacts at the ball pass frequency, visible as a spectral peak.

### 4. 🔴 Fuel Injector Clog (`injectorClog`)
**What happens:**
- EGT rises by 60°C with random noise (imbalance between cylinders)
- Fuel flow becomes unstable
- Health index decreases

**Real-world analog:** Partially blocked injector nozzle causes uneven fuel distribution, leading to lean-burn cylinders with higher exhaust temperatures.

---

## Terrain Generation System

### Procedural Heightmap
Each terrain chunk is a 100×100 vertex `PlaneGeometry` with heights computed using **Fractal Brownian Motion (FBM)** — 5 octaves of coherent noise:

```
height = 0
amplitude = 1
frequency = 1
for each octave:
  height += amplitude × noise2D(x × frequency, z × frequency)
  amplitude ×= 0.5
  frequency ×= 2.1
```

### Three Biomes

| Biome | Height Formula | Colors | Lighting |
|---|---|---|---|
| **Himalaya** | `(noise × 0.7 + ridge × 0.3) × 26` | Snow (white), rock (gray), forest (green) | Cool blue ambient |
| **Thar Desert** | `noise × 8 × duneFactor` | Sand (amber), gravel (tan) | Warm gold ambient |
| **Coastal** | Shore transition + land noise | Water (blue), beach (tan), vegetation (green) | Medium blue ambient |

### Chunk Streaming
- 5×5 grid of 120-unit chunks centered on UAV
- Chunks regenerate when UAV crosses chunk boundaries
- World-space noise coordinates ensure seamless chunk edges
- Vegetation (trees/cacti/palms) placed using seeded random positions

### Vertex Coloring
Each vertex gets colored based on its height:
- **Himalaya:** >20 = snow white, 15-20 = gray rock, 10-15 = dark rock, 5-10 = forest green, <5 = dark green
- **Thar:** >6 = light sand, 3-6 = medium sand, 1-3 = gravel, <1 = flat desert
- **Coastal:** <-0.1 = deep water, -0.1 to 0.2 = shallow water, 0.2-1 = beach, 1-4 = vegetation, >4 = dense forest

---

## 3D Engine Digital Twin

The GCS page includes an interactive 3D engine model (`EngineModel.tsx`) that renders:

| Component | Geometry | Material |
|---|---|---|
| Crankcase | Box 3.5×0.72×1.15 | Dark steel (#4a5055) |
| Cylinders ×4 | Cylinder with cooling fins | Gray (#6b7278) |
| Cylinder Heads | Box 0.7×0.26×0.62 | Steel (#7d848a) |
| Intake Manifold | Cylinder tubes | Dark gray (#5c6369) |
| Exhaust Headers | Cylinder tubes | Brown (#6e6259) |
| Oil Sump | Box 2.1×0.3×0.8 | Dark (#262b2f) |
| Prop Flange | Cylinder disk | Chrome (#9aa0a5) |
| Sensor Nodes ×7 | Pulsing spheres | Cyan/Amber/Red by health |

**Interactive features:**
- Drag to orbit the engine
- Click a cylinder to inspect its CHT, EGT, vibration, health, and status
- Engine rotates slowly when `spin` is enabled
- Cylinder color shifts from dark → cyan (selected) → amber (degraded) → red (critical)

---

## Simulation Lab — Value Relationships

The Simulation Lab allows adjusting 5 input parameters and seeing how they affect engine state:

### Input Controls

| Control | Range | What It Does |
|---|---|---|
| ALTITUDE | 10,000 — 25,000 ft | Changes air density, affects MAP, CHT, RPM |
| AMBIENT TEMP | 20 — 50°C | Changes thermal baseline for CHT, Oil Temp |
| THROTTLE | 20 — 100% | Primary driver of RPM, CHT, EGT, vibration |
| ENGINE WEAR | 0 — 100% | Degrades all subsystem health scores |
| MISSION DURATION | 1 — 12 hours | Affects RUL margin and mission risk |

### Value Relationships Table

| If you increase... | RPM | CHT | EGT | MAP | Oil Press | Vibration | Health |
|---|---|---|---|---|---|---|---|
| **Throttle** | ↑↑ | ↑↑ | ↑↑ | ↑↑ | ↓ | ↑↑ | ↓ |
| **Altitude** | ↓ | ↓ | ↑ | ↓↓ | — | — | ↓ |
| **Ambient Temp** | — | ↑ | ↑ | — | ↓ | — | ↓ |
| **Engine Wear** | — | ↑ | ↑ | — | ↓↓ | ↑ | ↓↓↓ |
| **Fault Severity** | ↓ | ↑↑ | ↑↑ | ↓ | ↓ | ↑↑↑ | ↓↓↓ |

### Why These Relationships Exist

**Throttle → everything changes:** Opening the throttle admits more air-fuel mixture into the cylinders. More combustion means more heat (↑ CHT, ↑ EGT), more exhaust pressure (↑ MAP), more mechanical stress (↑ vibration), and more oil consumption (↓ oil pressure).

**Altitude → MAP drops, turbo must compensate:** At altitude, atmospheric pressure drops exponentially. The turbocharger must spin faster to maintain manifold pressure. If it can't compensate (turbo failure), MAP collapses and the engine loses power.

**Ambient Temperature → thermal margin:** Hot ambient air provides less cooling. A desert at 48°C gives the engine 53°C less thermal headroom than Himalayan conditions at -5°C. This directly impacts CHT.

**Engine Wear → everything degrades:** Wear increases clearances, reduces compression, degrades bearing surfaces, and reduces lubrication effectiveness. The model applies wear as a multiplier across all subsystem health scores.

**Fault Severity → compound degradation:** Faults are modeled as additive modifiers to specific channels. The anomaly score accumulates over time, which progressively reduces the composite health index and accelerates RUL decay.

---

## How to Run

```bash
# 1. Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# 2. Install dependencies
cd twin-vision
bun install

# 3. Start dev server
bun run dev
```

Open `http://localhost:5173` in your browser.

### Available Routes
- `/` — Landing page
- `/sim` — Flight Simulator
- `/gcs` — GCS Command Center

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
│   ├── __root.tsx          # Root layout (html, fonts, meta)
│   ├── index.tsx           # Landing page
│   ├── gcs.tsx             # GCS Command Center
│   └── sim.tsx             # Flight Simulator
├── components/
│   ├── landing/
│   │   ├── Nav.tsx         # Navigation bar
│   │   ├── Hero.tsx        # Hero section with 3D engine
│   │   └── sections.tsx    # All 12 landing sections
│   ├── hud/
│   │   └── primitives.tsx  # Panel, Bar, Readout, StatusDot, etc.
│   └── ClientOnly.tsx      # SSR-safe client component wrapper
├── features/
│   ├── flight-sim/
│   │   ├── flightStore.ts      # Zustand store — flight state + physics
│   │   ├── FlightSimulator.tsx  # Three.js Canvas + lighting
│   │   ├── Terrain.tsx          # Procedural chunk-based terrain
│   │   ├── UAVModel.tsx         # TAPAS BH-201 3D model + controls
│   │   ├── FlightHUD.tsx        # Military HUD overlay
│   │   └── ControlPanel.tsx     # Right panel — terrain, missions, faults
│   ├── digital-twin/
│   │   ├── EngineModel.tsx      # 3D engine cutaway model
│   │   └── EngineCanvas.tsx     # Three.js Canvas for engine
│   ├── telemetry/
│   │   └── TelemetryDashboard.tsx  # Live telemetry with sparklines
│   ├── simulation/
│   │   └── SimulationLab.tsx    # What-if scenario controls
│   ├── mission-replay/
│   │   └── ReplayConsole.tsx    # 4-hour mission playback
│   ├── predictive-maintenance/
│   │   └── Diagnostics.tsx      # Explainable diagnostics + RUL
│   └── fleet/
│       └── FleetPanel.tsx       # Multi-UAV fleet overview
├── lib/
│   └── domain/engine/
│       └── model.ts         # Core engine physics model
├── hooks/
│   └── use-mobile.tsx       # Mobile detection hook
├── styles.css               # Tailwind + design system
├── router.tsx               # TanStack Router config
└── start.ts                 # TanStack Start entry
```

---

## Design System

The site uses a dark military/aviation theme with oklch colors:

| Token | Value | Usage |
|---|---|---|
| `--cyan` | `oklch(0.82 0.11 200)` | Primary accent, healthy values |
| `--amber` | `oklch(0.8 0.13 76)` | Warning, caution values |
| `--critical` | `oklch(0.63 0.2 25)` | Danger, fault indicators |
| `--nominal` | `oklch(0.78 0.13 158)` | Good/healthy indicators |
| `--panel` | `oklch(0.203 0.009 240)` | Panel backgrounds |
| `--background` | `oklch(0.16 0.008 240)` | Page background |

Typography:
- **Space Grotesk** — Headings, UI text (clean, technical)
- **IBM Plex Mono** — Readouts, data values (monospaced, tabular numbers)
