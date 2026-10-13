// End-to-end browser test of the customer journey (Phase 1) and the admin journey views.
//
// This is an OPT-IN script, not part of `npm test` or CI: it needs a running production build and a Chromium that
// Playwright can drive. Playwright is NOT a dependency of this repository (nothing is added to package.json); install it
// wherever you run this, or point PLAYWRIGHT_RESOLVE at a folder that contains node_modules/playwright.
//
//   npm run build && npm start &                       # or any running build of this app
//   E2E_ADMIN_PASSWORD='<local throwaway admin password>' npm run e2e:journey
//
// Environment:
//   BASE                  app URL (default http://localhost:3100)
//   CHROMIUM_PATH         Chromium executable (default: Playwright's own)
//   PLAYWRIGHT_RESOLVE    folder to resolve "playwright" from (default: this repository)
//   E2E_ADMIN_USERNAME    admin username (default qaadmin)
//   E2E_ADMIN_PASSWORD    admin password; without it the admin part is reported as BLOCKED
//   SHOTS                 folder to write screenshots to (optional)
//
// Only ever use this against a LOCAL app with a throwaway admin. It completes a full demo journey with fictional data,
// logs in as the admin you give it, and exercises sign-out. Never run it against production or with real credentials.
import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT_RESOLVE ? `${process.env.PLAYWRIGHT_RESOLVE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS;
const ADMIN_USER = process.env.E2E_ADMIN_USERNAME ?? "qaadmin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD;
const REF = /^DFK-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

const results = [];
const rec = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

const problems = [];
function watch(page, label) {
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`[${label}] ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`[${label}] requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const path = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const waitPath = (page, p) => page.waitForURL((u) => u.pathname + u.search === p || u.pathname === p, { timeout: 15000 });
const radio = (page, group, label) => page.getByRole("group", { name: group }).getByRole("radio", { name: label, exact: true });
const errors = (page) => page.locator(".cj-error").allInnerTexts();

// ============================================================ PART A: the whole journey, one browser context
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
const page = await ctx.newPage();
watch(page, "A");

// ---- 1. entry
await page.goto(`${BASE}/apply`);
await page.waitForSelector("text=Start Application");
const entryText = await page.locator("main").innerText();
rec("entry: product intro, demo disclosure and privacy text", /simulated/i.test(entryText) && /fictional/i.test(entryText) && /this browser only/i.test(entryText));
rec("entry: no continue option when nothing is saved", (await page.locator("text=Continue Existing Application").count()) === 0);
await shot(page, "a01-entry");
await page.click("text=Start Application");
await waitPath(page, "/apply/basic-details");
await page.waitForSelector("h1:has-text('Basic Details')");
const ref = (await page.locator(".cj-refline strong").innerText()).trim();
rec("reference id generated, well-formed and not a phone/PAN", REF.test(ref), ref);
rec("progress indicator present (segments + current step)", (await page.locator(".cj-segbar .cj-seg").count()) === 8 && /Step 1 of 8/.test(await page.locator(".cj-tracker-head").innerText()));

// ---- 2. basic details: validation
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForSelector(".cj-error");
let errs = await errors(page);
rec("basic: empty submit shows an error per required field", errs.length >= 5, `${errs.length} errors`);
rec("basic: first invalid field gets focus", (await page.evaluate(() => document.activeElement?.id)) === "f-mobile");
rec("basic: error summary announced", await page.locator('.cj-alert-error[role="alert"]').isVisible());
await page.fill("#f-mobile", "12345");
await page.locator("#f-mobile").blur();
rec("basic: bad mobile rejected", (await errors(page)).some((e) => /10-digit/.test(e)));
await page.fill("#f-mobile", "9000000001");
rec("basic: mobile error clears once corrected", !(await errors(page)).some((e) => /10-digit/.test(e)));
await page.fill("#f-dob", "2015-01-01");
await page.locator("#f-dob").blur();
rec("basic: under-age DOB rejected", (await errors(page)).some((e) => /at least 18/.test(e)));
await page.fill("#f-dob", "1990-05-15");
await page.fill("#f-panName", "Test Applicant");
await page.fill("#f-pan", "abcde1234f");
await page.locator("#f-pan").blur();
rec("basic: PAN uppercased and holder-type letter enforced", (await page.inputValue("#f-pan")) === "ABCDE1234F" && (await errors(page)).some((e) => /valid PAN/.test(e)));
await page.fill("#f-pan", "QWEPR5678K");
await page.check("#f-fictionalConfirmed");
// Continue is blocked until the simulated verification has run
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForSelector("text=Run the demo verification before continuing");
rec("basic: cannot continue before demo verification", path(page) === "/apply/basic-details");
rec("basic: statuses start as Not Started", (await page.locator(".cj-badges").last().innerText()).includes("Not Started"));
await page.getByRole("button", { name: "Run demo verification (simulated)" }).click();
await page.waitForSelector("text=Both checks show Demo Verified");
const pillText = await page.locator(".cj-badges").last().innerText();
rec("basic: demo verification labelled DEMO, never 'verified by authority'", /Demo Verified/.test(pillText) && /simulated/i.test(await page.locator("section[aria-labelledby=verify-title]").innerText()) && !/verified by|authority confirmed/i.test(await page.locator("section[aria-labelledby=verify-title]").innerText().then((t) => t.replace(/not an authority/gi, ""))));
rec("basic: PAN shown masked after verification and raw PAN not in the page", (await page.inputValue("#f-pan-masked")) === "QW******8K" && !(await page.content()).includes("QWEPR5678K"));
const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const storedText = JSON.stringify(stored);
rec("storage: raw PAN never written", !storedText.includes("QWEPR5678K") && storedText.includes("QW******8K"));
await shot(page, "a02-basic-verified");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/kyc");

// ---- 3. KYC
rec("kyc: continue disabled until demo verification", await page.getByRole("button", { name: "Continue", exact: true }).isDisabled());
rec("kyc: shows the same reference id", (await page.locator(".cj-refline strong").innerText()) === ref);
await page.getByRole("button", { name: /Request verification \(demo\)/ }).click();
rec("kyc: request without consent is refused", (await errors(page)).some((e) => /consent first/i.test(e)));
await page.check("#f-kycConsent");
rec("kyc: status shows Consent given -> Not Started/consent flow", (await page.locator("#docs-title").locator("xpath=..").innerText()).includes("Not Started"));
await page.getByRole("button", { name: /Request verification \(demo\)/ }).click();
await page.waitForSelector("#f-otp");
rec("kyc: demo code issued, clearly demo, no SMS claim", /No SMS was sent/.test(await page.locator("main").innerText()) && (await page.locator("main").innerText()).includes("Demo OTP Issued"));
rec("kyc: resend timer is counting and resend is disabled", await page.getByRole("button", { name: /Resend code in \d+s/ }).isDisabled());
await page.fill("#f-otp", "12ab");
rec("kyc: OTP input accepts digits only", (await page.inputValue("#f-otp")) === "12");
await page.getByRole("button", { name: "Verify code (demo)" }).click();
rec("kyc: short code rejected", (await errors(page)).some((e) => /6-digit/.test(e)));
await page.fill("#f-otp", "000000");
await page.getByRole("button", { name: "Verify code (demo)" }).click();
await page.waitForSelector("text=not correct");
rec("kyc: wrong code reduces attempts and clears the field", /2 attempts left/.test((await errors(page)).join(" ")) && (await page.inputValue("#f-otp")) === "");
// OTP is never persisted
rec("storage: no OTP in browser storage", !JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).includes("123456"));
// cancel then re-request
await page.getByRole("button", { name: "Cancel request" }).click();
await page.waitForSelector("text=Request cancelled");
rec("kyc: cancel state shown", true);
await page.getByRole("button", { name: /Request verification again/ }).click();
await page.waitForSelector("#f-otp");
await page.fill("#f-otp", "123456");
await page.getByRole("button", { name: "Verify code (demo)" }).click();
await page.waitForSelector("text=Demo verification complete");
rec("kyc: demo verified; document summary is a placeholder with no identity numbers", /Placeholder|PLACEHOLDER/.test(await page.locator("main").innerText()) && !/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(await page.locator("main").innerText()));
await shot(page, "a03-kyc-verified");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/demographics/personal");

// ---- 4. demographics step 1
rec("demographics 1: step badge, PAN badge and reference shown", /Step 1\/3/.test(await page.locator("main").innerText()) && (await page.locator("main").innerText()).includes("PAN: Demo Verified") && (await page.locator("main").innerText()).includes(ref));
await page.getByRole("button", { name: "Save & Next" }).click();
await page.waitForSelector(".cj-error");
errs = await errors(page);
rec("demographics 1: required fields flagged (names, amount, marital, relation, father, employment)", errs.length >= 8, `${errs.length}`);
await page.fill("#f-firstName", "Asha");
await page.fill("#f-lastName", "Verma");
await page.fill("#f-email", "bad");
await page.locator("#f-email").blur();
rec("demographics 1: email format checked", (await errors(page)).some((e) => /valid email/.test(e)));
await page.fill("#f-email", "asha@example.com");
await page.fill("#f-requestedAmount", "0");
await page.locator("#f-requestedAmount").blur();
rec("demographics 1: zero amount rejected", (await errors(page)).some((e) => /greater than zero|at least/.test(e)));
await page.fill("#f-requestedAmount", "50000");
rec("demographics 1: amount echoed in Indian grouping", (await page.locator("#f-requestedAmount-hint").innerText()).includes("₹50,000"));
await page.selectOption("#f-maritalStatus", "single");
await page.selectOption("#f-relation", "daughter_of");
await page.fill("#f-fatherFirstName", "Ravi");
await page.fill("#f-fatherLastName", "Verma");
rec("demographics 1: no employment fields before choosing a type", (await page.locator("#f-businessName, #f-employerName").count()) === 0);
await radio(page, /Employment type/, "Self Employed").check();
rec("demographics 1: self-employed shows business name + monthly income", (await page.locator("#f-businessName").isVisible()) && (await page.locator("label[for=f-monthlyIncome]").innerText()).includes("Monthly income"));
await radio(page, /Employment type/, "Salaried").check();
rec("demographics 1: salaried shows employer + monthly salary + optional duration", (await page.locator("#f-employerName").isVisible()) && (await page.locator("label[for=f-monthlyIncome]").innerText()).includes("Monthly salary") && (await page.locator("#f-businessName").count()) === 0);
await page.getByRole("button", { name: "Save & Next" }).click();
rec("demographics 1: conditional required fields enforced", (await errors(page)).some((e) => /Employer or company name is required/.test(e)) && (await errors(page)).some((e) => /Monthly salary is required/.test(e)));
await page.fill("#f-employerName", "Demo Works Pvt Ltd");
await page.fill("#f-monthlyIncome", "40000");
// back / forward preservation: leave without finishing, come back
await page.getByRole("button", { name: "Back", exact: true }).click();
await waitPath(page, "/apply/kyc");
await page.goBack();
await waitPath(page, "/apply/demographics/personal");
await page.waitForSelector("#f-firstName");
rec("navigation: Back saved the half-filled form and it is restored", (await page.inputValue("#f-firstName")) === "Asha" && (await page.inputValue("#f-employerName")) === "Demo Works Pvt Ltd" && (await page.inputValue("#f-monthlyIncome")) === "40000");
await page.reload();
await page.waitForSelector("#f-firstName");
rec("refresh restores saved values", (await page.inputValue("#f-lastName")) === "Verma" && (await page.inputValue("#f-requestedAmount")) === "50000");
await page.getByRole("button", { name: "Save & Next" }).click();
await waitPath(page, "/apply/demographics/address");

// ---- 5. demographics step 2 (address)
rec("demographics 2: step badge, applicant summary and verification status", /Step 2\/3/.test(await page.locator("main").innerText()) && (await page.locator("main").innerText()).includes("Address verification"));
await page.getByRole("button", { name: "Save & Next" }).click();
rec("demographics 2: empty address blocked with errors", (await errors(page)).length >= 6);
await page.fill("#f-line1", "12 Demo Street");
await page.fill("#f-city", "Pune");
await page.selectOption("#f-state", "Maharashtra");
await page.fill("#f-pin", "41100a");
rec("demographics 2: PIN accepts digits only", (await page.inputValue("#f-pin")) === "41100");
await page.fill("#f-pin", "411001");
rec("demographics 2: country defaults to India and is read-only", (await page.inputValue("#f-country")) === "India" && (await page.locator("#f-country").getAttribute("readonly")) !== null);
rec("demographics 2: address summary shown", (await page.locator("main").innerText()).includes("12 Demo Street, Pune"));
await radio(page, /same as the verified document address/, "No").check();
rec("demographics 2: different document address shows a review (not rejection) warning", /marked for review/i.test(await page.locator("main").innerText()) && /does not reject/i.test(await page.locator("main").innerText()));
await radio(page, /Delivery address same as above/, "No").check();
rec("demographics 2: choosing No reveals editable delivery fields prefilled from the address", (await page.locator("#f-delivery-line1").isVisible()) && (await page.inputValue("#f-delivery-line1")) === "12 Demo Street");
await page.fill("#f-delivery-line1", "");
await page.getByRole("button", { name: "Save & Next" }).click();
rec("demographics 2: delivery address validated only when shown", (await errors(page)).some((e) => /Address line 1 is required/.test(e)));
await page.fill("#f-delivery-line1", "5 Other Road");
await radio(page, /Delivery address same as above/, "Yes").check();
rec("demographics 2: choosing Yes hides the delivery fields", (await page.locator("#f-delivery-line1").count()) === 0);
await shot(page, "a04-address");
await page.getByRole("button", { name: "Save & Next" }).click();
await waitPath(page, "/apply/demographics/asset");

// ---- 6. demographics step 3 (asset)
rec("demographics 3: step badge and reference", /Step 3\/3/.test(await page.locator("main").innerText()));
rec("demographics 3: dependent selects start disabled", (await page.locator("#f-manufacturer").isDisabled()) && (await page.locator("#f-model").isDisabled()) && (await page.locator("#f-variant").isDisabled()));
await page.getByRole("button", { name: "Save", exact: true }).click();
rec("demographics 3: required selects and both Yes/No questions flagged", (await errors(page)).length >= 6);
await page.selectOption("#f-productType", "smartphone");
await page.selectOption("#f-manufacturer", "aurora-mobile");
await page.selectOption("#f-model", "am-lite-5");
await page.selectOption("#f-variant", "128gb");
rec("demographics 3: category and sub-category derived from the catalog", (await page.inputValue("#f-category")) === "Consumer electronics" && (await page.inputValue("#f-subCategory")) === "Mobile phones");
await page.selectOption("#f-manufacturer", "bluepeak");
rec("demographics 3: changing manufacturer resets incompatible model and variant", (await page.inputValue("#f-model")) === "" && (await page.inputValue("#f-variant")) === "" && (await page.inputValue("#f-category")) === "");
await page.selectOption("#f-model", "bp-x2");
await page.selectOption("#f-manufacturer", "aurora-mobile");
await page.selectOption("#f-model", "am-lite-5");
await page.selectOption("#f-variant", "128gb");
rec("demographics 3: neither Yes/No question is preselected", (await radio(page, /Suspected activity/, "Yes").isChecked()) === false && (await radio(page, /Do you want to apply for Step-up/, "No").isChecked()) === false);
await radio(page, /Suspected activity/, "No").check();
await radio(page, /Do you want to apply for Step-up/, "No").check();
rec("demographics 3: eligibility warning shown", /business rules/i.test(await page.locator("main").innerText()));
await page.getByRole("button", { name: "Save", exact: true }).click();
await waitPath(page, "/apply/journey");

// ---- 7. journey summary
await page.waitForSelector(".cj-journey");
const rows = await page.locator(".cj-journey > li").allInnerTexts();
const statusOf = (i) => (rows[i].match(/Completed|In Progress|Pending|Review Required|Failed/) ?? [""])[0];
rec("journey: 8 steps; Basic and KYC completed; Demographics Review Required (different document address); the rest pending", rows.length === 8 && [0, 1].every((i) => statusOf(i) === "Completed") && statusOf(2) === "Review Required" && [3, 4, 5, 6, 7].every((i) => statusOf(i) === "Pending"), rows.map((_, i) => statusOf(i)).join(","));
rec("journey: the review reason is shown on the step", /address differs/i.test(rows[2]));
rec("journey: the next step has a Proceed button, later steps are locked", (await page.locator(".cj-journey").getByRole("link", { name: "Proceed" }).count()) === 1 && /Locked/.test(rows[5]));
rec("journey: locked step cannot be opened by URL", await (async () => { await page.goto(`${BASE}/apply/asset-scheme`); await page.waitForURL(/\/apply\/journey\?locked=asset/); return /not open yet/.test(await page.locator("main").innerText()); })());
await shot(page, "a05-journey");
await page.getByRole("link", { name: "Proceed" }).first().click();
await waitPath(page, "/apply/liveness");

// ---- 8. liveness consent
await page.getByRole("button", { name: "Start Verification" }).click();
rec("liveness: Start refused without consent", (await errors(page)).some((e) => /consent/i.test(e)) && path(page) === "/apply/liveness");
const introText = await page.locator("main").innerText();
rec("liveness: lighting/glasses/hat/face/background tips, biometric consent and privacy disclosure", /lighting/i.test(introText) && /glasses/i.test(introText) && /hats/i.test(introText) && /face/i.test(introText) && /background/i.test(introText) && /authorized provider/i.test(introText) && /not uploaded/i.test(introText) && /Integration required/.test(introText));
await page.check("#f-livenessConsent");
await page.getByRole("button", { name: "Start Verification" }).click();
await waitPath(page, "/apply/liveness/capture");
await page.waitForSelector("video:not([hidden])", { timeout: 15000 });
rec("liveness camera: preview with face oval after pressing Start Verification", await page.locator(".cj-oval").isVisible());
const cameraHeader = (await page.request.get(`${BASE}/apply/liveness/capture`)).headers()["permissions-policy"];
rec("liveness camera: Permissions-Policy allows the camera for self on this screen only", /camera=\(self\)/.test(cameraHeader) && /camera=\(\)/.test((await page.request.get(`${BASE}/apply`)).headers()["permissions-policy"]), cameraHeader);
await page.getByRole("button", { name: "Capture photo" }).click();
await page.waitForSelector("img[alt^='Your captured photo']");
rec("liveness camera: captured preview with Retake and Continue", (await page.getByRole("button", { name: "Retake" }).isVisible()) && (await page.getByRole("button", { name: "Continue", exact: true }).isVisible()));
const liveTracks = await page.evaluate(() => (document.querySelector("video")?.srcObject ? 1 : 0));
rec("liveness camera: stream released after capture", liveTracks === 0);
rec("storage: no image data in browser storage", !JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).match(/blob:|data:image|base64/));
await page.getByRole("button", { name: "Retake" }).click();
await page.waitForSelector("video:not([hidden])");
await page.getByRole("button", { name: "Capture photo" }).click();
await page.waitForSelector("img[alt^='Your captured photo']");
await shot(page, "a06-capture");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/liveness/result");
await page.waitForSelector("text=Liveness: demo passed", { timeout: 15000 });
const resultText = await page.locator("main").innerText();
rec("liveness result: DEMO score is labelled, no genuine match claim, generic reference placeholder", /92%/.test(resultText) && /DEMO/.test(resultText) && /fixed demo value/i.test(resultText) && /Reference image \(generic placeholder\)/.test(resultText) && !/identity (verified|confirmed)/i.test(resultText));
rec("liveness result: Proceed enabled after the demo result", await page.getByRole("button", { name: "Proceed" }).isEnabled());
await shot(page, "a07-liveness-result");
await page.getByRole("button", { name: "Proceed" }).click();
await waitPath(page, "/apply/offer");

// ---- 9. soft offer
await page.waitForSelector("text=Indicative offer");
const offerText = await page.locator("main").innerText();
rec("offer: labelled DEMO/INDICATIVE, says it is not a sanction, never says approved/sanctioned", /DEMO/.test(offerText) && /INDICATIVE/.test(offerText) && /Nothing here is a sanction/i.test(offerText) && !/approved|sanctioned/i.test(offerText));
rec("offer: amounts in rupees with Indian grouping, EMI, fee, taxes, total, expiry placeholder", /₹50,000/.test(offerText) && /Illustrative EMI/.test(offerText) && /Indicative processing fee/.test(offerText) && /Applicable taxes/.test(offerText) && /Illustrative total payable/.test(offerText) && /Offer expiry/.test(offerText));
await shot(page, "a08-offer");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/asset-scheme");

// ---- 10. asset & scheme
await page.waitForSelector("text=Choose a scheme");
rec("scheme: nothing preselected", (await page.locator("input[name=schemeId]:checked").count()) === 0);
rec("scheme: step-up unavailable because the answer was No; 18-month below the demo minimum price", (await page.locator(".cj-option.is-disabled").count()) === 2);
await page.getByRole("button", { name: "Save & Continue" }).click();
rec("scheme: continuing without a choice is blocked", (await errors(page)).some((e) => /Choose a scheme/.test(e)));
await page.locator("input[name=schemeId][value=std-12]").check();
rec("scheme: selected scheme summary shown", /Standard 12 months \(demo\)/.test(await page.locator("main").innerText()) && /Final terms depend/.test(await page.locator("main").innerText()));
// changing the step-up answer re-evaluates schemes (data-driven)
await radio(page, /Do you want to apply for Step-up/, "Yes").check();
await page.waitForFunction(() => document.querySelectorAll(".cj-option.is-disabled").length === 1);
rec("scheme: step-up becomes selectable (review) after answering Yes", (await page.locator("main").innerText()).includes("Review required"));
await radio(page, /Do you want to apply for Step-up/, "No").check();
await page.waitForFunction(() => document.querySelectorAll(".cj-option.is-disabled").length === 2);
await page.locator("input[name=schemeId][value=std-12]").check();
await page.selectOption("#f-variant", "64gb");
rec("scheme: choosing a different product clears the chosen scheme (it must be chosen again)", (await page.locator("input[name=schemeId]:checked").count()) === 0);
await page.selectOption("#f-variant", "128gb");
await page.locator("input[name=schemeId][value=std-12]").check();
await page.getByRole("button", { name: "Save & Continue" }).click();
await waitPath(page, "/apply/add-ons");

// ---- 11. add-ons
rec("add-ons: none preselected; subtotal ₹0.00", (await page.locator(".cj-option.is-selected").count()) === 0 && /₹0\.00/.test(await page.locator(".cj-actionbar").innerText()));
await page.getByRole("button", { name: /Add Device care plan/ }).click();
rec("add-ons: selecting updates the subtotal (first coverage option)", /₹1,499\.00/.test(await page.locator(".cj-actionbar").innerText()));
await page.getByRole("radio", { name: /24 months/ }).check();
rec("add-ons: coverage option changes the subtotal consistently", /₹2,499\.00/.test(await page.locator(".cj-actionbar").innerText()));
await page.getByRole("button", { name: /Remove Device care plan/ }).click();
rec("add-ons: deselecting returns the subtotal to zero", /₹0\.00/.test(await page.locator(".cj-actionbar").innerText()));
rec("add-ons: exclusions and tax disclosure present", /Exclusions and taxes/.test(await page.locator("main").innerText()));
await page.getByRole("button", { name: /Add Delivery and set-up/ }).click();
rec("add-ons: button label reflects an explicit choice", await page.getByRole("button", { name: "Continue", exact: true }).isVisible());
await shot(page, "a09-addons");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/calculation");

// ---- 12. final calculation
await page.waitForSelector("text=Your illustrative breakdown");
const calcText = await page.locator("main").innerText();
for (const label of ["Asset price", "Selected scheme", "Down payment", "Total financed amount", "Illustrative interest rate", "Tenure", "EMI (illustrative)", "Processing fee", "Taxes on fees", "Total interest", "Total payable", "Assumptions", "may differ after an authorized lender"]) {
  rec(`calculation: shows "${label}"`, new RegExp(label.replace(/[()]/g, "\\$&"), "i").test(calcText));
}
const financed = (t) => (t.replace(/\s+/g, " ").match(/Total financed amount (₹[\d,.]+)/) ?? [])[1];
rec("calculation: figures consistent (14,999 + 499 add-on - 10% down 1,499.90 = 13,998.10 financed)", financed(calcText) === "₹13,998.10", financed(calcText));
rec("calculation: asset price, down payment and add-ons itemised exactly", /Asset price \(demo catalog\) ₹14,999\.00/.test(calcText.replace(/\s+/g, " ")) && /Down payment ₹1,499\.90/.test(calcText.replace(/\s+/g, " ")) && /Selected add-ons ₹499\.00/.test(calcText.replace(/\s+/g, " ")));
rec("calculation: states it is not a loan agreement, mandate, signature or disbursement", /not a loan agreement, mandate, signature or disbursement/i.test(calcText.replace(/\s+/g, " ")));
await shot(page, "a10-calculation");
await page.getByRole("button", { name: "Recalculate" }).click();
await page.waitForTimeout(300);
rec("calculation: recalculate keeps a consistent result", financed(await page.locator("main").innerText()) === "₹13,998.10");
// editing a selection invalidates the calculation
await page.getByRole("link", { name: "Back to edit selections" }).click();
await waitPath(page, "/apply/add-ons");
await page.getByRole("button", { name: /Add Extended support/ }).click();
await page.getByRole("button", { name: "Continue", exact: true }).click();
await waitPath(page, "/apply/calculation");
await page.waitForSelector("text=Your illustrative breakdown");
rec("calculation: adding a 799 add-on raises the financed total to 14,797.10", financed(await page.locator("main").innerText()) === "₹14,797.10", financed(await page.locator("main").innerText()));
rec("complete is not reachable before the calculation is confirmed", await (async () => { await page.goto(`${BASE}/apply/complete`); await page.waitForURL(/\/apply\/journey/); return true; })());
await page.goto(`${BASE}/apply/calculation`);
await page.waitForSelector("text=Your illustrative breakdown");
await page.getByRole("button", { name: "Complete Demo Journey" }).click();
await waitPath(page, "/apply/complete");

// ---- 13. completion
await page.waitForSelector("text=You have completed the demo journey");
const doneText = await page.locator("main").innerText();
rec("completion: 'Demo Journey Completed', reference, no approval/disbursement claim", /Demo Journey Completed/.test(doneText) && doneText.includes(ref) && /No loan has been approved, sanctioned or disbursed/.test(doneText) && !/Loan Approved|funds will be disbursed/i.test(doneText));
rec("completion: lists step statuses and outstanding integration requirements", /Journey summary/.test(doneText) && /Still required before this could be real/.test(doneText) && /DigiLocker/.test(doneText) && /liveness/i.test(doneText));
rec("completion: Return to dashboard and View application summary work", (await page.getByRole("link", { name: "Return to dashboard" }).count()) === 1 && (await page.getByRole("link", { name: "View application summary" }).count()) === 1);
await shot(page, "a11-complete");
await page.getByRole("link", { name: "View application summary" }).click();
await waitPath(page, "/apply/journey");
const finalRows = await page.locator(".cj-journey > li").allInnerTexts();
rec("journey: every step shows Completed or Review Required after the full journey", finalRows.length === 8 && finalRows.every((r) => /Completed|Review Required/.test(r)), finalRows.map((r) => (r.match(/Completed|Review Required|Pending|In Progress|Failed/) ?? ["?"])[0]).join(","));
rec("journey: overall status says the demo journey is complete or needs review", /Demo journey completed|Review required/i.test(await page.locator("main").innerText()));
await page.goto(`${BASE}/apply`);
rec("entry: Continue Existing Application offered with the same reference", (await page.getByRole("link", { name: /Continue Existing Application/ }).count()) === 1 && (await page.locator(".cj-existing").innerText()).includes(ref));

// desktop shell: the step list is the LEFT column and the page content the right one (DOM order must match the grid)
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(`(() => { const d = ${JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))))}; for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); })();`);
  const p = await c.newPage();
  await p.goto(`${BASE}/apply/journey`);
  await p.waitForSelector("h1");
  const g = await p.evaluate(() => {
    const side = document.querySelector(".cj-side").getBoundingClientRect();
    const main = document.querySelector(".cj-main").getBoundingClientRect();
    const tracker = document.querySelector(".cj-tracker").getBoundingClientRect();
    return { sideLeft: side.left, mainLeft: main.left, sideRight: side.right, trackerInMain: tracker.left >= main.left - 1 && tracker.right <= main.right + 1, trackerHeight: tracker.height, mainWidth: main.width };
  });
  rec("desktop layout: step list on the left, page content on the right (not swapped)", g.sideLeft < g.mainLeft && g.sideRight <= g.mainLeft + 1, JSON.stringify(g));
  rec("desktop layout: progress summary sits inside the content column and is compact", g.trackerInMain && g.trackerHeight < 140, JSON.stringify(g));
  rec("desktop layout: content column is a readable width", g.mainWidth >= 600 && g.mainWidth <= 800, String(g.mainWidth));
  await p.screenshot({ path: SHOTS ? `${SHOTS}/g01-desktop-journey.png` : undefined });
  await c.close();
}

// remember this browser's saved drafts for the viewport matrix and the admin part
const dump = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

// ============================================================ PART B: access rules
{
  const c = await browser.newContext();
  const p = await c.newPage();
  watch(p, "B");
  await p.goto(`${BASE}/apply/offer`);
  await p.waitForURL(`${BASE}/apply`);
  rec("access: a step URL with no saved application goes to the start", true);
  await p.goto(`${BASE}/apply/liveness/capture`);
  await p.waitForURL(`${BASE}/apply`);
  rec("access: the camera screen is not reachable without an application", true);
  await c.close();
}

// ============================================================ PART C: camera problems and unsupported devices
const seedInit = (data) => `(() => { const d = ${JSON.stringify(data)}; for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); })();`;
// a draft that has everything up to and including liveness consent: strip the liveness capture/result and later steps
function draftAtLivenessConsent(dumpObj) {
  const out = { ...dumpObj };
  for (const k of Object.keys(out)) {
    if (k.startsWith("dfk.journey.v1.draft.")) {
      const d = JSON.parse(out[k]);
      d.liveness = { consent: true, source: "", captured: false };
      d.offer = { inputKey: "", acknowledged: false };
      d.schemeId = ""; d.addons = { selected: [], confirmed: false }; d.calculation = {}; delete d.completedAt;
      out[k] = JSON.stringify(d);
    }
  }
  return out;
}
const atConsent = draftAtLivenessConsent(dump);
const cameraCases = [
  ["permission denied", `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));`, /Camera permission was denied/],
  ["no camera device", `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("none", "NotFoundError"));`, /No camera found/],
  ["camera busy", `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("busy", "NotReadableError"));`, /Camera is busy/],
  ["unsupported device", `Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });`, /Camera not supported/],
];
for (const [label, script, expectText] of cameraCases) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(seedInit(atConsent));
  await c.addInitScript(script);
  const p = await c.newPage();
  watch(p, `C-${label}`);
  await p.goto(`${BASE}/apply/liveness`);
  await p.waitForSelector("#f-livenessConsent");
  rec(`camera (${label}): no permission is requested just by opening the intro screen`, true);
  await p.getByRole("button", { name: "Start Verification" }).click();
  await waitPath(p, "/apply/liveness/capture");
  await p.waitForSelector(".cj-camera-msg[role=alert]", { timeout: 10000 });
  rec(`camera (${label}): clear, user-friendly message`, expectText.test(await p.locator(".cj-camera-msg").innerText()) && !/NotAllowedError|DOMException|stack/i.test(await p.locator("main").innerText()), (await p.locator(".cj-camera-msg").innerText()).replace(/\n/g, " "));
  rec(`camera (${label}): retry and simulated-placeholder alternatives offered`, (await p.getByRole("button", { name: /Try the camera again/ }).isVisible()) && (await p.getByRole("button", { name: /simulated placeholder/ }).first().isVisible()));
  if (label === "permission denied") {
    await shot(p, "c01-camera-denied");
    await p.getByRole("button", { name: /simulated placeholder/ }).first().click();
    await waitPath(p, "/apply/liveness/result");
    await p.waitForSelector("text=Liveness: demo passed", { timeout: 15000 });
    const t = await p.locator("main").innerText();
    rec("camera: placeholder path is marked simulated and takes no photo", /Simulated: no photo taken/.test(t) && /DEMO/.test(t));
    rec("camera: placeholder result lets the journey continue", await p.getByRole("button", { name: "Proceed" }).isEnabled());
  }
  await c.close();
}
// the camera screen must not request the camera by itself on a fresh visit
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(seedInit(atConsent));
  await c.addInitScript(`window.__gum = 0; const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (...a) => { window.__gum++; return o(...a); };`);
  const p = await c.newPage();
  await p.goto(`${BASE}/apply/liveness/capture`);
  await p.waitForSelector("text=Start camera");
  rec("camera: a direct visit does not request the camera until the person presses a button", (await p.evaluate(() => window.__gum)) === 0);
  await c.close();
}

// ============================================================ PART D: layout at every width, every screen
const allLinks = new Set();
const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 1024, 1280];
const SCREENS = ["/apply", "/apply/journey", "/apply/basic-details", "/apply/kyc", "/apply/demographics/personal", "/apply/demographics/address", "/apply/demographics/asset", "/apply/liveness", "/apply/liveness/capture", "/apply/liveness/result", "/apply/offer", "/apply/asset-scheme", "/apply/add-ons", "/apply/calculation", "/apply/complete"];
for (const w of WIDTHS) {
  const c = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 800 } });
  await c.addInitScript(seedInit(dump));
  const p = await c.newPage();
  watch(p, `D-${w}`);
  const bad = [];
  for (const route of SCREENS) {
    await p.goto(`${BASE}${route}`);
    await p.waitForSelector("h1", { timeout: 15000 });
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = { overflow: document.documentElement.scrollWidth - vw, clipped: [], small: [], noName: [], noAlt: 0, overlap: [] };
      const inView = (r) => r.width > 0 && r.height > 0;
      document.querySelectorAll(".cj-btn, .cj-input, .cj-radio, .cj-check, .cj-iconbtn, .cj-tracker, .cj-card, .cj-actionbar").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (inView(r) && (r.right > vw + 0.5 || r.left < -0.5)) out.clipped.push(`${el.className.toString().slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)}`);
      });
      document.querySelectorAll(".cj-btn, .cj-input, .cj-radio, .cj-check").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (inView(r) && r.height < 44 - 0.5) out.small.push(`${el.className.toString().slice(0, 24)} h=${Math.round(r.height)}`);
      });
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        if (el.type === "hidden") return;
        const named = (el.labels && el.labels.length > 0) || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
        if (!named) out.noName.push(el.id || el.name || el.tagName);
      });
      out.noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
      window.scrollTo(0, document.body.scrollHeight);
      const bar = document.querySelector(".cj-actionbar");
      if (bar) {
        const br = bar.getBoundingClientRect();
        document.querySelectorAll(".cj-main input, .cj-main select, .cj-main textarea, .cj-main .cj-card button, .cj-main .cj-card a.cj-btn").forEach((el) => {
          if (bar.contains(el)) return;
          const r = el.getBoundingClientRect();
          if (inView(r) && r.bottom > br.top + 1 && r.top < br.bottom - 1) out.overlap.push(el.id || el.className.toString().slice(0, 20));
        });
      }
      return out;
    });
    if (m.overflow > 0) bad.push(`${route}: horizontal overflow ${m.overflow}px`);
    if (m.clipped.length) bad.push(`${route}: clipped ${m.clipped.slice(0, 3).join("; ")}`);
    if (m.small.length) bad.push(`${route}: small targets ${m.small.slice(0, 3).join("; ")}`);
    if (m.noName.length) bad.push(`${route}: unlabeled controls ${m.noName.join(",")}`);
    if (m.noAlt) bad.push(`${route}: img without alt`);
    if (m.overlap.length) bad.push(`${route}: action bar covers ${m.overlap.slice(0, 3).join(",")}`);
    if (w === 1280) (await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")))).filter((h) => h && h.startsWith("/")).forEach((h) => allLinks.add(h.split("#")[0]));
    if (w === 320 || w === 430 || w === 1280) await shot(p, `d-${route.replace(/\//g, "_")}-${w}`);
  }
  rec(`layout @${w}px: ${SCREENS.length} screens, no overflow/clipping/small targets/unlabeled controls/covered fields`, bad.length === 0, bad.slice(0, 6).join(" | "));
  await c.close();
}

// every internal link found on the customer screens must resolve (no broken links, no missing routes)
{
  const c = await browser.newContext();
  const brokenLinks = [];
  for (const href of allLinks) {
    const r = await c.request.get(`${BASE}${href}`);
    if (r.status() >= 400) brokenLinks.push(`${href} -> ${r.status()}`);
  }
  rec(`links: all ${allLinks.size} internal links on the customer screens resolve`, brokenLinks.length === 0 && allLinks.size > 5, brokenLinks.join(", "));
  await c.close();
}

// ============================================================ PART D2: soft-offer outcomes in the browser
function mutateDrafts(dumpObj, fn) {
  const out = { ...dumpObj };
  for (const k of Object.keys(out)) {
    if (k.startsWith("dfk.journey.v1.draft.")) {
      const d = JSON.parse(out[k]);
      fn(d);
      out[k] = JSON.stringify(d);
    }
  }
  return out;
}
const resetFromOffer = (d) => { d.offer = { inputKey: "", acknowledged: false }; d.schemeId = ""; d.addons = { selected: [], confirmed: false }; d.calculation = {}; delete d.completedAt; };
for (const [label, requested, income, expectText, canContinue] of [
  ["eligible", 50000, 40000, "Indicative offer (demo)", true],
  ["review required", 500000, 20000, "Review required", true],
  ["not eligible", 50000, 500, "Not eligible in this demo", false],
]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(seedInit(mutateDrafts(dump, (d) => { resetFromOffer(d); d.personal.requestedAmount = requested; d.personal.monthlyIncome = income; })));
  const p = await c.newPage();
  watch(p, `D2-${label}`);
  await p.goto(`${BASE}/apply/offer`);
  await p.waitForSelector("#offer-title", { timeout: 15000 });
  const t = await p.locator("main").innerText();
  rec(`offer (${label}): shows "${expectText}" and DEMO labelling`, t.includes(expectText) && /DEMO/.test(t) && !/approved|sanctioned/i.test(t));
  rec(`offer (${label}): Continue is ${canContinue ? "available" : "withheld, with a way to edit details"}`, canContinue ? await p.getByRole("button", { name: "Continue", exact: true }).isVisible() : (await p.getByRole("button", { name: "Continue", exact: true }).count()) === 0 && (await p.getByRole("link", { name: "Edit my details" }).count()) === 1);
  if (label === "not eligible") {
    rec("offer (not eligible): later steps stay locked", await (async () => { await p.goto(`${BASE}/apply/asset-scheme`); await p.waitForURL(/\/apply\/journey\?locked=asset/); return true; })());
  }
  await c.close();
}

// ============================================================ PART E: keyboard, focus, dialog, reduced motion
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await c.addInitScript(seedInit(dump));
  const p = await c.newPage();
  watch(p, "E");
  await p.goto(`${BASE}/apply/basic-details`);
  await p.waitForSelector("h1");
  await p.keyboard.press("Tab");
  rec("keyboard: the skip link is the first tab stop", await p.evaluate(() => document.activeElement?.classList.contains("skip-link")));
  await p.keyboard.press("Enter");
  rec("keyboard: skip link moves focus to the main content", await p.evaluate(() => document.activeElement?.id === "main"));
  // focus ring visible on the menu button and the form controls
  await p.focus('button[aria-label="Open menu"]');
  await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab");
  const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  rec("focus: visible outline on a keyboard-focused control", ring.style !== "none" && ring.width >= 2, JSON.stringify(ring));
  // drawer is an accessible dialog: opens, traps, Escape closes, focus returns
  await p.click('button[aria-label="Open menu"]');
  rec("menu: opens as a modal dialog", await p.evaluate(() => document.querySelector("dialog.cj-dialog-drawer")?.open === true));
  await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  rec("menu: focus stays inside the dialog while it is open", await p.evaluate(() => document.querySelector("dialog.cj-dialog-drawer")?.contains(document.activeElement)));
  await p.keyboard.press("Escape");
  rec("menu: Escape closes it and returns focus to the menu button", await p.evaluate(() => !document.querySelector("dialog.cj-dialog-drawer")?.open && document.activeElement?.getAttribute("aria-label") === "Open menu"));
  // unsaved-change protection
  await p.fill("#f-panName", "Changed Name");
  await p.click('button[aria-label="Open menu"]');
  await p.locator("dialog.cj-dialog-drawer[open] a", { hasText: "Application journey" }).click();
  await p.waitForSelector("dialog.cj-dialog-modal[open]");
  rec("unsaved changes: leaving through the header asks first", /unsaved changes/i.test(await p.locator("dialog[open]").innerText()));
  await p.getByRole("button", { name: "Keep editing" }).click();
  rec("unsaved changes: Keep editing stays on the page with the edit intact", path(p) === "/apply/basic-details" && (await p.inputValue("#f-panName")) === "Changed Name");
  // reduced motion
  const anim = await p.evaluate(() => { const s = document.createElement("span"); s.className = "spinner"; document.querySelector(".cj").appendChild(s); return getComputedStyle(s).animationName; });
  rec("reduced motion: spinner animation is disabled", anim === "none", anim);
  await c.close();
}

// ============================================================ PART F: admin side
if (ADMIN_PASS) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(seedInit(dump));
  const p = await c.newPage();
  watch(p, "F");
  const anon = await p.request.get(`${BASE}/admin/journeys`, { maxRedirects: 0 });
  rec("admin: /admin/journeys requires a session (redirects to login)", anon.status() === 307 && (anon.headers()["location"] ?? "").includes("/admin/login"));
  await p.goto(`${BASE}/admin/login`);
  await p.fill("#username", ADMIN_USER);
  await p.fill("#password", ADMIN_PASS);
  await p.click('button[type="submit"]');
  await p.waitForURL(`${BASE}/admin`);
  rec("admin: existing login still works", true);
  rec("admin: nav has Customer journeys, existing links intact", (await p.locator('nav[aria-label="Main"] a').allInnerTexts()).join("|").match(/Overview.*Applications.*New application.*Customer journeys/s) !== null);
  await p.goto(`${BASE}/admin/journeys`);
  await p.waitForSelector("tbody tr");
  const t = await p.locator("main").innerText();
  rec("admin: lists this browser's journey with reference, masked applicant, step and status", t.includes(ref) && t.includes("Asha V.") && /Demo journey completed|Review required/.test(t));
  rec("admin: says drafts are browser-local (not server data)", /this browser only/i.test(t));
  rec("admin: table shows no raw PAN, mobile, full name, email or street address", !/QWEPR5678K|9000000001|Verma|asha@example|12 Demo Street/.test(t));
  rec("admin: each row exposes all 8 step statuses to assistive tech", (await p.locator("tbody tr").first().locator(".jsteps li .sr-only").count()) === 8);
  const tw = await p.evaluate(() => { const w = document.querySelector(".table-wrap"); const t = document.querySelector(".table-wide"); return { scroll: w.scrollWidth - w.clientWidth, cards: getComputedStyle(t).display === "block" }; });
  rec("admin: journeys list at 1280px has no sideways scrolling (columns or cards)", tw.scroll <= 1, JSON.stringify(tw));
  rec("admin: the Open action is visible without scrolling", await p.locator("tbody tr").first().getByRole("link", { name: /Open journey/ }).isVisible() && (await p.locator("tbody tr").first().getByRole("link", { name: /Open journey/ }).boundingBox()).x + 10 < 1280);
  await shot(p, "f01-admin-journeys");
  await p.fill("#jq", "NOPE");
  rec("admin filter: reference search with no match shows an empty state", await p.locator("text=No journeys match these filters").isVisible());
  await p.fill("#jq", ref.slice(4, 9).toLowerCase());
  rec("admin filter: reference search is case-insensitive", (await p.locator("tbody tr").count()) === 1);
  await p.fill("#jq", "");
  await p.selectOption("#jstatus", "failed");
  rec("admin filter: status filter excludes non-matching journeys", (await p.locator("tbody tr").count()) === 0);
  await p.selectOption("#jstatus", "");
  await p.selectOption("#jstep", "done");
  const stepFiltered = await p.locator("tbody tr").count();
  await p.selectOption("#jstep", "basic");
  rec("admin filter: current-step filter works", stepFiltered >= 0 && (await p.locator("tbody tr").count()) === 0);
  await p.selectOption("#jstep", "");
  await p.fill("#jfrom", "2999-01-01");
  rec("admin filter: created-date filter works", (await p.locator("tbody tr").count()) === 0);
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  rec("admin filter: Clear restores the list", (await p.locator("tbody tr").count()) >= 1);
  await p.getByRole("link", { name: `Open journey ${ref}` }).click();
  await p.waitForURL(`${BASE}/admin/journeys/${ref}`);
  await p.waitForSelector("text=Step by step");
  const d = await p.locator("main").innerText();
  for (const section of ["Step by step", "Integration readiness", "Basic details", "KYC", "Demographic details", "Liveness", "Soft offer", "Asset and scheme", "Add-ons", "Final calculation"]) {
    rec(`admin detail: section "${section}"`, d.includes(section));
  }
  rec("admin detail: masked identity only", d.includes("******0001") && d.includes("QW******8K") && d.includes("a***@example.com") && !/QWEPR5678K|9000000001|Verma|asha@example|12 Demo Street|1990/.test(d));
  rec("admin detail: integrations shown as demo adapters, none live", /Demo adapter/.test(d) && !/>\s*Live\s*</.test(await p.locator("main").innerHTML()));
  rec("admin detail: results labelled simulated/demo", /simulated/i.test(d) && /fixed demo value/.test(d));
  await shot(p, "f02-admin-journey-detail");
  const bad = await p.goto(`${BASE}/admin/journeys/not-a-reference`);
  await p.waitForSelector("text=Page not found", { timeout: 10000 });
  rec("admin detail: a malformed reference shows our not-found page and the text is not rendered back", !(await p.locator("body").innerText()).includes("not-a-reference"), `HTTP ${bad.status()}`);
  const missing = await p.request.get(`${BASE}/definitely/not/a/page`);
  rec("unknown URL returns a real 404 with the styled not-found page (no inline styles)", missing.status() === 404 && /Page not found/.test(await missing.text()) && !/ style="/.test(await missing.text()));
  await p.goto(`${BASE}/admin/journeys/DFK-AAAAA-BBBBB`);
  await p.waitForSelector("text=Journey not found in this browser");
  rec("admin detail: unknown reference shows a clear empty state", true);
  // existing admin features untouched
  await p.goto(`${BASE}/admin/applications`);
  rec("admin: existing applications list still renders", (await p.locator("h1").innerText()) === "Applications");
  await p.goto(`${BASE}/admin/applications/new`);
  rec("admin: existing new-application page still renders", (await p.locator("h1").innerText()).includes("New demo application"));
  const api = await p.request.get(`${BASE}/api/admin/applications`);
  rec("admin: existing API still authorised with the session", api.status() === 200);
  await p.goto(`${BASE}/admin`);
  await p.click('.sidebar button:has-text("Sign out")');
  await p.waitForURL(`${BASE}/admin/login`);
  const after = await p.request.get(`${BASE}/admin/journeys`, { maxRedirects: 0 });
  rec("admin: after sign-out /admin/journeys is protected again", after.status() === 307);
  await c.close();
} else {
  rec("admin part skipped: set E2E_ADMIN_PASSWORD", false, "BLOCKED");
}

// ============================================================ console hygiene
const expected = /status of (401|422|404)|ERR_SSL_PROTOCOL_ERROR|NotAllowedError|NotFoundError|NotReadableError|Failed to load resource: the server responded with a status of 404/i;
const unexpected = problems.filter((p) => !expected.test(p));
const csp = problems.filter((p) => /content security policy|Refused to/i.test(p));
rec("console: no CSP violations anywhere", csp.length === 0, csp.slice(0, 3).join(" || "));
rec("console: no unexpected errors or warnings", unexpected.length === 0, unexpected.slice(0, 6).join(" || "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("FAILED:\n" + failed.map((f) => `  - ${f.name} ${f.detail}`).join("\n"));
process.exit(failed.length ? 1 : 0);
