"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type {
  CharacterIntel,
  PlayerLookupResponse,
  PlayerSuggestion,
} from "@/lib/types/player-intel";
import {
  Activity,
  BarChart3,
  Clock3,
  Coins,
  ExternalLink,
  MapPin,
  Ship,
  Swords,
  Users,
} from "lucide-react";
import { fetchPlayerSuggestions } from "./fetchSuggestions";
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

function getCharacterRiskMeta(intel: CharacterIntel) {
  const sec = intel.securityStatus;
  const kills = intel.pvpKillsLast24h ?? 0;

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
  } else if (kills < 5) {
    score += 1;
  } else if (kills < 20) {
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

function formatIsk(value: number | null) {
  if (value === null) return "Unknown";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  return value.toLocaleString();
}

function formatRatio(kills: number | null, losses: number | null) {
  if (kills === null || losses === null) return null;
  if (losses === 0) {
    return "Perfect";
  }
  return (kills / losses).toFixed(2);
}

function getTopHours(
  activity: CharacterIntel["activity"] | null,
  limit = 3,
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

export function PlayerLookupClient() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<CharacterIntel | null>(null);
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [suggestionsFromError, setSuggestionsFromError] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(
    null,
  );

  async function performLookup(rawName: string) {
    const trimmed = rawName.trim();
    if (!trimmed) {
      setError("Please enter a character name.");
      setIntel(null);
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setLoading(true);
    setError(null);
    setIntel(null);
    setSuggestions([]);
    setSuggestionsFromError(false);
    setHighlightIndex(null);

    try {
      const res = await fetch("/api/player-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ name: trimmed }),
      });

      const data = (await res.json()) as PlayerLookupResponse;

      if (res.status === 429) {
        setThrottleNotice("Throttled by player lookup API. Please wait a moment…");
        setError("Rate limited. Retrying soon.");
        setSuggestions([]);
        return;
      }

      if (!res.ok || !data.ok) {
        if (res.status === 404 && !data.ok) {
          setError(data.error.message);
          setSuggestionsFromError(true);
          void fetchPlayerSuggestions(trimmed, setSuggestions);
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
        console.error("Player lookup error", err);
        setError("Unexpected error during lookup. Please try again.");
        setIntel(null);
      }
    } finally {
      setLoading(false);
      setThrottleNotice(null);
    }
  }

  function applySuggestion(s: PlayerSuggestion) {
    setName(s.name);
    setSuggestions([]);
    setIntel(null);
    setError(null);
    setSuggestionsFromError(false);
    setHighlightIndex(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await performLookup(name);
  }

  const hasResult = !!intel;
  const characterRiskMeta = intel ? getCharacterRiskMeta(intel) : null;

  const ageLabel = intel?.birthday
    ? (() => {
        const birth = new Date(intel.birthday as string);
        if (Number.isNaN(birth.getTime())) return null;
        const now = new Date();
        const diffMs = now.getTime() - birth.getTime();
        const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
        const years = Math.floor(diffYears);
        const remainingMonths = Math.floor((diffYears - years) * 12);
        if (years <= 0 && remainingMonths <= 0) return "< 1 month";
        if (years <= 0) return `${remainingMonths} mo`;
        if (remainingMonths <= 0) return `${years} yr`;
        return `${years} yr ${remainingMonths} mo`;
      })()
    : null;

  const last7dRatio = useMemo(
    () => formatRatio(intel?.killsLast7d ?? null, intel?.deathsLast7d ?? null),
    [intel?.killsLast7d, intel?.deathsLast7d],
  );
  const lifetimeStats = intel?.combatStats ?? null;
  const lifetimeKills = lifetimeStats?.lifetimeKills ?? null;
  const lifetimeLosses = lifetimeStats?.lifetimeLosses ?? null;
  const soloKills = lifetimeStats?.soloKills ?? null;
  const soloLosses = lifetimeStats?.soloLosses ?? null;
  const avgGangSize = lifetimeStats?.averageGangSize ?? null;
  const gangRatio = lifetimeStats?.gangRatio ?? null;
  const dangerRatio = lifetimeStats?.dangerRatio ?? null;
  const lifetimeRatio = useMemo(
    () => formatRatio(lifetimeKills, lifetimeLosses),
    [lifetimeKills, lifetimeLosses],
  );
  const soloRatio = useMemo(
    () => formatRatio(soloKills, soloLosses),
    [soloKills, soloLosses],
  );
  const iskEfficiency = useMemo(
    () => lifetimeStats?.efficiency ?? null,
    [lifetimeStats?.efficiency],
  );
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

  return (
    <section className="space-y-6 text-sm">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Player Lookup
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-prose">
            Search for an EVE character and get a compact intel card: corporation,
            alliance, security status, and zKillboard-driven PvP + ISK profile.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-3 rounded-2xl border border-zinc-800/70 bg-black/70 px-4 py-4 backdrop-blur-sm sm:grid-cols-[minmax(0,1.6fr)_auto] sm:items-end"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Character name
          </label>
          <Input
            autoComplete="off"
            placeholder="e.g. Tactical Narcotics Division pilot"
            value={name}
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
              setError(null);
              setSuggestionsFromError(false);
              void fetchPlayerSuggestions(value, setSuggestions);
            }}
            onKeyDown={(e) => {
              if (suggestions.length === 0) return;

              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((prev) => {
                  if (prev === null) return 0;
                  const next = prev + 1;
                  return next >= suggestions.length ? 0 : next;
                });
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((prev) => {
                  if (prev === null) return suggestions.length - 1;
                  const next = prev - 1;
                  return next < 0 ? suggestions.length - 1 : next;
                });
              } else if (e.key === "Enter" && highlightIndex !== null) {
                e.preventDefault();
                const s = suggestions[highlightIndex];
                if (s) {
                  applySuggestion(s);
                }
              } else if (e.key === "Escape") {
                setSuggestions([]);
                setHighlightIndex(null);
              }
            }}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-background text-sm shadow-md">
              {suggestionsFromError && (
                <p className="px-3 py-1 text-[0.7rem] text-emerald-400 border-b border-zinc-800/80">
                  Did you mean:
                </p>
              )}
              {suggestions.map((s, idx) => {
                const isActive = highlightIndex === idx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      applySuggestion(s);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="ml-2 flex items-center gap-1 text-[0.7rem] text-zinc-500">
                      <span className="hidden sm:inline">ID {s.id}</span>
                      <a
                        href={`https://zkillboard.com/character/${s.id}/`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-emerald-300 hover:text-emerald-200"
                        title="Open zKillboard in a new tab"
                      >
                        <Swords className="h-3 w-3" />
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <Button
            type="submit"
            disabled={loading || name.trim().length < 2}
            className="mt-2 w-full sm:mt-0 sm:w-auto"
          >
            {loading ? "Searching..." : "Lookup"}
          </Button>
        </div>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lookup issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!hasResult && loading && (
        <Card className="border border-zinc-800/70 bg-zinc-950/70">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 animate-pulse rounded-md bg-zinc-900/80" />
              <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-zinc-800/80" />
                <div className="h-3 w-56 animate-pulse rounded bg-zinc-900/80" />
              </div>
            </div>
            <div className="mt-2 h-6 w-32 animate-pulse rounded-full bg-zinc-900/80 sm:mt-0" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-24 animate-pulse rounded-lg bg-zinc-900/80" />
              <div className="h-24 animate-pulse rounded-lg bg-zinc-900/80" />
            </div>
            <div className="h-32 animate-pulse rounded-lg bg-zinc-900/80" />
          </CardContent>
        </Card>
      )}

      {hasResult && intel && (
        <Card className="relative overflow-hidden border border-zinc-700/70 bg-zinc-950/70 backdrop-blur-sm shadow-[0_0_30px_rgba(15,23,42,0.9)] animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {intel.portraitUrl && (
                <Image
                  src={intel.portraitUrl}
                  alt={intel.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full border border-zinc-700/70 object-cover"
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-zinc-50">
                    {intel.name}
                  </span>
                  {ageLabel && (
                    <span className="text-[0.7rem] text-zinc-500">
                      · Age {ageLabel}
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs text-zinc-400">
                  {intel.corporation ? (
                    <span>
                      {intel.corporation.ticker
                        ? `[${intel.corporation.ticker}] `
                        : ""}
                      {intel.corporation.name}
                    </span>
                  ) : (
                    <span>No corporation data</span>
                  )}
                  {intel.alliance && (
                    <span className="ml-2 text-zinc-500">
                      · {intel.alliance.ticker
                        ? `[${intel.alliance.ticker}] `
                        : ""}
                      {intel.alliance.name}
                    </span>
                  )}
                </CardDescription>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-xs sm:text-sm">
            {characterRiskMeta && (
              <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${characterRiskMeta.className}`}
                >
                  <span className="text-zinc-400">Risk</span>
                  <span className="font-semibold capitalize">
                    {characterRiskMeta.level}
                  </span>
                </span>
                <span className="text-zinc-500">
                  Based on security status and PvP kills in the last 24h.
                </span>
                {zkbUpdatedLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/70 bg-zinc-900/70 px-2 py-0.5 text-[0.7rem] text-zinc-400">
                    <Clock3 className="h-3 w-3 text-zinc-500" />
                    <span>zKill sync {zkbUpdatedLabel}</span>
                  </span>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">Security</p>
                    <p className="font-medium text-zinc-100">
                      {intel.securityStatus !== null
                        ? intel.securityStatus.toFixed(1)
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-rose-400" />
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">
                      PvP kills (last 24h)
                    </p>
                    <p className="font-medium text-zinc-100">
                      {intel.pvpKillsLast24h !== null
                        ? intel.pvpKillsLast24h.toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-400" />
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">Activity (7d)</p>
                    <p className="font-medium text-zinc-100">
                      {intel.killsLast7d !== null
                        ? `${intel.killsLast7d.toLocaleString()} kills`
                        : "Kills: ?"}
                    </p>
                    <p className="font-medium text-zinc-400">
                      {intel.deathsLast7d !== null
                        ? `${intel.deathsLast7d.toLocaleString()} losses`
                        : "Losses: ?"}
                    </p>
                    <p className="text-[0.7rem] text-zinc-400">
                      {last7dRatio
                        ? `K/L ratio: ${last7dRatio}`
                        : "K/L ratio: ?"}
                    </p>
                    <p className="mt-1 text-[0.7rem] text-zinc-500 space-x-2">
                      <a
                        href={`https://zkillboard.com/character/${intel.id}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
                      >
                        <span>zKillboard</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={`https://evewho.com/character/${intel.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100"
                      >
                        <span>EveWho</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={`https://evemaps.dotlan.net/character/${encodeURIComponent(
                          intel.name.replace(/ /g, "_"),
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100"
                      >
                        <span>Dotlan</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Coins className="h-4 w-4 text-amber-300" />
                    <div>
                      <p className="text-[0.7rem] text-zinc-400">ISK impact</p>
                      <p className="font-medium text-zinc-100">
                        {formatIsk(lifetimeStats?.iskDestroyed ?? null)} ISK
                        destroyed
                      </p>
                      <p className="text-[0.75rem] text-zinc-400">
                        Lost {formatIsk(lifetimeStats?.iskLost ?? null)} ISK
                        lifetime
                      </p>
                    </div>
                  </div>
                  {iskEfficiency !== null && (
                    <span className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[0.7rem] font-semibold text-emerald-200">
                      Eff {iskEfficiency.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.75rem]">
                  <div>
                    <p className="text-zinc-500">Lifetime kills</p>
                    <p className="font-medium text-zinc-100">
                      {lifetimeKills !== null
                        ? lifetimeKills.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Lifetime losses</p>
                    <p className="font-medium text-zinc-100">
                      {lifetimeLosses !== null
                        ? lifetimeLosses.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Lifetime K/L</p>
                    <p className="font-medium text-zinc-100">
                      {lifetimeRatio ?? "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Last 7d K/L</p>
                    <p className="font-medium text-zinc-100">
                      {last7dRatio ?? "?"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-sky-300" />
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">
                      Solo vs fleet profile
                    </p>
                    <p className="font-medium text-zinc-100">
                      {lifetimeStats
                        ? "zKillboard combat breakdown"
                        : "Not enough zKillboard history"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[0.75rem]">
                  <div>
                    <p className="text-zinc-500">Solo kills</p>
                    <p className="font-medium text-zinc-100">
                      {soloKills !== null
                        ? soloKills.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solo losses</p>
                    <p className="font-medium text-zinc-100">
                      {soloLosses !== null
                        ? soloLosses.toLocaleString()
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solo ratio</p>
                    <p className="font-medium text-zinc-100">
                      {soloRatio ?? "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Avg gang size</p>
                    <p className="font-medium text-zinc-100">
                      {avgGangSize !== null
                        ? avgGangSize.toFixed(1)
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Gang ratio</p>
                    <p className="font-medium text-zinc-100">
                      {gangRatio !== null
                        ? `${gangRatio.toFixed(1)}%`
                        : "?"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Danger ratio</p>
                    <p className="font-medium text-zinc-100">
                      {dangerRatio !== null
                        ? `${dangerRatio.toFixed(1)}%`
                        : "?"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">Favorite hulls</p>
                    <p className="font-medium text-zinc-100">
                      Ships this pilot scores kills with
                    </p>
                  </div>
                  <Ship className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="mt-3 space-y-2">
                  {intel.topShips.length > 0 ? (
                    intel.topShips.map((ship, idx) => (
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
                          {ship.kills.toLocaleString()} kills
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[0.75rem] text-zinc-500">
                      Not enough zKillboard data to rank ships yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">
                      Hunting grounds
                    </p>
                    <p className="font-medium text-zinc-100">
                      Systems where this pilot finds kills
                    </p>
                  </div>
                  <MapPin className="h-5 w-5 text-sky-300" />
                </div>
                <div className="mt-3 space-y-2">
                  {intel.topSystems.length > 0 ? (
                    intel.topSystems.map((sys, idx) => (
                      <div
                        key={sys.id}
                        className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-2 py-2"
                      >
                        <span className="text-[0.7rem] text-zinc-500">
                          {idx + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {sys.name}
                          </p>
                        </div>
                        <span className="text-[0.75rem] font-semibold text-sky-200">
                          {sys.kills.toLocaleString()} kills
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[0.75rem] text-zinc-500">
                      No system-level kill data available yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-emerald-300" />
                  <div>
                    <p className="text-[0.7rem] text-zinc-400">Active hours</p>
                    <p className="font-medium text-zinc-100">
                      Peak times from weekly kill heatmap
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {peakHours.length > 0 ? (
                  peakHours.map((slot) => (
                    <span
                      key={slot.hour}
                      className="inline-flex items-center gap-2 rounded-md border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.75rem] text-zinc-100"
                    >
                      <span>{`${slot.hour.toString().padStart(2, "0")}:00`}</span>
                      <span className="text-emerald-300">
                        {slot.count.toLocaleString()} kills
                      </span>
                    </span>
                  ))
                ) : (
                  <p className="text-[0.75rem] text-zinc-500">
                    Not enough kill data to chart active hours yet.
                  </p>
                )}
              </div>
              <p className="mt-2 text-[0.7rem] text-zinc-500">
                Times are displayed in EVE/UTC based on recent zKillboard
                activity.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
