"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type {
  RouteMode,
  RoutePlan,
  RoutePlannerResponse,
  RouteHop,
} from "@/lib/types/route-planner";
import type {
  SystemSuggestion,
  SystemIntel,
  SystemLookupResponse,
  SystemSuggestResponse,
} from "@/lib/types/system-intel";
import {
  Activity,
  Map as MapIcon,
  Route as RouteIcon,
  Shield,
  AlertTriangle,
  ExternalLink,
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
import { fetchSuggestions } from "../system-lookup/fetchSuggestions";

const HOT_THRESHOLD = 5;
const VERY_HOT_THRESHOLD = 20;

const ROUTE_MODES: { value: RouteMode; label: string; description: string }[] = [
  {
    value: "shortest",
    label: "Shortest",
    description: "Fewest total jumps; may include live wormholes.",
  },
  {
    value: "shortest-gates-only",
    label: "Gates only",
    description: "Shortest route using only stargates (no wormholes).",
  },
  {
    value: "secure",
    label: "Secure",
    description: "Avoids systems below 0.5 security (no wormholes).",
  },
  {
    value: "pvp-avoid",
    label: "PvP avoid",
    description:
      "Bias towards safer paths by avoiding low/null-sec and wormholes where possible.",
  },
  {
    value: "pvp-seek",
    label: "PvP hunt",
    description:
      "Bias towards low/null-sec and wormhole paths where possible for more contact.",
  },
];

type RoutePreset = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  waypointsText: string;
  mode: RouteMode;
};

type RouteLegMeta = {
  from: string;
  to: string;
  startIndex: number;
  endIndex: number;
};

const PRESETS_STORAGE_KEY = "ww-route-presets-v1";

function formatSec(sec: number | null): string {
  if (sec === null) return "?";
  return sec.toFixed(1);
}

function getSecColor(sec: number | null): string {
  if (sec === null) return "text-zinc-300";
  if (sec >= 0.5) return "text-emerald-300";
  if (sec > 0) return "text-amber-300";
  return "text-rose-300";
}

export function RoutePlannerClient() {
  const searchParams = useSearchParams();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypointsText, setWaypointsText] = useState("");
  const [mode, setMode] = useState<RouteMode>("shortest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<SystemSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<SystemSuggestion[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("detailed");
  const [inspectedHopIndex, setInspectedHopIndex] = useState<number | null>(null);
  const [inspectedIntel, setInspectedIntel] = useState<SystemIntel | null>(null);
  const [inspectedLoading, setInspectedLoading] = useState(false);
  const [inspectedError, setInspectedError] = useState<string | null>(null);
  const [playIndex, setPlayIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [presets, setPresets] = useState<RoutePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [routeLegs, setRouteLegs] = useState<RouteLegMeta[]>([]);
  const [invalidWaypoints, setInvalidWaypoints] = useState<string[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(
    null,
  );
  const routePlanCacheRef = useRef<Map<string, RoutePlan>>(new Map());
  const waypointValidationCacheRef = useRef<Map<string, boolean>>(
    new Map(),
  );

  useEffect(() => {
    const originParam = searchParams.get("origin");
    const destParam = searchParams.get("destination");
    const waypointsParam = searchParams.get("waypoints");
    const modeParam = searchParams.get("mode") as RouteMode | null;

    if (originParam && origin === "") {
      setOrigin(originParam);
    }
    if (destParam && destination === "") {
      setDestination(destParam);
    }
    if (waypointsParam && waypointsText === "") {
      setWaypointsText(waypointsParam);
    }
    if (
      modeParam &&
      ROUTE_MODES.some((m) => m.value === modeParam) &&
      mode === "shortest"
    ) {
      setMode(modeParam);
    }
  }, [searchParams, origin, destination, waypointsText, mode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RoutePreset[];
      if (Array.isArray(parsed)) {
        setPresets(parsed);
      }
    } catch {
      // Ignore malformed preset data
    }
  }, []);

  function persistPresets(next: RoutePreset[]) {
    setPresets(next);
    try {
      window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  }

  const [throttleNotice, setThrottleNotice] = useState<string | null>(null);

  async function requestPlan(
    originName: string,
    destName: string,
    modeValue: RouteMode,
  ): Promise<RoutePlan> {
    const controller = abortController ?? new AbortController();
    if (!abortController) setAbortController(controller);

    const cacheKey = `${originName}::${destName}::${modeValue}`;
    const cached = routePlanCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const doFetch = async () => {
      const res = await fetch("/api/route-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ originName, destName, mode: modeValue }),
      });

      const data = (await res.json()) as RoutePlannerResponse;

      if (res.status === 429) {
        throw Object.assign(new Error("throttled"), { code: 429 });
      }

      if (!res.ok || !data.ok) {
        const message = !data.ok
          ? data.error.message
          : "Route planner failed. Please try again.";
        throw new Error(message);
      }

      routePlanCacheRef.current.set(cacheKey, data.data);
      return data.data;
    };

    try {
      return await doFetch();
    } catch (err) {
      if ((err as { code?: number }).code === 429) {
        setThrottleNotice("Throttled by route API. Retrying shortly…");
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return doFetch();
      }
      throw err;
    }
  }

  async function performPlan(
    fromName: string,
    toName: string,
    modeValue: RouteMode,
    waypointsOverride?: string,
  ) {
    const originName = fromName.trim();
    const destName = toName.trim();

    if (!originName || !destName) {
      setError("Please enter both origin and destination systems.");
      setPlan(null);
      return;
    }

    setLoading(true);
    setError(null);
    setPlan(null);
    setPlayIndex(null);
    setIsPlaying(false);
    setInspectedHopIndex(null);
    setInspectedIntel(null);
    setInspectedError(null);
    setRouteLegs([]);
    abortController?.abort();
    const controller = new AbortController();
    setAbortController(controller);

    const rawWaypoints = waypointsOverride ?? waypointsText;
    const waypointNames = rawWaypoints
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    try {
      if (waypointNames.length === 0) {
        const singlePlan = await requestPlan(originName, destName, modeValue);
        const singleLeg: RouteLegMeta = {
          from: originName,
          to: destName,
          startIndex: 0,
          endIndex:
            singlePlan.hops.length > 0 ? singlePlan.hops.length - 1 : 0,
        };
        setRouteLegs([singleLeg]);
        setPlan(singlePlan);
        return;
      }

      const points = [originName, ...waypointNames, destName];
      const legPlans: RoutePlan[] = [];

      for (let i = 0; i < points.length - 1; i++) {
        const legOrigin = points[i];
        const legDest = points[i + 1];

        try {
          const legPlan = await requestPlan(legOrigin, legDest, modeValue);
          legPlans.push(legPlan);
        } catch (err) {
          const msg =
            err instanceof Error && err.message
              ? err.message
              : "Route planner failed. Please try again.";
        setError(`Leg ${i + 1}: ${msg}`);
        setPlan(null);
        return;
      }
        await new Promise((resolve) => setTimeout(resolve, 120));
    }

      const combinedHops: RoutePlan["hops"] = [];
      const legMetas: RouteLegMeta[] = [];

      for (let legIndex = 0; legIndex < legPlans.length; legIndex++) {
        const leg = legPlans[legIndex];
        const from = points[legIndex];
        const to = points[legIndex + 1];
        const startIndex = combinedHops.length;

        leg.hops.forEach((hop, hopIdx) => {
          if (legIndex > 0 && hopIdx === 0) {
            return;
          }
          combinedHops.push({
            ...hop,
            index: combinedHops.length,
          });
        });

        const endIndex =
          combinedHops.length > 0 ? combinedHops.length - 1 : startIndex;
        legMetas.push({ from, to, startIndex, endIndex });
      }

      const totalJumps = Math.max(0, combinedHops.length - 1);

      let lowSecJumps = 0;
      let nullSecJumps = 0;
      let wormholeJumps = 0;
      let maxPvpLastHour: number | null = null;
      let maxPvpLast24h: number | null = null;
      let sumPvpLastHour = 0;
      let sumPvpLast24h = 0;
      let countedPvpJumps = 0;
      let countedPvp24hJumps = 0;

      const LOW_SEC_THRESHOLD_CLIENT = 0.5;

      for (const hop of combinedHops) {
        if (hop.index > 0) {
          const sec = hop.securityStatus ?? 0;
          if (sec < 0) {
            nullSecJumps += 1;
          } else if (sec < LOW_SEC_THRESHOLD_CLIENT) {
            lowSecJumps += 1;
          }
          if (hop.viaWormhole) {
            wormholeJumps += 1;
          }
        }
        if (hop.pvpKillsLastHour !== null) {
          const v = hop.pvpKillsLastHour;
          if (maxPvpLastHour === null || v > maxPvpLastHour) {
            maxPvpLastHour = v;
          }
          sumPvpLastHour += v;
          countedPvpJumps += 1;
        }
        if (hop.pvpKillsLast24h !== null) {
          const v = hop.pvpKillsLast24h;
          if (maxPvpLast24h === null || v > maxPvpLast24h) {
            maxPvpLast24h = v;
          }
          sumPvpLast24h += v;
          countedPvp24hJumps += 1;
        }
      }

      const avgPvpLastHour =
        countedPvpJumps > 0 ? sumPvpLastHour / countedPvpJumps : null;

      let riskScore = 0;
      riskScore += lowSecJumps * 1;
      riskScore += nullSecJumps * 2;
      riskScore += wormholeJumps * 1.5;
      if (maxPvpLastHour !== null) {
        riskScore += maxPvpLastHour / 10;
      }

      let overallRisk: "low" | "medium" | "high";
      if (riskScore < 3) {
        overallRisk = "low";
      } else if (riskScore < 8) {
        overallRisk = "medium";
      } else {
        overallRisk = "high";
      }

      const hotspots = combinedHops
        .map((hop) => ({
          systemId: hop.systemId,
          name: hop.name,
          killsLastHour: hop.pvpKillsLastHour,
          killsLast24h: hop.pvpKillsLast24h,
          score:
            (hop.pvpKillsLast24h ?? 0) * 0.6 + (hop.pvpKillsLastHour ?? 0) * 0.4,
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((h) => ({
          systemId: h.systemId,
          name: h.name,
          killsLastHour: h.killsLastHour,
          killsLast24h: h.killsLast24h,
        }));

      const combinedPlan: RoutePlan = {
        hops: combinedHops,
        totalJumps,
        risk: {
          totalJumps,
          lowSecJumps,
          nullSecJumps,
          wormholeJumps,
          maxPvpLastHour,
          avgPvpLastHour,
          totalPvpLastHour: countedPvpJumps > 0 ? sumPvpLastHour : null,
          totalPvpLast24h: countedPvp24hJumps > 0 ? sumPvpLast24h : null,
          hotspots,
          overallRisk,
        },
      };

      setPlan(combinedPlan);
      setRouteLegs(legMetas);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request cancelled");
      } else {
        console.error("Route planner error", err);
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Unexpected error during route planning. Please try again.";
        setError(msg);
        setPlan(null);
      }
    } finally {
      setLoading(false);
      setThrottleNotice(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await performPlan(origin, destination, mode);
  }

  useEffect(() => {
    if (!isPlaying || !plan || plan.hops.length === 0) return;

    const id = window.setTimeout(() => {
      setPlayIndex((prev) => {
        const lastIndex = plan.hops.length - 1;
        if (prev === null) return 0;
        if (prev >= lastIndex) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 900);

    return () => window.clearTimeout(id);
  }, [isPlaying, plan]);

  async function handleCopyRoute() {
    if (!plan || plan.hops.length === 0) return;

    const text = plan.hops.map((hop) => hop.name).join("\n");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus("copied");
        window.setTimeout(() => setCopyStatus("idle"), 1500);
      } else {
        setCopyStatus("error");
        window.setTimeout(() => setCopyStatus("idle"), 2000);
      }
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }

  async function handleInspectHop(hop: RouteHop) {
    if (inspectedHopIndex === hop.index) {
      setInspectedHopIndex(null);
      setInspectedIntel(null);
      setInspectedError(null);
      setInspectedLoading(false);
      return;
    }

    setInspectedHopIndex(hop.index);
    setInspectedIntel(null);
    setInspectedError(null);
    setInspectedLoading(true);

    try {
      const res = await fetch("/api/system-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemName: hop.name }),
      });

      const data = (await res.json()) as SystemLookupResponse;

      if (!res.ok || !data.ok) {
        const message = !data.ok
          ? data.error.message
          : "Inline system lookup failed.";
        setInspectedError(message);
        setInspectedLoading(false);
        return;
      }

      setInspectedIntel(data.data);
    } catch (err) {
      console.error("Inline system lookup error", err);
      setInspectedError(
        "Inline lookup failed. Try the System Lookup tool if this persists.",
      );
    } finally {
      setInspectedLoading(false);
    }
  }

  function handleSavePreset() {
    const name = presetName.trim();
    const originName = origin.trim();
    const destName = destination.trim();

    if (!name || !originName || !destName) {
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newPreset: RoutePreset = {
      id,
      name,
      origin: originName,
      destination: destName,
      waypointsText,
      mode,
    };

    const next = [...presets, newPreset];
    persistPresets(next);
    setPresetName("");
  }

  function handleDeletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    persistPresets(next);
  }

  async function handleApplyPreset(preset: RoutePreset) {
    setOrigin(preset.origin);
    setDestination(preset.destination);
    setWaypointsText(preset.waypointsText);
    setMode(preset.mode);
    setError(null);
    await performPlan(
      preset.origin,
      preset.destination,
      preset.mode,
      preset.waypointsText,
    );
  }

  function handleRemoveWaypoint(index: number) {
    const tokens = waypointsText
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    tokens.splice(index, 1);
    const next = tokens.join(", ");
    setWaypointsText(next);
    setError(null);
  }

  const waypointTokens = waypointsText
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const duplicateWaypointTokens = Array.from(
    waypointTokens.reduce((map, token) => {
      const key = token.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .filter(([, count]) => count > 1)
    .map(([token]) => token as string);

  useEffect(() => {
    const cache = waypointValidationCacheRef.current;

    const tokens = waypointsText
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (tokens.length === 0) {
      setInvalidWaypoints([]);
      return;
    }

    let cancelled = false;

    async function validateWaypoints() {
      const invalid: string[] = [];

      for (const token of tokens) {
        const key = token.toLowerCase();
        const cached = cache.get(key);

        if (cached !== undefined) {
          if (!cached) invalid.push(token);
          continue;
        }

        try {
          const res = await fetch(
            `/api/system-suggest?q=${encodeURIComponent(token)}`,
          );

          if (!res.ok) {
            cache.set(key, false);
            invalid.push(token);
            continue;
          }

          const data = (await res.json()) as SystemSuggestResponse;
          const hasExact = data.results.some(
            (s) => s.name.toLowerCase() === key,
          );

          cache.set(key, hasExact);
          if (!hasExact) invalid.push(token);
        } catch {
          cache.set(key, false);
          invalid.push(token);
        }

        if (cancelled) return;
      }

      if (!cancelled) {
        setInvalidWaypoints(invalid);
      }
    }

    void validateWaypoints();

    return () => {
      cancelled = true;
    };
  }, [waypointsText]);

  const hasPlan = !!plan && plan.hops.length > 0;

  return (
    <section className="space-y-6">
      {throttleNotice && (
        <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-amber-100">
          <AlertTitle>Throttled</AlertTitle>
          <AlertDescription>{throttleNotice}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Route Planner
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-prose">
            Plot a route through New Eden using stargates with shortest or secure
            preferences. Visualize jumps, security and topology in a single
            obsidian console.
          </p>
        </div>
        <RouteIcon className="hidden h-8 w-8 text-emerald-400/80 sm:block" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-2xl border border-zinc-800/70 bg-black/70 px-4 py-4 backdrop-blur-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_auto] sm:items-end"
      >
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Origin system
          </label>
          <Input
            autoComplete="off"
            placeholder="e.g. Jita"
            value={origin}
            onChange={(e) => {
              const value = e.target.value;
              setOrigin(value);
              setError(null);
              void fetchSuggestions(value, setOriginSuggestions);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void performPlan(origin, destination, mode, waypointsText);
              }
            }}
          />
          {originSuggestions.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/95 text-sm shadow-lg">
              {originSuggestions.map((s) => (
                <button
                  key={s.systemId}
                  type="button"
                  onClick={() => {
                    setOrigin(s.name);
                    setOriginSuggestions([]);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-100"
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

        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Waypoints (optional)
          </label>
          <Input
            autoComplete="off"
            placeholder="Comma-separated, e.g. Amamake, Rancer"
            value={waypointsText}
            onChange={(e) => {
              setWaypointsText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void performPlan(origin, destination, mode, waypointsText);
              }
            }}
          />
          {waypointTokens.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {waypointTokens.map((token, idx) => (
                <button
                  key={`${token}-${idx}`}
                  type="button"
                  onClick={() => handleRemoveWaypoint(idx)}
                  className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] ${
                    invalidWaypoints
                      .map((w) => w.toLowerCase())
                      .includes(token.toLowerCase())
                      ? "border-rose-500/60 bg-rose-500/10 text-rose-200 hover:border-rose-400 hover:bg-rose-500/20"
                      : "border-emerald-500/40 bg-zinc-950/80 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  title={
                    invalidWaypoints
                      .map((w) => w.toLowerCase())
                      .includes(token.toLowerCase())
                      ? "Unknown system name"
                      : "Remove waypoint"
                  }
                >
                  <span className="max-w-[7rem] truncate">{token}</span>
                  <span className="text-emerald-300 group-hover:text-emerald-200">
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
          {invalidWaypoints.length > 0 && (
            <p className="mt-1 text-[0.7rem] text-rose-300">
              No known system named: {invalidWaypoints.join(", ")}
            </p>
          )}
          {duplicateWaypointTokens.length > 0 && (
            <p className="mt-1 text-[0.7rem] text-amber-400">
              Warning: duplicate waypoints detected (
              {duplicateWaypointTokens.join(", ")}). Route will visit them
              multiple times.
            </p>
          )}
          <p className="mt-1 text-[0.7rem] text-zinc-500">
            These systems will be visited in order between origin and destination. Press Enter to plan; Ctrl/Cmd+Enter inside waypoints also plans.
          </p>
        </div>

        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Destination system
          </label>
          <Input
            autoComplete="off"
            placeholder="e.g. Amarr"
            value={destination}
            onChange={(e) => {
              const value = e.target.value;
              setDestination(value);
              setError(null);
              void fetchSuggestions(value, setDestSuggestions);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void performPlan(origin, destination, mode, waypointsText);
              }
            }}
          />
          {destSuggestions.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/95 text-sm shadow-lg">
              {destSuggestions.map((s) => (
                <button
                  key={s.systemId}
                  type="button"
                  onClick={() => {
                    setDestination(s.name);
                    setDestSuggestions([]);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-100"
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

        <div className="space-y-2">
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Mode
          </label>
          <div className="flex flex-wrap gap-1 text-xs">
            {ROUTE_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
                  mode === m.value
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                    : "border-zinc-700/80 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                }`}
              >
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[0.7rem] text-zinc-500">
            {ROUTE_MODES.find((m) => m.value === mode)?.description}
          </p>
        </div>

        <div className="sm:col-span-3">
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 w-full sm:mt-0 sm:w-auto"
          >
            {loading ? "Calculating route..." : "Find route"}
          </Button>
        </div>
      </form>

      <div className="space-y-2 rounded-2xl border border-zinc-800/70 bg-black/60 px-4 py-3 text-[0.8rem] text-zinc-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-300">
            Saved routes
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoComplete="off"
              placeholder="Preset name (e.g. Home → Jita secure)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="h-7 w-48 bg-zinc-950/70 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSavePreset}
              className="border-emerald-500/60 bg-zinc-950/80 text-[0.7rem] text-zinc-100 hover:bg-emerald-500/10"
            >
              Save preset
            </Button>
          </div>
        </div>
        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <div
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-950/80 px-2 py-0.5 text-[0.7rem] text-zinc-200"
              >
                <button
                  type="button"
                  onClick={() => void handleApplyPreset(p)}
                  className="max-w-[14rem] truncate text-left hover:text-emerald-300"
                  title={`${p.origin} → ${p.destination} (${p.mode}$
                    )${p.waypointsText ? ` via ${p.waypointsText}` : ""}`}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(p.id)}
                  className="ml-1 text-zinc-500 hover:text-rose-400"
                  aria-label="Delete preset"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.7rem] text-zinc-500">
            No presets yet. Configure origin, destination, waypoints and mode, then
            save it with a name.
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Route planning failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasPlan && plan && (
        <Card className="relative overflow-hidden border border-zinc-700/70 bg-zinc-950/70 backdrop-blur-sm shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-emerald-400" />
                <span>
                  {origin || "?"} → {destination || "?"}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">
                  {plan.totalJumps} jumps
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyRoute}
                  className="border-zinc-700 bg-zinc-950/60 text-[0.7rem] text-zinc-200 hover:border-emerald-500 hover:bg-emerald-500/10"
                >
                  {copyStatus === "copied"
                    ? "Copied"
                    : copyStatus === "error"
                      ? "Copy failed"
                      : "Copy route"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void performPlan(origin, destination, mode, waypointsText)
                  }
                  className="border-zinc-700 bg-zinc-950/60 text-[0.7rem] text-zinc-200 hover:border-emerald-500 hover:bg-emerald-500/10"
                >
                  Refresh intel
                </Button>
              </div>
            </CardTitle>
            <CardDescription className="flex items-center gap-2 text-xs text-zinc-400">
              <Activity className="h-3 w-3 text-emerald-400" />
              <span>
                Static stargate graph with live wormhole links and zKillboard
                intel. PvP-aware modes bias routing away from or into
                low/null-sec and wormholes.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs sm:text-sm">
            {plan.totalJumps === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-zinc-300">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p>You are already in the destination system.</p>
              </div>
            )}

            {plan.totalJumps > 0 && (
              <div className="grid gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-[0.7rem] text-zinc-300 sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] ${
                      plan.risk.overallRisk === "low"
                        ? "border-emerald-500/50 text-emerald-300"
                        : plan.risk.overallRisk === "medium"
                          ? "border-amber-400/60 text-amber-300"
                          : "border-rose-500/70 text-rose-300"
                    }`}
                  >
                    <span className="text-zinc-400">Risk</span>
                    <span className="font-semibold capitalize">
                      {plan.risk.overallRisk}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-zinc-400">Jumps</span>
                    <span className="font-semibold text-zinc-100">
                      {plan.risk.totalJumps}
                    </span>
                  </span>
                  {routeLegs.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                      <span className="text-zinc-400">Legs</span>
                      <span className="font-medium text-zinc-100">
                        {routeLegs.length}
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-amber-300">Low-sec</span>
                    <span className="font-medium text-zinc-100">
                      {plan.risk.lowSecJumps}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                    <span className="text-sky-300">Null-sec</span>
                    <span className="font-medium text-zinc-100">
                      {plan.risk.nullSecJumps}
                    </span>
                  </span>
                  {plan.risk.wormholeJumps > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                      <span className="text-violet-300">Wormholes</span>
                      <span className="font-medium text-zinc-100">
                        {plan.risk.wormholeJumps}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {plan.risk.maxPvpLastHour !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                      <span className="text-zinc-400">Max PvP / h</span>
                      <span className="font-medium text-zinc-100">
                        {plan.risk.maxPvpLastHour.toLocaleString()}
                      </span>
                    </span>
                  )}
                  {plan.risk.totalPvpLast24h !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                      <span className="text-zinc-400">PvP last 24h</span>
                      <span className="font-medium text-zinc-100">
                        {plan.risk.totalPvpLast24h.toLocaleString()}
                      </span>
                    </span>
                  )}
                  {plan.risk.avgPvpLastHour !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-0.5">
                      <span className="text-zinc-400">Avg PvP / h</span>
                      <span className="font-medium text-zinc-100">
                        {plan.risk.avgPvpLastHour.toFixed(1)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {plan.totalJumps > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-[0.7rem]">
                {plan.risk.hotspots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-500">Hot systems on this route:</span>
                    {plan.risk.hotspots.map((h) => (
                      <span
                        key={h.systemId}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[0.7rem] text-amber-100"
                        title="Highest recent PvP density"
                      >
                        <span className="font-semibold">{h.name}</span>
                        {h.killsLastHour !== null && (
                          <span className="text-zinc-200">
                            {h.killsLastHour.toLocaleString()}/h
                          </span>
                        )}
                        {h.killsLast24h !== null && (
                          <span className="text-zinc-300">
                            · {h.killsLast24h.toLocaleString()} /24h
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 px-2 py-0.5 text-zinc-400">
                  <span className="text-zinc-500">View</span>
                  <button
                    type="button"
                    onClick={() => setViewMode("compact")}
                    className={`rounded-full px-1.5 py-0.5 ${
                      viewMode === "compact"
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("detailed")}
                    className={`rounded-full px-1.5 py-0.5 ${
                      viewMode === "detailed"
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Detailed
                  </button>
                </div>
              </div>
            )}

            {plan.totalJumps > 0 && plan.hops.length > 1 && (
              <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[0.7rem] text-zinc-400">
                <button
                  type="button"
                  onClick={() => {
                    if (!plan) return;
                    setPlayIndex((current) => (current === null ? 0 : current));
                    setIsPlaying(true);
                  }}
                  className="rounded-full border border-emerald-500/60 bg-zinc-900/70 px-2 py-0.5 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  {isPlaying ? "Playing…" : "Play route"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying(false)}
                  disabled={!isPlaying}
                  className="rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
                >
                  Pause
                </button>
                {playIndex !== null && playIndex < plan.hops.length && (
                  <span className="text-zinc-500">
                    Now: Jump {plan.hops[playIndex].index} · {" "}
                    <span className="text-zinc-200">
                      {plan.hops[playIndex].name}
                    </span>
                  </span>
                )}
              </div>
            )}

            {plan.totalJumps > 0 && (
              <div className="relative">
                <div className="absolute left-3 top-0 h-full w-px bg-gradient-to-b from-emerald-500/60 via-emerald-500/15 to-transparent" />
                <ol className="space-y-3">
                  {plan.hops.map((hop, idx) => {
                    const isEnd = idx === plan.hops.length - 1;
                    const secColor = getSecColor(hop.securityStatus);
                    const kills = hop.pvpKillsLastHour ?? 0;
                    const isVeryHot = kills >= VERY_HOT_THRESHOLD;
                    const isHot = !isVeryHot && kills >= HOT_THRESHOLD;
                    const dotlanUrl = `https://evemaps.dotlan.net/system/${encodeURIComponent(
                      hop.name,
                    )}`;
                    const zkillUrl = `https://zkillboard.com/system/${hop.systemId}/`;

                    const legForHop = routeLegs.find(
                      (leg) =>
                        hop.index >= leg.startIndex && hop.index <= leg.endIndex,
                    );
                    const isLegStart =
                      !!legForHop && hop.index === legForHop.startIndex;

                    return (
                      <li
                        key={`${hop.systemId}-${hop.index}`}
                        id={`route-hop-${hop.index}`}
                        className="relative flex items-start gap-3 pl-6"
                      >
                        {isLegStart && legForHop && routeLegs.length > 1 && (
                          <div className="absolute -top-4 left-6 mb-1 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-zinc-500">
                            Leg {routeLegs.indexOf(legForHop) + 1}: {legForHop.from} → {" "}
                            {legForHop.to}
                          </div>
                        )}
                        <span
                          className={`absolute left-0 mt-1 h-2.5 w-2.5 rounded-full border ${
                            hop.viaWormhole ? "ring-2 ring-violet-400/80 " : ""
                          }${
                            isVeryHot
                              ? "border-rose-500 bg-rose-500 shadow-[0_0_18px_rgba(248,113,113,0.95)]"
                              : isHot
                                ? "border-amber-400 bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]"
                                : "border-emerald-400/70 bg-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                          }`}
                        />
                        <div
                          className={`flex flex-1 flex-col rounded-lg border bg-zinc-950/60 px-3 py-2 ${
                            playIndex === hop.index
                              ? "border-emerald-500/80 shadow-[0_0_18px_rgba(16,185,129,0.6)]"
                              : "border-zinc-800/80"
                          }`}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                Jump {hop.index}
                              </span>
                              <span className="font-medium text-zinc-100">
                                {hop.name}
                              </span>
                              <span className="text-[0.7rem] text-zinc-500">
                                ({hop.region})
                              </span>
                              {hop.viaWormhole && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/60 bg-violet-500/10 px-1.5 py-0.5 text-[0.65rem] text-violet-200">
                                  <span>Wormhole jump</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[0.7rem] ${secColor}`}
                              >
                                <Shield className="h-3 w-3" />
                                <span>{formatSec(hop.securityStatus)}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleInspectHop(hop)}
                                className="text-[0.7rem] text-zinc-500 hover:text-emerald-300"
                              >
                                {inspectedHopIndex === hop.index
                                  ? "Hide intel"
                                  : "Inspect"}
                              </button>
                            </div>
                          </div>
                          {viewMode === "detailed" && (
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[0.7rem] text-zinc-500">
                                {isEnd
                                  ? "Destination reached."
                                  : "Warp to next gate and prepare to jump."}
                              </p>
                              <p
                                className={`text-[0.7rem] ${
                                  isVeryHot
                                    ? "text-rose-300"
                                    : isHot
                                      ? "text-amber-300"
                                      : "text-zinc-500"
                                }`}
                              >
                                PvP last hour: {" "}
                                {hop.pvpKillsLastHour !== null
                                  ? hop.pvpKillsLastHour.toLocaleString()
                                  : "?"}
                              </p>
                              <p className="text-[0.7rem] text-zinc-500">
                                PvP last 24h: {" "}
                                {hop.pvpKillsLast24h !== null
                                  ? hop.pvpKillsLast24h.toLocaleString()
                                  : "?"}
                              </p>
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.7rem] text-zinc-500">
                            <a
                              href={dotlanUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-emerald-300"
                            >
                              <MapIcon className="h-3 w-3" />
                              <span>Dotlan</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <a
                              href={zkillUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-emerald-300"
                            >
                              <Activity className="h-3 w-3" />
                              <span>zKill</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          {inspectedHopIndex === hop.index && (
                            <div className="mt-2 rounded-md border border-zinc-800/80 bg-zinc-950/80 px-3 py-2 text-[0.7rem] text-zinc-300">
                              {inspectedLoading && (
                                <p className="text-zinc-400">
                                  Loading inline system intel...
                                </p>
                              )}
                              {inspectedError && (
                                <p className="text-rose-300">{inspectedError}</p>
                              )}
                              {inspectedIntel && (
                                <>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <p className="font-medium text-zinc-100">
                                        {inspectedIntel.name}
                                        {inspectedIntel.securityClass && (
                                          <span className="ml-2 text-[0.65rem] text-zinc-400">
                                            {inspectedIntel.securityClass}
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-zinc-400">
                                        {inspectedIntel.regionName || "Unknown region"}
                                        {" "}
                                        · {" "}
                                        {inspectedIntel.constellationName ||
                                          "Unknown constellation"}
                                      </p>
                                      <p className="text-zinc-400">
                                        Sec: {" "}
                                        <span className="text-zinc-100">
                                          {inspectedIntel.securityStatus !== null
                                            ? inspectedIntel.securityStatus.toFixed(1)
                                            : "?"}
                                        </span>
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-zinc-400">
                                        Jumps last hour: {" "}
                                        <span className="text-zinc-100">
                                          {inspectedIntel.jumpsLastHour !== null
                                            ? inspectedIntel.jumpsLastHour.toLocaleString()
                                            : "?"}
                                        </span>
                                      </p>
                                      <p className="text-zinc-400">
                                        PvP last hour / 24h: {" "}
                                        <span className="text-zinc-100">
                                          {inspectedIntel.pvpKillsLastHour !== null
                                            ? inspectedIntel.pvpKillsLastHour.toLocaleString()
                                            : "?"}
                                          {" "}/ {" "}
                                          {inspectedIntel.pvpKillsLast24h !== null
                                            ? inspectedIntel.pvpKillsLast24h.toLocaleString()
                                            : "?"}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  {inspectedIntel.neighbors.length > 0 && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                      <span className="mr-1 text-zinc-500">
                                        Neighbors:
                                      </span>
                                      {inspectedIntel.neighbors
                                        .slice(0, 8)
                                        .map((n) => (
                                          <span
                                            key={n.systemId}
                                            className="rounded-full border border-zinc-700/70 bg-zinc-900/80 px-2 py-0.5 text-[0.65rem] text-zinc-200"
                                          >
                                            {n.name}
                                          </span>
                                        ))}
                                      {inspectedIntel.neighbors.length > 8 && (
                                        <span className="text-[0.65rem] text-zinc-500">
                                          +
                                          {inspectedIntel.neighbors.length - 8} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {plan.totalJumps > 0 && (
              <div className="flex flex-wrap items-center gap-4 text-[0.7rem] text-zinc-500">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full border border-emerald-400/70 bg-emerald-500/40 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                  <span>Normal route activity</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full border border-amber-400 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                  <span>High PvP (≥ {HOT_THRESHOLD} kills / h)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full border border-rose-500 bg-rose-500 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                  <span>Very high PvP (≥ {VERY_HOT_THRESHOLD} kills / h)</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
