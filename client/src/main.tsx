import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/azeret-mono"
import "@fontsource-variable/work-sans"

import { App } from "@/App"
import { ErrorBoundary } from "@/components/error-boundary"
import "@/index.css"

const root = document.getElementById("root")
if (!root) throw new Error("index.html is missing #root")

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
