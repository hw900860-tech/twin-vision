import { useState, useMemo, memo } from 'react';
import { AlertTriangle, Wrench, CheckCircle2, Activity, Thermometer, Gauge, ShieldAlert, X } from 'lucide-react';
import { Panel } from '@/components/hud/primitives';

export interface EngineAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  subsystem: string;
  title: string;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  timestamp: string;
  evidence?: string;
}

/** Generate alerts from live telemetry & physics thresholds */
export function generateAlerts(telemetry: {
  cht: number[];
  egt: number;
  map: number;
  oilPressure: number;
  oilTemp: number;
  vibrationRMS: number;
  rpm: number;
  health: number;
}): EngineAlert[] {
  const alerts: EngineAlert[] = [];
  const now = "LIVE STREAM";

  // CHT alerts per cylinder (Nominal: 130-150°C)
  (telemetry.cht || [140, 140, 140, 140]).forEach((temp, i) => {
    const cylNum = i + 1;
    if (temp > 210) {
      alerts.push({
        id: `cht-${cylNum}-crit`,
        severity: 'CRITICAL',
        subsystem: `CYLINDER ${cylNum}`,
        title: `CYL ${cylNum} OVERHEAT (${temp.toFixed(0)}°C)`,
        message: `Cylinder ${cylNum} CHT at ${temp.toFixed(0)}°C exceeds critical limit of 210°C. Initiate immediate throttle reduction.`,
        value: temp,
        threshold: 210,
        unit: '°C',
        timestamp: now,
        evidence: `CHT${cylNum} > 210°C — Thermal breakdown / head stress detected`,
      });
    } else if (temp > 180) {
      alerts.push({
        id: `cht-${cylNum}-warn`,
        severity: 'WARNING',
        subsystem: `CYLINDER ${cylNum}`,
        title: `CYL ${cylNum} THERMAL ELEVATION`,
        message: `Cylinder ${cylNum} CHT at ${temp.toFixed(0)}°C approaching caution limit (180°C).`,
        value: temp,
        threshold: 180,
        unit: '°C',
        timestamp: now,
      });
    }
  });

  // EGT alerts (Nominal: 650-700°C)
  if (telemetry.egt > 770) {
    alerts.push({
      id: 'egt-crit',
      severity: 'CRITICAL',
      subsystem: 'EXHAUST',
      title: `EGT OVERLIMIT (${telemetry.egt.toFixed(0)}°C)`,
      message: `EGT at ${telemetry.egt.toFixed(0)}°C — fuel-air mixture lean or injector clog suspected.`,
      value: telemetry.egt,
      threshold: 770,
      unit: '°C',
      timestamp: now,
      evidence: `EGT > 770°C — Injector flow restriction / runner imbalance`,
    });
  } else if (telemetry.egt > 745) {
    alerts.push({
      id: 'egt-warn',
      severity: 'WARNING',
      subsystem: 'EXHAUST',
      title: 'EGT ELEVATION',
      message: `EGT trending high at ${telemetry.egt.toFixed(0)}°C — monitor exhaust manifold runner temperatures.`,
      value: telemetry.egt,
      threshold: 745,
      unit: '°C',
      timestamp: now,
    });
  }

  // Vibration alerts (Nominal: 0.6-0.9 G)
  if (telemetry.vibrationRMS > 1.6) {
    alerts.push({
      id: 'vib-crit',
      severity: 'CRITICAL',
      subsystem: 'BEARING / CRANKCASE',
      title: `BEARING SPALL FAILURE (${telemetry.vibrationRMS.toFixed(2)} G)`,
      message: `Vibration RMS at ${telemetry.vibrationRMS.toFixed(2)} G exceeds structural threshold (1.6 G). Bearing failure imminent.`,
      value: telemetry.vibrationRMS,
      threshold: 1.6,
      unit: 'G',
      timestamp: now,
      evidence: `BPFO peak at 140 Hz in FFT spectrum — bearing outer race spall`,
    });
  } else if (telemetry.vibrationRMS > 1.15) {
    alerts.push({
      id: 'vib-warn',
      severity: 'WARNING',
      subsystem: 'MECHANICAL',
      title: 'VIBRATION TREND ELEVATED',
      message: `Vibration RMS at ${telemetry.vibrationRMS.toFixed(2)} G — mechanical imbalance or bearing wear detected.`,
      value: telemetry.vibrationRMS,
      threshold: 1.15,
      unit: 'G',
      timestamp: now,
    });
  }

  // Oil pressure (Nominal: 3.5-5.5 bar)
  if (telemetry.oilPressure < 2.0) {
    alerts.push({
      id: 'oil-crit',
      severity: 'CRITICAL',
      subsystem: 'LUBRICATION',
      title: `OIL PRESSURE LOW (${telemetry.oilPressure.toFixed(1)} bar)`,
      message: `Oil pressure at ${telemetry.oilPressure.toFixed(1)} bar — severe risk of bearing seizure.`,
      value: telemetry.oilPressure,
      threshold: 2.0,
      unit: 'bar',
      timestamp: now,
      evidence: `Oil Pressure < 2.0 bar — pump bypass failure or oil leak`,
    });
  } else if (telemetry.oilPressure < 2.8) {
    alerts.push({
      id: 'oil-warn',
      severity: 'WARNING',
      subsystem: 'LUBRICATION',
      title: 'OIL PRESSURE DECLINING',
      message: `Oil pressure at ${telemetry.oilPressure.toFixed(1)} bar — below nominal cruise pressure limit (2.8 bar).`,
      value: telemetry.oilPressure,
      threshold: 2.8,
      unit: 'bar',
      timestamp: now,
    });
  }

  // Oil Temperature (Nominal: 85-100°C)
  if (telemetry.oilTemp > 120) {
    alerts.push({
      id: 'oilt-crit',
      severity: 'CRITICAL',
      subsystem: 'LUBRICATION',
      title: `OIL OVERHEAT (${telemetry.oilTemp.toFixed(0)}°C)`,
      message: `Oil temperature at ${telemetry.oilTemp.toFixed(0)}°C exceeds maximum allowable limit of 120°C.`,
      value: telemetry.oilTemp,
      threshold: 120,
      unit: '°C',
      timestamp: now,
      evidence: `Viscosity degradation imminent`,
    });
  } else if (telemetry.oilTemp > 110) {
    alerts.push({
      id: 'oilt-warn',
      severity: 'WARNING',
      subsystem: 'LUBRICATION',
      title: 'OIL TEMP ELEVATED',
      message: `Oil temperature at ${telemetry.oilTemp.toFixed(0)}°C approaching thermal limit.`,
      value: telemetry.oilTemp,
      threshold: 110,
      unit: '°C',
      timestamp: now,
    });
  }

  // MAP (Manifold Pressure drop — only alert if MAP < 55 at high cruise power > 3500 RPM)
  if (telemetry.map < 55 && telemetry.rpm > 3500) {
    alerts.push({
      id: 'map-warn',
      severity: 'WARNING',
      subsystem: 'INDUCTION / TURBO',
      title: `TURBO BOOST DEGRADATION (${telemetry.map.toFixed(1)} kPa)`,
      message: `Manifold pressure at ${telemetry.map.toFixed(1)} kPa is below expected boost levels for high power.`,
      value: telemetry.map,
      threshold: 55,
      unit: 'kPa',
      timestamp: now,
      evidence: `Wastegate actuator bypass leak / compressor efficiency loss`,
    });
  }

  // Composite Health Index
  if (telemetry.health < 0.55) {
    alerts.push({
      id: 'health-crit',
      severity: 'CRITICAL',
      subsystem: 'FUSION / ML TWIN',
      title: `COMPOSITE HEALTH CRITICAL (${(telemetry.health * 100).toFixed(0)}%)`,
      message: `Overall engine health dropped to ${(telemetry.health * 100).toFixed(0)}%. Predictive mission abort recommended.`,
      value: telemetry.health * 100,
      threshold: 55,
      unit: '%',
      timestamp: now,
      evidence: `Multi-subsystem degradation detected by 6-ML model fusion`,
    });
  }

  return alerts;
}

export interface EngineAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  subsystem: string;
  title: string;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  timestamp: string;
  evidence?: string;
  status?: 'ACTIVE' | 'RESOLVED';
}

/** Memoized Alert card component to eliminate frame flickering */
const AlertCard = memo(function AlertCard({ alert, onDismiss }: { alert: EngineAlert; onDismiss?: () => void }) {
  const isResolved = alert.status === 'RESOLVED';

  const colors = {
    CRITICAL: { bg: isResolved ? 'bg-[#1A0B09]/70' : 'bg-[#2B0D0A]', border: isResolved ? 'border-[#e2523f]/40' : 'border-[#e2523f]', text: 'text-[#e2523f]', icon: AlertTriangle },
    WARNING: { bg: isResolved ? 'bg-[#1A1409]/70' : 'bg-[#2B1D0A]', border: isResolved ? 'border-[#f0a63c]/40' : 'border-[#f0a63c]', text: 'text-[#f0a63c]', icon: Wrench },
    INFO: { bg: isResolved ? 'bg-[#09141F]/70' : 'bg-[#0A1B2B]', border: isResolved ? 'border-[#6fd8e8]/40' : 'border-[#6fd8e8]', text: 'text-[#6fd8e8]', icon: Activity },
  };
  const c = colors[alert.severity];
  const Icon = c.icon;

  return (
    <div className={`${c.bg} border-l-2 ${c.border} p-3 relative group transition-all`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${c.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`label-xs ${c.text} font-bold`}>{alert.severity}</span>
            <span className="label-xs text-[9px] text-muted-foreground">{alert.subsystem}</span>
            {isResolved ? (
              <span className="label-xs text-[8px] px-1 bg-[#4fd6a6]/10 text-[#4fd6a6] border border-[#4fd6a6]/30 font-mono">RESOLVED</span>
            ) : (
              <span className="label-xs text-[8px] px-1 bg-[#e2523f]/20 text-[#e2523f] border border-[#e2523f]/40 font-mono animate-pulse">ACTIVE</span>
            )}
            <span className="label-xs text-[8px] ml-auto opacity-50 font-mono">{alert.timestamp}</span>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-0.5"
                title="Clear alert log entry"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="text-[11px] font-semibold text-foreground/90 mb-0.5">{alert.title}</div>
          <div className="text-[10px] text-muted-foreground leading-relaxed">{alert.message}</div>
          {alert.evidence && (
            <div className="mt-2 px-2 py-1.5 bg-background/60 border border-border/60 rounded text-[9px] text-muted-foreground font-mono">
              <span className={c.text}>EVIDENCE:</span> {alert.evidence}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="readout text-[10px] font-bold" style={{ color: c.text.replace('text-', '') }}>
              {alert.value.toFixed(1)} {alert.unit}
            </span>
            <span className="label-xs text-[8px] opacity-50">THRESHOLD: {alert.threshold} {alert.unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

import { useFlightStore } from '@/features/flight-sim/flightStore';

/** Engine Alerts Panel — persistent latching alert log */
export const EngineAlertsPanel = memo(function EngineAlertsPanel({ telemetry: propTelemetry }: {
  telemetry?: {
    cht: number[];
    egt: number;
    map: number;
    oilPressure: number;
    oilTemp: number;
    vibrationRMS: number;
    rpm: number;
    health: number;
  };
}) {
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [alertStore, setAlertStore] = useState<Map<string, EngineAlert>>(new Map());

  // Subscribe directly to Zustand primitives if prop is not passed
  const storeCht = useFlightStore((s) => s.cht);
  const storeEgt = useFlightStore((s) => s.egt);
  const storeMap = useFlightStore((s) => s.map);
  const storeOilP = useFlightStore((s) => s.oilPressure);
  const storeOilT = useFlightStore((s) => s.oilTemp);
  const storeVib = useFlightStore((s) => s.vibrationRMS);
  const storeRpm = useFlightStore((s) => s.rpm);
  const storeHealth = useFlightStore((s) => s.healthIndex);

  const cht = propTelemetry?.cht ?? storeCht ?? [140, 140, 140, 140];
  const egtVal = propTelemetry?.egt ?? storeEgt ?? 680;
  const mapVal = propTelemetry?.map ?? storeMap ?? 93;
  const oilPVal = propTelemetry?.oilPressure ?? storeOilP ?? 5.2;
  const oilTVal = propTelemetry?.oilTemp ?? storeOilT ?? 95;
  const vibVal = propTelemetry?.vibrationRMS ?? storeVib ?? 0.8;
  const rpmVal = propTelemetry?.rpm ?? storeRpm ?? 2400;
  const healthVal = propTelemetry?.health ?? storeHealth ?? 0.96;

  // Latching Alert Engine: Once an alert is issued, it is latched into state and never removed automatically
  const activeNowList = useMemo(
    () => generateAlerts({ cht, egt: egtVal, map: mapVal, oilPressure: oilPVal, oilTemp: oilTVal, vibrationRMS: vibVal, rpm: rpmVal, health: healthVal }),
    [cht?.[0], cht?.[1], cht?.[2], cht?.[3], egtVal, mapVal, oilPVal, oilTVal, vibVal, healthVal]
  );

  // Sync active triggers into persistent alertStore
  useMemo(() => {
    setAlertStore((prevMap) => {
      const nextMap = new Map(prevMap);
      const activeIds = new Set(activeNowList.map((a) => a.id));

      // Mark existing alerts as RESOLVED if no longer triggering
      nextMap.forEach((alert, id) => {
        if (!activeIds.has(id) && alert.status !== 'RESOLVED') {
          nextMap.set(id, { ...alert, status: 'RESOLVED' });
        }
      });

      // Add or update active alerts
      activeNowList.forEach((alert) => {
        const existing = nextMap.get(alert.id);
        const timestamp = existing?.timestamp || new Date().toLocaleTimeString();
        nextMap.set(alert.id, { ...alert, timestamp, status: 'ACTIVE' });
      });

      return nextMap;
    });
  }, [activeNowList]);

  const allAlerts = useMemo(() => {
    return Array.from(alertStore.values()).filter((a) => !dismissed.has(a.id));
  }, [alertStore, dismissed]);

  const filteredAlerts = useMemo(() => {
    if (filter === 'ALL') return allAlerts;
    return allAlerts.filter((a) => a.severity === filter);
  }, [allAlerts, filter]);

  const criticalCount = allAlerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length;
  const warningCount = allAlerts.filter((a) => a.severity === 'WARNING' && a.status === 'ACTIVE').length;

  function dismissAlert(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  function clearAll() {
    setAlertStore(new Map());
    setDismissed(new Set());
  }

  return (
    <Panel label="LIVE ENGINE ALERTS & ADVISORY LOG" corner={`${allAlerts.length} RECORDED`}>
      <div className="max-h-[360px] flex flex-col">
        {/* Summary & Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border/50 bg-panel/50">
          <div className="flex gap-2 items-center">
            {criticalCount > 0 && (
              <span className="label-xs flex items-center gap-1 text-[#e2523f] font-bold">
                <span className="h-2 w-2 bg-[#e2523f] rounded-full animate-pulse" />
                {criticalCount} CRITICAL
              </span>
            )}
            {warningCount > 0 && (
              <span className="label-xs flex items-center gap-1 text-[#f0a63c] font-bold">
                <span className="h-2 w-2 bg-[#f0a63c] rounded-full" />
                {warningCount} WARNING
              </span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="label-xs flex items-center gap-1 text-[#4fd6a6] font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ALL SUBSYSTEMS NOMINAL
              </span>
            )}
          </div>

          <div className="flex gap-1 items-center">
            {(['ALL', 'CRITICAL', 'WARNING'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 text-[9px] font-mono border transition-colors ${
                  filter === f
                    ? 'border-cyan bg-cyan/20 text-cyan font-bold'
                    : 'border-border text-muted-foreground hover:border-cyan/50'
                }`}
              >
                {f}
              </button>
            ))}
            {allAlerts.length > 0 && (
              <button
                onClick={clearAll}
                className="px-2 py-0.5 text-[9px] font-mono border border-red/40 bg-red/10 text-red-400 hover:bg-red/20"
              >
                CLEAR ALL
              </button>
            )}
          </div>
        </div>

        {/* Alert list */}
        <div className="divide-y divide-border/30 overflow-y-auto max-h-[300px]">
          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-[#4fd6a6] opacity-40" />
              <div className="label-xs text-[10px] text-muted-foreground">
                {allAlerts.length === 0 ? 'No recorded advisories — telemetry parameters operating normally' : `No ${filter} advisories in log`}
              </div>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onDismiss={() => dismissAlert(alert.id)} />
            ))
          )}
        </div>
      </div>
    </Panel>
  );
});

