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
      set({ isWakeWordActive: false });
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

<<<<<<< Updated upstream
      if (spokenCommand && spokenCommand.trim().length > 2) {
        // User said command along with wake-word: e.g. "Jarvis what is our altitude"
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
=======
      const command = spokenCommand?.trim();
      const isJustWakeWord =
        !command ||
        /^(jarvis|jarvus|jervis|garvis|travis|hey jarvis|ok jarvis|okay jarvis|hi jarvis|hello jarvis|wake up|wake up jarvis|j\.a\.r\.v\.i\.s)$/i.test(
          command
        );
>>>>>>> Stashed changes

      if (!isJustWakeWord && command.length > 2) {
        // User spoke an actual command along with wake-word: e.g. "Jarvis show graphs"
        get().submitQuery(command);
      } else {
        // User just called "Jarvis!" -> Speak verbal acknowledgment out loud!
        const responses = [
          "Yes, Commander. Standing by.",
          "At your service, Commander.",
          "Online, Commander. Command?",
          "Systems nominal. Ready, Commander."
        ];
        const spokenGreeting = responses[Math.floor(Math.random() * responses.length)];

        set({ isSpeaking: true });
        jarvisSpeaker.speak(spokenGreeting, {
          onStart: () => set({ isSpeaking: true }),
          onEnd: () => {
            set({ isSpeaking: false });
            // Small 150ms buffer so speaker sound doesn't echo into mic
            setTimeout(() => {
              get().startListening();
            }, 150);
          },
          onError: () => {
            set({ isSpeaking: false });
            get().startListening();
          }
        });
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

    if ((get() as any)._listeningTimer) {
      clearTimeout((get() as any)._listeningTimer);
    }

    jarvisWakeWord.pause();
    jarvisSpeaker.stop();
    set({ isSpeaking: false, isListening: true, transcriptInput: "" });

    let hasHandledFinish = false;

    const handleFinish = (finalText: string) => {
      if (hasHandledFinish) return;
      hasHandledFinish = true;

      if ((get() as any)._listeningTimer) {
        clearTimeout((get() as any)._listeningTimer);
      }

      jarvisRecognizer.stop();
      set({ isListening: false, transcriptInput: "" });

      const clean = finalText.trim();
      if (clean.length > 1) {
        console.log("[JARVIS Voice Input Captured]:", clean);
        submitQuery(clean);
      } else {
        console.log("[JARVIS Voice] No speech captured. Returning to wake-word mode.");
        if (get().wakeWordEnabled) {
          jarvisWakeWord.resume();
        }
      }
    };

    // Auto-Sleep Timer: If woken up but no speech command received within 8 seconds, go back to sleep (Wake Word Standby)
    const timer = setTimeout(() => {
      if (get().isListening) {
        console.log("[JARVIS] Inactivity timeout: Returning to Standby wake word mode.");
        handleFinish(get().transcriptInput);
      }
    }, 8000);
    (get() as any)._listeningTimer = timer;

<<<<<<< Updated upstream
    // 120ms safety margin ensures Chromium's native microphone pipe is released cleanly
    setTimeout(() => {
      if (!get().isListening) return;

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
        onError: () => {
          set({ isListening: false });
          if (get().wakeWordEnabled) {
            setTimeout(() => {
              if (!get().isListening && !get().isSpeaking && get().wakeWordEnabled) {
                jarvisWakeWord.resume();
              }
            }, 180);
          }
        },
        onEnd: () => {
          set({ isListening: false });
          if (get().wakeWordEnabled) {
            setTimeout(() => {
              if (!get().isListening && !get().isSpeaking && get().wakeWordEnabled) {
                jarvisWakeWord.resume();
              }
            }, 180);
          }
        },
      });
    }, 120);
=======
    jarvisRecognizer.start({
      onStart: () => {
        set({ isListening: true });
      },
      onResult: (transcript, isFinal) => {
        const text = transcript.trim();
        set({ transcriptInput: text });
        if (isFinal && text.length > 1) {
          handleFinish(text);
        }
      },
      onError: (err) => {
        console.warn("Speech recognition error:", err);
        handleFinish(get().transcriptInput);
      },
      onEnd: () => {
        handleFinish(get().transcriptInput);
      },
    });
>>>>>>> Stashed changes
  },

  stopListening: () => {
    if ((get() as any)._listeningTimer) clearTimeout((get() as any)._listeningTimer);
    jarvisRecognizer.stop();
    set({ isListening: false });
    if (get().wakeWordEnabled) {
      setTimeout(() => {
        if (!get().isListening && !get().isSpeaking && get().wakeWordEnabled) {
          jarvisWakeWord.resume();
        }
      }, 150);
    }
  },

  stopSpeaking: () => {
    jarvisSpeaker.stop();
    set({ isSpeaking: false });
    if (get().wakeWordEnabled) {
      setTimeout(() => {
        if (!get().isListening && !get().isSpeaking && get().wakeWordEnabled) {
          jarvisWakeWord.resume();
        }
      }, 150);
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
            set({ isSpeaking: false, isListening: false });
            // Once the conversation is finished, listening goes completely OFF.
            // JARVIS returns to standby, waking ONLY when "Jarvis" is spoken again.
            if (get().wakeWordEnabled) {
              setTimeout(() => {
                if (get().wakeWordEnabled && !get().isSpeaking && !get().isListening) {
                  jarvisWakeWord.resume();
                }
              }, 400);
            }
          },
          onError: () => {
            set({ isSpeaking: false, isListening: false });
            if (get().wakeWordEnabled) {
              setTimeout(() => {
                if (get().wakeWordEnabled && !get().isSpeaking && !get().isListening) {
                  jarvisWakeWord.resume();
                }
              }, 400);
            }
          },
        });
      } else {
        set({ isSpeaking: false });
        if (get().wakeWordEnabled && !get().isListening) {
          setTimeout(() => {
            if (get().wakeWordEnabled && !get().isSpeaking && !get().isListening) {
              jarvisWakeWord.resume();
            }
          }, 300);
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
