import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(projectDir, "github-pages"),
  base: "/2026-timetable/",
  publicDir: path.join(projectDir, "public"),
  plugins: [react()],
  build: {
    outDir: path.join(projectDir, "dist-pages"),
    emptyOutDir: true,
  },
});
