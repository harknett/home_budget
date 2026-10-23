import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Home Budget",
  description: "Envelope budgeting for a household.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Budget", statusBarStyle: "black-translucent" },
  // A budget has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // `viewport-fit=cover` plus the safe-area padding in the app layout keeps
  // the bottom nav clear of the home indicator on a phone.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink antialiased dark:bg-ink dark:text-paper">{children}</body>
    </html>
  );
}
