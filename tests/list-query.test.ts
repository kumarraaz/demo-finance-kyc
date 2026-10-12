import { describe, expect, it } from "vitest";
import { parseListSearchParams } from "@/lib/list-query";

describe("parseListSearchParams", () => {
  it("applies defaults when nothing is given", () => {
    expect(parseListSearchParams({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("treats the blank 'All statuses' value as absent and keeps the search text", () => {
    // The filter form submits status= when "All statuses" is selected.
    const q = parseListSearchParams({ q: "Rohan", status: "" });
    expect(q.q).toBe("Rohan");
    expect(q.status).toBeUndefined();
  });

  it("drops an invalid value without discarding the valid ones", () => {
    const q = parseListSearchParams({ q: "ann", status: "approved", page: "2" });
    expect(q.q).toBe("ann");
    expect(q.status).toBeUndefined();
    expect(q.page).toBe(2);
  });

  it("accepts a real status and uses the first value of repeated parameters", () => {
    expect(parseListSearchParams({ status: ["closed", "submitted"] }).status).toBe("closed");
  });

  it("ignores out-of-range paging instead of failing", () => {
    expect(parseListSearchParams({ page: "0" }).page).toBe(1);
    expect(parseListSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseListSearchParams({ pageSize: "5000" }).pageSize).toBe(20);
  });

  it("ignores unknown parameters", () => {
    expect(parseListSearchParams({ sort: "desc", __proto__: "x" } as never)).toEqual({ page: 1, pageSize: 20 });
  });
});
