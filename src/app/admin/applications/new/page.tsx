import { AdminNav } from "@/components/AdminNav";
import { NewApplicationForm } from "@/components/NewApplicationForm";
import { requireAdminPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  const user = await requireAdminPage();
  return (
    <>
      <AdminNav user={user} />
      <h1>New demo application</h1>
      <NewApplicationForm />
    </>
  );
}
