import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tactical Narcotics Division | EVE Capsuleer Tools",
  description:
    "Operations hub for Tactical Narcotics Division corporation members: system intel, routes, market views, and pilot lookups built on Next.js 16.",
};

const NAV_ITEMS = [
  { href: "/system-lookup", label: "System Lookup" },
  { href: "/route-planner", label: "Route Planner" },
  { href: "/fit", label: "Ship Fit" },
  { href: "/player-lookup", label: "Player Lookup" },
  { href: "/corp-lookup", label: "Corp Lookup" },
  { href: "/local-check", label: "Local Check" },
  { href: "/market", label: "Asset Analysis" },
  { href: "/market-browser", label: "Market Browser" },
  { href: "/price-check", label: "Price Check" },
  { href: "/safe-to-warp", label: "Safe to Warp" },
  { href: "/about", label: "About" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col text-foreground">
          <header className="border-b border-zinc-900/70 bg-black/80 backdrop-blur-md backdrop-saturate-125">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold tracking-tight"
              >
                <Image
                  src="/media/logo.png"
                  alt="Tactical Narcotics Division logo"
                  width={28}
                  height={28}
                  className="h-7 w-7"
                  priority
                />
                <span className="hidden sm:inline">
                  Tactical Narcotics Division
                </span>
                <span className="inline sm:hidden">TND Console</span>
              </Link>
              <nav className="hidden gap-4 text-xs font-medium text-zinc-300 sm:flex">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-zinc-300 transition-colors hover:text-zinc-50 hover:drop-shadow-[0_0_10px_rgba(250,250,250,0.7)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {children}

          <footer className="border-t border-zinc-800/60 bg-black/70 backdrop-blur-sm py-4 text-xs text-zinc-500">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
              <p>
                9 YC127 1 Tactical Narcotics Division capsuleer tools. Not affiliated with CCP Games.
              </p>
              <p className="hidden sm:block">
                Built with Next.js 16, Tailwind CSS 4, and modern UI components.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
