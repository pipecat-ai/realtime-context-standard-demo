import { PlusIcon } from "lucide-react"

import deepgramWordmark from "@/assets/deepgram-wordmark.svg"
import pipecatLogo from "@/assets/pipecat-logo.svg"
import { cn } from "@/lib/utils"

export function Header({ className }: { className?: string }) {
  return (
    <header className={cn("flex shrink-0 items-center gap-3", className)}>
      <a href="https://deepgram.com" className="shrink-0">
        <img src={deepgramWordmark} alt="Deepgram" className="h-6 w-auto" />
      </a>
      <PlusIcon
        className="size-4 shrink-0 text-muted-foreground/60"
        aria-hidden
      />
      <a href="https://pipecat.ai" className="shrink-0">
        <img src={pipecatLogo} alt="Pipecat" className="h-6.25 w-auto" />
      </a>
    </header>
  )
}
