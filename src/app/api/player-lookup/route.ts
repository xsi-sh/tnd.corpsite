import { NextResponse } from "next/server";
import type {
  ActivityHeatmap,
  CharacterIntel,
  CombatStats,
  PlayerLookupError,
  PlayerLookupResponse,
  PlayerTopListItem,
} from "@/lib/types/player-intel";

const ESI_BASE = "https://esi.evetech.net/latest";
const ZKILL_CHARACTER_URL =
  "https://zkillboard.com/api/kills/characterID" as const;
const ZKILL_CHARACTER_LOSSES_URL =
  "https://zkillboard.com/api/losses/characterID" as const;
const ZKILL_STATS_URL =
  "https://zkillboard.com/api/stats/characterID" as const;
const ZKILL_MAX_PAST_SECONDS = 7 * 24 * 60 * 60;
const ZKILL_USER_AGENT =
  "https://banthab0mb.github.io/eve_app/ Maintainer: whitewid0w-site";

type CacheEntry = {
  intel: CharacterIntel;
  timestamp: number;
};

const LOOKUP_CACHE = new Map<string, CacheEntry>();
const LOOKUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CharacterZkillSnapshot = {
  combatStats: CombatStats | null;
  topShips: PlayerTopListItem[];
  topSystems: PlayerTopListItem[];
  activity: ActivityHeatmap | null;
  lastApiUpdate: string | null;
};

type CharacterZkillCacheEntry = {
  snapshot: CharacterZkillSnapshot;
  timestamp: number;
};

const CHARACTER_ZKILL_CACHE = new Map<number, CharacterZkillCacheEntry>();
const CHARACTER_ZKILL_TTL_MS = 120 * 1000; // 2 minutes

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function resolveCharacterId(name: string): Promise<number | null> {
  type UniverseIdsResponse = {
    characters?: { id: number; name: string }[];
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
      cache: "no-store",
    },
  );

  if (!data.characters || data.characters.length === 0) {
    return null;
  }

  return data.characters[0]?.id ?? null;
}

type ZKillEntry = {
  zkb?: {
    npc?: boolean;
  };
};

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
  let max =
    typeof act.max === "number"
      ? act.max
      : null;

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
): PlayerTopListItem[] {
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
    .filter((v): v is PlayerTopListItem => Boolean(v))
    .slice(0, 5);
}

async function getCharacterZkillStats(characterId: number): Promise<CharacterZkillSnapshot> {
  const now = Date.now();
  const cached = CHARACTER_ZKILL_CACHE.get(characterId);
  if (cached && now - cached.timestamp < CHARACTER_ZKILL_TTL_MS) {
    return cached.snapshot;
  }

  try {
    const res = await fetch(`${ZKILL_STATS_URL}/${characterId}/`, {
      cache: "no-store",
      headers: { "User-Agent": ZKILL_USER_AGENT },
    });

    if (!res.ok) {
      return {
        combatStats: null,
        topShips: [],
        topSystems: [],
        activity: null,
        lastApiUpdate: null,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const topLists = data.topLists;
    const topShips = extractTopList(
      topLists,
      "shipType",
      "shipTypeID",
      "shipName",
      "groupName",
    );
    const topSystems = extractTopList(
      topLists,
      "solarSystem",
      "solarSystemID",
      "solarSystemName",
    );

    const combatStats: CombatStats = {
      lifetimeKills:
        typeof data.shipsDestroyed === "number" ? data.shipsDestroyed : null,
      lifetimeLosses:
        typeof data.shipsLost === "number" ? data.shipsLost : null,
      iskDestroyed:
        typeof data.iskDestroyed === "number" ? data.iskDestroyed : null,
      iskLost: typeof data.iskLost === "number" ? data.iskLost : null,
      soloKills: typeof data.soloKills === "number" ? data.soloKills : null,
      soloLosses: typeof data.soloLosses === "number" ? data.soloLosses : null,
      dangerRatio:
        typeof data.dangerRatio === "number" ? data.dangerRatio : null,
      gangRatio: typeof data.gangRatio === "number" ? data.gangRatio : null,
      averageGangSize:
        typeof data.avgGangSize === "number" ? data.avgGangSize : null,
      efficiency: null,
    };

    combatStats.efficiency =
      combatStats.iskDestroyed !== null &&
      combatStats.iskLost !== null &&
      combatStats.iskDestroyed + combatStats.iskLost > 0
        ? (combatStats.iskDestroyed /
            (combatStats.iskDestroyed + combatStats.iskLost)) *
          100
        : null;

    const activity = normalizeActivityHeatmap(data.activity);

    let lastApiUpdate: string | null = null;
    if (data.info && typeof data.info === "object") {
      const info = data.info as Record<string, unknown>;
      lastApiUpdate =
        parseMongoDate(info.lastApiUpdate) ??
        parseMongoDate(info.lastAffUpdate) ??
        null;
    }

    const snapshot: CharacterZkillSnapshot = {
      combatStats,
      topShips,
      topSystems,
      activity,
      lastApiUpdate,
    };

    CHARACTER_ZKILL_CACHE.set(characterId, {
      snapshot,
      timestamp: Date.now(),
    });

    return snapshot;
  } catch {
    return {
      combatStats: null,
      topShips: [],
      topSystems: [],
      activity: null,
      lastApiUpdate: null,
    };
  }
}

async function getCharacterPvpCount(
  baseUrl: string,
  characterId: number,
  pastSeconds: number,
): Promise<number | null> {
  const windowSeconds = Math.min(pastSeconds, ZKILL_MAX_PAST_SECONDS);

  try {
    const res = await fetch(
      `${baseUrl}/${characterId}/pastSeconds/${windowSeconds}/`,
      {
        cache: "no-store",
        headers: { "User-Agent": ZKILL_USER_AGENT },
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
    return entries.filter((k) => k.zkb && !k.zkb.npc).length;
  } catch {
    return null;
  }
}

async function getCharacterPvpKills(
  characterId: number,
  pastSeconds: number,
): Promise<number | null> {
  return getCharacterPvpCount(ZKILL_CHARACTER_URL, characterId, pastSeconds);
}

async function getCharacterPvpLosses(
  characterId: number,
  pastSeconds: number,
): Promise<number | null> {
  return getCharacterPvpCount(
    ZKILL_CHARACTER_LOSSES_URL,
    characterId,
    pastSeconds,
  );
}

async function getCharacterIntel(characterId: number): Promise<CharacterIntel> {
  type CharacterRes = {
    name: string;
    corporation_id?: number;
    alliance_id?: number;
    security_status?: number;
    birthday?: string;
  };

  type CorporationRes = {
    name?: string;
    ticker?: string;
  };

  type AllianceRes = {
    name?: string;
    ticker?: string;
  };

  const character = await getJson<CharacterRes>(
    `${ESI_BASE}/characters/${characterId}/?datasource=tranquility`,
    { cache: "no-store" },
  );

  let corporation: CharacterIntel["corporation"] = null;
  let alliance: CharacterIntel["alliance"] = null;

  if (typeof character.corporation_id === "number") {
    const corp = await getJson<CorporationRes>(
      `${ESI_BASE}/corporations/${character.corporation_id}/?datasource=tranquility`,
      { cache: "force-cache" },
    );
    corporation = {
      id: character.corporation_id,
      name: corp.name ?? "",
      ticker: corp.ticker ?? null,
    };
  }

  if (typeof character.alliance_id === "number") {
    const alli = await getJson<AllianceRes>(
      `${ESI_BASE}/alliances/${character.alliance_id}/?datasource=tranquility`,
      { cache: "force-cache" },
    );
    alliance = {
      id: character.alliance_id,
      name: alli.name ?? "",
      ticker: alli.ticker ?? null,
    };
  }

  const [
    pvpKillsLast24h,
    pvpKillsLast7d,
    pvpDeathsLast7d,
    zkillStats,
  ] = await Promise.all([
    getCharacterPvpKills(characterId, 86400),
    getCharacterPvpKills(characterId, ZKILL_MAX_PAST_SECONDS),
    getCharacterPvpLosses(characterId, ZKILL_MAX_PAST_SECONDS),
    getCharacterZkillStats(characterId),
  ]);

  const portraitUrl = `https://images.evetech.net/characters/${characterId}/portrait?size=256`;

  return {
    kind: "character",
    id: characterId,
    name: character.name,
    portraitUrl,
    securityStatus:
      typeof character.security_status === "number"
        ? character.security_status
        : null,
    corporation,
    alliance,
    pvpKillsLast24h,
    killsLast7d: pvpKillsLast7d,
    deathsLast7d: pvpDeathsLast7d,
    birthday: character.birthday ?? null,
    combatStats: zkillStats.combatStats,
    topShips: zkillStats.topShips,
    topSystems: zkillStats.topSystems,
    activity: zkillStats.activity,
    zkbLastApiUpdate: zkillStats.lastApiUpdate,
  };
}

export async function POST(req: Request) {
  let payload: { name?: string };

  try {
    payload = (await req.json()) as { name?: string };
  } catch {
    const error: PlayerLookupError = { message: "Invalid JSON body." };
    const body: PlayerLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  const rawName = (payload.name ?? "").trim();

  if (!rawName) {
    const error: PlayerLookupError = { message: "Name is required." };
    const body: PlayerLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const cacheKey = rawName.toLowerCase();
    const now = Date.now();
    const cached = LOOKUP_CACHE.get(cacheKey);

    if (cached && now - cached.timestamp < LOOKUP_TTL_MS) {
      const body: PlayerLookupResponse = { ok: true, data: cached.intel };
      return NextResponse.json(body, { status: 200 });
    }

    const characterId = await resolveCharacterId(rawName);

    if (!characterId) {
      const error: PlayerLookupError = {
        message: `No character found matching "${rawName}".`,
      };
      const body: PlayerLookupResponse = { ok: false, error };
      return NextResponse.json(body, { status: 404 });
    }

    const intel = await getCharacterIntel(characterId);
    LOOKUP_CACHE.set(cacheKey, { intel, timestamp: now });
    const body: PlayerLookupResponse = { ok: true, data: intel };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("Player lookup failed", err);
    const error: PlayerLookupError = {
      message:
        "Player lookup failed. ESI or zKillboard may currently be unavailable.",
    };
    const body: PlayerLookupResponse = { ok: false, error };
    return NextResponse.json(body, { status: 502 });
  }
}
