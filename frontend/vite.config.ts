import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const desktopBackend = "http://127.0.0.1:34116";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify("1.1.0"),
    "process.env.NEXT_PUBLIC_DOC_URL": JSON.stringify("https://docs.canvas.best"),
    "process.env.NEXT_PUBLIC_DEV_BACKEND": JSON.stringify(""),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "next/navigation": path.resolve(__dirname, "src/compat/next-navigation.ts"),
      "next/link": path.resolve(__dirname, "src/compat/next-link.tsx"),
      "next/image": path.resolve(__dirname, "src/compat/next-image.tsx"),
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  server: {
    host: "127.0.0.1",
    port: 34115,
    strictPort: true,
    proxy: {
      "/client-api": desktopBackend,
      "/local-relay-proxy": desktopBackend,
      "/webdav-proxy": desktopBackend,
      "/api": desktopBackend,
      "/v1": desktopBackend,
      "/auth": desktopBackend,
      "/images": desktopBackend,
      "/api-backend": desktopBackend,
    },
  },
});
