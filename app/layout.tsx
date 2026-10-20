import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Magazzino Master Veggis",
  description: "Gestionale Magazzino",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${montserrat.variable} h-full antialiased`} style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}