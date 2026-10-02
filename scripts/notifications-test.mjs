import assert from "node:assert/strict";
import { audiencesForUser } from "../src/lib/notifications.ts";

assert.deepEqual(
  audiencesForUser("u_1", "user"),
  ["user:u_1"],
  "regular members should only receive their personal inbox audience",
);

assert.deepEqual(
  audiencesForUser("u_2", "admin"),
  ["admin", "user:u_2"],
  "admins should receive both global admin notices and personal access changes",
);

assert.deepEqual(
  audiencesForUser("u_3", "admin,member"),
  ["admin", "user:u_3"],
  "comma-separated roles should still include the admin inbox",
);

console.log("notification audience tests passed");
