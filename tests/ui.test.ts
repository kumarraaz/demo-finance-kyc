import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiCards, StatusDistribution, type Counts } from "@/components/StatusOverview";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusTimeline } from "@/components/StatusTimeline";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import type { HistoryEntry } from "@/lib/applications";
import { STATUSES } from "@/lib/status";

const ROOT = path.resolve(__dirname, "..");
const files = (dir: string, exts: string[]): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
const uiFiles = [...files(path.join(ROOT, "src/app"), [".tsx", ".css"]), ...files(path.join(ROOT, "src/components"), [".tsx"])];
const read = (p: string) => fs.readFileSync(p, "utf8");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("UI source guards", () => {
  it("has no inline style attributes (the page CSP blocks them)", () => {
    for (const f of uiFiles.filter((f) => f.endsWith(".tsx"))) expect(read(f), f).not.toMatch(/\bstyle=\{/);
  });

  it("loads nothing from other origins (no external images, fonts or scripts)", () => {
    for (const f of uiFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/https?:\/\//);
      expect(text, f).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//);
    }
  });

  it("does not use any lender or payment brand name", () => {
    for (const f of uiFiles) expect(read(f), f).not.toMatch(/bajaj|razorpay|pine\s*labs/i);
  });

  it("does not render raw HTML or run strings as code", () => {
    for (const f of uiFiles.filter((f) => f.endsWith(".tsx"))) {
      expect(read(f), f).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(/);
    }
  });

  it("only links the sidebar to routes that exist (no dead navigation)", () => {
    const shell = read(path.join(ROOT, "src/components/AdminShell.tsx"));
    const hrefs = [...shell.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    const consoleDir = path.join(ROOT, "src/app/admin/(console)");
    for (const href of hrefs) {
      const rel = href.replace(/^\/admin\/?/, "");
      expect(fs.existsSync(path.join(consoleDir, rel, "page.tsx")), href).toBe(true);
    }
    // Pages that do not exist yet are not offered as navigation.
    expect(shell).not.toMatch(/href: "\/admin\/(reports|settings|verification)/);
  });
});

describe("workflow presentation is honest", () => {
  it("marks unavailable integrations as not connected and claims no verification result", () => {
    const out = html(createElement(WorkflowPanel));
    expect(out.match(/Not connected/g)).toHaveLength(3);
    expect(out.match(/Demo only/g)).toHaveLength(2);
    expect(out).not.toMatch(/verified|approved|passed|successful|completed/i);
    for (const stage of ["Identity and document verification", "Photo and liveness verification", "Finance partner response"]) {
      expect(out).toContain(stage);
    }
  });

  it("shows the real current status on the last stage when given one", () => {
    expect(html(createElement(WorkflowPanel, { current: "closed" }))).toContain("Current status: <strong>Closed</strong>");
  });
});

describe("status components", () => {
  it("tags simulated outcomes", () => {
    expect(html(createElement(StatusBadge, { status: "simulated_check_passed" }))).toContain("SIMULATED");
    expect(html(createElement(StatusBadge, { status: "in_review" }))).not.toContain("SIMULATED");
  });

  const counts: Counts = { submitted: 2, in_review: 1, more_info_needed: 0, simulated_check_passed: 1, simulated_check_failed: 0, closed: 4, total: 8 };

  it("renders one KPI card per status plus the total, with the real numbers", () => {
    const out = html(createElement(KpiCards, { counts }));
    expect(out.match(/class="kpi /g)).toHaveLength(1 + STATUSES.length);
    expect(out).toContain('<span class="kpi-value">8</span>');
    expect(out).toContain("status=simulated_check_failed");
  });

  it("draws the distribution only from real counts and sums to 100", () => {
    const out = html(createElement(StatusDistribution, { counts }));
    const widths = [...out.matchAll(/<rect[^>]* width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(4); // only statuses that have applications
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(html(createElement(StatusDistribution, { counts: { ...counts, submitted: 0, in_review: 0, simulated_check_passed: 0, closed: 0, total: 0 } }))).toBe("");
  });

  const history: HistoryEntry[] = [
    { id: 2, applicationId: 1, fromStatus: "submitted", toStatus: "in_review", note: "Looks complete", changedBy: "qaadmin", changedAt: "2026-10-12T17:34:00.000Z" },
    { id: 1, applicationId: 1, fromStatus: null, toStatus: "submitted", note: "Demo application created", changedBy: "qaadmin", changedAt: "2026-10-12T17:30:00.000Z" },
  ];

  it("shows previous status, new status, time, admin and note on the timeline", () => {
    const out = html(createElement(StatusTimeline, { history }));
    expect(out).toContain("Submitted");
    expect(out).toContain("In review");
    expect(out).toContain("12 Oct 2026, 17:34 UTC");
    expect(out).toContain("by qaadmin");
    expect(out).toContain("Looks complete");
    expect(out).toContain("Created as");
    expect(out.indexOf("17:34")).toBeLessThan(out.indexOf("17:30")); // newest first
  });

  it("escapes note text instead of rendering it as markup", () => {
    const out = html(createElement(StatusTimeline, { history: [{ ...history[0], note: "<img src=x onerror=alert(1)>" }] }));
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("has an empty state for a missing history", () => {
    expect(html(createElement(StatusTimeline, { history: [] }))).toContain("No status changes");
  });
});
