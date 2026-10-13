import { JourneysClient } from "@/components/admin/JourneysClient";
import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer journeys | Demo Finance KYC (simulated)" };

export default async function JourneysPage() {
  await requireAdminPage(); // the data itself is read in the browser; the page is still admin-only
  return (
    <>
      <PageHeader
        title="Customer journeys"
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Customer journeys" }]}
        subtitle="Step-by-step progress of demo customer applications."
        badge={<span className="sim-tag">SIMULATED DATA</span>}
      />
      <JourneysClient />
    </>
  );
}
