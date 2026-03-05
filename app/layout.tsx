import type { Metadata } from "next";
import { AppFooter } from "@/components/AppFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commander Deck Doctor",
  description: "Commander deck analysis with engine-backed role tags, legality checks, and bracket guidance."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
