import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The dev server proxies the API, and that is not a convenience.
 *
 * Decionis allowlists the decionis.com origins for browser calls and refuses
 * everything else — verified: a preflight from https://decionis.com answers
 * 204, one from http://localhost:5199 answers 404. So a forked copy of this
 * app cannot call the API directly from a browser, and "clone it and run it"
 * would be a promise that fails on the first button.
 *
 * The proxy sidesteps that honestly rather than by weakening anything: the
 * request is made by the dev server, server to server, where CORS does not
 * apply at all. Nothing about the production policy changes, and the app
 * still talks to the real API with a real workspace.
 *
 * Deploying a fork somewhere public needs the same shape — your own small
 * proxy, or your origin added to the allowlist. The README says so.
 */
const API_TARGET = process.env.DECIONIS_API ?? "https://api.decionis.com";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/decionis-api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/decionis-api/, ""),
      },
    },
  },
});
