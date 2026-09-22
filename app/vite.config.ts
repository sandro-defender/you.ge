import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

/**
 * CLIENT-ONLY stub for `@better-auth/core/env` — see the doc comment on
 * src/build/better-auth-core-env-client-stub.ts for the full leak story.
 *
 * Why a resolveId plugin instead of `resolve.alias`:
 *   1. Vite deliberately does NOT support per-environment aliases — every
 *      environment receives the top-level alias ("alias … [is] not a
 *      per-environment option" in vite's own source). A top-level alias would
 *      also rewrite the SSR/Worker build, where better-auth MUST read the real
 *      env module.
 *   2. Vite's deprecation warning for alias `customResolver` says to "use a
 *      custom plugin with a resolveId hook and `enforce: 'pre'` instead" —
 *      this is that pattern, gated on `this.environment.name === "client"`.
 */
function betterAuthEnvClientStub(): Plugin {
	const stub = fileURLToPath(
		new URL("./src/build/better-auth-core-env-client-stub.ts", import.meta.url),
	);
	return {
		name: "youge:better-auth-env-client-stub",
		enforce: "pre",
		resolveId(source) {
			if (source === "@better-auth/core/env" && this.environment?.name === "client") {
				return stub;
			}
			return null;
		},
	};
}

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
		betterAuthEnvClientStub(),
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
