import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    {
      name: "legal-pages",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url?.split("?")[0]
          if (url === "/privacy" || url === "/privacy/") req.url = "/privacy/index.html"
          if (url === "/terms" || url === "/terms/") req.url = "/terms/index.html"
          next()
        })
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
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
        navigateFallbackDenylist: [/\/privacy\/?$/, /\/terms\/?$/],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
})
