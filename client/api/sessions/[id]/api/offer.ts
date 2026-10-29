import { handleBotApi, readBotApiConfig } from "../../../../server/bot-api.js"

const config = readBotApiConfig(process.env)

/** Vercel function relaying SmallWebRTC offers; see server/bot-api.ts. */
async function relay(request: Request): Promise<Response> {
  return (
    (await handleBotApi(request, config)) ?? new Response(null, { status: 404 })
  )
}

export { relay as PATCH, relay as POST }
