import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { SystemSuggestResponse, SystemSuggestion } from "@/lib/types/system-intel";

// Shape of entries in the root-level systems.json
// {
//   "system": "Tanoo",
//   "system_id": 30000001,
//   "constellation": "San Matar",
//   "region": "Derelik",
//   "security_status": 0.85
// }

type RawSystem = {
  system: string;
  system_id: number;
  constellation?: string;
  region?: string;
  security_status?: number;
};

let systemsCache: RawSystem[] | null = null;

async function loadSystems(): Promise<RawSystem[]> {
  if (systemsCache) return systemsCache;

  const filePath = path.join(process.cwd(), "data", "systems.json");
  const text = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as RawSystem[];
  systemsCache = parsed;
  return parsed;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  if (!q || q.length < 2) {
    const empty: SystemSuggestResponse = { results: [] };
    return NextResponse.json(empty, { status: 200 });
  }

  try {
    const systems = await loadSystems();
    const results: SystemSuggestion[] = systems
      .filter((s) => s.system.toLowerCase().startsWith(q))
      .slice(0, 12)
      .map((s) => ({
        name: s.system,
        systemId: s.system_id,
        constellationName: s.constellation ?? null,
        regionName: s.region ?? null,
        securityStatus:
          typeof s.security_status === "number" ? s.security_status : null,
      }));

    const body: SystemSuggestResponse = { results };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("system-suggest failed", err);
    const body: SystemSuggestResponse = { results: [] };
    return NextResponse.json(body, { status: 500 });
  }
}
