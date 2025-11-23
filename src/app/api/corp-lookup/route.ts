import { NextResponse } from "next/server";
import type { CorpIntel, CorpLookupResponse } from "@/lib/types/corp-intel";
import path from "node:path";

const ESI_BASE = "https://esi.evetech.net/latest";
const ZKILL_BASE = "https://zkillboard.com/api";
const ZKILL_USER_AGENT =
  "https://banthab0mb.github.io/eve_app/ Maintainer: whitewid0w-site";

const STATION_CACHE = new Map<number, string>();
let corpNameCache: Record<string, number> | null = null;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function resolveCorpId(name: string): Promise<number | null> {
  if (!corpNameCache) {
    try {
      const root = process.cwd();
      const fs = await import("node:fs/promises");
      const raw = await fs.readFile(path.join(root, "data", "corporations.json"), "utf8");
      const parsed = JSON.parse(raw) as { id?: number; name?: string }[];
      corpNameCache = {};
      for (const c of parsed) {
        if (typeof c.id === "number" && typeof c.name === "string") {
          corpNameCache[c.name.toLowerCase()] = c.id;
        }
      }
    } catch {
      corpNameCache = {};
    }
  }
  const localId = corpNameCache[name.toLowerCase()];
  if (localId) return localId;

  type UniverseIdsResponse = {
    corporations?: { id: number; name: string }[];
  };

  const payload = JSON.stringify([name]);

  const data = await getJson<UniverseIdsResponse>(
    `${ESI_BASE}/universe/ids/?datasource=tranquility`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
    },
  );

  if (!data.corporations || data.corporations.length === 0) {
    return null;
  }
  return data.corporations[0]?.id ?? null;
}

async function fetchCorpInfo(corpId: number) {
  return getJson<{
    alliance_id?: number;
    ceo_id?: number;
    creator_id?: number;
    date_founded?: string;
    description?: string;
    home_station_id?: number;
    member_count?: number;
    name?: string;
    shares?: number;
    tax_rate?: number;
    ticker?: string;
    url?: string;
    war_eligible?: boolean;
  }>(`${ESI_BASE}/corporations/${corpId}/?datasource=tranquility`, { cache: "no-store" });
}

async function fetchAllianceName(allianceId: number | null): Promise<string | null> {
  if (!allianceId) return null;
  try {
    const res = await getJson<{ id: number; name: string }[]>(
      `${ESI_BASE}/universe/names/?datasource=tranquility`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([allianceId]),
        cache: "no-store",
      },
    );
    return res[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function resolveNames(ids: number[]): Promise<Record<number, string>> {
  if (!ids.length) return {};
  try {
    const res = await fetch(`${ESI_BASE}/universe/names/?datasource=tranquility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { id: number; name: string }[];
    const map: Record<number, string> = {};
    for (const item of data) {
      if (typeof item.id === "number" && typeof item.name === "string") {
        map[item.id] = item.name;
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchDotlanDescription(name: string): Promise<string | null> {
  try {
    const slug = encodeURIComponent(name.replace(/\s+/g, "_"));
    const res = await fetch(`https://evemaps.dotlan.net/corp/${slug}`, {
      cache: "no-store",
      headers: { "User-Agent": "WHITEWID0W-corp-intel" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const htmlLower = html.toLowerCase();

    const decodeEntities = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");

    const strip = (s: string) =>
      decodeEntities(
        s
          .replace(/<[^>]+>/g, "")
          .replace(/\r?\n\s*/g, "\n")
          .replace(/\u00a0/g, " "),
      )
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

    // Primary: grab the description section inside corpprofile, preferring the <h2>Description</h2> block.
    const marker = '<div class="corpprofile">';
    const start = htmlLower.indexOf(marker);
    if (start !== -1) {
      const after = html.slice(start + marker.length);
      const end = after.toLowerCase().indexOf("</div>");
      const block = end !== -1 ? after.slice(0, end) : after;

      // Narrow to the Description section if present.
      const descHeader = block.toLowerCase().indexOf("<h2>description");
      const section =
        descHeader !== -1
          ? (() => {
              const tail = block.slice(descHeader);
              const nextHeader = tail.toLowerCase().indexOf("<h2", 4);
              return nextHeader !== -1 ? tail.slice(0, nextHeader) : tail;
            })()
          : block;

      const normalized = section
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li>/gi, "- ")
        .replace(/<\/div>/gi, "\n");
      const text = strip(normalized);
      if (text) return text.slice(0, 1200);
    }

    // Fallback: meta og:description or name description.
    const ogIdx = htmlLower.indexOf('property="og:description"');
    if (ogIdx !== -1) {
      const contentIdx = htmlLower.indexOf('content="', ogIdx);
      if (contentIdx !== -1) {
        const contentStart = contentIdx + 'content="'.length;
        const contentEnd = html.indexOf('"', contentStart);
        if (contentEnd !== -1) {
          const raw = html.slice(contentStart, contentEnd);
          const text = strip(raw);
          if (text) return text.slice(0, 1200);
        }
      }
    }

    // Fallback: meta description tag.
    const metaIdx = html.indexOf('name="description"');
    if (metaIdx !== -1) {
      const contentIdx = html.lastIndexOf('content="', metaIdx);
      if (contentIdx !== -1) {
        const contentStart = contentIdx + 'content="'.length;
        const contentEnd = html.indexOf('"', contentStart);
        if (contentEnd !== -1) {
          const raw = html.slice(contentStart, contentEnd);
          const text = strip(raw);
          if (text) return text;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveStationName(stationId: number | null): Promise<string | null> {
  if (!stationId) return null;
  if (STATION_CACHE.has(stationId)) return STATION_CACHE.get(stationId) ?? null;

  // Structures cannot be resolved without auth; give a friendly label.
  if (stationId >= 1_000_000_000) {
    const label = `Upwell structure (${stationId})`;
    STATION_CACHE.set(stationId, label);
    return label;
  }

  try {
    const station = await getJson<{ name?: string }>(
      `${ESI_BASE}/universe/stations/${stationId}/?datasource=tranquility`,
      { cache: "force-cache" },
    );
    const name = station.name ?? `Station ${stationId}`;
    STATION_CACHE.set(stationId, name);
    return name;
  } catch {
    const fallback = `Station ${stationId}`;
    STATION_CACHE.set(stationId, fallback);
    return fallback;
  }
}

async function fetchZkillCount(
  corpId: number,
  type: "kills" | "losses",
  pastSeconds: number,
): Promise<number> {
  try {
    const res = await fetch(
      `${ZKILL_BASE}/${type}/corporationID/${corpId}/pastSeconds/${pastSeconds}/`,
      {
        headers: { "User-Agent": ZKILL_USER_AGENT },
        cache: "no-store",
      },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

async function fetchZkillStats(corpId: number) {
  try {
    const res = await fetch(`${ZKILL_BASE}/stats/corporationID/${corpId}/`, {
      headers: { "User-Agent": ZKILL_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      iskDestroyed?: number;
      iskLost?: number;
      dangerRatio?: number;
      gangRatio?: number;
      topLists?: unknown;
    };
  } catch {
    return null;
  }
}

function extractTop(
  topLists: unknown,
  types: string | string[],
  nameKey: string,
  idKey: string,
): { id: number; name: string; kills: number }[] {
  if (!Array.isArray(topLists)) return [];
  const typeArr = Array.isArray(types) ? types : [types];
  const entry = topLists.find(
    (t): t is { type?: unknown; values?: unknown[] } =>
      !!t && typeof t === "object" && typeArr.includes((t as { type?: unknown }).type as string),
  );
  if (!entry || !Array.isArray(entry.values)) return [];
  return entry.values
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const rec = v as Record<string, unknown>;
      const idVal = rec[idKey];
      const nameVal = rec[nameKey];
      const killsVal = rec.kills;
      if (typeof idVal !== "number" || typeof nameVal !== "string" || typeof killsVal !== "number") return null;
      return { id: idVal, name: nameVal, kills: killsVal };
    })
    .filter((v): v is { id: number; name: string; kills: number } => Boolean(v))
    .slice(0, 5);
}

async function fetchRecentAggregates(corpId: number, pastSeconds = 30 * 24 * 60 * 60) {
  try {
    const fetchMails = async (type: "kills" | "losses") => {
      const res = await fetch(
        `${ZKILL_BASE}/${type}/corporationID/${corpId}/pastSeconds/${pastSeconds}/`,
        { headers: { "User-Agent": ZKILL_USER_AGENT }, cache: "no-store" },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? json : [];
    };

    const [kills, losses] = await Promise.all([fetchMails("kills"), fetchMails("losses")]);
    if (!kills.length && !losses.length) return null;

    const sysKills = new Map<number, number>();
    const sysLosses = new Map<number, number>();
    const shipKills = new Map<number, number>();
    const shipLosses = new Map<number, number>();
    const memberKills = new Map<number, number>();
    const memberLosses = new Map<number, number>();
    const idSet = new Set<number>();
    let iskKilledRecent = 0;
    let iskLostRecent = 0;

    type ZKillAttacker = {
      character_id?: number;
      corporation_id?: number;
    };

    type ZKillVictim = {
      ship_type_id?: number;
      character_id?: number;
    };

    type ZKillmail = {
      zkb?: { totalValue?: number };
      victim?: ZKillVictim;
      attackers?: ZKillAttacker[];
      solar_system_id?: number;
    };

    const processKillmail = (km: ZKillmail, asLoss: boolean) => {
      const victim = km.victim ?? {};
      const attackers = Array.isArray(km.attackers) ? km.attackers : [];
      const solarSystemId = typeof km.solar_system_id === "number" ? km.solar_system_id : null;
      const victimShip = typeof victim.ship_type_id === "number" ? victim.ship_type_id : null;
      const victimChar = typeof victim.character_id === "number" ? victim.character_id : null;

      if (asLoss) {
        if (solarSystemId) sysLosses.set(solarSystemId, (sysLosses.get(solarSystemId) ?? 0) + 1);
        if (victimShip) shipLosses.set(victimShip, (shipLosses.get(victimShip) ?? 0) + 1);
        if (victimChar) memberLosses.set(victimChar, (memberLosses.get(victimChar) ?? 0) + 1);
        if (km.zkb && typeof km.zkb.totalValue === "number") {
          iskLostRecent += km.zkb.totalValue;
        }
      } else {
        if (solarSystemId) sysKills.set(solarSystemId, (sysKills.get(solarSystemId) ?? 0) + 1);
        if (victimShip) shipKills.set(victimShip, (shipKills.get(victimShip) ?? 0) + 1);
        for (const atk of attackers) {
          if (atk && atk.corporation_id === corpId && typeof atk.character_id === "number") {
            memberKills.set(atk.character_id, (memberKills.get(atk.character_id) ?? 0) + 1);
          }
        }
        if (km.zkb && typeof km.zkb.totalValue === "number") {
          iskKilledRecent += km.zkb.totalValue;
        }
      }
    };

    for (const raw of kills) {
      if (raw && typeof raw === "object") processKillmail(raw as ZKillmail, false);
    }
    for (const raw of losses) {
      if (raw && typeof raw === "object") processKillmail(raw as ZKillmail, true);
    }

    const collectIds = (...maps: Map<number, number>[]) => {
      for (const m of maps) for (const id of m.keys()) idSet.add(id);
    };
    collectIds(sysKills, sysLosses, shipKills, shipLosses, memberKills, memberLosses);

    const names = await resolveNames(Array.from(idSet));
    const toTop = (m: Map<number, number>, label: "kills" | "losses" = "kills") =>
      Array.from(m.entries())
        .map(([id, count]) => ({ id, name: names[id] ?? `${label === "kills" ? "ID" : "Loss"} ${id}`, kills: count }))
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 5);

    return {
      topSystems: toTop(sysKills),
      topSystemsLost: toTop(sysLosses, "losses"),
      topShips: toTop(shipKills),
      topShipsLost: toTop(shipLosses, "losses"),
      topMembers: toTop(memberKills),
      topMembersLost: toTop(memberLosses, "losses"),
      iskKilledRecent,
      iskLostRecent,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { name?: unknown };
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    const resp: CorpLookupResponse = { ok: false, error: { message: "Invalid JSON body." } };
    return NextResponse.json(resp, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    const resp: CorpLookupResponse = { ok: false, error: { message: "Name is required." } };
    return NextResponse.json(resp, { status: 400 });
  }

  try {
    const corpId = await resolveCorpId(name);
    if (!corpId) {
      const resp: CorpLookupResponse = { ok: false, error: { message: "Corporation not found." } };
      return NextResponse.json(resp, { status: 404 });
    }

    const [corpInfo, kills7d, losses7d] = await Promise.all([
      fetchCorpInfo(corpId),
      fetchZkillCount(corpId, "kills", 7 * 24 * 60 * 60),
      fetchZkillCount(corpId, "losses", 7 * 24 * 60 * 60),
    ]);

    let kills30d = kills7d;
    let losses30d = losses7d;
    if (kills7d === 0 && losses7d === 0) {
      const [k30, l30] = await Promise.all([
        fetchZkillCount(corpId, "kills", 30 * 24 * 60 * 60),
        fetchZkillCount(corpId, "losses", 30 * 24 * 60 * 60),
      ]);
      kills30d = k30;
      losses30d = l30;
    }

    const stats = await fetchZkillStats(corpId);
    const allianceName = await fetchAllianceName(corpInfo.alliance_id ?? null);
    const names = await resolveNames(
      [corpInfo.ceo_id, corpInfo.home_station_id].filter((n): n is number => typeof n === "number"),
    );
    const stationName = await resolveStationName(corpInfo.home_station_id ?? null);
    const externalDescription = await fetchDotlanDescription(corpInfo.name ?? name);
    let aggregates = await fetchRecentAggregates(corpId, 30 * 24 * 60 * 60);
    if (!aggregates) {
      aggregates = await fetchRecentAggregates(corpId, 90 * 24 * 60 * 60);
    }

    const intel: CorpIntel = {
      id: corpId,
      name: corpInfo.name ?? name,
      ticker: corpInfo.ticker ?? null,
      allianceId: corpInfo.alliance_id ?? null,
      allianceName,
      ceoId: corpInfo.ceo_id ?? null,
      ceoName: corpInfo.ceo_id ? names[corpInfo.ceo_id] ?? null : null,
      memberCount: corpInfo.member_count ?? null,
      taxRate: corpInfo.tax_rate ?? null,
      dateFounded: corpInfo.date_founded ?? null,
      description: corpInfo.description ?? null,
      externalDescription,
      homeStationId: corpInfo.home_station_id ?? null,
      homeStationName: stationName,
      logo: `https://images.evetech.net/corporations/${corpId}/logo`,
      warEligible: corpInfo.war_eligible ?? null,
      kills7d,
      losses7d,
      kills30d,
      losses30d,
      iskDestroyed: stats?.iskDestroyed ?? null,
      iskLost: stats?.iskLost ?? null,
      iskDestroyedRecent: null,
      iskLostRecent: null,
      dangerRatio: stats?.dangerRatio ?? null,
      gangRatio: stats?.gangRatio ?? null,
      topShips: extractTop(stats?.topLists, ["shipType", "shipsDestroyed"], "shipTypeName", "shipTypeID"),
      topShipsLost: extractTop(stats?.topLists, "shipsLost", "shipTypeName", "shipTypeID"),
      topSystems: extractTop(stats?.topLists, ["solarSystem", "systemsDestroyed"], "solarSystemName", "solarSystemID"),
      topSystemsLost: extractTop(stats?.topLists, "systemsLost", "solarSystemName", "solarSystemID"),
      topMembers: extractTop(stats?.topLists, ["character", "charactersDestroyed"], "characterName", "characterID"),
      topMembersLost: extractTop(stats?.topLists, "charactersLost", "characterName", "characterID"),
    };
    if (aggregates) {
      if (!intel.topSystems.length && aggregates.topSystems.length) {
        intel.topSystems = aggregates.topSystems;
      }
      if (aggregates.topSystemsLost.length) {
        intel.topSystemsLost = aggregates.topSystemsLost;
      }
      if (!intel.topShips.length && aggregates.topShips.length) {
        intel.topShips = aggregates.topShips;
      }
      if (aggregates.topShipsLost.length) {
        intel.topShipsLost = aggregates.topShipsLost;
      }
      if (!intel.topMembers.length && aggregates.topMembers.length) {
        intel.topMembers = aggregates.topMembers;
      }
      if (aggregates.topMembersLost.length) {
        intel.topMembersLost = aggregates.topMembersLost;
      }
      intel.iskDestroyedRecent = aggregates.iskKilledRecent ?? intel.iskDestroyedRecent ?? null;
      intel.iskLostRecent = aggregates.iskLostRecent ?? intel.iskLostRecent ?? null;
    }

    const resp: CorpLookupResponse = { ok: true, data: intel };
    return NextResponse.json(resp);
  } catch (err) {
    console.error("Corp lookup failed", err);
    const resp: CorpLookupResponse = { ok: false, error: { message: "Lookup failed. Try again." } };
    return NextResponse.json(resp, { status: 500 });
  }
}
