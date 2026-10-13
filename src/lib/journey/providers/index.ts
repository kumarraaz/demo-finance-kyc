// The provider registry. Phase 1 wires DEMO adapters only. To connect a real integration (Phase 3), implement the
// matching interface from ./types and replace the entry below. Screens only ever talk to this object.
import { DEFAULT_RULES, type JourneyRules } from "../rules";
import { createDemoCatalogProvider, createDemoSchemeProvider } from "./demo-catalog";
import { createDemoKycProvider } from "./demo-kyc";
import { createDemoLivenessProvider } from "./demo-liveness";
import { createDemoOfferProvider } from "./demo-offer";
import { createLocalRepository } from "./local-repository";
import type { ApplicationRepository, KycProvider, LivenessProvider, OfferProvider, ProductCatalogProvider, ProviderMeta, SchemeProvider } from "./types";

export type Providers = {
  rules: JourneyRules;
  kyc: KycProvider;
  liveness: LivenessProvider;
  offer: OfferProvider;
  catalog: ProductCatalogProvider;
  schemes: SchemeProvider;
  repository: ApplicationRepository;
};

export function createDemoProviders(rules: JourneyRules = DEFAULT_RULES): Providers {
  return {
    rules,
    kyc: createDemoKycProvider(rules),
    liveness: createDemoLivenessProvider(rules),
    offer: createDemoOfferProvider(rules),
    catalog: createDemoCatalogProvider(),
    schemes: createDemoSchemeProvider(),
    repository: createLocalRepository(undefined, rules),
  };
}

/** What each integration is today, for the admin "integration readiness" view. */
export function integrationReadiness(p: Providers): { label: string; meta: ProviderMeta; ready: boolean; phase: string }[] {
  const row = (label: string, meta: ProviderMeta, phase: string) => ({ label, meta, ready: meta.mode === "live", phase });
  return [
    row("PAN and mobile verification", { id: "pan-none", name: "No PAN or OTP provider (simulated in the form)", mode: "demo" }, "Phase 3"),
    row("Document retrieval (DigiLocker or similar)", p.kyc.meta, "Phase 3"),
    row("Biometric liveness and face match", p.liveness.meta, "Phase 3"),
    row("Bureau and offer", p.offer.meta, "Phase 3"),
    row("Product catalog", p.catalog.meta, "Phase 3"),
    row("Schemes", p.schemes.meta, "Phase 3"),
    row("Draft storage", p.repository.meta, "Phase 2"),
  ];
}
