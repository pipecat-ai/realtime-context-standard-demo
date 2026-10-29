import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

const TITLE = "something went wrong"
const RELOAD_LABEL = "Reload"

/**
 * Shows what failed instead of a blank page, and a way back: a reload,
 * since the call and its client went down with the app.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <p className="readout-label">{TITLE}</p>
        <p className="max-w-prose font-mono text-sm text-destructive">
          {error.message}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            window.location.reload()
          }}
        >
          {RELOAD_LABEL}
        </Button>
      </main>
    )
  }
}
