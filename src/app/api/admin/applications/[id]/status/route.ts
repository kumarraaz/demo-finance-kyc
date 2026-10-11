import type { NextRequest } from "next/server";
import { changeStatus, getHistory } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { errorJson, getAdminSession, isSameOrigin, json, parseId, readJson } from "@/lib/http";
import { STATUS_LABELS } from "@/lib/status";
import { changeStatusSchema, flattenIssues } from "@/lib/validation";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAdminSession(request);
  if (!actor) return errorJson(401, "unauthorized", "Login required");
  if (!isSameOrigin(request)) return errorJson(403, "bad_origin", "Cross-origin request blocked");

  const id = parseId((await ctx.params).id);
  if (id === null) return errorJson(400, "invalid_id", "Invalid application id");

  const body = await readJson(request);
  if (body === undefined) return errorJson(400, "invalid_json", "Body must be valid JSON");
  const parsed = changeStatusSchema.safeParse(body);
  if (!parsed.success) return errorJson(422, "validation_failed", "Validation failed", flattenIssues(parsed.error));

  const db = getDb();
  const result = changeStatus(db, id, parsed.data, actor);
  if (!result.ok) {
    if (result.error === "not_found") return errorJson(404, "not_found", "Application not found");
    return errorJson(
      409,
      "invalid_transition",
      `Cannot move from "${STATUS_LABELS[result.from]}" to "${STATUS_LABELS[result.to]}"`,
    );
  }
  return json({ application: result.application, history: getHistory(db, id) });
}
