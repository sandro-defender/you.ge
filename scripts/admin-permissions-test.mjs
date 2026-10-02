import assert from "node:assert/strict";
import { canChangeAdminState } from "../src/lib/admin-guards.ts";
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

console.log("admin permission tests passed");
