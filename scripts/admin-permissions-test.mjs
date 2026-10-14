import assert from "node:assert/strict";
import { canChangeAdminState, countOtherActiveAdmins } from "../src/lib/admin-guards.ts";
import { ADMIN_ROLES, PROJECT_ROLES, hasRole } from "../src/lib/roles.ts";

assert.equal(hasRole("admin", ADMIN_ROLES), true, "admin should satisfy ADMIN_ROLES");
assert.equal(hasRole("member", PROJECT_ROLES), true, "member should satisfy PROJECT_ROLES");
assert.equal(hasRole("garbage", PROJECT_ROLES), false, "unknown roles must fail closed");

assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "member",
    nextBanned: false,
    remainingOtherAdmins: 0,
  }),
  { ok: false, reason: "Cannot remove the final administrator." },
  "the final admin cannot be demoted",
);

assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "admin",
    nextBanned: true,
    remainingOtherAdmins: 0,
  }),
  { ok: false, reason: "Cannot suspend the final administrator." },
  "the final admin cannot be suspended",
);

assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "member",
    nextBanned: false,
    remainingOtherAdmins: 2,
  }),
  { ok: true },
  "demotion is allowed when other admins remain",
);

// Comma-separated roles are valid (better-auth joins role arrays with ","),
// so the guard must use hasRole() — an exact `=== "admin"` check let the
// final "admin,member" administrator demote themselves and lock everyone out.
assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin,member",
    currentBanned: false,
    nextRole: "member",
    nextBanned: false,
    remainingOtherAdmins: 0,
  }),
  { ok: false, reason: "Cannot remove the final administrator." },
  "a final admin holding a comma-separated role cannot be demoted",
);

assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "admin,member",
    nextBanned: false,
    remainingOtherAdmins: 0,
  }),
  { ok: true },
  "a new role that still includes admin is not a demotion",
);

// Mirrors better-auth's own banUser: an admin may never suspend themselves,
// even when other administrators remain.
assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "admin",
    nextBanned: true,
    remainingOtherAdmins: 3,
    actingOnSelf: true,
  }),
  { ok: false, reason: "You cannot suspend your own account." },
  "an admin cannot suspend their own account",
);

assert.deepEqual(
  canChangeAdminState({
    currentRole: "admin",
    currentBanned: false,
    nextRole: "member",
    nextBanned: false,
    remainingOtherAdmins: 1,
    actingOnSelf: true,
  }),
  { ok: true },
  "self-demotion stays allowed while another admin remains (matches better-auth)",
);

assert.equal(
  countOtherActiveAdmins(
    [
      { id: "self", role: "admin", banned: false },
      { id: "a", role: "admin", banned: false },
      { id: "b", role: "admin,member", banned: false },
      { id: "c", role: "admin", banned: true },
      { id: "d", role: "member", banned: false },
      { id: "e", role: null, banned: null },
    ],
    "self",
  ),
  2,
  "only unbanned admins other than the target count, comma roles included",
);

console.log("admin permission tests passed");
