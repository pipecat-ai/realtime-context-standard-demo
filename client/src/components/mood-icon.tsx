import {
  IconMoodAngry,
  IconMoodHappy,
  IconMoodNeutral,
  IconMoodPuzzled,
  IconMoodSad,
  IconMoodSad2,
  IconMoodSmile,
  IconMoodSpark,
  IconMoodWink,
  type IconProps,
  type TablerIcon,
} from "@tabler/icons-react"

/**
 * Each of Sam's expressions (public/avatar/animation.json) as one of Tabler's
 * mood faces, which draw as Lucide's do: a 24px grid in a 2px round stroke.
 */
const FACES: Record<string, TablerIcon> = {
  neutral: IconMoodNeutral,
  happy: IconMoodSmile,
  excited: IconMoodHappy,
  thinking: IconMoodPuzzled,
  scheming: IconMoodWink,
  upset: IconMoodSad,
  lose: IconMoodSad2,
  angry: IconMoodAngry,
  win: IconMoodSpark,
}

export interface MoodIconProps extends IconProps {
  /** One of Sam's expressions, as the avatar store holds it. */
  expression: string
}

/** The face for an expression; one without a face gets neutral's. */
export function MoodIcon({ expression, ...props }: MoodIconProps) {
  const Face = FACES[expression] ?? IconMoodNeutral
  return <Face {...props} />
}
