/**
 * Audio subsystem for JARVIS:
 * - High-tech tactical Web Audio chimes
 * - Web Speech API Speech-to-Text (Microphone)
 * - Web Speech API Text-to-Speech (JARVIS Voice)
 */

import { JARVIS_CONFIG } from "./jarvisConfig";

// --- Tactical Sound FX Synthesizer ---
class JarvisAudioSynthesizer {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      this.ctx = new AC();
    }
  }

  playChime(type: "activate" | "deactivate" | "ack" | "alert" | "thinking") {
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === "activate") {
        // High-tech ascending two-tone
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12); // D6
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (type === "deactivate") {
        // Descending settle tone
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.23);
      } else if (type === "ack") {
        // Crisp dual harmonic ping
        osc.type = "triangle";
        osc.frequency.setValueAtTime(987.77, now); // B5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === "alert") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.linearRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.21);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

export const jarvisAudio = new JarvisAudioSynthesizer();

// --- Speech Recognition (STT) ---
export interface SpeechRecognitionHandlers {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export class JarvisSpeechRecognizer {
  private recognition: any = null;
  private isListening = false;
  private silenceTimer: any = null;

  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  start(handlers: SpeechRecognitionHandlers) {
    if (!this.isSupported() || this.isListening) return;

    this.stop();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        this.isListening = true;
        jarvisAudio.playChime("activate");
        handlers.onStart?.();
      };

      rec.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript && finalTranscript.trim().length > 1) {
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
          handlers.onResult?.(finalTranscript.trim(), true);
          return;
        }

        if (interimTranscript) {
          handlers.onResult?.(interimTranscript, false);

          // Fast auto-commit: If user pauses speech for 750ms, auto-commit as final
          if (this.silenceTimer) clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (this.isListening && interimTranscript.trim().length > 1) {
              this.silenceTimer = null;
              handlers.onResult?.(interimTranscript.trim(), true);
            }
          }, 750);
        }
      };

      rec.onerror = (event: any) => {
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.isListening = false;
        // no-speech or aborted are benign timeouts in Chromium
        if (event.error === "no-speech" || event.error === "aborted") {
          handlers.onEnd?.();
        } else {
          handlers.onError?.(event.error || "Speech recognition error");
        }
      };

      rec.onend = () => {
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.isListening = false;
        jarvisAudio.playChime("deactivate");
        handlers.onEnd?.();
      };

      this.recognition = rec;
      rec.start();
    } catch (e) {
      console.warn("Speech recognition start failed:", e);
      this.isListening = false;
      handlers.onError?.("Speech recognition initialization error");
    }
  }

  stop() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    this.isListening = false;
  }
}

// --- Text to Speech (TTS) ---
// Global set to prevent V8 Garbage Collector from destroying active SpeechSynthesisUtterance objects (Chrome bug workaround)
const activeUtterances = new Set<SpeechSynthesisUtterance>();

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const loadVoices = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch {}
  };
  loadVoices();
  if ("onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

export class JarvisSpeechSynthesizer {
<<<<<<< Updated upstream
  private activeToken = 0;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private speakTimeout: any = null;
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.cachedVoice = null;
          this.resolveVoice();
        };
      }
      if ("BroadcastChannel" in window) {
        try {
          this.channel = new BroadcastChannel("aeris_jarvis_speech_channel");
          this.channel.onmessage = (e) => {
            if (e.data?.type === "SILENCE_SPEECH") {
              // Another tab started speaking, stop this tab immediately
              this.stop(false);
            }
          };
        } catch {}
      }
    }
  }
=======
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private resumeInterval: any = null;
>>>>>>> Stashed changes

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  speak(
    text: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ) {
    if (!this.isSupported()) {
      options?.onEnd?.();
      return;
    }

    // Immediately cancel previous utterance and increment token to invalidate stale callbacks
    this.stop(true);
    const token = ++this.activeToken;

    // Ensure Chrome SpeechSynthesis engine is resumed & unpaused
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel();
    } catch {}

    // Clean markdown symbols from spoken text
    const cleanText = text
      .replace(/[*_#`~[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .trim();

    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    // Broadcast silence to any other tabs
    try {
      this.channel?.postMessage({ type: "SILENCE_SPEECH" });
    } catch {}

<<<<<<< Updated upstream
    // 40ms micro-delay gives Chromium audio thread time to settle cancel() before queuing
    this.speakTimeout = setTimeout(() => {
      if (this.activeToken !== token) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = JARVIS_CONFIG.speechRate;
      utterance.pitch = JARVIS_CONFIG.speechPitch;

      const preferredVoice = this.resolveVoice();
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        if (this.activeToken !== token) return;
        options?.onStart?.();
      };

      utterance.onend = () => {
        if (this.activeToken !== token) return;
        this.activeToken = 0;
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        if (this.activeToken !== token) return;
        // Do not propagate intentional cancellations or interrupts
        if (e.error === "canceled" || e.error === "interrupted") {
          return;
        }
        this.activeToken = 0;
        options?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    }, 40);
=======
    // Pick crisp English voice (prioritize local system voices)
    let voices = cachedVoices;
    if (!voices || voices.length === 0) {
      try {
        voices = window.speechSynthesis.getVoices() || [];
      } catch {}
    }

    const preferredVoice =
      voices.find((v) => v.lang.startsWith("en-US") && v.localService) ||
      voices.find((v) => v.lang.startsWith("en-GB") && v.localService) ||
      voices.find((v) => v.lang.startsWith("en") && v.localService) ||
      voices.find((v) => v.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    let isDone = false;
    let timeoutId: any = null;

    const cleanup = () => {
      if (isDone) return;
      isDone = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (this.resumeInterval) {
        clearInterval(this.resumeInterval);
        this.resumeInterval = null;
      }
      activeUtterances.delete(utterance);
      this.currentUtterance = null;
      options?.onEnd?.();
    };

    // Chrome TTS Safety Watchdog: max 120ms per character or min 3 seconds
    const maxMs = Math.max(3000, cleanText.length * 120);
    timeoutId = setTimeout(() => {
      console.warn("[JARVIS TTS] Safety timeout reached, releasing audio lock.");
      this.stop();
      cleanup();
    }, maxMs);

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      cleanup();
    };

    utterance.onerror = (e) => {
      console.warn("[JARVIS TTS Error]:", e);
      jarvisAudio.playChime("ack");
      options?.onError?.(e);
      cleanup();
    };

    // Store reference in global Set to prevent Chrome V8 Garbage Collection!
    activeUtterances.add(utterance);
    this.currentUtterance = utterance;

    // Chrome Resume Watchdog: pings resume every 250ms to prevent Chrome silent speech pauses
    this.resumeInterval = setInterval(() => {
      try {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }, 250);

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("[JARVIS TTS Speak Exception]:", e);
      jarvisAudio.playChime("ack");
      cleanup();
    }
>>>>>>> Stashed changes
  }

  stop(broadcast = true) {
    if (this.speakTimeout) {
      clearTimeout(this.speakTimeout);
      this.speakTimeout = null;
    }
    this.activeToken++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
<<<<<<< Updated upstream
    }
    if (broadcast) {
      try {
        this.channel?.postMessage({ type: "SILENCE_SPEECH" });
      } catch {}
=======
      if (this.resumeInterval) {
        clearInterval(this.resumeInterval);
        this.resumeInterval = null;
      }
      activeUtterances.clear();
      this.currentUtterance = null;
>>>>>>> Stashed changes
    }
  }
}

// --- Unified Speech Engine (Single Instance Master for Wake Word & Direct Speech) ---
export interface SpeechRecognitionHandlers {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export type WakeWordCallback = (commandText: string) => void;

export class JarvisUnifiedSpeechEngine {
  private recognition: any = null;
  private isRunning = false;
  private isPaused = false;
<<<<<<< Updated upstream
  private isActivelyListening = false;
  private onWakeCallback: WakeWordCallback | null = null;
  private restartTimeout: any = null;
  private watchdogInterval: any = null;
  private lastWakeTimestamp = 0;
  private lastActiveTimestamp = 0;
  private visibilityListenerAttached = false;

  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
=======
  private isManualListening = false;
  private wakeCallback: WakeWordCallback | null = null;
  private manualHandlers: SpeechRecognitionHandlers | null = null;
  private restartTimeout: any = null;
  private watchdogInterval: any = null;
  private hasMicPermission = false;
  public micPermissionError = false;

  constructor() {
    this.createRecognitionInstance();
  }

  private createRecognitionInstance() {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";
    this.initHandlers();
  }

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
>>>>>>> Stashed changes
  }

  get active(): boolean {
    return (this.isRunning || this.isManualListening) && !this.isPaused;
  }

<<<<<<< Updated upstream
  start(onWake: WakeWordCallback) {
    if (!this.isSupported()) return;
    this.onWakeCallback = onWake;
    this.isRunning = true;
    this.isPaused = false;

    this.attachVisibilityListener();
    this.startWatchdog();
    this.recreateAndStart();
=======
  async requestMicAccess(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        this.hasMicPermission = true;
        this.micPermissionError = false;
        return true;
      } catch (err) {
        console.warn("[JARVIS] Microphone access denied or error:", err);
        this.micPermissionError = true;
        return false;
      }
    }
    return true;
  }

  async startWakeDetector(onWake: WakeWordCallback) {
    if (!this.isSupported()) return;
    this.wakeCallback = onWake;
    this.isRunning = true;
    this.isPaused = false;

    if (!this.hasMicPermission) {
      await this.requestMicAccess();
    }

    this.restart();
    this.startWatchdog();
  }

  startManualListening(handlers: SpeechRecognitionHandlers) {
    this.manualHandlers = handlers;
    this.isManualListening = true;
    this.isPaused = false;
    jarvisAudio.playChime("activate");
    handlers.onStart?.();
    this.restart();
  }

  stopManualListening() {
    if (this.isManualListening) {
      this.isManualListening = false;
      this.manualHandlers?.onEnd?.();
      this.manualHandlers = null;
      jarvisAudio.playChime("deactivate");
    }
>>>>>>> Stashed changes
  }

  pause() {
    this.isPaused = true;
<<<<<<< Updated upstream
    this.isActivelyListening = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
=======
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
>>>>>>> Stashed changes
    }
    this.cleanupInstance();
  }

  resume() {
    this.isRunning = true;
    this.isPaused = false;
<<<<<<< Updated upstream
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    // Give 150ms cooldown before starting to let audio channel settle
    this.scheduleRestart(150);
=======
    this.restart();
>>>>>>> Stashed changes
  }

  stopAll() {
    this.isRunning = false;
    this.isPaused = false;
<<<<<<< Updated upstream
    this.isActivelyListening = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.stopWatchdog();
    this.cleanupInstance();
  }

  private attachVisibilityListener() {
    if (this.visibilityListenerAttached || typeof document === "undefined") return;
    this.visibilityListenerAttached = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.isRunning && !this.isPaused) {
        // Tab brought back into focus: resurrect immediately if sleeping
        if (!this.isActivelyListening) {
          this.recreateAndStart();
        }
      }
    });
  }

  private startWatchdog() {
    this.stopWatchdog();
    // Heartbeat every 2.5 seconds: ensures JARVIS never stays in a zombie sleep state
    this.watchdogInterval = setInterval(() => {
      if (this.isRunning && !this.isPaused) {
        const now = Date.now();
        // If the native speech recognition ended or dropped out due to silence
        if (!this.isActivelyListening || (now - this.lastActiveTimestamp > 9000)) {
          this.recreateAndStart();
        }
      }
    }, 2500);
  }

  private stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  private cleanupInstance() {
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
  }

  private recreateAndStart() {
    if (!this.isRunning || this.isPaused || typeof window === "undefined") return;

    this.cleanupInstance();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        this.isActivelyListening = true;
        this.lastActiveTimestamp = Date.now();
      };

      rec.onresult = (event: any) => {
        this.lastActiveTimestamp = Date.now();
        if (this.isPaused) return;

        const now = Date.now();
        // Debounce wake events by at least 2000ms
        if (now - this.lastWakeTimestamp < 2000) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript.toLowerCase();

          // Extended wake pattern: "hey jarvis", "ok jarvis", "hi jarvis", "jarvis", "wake up jarvis"
          const wakeRegex =
            /\b(hey\s+jarvis|ok\s+jarvis|okay\s+jarvis|hi\s+jarvis|hello\s+jarvis|wake\s+up\s+jarvis|jarvis\s+wake\s+up|wake\s+up|jarvis|jaarvis|javis|jarves|j\.a\.r\.v\.i\.s)\b/i;
          const match = wakeRegex.exec(transcript);

          if (match) {
            this.lastWakeTimestamp = now;
            const afterWake = transcript
              .slice(match.index + match[0].length)
              .replace(/^[,.\s]+/, "")
              .trim();

            this.pause();

            if (this.onWakeCallback) {
              this.onWakeCallback(afterWake);
            }
            break;
          }
        }
      };

      rec.onerror = (event: any) => {
        this.lastActiveTimestamp = Date.now();
        this.isActivelyListening = false;

        // If mic permission blocked before user gesture, listen for next click
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          window.addEventListener(
            "pointerdown",
            () => {
              if (this.isRunning && !this.isPaused) {
                this.recreateAndStart();
              }
            },
            { once: true }
          );
          return;
        }

        // Do NOT restart if intentionally paused or aborted
        if (this.isPaused || event.error === "aborted") {
          return;
        }

        // "no-speech" or "network" or "audio-capture" are normal silence/hardware timeouts in Chromium
        // Automatically recycle and restart after a 250ms cooldown
        this.scheduleRestart(250);
      };

      rec.onend = () => {
        this.isActivelyListening = false;
        if (this.isRunning && !this.isPaused) {
          this.scheduleRestart(200);
        }
      };

      this.recognition = rec;
      rec.start();
    } catch {
      this.isActivelyListening = false;
      this.scheduleRestart(500);
    }
  }

  private scheduleRestart(delayMs = 250) {
    if (this.isPaused || !this.isRunning) return;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.isRunning && !this.isPaused) {
        this.recreateAndStart();
      }
    }, delayMs);
=======
    this.isManualListening = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }
  }

  private restart() {
    if (this.isPaused) return;

    try {
      this.createRecognitionInstance();
      this.recognition.start();
      console.log("[JARVIS Speech Engine] Standby wake-word listener active...");
    } catch (e: any) {
      console.warn("[JARVIS Speech Engine Restart Warning]:", e?.message);
      this.scheduleRestart(300);
    }
  }

  private startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      if ((this.isRunning || this.isManualListening) && !this.isPaused && !this.micPermissionError) {
        try {
          this.recognition.start();
        } catch {
          // If start() throws (instance invalidated by Chrome idle timeout), re-create and restart!
          this.restart();
        }
      }
    }, 4000);
  }

  private initHandlers() {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => {
      if (this.isPaused) return;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript.trim();
        const lower = transcript.toLowerCase();
        const isFinal = event.results[i].isFinal;

        console.log("[JARVIS Speech Hear]:", transcript, `(Final: ${isFinal})`);

        // If manual Push-to-Talk active
        if (this.isManualListening && this.manualHandlers) {
          this.manualHandlers.onResult?.(transcript, isFinal);
          if (isFinal && transcript.length > 1) {
            this.stopManualListening();
          }
          continue;
        }

        // Extended wake pattern matching with phonetic resilience
        const wakeRegex =
          /\b(hey\s+jarvis|ok\s+jarvis|okay\s+jarvis|hi\s+jarvis|hello\s+jarvis|wake\s+up\s+jarvis|jarvis\s+wake\s+up|wake\s+up|jarvis|jaarvis|javis|jarves|jervis|garvis|gervis|charvis|travis|harvest|service|jar\s*vis|jar\s*vice|jar\s*vish|j\.a\.r\.v\.i\.s)\b/i;

        const match =
          wakeRegex.exec(lower) ||
          (lower.includes("jarvis") || lower.includes("jervis") || lower.includes("harvest")
            ? { index: lower.indexOf("jarvis") !== -1 ? lower.indexOf("jarvis") : 0, 0: "jarvis" }
            : null);

        // Strict Wake Word Triggering: ONLY wake up when the wake word is spoken!
        if (match) {
          console.log("[JARVIS Wake Word Detected!]:", lower);
          const afterWake = lower.slice(match.index + match[0].length).replace(/^[,.\s]+/, "").trim();

          this.pause();

          if (this.wakeCallback) {
            this.wakeCallback(afterWake);
          }
          break;
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn("[JARVIS Speech Engine Error]:", event.error);
      if (this.isManualListening && this.manualHandlers) {
        this.manualHandlers.onError?.(event.error || "Speech error");
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.micPermissionError = true;
        if (typeof window !== "undefined") {
          const tryStartOnInteraction = async () => {
            await this.requestMicAccess();
            if ((this.isRunning || this.isManualListening) && !this.isPaused) {
              this.restart();
            }
          };
          window.addEventListener("pointerdown", tryStartOnInteraction, { once: true });
          window.addEventListener("click", tryStartOnInteraction, { once: true });
        }
        return;
      }

      if (event.error === "no-speech" || event.error === "network" || event.error === "aborted") {
        this.scheduleRestart(250);
      }
    };

    this.recognition.onend = () => {
      if (this.isManualListening && this.manualHandlers) {
        const handlers = this.manualHandlers;
        this.manualHandlers = null;
        this.isManualListening = false;
        handlers.onEnd?.();
      } else if ((this.isRunning || this.isManualListening) && !this.isPaused && !this.micPermissionError) {
        this.scheduleRestart(200);
      }
    };
  }

  private scheduleRestart(ms = 300) {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if ((this.isRunning || this.isManualListening) && !this.isPaused) {
        this.restart();
      }
    }, ms);
>>>>>>> Stashed changes
  }
}

// Master Unified Speech Engine instance
export const jarvisSpeechEngine = new JarvisUnifiedSpeechEngine();
export const jarvisSpeaker = new JarvisSpeechSynthesizer();

// Backwards compatibility wrappers
export const jarvisRecognizer = {
  isSupported: () => jarvisSpeechEngine.isSupported(),
  start: (handlers: SpeechRecognitionHandlers) => jarvisSpeechEngine.startManualListening(handlers),
  stop: () => jarvisSpeechEngine.stopManualListening(),
};

export const jarvisWakeWord = {
  isSupported: () => jarvisSpeechEngine.isSupported(),
  start: (onWake: WakeWordCallback) => jarvisSpeechEngine.startWakeDetector(onWake),
  pause: () => jarvisSpeechEngine.pause(),
  resume: () => jarvisSpeechEngine.resume(),
  stop: () => jarvisSpeechEngine.stopAll(),
};
