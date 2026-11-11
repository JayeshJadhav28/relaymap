import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayMap — Evidence-Driven Project Continuity",
  description:
    "Convert scattered project records into a structured, evidence-linked, human-approved and permission-aware handover.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
