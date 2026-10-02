import assert from "node:assert/strict";
import { chunkItems } from "../src/lib/chunk-items.ts";

const repos = Array.from({ length: 29 }, (_, index) => index + 1);
const batches = chunkItems(repos, 5);

assert.equal(batches.length, 6, "29 repositories must be split into six writes");
assert.deepEqual(
	batches.map((batch) => batch.length),
	[5, 5, 5, 5, 5, 4],
	"each write must remain small enough for D1's parameter limit",
);
assert.deepEqual(
	batches.flat(),
	repos,
	"batching must preserve every repository and its order",
);

console.log("github sync batching test passed");
