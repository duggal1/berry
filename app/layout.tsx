import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  weight: "variable",
  axes: ["opsz", "wdth"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "Berry",
  description:
    "Paste a GitHub URL. Get an architecture sketch, the path one request takes, and a prompt that briefs a coding agent.",
  icons: {
    icon: "/dots.svg",
    shortcut: "/dots.svg",
    apple: "/dots.svg",
  },
  openGraph: {
    title: "Berry",
    description:
      "See how your repo runs. An architecture sketch, one request traced hop by hop, and a prompt that briefs your coding agent.",
    images: ["/dots.svg"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Berry",
    description: "See how your repo runs.",
    images: ["/dots.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
