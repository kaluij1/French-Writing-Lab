import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Newsreader } from "next/font/google";
import { Nav } from "@/components/Nav";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "French Writing Lab",
  description: "Think first. Write freely. Analyze afterward. A writing studio for intermediate French learners.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const aiDemo = !process.env.ANTHROPIC_API_KEY?.trim();
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable}`}>
      <body>
        <Suspense>
          <Nav accounts={isSupabaseConfigured} aiDemo={aiDemo} />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-10">{children}</main>
      </body>
    </html>
  );
}
