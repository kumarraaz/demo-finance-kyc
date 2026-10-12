import { Prisma } from "@/generated/prisma/client";
import type { Application as AppRow, StatusHistory as HistoryRow } from "@/generated/prisma/client";
import type { Db } from "./db";
import { canTransition, type Status } from "./status";
import type { ChangeStatusInput, CreateApplicationInput, ListQuery } from "./validation";

export type Application = {
  id: number;
  reference: string;
  applicantName: string;
  email: string;
  loanProduct: string;
  requestedAmount: number;
  purpose: string;
  status: Status;
  isSimulated: true;
  createdAt: string;
  updatedAt: string;
};

export type HistoryEntry = {
  id: number;
  applicationId: number;
  fromStatus: Status | null;
  toStatus: Status;
  note: string;
  changedBy: string;
  changedAt: string;
};

function toApplication(r: AppRow): Application {
  return {
    id: r.id,
    reference: r.reference,
    applicantName: r.applicantName,
    email: r.email,
    loanProduct: r.loanProduct,
    requestedAmount: r.requestedAmount,
    purpose: r.purpose,
    status: r.status,
    isSimulated: true,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toHistory(r: HistoryRow): HistoryEntry {
  return {
    id: r.id,
    applicationId: r.applicationId,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    note: r.note,
    changedBy: r.changedBy,
    changedAt: r.changedAt.toISOString(),
  };
}

export async function createApplication(db: Db, input: CreateApplicationInput, actor: string): Promise<Application> {
  return db.$transaction(async (tx) => {
    // Reference numbers come from a database sequence: unique, never reused.
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('application_reference_seq') AS n`;
    const reference = `DEMO-${String(n).padStart(6, "0")}`;
    const now = new Date();
    const row = await tx.application.create({
      data: {
        reference,
        applicantName: input.applicantName,
        email: input.email,
        loanProduct: input.loanProduct,
        requestedAmount: input.requestedAmount,
        purpose: input.purpose,
        status: "submitted",
        createdAt: now,
        updatedAt: now,
        history: {
          create: { fromStatus: null, toStatus: "submitted", note: "Demo application created", changedBy: actor, changedAt: now },
        },
      },
    });
    return toApplication(row);
  });
}

export async function getApplication(db: Db, id: number): Promise<Application | null> {
  const row = await db.application.findUnique({ where: { id } });
  return row ? toApplication(row) : null;
}

export async function getHistory(db: Db, applicationId: number): Promise<HistoryEntry[]> {
  const rows = await db.statusHistory.findMany({ where: { applicationId }, orderBy: { id: "desc" } });
  return rows.map(toHistory);
}

// Prisma's `contains` does not escape LIKE wildcards, so "%" or "_" typed by a
// user would match everything. Postgres' default LIKE escape character is a backslash.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listApplications(db: Db, query: ListQuery): Promise<{ items: Application[]; total: number }> {
  const term = query.q ? escapeLike(query.q) : "";
  const where: Prisma.ApplicationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(term
      ? {
          OR: [
            { applicantName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            { reference: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: { id: "desc" },
      take: query.pageSize,
      skip: (query.page - 1) * query.pageSize,
    }),
    db.application.count({ where }),
  ]);
  return { items: rows.map(toApplication), total };
}

export async function statusCounts(db: Db): Promise<Record<Status, number> & { total: number }> {
  const counts = {
    submitted: 0,
    in_review: 0,
    more_info_needed: 0,
    simulated_check_passed: 0,
    simulated_check_failed: 0,
    closed: 0,
    total: 0,
  };
  const groups = await db.application.groupBy({ by: ["status"], _count: { _all: true } });
  for (const g of groups) {
    counts[g.status] = g._count._all;
    counts.total += g._count._all;
  }
  return counts;
}

export type ChangeStatusResult =
  | { ok: true; application: Application }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_transition"; from: Status; to: Status };

export async function changeStatus(db: Db, id: number, input: ChangeStatusInput, actor: string): Promise<ChangeStatusResult> {
  return db.$transaction(async (tx) => {
    const current = await tx.application.findUnique({ where: { id } });
    if (!current) return { ok: false, error: "not_found" } as const;
    if (!canTransition(current.status, input.toStatus)) {
      return { ok: false, error: "invalid_transition", from: current.status, to: input.toStatus } as const;
    }
    const now = new Date();
    // Compare-and-set on the status we just read. If another request moved the
    // application first, zero rows match and we report a conflict instead of
    // writing a history row that contradicts the real state.
    const updated = await tx.application.updateMany({
      where: { id, status: current.status },
      data: { status: input.toStatus, updatedAt: now },
    });
    if (updated.count !== 1) {
      const fresh = await tx.application.findUnique({ where: { id } });
      return { ok: false, error: "invalid_transition", from: fresh?.status ?? current.status, to: input.toStatus } as const;
    }
    await tx.statusHistory.create({
      data: {
        applicationId: id,
        fromStatus: current.status,
        toStatus: input.toStatus,
        note: input.note,
        changedBy: actor,
        changedAt: now,
      },
    });
    const row = await tx.application.findUniqueOrThrow({ where: { id } });
    return { ok: true, application: toApplication(row) } as const;
  });
}
