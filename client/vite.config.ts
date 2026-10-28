import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { readBotApiConfig } from "./server/bot-api"
import { botApi } from "./server/vite-plugin"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // All env vars, for the bot API's key; only VITE_ ones reach the bundle.
  const env = loadEnv(mode, import.meta.dirname, "")

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      botApi(readBotApiConfig(env)),
    ],
    resolve: {
      alias: { "@": new URL("./src", import.meta.url).pathname },
    },
  }
})
