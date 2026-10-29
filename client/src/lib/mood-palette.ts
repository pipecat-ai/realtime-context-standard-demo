import { ambientPalette, type AmbientPalette } from "@/glass"

/**
 * Each of Sam's expressions (public/avatar/animation.json) as a background,
 * so the stage carries the face's mood. Reactions are brief gestures over an
 * expression, so they leave it alone.
 */
const MOOD_PALETTES: Record<string, AmbientPalette["id"]> = {
  neutral: "plum",
  happy: "rose",
  excited: "violet",
  thinking: "slate",
  scheming: "lagoon",
  upset: "dusk",
  lose: "storm",
  angry: "ember",
  win: "amber",
}

/** The background for an expression; one without a palette gets the default. */
export function moodPalette(expression: string): AmbientPalette {
  return ambientPalette(MOOD_PALETTES[expression] ?? "")
}
