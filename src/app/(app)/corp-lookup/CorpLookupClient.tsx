"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  Clock3,
  Network,
  Loader2,
  ExternalLink,
  BarChart3,
  Swords,
  ShieldCheck,
} from "lucide-react";
import type { CorpIntel, CorpLookupResponse, CorpSuggestion } from "@/lib/types/corp-intel";
import { fetchCorpSuggestions } from "./fetchSuggestions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

function formatNumber(val: number | null, digits = 0) {
  if (val === null || Number.isNaN(val)) return "—";
  return val.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatIskShort(val: number | null) {
  if (val === null || Number.isNaN(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  return val.toLocaleString();
}

export function CorpLookupClient() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CorpSuggestion[]>([]);
  const [intel, setIntel] = useState<CorpIntel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromEmpty, setFromEmpty] = useState(false);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCorpSuggestions(query).then(setSuggestions);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  async function lookup(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a corporation name.");
      setIntel(null);
      return;
    }
    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setLoading(true);
    setError(null);
    setFromEmpty(false);
    setIntel(null);
    try {
      const res = await fetch("/api/corp-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as CorpLookupResponse;
      if (res.status === 429) {
        setThrottleNotice("Throttled by corp lookup API. Please wait a moment…");
        setError("Rate limited. Please retry shortly.");
        return;
      }
      if (!res.ok || !data.ok) {
        if (res.status === 404) {
          setError("Corporation not found. Try a different name or ticker.");
          setFromEmpty(true);
        } else {
          setError(!data.ok ? data.error.message : "Lookup failed.");
        }
        setIntel(null);
        return;
      }
      setIntel(data.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request cancelled");
      } else {
        console.error("corp lookup failed", err);
        setError("Unexpected error. Please try again.");
        setIntel(null);
      }
    } finally {
      setLoading(false);
      setThrottleNotice(null);
    }
  }

  const activitySummary = useMemo(() => {
    if (!intel) return null;
    const kills = intel.kills7d ?? 0;
    const losses = intel.losses7d ?? 0;
    const ratio = losses === 0 ? kills : kills / Math.max(1, losses);
    const active = kills + losses > 0;
    return { kills, losses, ratio, active };
  }, [intel]);

  const efficiency = useMemo(() => {
    if (!intel) return null;
    const destroyed = intel.iskDestroyed ?? 0;
    const lost = intel.iskLost ?? 0;
    if (destroyed === 0 && lost === 0) return null;
    return destroyed / Math.max(1, destroyed + lost);
  }, [intel]);

  return (
    <section className="space-y-6 text-sm">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div>
        <h1 className="text-3xl font-semibold text-zinc-50">Corporation Lookup</h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-3xl">
          Find EVE corporations and view richer intel: corp logo, alliance, CEO, tax, home, and live zKill activity snapshots.
        </p>
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Type a corporation name or ticker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Input
              placeholder="Brave Collective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup(query);
                }
              }}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/95 text-sm shadow-lg">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                    onClick={() => {
                      setQuery(s.name);
                      setSuggestions([]);
                      void lookup(s.name);
                    }}
                  >
                    <span className="truncate">{s.name}</span>
                    {s.ticker && <span className="text-[0.7rem] text-zinc-500">{s.ticker}</span>}
                  </button>
                ))}
              </div>
            )}
            {fromEmpty && suggestions.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-sm text-zinc-500 shadow-lg">
                No matches found. Try a different name.
              </div>
            )}
          </div>
          <Button type="button" onClick={() => void lookup(query)} disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </span>
            ) : (
              "Lookup corporation"
            )}
          </Button>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Lookup failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {intel && (
        <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {intel.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${intel.logo}?size=128`}
                    alt={intel.name}
                    className="h-12 w-12 rounded-md border border-zinc-800 bg-black object-contain"
                  />
                )}
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-zinc-50">
                  <Building2 className="h-4 w-4 text-emerald-300" />
                  {intel.name}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-3 text-[0.85rem]">
                  {intel.ticker && (
                    <span className="rounded border border-zinc-700/70 bg-zinc-900/70 px-2 py-0.5">
                      {intel.ticker}
                    </span>
                  )}
                  {intel.allianceName && (
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Network className="h-4 w-4 text-sky-300" />
                      {intel.allianceName}
                    </span>
                  )}
                  {intel.memberCount !== null && (
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Users className="h-4 w-4 text-emerald-300" />
                      {formatNumber(intel.memberCount)} members
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-zinc-400">
              {intel.dateFounded && (
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 text-zinc-300">
                  <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
                  Founded {new Date(intel.dateFounded).toLocaleDateString()}
                </span>
              )}
              {intel.warEligible !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${
                    intel.warEligible
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                      : "border-zinc-700/70 bg-zinc-900/70 text-zinc-300"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {intel.warEligible ? "War eligible" : "Not war eligible"}
                </span>
              )}
              {intel.externalDescription && (
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 text-zinc-300">
                  Dotlan profile found
                </span>
              )}
              <a
                href={`https://zkillboard.com/corporation/${intel.id}/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 hover:border-emerald-500/60 hover:text-emerald-100"
              >
                <ExternalLink className="h-3.5 w-3.5" /> zKill
              </a>
              <a
                href={`https://evemaps.dotlan.net/corp/${encodeURIComponent(intel.name.replace(/\s+/g, "_"))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 hover:border-emerald-500/60 hover:text-emerald-100"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Dotlan
              </a>
              <a
                href={`https://evewho.com/corporation/${intel.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 hover:border-emerald-500/60 hover:text-emerald-100"
              >
                <ExternalLink className="h-3.5 w-3.5" /> EveWho
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="bg-zinc-900/70">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="description">Description</TabsTrigger>
            </TabsList>
              <TabsContent value="overview" className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Tax</p>
                    <p className="text-lg text-zinc-100">
                      {intel.taxRate !== null ? `${(intel.taxRate * 100).toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Home</p>
                    <p className="text-lg text-zinc-100">
                      {intel.homeStationName ?? (intel.homeStationId ? `Station ${intel.homeStationId}` : "Unknown")}
                    </p>
                  </div>
                  <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">CEO</p>
                    <p className="text-lg text-zinc-100">
                      {intel.ceoName ?? (intel.ceoId ? `Character ${intel.ceoId}` : "Unknown")}
                    </p>
                  </div>

                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-emerald-200">Kills 7d</p>
                    <p className="text-lg text-emerald-100">{formatNumber(intel.kills7d, 0)}</p>
                  </div>
                  <div className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-rose-200">Losses 7d</p>
                    <p className="text-lg text-rose-100">{formatNumber(intel.losses7d, 0)}</p>
                  </div>
                  <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Efficiency 7d</p>
                    <p className="text-lg text-zinc-100">
                      {activitySummary ? `${(activitySummary.ratio * 100).toFixed(1)}%` : "—"}
                    </p>
                  </div>

                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-emerald-200">Kills 30d</p>
                    <p className="text-lg text-emerald-100">{formatNumber(intel.kills30d, 0)}</p>
                  </div>
                  <div className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-rose-200">Losses 30d</p>
                    <p className="text-lg text-rose-100">{formatNumber(intel.losses30d, 0)}</p>
                  </div>
                  <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Status</p>
                    <p className="text-sm text-zinc-200">
                      {activitySummary?.active
                        ? "Active on zKill in the last week."
                        : "Quiet recently; using 30d data if present."}
                      {intel.warEligible !== null ? ` · ${intel.warEligible ? "War eligible" : "Not war eligible"}` : ""}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                  <div className="flex items-center justify-between text-[0.9rem] text-zinc-200">
                    <span className="inline-flex items-center gap-1">
                      <BarChart3 className="h-4 w-4 text-emerald-300" />
                      ISK destroyed / lost (all time)
                    </span>
                    <span>
                      {formatIskShort(intel.iskDestroyed)} / {formatIskShort(intel.iskLost)}
                    </span>
                  </div>
              <div className="flex items-center justify-between text-[0.9rem] text-zinc-200">
                <span className="inline-flex items-center gap-1">
                  <Swords className="h-4 w-4 text-emerald-300" />
                  Danger ratio
                </span>
                    <span>{intel.dangerRatio !== null ? `${intel.dangerRatio.toFixed(0)}%` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[0.9rem] text-zinc-200">
                    <span>Fleet ratio</span>
                    <span>{intel.gangRatio !== null ? `${intel.gangRatio.toFixed(0)}%` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[0.9rem] text-zinc-200">
                    <span>ISK efficiency</span>
                    <span>{efficiency !== null ? `${(efficiency * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  <div className="mt-2 rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-[0.9rem] text-zinc-200">
                    <div className="flex items-center justify-between">
                      <span>30d destroyed</span>
                      <span>{formatIskShort(intel.iskDestroyedRecent ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>30d lost</span>
                      <span>{formatIskShort(intel.iskLostRecent ?? null)}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top systems (kills)</p>
                    {intel.topSystems.length ? (
                      intel.topSystems.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{s.name}</span>
                          <span className="text-zinc-400">{formatNumber(s.kills, 0)} kills</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No system data available.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top systems (losses)</p>
                    {intel.topSystemsLost.length ? (
                      intel.topSystemsLost.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{s.name}</span>
                          <span className="text-zinc-400">{formatNumber(s.kills, 0)} losses</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No loss system data.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top members (kills)</p>
                    {intel.topMembers.length ? (
                      intel.topMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{m.name}</span>
                          <span className="text-zinc-400">{formatNumber(m.kills, 0)} kills</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No member activity found.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top members (losses)</p>
                    {intel.topMembersLost.length ? (
                      intel.topMembersLost.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{m.name}</span>
                          <span className="text-zinc-400">{formatNumber(m.kills, 0)} losses</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No member loss data.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top ships (kills)</p>
                    {intel.topShips.length ? (
                      intel.topShips.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{s.name}</span>
                          <span className="text-zinc-400">{formatNumber(s.kills, 0)} kills</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No ship data available.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Top ships (losses)</p>
                    {intel.topShipsLost.length ? (
                      intel.topShipsLost.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[0.9rem] text-zinc-200">
                          <span className="truncate">{s.name}</span>
                          <span className="text-zinc-400">{formatNumber(s.kills, 0)} losses</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">No ship loss data.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">ISK summary</p>
                    <div className="rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-[0.9rem] text-zinc-200">
                      <div className="flex items-center justify-between">
                        <span>Destroyed</span>
                        <span>{formatNumber(intel.iskDestroyed, 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Lost</span>
                        <span>{formatNumber(intel.iskLost, 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Efficiency</span>
                        <span>{efficiency !== null ? `${(efficiency * 100).toFixed(1)}%` : "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="description">
                <div className="space-y-3 rounded-md border border-zinc-800/70 bg-zinc-900/60 p-4 text-[0.95rem] text-zinc-200">
                  {intel.externalDescription ? (
                    <div>
                      <p className="text-[0.75rem] uppercase tracking-[0.16em] text-zinc-400">Dotlan profile</p>
                      <p className="whitespace-pre-line leading-relaxed">{intel.externalDescription}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No description available.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
