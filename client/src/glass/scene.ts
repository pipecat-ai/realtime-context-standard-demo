import { createContext, use } from "react"

import type { BarsState } from "./bars-motion"
import { PANE_FROST, PANE_LOOK, type FrostLook, type GlassLook } from "./optics"

/** An element the background draws a pane of glass beneath. */
export interface PaneSource {
  element: HTMLElement
  look: GlassLook
  frost: FrostLook
}

/** The voice bars: their box, and a step the background's frame loop runs. */
export interface BarsSource {
  element: HTMLElement
  look: GlassLook
  step: (dt: number, time: number) => BarsState
}

/** What an AmbientBackground draws in glass; filled in by its descendants. */
export interface GlassScene {
  panes: Set<PaneSource>
  bars: BarsSource | null
  /** Bumped whenever a source comes or goes. */
  version: number
  /** Returns the unregister function. */
  addPane: (source: PaneSource) => () => void
  /** One set of bars per scene; the last mounted wins. */
  setBars: (source: BarsSource) => () => void
}

export function createGlassScene(): GlassScene {
  const scene: GlassScene = {
    panes: new Set(),
    bars: null,
    version: 0,
    addPane(source) {
      scene.panes.add(source)
      scene.version++
      return () => {
        scene.panes.delete(source)
        scene.version++
      }
    },
    setBars(source) {
      scene.bars = source
      scene.version++
      return () => {
        if (scene.bars !== source) return
        scene.bars = null
        scene.version++
      }
    },
  }
  return scene
}

/** Null outside an AmbientBackground, or without WebGL2. */
export const GlassSceneContext = createContext<GlassScene | null>(null)

export function useGlassScene(): GlassScene | null {
  return use(GlassSceneContext)
}

/**
 * A callback ref that draws a pane of glass beneath its element, following
 * its box and corner radius. A `data-glass-frost` child gets frostier glass.
 */
export function useGlassPane(
  look: GlassLook = PANE_LOOK,
  frost: FrostLook = PANE_FROST
): (element: HTMLElement | null) => (() => void) | undefined {
  const scene = useGlassScene()
  return (element) => {
    if (!scene || !element) return
    return scene.addPane({ element, look, frost })
  }
}
