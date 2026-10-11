import { beforeEach, describe, expect, it } from "vitest";
import {
  changeStatus,
  createApplication,
  getApplication,
  getHistory,
  listApplications,
  statusCounts,
} from "@/lib/applications";
import { openDatabase, type Db } from "@/lib/db";
import type { CreateApplicationInput } from "@/lib/validation";

const input = (over: Partial<CreateApplicationInput> = {}): CreateApplicationInput => ({
  applicantName: "Asha Verma",
  email: "asha@example.com",
  loanProduct: "personal",
  requestedAmount: 50000,
  purpose: "",
  ...over,
});
const q = { page: 1, pageSize: 20 };

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("createApplication", () => {
  it("creates a submitted, simulated application with a reference and first history row", () => {
    const app = createApplication(db, input(), "admin");
    expect(app).toMatchObject({ id: 1, reference: "DEMO-000001", status: "submitted", isSimulated: true });
    const history = getHistory(db, app.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "submitted", changedBy: "admin" });
  });
});

describe("changeStatus", () => {
  it("applies a valid transition and appends history, newest first", () => {
    const app = createApplication(db, input(), "admin");
    const r = changeStatus(db, app.id, { toStatus: "in_review", note: "" }, "reviewer");
    expect(r.ok && r.application.status).toBe("in_review");
    const history = getHistory(db, app.id);
    expect(history.map((h) => h.toStatus)).toEqual(["in_review", "submitted"]);
    expect(history[0]).toMatchObject({ fromStatus: "submitted", changedBy: "reviewer" });
  });
  it("rejects invalid transitions without changing anything", () => {
    const app = createApplication(db, input(), "admin");
    const r = changeStatus(db, app.id, { toStatus: "simulated_check_passed", note: "" }, "admin");
    expect(r).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(getApplication(db, app.id)?.status).toBe("submitted");
    expect(getHistory(db, app.id)).toHaveLength(1);
  });
  it("cannot leave closed", () => {
    const app = createApplication(db, input(), "admin");
    changeStatus(db, app.id, { toStatus: "closed", note: "demo over" }, "admin");
    expect(changeStatus(db, app.id, { toStatus: "in_review", note: "" }, "admin")).toMatchObject({ ok: false });
  });
  it("reports not_found", () => {
    expect(changeStatus(db, 999, { toStatus: "in_review", note: "" }, "admin")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("audit trail integrity", () => {
  it("history rows cannot be updated or deleted", () => {
    const app = createApplication(db, input(), "admin");
    expect(() => db.prepare("UPDATE status_history SET note = 'x' WHERE application_id = ?").run(app.id)).toThrow(
      /append-only/,
    );
    expect(() => db.prepare("DELETE FROM status_history WHERE application_id = ?").run(app.id)).toThrow(/append-only/);
  });
  it("database refuses unknown statuses and non-simulated records", () => {
    const app = createApplication(db, input(), "admin");
    expect(() => db.prepare("UPDATE applications SET status = 'approved' WHERE id = ?").run(app.id)).toThrow();
    expect(() => db.prepare("UPDATE applications SET is_simulated = 0 WHERE id = ?").run(app.id)).toThrow();
  });
});

describe("listApplications", () => {
  beforeEach(() => {
    createApplication(db, input({ applicantName: "Asha Verma" }), "a");
    createApplication(db, input({ applicantName: "Ravi Kumar", email: "ravi@example.com" }), "a");
    const third = createApplication(db, input({ applicantName: "100% Match_Test" }), "a");
    changeStatus(db, third.id, { toStatus: "in_review", note: "" }, "a");
  });
  it("lists newest first with total", () => {
    const r = listApplications(db, q);
    expect(r.total).toBe(3);
    expect(r.items.map((i) => i.id)).toEqual([3, 2, 1]);
  });
  it("filters by status and search", () => {
    expect(listApplications(db, { ...q, status: "in_review" }).total).toBe(1);
    expect(listApplications(db, { ...q, q: "ravi" }).items).toHaveLength(1);
    expect(listApplications(db, { ...q, q: "DEMO-000002" }).items).toHaveLength(1);
  });
  it("treats LIKE wildcards literally", () => {
    expect(listApplications(db, { ...q, q: "%" }).total).toBe(1);
    expect(listApplications(db, { ...q, q: "_" }).total).toBe(1);
  });
  it("paginates", () => {
    const r = listApplications(db, { page: 2, pageSize: 2 });
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(3);
  });
  it("counts by status", () => {
    expect(statusCounts(db)).toMatchObject({ submitted: 2, in_review: 1, closed: 0, total: 3 });
  });
});
