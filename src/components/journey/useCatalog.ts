"use client";

import { useEffect, useState } from "react";
import type { AssetDetail, Selection } from "@/lib/journey/catalog";
import type { ProductCatalogProvider } from "@/lib/journey/providers/types";

type Opt = { id: string; label: string };

/**
 * Result of one async lookup, tagged with the parent key it was loaded for. A result for a different parent is ignored,
 * so a stale list can never be shown after the parent selection changes.
 */
function useLookup<T>(key: string, enabled: boolean, load: () => Promise<T>, empty: T, onError: () => void): T {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then((value) => live && setState({ key, value }), () => live && onError());
    return () => { live = false; };
    // `load` and `onError` are recreated each render; the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return enabled && state?.key === key ? state.value : empty;
}

const NONE_OPTS: Opt[] = [];
const NONE_VARIANTS: (Opt & { pricePaise: number })[] = [];

export function useCatalog(provider: ProductCatalogProvider, sel: Selection) {
  const [failed, setFailed] = useState(false);
  const fail = () => setFailed(true);
  const complete = Boolean(sel.productType && sel.manufacturer && sel.model && sel.variant);

  const types = useLookup("types", true, () => provider.getProductTypes(), NONE_OPTS, fail);
  const manufacturers = useLookup(sel.productType, Boolean(sel.productType), () => provider.getManufacturers(sel.productType), NONE_OPTS, fail);
  const models = useLookup(`${sel.productType}/${sel.manufacturer}`, Boolean(sel.productType && sel.manufacturer), () => provider.getModels(sel.productType, sel.manufacturer), NONE_OPTS, fail);
  const variants = useLookup(`${sel.productType}/${sel.manufacturer}/${sel.model}`, Boolean(sel.productType && sel.manufacturer && sel.model), () => provider.getVariants(sel.productType, sel.manufacturer, sel.model), NONE_VARIANTS, fail);
  const detail = useLookup<AssetDetail | null>(`${sel.productType}/${sel.manufacturer}/${sel.model}/${sel.variant}`, complete, () => provider.getAssetDetail(sel), null, fail);

  return { types, manufacturers, models, variants, detail, failed };
}
