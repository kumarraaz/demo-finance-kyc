import { notFound } from "next/navigation";
import { JourneyDetailClient } from "@/components/admin/JourneyDetailClient";
import { requireAdminPage } from "@/lib/page-auth";
import { REFERENCE_PATTERN } from "@/lib/journey/reference";

export const dynamic = "force-dynamic";

export default async function JourneyDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  const { ref } = await params;
  if (!REFERENCE_PATTERN.test(ref)) notFound(); // never echo arbitrary path text into the page
  return <JourneyDetailClient reference={ref} />;
}
