import Link from "next/link";
import { Activity, Swords, Route } from "lucide-react";
import { OnlineBadge } from "./OnlineBadge";

export function HeroCard() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-zinc-800/60 p-8 sm:p-10 lg:p-12">
      {/* background video with no overlay so it remains highly visible */}
      <video
        className="absolute inset-0 -z-20 h-full w-full object-cover brightness-[1.25] contrast-[1.4] saturate-130"
        src="/media/hero-warp.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-zinc-900/55 backdrop-blur-md" />
      <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300/80">
              Corp Console // Tactical Narcotics Division
            </p>
            <OnlineBadge />
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
            Plot safer warps
            <span className="block text-rose-300/90">before you undock.</span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            An operations suite for Tactical Narcotics Division capsuleers:
            live system intel, route analysis, market scans, and pilot
            lookups. Built on a fast Next.js 16 stack with real-time data
            from ESI and zKillboard.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/system-lookup"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-rose-500/40 transition hover:bg-rose-400"
            >
              Open System Lookup
              <Activity className="h-4 w-4" />
            </Link>
            <Link
              href="/route-planner"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-200 shadow-sm transition hover:border-rose-400/70 hover:text-rose-100"
            >
              Plan a route
              <Route className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/70 to-black/80 p-4 sm:p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Warp panel // quick scan
          </p>
          <div className="grid gap-3 text-xs text-zinc-300">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span className="font-medium">System intel</span>
              </div>
              <span className="text-zinc-500">Sec, jumps, PvP in last hour</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-sky-400" />
                <span className="font-medium">Route planner</span>
              </div>
              <span className="text-zinc-500">Wormholes + gate paths visualized</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Swords className="h-4 w-4 text-rose-400" />
                <span className="font-medium">Local threat</span>
              </div>
              <span className="text-zinc-500">Kill ratios by name in local</span>
            </div>
          </div>
          <p className="mt-3 text-[0.68rem] text-zinc-500">
            Data provided by CCP&apos;s ESI, zKillboard, and EVE-Scout. Tactical
            Narcotics Division and this site are not affiliated with CCP
            Games.
          </p>
        </div>
      </div>
    </section>
  );
}
