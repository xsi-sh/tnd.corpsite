"use client";

import { Shield, AlertTriangle, Navigation, Radar, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  label: string;
  detail: string;
  severity: "safe" | "caution" | "danger";
};

const GRID_ITEMS: ChecklistItem[] = [
  {
    label: "Grid-check",
    detail: "D-scan 360° / 14.3 AU for bubbles, probes, sabres.",
    severity: "caution",
  },
  {
    label: "Overview sanity",
    detail: "Hostiles on grid, drones out, wrecks, MTUs, ESS beacons.",
    severity: "caution",
  },
  {
    label: "Gate cloak",
    detail: "Hold cloak, pre-align destination, identify safe warp-outs.",
    severity: "safe",
  },
  {
    label: "Bubbles",
    detail: "Check for drag/stop bubbles and anchored mobile warp disruptors.",
    severity: "danger",
  },
  {
    label: "Bookmarks",
    detail: "Use perches/tacticals >150km off gates/stations; avoid warping zero.",
    severity: "safe",
  },
  {
    label: "Pods",
    detail: "Bounce with instas; avoid slow-align pods in bubble zones.",
    severity: "danger",
  },
  {
    label: "Local spike",
    detail: "Local rising? Expect response fleets and mobile dictors.",
    severity: "danger",
  },
  {
    label: "Recent kills",
    detail: "zKill: check last hour/24h for camp activity and ship types.",
    severity: "caution",
  },
];

const MODE_GUIDES = [
  {
    value: "highsec",
    label: "High-sec",
    icon: Shield,
    tips: [
      "Watch for smartbombs on pipes; bounce with instas around trade hubs.",
      "Suspect bait on gates and stations; tether games with citadels.",
      "Faction police if criminal; avoid autopilot through war targets.",
    ],
  },
  {
    value: "lowsec",
    label: "Low-sec",
    icon: AlertTriangle,
    tips: [
      "Bubbles illegal but smartbombing battleships common on pipes.",
      "Check cyno beacons, flex structures, and ESS for bait gangs.",
      "Podding is allowed; bounce tacticals and safe-spots when tackled.",
    ],
  },
  {
    value: "null",
    label: "Null / WH",
    icon: Navigation,
    tips: [
      "Expect bubbles and drag/stop bubbles on gates; use perches >200km.",
      "Dictors/HICs with bubbles on landing; align and burn off vector.",
      "Bookmark safes mid-warp; avoid warping between celestials in a line.",
    ],
  },
];

export function SafeToWarpClient() {
  return (
    <section className="space-y-6 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Docking clearance // situational awareness
          </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Safe to Warp
        </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-3xl">
            A pocket checklist for evaluating whether it&apos;s safe to warp or jump: bubbles, bookmarks, local spikes, and camp tells at a glance.
          </p>
        </div>
        <Radar className="hidden h-10 w-10 text-emerald-400/80 sm:block" />
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Rapid checklist</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GRID_ITEMS.map((item) => {
            const badge =
              item.severity === "safe"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : item.severity === "caution"
                  ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
                  : "border-rose-500/70 bg-rose-500/10 text-rose-100";
            return (
              <div
                key={item.label}
                className={cn(
                  "rounded-lg border px-3 py-3 shadow-[0_0_18px_rgba(24,24,27,0.6)]",
                  badge,
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                  {item.label}
                </p>
                <p className="mt-1 text-[0.85rem] text-zinc-100">{item.detail}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>By space type</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="highsec" className="w-full">
            <TabsList className="grid grid-cols-3 bg-zinc-900/70">
              {MODE_GUIDES.map((mode) => (
                <TabsTrigger key={mode.value} value={mode.value} className="text-xs">
                  <mode.icon className="mr-2 h-4 w-4" />
                  {mode.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {MODE_GUIDES.map((mode) => (
              <TabsContent key={mode.value} value={mode.value} className="space-y-2 pt-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {mode.tips.map((tip, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-3 py-2 text-[0.85rem] text-zinc-200"
                    >
                      {tip}
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Movement patterns</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              label: "Gate-to-gate",
              bullets: [
                "Use perches and downwind tacticals; never blind-warp a pipe.",
                "Align before decloak; overheat prop mod through drag bubbles.",
                "If camped, bounce safes repeatedly before re-approaching.",
              ],
            },
            {
              label: "Station undock",
              bullets: [
                "Use insta-undocks >200km; re-dock if bumped and not aggressed.",
                "Beware tether games; suspects can break tether and point quickly.",
                "Smartbomb checks on undock vector; bounce if unknowns on grid.",
              ],
            },
            {
              label: "Wormholes",
              bullets: [
                "Check mass status; rolling fleets may be active.",
                "Bounce off-grid safes before polarizing both sides.",
                "Expect cloaky sabres and logi off-hole; cloak + slowboat off.",
              ],
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-800/70 bg-zinc-900/60 px-3 py-3"
            >
              <div className="mb-2 flex items-center gap-2 text-[0.85rem] font-semibold text-zinc-100">
                <Zap className="h-4 w-4 text-emerald-300" />
                <span>{card.label}</span>
              </div>
              <ul className="space-y-1 text-[0.8rem] text-zinc-300">
                {card.bullets.map((b, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
