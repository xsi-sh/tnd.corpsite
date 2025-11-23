"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Loader2,
  MapPin,
  Sparkles,
  Percent,
  Copy,
  Download,
  RefreshCw,
  AlertCircle,
  Clock3,
  Info,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketLookupResponse, MarketTypeMeta } from "@/lib/types/market";

type ItemSuggestion = { id: number; name: string };
type MarketOrder = {
  duration: number;
  is_buy_order: boolean;
  issued: string;
  location_id: number;
  min_volume: number;
  order_id: number;
  price: number;
  range: string;
  region_id: number;
  type_id: number;
  volume_remain: number;
  volume_total: number;
  system_id?: number;
  locationName?: string;
};

type HistoryEntry = {
  date: string;
  average: number;
  volume: number;
  highest?: number;
  lowest?: number;
};

type MarketSummary = {
  bestBuy: number | null;
  bestSell: number | null;
  spreadPct: number | null;
  totalSellVolume: number;
  totalBuyVolume: number;
};

const REGIONS = [
  { id: 10000002, name: "The Forge (Jita)" },
  { id: 10000043, name: "Domain (Amarr)" },
  { id: 10000032, name: "Sinq Laison (Dodixie)" },
  { id: 10000042, name: "Metropolis (Hek)" },
  { id: 10000030, name: "Heimatar (Rens)" },
];

async function fetchSuggestions(query: string): Promise<ItemSuggestion[]> {
  if (!query || query.length < 2) return [];
  const res = await fetch(`/api/market/suggest?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ItemSuggestion[] };
  return data.results ?? [];
}

function formatNumber(val: number | null, decimals = 0) {
  if (val === null || Number.isNaN(val)) return "—";
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function MarketClient() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);
  const [selected, setSelected] = useState<ItemSuggestion | null>(null);
  const [regionIds, setRegionIds] = useState<number[]>([REGIONS[0]?.id ?? 10000002]);
  const [sellOrders, setSellOrders] = useState<MarketOrder[]>([]);
  const [buyOrders, setBuyOrders] = useState<MarketOrder[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sellPage, setSellPage] = useState(0);
  const [buyPage, setBuyPage] = useState(0);
  const pageSize = 10;
  const tablePageSize = 15;
  const [sellTablePage, setSellTablePage] = useState(0);
  const [buyTablePage, setBuyTablePage] = useState(0);
  const [typeMeta, setTypeMeta] = useState<MarketTypeMeta | null>(null);
  const [recentItems, setRecentItems] = useState<ItemSuggestion[]>([]);
  const [requestMs, setRequestMs] = useState<number | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [requestInfo, setRequestInfo] = useState<{ item: ItemSuggestion; regions: number[] } | null>(null);
  const [filters, setFilters] = useState({ priceMin: "", priceMax: "", volumeMin: "", station: "" });
  const [sellSort, setSellSort] = useState<{ key: "price" | "volume" | "region" | "location"; dir: "asc" | "desc" }>({
    key: "price",
    dir: "asc",
  });
  const [buySort, setBuySort] = useState<{ key: "price" | "volume" | "region" | "location"; dir: "asc" | "desc" }>({
    key: "price",
    dir: "desc",
  });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [chartRange, setChartRange] = useState<180 | 360>(180);
  const [chartHover, setChartHover] = useState<{
    x: number;
    y: number;
    price: number;
    volume: number | null;
    date: string;
  } | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      void fetchSuggestions(query)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    setSellTablePage(0);
    setBuyTablePage(0);
  }, [filters, sellSort, buySort]);

  async function handleSelect(item: ItemSuggestion, forcedRegions?: number[]) {
    setSelected(item);
    setQuery(item.name);
    setSuggestions([]);
    setSellPage(0);
    setBuyPage(0);
    setSellTablePage(0);
    setBuyTablePage(0);
    setTypeMeta(null);
    setHoverIndex(null);
    setLoading(true);
    setError(null);
    setStatusHint(null);
    setRequestMs(null);
    try {
      const targetRegions = forcedRegions ?? (regionIds.length ? regionIds : [REGIONS[0].id]);
      setRequestInfo({ item, regions: targetRegions });
      const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId: item.id, regions: targetRegions }),
      });
      const data = (await res.json()) as MarketLookupResponse;
      if (!res.ok || !data.ok) {
        const message = !data.ok ? data.error.message : "Market lookup failed.";
        throw new Error(message);
      }

      setSellOrders(
        data.data.sellOrders.map((o) => ({
          order_id: o.orderId,
          price: o.price,
          volume_remain: o.volumeRemain,
          volume_total: o.volumeTotal,
          duration: o.duration ?? 0,
          is_buy_order: o.isBuy,
          region_id: o.regionId,
          location_id: o.locationId,
          locationName: o.locationName ?? "Location",
          min_volume: 0,
          range: "",
          type_id: item.id,
          issued: "",
        })),
      );
      setBuyOrders(
        data.data.buyOrders.map((o) => ({
          order_id: o.orderId,
          price: o.price,
          volume_remain: o.volumeRemain,
          volume_total: o.volumeTotal,
          duration: o.duration ?? 0,
          is_buy_order: o.isBuy,
          region_id: o.regionId,
          location_id: o.locationId,
          locationName: o.locationName ?? "Location",
          min_volume: 0,
          range: "",
          type_id: item.id,
          issued: "",
        })),
      );
      setHistory(data.data.history);
      setLastUpdated(data.data.fetchedAt ?? new Date().toISOString());
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      setRequestMs(Math.round(elapsed));
      if (data.data.sellOrders.length === 0 && data.data.buyOrders.length === 0) {
        setStatusHint("ESI may be slow or empty; showing cached attempt. Retry in a moment.");
      } else {
        setStatusHint(null);
      }
      setTypeMeta(data.data.typeMeta);

      setRecentItems((prev) => {
        const filtered = prev.filter((p) => p.id !== item.id);
        const next = [{ id: item.id, name: item.name }, ...filtered].slice(0, 5);
        return next;
      });
    } catch (err) {
      console.error("Market load error", err);
      setError("Failed to load market data. Try again.");
      setStatusHint("ESI may be throttled. Retry shortly.");
      setSellOrders([]);
      setBuyOrders([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  const bestSell = useMemo(() => {
    if (!sellOrders.length) return null;
    return sellOrders[0];
  }, [sellOrders]);

  const bestBuy = useMemo(() => {
    if (!buyOrders.length) return null;
    return buyOrders[0];
  }, [buyOrders]);

  const historySummary = useMemo(() => {
    if (!history.length) return null;
    const pricesChrono = history.map((h) => h.average);
    const sortedPrices = [...pricesChrono].sort((a, b) => a - b);
    const volumes = history.map((h) => h.volume);
    const avg = pricesChrono.reduce((acc, h) => acc + h, 0) / pricesChrono.length;
    const last = history[history.length - 1];
    const first = history[0];
    const change = first ? ((last.average - first.average) / first.average) * 100 : 0;
    const min = Math.min(...sortedPrices);
    const max = Math.max(...sortedPrices);
    const variance = pricesChrono.reduce((acc, p) => acc + Math.pow(p - avg, 2), 0) / pricesChrono.length;
    const stdDev = Math.sqrt(variance);
    const median =
      sortedPrices.length % 2 === 0
        ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
        : sortedPrices[Math.floor(sortedPrices.length / 2)];
    const avg7 = pricesChrono.slice(-7).reduce((acc, p) => acc + p, 0) / Math.min(7, pricesChrono.length);
    const avg30 = pricesChrono.reduce((acc, p) => acc + p, 0) / pricesChrono.length;
    const sharpe = stdDev > 0 && first ? (avg - first.average) / stdDev : null;
    const avgVolume = volumes.reduce((acc, v) => acc + v, 0) / Math.max(volumes.length, 1);
    const peakVolume = Math.max(...volumes, 0);
    const peakVolumeEntry = history.reduce((top, h) => (top && top.volume > h.volume ? top : h));
    return {
      avg,
      last: last.average,
      change,
      min,
      max,
      stdDev,
      median,
      avg7,
      avg30,
      sharpe,
      avgVolume,
      peakVolume,
      peakVolumeEntry,
      firstDate: first.date,
      lastDate: last.date,
    };
  }, [history]);

  const isStale = useMemo(() => {
    if (!lastUpdated) return false;
    return Date.now() - new Date(lastUpdated).getTime() > 10 * 60 * 1000;
  }, [lastUpdated]);

  const slowRequest = useMemo(() => requestMs !== null && requestMs > 3500, [requestMs]);

  const candles = useMemo(() => {
    if (!history.length) return [];
    return history.map((h, idx) => {
      const open = idx > 0 ? history[idx - 1]?.average ?? h.average : h.average;
      const close = h.average;
      const high = h.highest ?? Math.max(open, close);
      const low = h.lowest ?? Math.min(open, close);
      return { date: h.date, open, close, high, low, volume: h.volume };
    });
  }, [history]);

  const priceExtents = useMemo(() => {
    if (!candles.length) return { min: 0, max: 1 };
    const min = Math.min(...candles.map((c) => c.low));
    const max = Math.max(...candles.map((c) => c.high));
    return { min, max: max === min ? max + 1 : max };
  }, [candles]);

  const chartHeight = 100;
  const chartExtra = 12;

  const historyChart = useMemo(() => {
    if (!history.length) {
      return {
        path: "",
        fillPath: "",
        ma60: "",
        bars: [] as { x: number; height: number; width: number; opacity: number }[],
        points: [] as { x: number; y: number; price: number; volume: number | null; date: string }[],
        stats: null as null | { min: number; max: number; last: number; volMax: number },
      };
    }
    const sorted = [...history]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-chartRange);
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
      volume: p.volume ?? null,
      date: p.date,
    }));

    const buildSmoothPath = (pts: { x: number; y: number }[]) => {
      if (!pts.length) return "";
      const d: string[] = [`M ${pts[0].x},${pts[0].y}`];
      const s = 0.18;
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

    const path = buildSmoothPath(points);
    const fillPath = path
      ? `${path} L ${points[points.length - 1]?.x ?? 100},${chartHeight} L 0,${chartHeight} Z`
      : "";

    const ma60 = points
      .map((_, i) => {
        const slice = points.slice(Math.max(0, i - 59), i + 1);
        const vals = slice.map((p) => p.price).filter((v) => Number.isFinite(v));
        if (!vals.length) return null;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const y = normalize(avg);
        return `${points[i].x},${y}`;
      })
      .filter(Boolean)
      .join(" ");

    const volMax = Math.max(...sorted.map((p) => p.volume ?? 0), 0);
    const bars =
      volMax > 0
        ? sorted
            .map((p, i) => {
              const height = ((p.volume ?? 0) / volMax) * 32;
              return {
                x: i * step,
                height,
                width: Math.max(0.6, step * 0.35),
                opacity: 0.3 + Math.min(0.4, ((p.volume ?? 0) / volMax) * 0.6),
              };
            })
            .filter((b) => b.height > 0.25)
        : [];

    return {
      path,
      fillPath,
      ma60,
      bars,
      points,
      stats: { min, max, last: values[values.length - 1] ?? 0, volMax },
    };
  }, [history, chartRange]);

  const sellPaged = useMemo(() => {
    const start = sellPage * pageSize;
    return sellOrders.slice(start, start + pageSize);
  }, [sellOrders, sellPage]);

  const buyPaged = useMemo(() => {
    const start = buyPage * pageSize;
    return buyOrders.slice(start, start + pageSize);
  }, [buyOrders, buyPage]);

  const filteredSellOrders = useMemo(() => {
    const priceMin = filters.priceMin ? Number(filters.priceMin) : null;
    const priceMax = filters.priceMax ? Number(filters.priceMax) : null;
    const volumeMin = filters.volumeMin ? Number(filters.volumeMin) : null;
    const stationTerm = filters.station.trim().toLowerCase();
    const filtered = sellOrders.filter((o) => {
      if (priceMin !== null && o.price < priceMin) return false;
      if (priceMax !== null && o.price > priceMax) return false;
      if (volumeMin !== null && o.volume_remain < volumeMin) return false;
      if (stationTerm && !(o.locationName ?? "").toLowerCase().includes(stationTerm)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const dir = sellSort.dir === "asc" ? 1 : -1;
      const getVal = (o: MarketOrder) => {
        switch (sellSort.key) {
          case "volume":
            return o.volume_remain;
          case "region":
            return o.region_id;
          case "location":
            return (o.locationName ?? "").toLowerCase();
          default:
            return o.price;
        }
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [sellOrders, filters, sellSort]);

  const filteredBuyOrders = useMemo(() => {
    const priceMin = filters.priceMin ? Number(filters.priceMin) : null;
    const priceMax = filters.priceMax ? Number(filters.priceMax) : null;
    const volumeMin = filters.volumeMin ? Number(filters.volumeMin) : null;
    const stationTerm = filters.station.trim().toLowerCase();
    const filtered = buyOrders.filter((o) => {
      if (priceMin !== null && o.price < priceMin) return false;
      if (priceMax !== null && o.price > priceMax) return false;
      if (volumeMin !== null && o.volume_remain < volumeMin) return false;
      if (stationTerm && !(o.locationName ?? "").toLowerCase().includes(stationTerm)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const dir = buySort.dir === "asc" ? 1 : -1;
      const getVal = (o: MarketOrder) => {
        switch (buySort.key) {
          case "volume":
            return o.volume_remain;
          case "region":
            return o.region_id;
          case "location":
            return (o.locationName ?? "").toLowerCase();
          default:
            return o.price;
        }
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [buyOrders, filters, buySort]);

  const sellTablePageData = useMemo(() => {
    const start = sellTablePage * tablePageSize;
    return filteredSellOrders.slice(start, start + tablePageSize);
  }, [filteredSellOrders, sellTablePage, tablePageSize]);
  const buyTablePageData = useMemo(() => {
    const start = buyTablePage * tablePageSize;
    return filteredBuyOrders.slice(start, start + tablePageSize);
  }, [filteredBuyOrders, buyTablePage, tablePageSize]);

  const marketSummary: MarketSummary = useMemo(() => {
    const bestSellPrice = sellOrders.length ? sellOrders[0].price : null;
    const bestBuyPrice = buyOrders.length ? buyOrders[0].price : null;
    const spreadPct =
      bestSellPrice !== null && bestBuyPrice !== null && bestSellPrice > 0
        ? ((bestSellPrice - bestBuyPrice) / bestSellPrice) * 100
        : null;
    const totalSellVolume = sellOrders.reduce((acc, o) => acc + (o.volume_remain ?? 0), 0);
    const totalBuyVolume = buyOrders.reduce((acc, o) => acc + (o.volume_remain ?? 0), 0);
    return {
      bestBuy: bestBuyPrice,
      bestSell: bestSellPrice,
      spreadPct,
      totalSellVolume,
      totalBuyVolume,
    };
  }, [sellOrders, buyOrders]);

  const regionBreakdown = useMemo(() => {
    const byRegion = new Map<
      number,
      { name: string; bestSell: number | null; bestBuy: number | null; vwap: number | null; volume: number }
    >();
    const ensure = (regionId: number) => {
      if (!byRegion.has(regionId)) {
        const name = REGIONS.find((r) => r.id === regionId)?.name ?? `Region ${regionId}`;
        byRegion.set(regionId, { name, bestSell: null, bestBuy: null, vwap: null, volume: 0 });
      }
      return byRegion.get(regionId)!;
    };
    for (const o of sellOrders) {
      const r = ensure(o.region_id);
      if (r.bestSell === null || o.price < r.bestSell) r.bestSell = o.price;
      r.vwap = r.vwap === null ? o.price * o.volume_remain : r.vwap + o.price * o.volume_remain;
      r.volume += o.volume_remain;
    }
    for (const o of buyOrders) {
      const r = ensure(o.region_id);
      if (r.bestBuy === null || o.price > r.bestBuy) r.bestBuy = o.price;
      r.vwap = r.vwap === null ? o.price * o.volume_remain : r.vwap + o.price * o.volume_remain;
      r.volume += o.volume_remain;
    }
    return Array.from(byRegion.values())
      .map((r) => ({
        ...r,
        vwap: r.vwap !== null && r.volume > 0 ? r.vwap / r.volume : null,
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [sellOrders, buyOrders]);

  const liquidityLeaders = useMemo(() => {
    return [...regionBreakdown].sort((a, b) => b.volume - a.volume).slice(0, 3);
  }, [regionBreakdown]);

  const arbitrageCallouts = useMemo(() => {
    const primarySell = marketSummary.bestSell;
    if (primarySell === null) return [];
    return regionBreakdown
      .map((r) => ({
        name: r.name,
        arb: r.bestBuy !== null ? primarySell - r.bestBuy : null,
        volume: r.volume,
      }))
      .filter((r) => r.arb !== null)
      .sort((a, b) => (b.arb ?? 0) - (a.arb ?? 0))
      .slice(0, 3);
  }, [regionBreakdown, marketSummary.bestSell]);

  const depthBands = useMemo(() => {
    if (!sellOrders.length && !buyOrders.length) return { sells: [], buys: [] };
    const mid =
      bestSell && bestBuy ? (bestSell.price + bestBuy.price) / 2 : bestSell?.price ?? bestBuy?.price ?? 0;
    const bucketSize = mid * 0.005 || 1;
    const bucketMap = (orders: MarketOrder[], isBuy: boolean) => {
      const map = new Map<number, { price: number; volume: number }>();
      for (const o of orders.slice(0, 50)) {
        const bucket = Math.floor(o.price / bucketSize);
        const current = map.get(bucket) ?? { price: o.price, volume: 0 };
        map.set(bucket, { price: o.price, volume: current.volume + o.volume_remain });
      }
      return Array.from(map.values()).sort((a, b) => (isBuy ? b.price - a.price : a.price - b.price));
    };
    return { sells: bucketMap(sellOrders, false), buys: bucketMap(buyOrders, true) };
  }, [sellOrders, buyOrders, bestSell, bestBuy]);

  function copyOrdersToClipboard(orders: MarketOrder[]) {
    const lines = orders
      .slice(0, 10)
      .map((o) => `${formatNumber(o.price, 2)} ISK | ${formatNumber(o.volume_remain)} | ${o.locationName ?? "Location"}`);
    void navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }

  function exportCsv(orders: MarketOrder[]) {
    const header = "price,volume_remain,volume_total,region,location";
    const rows = orders.map(
      (o) =>
        `${o.price},${o.volume_remain},${o.volume_total},${REGIONS.find((r) => r.id === o.region_id)?.name ?? o.region_id},${o.locationName ?? ""}`,
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected?.name ?? "orders"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleSellSort = useCallback(
    (key: "price" | "volume" | "region" | "location") => {
      setSellSort((prev) =>
        prev.key === key ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "price" ? "asc" : "desc" },
      );
    },
    [],
  );

  const handleBuySort = useCallback(
    (key: "price" | "volume" | "region" | "location") => {
      setBuySort((prev) =>
        prev.key === key ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "price" ? "desc" : "asc" },
      );
    },
    [],
  );

  const sortIndicator = (active: { key: string; dir: "asc" | "desc" }, key: string) => {
    if (active.key !== key) return "↕";
    return active.dir === "asc" ? "↑" : "↓";
  };

  return (
    <section className="space-y-6 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Asset Analysis
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-3xl">
            Search any inventory type, pick one or multiple regions, and compare buy/sell orders with a 60-day price pulse.
          </p>
          {recentItems.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
              <span className="text-zinc-500">Recent:</span>
              {recentItems.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void handleSelect(r)}
                  className="rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-0.5 hover:border-emerald-400 hover:text-emerald-100"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
            <span className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-emerald-100">
              {regionIds.length} region{regionIds.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1">
              Orders: {sellOrders.length + buyOrders.length}
            </span>
          </div>
        )}
        {(statusHint || requestMs !== null || isStale) && (
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
            {requestMs !== null && (
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">
                <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
                {requestMs} ms
              </span>
            )}
            {slowRequest && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                <AlertCircle className="h-3.5 w-3.5" />
                ESI slow
              </span>
            )}
            {isStale && (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-rose-100">
                Stale (&gt;10m)
              </span>
            )}
            {statusHint && <span className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">{statusHint}</span>}
            {requestInfo && (
              <button
                type="button"
                onClick={() => void handleSelect(requestInfo.item, requestInfo.regions)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5 text-emerald-200 hover:border-emerald-500/60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Find an item</CardTitle>
          <CardDescription>Suggestions combine local cache and live ESI search.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] sm:items-center">
            <div className="relative">
              <Input
                placeholder="e.g. 1400mm Howitzer Artillery II"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) {
                    e.preventDefault();
                    void handleSelect(suggestions[0]);
                  }
                }}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/95 text-sm shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                      onClick={() => void handleSelect(s)}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-2 text-[0.7rem] text-zinc-500">ID {s.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {query.length >= 2 && suggestions.length === 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-sm text-zinc-500 shadow-lg">
                  No matches found.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[0.75rem]">
              <button
                type="button"
                onClick={() => setRegionIds(REGIONS.map((r) => r.id))}
                className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100"
              >
                All hubs
              </button>
              {REGIONS.map((r) => {
                const active = regionIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRegionIds((prev) => {
                        const exists = prev.includes(r.id);
                        if (exists) return prev.filter((id) => id !== r.id);
                        return [...prev, r.id];
                      });
                    }}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                        : "border-zinc-700/70 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              disabled={!suggestions.length && !selected}
              onClick={() => {
                const target = selected ?? suggestions[0];
                if (target) void handleSelect(target);
              }}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </span>
              ) : (
                "Load market"
              )}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Market lookup failed</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                {error}
                {requestInfo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleSelect(requestInfo.item, requestInfo.regions)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="grid gap-3 rounded-lg border border-zinc-800/70 bg-zinc-950/70 p-4 text-sm text-zinc-500 shadow-inner animate-pulse lg:grid-cols-2">
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-zinc-800/70" />
            <div className="h-3 w-full rounded bg-zinc-900/70" />
            <div className="h-3 w-5/6 rounded bg-zinc-900/70" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-zinc-800/70" />
            <div className="h-3 w-full rounded bg-zinc-900/70" />
            <div className="h-3 w-2/3 rounded bg-zinc-900/70" />
          </div>
          <div className="h-24 rounded bg-zinc-900/70 lg:col-span-2" />
        </div>
      )}

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="bg-zinc-900/70">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="history">History & volume</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4">
          <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg text-zinc-50">{selected.name}</CardTitle>
                <CardDescription>
                  Regions:{" "}
                  {regionIds
                    .map((id) => REGIONS.find((r) => r.id === id)?.name ?? id)
                    .join(", ")}
                </CardDescription>
                {typeMeta && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
                    {typeMeta.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={typeMeta.image}
                        alt={typeMeta.name}
                        className="h-8 w-8 rounded-md border border-zinc-800 bg-zinc-950 object-cover"
                      />
                    )}
                    {typeMeta.group && <span>Group: {typeMeta.group}</span>}
                    {typeMeta.volume !== undefined && typeMeta.volume !== null && (
                      <span>Volume: {formatNumber(typeMeta.volume, 2)} m³</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-zinc-400">
                {bestSell && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                    <ArrowDownCircle className="h-4 w-4" />
                    Sell {formatNumber(bestSell.price, 2)} ISK
                  </span>
                )}
                {bestBuy && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 text-sky-200">
                    <ArrowUpCircle className="h-4 w-4" />
                    Buy {formatNumber(bestBuy.price, 2)} ISK
                  </span>
                )}
                {marketSummary.spreadPct !== null && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                    <Percent className="h-4 w-4" />
                    Spread {marketSummary.spreadPct.toFixed(2)}%
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                <p className="text-[0.75rem] text-zinc-400">Top sell orders</p>
                <div className="flex items-center gap-2 text-[0.7rem] text-zinc-500">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => copyOrdersToClipboard(sellOrders)}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copy top 10
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => exportCsv(sellOrders)}
                  >
                    <Download className="mr-1 h-3 w-3" /> CSV
                  </Button>
                </div>
                <div className="space-y-2">
                  {sellPaged.map((o) => (
                    <div
                      key={o.order_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/70 bg-zinc-950/70 px-2 py-2 text-[0.85rem]"
                    >
                      <div className="space-y-0.5">
                        <span className="block text-zinc-100">
                          {formatNumber(o.price, 2)} ISK
                        </span>
                        <span className="text-[0.7rem] text-zinc-500">
                          {formatNumber(o.volume_remain)} / {formatNumber(o.volume_total)}
                        </span>
                      </div>
                      <div className="text-[0.7rem] text-zinc-400">
                        <MapPin className="mr-1 inline h-3 w-3 text-emerald-300" />
                        {o.locationName ?? "Location"} · {REGIONS.find((r) => r.id === o.region_id)?.name ?? "Region"}
                      </div>
                    </div>
                  ))}
                  {sellOrders.length === 0 && (
                    <p className="text-[0.8rem] text-zinc-500">No sell orders found.</p>
                  )}
                  {sellOrders.length > pageSize && (
                    <div className="flex items-center justify-end gap-2 text-[0.75rem] text-zinc-400">
                      <button
                        type="button"
                        onClick={() => setSellPage((p) => Math.max(0, p - 1))}
                        disabled={sellPage === 0}
                        className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span>
                        Page {sellPage + 1} / {Math.ceil(sellOrders.length / pageSize)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSellPage((p) =>
                            Math.min(Math.ceil(sellOrders.length / pageSize) - 1, p + 1),
                          )
                        }
                        disabled={(sellPage + 1) * pageSize >= sellOrders.length}
                        className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                <p className="text-[0.75rem] text-zinc-400">Top buy orders</p>
                <div className="flex items-center gap-2 text-[0.7rem] text-zinc-500">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => copyOrdersToClipboard(buyOrders)}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copy top 10
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => exportCsv(buyOrders)}
                  >
                    <Download className="mr-1 h-3 w-3" /> CSV
                  </Button>
                </div>
                <div className="space-y-2">
                  {buyPaged.map((o) => (
                    <div
                      key={o.order_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/70 bg-zinc-950/70 px-2 py-2 text-[0.85rem]"
                    >
                      <div className="space-y-0.5">
                        <span className="block text-zinc-100">
                          {formatNumber(o.price, 2)} ISK
                        </span>
                        <span className="text-[0.7rem] text-zinc-500">
                          {formatNumber(o.volume_remain)} / {formatNumber(o.volume_total)}
                        </span>
                      </div>
                      <div className="text-[0.7rem] text-zinc-400">
                        <MapPin className="mr-1 inline h-3 w-3 text-emerald-300" />
                        {o.locationName ?? "Location"} · {REGIONS.find((r) => r.id === o.region_id)?.name ?? "Region"}
                      </div>
                    </div>
                  ))}
                  {buyOrders.length === 0 && (
                    <p className="text-[0.8rem] text-zinc-500">No buy orders found.</p>
                  )}
                  {buyOrders.length > pageSize && (
                    <div className="flex items-center justify-end gap-2 text-[0.75rem] text-zinc-400">
                      <button
                        type="button"
                        onClick={() => setBuyPage((p) => Math.max(0, p - 1))}
                        disabled={buyPage === 0}
                        className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span>
                        Page {buyPage + 1} / {Math.ceil(buyOrders.length / pageSize)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setBuyPage((p) =>
                            Math.min(Math.ceil(buyOrders.length / pageSize) - 1, p + 1),
                          )
                        }
                        disabled={(buyPage + 1) * pageSize >= buyOrders.length}
                        className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-300" />
                  Price pulse
                </CardTitle>
                <CardDescription>Line + volume with range toggle (180d default).</CardDescription>
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/70 px-1">
                {[180, 360].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setChartRange(d as 180 | 360)}
                    className={`px-2 py-1 text-[0.75rem] ${chartRange === d ? "bg-emerald-500/10 text-emerald-200" : "text-zinc-400"}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <div className="relative">
                  <svg
                    className="h-64 w-full"
                    viewBox={`0 0 100 ${chartHeight + chartExtra}`}
                    preserveAspectRatio="none"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const nearest = historyChart.points.reduce<{ d: number; p: typeof historyChart.points[number] | null }>(
                        (acc, p) => {
                          const d = Math.abs(p.x - x);
                          if (acc.p === null || d < acc.d) return { d, p };
                          return acc;
                        },
                        { d: Infinity, p: null },
                      );
                      if (nearest.p) {
                        setChartHover({
                          x: nearest.p.x,
                          y: nearest.p.y,
                          price: nearest.p.price,
                          volume: nearest.p.volume,
                          date: nearest.p.date,
                        });
                      }
                    }}
                    onMouseLeave={() => setChartHover(null)}
                  >
                    <defs>
                      <linearGradient id="assetPriceFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                      </linearGradient>
                      <pattern id="assetGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#374151" strokeWidth="0.2" opacity="0.25" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width="100" height={chartHeight + chartExtra} fill="url(#assetGrid)" />
                    {historyChart.bars.map((bar, idx) => (
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
                    {historyChart.ma60 && (
                      <polyline
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="0.5"
                        points={historyChart.ma60}
                        opacity={0.7}
                      />
                    )}
                    {historyChart.fillPath && <path d={historyChart.fillPath} fill="url(#assetPriceFill)" stroke="none" />}
                    {historyChart.path && (
                      <path
                        d={historyChart.path}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="0.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    )}
                    {chartHover && (
                      <>
                        <line
                          x1={chartHover.x}
                          x2={chartHover.x}
                          y1={0}
                          y2={chartHeight}
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth="0.4"
                        />
                        <circle cx={chartHover.x} cy={chartHover.y} r={1.2} fill="#34d399" stroke="#0f172a" strokeWidth="0.4" />
                      </>
                    )}
                  </svg>
                  {chartHover && (
                    <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-emerald-500/40 bg-black/80 px-2 py-1 text-[0.8rem] text-slate-100 shadow">
                      <div className="font-semibold">{formatNumber(chartHover.price, 2)} ISK</div>
                      <div className="text-[0.7rem] text-slate-400">{chartHover.date}</div>
                      <div className="text-[0.7rem] text-slate-400">
                        {chartHover.volume ? `${formatNumber(chartHover.volume, 0)} volume` : "—"}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between text-[0.75rem] text-zinc-500">
                    <span>High {historyChart.stats ? formatNumber(historyChart.stats.max, 2) : "—"}</span>
                    <span>Low {historyChart.stats ? formatNumber(historyChart.stats.min, 2) : "—"}</span>
                    <span>Last {historyChart.stats ? formatNumber(historyChart.stats.last, 2) : "—"}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Load an item to view its price pulse.</p>
              )}
            </CardContent>
          </Card>
          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-300" />
                60-day pulse
              </CardTitle>
              <CardDescription>
                Average price & volume in primary region.
                {lastUpdated && (
                  <span className="ml-2 text-[0.7rem] text-zinc-500">
                    Last updated {new Date(lastUpdated).toLocaleString()}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {historySummary ? (
                <>
                  <div className="grid gap-2 text-[0.82rem] text-zinc-300 sm:grid-cols-3">
                    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1">
                      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-emerald-200">
                        Avg / last
                      </p>
                      <p>
                        {formatNumber(historySummary.avg, 2)} / {formatNumber(historySummary.last, 2)} ISK
                      </p>
                    </div>
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1">
                      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-zinc-400">
                        Range
                      </p>
                      <p>
                        High {formatNumber(historySummary.max, 2)} · Low {formatNumber(historySummary.min, 2)}
                      </p>
                    </div>
                    <div
                      className={`rounded-md border px-2 py-1 ${
                        historySummary.change >= 0
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                          : "border-rose-500/60 bg-rose-500/10 text-rose-100"
                      }`}
                    >
                      <p className="text-[0.7rem] uppercase tracking-[0.16em]">Change</p>
                      <p>
                        {historySummary.change >= 0 ? "+" : ""}
                        {historySummary.change.toFixed(2)}% over period
                      </p>
                    </div>
                    <div className="rounded-md border border-sky-500/50 bg-sky-500/10 px-2 py-1">
                      <p
                        className="text-[0.7rem] uppercase tracking-[0.16em] text-sky-100"
                        title="Standard deviation of average price across the window"
                      >
                        Volatility
                      </p>
                      <p>{historySummary.stdDev.toFixed(2)}</p>
                    </div>
                    <div className="rounded-md border border-amber-400/60 bg-amber-500/10 px-2 py-1">
                      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-amber-100">
                        Avg volume
                      </p>
                      <p>{formatNumber(historySummary.avgVolume, 0)}</p>
                    </div>
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1">
                      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-zinc-400">
                        Peak volume
                      </p>
                      <p>
                        {formatNumber(historySummary.peakVolume, 0)} on {historySummary.peakVolumeEntry?.date ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1">
                      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-zinc-400">
                        Median / 7d / 30d
                      </p>
                      <p>
                        {formatNumber(historySummary.median, 2)} / {formatNumber(historySummary.avg7, 2)} /{" "}
                        {formatNumber(historySummary.avg30, 2)}
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1">
                      <p
                        className="text-[0.7rem] uppercase tracking-[0.16em] text-emerald-100"
                        title="(Average - first) divided by volatility; quick risk/reward feel"
                      >
                        Sharpe-ish
                      </p>
                      <p>{historySummary.sharpe !== null ? historySummary.sharpe.toFixed(2) : "—"}</p>
                    </div>
                  </div>

                  <div
                    className="relative h-72 overflow-visible rounded-lg border border-zinc-800/80 bg-[#0b0b10]"
                    onMouseLeave={() => {
                      setHoverIndex(null);
                      setHoverX(null);
                    }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.08),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.08),transparent_45%)]" />
                    <svg
                      className="h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      onMouseMove={(e) => {
                        if (!candles.length) return;
                        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const pct = Math.min(1, Math.max(0, x / rect.width));
                        const idx = Math.round(pct * Math.max(0, candles.length - 1));
                        setHoverIndex(idx);
                        setHoverX(pct * 100);
                      }}
                      onMouseLeave={() => {
                        setHoverIndex(null);
                        setHoverX(null);
                      }}
                    >
                      <defs>
                        <linearGradient id="volumeGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(56,189,248,0.9)" />
                          <stop offset="100%" stopColor="rgba(56,189,248,0.1)" />
                        </linearGradient>
                        <pattern id="gridDense" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />
                        </pattern>
                      </defs>
                      <rect width="100" height="100" fill="url(#gridDense)" />
                      <g>
                        {candles.map((c, idx) => {
                          const barWidth = 100 / Math.max(candles.length, 1);
                          const volumeMax = historySummary?.peakVolume || 1;
                          const volHeight = Math.max(2, (c.volume / volumeMax) * 25);
                          const x = idx * barWidth;
                          const y = 100 - volHeight;
                          return (
                            <rect
                              key={`${c.date}-vol`}
                              x={x + barWidth * 0.1}
                              y={y}
                              width={barWidth * 0.8}
                              height={volHeight}
                              fill="url(#volumeGradient)"
                              opacity={0.9}
                            />
                          );
                        })}
                      </g>
                      <g>
                        {candles.map((c, idx) => {
                          const barWidth = 100 / Math.max(candles.length, 1);
                          const xCenter = idx * barWidth + barWidth / 2;
                          const scaleY = (price: number) =>
                            100 - ((price - priceExtents.min) / (priceExtents.max - priceExtents.min || 1)) * 100;
                          const yHigh = scaleY(c.high);
                          const yLow = scaleY(c.low);
                          const yOpen = scaleY(c.open);
                          const yClose = scaleY(c.close);
                          const up = c.close >= c.open;
                          const bodyTop = up ? yClose : yOpen;
                          const bodyHeight = Math.max(1.2, Math.abs(yClose - yOpen));
                          const color = up ? "#22c55e" : "#f43f5e";
                          return (
                            <g key={c.date}>
                              <line x1={xCenter} x2={xCenter} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.7} />
                              <rect
                                x={xCenter - (barWidth * 0.35)}
                                y={bodyTop}
                                width={barWidth * 0.7}
                                height={bodyHeight}
                                fill={color}
                                opacity={0.85}
                              />
                            </g>
                          );
                        })}
                      </g>
                      {hoverIndex !== null && candles[hoverIndex] && (
                        <>
                          <line
                            x1={(hoverIndex / Math.max(1, candles.length - 1)) * 100}
                            x2={(hoverIndex / Math.max(1, candles.length - 1)) * 100}
                            y1={0}
                            y2={100}
                            stroke="rgba(255,255,255,0.4)"
                            strokeDasharray="2 2"
                          />
                        </>
                      )}
                    </svg>
                    {hoverIndex !== null && candles[hoverIndex] && (
                      <div
                        className="pointer-events-none absolute top-2 rounded-md border border-zinc-800/80 bg-black/90 px-2 py-1 text-[0.75rem] text-zinc-200 shadow-lg"
                        style={{
                          left: `${Math.min(92, Math.max(8, hoverX ?? 0))}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        <div className="flex items-center gap-2 text-emerald-200">
                          <span>O</span>
                          <span>{formatNumber(candles[hoverIndex].open, 2)} ISK</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-200">
                          <span>C</span>
                          <span>{formatNumber(candles[hoverIndex].close, 2)} ISK</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-200">
                          <span>H/L</span>
                          <span>
                            {formatNumber(candles[hoverIndex].high, 2)} / {formatNumber(candles[hoverIndex].low, 2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sky-200">
                          <span>Vol</span>
                          <span>{formatNumber(candles[hoverIndex].volume, 0)}</span>
                        </div>
                        <div className="text-[0.7rem] text-zinc-500">{candles[hoverIndex].date}</div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-2 text-[0.7rem] text-zinc-500">
                      <div className="h-2 w-6 rounded bg-emerald-400/80" /> candle
                      <div className="h-2 w-6 rounded bg-sky-400/80" /> volume
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2 text-[0.85rem] text-zinc-500">
                  <p>Load an item to see its recent price pulse in this region.</p>
                  {requestInfo && !loading && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      onClick={() => void handleSelect(requestInfo.item, requestInfo.regions)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Retry fetch
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="compare">
          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Region comparison</CardTitle>
              <CardDescription>
                Best buy/sell, spread, and volume across selected regions. Arbitrage is primary sell minus other region buy.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="min-w-full text-left text-[0.8rem]">
                <thead className="bg-zinc-900/60 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Region</th>
                    <th className="px-3 py-2 font-medium">Best sell</th>
                    <th className="px-3 py-2 font-medium">Best buy</th>
                    <th className="px-3 py-2 font-medium">Spread</th>
                    <th className="px-3 py-2 font-medium">VWAP</th>
                    <th className="px-3 py-2 font-medium">Volume</th>
                    <th className="px-3 py-2 font-medium">Arb vs primary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {regionBreakdown.map((r) => {
                    const primarySell = marketSummary.bestSell ?? null;
                    const arb =
                      primarySell !== null && r.bestBuy !== null ? primarySell - r.bestBuy : null;
                    return (
                      <tr key={r.name} className="hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-zinc-100">{r.name}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.bestSell !== null ? `${formatNumber(r.bestSell, 2)} ISK` : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.bestBuy !== null ? `${formatNumber(r.bestBuy, 2)} ISK` : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.bestSell !== null && r.bestBuy !== null
                            ? `${((r.bestSell - r.bestBuy) / r.bestSell * 100).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.vwap !== null ? `${formatNumber(r.vwap, 2)} ISK` : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{formatNumber(r.volume, 0)}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {arb !== null ? `${formatNumber(arb, 2)} ISK` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {arbitrageCallouts.length > 0 && (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[0.82rem] text-emerald-100">
                  <p className="mb-1 text-[0.75rem] uppercase tracking-[0.16em] text-emerald-200">
                    Top arbitrage vs primary sell
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {arbitrageCallouts.map((a) => (
                      <span key={a.name} className="rounded bg-emerald-600/30 px-2 py-1">
                        {a.name}: {formatNumber(a.arb, 2)} ISK spread · vol {formatNumber(a.volume, 0)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>
      )}

      {selected && (
        <div className="grid gap-4">
          {(regionBreakdown.length > 0 || depthBands.buys.length > 0 || depthBands.sells.length > 0) && (
            <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-300" />
                    Regions & depth
                  </CardTitle>
                  <CardDescription>Best prices, heatmap, and 0.5% depth buckets.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  {historySummary && (
                    <div>
                      <p className="mb-2 text-[0.75rem] text-zinc-400">Volume heatmap (last 60d)</p>
                      <div className="grid grid-cols-10 gap-1 rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3">
                        {history.slice(-60).map((h) => {
                          const intensity =
                            historySummary.peakVolume > 0 ? Math.min(1, h.volume / historySummary.peakVolume) : 0;
                          const alpha = 0.15 + intensity * 0.75;
                          return (
                            <div
                              key={h.date}
                              className="aspect-square rounded-[2px]"
                              style={{ backgroundColor: `rgba(56,189,248,${alpha})` }}
                              title={`${h.date}: ${formatNumber(h.volume, 0)} volume`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {regionBreakdown.map((r) => (
                      <div
                        key={r.name}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-[0.85rem] text-zinc-100"
                      >
                        <p className="font-semibold text-zinc-50">{r.name}</p>
                        <p className="text-[0.75rem] text-zinc-400">
                          Sell: {r.bestSell !== null ? `${formatNumber(r.bestSell, 2)} ISK` : "—"}
                        </p>
                        <p className="text-[0.75rem] text-zinc-400">
                          Buy: {r.bestBuy !== null ? `${formatNumber(r.bestBuy, 2)} ISK` : "—"}
                        </p>
                        <p className="text-[0.75rem] text-zinc-400">
                          VWAP: {r.vwap !== null ? `${formatNumber(r.vwap, 2)} ISK` : "—"}
                        </p>
                        <p className="text-[0.7rem] text-zinc-500">Vol: {formatNumber(r.volume, 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {(depthBands.buys.length > 0 || depthBands.sells.length > 0) && (
                  <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/60 p-3">
                    <p className="mb-1 text-[0.9rem] font-semibold text-zinc-50">Depth snapshot</p>
                    <p className="mb-2 text-[0.75rem] text-zinc-500">Top 50 orders in 0.5% buckets.</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[0.75rem] text-zinc-500">Sell depth</p>
                        <div className="space-y-1">
                          {depthBands.sells.map((b, idx) => (
                            <div
                              key={`sell-${idx}`}
                              className="flex items-center gap-2 text-[0.8rem]"
                              title={`${formatNumber(b.price, 2)} ISK`}
                            >
                              <div className="h-2 rounded-full bg-emerald-500/60" style={{ width: `${Math.min(100, b.volume / 1000)}%` }} />
                              <span className="text-zinc-200">{formatNumber(b.volume, 0)}</span>
                              <span className="text-zinc-500">{formatNumber(b.price, 2)} ISK</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-[0.75rem] text-zinc-500">Buy depth</p>
                        <div className="space-y-1">
                          {depthBands.buys.map((b, idx) => (
                            <div
                              key={`buy-${idx}`}
                              className="flex items-center gap-2 text-[0.8rem]"
                              title={`${formatNumber(b.price, 2)} ISK`}
                            >
                              <div className="h-2 rounded-full bg-sky-500/60" style={{ width: `${Math.min(100, b.volume / 1000)}%` }} />
                              <span className="text-zinc-200">{formatNumber(b.volume, 0)}</span>
                              <span className="text-zinc-500">{formatNumber(b.price, 2)} ISK</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border border-zinc-800/70 bg-black/70 backdrop-blur-sm">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-300" />
                  60-day pulse & liquidity
                </CardTitle>
                <CardDescription>Price stats plus top liquidity regions.</CardDescription>
              </div>
              {liquidityLeaders.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[0.85rem] text-zinc-200">
                  {liquidityLeaders.map((r) => (
                    <span
                      key={r.name}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1"
                    >
                      {r.name}: {formatNumber(r.volume, 0)} units
                    </span>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {historySummary ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-[0.85rem] text-zinc-300">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">
                      Avg {formatNumber(historySummary.avg, 2)} ISK
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2 py-0.5 text-zinc-200">
                      Last {formatNumber(historySummary.last, 2)} ISK
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-zinc-100 ${
                        historySummary.change >= 0
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-rose-500/60 bg-rose-500/10"
                      }`}
                    >
                      {historySummary.change >= 0 ? "+" : ""}
                      {historySummary.change.toFixed(2)}%
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-sky-100">
                      Std dev {formatNumber(historySummary.stdDev, 2)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2 py-0.5 text-zinc-200">
                      Median {formatNumber(historySummary.median, 2)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                      Vol avg {formatNumber(historySummary.avgVolume, 0)}
                    </span>
                  </div>
                  <div className="grid gap-2 text-[0.8rem] text-zinc-300 sm:grid-cols-2">
                    <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                      <div className="mb-1 flex items-center justify-between text-[0.75rem] text-zinc-500">
                        <span>Change</span>
                        <span>{historySummary.firstDate} → {historySummary.lastDate}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, Math.max(0, historySummary.change + 50))}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1">
                      <div className="mb-1 flex items-center justify-between text-[0.75rem] text-zinc-500">
                        <span>Sharpe-ish</span>
                        <span>Std dev weighting</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4 text-emerald-300" />
                        <span>{historySummary.sharpe !== null ? historySummary.sharpe.toFixed(3) : "n/a"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[0.8rem] text-zinc-300">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-6 rounded bg-emerald-500/70" />
                      Up-day body
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-6 rounded bg-rose-500/70" />
                      Down-day body
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-6 rounded bg-sky-500/70" />
                      Volume bars
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Load an item to view its history.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selected && (
        <Card className="border border-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Order book (terminal view)</CardTitle>
              <CardDescription className="flex items-center gap-2 text-[0.85rem]">
                <Info className="h-3.5 w-3.5 text-emerald-200" />
                Aggregated from all selected regions with station labels. Click headers to sort; filters are applied to the table only.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                value={filters.priceMin}
                onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
                placeholder="Min price"
                type="number"
                className="h-9 bg-zinc-950/60"
              />
              <Input
                value={filters.priceMax}
                onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
                placeholder="Max price"
                type="number"
                className="h-9 bg-zinc-950/60"
              />
              <Input
                value={filters.volumeMin}
                onChange={(e) => setFilters((f) => ({ ...f, volumeMin: e.target.value }))}
                placeholder="Min volume"
                type="number"
                className="h-9 bg-zinc-950/60"
              />
              <Input
                value={filters.station}
                onChange={(e) => setFilters((f) => ({ ...f, station: e.target.value }))}
                placeholder="Station/structure filter"
                className="h-9 bg-zinc-950/60"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[0.8rem] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <ArrowDownCircle className="h-4 w-4 text-emerald-300" />
                  Sell orders
                </span>
                <span>
                  Page {sellTablePage + 1} / {Math.max(1, Math.ceil(filteredSellOrders.length / tablePageSize))}
                </span>
              </div>
              <div className="overflow-auto rounded-md border border-zinc-800/80">
                <table className="min-w-full text-left text-[0.8rem]">
                  <thead className="bg-zinc-900/80 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleSellSort("price")}
                        >
                          Price <span className="text-[0.7rem] text-zinc-500">{sortIndicator(sellSort, "price")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleSellSort("volume")}
                        >
                          Volume <span className="text-[0.7rem] text-zinc-500">{sortIndicator(sellSort, "volume")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleSellSort("location")}
                        >
                          Location{" "}
                          <span className="text-[0.7rem] text-zinc-500">{sortIndicator(sellSort, "location")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleSellSort("region")}
                        >
                          Region <span className="text-[0.7rem] text-zinc-500">{sortIndicator(sellSort, "region")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {sellTablePageData.map((o) => (
                      <tr key={o.order_id} className="hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-zinc-100">{formatNumber(o.price, 2)} ISK</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {formatNumber(o.volume_remain)} / {formatNumber(o.volume_total)}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{o.locationName ?? "Location"}</td>
                        <td className="px-3 py-2 text-zinc-400">
                          {REGIONS.find((r) => r.id === o.region_id)?.name ?? o.region_id}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{o.duration ? `${o.duration}d` : "—"}</td>
                      </tr>
                    ))}
                    {sellTablePageData.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-zinc-500" colSpan={5}>
                          {filteredSellOrders.length === 0 ? "No sell orders (check filters or regions)." : "No sell orders."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredSellOrders.length > tablePageSize && (
                <div className="flex items-center justify-end gap-2 text-[0.75rem] text-zinc-400">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSellTablePage((p) => Math.max(0, p - 1))}
                    disabled={sellTablePage === 0}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSellTablePage((p) =>
                        Math.min(Math.ceil(filteredSellOrders.length / tablePageSize) - 1, p + 1),
                      )
                    }
                    disabled={(sellTablePage + 1) * tablePageSize >= filteredSellOrders.length}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[0.8rem] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <ArrowUpCircle className="h-4 w-4 text-sky-300" />
                  Buy orders
                </span>
                <span>
                  Page {buyTablePage + 1} / {Math.max(1, Math.ceil(filteredBuyOrders.length / tablePageSize))}
                </span>
              </div>
              <div className="overflow-auto rounded-md border border-zinc-800/80">
                <table className="min-w-full text-left text-[0.8rem]">
                  <thead className="bg-zinc-900/80 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleBuySort("price")}
                        >
                          Price <span className="text-[0.7rem] text-zinc-500">{sortIndicator(buySort, "price")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleBuySort("volume")}
                        >
                          Volume <span className="text-[0.7rem] text-zinc-500">{sortIndicator(buySort, "volume")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleBuySort("location")}
                        >
                          Location{" "}
                          <span className="text-[0.7rem] text-zinc-500">{sortIndicator(buySort, "location")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={() => handleBuySort("region")}
                        >
                          Region <span className="text-[0.7rem] text-zinc-500">{sortIndicator(buySort, "region")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {buyTablePageData.map((o) => (
                      <tr key={o.order_id} className="hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-zinc-100">{formatNumber(o.price, 2)} ISK</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {formatNumber(o.volume_remain)} / {formatNumber(o.volume_total)}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{o.locationName ?? "Location"}</td>
                        <td className="px-3 py-2 text-zinc-400">
                          {REGIONS.find((r) => r.id === o.region_id)?.name ?? o.region_id}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{o.duration ? `${o.duration}d` : "—"}</td>
                      </tr>
                    ))}
                    {buyTablePageData.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-zinc-500" colSpan={5}>
                          {filteredBuyOrders.length === 0 ? "No buy orders (check filters or regions)." : "No buy orders."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredBuyOrders.length > tablePageSize && (
                <div className="flex items-center justify-end gap-2 text-[0.75rem] text-zinc-400">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setBuyTablePage((p) => Math.max(0, p - 1))}
                    disabled={buyTablePage === 0}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setBuyTablePage((p) =>
                        Math.min(Math.ceil(filteredBuyOrders.length / tablePageSize) - 1, p + 1),
                      )
                    }
                    disabled={(buyTablePage + 1) * tablePageSize >= filteredBuyOrders.length}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
