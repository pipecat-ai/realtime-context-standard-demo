/** The Tone reader's nine emotions, by the sentiment colour each reads as. */
const SENTIMENT: Record<string, "warm" | "neutral" | "cold" | "hostile"> = {
  happy: "warm",
  amused: "warm",
  neutral: "neutral",
  surprised: "neutral",
  sad: "cold",
  afraid: "cold",
  angry: "hostile",
  disgusted: "hostile",
  contemptuous: "hostile",
}

/** The sentiment token an emotion is drawn in. */
export function emotionColor(emotion: string): string {
  return `var(--${SENTIMENT[emotion] ?? "neutral"})`
}
