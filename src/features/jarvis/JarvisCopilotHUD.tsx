import { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  X,
  Sparkles,
  Zap,
  Activity,
  Layers,
  ChevronDown,
  RotateCcw,
  Compass,
  Radio,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { useJarvisStore } from "./jarvisStore";
import { useFlightStore } from "@/features/flight-sim/flightStore";

const QUICK_PROMPTS = [
  "Why is the engine health dropping?",
  "What am I looking at right now?",
  "What changed in the last 30 seconds?",
  "Is the high temperature because of altitude?",
  "Take me to predictive diagnostics and explain RUL",
  "Open Live Engine and inspect Cylinder Head",
  "What happens next if this continues?",
];

export function JarvisCopilotHUD() {
  const {
    isOpen,
    isListening,
    isSpeaking,
    isThinking,
    voiceEnabled,
    wakeWordEnabled,
    isWakeWordActive,
    transcriptInput,
    messages,
    activeGcsTab,
    setIsOpen,
    toggleOpen,
    setVoiceEnabled,
    toggleWakeWord,
    initWakeWord,
    setTranscriptInput,
    startListening,
    stopListening,
    stopSpeaking,
    submitQuery,
    clearHistory,
  } = useJarvisStore();

  const [inputVal, setInputVal] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Wake Word listener ("Jarvis")
  useEffect(() => {
    if (wakeWordEnabled && !isWakeWordActive) {
      initWakeWord();
    }
  }, [wakeWordEnabled, isWakeWordActive, initWakeWord]);

  // Live telemetry summary for HUD header
  const health = useFlightStore((s) => s.healthIndex);
  const alt = useFlightStore((s) => s.altitude);
  const rpm = useFlightStore((s) => s.rpm);
  const cht = useFlightStore((s) => s.cht);
  const chtMax = cht && cht.length > 0 ? Math.max(...cht) : 140;
  const vib = useFlightStore((s) => s.vibrationRMS);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isThinking]);

  // Sync interim voice transcript into local input
  useEffect(() => {
    if (transcriptInput) {
      setInputVal(transcriptInput);
    }
  }, [transcriptInput]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputVal.trim() || isThinking) return;
    const q = inputVal.trim();
    setInputVal("");
    submitQuery(q);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputVal("");
    submitQuery(prompt);
  };

  return (
    <>
      {/* Minimized Floating Tactical Widget */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 select-none animate-in fade-in duration-300">
          <button
            onClick={toggleOpen}
            className="group relative flex items-center gap-3 border border-cyan/50 bg-[#070b0e]/95 px-4 py-2.5 rounded-full shadow-[0_0_25px_rgba(111,216,232,0.25)] backdrop-blur-md transition-all hover:border-cyan hover:shadow-[0_0_35px_rgba(111,216,232,0.4)] cursor-pointer"
            aria-label="Open JARVIS Voice Copilot"
          >
            {/* Glowing Pulsing Core */}
            <div className="relative flex h-5 w-5 items-center justify-center">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                  isSpeaking
                    ? "bg-cyan"
                    : isThinking
                    ? "bg-amber"
                    : isListening
                    ? "bg-emerald-400"
                    : "bg-cyan/40"
                }`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  isSpeaking
                    ? "bg-cyan"
                    : isThinking
                    ? "bg-amber"
                    : isListening
                    ? "bg-emerald-400"
                    : "bg-cyan"
                }`}
              />
            </div>

            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] text-cyan">
                <span>J.A.R.V.I.S.</span>
                <span className="text-[9px] font-mono opacity-60">AI COPILOT</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                {isThinking ? (
                  <span className="text-amber animate-pulse">ANALYZING ENGINE DATA…</span>
                ) : isSpeaking ? (
                  <span className="text-cyan animate-pulse">TRANSMITTING VOICE…</span>
                ) : isListening ? (
                  <span className="text-emerald-400 animate-pulse">LISTENING…</span>
                ) : wakeWordEnabled ? (
                  <span className="text-emerald-400/90 flex items-center gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    SAY "JARVIS" · ONLINE
                  </span>
                ) : (
                  <span>ACTIVE · CLICK TO COMMAND</span>
                )}
              </div>
            </div>

            <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-cyan/10 text-cyan group-hover:bg-cyan/20">
              <Zap className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Quick Mic Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isListening) {
                stopListening();
              } else {
                setIsOpen(true);
                startListening();
              }
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all cursor-pointer ${
              isListening
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 animate-pulse"
                : "border-cyan/50 bg-[#070b0e]/95 text-cyan hover:border-cyan hover:bg-cyan/20"
            }`}
            title="Toggle Voice Input (Push to Talk)"
            aria-label="Toggle Voice Input"
          >
            {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 opacity-70" />}
          </button>
        </div>
      )}

      {/* Expanded Aerospace Command Console */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[620px] max-h-[92vh] w-[460px] max-w-[95vw] flex-col overflow-hidden rounded-lg border border-cyan/50 bg-[#06090d]/98 text-foreground shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(111,216,232,0.2)] backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 select-none">
          {/* Header Bar */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-cyan/30 bg-panel/90 px-4">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-3 w-3 items-center justify-center">
                <span
                  className={`absolute h-full w-full rounded-full opacity-75 animate-ping ${
                    isSpeaking
                      ? "bg-cyan"
                      : isThinking
                      ? "bg-amber"
                      : isListening
                      ? "bg-emerald-400"
                      : "bg-cyan/40"
                  }`}
                />
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSpeaking
                      ? "bg-cyan"
                      : isThinking
                      ? "bg-amber"
                      : isListening
                      ? "bg-emerald-400"
                      : "bg-cyan"
                  }`}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold tracking-[0.25em] text-cyan">
                  J.A.R.V.I.S. // TACTICAL COPILOT
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  DIGITAL ENGINE INTELLIGENCE · GEMINI-3.6-FLASH
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Wake Word Hands-free toggle */}
              <button
                onClick={toggleWakeWord}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border transition-all ${
                  wakeWordEnabled
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                    : "border-border/50 text-muted-foreground hover:bg-panel-2"
                }`}
                title={
                  wakeWordEnabled
                    ? "Hands-free Wake Word ACTIVE: Call 'Jarvis' anytime"
                    : "Hands-free Wake Word PAUSED: Click to enable"
                }
              >
                <Radio className={`h-3 w-3 ${wakeWordEnabled ? "text-emerald-400 animate-pulse" : ""}`} />
                <span>{wakeWordEnabled ? 'WAKE: "JARVIS"' : "WAKE: OFF"}</span>
              </button>

              {/* Voice toggle */}
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`p-1.5 rounded transition-colors ${
                  voiceEnabled ? "text-cyan hover:bg-cyan/10" : "text-muted-foreground hover:bg-panel-2"
                }`}
                title={voiceEnabled ? "Voice Output Active" : "Voice Output Muted"}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>

              {/* Clear history */}
              <button
                onClick={clearHistory}
                className="p-1.5 text-muted-foreground hover:text-cyan hover:bg-cyan/10 rounded transition-colors"
                title="Clear Context"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              {/* Minimize / Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-panel-2 rounded transition-colors cursor-pointer"
                title="Minimize Console"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Live Telemetry Context Ticker */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-[#090e13] px-3 py-1.5 text-[10px] font-mono">
            <div className="flex items-center gap-2 text-cyan">
              <Activity className="h-3 w-3" />
              <span>GCS: {activeGcsTab}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>ALT: {(alt || 0).toFixed(0)} FT</span>
              <span>RPM: {(rpm || 0).toFixed(0)}</span>
              <span className={health < 0.7 ? "text-amber font-bold" : "text-cyan"}>
                HEALTH: {((health || 1) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Audio Reactive Visualizer Ribbon */}
          <div className="flex h-5 shrink-0 items-center justify-center gap-1 bg-[#040608] px-4 border-b border-border/40 overflow-hidden">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full ${
                  isSpeaking
                    ? "bg-cyan jarvis-wave-active"
                    : isListening
                    ? "bg-emerald-400 jarvis-wave-active"
                    : isThinking
                    ? "bg-amber animate-pulse"
                    : "bg-cyan/20 h-[3px]"
                }`}
                style={{
                  animationDelay: isSpeaking || isListening ? `${(i * 0.03).toFixed(2)}s` : undefined,
                  height: !isSpeaking && !isListening && !isThinking ? "3px" : undefined,
                }}
              />
            ))}
          </div>

          {/* Conversation Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs scrollbar-thin">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Message Header */}
                <div className="mb-1 flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                  {m.role === "jarvis" ? (
                    <>
                      <span className="font-bold text-cyan">JARVIS</span>
                      {m.intent && (
                        <span className="rounded border border-cyan/40 bg-cyan/10 px-1 py-0.2 text-[8px] text-cyan">
                          {m.intent}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>OPERATOR</span>
                  )}
                  <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[92%] rounded-md p-3 leading-relaxed shadow ${
                    m.role === "user"
                      ? "border border-cyan/40 bg-cyan/10 text-cyan-50 font-mono text-[11px]"
                      : "border border-border/80 bg-[#090e13]/90 text-foreground/90 font-sans"
                  }`}
                >
                  {/* Spoken subtitle highlight */}
                  {m.spokenText && m.role === "jarvis" && (
                    <div className="mb-2 pb-2 border-b border-border/60 text-[11px] font-medium text-cyan flex items-start gap-1.5">
                      <Radio className="h-3 w-3 mt-0.5 shrink-0 text-cyan animate-pulse" />
                      <span>{m.spokenText}</span>
                    </div>
                  )}

                  {/* Body text with simple markdown parsing */}
                  <div className="whitespace-pre-wrap leading-relaxed text-[11px]">
                    {m.content}
                  </div>

                  {/* Executed Actions Badge */}
                  {m.actionsExecuted && m.actionsExecuted.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1">
                      <div className="text-[9px] font-mono text-muted-foreground uppercase">ACTIONS EXECUTED:</div>
                      {m.actionsExecuted.map((act, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded"
                        >
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>{act}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex flex-col items-start animate-pulse">
                <div className="text-[9px] font-mono text-cyan mb-1">JARVIS // SYNTHESIZING STATE</div>
                <div className="border border-cyan/40 bg-cyan/5 p-3 rounded-md text-[11px] font-mono text-cyan flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  Reasoning across live telemetry, ML residuals & environmental data…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick-Action Chips */}
          <div className="shrink-0 border-t border-border/60 bg-[#070b0e] p-2 overflow-x-auto">
            <div className="flex gap-1.5 whitespace-nowrap">
              {QUICK_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(p)}
                  className="rounded border border-border/70 bg-panel/70 px-2.5 py-1 text-[9px] font-mono text-muted-foreground transition-all hover:border-cyan/50 hover:bg-cyan/10 hover:text-cyan cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input & Voice Bar */}
          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 items-center gap-2 border-t border-cyan/30 bg-[#090e13] p-2.5"
          >
            {/* Tactical Mic Button */}
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  stopListening();
                } else {
                  startListening();
                }
              }}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border transition-all cursor-pointer ${
                isListening
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 animate-pulse"
                  : "border-cyan/50 bg-cyan/10 text-cyan hover:border-cyan hover:bg-cyan/20"
              }`}
              title={isListening ? "Listening... click to stop" : "Click to speak"}
            >
              {isListening ? <Mic className="h-4 w-4" /> : <Mic className="h-4 w-4 opacity-80" />}
            </button>

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={isListening ? "Listening to your voice…" : "Ask JARVIS or give engine command…"}
              className="flex-1 bg-[#040608] border border-border px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 rounded focus:border-cyan focus:outline-none"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputVal.trim() || isThinking}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-cyan/50 bg-cyan/10 text-cyan transition-all hover:bg-cyan/30 hover:border-cyan disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              title="Transmit query"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
