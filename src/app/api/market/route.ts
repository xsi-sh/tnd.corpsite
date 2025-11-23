import { NextResponse } from "next/server";
import type {
  MarketHistoryEntry,
  MarketLookupRequest,
  MarketLookupResponse,
  MarketOrder,
  MarketTypeMeta,
} from "@/lib/types/market";

const ESI_ROOT = "https://esi.evetech.net/latest";
const STATION_CACHE = new Map<number, string>();

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function resolveLocationName(locationId: number): Promise<string> {
  if (STATION_CACHE.has(locationId)) {
    return STATION_CACHE.get(locationId) as string;
  }

  // Structures require auth; use a generic label.
  if (locationId >= 1_000_000_000) {
    const name = `Structure ${locationId}`;
    STATION_CACHE.set(locationId, name);
    return name;
  }

  try {
    const station = await getJson<{ name?: string }>(
      `${ESI_ROOT}/universe/stations/${locationId}/?datasource=tranquility`,
      { cache: "force-cache" },
    );
    const name = station.name ?? `Station ${locationId}`;
    STATION_CACHE.set(locationId, name);
    return name;
  } catch {
    const fallback = `Station ${locationId}`;
    STATION_CACHE.set(locationId, fallback);
    return fallback;
  }
}

async function fetchOrdersForRegion(
  regionId: number,
  typeId: number,
  orderType: "buy" | "sell",
): Promise<MarketOrder[]> {
  type RawOrder = {
    duration: number;
    is_buy_order: boolean;
    issued: string;
    location_id: number;
    min_volume: number;
    order_id: number;
    price: number;
    range: string;
    type_id: number;
    volume_remain: number;
    volume_total: number;
    system_id?: number;
  };

  try {
    const raw = await getJson<RawOrder[]>(
      `${ESI_ROOT}/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`,
      { cache: "no-store" },
    );

    // Resolve unique station/location names concurrently to avoid N sequential ESI calls.
    const uniqueLocationIds = Array.from(
      new Set(raw.map((o) => o.location_id).filter((id) => !STATION_CACHE.has(id))),
    );

    if (uniqueLocationIds.length > 0) {
      await Promise.all(
        uniqueLocationIds.map(async (locationId) => {
          await resolveLocationName(locationId);
        }),
      );
    }

    const mapped: MarketOrder[] = raw.map((o) => ({
      orderId: o.order_id,
      price: o.price,
      volumeRemain: o.volume_remain,
      volumeTotal: o.volume_total,
      duration: o.duration ?? null,
      isBuy: o.is_buy_order,
      regionId,
      locationId: o.location_id,
      locationName: STATION_CACHE.get(o.location_id) ?? `Station ${o.location_id}`,
    }));

    return mapped;
  } catch {
    return [];
  }
}

async function fetchHistory(regionId: number, typeId: number): Promise<MarketHistoryEntry[]> {
  try {
    const raw = await getJson<MarketHistoryEntry[]>(
      `${ESI_ROOT}/markets/${regionId}/history/?type_id=${typeId}&datasource=tranquility`,
      { cache: "no-store" },
    );
    return raw.slice(-360);
  } catch {
    return [];
  }
}

async function fetchTypeMeta(typeId: number): Promise<MarketTypeMeta | null> {
  try {
    const meta = await getJson<{
      name?: string;
      group_id?: number;
      volume?: number;
      published?: boolean;
    }>(`${ESI_ROOT}/universe/types/${typeId}/?datasource=tranquility`, {
      cache: "force-cache",
    });

    return {
      name: meta.name ?? `Type ${typeId}`,
      group: meta.group_id ? `Group ${meta.group_id}` : null,
      volume: typeof meta.volume === "number" ? meta.volume : null,
      published: typeof meta.published === "boolean" ? meta.published : null,
      image: `https://images.evetech.net/types/${typeId}/icon`,
    };
  } catch {
    return {
      name: `Type ${typeId}`,
      group: null,
      volume: null,
      published: null,
      image: `https://images.evetech.net/types/${typeId}/icon`,
    };
  }
}

export async function POST(req: Request) {
  let payload: MarketLookupRequest;
  try {
    payload = (await req.json()) as MarketLookupRequest;
  } catch {
    const body: MarketLookupResponse = { ok: false, error: { message: "Invalid JSON body." } };
    return NextResponse.json(body, { status: 400 });
  }

  const regions = Array.isArray(payload.regions)
    ? payload.regions.filter((n) => typeof n === "number")
    : [];
  const typeId = payload.typeId;

  if (!typeId || regions.length === 0) {
    const body: MarketLookupResponse = {
      ok: false,
      error: { message: "typeId and at least one region are required." },
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const orderPromises: Promise<MarketOrder[]>[] = [];
    for (const regionId of regions) {
      orderPromises.push(fetchOrdersForRegion(regionId, typeId, "sell"));
      orderPromises.push(fetchOrdersForRegion(regionId, typeId, "buy"));
    }

    const [results, history, typeMeta] = await Promise.all([
      Promise.all(orderPromises),
      fetchHistory(regions[0]!, typeId),
      fetchTypeMeta(typeId),
    ]);

    const sellOrders = results
      .filter((_, idx) => idx % 2 === 0)
      .flat()
      .sort((a, b) => a.price - b.price);
    const buyOrders = results
      .filter((_, idx) => idx % 2 === 1)
      .flat()
      .sort((a, b) => b.price - a.price);

    const body: MarketLookupResponse = {
      ok: true,
      data: {
        sellOrders,
        buyOrders,
        history,
        fetchedAt: new Date().toISOString(),
        typeMeta,
      },
    };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("Market API failed", err);
    const body: MarketLookupResponse = {
      ok: false,
      error: { message: "Market lookup failed. ESI may be unavailable." },
    };
    return NextResponse.json(body, { status: 502 });
  }
}
