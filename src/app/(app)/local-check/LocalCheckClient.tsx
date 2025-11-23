"use client";

import { useState, useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Shield, Users } from "lucide-react";
import type { CharacterIntel, PlayerLookupResponse } from "@/lib/types/player-intel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type RowStatus = "ok" | "not_found" | "error";

type LocalRow = {
  name: string;
  status: RowStatus;
  intel: CharacterIntel | null;
  message?: string;
};

type SortColumn = "name" | "corp" | "sec" | "pvp24h" | "pvp7d" | "risk";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection };

function getRiskMeta(intel: CharacterIntel | null) {
  if (!intel) return { level: "unknown", badge: "bg-zinc-900/70 text-zinc-300" } as const;
  const sec = intel.securityStatus;
  const kills24 = intel.pvpKillsLast24h ?? 0;
  const kills7d = intel.killsLast7d ?? 0;

  // Security should influence risk, but PvP activity should dominate.
  let score = 0;
  if (sec === null) score += 1; // unknown sec = minor bump
  else if (sec >= 0.5) score += 0; // high-sec baseline
  else if (sec > 0) score += 1; // low-sec bump
  else score += 2; // null/wh bump

  // 24h PvP is the strongest signal.
  if (kills24 === 0) score += 0;
  else if (kills24 < 3) score += 2;
  else if (kills24 < 10) score += 3;
  else if (kills24 < 30) score += 4;
  else score += 5;

  // 7d activity adds weight, but less than 24h.
  if (kills7d === 0) score += 0;
  else if (kills7d < 10) score += 1;
  else if (kills7d < 30) score += 2;
  else if (kills7d < 70) score += 3;
  else score += 4;

  const level: "low" | "medium" | "high" = score < 4 ? "low" : score < 7 ? "medium" : "high";
  const badge =
    level === "low"
      ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/50"
      : level === "medium"
        ? "bg-amber-500/10 text-amber-200 border-amber-400/60"
        : "bg-rose-500/10 text-rose-200 border-rose-500/70";
  return { level, badge } as const;
}

export function LocalCheckClient() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [sort, setSort] = useState<SortState>({ column: "risk", direction: "desc" });
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const parsedNames = useMemo(() => {
    return Array.from(
      new Set(
        input
          .split(/\n|,/)
          .map((n) => n.trim())
          .filter((n) => n.length > 0),
      ),
    ).slice(0, 500);
  }, [input]);

  const cacheRef = useState<Map<string, LocalRow>>(() => new Map())[0];

  async function fetchSingle(name: string): Promise<LocalRow> {
    const cached = cacheRef.get(name.toLowerCase());
    if (cached) return cached;

    try {
      const controller = abortController ?? new AbortController();
      if (!abortController) setAbortController(controller);

      const res = await fetch("/api/player-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ name }),
      });

      const data = (await res.json()) as PlayerLookupResponse;

      if (!res.ok || !data.ok) {
        const message = !data.ok ? data.error.message : "Lookup failed";
        const status: RowStatus = res.status === 404 ? "not_found" : "error";
        return { name, status, intel: null, message };
      }

      const row: LocalRow = { name: data.data.name, status: "ok", intel: data.data };
      cacheRef.set(name.toLowerCase(), row);
      return row;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { name, status: "error", intel: null, message: "Cancelled" };
      }
      console.error("Local check fetch error", err);
      return { name, status: "error", intel: null, message: "Network error" };
    }
  }

  async function handleAnalyze() {
    if (parsedNames.length === 0) {
      setError("Paste one or more names to analyze.");
      setRows([]);
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setLoading(true);
    setError(null);
    setRows([]);

    const limit = 8;
    const results: LocalRow[] = [];

    for (let i = 0; i < parsedNames.length; i += limit) {
      const batch = parsedNames.slice(i, i + limit);
      const batchRows = await Promise.all(batch.map((name) => fetchSingle(name)));
      results.push(...batchRows);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    setRows(results);
    setLoading(false);
  }

  const summary = useMemo(() => {
    const okRows = rows.filter((r) => r.status === "ok" && r.intel);
    const high = okRows.filter((r) => getRiskMeta(r.intel).level === "high").length;
    const medium = okRows.filter((r) => getRiskMeta(r.intel).level === "medium").length;
    const low = okRows.filter((r) => getRiskMeta(r.intel).level === "low").length;
    return { total: okRows.length, high, medium, low };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const getRiskRank = (row: LocalRow) => {
      if (row.status !== "ok" || !row.intel) return -1;
      const level = getRiskMeta(row.intel).level;
      return level === "high" ? 3 : level === "medium" ? 2 : 1;
    };

    return [...rows].sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const getVal = (row: LocalRow) => {
        const intel = row.intel;
        switch (sort.column) {
          case "name":
            return row.name.toLowerCase();
          case "corp":
            return intel?.corporation?.name?.toLowerCase() ?? "";
          case "sec":
            return intel?.securityStatus ?? -999;
          case "pvp24h":
            return intel?.pvpKillsLast24h ?? -1;
          case "pvp7d":
            return intel?.killsLast7d ?? -1;
          case "risk":
          default:
            return getRiskRank(row);
        }
      };

      const va = getVal(a);
      const vb = getVal(b);

      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * dir;
    });
  }, [rows, sort]);

  function toggleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column, direction: "desc" };
    });
  }

  const sortIndicator = (column: SortColumn) => {
    if (sort.column !== column) return "⇅";
    return sort.direction === "asc" ? "↑" : "↓";
  };

  return (
    <section className="space-y-6 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Local Check
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-2xl">
            Paste the current local list and get a quick threat read: security, PvP heat, and corp/alliance for each pilot using ESI and zKillboard.
          </p>
        </div>
        <Users className="hidden h-8 w-8 text-emerald-400/80 sm:block" />
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Paste local</CardTitle>
          <CardDescription>
            Separate names by newline or comma. Duplicates are ignored. Up to 500 names at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`TND Capsuleer\nSuitonia\nCCP Zoetrope`}
            value={input}
            rows={6}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-[0.85rem] text-zinc-400">
            <span>
              {parsedNames.length} name{parsedNames.length === 1 ? "" : "s"} detected.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={loading || parsedNames.length === 0}
                onClick={handleAnalyze}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing…
                  </span>
                ) : (
                  "Analyze local"
                )}
              </Button>
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not analyze</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Local intel</CardTitle>
              <CardDescription>
                Sorted by risk using security status and PvP kills in the last 24h.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/70 bg-rose-500/10 px-2 py-0.5 text-rose-200">
                <AlertTriangle className="h-3 w-3" /> High {summary.high}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                <Activity className="h-3 w-3" /> Medium {summary.medium}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> Low {summary.low}
              </span>
              <span className="text-zinc-500">Total: {summary.total}</span>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-left text-[0.8rem]">
              <thead className="border-b border-zinc-800 text-zinc-400">
                <tr className="bg-zinc-900/60">
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("name")}>
                    Pilot <span className="text-[0.7rem] text-zinc-500">{sortIndicator("name")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("corp")}>
                    Corp / Alliance <span className="text-[0.7rem] text-zinc-500">{sortIndicator("corp")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("sec")}>
                    Sec <span className="text-[0.7rem] text-zinc-500">{sortIndicator("sec")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("pvp24h")}>
                    PvP 24h <span className="text-[0.7rem] text-zinc-500">{sortIndicator("pvp24h")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("pvp7d")}>
                    PvP 7d <span className="text-[0.7rem] text-zinc-500">{sortIndicator("pvp7d")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium cursor-pointer" onClick={() => toggleSort("risk")}>
                    Risk <span className="text-[0.7rem] text-zinc-500">{sortIndicator("risk")}</span>
                  </th>
                  <th className="px-3 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {sortedRows.map((row) => {
                  const riskMeta = getRiskMeta(row.intel);
                  const intel = row.intel;
                  return (
                    <tr key={row.name} className="hover:bg-zinc-900/50">
                      <td className="px-3 py-2 align-top text-zinc-100">
                        <div className="flex items-center gap-2">
                          {intel?.portraitUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={intel.portraitUrl}
                              alt={intel.name}
                              className="h-10 w-10 rounded-full border border-zinc-800 object-cover"
                            />
                          )}
                          <div>
                            <div className="font-semibold text-zinc-100">{row.name}</div>
                            {row.status !== "ok" && (
                              <div className="text-[0.7rem] text-rose-300">
                                {row.message ?? "Lookup failed"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-300">
                        <div className="space-y-0.5">
                          {intel?.corporation ? (
                            <div className="text-xs text-zinc-200">
                              {intel.corporation.ticker
                                ? `[${intel.corporation.ticker}] `
                                : ""}
                              {intel.corporation.name}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500">—</div>
                          )}
                          {intel?.alliance ? (
                            <div className="text-[0.7rem] text-zinc-500">
                              {intel.alliance.ticker
                                ? `[${intel.alliance.ticker}] `
                                : ""}
                              {intel.alliance.name}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/70 bg-zinc-900/70 px-2 py-0.5 text-[0.75rem] text-zinc-200">
                          <Shield className="h-3 w-3 text-emerald-300" />
                          {intel?.securityStatus !== null && intel?.securityStatus !== undefined
                            ? intel.securityStatus.toFixed(1)
                            : "?"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-100">
                        {intel?.pvpKillsLast24h ?? "?"}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-100">
                        {intel?.killsLast7d ?? "?"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.75rem] ${riskMeta.badge}`}
                        >
                          {riskMeta.level}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-[0.75rem] text-zinc-400">
                        {intel ? (
                          <div className="flex flex-col gap-1">
                            <a
                              href={`https://zkillboard.com/character/${intel.id}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-emerald-200"
                            >
                              zKill
                            </a>
                            <a
                              href={`https://evewho.com/character/${intel.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-emerald-200"
                            >
                              EveWho
                            </a>
                          </div>
                        ) : (
                          <span className="text-rose-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
