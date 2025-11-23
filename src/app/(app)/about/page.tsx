import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export const metadata: Metadata = {
  title: "About | Tactical Narcotics Division",
  description:
    "About the Tactical Narcotics Division capsuleer console: system intel, routing, and utility panels built on Next.js 16.",
};

export default async function AboutPage() {
  "use cache";
  cacheLife("max");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <section className="space-y-8 text-sm text-zinc-300">
            <header className="space-y-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Corp tools // Tactical Narcotics Division
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                About this obsidian console.
              </h1>
              <p className="max-w-2xl text-zinc-400">
                This console is Tactical Narcotics Division&apos;s internal suite of EVE
                Online utilities, focused on fast system intel, route planning, and
                PvP awareness — wrapped in a single, cinematic web terminal for
                corporation members.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-200">
                <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                  Live ESI + zKillboard feeds
                </span>
                <span className="rounded-full border border-sky-500/50 bg-sky-500/10 px-3 py-1 text-sky-100">
                  PvP-aware routing (1h / 24h heat)
                </span>
                <span className="rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-amber-100">
                  Wormhole links via EVE-Scout
                </span>
              </div>
            </header>

            <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-start">
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "System intel", body: "Security, jumps, 1h/24h PvP, neighbors" },
                    { label: "Route planner", body: "Gate + wormhole options with live heat overlays" },
                    { label: "Pilot lookup", body: "Risk, PvP stats, top ships/systems" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 px-3 py-3"
                    >
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-zinc-200">{item.body}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    What lives here
                  </h2>
                  <p className="text-zinc-300">
                    This console is built to answer the questions you ask most often
                    before undocking:
                  </p>
                  <ul className="mt-1 space-y-1 text-[0.9rem] text-zinc-300">
                    <li>
                      <span className="font-medium text-zinc-100">System Lookup</span>{" "}
                      — instant read on security, jumps, PvP heat, and connected
                      systems with Dotlan and zKillboard links.
                    </li>
                    <li>
                      <span className="font-medium text-zinc-100">Route Planner</span>{" "}
                      — PvP-aware routing through gates and wormholes, with per-hop
                      intel and cinematic playback.
                    </li>
                    <li>
                      <span className="font-medium text-zinc-100">Future panels</span>{" "}
                      — pilot lookups, market snapshots, local threat analysis, and
                      more as the toolkit grows.
                    </li>
                  </ul>
                </div>
              </div>

              <aside className="space-y-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/70 px-4 py-4 shadow-[0_0_26px_rgba(24,24,27,0.7)]">
                <div className="space-y-1 text-[0.8rem] text-zinc-300">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Quick start
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-zinc-300">
                    <li>Check destination heat in System Lookup.</li>
                    <li>Plot a route with waypoints, pick secure or PvP-seek.</li>
                    <li>Inspect hot hops, copy the jump list for fleet chat.</li>
                  </ol>
                </div>

                <div className="space-y-1 text-[0.8rem]">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Quick links
                  </p>
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/system-lookup"
                      className="inline-flex items-center justify-between rounded-lg border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-emerald-400/80 hover:text-emerald-100"
                    >
                      <span>Open System Lookup</span>
                      <span className="text-[0.7rem] text-zinc-500">
                        Sec, jumps, PvP snapshot
                      </span>
                    </Link>
                    <Link
                      href="/route-planner"
                      className="inline-flex items-center justify-between rounded-lg border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-emerald-400/80 hover:text-emerald-100"
                    >
                      <span>Open Route Planner</span>
                      <span className="text-[0.7rem] text-zinc-500">
                        Multi-leg, PvP-aware routes
                      </span>
                    </Link>
                  </div>
                </div>

                <div className="space-y-1 text-[0.8rem] text-zinc-300">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Vision
                  </p>
                  <p>
                    The long-term goal is a single cockpit where you can sanity-check
                    a route, glance at nearby content, and vet a staging system in
                    under thirty seconds.
                  </p>
                </div>

                <div className="space-y-1 text-[0.8rem] text-zinc-300">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Roadmap
                  </p>
                  <ul className="space-y-1">
                    <li>✓ Pilot lookup with risk cues and zKill stats.</li>
                    <li>✓ PvP heat overlays for systems and routes.</li>
                    <li>✓ Corp lookup with Dotlan bio + 30d activity.</li>
                    <li>→ Local threat watchlist & intel pings.</li>
                    <li>→ Industry & asset watch with alerts.</li>
                    <li>→ Fleet-ready exports (routes, markets, intel).</li>
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        </SystemLookupBackground>
      </div>
    </main>
  );
}
