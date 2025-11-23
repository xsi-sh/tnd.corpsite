"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SystemIntel,
  SystemLookupResponse,
  SystemSuggestion,
} from "@/lib/types/system-intel";
import {
  Shield,
  Activity,
  Swords,
  ExternalLink,
  Map as MapIcon,
  Route as RouteIcon,
  Coins,
  BarChart3,
  Clock3,
  Ship,
  Users,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { fetchSuggestions } from "./fetchSuggestions";

function getSecurityMeta(securityStatus: number | null) {
  if (securityStatus === null) {
    return {
      label: "Unknown space",
      className: "border-zinc-700/80 bg-zinc-900/70 text-zinc-200",
    };
  }

  if (securityStatus >= 0.5) {
    return {
      label: "High security space",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (securityStatus > 0) {
    return {
      label: "Low security space",
      className: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    label: "Nullsec / wormhole space",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  };
}

function getTrafficSummary(jumpsLastHour: number | null): string {
  if (jumpsLastHour === null) {
    return "Traffic level is unknown for the last hour.";
  }

  if (jumpsLastHour === 0) {
    return "No ships recorded jumping in the last hour.";
  }

  if (jumpsLastHour < 50) {
    return "Light traffic in the last hour.";
  }

  if (jumpsLastHour < 200) {
    return "Moderate traffic in the last hour.";
  }

  if (jumpsLastHour < 800) {
    return "Heavy traffic hotspot in the last hour.";
  }

  return "Very heavy trade or transit hotspot in the last hour.";
}

function getRiskSummary(pvpKillsLastHour: number | null): string {
  if (pvpKillsLastHour === null) {
    return "PvP activity is unknown for the last hour.";
  }

  if (pvpKillsLastHour === 0) {
    return "No PvP kills recorded in the last hour.";
  }

  if (pvpKillsLastHour < 3) {
    return "Occasional PvP activity in the last hour.";
  }

  if (pvpKillsLastHour < 10) {
    return "Active PvP in the last hour.";
  }

  return "High PvP density  approach with extreme caution.";
}

function getOverallRiskMeta(intel: SystemIntel) {
  const sec = intel.securityStatus;
  const kills = intel.pvpKillsLastHour ?? 0;

  let score = 0;

  if (sec === null) {
    score += 1;
  } else if (sec >= 0.5) {
    score += 0;
  } else if (sec > 0) {
    score += 1;
  } else {
    score += 2;
  }

  if (kills === 0) {
    score += 0;
  } else if (kills < 3) {
    score += 1;
  } else if (kills < 10) {
    score += 2;
  } else {
    score += 3;
  }

  let level: "low" | "medium" | "high";
  if (score < 2) {
    level = "low";
  } else if (score < 4) {
    level = "medium";
  } else {
    level = "high";
  }

  const className =
    level === "low"
      ? "border-emerald-500/50 text-emerald-300 bg-zinc-950/80"
      : level === "medium"
        ? "border-amber-400/60 text-amber-300 bg-zinc-950/80"
        : "border-rose-500/70 text-rose-300 bg-zinc-950/80";

  return { level, className };
}

type NeighborIntel = SystemIntel["neighbors"][number];

function getNeighborScore(neighbor: NeighborIntel): number {
  const sec = neighbor.securityStatus;
  const jumps = neighbor.jumpsLastHour ?? 0;

  let score = 0;

  if (sec === null) {
    score += 0;
  } else if (sec >= 0.5) {
    score += 0;
  } else if (sec > 0) {
    score += 1;
  } else {
    score += 2;
  }

  if (jumps >= 200) {
    score += 2;
  } else if (jumps >= 50) {
    score += 1;
  }

  return score;
}

function formatIsk(value: number | null) {
  if (value === null) return "Unknown";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  return value.toLocaleString();
}

function getTopHours(
  activity: SystemIntel["activity"] | null,
  limit = 4,
): { hour: number; count: number }[] {
  if (!activity || !Array.isArray(activity.buckets)) return [];
  const totals = new Map<number, number>();
  for (const bucket of activity.buckets) {
    const prev = totals.get(bucket.hour) ?? 0;
    totals.set(bucket.hour, prev + bucket.count);
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hour, count]) => ({ hour, count }));
}

export function SystemLookupClient() {
  const router = useRouter();
  const [systemName, setSystemName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<SystemIntel | null>(null);
  const [suggestions, setSuggestions] = useState<SystemSuggestion[]>([]);
  const [suggestionsFromError, setSuggestionsFromError] = useState(false);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(
    null,
  );

  function navigateToRoutePlanner(params: { origin?: string; destination?: string }) {
    const search = new URLSearchParams();
    if (params.origin) search.set("origin", params.origin);
    if (params.destination) search.set("destination", params.destination);
    const qs = search.toString();
    router.push(`/route-planner${qs ? `?${qs}` : ""}`);
  }
  async function performLookup(rawName: string) {
    const name = rawName.trim();
    if (!name) {
      setError("Please enter a system name.");
      setIntel(null);
      return;
    }

    if (name.length < 2) {
      setError("Please enter at least 2 characters.");
      setIntel(null);
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSuggestionsFromError(false);

    try {
      const res = await fetch("/api/system-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ systemName: name }),
      });

      const data = (await res.json()) as SystemLookupResponse;

      if (res.status === 429) {
        setThrottleNotice("Throttled by system lookup API. Please wait a moment…");
        setError("Rate limited. Please retry shortly.");
        return;
      }

      if (!res.ok || !data.ok) {
        if (res.status === 404) {
          setError(`No system found named "${name}". Try a nearby match below.`);
          setSuggestionsFromError(true);
          void fetchSuggestions(name, setSuggestions);
          setIntel(null);
          return;
        }

        const message = !data.ok
          ? data.error.message
          : "Lookup failed. Please try again.";
        setError(message);
        setIntel(null);
        setSuggestionsFromError(false);
        return;
      }

      setIntel(data.data);
      setSuggestionsFromError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request cancelled");
      } else {
        console.error("System lookup error", err);
        setError("Unexpected error during lookup. Please try again.");
        setIntel(null);
      }
    } finally {
      setLoading(false);
      setThrottleNotice(null);
    }
  }

  async function handleLookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await performLookup(systemName);
  }

  const hasResult = !!intel;
  const securityMeta = intel ? getSecurityMeta(intel.securityStatus) : null;
  const dotlanSystemHref = intel
    ? `https://evemaps.dotlan.net/system/${intel.name.replace(/ /g, "_")}`
    : null;
  const dotlanMapHref =
    intel && intel.regionName
      ? `https://evemaps.dotlan.net/map/${intel.regionName.replace(/ /g, "_")}/${intel.name.replace(/ /g, "_")}`
      : null;
  const trafficSummary = intel ? getTrafficSummary(intel.jumpsLastHour) : null;
  const riskSummary = intel ? getRiskSummary(intel.pvpKillsLastHour) : null;
  const neighbors = intel?.neighbors ?? [];
  const riskMeta = intel ? getOverallRiskMeta(intel) : null;
  const killStats = intel?.stats ?? null;
  const totalKills = killStats?.totalKills ?? null;
  const soloKillsCount = killStats?.soloKills ?? null;
  const shipsDestroyedSolo = killStats?.shipsDestroyedSolo ?? null;
  const averageGangSize = killStats?.averageGangSize ?? null;
  const gangRatio = killStats?.gangRatio ?? null;
  const peakHours = useMemo(
    () => getTopHours(intel?.activity ?? null),
    [intel?.activity],
  );
  const zkbUpdatedLabel = intel?.zkbLastApiUpdate
    ? (() => {
        const dt = new Date(intel.zkbLastApiUpdate as string);
        if (Number.isNaN(dt.getTime())) return null;
        return `${dt.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
          hour12: false,
        })} UTC`;
      })()
    : null;
  const topShips = useMemo(() => intel?.topShips ?? [], [intel]);
  const topCharacters = useMemo(() => intel?.topCharacters ?? [], [intel]);
  const topCorporations = useMemo(
    () => intel?.topCorporations ?? [],
    [intel],
  );
  const topAlliances = useMemo(() => intel?.topAlliances ?? [], [intel]);

  const cardTone = riskMeta?.level ?? "low";
  const cardBorderShadowClass =
    cardTone === "high"
      ? "border-rose-500/60 shadow-[0_0_40px_rgba(248,113,113,0.5)]"
      : cardTone === "medium"
        ? "border-zinc-600/60 shadow-[0_0_24px_rgba(24,24,27,0.5)]"
        : "border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.4)]";
  const headerGlowFromClass =
    cardTone === "high"
      ? "from-rose-500/20"
      : cardTone === "medium"
        ? "from-zinc-500/20"
        : "from-emerald-400/20";

  return (
    <section className="space-y-6">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          System Lookup
        </h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-prose">
          Enter an EVE system name to fetch live intel from ESI and zKillboard:
          security, region, last-hour jumps, PvP activity, ISK totals, heatmaps,
          and quick Dotlan links.
        </p>
      </div>

      <form
        onSubmit={handleLookup}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            System name
          </label>
          <Input
            autoComplete="off"
            placeholder="e.g. Jita"
            value={systemName}
            onChange={(e) => {
              const value = e.target.value;
              setSystemName(value);
              setIntel(null);
              setError(null);
              setSuggestionsFromError(false);
              void fetchSuggestions(value, setSuggestions);
            }}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-background text-sm shadow-md">
              {suggestionsFromError && (
                <p className="px-3 py-1 text-[0.7rem] text-emerald-400 border-b border-zinc-800/80">
                  Did you mean:
                </p>
              )}
              {suggestions.map((s) => (
                <button
                  key={s.systemId}
                  type="button"
                  onClick={() => {
                    setSystemName(s.name);
                    setSuggestions([]);
                    setIntel(null);
                    setError(null);
                    setSuggestionsFromError(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-3 text-xs text-zinc-400">
                    {s.regionName ?? "Unknown region"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="submit"
          disabled={loading || systemName.trim().length < 2}
          className="mt-2 w-full sm:mt-6 sm:w-32"
        >
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lookup issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!hasResult && loading && (
        <Card className="border border-zinc-800/70 bg-zinc-950/70">
          <CardHeader>
            <CardTitle className="h-4 w-32 animate-pulse rounded bg-zinc-800/80" />
            <CardDescription className="mt-2 h-3 w-64 animate-pulse rounded bg-zinc-900/80" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-lg bg-zinc-900/80" />
              <div className="h-20 animate-pulse rounded-lg bg-zinc-900/80" />
            </div>
            <div className="h-32 animate-pulse rounded-lg bg-zinc-900/80" />
          </CardContent>
        </Card>
      )}

      {hasResult && intel && (
        <Card
          className={`relative overflow-hidden bg-zinc-950/60 backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${cardBorderShadowClass}`}
        >
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${headerGlowFromClass} via-transparent to-transparent`}
          />
          <CardHeader>
            <CardTitle>{intel.name}</CardTitle>
            <CardDescription>
              System ID {intel.systemId}
              {intel.regionName ? ` · ${intel.regionName}` : ""}
              {intel.constellationName ? ` · ${intel.constellationName}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {securityMeta && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${securityMeta.className}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>{securityMeta.label}</span>
                  {intel.securityStatus !== null && (
                    <span className="text-[0.7rem] text-zinc-300">
                      {intel.securityStatus.toFixed(1)}
                    </span>
                  )}

            {intel.securityClass && (
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Security class (ESI):
                <span className="ml-1 font-normal text-zinc-200 normal-case tracking-normal">
                  {intel.securityClass}
                </span>
              </p>
            )}
                </span>
                <span className="text-xs text-zinc-400">
                  Snapshot of the last hour in
                  <span className="ml-1 font-semibold text-zinc-100">
                    {intel.name}
                  </span>
                  .
                </span>
                {zkbUpdatedLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.7rem] text-zinc-400">
                    <Clock3 className="h-3 w-3 text-zinc-500" />
                    <span>zKill sync {zkbUpdatedLabel}</span>
                  </span>
                )}
              </div>
            )}

            {intel && (
              <div className="grid gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-[0.7rem] text-zinc-300 sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2">
                  {riskMeta && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] motion-safe:animate-pulse ${riskMeta.className}`}
                    >
                      <span className="text-zinc-400">Risk</span>
                      <span className="font-semibold capitalize">
                        {riskMeta.level}
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-zinc-400">Sec</span>
                    <span className="font-semibold text-zinc-100">
                      {intel.securityStatus !== null
                        ? intel.securityStatus.toFixed(1)
                        : "?"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-zinc-400">Jumps / h</span>
                    <span className="font-semibold text-zinc-100">
                      {intel.jumpsLastHour !== null
                        ? intel.jumpsLastHour.toLocaleString()
                        : "?"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-zinc-400">PvP / h</span>
                    <span className="font-semibold text-zinc-100">
                      {intel.pvpKillsLastHour !== null
                        ? intel.pvpKillsLastHour.toLocaleString()
                        : "?"}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-zinc-400">Neighbors</span>
                    <span className="font-semibold text-zinc-100">
                      {neighbors.length}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {neighbors.length > 0 && (
              <div className="pt-3 border-t border-zinc-800/80 text-xs text-zinc-400">
                <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Connected systems ({neighbors.length})
                </p>
                <p className="mb-2 text-[0.7rem] text-zinc-500">
                  Click a neighbor to focus its intel and explore adjacent routes.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[...neighbors]
                    .sort((a, b) => getNeighborScore(b) - getNeighborScore(a))
                    .map((n) => {
                      const sec = n.securityStatus;
                      const jumps = n.jumpsLastHour;

                      let secClass = "border-zinc-700/80 bg-zinc-900/60";
                      let metaText = "?";
                      let metaTextClass = "text-zinc-300";

                      if (sec !== null) {
                        metaText = sec.toFixed(1);
                        if (sec >= 0.5) {
                          secClass =
                            "border-emerald-400/70 bg-emerald-900/30 hover:border-emerald-400/90 hover:bg-emerald-900/60";
                        } else if (sec > 0) {
                          secClass =
                            "border-amber-400/70 bg-amber-900/20 hover:border-amber-400/90 hover:bg-amber-900/50";
                        } else {
                          secClass =
                            "border-rose-500/70 bg-rose-950/40 hover:border-rose-500/90 hover:bg-rose-950/70";
                        }
                      }

                      let hotBadge: "none" | "hot" | "very-hot" = "none";

                      if (jumps !== null) {
                        metaText = `${metaText} · ${jumps.toLocaleString()}/h`;
                        if (jumps >= 800) {
                          metaTextClass = "text-amber-300";
                          hotBadge = "very-hot";
                        } else if (jumps >= 200) {
                          metaTextClass = "text-amber-300";
                          hotBadge = "hot";
                        }
                      }

                      return (
                        <div
                          key={n.systemId}
                          className="inline-flex items-center gap-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSystemName(n.name);
                              void performLookup(n.name);
                            }}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] text-zinc-100 transition-colors ${secClass}`}
                          >
                            <span>{n.name}</span>
                            {hotBadge !== "none" && (
                              <span
                                className={`ml-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] ${
                                  hotBadge === "very-hot"
                                    ? "border-rose-500/70 bg-rose-500/10 text-rose-300"
                                    : "border-amber-400/70 bg-amber-500/10 text-amber-300"
                                }`}
                              >
                                {hotBadge === "very-hot" ? "HOT+" : "HOT"}
                              </span>
                            )}
                            <span
                              className={`ml-1 rounded-full bg-zinc-950/70 px-1.5 py-0.5 text-[0.65rem] ${metaTextClass}`}
                            >
                              {metaText}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigateToRoutePlanner({
                                origin: intel.name,
                                destination: n.name,
                              })
                            }
                            className="inline-flex items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-950/80 p-1 text-[0.65rem] text-zinc-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-200"
                            title={`Plan leg ${intel.name} → ${n.name}`}
                          >
                            <RouteIcon className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 shadow-[0_0_18px_rgba(15,23,42,0.75)]">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-sky-400" />
                  <div>
                    <p className="text-xs text-zinc-400">Security</p>
                    <p className="font-medium">
                      {intel.securityStatus !== null
                        ? intel.securityStatus.toFixed(1)
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 shadow-[0_0_18px_rgba(15,23,42,0.75)]">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-xs text-zinc-400">
                      Jumps (last hour)
                    </p>
                    <p className="font-medium">
                      {intel.jumpsLastHour !== null
                        ? intel.jumpsLastHour.toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 shadow-[0_0_18px_rgba(15,23,42,0.75)]">
                <div className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-rose-400" />
                  <div>
                    <p className="text-xs text-zinc-400">
                      PvP kills (last hour)
                    </p>
                    <p className="font-medium">
                      {intel.pvpKillsLastHour !== null
                        ? intel.pvpKillsLastHour.toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 shadow-[0_0_18px_rgba(15,23,42,0.75)]">
                <div className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-rose-300" />
                  <div>
                    <p className="text-xs text-zinc-400">
                      PvP kills (last 24h)
                    </p>
                    <p className="font-medium">
                      {intel.pvpKillsLast24h !== null
                        ? intel.pvpKillsLast24h.toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 shadow-[0_0_18px_rgba(15,23,42,0.75)]">
                <div className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-rose-200" />
                  <div>
                    <p className="text-xs text-zinc-400">
                      PvP kills (last 7d)
                    </p>
                    <p className="font-medium">
                      {intel.pvpKillsLast7d !== null
                        ? intel.pvpKillsLast7d.toLocaleString()
                        : "Unknown"}
                    </p>
                    <p className="text-[0.7rem] text-zinc-500">
                      zKillboard 7-day window
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-start gap-2">
                  <Coins className="h-4 w-4 text-amber-300" />
                  <div>
                    <p className="text-[0.75rem] text-zinc-400">ISK impact</p>
                    <p className="text-sm font-semibold text-zinc-100">
                      {killStats
                        ? `${formatIsk(killStats.iskDestroyed ?? null)} ISK destroyed`
                        : "Not enough zKillboard data"}
                    </p>
                    <p className="text-[0.75rem] text-zinc-500">
                      zKillboard lifetime totals for this system.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.8rem]">
                  <div>
                    <p className="text-zinc-500">Kills in system</p>
                    <p className="font-semibold text-zinc-100">
                      {totalKills !== null
                        ? totalKills.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solo kills</p>
                    <p className="font-semibold text-zinc-100">
                      {soloKillsCount !== null
                        ? soloKillsCount.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solo hulls destroyed</p>
                    <p className="font-semibold text-zinc-100">
                      {shipsDestroyedSolo !== null
                        ? shipsDestroyedSolo.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Avg gang size</p>
                    <p className="font-semibold text-zinc-100">
                      {averageGangSize !== null
                        ? averageGangSize.toFixed(1)
                        : "?"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-sky-300" />
                  <div>
                    <p className="text-[0.75rem] text-zinc-400">
                      Combat profile
                    </p>
                    <p className="text-sm font-semibold text-zinc-100">
                      {killStats
                        ? "Who fights here (zKillboard)"
                        : "Waiting on recent zKillboard data"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.8rem]">
                  <div>
                    <p className="text-zinc-500">Gang ratio</p>
                    <p className="font-semibold text-zinc-100">
                      {gangRatio !== null
                        ? `${gangRatio.toFixed(1)}%`
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solo share</p>
                    <p className="font-semibold text-zinc-100">
                      {soloKillsCount !== null &&
                      totalKills !== null &&
                      totalKills > 0
                        ? `${(((soloKillsCount ?? 0) / (totalKills ?? 1)) * 100).toFixed(1)}%`
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Recent PvP / day (7d)</p>
                    <p className="font-semibold text-zinc-100">
                      {intel.pvpKillsLast7d !== null
                        ? `${(intel.pvpKillsLast7d / 7).toFixed(1)} avg`
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Recent PvP (24h)</p>
                    <p className="font-semibold text-zinc-100">
                      {intel.pvpKillsLast24h !== null
                        ? intel.pvpKillsLast24h.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.75rem] text-zinc-400">Top hulls</p>
                    <p className="text-sm font-semibold text-zinc-100">
                      Ships scoring kills here
                    </p>
                  </div>
                  <Ship className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="mt-3 space-y-2">
                  {topShips.length > 0 ? (
                    topShips.map((ship, idx) => (
                      <div
                        key={ship.id}
                        className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-2 py-2"
                      >
                        <span className="text-[0.7rem] text-zinc-500">
                          {idx + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {ship.name}
                          </p>
                          {ship.group && (
                            <p className="text-[0.7rem] text-zinc-500">
                              {ship.group}
                            </p>
                          )}
                        </div>
                        <span className="text-[0.75rem] font-semibold text-emerald-300">
                          {ship.kills.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[0.75rem] text-zinc-500">
                      Not enough kills yet to rank ships.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.75rem] text-zinc-400">Top groups</p>
                    <p className="text-sm font-semibold text-zinc-100">
                      Corporations and alliances hunting here
                    </p>
                  </div>
                  <Building2 className="h-5 w-5 text-sky-300" />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-[0.85rem] sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[0.7rem] uppercase tracking-[0.18em] text-zinc-500">
                      Corporations
                    </p>
                    <div className="space-y-2">
                      {topCorporations.length > 0 ? (
                        topCorporations.map((corp, idx) => (
                          <div
                            key={corp.id}
                            className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-2 py-2"
                          >
                            <span className="text-[0.7rem] text-zinc-500">
                              {idx + 1}.
                            </span>
                            <p className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                              {corp.name}
                            </p>
                            <span className="text-[0.75rem] font-semibold text-sky-200">
                              {corp.kills.toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[0.75rem] text-zinc-500">
                          Not enough corp data yet.
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[0.7rem] uppercase tracking-[0.18em] text-zinc-500">
                      Alliances
                    </p>
                    <div className="space-y-2">
                      {topAlliances.length > 0 ? (
                        topAlliances.map((alli, idx) => (
                          <div
                            key={alli.id}
                            className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-2 py-2"
                          >
                            <span className="text-[0.7rem] text-zinc-500">
                              {idx + 1}.
                            </span>
                            <p className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                              {alli.name}
                            </p>
                            <span className="text-[0.75rem] font-semibold text-emerald-200">
                              {alli.kills.toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[0.75rem] text-zinc-500">
                          Not enough alliance data yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.75rem] text-zinc-400">Top pilots</p>
                    <p className="text-sm font-semibold text-zinc-100">
                      Characters with kill history here
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-rose-300" />
                </div>
                <div className="mt-3 space-y-2">
                  {topCharacters.length > 0 ? (
                    topCharacters.map((ch, idx) => (
                      <div
                        key={ch.id}
                        className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-2 py-2"
                      >
                        <span className="text-[0.7rem] text-zinc-500">
                          {idx + 1}.
                        </span>
                        <p className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                          {ch.name}
                        </p>
                        <span className="text-[0.75rem] font-semibold text-rose-200">
                          {ch.kills.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[0.75rem] text-zinc-500">
                      No pilot leaderboard yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-emerald-300" />
                <div>
                  <p className="text-[0.75rem] text-zinc-400">Active hours</p>
                  <p className="text-sm font-semibold text-zinc-100">
                    Peak times from weekly kill heatmap (EVE/UTC)
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {peakHours.length > 0 ? (
                  peakHours.map((slot) => (
                    <span
                      key={slot.hour}
                      className="inline-flex items-center gap-2 rounded-md border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.8rem] text-zinc-100"
                    >
                      <span>{`${slot.hour.toString().padStart(2, "0")}:00`}</span>
                      <span className="text-emerald-300">
                        {slot.count.toLocaleString()} kills
                      </span>
                    </span>
                  ))
                ) : (
                  <p className="text-[0.8rem] text-zinc-500">
                    Not enough kill data to chart active hours yet.
                  </p>
                )}
              </div>
            </div>

            {(trafficSummary || riskSummary) && (
              <div className="space-y-1 text-xs text-zinc-400">
                {trafficSummary && (
                  <p>
                    <span className="font-semibold text-zinc-100">
                      Traffic:
                    </span>{" "}
                    {trafficSummary}
                  </p>
                )}
                {riskSummary && (
                  <p>
                    <span className="font-semibold text-zinc-100">
                      Combat risk:
                    </span>{" "}
                    {riskSummary}
                  </p>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-zinc-800/80 text-xs text-zinc-400">
              <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Intel links
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://zkillboard.com/system/${intel.systemId}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20"
                >
                  <Swords className="h-3 w-3" />
                  <span>zKillboard system feed</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                {dotlanSystemHref && (
                  <a
                    href={dotlanSystemHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 transition-colors hover:border-sky-400 hover:bg-sky-500/20"
                  >
                    <MapIcon className="h-3 w-3" />
                    <span>Dotlan system page</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {dotlanMapHref && (
                  <a
                    href={dotlanMapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20"
                  >
                    <MapIcon className="h-3 w-3" />
                    <span>Dotlan region map</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() =>
                    navigateToRoutePlanner({ origin: intel.name })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-200 transition-colors hover:border-emerald-400 hover:bg-emerald-500/10"
                >
                  <RouteIcon className="h-3 w-3 text-emerald-400" />
                  <span>Plan route from</span>
                  <span className="font-semibold text-zinc-100">
                    {intel.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigateToRoutePlanner({ destination: intel.name })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-200 transition-colors hover:border-emerald-400 hover:bg-emerald-500/10"
                >
                  <RouteIcon className="h-3 w-3 text-emerald-400" />
                  <span>Plan route to</span>
                  <span className="font-semibold text-zinc-100">
                    {intel.name}
                  </span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
