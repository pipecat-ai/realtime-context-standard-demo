import { handleBotApi, readBotApiConfig } from "../server/bot-api.js"

const config = readBotApiConfig(process.env)

/** Vercel function for POST /api/start; see server/bot-api.ts. */
export async function POST(request: Request): Promise<Response> {
  return (
    (await handleBotApi(request, config)) ?? new Response(null, { status: 404 })
  )
}
