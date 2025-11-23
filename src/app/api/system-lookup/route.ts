import { NextResponse } from "next/server";
import type {
  ActivityHeatmap,
  SystemIntel,
  SystemLookupError,
  SystemLookupResponse,
  SystemStats,
  SystemTopListItem,
} from "@/lib/types/system-intel";

type ZKillEntry = {
  zkb?: {
    npc?: boolean;
    hash?: string;
  };
  killmail_id?: number;
  killmail_time?: string;
  attackers?: {
    character_id?: number;
    character_name?: string;
    corporation_id?: number;
    corporation_name?: string;
    alliance_id?: number;
    alliance_name?: string;
  }[];
};

const ESI_BASE = "https://esi.evetech.net/latest";
const ZKILL_SYSTEM_URL =
  "https://zkillboard.com/api/kills/systemID" as const;
const ZKILL_STATS_URL =
  "https://zkillboard.com/api/stats/solarSystemID" as const;
const ZKILL_MAX_PAST_SECONDS = 7 * 24 * 60 * 60;
const ZKILL_USER_AGENT =
  "https://banthab0mb.github.io/eve_app/ Maintainer: whitewid0w-site";
const FALLBACK_PAGES = 3;
const FALLBACK_LOOKBACK_SECONDS = 60 * 24 * 60 * 60; // 60 days
const FALLBACK_PVP_30D_SECONDS = 30 * 24 * 60 * 60;

type CacheEntry = {
  intel: SystemIntel;
  timestamp: number;
};

// Very small in-memory cache to avoid hammering ESI/zKillboard
// for repeated lookups of the same system name while the server
// instance stays warm.
const LOOKUP_CACHE = new Map<string, CacheEntry>();
const LOOKUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

type SystemZkillSnapshot = {
  stats: SystemStats | null;
  topShips: SystemTopListItem[];
  topCharacters: SystemTopListItem[];
  topCorporations: SystemTopListItem[];
  topAlliances: SystemTopListItem[];
  activity: ActivityHeatmap | null;
  lastApiUpdate: string | null;
};

type SystemZkillCacheEntry = {
  snapshot: SystemZkillSnapshot;
  timestamp: number;
};

const SYSTEM_ZKILL_CACHE = new Map<number, SystemZkillCacheEntry>();
const SYSTEM_ZKILL_TTL_MS = 120 * 1000; // 2 minutes

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function parseMongoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (
    value &&
    typeof value === "object" &&
    "$date" in (value as Record<string, unknown>)
  ) {
    const dateObj = (value as Record<string, unknown>).$date;
    if (
      dateObj &&
      typeof dateObj === "object" &&
      "$numberLong" in (dateObj as Record<string, unknown>)
    ) {
      const raw = (dateObj as Record<string, unknown>).$numberLong;
      const parsed = Number.parseInt(String(raw), 10);
      if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
  }

  return null;
}

function normalizeActivityHeatmap(activity: unknown): ActivityHeatmap | null {
  if (!activity || typeof activity !== "object") {
    return null;
  }

  const buckets: ActivityHeatmap["buckets"] = [];
  const act = activity as Record<string, unknown>;
  const daysRaw = act.days;
  const days =
    Array.isArray(daysRaw) && daysRaw.every((d) => typeof d === "string")
      ? (daysRaw as string[])
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let max = typeof act.max === "number" ? act.max : null;

  for (const [dayKey, hoursVal] of Object.entries(act)) {
    if (dayKey === "max" || dayKey === "days") continue;
    const day = Number.parseInt(dayKey, 10);
    if (Number.isNaN(day) || !hoursVal || typeof hoursVal !== "object") {
      continue;
    }

    for (const [hourKey, countVal] of Object.entries(
      hoursVal as Record<string, unknown>,
    )) {
      const hour = Number.parseInt(hourKey, 10);
      const count =
        typeof countVal === "number"
          ? countVal
          : Number.isFinite(countVal as number)
            ? Number(countVal)
            : null;

      if (Number.isNaN(hour) || count === null) continue;
      buckets.push({ day, hour, count });
    }
  }

  if (max === null) {
    max = buckets.reduce((acc, b) => Math.max(acc, b.count), 0);
  }

  if (!buckets.length && (max === null || max === 0)) {
    return null;
  }

  return { buckets, max, days };
}

function extractTopList(
  topLists: unknown,
  type: string,
  idKey: string,
  nameKey: string,
  groupKey?: string,
): SystemTopListItem[] {
  if (!Array.isArray(topLists)) {
    return [];
  }

  const entry = topLists.find(
    (t): t is { type?: unknown; values?: unknown[] } =>
      !!t && typeof t === "object" && (t as { type?: unknown }).type === type,
  );

  const values = entry && Array.isArray(entry.values) ? entry.values : [];

  return values
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const rec = v as Record<string, unknown>;
      const idVal = rec[idKey];
      const nameVal = rec[nameKey];
      const killsVal = rec.kills;
      const groupVal = groupKey ? rec[groupKey] : null;

      if (
        typeof idVal !== "number" ||
        typeof nameVal !== "string" ||
        typeof killsVal !== "number"
      ) {
        return null;
      }

      return {
        id: idVal,
        name: nameVal,
        kills: killsVal,
        group: typeof groupVal === "string" ? groupVal : null,
      };
    })
    .filter((v): v is SystemTopListItem => Boolean(v))
    .slice(0, 5);
}

function aggregateTopFromKills(
  kills: ZKillEntry[],
): {
  topCharacters: SystemTopListItem[];
  topCorporations: SystemTopListItem[];
  topAlliances: SystemTopListItem[];
} {
  const charMap = new Map<number, { name: string; kills: number }>();
  const corpMap = new Map<number, { name: string; kills: number }>();
  const alliMap = new Map<number, { name: string; kills: number }>();

  const bump = (
    map: Map<number, { name: string; kills: number }>,
    id: number | undefined,
    name: string | undefined,
  ) => {
    if (typeof id !== "number" || !name) return;
    const prev = map.get(id);
    map.set(id, { name, kills: (prev?.kills ?? 0) + 1 });
  };

  for (const kill of kills) {
    if (kill.zkb?.npc) continue;
    if (!Array.isArray(kill.attackers)) continue;
    for (const attacker of kill.attackers) {
      bump(charMap, attacker.character_id, attacker.character_name);
      bump(corpMap, attacker.corporation_id, attacker.corporation_name);
      bump(alliMap, attacker.alliance_id, attacker.alliance_name);
    }
  }

  const toTopList = (
    map: Map<number, { name: string; kills: number }>,
  ): SystemTopListItem[] =>
    Array.from(map.entries())
      .sort((a, b) => b[1].kills - a[1].kills)
      .slice(0, 5)
      .map(([id, { name, kills }]) => ({ id, name, kills, group: null }));

  return {
    topCharacters: toTopList(charMap),
    topCorporations: toTopList(corpMap),
    topAlliances: toTopList(alliMap),
  };
}

async function getSystemKillLeadersFallback(systemId: number) {
  try {
    const allKills: ZKillEntry[] = [];
    const killMeta: { id: number; hash: string }[] = [];
    const seenIds = new Set<number>();
    for (let page = 1; page <= FALLBACK_PAGES; page += 1) {
      const res = await fetch(
        `${ZKILL_SYSTEM_URL}/${systemId}/page/${page}/`,
        {
          cache: "no-store",
          headers: { "User-Agent": ZKILL_USER_AGENT },
        },
      );

      if (!res.ok) break;

      const data = (await res.json()) as unknown;
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      const kills = (data as ZKillEntry[]).filter((k) => {
        if (k.zkb?.npc) return false;
        const ts = k.killmail_time ? Date.parse(k.killmail_time) : NaN;
        if (!Number.isNaN(ts)) {
          const cutoff = Date.now() - FALLBACK_LOOKBACK_SECONDS * 1000;
          if (ts < cutoff) return false;
        }
        if (
          typeof k.killmail_id === "number" &&
          typeof k.zkb?.hash === "string" &&
          !seenIds.has(k.killmail_id)
        ) {
          seenIds.add(k.killmail_id);
          killMeta.push({ id: k.killmail_id, hash: k.zkb.hash });
        }
        return true;
      });

      allKills.push(...kills);

      // Stop early if the API returns fewer entries than a full page
      if (kills.length < 50) {
        break;
      }
    }

    if (!allKills.length) {
      return { topCharacters: [], topCorporations: [], topAlliances: [] };
    }

    // Fetch detailed killmails from ESI to capture attackers
    const detailedKills: ZKillEntry[] = [];
    const killIdsToFetch = killMeta.slice(0, 40);
    for (const meta of killIdsToFetch) {
      try {
        const res = await fetch(
          `${ESI_BASE}/killmails/${meta.id}/${meta.hash}/?datasource=tranquility`,
          { cache: "no-store" },
        );
        if (!res.ok) continue;
        const km = (await res.json()) as {
          killmail_id?: number;
          killmail_time?: string;
          attackers?: {
            character_id?: number;
            character_name?: string;
            corporation_id?: number;
            corporation_name?: string;
            alliance_id?: number;
            alliance_name?: string;
          }[];
        };
        detailedKills.push({
          killmail_id: km.killmail_id ?? meta.id,
          killmail_time: km.killmail_time,
          attackers: km.attackers,
          zkb: { npc: false },
        });
      } catch {
        // ignore individual kill failures
      }
    }

    const sourceKills = detailedKills.length > 0 ? detailedKills : allKills;
    return aggregateTopFromKills(sourceKills);
  } catch {
    return { topCharacters: [], topCorporations: [], topAlliances: [] };
  }
}

async function getSystemZkillStats(systemId: number): Promise<SystemZkillSnapshot> {
  const now = Date.now();
  const cached = SYSTEM_ZKILL_CACHE.get(systemId);
  if (cached && now - cached.timestamp < SYSTEM_ZKILL_TTL_MS) {
    return cached.snapshot;
  }

  try {
    const res = await fetch(`${ZKILL_STATS_URL}/${systemId}/`, {
      cache: "no-store",
      headers: { "User-Agent": ZKILL_USER_AGENT },
    });

    if (!res.ok) {
      return {
        stats: null,
        topShips: [],
        topCharacters: [],
        topCorporations: [],
        topAlliances: [],
        activity: null,
        lastApiUpdate: null,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const topLists = data.topLists;

    const stats: SystemStats = {
      totalKills:
        typeof data.shipsDestroyed === "number" ? data.shipsDestroyed : null,
      soloKills: typeof data.soloKills === "number" ? data.soloKills : null,
      shipsDestroyedSolo:
        typeof data.shipsDestroyedSolo === "number"
          ? data.shipsDestroyedSolo
          : null,
      iskDestroyed:
        typeof data.iskDestroyed === "number" ? data.iskDestroyed : null,
      averageGangSize:
        typeof data.avgGangSize === "number" ? data.avgGangSize : null,
      gangRatio: typeof data.gangRatio === "number" ? data.gangRatio : null,
    };

    const topShips = extractTopList(
      topLists,
      "shipType",
      "shipTypeID",
      "shipName",
      "groupName",
    );
    const topCharacters = extractTopList(
      topLists,
      "character",
      "characterID",
      "characterName",
    );
    const topCorporations = extractTopList(
      topLists,
      "corporation",
      "corporationID",
      "corporationName",
    );
    const topAlliances = extractTopList(
      topLists,
      "alliance",
      "allianceID",
      "allianceName",
    );

    const activity = normalizeActivityHeatmap(data.activity);

    let lastApiUpdate: string | null = null;
    if (data.info && typeof data.info === "object") {
      const info = data.info as Record<string, unknown>;
      lastApiUpdate = parseMongoDate(info.lastApiUpdate ?? null);
    }

    const snapshot: SystemZkillSnapshot = {
      stats,
      topShips,
      topCharacters,
      topCorporations,
      topAlliances,
      activity,
      lastApiUpdate,
    };

    SYSTEM_ZKILL_CACHE.set(systemId, { snapshot, timestamp: Date.now() });

    return snapshot;
  } catch {
    return {
      stats: null,
      topShips: [],
      topCharacters: [],
      topCorporations: [],
      topAlliances: [],
      activity: null,
      lastApiUpdate: null,
    };
  }
}

async function resolveSystemId(name: string): Promise<number | null> {
  type UniverseIdsResponse = {
    systems?: { id: number; name: string }[];
  };

  const payload = JSON.stringify([name]);

  const data = await getJson<UniverseIdsResponse>(
    `${ESI_BASE}/universe/ids/?datasource=tranquility`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      // Avoid caching identity lookups aggressively.
      cache: "no-store",
    },
  );

  if (!data.systems || data.systems.length === 0) {
    return null;
  }

  return data.systems[0]?.id ?? null;
}

async function getSystemDetails(systemId: number): Promise<SystemIntel> {
  type SystemRes = {
    name: string;
    security_status?: number;
    security_class?: string | null;
    constellation_id?: number;
    stargates?: number[];
  };

  type ConstellationRes = {
    name?: string;
    region_id?: number;
  };

  type RegionRes = {
    name?: string;
  };

  type JumpsEntry = {
    system_id: number;
    ship_jumps: number;
  };

  type StargateRes = {
    destination?: {
      system_id?: number;
    };
  };

  const system = await getJson<SystemRes>(
    `${ESI_BASE}/universe/systems/${systemId}/?datasource=tranquility`,
    { cache: "no-store" },
  );

  let constellationName: string | null = null;
  let regionName: string | null = null;

  if (system.constellation_id) {
    const constellation = await getJson<ConstellationRes>(
      `${ESI_BASE}/universe/constellations/${system.constellation_id}/?datasource=tranquility`,
      { cache: "force-cache" },
    );
    constellationName = constellation.name ?? null;

    if (constellation.region_id) {
      const region = await getJson<RegionRes>(
        `${ESI_BASE}/universe/regions/${constellation.region_id}/?datasource=tranquility`,
        { cache: "force-cache" },
      );
      regionName = region.name ?? null;
    }
  }

  const jumpsData = await getJson<JumpsEntry[]>(
    `${ESI_BASE}/universe/system_jumps/?datasource=tranquility`,
    { cache: "no-store" },
  );

  const entry = jumpsData.find((j) => j.system_id === systemId);
  const jumpsLastHour = entry?.ship_jumps ?? null;

  const [pvpKillsLastHour, pvpKillsLast24h, pvpKillsLast7d, zkillStats] =
    await Promise.all([
      getPvpKills(systemId, 3600),
      getPvpKills(systemId, 86400),
      getPvpKills(systemId, ZKILL_MAX_PAST_SECONDS),
      getSystemZkillStats(systemId),
    ]);
  const pvpKillsLast7dResolved =
    pvpKillsLast7d === null || pvpKillsLast7d === 0
      ? await getPvpKillsFallback(systemId, FALLBACK_PVP_30D_SECONDS)
      : pvpKillsLast7d;

  let topCharacters = zkillStats.topCharacters;
  let topCorporations = zkillStats.topCorporations;
  let topAlliances = zkillStats.topAlliances;

  if (
    topCharacters.length === 0 ||
    topCorporations.length === 0 ||
    topAlliances.length === 0
  ) {
    const fallback = await getSystemKillLeadersFallback(systemId);
    if (topCharacters.length === 0) topCharacters = fallback.topCharacters;
    if (topCorporations.length === 0)
      topCorporations = fallback.topCorporations;
    if (topAlliances.length === 0) topAlliances = fallback.topAlliances;
  }

  // Derive neighboring systems from stargates
  const neighborIds = new Set<number>();
  if (Array.isArray(system.stargates)) {
    for (const gateId of system.stargates) {
      try {
        const gate = await getJson<StargateRes>(
          `${ESI_BASE}/universe/stargates/${gateId}/?datasource=tranquility`,
          { cache: "force-cache" },
        );
        const destId = gate.destination?.system_id;
        if (typeof destId === "number" && destId !== systemId) {
          neighborIds.add(destId);
        }
      } catch {
        // Ignore individual stargate errors so one bad gate doesn't break lookup
      }
    }
  }

  const neighbors: {
    systemId: number;
    name: string;
    securityStatus: number | null;
    jumpsLastHour: number | null;
  }[] = [];
  for (const neighborId of neighborIds) {
    try {
      const neighborSystem = await getJson<{
        name: string;
        security_status?: number;
      }>(
        `${ESI_BASE}/universe/systems/${neighborId}/?datasource=tranquility`,
        { cache: "force-cache" },
      );
      const neighborEntry = jumpsData.find((j) => j.system_id === neighborId);
      const neighborJumpsLastHour = neighborEntry?.ship_jumps ?? null;

      neighbors.push({
        systemId: neighborId,
        name: neighborSystem.name,
        securityStatus:
          typeof neighborSystem.security_status === "number"
            ? neighborSystem.security_status
            : null,
        jumpsLastHour: neighborJumpsLastHour,
      });
    } catch {
      // Ignore failures for individual neighbors
    }
  }

  return {
    name: system.name,
    systemId,
    constellationName,
    regionName,
    securityStatus:
      typeof system.security_status === "number"
        ? system.security_status
        : null,
    jumpsLastHour,
    pvpKillsLastHour,
    pvpKillsLast24h,
    pvpKillsLast7d: pvpKillsLast7dResolved,
    securityClass: system.security_class ?? null,
    stats: zkillStats.stats,
    topShips: zkillStats.topShips,
    topCharacters,
    topCorporations,
    topAlliances,
    activity: zkillStats.activity,
    zkbLastApiUpdate: zkillStats.lastApiUpdate,
    neighbors,
  };
}

async function getPvpKills(
  systemId: number,
  pastSeconds: number,
): Promise<number | null> {
  const windowSeconds = Math.min(pastSeconds, ZKILL_MAX_PAST_SECONDS);
  try {
    const res = await fetch(
      `${ZKILL_SYSTEM_URL}/${systemId}/pastSeconds/${windowSeconds}/`,
      {
        // Explicitly avoid caching; we want fresh kill data.
        cache: "no-store",
        headers: {
          // zKillboard recommends setting a User-Agent identifying the tool.
          "User-Agent": ZKILL_USER_AGENT,
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
    const pvp = entries.filter((k) => k.zkb && !k.zkb.npc).length;
    return pvp;
  } catch {
    return null;
  }
}

async function getPvpKillsFallback(
  systemId: number,
  lookbackSeconds: number,
  maxPages = 2,
): Promise<number | null> {
  const cutoff = Date.now() - lookbackSeconds * 1000;
  let total = 0;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const res = await fetch(`${ZKILL_SYSTEM_URL}/${systemId}/page/${page}/`, {
        cache: "no-store",
        headers: { "User-Agent": ZKILL_USER_AGENT },
      });

      if (!res.ok) break;

      const data = (await res.json()) as unknown;
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      const kills = data as ZKillEntry[];
      let reachedCutoff = false;

      for (const k of kills) {
        if (k.zkb?.npc) continue;
        const ts = k.killmail_time ? Date.parse(k.killmail_time) : NaN;
        if (!Number.isNaN(ts) && ts < cutoff) {
          reachedCutoff = true;
          continue;
        }
        total += 1;
      }

      if (kills.length < 50 || reachedCutoff) {
        break;
      }
    }

    return total;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let payload: { systemName?: string };

  try {
    payload = (await req.json()) as { systemName?: string };
  } catch {
    const error: SystemLookupError = { message: "Invalid JSON body." };
    const body: SystemLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  const rawName = (payload.systemName ?? "").trim();

  if (!rawName) {
    const error: SystemLookupError = { message: "System name is required." };
    const body: SystemLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const cacheKey = rawName.toLowerCase();
    const now = Date.now();
    const cached = LOOKUP_CACHE.get(cacheKey);

    if (cached && now - cached.timestamp < LOOKUP_TTL_MS) {
      const body: SystemLookupResponse = { ok: true, data: cached.intel };
      return NextResponse.json(body, { status: 200 });
    }

    const systemId = await resolveSystemId(rawName);

    if (!systemId) {
      const error: SystemLookupError = {
        message: `No system found matching "${rawName}".`,
      };
      const body: SystemLookupResponse = { ok: false, error };
      return NextResponse.json(body, { status: 404 });
    }

    const intel = await getSystemDetails(systemId);
    LOOKUP_CACHE.set(cacheKey, { intel, timestamp: now });
    const body: SystemLookupResponse = { ok: true, data: intel };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("System lookup failed", err);
    const error: SystemLookupError = {
      message:
        "System lookup failed. ESI or zKillboard may currently be unavailable.",
    };
    const body: SystemLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 502 });
  }
}
