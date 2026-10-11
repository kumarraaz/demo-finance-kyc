import type { NextRequest } from "next/server";
import { createApplication, listApplications, statusCounts } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { errorJson, getAdminSession, guardWrite, json, readJson } from "@/lib/http";
import { createApplicationSchema, flattenIssues, listQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) return errorJson(401, "unauthorized", "Login required");

  const parsed = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return errorJson(400, "invalid_query", "Invalid query", flattenIssues(parsed.error));

  const db = getDb();
  const [{ items, total }, counts] = await Promise.all([listApplications(db, parsed.data), statusCounts(db)]);
  return json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize, counts });
}

export async function POST(request: NextRequest) {
  const actor = await getAdminSession(request);
  if (!actor) return errorJson(401, "unauthorized", "Login required");
  const blocked = guardWrite(request);
  if (blocked) return blocked;

  const body = await readJson(request);
  if (body === undefined) return errorJson(400, "invalid_json", "Body must be valid JSON");
  const parsed = createApplicationSchema.safeParse(body);
  if (!parsed.success) return errorJson(422, "validation_failed", "Validation failed", flattenIssues(parsed.error));

  return json({ application: await createApplication(getDb(), parsed.data, actor) }, 201);
}
