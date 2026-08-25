import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    cacheDir: "node_modules/.vite",
    environments: {
      client: {
        optimizeDeps: {
          noDiscovery: true,
        },
      },
    },
    optimizeDeps: {
      // Avoid filesystem-wide dependency discovery on deeply nested Windows workspaces.
      noDiscovery: true,
    },
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts/")) return "charts";
            if (id.includes("node_modules/html2canvas/") || id.includes("node_modules/jspdf/")) {
              return "pdf";
            }
            if (id.includes("node_modules/@supabase/")) return "supabase";
          },
        },
      },
    },
    plugins: [
      {
        name: "biotrack-windows-dev-deps",
        apply: "serve",
        enforce: "post",
        configResolved(config) {
          const client = config.environments.client;
          client.optimizeDeps.noDiscovery = true;
          client.optimizeDeps.include = [];
        },
      },
      // The MCP plugin currently normalizes Vite's root but not routesDir on Windows.
      // Lovable builds on Linux, where the plugin remains enabled.
      ...(process.platform === "win32" ? [] : [mcpPlugin()]),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/healthz$/, /^\/client-errors$/],
        },
        manifest: {
          name: "BioTrack",
          short_name: "BioTrack",
          description: "Sistema de gestión y seguimiento biológico",
          theme_color: "#0a0f1e",
          background_color: "#0a0f1e",
          display: "standalone",
          orientation: "portrait",
          shortcuts: [
            {
              name: "Operar cajas",
              short_name: "Operar",
              url: "/operate",
              icons: [{ src: "/icon-192.png", sizes: "192x192" }],
            },
            {
              name: "Alertas",
              short_name: "Alertas",
              url: "/alerts",
              icons: [{ src: "/icon-192.png", sizes: "192x192" }],
            },
          ],
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],
  },
});
