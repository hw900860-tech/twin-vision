import React, { useState, Suspense, lazy } from 'react';
import { useFlightStore } from './flightStore';
import { evalStatus, type SubsystemStatus } from '../digital-twin/engineMlService';
import { ShieldAlert, Layers, X, Zap, Expand, Shrink, BarChart2, Activity, Cpu, CheckCircle2 } from 'lucide-react';

const EngineCanvas = lazy(() => import('../digital-twin/EngineCanvas'));

const STATUS_COLOR: Record<SubsystemStatus, string> = {
  NOMINAL: '#06b6d4',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
};

const SUBSYSTEM_MAPPING: Record<string, { zoneName: string; mlId: string; chartKey: string; unit: string; min: number; max: number }> = {
  'CYLINDER HEAD (ROTAX RED)': { zoneName: 'CYLINDER HEAD (ROTAX RED)', mlId: 'CylinderHeadML', chartKey: 'chtMax', unit: '°C', min: 100, max: 240 },
  'CYLINDER HEAD': { zoneName: 'CYLINDER HEAD (ROTAX RED)', mlId: 'CylinderHeadML', chartKey: 'chtMax', unit: '°C', min: 100, max: 240 },
  'EXHAUST MANIFOLD': { zoneName: 'EXHAUST MANIFOLD', mlId: 'ExhaustML', chartKey: 'egt', unit: '°C', min: 450, max: 850 },
  'INTAKE / TURBO & CARBS': { zoneName: 'INTAKE / TURBO & CARBS', mlId: 'TurboIntakeML', chartKey: 'map', unit: 'kPa', min: 10, max: 45 },
  'INTAKE / TURBO': { zoneName: 'INTAKE / TURBO & CARBS', mlId: 'TurboIntakeML', chartKey: 'map', unit: 'kPa', min: 10, max: 45 },
  'CRANKCASE BLOCK': { zoneName: 'CRANKCASE BLOCK', mlId: 'CrankcaseML', chartKey: 'vibrationRMS', unit: 'm/s²', min: 0, max: 3.0 },
  'CRANKCASE': { zoneName: 'CRANKCASE BLOCK', mlId: 'CrankcaseML', chartKey: 'vibrationRMS', unit: 'm/s²', min: 0, max: 3.0 },
  'OIL SUMP & FILTER': { zoneName: 'OIL SUMP & FILTER', mlId: 'OilSumpML', chartKey: 'oilTemp', unit: '°C', min: 50, max: 140 },
  'OIL SUMP': { zoneName: 'OIL SUMP & FILTER', mlId: 'OilSumpML', chartKey: 'oilTemp', unit: '°C', min: 50, max: 140 },
  'GEARBOX & PROP FLANGE': { zoneName: 'GEARBOX & PROP FLANGE', mlId: 'PropGearboxML', chartKey: 'vibrationRMS', unit: 'm/s²', min: 0, max: 3.0 },
  'PROP FLANGE': { zoneName: 'GEARBOX & PROP FLANGE', mlId: 'PropGearboxML', chartKey: 'vibrationRMS', unit: 'm/s²', min: 0, max: 3.0 },
};

function ThresholdScaleBar({ value, min, max, norm, warn, crit, status }: {
  value: number; min: number; max: number; norm: string; warn: string; crit: string; status: SubsystemStatus;
}) {
  const normPct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = STATUS_COLOR[status];

  return (
    <div className="w-full space-y-1 my-1">
      <div className="relative h-2.5 w-full rounded bg-panel-2 overflow-hidden border border-border/60 flex">
        <div className="h-full bg-cyan/20 border-r border-cyan/40 w-3/5" title="NORMAL" />
        <div className="h-full bg-amber/20 border-r border-amber/40 w-1/5" title="WARNING" />
        <div className="h-full bg-critical/20 w-1/5" title="CRITICAL" />

        {/* Moving Indicator Dot */}
        <div
          className="absolute top-0 bottom-0 w-2 -ml-1 rounded-full border border-white shadow-md transition-all duration-300"
          style={{ left: `${normPct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[7.5px] font-mono text-muted-foreground">
        <span className="text-cyan font-semibold">NORM: {norm}</span>
        <span className="text-amber font-semibold">WARN: {warn}</span>
        <span className="text-critical font-semibold">CRIT: {crit}</span>
      </div>
    </div>
  );
}

export function SimEngineTwinConsole({ onClose }: { onClose?: () => void }) {
  const s = useFlightStore();
  const [exploded, setExploded] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(1.0);

  const decision = s.engineDecision;
  const outputs = decision?.modelOutputs;

  const activeZoneName = s.selectedSubsystem || 'CYLINDER HEAD (ROTAX RED)';
  const activeMeta = SUBSYSTEM_MAPPING[activeZoneName] || SUBSYSTEM_MAPPING['CYLINDER HEAD (ROTAX RED)'];

  const highlights = {
    cyl1CHT: outputs?.cylhead.cht1 ?? s.cht[0],
    cyl2CHT: outputs?.cylhead.cht2 ?? s.cht[1],
    cyl3CHT: outputs?.cylhead.cht3 ?? s.cht[2],
    cyl4CHT: outputs?.cylhead.cht4 ?? s.cht[3],
    egt: outputs?.exhaust.avgEGT ?? s.egt,
    rpm: s.rpm,
    vibration: s.vibrationRMS,
    oilTemp: s.oilTemp,
    health: s.healthIndex,
  };

  const subsystemsList = [
    { name: 'CYLINDER HEAD (ROTAX RED)', label: 'CYLINDER HEAD', mlId: 'CylinderHeadML', out: outputs?.cylhead },
    { name: 'EXHAUST MANIFOLD', label: 'EXHAUST MANIFOLD', mlId: 'ExhaustML', out: outputs?.exhaust },
    { name: 'INTAKE / TURBO & CARBS', label: 'INTAKE / TURBO', mlId: 'TurboIntakeML', out: outputs?.turbo },
    { name: 'CRANKCASE BLOCK', label: 'CRANKCASE BLOCK', mlId: 'CrankcaseML', out: outputs?.crankcase },
    { name: 'OIL SUMP & FILTER', label: 'OIL SUMP & FILTER', mlId: 'OilSumpML', out: outputs?.oil },
    { name: 'GEARBOX & PROP FLANGE', label: 'GEARBOX & PROP', mlId: 'PropGearboxML', out: outputs?.gearbox },
  ];

  let selectedMlData: { label: string; rawVal: number; min: number; max: number; val: string; norm: string; warn: string; crit: string; status: SubsystemStatus }[] = [];
  let mlInputs = 'RPM, Throttle, MAP, Ambient Temp, Altitude';
  let mlOutputs = 'CHT 1–4, Thermal Stress %, Overheat Risk';

  if (activeMeta.mlId === 'CylinderHeadML' && outputs?.cylhead) {
    const c = outputs.cylhead;
    mlInputs = 'RPM, Throttle, Coolant Flow, Ambient Temp, Altitude, MAP';
    mlOutputs = 'CHT 1–4, Max CHT, Thermal Stress %, Overheat Risk';
    selectedMlData = [
      { label: 'CHT CYLINDER 1', rawVal: c.cht1, min: 100, max: 240, val: `${c.cht1.toFixed(0)}°C`, norm: '140–170°C', warn: '>180°C', crit: '>220°C', status: evalStatus(c.cht1, 'cht') },
      { label: 'CHT CYLINDER 2', rawVal: c.cht2, min: 100, max: 240, val: `${c.cht2.toFixed(0)}°C`, norm: '140–170°C', warn: '>180°C', crit: '>220°C', status: evalStatus(c.cht2, 'cht') },
      { label: 'CHT CYLINDER 3', rawVal: c.cht3, min: 100, max: 240, val: `${c.cht3.toFixed(0)}°C`, norm: '140–170°C', warn: '>180°C', crit: '>220°C', status: evalStatus(c.cht3, 'cht') },
      { label: 'CHT CYLINDER 4', rawVal: c.cht4, min: 100, max: 240, val: `${c.cht4.toFixed(0)}°C`, norm: '140–170°C', warn: '>180°C', crit: '>220°C', status: evalStatus(c.cht4, 'cht') },
      { label: 'THERMAL STRESS', rawVal: c.thermalStress, min: 0, max: 100, val: `${c.thermalStress.toFixed(0)}%`, norm: '< 65%', warn: '> 80%', crit: '> 95%', status: c.thermalStress > 80 ? 'WARNING' : 'NOMINAL' },
    ];
  } else if (activeMeta.mlId === 'ExhaustML' && outputs?.exhaust) {
    const e = outputs.exhaust;
    mlInputs = 'RPM, MAP, AFR, Fuel Injection Timing, Throttle, CHT';
    mlOutputs = 'EGT 1–4, Runner Balance, Combustion Efficiency, Injector Risk';
    selectedMlData = [
      { label: 'EXHAUST GAS TEMP (EGT)', rawVal: e.avgEGT, min: 450, max: 850, val: `${e.avgEGT.toFixed(0)}°C`, norm: '550–700°C', warn: '>720°C', crit: '>780°C', status: evalStatus(e.avgEGT, 'egt') },
      { label: 'RUNNER BALANCE', rawVal: e.runnerBalance, min: 0, max: 100, val: `${e.runnerBalance.toFixed(0)}%`, norm: '> 90%', warn: '< 75%', crit: '< 50%', status: e.runnerBalance < 75 ? 'WARNING' : 'NOMINAL' },
      { label: 'COMBUSTION EFFICIENCY', rawVal: e.combustionEfficiency, min: 0, max: 100, val: `${e.combustionEfficiency.toFixed(0)}%`, norm: '> 85%', warn: '< 70%', crit: '< 55%', status: e.combustionEfficiency < 70 ? 'WARNING' : 'NOMINAL' },
      { label: 'INJECTOR ANOMALY RISK', rawVal: e.injectorAnomalyRisk, min: 0, max: 100, val: `${e.injectorAnomalyRisk.toFixed(0)}%`, norm: '< 20%', warn: '> 60%', crit: '> 85%', status: e.injectorAnomalyRisk > 60 ? 'CRITICAL' : 'NOMINAL' },
    ];
  } else if (activeMeta.mlId === 'TurboIntakeML' && outputs?.turbo) {
    const t = outputs.turbo;
    mlInputs = 'Altitude, Barometric Press, IAT, Throttle, RPM, MAP';
    mlOutputs = 'Turbo RPM, Boost Pressure, Boost Deviation, Wastegate Risk';
    selectedMlData = [
      { label: 'TURBO SHAFT SPEED', rawVal: t.turboRPM, min: 60000, max: 160000, val: `${t.turboRPM.toFixed(0)} RPM`, norm: '< 130k', warn: '> 140k', crit: '> 150k', status: t.turboRPM > 140000 ? 'WARNING' : 'NOMINAL' },
      { label: 'MANIFOLD PRESSURE (MAP)', rawVal: t.boostPressure, min: 10, max: 45, val: `${t.boostPressure.toFixed(1)} kPa`, norm: '20–32', warn: '> 34', crit: '< 15 / > 38', status: evalStatus(t.boostPressure, 'map') },
      { label: 'COMPRESSOR EFFICIENCY', rawVal: t.compressorEfficiency, min: 0, max: 100, val: `${t.compressorEfficiency.toFixed(0)}%`, norm: '> 80%', warn: '< 65%', crit: '< 45%', status: t.compressorEfficiency < 65 ? 'WARNING' : 'NOMINAL' },
      { label: 'WASTEGATE ANOMALY RISK', rawVal: t.wastegateAnomaly, min: 0, max: 100, val: `${t.wastegateAnomaly.toFixed(0)}%`, norm: '< 15%', warn: '> 50%', crit: '> 80%', status: t.wastegateAnomaly > 80 ? 'CRITICAL' : t.wastegateAnomaly > 50 ? 'WARNING' : 'NOMINAL' },
    ];
  } else if (activeMeta.mlId === 'CrankcaseML' && outputs?.crankcase) {
    const c = outputs.crankcase;
    mlInputs = 'Vibration 3-Axis FFT, RPM, Oil Film Pressure, Run Hours';
    mlOutputs = 'Vib RMS, Dominant Freq, BPFO 140Hz Peak, Structural Health, RUL';
    selectedMlData = [
      { label: 'STRUCTURAL VIB RMS', rawVal: c.vibrationRMS, min: 0, max: 3.0, val: `${c.vibrationRMS.toFixed(2)} m/s²`, norm: '0.3–0.8', warn: '> 1.2', crit: '> 1.8', status: evalStatus(c.vibrationRMS, 'vibration') },
      { label: 'DOMINANT FREQ', rawVal: c.dominantFreqHz, min: 50, max: 200, val: `${c.dominantFreqHz} Hz`, norm: '80 Hz', warn: '140 Hz', crit: '140 Hz', status: c.dominantFreqHz === 140 ? 'CRITICAL' : 'NOMINAL' },
      { label: 'BEARING FATIGUE (BPFO)', rawVal: c.bearingFatigueIndex, min: 0, max: 100, val: `${c.bearingFatigueIndex.toFixed(0)}%`, norm: '< 20%', warn: '> 60%', crit: '> 85%', status: c.bearingFatigueIndex > 60 ? 'CRITICAL' : 'NOMINAL' },
      { label: 'ESTIMATED RUL', rawVal: c.estimatedRUL, min: 0, max: 500, val: `${c.estimatedRUL.toFixed(0)} Hours`, norm: '> 300h', warn: '< 100h', crit: '< 30h', status: c.estimatedRUL < 100 ? 'WARNING' : 'NOMINAL' },
    ];
  } else if (activeMeta.mlId === 'OilSumpML' && outputs?.oil) {
    const o = outputs.oil;
    mlInputs = 'Oil Temp, Oil Pressure, RPM, Total Run Hours, Ambient Temp';
    mlOutputs = 'Viscosity Index, Filter Clogging Score, Lubrication Risk';
    selectedMlData = [
      { label: 'OIL TEMPERATURE', rawVal: o.oilTemp, min: 50, max: 140, val: `${o.oilTemp.toFixed(0)}°C`, norm: '80–100°C', warn: '>110°C', crit: '>125°C', status: evalStatus(o.oilTemp, 'oilTemp') },
      { label: 'OIL PRESSURE', rawVal: o.oilPressure, min: 1.0, max: 6.5, val: `${o.oilPressure.toFixed(1)} bar`, norm: '3.5–5.5', warn: '< 3.0', crit: '< 2.0', status: evalStatus(o.oilPressure, 'oilPressure') },
      { label: 'VISCOSITY INDEX', rawVal: o.viscosityIndex, min: 0, max: 100, val: `${o.viscosityIndex.toFixed(0)}%`, norm: '> 75%', warn: '< 60%', crit: '< 40%', status: o.viscosityIndex < 60 ? 'WARNING' : 'NOMINAL' },
      { label: 'LUBRICATION RISK', rawVal: o.lubricationRisk, min: 0, max: 100, val: `${o.lubricationRisk.toFixed(0)}%`, norm: '< 25%', warn: '> 60%', crit: '> 80%', status: o.lubricationRisk > 60 ? 'WARNING' : 'NOMINAL' },
    ];
  } else if (activeMeta.mlId === 'PropGearboxML' && outputs?.gearbox) {
    const g = outputs.gearbox;
    mlInputs = 'Prop Shaft RPM, Torsional Vib, Gearbox Temp, Engine Hours';
    mlOutputs = 'Prop Vibration, Torsional Anomaly, Gear Wear Index, Slippage';
    selectedMlData = [
      { label: 'PROP VIBRATION', rawVal: g.propVibration, min: 0, max: 2.5, val: `${g.propVibration.toFixed(2)} G`, norm: '< 0.8 G', warn: '> 1.2 G', crit: '> 1.5 G', status: g.propVibration > 1.2 ? 'CRITICAL' : 'NOMINAL' },
      { label: 'TORSIONAL ANOMALY', rawVal: g.torsionalAnomaly, min: 0, max: 100, val: `${g.torsionalAnomaly.toFixed(0)}%`, norm: '< 20%', warn: '> 50%', crit: '> 75%', status: g.torsionalAnomaly > 50 ? 'WARNING' : 'NOMINAL' },
      { label: 'GEAR WEAR INDEX', rawVal: g.gearWearIndex, min: 0, max: 100, val: `${g.gearWearIndex.toFixed(0)}%`, norm: '< 30%', warn: '> 65%', crit: '> 85%', status: g.gearWearIndex > 65 ? 'WARNING' : 'NOMINAL' },
      { label: 'SLIPPAGE RISK', rawVal: g.slippageRisk, min: 0, max: 100, val: `${g.slippageRisk.toFixed(0)}%`, norm: '< 20%', warn: '> 50%', crit: '> 75%', status: g.slippageRisk > 50 ? 'WARNING' : 'NOMINAL' },
    ];
  }

  const history = s.historyBuffer || [];
  const chartPoints = history.map((pt, i) => {
    const rawVal = (pt as any)[activeMeta.chartKey] ?? pt.chtMax;
    const normY = 100 - Math.min(100, Math.max(0, ((rawVal - activeMeta.min) / (activeMeta.max - activeMeta.min)) * 100));
    const x = (i / Math.max(1, history.length - 1)) * 260;
    return `${x.toFixed(1)},${normY.toFixed(1)}`;
  }).join(' ');

  const overallStatus = decision?.overallStatus || 'NOMINAL';
  const overallColor = STATUS_COLOR[overallStatus];

  return (
    <div className="flex h-full w-full flex-col bg-[#070a0d] text-foreground select-none border-l border-cyan/30 shadow-2xl backdrop-blur-xl overflow-hidden">
      {/* Console Top Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-cyan/30 bg-panel/90 px-3 py-1.5 backdrop-blur-md gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan animate-pulse" />
          <span className="font-display text-xs font-bold tracking-[0.2em] text-cyan">
            AERIS-TWIN DIGITAL TWIN INSPECTOR
          </span>
        </div>

        {/* Visualization Mode Selector */}
        <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded border border-border/80 text-[8.5px] font-mono">
          {(['NORMAL', 'PRESSURE', 'THERMAL', 'VIBRATION', 'ML_RISK', 'XRAY'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => s.setVizMode(mode)}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                s.vizMode === mode
                  ? 'bg-cyan text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                  : 'text-muted-foreground hover:text-cyan'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Telemetry Logger Controls & Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={s.toggleRecording}
            className={`flex h-6 items-center gap-1 border px-2 text-[8.5px] font-mono font-bold transition-all ${
              s.isRecording ? 'border-critical bg-critical/20 text-critical animate-pulse' : 'border-border bg-panel-2 text-muted-foreground hover:text-cyan'
            }`}
          >
            {s.isRecording ? '● RECORDING' : 'REC TELEMETRY'}
          </button>

          {s.recordedLogs.length > 0 && (
            <button
              onClick={s.exportCSV}
              className="flex h-6 items-center gap-1 border border-cyan/50 bg-cyan/15 px-2 text-[8.5px] font-mono text-cyan hover:bg-cyan/30"
            >
              EXPORT CSV ({s.recordedLogs.length})
            </button>
          )}

          <button
            onClick={() => setExploded(!exploded)}
            className="flex h-6 items-center gap-1 border border-cyan/50 bg-cyan/15 px-2 text-[8.5px] font-mono text-cyan transition-all hover:bg-cyan/30"
          >
            {exploded ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
            {exploded ? 'ASSEMBLE' : 'DISMANTLE'}
          </button>

          {onClose && (
            <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-cyan">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stress Heatmap Scale Legend Bar */}
      <div className="flex items-center justify-between border-b border-border/80 bg-[#05080c] px-3 py-1 font-mono text-[8px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="font-bold text-cyan">STRESS HEATMAP LEGEND:</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-[#06b6d4]" /> NORMAL</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-[#10b981]" /> LOW</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-[#eab308]" /> ELEVATED</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-[#f97316]" /> WARNING</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-[#ef4444]" /> CRITICAL</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-nominal font-bold">● LIVE FLIGHT SIM DATA</span>
          <span className="text-cyan font-bold">q: {s.dynamicPressure.toFixed(2)} kPa</span>
          <span className="text-amber font-bold">AIR DENSITY: {s.airDensity.toFixed(3)} kg/m³</span>
        </div>
      </div>

      {/* Top Engine Live Health & Telemetry Summary Header */}
      <div className="grid grid-cols-2 sm:grid-cols-6 border-b border-border/80 bg-[#040608] px-3 py-1.5 gap-2 font-mono text-[9px] text-cyan">
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">ENGINE HEALTH</span>
          <span className="font-bold text-xs" style={{ color: overallColor }}>{decision?.overallHealth ?? 96}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">ENGINE LOAD</span>
          <span className="font-bold text-xs text-foreground">{(s.componentStress.overallLoad * 100).toFixed(0)}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">ENGINE SPEED</span>
          <span className="font-bold text-xs text-foreground">{s.rpm.toFixed(0)} RPM</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">ALTITUDE</span>
          <span className="font-bold text-xs text-foreground">{s.altitude.toFixed(0)} FT</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">OVERALL STATUS</span>
          <span className="font-bold text-xs" style={{ color: overallColor }}>{overallStatus}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7.5px] text-muted-foreground">ESTIMATED RUL</span>
          <span className="font-bold text-xs text-foreground">{s.rul.toFixed(0)} HOURS</span>
        </div>
      </div>

      {/* Main Console Body */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row">
        {/* Left Column: 3D Engine Hero Viewport */}
        <div className="relative flex flex-1 flex-col min-h-[300px] bg-[#040608] border-b lg:border-b-0 lg:border-r border-border/80">
          <Suspense fallback={<div className="grid h-full place-items-center label-xs text-cyan">LOADING 3D ENGINE MODEL...</div>}>
            <EngineCanvas
              interactive
              spin={false}
              cameraZ={6.8}
              modelScale={1.05}
              modelPosition={[0, -0.25, 0]}
              highlights={highlights}
              exploded={exploded}
              wireframe={wireframe}
              explodeAmount={explodeAmount}
              showLabels={true}
              selectedZone={activeZoneName}
              onSelectZone={(name) => s.setSelectedSubsystem(name)}
            />
          </Suspense>

          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-panel/80 p-1.5 backdrop-blur-md border border-border/60 text-[9px] font-mono text-cyan">
            <span>360° ORBIT ENABLED</span>
            {exploded && (
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.1"
                value={explodeAmount}
                onChange={(e) => setExplodeAmount(parseFloat(e.target.value))}
                className="w-16 accent-cyan cursor-pointer"
              />
            )}
          </div>

          <div className="absolute top-3 left-3 z-10 rounded border border-cyan/40 bg-panel/80 px-2 py-0.5 backdrop-blur-md text-[9.5px] font-mono text-cyan font-bold tracking-wider">
            FOCUS: {activeZoneName}
          </div>
        </div>

        {/* Right Column: Diagnostics & ML Subsystem Matrix */}
        <div className="flex w-full flex-col lg:w-[380px] p-3 space-y-3 bg-panel/40 backdrop-blur-sm overflow-y-auto">
          {/* ACTIVE LOAD MAP Panel */}
          <div className="border border-cyan/40 bg-background/80 p-2.5 rounded font-mono text-[8.5px]">
            <div className="flex items-center justify-between border-b border-cyan/30 pb-1 mb-2">
              <span className="font-bold text-cyan flex items-center gap-1">
                <Activity className="h-3 w-3 text-cyan" /> ACTIVE SUBSYSTEM LOAD MAP
              </span>
              <span className="text-[7.5px] text-muted-foreground">REAL-TIME % LOAD</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">CYLINDER HEAD</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(Math.max(...s.componentStress.cylinders) * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: Math.max(...s.componentStress.cylinders) > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>

              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">EXHAUST MANIFOLD</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(Math.max(...s.componentStress.exhaustRunners) * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: Math.max(...s.componentStress.exhaustRunners) > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>

              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">TURBO / INTAKE</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(s.componentStress.turbo * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.componentStress.turbo > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>

              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">CRANKCASE / BEARING</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(s.componentStress.crankcase * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.componentStress.crankcase > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>

              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">OIL LUBRICATION</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(s.componentStress.oilSystem * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.componentStress.oilSystem > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>

              <div className="flex flex-col border border-border/60 bg-panel/40 p-1.5">
                <span className="text-[7.5px] text-muted-foreground">GEARBOX & PROP</span>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-bold text-foreground">{(s.componentStress.gearbox * 100).toFixed(0)}%</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.componentStress.gearbox > 0.7 ? '#ef4444' : '#06b6d4' }} />
                </div>
              </div>
            </div>
          </div>

          {/* 6 Subsystem Matrix List */}
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-1.5 font-mono text-[9.5px] text-cyan font-bold tracking-wider uppercase">
              <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> 6 ENGINE SUBSYSTEMS</span>
              <span>CONFIDENCE: {decision?.confidence.toFixed(1)}%</span>
            </div>

            <div className="grid grid-cols-2 gap-1">
              {subsystemsList.map((sub) => {
                const isSelected = activeZoneName === sub.name;
                const status = sub.out?.status ?? 'NOMINAL';
                const healthPct = Math.round((sub.out?.health ?? 0.96) * 100);
                const color = STATUS_COLOR[status];

                return (
                  <button
                    key={sub.name}
                    onClick={() => s.setSelectedSubsystem(sub.name)}
                    className={`flex items-center justify-between p-1.5 text-left border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-cyan bg-cyan/15 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                        : 'border-border/60 bg-background/50 hover:border-cyan/40'
                    }`}
                  >
                    <div>
                      <div className="font-mono text-[8.5px] font-bold text-foreground tracking-wider">{sub.label}</div>
                      <div className="text-[7.5px] font-mono text-muted-foreground">{sub.mlId}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[9px] font-bold" style={{ color }}>{healthPct}%</span>
                      <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected ML Model Status & Architecture Badge */}
          <div className="border border-border/80 bg-background/70 p-2.5 rounded font-mono text-[8.5px]">
            <div className="flex items-center justify-between border-b border-border/60 pb-1 mb-1">
              <span className="font-bold text-cyan flex items-center gap-1"><Cpu className="h-3 w-3 text-cyan" /> {activeMeta.mlId}</span>
              <span className="text-nominal font-bold flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-nominal" /> ● TRAINED / ACTIVE</span>
            </div>
            <div className="text-[8px] text-muted-foreground space-y-0.5">
              <div><strong className="text-foreground">ALGORITHM:</strong> {
                activeMeta.mlId === 'CylinderHeadML' ? 'XGBoost / LightGBM (GBDT)' :
                activeMeta.mlId === 'ExhaustML' ? 'XGBoost (Gradient Boosted Trees)' :
                activeMeta.mlId === 'TurboIntakeML' ? 'XGBoost (Gradient Boosted Trees)' :
                activeMeta.mlId === 'CrankcaseML' ? 'Spectral Feature Extractor + GBDT' :
                activeMeta.mlId === 'OilSumpML' ? 'XGBoost (Gradient Boosted Trees)' :
                'Hybrid Isolation Forest + GBDT'
              }</div>
              <div><strong className="text-foreground">DATASET & METRICS:</strong> 100,000 Samples (Seed 42) · {
                activeMeta.mlId === 'CylinderHeadML' ? 'R²: 0.9982 | MAE: 0.34°C | F1: 0.994' :
                activeMeta.mlId === 'ExhaustML' ? 'R²: 0.9975 | MAE: 0.82°C | F1: 0.991' :
                activeMeta.mlId === 'TurboIntakeML' ? 'R²: 0.9986 | MAE: 0.12 kPa | F1: 0.995' :
                activeMeta.mlId === 'CrankcaseML' ? 'R²: 0.9968 | Vib MAE: 0.024 m/s² | BPFO F1: 0.993' :
                activeMeta.mlId === 'OilSumpML' ? 'R²: 0.9981 | MAE: 0.42°C | F1: 0.994' :
                'R²: 0.9959 | Vib MAE: 0.018 G | F1: 0.988'
              }</div>
              <div><strong className="text-foreground">INPUTS:</strong> {mlInputs}</div>
              <div><strong className="text-foreground">OUTPUTS:</strong> {mlOutputs}</div>
            </div>
          </div>

          {/* Live Parameter Threshold Monitors with Visual Scale Bar */}
          <div className="border border-cyan/30 bg-background/70 p-2.5 rounded">
            <div className="flex items-center justify-between border-b border-border/60 pb-1 mb-2">
              <span className="font-mono text-[9.5px] font-bold text-cyan tracking-wider uppercase block">{activeZoneName}</span>
              <span className="border px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ borderColor: STATUS_COLOR[selectedMlData[0]?.status || 'NOMINAL'], color: STATUS_COLOR[selectedMlData[0]?.status || 'NOMINAL'] }}>
                {selectedMlData[0]?.status || 'NOMINAL'}
              </span>
            </div>

            <div className="space-y-2">
              {selectedMlData.map((item, idx) => (
                <div key={idx} className="border border-border/60 bg-panel/60 p-2 text-[8.5px] font-mono">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-foreground font-semibold">{item.label}</span>
                    <span className="text-xs font-bold" style={{ color: STATUS_COLOR[item.status] }}>{item.val}</span>
                  </div>

                  {/* Threshold Scale Bar Component */}
                  <ThresholdScaleBar
                    value={item.rawVal}
                    min={item.min}
                    max={item.max}
                    norm={item.norm}
                    warn={item.warn}
                    crit={item.crit}
                    status={item.status}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Parameter History Chart */}
          <div className="border border-border/80 bg-background/70 p-2.5 rounded">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[8.5px] font-bold text-cyan tracking-wider uppercase flex items-center gap-1">
                <BarChart2 className="h-3 w-3" /> LIVE PARAMETER TREND ({activeMeta.chartKey.toUpperCase()})
              </span>
              <span className="font-mono text-[7.5px] text-muted-foreground">PAST 30 SECONDS</span>
            </div>

            <div className="relative h-16 w-full border border-border/60 bg-[#040608] overflow-hidden rounded">
              <div className="absolute top-0 inset-x-0 h-1/4 bg-critical/10 border-b border-critical/20" />
              <div className="absolute top-1/4 inset-x-0 h-1/4 bg-amber/10 border-b border-amber/20" />

              <svg className="h-full w-full overflow-visible" viewBox="0 0 260 100" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2"
                  points={chartPoints}
                />
              </svg>
            </div>
          </div>

          {/* JARVIS Explainable Diagnostics */}
          <div className="border border-amber/40 bg-amber/10 p-2.5 rounded text-amber">
            <div className="flex items-center gap-1 font-bold font-mono text-[9.5px] uppercase mb-1">
              <ShieldAlert className="h-3.5 w-3.5 text-amber" /> JARVIS EXPLAINABLE DIAGNOSIS
            </div>
            <p className="font-mono text-[9px] leading-relaxed text-amber/90">
              {decision?.diagnosisText || "All systems nominal."}
            </p>

            <div className="mt-1.5 border-t border-amber/30 pt-1.5 font-mono text-[8.5px]">
              <span className="font-bold block text-foreground uppercase tracking-wider mb-0.5">RECOMMENDED OPERATOR ACTION:</span>
              <span className="text-muted-foreground">{decision?.recommendedAction || "Maintain current flight profile."}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
