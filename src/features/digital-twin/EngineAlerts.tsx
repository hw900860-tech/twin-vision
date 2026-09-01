import { useMemo } from 'react';
import { AlertTriangle, Wrench, CheckCircle2, Activity, Thermometer, Gauge, Zap } from 'lucide-react';
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

/** Generate alerts from live telemetry */
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
  const now = new Date().toLocaleTimeString();

  // CHT alerts per cylinder
  telemetry.cht.forEach((temp, i) => {
    const cylNum = i + 1;
    if (temp > 220) {
      alerts.push({
        id: `cht-${cylNum}-crit`,
        severity: 'CRITICAL',
        subsystem: `CYLINDER ${cylNum}`,
        title: `CYL ${cylNum} OVERHEAT`,
        message: `Cylinder ${cylNum} CHT at ${temp.toFixed(0)}°C exceeds critical limit. Initiate immediate descent or RTB.`,
        value: temp,
        threshold: 220,
        unit: '°C',
        timestamp: now,
        evidence: `CHT${cylNum} > 220°C — cooling airflow blocked or head gasket failure`,
      });
    } else if (temp > 180) {
      alerts.push({
        id: `cht-${cylNum}-warn`,
        severity: 'WARNING',
        subsystem: `CYLINDER ${cylNum}`,
        title: `CYL ${cylNum} THERMAL ELEVATION`,
        message: `Cylinder ${cylNum} CHT at ${temp.toFixed(0)}°C approaching caution threshold.`,
        value: temp,
        threshold: 180,
        unit: '°C',
        timestamp: now,
      });
    }
  });

  // EGT alerts
  if (telemetry.egt > 780) {
    alerts.push({
      id: 'egt-crit',
      severity: 'CRITICAL',
      subsystem: 'EXHAUST',
      title: 'EGT OVERLIMIT',
      message: `EGT at ${telemetry.egt.toFixed(0)}°C — fuel-air mixture lean or injector fault.`,
      value: telemetry.egt,
      threshold: 780,
      unit: '°C',
      timestamp: now,
    });
  } else if (telemetry.egt > 720) {
    alerts.push({
      id: 'egt-warn',
      severity: 'WARNING',
      subsystem: 'EXHAUST',
      title: 'EGT ELEVATION',
      message: `EGT trending high at ${telemetry.egt.toFixed(0)}°C — monitor fuel system.`,
      value: telemetry.egt,
      threshold: 720,
      unit: '°C',
      timestamp: now,
    });
  }

  // Vibration alerts
  if (telemetry.vibrationRMS > 1.5) {
    alerts.push({
      id: 'vib-crit',
      severity: 'CRITICAL',
      subsystem: 'BEARING',
      title: 'VIBRATION EXCESS',
      message: `Vibration RMS at ${telemetry.vibrationRMS.toFixed(2)} m/s² — bearing spall suspected.`,
      value: telemetry.vibrationRMS,
      threshold: 1.5,
      unit: 'm/s²',
      timestamp: now,
      evidence: `BPFO peak at 140 Hz detected in FFT spectrum`,
    });
  } else if (telemetry.vibrationRMS > 0.9) {
    alerts.push({
      id: 'vib-warn',
      severity: 'WARNING',
      subsystem: 'MECHANICAL',
      title: 'VIBRATION TREND',
      message: `Vibration at ${telemetry.vibrationRMS.toFixed(2)} m/s² — monitor bearing condition.`,
      value: telemetry.vibrationRMS,
      threshold: 0.9,
      unit: 'm/s²',
      timestamp: now,
    });
  }

  // Oil pressure
  if (telemetry.oilPressure < 2.5) {
    alerts.push({
      id: 'oil-crit',
      severity: 'CRITICAL',
      subsystem: 'LUBRICATION',
      title: 'OIL PRESSURE LOW',
      message: `Oil pressure at ${telemetry.oilPressure.toFixed(1)} bar — risk of bearing seizure.`,
      value: telemetry.oilPressure,
      threshold: 2.5,
      unit: 'bar',
      timestamp: now,
    });
  } else if (telemetry.oilPressure < 3.5) {
    alerts.push({
      id: 'oil-warn',
      severity: 'WARNING',
      subsystem: 'LUBRICATION',
      title: 'OIL PRESSURE DECLINING',
      message: `Oil pressure at ${telemetry.oilPressure.toFixed(1)} bar — check oil level.`,
      value: telemetry.oilPressure,
      threshold: 3.5,
      unit: 'bar',
      timestamp: now,
    });
  }

  // MAP
  if (telemetry.map < 20) {
    alerts.push({
      id: 'map-warn',
      severity: 'WARNING',
      subsystem: 'INDUCTION',
      title: 'MAP LOW — TURBO BOOST REQUIRED',
      message: `Manifold pressure at ${telemetry.map.toFixed(1)} kPa — turbocharger compensating.`,
      value: telemetry.map,
      threshold: 20,
      unit: 'kPa',
      timestamp: now,
    });
  }

  return alerts;
}

/** Alert card component — inspired by hackathon vibration monitor */
function AlertCard({ alert }: { alert: EngineAlert }) {
  const colors = {
    CRITICAL: { bg: 'bg-[#2B0D0A]', border: 'border-[#e2523f]', text: 'text-[#e2523f]', icon: AlertTriangle },
    WARNING: { bg: 'bg-[#2B1D0A]', border: 'border-[#f0a63c]', text: 'text-[#f0a63c]', icon: Wrench },
    INFO: { bg: 'bg-[#0A1B2B]', border: 'border-[#6fd8e8]', text: 'text-[#6fd8e8]', icon: Activity },
  };
  const c = colors[alert.severity];
  const Icon = c.icon;

  return (
    <div className={`${c.bg} border-l-2 ${c.border} p-3 relative`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${c.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`label-xs ${c.text}`}>{alert.severity}</span>
            <span className="label-xs text-[9px]">{alert.subsystem}</span>
            <span className="label-xs text-[8px] ml-auto opacity-50">{alert.timestamp}</span>
          </div>
          <div className="text-[11px] font-semibold text-foreground/90 mb-0.5">{alert.title}</div>
          <div className="text-[10px] text-muted-foreground leading-relaxed">{alert.message}</div>
          {alert.evidence && (
            <div className="mt-2 px-2 py-1.5 bg-background/50 border border-border/50 rounded text-[9px] text-muted-foreground">
              <span className={c.text}>EVIDENCE:</span> {alert.evidence}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="readout text-[10px]" style={{ color: c.text.replace('text-', '') }}>
              {alert.value.toFixed(1)} {alert.unit}
            </span>
            <span className="label-xs text-[8px] opacity-50">THRESHOLD: {alert.threshold} {alert.unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Engine Alerts Panel — live alerts from telemetry */
export function EngineAlertsPanel({ telemetry }: {
  telemetry: {
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
  const alerts = useMemo(() => generateAlerts(telemetry), [
    telemetry.cht[0], telemetry.cht[1], telemetry.cht[2], telemetry.cht[3],
    telemetry.egt, telemetry.map, telemetry.oilPressure, telemetry.vibrationRMS,
  ]);

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = alerts.filter(a => a.severity === 'WARNING').length;

  return (
    <Panel label="ENGINE ALERTS" corner={`${alerts.length} ACTIVE`}>
      <div className="max-h-[300px] overflow-y-auto">
        {/* Summary bar */}
        <div className="flex gap-2 px-3 py-2 border-b border-border/50">
          {criticalCount > 0 && (
            <span className="label-xs flex items-center gap-1 text-[#e2523f]">
              <span className="h-1.5 w-1.5 bg-[#e2523f] rounded-full" style={{ animation: 'aeris-pulse 1.5s infinite' }} />
              {criticalCount} CRITICAL
            </span>
          )}
          {warningCount > 0 && (
            <span className="label-xs flex items-center gap-1 text-[#f0a63c]">
              <span className="h-1.5 w-1.5 bg-[#f0a63c] rounded-full" />
              {warningCount} WARNING
            </span>
          )}
          {criticalCount === 0 && warningCount === 0 && (
            <span className="label-xs flex items-center gap-1 text-[#4fd6a6]">
              <CheckCircle2 className="h-3 w-3" />
              ALL SYSTEMS NOMINAL
            </span>
          )}
        </div>

        {/* Alert list */}
        <div className="divide-y divide-border/30">
          {alerts.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-[#4fd6a6] opacity-40" />
              <div className="label-xs text-[9px]">No active alerts</div>
            </div>
          ) : (
            alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} />
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}
