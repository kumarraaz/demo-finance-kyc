import type { NextRequest } from "next/server";
import { getApplication, getHistory } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { errorJson, getAdminSession, json, parseId } from "@/lib/http";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession(request))) return errorJson(401, "unauthorized", "Login required");
  const id = parseId((await ctx.params).id);
  if (id === null) return errorJson(400, "invalid_id", "Invalid application id");

  const db = getDb();
  const application = await getApplication(db, id);
  if (!application) return errorJson(404, "not_found", "Application not found");
  return json({ application, history: await getHistory(db, id) });
}
