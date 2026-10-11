import type { Db } from "./db";
import { canTransition, isStatus, type Status } from "./status";
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

type AppRow = {
  id: number;
  reference: string;
  applicant_name: string;
  email: string;
  loan_product: string;
  requested_amount: number;
  purpose: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: number;
  application_id: number;
  from_status: string | null;
  to_status: string;
  note: string;
  changed_by: string;
  changed_at: string;
};

function toApplication(r: AppRow): Application {
  if (!isStatus(r.status)) throw new Error(`Unknown status in database: ${r.status}`);
  return {
    id: r.id,
    reference: r.reference,
    applicantName: r.applicant_name,
    email: r.email,
    loanProduct: r.loan_product,
    requestedAmount: r.requested_amount,
    purpose: r.purpose,
    status: r.status,
    isSimulated: true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toHistory(r: HistoryRow): HistoryEntry {
  if (!isStatus(r.to_status)) throw new Error(`Unknown status in database: ${r.to_status}`);
  return {
    id: r.id,
    applicationId: r.application_id,
    fromStatus: r.from_status && isStatus(r.from_status) ? r.from_status : null,
    toStatus: r.to_status,
    note: r.note,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
  };
}

export function createApplication(db: Db, input: CreateApplicationInput, actor: string): Application {
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO applications
           (applicant_name, email, loan_product, requested_amount, purpose, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
      )
      .run(input.applicantName, input.email, input.loanProduct, input.requestedAmount, input.purpose, now, now);
    const id = Number(info.lastInsertRowid);
    const reference = `DEMO-${String(id).padStart(6, "0")}`;
    db.prepare("UPDATE applications SET reference = ? WHERE id = ?").run(reference, id);
    db.prepare(
      `INSERT INTO status_history (application_id, from_status, to_status, note, changed_by, changed_at)
       VALUES (?, NULL, 'submitted', 'Demo application created', ?, ?)`,
    ).run(id, actor, now);
    return id;
  });
  const id = run();
  return getApplication(db, id)!;
}

export function getApplication(db: Db, id: number): Application | null {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as AppRow | undefined;
  return row ? toApplication(row) : null;
}

export function getHistory(db: Db, applicationId: number): HistoryEntry[] {
  const rows = db
    .prepare("SELECT * FROM status_history WHERE application_id = ? ORDER BY id DESC")
    .all(applicationId) as HistoryRow[];
  return rows.map(toHistory);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function listApplications(db: Db, query: ListQuery): { items: Application[]; total: number } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.status) {
    where.push("status = ?");
    params.push(query.status);
  }
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    where.push("(applicant_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM applications ${clause}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM applications ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as AppRow[];
  return { items: rows.map(toApplication), total };
}

export function statusCounts(db: Db): Record<Status, number> & { total: number } {
  const counts = {
    submitted: 0,
    in_review: 0,
    more_info_needed: 0,
    simulated_check_passed: 0,
    simulated_check_failed: 0,
    closed: 0,
    total: 0,
  };
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM applications GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  for (const r of rows) {
    if (isStatus(r.status)) counts[r.status] = r.n;
    counts.total += r.n;
  }
  return counts;
}

export type ChangeStatusResult =
  | { ok: true; application: Application }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_transition"; from: Status; to: Status };

export function changeStatus(db: Db, id: number, input: ChangeStatusInput, actor: string): ChangeStatusResult {
  const run = db.transaction((): ChangeStatusResult => {
    const current = getApplication(db, id);
    if (!current) return { ok: false, error: "not_found" };
    if (!canTransition(current.status, input.toStatus)) {
      return { ok: false, error: "invalid_transition", from: current.status, to: input.toStatus };
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?").run(input.toStatus, now, id);
    db.prepare(
      `INSERT INTO status_history (application_id, from_status, to_status, note, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, current.status, input.toStatus, input.note, actor, now);
    return { ok: true, application: getApplication(db, id)! };
  });
  return run.immediate();
}
