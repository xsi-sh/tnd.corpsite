"use client";

import { useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTycoonMarketStats } from "@/lib/clients/tycoon";
import type { MarketLookupResponse } from "@/lib/types/market";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpDown,
  FileText,
  Loader2,
  Percent,
  Upload,
} from "lucide-react";

type RegionSnapshot = {
  buy: number | null;
  sell: number | null;
  source: "tycoon" | "esi";
};

type Diff = {
  amount: number | null;
  percent: number | null;
};

type CompareRow = {
  name: string;
  quantity: number;
  jita: RegionSnapshot | null;
  amarr: RegionSnapshot | null;
  sellDiff: Diff;
  buyDiff: Diff;
  totalSellDelta: number | null;
  note?: string | null;
};

type SortKey =
  | "name"
  | "quantity"
  | "jitaSell"
  | "jitaBuy"
  | "amarrSell"
  | "amarrBuy"
  | "sellDiff"
  | "buyDiff"
  | "totalSellDelta"
  | "status";

const HUBS = {
  jita: { id: 10000002, name: "The Forge (Jita)" },
  amarr: { id: 10000043, name: "Domain (Amarr)" },
};

const MAX_ITEMS = 500;

async function resolveIds(names: string[]): Promise<Record<string, number>> {
  if (!names.length) return {};
  try {
    const res = await fetch("/api/price-check/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; ids?: Record<string, number> };
      if (data.ok && data.ids) return data.ids;
    }
  } catch {
    // fall through
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(names),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { inventory_types?: { id: number; name: string }[] };
    const map: Record<string, number> = {};
    for (const item of data.inventory_types ?? []) {
      map[item.name.toLowerCase()] = item.id;
    }
    return map;
  } catch {
    return {};
  }
}

function formatNumber(val: number | null, digits = 0) {
  if (val === null || Number.isNaN(val)) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function diff(from: number | null, to: number | null): Diff {
  if (from === null || to === null) return { amount: null, percent: null };
  const amount = to - from;
  const percent = from !== 0 ? (amount / from) * 100 : null;
  return { amount, percent };
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit = 4,
  getDelay?: () => number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const size = Math.max(1, Math.min(limit, tasks.length));
  const results: T[] = Array(tasks.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= tasks.length) break;
      const delay = getDelay?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      results[current] = await tasks[current]!();
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

export function PriceComparisonClient() {
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "totalSellDelta",
    dir: "desc",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceCache = useRef<Map<string, RegionSnapshot>>(new Map());
  const throttleBackoff = useRef(0);

  const parsedLines = useMemo(() => {
    const dedup = new Map<string, { raw: string; name: string; quantity: number }>();
    for (const line of input.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const match = line.match(/^(.*?)(?:\s+x?\s*(\d+))?$/i);
      const name = (match?.[1] ?? line).trim();
      const qty = match?.[2] ? Number(match[2]) : 1;
      const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
      const key = name.toLowerCase();
      if (dedup.has(key)) {
        const existing = dedup.get(key)!;
        dedup.set(key, { ...existing, quantity: existing.quantity + quantity });
      } else {
        dedup.set(key, { raw: line, name, quantity });
      }
      if (dedup.size >= MAX_ITEMS) break;
    }
    return Array.from(dedup.values());
  }, [input]);

  async function fetchRegionPrices(
    regionId: number,
    typeId: number,
    signal: AbortSignal,
  ): Promise<RegionSnapshot> {
    const cacheKey = `${regionId}-${typeId}`;
    const cached = priceCache.current.get(cacheKey);
    if (cached) return cached;

    // Try internal market (ESI-backed) first to reduce external throttling, then fall back to Tycoon.
    try {
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ typeId, regions: [regionId] }),
      });
      if (res.status === 429) {
        setThrottleNotice("Rate limited by market API. Please wait a moment and retry.");
        throttleBackoff.current = Math.min(2000, throttleBackoff.current + 200);
      } else {
        const data = (await res.json()) as MarketLookupResponse;
        if (res.ok && data.ok) {
          const snapshot: RegionSnapshot = {
            sell: data.data.sellOrders[0]?.price ?? null,
            buy: data.data.buyOrders[0]?.price ?? null,
            source: "esi",
          };
          // Only cache if we have some data to avoid locking in empty throttled results.
          if (snapshot.sell !== null || snapshot.buy !== null) {
            priceCache.current.set(cacheKey, snapshot);
          }
          return snapshot;
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.warn("Internal market lookup failed, trying Tycoon", err);
      } else {
        throw err;
      }
    }

    // Back off slightly before hitting Tycoon to avoid 429s when many items are queued.
    await new Promise((resolve) => setTimeout(resolve, 120));
    try {
      const stats = await getTycoonMarketStats(regionId, typeId, signal);
      const snapshot: RegionSnapshot = {
        buy: stats.stats.buy ?? null,
        sell: stats.stats.sell ?? null,
        source: "tycoon",
      };
      if (snapshot.sell !== null || snapshot.buy !== null) {
        priceCache.current.set(cacheKey, snapshot);
      }
      return snapshot;
    } catch (err) {
      if ((err as { code?: number }).code === 429) {
        setThrottleNotice("Throttled by Tycoon. Please wait a moment and retry.");
        throttleBackoff.current = Math.min(2000, throttleBackoff.current + 200);
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      console.warn("Tycoon stats failed", err);
    }

    return {
      sell: null,
      buy: null,
      source: "tycoon",
    };
  }

  async function handleCompare() {
    if (!parsedLines.length) {
      setError("Upload or paste item names first.");
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setError(null);
    setThrottleNotice(null);
    throttleBackoff.current = 0;
    setLoading(true);
    setResults([]);

    try {
      const idMap = await resolveIds(parsedLines.map((p) => p.name));
      const concurrencyLimit = parsedLines.length > 200 ? 8 : 6;
      const rows = await runWithConcurrency(
        parsedLines.map((item) => async () => {
          const id = idMap[item.name.toLowerCase()] ?? null;
          if (!id) {
            return {
              name: item.name,
              quantity: item.quantity,
              jita: null,
              amarr: null,
              sellDiff: { amount: null, percent: null },
              buyDiff: { amount: null, percent: null },
              totalSellDelta: null,
              note: "Not found",
            };
          }

          try {
            const [jita, amarr] = await Promise.all([
              fetchRegionPrices(HUBS.jita.id, id, controller.signal),
              fetchRegionPrices(HUBS.amarr.id, id, controller.signal),
            ]);

            const sellDiff = diff(jita.sell, amarr.sell);
            const buyDiff = diff(jita.buy, amarr.buy);
            const totalSellDelta = sellDiff.amount !== null ? sellDiff.amount * item.quantity : null;

            return {
              name: item.name,
              quantity: item.quantity,
              jita,
              amarr,
              sellDiff,
              buyDiff,
              totalSellDelta,
              note: null,
            };
          } catch (err) {
            if ((err as { code?: number }).code === 429) {
              setThrottleNotice("Rate limited by market API. Please wait a moment and retry.");
            }
            if (err instanceof DOMException && err.name === "AbortError") {
              throw err;
            }
            console.error("Comparison failed", err);
            return {
              name: item.name,
              quantity: item.quantity,
              jita: null,
              amarr: null,
              sellDiff: { amount: null, percent: null },
              buyDiff: { amount: null, percent: null },
              totalSellDelta: null,
              note: "Lookup failed",
            };
          }
        }),
        concurrencyLimit,
        () => {
          const delay = throttleBackoff.current;
          if (delay > 0) {
            throttleBackoff.current = Math.max(0, delay - 100);
          }
          return delay;
        },
      );

      setResults(rows);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Comparison cancelled.");
      } else {
        console.error(err);
        setError("Price comparison failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const resolved = results.filter((r) => !r.note);
    const totalSellDelta = resolved.reduce((acc, r) => acc + (r.totalSellDelta ?? 0), 0);
    const spreadCount = resolved.filter((r) => r.sellDiff.percent !== null).length;
    const avgSpread =
      spreadCount > 0
        ? resolved.reduce((acc, r) => acc + (r.sellDiff.percent ?? 0), 0) / spreadCount
        : null;
    return { totalSellDelta, resolved: resolved.length, total: results.length, avgSpread };
  }, [results]);

  const sortedResults = useMemo(() => {
    const defaultStringDir = "asc";
    const dirMult = sort.dir === "asc" ? 1 : -1;
    const getValue = (row: CompareRow): string | number | null => {
      switch (sort.key) {
        case "name":
          return row.name.toLowerCase();
        case "quantity":
          return row.quantity ?? 0;
        case "jitaSell":
          return row.jita?.sell ?? null;
        case "jitaBuy":
          return row.jita?.buy ?? null;
        case "amarrSell":
          return row.amarr?.sell ?? null;
        case "amarrBuy":
          return row.amarr?.buy ?? null;
        case "sellDiff":
          return row.sellDiff.amount;
        case "buyDiff":
          return row.buyDiff.amount;
        case "totalSellDelta":
          return row.totalSellDelta;
        case "status":
          return (row.note ?? "OK").toLowerCase();
        default:
          return null;
      }
    };

    return [...results].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);

      const aNum = typeof av === "number" ? av : null;
      const bNum = typeof bv === "number" ? bv : null;
      const aStr = typeof av === "string" ? av : null;
      const bStr = typeof bv === "string" ? bv : null;

      if (aNum === null && bNum === null) {
        if (aStr === null && bStr === null) return 0;
        if (aStr === null) return 1;
        if (bStr === null) return -1;
        return aStr.localeCompare(bStr) * (sort.key === "name" || sort.key === "status" ? dirMult : defaultStringDir === "asc" ? 1 : -1);
      }

      if (aNum === null) return 1;
      if (bNum === null) return -1;
      if (aNum === bNum) return 0;
      return aNum > bNum ? dirMult : -dirMult;
    });
  }, [results, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      const defaultDir = key === "name" || key === "status" ? "asc" : "desc";
      return { key, dir: defaultDir };
    });
  };

  return (
    <section className="space-y-5">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-50">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/90">
              Market // Jita → Amarr
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Price Comparison</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
            <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1">
              Max {MAX_ITEMS} items (deduped)
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1">
              Hubs locked to Jita & Amarr
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Drop a .txt list or paste item names to see buy/sell in both hubs, spreads, and ISK delta per stack.
        </p>
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Upload or paste items</CardTitle>
            <CardDescription>One per line. Quantities like &quot;Sabre x3&quot; are supported.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setInput(text);
                setFileName(file.name);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload .txt
            </Button>
            {fileName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-200">
                <FileText className="h-3.5 w-3.5" />
                {fileName}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="min-h-[200px] w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            placeholder="Tritanium&#10;Scourge Heavy Missile x2000&#10;Pithum C-Type Medium Shield Booster&#10;Gila x2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleCompare();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <Button type="button" disabled={loading} onClick={() => void handleCompare()}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Comparing…
                </span>
              ) : (
                "Compare hubs"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setInput("");
                setFileName(null);
                setResults([]);
              }}
              disabled={loading}
            >
              Clear
            </Button>
            <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400">
              {parsedLines.length} items queued
            </span>
            <span className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
              Jita ({HUBS.jita.id}) vs Amarr ({HUBS.amarr.id})
            </span>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Comparison failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1">
                Items compared: {summary.total}
              </span>
              <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                Resolved: {summary.resolved}
              </span>
              <span className="rounded-full border border-sky-500/50 bg-sky-500/10 px-3 py-1">
                Avg sell spread:{" "}
                {summary.avgSpread !== null ? `${summary.avgSpread.toFixed(2)}%` : "—"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.22)]">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-200/90">
                  Total Δ (sell)
                </span>
                <span className="text-sm font-semibold">
                  {formatNumber(summary.totalSellDelta, 2)} ISK
                </span>
              </span>
            </div>
            <div>
              <CardTitle>Spreadsheet view</CardTitle>
              <CardDescription>Per-item buy/sell for Jita and Amarr with spreads and haul delta.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-zinc-800/70 bg-gradient-to-b from-zinc-950/60 to-black/80 p-2 shadow-inner">
              <Table className="[&_th]:bg-zinc-900/60 [&_th]:text-xs [&_th]:text-zinc-400">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px] px-3 py-2">
                      <SortableHead label="Item" column="name" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Qty" column="quantity" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Jita sell" column="jitaSell" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Jita buy" column="jitaBuy" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Amarr sell" column="amarrSell" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Amarr buy" column="amarrBuy" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Sell Δ (Amarr − Jita)" column="sellDiff" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Buy Δ (Amarr − Jita)" column="buyDiff" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Total sell Δ" column="totalSellDelta" sort={sort} onSort={toggleSort} />
                    </TableHead>
                    <TableHead className="px-3 py-2">
                      <SortableHead label="Status" column="status" sort={sort} onSort={toggleSort} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-zinc-900/80">
                  {sortedResults.map((row, idx) => {
                    const status = row.note ? row.note : "OK";
                    return (
                      <TableRow key={`${row.name}-${idx}`}>
                        <TableCell className="px-3 py-2 text-sm text-zinc-100">
                          <div className="flex flex-col">
                            <span>{row.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-zinc-300">{row.quantity}</TableCell>
                        <TableCell className="px-3 py-2 text-zinc-200">
                          {row.jita?.sell !== undefined && row.jita?.sell !== null
                            ? `${formatNumber(row.jita.sell, 2)} ISK`
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-zinc-200">
                          {row.jita?.buy !== undefined && row.jita?.buy !== null
                            ? `${formatNumber(row.jita.buy, 2)} ISK`
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-zinc-200">
                          {row.amarr?.sell !== undefined && row.amarr?.sell !== null
                            ? `${formatNumber(row.amarr.sell, 2)} ISK`
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-zinc-200">
                          {row.amarr?.buy !== undefined && row.amarr?.buy !== null
                            ? `${formatNumber(row.amarr.buy, 2)} ISK`
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <DiffPill diff={row.sellDiff} />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <DiffPill diff={row.buyDiff} />
                        </TableCell>
                        <TableCell className="px-3 py-2 text-zinc-100">
                          {row.totalSellDelta !== null
                            ? `${formatNumber(row.totalSellDelta, 2)} ISK`
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-sm">
                          {status === "OK" ? (
                            <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[0.75rem] text-emerald-100">
                              Ready
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[0.75rem] text-amber-100">
                              {status}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Sell Δ uses Amarr sell minus Jita sell (per unit). Total Δ multiplies by quantity for quick hauling math.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DiffPill({ diff }: { diff: Diff }) {
  if (diff.amount === null) return <span className="text-zinc-500">—</span>;
  const positive = diff.amount > 0;
  const negative = diff.amount < 0;
  const color = positive
    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
    : negative
      ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
      : "border-zinc-700/70 bg-zinc-900/70 text-zinc-200";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${color}`}
    >
      {positive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : negative ? (
        <ArrowDownRight className="h-3.5 w-3.5" />
      ) : (
        <Percent className="h-3.5 w-3.5" />
      )}
      <span>
        {formatNumber(diff.amount, 2)} ISK
        {diff.percent !== null ? ` (${diff.percent.toFixed(2)}%)` : ""}
      </span>
    </span>
  );
}

function SortableHead({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column;
  const dirLabel = active ? (sort.dir === "asc" ? "ASC" : "DESC") : null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left text-xs font-medium text-zinc-300 hover:text-emerald-200 focus:outline-none"
      onClick={() => onSort(column)}
    >
      <span>{label}</span>
      <ArrowUpDown className={`h-3.5 w-3.5 ${active ? "text-emerald-300" : "text-zinc-500"}`} />
      {dirLabel && <span className="text-[0.7rem] text-zinc-500">{dirLabel}</span>}
    </button>
  );
}
