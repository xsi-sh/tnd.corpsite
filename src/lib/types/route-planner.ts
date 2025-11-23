export type RouteMode =
  | "shortest"
  | "shortest-gates-only"
  | "secure"
  | "pvp-avoid"
  | "pvp-seek";

export type RouteHop = {
  index: number;
  systemId: number;
  name: string;
  region: string;
  securityStatus: number | null;
  pvpKillsLastHour: number | null;
  pvpKillsLast24h: number | null;
  viaWormhole: boolean;
};

export type RouteRiskSummary = {
  totalJumps: number;
  lowSecJumps: number;
  nullSecJumps: number;
  wormholeJumps: number;
  maxPvpLastHour: number | null;
  avgPvpLastHour: number | null;
  totalPvpLastHour: number | null;
  totalPvpLast24h: number | null;
  hotspots: {
    systemId: number;
    name: string;
    killsLastHour: number | null;
    killsLast24h: number | null;
  }[];
  overallRisk: "low" | "medium" | "high";
};

export type RoutePlan = {
  hops: RouteHop[];
  totalJumps: number;
  risk: RouteRiskSummary;
};

export type RoutePlannerError = {
  message: string;
};

export type RoutePlannerResponse =
  | { ok: true; data: RoutePlan }
  | { ok: false; error: RoutePlannerError };
