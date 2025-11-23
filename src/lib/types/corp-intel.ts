export type CorpSuggestion = { id: number; name: string; ticker?: string | null };

export type CorpIntel = {
  id: number;
  name: string;
  ticker: string | null;
  allianceId: number | null;
  allianceName: string | null;
  ceoName: string | null;
  ceoId: number | null;
  memberCount: number | null;
  taxRate: number | null;
  dateFounded: string | null;
  description: string | null;
  externalDescription: string | null;
  homeStationId: number | null;
  homeStationName: string | null;
  logo: string | null;
  warEligible: boolean | null;
  kills7d: number | null;
  losses7d: number | null;
  kills30d: number | null;
  losses30d: number | null;
  iskDestroyed: number | null;
  iskLost: number | null;
  iskDestroyedRecent: number | null;
  iskLostRecent: number | null;
  dangerRatio: number | null;
  gangRatio: number | null;
  topShips: { id: number; name: string; kills: number }[];
  topShipsLost: { id: number; name: string; kills: number }[];
  topSystems: { id: number; name: string; kills: number }[];
  topSystemsLost: { id: number; name: string; kills: number }[];
  topMembers: { id: number; name: string; kills: number }[];
  topMembersLost: { id: number; name: string; kills: number }[];
};

export type CorpLookupResponse =
  | { ok: true; data: CorpIntel }
  | { ok: false; error: { message: string } };
