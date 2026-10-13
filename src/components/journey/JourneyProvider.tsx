"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createEmptyDraft } from "@/lib/journey/draft";
import { deriveJourney, type JourneyState } from "@/lib/journey/machine";
import { createDemoProviders, type Providers } from "@/lib/journey/providers";
import { generateReference } from "@/lib/journey/reference";
import type { JourneyDraft } from "@/lib/journey/types";

type Ctx = {
  /** False until the browser's saved draft has been read. Pages render a skeleton until then. */
  ready: boolean;
  draft: JourneyDraft | null;
  journey: JourneyState | null;
  providers: Providers;
  /** False when the browser blocks storage: the draft then lives in memory for this page session only. */
  persistent: boolean;
  startNew: () => Promise<JourneyDraft>;
  /** Apply a pure change to the draft and save it. Resolves with the saved draft. */
  update: (change: (d: JourneyDraft) => JourneyDraft) => Promise<JourneyDraft>;
  discard: () => Promise<void>;
};

const JourneyContext = createContext<Ctx | null>(null);

export function useJourney(): Ctx {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used inside <JourneyProvider>");
  return ctx;
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  // One set of providers per page session (lazy state initialiser: created once, never during a re-render).
  const [providers] = useState<Providers>(() => createDemoProviders());

  const [draft, setDraft] = useState<JourneyDraft | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef<JourneyDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ref = await providers.repository.getCurrentReference();
      const loaded = ref ? await providers.repository.loadApplication(ref) : null;
      if (cancelled) return;
      latest.current = loaded;
      setDraft(loaded);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [providers]);

  const startNew = useCallback(async () => {
    const existing = new Set((await providers.repository.listDrafts()).map((d) => d.reference));
    const d = createEmptyDraft(generateReference(undefined, (r) => existing.has(r)));
    await providers.repository.saveDraft(d);
    await providers.repository.setCurrentReference(d.reference);
    latest.current = d;
    setDraft(d);
    return d;
  }, [providers]);

  const update = useCallback(
    async (change: (d: JourneyDraft) => JourneyDraft) => {
      const base = latest.current;
      if (!base) throw new Error("There is no application in progress");
      const next = change(base);
      latest.current = next;
      setDraft(next);
      await providers.repository.saveDraft(next);
      return next;
    },
    [providers],
  );

  const discard = useCallback(async () => {
    const d = latest.current;
    if (d) await providers.repository.deleteDraft(d.reference);
    await providers.repository.setCurrentReference(null);
    latest.current = null;
    setDraft(null);
  }, [providers]);

  const journey = useMemo(() => (draft ? deriveJourney(draft) : null), [draft]);
  const persistent = (providers.repository as { persistent?: boolean }).persistent !== false;

  const value = useMemo<Ctx>(() => ({ ready, draft, journey, providers, persistent, startNew, update, discard }), [ready, draft, journey, providers, persistent, startNew, update, discard]);
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}
