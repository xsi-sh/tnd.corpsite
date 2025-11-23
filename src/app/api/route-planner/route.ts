import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  RouteMode,
  RoutePlan,
  RoutePlannerError,
  RoutePlannerResponse,
} from "@/lib/types/route-planner";

const ZKILL_SYSTEM_URL =
  "https://zkillboard.com/api/kills/systemID" as const;
const ZKILL_MAX_PAST_SECONDS = 7 * 24 * 60 * 60;

type SystemRow = {
  system: string;
  system_id: number;
  constellation: string;
  region: string;
  security_status: number;
};

type StargateRow = {
  gate_id: number;
  from_system: number;
  to_system: number;
};

let systemsCache: SystemRow[] | null = null;
let graphCache: Map<number, number[]> | null = null;
let wormholeGraphCache:
  | { graph: Map<number, number[]>; timestamp: number }
  | null = null;

type KillCacheEntry = {
  kills: number;
  timestamp: number;
};

const ROUTE_KILL_CACHE = new Map<string, KillCacheEntry>();
const ROUTE_KILL_TTL_MS = 60 * 60 * 1000; // 1 hour
const WORMHOLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const LOW_SEC_THRESHOLD = 0.5;

// Cost tuning for PvP-aware routing modes. These weights are heuristic and can
// be adjusted to make the planner more or less aggressive about avoiding or
// seeking dangerous space.
const COST_NULLSEC_AVOID = 3.5;
const COST_LOWSEC_AVOID = 1.5;
const COST_WORMHOLE_AVOID = 2.5;

const COST_NULLSEC_SEEK = -0.6;
const COST_LOWSEC_SEEK = -0.3;
const COST_WORMHOLE_SEEK = -0.5;

async function loadSystemsAndGraph() {
  if (systemsCache && graphCache) return { systems: systemsCache, graph: graphCache };

  const dataRoot = path.join(process.cwd(), "data");
  const [systemsRaw, stargatesRaw] = await Promise.all([
    fs.readFile(path.join(dataRoot, "systems.json"), "utf8"),
    fs.readFile(path.join(dataRoot, "stargates.json"), "utf8"),
  ]);

  const systems = JSON.parse(systemsRaw) as SystemRow[];
  const stargates = JSON.parse(stargatesRaw) as StargateRow[];

  const graph = new Map<number, number[]>();

  function addEdge(from: number, to: number) {
    const current = graph.get(from) ?? [];
    current.push(to);
    graph.set(from, current);
  }

  for (const gate of stargates) {
    addEdge(gate.from_system, gate.to_system);
    addEdge(gate.to_system, gate.from_system);
  }

  systemsCache = systems;
  graphCache = graph;

  return { systems, graph };
}

async function loadWormholeGraph(): Promise<Map<number, number[]>> {
  const now = Date.now();
  if (wormholeGraphCache && now - wormholeGraphCache.timestamp < WORMHOLE_TTL_MS) {
    return wormholeGraphCache.graph;
  }

  type EveScoutSignature = {
    signature_type?: string;
    completed?: boolean;
    remaining_hours?: number;
    out_system_id?: number;
    in_system_id?: number;
  };

  const wormholeGraph = new Map<number, number[]>();

  function addEdge(from: number, to: number) {
    const current = wormholeGraph.get(from) ?? [];
    current.push(to);
    wormholeGraph.set(from, current);
  }

  try {
    const [theraRes, turnurRes] = await Promise.all([
      fetch("https://api.eve-scout.com/v2/public/signatures?system_name=thera"),
      fetch("https://api.eve-scout.com/v2/public/signatures?system_name=turnur"),
    ]);

    if (theraRes.ok) {
      const theraData = (await theraRes.json()) as EveScoutSignature[];
      for (const sig of theraData) {
        if (
          sig.signature_type === "wormhole" &&
          sig.completed &&
          (sig.remaining_hours ?? 0) > 1 &&
          typeof sig.out_system_id === "number" &&
          typeof sig.in_system_id === "number"
        ) {
          addEdge(sig.out_system_id, sig.in_system_id);
          addEdge(sig.in_system_id, sig.out_system_id);
        }
      }
    }

    if (turnurRes.ok) {
      const turnurData = (await turnurRes.json()) as EveScoutSignature[];
      for (const sig of turnurData) {
        if (
          sig.signature_type === "wormhole" &&
          sig.completed &&
          (sig.remaining_hours ?? 0) > 1 &&
          typeof sig.out_system_id === "number" &&
          typeof sig.in_system_id === "number"
        ) {
          addEdge(sig.out_system_id, sig.in_system_id);
          addEdge(sig.in_system_id, sig.out_system_id);
        }
      }
    }
  } catch {
    // If Eve-Scout is unavailable, we simply skip wormholes.
  }

  wormholeGraphCache = { graph: wormholeGraph, timestamp: now };
  return wormholeGraph;
}

async function getPvpKillsForSystem(
  systemId: number,
  pastSeconds: number,
): Promise<number | null> {
  const windowSeconds = Math.min(pastSeconds, ZKILL_MAX_PAST_SECONDS);
  const now = Date.now();
  const cacheKey = `${systemId}:${windowSeconds}`;
  const cached = ROUTE_KILL_CACHE.get(cacheKey);
  if (cached && now - cached.timestamp < ROUTE_KILL_TTL_MS) {
    return cached.kills;
  }

  type ZKillEntry = {
    zkb?: {
      npc?: boolean;
    };
  };

  try {
    const res = await fetch(
      `${ZKILL_SYSTEM_URL}/${systemId}/pastSeconds/${windowSeconds}/`,
      {
        cache: "no-store",
        headers: {
          "User-Agent":
            "https://banthab0mb.github.io/eve_app/ Maintainer: whitewid0w-site",
        },
      },
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      return null;
    }

    const entries = data as ZKillEntry[];
    const kills = entries.filter((k) => k.zkb && !k.zkb.npc).length;
    ROUTE_KILL_CACHE.set(cacheKey, { kills, timestamp: now });
    return kills;
  } catch {
    return null;
  }
}

function findSystemIdByName(systems: SystemRow[], name: string): number | null {
  const lower = name.toLowerCase();
  const row = systems.find((s) => s.system.toLowerCase() === lower);
  return row ? row.system_id : null;
}

function shortestPath(
  graph: Map<number, number[]>,
  wormholeGraph: Map<number, number[]> | null,
  start: number,
  end: number,
  systemsById: Map<number, SystemRow>,
  mode: RouteMode,
): number[] | null {
  if (start === end) return [start];

  const queue: number[][] = [[start]];
  const visited = new Set<number>();

  const isSecureMode = mode === "secure";
  const allowWormholes = !(mode === "secure" || mode === "shortest-gates-only");

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) break;

    const node = path[path.length - 1];
    if (node === end) return path;

    if (visited.has(node)) continue;
    visited.add(node);

    const neighbors: number[] = [];

    const gateNeighbors = graph.get(node) ?? [];
    for (const n of gateNeighbors) neighbors.push(n);

    if (allowWormholes && wormholeGraph) {
      const wormNeighbors = wormholeGraph.get(node) ?? [];
      for (const n of wormNeighbors) neighbors.push(n);
    }

    for (const next of neighbors) {
      if (visited.has(next)) continue;

      if (isSecureMode) {
        const sys = systemsById.get(next);
        if (sys && sys.security_status < LOW_SEC_THRESHOLD) {
          continue;
        }
      }

      queue.push([...path, next]);
    }
  }

  return null;
}

function weightedPath(
  graph: Map<number, number[]>,
  wormholeGraph: Map<number, number[]> | null,
  start: number,
  end: number,
  systemsById: Map<number, SystemRow>,
  mode: RouteMode,
): number[] | null {
  if (start === end) return [start];

  const isAvoid = mode === "pvp-avoid";
  const isSeek = mode === "pvp-seek";
  const allowWormholes = !(mode === "secure" || mode === "shortest-gates-only");

  const dist = new Map<number, number>();
  const prev = new Map<number, number | null>();
  const visited = new Set<number>();

  dist.set(start, 0);
  prev.set(start, null);

  while (true) {
    let current: number | null = null;
    let currentDist = Infinity;

    for (const [node, d] of dist) {
      if (visited.has(node)) continue;
      if (d < currentDist) {
        currentDist = d;
        current = node;
      }
    }

    if (current === null) break;
    if (current === end) break;

    visited.add(current);

    const neighbors: number[] = [];
    const gateNeighbors = graph.get(current) ?? [];
    for (const n of gateNeighbors) neighbors.push(n);

    if (allowWormholes && wormholeGraph) {
      const wormNeighbors = wormholeGraph.get(current) ?? [];
      for (const n of wormNeighbors) neighbors.push(n);
    }

    for (const next of neighbors) {
      if (visited.has(next)) continue;

      const sys = systemsById.get(next);
      const sec = sys?.security_status ?? 0;

      const viaWormhole =
        allowWormholes &&
        !!wormholeGraph &&
        (wormholeGraph.get(current)?.includes(next) ?? false);

      let cost = 1; // base jump cost

      if (sec < 0) {
        // nullsec
        cost += isAvoid ? COST_NULLSEC_AVOID : isSeek ? COST_NULLSEC_SEEK : 0;
      } else if (sec < LOW_SEC_THRESHOLD) {
        // lowsec
        cost += isAvoid ? COST_LOWSEC_AVOID : isSeek ? COST_LOWSEC_SEEK : 0;
      }

      if (viaWormhole) {
        cost += isAvoid ? COST_WORMHOLE_AVOID : isSeek ? COST_WORMHOLE_SEEK : 0;
      }

      if (cost < 0.1) cost = 0.1;

      const alt = currentDist + cost;
      const existing = dist.get(next);
      if (existing === undefined || alt < existing) {
        dist.set(next, alt);
        prev.set(next, current);
      }
    }
  }

  if (!dist.has(end)) return null;

  const path: number[] = [];
  let node: number | null = end;

  while (node !== null && prev.has(node)) {
    path.unshift(node);
    const previous: number | null = prev.get(node) ?? null;
    node = previous;
  }

  if (path.length === 0 || path[0] !== start) return null;

  return path;
}

export async function POST(req: Request) {
  let payload: { originName?: string; destName?: string; mode?: RouteMode };

  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    const error: RoutePlannerError = { message: "Invalid JSON body." };
    const body: RoutePlannerResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  const originRaw = (payload.originName ?? "").trim();
  const destRaw = (payload.destName ?? "").trim();
  const mode: RouteMode = payload.mode ?? "shortest";

  if (!originRaw || !destRaw) {
    const error: RoutePlannerError = {
      message: "Origin and destination system names are required.",
    };
    const body: RoutePlannerResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const { systems, graph } = await loadSystemsAndGraph();

    const systemsById = new Map<number, SystemRow>();
    for (const s of systems) {
      systemsById.set(s.system_id, s);
    }

    const originId = findSystemIdByName(systems, originRaw);
    const destId = findSystemIdByName(systems, destRaw);

    if (!originId || !destId) {
      const error: RoutePlannerError = {
        message: "Origin or destination system not found.",
      };
      const body: RoutePlannerResponse = { ok: false, error };
      return NextResponse.json(body, { status: 404 });
    }

    const allowWormholes = !(mode === "secure" || mode === "shortest-gates-only");
    const wormholeGraph = allowWormholes ? await loadWormholeGraph() : null;

    const useWeighted = mode === "pvp-avoid" || mode === "pvp-seek";

    const pathIds = useWeighted
      ? weightedPath(graph, wormholeGraph, originId, destId, systemsById, mode)
      : shortestPath(graph, wormholeGraph, originId, destId, systemsById, mode);
    if (!pathIds) {
      const error: RoutePlannerError = { message: "No route found." };
      const body: RoutePlannerResponse = { ok: false, error };
      return NextResponse.json(body, { status: 404 });
    }

    const hops = [] as {
      index: number;
      systemId: number;
      name: string;
      region: string;
      securityStatus: number | null;
      pvpKillsLastHour: number | null;
      pvpKillsLast24h: number | null;
      viaWormhole: boolean;
    }[];
    for (let index = 0; index < pathIds.length; index++) {
      const id = pathIds[index];
      const row = systemsById.get(id);
      const killsLastHour = await getPvpKillsForSystem(id, 3600);
      const killsLast24h = await getPvpKillsForSystem(id, 86400);

      let viaWormhole = false;
      if (index > 0 && wormholeGraph) {
        const prevId = pathIds[index - 1];
        const wormNeighbors = wormholeGraph.get(prevId) ?? [];
        viaWormhole = wormNeighbors.includes(id);
      }

      hops.push({
        index,
        systemId: id,
        name: row?.system ?? "Unknown",
        region: row?.region ?? "Unknown",
        securityStatus:
          typeof row?.security_status === "number"
            ? row.security_status
            : null,
        pvpKillsLastHour: killsLastHour,
        pvpKillsLast24h: killsLast24h,
        viaWormhole,
      });
    }

    let lowSecJumps = 0;
    let nullSecJumps = 0;
    let wormholeJumps = 0;
    let maxPvpLastHour: number | null = null;
    let maxPvpLast24h: number | null = null;
    let sumPvpLastHour = 0;
    let sumPvpLast24h = 0;
    let countedPvpJumps = 0;
    let countedPvp24hJumps = 0;

    for (const hop of hops) {
      if (hop.index > 0) {
        const sec = hop.securityStatus ?? 0;
        if (sec < 0) {
          nullSecJumps += 1;
        } else if (sec < LOW_SEC_THRESHOLD) {
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
    if (maxPvpLast24h !== null) {
      riskScore += maxPvpLast24h / 60;
    }

    let overallRisk: "low" | "medium" | "high";
    if (riskScore < 3) {
      overallRisk = "low";
    } else if (riskScore < 8) {
      overallRisk = "medium";
    } else {
      overallRisk = "high";
    }

    const totalJumps = Math.max(0, hops.length - 1);
    const hotspots = hops
      .map((h) => ({
        systemId: h.systemId,
        name: h.name,
        killsLastHour: h.pvpKillsLastHour,
        killsLast24h: h.pvpKillsLast24h,
        score:
          (h.pvpKillsLast24h ?? 0) * 0.6 + (h.pvpKillsLastHour ?? 0) * 0.4,
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

    const plan: RoutePlan = {
      hops,
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

    const body: RoutePlannerResponse = { ok: true, data: plan };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("Route planner failed", err);
    const error: RoutePlannerError = {
      message: "Route planner failed. Static data or routing may be unavailable.",
    };
    const body: RoutePlannerResponse = { ok: false, error };
    return NextResponse.json(body, { status: 502 });
  }
}
