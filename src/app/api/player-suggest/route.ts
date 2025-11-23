import { NextResponse } from "next/server";
import type {
  PlayerSuggestResponse,
} from "@/lib/types/player-intel";

const ESI_BASE = "https://esi.evetech.net/latest";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q || q.length < 2) {
    const body: PlayerSuggestResponse = { results: [] };
    return NextResponse.json(body, { status: 200 });
  }

  try {
    type SearchResponse = {
      character?: number[];
    };

    const search = await getJson<SearchResponse>(
      `${ESI_BASE}/search/?categories=character&search=${encodeURIComponent(
        q,
      )}&strict=false&datasource=tranquility`,
      { cache: "no-store" },
    );

    const characterIds = search.character ?? [];

    if (!characterIds.length) {
      const empty: PlayerSuggestResponse = { results: [] };
      return NextResponse.json(empty, { status: 200 });
    }

    type NamesEntry = {
      id: number;
      name: string;
      category: string;
    };

    const names = await getJson<NamesEntry[]>(
      `${ESI_BASE}/universe/names/?datasource=tranquility`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(characterIds.slice(0, 20)),
        cache: "no-store",
      },
    );

    const results = names
      .filter((n) => n.category === "character")
      .slice(0, 10)
      .map((n) => ({ id: n.id, name: n.name }));

    const body: PlayerSuggestResponse = { results };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("Player suggest failed", err);
    const body: PlayerSuggestResponse = { results: [] };
    return NextResponse.json(body, { status: 502 });
  }
}
