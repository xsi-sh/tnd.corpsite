export type PlayerKind = "character";

export type Affiliation = {
  id: number;
  name: string;
  ticker: string | null;
};

export type PlayerTopListItem = {
  id: number;
  name: string;
  kills: number;
  group: string | null;
};

export type ActivityHeatmap = {
  buckets: { day: number; hour: number; count: number }[];
  max: number | null;
  days: string[];
};

export type CombatStats = {
  lifetimeKills: number | null;
  lifetimeLosses: number | null;
  iskDestroyed: number | null;
  iskLost: number | null;
  soloKills: number | null;
  soloLosses: number | null;
  dangerRatio: number | null;
  gangRatio: number | null;
  averageGangSize: number | null;
  efficiency: number | null;
};

export type CharacterIntel = {
  kind: "character";
  id: number;
  name: string;
  portraitUrl: string | null;
  securityStatus: number | null;
  corporation: Affiliation | null;
  alliance: Affiliation | null;
  pvpKillsLast24h: number | null;
  killsLast7d: number | null;
  deathsLast7d: number | null;
  birthday: string | null;
  combatStats: CombatStats | null;
  topShips: PlayerTopListItem[];
  topSystems: PlayerTopListItem[];
  activity: ActivityHeatmap | null;
  zkbLastApiUpdate: string | null;
};

export type PlayerLookupError = {
  message: string;
};

export type PlayerLookupResponse =
  | { ok: true; data: CharacterIntel }
  | { ok: false; error: PlayerLookupError };

export type PlayerSuggestion = {
  id: number;
  name: string;
};

export type PlayerSuggestResponse = {
  results: PlayerSuggestion[];
};
