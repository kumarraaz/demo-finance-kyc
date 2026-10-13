import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JourneyProvider } from "@/components/journey/JourneyProvider";
import "./apply.css";

export const metadata: Metadata = {
  title: "Finance application (demo) | Demo Finance",
  description: "A demonstration finance application journey. Every verification and offer is simulated.",
  robots: { index: false, follow: false },
};

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return <JourneyProvider>{children}</JourneyProvider>;
}
