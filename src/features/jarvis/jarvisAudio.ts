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
      const navLang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
      rec.lang = navLang.startsWith("en") ? navLang : "en-US";

      let accumulatedTranscript = "";

      rec.onstart = () => {
        this.isListening = true;
        jarvisAudio.playChime("activate");
        handlers.onStart?.();
      };

      rec.onresult = (event: any) => {
        let fullTranscript = "";

        // Concatenate all results from index 0 so nothing is dropped or cut off in between
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript + " ";
        }
        fullTranscript = fullTranscript.replace(/\s+/g, " ").trim();

        if (!fullTranscript) return;
        accumulatedTranscript = fullTranscript;

        // Stream live transcript to UI input field
        handlers.onResult?.(fullTranscript, false);

        // Adaptive silence countdown:
        // - If Web Speech has already determined finality on a phrase, commit quickly in 900ms
        // - If user is speaking or pausing mid-thought (interim), give a generous 1800ms window
        const hasFinal = Array.from(event.results).some((r: any) => r.isFinal);
        const silenceDelay = hasFinal ? 900 : 1800;

        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }
        this.silenceTimer = setTimeout(() => {
          if (this.isListening && accumulatedTranscript.length > 1) {
            this.silenceTimer = null;
            handlers.onResult?.(accumulatedTranscript, true);
          }
        }, silenceDelay);
      };

      rec.onerror = (event: any) => {
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.isListening = false;
        // no-speech or aborted are benign timeouts in Chromium
        if (event.error === "no-speech" || event.error === "aborted") {
          if (accumulatedTranscript && accumulatedTranscript.length > 1) {
            handlers.onResult?.(accumulatedTranscript, true);
          }
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
        if (accumulatedTranscript && accumulatedTranscript.length > 1) {
          handlers.onResult?.(accumulatedTranscript, true);
        }
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

export class JarvisSpeechSynthesizer {
  private activeToken = 0;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private speakTimeout: any = null;
  private keepAliveTimer: any = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
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

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private resolveVoice(): SpeechSynthesisVoice | null {
    if (this.cachedVoice) return this.cachedVoice;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    this.cachedVoice =
      voices.find((v) => v.lang.startsWith("en-GB") && v.name.includes("Male")) ||
      voices.find((v) => v.name.includes("Natural") && v.lang.startsWith("en")) ||
      voices.find((v) => v.name.includes("Google UK English Male")) ||
      voices.find((v) => v.lang.startsWith("en") && !v.name.includes("Female")) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null;

    return this.cachedVoice;
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

    const wasSpeaking =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending);

    // Cancel any previous utterance if still active
    if (wasSpeaking) {
      this.stop(true);
    }
    const token = ++this.activeToken;

    // Clean markdown symbols and special notation from spoken text
    let cleanText = text
      .replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, "")
      .replace(/[*_#`~[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/>\s*/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    // Broadcast silence to any other tabs
    try {
      this.channel?.postMessage({ type: "SILENCE_SPEECH" });
    } catch {}

    // Delay: if previous speech was canceled, give 60ms for audio device release; else speak in 10ms
    const delay = wasSpeaking ? 60 : 10;

    this.speakTimeout = setTimeout(() => {
      if (this.activeToken !== token) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      // Force resume any paused Chromium speech queue before dispatching
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = JARVIS_CONFIG.speechRate;
      utterance.pitch = JARVIS_CONFIG.speechPitch;

      const preferredVoice = this.resolveVoice();
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang || "en-US";
      } else {
        utterance.lang = "en-US";
      }

      this.currentUtterance = utterance;

      let hasStarted = false;

      // Keepalive timer ensures Chromium speech engine does not stall on longer multi-sentence debriefs
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }
      }, 5000);

      utterance.onstart = () => {
        hasStarted = true;
        if (this.activeToken !== token) return;
        options?.onStart?.();
      };

      utterance.onend = () => {
        if (this.keepAliveTimer) {
          clearInterval(this.keepAliveTimer);
          this.keepAliveTimer = null;
        }
        this.currentUtterance = null;
        if (this.activeToken !== token) return;
        this.activeToken = 0;
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        if (this.keepAliveTimer) {
          clearInterval(this.keepAliveTimer);
          this.keepAliveTimer = null;
        }
        this.currentUtterance = null;
        if (this.activeToken !== token) return;
        // Do not propagate intentional cancellations or interrupts
        if (e.error === "canceled" || e.error === "interrupted") {
          return;
        }
        this.activeToken = 0;
        options?.onError?.(e);
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("speechSynthesis.speak error:", err);
        options?.onError?.(err);
      }

      // CRITICAL CHROMIUM FIX: Kick synthesis engine 50ms & 200ms later to unblock pending queue
      setTimeout(() => {
        if (!hasStarted && typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.resume();
          } catch {}
        }
      }, 50);

      setTimeout(() => {
        if (!hasStarted && typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          } catch {}
        }
      }, 200);
    }, delay);
  }

  stop(broadcast = true) {
    if (this.speakTimeout) {
      clearTimeout(this.speakTimeout);
      this.speakTimeout = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.currentUtterance = null;
    this.activeToken++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (broadcast) {
      try {
        this.channel?.postMessage({ type: "SILENCE_SPEECH" });
      } catch {}
    }
  }
}

// --- Wake Word Spotter ("Jarvis", "Hey Jarvis") ---
export type WakeWordCallback = (commandText: string) => void;

export class JarvisWakeWordDetector {
  private recognition: any = null;
  private isRunning = false;
  private isPaused = false;
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
  }

  get active(): boolean {
    return this.isRunning && !this.isPaused;
  }

  start(onWake: WakeWordCallback) {
    if (!this.isSupported()) return;
    this.onWakeCallback = onWake;
    this.isRunning = true;
    this.isPaused = false;

    this.attachVisibilityListener();
    this.startWatchdog();
    this.recreateAndStart();
  }

  pause() {
    this.isPaused = true;
    this.isActivelyListening = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.cleanupInstance();
  }

  resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    // Give 150ms cooldown before starting to let audio channel settle
    this.scheduleRestart(150);
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
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
    // Heartbeat every 2.0 seconds: ensures JARVIS never stays in a dropped or zombie state
    this.watchdogInterval = setInterval(() => {
      if (this.isRunning && !this.isPaused) {
        // If the native speech recognition ended or dropped out due to silence
        if (!this.isActivelyListening) {
          this.recreateAndStart();
        }
      }
    }, 2000);
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
        this.recognition.onaudiostart = null;
        this.recognition.onsoundstart = null;
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
      const navLang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
      rec.lang = navLang.startsWith("en") ? navLang : "en-US";

      rec.onstart = () => {
        this.isActivelyListening = true;
        this.lastActiveTimestamp = Date.now();
      };

      rec.onaudiostart = () => {
        this.isActivelyListening = true;
        this.lastActiveTimestamp = Date.now();
      };

      rec.onsoundstart = () => {
        this.isActivelyListening = true;
        this.lastActiveTimestamp = Date.now();
      };

      rec.onresult = (event: any) => {
        this.lastActiveTimestamp = Date.now();
        if (this.isPaused) return;

        const now = Date.now();
        // Debounce wake events by at least 700ms
        if (now - this.lastWakeTimestamp < 700) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript.toLowerCase();

          // Comprehensive wake pattern: supports simple names ("Aeris", "Nova", "Iris", "Computer", "Copilot", "Friday", "Alexa", "Jarvis")
          const wakeRegex =
            /\b(hey\s+aeris|ok\s+aeris|okay\s+aeris|hi\s+aeris|hello\s+aeris|aeris|aris|airis|ayris|eris|ares|air\s*is|hey\s+nova|nova|hey\s+iris|iris|hey\s+friday|friday|hey\s+alexa|alexa|hey\s+alex|alex|hey\s+computer|ok\s+computer|computer|hey\s+copilot|copilot|hey\s+assistant|assistant|hey\s+jarvis|ok\s+jarvis|okay\s+jarvis|hi\s+jarvis|hello\s+jarvis|wake\s+up\s+jarvis|jarvis\s+wake\s+up|wake\s+up|jarvis|jaarvis|javis|jahvis|jah\s*vis|jarves|jervis|jerwis|jarviss|jarvise|jar\s*vis|jar\s*is|jar\s*this|service|services|travis|charvis|garvis|darvis|starvis|harvest|j\.a\.r\.v\.i\.s)\b/i;
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

        // If mic permission blocked before user gesture, request on next click
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          window.addEventListener(
            "pointerdown",
            async () => {
              if (this.isRunning && !this.isPaused) {
                await requestMicrophoneAccess();
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
  }
}

export const jarvisRecognizer = new JarvisSpeechRecognizer();
export const jarvisSpeaker = new JarvisSpeechSynthesizer();
export const jarvisWakeWord = new JarvisWakeWordDetector();

/**
 * Prompts user for browser microphone access cleanly via getUserMedia,
 * ensuring background SpeechRecognition has granted permission without throwing 'not-allowed'.
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    console.warn("Microphone access prompt dismissed or not yet granted:", err);
    return false;
  }
}
