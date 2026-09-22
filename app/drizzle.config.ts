import { defineConfig } from "drizzle-kit";

// drizzle-kit only GENERATES SQL from the schema. Applying it is done by
// wrangler (`npm run db:migrate:local` / `db:migrate:remote`), because D1 is a
// Workers binding and has no TCP connection string — so `dialect: "sqlite"`
// with no `dbCredentials` is correct here, not an oversight.
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	verbose: true,
	strict: true,
});
