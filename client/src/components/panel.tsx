import type { ReactNode } from "react"

import { SectionLabel } from "@/components/meters"
import { cn } from "@/lib/utils"

/**
 * A section of the side panel: one question per panel, named in its label
 * row. The side panel draws the rules between them.
 */
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
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="shrink-0 px-4 pt-4">
        <SectionLabel left={title} right={right} />
      </div>
      {children}
    </section>
  )
}
