export type SystemIntel = {
  name: string;
  systemId: number;
  constellationName: string | null;
  regionName: string | null;
  securityStatus: number | null;
  jumpsLastHour: number | null;
  pvpKillsLastHour: number | null;
  pvpKillsLast24h: number | null;
  pvpKillsLast7d: number | null;
  securityClass: string | null;
  stats: SystemStats | null;
  topShips: SystemTopListItem[];
  topCharacters: SystemTopListItem[];
  topCorporations: SystemTopListItem[];
  topAlliances: SystemTopListItem[];
  activity: ActivityHeatmap | null;
  zkbLastApiUpdate: string | null;
  neighbors: {
    systemId: number;
    name: string;
    securityStatus: number | null;
    jumpsLastHour: number | null;
  }[];
};

export type SystemTopListItem = {
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

export type SystemStats = {
  totalKills: number | null;
  soloKills: number | null;
  shipsDestroyedSolo: number | null;
  iskDestroyed: number | null;
  averageGangSize: number | null;
  gangRatio: number | null;
};

export type SystemLookupError = {
  message: string;
};

export type SystemLookupResponse =
  | { ok: true; data: SystemIntel }
  | { ok: false; error: SystemLookupError };

export type SystemSuggestion = {
  name: string;
  systemId: number;
  constellationName: string | null;
  regionName: string | null;
  securityStatus: number | null;
};

export type SystemSuggestResponse = {
  results: SystemSuggestion[];
};
