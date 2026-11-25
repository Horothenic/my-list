import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

function safariFavicon(): Plugin {
  return {
    name: "safari-favicon",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html.replace(
          /<link rel="shortcut icon"[^>]*>/,
          '<link rel="shortcut icon" type="image/x-icon" href="favicon.ico?v=4">',
        )
      },
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/my-list/" : "/",
  plugins: [
    react(),
    safariFavicon(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "My List",
        short_name: "My List",
        description: "Dailies and todos kept in a file you own.",
        theme_color: "#24292F",
        background_color: "#1E2227",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/favicon\.ico/],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
})
