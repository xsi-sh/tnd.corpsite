import { NextResponse } from "next/server";
import type { CorpSuggestion } from "@/lib/types/corp-intel";
import fs from "node:fs/promises";
import path from "node:path";

const ESI_BASE = "https://esi.evetech.net/latest";

let corpCache: CorpSuggestion[] | null = null;

async function loadLocalCorps(): Promise<CorpSuggestion[]> {
  if (corpCache) return corpCache;
  try {
    const root = process.cwd();
    const raw = await fs.readFile(path.join(root, "data", "corporations.json"), "utf8");
    const parsed = JSON.parse(raw) as { id?: number; name?: string; ticker?: string }[];
    corpCache = parsed
      .filter((c) => typeof c.id === "number" && typeof c.name === "string")
      .map((c) => ({ id: c.id as number, name: c.name as string, ticker: c.ticker ?? null }));
    return corpCache;
  } catch {
    corpCache = [];
    return corpCache;
  }
}

async function fetchSuggestions(query: string): Promise<CorpSuggestion[]> {
  try {
    const searchRes = await fetch(
      `${ESI_BASE}/search/?categories=corporation&search=${encodeURIComponent(
        query,
      )}&strict=false&datasource=tranquility`,
      { cache: "no-store" },
    );
    if (!searchRes.ok) return [];
    const data = (await searchRes.json()) as { corporation?: number[] };
    const ids = data.corporation?.slice(0, 10) ?? [];
    if (!ids.length) return [];

    const namesRes = await fetch(`${ESI_BASE}/universe/names/?datasource=tranquility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
      cache: "no-store",
    });
    if (!namesRes.ok) return [];
    const names = (await namesRes.json()) as { id: number; name: string }[];
    return names
      .filter((n) => typeof n.id === "number" && typeof n.name === "string")
      .map((n) => ({ id: n.id, name: n.name }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const local = await loadLocalCorps();
  const normalized = q.toLowerCase();
  const localMatches = local
    .filter((c) => c.name.toLowerCase().includes(normalized) || (c.ticker ?? "").toLowerCase().includes(normalized))
    .slice(0, 8);

  const esiMatches = await fetchSuggestions(q);

  const merged: CorpSuggestion[] = [...localMatches];
  for (const item of esiMatches) {
    if (!merged.find((m) => m.id === item.id)) {
      merged.push(item);
    }
  }

  return NextResponse.json({ results: merged.slice(0, 12) });
}
