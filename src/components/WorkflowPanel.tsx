import { STATUS_LABELS, type Status } from "@/lib/status";

type Availability = "demo" | "off";

// The intended shop-assisted finance journey. Only stages 1 and 5 exist in this demo; the rest are
// shown as NOT connected on purpose. Nothing here reports a verification result.
const STAGES: { title: string; text: string; availability: Availability; label: string }[] = [
  { title: "Customer and application capture", text: "Record a fictional applicant and loan request.", availability: "demo", label: "Demo only" },
  { title: "Identity and document verification", text: "No PAN, Aadhaar or DigiLocker integration exists. No documents are collected.", availability: "off", label: "Not connected" },
  { title: "Photo and liveness verification", text: "No selfie or liveness provider is connected.", availability: "off", label: "Not connected" },
  { title: "Finance partner response", text: "No bureau or lender is connected. No loan decision is made or offered.", availability: "off", label: "Not connected" },
  { title: "EMI and application status tracking", text: "Move an application through demo statuses with a saved history.", availability: "demo", label: "Demo only" },
];

export function WorkflowPanel({ current }: { current?: Status }) {
  return (
    <section className="card" aria-labelledby="workflow-title">
      <div className="card-head">
        <h2 id="workflow-title">Verification workflow</h2>
        <span className="chip chip-soon">Only 2 of 5 stages exist (demo)</span>
      </div>
      <div className="card-body">
        <ol className="steps">
          {STAGES.map((s, i) => (
            <li key={s.title} className={`step${s.availability === "demo" ? " step-live" : ""}`}>
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <div>
                <div className="step-head">
                  <span className="step-title">{s.title}</span>
                  <span className={`chip ${s.availability === "demo" ? "chip-demo" : "chip-off"}`}>{s.label}</span>
                </div>
                <p className="step-text">
                  {s.text}
                  {current && i === 4 && <> Current status: <strong>{STATUS_LABELS[current]}</strong>.</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
