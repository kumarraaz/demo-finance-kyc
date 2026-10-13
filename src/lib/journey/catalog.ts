// FICTIONAL demo product catalog. Manufacturers, models and prices are invented placeholders.
// The ProductCatalogProvider interface (providers/types.ts) lets a real catalog replace this later.

export type CatalogVariant = { id: string; label: string; pricePaise: number };
export type CatalogModel = { id: string; label: string; category: string; subCategory: string; variants: CatalogVariant[] };
export type CatalogManufacturer = { id: string; label: string; models: CatalogModel[] };
export type CatalogProductType = { id: string; label: string; manufacturers: CatalogManufacturer[] };

const rs = (rupees: number) => rupees * 100;

export const DEMO_CATALOG: CatalogProductType[] = [
  {
    id: "smartphone",
    label: "Smartphone",
    manufacturers: [
      {
        id: "aurora-mobile",
        label: "Aurora Mobile (demo)",
        models: [
          { id: "am-lite-5", label: "Lite 5", category: "Consumer electronics", subCategory: "Mobile phones", variants: [{ id: "64gb", label: "64 GB", pricePaise: rs(12_999) }, { id: "128gb", label: "128 GB", pricePaise: rs(14_999) }] },
          { id: "am-pro-7", label: "Pro 7", category: "Consumer electronics", subCategory: "Mobile phones", variants: [{ id: "128gb", label: "128 GB", pricePaise: rs(27_999) }, { id: "256gb", label: "256 GB", pricePaise: rs(31_999) }] },
        ],
      },
      {
        id: "bluepeak",
        label: "Bluepeak Devices (demo)",
        models: [{ id: "bp-x2", label: "X2", category: "Consumer electronics", subCategory: "Mobile phones", variants: [{ id: "128gb", label: "128 GB", pricePaise: rs(18_499) }] }],
      },
    ],
  },
  {
    id: "television",
    label: "Television",
    manufacturers: [
      {
        id: "aurora-vision",
        label: "Aurora Vision (demo)",
        models: [
          { id: "av-43", label: "43-inch Smart", category: "Consumer electronics", subCategory: "Televisions", variants: [{ id: "fhd", label: "Full HD", pricePaise: rs(24_990) }, { id: "uhd", label: "Ultra HD", pricePaise: rs(32_990) }] },
          { id: "av-55", label: "55-inch Smart", category: "Consumer electronics", subCategory: "Televisions", variants: [{ id: "uhd", label: "Ultra HD", pricePaise: rs(48_990) }] },
        ],
      },
    ],
  },
  {
    id: "home-appliance",
    label: "Home appliance",
    manufacturers: [
      {
        id: "cedar-home",
        label: "Cedar Home (demo)",
        models: [
          { id: "ch-fridge-250", label: "Refrigerator 250 L", category: "Home appliances", subCategory: "Refrigerators", variants: [{ id: "std", label: "Standard", pricePaise: rs(22_490) }, { id: "inv", label: "Inverter", pricePaise: rs(26_990) }] },
          { id: "ch-wash-7", label: "Washing machine 7 kg", category: "Home appliances", subCategory: "Washing machines", variants: [{ id: "top", label: "Top load", pricePaise: rs(17_990) }, { id: "front", label: "Front load", pricePaise: rs(29_990) }] },
        ],
      },
    ],
  },
];

export type Selection = { productType: string; manufacturer: string; model: string; variant: string };

export function getProductTypes() {
  return DEMO_CATALOG.map(({ id, label }) => ({ id, label }));
}
export function getManufacturers(productType: string) {
  return (DEMO_CATALOG.find((p) => p.id === productType)?.manufacturers ?? []).map(({ id, label }) => ({ id, label }));
}
export function getModels(productType: string, manufacturer: string) {
  const m = DEMO_CATALOG.find((p) => p.id === productType)?.manufacturers.find((x) => x.id === manufacturer);
  return (m?.models ?? []).map(({ id, label }) => ({ id, label }));
}
export function getVariants(productType: string, manufacturer: string, model: string) {
  const mod = findModel(productType, manufacturer, model);
  return (mod?.variants ?? []).map(({ id, label, pricePaise }) => ({ id, label, pricePaise }));
}

function findModel(productType: string, manufacturer: string, model: string) {
  return DEMO_CATALOG.find((p) => p.id === productType)?.manufacturers.find((x) => x.id === manufacturer)?.models.find((m) => m.id === model);
}

export type AssetDetail = {
  productTypeLabel: string;
  manufacturerLabel: string;
  modelLabel: string;
  variantLabel: string;
  category: string;
  subCategory: string;
  pricePaise: number;
};

/** Full detail when the whole selection is consistent, otherwise null. */
export function getAssetDetail(sel: Selection): AssetDetail | null {
  const type = DEMO_CATALOG.find((p) => p.id === sel.productType);
  const man = type?.manufacturers.find((m) => m.id === sel.manufacturer);
  const model = man?.models.find((m) => m.id === sel.model);
  const variant = model?.variants.find((v) => v.id === sel.variant);
  if (!type || !man || !model || !variant) return null;
  return {
    productTypeLabel: type.label,
    manufacturerLabel: man.label,
    modelLabel: model.label,
    variantLabel: variant.label,
    category: model.category,
    subCategory: model.subCategory,
    pricePaise: variant.pricePaise,
  };
}

/**
 * Change one level and clear every level below it that is no longer valid.
 * Changing the manufacturer drops an incompatible model and variant; a model that still exists under the new parent is kept.
 */
export function selectLevel(current: Selection, level: keyof Selection, value: string): Selection {
  const next: Selection = { ...current, [level]: value };
  if (level === "productType") {
    if (!getManufacturers(next.productType).some((m) => m.id === next.manufacturer)) next.manufacturer = "";
  }
  if (level === "productType" || level === "manufacturer") {
    if (!getModels(next.productType, next.manufacturer).some((m) => m.id === next.model)) next.model = "";
  }
  if (level !== "variant") {
    if (!getVariants(next.productType, next.manufacturer, next.model).some((v) => v.id === next.variant)) next.variant = "";
  }
  return next;
}
