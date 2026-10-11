import { getDb } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public and deliberately minimal: reports only whether the app can reach its database.
export async function GET() {
  const base = { mode: "demo", verification: "simulated" };
  try {
    await getDb().$queryRaw`SELECT 1`;
    return json({ status: "ok", database: "up", ...base });
  } catch {
    return json({ status: "degraded", database: "down", ...base }, 503);
  }
}
