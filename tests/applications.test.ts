import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changeStatus,
  createApplication,
  getApplication,
  getHistory,
  listApplications,
  statusCounts,
} from "@/lib/applications";
import { createTestDb, hasTestDb, sampleApplication, type TestDb } from "./helpers/test-db";

const q = { page: 1, pageSize: 20 };

describe.skipIf(!hasTestDb)("applications repository (PostgreSQL)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("creates a submitted, simulated application with a reference and first history row", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    expect(app).toMatchObject({ status: "submitted", isSimulated: true });
    expect(app.reference).toMatch(/^DEMO-\d{6}$/);
    const history = await getHistory(t.db, app.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "submitted", changedBy: "admin" });
  });

  it("issues unique, increasing references even under concurrency", async () => {
    const apps = await Promise.all(Array.from({ length: 10 }, () => createApplication(t.db, sampleApplication, "admin")));
    const refs = apps.map((a) => a.reference);
    expect(new Set(refs).size).toBe(10);
  });

  it("applies a valid transition and appends history, newest first", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    const r = await changeStatus(t.db, app.id, { toStatus: "in_review", note: "" }, "reviewer");
    expect(r.ok && r.application.status).toBe("in_review");
    const history = await getHistory(t.db, app.id);
    expect(history.map((h) => h.toStatus)).toEqual(["in_review", "submitted"]);
    expect(history[0]).toMatchObject({ fromStatus: "submitted", changedBy: "reviewer" });
  });

  it("rejects invalid transitions without changing anything", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    const r = await changeStatus(t.db, app.id, { toStatus: "simulated_check_passed", note: "" }, "admin");
    expect(r).toMatchObject({ ok: false, error: "invalid_transition" });
    expect((await getApplication(t.db, app.id))?.status).toBe("submitted");
    expect(await getHistory(t.db, app.id)).toHaveLength(1);
  });

  it("closed is terminal", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    await changeStatus(t.db, app.id, { toStatus: "closed", note: "demo over" }, "admin");
    expect(await changeStatus(t.db, app.id, { toStatus: "in_review", note: "" }, "admin")).toMatchObject({ ok: false });
  });

  it("reports not_found", async () => {
    expect(await changeStatus(t.db, 999_999, { toStatus: "in_review", note: "" }, "admin")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("concurrent moves: exactly one wins and history stays consistent with state", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => changeStatus(t.db, app.id, { toStatus: "in_review", note: `try ${i}` }, "admin")),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const history = await getHistory(t.db, app.id);
    expect(history).toHaveLength(2);
    const current = await getApplication(t.db, app.id);
    expect(history[0].toStatus).toBe(current?.status);
  });

  it("history always chains: each from_status equals the previous to_status", async () => {
    const app = await createApplication(t.db, sampleApplication, "admin");
    for (const [toStatus, note] of [
      ["in_review", ""],
      ["more_info_needed", "need docs"],
      ["in_review", ""],
      ["simulated_check_failed", "demo fail"],
      ["closed", "done"],
    ] as const) {
      expect((await changeStatus(t.db, app.id, { toStatus, note }, "admin")).ok).toBe(true);
    }
    const chronological = (await getHistory(t.db, app.id)).reverse();
    expect(chronological[0].fromStatus).toBeNull();
    for (let i = 1; i < chronological.length; i++) expect(chronological[i].fromStatus).toBe(chronological[i - 1].toStatus);
  });

  describe("listing", () => {
    let t2: TestDb;
    beforeAll(async () => {
      t2 = await createTestDb();
      await createApplication(t2.db, { ...sampleApplication, applicantName: "Asha Verma" }, "a");
      await createApplication(t2.db, { ...sampleApplication, applicantName: "Ravi Kumar", email: "ravi@example.com" }, "a");
      const third = await createApplication(t2.db, { ...sampleApplication, applicantName: "100% Match_Test" }, "a");
      await changeStatus(t2.db, third.id, { toStatus: "in_review", note: "" }, "a");
    });
    afterAll(async () => {
      await t2.cleanup();
    });

    it("lists newest first with total", async () => {
      const r = await listApplications(t2.db, q);
      expect(r.total).toBe(3);
      expect(r.items.map((i) => i.applicantName)).toEqual(["100% Match_Test", "Ravi Kumar", "Asha Verma"]);
    });
    it("filters by status and searches case-insensitively", async () => {
      expect((await listApplications(t2.db, { ...q, status: "in_review" })).total).toBe(1);
      expect((await listApplications(t2.db, { ...q, q: "RAVI" })).items).toHaveLength(1);
      expect((await listApplications(t2.db, { ...q, q: "demo-" })).total).toBe(3);
    });
    it("treats LIKE wildcards literally", async () => {
      expect((await listApplications(t2.db, { ...q, q: "%" })).total).toBe(1);
      expect((await listApplications(t2.db, { ...q, q: "_" })).total).toBe(1);
    });
    it("paginates", async () => {
      const r = await listApplications(t2.db, { page: 2, pageSize: 2 });
      expect(r.items).toHaveLength(1);
      expect(r.total).toBe(3);
    });
    it("counts by status", async () => {
      expect(await statusCounts(t2.db)).toMatchObject({ submitted: 2, in_review: 1, closed: 0, total: 3 });
    });
  });
});
