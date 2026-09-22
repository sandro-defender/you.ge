/**
 * Internal request header used to pass an already-validated session from the
 * Worker entry point (src/server.ts) to TanStack Start server functions
 * (src/lib/session-fn.ts).
 *
 * WHY THIS LIVES IN ITS OWN MODULE
 * Both the server entry and a client-reachable server function need this
 * string. If the server function imported it from src/server.ts, the bundler
 * would pull that whole module — Hono, better-auth, Drizzle and the D1 binding
 * types — into the BROWSER bundle. Keeping the constant in a dependency-free
 * leaf module makes that impossible.
 *
 * SECURITY
 * src/server.ts strips this header from every inbound request before doing
 * anything else, and sets it only on requests whose session it has validated.
 * A client cannot forge it.
 */
export const INTERNAL_SESSION_HEADER = "x-youge-session";
