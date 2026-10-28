import { Component, type ErrorInfo, type ReactNode } from "react"

/** Shows what failed instead of a blank page. */
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
      <p role="alert" className="p-6 font-mono text-sm text-destructive">
        {error.message}
      </p>
    )
  }
}
