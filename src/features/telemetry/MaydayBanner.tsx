import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellOff, BellRing, Check, Volume2, VolumeX } from "lucide-react";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { sampleAtmosphere } from "@/lib/domain/engine/environment";
import { evaluateMayday, maydayAudio } from "@/features/telemetry/mayday";

/**
 * Audio-visual MAYDAY alert interface for the GCS.
 *
 * Visual: a flashing red emergency banner pinned to the top of the page on
 * every GCS tab, listing each active cause, so the operator cannot miss a
 * propulsion emergency while heads-down in another view.
 *
 * Audio: the synthesized siren starts the moment the alarm trips — but only
 * after the operator has interacted with the page once (browser autoplay
 * policy). A single ACKNOWLEDGE silences it until the condition clears; the
 * operator can also toggle the alarm channel on/off.
 */
export function MaydayBanner() {
  const healthIndex = useFlightStore((s) => s.healthIndex) ?? 0.96;
  const cht = useFlightStore((s) => s.cht) || [140, 140, 140, 140];
  const egt = useFlightStore((s) => s.egt) ?? 680;
  const map = useFlightStore((s) => s.map) ?? 93;
  const oilPressure = useFlightStore((s) => s.oilPressure) ?? 5.2;
  const oilTemp = useFlightStore((s) => s.oilTemp) ?? 95;
  const vibrationRMS = useFlightStore((s) => s.vibrationRMS) ?? 0.8;
  const rpm = useFlightStore((s) => s.rpm) ?? 2400;
  const faults = useFlightStore((s) => s.faults) || { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false };
  const weather = useFlightStore((s) => s.weather);
  const altitude = useFlightStore((s) => s.altitude) ?? 6000;

  const [armed, setArmed] = useState(maydayAudio.isEnabled); // operator alarm-channel switch
  const [acknowledged, setAcknowledged] = useState(false);

  // Refs mirror the live values so the gesture-unlock handler can start the
  // siren immediately even when the alarm was already tripped.
  const maydayRef = useRef(false);
  const armedRef = useRef(armed);
  const ackRef = useRef(acknowledged);

  const envDeltaC = useMemo(() => {
    if (!weather) return 0;
    try {
      return sampleAtmosphere(altitude, weather).ambientDeltaC;
    } catch {
      return 0;
    }
  }, [weather, altitude]);

  const causes = useMemo(
    () =>
      evaluateMayday({
        health: healthIndex,
        cht,
        egt,
        map,
        oilPressure,
        oilTemp,
        vibrationRMS,
        rpm,
        faults,
        ...(envDeltaC !== 0 ? { envDeltaC } : {}),
      }),
    [healthIndex, cht, egt, map, oilPressure, oilTemp, vibrationRMS, rpm, faults, envDeltaC],
  );

  const mayday = causes.length > 0;

  maydayRef.current = mayday;
  armedRef.current = armed;
  ackRef.current = acknowledged;

  // Unlock audio on the first user gesture anywhere (autoplay policy) and, if
  // an emergency is already active, start the siren right away.
  useEffect(() => {
    const unlock = () => {
      void maydayAudio.unlock().then(() => {
        if (maydayRef.current && armedRef.current && !ackRef.current) maydayAudio.sound();
      });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Drive the siren from the alarm state.
  useEffect(() => {
    if (mayday && armed && !acknowledged) {
      maydayAudio.sound();
    } else {
      maydayAudio.silence();
    }
    if (!mayday) {
      setAcknowledged(false);
    }
  }, [mayday, armed, acknowledged]);

  // Leave the audio graph pristine when the host unmounts.
  useEffect(() => {
    return () => {
      maydayAudio.silence();
    };
  }, []);

  if (!mayday) return null;

  const toggleArmed = () => {
    const next = !armed;
    setArmed(next);
    maydayAudio.setEnabled(next);
    if (next) {
      void maydayAudio.unlock().then(() => {
        if (maydayRef.current && ackRef.current === false) maydayAudio.sound();
      });
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed left-1/2 top-2 z-[70] w-max max-w-[94vw] -translate-x-1/2"
      style={{ animation: "aeris-mayday-flash 1.1s ease-in-out infinite, aeris-mayday-halo 0.8s ease-in-out infinite" }}
    >
      <div className="border border-critical bg-[#18090a]/95 shadow-[0_0_40px_rgba(226,82,63,0.45)]">
        <div className="flex items-stretch">
          <div className="flex items-center gap-2 border-r border-critical/60 px-3 py-2.5">
            <AlertTriangle className="h-5 w-5 text-critical" />
            <span className="font-mono text-sm font-black tracking-[0.3em] text-critical">MAYDAY</span>
          </div>
          <div className="flex min-w-0 flex-col justify-center px-4 py-2">
            <div className="label-xs font-bold text-critical">PROPULSION EMERGENCY — {causes.length} ACTIVE CAUSE{causes.length === 1 ? "" : "S"}</div>
            <ul className="mt-1 flex max-w-[560px] flex-wrap gap-x-4 gap-y-0.5">
              {causes.map((c) => (
                <li key={c.id} className="truncate font-mono text-[10px] font-semibold text-foreground/90" title={c.detail}>
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-critical align-middle" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-1.5 border-l border-critical/60 px-2.5">
            <button
              onClick={toggleArmed}
              aria-pressed={armed}
              title={armed ? "Alarm channel on — click to mute" : "Alarm channel off — click to enable"}
              className={`flex h-8 items-center gap-1.5 border px-2.5 font-mono text-[9px] font-bold tracking-wider transition-colors ${
                armed ? "border-critical/70 bg-critical/25 text-critical" : "border-border bg-background/60 text-muted-foreground hover:border-critical/50 hover:text-critical"
              }`}
            >
              {armed ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {armed ? "ALARM ON" : "ALARM OFF"}
            </button>
            <button
              onClick={() => {
                setAcknowledged(true);
                maydayAudio.silence();
              }}
              className="flex h-8 items-center gap-1.5 border border-critical bg-critical/20 px-3 font-mono text-[9px] font-bold tracking-wider text-critical transition-colors hover:bg-critical/40"
            >
              <Check className="h-3.5 w-3.5" />
              ACK
            </button>
          </div>
        </div>
        {acknowledged && (
          <div className="flex items-center gap-1.5 border-t border-critical/50 px-3 py-1 font-mono text-[8.5px] tracking-wider text-muted-foreground">
            <BellOff className="h-3 w-3 text-critical" />
            ACKNOWLEDGED — SIREN SILENCED UNTIL THE EMERGENCY CLEARS OR NEW CAUSES ARISE
            {!armed && (
              <span className="ml-auto flex items-center gap-1 text-amber">
                <BellRing className="h-3 w-3" /> ALARM CHANNEL DISABLED — RE-ENABLE TO RESTORE SOUND
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
