import { listQuerySchema, type ListQuery } from "./validation";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Reads the list page's query string.
 * - A blank value is the same as absent (the "All statuses" option submits `status=`).
 * - An invalid value is dropped on its own, so one bad parameter cannot discard the others
 *   (a mistyped `status` must not throw away the search text).
 * The JSON API keeps its strict validation; this is only for the page.
 */
export function parseListSearchParams(raw: RawParams): ListQuery {
  const shape = listQuerySchema.shape;
  const clean: Record<string, string> = {};
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const first = Array.isArray(raw[key]) ? raw[key][0] : raw[key];
    if (typeof first !== "string" || first.trim() === "") continue;
    if (shape[key].safeParse(first).success) clean[key] = first;
  }
  return listQuerySchema.parse(clean);
}
