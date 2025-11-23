"use client";

import { useMemo, useState } from "react";
import { Loader2, Percent } from "lucide-react";
import type { MarketLookupResponse } from "@/lib/types/market";
import { getTycoonMarketHistory, getTycoonMarketStats } from "@/lib/clients/tycoon";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ResultRow = {
  name: string;
  bestBuy: number | null;
  bestSell: number | null;
  spread: number | null;
  valuation: number | null;
  quantity: number;
  history: HistorySummary | null;
};

const HUBS = [
  { id: 10000002, name: "The Forge (Jita)" },
  { id: 10000043, name: "Domain (Amarr)" },
  { id: 10000032, name: "Sinq Laison (Dodixie)" },
  { id: 10000042, name: "Metropolis (Hek)" },
  { id: 10000030, name: "Heimatar (Rens)" },
];

async function resolveIds(names: string[]): Promise<Record<string, number>> {
  if (!names.length) return {};
  // Try local + ESI blended resolver
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
    // fall through to ESI
  }

  // Fallback directly to ESI
  // Gate external fallback behind a tiny delay to avoid hammering ESI.
  await new Promise((resolve) => setTimeout(resolve, 400));
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

type HistorySourceRow = {
  date: string;
  average: number;
  volume?: number;
  orderCount?: number | null;
  order_count?: number | null;
};

type HistorySummary = {
  points: number[];
  avg7: number | null;
  avg30: number | null;
  volume7: number | null;
  volume30: number | null;
  orders7: number | null;
  orders30: number | null;
};

function summarizeHistory(
  rows: HistorySourceRow[],
): HistorySummary | null {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.slice(-30);
  const points = last
    .map((row) => row.average)
    .filter((value) => Number.isFinite(value)) as number[];

  if (!points.length) return null;

  const volumes = last.map((row) => row.volume ?? null);
  const orders = last.map((row) => row.orderCount ?? row.order_count ?? null);

  const avg = (values: (number | null | undefined)[]): number | null => {
    const filtered = values.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    if (!filtered.length) return null;
    const sum = filtered.reduce((acc, value) => acc + value, 0);
    return sum / filtered.length;
  };

  const last7Points = points.slice(-7);
  const last7Volumes = volumes.slice(-7);
  const last7Orders = orders.slice(-7);

  return {
    points,
    avg7: avg(last7Points),
    avg30: avg(points),
    volume7: avg(last7Volumes),
    volume30: avg(volumes),
    orders7: avg(last7Orders),
    orders30: avg(orders),
  };
}

export function PriceCheckClient() {
  const [input, setInput] = useState("");
  const [regionId, setRegionId] = useState<number>(HUBS[0]?.id ?? 10000002);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [valuationMode, setValuationMode] = useState<"buy" | "sell" | "blend">("blend");
  const [blendPercent, setBlendPercent] = useState(50);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const parsedLines = useMemo(() => {
    return input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // Support trailing quantities like "Sabre 3" or "Sabre x3"
        const match = line.match(/^(.*?)(?:\s+x?\s*(\d+))?$/i);
        const name = (match?.[1] ?? line).trim();
        const qty = match?.[2] ? Number(match[2]) : 1;
        return { raw: line, name, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 };
      })
      .slice(0, 25);
  }, [input]);

  async function handleCheck() {
    if (!parsedLines.length) {
      setError("Paste some item names first.");
      return;
    }
    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setError(null);
    setLoading(true);
    setResults([]);
    try {
      const idMap = await resolveIds(parsedLines.map((p) => p.name));
      const resolved = parsedLines.map((item) => {
        const id = idMap[item.name.toLowerCase()] ?? null;
        return { raw: item.raw, id, name: id ? item.name : null, quantity: item.quantity };
      });

      const lookups = resolved
        .filter((r) => r.id)
        .map(async (r) => {
          // Primary: internal API
          try {
            const res = await fetch("/api/market", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ typeId: r.id, regions: [regionId] }),
            });
            const data = (await res.json()) as MarketLookupResponse;
            if (res.status === 429) {
              throw Object.assign(new Error("throttled"), { code: 429 });
            }
            if (res.ok && data.ok) {
              const bestSell = data.data.sellOrders[0]?.price ?? null;
              const bestBuy = data.data.buyOrders[0]?.price ?? null;
              const spread =
                bestSell !== null && bestBuy !== null && bestSell > 0 ? ((bestSell - bestBuy) / bestSell) * 100 : null;
              const valuation = computeValuation(bestBuy, bestSell, valuationMode, blendPercent);
              const history = summarizeHistory(data.data.history ?? []);
              return {
                name: r.name ?? r.raw,
                bestBuy,
                bestSell,
                spread,
                valuation,
                quantity: r.quantity,
                history,
              };
            }
          } catch (err) {
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              console.warn("Internal market lookup failed, trying Tycoon", err);
            } else {
              throw err;
            }
          }

          // Fallback: Tycoon market stats + history
          try {
            const [stats, historyResponse] = await Promise.all([
              getTycoonMarketStats(regionId, r.id!, controller.signal),
              getTycoonMarketHistory(regionId, r.id!, controller.signal),
            ]);
            const bestBuy = stats.stats.buy ?? null;
            const bestSell = stats.stats.sell ?? null;
            const spread =
              bestSell !== null && bestBuy !== null && bestSell > 0 ? ((bestSell - bestBuy) / bestSell) * 100 : null;
            const valuation = computeValuation(bestBuy, bestSell, valuationMode, blendPercent);
            const history = summarizeHistory(historyResponse.history ?? []);
            return {
              name: r.name ?? r.raw,
              bestBuy,
              bestSell,
              spread,
              valuation,
              quantity: r.quantity,
              history,
            };
          } catch (err) {
            if ((err as { code?: number }).code === 429) {
              throw Object.assign(new Error("throttled"), { code: 429 });
            }
            console.error("Tycoon market stats failed", err);
            return {
              name: r.raw,
              bestBuy: null,
              bestSell: null,
              spread: null,
              valuation: null,
              quantity: r.quantity,
              history: null,
            };
          }
        });

      const rows = await Promise.all(lookups);
      setResults(rows);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request cancelled");
      } else if ((err as { code?: number }).code === 429) {
        setThrottleNotice("Throttled by market API. Please wait a moment…");
        setError("Rate limited. Please retry shortly.");
      } else {
        console.error(err);
        setError("Price check failed. Try again.");
      }
    } finally {
      setLoading(false);
      setThrottleNotice(null);
    }
  }

  function computeValuation(
    buy: number | null,
    sell: number | null,
    mode: "buy" | "sell" | "blend",
    blend: number,
  ): number | null {
    if (mode === "buy") return buy ?? sell ?? null;
    if (mode === "sell") return sell ?? buy ?? null;
    const weight = Math.min(100, Math.max(0, blend)) / 100;
    if (buy === null && sell === null) return null;
    if (buy === null) return sell;
    if (sell === null) return buy;
    return buy * (1 - weight) + sell * weight;
  }

  function HistoryCell({ history }: { history: HistorySummary | null }) {
    if (!history || !history.points.length) {
      return <span className="text-zinc-500">—</span>;
    }

    const { points, avg7, avg30 } = history;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[0.7rem] text-zinc-400">
          <span>
            7d {avg7 !== null ? `${formatNumber(avg7, 2)} ISK` : "—"}
          </span>
          <span className="text-zinc-600">·</span>
          <span>
            30d {avg30 !== null ? `${formatNumber(avg30, 2)} ISK` : "—"}
          </span>
        </div>
        <div className="flex h-8 items-end gap-[1px]">
          {points.map((value, index) => {
            const height = ((value - min) / range) * 100;
            return (
              <span
                key={index}
                className="w-[3px] rounded-full bg-emerald-400/70"
                style={{ height: `${Math.max(10, height)}%` }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  function LiquidityCell({ history }: { history: HistorySummary | null }) {
    if (!history) {
      return <span className="text-zinc-500">—</span>;
    }

    const volume = history.volume30 ?? history.volume7;
    const orders = history.orders30 ?? history.orders7;

    if (volume == null && orders == null) {
      return <span className="text-zinc-500">—</span>;
    }

    const volValue = volume ?? 0;
    const orderValue = orders ?? 0;

    let label: string;
    let chipClass = "";

    if (orderValue >= 40 || volValue >= 500_000) {
      label = "High liquidity";
      chipClass = "border-emerald-500/60 bg-emerald-500/15 text-emerald-100";
    } else if (orderValue >= 10 || volValue >= 100_000) {
      label = "Medium liquidity";
      chipClass = "border-amber-400/60 bg-amber-500/10 text-amber-100";
    } else {
      label = "Low liquidity";
      chipClass = "border-zinc-700/70 bg-zinc-900/80 text-zinc-300";
    }

    return (
      <div className="flex flex-col gap-1 text-[0.75rem] text-zinc-400">
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${chipClass}`}
        >
          {label}
        </span>
        <span className="text-[0.7rem] text-zinc-500">
          ~{volume != null ? formatNumber(volume, 0) : "?"} vol / ~
          {orders != null ? formatNumber(orders, 1) : "?"} orders per day
        </span>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Price Check</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste a list of items (one per line) and get quick best buy/sell in a hub.
        </p>
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Paste items</CardTitle>
          <CardDescription>Up to 25 lines; resolved via ESI and priced in the selected hub.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[180px] w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            placeholder="Tritanium&#10;Pithum C-Type Medium Shield Booster&#10;1400mm Howitzer Artillery II"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleCheck();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="inline-flex items-center gap-2">
              <span className="text-zinc-400">Hub:</span>
              <select
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1"
                value={regionId}
                onChange={(e) => setRegionId(Number(e.target.value))}
              >
                {HUBS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.9rem] text-zinc-300">
              <span className="text-zinc-400">Valuation:</span>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="valuation"
                  value="buy"
                  checked={valuationMode === "buy"}
                  onChange={() => setValuationMode("buy")}
                />
                Buy
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="valuation"
                  value="sell"
                  checked={valuationMode === "sell"}
                  onChange={() => setValuationMode("sell")}
                />
                Sell
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="valuation"
                  value="blend"
                  checked={valuationMode === "blend"}
                  onChange={() => setValuationMode("blend")}
                />
                Blend
              </label>
            </div>
            {valuationMode === "blend" && (
              <div className="flex items-center gap-2 text-[0.85rem] text-zinc-400">
                <span>Buy</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={blendPercent}
                  onChange={(e) => setBlendPercent(Number(e.target.value))}
                />
                <span>Sell ({blendPercent}% sell weight)</span>
              </div>
            )}
            <Button type="button" onClick={() => void handleCheck()} disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking…
                </span>
              ) : (
                "Check prices"
              )}
            </Button>
            {valuationMode === "blend" && (
              <p className="text-[0.75rem] text-zinc-500">
                Valuation = {100 - blendPercent}% buy + {blendPercent}% sell
              </p>
            )}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Price check failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Prices</CardTitle>
            <CardDescription>Best buy/sell and your chosen valuation in {HUBS.find((h) => h.id === regionId)?.name ?? "hub"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 overflow-auto">
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1">
                Valuation = {valuationMode === "buy" ? "Buy price" : valuationMode === "sell" ? "Sell price" : `${100 - blendPercent}% buy + ${blendPercent}% sell`}
              </span>
              <span className="rounded-md border border-zinc-800/70 bg-zinc-900/70 px-2 py-1">
                Items: {results.length}
              </span>
              <span className="inline-flex items-center gap-3 rounded-full border border-emerald-400/70 bg-emerald-500/15 px-3 py-1.5 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                  Total value
                </span>
                <span className="text-sm font-semibold text-emerald-50">
                  {formatNumber(
                    results.reduce((acc, r) => acc + (r.valuation ?? 0) * (r.quantity ?? 1), 0),
                    2,
                  )}{" "}
                  ISK
                </span>
              </span>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Best sell</th>
                  <th className="px-3 py-2">Best buy</th>
                  <th className="px-3 py-2">Valuation</th>
                  <th className="px-3 py-2">History 7d / 30d</th>
                  <th className="px-3 py-2">Liquidity</th>
                  <th className="px-3 py-2">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {results.map((r) => (
                  <tr key={r.name} className="hover:bg-zinc-900/50">
                    <td className="px-3 py-2 text-zinc-100">
                      {r.name}
                      {r.quantity > 1 && <span className="ml-1 text-xs text-zinc-500">x{r.quantity}</span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {r.bestSell !== null ? `${formatNumber(r.bestSell, 2)} ISK` : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {r.bestBuy !== null ? `${formatNumber(r.bestBuy, 2)} ISK` : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {r.valuation !== null ? `${formatNumber(r.valuation, 2)} ISK` : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <HistoryCell history={r.history} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <LiquidityCell history={r.history} />
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {r.spread !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                            r.spread > 0 ? "border border-emerald-500/50 bg-emerald-500/10 text-emerald-100" : "border border-zinc-700/70 bg-zinc-900/70 text-zinc-200"
                          }`}
                        >
                          <Percent className="h-3 w-3" />
                          {r.spread.toFixed(2)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
