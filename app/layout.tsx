import type { Metadata, Viewport } from "next";
import { Anton, Work_Sans } from "next/font/google";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e5336d" },
    { media: "(prefers-color-scheme: dark)", color: "#ff5c8a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
