/**
 * JARVIS Copilot Configuration
 * Powered by Google Gemini (gemini-3.6-flash)
 */

export const JARVIS_CONFIG = {
  get apiKey(): string {
    if (typeof window !== "undefined") {
      const local = localStorage.getItem("jarvis_gemini_api_key");
      if (local) return local;
    }
    return (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  },
  model: "gemini-3.6-flash",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
  speechVoice: "en-US", // or en-GB for British military cadence
  speechRate: 1.05,
  speechPitch: 0.95,
  maxHistoryLength: 16,
};
