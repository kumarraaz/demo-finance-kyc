import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeStatus, createApplication, getHistory } from "@/lib/applications";
import { createPrismaClient } from "@/lib/db";
import { createTestDb, hasTestDb, sampleApplication, type TestDb } from "./helpers/test-db";

describe.skipIf(!hasTestDb)("database integrity and persistence (PostgreSQL)", () => {
  let t: TestDb;
  let appId: number;
  beforeAll(async () => {
    t = await createTestDb();
    const app = await createApplication(t.db, sampleApplication, "admin");
    appId = app.id;
    await changeStatus(t.db, appId, { toStatus: "in_review", note: "" }, "admin");
  });
  afterAll(async () => {
    await t.cleanup();
  });

  describe("append-only audit trail", () => {
    it("blocks raw UPDATE", async () => {
      await expect(t.db.$executeRaw`UPDATE status_history SET note = 'tampered'`).rejects.toThrow(/append-only/);
    });
    it("blocks raw DELETE", async () => {
      await expect(t.db.$executeRaw`DELETE FROM status_history`).rejects.toThrow(/append-only/);
    });
    it("blocks TRUNCATE", async () => {
      await expect(t.db.$executeRawUnsafe(`TRUNCATE status_history`)).rejects.toThrow(/append-only/);
    });
    it("blocks Prisma update, delete and deleteMany", async () => {
      const [row] = await t.db.statusHistory.findMany({ take: 1 });
      await expect(t.db.statusHistory.update({ where: { id: row.id }, data: { note: "x" } })).rejects.toThrow(/append-only/);
      await expect(t.db.statusHistory.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
      await expect(t.db.statusHistory.deleteMany({})).rejects.toThrow(/append-only/);
    });
    it("leaves history unchanged after all the attempts", async () => {
      expect((await getHistory(t.db, appId)).map((h) => h.note)).toEqual(["", "Demo application created"]);
    });
    it("cannot delete an application that has history (foreign key RESTRICT)", async () => {
      await expect(t.db.application.delete({ where: { id: appId } })).rejects.toThrow();
    });
  });

  describe("constraints", () => {
    const insert = (over: Record<string, unknown>) => {
      const row = {
        reference: `DEMO-${Math.floor(Math.random() * 1e9)}`,
        applicant_name: "X Y",
        email: "x@example.com",
        loan_product: "personal",
        requested_amount: 5000,
        status: "submitted",
        is_simulated: true,
        ...over,
      };
      return t.db.$executeRawUnsafe(
        `INSERT INTO applications (reference, applicant_name, email, loan_product, requested_amount, status, is_simulated)
         VALUES ($1, $2, $3, $4::loan_product, $5, $6::application_status, $7)`,
        row.reference, row.applicant_name, row.email, row.loan_product, row.requested_amount, row.status, row.is_simulated,
      );
    };
    it("accepts a well-formed row (control)", async () => {
      await expect(insert({})).resolves.toBe(1);
    });
    it("rejects statuses outside the enum, e.g. 'approved'", async () => {
      await expect(insert({ status: "approved" })).rejects.toThrow();
    });
    it("rejects unknown loan products", async () => {
      await expect(insert({ loan_product: "crypto" })).rejects.toThrow();
    });
    it("rejects non-simulated records", async () => {
      await expect(insert({ is_simulated: false })).rejects.toThrow(/is_simulated_true/);
    });
    it("rejects non-positive amounts", async () => {
      await expect(insert({ requested_amount: 0 })).rejects.toThrow(/amount_positive/);
    });
    it("rejects malformed references", async () => {
      await expect(insert({ reference: "LOAN-APPROVED" })).rejects.toThrow(/reference_format/);
    });
    it("rejects duplicate references", async () => {
      await insert({ reference: "DEMO-777777" });
      await expect(insert({ reference: "DEMO-777777" })).rejects.toThrow(/Unique|unique|duplicate/);
    });
    it("rejects a history row that does not change status", async () => {
      await expect(
        t.db.$executeRaw`INSERT INTO status_history (application_id, from_status, to_status, changed_by)
                         VALUES (${appId}, 'closed'::application_status, 'closed'::application_status, 'x')`,
      ).rejects.toThrow(/status_changes/);
    });
    it("rejects history for a missing application", async () => {
      await expect(
        t.db.$executeRaw`INSERT INTO status_history (application_id, to_status, changed_by)
                         VALUES (999999, 'submitted'::application_status, 'x')`,
      ).rejects.toThrow();
    });
  });

  describe("persistence", () => {
    it("data written through one client is visible to a brand-new connection", async () => {
      const second = createPrismaClient(t.url, { schema: t.schema, maxConnections: 2 });
      try {
        const app = await second.application.findUnique({ where: { id: appId } });
        expect(app?.status).toBe("in_review");
        expect(await second.statusHistory.count({ where: { applicationId: appId } })).toBe(2);
      } finally {
        await second.$disconnect();
      }
    });
    it("a failed transaction leaves nothing behind", async () => {
      const before = await t.db.application.count();
      await expect(
        t.db.$transaction(async (tx) => {
          await tx.application.create({
            data: { reference: "DEMO-888888", applicantName: "Rollback", email: "r@example.com", loanProduct: "home", requestedAmount: 9999, status: "submitted" },
          });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await t.db.application.count()).toBe(before);
    });
  });
});
