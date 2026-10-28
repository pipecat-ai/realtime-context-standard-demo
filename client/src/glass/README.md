# glass

A shifting ambient background, and the Figma-style glass it draws for the
buttons, panes and voice bars inside it, in one WebGL2 composite pass. Built
for desktop and phones: half-scale gradient at ~20fps, full-rate frames only
while glass moves, paused off-screen, reduced motion respected, device pixel
ratio changes and context loss handled. Without WebGL2 it falls back to a
CSS gradient, flat buttons and Pipecat's flat bars.

```tsx
import {
  AmbientBackground,
  ambientPalette,
  GlassButton,
  GlassVoiceBars,
} from "@/glass"

function Stage({ track, onStart }: StageProps) {
  return (
    <AmbientBackground palette={ambientPalette("plum")} className="rounded-3xl">
      <GlassVoiceBars track={track} />
      <GlassButton onClick={onStart} className="h-14 px-5">
        Start
        <span data-glass-frost className="size-8 rounded-full" />
      </GlassButton>
    </AmbientBackground>
  )
}
```

- `AmbientBackground`: the background, and the scene the glass registers
  with. Glass must render inside it; up to 8 panes and one set of bars.
- `GlassButton`: a pill of glass with a pointer light. Any border radius
  works; a `data-glass-frost` child gets a frostier disc.
- `useGlassPane(look?, frost?)`: a callback ref that puts glass under any
  element (cards, chips).
- `GlassVoiceBars`: voice-band bars that melt together, gather while
  connecting and ripple while thinking.
- `PalettePicker`: swatches for `AMBIENT_PALETTES`.
- Looks: `FIGMA_GLASS` (shared optics), `PANE_LOOK`, `PANE_FROST`,
  `BARS_LOOK` in `optics.ts`; bar shape in `bars.ts`.

## Porting

Copy this folder and add `@import "./glass/glass-button.css";` to the app's
CSS. It expects a React 19 + Tailwind v4 + shadcn app with:

- `@/lib/utils` (`cn`)
- `motion` (the palette picker)
- from the Pipecat UI registry: `@/lib/visualizer` and
  `@/components/pipecat/audio-visualizer-bar` (the bars' analyser and
  fallback)

Client-only: it touches `document` on first render.
