import { Bar, Panel, StatusDot } from "@/components/hud/primitives";

export const FLEET = [
  { id: "UAV-01", health: 94, status: "READY", hours: 412, note: "Nominal" },
  { id: "UAV-02", health: 89, status: "READY", hours: 688, note: "Lubrication trend watch" },
  { id: "UAV-03", health: 76, status: "ADVISORY", hours: 903, note: "Vibration order rise" },
  { id: "UAV-04", health: 54, status: "INSPECTION REQUIRED", hours: 1147, note: "Injector + thermal margin" },
  { id: "UAV-05", health: 91, status: "READY", hours: 233, note: "Nominal" },
] as const;

function tone(h: number) {
  return h > 85 ? "nominal" : h > 70 ? "amber" : "critical";
}

export function FleetPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel label="AERIS-TWIN / FLEET" corner="5 AIRFRAMES">
        <div className="divide-y divide-border">
          {FLEET.map((u) => {
            const t = tone(u.health);
            return (
              <div key={u.id} className="grid grid-cols-[88px_1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-panel-2/40">
                <div className="flex items-center gap-2">
                  <StatusDot tone={t === "nominal" ? "nominal" : t === "amber" ? "warn" : "critical"} />
                  <span className="readout text-xs">{u.id}</span>
                </div>
                <div>
                  <Bar value={u.health} tone={t} />
                  <div className="mt-1 label-xs text-[9px]">{u.note} · {u.hours} H TOTAL</div>
                </div>
                <div className="text-right">
                  <div className="readout text-sm" style={{ color: `var(--${t})` }}>
                    {u.health}%
                  </div>
                  <div className="label-xs text-[9px]">{u.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel label="FLEET-LEVEL INSIGHTS" corner="AGGREGATED">
        <div className="space-y-4 p-4">
          {[
            "3 engines show increasing lubrication degradation.",
            "2 engines show abnormal vibration trends.",
            "UAV-04 requires inspection before the next endurance mission.",
            "Fleet mean composite health has fallen 3.1% over 30 flight hours.",
          ].map((i) => (
            <div key={i} className="flex gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
              <span className="mt-2 h-px w-4 shrink-0 bg-cyan" />
              <p className="text-sm leading-relaxed text-foreground/85">{i}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
