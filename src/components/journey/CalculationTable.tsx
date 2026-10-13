import { money, pct, Row } from "./MoneyRows";
import type { FinalCalculation } from "@/lib/journey/types";
import { formatRupees } from "@/lib/journey/money";

/** The itemised, illustrative final figures. Presentational and pure so it can be rendered anywhere. */
export function CalculationTable({
  calc, schemeName, assetLabel, requestedRupees, eligibleRupees, addOns,
}: {
  calc: FinalCalculation; schemeName: string; assetLabel: string; requestedRupees: number | null; eligibleRupees: number | null; addOns: { label: string; paise: number }[];
}) {
  return (
    <dl className="cj-kv" aria-label="Itemised calculation">
      <Row label="Asset / product">{assetLabel}</Row>
      <Row label="Asset price (demo catalog)">{money(calc.assetPricePaise)}</Row>
      <Row label="Selected scheme">{schemeName}</Row>
      {requestedRupees !== null && <Row label="Requested loan amount (your entry)">{formatRupees(requestedRupees)}</Row>}
      {eligibleRupees !== null && <Row label="Indicative eligible amount (demo)">{formatRupees(eligibleRupees)}</Row>}
      <Row label="Down payment">{money(calc.downPaymentPaise)}</Row>
      {addOns.map((a) => <Row key={a.label} label={`Add-on: ${a.label}`} kind="sub">{money(a.paise)}</Row>)}
      <Row label="Selected add-ons">{money(calc.addOnsPaise)}</Row>
      <Row label="Total financed amount" kind="total">{money(calc.financedAmountPaise)}</Row>
      <Row label="Illustrative interest rate">{pct(calc.annualRateBps)}</Row>
      <Row label="Tenure">{calc.tenureMonths} months</Row>
      <Row label="EMI (illustrative)" kind="total">{money(calc.emiPaise)}</Row>
      <Row label="Total of all EMIs">{money(calc.totalEmiPaise)}</Row>
      <Row label="Total interest">{money(calc.totalInterestPaise)}</Row>
      <Row label="Processing fee">{money(calc.processingFeePaise)}</Row>
      <Row label="Taxes on fees (illustrative GST)">{money(calc.taxOnFeesPaise)}</Row>
      <Row label="Total payable (EMIs + fees + taxes)" kind="total">{money(calc.totalPayablePaise)}</Row>
      <Row label="Total cost including down payment">{money(calc.totalCostPaise)}</Row>
    </dl>
  );
}

export const CALCULATION_ASSUMPTIONS = [
  "EMIs are level, paid monthly, and calculated on the reducing balance at the illustrative annual rate divided by 12.",
  "The down payment is a percentage of the asset price set by the selected demo scheme.",
  "Add-ons are financed together with the asset. The processing fee and its tax are added to the total payable and are not financed.",
  "A step-up scheme is shown with level EMIs: a real step-up schedule needs a lender integration.",
  "Amounts are rounded to the nearest paisa. All rates, fees and taxes are configurable placeholders, not lender terms.",
] as const;
