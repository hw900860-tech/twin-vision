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
export class JarvisSpeechSynthesizer {
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

    // Immediately cancel previous utterance and increment token to invalidate stale callbacks
    this.stop(true);
    const token = ++this.activeToken;

    // Clean markdown symbols from spoken text
    let cleanText = text
      .replace(/[*_#`~[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\n+/g, " ")
      .trim();

    // Keep voice transmission punchy & fast (1-2 sentences max, <= 28 words)
    const sentences = cleanText.split(/(?<=[.?!])\s+/);
    if (sentences.length > 2) {
      cleanText = sentences.slice(0, 2).join(" ");
    }
    const words = cleanText.split(/\s+/);
    if (words.length > 28) {
      cleanText = words.slice(0, 28).join(" ") + ".";
    }

    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    // Broadcast silence to any other tabs
    try {
      this.channel?.postMessage({ type: "SILENCE_SPEECH" });
    } catch {}

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
  }
}

export const jarvisRecognizer = new JarvisSpeechRecognizer();
export const jarvisSpeaker = new JarvisSpeechSynthesizer();
export const jarvisWakeWord = new JarvisWakeWordDetector();
