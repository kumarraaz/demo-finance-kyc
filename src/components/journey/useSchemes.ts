"use client";

import { useEffect, useState } from "react";
import type { DemoScheme, SchemeContext, SchemeEligibility } from "@/lib/journey/schemes";
import type { SchemeProvider } from "@/lib/journey/providers/types";

export type SchemeRow = { scheme: DemoScheme; eligibility: SchemeEligibility };

/** Available schemes for the current asset and answers, loaded through the SchemeProvider interface. */
export function useSchemes(provider: SchemeProvider, ctx: SchemeContext | null): { rows: SchemeRow[]; failed: boolean } {
  const key = ctx ? `${ctx.assetPricePaise}/${ctx.stepUp}/${ctx.suspectedActivity}` : "";
  const [state, setState] = useState<{ key: string; rows: SchemeRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ctx) return;
    let live = true;
    provider.getAvailableSchemes(ctx).then((rows) => live && setState({ key, rows }), () => live && setFailed(true));
    return () => { live = false; };
    // The key identifies the request; ctx is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key]);
  return { rows: ctx && state?.key === key ? state.rows : [], failed };
}
