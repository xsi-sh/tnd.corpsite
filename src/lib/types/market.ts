export type MarketOrder = {
  orderId: number;
  price: number;
  volumeRemain: number;
  volumeTotal: number;
  duration: number | null;
  isBuy: boolean;
  regionId: number;
  locationId: number;
  locationName: string | null;
};

export type MarketHistoryEntry = {
  date: string;
  average: number;
  volume: number;
  highest?: number;
  lowest?: number;
  order_count?: number;
};

export type MarketLookupRequest = {
  typeId: number;
  regions: number[];
};

export type MarketTypeMeta = {
  name: string;
  group?: string | null;
  volume?: number | null;
  published?: boolean | null;
  image?: string | null;
  description?: string | null;
};

export type MarketLookupResponse =
  | {
      ok: true;
      data: {
        sellOrders: MarketOrder[];
        buyOrders: MarketOrder[];
        history: MarketHistoryEntry[];
        fetchedAt: string;
        typeMeta: MarketTypeMeta | null;
      };
    }
  | {
      ok: false;
      error: { message: string };
    };
