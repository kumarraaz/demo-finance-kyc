import type { ReactNode } from "react";
import { AdminShell } from "@/components/AdminShell";
import { requireAdminPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

// Shell for every signed-in page. Each page still re-checks the session itself: layouts are not
// re-run on client navigations, so this is for the identity shown in the shell, not the only gate.
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const user = await requireAdminPage();
  return <AdminShell user={user}>{children}</AdminShell>;
}
