"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, Coins, Package, ArrowUpDown, Building2 } from "lucide-react";
import { MagicCard } from "@/components/ui/magic-card";
import NumberTicker from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";

// Helper for change display
const ChangeIndicator = ({ val }: { val: number | null }) => {
    if (val === null) return null;
    const isPos = val >= 0;
    const Icon = isPos ? TrendingUp : TrendingDown;
    return (
        <div className={`flex items-center mt-2 text-xs font-mono ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
            <Icon className="w-3 h-3 mr-1" />
            {Math.abs(val).toFixed(2)}% (24h)
        </div>
    );
};

type HistoryPoint = {
    date: number;
    wallet: number;
    net: number;
    assetWorth: number;
};

export function DashboardStats({ 
    wallet, 
    net, 
    income, 
    expense, 
    assetWorth, 
    plexCount,
    location
}: {
    wallet: number;
    net: number;
    income: number;
    expense: number;
    assetWorth: number;
    plexCount: number;
    location: { solar_system_id: number; station_id?: number };
}) {
    const [changes, setChanges] = useState<{ wallet: number|null, assetWorth: number|null }>({
        wallet: null, assetWorth: null
    });

    useEffect(() => {
        const now = Date.now();
        const raw = localStorage.getItem('tnd_dashboard_history');
        let history: HistoryPoint[] = raw ? JSON.parse(raw) : [];

        history.push({
            date: now,
            wallet,
            net,
            assetWorth
        });

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        history = history.filter(p => (now - p.date) < sevenDays);

        const targetTime = now - (24 * 60 * 60 * 1000);
        let closest: HistoryPoint | null = null;
        let minDiff = Infinity;

        for (const p of history) {
            const diff = Math.abs(p.date - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = p;
            }
        }

        let newChanges = { wallet: null as number | null, assetWorth: null as number | null };

        if (closest && Math.abs(closest.date - targetTime) < (12 * 60 * 60 * 1000)) {
            const calc = (curr: number, prev: number) => prev ? ((curr - prev) / prev) * 100 : null;
            newChanges = {
                wallet: calc(wallet, closest.wallet),
                assetWorth: calc(assetWorth, closest.assetWorth)
            };
        }

        setChanges(newChanges);
        localStorage.setItem('tnd_dashboard_history', JSON.stringify(history));
    }, [wallet, net, assetWorth]);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Wallet Card */}
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#10b981">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Wallet Balance</h3>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white font-mono tracking-tight">
              <NumberTicker value={wallet} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <ChangeIndicator val={changes.wallet} />
          </div>
          <BorderBeam size={100} duration={12} delay={9} colorFrom="#10b981" colorTo="#34d399" />
        </MagicCard>

        {/* Asset Worth Card */}
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#a855f7">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Asset Est. Worth</h3>
            <Package className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white font-mono tracking-tight">
              <NumberTicker value={assetWorth} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">Based on Page 1 Assets</p>
            <ChangeIndicator val={changes.assetWorth} />
          </div>
        </MagicCard>

        {/* Net Profit Card */}
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor={net >= 0 ? "#10b981" : "#ef4444"}>
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">30-Day Net</h3>
            <ArrowUpDown className={`h-4 w-4 ${net >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
          </div>
          <div className="mt-4">
            <div className={`text-3xl font-bold font-mono tracking-tight ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {net > 0 ? '+' : ''}<NumberTicker value={Math.abs(net)} /> <span className="text-lg text-zinc-400">ISK</span>
            </div>
            <div className="flex justify-between text-xs mt-2 font-mono">
              <span className="text-emerald-500">In: {income.toLocaleString()}</span>
              <span className="text-red-500">Out: {Math.abs(expense).toLocaleString()}</span>
            </div>
          </div>
        </MagicCard>

        {/* PLEX Holdings */}
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800" gradientColor="#f59e0b">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">PLEX Holdings</h3>
            <Coins className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white font-mono tracking-tight">
              <NumberTicker value={plexCount} /> <span className="text-lg text-zinc-400">UNITS</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">In Assets (Page 1)</p>
          </div>
        </MagicCard>

        {/* Location Card - Optional separate row or included here */}
        <MagicCard className="p-6 flex flex-col justify-between bg-black/40 backdrop-blur-md border-zinc-800 col-span-1 md:col-span-2 lg:col-span-4 h-auto">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-zinc-300 text-sm font-medium tracking-wider uppercase">Current Location</h3>
                <Building2 className="h-4 w-4 text-cyan-500" />
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="text-2xl font-bold text-white tracking-tight">
                        System: <span className="text-cyan-400">{location.solar_system_id}</span>
                    </div>
                    <div className="text-sm text-zinc-400 mt-1 font-mono">
                        Station: {location.station_id || "IN SPACE"}
                    </div>
                </div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">
                    Secure Connection Established
                </div>
            </div>
        </MagicCard>
      </div>
    );
}
