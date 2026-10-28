import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"

import type { Connect, Plugin } from "vite"

import { handleBotApi, type BotApiConfig } from "./bot-api.ts"

/** Serves the bot API from `vite dev` and `vite preview`. */
export function botApi(config: BotApiConfig): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) {
      next()
      return
    }
    handleBotApi(toRequest(req), config)
      .then((response) => (response ? send(response, res) : next()))
      .catch(next)
  }

  return {
    name: "bot-api",
    configureServer: (server) => {
      server.middlewares.use(middleware)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware)
    },
  }
}

/** Node's request as a Fetch API Request. */
function toRequest(req: IncomingMessage): Request {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`
  )
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  return new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, String(value)] as [string, string]]
    ),
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: hasBody ? "half" : undefined,
  })
}

/** Writes a Fetch API Response to Node's response. */
async function send(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })
  res.end(Buffer.from(await response.arrayBuffer()))
}
