import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

export type FaceState = "idle" | "listening" | "thinking" | "speaking" | "action-required" | "offline";

const EYE_COLOR: Record<FaceState, string> = {
  idle: colors.cyan,
  listening: colors.cyan,
  thinking: colors.violet,
  speaking: colors.cyan,
  "action-required": colors.amber,
  offline: colors.muted,
};

interface NexusFaceProps {
  state?: FaceState;
  size?: number;
  style?: ViewStyle;
}

/**
 * V1 native Face: a flat circular plate with the same eyes+mouth reading
 * as the web app's NexusFace, in the same state colors. The web version's
 * rotating 3D crystal shell (CSS `preserve-3d`) doesn't have a direct
 * React Native equivalent without a 3D/Skia dependency — a real follow-up,
 * not attempted here so this ships instead of stalling on it.
 */
export function NexusFace({ state = "idle", size = 72, style }: NexusFaceProps) {
  const color = EYE_COLOR[state];
  const eyeSize = size * 0.14;
  const eyeGap = size * 0.22;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          shadowColor: color,
        },
        style,
      ]}
    >
      <View style={[styles.eyesRow, { gap: eyeGap }]}>
        <View style={[styles.eye, { width: eyeSize, height: eyeSize * 1.6, backgroundColor: color }]} />
        <View style={[styles.eye, { width: eyeSize, height: eyeSize * 1.6, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  eyesRow: {
    flexDirection: "row",
  },
  eye: {
    borderRadius: 999,
  },
});
