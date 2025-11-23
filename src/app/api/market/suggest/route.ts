import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

type Suggestion = { id: number; name: string };

let cachedItems: Suggestion[] | null = null;

async function loadLocalItems(): Promise<Suggestion[]> {
  if (cachedItems) return cachedItems;
  try {
    const root = process.cwd();
    const raw = await fs.readFile(path.join(root, "data", "items.json"), "utf8");
    const parsed = JSON.parse(raw) as { id?: number; name?: string }[];
    cachedItems = parsed
      .filter((i) => typeof i.id === "number" && typeof i.name === "string")
      .map((i) => ({ id: i.id as number, name: i.name as string }));
    return cachedItems;
  } catch {
    cachedItems = [];
    return [];
  }
}

async function fetchEsiSuggestions(query: string): Promise<Suggestion[]> {
  try {
    const searchRes = await fetch(
      `https://esi.evetech.net/latest/search/?categories=inventory_type&search=${encodeURIComponent(
        query,
      )}&strict=false&datasource=tranquility`,
      { cache: "no-store" },
    );
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as { inventory_type?: number[] };
    const ids = searchData.inventory_type?.slice(0, 12) ?? [];
    if (!ids.length) return [];

    const namesRes = await fetch(
      "https://esi.evetech.net/latest/universe/names/?datasource=tranquility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids),
        cache: "no-store",
      },
    );
    if (!namesRes.ok) return [];
    const namesData = (await namesRes.json()) as { id: number; name: string }[];
    return namesData
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

  const localItems = await loadLocalItems();
  const normalized = q.toLowerCase();
  const localMatches = localItems
    .filter((i) => i.name.toLowerCase().includes(normalized))
    .slice(0, 6);

  const esiMatches = await fetchEsiSuggestions(q);

  const merged: Suggestion[] = [...localMatches];
  for (const item of esiMatches) {
    if (!merged.find((m) => m.id === item.id || m.name === item.name)) {
      merged.push(item);
    }
  }

  return NextResponse.json({ results: merged.slice(0, 12) });
}
