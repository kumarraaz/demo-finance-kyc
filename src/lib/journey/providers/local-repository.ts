import { DEFAULT_RULES, type JourneyRules } from "../rules";
import { parseDraft, scrubDraft } from "../draft";
import type { JourneyDraft } from "../types";
import { STEPS } from "../machine";
import type { ApplicationRepository } from "./types";

/**
 * TEMPORARY Phase 1 draft store: the browser's localStorage.
 *
 * Why browser storage: the database has no draft table and there is no public write API; adding either is the Phase 2
 * backend work. Consequences, stated plainly: drafts live only in this browser, are NOT visible to the server or to
 * admins on other devices, and disappear if the browser data is cleared.
 *
 * What is stored: the typed draft (see types.ts). Never stored: a raw PAN (only a masked value), any Aadhaar data, OTPs,
 * tokens, face images. A scrub step blanks anything that looks like a PAN/Aadhaar number before every write. Drafts older
 * than `rules.draftTtlDays` are deleted when read. At most MAX_DRAFTS are kept.
 */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "dfk.journey.v1.";
const INDEX_KEY = `${PREFIX}index`;
const CURRENT_KEY = `${PREFIX}current`;
const draftKey = (ref: string) => `${PREFIX}draft.${ref}`;
export const MAX_DRAFTS = 20;

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null; // private mode, blocked storage, or server render
  }
}

export function createLocalRepository(
  storage: StorageLike | null = browserStorage(),
  rules: JourneyRules = DEFAULT_RULES,
  now: () => Date = () => new Date(),
): ApplicationRepository & { persistent: boolean } {
  const store: StorageLike = storage ?? new MemoryStorage();

  const readIndex = (): string[] => {
    try {
      const v = JSON.parse(store.getItem(INDEX_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const writeIndex = (refs: string[]) => store.setItem(INDEX_KEY, JSON.stringify(refs));
  const expired = (d: JourneyDraft) => now().getTime() - new Date(d.updatedAt).getTime() > rules.draftTtlDays * 86_400_000;

  const read = (ref: string): JourneyDraft | null => {
    const raw = store.getItem(draftKey(ref));
    if (!raw) return null;
    try {
      const d = parseDraft(JSON.parse(raw), now());
      if (!d || d.reference !== ref || expired(d)) {
        store.removeItem(draftKey(ref));
        return null;
      }
      return d;
    } catch {
      store.removeItem(draftKey(ref));
      return null;
    }
  };

  const remove = (ref: string) => {
    store.removeItem(draftKey(ref));
    writeIndex(readIndex().filter((r) => r !== ref));
    if (store.getItem(CURRENT_KEY) === ref) store.removeItem(CURRENT_KEY);
  };

  return {
    persistent: storage !== null,
    meta: { id: "repository-local", name: "Browser-only demo drafts", mode: "demo" },

    async saveDraft(draft) {
      const { draft: clean } = scrubDraft({ ...draft, updatedAt: now().toISOString() });
      store.setItem(draftKey(clean.reference), JSON.stringify(clean));
      const index = [clean.reference, ...readIndex().filter((r) => r !== clean.reference)];
      for (const old of index.slice(MAX_DRAFTS)) store.removeItem(draftKey(old));
      writeIndex(index.slice(0, MAX_DRAFTS));
    },

    async loadApplication(reference) {
      return read(reference);
    },

    async getApplicationStatus(reference) {
      const d = read(reference);
      if (!d) return null;
      const label = STEPS.find((s) => s.id === d.currentStep)?.label ?? d.currentStep;
      return { reference: d.reference, currentStep: label, updatedAt: d.updatedAt };
    },

    async getCurrentReference() {
      const ref = store.getItem(CURRENT_KEY);
      return ref && read(ref) ? ref : null;
    },

    async setCurrentReference(reference) {
      if (reference === null) store.removeItem(CURRENT_KEY);
      else store.setItem(CURRENT_KEY, reference);
    },

    async listDrafts() {
      const out: JourneyDraft[] = [];
      const keep: string[] = [];
      for (const ref of readIndex()) {
        const d = read(ref);
        if (d) {
          out.push(d);
          keep.push(ref);
        }
      }
      writeIndex(keep);
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async deleteDraft(reference) {
      remove(reference);
    },

    async clearAll() {
      for (const ref of readIndex()) store.removeItem(draftKey(ref));
      store.removeItem(INDEX_KEY);
      store.removeItem(CURRENT_KEY);
    },
  };
}
