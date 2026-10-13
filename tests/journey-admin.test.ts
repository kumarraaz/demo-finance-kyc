import { describe, expect, it } from "vitest";
import { createEmptyDraft } from "@/lib/journey/draft";
import { detailOf, matchesFilters, NO_FILTERS, summarizeDraft } from "@/lib/journey/admin-summary";
import { completeDraft, TODAY } from "./helpers/journey-fixtures";

describe("admin journey summary", () => {
  it("summarises a completed journey with masked identity and no sensitive values", async () => {
    const d = await completeDraft();
    const row = summarizeDraft(d, TODAY);
    expect(row).toMatchObject({ reference: d.reference, applicant: "Asha V.", overall: "completed", currentStep: "done", currentStepLabel: "All steps passed" });
    expect(Object.values(row.steps)).toEqual(Array(8).fill("completed"));
    expect(row.reviewFlags).toEqual([]);
    const text = JSON.stringify(detailOf(d, TODAY));
    expect(text).not.toContain("Verma"); // surname masked
    expect(text).not.toContain("9000000001"); // mobile masked
    expect(text).not.toContain("1990-05-15"); // DOB not exposed
    expect(text).not.toContain("12 Demo Street"); // street address not exposed
    expect(text).not.toContain("40000"); // income not exposed
    expect(text).not.toContain("asha@example.com");
    expect(text).toContain("******0001");
    expect(text).toContain("a***@example.com");
    expect(text).toContain("AB******4F");
    expect(detailOf(d, TODAY).basic.ageYears).toBe(36);
  });

  it("reports the current step and flags reviews", async () => {
    const fresh = summarizeDraft(createEmptyDraft("DFK-AAAAA-BBBBB", TODAY), TODAY);
    expect(fresh).toMatchObject({ overall: "not_started", currentStep: "basic", currentStepLabel: "Basic Details" });
    const mid = await completeDraft((x) => { x.liveness = { consent: false, source: "", captured: false }; x.address.matchesDocument = "no"; });
    const row = summarizeDraft(mid, TODAY);
    expect(row.currentStep).toBe("liveness");
    expect(row.reviewFlags).toEqual([{ step: "demographics", label: "Demographic Details", reason: expect.stringContaining("address") }]);
    expect(row.overall).toBe("review_required");
  });

  it("filters by reference, status, current step and created date", async () => {
    const done = summarizeDraft(await completeDraft(), TODAY);
    const early = summarizeDraft(createEmptyDraft("DFK-ZZZZZ-99999", new Date("2026-01-05T00:00:00Z")), TODAY);
    const rows = [done, early];
    const f = (p: Partial<typeof NO_FILTERS>) => rows.filter((r) => matchesFilters(r, { ...NO_FILTERS, ...p })).map((r) => r.reference);
    expect(f({})).toHaveLength(2);
    expect(f({ q: "zzzzz" })).toEqual(["DFK-ZZZZZ-99999"]);
    expect(f({ q: "  abcde " })).toEqual(["DFK-ABCDE-FGHJK"]);
    expect(f({ overall: "completed" })).toEqual(["DFK-ABCDE-FGHJK"]);
    expect(f({ step: "basic" })).toEqual(["DFK-ZZZZZ-99999"]);
    expect(f({ step: "done" })).toEqual(["DFK-ABCDE-FGHJK"]);
    expect(f({ from: "2026-10-01" })).toEqual(["DFK-ABCDE-FGHJK"]);
    expect(f({ to: "2026-06-30" })).toEqual(["DFK-ZZZZZ-99999"]);
    expect(f({ from: "2026-01-05", to: "2026-01-05" })).toEqual(["DFK-ZZZZZ-99999"]);
    expect(f({ q: "nope" })).toEqual([]);
  });
});
