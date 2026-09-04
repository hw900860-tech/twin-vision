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

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";
      }
    }
  }

  isSupported(): boolean {
    return Boolean(this.recognition);
  }

  start(handlers: SpeechRecognitionHandlers) {
    if (!this.recognition || this.isListening) return;

    this.recognition.onstart = () => {
      this.isListening = true;
      jarvisAudio.playChime("activate");
      handlers.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      handlers.onResult?.(text, Boolean(finalTranscript));
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      handlers.onError?.(event.error || "Speech recognition error");
    };

    this.recognition.onend = () => {
      this.isListening = false;
      jarvisAudio.playChime("deactivate");
      handlers.onEnd?.();
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.warn("Speech recognition start failed:", e);
      this.isListening = false;
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
  }
}

// --- Text to Speech (TTS) ---
export class JarvisSpeechSynthesizer {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cachedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.resolveVoice();
      };
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

    this.stop();

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

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = JARVIS_CONFIG.speechRate;
    utterance.pitch = JARVIS_CONFIG.speechPitch;

    const preferredVoice = this.resolveVoice();
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      setTimeout(() => {
        options?.onEnd?.();
      }, 100);
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      options?.onError?.(e);
      setTimeout(() => {
        options?.onEnd?.();
      }, 100);
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      this.currentUtterance = null;
    }
  }
}

// --- Wake Word Spotter ("Jarvis", "Hey Jarvis") ---
export type WakeWordCallback = (commandText: string) => void;

export class JarvisWakeWordDetector {
  private recognition: any = null;
  private isRunning = false;
  private isPaused = false;
  private onWakeCallback: WakeWordCallback | null = null;
  private restartTimeout: any = null;

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";
      }
    }
  }

  isSupported(): boolean {
    return Boolean(this.recognition);
  }

  get active(): boolean {
    return this.isRunning && !this.isPaused;
  }

  start(onWake: WakeWordCallback) {
    if (!this.recognition) return;
    this.onWakeCallback = onWake;
    this.isRunning = true;
    this.isPaused = false;
    this.initHandlers();
    try {
      this.recognition.start();
    } catch {
      // Already running or waiting for interaction
    }
  }

  pause() {
    this.isPaused = true;
    if (this.recognition && this.isRunning) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    try {
      this.recognition.start();
    } catch {}
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  private initHandlers() {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => {
      if (this.isPaused) return;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript.toLowerCase();

        // Extended wake pattern: "hey jarvis", "ok jarvis", "hi jarvis", "jarvis", "jaarvis", "wake up jarvis", etc.
        const wakeRegex =
          /\b(hey\s+jarvis|ok\s+jarvis|okay\s+jarvis|hi\s+jarvis|hello\s+jarvis|wake\s+up\s+jarvis|jarvis\s+wake\s+up|wake\s+up|jarvis|jaarvis|javis|jarves|j\.a\.r\.v\.i\.s)\b/i;
        const match = wakeRegex.exec(transcript);

        if (match) {
          const afterWake = transcript
            .slice(match.index + match[0].length)
            .replace(/^[,.\s]+/, "")
            .trim();

          // Temporarily pause wake detection to handle command
          this.pause();

          if (this.onWakeCallback) {
            this.onWakeCallback(afterWake);
          }
          break;
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      // If mic permission blocked before user gesture, listen for next click
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        if (typeof window !== "undefined") {
          const tryStartOnInteraction = () => {
            if (this.isRunning && !this.isPaused) {
              try {
                this.recognition.start();
              } catch {}
            }
          };
          window.addEventListener("pointerdown", tryStartOnInteraction, { once: true });
        }
        return;
      }

      // Don't kill background listener on typical timeouts
      if (
        event.error === "no-speech" ||
        event.error === "network" ||
        event.error === "aborted"
      ) {
        this.scheduleRestart();
      }
    };

    this.recognition.onend = () => {
      if (this.isRunning && !this.isPaused) {
        this.scheduleRestart();
      }
    };
  }

  private scheduleRestart() {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.isRunning && !this.isPaused) {
        try {
          this.recognition.start();
        } catch {}
      }
    }, 450);
  }
}

export const jarvisRecognizer = new JarvisSpeechRecognizer();
export const jarvisSpeaker = new JarvisSpeechSynthesizer();
export const jarvisWakeWord = new JarvisWakeWordDetector();
