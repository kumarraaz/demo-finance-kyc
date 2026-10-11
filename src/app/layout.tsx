import type { Metadata } from "next";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Finance KYC (simulated)",
  description: "Prototype only. Simulated verification. No real KYC or loan decisions.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoBanner />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
