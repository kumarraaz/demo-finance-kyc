import { getDb } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Tables the app cannot work without. If any is missing, migrations were not applied.
const REQUIRED_TABLES = ["applications", "status_history", "admin_sessions", "rate_limits"];

// Public and deliberately minimal: reports only whether the app can reach its
// database and whether the schema looks migrated. No connection details, no error text.
export async function GET() {
  const base = { mode: "demo", verification: "simulated" };
  try {
    const db = getDb();
    const rows = await db.$queryRaw<{ name: string; found: boolean }[]>`
      SELECT t.name, to_regclass(t.name) IS NOT NULL AS found
      FROM unnest(${REQUIRED_TABLES}::text[]) AS t(name)`;
    const missing = rows.filter((r) => !r.found);
    if (missing.length > 0) {
      // 503: the database answers but the app cannot serve requests until migrations are applied.
      return json({ status: "degraded", database: "up", schema: "missing", ...base }, 503);
    }
    return json({ status: "ok", database: "up", schema: "ok", ...base });
  } catch {
    return json({ status: "degraded", database: "down", ...base }, 503);
  }
}
