import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Finance KYC (simulated)",
  description: "Prototype only. Simulated verification. No real KYC or loan decisions.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request: the CSP nonce is generated per request, so pages cannot be static.
  await connection();
  return (
    <html lang="en">
      <body>
        <DemoBanner />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
