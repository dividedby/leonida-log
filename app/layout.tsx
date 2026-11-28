import type { Metadata, Viewport } from "next";
import { Anton, Work_Sans } from "next/font/google";
import { themeAttribute } from "@/lib/settings";
import { getRepository } from "@/lib/server/data";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Impact"],
});

const workSans = Work_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-text",
  display: "swap",
  fallback: ["system-ui"],
});

export const metadata: Metadata = {
  title: "Leonida Log",
  description: "A phone-first, spoiler-gated guide to GTA 6.",
  // Listing `icons` replaces the app/icon.svg file convention, so name it too.
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e5336d" },
    { media: "(prefers-color-scheme: dark)", color: "#ff5c8a" },
  ],
};

// Reads the saved theme from the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = getRepository().getProgress().theme;
  return (
    <html
      lang="en"
      className={`${anton.variable} ${workSans.variable}`}
      data-theme={themeAttribute(theme)}
    >
      <body>{children}</body>
    </html>
  );
}
