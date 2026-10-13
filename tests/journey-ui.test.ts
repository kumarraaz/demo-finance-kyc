import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CALCULATION_ASSUMPTIONS, CalculationTable } from "@/components/journey/CalculationTable";
import { CompletionSummary, OUTSTANDING_REQUIREMENTS } from "@/components/journey/CompletionSummary";
import { Notice } from "@/components/journey/Notices";
import { OverallPill } from "@/components/journey/OverallPill";
import { DemoTag, KycPill, StepStatusPill, VerificationPill, kycDisplayStatus, offerStatusLabel } from "@/components/journey/StatusPill";
import { OverallBadge, StepStrip } from "@/components/admin/JourneyBadges";
import { deriveJourney } from "@/lib/journey/machine";
import { summarizeDraft } from "@/lib/journey/admin-summary";
import { completeDraft, TODAY } from "./helpers/journey-fixtures";

// Notice requires `children` in its props type, and the lint rules forbid passing children as a prop: type it loosely once.
const NoticeEl = Notice as unknown as FC<{ tone: string; title?: string; children?: ReactNode }>;
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("status pills", () => {
  it("use the required wording for steps, PAN/mobile and KYC states", () => {
    expect(html(createElement(StepStatusPill, { status: "in_progress" }))).toContain("In Progress");
    expect(html(createElement(StepStatusPill, { status: "review_required" }))).toContain("Review Required");
    expect(html(createElement(VerificationPill, { status: "demo_verified", label: "PAN" }))).toContain("PAN: Demo Verified");
    expect(html(createElement(VerificationPill, { status: "integration_required" }))).toContain("Integration Required");
    for (const [s, text] of [["not_started", "Not Started"], ["consent_required", "Consent Required"], ["request_pending", "Request Pending"], ["demo_otp_issued", "Demo OTP Issued"], ["demo_verified", "Demo Verified"], ["cancelled", "Cancelled"], ["failed", "Failed"], ["integration_required", "Integration Required"]] as const) {
      expect(html(createElement(KycPill, { status: s }))).toContain(text);
    }
  });
  it("shows Consent Required until consent is given, and never 'verified' without Demo", () => {
    expect(kycDisplayStatus("not_started", false)).toBe("consent_required");
    expect(kycDisplayStatus("not_started", true)).toBe("not_started");
    expect(kycDisplayStatus("cancelled", false)).toBe("cancelled");
    expect(kycDisplayStatus("demo_verified", true)).toBe("demo_verified");
    expect(html(createElement(VerificationPill, { status: "demo_verified" }))).not.toMatch(/(?<!Demo )Verified/);
  });
  it("labels offer states and demo tags", () => {
    expect(offerStatusLabel("integration_required")).toBe("Integration unavailable");
    expect(offerStatusLabel("eligible")).toContain("demo");
    expect(html(createElement(DemoTag))).toContain("DEMO");
    expect(html(createElement(OverallPill, { status: "completed" }))).toContain("Demo journey completed");
  });
  it("renders alerts with the right live-region role", () => {
    expect(html(createElement(NoticeEl, { tone: "error" }, "x"))).toContain('role="alert"');
    expect(html(createElement(NoticeEl, { tone: "success" }, "x"))).toContain('role="status"');
    expect(html(createElement(NoticeEl, { tone: "demo", title: "Demo mode" }, "x"))).toContain('role="note"');
  });
});

describe("calculation and completion presentation", () => {
  it("renders every itemised row with Indian-formatted rupees", async () => {
    const d = await completeDraft((x) => { x.addons = { selected: [{ id: "care-plan", optionId: "12m" }], confirmed: true }; });
    // recompute so the stored result matches the add-on
    const { buildCalculation } = await import("@/lib/journey/final");
    const r = buildCalculation(d, undefined, TODAY);
    if (!r.ok) throw new Error("expected result");
    const out = html(createElement(CalculationTable, { calc: r.result, schemeName: "Standard 12 months (demo)", assetLabel: "Aurora Mobile Lite 5", requestedRupees: 50_000, eligibleRupees: 50_000, addOns: [{ label: "Device care plan (demo)", paise: 149_900 }] }));
    for (const label of ["Asset price", "Down payment", "Total financed amount", "EMI (illustrative)", "Total interest", "Processing fee", "Taxes on fees", "Total payable", "Total cost including down payment", "Add-on: Device care plan (demo)", "Requested loan amount", "Indicative eligible amount (demo)"]) {
      expect(out, label).toContain(label);
    }
    expect(out).toContain("₹14,999.00");
    expect(out).toContain("₹1,499.90");
    expect(out).toContain("₹50,000"); // whole-rupee amounts use Indian grouping
    expect(CALCULATION_ASSUMPTIONS.length).toBeGreaterThanOrEqual(4);
  });
  it("the completion summary lists statuses, review items and what is still required", async () => {
    const d = await completeDraft((x) => { x.address.matchesDocument = "no"; });
    const j = deriveJourney(d, TODAY);
    const out = html(createElement(CompletionSummary, { draft: d, journey: j }));
    expect(out).toContain("Journey summary");
    expect(out).toContain("Review Required");
    expect(out).toContain("The current address differs");
    expect(out).toContain("Still required before this could be real");
    for (const r of OUTSTANDING_REQUIREMENTS) expect(out).toContain(r.replace(/&/g, "&amp;"));
    expect(out).toContain("Standard 12 months (demo)");
    expect(out).not.toMatch(/approved|sanctioned|disbursed/i);
  });
  it("omits the offer and calculation blocks when there is nothing to show (nothing invented)", async () => {
    const d = await completeDraft((x) => { x.offer = { inputKey: "", acknowledged: false }; x.calculation = {}; });
    const out = html(createElement(CompletionSummary, { draft: d, journey: deriveJourney(d, TODAY) }));
    expect(out).not.toContain("Illustrative offer");
    expect(out).not.toContain("Final calculation");
  });
});

describe("admin badges", () => {
  it("expose all eight step statuses as text for assistive technology", async () => {
    const row = summarizeDraft(await completeDraft(), TODAY);
    const out = html(createElement(StepStrip, { steps: row.steps }));
    expect(out.match(/<li /g)).toHaveLength(8);
    expect(out).toContain("Basic Details: Completed");
    expect(out).toContain("Final Calculation Display: Completed");
    expect(html(createElement(OverallBadge, { status: "review_required" }))).toContain("Review required");
  });
});
