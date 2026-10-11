import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { CapsuleNav } from "@/components/motion/CapsuleNav";
import { SmoothScroll } from "@/components/motion/SmoothScroll";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Colophon: what you actually held",
  description:
    "Colophon shows people who hold tokenized stocks what they actually owned on any date, on Solana and Robinhood Chain, and lets anyone check it offline.",
  openGraph: { title: "Colophon", description: "What you actually held, with the source transaction behind every line.", type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F6F5F1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>
        <Providers>
          <SmoothScroll />
          <CapsuleNav />
          <main>{children}</main>
          <footer className="footer">
            <div className="wrap" style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "space-between" }}>
              <span>Colophon · read-only by design · no keys, seeds or signatures accepted</span>
              <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Link href="/proof">Proof</Link>
                <Link href="/lab">Lab</Link>
                <Link href="/testers">Testers</Link>
                <a href="/openapi.json">OpenAPI</a>
                <a href="/llms.txt">llms.txt</a>
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
