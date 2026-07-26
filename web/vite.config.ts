import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * The dataset directory doubles as Vite's publicDir, so dataset.json (and the
 * ics feed) are served at the site root in dev and copied into dist on build.
 * The private deployment points STUDIOWEEK_DATA at its own data directory and
 * gets the same frontend over real data.
 */
export default defineConfig({
  base: "./",
  publicDir: process.env.STUDIOWEEK_DATA ?? resolve(__dirname, "../demo/data"),
  build: { outDir: "dist" },
});
