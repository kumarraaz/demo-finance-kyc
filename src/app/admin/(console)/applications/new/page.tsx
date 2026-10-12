import { NewApplicationForm } from "@/components/NewApplicationForm";
import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader
        title="New demo application"
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Applications", href: "/admin/applications" }, { label: "New" }]}
        subtitle="Capture a fictional applicant and loan request. Nothing is verified."
      />
      <section className="card card-pad" aria-label="New application form">
        <NewApplicationForm />
      </section>
    </>
  );
}
