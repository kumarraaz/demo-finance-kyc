# Phase 1: customer journey (frontend only, demo)

Everything here is a **demonstration**. No PAN, OTP, DigiLocker, biometric, bureau or lender service is connected, and
nothing in the journey approves, sanctions or disburses a loan. Every simulated result is labelled DEMO.

## Screens (all public, under `/apply`)

| # | Route | Screen |
| --- | --- | --- |
| 1 | `/apply` | Welcome: start, continue an existing application, privacy and demo disclosures |
| 2 | `/apply/basic-details` | Basic Details: mobile, date of birth, name as per PAN, PAN (masked), simulated verification |
| 3 | `/apply/kyc` | KYC Details: consent, demo request, 6-digit demo code, resend timer, cancel, placeholder summary |
| 4-6 | `/apply/demographics/personal`, `/address`, `/asset` | Demographic Details, Step 1/3, 2/3, 3/3 |
| 7 | `/apply/journey` | Application journey summary (statuses derived from saved data) |
| 8-10 | `/apply/liveness`, `/liveness/capture`, `/liveness/result` | Liveness: consent, camera, demo result |
| 11 | `/apply/offer` | Soft Offer (DEMO / INDICATIVE) |
| 12 | `/apply/asset-scheme` | Asset & Scheme Selection |
| 13 | `/apply/add-ons` | Add-on Product |
| 14 | `/apply/calculation` | Final Calculation Display |
| 15 | `/apply/complete` | "Demo Journey Completed" |

Admin: `/admin/journeys` and `/admin/journeys/[reference]` (admin session required, same guard as the rest of `/admin`).

## State machine

There is no stored "completed" flag per step. `src/lib/journey/machine.ts` **derives** every step's status
(`pending`, `in_progress`, `completed`, `review_required`, `failed`) from the saved draft and the outcome of the provider
call, so a step cannot be completed by opening it, and breaking saved data un-completes it.

- A step opens only when every earlier step has *passed* (`completed` or `review_required`). Direct URLs to a locked step
  redirect to the journey page.
- Review, not rejection: a different document address or a "suspected activity: Yes" answer gives `review_required`
  and never blocks progress or rejects the application.
- A saved offer / final calculation carries an `inputKey` of the answers it was computed from. Change those answers and
  the stored result is stale, so the step needs to be done again.
- Explicit choices only: nothing is preselected (scheme, add-ons, Yes/No questions). Add-ons need an explicit confirm,
  even if none is chosen.

Rules and demo fixture settings live in `src/lib/journey/rules.ts` (age, loan and income limits, OTP length and resend time,
offer fixture and fee/tax rates, liveness fixture). Set `offer.enabled = false` to see "Offer integration pending".

## Where the draft is stored (temporary, and why)

The database has no draft table and there is no public write API. Adding either is the Phase 2 backend work (a migration
and a public endpoint with its own abuse protection), so Phase 1 stores the draft **in the visitor's browser**
(`localStorage`, `src/lib/journey/providers/local-repository.ts`) behind the `ApplicationRepository` interface.

Consequences:

- A draft lives in one browser. The server and other devices cannot see it. Clearing site data deletes it.
- Drafts older than 7 days are deleted when read; at most 20 are kept; the welcome screen can delete the current one.
- **Never stored:** a raw PAN (only a masked value such as `QW******8K`), Aadhaar data, OTPs, tokens, a face image, a document.
  A scrub step blanks any string that looks like a PAN/Aadhaar number before every write.
- The captured selfie exists only in page memory (an object URL that is revoked on retake/leave/close). It is never uploaded.
- If the browser blocks storage the journey still works in memory for that page session, with a notice.

Admin visibility follows from this: `/admin/journeys` lists the drafts stored **in the browser you are using** and says so.
It cannot show journeys from other devices until Phase 2. Existing database applications show a note on their detail page.

## Integration contracts

`src/lib/journey/providers/types.ts` defines `KycProvider`, `LivenessProvider`, `OfferProvider`, `ProductCatalogProvider`,
`SchemeProvider` and `ApplicationRepository`. `providers/index.ts` wires the **demo adapters**; replace an entry to connect a real
provider (Phase 3) without touching the screens. Each adapter reports `mode: "demo" | "live"`, which the admin
"Integration readiness" table shows.

Demo behaviours you can rely on while testing: the demo code is `123456` (3 attempts); a PAN whose last letter is `X` fails the
simulated check; the liveness score is a fixed constant labelled DEMO and no image data is ever passed to the adapter.

## Camera and the Permissions-Policy

The site blocks the camera everywhere (`camera=()`). Only `/apply/liveness/capture` allows it, for this site only
(`camera=(self)`, set in `next.config.ts`). Browsers apply that policy **per document**, so the capture screen is opened with a
real page load (`openCameraScreen`), not an in-app navigation, which would keep the previous page's policy. "The person pressed
Start" travels as a one-time, 20-second session flag; a typed URL or reload never starts the camera by itself. If a policy
mismatch is detected the screen says "Reload to use the camera" instead of blaming permissions.

## Money

Amounts are calculated in integer paise with `BigInt` (`src/lib/journey/calc.ts`, `money.ts`), never with floating point. The EMI
uses 18-digit fixed-point maths and is unit-tested against a reference. All rates, fees and taxes are placeholders in `rules.ts`.

## Tests

- Unit and rendering tests: `tests/journey-*.test.ts` (validation, state machine, calculation, providers, repository, camera
  logic, admin summary, wording and "nothing leaves the browser" guards). They run in `npm test` and CI.
- Browser test of the whole journey, the camera states, 9 viewport widths x 15 screens, keyboard/focus/dialog behaviour, and the
  admin views: `npm run e2e:journey` (opt-in; see the header of `scripts/e2e-journey.mjs`). Playwright is not a dependency.

## Phase 2 notes

Server-side drafts need: a draft table and migration, a public create/update API with rate limiting and server-side
validation of each step, a link between a draft and an admin application record, and consent records. None of that is part of
this phase, and no Production setting or data was changed for it.
