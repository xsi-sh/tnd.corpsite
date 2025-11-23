"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Loader2, LineChart, MapPin, SortAsc, SortDesc, Info } from "lucide-react";
import type { MarketLookupResponse } from "@/lib/types/market";
import { getTycoonMarketHistory, getTycoonMarketOrders, getTycoonMarketStats } from "@/lib/clients/tycoon";
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

type ItemSuggestion = { id: number; name: string };
type MarketOrder = {
  order_id: number;
  price: number;
  volume_remain: number;
  volume_total: number;
  region_id: number;
  locationName?: string | null;
};

type HistoryPoint = {
	date: string;
	average: number;
	highest?: number | null;
	lowest?: number | null;
	volume?: number | null;
};

const HUBS = [
  { id: 10000002, name: "The Forge (Jita)" },
  { id: 10000043, name: "Domain (Amarr)" },
  { id: 10000032, name: "Sinq Laison (Dodixie)" },
  { id: 10000042, name: "Metropolis (Hek)" },
  { id: 10000030, name: "Heimatar (Rens)" },
];

async function fetchSuggestions(q: string): Promise<ItemSuggestion[]> {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`/api/market/suggest?q=${encodeURIComponent(q)}`);
    if (res.status === 429) {
      throw Object.assign(new Error("throttled"), { code: 429 });
    }
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItemSuggestion[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

function formatNumber(val: number | null, digits = 0) {
  if (val === null || Number.isNaN(val)) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function MarketBrowserClient() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);
  const [selected, setSelected] = useState<ItemSuggestion | null>(null);
  const [regionAll, setRegionAll] = useState(true);
  const [regionId, setRegionId] = useState<number>(HUBS[0]?.id ?? 10000002);
  const [sellOrders, setSellOrders] = useState<MarketOrder[]>([]);
  const [buyOrders, setBuyOrders] = useState<MarketOrder[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buySort, setBuySort] = useState<{ key: "price" | "volume" | "location"; dir: "asc" | "desc" }>({
    key: "price",
    dir: "desc",
  });
  const [sellSort, setSellSort] = useState<{ key: "price" | "volume" | "location"; dir: "asc" | "desc" }>({
    key: "price",
    dir: "asc",
  });
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [tycoonBestBuy, setTycoonBestBuy] = useState<number | null>(null);
  const [tycoonBestSell, setTycoonBestSell] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchSuggestions(query).then(setSuggestions);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  async function loadMarket(item: ItemSuggestion) {
    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    setSelected(item);
    setLoading(true);
    setError(null);
    setSellOrders([]);
    setBuyOrders([]);
    setHistory([]);
    setTycoonBestBuy(null);
    setTycoonBestSell(null);
    let throttled = false;
    try {
      const regions = regionAll ? HUBS.map((h) => h.id) : [regionId];
      const primaryRegion = regions[0] ?? HUBS[0].id;
      let historyLoaded = false;

      const loadInternalHistory = async () => {
        const res = await fetch("/api/market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ typeId: item.id, regions }),
        });
        const json = (await res.json()) as MarketLookupResponse;
        if (!res.ok || !json.ok) {
          throw new Error(!json.ok ? json.error.message : "Market history lookup failed.");
        }
        setHistory(json.data.history);
      };

      const fallbackToInternal = async () => {
        const res = await fetch("/api/market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ typeId: item.id, regions }),
        });
        const json = (await res.json()) as MarketLookupResponse;
        if (res.status === 429) {
          throttled = true;
          setThrottleNotice("Throttled by market API. Please wait a moment…");
          setError("Rate limited. Please retry shortly.");
          return false;
        }
        if (!res.ok || !json.ok) {
          throw new Error(!json.ok ? json.error.message : "Market lookup failed.");
        }
        setSellOrders(
          json.data.sellOrders.map((o) => ({
            order_id: o.orderId,
            price: o.price,
            volume_remain: o.volumeRemain,
            volume_total: o.volumeTotal,
            region_id: o.regionId,
            locationName: o.locationName ?? "Location",
          })),
        );
        setBuyOrders(
          json.data.buyOrders.map((o) => ({
            order_id: o.orderId,
            price: o.price,
            volume_remain: o.volumeRemain,
            volume_total: o.volumeTotal,
            region_id: o.regionId,
            locationName: o.locationName ?? "Location",
          })),
        );
        if (json.data.history?.length) {
          setHistory(json.data.history);
          historyLoaded = true;
        }
        return true;
      };

      try {
        const tyOrders = await getTycoonMarketOrders(item.id, [primaryRegion], controller.signal);
        const stationNames = tyOrders.stationNames ?? {};
        const structureNames = tyOrders.structureNames ?? {};
        const orders = tyOrders.orders ?? [];
        const nameFor = (id?: number | null) => {
          if (!id) return "Location";
          return stationNames[id] ?? structureNames[id] ?? "Location";
        };

        const sells = orders
          .filter((o) => !o.isBuyOrder)
          .sort((a, b) => a.price - b.price)
          .map((o) => ({
            order_id: o.orderId,
            price: o.price,
            volume_remain: o.volumeRemain,
            volume_total: o.volumeTotal,
            region_id: o.regionId,
            locationName: nameFor(o.locationId),
          }));
        const buys = orders
          .filter((o) => o.isBuyOrder)
          .sort((a, b) => b.price - a.price)
          .map((o) => ({
            order_id: o.orderId,
            price: o.price,
            volume_remain: o.volumeRemain,
            volume_total: o.volumeTotal,
            region_id: o.regionId,
            locationName: nameFor(o.locationId),
          }));

        if (orders.length === 0) {
          setThrottleNotice("Tycoon returned no orders; loading internal data…");
          const ok = await fallbackToInternal();
          if (!ok) return;
        } else {
          setSellOrders(sells);
          setBuyOrders(buys);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        const msg = String(err);
        if (msg.includes("429")) {
          throttled = true;
          setThrottleNotice("Throttled by Tycoon market API. Falling back to internal orders…");
        } else {
          setThrottleNotice("Tycoon market unavailable. Falling back to internal orders…");
        }
        const ok = await fallbackToInternal();
        if (!ok) return;
      }

      try {
        const stats = await getTycoonMarketStats(primaryRegion, item.id, controller.signal);
        const buy = stats.stats?.buy ?? null;
        const sell = stats.stats?.sell ?? null;
        if (buy !== null) setTycoonBestBuy(buy);
        if (sell !== null) setTycoonBestSell(sell);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("Tycoon stats failed", err);
        } else {
          throw err;
        }
      }

      try {
        const tyHistory = await getTycoonMarketHistory(primaryRegion, item.id, controller.signal);
        const mapped = tyHistory.history.map((h) => ({
          date: h.date,
          average: h.average,
          highest: h.highest ?? null,
          lowest: h.lowest ?? null,
          volume: h.volume ?? null,
        }));
        setHistory(mapped);
        if (mapped.length > 0) historyLoaded = true;
        if (mapped.length === 0) {
          await loadInternalHistory();
          historyLoaded = true;
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("Tycoon history failed", err);
          try {
            await loadInternalHistory();
            historyLoaded = true;
          } catch (e) {
            console.warn("Internal history fallback failed", e);
          }
        } else {
          throw err;
        }
      }

      if (!historyLoaded) {
        try {
          await loadInternalHistory();
        } catch (err) {
          console.warn("Final history fallback failed", err);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      console.error(err);
      setError("Failed to load market data.");
      setSellOrders([]);
      setBuyOrders([]);
      setHistory([]);
      setTycoonBestBuy(null);
      setTycoonBestSell(null);
    } finally {
      setLoading(false);
      if (!throttled) {
        setThrottleNotice(null);
      }
    }
  }

  const bestSell = sellOrders[0] ?? null;
  const bestBuy = buyOrders[0] ?? null;

  const sortedBuyOrders = useMemo(() => {
    const dir = buySort.dir === "asc" ? 1 : -1;
    return [...buyOrders].sort((a, b) => {
      const av = buySort.key === "price" ? a.price : buySort.key === "volume" ? a.volume_remain : (a.locationName ?? "").localeCompare(b.locationName ?? "");
      const bv = buySort.key === "price" ? b.price : buySort.key === "volume" ? b.volume_remain : (b.locationName ?? "").localeCompare(a.locationName ?? "");
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [buyOrders, buySort]);

  const sortedSellOrders = useMemo(() => {
    const dir = sellSort.dir === "asc" ? 1 : -1;
    return [...sellOrders].sort((a, b) => {
      const av = sellSort.key === "price" ? a.price : sellSort.key === "volume" ? a.volume_remain : (a.locationName ?? "").localeCompare(b.locationName ?? "");
      const bv = sellSort.key === "price" ? b.price : sellSort.key === "volume" ? b.volume_remain : (b.locationName ?? "").localeCompare(a.locationName ?? "");
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [sellOrders, sellSort]);

  const sortIcon = (active: { key: string; dir: "asc" | "desc" }, key: string) =>
    active.key === key ? active.dir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" /> : null;

  const summary = useMemo(() => {
    const sellVol = sellOrders.reduce((a, b) => a + (b.volume_remain ?? 0), 0);
    const buyVol = buyOrders.reduce((a, b) => a + (b.volume_remain ?? 0), 0);
    const headlineSell = tycoonBestSell ?? bestSell?.price ?? null;
    const headlineBuy = tycoonBestBuy ?? bestBuy?.price ?? null;
    const spread =
      headlineSell && headlineBuy ? ((headlineSell - headlineBuy) / headlineSell) * 100 : null;
    return { sellVol, buyVol, spread };
  }, [sellOrders, buyOrders, bestSell, bestBuy, tycoonBestBuy, tycoonBestSell]);

  const chartHeight = 100;
  const chartExtra = 12;

  const chart = useMemo(() => {
    if (!history.length) {
      return {
        avgLine: "",
        ma7Line: "",
        ma30Line: "",
        ma90Line: "",
        smoothPath: "",
        smoothFillPath: "",
        bars: [] as { x: number; height: number; width: number; opacity: number }[],
        points: [] as { x: number; y: number; price: number; date: string; volume: number | null }[],
        maxVol: 0,
        stats: null as null | {
          last: number;
          min: number;
          max: number;
          ma60: number | null;
          vol7: number | null;
          vol30: number | null;
        },
      };
    }

    const sorted = [...history]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-180); // show last 180 days
    const values = sorted.map((p) => p.average).filter((v) => Number.isFinite(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = sorted.length > 1 ? 100 / (sorted.length - 1) : 0;
    const normalize = (v: number) => chartHeight - ((v - min) / range) * chartHeight;

    const points = sorted.map((p, i) => ({
      x: i * step,
      y: normalize(p.average),
      price: p.average,
      date: p.date,
      volume: p.volume ?? null,
    }));

    const avgLine = points.map((p) => `${p.x},${p.y}`).join(" ");

    const buildSmoothPath = (pts: { x: number; y: number }[]) => {
      if (!pts.length) return "";
      const d: string[] = [`M ${pts[0].x},${pts[0].y}`];
      const s = 0.18; // smoothing factor
      for (let i = 1; i < pts.length; i += 1) {
        const p0 = pts[i - 2] ?? pts[i - 1];
        const p1 = pts[i - 1];
        const p2 = pts[i];
        const p3 = pts[i + 1] ?? pts[i];
        const cp1x = p1.x + (p2.x - p0.x) * s;
        const cp1y = p1.y + (p2.y - p0.y) * s;
        const cp2x = p2.x - (p3.x - p1.x) * s;
        const cp2y = p2.y - (p3.y - p1.y) * s;
        d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
      }
      return d.join(" ");
    };

    const smoothPath = buildSmoothPath(points);
    const smoothFillPath = smoothPath
      ? `${smoothPath} L ${points[points.length - 1]?.x ?? 100},${chartHeight} L 0,${chartHeight} Z`
      : "";

    const movingLine = (window: number) =>
      sorted
        .map((_, i) => {
          const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
          const vals = slice.map((p) => p.average).filter((v) => Number.isFinite(v));
          if (!vals.length) return null;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          return `${i * step},${normalize(avg)}`;
        })
        .filter(Boolean)
        .join(" ");

    const ma7Line = movingLine(7);
    const ma30Line = movingLine(30);
    const ma60Line = movingLine(60);

    const maxVol = Math.max(...sorted.map((p) => p.volume ?? 0), 0);
    const bars =
      maxVol > 0
        ? sorted
            .map((p, i) => {
              const volume = p.volume ?? 0;
              const height = (volume / maxVol) * 32; // slightly taller range
              const width = Math.max(0.6, step * 0.35);
              return {
                x: i * step,
                height,
                width,
                opacity: 0.3 + Math.min(0.4, (volume / maxVol) * 0.6),
              };
            })
            .filter((b) => b.height > 0.25)
        : [];

    const avg = (arr: (number | null | undefined)[], window: number | null) => {
      const slice = window ? arr.slice(-window) : arr;
      const filtered = slice.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
      );
      if (!filtered.length) return null;
      return filtered.reduce((a, b) => a + b, 0) / filtered.length;
    };

    const vols = sorted.map((p) => p.volume ?? null);

    return {
      avgLine,
      smoothPath,
      smoothFillPath,
      ma7Line,
      ma30Line,
      ma60Line,
      bars,
      points,
      maxVol,
      stats: {
        last: sorted[sorted.length - 1]?.average ?? values[values.length - 1] ?? 0,
        min,
        max,
        ma60: avg(values, 60),
        vol7: avg(vols, 7),
        vol30: avg(vols, 30),
      },
    };
  }, [history]);

  return (
    <section className="space-y-4">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Market Browser
        </h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-prose">
          Explore live market orders and price history across the major trade hubs,
          in a layout inspired by the classic market terminal.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Market Browser</CardTitle>
              <CardDescription>Classic layout inspired by the legacy market terminal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Type an item (e.g. Tritanium)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) {
                    e.preventDefault();
                    void loadMarket(suggestions[0]);
                  }
                }}
              />
              {suggestions.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/90 text-sm">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-emerald-500/10"
                      onClick={() => void loadMarket(s)}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="text-[0.7rem] text-zinc-500">ID {s.id}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-[0.85rem]">
                <button
                  type="button"
                  onClick={() => setRegionAll(true)}
                  className={`rounded-md border px-2 py-1 ${regionAll ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100" : "border-zinc-800 bg-zinc-950"}`}
                >
                  All hubs
                </button>
                <select
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1"
                  disabled={regionAll}
                  value={regionId}
                  onChange={(e) => setRegionId(Number(e.target.value))}
                >
                  {HUBS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={() => {
                    const target = selected ?? suggestions[0];
                    if (target) void loadMarket(target);
                  }}
                  disabled={loading || (!selected && !suggestions.length)}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
                </Button>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Lookup failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Snapshot</CardTitle>
              <CardDescription>Best prices and spread.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-emerald-200">
                  <ArrowDownCircle className="h-4 w-4" />
                  Best sell
                </span>
                <span>{bestSell ? `${formatNumber(bestSell.price, 2)} ISK` : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-sky-200">
                  <ArrowUpCircle className="h-4 w-4" />
                  Best buy
                </span>
                <span>{bestBuy ? `${formatNumber(bestBuy.price, 2)} ISK` : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Spread</span>
                <span>{summary.spread !== null && summary.spread !== undefined ? `${summary.spread.toFixed(2)}%` : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-[0.85rem] text-zinc-400">
                <span>Sell volume</span>
                <span>{formatNumber(summary.sellVol, 0)}</span>
              </div>
              <div className="flex items-center justify-between text-[0.85rem] text-zinc-400">
                <span>Buy volume</span>
                <span>{formatNumber(summary.buyVol, 0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="h-4 w-4 text-emerald-300" />
                {selected ? selected.name : "Select an item"}
              </CardTitle>
              <CardDescription>
                {regionAll ? "All hubs aggregated" : HUBS.find((h) => h.id === regionId)?.name ?? "Region"}
              </CardDescription>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[0.8rem] text-zinc-400 hover:text-emerald-200"
              onClick={() => setShowDisclaimer((prev) => !prev)}
            >
              <Info className="h-4 w-4" />
              CCP third-party disclaimer
            </button>
          </CardHeader>
          {showDisclaimer && (
            <div className="mx-4 mb-3 rounded-md border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-[0.75rem] text-zinc-400">
              EVE Online and the EVE logo are the registered trademarks of CCP hf. All
              rights are reserved worldwide. All other trademarks are the property of
              their respective owners. This site uses EVE Online assets and data under
              CCP&apos;s third-party policy, but is not endorsed by or affiliated with CCP hf.
            </div>
          )}
        <CardContent>
          <Tabs defaultValue="buys" className="space-y-4">
            <TabsList className="bg-zinc-900/70">
              <TabsTrigger value="buys">Buy Orders</TabsTrigger>
              <TabsTrigger value="sells">Sell Orders</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="buys">
              <div className="overflow-auto rounded-md border border-zinc-800/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900/60 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setBuySort((prev) =>
                              prev.key === "price"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "price", dir: "desc" },
                            )
                          }
                        >
                          Price {sortIcon(buySort, "price")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setBuySort((prev) =>
                              prev.key === "volume"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "volume", dir: "desc" },
                            )
                          }
                        >
                          Volume {sortIcon(buySort, "volume")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setBuySort((prev) =>
                              prev.key === "location"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "location", dir: "asc" },
                            )
                          }
                        >
                          Location {sortIcon(buySort, "location")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {sortedBuyOrders.map((o) => (
                      <tr key={o.order_id} className="hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-zinc-100">{formatNumber(o.price, 2)} ISK</td>
                        <td className="px-3 py-2 text-zinc-300">{formatNumber(o.volume_remain, 0)}</td>
                        <td className="px-3 py-2 text-zinc-400">
                          <MapPin className="mr-1 inline h-3 w-3 text-emerald-300" />
                          {o.locationName ?? "Location"}
                        </td>
                      </tr>
                    ))}
                    {buyOrders.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-zinc-500" colSpan={3}>
                          No buy orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="sells">
              <div className="overflow-auto rounded-md border border-zinc-800/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900/60 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setSellSort((prev) =>
                              prev.key === "price"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "price", dir: "asc" },
                            )
                          }
                        >
                          Price {sortIcon(sellSort, "price")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setSellSort((prev) =>
                              prev.key === "volume"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "volume", dir: "asc" },
                            )
                          }
                        >
                          Volume {sortIcon(sellSort, "volume")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setSellSort((prev) =>
                              prev.key === "location"
                                ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { key: "location", dir: "asc" },
                            )
                          }
                        >
                          Location {sortIcon(sellSort, "location")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {sortedSellOrders.map((o) => (
                      <tr key={o.order_id} className="hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-zinc-100">{formatNumber(o.price, 2)} ISK</td>
                        <td className="px-3 py-2 text-zinc-300">{formatNumber(o.volume_remain, 0)}</td>
                        <td className="px-3 py-2 text-zinc-400">
                          <MapPin className="mr-1 inline h-3 w-3 text-emerald-300" />
                          {o.locationName ?? "Location"}
                        </td>
                      </tr>
                    ))}
                    {sellOrders.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-zinc-500" colSpan={3}>
                          No sell orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="space-y-3">
                {history.length ? (
                  <>
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-2">
                      <div className="mb-2 flex items-center justify-between text-[0.8rem] text-zinc-400">
                        <span>180d price & volume</span>
                        {chart.stats && (
                          <span className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-emerald-200">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              Last {formatNumber(chart.stats.last, 2)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-amber-200">
                              <span className="h-2 w-2 rounded-full bg-amber-400" />
                              60d MA {chart.stats.ma60 ? formatNumber(chart.stats.ma60, 2) : "—"}
                            </span>
                          </span>
                        )}
                      </div>
                      <svg className="h-48 w-full" viewBox={`0 0 100 ${chartHeight + chartExtra}`} preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="priceFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                          </linearGradient>
                          <pattern id="priceGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#374151" strokeWidth="0.2" opacity="0.3" />
                          </pattern>
                        </defs>
                        <rect x="0" y="0" width="100" height={chartHeight + chartExtra} fill="url(#priceGrid)" />
                        {chart.bars.map((bar, idx) => (
                          <rect
                            key={`vol-${idx}`}
                            x={bar.x - bar.width / 2}
                            y={chartHeight - bar.height}
                            width={bar.width}
                            height={bar.height}
                            fill="#166534"
                            opacity={bar.opacity}
                            rx={0.6}
                          />
                        ))}
                        {chart.ma60Line && (
                          <polyline
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="0.4"
                            points={chart.ma60Line}
                            opacity={0.8}
                          />
                        )}
                        {chart.smoothFillPath && (
                          <path d={chart.smoothFillPath} fill="url(#priceFill)" stroke="none" />
                        )}
                        {chart.smoothPath && (
                          <path
                            d={chart.smoothPath}
                            fill="none"
                            stroke="#34d399"
                            strokeWidth="0.4"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            opacity={0.9}
                          />
                        )}
                      </svg>
                    </div>
                    {chart.stats && (
                      <div className="grid grid-cols-2 gap-2 text-[0.85rem] text-zinc-300 sm:grid-cols-3">
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                          High {formatNumber(chart.stats.max, 2)}
                        </div>
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                          Low {formatNumber(chart.stats.min, 2)}
                        </div>
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                          60d MA {chart.stats.ma60 ? formatNumber(chart.stats.ma60, 2) : "—"}
                        </div>
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                          7d Vol {chart.stats.vol7 ? formatNumber(chart.stats.vol7, 0) : "—"}
                        </div>
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                          30d Vol {chart.stats.vol30 ? formatNumber(chart.stats.vol30, 0) : "—"}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">No history available for this item.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
    </section>
  );
}
