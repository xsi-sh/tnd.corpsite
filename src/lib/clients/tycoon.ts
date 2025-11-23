import { backoffFetchJson } from "@/lib/utils/apiClient";

const TYCOON_PROXY = "/api/tycoon";

type TycoonStatRow = {
  buy: number | null;
  sell: number | null;
  volume: number | null;
  updated: string | null;
};

type TycoonStatsResponse = {
  regionId: number;
  typeId: number;
  stats: TycoonStatRow;
};

type TycoonOrder = {
  orderId: number;
  isBuyOrder: boolean;
  price: number;
  volumeRemain: number;
  volumeTotal: number;
  regionId: number;
  systemId: number;
  locationId: number;
  range: string;
  issued: number;
  duration: number;
  minVolume: number;
};

type TycoonOrdersResponse = {
  typeId: number;
  orders: TycoonOrder[];
  stationNames?: Record<number, string>;
  structureNames?: Record<number, string>;
  systems?: Record<number, { solarSystemID: number; solarSystemName: string; security: number }>;
  itemType?: {
    typeID: number;
    typeName: string;
    groupID?: number;
    iconID?: number;
    marketGroupID?: number;
    volume?: number;
  };
};

type TycoonHistoryRow = {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  orderCount: number;
  volume: number;
};

type TycoonHistoryResponse = {
  regionId: number;
  typeId: number;
  history: TycoonHistoryRow[];
};

export type TycoonGroup = {
  id: number;
  name: string;
  parentId?: number | null;
};

export type TycoonType = {
  id: number;
  name: string;
};

export async function getTycoonMarketStats(
  regionId: number,
  typeId: number,
  signal?: AbortSignal,
) {
  const endpoint = `${TYCOON_PROXY}/stats?regionId=${regionId}&typeId=${typeId}`;
  return backoffFetchJson<TycoonStatsResponse>(endpoint, { signal }, {
    cacheKey: `tycoon-stats-${regionId}-${typeId}`,
    cacheTtlMs: 2 * 60 * 1000,
  });
}

export async function getTycoonMarketOrders(
  typeId: number,
  regions: number[],
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (regions.length) params.set("regionId", regions[0].toString());
  params.set("typeId", typeId.toString());
  const endpoint = `${TYCOON_PROXY}/orders?${params.toString()}`;
  return backoffFetchJson<TycoonOrdersResponse>(endpoint, { signal }, {
    cacheKey: `tycoon-orders-${typeId}-${regions.join(",")}`,
    cacheTtlMs: 60 * 1000,
  });
}

export async function getTycoonMarketHistory(
  regionId: number,
  typeId: number,
  signal?: AbortSignal,
) {
  const endpoint = `${TYCOON_PROXY}/history?regionId=${regionId}&typeId=${typeId}`;
  return backoffFetchJson<TycoonHistoryResponse>(endpoint, { signal }, {
    cacheKey: `tycoon-history-${regionId}-${typeId}`,
    cacheTtlMs: 5 * 60 * 1000,
  });
}

export async function getTycoonGroups(signal?: AbortSignal) {
  const endpoint = `${TYCOON_PROXY}/groups`;
  return backoffFetchJson<TycoonGroup[]>(endpoint, { signal }, {
    cacheKey: "tycoon-groups",
    cacheTtlMs: 60 * 60 * 1000,
  });
}

export async function getTycoonGroupTypes(groupId: number, signal?: AbortSignal) {
  const endpoint = `${TYCOON_PROXY}/group-types?groupId=${groupId}`;
  return backoffFetchJson<TycoonType[]>(endpoint, { signal }, {
    cacheKey: `tycoon-group-types-${groupId}`,
    cacheTtlMs: 30 * 60 * 1000,
  });
}
