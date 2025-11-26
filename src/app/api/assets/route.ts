import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { EsiClient } from "@/lib/esi-sdk";

export const maxDuration = 60; // Allow longer timeout for fetching all asset pages

type Asset = {
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
  item_id: number;
  is_singleton: boolean;
  location_flag: string;
  name?: string; // Enriched
  location_name?: string; // Enriched
  value?: number; // Enriched
};

const STATION_CACHE = new Map<number, string>();

async function resolveLocationName(esi: EsiClient, locationId: number): Promise<string> {
  if (STATION_CACHE.has(locationId)) {
    return STATION_CACHE.get(locationId) as string;
  }

  try {
    // Determine if it's a station (usually < 100M) or structure (> 100M)
    // This is a heuristic; precise method involves checking range or type
    if (locationId > 100_000_000) {
      try {
        const { data } = await esi.getUniverseStructure({ structure_id: locationId });
        const name = data.name;
        STATION_CACHE.set(locationId, name);
        return name;
      } catch {
        const fallback = `Structure ${locationId}`;
        STATION_CACHE.set(locationId, fallback);
        return fallback;
      }
    } else {
      const { data } = await esi.getUniverseStation({ station_id: locationId });
      const name = data.name;
      STATION_CACHE.set(locationId, name);
      return name;
    }
  } catch {
    // Could be a solar system?
    try {
        const { data } = await esi.getUniverseSystem({ system_id: locationId });
        const name = data.name;
        STATION_CACHE.set(locationId, name);
        return name;
    } catch {
        const fallback = `Location ${locationId}`;
        STATION_CACHE.set(locationId, fallback);
        return fallback;
    }
  }
}

async function resolveTypeNames(esi: EsiClient, typeIds: number[]): Promise<Map<number, string>> {
    // In a real app, we'd batch this to /universe/names or use a static SDE dump.
    // For now, we'll just fetch individual types if not too many, or skip.
    // Actually, let's rely on the frontend to know names or fetch them on demand?
    // No, "Asset Analysis" needs names.
    // Efficient way: postUniverseNames for a batch of IDs.
    
    const uniqueIds = Array.from(new Set(typeIds));
    const nameMap = new Map<number, string>();
    
    // Batch into 500s
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 500) {
        chunks.push(uniqueIds.slice(i, i + 500));
    }

    await Promise.all(chunks.map(async (ids) => {
        try {
            const { data } = await esi.postUniverseNames({ body: ids });
            data.forEach(item => {
                nameMap.set(item.id, item.name);
            });
        } catch (e) {
            console.error("Failed to resolve names", e);
        }
    }));

    return nameMap;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.characterId || !session.user.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const esi = new EsiClient({
    userAgent: process.env.NEXT_PUBLIC_ESI_USER_AGENT || "TND Asset Analysis",
    token: session.user.accessToken,
  });

  try {
    const charId = Number(session.user.characterId);
    let allAssets: Asset[] = [];
    let page = 1;
    const maxPages = 20; // Safety limit

    // 1. Fetch all assets
    while (page <= maxPages) {
      try {
        const { data, headers } = await esi.getCharacterAssets({ character_id: charId, page });
        allAssets = allAssets.concat(data as Asset[]);
        
        // Cast headers to Record to access X-Pages safely
        const h = headers as Record<string, string | undefined>;
        const pages = Number(h["x-pages"] || h["X-Pages"] || 1);
        if (page >= pages) break;
        page++;
      } catch (e) {
        console.warn(`Failed to fetch assets page ${page}`, e);
        break;
      }
    }

    // 2. Fetch Prices & Market Orders
    const [{ data: prices }, { data: orders }] = await Promise.all([
        esi.getMarketsPrices(),
        esi.getCharacterOrders({ character_id: charId })
    ]);
    const priceMap = new Map(prices.map(p => [p.type_id, p.average_price || p.adjusted_price || 0]));

    // Process Sell Orders as Assets
    const sellOrders = orders.filter(o => !o.is_buy_order);
    const buyOrders = orders.filter(o => o.is_buy_order);
    
    const wealthEscrow = buyOrders.reduce((acc, o) => acc + (o.escrow || 0), 0);
    const wealthSellOrders = sellOrders.reduce((acc, o) => acc + (o.price * o.volume_remain), 0);

    const marketAssets: Asset[] = sellOrders.map(o => ({
        type_id: o.type_id,
        quantity: o.volume_remain,
        location_id: o.location_id,
        location_type: 'station', // or structure, resolved later
        item_id: o.order_id, // Use order_id as item_id
        is_singleton: false,
        location_flag: 'MarketListing',
        value: o.price * o.volume_remain // Use listed price
    }));

    // Combine physical assets and market assets
    const combinedAssets = [...allAssets, ...marketAssets];

    // 3. Build Asset Map for Recursive Location Resolution
    const assetMap = new Map<number, Asset>();
    allAssets.forEach(a => assetMap.set(a.item_id, a));

    const findRootLocation = (locationId: number, depth = 0): number => {
        if (depth > 10) return locationId; // Break circles
        const parent = assetMap.get(locationId);
        if (parent) {
            return findRootLocation(parent.location_id, depth + 1);
        }
        return locationId;
    };

    // 4. Resolve Names (Types and Locations)
    const typeIds = combinedAssets.map(a => a.type_id);
    // Resolve locations based on ROOT location (Station/Structure)
    const rootLocationIds = combinedAssets.map(a => findRootLocation(a.location_id));
    
    const [typeNameMap] = await Promise.all([
        resolveTypeNames(esi, typeIds),
        Promise.resolve() 
    ]);

    const uniqueLocationIds = Array.from(new Set(rootLocationIds));
    // Limit location resolution to avoid timeouts if there are hundreds of containers
    const topLocations = uniqueLocationIds.slice(0, 50); // Resolve first 50 unique locations
    
    await Promise.allSettled(topLocations.map(id => resolveLocationName(esi, id)));

    // 5. Enrich Assets
    const enrichedAssets = combinedAssets.map(asset => {
        // If it's a market asset, use its own value, otherwise calc from average
        const totalValue = asset.value ?? ((priceMap.get(asset.type_id) || 0) * asset.quantity);
        const rootLocId = findRootLocation(asset.location_id);
        
        return {
            ...asset,
            name: typeNameMap.get(asset.type_id) || `Type ${asset.type_id}`,
            location_name: STATION_CACHE.get(rootLocId) ?? `Location ${rootLocId}`,
            value: totalValue,
            location_flag: asset.location_flag === 'MarketListing' ? 'Market Listing' : asset.location_flag
        };
    });

    // 6. Sort by value descending
    enrichedAssets.sort((a, b) => (b.value || 0) - (a.value || 0));

    // Calculate Wealth Assets (Physical only)
    // Since enrichedAssets includes Sell Orders, we subtract them or sum filter.
    // enrichedAssets = physical + market
    // wealthSellOrders is already calc'd.
    // wealthEscrow is already calc'd.
    
    const totalWealthIncludingSell = enrichedAssets.reduce((acc, a) => acc + (a.value || 0), 0);
    const wealthAssets = totalWealthIncludingSell - wealthSellOrders;
    
    const totalWealth = totalWealthIncludingSell + wealthEscrow;

    return NextResponse.json({
        assets: enrichedAssets,
        totalWealth,
        wealthAssets,
        wealthSellOrders,
        wealthEscrow,
        itemCount: enrichedAssets.length
    });

  } catch (error) {
    console.error("Asset API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
