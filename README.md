# Twin Vision

# AERIS-TWIN — MASTER WEBSITE BUILD PROMPT

Build a premium, cinematic, highly interactive website and web application called **AERIS-TWIN**.

AERIS-TWIN is an AI-enabled real-time Digital Twin platform for health monitoring, fault prediction, Remaining Useful Life estimation, mission-risk assessment, and reliability enhancement of aero piston engines used in MALE UAVs.

This is a serious aerospace/defence engineering product — NOT a generic SaaS website, NOT a generic AI landing page, and NOT a conventional admin dashboard.

The visual quality should feel like a combination of:

* advanced aerospace engineering software

* modern defence technology interface

* digital-twin visualization

* futuristic mission-control system

* premium Apple-style cinematic product storytelling

* Palantir/Anduril-inspired technical sophistication

* scientific instrumentation / flight-deck HUD

* high-end 3D engineering visualization

Use the attached reference image as the primary visual inspiration for the engine visualization, lighting, technical overlays, and overall aerospace atmosphere. Do NOT simply place the reference image on the page. Recreate the visual language as an interactive website.

---

# CORE TECHNOLOGY

Use:

* Next.js

* React

* TypeScript

* Tailwind CSS

* Three.js / React Three Fiber for 3D

* GSAP + ScrollTrigger for cinematic scroll-driven animations

* Motion for smaller UI transitions

* Recharts for telemetry graphs

* Lucide icons

Structure the project cleanly so the landing page can later transition into a functional Ground Control Station.

Use reusable components and feature-based architecture.

Potential structure:

src/

app/

components/

features/

digital-twin/

telemetry/

predictive-maintenance/

mission-replay/

simulation/

fleet/

maintenance/

lib/

domain/

engine/

telemetry/

diagnostics/

The visual experience is the priority, but the code must remain maintainable and extensible.

---

# BRAND

Product name:

AERIS-TWIN

Tagline:

"Understand the engine before it becomes a failure."

Alternative supporting statement:

"An AI-powered digital twin for predictive engine intelligence and mission reliability."

AERIS-TWIN should feel like an actual aerospace technology platform that could eventually be deployed inside a defence-grade Ground Control Station.

Do not overuse the word "AI".

Do not use cheesy phrases such as:

"Revolutionizing the future"

"Next-generation AI"

"Unlock the power of AI"

"Transform your business"

Keep the copy technical, confident, concise and engineering-focused.

---

# GLOBAL VISUAL LANGUAGE

Dark aerospace interface.

Primary background:

deep graphite / near-black.

Use subtle layers of:

* graphite

* charcoal

* dark metallic grey

* muted cyan

* restrained amber

* white/off-white

* red only for critical faults

* green only for healthy states

Avoid excessive neon.

Avoid excessive gradients.

Avoid purple AI aesthetics.

Avoid glassmorphism-heavy SaaS cards.

Avoid giant rounded cards everywhere.

Avoid generic dashboard templates.

Use thin technical borders, subtle grids, engineering markings, telemetry labels, small data annotations and restrained HUD elements.

Typography:

Use a modern geometric display font such as Space Grotesk/Sora for headings.

Use a technical monospace font such as IBM Plex Mono for telemetry, sensor values and system labels.

---

# LANDING PAGE EXPERIENCE

The landing page should feel like a cinematic interactive engineering experience.

The user should feel like they are entering the AERIS-TWIN system rather than reading a marketing website.

The page should progressively tell a story:

PROBLEM

→ DIGITAL TWIN

→ LIVE ENGINE STATE

→ PHYSICS VS REALITY

→ AI PREDICTION

→ EXPLAINABLE DIAGNOSTICS

→ RUL

→ MISSION RISK

→ WHAT-IF SIMULATION

→ MISSION REPLAY

→ GROUND CONTROL STATION

Use smooth scrolling.

Use GSAP ScrollTrigger for major cinematic transitions.

Elements should move with purpose.

Do NOT animate everything simultaneously.

Animation should feel engineered, precise and expensive.

---

# HERO SECTION

Create a full-screen cinematic hero.

The hero should immediately establish that this is aerospace technology.

Central visual:

A slowly rotating, highly detailed 3D aero piston engine.

Prefer a realistic low-poly/high-quality engineering model with:

* four cylinders

* crankcase

* crankshaft

* exhaust

* intake

* oil system

* sensor locations

* mechanical components

The engine should slowly rotate continuously.

The camera should subtly move around it.

Use dramatic but restrained lighting.

The engine should appear suspended in a dark technical environment.

Add a subtle engineering grid behind it.

Add small floating telemetry labels around the engine.

Example:

RPM

4280

CHT

184°C

EGT

731°C

OIL PRESSURE

4.8 BAR

FUEL FLOW

18.4 L/h

VIBRATION

0.82 G

ENGINE HEALTH

96.4%

Do not clutter the engine.

Telemetry should feel like real instrumentation.

Some sensor points should be connected to the engine with thin animated lines.

The lines should slowly pulse.

---

# HERO TEXT

Place a minimal text block on the left or upper-left:

AERIS-TWIN

AI-ENABLED DIGITAL ENGINE INTELLIGENCE

Large heading:

"Know the engine before it knows it's failing."

Supporting text:

"An explainable Digital Twin that combines live telemetry, physics-based engine modelling and AI-driven predictive diagnostics to anticipate degradation before conventional thresholds are crossed."

Primary CTA:

ENTER DIGITAL TWIN

Secondary CTA:

EXPLORE SYSTEM

CTA buttons should look technical and premium, not like generic SaaS buttons.

---

# HERO STATUS BAR

Create a small technical status strip:

TWIN STATUS

● SYNCHRONIZED

TELEMETRY

LIVE

MODEL

AE-P4 / v1.4

DATA QUALITY

98.7%

LATENCY

127 ms

This should subtly update over time.

---

# HERO ANIMATION

On initial load:

1. Black screen.

2. Tiny system grid appears.

3. AERIS-TWIN identifier fades in.

4. Thin telemetry lines begin appearing.

5. Engine slowly materializes.

6. Sensor points activate.

7. Telemetry values appear one by one.

8. "TWIN SYNCHRONIZED" appears.

9. Main headline fades in.

10. CTA becomes active.

The entire sequence should take approximately 2–4 seconds.

Do not make the intro slow or annoying.

Provide a skip/enter interaction if appropriate.

Respect prefers-reduced-motion.

---

# SECTION 01 — THE PROBLEM

Transition from the hero into a dark technical section.

Headline:

"ENGINES DON'T FAIL IN AN INSTANT."

Supporting idea:

"Degradation begins long before a conventional threshold becomes an alarm."

Show a healthy engine telemetry graph.

Initially:

EXPECTED

───────────────

ACTUAL

───────────────

Then progressively introduce a simulated degradation.

The actual signal slowly diverges.

Use scroll position to control the progression.

Show:

NORMAL

→ DEGRADATION

→ ANOMALY

→ PREDICTED FAILURE

At the end of the section display:

"Traditional monitoring reacts to abnormality."

Then:

"AERIS-TWIN detects divergence."

---

# SECTION 02 — DIGITAL TWIN

Create an immersive 3D Digital Twin section.

Show the engine in the centre.

As the user scrolls:

* camera moves closer

* engine rotates

* cylinder components highlight

* sensor nodes appear

* data connections appear

* virtual representation builds around the physical engine

Show a visual transformation:

PHYSICAL ENGINE

↓

LIVE TELEMETRY

↓

PHYSICS MODEL

↓

DIGITAL TWIN

Do this visually, not merely with text.

Use thin animated connections.

---

# INTERACTIVE ENGINE

The 3D engine should be interactive.

Users can:

* rotate it

* slightly zoom

* click/select cylinders

* inspect subsystems

When cylinder 3 is selected:

Show:

CYLINDER 03

CHT

194°C

EGT

782°C

VIBRATION

1.24 G

HEALTH

68%

STATUS

DEGRADING

LIKELY ISSUE

Injector degradation

Highlight cylinder 3 on the model.

Use a subtle amber/cyan highlight.

---

# SECTION 03 — LIVE DIGITAL TWIN

Transition into a live monitoring interface.

Create a sophisticated telemetry dashboard embedded into the landing experience.

Show:

RPM

CHT

EGT

Oil Pressure

Oil Temperature

Fuel Flow

Vibration

Battery Voltage

Alternator Health

Injection Timing

Use animated graphs.

Graphs should move slowly and realistically.

Do not use random chaotic animation.

Simulate deterministic telemetry.

Show a central engine health score:

ENGINE HEALTH

96.4%

Below it:

COMBUSTION

94%

THERMAL

91%

LUBRICATION

97%

VIBRATION

95%

ELECTRICAL

99%

---

# SECTION 04 — PHYSICS VS REALITY

This is one of the most important sections.

Create a dramatic split-screen visualization:

EXPECTED ENGINE BEHAVIOR

versus

OBSERVED ENGINE BEHAVIOR

Show multiple synchronized graphs.

Initially they overlap perfectly.

Then gradually introduce injector degradation.

The observed values begin diverging from the physics model.

Visually show:

EXPECTED

───────────────

OBSERVED

───────────╱───

╱

╱

Then display:

PHYSICS RESIDUAL

+18.4%

ANOMALY SCORE

82%

The engine model should simultaneously reflect the degradation.

Headline:

"When reality begins to diverge, the twin notices."

---

# SECTION 05 — PREDICTIVE INTELLIGENCE

Create a futuristic predictive analytics section.

Show a timeline:

CURRENT

│

├── Sensor deviation

│

├── Physics residual

│

├── AI anomaly detection

│

├── Degradation trajectory

│

└── Predicted failure

Use animated timeline markers.

Show:

EARLY WARNING

47 MIN

BEFORE CONVENTIONAL THRESHOLD

This number is a DEMONSTRATOR SCENARIO and should not be presented as real-world validated performance.

Also show:

FAULT PROBABILITY

87%

MODEL CONFIDENCE

81%

DATA QUALITY

96%

---

# THRESHOLD VS AERIS-TWIN

Create an extremely strong visual comparison.

Left:

CONVENTIONAL MONITORING

Threshold crossed

↓

ALERT

↓

Maintenance

Right:

AERIS-TWIN

Telemetry

↓

Physics residual

↓

Anomaly

↓

Degradation trend

↓

Prediction

↓

Maintenance

Animate both timelines simultaneously.

Make the predictive advantage visually obvious.

---

# SECTION 06 — EXPLAINABLE AI

Create a premium diagnostic interface.

Example:

⚠ INJECTOR DEGRADATION

Probability

87%

Detection lead

47 min

Then:

WHY?

Show contributing factors:

EGT CYLINDER SPREAD

██████████

32%

FUEL FLOW INSTABILITY

████████

24%

VIBRATION SIGNATURE

██████

19%

PHYSICS RESIDUAL

████

11%

Then show a natural-language explanation:

"Cylinder 3 EGT is increasingly deviating from its RPM-adjusted baseline while fuel-flow variability and vibration order peaks are rising."

Make the explanation feel like an engineering diagnostic system, not a chatbot.

---

# SECTION 07 — RUL

Create a beautiful Remaining Useful Life visualization.

Do NOT show false precision.

Display:

REMAINING USEFUL LIFE

42.3 HOURS

Confidence interval:

34.2 — 51.7 HOURS

Confidence:

78%

Data quality:

94%

Model:

AERIS-RUL-01

Animate the degradation curve.

Show how RUL changes when fault severity increases.

---

# SECTION 08 — MISSION INTELLIGENCE

Transition from engine-level monitoring to mission-level decision making.

Show a dark tactical mission map with a UAV flight path.

Do not make it look like a generic Google Maps interface.

Use a schematic mission-planning aesthetic.

Show:

MISSION

MARITIME ISR

ALTITUDE

18,000 FT

AMBIENT

41°C

DURATION

08:00 H

THROTTLE

72%

ENGINE WEAR

31%

Then show:

MISSION READINESS

72%

MEDIUM RISK

Reasons:

LOW THERMAL MARGIN

RISING VIBRATION TREND

RUL MARGIN LIMITED

---

# SECTION 09 — WHAT-IF SIMULATION

Make this one of the most interactive sections.

Headline:

"WHAT IF THE MISSION CHANGES?"

Controls:

ALTITUDE

10,000 → 25,000 FT

AMBIENT TEMPERATURE

20 → 50°C

THROTTLE

20 → 100%

ENGINE WEAR

0 → 100%

MISSION DURATION

1 → 12 HOURS

When values change, dynamically update:

Engine state

CHT

EGT

Oil pressure

Fuel flow

Vibration

Health score

RUL

Mission risk

Show:

BASELINE

RUL

12.4 H

RISK

LOW

Then simulated scenario:

RUL

6.8 H

RISK

HIGH

Use smooth animated transitions.

This section must feel like an actual Digital Twin simulation, not just sliders changing numbers.

---

# SECTION 10 — MISSION REPLAY

Create a mission replay interface.

Show a horizontal timeline:

00:00

│

CRUISE

│

CLIMB

│

LOITER

│

ANOMALY

│

DEGRADATION

│

ALERT

Add fault markers.

Add a play/pause button.

Add a timeline scrubber.

When the user moves through the timeline, update:

RPM

EGT

CHT

Oil pressure

Fuel flow

Vibration

Health

Anomaly score

Show:

FIRST DETECTED

02:17:31

THRESHOLD CROSSED

03:06:44

DETECTION ADVANTAGE

49 MIN 13 SEC

The replay must be deterministic.

---

# SECTION 11 — MAINTENANCE INTELLIGENCE

Show:

PREDICTIVE MAINTENANCE ADVISORY

Fault:

Injector degradation

Severity:

MEDIUM

Recommended action:

Inspect injector system during next maintenance opportunity.

Evidence:

EGT imbalance

Fuel-flow instability

Cylinder imbalance

Vibration trend

Then show a maintenance history timeline.

---

# SECTION 12 — FLEET VIEW

Create a sophisticated fleet-level interface.

Example:

AERIS-TWIN / FLEET

UAV-01

94%

READY

UAV-02

89%

READY

UAV-03

76%

ADVISORY

UAV-04

54%

INSPECTION REQUIRED

UAV-05

91%

READY

Use miniature health indicators.

Show fleet-level insights:

3 engines show increasing lubrication degradation.

2 engines show abnormal vibration trends.

UAV-04 requires inspection before the next endurance mission.

---

# SECTION 13 — ENTER THE GROUND CONTROL STATION

End the cinematic landing page with a powerful transition.

Headline:

"FROM PREDICTION TO DECISION."

CTA:

ENTER AERIS-TWIN GCS

When clicked, transition into the actual application dashboard.

The GCS should retain exactly the same design language.

GCS navigation:

FLEET

LIVE TWIN

DIAGNOSTICS

MISSION REPLAY

SIMULATION LAB

MAINTENANCE

REPORTS

---

# GCS DASHBOARD

Create a functional-looking application shell.

Top bar:

AERIS-TWIN

TWIN STATUS ● LIVE

DATA QUALITY 97%

MODEL v1.4

Left navigation.

Main area:

ENGINE HEALTH

87.4%

RUL

8.7–11.2 H

MISSION RISK

MEDIUM

ACTIVE ADVISORIES

2

Then:

Live engine visualization

Telemetry graphs

Fault predictions

Maintenance recommendations

Mission status

---

# MICRO-INTERACTIONS

Use subtle interactions throughout:

* telemetry numbers smoothly interpolate

* status indicators pulse gently

* sensor nodes activate

* graphs animate into view

* engine hotspots react to selected faults

* buttons have subtle hover/press states

* panels slide/fade intelligently

* timeline markers reveal diagnostic information

* section transitions use depth/parallax

* scrolling changes camera position in 3D

* fault severity changes visual emphasis

Do NOT use excessive bounce animations.

Do NOT make every element fly around.

Animations should feel like aerospace instrumentation.

---

# 3D ENGINE REQUIREMENTS

The engine is a central visual element.

Use Three.js / React Three Fiber.

If a suitable 3D asset is unavailable, create a convincing stylized technical engine model using procedural/basic geometry as a fallback.

Prefer GLTF/GLB architecture so a higher-quality engine model can be substituted later without changing the UI.

Engine behavior:

* slow idle rotation

* interactive orbit

* scroll-controlled camera

* selectable cylinders

* selectable subsystems

* sensor hotspots

* health-based highlighting

* fault visualization

Potential hotspot systems:

CYLINDER

EXHAUST

INTAKE

OIL SYSTEM

FUEL SYSTEM

VIBRATION

ELECTRICAL

The model should NEVER block the main content.

On lower-powered devices, automatically reduce rendering quality.

Provide a non-WebGL fallback visualization.

---

# PERFORMANCE

This must feel extremely smooth.

Target:

60 FPS where possible.

Lazy-load Three.js.

Lazy-load heavy 3D assets.

Use Suspense boundaries.

Do not load enormous assets immediately.

Optimize textures.

Use compressed GLTF where possible.

Reduce particle counts on mobile.

Use CSS/SVG alternatives for decorative effects.

Respect:

prefers-reduced-motion

Provide reduced-motion behavior that keeps the website useful and attractive without continuous animation.

---

# RESPONSIVENESS

Desktop is the primary experience.

But also support:

tablet

mobile

On mobile:

* simplify 3D interactions

* reduce telemetry density

* stack panels

* maintain the cinematic story

* avoid horizontal overflow

* keep CTAs accessible

---

# DATA MODEL

Create deterministic simulated engine telemetry.

Use a representative four-cylinder engine called:

AE-P4

Do NOT claim this represents a specific OEM engine.

Simulated parameters:

rpm

throttle

manifoldPressure

fuelFlow

cht

egt

oilPressure

oilTemperature

vibrationRms

alternatorVoltage

injectorEfficiency

compressionHealth

lubricationHealth

thermalHealth

Fault scenarios:

* injector degradation

* misfire

* compression degradation

* lubrication issue

* sensor drift

* sensor failure

* combustion instability

* overheating

* abnormal vibration

* alternator weakness

The simulation should produce believable correlated sensor behavior.

Faults should progress gradually rather than appearing instantly.

---

# IMPORTANT CREDIBILITY RULES

Do not claim:

"flight certified"

"guaranteed failure prediction"

"100% accurate RUL"

"real-world validated 47-minute prediction"

unless actual validation data is supplied.

Clearly present synthetic/demo data as:

SIMULATION

DEMONSTRATOR

REPRESENTATIVE ENGINE

The website should feel highly credible and technically honest.

---

# CYBERSECURITY / SAFETY

Present AERIS-TWIN as advisory and read-only for the prototype.

Do not imply direct engine control.

Include subtle system architecture messaging:

READ-ONLY ECU INTERFACE

SECURE TELEMETRY

MODEL VERSIONING

AUDIT LOGGING

OFFLINE-FIRST OPERATION

STORE-AND-FORWARD TELEMETRY

---

# VISUAL DETAILS

Use:

subtle scanlines

engineering grids

small coordinate labels

thin data lines

technical tick marks

sensor markers

small system status labels

animated signal traces

subtle noise/grain

minimal particles

depth-based lighting

soft shadows

metallic engine surfaces

restrained cyan highlights

amber warning states

Do not overdo HUD effects.

The design should remain clean and readable.

---

# NAVIGATION

Top navigation:

AERIS-TWIN

SYSTEM

DIGITAL TWIN

PREDICTIVE AI

MISSION

GCS

Right side:

SYSTEM ONLINE ●

Menu should become compact on mobile.

Navigation should smoothly scroll to sections.

---

# FOOTER

Minimal technical footer.

AERIS-TWIN

AI-ENABLED DIGITAL ENGINE INTELLIGENCE

Prototype / Research Demonstrator

Include:

Architecture

Technology

Documentation

GitHub

Contact

Do not make the footer look like a typical startup footer.

---

# DESIGN PRINCIPLE

The most important principle:

THIS WEBSITE SHOULD DEMONSTRATE THE PRODUCT.

Do not merely explain AERIS-TWIN.

Make the website itself behave like AERIS-TWIN.

The engine should react.

The telemetry should change.

The physics model should diverge.

The AI should detect.

The RUL should update.

The mission risk should change.

The simulation should respond.

The replay should work.

The diagnostics should explain themselves.

The user should feel that they are interacting with a living Digital Twin.

---

# FINAL CINEMATIC SEQUENCE

Near the end, create a final visual sequence.

Show the engine.

Show:

HEALTH

87%

RUL

8.7–11.2 H

MISSION RISK

MEDIUM

Then gradually fade the telemetry into the background.

Display:

"THE ENGINE ISN'T A NUMBER."

Then:

"IT'S A SYSTEM."

Then:

"AERIS-TWIN"

"SEE THE DEGRADATION.

UNDERSTAND THE FAILURE.

MAKE THE MISSION DECISION."

CTA:

ENTER DIGITAL TWIN

---

# QUALITY BAR

The final result should look like it was designed by a professional aerospace technology product team.

It should NOT look AI-generated.

Avoid:

* generic gradients

* generic SaaS cards

* stock illustrations

* excessive rounded rectangles

* purple AI imagery

* cheesy marketing copy

* excessive glowing text

* unnecessary animations

* generic dashboard layouts

* fake statistics presented as real

Prioritize:

cinematic storytelling

engineering credibility

3D visualization

data visualization

interaction

performance

precision

clarity

technical sophistication

The first 10 seconds of the website must immediately communicate:

"AERIS-TWIN is an aerospace Digital Twin system."

The first 60 seconds should demonstrate:

"Traditional monitoring reacts. AERIS-TWIN predicts."

The complete experience should leave a hackathon judge thinking:

"This looks like an actual aerospace product, not a student project."

Build the website accordingly.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20afaa53-671a-44ac-83d8-7dde7736d6fb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
