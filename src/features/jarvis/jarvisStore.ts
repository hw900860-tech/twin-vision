/**
 * Zustand Store for JARVIS AI Copilot.
 * Manages conversational state, voice controls, UI synchronization, and action dispatchers.
 */

import { create } from "zustand";
import { jarvisAudio, jarvisRecognizer, jarvisSpeaker, jarvisWakeWord } from "./jarvisAudio";
import { executeJarvisQuery } from "./jarvisEngine";

export interface JarvisMessage {
  id: string;
  role: "user" | "jarvis";
  content: string;
  spokenText?: string;
  intent?: "QUESTION" | "ANALYSIS" | "NAVIGATION" | "UI_ACTION" | "COMBINED";
  actionsExecuted?: string[];
  timestamp: number;
}

export interface JarvisState {
  isOpen: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  isWakeWordActive: boolean;
  transcriptInput: string;
  messages: JarvisMessage[];

  // Synced screen state
  activeGcsTab: string;
  selectedPart: string | null;
  isExploded: boolean;
  isStudioOpen: boolean;

  // Registered external dispatchers (provided by routes/components)
  navHandler: ((path: string) => void) | null;
  gcsTabHandler: ((tab: string) => void) | null;
  partSelectHandler: ((part: string | null) => void) | null;
  explodeHandler: ((exploded: boolean) => void) | null;
  studioHandler: ((open: boolean) => void) | null;

  // Store Actions
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setWakeWordEnabled: (enabled: boolean) => void;
  toggleWakeWord: () => void;
  initWakeWord: () => void;
  setTranscriptInput: (text: string) => void;
  setActiveGcsTab: (tab: string) => void;
  setSelectedPart: (part: string | null) => void;
  setIsExploded: (exploded: boolean) => void;
  setIsStudioOpen: (open: boolean) => void;

  registerHandlers: (handlers: {
    nav?: (path: string) => void;
    gcsTab?: (tab: string) => void;
    partSelect?: (part: string | null) => void;
    explode?: (exploded: boolean) => void;
    studio?: (open: boolean) => void;
  }) => void;

  startListening: () => void;
  stopListening: () => void;
  stopSpeaking: () => void;
  clearHistory: () => void;
  submitQuery: (queryText?: string) => Promise<void>;
}

export const useJarvisStore = create<JarvisState>((set, get) => ({
  isOpen: false,
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  voiceEnabled: true,
  wakeWordEnabled: true,
  isWakeWordActive: false,
  transcriptInput: "",
  messages: [
    {
      id: "init-1",
      role: "jarvis",
      content:
        "**J.A.R.V.I.S. ONLINE** · Digital Engine Intelligence Copilot active.\n\nI am connected directly to the Rotax 914 AE-P4 digital twin, 20Hz telemetry link, and predictive ML models.\n\n*Speak or call \"Jarvis\" anytime to ask regarding live engine health, telemetry trends, fault diagnosis, or navigation.*",
      spokenText: "J.A.R.V.I.S. online. Digital Engine Intelligence system standing by. Say Jarvis anytime to activate.",
      intent: "QUESTION",
      timestamp: Date.now(),
    },
  ],

  activeGcsTab: "LIVE TWIN",
  selectedPart: null,
  isExploded: false,
  isStudioOpen: false,

  navHandler: null,
  gcsTabHandler: null,
  partSelectHandler: null,
  explodeHandler: null,
  studioHandler: null,

  setIsOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setVoiceEnabled: (enabled) => {
    if (!enabled) get().stopSpeaking();
    set({ voiceEnabled: enabled });
  },
  setWakeWordEnabled: (enabled) => {
    set({ wakeWordEnabled: enabled });
    if (enabled) {
      get().initWakeWord();
    } else {
      jarvisWakeWord.stop();
      set({ isWakeWordActive: false });
    }
  },
  toggleWakeWord: () => {
    const next = !get().wakeWordEnabled;
    get().setWakeWordEnabled(next);
  },
  initWakeWord: () => {
    if (!jarvisWakeWord.isSupported()) return;
    if (get().isWakeWordActive) return;

    set({ isWakeWordActive: true });

    jarvisWakeWord.start((spokenCommand) => {
      // Reveal HUD
      set({ isOpen: true });

      if (spokenCommand && spokenCommand.trim().length > 2) {
        // User said command along with wake-word: e.g. "Jarvis open Sensor matrix"
        get().submitQuery(spokenCommand.trim());
      } else {
        // User just summoned: "Jarvis!"
        jarvisAudio.playChime("activate");
        const ackPhrases = [
          "Online, Commander. Listening.",
          "Yes Commander, ready for instructions.",
          "Listening, go ahead.",
        ];
        const phrase =
          ackPhrases[Math.floor(Math.random() * ackPhrases.length)] ||
          "Online, Commander. Listening.";

        if (get().voiceEnabled) {
          set({ isSpeaking: true });
          jarvisSpeaker.speak(phrase, {
            onStart: () => set({ isSpeaking: true }),
            onEnd: () => {
              set({ isSpeaking: false });
              // Seamlessly transition to voice command listening
              get().startListening();
            },
            onError: () => {
              set({ isSpeaking: false });
              get().startListening();
            },
          });
        } else {
          get().startListening();
        }
      }
    });
  },
  setTranscriptInput: (text) => set({ transcriptInput: text }),
  setActiveGcsTab: (tab) => set({ activeGcsTab: tab }),
  setSelectedPart: (part) => set({ selectedPart: part }),
  setIsExploded: (exploded) => set({ isExploded: exploded }),
  setIsStudioOpen: (open) => set({ isStudioOpen: open }),

  registerHandlers: (handlers) =>
    set((state) => ({
      navHandler: handlers.nav ?? state.navHandler,
      gcsTabHandler: handlers.gcsTab ?? state.gcsTabHandler,
      partSelectHandler: handlers.partSelect ?? state.partSelectHandler,
      explodeHandler: handlers.explode ?? state.explodeHandler,
      studioHandler: handlers.studio ?? state.studioHandler,
    })),

  startListening: () => {
    const { isListening, submitQuery } = get();
    if (isListening) return;

    jarvisWakeWord.pause();
    jarvisSpeaker.stop();
    set({ isSpeaking: false, isListening: true });

    jarvisRecognizer.start({
      onStart: () => {
        set({ isListening: true });
      },
      onResult: (transcript, isFinal) => {
        set({ transcriptInput: transcript });
        if (isFinal && transcript.trim().length > 1) {
          jarvisRecognizer.stop();
          set({ isListening: false });
          submitQuery(transcript.trim());
        }
      },
      onError: (err) => {
        console.warn("Speech recognition error:", err);
        set({ isListening: false });
        if (get().wakeWordEnabled) {
          jarvisWakeWord.resume();
        }
      },
      onEnd: () => {
        set({ isListening: false });
        if (get().wakeWordEnabled) {
          jarvisWakeWord.resume();
        }
      },
    });
  },

  stopListening: () => {
    jarvisRecognizer.stop();
    set({ isListening: false });
    if (get().wakeWordEnabled) {
      jarvisWakeWord.resume();
    }
  },

  stopSpeaking: () => {
    jarvisSpeaker.stop();
    set({ isSpeaking: false });
    if (get().wakeWordEnabled) {
      jarvisWakeWord.resume();
    }
  },

  clearHistory: () => {
    set({
      messages: [
        {
          id: `clear-${Date.now()}`,
          role: "jarvis",
          content: "Context history cleared. System baseline re-initialized.",
          spokenText: "Context cleared. Standing by.",
          intent: "QUESTION",
          timestamp: Date.now(),
        },
      ],
    });
  },

  submitQuery: async (queryText?: string) => {
    const query = (queryText ?? get().transcriptInput).trim();
    if (!query || get().isThinking) return;

    // Immediately stop any currently playing speech and pause all listening
    jarvisSpeaker.stop();
    jarvisWakeWord.pause();
    jarvisRecognizer.stop();

    // Reset input
    set({ transcriptInput: "", isThinking: true, isSpeaking: false, isListening: false });
    jarvisAudio.playChime("ack");

    // Add user message to history
    const userMsg: JarvisMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: Date.now(),
    };

    set((s) => ({ messages: [...s.messages, userMsg] }));

    try {
      // Execute query through Gemini engine
      const result = await executeJarvisQuery(query, get().messages);

      const jarvisMsg: JarvisMessage = {
        id: `j-${Date.now()}`,
        role: "jarvis",
        content: result.displayText,
        spokenText: result.spokenText,
        intent: result.intent,
        actionsExecuted: result.actionsExecuted,
        timestamp: Date.now(),
      };

      set((s) => ({
        messages: [...s.messages, jarvisMsg],
        isThinking: false,
      }));

      // Speak response if voice is enabled
      if (get().voiceEnabled && result.spokenText) {
        set({ isSpeaking: true });
        jarvisWakeWord.pause();

        jarvisSpeaker.speak(result.spokenText, {
          onStart: () => {
            set({ isSpeaking: true });
            jarvisWakeWord.pause();
          },
          onEnd: () => {
            set({ isSpeaking: false });
            // Add a 600ms room-silence buffer before resuming wake word to prevent self-triggering
            setTimeout(() => {
              if (get().wakeWordEnabled && !get().isSpeaking && !get().isListening) {
                jarvisWakeWord.resume();
              }
            }, 600);
          },
          onError: () => {
            set({ isSpeaking: false });
            setTimeout(() => {
              if (get().wakeWordEnabled && !get().isSpeaking && !get().isListening) {
                jarvisWakeWord.resume();
              }
            }, 600);
          },
        });
      } else {
        set({ isSpeaking: false });
        if (get().wakeWordEnabled && !get().isListening) {
          jarvisWakeWord.resume();
        }
      }
    } catch (err: any) {
      console.error("JARVIS query processing failure:", err);
      const errorMsg: JarvisMessage = {
        id: `err-${Date.now()}`,
        role: "jarvis",
        content: `**SYSTEM ERROR**: Failed to synthesize telemetry response.\n\n\`${err?.message || "Unknown error"}\``,
        spokenText: "Apologies, I encountered an issue accessing the telemetry pipeline.",
        intent: "QUESTION",
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, errorMsg], isThinking: false, isSpeaking: false }));
      if (get().wakeWordEnabled && !get().isListening) {
        jarvisWakeWord.resume();
      }
    }
  },
}));
