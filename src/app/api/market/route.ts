import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { EsiClient } from "@/lib/esi-sdk";
import type {
  MarketHistoryEntry,
  MarketLookupRequest,
  MarketLookupResponse,
  MarketOrder,
  MarketTypeMeta,
} from "@/lib/types/market";

const STATION_CACHE = new Map<number, string>();

async function resolveLocationName(esi: EsiClient, locationId: number): Promise<string> {
  if (STATION_CACHE.has(locationId)) {
    return STATION_CACHE.get(locationId) as string;
  }

  // Structures (ID > 100M usually, but let's be safe with standard ranges)
  // Stations are usually < 100M, Structures > 100M
  try {
    if (locationId > 100_000_000) {
      // Try structure
      try {
        const { data } = await esi.getUniverseStructure({ structure_id: locationId });
        const name = data.name;
        STATION_CACHE.set(locationId, name);
        return name;
      } catch {
        // Fallback if no rights or not a structure
        const name = `Structure ${locationId}`;
        STATION_CACHE.set(locationId, name);
        return name;
      }
    } else {
      // Station
      const { data } = await esi.getUniverseStation({ station_id: locationId });
      const name = data.name;
      STATION_CACHE.set(locationId, name);
      return name;
    }
  } catch {
    const fallback = `Location ${locationId}`;
    STATION_CACHE.set(locationId, fallback);
    return fallback;
  }
}

async function fetchOrdersForRegion(
  esi: EsiClient,
  regionId: number,
  typeId: number,
  orderType: "buy" | "sell" | "all",
): Promise<MarketOrder[]> {
  try {
    const { data } = await esi.getRegionOrders({
      region_id: regionId,
      type_id: typeId,
      order_type: orderType,
    });

    // Resolve locations concurrently
    const uniqueLocationIds = Array.from(
      new Set(data.map((o) => o.location_id).filter((id) => !STATION_CACHE.has(id)))
    );

    if (uniqueLocationIds.length > 0) {
      await Promise.allSettled(
        uniqueLocationIds.map((id) => resolveLocationName(esi, id))
      );
    }

    return data.map((o) => ({
      orderId: o.order_id,
      price: o.price,
      volumeRemain: o.volume_remain,
      volumeTotal: o.volume_total,
      duration: o.duration,
      isBuy: o.is_buy_order,
      regionId,
      locationId: o.location_id,
      locationName: STATION_CACHE.get(o.location_id) ?? `Location ${o.location_id}`,
    }));
  } catch (e) {
    console.error(`Failed to fetch orders for region ${regionId}`, e);
    return [];
  }
}

export async function POST(req: Request) {
  let payload: MarketLookupRequest;
  try {
    payload = (await req.json()) as MarketLookupRequest;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "Invalid JSON" } }, { status: 400 });
  }

  const regions = Array.isArray(payload.regions)
    ? payload.regions.filter((n) => typeof n === "number")
    : [];
  const typeId = payload.typeId;

  if (!typeId || regions.length === 0) {
    return NextResponse.json(
      { ok: false, error: { message: "Missing typeId or regions" } },
      { status: 400 }
    );
  }

  // Initialize ESI Client with session if available
  const session = await auth();
  const esi = new EsiClient({
    userAgent: process.env.NEXT_PUBLIC_ESI_USER_AGENT || "TND Market Browser",
    token: session?.user?.accessToken, // Use token if logged in for better structure resolution
  });

  try {
    const orderPromises = regions.flatMap((regionId) => [
        fetchOrdersForRegion(esi, regionId, typeId, "sell"),
        fetchOrdersForRegion(esi, regionId, typeId, "buy")
    ]);

    const historyPromise = esi.getRegionHistory({ 
        region_id: regions[0], 
        type_id: typeId 
    }).then(r => r.data).catch(() => []);

    const typeMetaPromise = esi.getUniverseType({ type_id: typeId })
        .then(r => r.data)
        .catch(() => null);

    const [ordersResults, historyData, typeMetaData] = await Promise.all([
        Promise.all(orderPromises),
        historyPromise,
        typeMetaPromise
    ]);

    const allOrders = ordersResults.flat();
    const sellOrders = allOrders.filter(o => !o.isBuy).sort((a, b) => a.price - b.price);
    const buyOrders = allOrders.filter(o => o.isBuy).sort((a, b) => b.price - a.price);

    // Map history to internal type
    const historyEntries = historyData as Array<{
        date: string;
        average: number;
        highest: number;
        lowest: number;
        order_count: number;
        volume: number;
    }>;

    const history: MarketHistoryEntry[] = historyEntries.map(h => ({
        date: h.date,
        average: h.average,
        highest: h.highest,
        lowest: h.lowest,
        orderCount: h.order_count,
        volume: h.volume
    })).slice(-360);

    const typeMeta: MarketTypeMeta | null = typeMetaData ? {
        name: typeMetaData.name,
        group: `Group ${typeMetaData.group_id}`, // We could fetch group name too if needed
        volume: typeMetaData.volume,
        published: typeMetaData.published,
        image: `https://images.evetech.net/types/${typeId}/icon`,
        description: typeMetaData.description
    } : null;

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
    return NextResponse.json(body);

  } catch (err) {
    console.error("Market API Error:", err);
    return NextResponse.json(
      { ok: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
