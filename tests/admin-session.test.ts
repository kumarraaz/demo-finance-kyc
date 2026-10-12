import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revokeAdminSession, startAdminSession, validateAdminSession } from "@/lib/admin-session";
import { createSessionToken } from "@/lib/session";
import { createTestDb, hasTestDb, type TestDb } from "./helpers/test-db";

const SECRET = "k".repeat(48);

describe.skipIf(!hasTestDb)("server-side admin sessions (PostgreSQL)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("a freshly started session validates", async () => {
    const token = await startAdminSession(t.db, "admin", SECRET);
    expect(await validateAdminSession(t.db, token, SECRET, "admin")).toBe("admin");
  });

  it("rejects the wrong secret, wrong expected user, garbage and missing tokens", async () => {
    const token = await startAdminSession(t.db, "admin", SECRET);
    expect(await validateAdminSession(t.db, token, "z".repeat(48), "admin")).toBeNull();
    expect(await validateAdminSession(t.db, token, SECRET, "someone-else")).toBeNull();
    expect(await validateAdminSession(t.db, "garbage", SECRET, "admin")).toBeNull();
    expect(await validateAdminSession(t.db, undefined, SECRET, "admin")).toBeNull();
  });

  it("revocation takes effect immediately, even though the cookie signature is still valid", async () => {
    const token = await startAdminSession(t.db, "admin", SECRET);
    await revokeAdminSession(t.db, token, SECRET);
    expect(await validateAdminSession(t.db, token, SECRET, "admin")).toBeNull();
  });

  it("rejects a correctly signed token whose session row does not exist", async () => {
    const forgedButSigned = await createSessionToken("admin", "00000000-0000-4000-8000-000000000000", SECRET);
    expect(await validateAdminSession(t.db, forgedButSigned, SECRET, "admin")).toBeNull();
  });

  it("rejects an expired server-side session", async () => {
    const token = await startAdminSession(t.db, "admin", SECRET);
    await t.db.$executeRaw`UPDATE admin_sessions SET expires_at = now() - interval '1 minute' WHERE revoked_at IS NULL`;
    expect(await validateAdminSession(t.db, token, SECRET, "admin")).toBeNull();
  });

  it("revoking one session does not affect another", async () => {
    const a = await startAdminSession(t.db, "admin", SECRET);
    const b = await startAdminSession(t.db, "admin", SECRET);
    await revokeAdminSession(t.db, a, SECRET);
    expect(await validateAdminSession(t.db, b, SECRET, "admin")).toBe("admin");
  });
});
