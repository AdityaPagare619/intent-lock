import type { Metadata } from "next";
/* Self-hosted fonts (OFL, bundled at build time — zero network fetches,
   identical render with the cable pulled). Inter carries the stage's
   humanist display type; JetBrains Mono is the engine room's voice. */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intent Lock · Alexa+ Simulator — The Yap Patrol",
  description:
    "Simulated Alexa+ web experience for Intent Lock. Real MCP 2025-11-25 wire to :8080; the Alexa voice shell is labeled simulated.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-obsidian font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
