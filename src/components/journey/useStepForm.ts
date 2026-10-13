"use client";

import { useCallback, useMemo, useState } from "react";
import type { Errors } from "@/lib/journey/types";

export const fieldId = (name: string) => `f-${name.replace(/\./g, "-")}`;

/**
 * Form state for one step.
 * - Errors are shown for a field once it has been left (blur) or after a failed submit, and they disappear the moment
 *   the value is corrected (they are recomputed from the values on every render, never stored).
 * - `dirty` is true while the values differ from what was last saved.
 */
export function useStepForm<V extends Record<string, unknown>>(initial: V, validate: (v: V) => Errors) {
  const [values, setValues] = useState<V>(initial);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<V>(initial);

  // Cheap pure functions: recomputed on every render so a corrected value clears its error immediately.
  const all = validate(values);
  const errors: Errors = {};
  for (const k of Object.keys(all)) if (submitted || touched[k]) errors[k] = all[k];

  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => setValues((v) => ({ ...v, [name]: value })), []);
  const patch = useCallback((p: Partial<V>) => setValues((v) => ({ ...v, ...p })), []);
  const blur = useCallback((name: string) => setTouched((t) => (t[name] ? t : { ...t, [name]: true })), []);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);

  /** Validate everything. Returns true when valid; otherwise shows every error and focuses the first invalid field. */
  const check = (): boolean => {
    const keys = Object.keys(validate(values));
    if (keys.length === 0) return true;
    setSubmitted(true);
    queueMicrotask(() => {
      document.getElementById(fieldId(keys[0]))?.focus();
    });
    return false;
  };

  const markSaved = () => setSaved(values);
  const reset = useCallback((v: V) => {
    setValues(v);
    setSaved(v);
    setTouched({});
    setSubmitted(false);
  }, []);

  return { values, set, patch, setValues, errors, allErrors: all, blur, dirty, check, markSaved, reset, submitted };
}
