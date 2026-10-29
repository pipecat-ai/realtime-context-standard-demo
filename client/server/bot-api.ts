/**
 * The browser's only route to the bot. It never sees where the bot runs or
 * the Pipecat Cloud key.
 *
 *   POST        /api/start                    → BOT_START_URL
 *   POST, PATCH /api/sessions/{id}/api/offer  → {bot}/sessions/{id}/api/offer
 *
 * The local runner and Pipecat Cloud share this contract, so BOT_START_URL is
 * the only switch. Fetch API only, so it mounts in Vite (vite-plugin.ts) and
 * Vercel (../api) alike.
 *
 * Unauthenticated: gate it (bot check, rate limit) before real traffic.
 */

export type BotTransport = "webrtc" | "daily"

export interface BotApiConfig {
  transport: BotTransport
  /** The runner's or Pipecat Cloud agent's /start. */
  startUrl: string
  /** Pipecat Cloud public API key (`pk_...`); not needed for the runner. */
  apiKey: string | undefined
}

/** The bot's start-time options (server/bot.py's BotOptions), and their values. */
const SESSION_OPTIONS = {
  tts: ["elevenlabs", "cartesia"],
  use_tagger: ["true", "false"],
  detect_backchannels: ["true", "false"],
  demo: ["true", "false"],
} as const

const DEFAULT_START_URL = "http://localhost:7860/start"
const PIPECAT_CLOUD_HOST = "api.pipecat.daily.co"

/** Reads and validates the server env; throws so bad config fails at startup. */
export function readBotApiConfig(
  env: Record<string, string | undefined>
): BotApiConfig {
  const transport = env.VITE_BOT_TRANSPORT ?? "webrtc"
  if (transport !== "webrtc" && transport !== "daily") {
    throw new Error(
      `VITE_BOT_TRANSPORT must be "webrtc" or "daily", got "${transport}"`
    )
  }

  const startUrl = env.BOT_START_URL || DEFAULT_START_URL
  const apiKey = env.BOT_START_PUBLIC_API_KEY || undefined
  if (new URL(startUrl).host === PIPECAT_CLOUD_HOST && !apiKey) {
    throw new Error(
      "BOT_START_URL points at Pipecat Cloud, which needs " +
        "BOT_START_PUBLIC_API_KEY (a pk_... key from " +
        "`pipecat cloud organizations keys create`)"
    )
  }

  return { transport, startUrl, apiKey }
}

/** Handles a bot API request, or returns null to fall through. */
export async function handleBotApi(
  request: Request,
  config: BotApiConfig
): Promise<Response | null> {
  const { pathname } = new URL(request.url)

  if (pathname === "/api/start") {
    if (request.method !== "POST") return methodNotAllowed("POST")
    return startSession(config, await request.json().catch(() => ({})))
  }

  const offer = /^\/api\/sessions\/([\w-]+)\/api\/offer$/.exec(pathname)
  if (offer) {
    if (request.method !== "POST" && request.method !== "PATCH") {
      return methodNotAllowed("POST, PATCH")
    }
    const botBaseUrl = config.startUrl.replace(/\/start\/?$/, "")
    return forward(`${botBaseUrl}/sessions/${offer[1]}/api/offer`, config, {
      method: request.method,
      body: await request.text(),
    })
  }

  return null
}

/**
 * Keeps only the known session options, at known values, from the browser's
 * request; anything else is dropped so the browser can't steer the bot.
 */
function sessionBody(requestData: unknown): Record<string, string> {
  if (typeof requestData !== "object" || requestData === null) return {}
  return Object.fromEntries(
    Object.entries(SESSION_OPTIONS).flatMap(([key, values]) => {
      const value = String((requestData as Record<string, unknown>)[key])
      return (values as readonly string[]).includes(value) ? [[key, value]] : []
    })
  )
}

/** Starts a session. The start request is built here, never by the browser. */
async function startSession(
  config: BotApiConfig,
  requestData: unknown
): Promise<Response> {
  const body = sessionBody(requestData)
  const start =
    config.transport === "daily"
      ? { transport: "daily", createDailyRoom: true, body }
      : {
          transport: "webrtc",
          createDailyRoom: false,
          enableDefaultIceServers: true,
          body,
        }

  const response = await forward(config.startUrl, config, {
    method: "POST",
    body: JSON.stringify(start),
  })
  if (!response.ok) return response

  // Pass on only what each transport reads; daily-js warns on extra fields.
  const started = (await response.json()) as StartResponse
  return Response.json(
    config.transport === "daily"
      ? { dailyRoom: started.dailyRoom, dailyToken: started.dailyToken }
      : { sessionId: started.sessionId, iceConfig: started.iceConfig }
  )
}

interface StartResponse {
  dailyRoom?: string
  dailyToken?: string
  sessionId?: string
  iceConfig?: unknown
}

/** Forwards to the bot, adding the Pipecat Cloud key if set. */
async function forward(
  url: string,
  config: BotApiConfig,
  init: { method: string; body: string }
): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (config.apiKey) headers.set("Authorization", `Bearer ${config.apiKey}`)

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (error) {
    console.error(`[bot-api] could not reach ${url}:`, error)
    return Response.json(
      { info: `Could not reach the bot at ${new URL(url).origin}` },
      { status: 502 }
    )
  }

  if (!response.ok) {
    // Log the upstream body but don't pass it on: it can name the agent.
    console.error(
      `[bot-api] ${init.method} ${url} → ${String(response.status)}: ${await response.text()}`
    )
    return Response.json(
      { info: `The bot rejected the request (${String(response.status)})` },
      { status: response.status }
    )
  }

  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  })
}

function methodNotAllowed(allow: string): Response {
  return Response.json(
    { info: "Method not allowed" },
    { status: 405, headers: { Allow: allow } }
  )
}
