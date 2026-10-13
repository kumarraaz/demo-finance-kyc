import { getAssetDetail, getManufacturers, getModels, getProductTypes, getVariants } from "../catalog";
import { getAvailableSchemes } from "../schemes";
import type { ProductCatalogProvider, SchemeProvider } from "./types";

export function createDemoCatalogProvider(): ProductCatalogProvider {
  return {
    meta: { id: "catalog-demo", name: "Demo product catalog (fictional)", mode: "demo" },
    getProductTypes: async () => getProductTypes(),
    getManufacturers: async (t) => getManufacturers(t),
    getModels: async (t, m) => getModels(t, m),
    getVariants: async (t, m, mo) => getVariants(t, m, mo),
    getAssetDetail: async (sel) => getAssetDetail(sel),
  };
}

export function createDemoSchemeProvider(): SchemeProvider {
  return {
    meta: { id: "scheme-demo", name: "Demo schemes (fictional)", mode: "demo" },
    getAvailableSchemes: async (ctx) => getAvailableSchemes(ctx),
  };
}
