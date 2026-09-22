import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

// Plugin order matters. `cloudflare()` must come first so that the SSR
// environment it creates exists before tanstackStart() and react() attach to
// it. `viteEnvironment.name: "ssr"` tells the Cloudflare plugin that this
// Worker does server-side rendering (as opposed to being a plain API Worker).
//
// This is the exact configuration from Cloudflare's official TanStack Start
// framework guide:
// https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tanstackStart(),
		react(),
	],
	resolve: {
		alias: {
			"@": new URL("./src", import.meta.url).pathname,
		},
	},
	server: {
		// Bind 0.0.0.0 so the dev server is reachable outside localhost.
		host: "0.0.0.0",
		port: 3000,
	},
});
