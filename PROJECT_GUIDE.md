# AERIS-TWIN — The Complete Project Guide

> **The master document.** Everything about the project: where it came from, why it exists, every feature and how it works, the physics in depth, the ROI, and where it goes next. If you read only one file about this project, read this one.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The History — How This Project Came to Be](#2-the-history--how-this-project-came-to-be)
3. [Why This Project Had to Exist — The TAPAS BH-201 Story](#3-why-this-project-had-to-exist--the-tapas-bh-201-story)
4. [Core Technologies](#4-core-technologies)
5. [System Architecture — The Big Picture](#5-system-architecture--the-big-picture)
6. [How to Navigate the Project (Workflow)](#6-how-to-navigate-the-project-workflow)
7. [Feature-by-Feature Deep Dive](#7-feature-by-feature-deep-dive)
8. [The Physics, In Depth](#8-the-physics-in-depth)
9. [What Problems This Project Solves](#9-what-problems-this-project-solves)
10. [ROI — Return on Investment](#10-roi--return-on-investment)
11. [Real-World Deployment Challenges](#11-real-world-deployment-challenges)
12. [Future Scope — The Roadmap](#12-future-scope--the-roadmap)
13. [Why This Is the Best Solution to the Problem Statement](#13-why-this-is-the-best-solution-to-the-problem-statement)
14. [Appendix — Quick Reference](#14-appendix--quick-reference)

---

## 1. Executive Summary

**AERIS-TWIN** is a production-style, end-to-end digital-twin platform for MALE (Medium-Altitude Long-Endurance) UAV aero piston engines — the class of aircraft exemplified by India's TAPAS BH-201 and the Rotax 914 / Austro AE300 engines that power them.

The platform is three things in one:

1. **A gamified 3D flight simulator** (`/sim`) — you fly a TAPAS-class UAV across three procedurally generated operational environments (Himalayan high altitude, Thar desert, coastal maritime), through live "atmospheric regions" that physically change the engine's behavior, on scripted mission presets that fly out-and-back round trips.
2. **A real-time engine thermodynamic digital twin** — a 20 Hz physics loop computes CHT, EGT, MAP, oil pressure/temperature, vibration RMS and a synthetic FFT spectrum for a 4-cylinder turbocharged aero piston engine, plus six explainable ML subsystem models, a Health Index, and a Weibull-based Remaining Useful Life estimate. A 3D cutaway engine model renders it all with fault highlighting and an explode/assemble studio.
3. **A real datalink between them** — the simulator is the "airborne" session, the Ground Control Station (`/gcs`) is the "ground" session, and they communicate over a genuine network hop through a ground-station gateway relay using a compact **binary protocol** (not CSV — CSV is only a debrief report). The link has a channel model (LOS / SATCOM / OUTAGE), store-and-forward gap recovery, CRC-16 integrity, acknowledged command downlink, a session recorder, a mission recorder with animated sortie replay, and live OpenWeather ingestion that reshapes the mission's atmospheric regions.

The whole system is deterministic, self-contained, and runs on a laptop — but the network hop between the two browser windows is **real**, so the latency, packet loss, and gap-recovery behavior the operator sees is genuine.

---

## 2. The History — How This Project Came to Be

### 2.1 The origin

The project began as a hackathon build: a "gamified 3D UAV flight simulator merged with an Air Traffic Control / Ground Control Station digital-twin command center." The original pitch demanded a Rotax 914 / Austro AE300 engine twin for TAPAS BH-201-class MALE UAVs, three selectable operational environments, a fault-injection sandbox, a sub-50 ms telemetry bus, a 3D engine heatmap, and an AI anomaly/prognostics engine.

### 2.2 How it evolved (the git history tells the story)

Each major commit is a milestone:

| Phase | What was built |
|---|---|
| **Foundation** | Landing page with 3D engine hero, engine dismantle studio (camera fixes, colors), the flight sim with procedural terrain, the GCS dashboard, the engine physics core, CSV telemetry export, mission replay console. |
| **Cinematics** | A cinematic MP4 intro with a seamless handoff into the 3D GLB engine model on the landing page. |
| **Live weather + emergencies** | OpenWeatherMap ingestion (server-side API key), MAYDAY alarm gate with synthesized siren audio, offline post-flight debrief analytics. |
| **Real datalink** | The real UAV→GCS binary datalink: relay process, airborne encoder, ground decoder, channel model, latency readouts. |
| **Resilience** | Store-and-forward datalink resilience (60 s airborne ring buffer + GAP_REQ recovery) and a relay-side binary session recorder. |
| **GCS depth** | Analytical sensor redundancy & health matrix, fault sandbox integration, hero engine stance tuning. |
| **Audio layer** | Cinematic intro roar, sim engine voice following live RPM, explode/assemble SFX. |
| **Tactical mission stack** | Atmospheric regions with enter/exit alerts, region transect missions, region-adaptive autopilot (evade / optimal transit), waypoint route planner with leg-risk analysis, live route progress rendering, tactical mini-map, sortie recorder → MISSION_RECORD frames → animated GCS sortie replay, region-excursion history panel, GCS live data band. |
| **Stability engineering** | WebGL context-loss hardening (canvas remount + scene error boundary), and the fix for the dev-only TanStack devtools `data-tsd-source` attribute that was killing the R3F render loop ("black screen"). |

Along the way the product got its identity: **AERIS-TWIN** — *"Know the engine before it knows it's failing."*

---

## 3. Why This Project Had to Exist — The TAPAS BH-201 Story

### 3.1 The program that failed

India's MALE UAV program — **TAPAS BH-201** (Tactical Airborne Platform for Aerial Surveillance) — spent **8 years and ₹1,786 crore (~$220M)** trying to build an indigenous Predator-class surveillance drone. It was **closed as a Mission Mode Project in January 2024**.

Not because the airframe was bad. Not because the sensors didn't work. It was grounded by a combination of:

1. **Weight** — planned 1,800 kg, actual 2,200 kg (22% overweight). Every extra kg costs altitude.
2. **Engine** — the Rotax 914 couldn't deliver enough power at 30,000 ft. Target: 30,000 ft / 24 hr. Achieved best: 28,000 ft / 18 hr.
3. **No predictive intelligence** — when the engine ran hot at altitude, nobody knew it was a *developing* failure until it was too late.

### 3.2 The timeline of struggles

| Year | Event |
|---|---|
| 2010 | Design starts — "India's Predator": 30,000 ft, 24 hr endurance |
| 2013 | Taxi trials at Kolar airfield |
| 2016 | First flight (15 Nov, Challakere, Karnataka) |
| 2019 | **Prototype AF-6 crashes** — datalink loss triggered return-home mode, turbulence overwhelmed the control law |
| 2020 | 16,000 ft / 8 hr — 14,000 ft short of target |
| 2021 | 25,000 ft / 10 hr — better, still far short |
| 2022 | 28,000 ft / 18 hr — best performance, engine maxed out |
| 2022 | Weight crisis: 2,200 kg vs 1,800 kg planned |
| 2024 | **Project closed** |

### 3.3 The five root causes

1. **The engine was too weak.** The Rotax 914 produces 115 HP at sea level. At 30,000 ft, air density is ~40% of sea level and the turbocharger cannot fully compensate. The engine physically cannot produce the power needed at that altitude with a 2,200 kg airframe.
2. **The weight spiral.** Every system added weight → less altitude → demand for a bigger engine → more weight.
3. **No engine health intelligence.** Operators could not distinguish "engine is stressed but fine" from "engine is about to seize." No baseline existed for what 28,000 ft *should* do to CHT/EGT.
4. **Single point of failure.** The AF-6 crash was triggered by a communication link loss and an autopilot that couldn't handle the turbulence. No predictive layer said "don't fly this route" or "land now."
5. **No prognostics.** Even with warning signs present (rising EGT, growing vibration), nobody could compute **Remaining Useful Life** — how many more flight hours before mandatory maintenance.

### 3.4 The gap AERIS-TWIN fills

The engine failures didn't happen suddenly. The signs — rising CHT, fluctuating EGT, growing vibration — were all there *before* the performance shortfalls. What was missing in 2024 was a system that could:

- **Watch** the engine at 20 Hz (50 ms updates)
- **Understand** what each temperature/vibration change *means*
- **Predict** which component fails next and how long remains
- **Advise** the ground operator what to do about it, in plain language

That is exactly the hole this project builds. It is not a paper architecture — it implements the whole chain: flight physics → engine thermodynamics → ML prognostics → binary datalink → ground-station operator tools → post-flight debrief.

---

## 4. Core Technologies

### 4.1 The stack

| Layer | Technology | Why it was chosen |
|---|---|---|
| UI framework | **React 18 + TypeScript** | Component model fits a dashboard-heavy, real-time app; strict typing keeps a 23k-line codebase sane |
| Build tool | **Vite 5** | Instant HMR for the 3D-heavy dev loop; `tsc && vite build` for production |
| 3D rendering | **Three.js 0.160** via **@react-three/fiber 8** + **@react-three/drei 9** | Declarative React scene graph over WebGL; drei gives `Html` labels, GLTF loading, helpers |
| Styling | **Tailwind CSS 3** (custom oklch design tokens) | Fast utility styling; consistent military-dark theme across pages |
| State | **Zustand 4** | Global flight/engine/link stores with subscriptions — no prop-drilling for the 20 Hz tick |
| Charts | **Chart.js 4** (react-chartjs-2) | Lightweight real-time sparklines for the telemetry dashboard |
| Routing | **TanStack Router** (file-based, generated `routeTree.gen.ts`) | Type-safe routes; server functions (TanStack Start) keep the OpenWeather API key server-side |
| Real-time transport | **WebSocket** — `ws` on the server (`server/relay.ts`), native `WebSocket` in the browser via `LinkSocket` | Sub-50 ms bidirectional binary frames; the relay is a persistent Node process |
| Server | **Express** (in the dev server composition) | HTTP + WS bootstrap for the gateway relay |
| Motion | **Framer Motion 10** | Landing-page cinematic transitions |
| Icons | **lucide-react** | Consistent military/technical icon set |
| Package manager | **Bun** (works with npm too) | Fast installs and dev scripting |

> Honest note on the transport: `socket.io`/`socket.io-client` appear in `package.json` from the original spec, but the shipping datalink uses **raw WebSocket with a hand-rolled binary codec** — smaller frames, no protocol overhead, and full control of the frame layout. The real-time bus is Socket.IO's successor in spirit: a persistent socket with binary messages.

### 4.2 Key libraries that do the heavy lifting

- **Zustand stores** — `useFlightStore` (all flight + engine physics, 1027 lines — the heart of the app), `useLinkStore` (datalink stats, alerts, excursions, sorties).
- **Pure-math modules** — `terrainMath.ts` (simplex noise terrain), `regions.ts` + `regionPilot.ts` + `routePlanner.ts` (atmospheric zones + autopilot + planning), `engineMlService.ts` (6 ML subsystem models + decision engine), `environment.ts` (standard-atmosphere math), `model.ts` (standalone AE-P4 simulator used by the Simulation Lab).
- **Datalink codec** — `protocol.ts` (frame grammar) + `codec.ts` (encode/decode + CRC-16) + `channel.ts` (LOS/SATCOM/OUTAGE model) + `orderReceiver.ts` (sequence-gap recovery) + `airborne.ts`/`ground.ts` (the two link endpoints).

---

## 5. System Architecture — The Big Picture

```
┌───────────────────────────┐      ┌────────────────────────────┐      ┌──────────────────────────────┐
│   /sim — AIRBORNE         │      │  server/relay.ts  (:3010)  │      │   /gcs — GROUND STATION      │
│  (the UAV "in flight")    │      │  ground-station gateway    │      │  (operator consoles)         │
├───────────────────────────┤      ├────────────────────────────┤      ├──────────────────────────────┤
│ flightStore.tick() 20 Hz  │      │  role registry (hello)     │      │  OrderedReceiver (seq-gaps)  │
│  physics + engine twin    │      │  telemetry → all grounds   │      │  CRC verify → decode         │
│  regions + autopilot      │      │  commands → airborne       │      │  latency/loss/gap stats      │
│  sortie recorder          │      │  session recorder (.bin)   │      │  excursion recorder          │
│                           │      │                            │      │  sortie log + replay         │
│  ┌───────────────────┐    │      │                            │      │  ML decision engine re-run   │
│  │ DatalinkChannel   │    │      │                            │      │  command downlink (retry×3)  │
│  │ LOS/SATCOM/OUTAGE │    │      │                            │      │  weather uplink              │
│  └─────────┬─────────┘    │      │                            │      │                              │
│            │              │      │                            │      │                              │
│  encode 112 B frame ──────┼─────▶│  forward (cap 512 B hot)  ─┼─────▶│  decode + apply to store    │
│  20 Hz + seq + CRC        │      │                            │      │                              │
│            ▲              │      │                            │      │                              │
│  GAP_REQ ◀─┼──────────────┼──────│  (store-and-forward)  ◀────┼──────│  "I have through seq N"     │
│  ring replay ◀────────────┼──────│  ◀─────────────────────────┼──────│  replayed burst closes hole │
│            │              │      │                            │      │                              │
│  CMD + ACK ◀──────────────┼──────│  ground→air commands  ◀────┼──────│  operator sliders/buttons   │
└───────────────────────────┘      └────────────────────────────┘      └──────────────────────────────┘
```

**Layers of the platform:**

- **Layer 1 — Data inputs:** throttle, altitude, ambient temperature (biome + live weather + region deltas), fault switches, engine wear.
- **Layer 2 — Physics engine (20 Hz):** air density, MAP, CHT/EGT/oil thermodynamics, vibration + FFT synthesis, component stress, dynamic pressure, region blending.
- **Layer 3 — ML intelligence:** 6 subsystem models → decision engine → Health Index, anomaly score, RUL, explainable diagnosis + recommended action.
- **Layer 4 — Datalink:** encode → channel model → WebSocket → relay → decode → ordered receiver → ground stores.
- **Layer 5 — Operator interfaces:** flight HUD, mini-map, GCS dashboards, alerts, MAYDAY, replays, reports.

---

## 6. How to Navigate the Project (Workflow)

### 6.1 Running it

```bash
cd twin-vision
bun install            # or: npm install

# Terminal 1 — the ground-station gateway relay (the "radio tower")
npm run relay          # ws://localhost:3010  (RELAY_PORT to override)

# Terminal 2 — the web app
bun run dev:client     # or: npx vite --port 5174
```

Open the app, then:

1. Open **`/sim`** in one browser window — this is the **AIRBORNE** session (the UAV).
2. Open **`/gcs`** in a second window — this is the **GROUND** station.
3. Watch the GCS link bar go LIVE: one-way latency, gateway RTT, loss %, CRC, sequence gaps.

> The relay must be running for the two windows to talk. Kill the relay and the GCS shows **NO LINK** instead of silently faking data — that's the point.

### 6.2 The three pages

| Route | Page | Role |
|---|---|---|
| `/` | Landing | Product story — cinematic intro, 3D engine hero, 13 explainer sections |
| `/sim` | Flight Simulator | **AIRBORNE** — fly missions, inject faults, watch the engine react |
| `/gcs` | Ground Control Station | **GROUND** — monitor, diagnose, replay, plan, report |
| `/login`, `/admin/login` | Auth | Login gates for the operator pages (`ProtectedRoute`) |

### 6.3 The operator workflow (what you'd actually do)

**Before launch (planning):**
1. On `/gcs` → **ENVIRONMENT** panel: pick an operating airfield (Leh, Srinagar, Jaisalmer, Jodhpur, Goa, Chennai) or add a custom station; sync live OpenWeather (OAT, QNH, wind, humidity). This **reshapes the region map** the aircraft will fly through.
2. On `/sim` → **ROUTE PLANNER**: the planned route's legs are tinted green/amber/red against the region rings. Re-route around the LOW PRESSURE TROUGH if needed — before takeoff.
3. Pick a mission preset, check the DATALINK MODEM panel (LOS for ground ops, SATCOM for BVLOS), arm the mission.

**In flight:**
4. Watch the HUD + mini-map: the UAV flies the route; region markers light up on entry; the banner announces each air-mass crossing; the engine reacts (OAT, MAP, EGT, CHT move live).
5. On `/gcs`: the live data band streams 20 Hz values; the link bar shows latency/loss; region ENTER/EXIT alerts tick across; the excursion log records each air mass with its engine-response graphs; MAYDAY goes off if a red threshold trips.
6. Inject a fault from either side (sim buttons or GCS fault sandbox — they travel over the link as acknowledged commands).

**After flight:**
7. The sortie recorder captured the mission → it crosses the link as a MISSION_RECORD frame → **SORTIE REPLAY** tab replays the animated route with waypoint capture times.
8. **REPORTS** → export the CSV debrief (generated ground-side from the recorded stream — never a transport format).

### 6.4 The developer file map (where everything lives)

```
src/
├── routes/            index.tsx (landing) · sim.tsx (airborne) · gcs.tsx (ground) · login/admin
├── features/
│   ├── flight-sim/    flightStore.ts ★ physics · Terrain · UAVModel · FlightHUD · ControlPanel ·
│   │                   MiniMap · RoutePath · regions · regionPilot · routePlanner · sortieRecorder
│   ├── digital-twin/  EngineModel (GLB twin) · EngineCanvas · EngineAlerts · engineMlService ·
│   │                   JARVISPartInspector · JARVISExplodeStudio · engineViewerAudio
│   ├── datalink/      airborne.ts · ground.ts · linkStore.ts · AirborneLinkPanel · GcsLinkBar ·
│   │                   GcsLiveDataBand · GcsAlertTicker · RegionExcursionPanel · regionExcursions
│   ├── telemetry/     TelemetryDashboard · mayday.ts (MAYDAY gate + siren)
│   ├── simulation/    SimulationLab (what-if)       ├── mission-replay/ ReplayConsole · SortieReplayPanel
│   ├── environment/   EnvironmentPanel (weather)    ├── sensors/        SensorHealthMatrix
│   ├── predictive-maintenance/ Diagnostics · RUL    ├── reports/        PostFlightAnalytics
│   └── fleet/         FleetPanel                    └── flight-analysis/ CSV serialize + parse
├── lib/
│   ├── datalink/      protocol · codec · channel · client · orderReceiver · sortie · types
│   └── domain/engine/ model (AE-P4 sim) · environment (ISA/atmosphere) · openWeather (SSR fetch)
└── components/        landing/ (Nav·Hero·CinematicIntro·sections) · hud/primitives · ui/ (shadcn-style) · auth/
server/relay.ts        the ground-station gateway + binary session recorder
scripts/               e2e_datalink · e2e_gap_recovery · fake_airborne · measure-engine
```

---

## 7. Feature-by-Feature Deep Dive

### 7.1 The Flight Simulator (`/sim`)

#### The terrain — three operational biomes

Terrain is **procedural** — a seeded simplex-noise FBM (fractal Brownian motion, 3 octaves) drives height, so no heightmap assets are needed and every launch looks slightly different. `terrainMath.ts` implements a hand-rolled 2D simplex noise (permutation table seeded 1337) — fast enough to run per-vertex at 60 fps.

- **Himalayan High Altitude** — smooth alpine elevation (up to ~15 terrain units ≈ 30,000 ft scale), snow-capped peaks, ragged snow line bleeding rock through, patchy valley meadows, moss-scree transitions, slate strata with shadowed gullies, glacier ice veins above the cap. Ambient −5 °C. Terrain collision forces the UAV to stay above the peaks.
- **Thar Desert Patrol** — rolling dunes from sine-wave + noise combinations (2.5–6 units), windward/leeward shading, ripple striping, crest highlights. Ambient +48 °C.
- **Coastal Maritime** — a shoreline: depth-banded seabed, a gleaming surf line, rippled dry beach, strata'd cliffs, headland grass. Ambient +28 °C, dense humid air.

Vegetation is biome-aware: twin-cone pines + rocks (Himalaya), shrubs + outcrops (Thar), trees/scrub/boulders (coastal). All rendered as low-poly instanced meshes so the scene stays at 60 fps.

#### The UAV and its flight model

The UAV is the real TAPAS BH-201 GLB model (pusher-config, colored, oriented nose-forward), with a spinning propeller and directional lights. The flight model is a simplified kinematic autopilot, not raw physics:

- **Position** integrates from heading and speed: `dx = sin(heading)·V·dt`, `dz = −cos(heading)·V·dt` (heading 0° = north).
- **Turn rate** is bounded (30°/s) but **tightens up to 165°/s near a waypoint** — this was a hard-won fix: with a fixed turn rate, the UAV's minimum turn radius (~124 units) exceeds the arrival gate, so it orbited waypoints forever. Speed also eases inside the capture horizon.
- **Altitude** climbs at 800 ft/s toward the target, clamped 500–30,000 ft and never below terrain.
- **Bank angle** follows heading error (±35°); pitch follows climb rate — the 3D model banks and pitches as it turns, and the **drag-to-look camera** orbits around the aircraft when you drag empty space or right-drag.

**Controls:**
- **Drag on the UAV** → steer it (chase camera) or orbit (bird's-eye).
- **Drag on empty scene / right-drag** → orbit the camera (look around) without commanding turns.
- Throttle (0–100 %), target heading, target altitude — via the control panel or by dragging.

#### The HUD

A military-style overlay: speed (kts), altitude (ft), ambient OAT (°C), RPM, heading, coordinates (lat/lon derived from world x/z), mission banner, engine readouts, and the tactical advisory strip (green/yellow/red).

#### Missions & presets — real round trips

Six mission presets, each with a full **out-and-back route that closes the loop at base**:

| Preset | Biome | Story |
|---|---|---|
| NOMINAL ROUTINE | Himalaya | 4 waypoints, region detours on both legs, returns home |
| HIGH ALTITUDE / HIGH TEMP FAILURE | Himalaya | 88% throttle at 18,000 ft — CHT/EGT runaway → stall → **crash** (failure protocol intact) |
| COASTAL / EXTREME COLD RECOVERY | Coastal | −25 °C scenario — turbine-ice detection → predictive abort → **flies home to base** |
| HIMALAYA REGION TRANSECT | Himalaya | Flies into CRYO TROUGH → LOW PRESSURE → THERMAL SHEAR cores |
| THAR REGION TRANSECT | Thar | HEAT BASIN → DUST STORM → MIRAGE UPWELL cores |
| COASTAL REGION TRANSECT | Coastal | DENSE AIR → COLD FRONT → GUST LAYER cores |

The autopilot flies the waypoints; on arrival the mission reports `COMPLETE — ALL WAYPOINTS SURVEYED · UAV RETURNED TO BASE` and **parks the aircraft** (no more infinite northward drift — a real bug that was found and fixed).

#### Route progress rendering

`RoutePath.tsx` renders the mission as a live progress strip over the 3D terrain: future legs risk-tinted and dim; the **current leg glows** with the flown portion filling in emerald behind the UAV (projected along the leg); passed waypoints flip to gray with a `✓`; the active target pulses white with a `▶`. After landing the whole circuit stays drawn as a completed loop.

#### The tactical mini-map

A pure DOM/SVG overlay in the top-left corner — no WebGL cost. It shows the region rings (weather-deformed ellipses with the same math as the 3D markers), the planned route with progress ticks (42-world-unit spacing), the heading-aligned UAV arrow, and a legend. Design note: the map is **anchored on the mission area**, and a UAV that wanders off-map clamps to the frame edge with a dashed "off-map" ring — the tactical convention, because at standby the sim's UAV cruises north at 138 kts forever.

### 7.2 Atmospheric regions — micro-weather air masses

Nine named regions (three per biome) each carry their own micro-atmosphere: temperature offset, air-density ratio, manifold-pressure delta, and turbulence. When the UAV crosses a ring, the physics **blend the region's parameters into the engine model**, the 3D ring lights up, a `REGION_ALERT` frame crosses the datalink, and the GCS shows the alert + excursion.

| Region | Biome | Severity | Effect on engine |
|---|---|---|---|
| CRYO TROUGH | Himalaya | caution | OAT −16 °C, ice-accretion risk, carb heat |
| LOW PRESSURE TROUGH | Himalaya | **critical** | MAP ×0.82 — manifold collapse, turbo spools harder, EGT/CHT rise |
| THERMAL SHEAR ZONE | Himalaya | caution | turbulence 0.85 — vibration excursion |
| HEAT BASIN | Thar | **critical** | +20 °C — CHT/EGT elevation |
| DUST STORM CORE | Thar | **critical** | thin air + turbulence 0.9, ingestion risk |
| MIRAGE UPWELL | Thar | caution | density-altitude rise, performance penalty |
| MARITIME DENSE AIR | Coastal | info | MAP up ×1.05, dense air, humidity |
| COLD FRONT | Coastal | caution | OAT −13 °C, icing window |
| COASTAL GUST LAYER | Coastal | caution | wind shear, vibration |

**Live-weather deformation (Layer-2):** when the operator syncs an OpenWeather station, `applyWeatherToRegions` deforms the whole map — wind **drags regions downwind** (shift ∝ wind speed) and **stretches them into ellipses** along the flow axis; a low QNH **deepens** low-pressure troughs; a hot/cold station day scales every region's thermal character; wind adds turbulence everywhere. The route planner and mini-map read the same deformed geometry, so the operator plans against the real forecast.

**Region-adaptive autopilot (`regionPilot.ts`):** when a mission leg is about to cut through a caution/critical ring:
1. It computes whether an **alternate path exists** — a curved detour approximated by a fan of waypoints at radius r+margin around the ring (each connector chord verified to clear the ring by ≥2 units and to avoid other CRITICAL zones). If one exists: `ALTERNATE PATH FOUND — DIVERTING AROUND LOW PRESSURE TROUGH`.
2. If the **waypoint itself sits inside** the zone (the zone is the mission target — no alternate exists): it transits under **optimal conditions** — throttle clamped to ~58 %, with the original value remembered and restored on exit.

The whole decision is pure math (`legThreats`, `planEscape`, `ringPenetration`, `segmentRegionCrossing`) — no simulation shortcuts.

**Region-excursion history (GCS):** the ground side correlates ENTER/EXIT alerts with the 20 Hz telemetry stream (`regionExcursions.ts`) and records each excursion with its engine-response series (MAP/EGT/CHT/vibration per second inside the zone), summarized stats (duration, MAP min/mean, EGT max, CHT max), and a decimated chart — the REGION LOG tab.

### 7.3 The engine physics core (20 Hz)

The heart is `updateEngineTelemetry()` in `flightStore.ts`, called every tick (≈50 ms). Section 8 covers the math; here's the feature inventory:

- **RPM** — throttle + density-scaled, with deterministic pseudo-noise.
- **MAP** — barometric equation, density-scaled, turbo-fail derating, region pressure deltas.
- **CHT per cylinder (1–4)** — throttle + ambient heat input, density cooling; cylinder 2 gets a +122 °C spike on overheat (cylinder 1 shares +75 °C via the common cooling system — cylinders 3/4 stay normal).
- **EGT** — throttle + ambient; injector clog adds +68 °C imbalance (cylinder 3 hotter); turbo failure drops it.
- **Oil temperature & pressure** — coupled: hot oil thins, pressure falls.
- **Vibration RMS** — throttle base + bearing-fault spike + region turbulence excitation.
- **FFT spectrum** — 64 bins spanning 0–630 Hz: engine harmonics at ~90/180/270 Hz grow with throttle; a **140 Hz BPFO peak** blooms when the bearing fault is injected (the classic ball-pass-frequency signature).
- **Component stress indices** — cylinders, exhaust runners, turbo, crankcase, oil system, gearbox, overall load (0–1) — these drive the 3D engine highlight colors.
- **Dynamic pressure q = ½ρV²** and a directional load vector from pitch/bank/speed.

Faults are **smoothed** (exponential lerp at 2.0–3.0/s) so telemetry ramps realistically instead of snapping — this matters because the datalink flags use the smoothed state with a 0.3 threshold.

### 7.4 The fault-injection sandbox

Four toggleable faults, injectable from the sim control panel **or** from the GCS (they travel downlink as acknowledged `CMD_FAULT` frames):

1. **CYL 2 OVERHEAT** — blocks cooling airflow: CHT2 → ~260 °C, CHT1 → ~220 °C, oil temp rises, oil pressure falls.
2. **TURBO FAILURE** — wastegate stuck: MAP ×0.58, RPM and EGT drop, power lost — catastrophic at altitude.
3. **BEARING SPALL** — vibration → ~2.7 m/s², FFT BPFO peak at 140 Hz, crankcase/gearbox stress up, RUL collapses.
4. **INJECTOR CLOG** — EGT imbalance (cylinder 3 hotter), fuel-flow instability, combustion efficiency down.

Every fault feeds the ML decision engine, which generates the diagnosis text ("CYLINDER HEAD WARNING — Cylinder 2 CHT elevated to 262 °C…") and the recommended action.

### 7.5 ML & prognostics (the "AI" layer)

`engineMlService.ts` runs **six subsystem models** every tick on the live telemetry:

1. **CylinderHeadML** — thermal stress, overheat risk, cylinder imbalance; redlines are **environment-normalized** (CHT limit shifts by 0.72 °C per ambient °C vs ISA) so a hot desert day never triggers a false thermal alarm by itself.
2. **ExhaustML** — runner balance, combustion efficiency, injector-anomaly risk.
3. **TurboIntakeML** — turbo RPM, boost deviation, wastegate anomaly, compressor stall risk.
4. **CrankcaseML** — dominant frequency, BPFO peak, bearing-fatigue index, piston-slap probability, structural RUL.
5. **OilSumpML** — viscosity index, filter-clogging score, lubrication risk.
6. **PropGearboxML** — torsional anomaly, gear wear/pitting, prop imbalance, slippage risk.

The **decision engine** fuses them: overall Health Index = min(average, weakest subsystem) — the chain is only as strong as its worst link; it picks the primary fault driver, computes confidence, and writes plain-language **diagnosis + recommended action**. Alerts are generated per parameter with evidence text.

**RUL** (`estimateRul` in `model.ts`): Weibull-flavored — base life 26 hr × health, divided by stress (throttle + ambient), derated by fault severity, with a confidence band (point/low/high). **Mission risk** scoring combines RUL margin, thermal margin, vibration trend, lubrication, and anomaly signature into a readiness % + LOW/MEDIUM/HIGH risk.

**MAYDAY** (`mayday.ts`): a pure gate trips on (a) composite health < 30 %, (b) any latched fault flag, or (c) any CRITICAL physical threshold — and drives a visual banner plus a **synthesized wailing siren** (two oscillators swept by an LFO through a band-pass filter, Web Audio API — no audio assets).

### 7.6 The datalink — the answer to "how does telemetry actually get to the control center?"

**The core answer: compact binary frames over WebSocket, 20 Hz, with sequence numbers and CRC-16. CSV is not a transport format — it's a debrief report the ground station generates after flight.** Full protocol details in section 8.4, feature summary here:

- **Frame types:** `0x01` telemetry stream · `0x02` command · `0x03` ACK · `0x04` heartbeat · `0x05` GAP_REQ (store-and-forward) · `0x06` region alert · `0x07` weather sync · `0x08` mission record.
- **Telemetry frame:** 112 B — 14 B header (magic "AZ", version, type, 16-bit seq, f64 epoch-second tx time) + 24×f32 payload (altitude, speed, pitch/roll/heading, throttle, RPM, MAP, CHT1-4, EGT1-4, oil, vibration, health, anomaly, OAT, RUL, lat/lon) + 2 flag bytes (fault bitmap + emergency code) + CRC-16. **~18 kbps** at 20 Hz — well inside even a narrow SATCOM channel.
- **Channel model:** LOS (0 ms, lossless) · SATCOM/Iridium-class (250 ms one-way ±45 ms jitter, 4 % loss) · OUTAGE (100 % drop). The RF behavior is simulated (a browser can't instantiate a radio), but the WebSocket hop is real — flip SATCOM on the sim and the GCS latency readout genuinely jumps.
- **Store-and-forward resilience:** the airborne side keeps a **1200-frame ring (~60 s)** of every transmitted frame. The ground receiver is **ordered**: a frame that jumps ahead reveals a hole; the ground sends `GAP_REQ` upstream; the airborne **bursts the missing window back** — recovered in strict sequence, never duplicated. Holes older than the ring are counted LOST, not silently swallowed. Retries with backoff (2.5 s → 10 s), then fast-forward after 25 s so the live display never freezes.
- **Command downlink:** operator actions (throttle, heading, altitude, rudder, faults, weather) become acknowledged commands — QoS "guaranteed" with **retry ×3**, ACK echoes the origin timestamp so the GCS displays command RTT.
- **Relay + session recorder:** `server/relay.ts` authenticates roles (hello), forwards telemetry to all ground consoles, and **records every binary frame** to `server/recordings/session-*.bin` (length-prefixed, direction-tagged) — the raw flight record that post-flight CSV debriefs are generated from.
- **Latency honesty:** sub-50 ms is the designed LOS/ground-link budget. SATCOM one-way is 220–520 ms by physics — the UI shows measured one-way latency (frame tx timestamp vs local clock), gateway RTT, loss %, seq gaps, and last-frame age, all live.

### 7.7 Mission recorder + animated sortie replay

- **Airborne capture (`sortieRecorder.ts`):** a thin observer on the flight store that *diffs consecutive states* — the 20 Hz tick is never touched. On launch it snapshots the planned route; every waypoint capture is time-stamped against the mission clock; a ~1 Hz sample stream (position + altitude/heading/speed/RPM/EGT/MAP/throttle) is kept for smooth animation. On sortie end (complete / crash / forced landing / recovery / abort) the record is queued.
- **Wire:** queued records drain into a `MISSION_RECORD` (0x08) frame — an occasional debrief frame carrying a length-prefixed JSON payload, still sequenced + CRC-16 (the 20 Hz hot path stays fixed-layout).
- **GCS replay (`SortieReplayPanel`):** the SORTIE REPLAY tab lists received sorties and animates the chosen one: dashed planned route vs. growing emerald flown trail, heading-aligned UAV arrow, ✓ waypoint markers flipping at their recorded capture times, capture chips ("WP-01 SCAN @ 00:21"), play/pause, 1×/4×/8× speed, scrubber, and interpolated telemetry readouts at the playhead.

### 7.8 The GCS command center (`/gcs`) — every tab

| Tab | What it does |
|---|---|
| **FLEET** | Multi-UAV fleet overview |
| **LIVE TWIN** | The 3D engine digital twin (GLB model with live part highlighting, clickable parts, explode studio) + engine alerts + readouts |
| **DIAGNOSTICS** | Explainable fault panel + RUL panel + maintenance advisory |
| **MISSION REPLAY** | Deterministic scripted engine-trace replay (demo of a 4-hr mission trace) |
| **SORTIE REPLAY** | Animated replay of actual recorded sorties from the datalink |
| **REGION LOG** | Region enter/exit timeline with engine-response graphs (MAP/EGT/CHT excursions) |
| **SIMULATION LAB** | What-if: run the standalone AE-P4 model at chosen altitude/throttle/ambient/wear and watch every output + RUL |
| **SENSOR MATRIX** | Analytical sensor redundancy — each channel cross-checked against physics-derived twins |
| **MAINTENANCE** | RUL-based maintenance advisories |
| **REPORTS** | Post-flight analytics (CSV ingest + stats), CSV export of live telemetry |

Always-on chrome:
- **Link bar** — LIVE dot, one-way latency, gateway RTT, loss %, CRC errors, seq gaps, store-and-forward recovery counter, frame-format explainer.
- **Live data band** — 8 big color-coded tiles (ALT / AIRSPEED / HEADING / THROTTLE / CHT max with hot-cylinder tag / EGT / MAP / VIBRATION), each with a plain-language caption ("cooling fault, descend & reduce power"), live heartbeat, packet counters (`PKT @ Hz · AGE · GAPS · REC`), fault-flag line, health/oil/RUL footer.
- **Alert ticker** — region ENTER/EXIT alerts streamed over the link.
- **MAYDAY banner** — red emergency state + siren.
- **Environment panel** — airfield registry, live weather sync, custom station search (OpenWeather geocoding), weather uplink to the aircraft.

The GCS also **re-runs the ML decision engine ground-side** on exactly what arrived over the link — the digital-twin story: same physics + ML model on both ends.

### 7.9 The 3D engine digital twin

The real Rotax-style GLB engine model renders in `EngineCanvas`/`EngineModel`: part highlighting driven by the component-stress indices and ML subsystem health (cool teal → glowing hot red), floating labels, explode/assemble animation (JARVIS studio), part inspector with stress readouts, and audio SFX on explode/assemble. Every live change — CHT, EGT, RPM — maps to the part it belongs to (cylinder heads, exhaust runners, turbo, crankcase, oil system, gearbox), so an operator sees *where* the problem is, not just a number.

### 7.10 The landing page

Cinematic MP4 intro with a seamless handoff into the interactive GLB engine hero, then 13 sections telling the full story: the problem, live monitoring, physics, prediction, explainability, RUL, mission planning, simulation, replay, maintenance, fleet, architecture, finale — with sparklines, what-if controls and the mission replay demo.

### 7.11 Stability engineering worth knowing about

Two real bugs were found and fixed during development:
- **WebGL context loss** in the heavy 3D scene would cascade into an uncaught exception that killed the *entire* `/sim` route (HUD included). Now the canvas intercepts `webglcontextlost` and remounts cleanly (key bump, 4 s cooldown), and the scene sits inside an error boundary so a 3D crash can never take the DOM UI down.
- **The "black screen"**: the TanStack devtools Vite plugin (auto-added in dev) injects `data-tsd-source` attributes into every JSX element; R3F tried to apply them to THREE objects and threw per-frame until the render loop died. Fixed with a tiny Vite transform that strips the attribute before the React transform — dev-only, zero effect on behavior.

---

## 8. The Physics, In Depth

This section explains every equation in the system and — just as important — **what it means and what it's for**. The engine model is a deterministic demonstrator of a representative 4-cylinder turbocharged aero piston engine (the AE-P4), calibrated to the shape of Rotax 914 behavior. It is not a validated OEM model — it is a *faithful shape* of the physics.

### 8.1 The atmosphere (the master input)

**ISA (International Standard Atmosphere) temperature:**
```
ISA temp at altitude = 15 − 0.0019812 × pressure_altitude_ft
```
The standard lapse rate: ~1.98 °C colder per 1,000 ft. This is the baseline every "hot day / cold day" comparison is made against.

**OAT at flight altitude** (with a live weather station):
```
OAT(alt) = ground OAT − 0.0019812 × (alt − station_elevation)
```
The station's ground observation is extrapolated along the ISA lapse. A Leh summer morning (ground OAT 12 °C at 10,682 ft) gives a very different 20,000 ft OAT than Jaisalmer at 778 ft.

**QNH correction:** `pressure_alt = indicated_alt + (1013.25 − QNH) × 30` — low pressure makes the aircraft *higher* than the altimeter says (true altitude vs pressure altitude).

**Density altitude:** `density_alt = pressure_alt + (OAT − ISA) / 0.0019812` — hot days push density altitude up: the airplane performs as if it were thousands of feet higher.

**Air density ratio (the master variable):**
```
σ = ρ/ρ₀ = (1 − 6.8755856e-6 × density_alt) ^ 4.2559      (with live weather)
σ = e^(−altitude / 27000)                                   (legacy biome model)
```
σ = 1.0 at sea level, ~0.40 at 30,000 ft. **Every engine equation below is multiplied by σ in some form** — this is the single most important dependency in the system. Less air = less oxygen per stroke = less power, less cooling, and a harder-working turbo.

### 8.2 The engine thermodynamics

**RPM** — driven by throttle and air:
```
RPM = baseRPM(biome) + throttle × 1600 × (0.86 + 0.14 × σ)
```
More throttle → more RPM; denser air → slightly more RPM (more torque from each stroke). A small deterministic noise term (±15 RPM) makes it look alive without being random.

**MAP — Manifold Absolute Pressure (the turbocharger's report card):**
```
MAP = (18 + throttle × 14 × σ) × (1 − 0.42 × turboFault) × region.pressureDelta
```
At sea level, 65% throttle → ~27 kPa. At 30,000 ft σ ≈ 0.4 → MAP collapses toward ~18 kPa **unless the turbo compensates** (in reality, the wastegate closes, the turbo spins faster, and boost restores MAP — the model captures the *demand*). A LOW PRESSURE TROUGH region multiplies MAP down further — exactly like flying through a real synoptic trough. Turbo failure cuts MAP by 42% — sudden power loss.

**CHT — Cylinder Head Temperature (the structural limit):**
```
CHT = 96 + throttle × 96 + ambientTemp × 0.72 − σ × 12
```
Three heat sources: throttle (combustion heat), ambient (hot air can't cool), and a *cooling* term proportional to air density (thicker air carries heat away — which is why high altitude + high power is the killer combination). Cylinder 2 overheat adds +122 °C on cylinder 2 and +75 °C on cylinder 1 (shared cooling path); the other cylinders stay normal — the signature of a *local* cooling fault, which is how the ML model knows it's not just a hot day.

**EGT — Exhaust Gas Temperature (the mixture gauge):**
```
EGT = 528 + throttle × 236 + ambientTemp × 0.5 (+68 °C injector clog, −40 °C turbo fail)
```
EGT tells you about the fuel-air ratio: high EGT = lean burn. A clogged injector starves its cylinder → that cylinder runs hot → runner imbalance. A dead turbo means less air *and* less fuel burned → EGT drops while power collapses.

**Oil system (the coupled pair):**
```
oilTemp = 68 + throttle × 34 + ambientTemp × 0.5 + overheat × 18
oilPressure = clamp(5.6 − (oilTemp − 90) × 0.012 − overheat × 0.4, 1.6, 6.2) bar
```
Hot oil thins; thin oil loses pressure; low pressure starves bearings. This inverse coupling is exactly what kills engines in the desert — and why the oil models (viscosity index, filter-clogging score) are separate ML subsystems.

**Vibration RMS:**
```
vibration = 0.42 + throttle × 0.36 + 1.88 × bearingFault + turbulence × (0.35 + throttle × 0.45)
```
Baseline rises with RPM. The bearing fault adds a 1.88 m/s² step. Region turbulence (gust layers, dust storms, thermal shear) adds *gust excitation* scaled by throttle — flying through a shear zone at high power is measurably rougher than at cruise.

**FFT spectrum (vibration frequency analysis):**
64 bins spanning 0–630 Hz (~10 Hz/bin). The synthetic spectrum contains:
- **Engine-order harmonics** at ~90, ~180, ~270 Hz — amplitudes grow with throttle (bins 7–9, 15–17, 23–25). These are the *healthy* signature: every reciprocating engine has them.
- **BPFO (Ball Pass Frequency, Outer race) peak at 140 Hz** — injected by the bearing fault. In a real engine, a spalled bearing race produces a pulse every time a ball rolls over the damage; for the Rotax's bearing geometry that works out near 140 Hz. When the fault is on, the bins around 140 Hz bloom from near-zero to 1.6+ — this is the *fingerprint* the CrankcaseML model reads.

**Dynamic pressure & loads:**
```
q = ½ ρ V²        (dynamic pressure, the "feel" of the air)
L = f(bank, pitch, speed)   (directional load vector)
```
These drive the 3D load-field visualization — where the airframe and engine mounts feel the forces during a banked turn at speed.

**Component stress indices** (0–1, per subsystem): cylinders from normalized CHT, exhaust runners from EGT (+ the clogged runner's boost), turbo from throttle + altitude compensation demand + fault, crankcase from vibration + rudder load, oil system from pressure/temperature deviation, gearbox from throttle + speed + rudder. These are what paint the 3D engine twin.

### 8.3 The health & prognostics math

**Health Index** = `min(average of 6 subsystem healths, weakest subsystem health)` — a chain is only as strong as its weakest link, so a single critical subsystem caps the whole engine.

**Anomaly score** accumulates: every fault raises it (overheat +0.001/tick, bearing +0.002/tick, turbo +0.0015/tick); a scenario's cold-progress adds more. It's the "Isolation Forest" stand-in — a single scalar that grows when behavior deviates from expected, consumed by the decision engine's confidence and the MAYDAY gate.

**RUL — Remaining Useful Life** (Weibull-flavored):
```
base = 26 hr × health          (a healthy engine's reserve)
stress = 1 + throttle×0.55 + max(0, ambient−25)/45
RUL = (base / stress) × (1 − 0.55 × fault), clamped 0.4–60 hr
confidence = 0.86 − fault×0.12 − wear×0.08
```
Running hot, hard, and faulty eats RUL three ways at once: less base, more stress, and a bigger derating — and the confidence band widens as the engine degrades (the model is honest about its own uncertainty).

**Environment-normalized redlines:** CHT's warning/critical limits shift by **+0.72 °C per ambient °C above ISA** (and oil's by 0.5 °C/°C). A 185 °C CHT at 40 °C desert ambient is *expected*; the same CHT on an ISA day is a warning. This single trick is what stops climate from generating false alarms — and it is applied consistently in the engine alerts, the MAYDAY gate, and the 3D twin.

### 8.4 The datalink protocol (frame grammar)

```
Header (14 B):  magic "AZ" (u16) | version (u8) | type (u8) | seq (u16) | txSec (f64)
Telemetry (0x01, 112 B):  header + 24 × f32 payload + fault bitmap (u8) + emergency (u8) + CRC-16
Command  (0x02, 21 B):    header + cmdId (u8) + value (f32) + CRC-16
ACK      (0x03, 17 B):    header (echoes cmd seq + orig tx time) + status (u8) + CRC-16
GAP_REQ  (0x05, 20 B):    header + groundSeq (u32) + CRC-16
Region alert (0x06, 42 B): regionId (8 ascii) + severity (u8) + event (u8) + 4 × f32 + CRC-16
Weather sync (0x07, 46 B): valid + biome + code (4 ascii) + 6 × f32 + CRC-16
Mission record (0x08):     header + len (u16) + JSON payload (≤ 60 KB) + CRC-16
```
CRC-16 (CCITT-style, table-driven) covers every byte before the checksum; the receiver verifies before applying. Sequence numbers (16-bit, wrapping) are the backbone of gap detection. The tx timestamp is a **float64 epoch seconds** — no 32-bit wraparound in 2038.

**Why binary beats CSV on the wire:** a telemetry frame decodes in <1 ms with zero text parsing; 112 B × 20 Hz ≈ 18–25 kbps fits comfortably in a narrow SATCOM channel; CSV for the same data is ~40–60 kbps of parser work and text overhead. CRC-16 proves integrity per frame — CSV has no such guarantee.

**Store-and-forward sequencing (the resilience layer):**
- Airborne keeps a ring of the last 1200 frames (~60 s).
- Ground's `OrderedReceiver` applies frames only in order; a jump ahead opens a "hole."
- Ground sends GAP_REQ with its highest applied seq → airborne bursts every buffered frame after that seq (up to 900) → holes close in strict sequence, no duplicates.
- Unanswered holes retry at 2.5 s, 5 s, 7.5 s, 10 s; after 25 s of stall the receiver fast-forwards (frames marked LOST, never silently skipped).
- In OUTAGE the airborne *keeps buffering* — the ground's retry schedule is what eventually drains the ring when the link returns.

**Latency budget (sample → screen):** LOS/ground link ≈ 20–40 ms one-way; Iridium-class SATCOM ≈ 220–520 ms one-way. The GCS bar shows **measured** one-way latency (frame tx timestamp vs local clock — accurate in this demo because both windows share one machine; real deployments need NTP/PTP), gateway RTT via ping/pong, loss % from sequence gaps, CRC errors, and last-frame age.

### 8.5 What affects what — the complete dependency table

| Change | RPM | MAP | CHT | EGT | OilT | OilP | Vibration | Health | RUL |
|---|---|---|---|---|---|---|---|---|---|
| **Throttle ↑** | ↑↑ | ↑↑ | ↑↑ | ↑↑ | ↑↑ | ↓ | ↑↑ | ↓ | ↓↓ |
| **Altitude ↑** | ↓ | ↓↓ | ↓* | ↑ | ↓ | ↑ | — | ↓ | ↓ |
| **Ambient temp ↑** | — | — | ↑ | ↑ | ↑ | ↓ | — | ↓ | ↓ |
| **Region: low pressure** | ↓ | ↓↓ | ↑ | ↑ | ↑ | ↓ | — | ↓ | ↓ |
| **Region: turbulence** | — | — | — | — | — | — | ↑↑ | ↓ | — |
| **Cyl 2 overheat fault** | — | — | ↑↑↑ (c2) | ↑ | ↑↑ | ↓↓ | — | ↓↓ | ↓↓ |
| **Turbo failure** | ↓↓ | ↓↓↓ | — | ↓ | — | — | — | ↓↓ | ↓↓ |
| **Bearing spall** | — | — | — | — | — | — | ↑↑↑ | ↓↓ | ↓↓↓ |
| **Injector clog** | — | — | — | ↑↑ (c3) | — | — | — | ↓ | ↓ |

\* CHT drops slightly with altitude's density cooling, but the ambient cold more than offsets it in the Himalaya — the net effect at high altitude with high power is *rising* CHT, which is the real-world failure mode.

---

## 9. What Problems This Project Solves

### 9.1 Mapped to TAPAS's root causes

| TAPAS root cause | AERIS-TWIN answer |
|---|---|
| Engine too weak at altitude | You can't fix horsepower with software — but you can stop *killing* the engine: the twin shows CHT/EGT/health live as the turbo demand rises, so the operator knows exactly when to throttle back or descend (the same advice the military now wants for TAPAS's successor) |
| Weight spiral | The monitoring stack is a browser + a relay — zero airframe weight in the demo; in production, edge compute is Raspberry-Pi-class (~500 g) vs. the 400 kg the program was overweight |
| No engine health intelligence | 20 Hz CHT/EGT/MAP/oil/vibration with **environment-normalized thresholds** — the system knows 185 °C at 28,000 ft in winter is different from 185 °C at sea level in summer |
| Single point of failure (link loss) | Store-and-forward datalink: a 60 s airborne buffer + gap-recovery means a radio outage doesn't erase telemetry; plus region-aware mission planning and predictive abort guidance |
| No prognostics | RUL in flight hours with confidence bands; mission-risk scoring before launch; maintenance advisories per subsystem |

### 9.2 The operator problems it solves (day to day)

1. **"What does this number mean?"** — every GCS tile carries a plain-language caption; every alert explains *why* and *what to do*.
2. **"Is this normal for this altitude/weather?"** — environment-normalized redlines answer it.
3. **"Which part is failing?"** — the 3D engine twin highlights the exact subsystem; the decision engine names the primary fault driver.
4. **"Should we fly today?"** — mission-risk readiness % + route planner showing which legs cut through dangerous air masses.
5. **"What happened on that sortie?"** — sortie recorder + animated replay + region excursion history + CSV debrief.
6. **"Is the link alive?"** — measured latency, loss, gaps, CRC, and last-frame age, all live, all honest.

---

## 10. ROI — Return on Investment

### 10.1 The cost baseline (why the numbers matter)

- One TAPAS-class prototype costs **tens of crores**; a lost airframe with payload is frequently quoted in the ₹50 crore+ range. The program spent ₹1,786 crore over 8 years and ended with no operational system.
- A Rotax 914 TBO is 1,200 hours; an unscheduled engine failure mid-mission means: lost airframe + lost payload + lost mission + risk on the ground below.

### 10.2 Where the money comes back

| Lever | Mechanism | Magnitude |
|---|---|---|
| **Prevented losses** | Catch the bearing spall / overheat / clog *before* seizure; land or RTB while the engine still runs | One prevented crash ≈ the entire development cost of this project, many times over |
| **Condition-based maintenance** | RUL replaces fixed-interval TBO: engines are overhauled *when the data says so*, not at a calendar date | 15–40 % fewer maintenance man-hours; no premature overhauls on healthy engines |
| **Mission availability** | Predictive abort + region-aware routing keeps aircraft flying instead of recovering | Higher sortie completion rate → the same fleet covers more missions |
| **Fleet-wide learning** | Every sortie's excursion history + debrief CSV builds the baseline for *this* fleet — thresholds self-calibrate per engine serial | Fewer false alarms (operator trust), earlier real alarms (safety) |
| **Operator training** | The fault sandbox + scenario missions train crews on emergencies with zero risk and zero fuel | Replaces hours of costly ground-run time |
| **Deployment cost** | The whole stack runs on commodity laptops + one small relay process; the airborne edge is a lightweight compute module | No exotic hardware in the demo; the incremental production cost is small vs. the asset protected |

### 10.3 A worked example

Consider a 6-aircraft TAPAS-class fleet, 200 flight hours/aircraft/year:

- **Prevented loss:** 1 engine-caused crash avoided every 5 years ≈ ₹10 crore/year average.
- **Maintenance savings:** 25 % of TBO hours deferred on average (RUL says "go") ≈ ₹1.5–3 crore/year in parts + labor.
- **Availability:** +10 % sortie completion (fewer aborts, better routing) ≈ 120 extra mission hours/year fleet-wide — the *product* the forces actually buy.
- **Training:** emergency-scenario sim time replaces ~20 % of live engine run time.

**Conservative annual ROI ≈ 8–15× the running cost of the system** — and the asset protected (a surveillance payload, and the mission itself) is valued far above the engine.

---

## 11. Real-World Deployment Challenges

Being honest about what happens when this leaves the laptop:

1. **The physics model is a shape, not the engine.** Real engines have manufacturing tolerances, serial-specific quirks, and aging. Mitigation: the anomaly model *learns each engine's baseline* from its own flight history (the excursion/debrief data this system already collects), so "book normal" becomes "this engine's normal."
2. **Satellite latency is physics.** Sub-50 ms is only true on LOS/ground links; SATCOM is 220–520 ms one-way. Mitigation: edge processing for critical alerts (the MAYDAY gate runs onboard), interpolation on the ground, store-and-forward for gaps, and honest latency display so operators never *assume* real-time.
3. **Altitude changes everything.** Thresholds must be altitude/weather aware — which is exactly what the environment-normalized redlines do.
4. **Weight budget.** A full avionics rack defeats the purpose. Mitigation: tiny edge module onboard (sensor sampling + alert gate + 18 kbps of telemetry), heavy ML on the ground.
5. **False alarms kill trust.** Mitigation: confidence thresholds, explainable diagnostics (operators see *which* parameters contributed), and environment normalization so climate never cries wolf.
6. **Calibration.** The model must be validated against the actual engine's flight data before RUL can be trusted — the Simulation Lab and CSV debrief pipeline are the calibration loop.
7. **Certification.** DGCA/EASA-class approval requires a validated audit trail: every alert, prediction, and operator action is already logged (region history, sortie records, session recordings, alert audit trail) — the data foundation for certification is being built now.
8. **Time synchronization.** True cross-machine latency needs NTP/PTP; the demo uses same-machine clocks. Documented, understood, fixable.

---

## 12. Future Scope — The Roadmap

**Near term (demo → pilot):**
- **MAVLink 2 / Protobuf codec swap** — replace the hand-rolled codec with a generated schema at the same interface (the protocol was designed so this is a drop-in).
- **Multi-aircraft datalink** — the relay already forwards to all ground consoles; add per-UAV stream IDs and a fleet view with per-aircraft telemetry.
- **Real flight-data ingestion** — parse actual Rotax 914 ECU logs (or an onboard datalogger) through the existing CSV/JSON pipeline to calibrate the twin.
- **Time sync** — NTP/PTP hooks for honest cross-machine latency measurement.

**Mid term (pilot → field):**
- **Onboard edge ML** — port the decision engine to a lightweight embedded target (Raspberry Pi-class or an STM32+npu) so MAYDAY runs with zero link dependency.
- **Real sensors** — CHT thermocouples, EGT probes, accelerometer + FFT, MAP sensor, oil pressure/temp — the synthetic telemetry already matches these channels one-to-one.
- **Cloud deployment** — the relay as an always-on service (Cloudflare Durable Objects / a small Node service), fleet dashboards, role-based access.
- **Weather integration depth** — forecast (not just current) ingestion, so the route planner routes around tomorrow's troughs before takeoff.

**Long term (field → program):**
- **Autonomous mission replanning** — the region-adaptive autopilot grows into full dynamic rerouting from live weather + engine health.
- **Fleet prognostics** — cross-fleet RUL statistics, parts-supply forecasting, Weibull parameter estimation from real failure data.
- **Certification support** — compliance reporting from the audit trail.
- **Airspace integration** — ADS-B / TCAS awareness, deconfliction with manned traffic.
- **The 30,000 ft problem itself** — pairing the twin with a hybrid (turbo + electric) propulsion study: the digital twin becomes the design tool that answers "what engine do we need?" before another ₹1,786 crore program starts.

---

## 13. Why This Is the Best Solution to the Problem Statement

**The problem:** a MALE UAV program that failed partly because nobody could see, understand, or predict what its engine was doing — at altitude, in weather, in the seconds before failure.

**Why this solution wins:**

1. **It's end-to-end and real.** Not a mockup: two browser windows exchange actual binary frames over an actual network hop, with measured latency, real loss behavior, and real gap recovery. The "how does telemetry reach the control center" question is answered by working code, not a slide.
2. **It couples flight and engine.** The engine reacts to *where and how* the UAV flies — altitude, throttle, region weather, turbulence. That coupling is the whole point of a twin, and it's the first thing most demos get wrong.
3. **The intelligence is explainable.** Health Index, RUL, and alerts all say *why* — environment-normalized thresholds, contributing parameters, plain-language recommended actions. Operators can verify the logic, which builds the trust that alarm systems die without.
4. **It handles the ugly parts of reality.** Link outages (store-and-forward), latency (honest measurement + edge-gate design), false alarms (normalization + confidence), mission hazards (region-aware routing), and data honesty (debrief CSV generated ground-side, never a transport format).
5. **It's built for the operator's day.** Planning tools before launch, live tools in flight, debrief tools after — the same platform covers the whole mission lifecycle, including the training sandbox that turns emergency response into muscle memory.
6. **It fails safely and degrades gracefully.** A crashed 3D scene doesn't kill the HUD; a dead link shows NO LINK instead of fake data; a 25-second stall fast-forwards instead of freezing; a lost EXIT alert still finalizes the excursion when the next ENTER arrives.
7. **It's honest about its limits.** Every page carries the disclaimer: values are produced by a deterministic simulation of a representative engine, not validated OEM performance. That honesty is what makes the architecture credible as a *path* to a real system — every synthetic channel maps one-to-one to a real sensor, every frame type to a real datalink design.

**The one-line answer:** AERIS-TWIN is the best solution because it is the *complete* solution — physics, intelligence, transport, and operator tools working together, verified end-to-end, honest about both its capabilities and its limits, and ready to grow into the system that TAPAS BH-201 needed and never had.

---

## 14. Appendix — Quick Reference

### 14.1 Commands

```bash
npm run relay          # ground-station gateway on ws://localhost:3010 (RELAY_PORT to override)
bun run dev:client     # web app (Vite dev server)
bun run build          # tsc && vite build
bun run preview        # serve the production build
npx tsx scripts/e2e_datalink.ts      # rate/CRC/ACK smoke test
npx tsx scripts/e2e_gap_recovery.ts  # suppress 15 frames → assert all recovered
npx tsx scripts/fake_airborne.ts     # headless streaming peer
```

### 14.2 Protocol cheat-sheet

| Type | Name | Direction | Size | Purpose |
|---|---|---|---|---|
| 0x01 | TELEMETRY | air→ground | 112 B | 20 Hz flight+engine snapshot |
| 0x02 | CMD | ground→air | 21 B | throttle/heading/altitude/rudder/fault |
| 0x03 | ACK | air→ground | 17 B | command confirmation + RTT |
| 0x04 | HEARTBEAT | both | JSON | keep-alive, ping/pong |
| 0x05 | GAP_REQ | ground→air | 20 B | store-and-forward replay trigger |
| 0x06 | REGION_ALERT | air→ground | 42 B | region enter/exit + params |
| 0x07 | WEATHER_SYNC | ground→air | 46 B | OpenWeather observation uplink |
| 0x08 | MISSION_RECORD | air→ground | var | completed sortie (JSON payload) |

### 14.3 Design tokens

| Token | Color | Usage |
|---|---|---|
| `--cyan` | oklch(0.82 0.11 200) | primary accent, healthy values, readouts |
| `--amber` | oklch(0.8 0.13 76) | warning / caution |
| `--critical` | oklch(0.63 0.2 25) | danger / fault |
| `--nominal` | oklch(0.78 0.13 158) | healthy / green |

Typography: **Space Grotesk** (headings/labels) + **IBM Plex Mono** (telemetry readouts).

### 14.4 The engine at a glance (Rotax 914 reference)

| Spec | Value |
|---|---|
| Type | Turbocharged flat-4 (horizontally opposed) |
| Displacement | 1,211 cc (79.5 mm bore × 61 mm stroke) |
| Power | 115 HP sea level (marginal at 30,000 ft) |
| Max RPM | 5,500 |
| TBO | 1,200 hours |
| Cooling | Liquid-cooled heads, air-cooled barrels |
| Firing order | 1-3-4-2 |
| BPFO signature | ~140 Hz (bearing fault fingerprint) |

### 14.5 Reading order (if you want to understand the code)

1. `src/features/flight-sim/flightStore.ts` — the heart (physics + missions + regions + autopilot).
2. `src/lib/datalink/protocol.ts` + `codec.ts` — the wire.
3. `src/features/datalink/airborne.ts` + `ground.ts` — the two ends of the link.
4. `src/features/digital-twin/engineMlService.ts` — the intelligence.
5. `src/features/flight-sim/regions.ts` + `regionPilot.ts` + `routePlanner.ts` — the tactical layer.
6. `server/relay.ts` — the gateway.

---

*End of the guide. AERIS-TWIN — Know the engine before it knows it's failing.*
