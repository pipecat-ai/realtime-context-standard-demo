import type { ReactNode } from "react"

import { SectionLabel } from "@/components/meters"
import { cn } from "@/lib/utils"

/** A side panel card: one question per panel, named in its label row. */
export function Panel({
  title,
  right,
  className,
  children,
}: {
  title: string
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border bg-card",
        className
      )}
    >
      <div className="shrink-0 px-4 pt-3">
        <SectionLabel left={title} right={right} />
      </div>
      {children}
    </section>
  )
}
