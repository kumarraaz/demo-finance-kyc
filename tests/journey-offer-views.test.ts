import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfferDetails, OfferPending } from "@/components/journey/OfferViews";
import { createDemoOfferProvider } from "@/lib/journey/providers/demo-offer";
import { DEFAULT_RULES } from "@/lib/journey/rules";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const offerFor = async (requested: number, income: number) => {
  const r = await createDemoOfferProvider(DEFAULT_RULES).getIndicativeOffer({ requestedAmountRupees: requested, monthlyIncomeRupees: income });
  if (r.status === "integration_required") throw new Error("unexpected");
  return r;
};

describe("soft offer screens", () => {
  it("eligible: every figure present, DEMO-labelled, with an expiry placeholder and no promise", async () => {
    const out = html(createElement(OfferDetails, { offer: await offerFor(50_000, 40_000), reference: "DFK-AAAAA-BBBBB" }));
    for (const t of ["Indicative offer", "DEMO", "DFK-AAAAA-BBBBB", "₹50,000", "16.00% per year", "12 months", "Illustrative EMI", "Indicative processing fee", "Applicable taxes", "Illustrative total payable", "Offer expiry", "Not available (a lender integration would provide it)", "Demo fixture (not a lender offer)"]) {
      expect(out, t).toContain(t);
    }
    expect(out).not.toMatch(/approved|sanctioned/i);
    expect(out).not.toContain("Not eligible in this demo");
  });
  it("review required: shows the indicative amount and the review reason, not a rejection", async () => {
    const out = html(createElement(OfferDetails, { offer: await offerFor(500_000, 20_000), reference: "R" }));
    expect(out).toContain("Review required");
    expect(out).toContain("₹2,00,000"); // Indian grouping for the indicative amount
    expect(out).toContain("A reviewer would decide");
    expect(out).not.toContain("Not eligible in this demo");
  });
  it("not eligible: no figures are invented, the reason and a way back are shown", async () => {
    const out = html(createElement(OfferDetails, { offer: await offerFor(50_000, 500), reference: "R" }));
    expect(out).toContain("Not eligible (demo)");
    expect(out).toContain("Not available");
    expect(out).toContain("/apply/demographics/personal");
    expect(out).not.toContain("Illustrative EMI");
    expect(out).not.toContain("Illustrative total payable");
  });
  it("integration pending: says so plainly and shows no figure at all", () => {
    const out = html(createElement(OfferPending, { reference: "DFK-AAAAA-BBBBB" }));
    expect(out).toContain("Offer integration pending");
    expect(out).toContain("Nothing has been assumed or invented");
    expect(out).toContain("Integration unavailable");
    expect(out).not.toMatch(/₹|EMI|%/);
  });
});
