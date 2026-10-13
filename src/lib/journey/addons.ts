// FICTIONAL demo add-ons. Prices are placeholders. Nothing is preselected and nothing is mandatory in the demo.

export type AddOnOption = { id: string; label: string; pricePaise: number };
export type AddOn = {
  id: string;
  name: string;
  description: string;
  requirement: "optional" | "mandatory";
  options: AddOnOption[];
  exclusions: string;
};

export const DEMO_ADDONS: AddOn[] = [
  {
    id: "care-plan",
    name: "Device care plan (demo)",
    description: "An illustrative protection plan for the selected asset.",
    requirement: "optional",
    options: [
      { id: "12m", label: "12 months", pricePaise: 1_499_00 },
      { id: "24m", label: "24 months", pricePaise: 2_499_00 },
    ],
    exclusions: "Demo text: loss, theft and cosmetic damage would be excluded in a real plan.",
  },
  {
    id: "extended-support",
    name: "Extended support (demo)",
    description: "Illustrative extra service support after the standard period.",
    requirement: "optional",
    options: [{ id: "12m", label: "12 months", pricePaise: 799_00 }],
    exclusions: "Demo text: consumables and accessories would be excluded in a real plan.",
  },
  {
    id: "setup",
    name: "Delivery and set-up (demo)",
    description: "Illustrative home delivery and installation.",
    requirement: "optional",
    options: [{ id: "once", label: "One time", pricePaise: 499_00 }],
    exclusions: "Demo text: structural work is not included.",
  },
];

export function getAddOn(id: string): AddOn | undefined {
  return DEMO_ADDONS.find((a) => a.id === id);
}

export function addOnPricePaise(id: string, optionId: string): number | null {
  const opt = getAddOn(id)?.options.find((o) => o.id === optionId);
  return opt ? opt.pricePaise : null;
}

export function addOnsSubtotalPaise(selected: { id: string; optionId: string }[]): number {
  return selected.reduce((sum, s) => sum + (addOnPricePaise(s.id, s.optionId) ?? 0), 0);
}
