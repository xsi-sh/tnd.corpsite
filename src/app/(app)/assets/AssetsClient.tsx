"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { Loader2, Search, Package, Coins, Building2, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import { MagicCard } from "@/components/ui/magic-card";
import NumberTicker from "@/components/ui/number-ticker";
import { Input } from "@/components/ui/input";

type Asset = {
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
  name?: string;
  location_name?: string;
  value?: number;
  is_singleton: boolean;
  location_flag?: string;
};

type AssetsResponse = {
  assets: Asset[];
  totalWealth: number;
  wealthAssets: number;
  wealthSellOrders: number;
  wealthEscrow: number;
  itemCount: number;
  error?: string;
};

type WealthHistoryPoint = {
    date: number;
    wealth: number;
    assets?: number;
    sell?: number;
    escrow?: number;
};

function formatISK(amount: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(amount);
}

const ChangeIndicator = ({ val }: { val: number | null }) => {
    if (val === null) return null;
    const isPos = val >= 0;
    const Icon = isPos ? TrendingUp : TrendingDown;
    return (
        <div className={`flex items-center mt-1 text-xs ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
            <Icon className="w-3 h-3 mr-1" />
            {Math.abs(val).toFixed(2)}% (24h)
        </div>
    );
};

export function AssetsClient() {
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: keyof Asset; dir: "asc" | "desc" }>({ key: "value", dir: "desc" });
  
  // Filters
  const [filterType, setFilterType] = useState<'all' | 'assets' | 'market'>('all');

  // History State
  const [changes, setChanges] = useState<{ total: number|null, assets: number|null, sell: number|null, escrow: number|null }>({
      total: null, assets: null, sell: null, escrow: null
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/assets");
        if (!res.ok) throw new Error("Failed to fetch assets");
        const json = await res.json();
        setData(json);

        // Handle History
        const now = Date.now();
        const historyRaw = localStorage.getItem('tnd_wealth_history');
        let history: WealthHistoryPoint[] = historyRaw ? JSON.parse(historyRaw) : [];
        
        // Add current point
        history.push({ 
            date: now, 
            wealth: json.totalWealth,
            assets: json.wealthAssets,
            sell: json.wealthSellOrders,
            escrow: json.wealthEscrow
        });
        
        // Prune old (> 7 days)
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        history = history.filter(p => (now - p.date) < sevenDays);
        
        // Find 24h ago point (closest to 24h)
        const oneDay = 24 * 60 * 60 * 1000;
        const targetTime = now - oneDay;
        
        let closest: WealthHistoryPoint | null = null;
        let minDiff = Infinity;
        
        for (const p of history) {
            const diff = Math.abs(p.date - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = p;
            }
        }

        if (closest && Math.abs(closest.date - targetTime) < (12 * 60 * 60 * 1000)) {
             const calcChange = (current: number, prev: number | undefined) => {
                 if (!prev) return null;
                 return ((current - prev) / prev) * 100;
             };

             setChanges({
                 total: calcChange(json.totalWealth, closest.wealth),
                 assets: calcChange(json.wealthAssets, closest.assets),
                 sell: calcChange(json.wealthSellOrders, closest.sell),
                 escrow: calcChange(json.wealthEscrow, closest.escrow)
             });
        }

        localStorage.setItem('tnd_wealth_history', JSON.stringify(history));

      } catch (e) {
        setError("Could not load assets. The API might be unavailable.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredAssets = useMemo(() => {
    if (!data?.assets) return [];
    return data.assets.filter(a => {
      const matchesSearch = a.name?.toLowerCase().includes(search.toLowerCase()) || 
                            a.location_name?.toLowerCase().includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      if (filterType === 'assets') return a.location_flag !== 'Market Listing';
      if (filterType === 'market') return a.location_flag === 'Market Listing';
      
      return true;
    });
  }, [data, search, filterType]);

  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      const valA = a[sort.key];
      const valB = b[sort.key];
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sort.dir === 'asc' ? valA - valB : valB - valA;
      }
      
      const strA = String(valA || "");
      const strB = String(valB || "");
      return sort.dir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredAssets, sort]);

  const topLocation = useMemo(() => {
    if (!data?.assets) return null;
    const locs = new Map<string, number>();
    data.assets.forEach(a => {
        const current = locs.get(a.location_name || "Unknown") || 0;
        locs.set(a.location_name || "Unknown", current + (a.value || 0));
    });
    // Find max
    let maxLoc = "";
    let maxVal = 0;
    locs.forEach((val, key) => {
        if (val > maxVal) {
            maxVal = val;
            maxLoc = key;
        }
    });
    return { name: maxLoc, value: maxVal };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Analyzing assets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Asset Analysis</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Comprehensive valuation of your personal assets across all locations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#10b981">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Total Wealth</h3>
            <Coins className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
                <NumberTicker value={data?.totalWealth || 0} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            {changes.total !== null && (
                <div className={`flex items-center mt-2 text-xs font-mono ${changes.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {changes.total >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {Math.abs(changes.total).toFixed(2)}% (24h)
                </div>
            )}
          </div>
        </MagicCard>
        
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#3b82f6">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Hangar Value</h3>
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
                <NumberTicker value={data?.wealthAssets || 0} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <ChangeIndicator val={changes.assets} />
          </div>
        </MagicCard>

        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#f59e0b">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Sell Orders</h3>
            <ArrowUpDown className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
                <NumberTicker value={data?.wealthSellOrders || 0} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <ChangeIndicator val={changes.sell} />
          </div>
        </MagicCard>

        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#a855f7">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Escrow</h3>
            <Building2 className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
                <NumberTicker value={data?.wealthEscrow || 0} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <ChangeIndicator val={changes.escrow} />
          </div>
        </MagicCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#71717a">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Total Items</h3>
            <Package className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
                <NumberTicker value={data?.itemCount || 0} />
            </div>
          </div>
        </MagicCard>
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#71717a">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Top Location</h3>
            <Building2 className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-4">
            <div className="text-lg font-bold text-white truncate tracking-tight" title={topLocation?.name}>{topLocation?.name || "—"}</div>
            <p className="text-xs text-zinc-400 font-mono">{formatISK(topLocation?.value || 0)} ISK</p>
          </div>
        </MagicCard>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                <Input 
                    placeholder="Filter by item or location..." 
                    className="pl-8 bg-zinc-950/50 border-zinc-800"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="flex bg-zinc-950/50 border border-zinc-800 rounded-md p-1">
                <button 
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${filterType === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    All
                </button>
                <button 
                    onClick={() => setFilterType('assets')}
                    className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${filterType === 'assets' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    Assets
                </button>
                <button 
                    onClick={() => setFilterType('market')}
                    className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${filterType === 'market' ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400 hover:text-amber-200'}`}
                >
                    On Market
                </button>
            </div>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/50">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-zinc-400 bg-zinc-900/50 border-b border-zinc-800">
                        <tr>
                            <th className="p-4 cursor-pointer hover:text-zinc-200" onClick={() => setSort({ key: 'name', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
                                Item <ArrowUpDown className="inline h-3 w-3 ml-1" />
                            </th>
                            <th className="p-4 cursor-pointer hover:text-zinc-200 text-right" onClick={() => setSort({ key: 'quantity', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
                                Quantity <ArrowUpDown className="inline h-3 w-3 ml-1" />
                            </th>
                            <th className="p-4 cursor-pointer hover:text-zinc-200" onClick={() => setSort({ key: 'location_name', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
                                Location <ArrowUpDown className="inline h-3 w-3 ml-1" />
                            </th>
                            <th className="p-4 cursor-pointer hover:text-zinc-200 text-right" onClick={() => setSort({ key: 'value', dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
                                Est. Value <ArrowUpDown className="inline h-3 w-3 ml-1" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {sortedAssets.slice(0, 100).map((asset, i) => (
                            <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                                <td className="p-4 text-zinc-200">
                                    <div className="flex items-center gap-3">
                                        <Image 
                                            src={`https://images.evetech.net/types/${asset.type_id}/icon?size=32`} 
                                            alt="" 
                                            width={32} 
                                            height={32} 
                                            className="rounded bg-zinc-900" 
                                            unoptimized
                                        />
                                        <div className="flex flex-col">
                                            <span>{asset.name}</span>
                                            <div className="flex gap-2">
                                                <span className="text-xs text-zinc-500">{asset.is_singleton ? 'Singleton' : 'Stack'}</span>
                                                {asset.location_flag === 'Market Listing' && (
                                                    <span className="text-xs text-amber-500 font-medium bg-amber-500/10 px-1 rounded">On Sale</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-right text-zinc-300 font-mono">{asset.quantity.toLocaleString()}</td>
                                <td className="p-4 text-zinc-400 truncate max-w-[200px]" title={asset.location_name}>{asset.location_name}</td>
                                <td className="p-4 text-right text-emerald-400 font-mono">{formatISK(asset.value || 0)}</td>
                            </tr>
                        ))}
                        {sortedAssets.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-zinc-500">No assets found matching your filter.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {sortedAssets.length > 100 && (
                <div className="p-4 text-center text-xs text-zinc-500 border-t border-zinc-800">
                    Showing top 100 items of {sortedAssets.length}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
