import type { NextRequest } from "next/server";
import { createApplication, listApplications, statusCounts } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { errorJson, getAdminSession, isSameOrigin, json, readJson } from "@/lib/http";
import { createApplicationSchema, flattenIssues, listQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) return errorJson(401, "unauthorized", "Login required");

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return errorJson(400, "invalid_query", "Invalid query", flattenIssues(parsed.error));

  const db = getDb();
  const { items, total } = listApplications(db, parsed.data);
  return json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize, counts: statusCounts(db) });
}

export async function POST(request: NextRequest) {
  const actor = await getAdminSession(request);
  if (!actor) return errorJson(401, "unauthorized", "Login required");
  if (!isSameOrigin(request)) return errorJson(403, "bad_origin", "Cross-origin request blocked");

  const body = await readJson(request);
  if (body === undefined) return errorJson(400, "invalid_json", "Body must be valid JSON");
  const parsed = createApplicationSchema.safeParse(body);
  if (!parsed.success) return errorJson(422, "validation_failed", "Validation failed", flattenIssues(parsed.error));

  return json({ application: createApplication(getDb(), parsed.data, actor) }, 201);
}
