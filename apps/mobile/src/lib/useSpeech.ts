import * as Speech from "expo-speech";
import { useCallback, useState } from "react";

/**
 * TTS only for V1 — expo-speech ships in the Expo Go binary already, no
 * custom native module needed, so this works the moment the app installs.
 * Real speech-to-text needs a native module Expo Go doesn't bundle
 * (@react-native-voice/voice or expo-speech-recognition), which means a
 * development build (`eas build --profile development`) instead of plain
 * Expo Go — a deliberate next step, not done in this pass. See the mobile
 * README for the staged plan.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string): Promise<void> => {
    if (!text.trim()) return Promise.resolve();
    return new Promise((resolve) => {
      Speech.stop();
      Speech.speak(text, {
        language: "es-AR",
        onStart: () => setSpeaking(true),
        onDone: () => {
          setSpeaking(false);
          resolve();
        },
        onStopped: () => {
          setSpeaking(false);
          resolve();
        },
        onError: () => {
          setSpeaking(false);
          resolve();
        },
      });
    });
  }, []);

  const stop = useCallback(() => {
    void Speech.stop();
    setSpeaking(false);
  }, []);

  return { speaking, speak, stop };
}
