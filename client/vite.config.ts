import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { readBotApiConfig } from "./server/bot-api.ts"
import { botApi } from "./server/vite-plugin.ts"

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
    build: {
      rolldownOptions: {
        output: {
          // Libraries in chunks of their own, each under Vite's 500 kB
          // warning, and cached across deploys that change only the app.
          // The transports stay out of the groups, in the chunk the client's
          // transportFactory imports.
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: "pipecat",
                test: /node_modules[\\/]@pipecat-ai[\\/]client-(js|react)[\\/]/,
              },
              {
                name: "vendor",
                // The package's own node_modules, past pnpm's .pnpm store.
                test: /node_modules[\\/](?!.*node_modules[\\/])(?!@pipecat-ai[\\/]|@daily-co[\\/])/,
              },
            ],
          },
        },
      },
    },
  }
})
