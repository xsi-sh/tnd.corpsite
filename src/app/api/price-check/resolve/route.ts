import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

type ResolveRequest = { names?: unknown };

async function loadLocalItems(): Promise<Record<string, number>> {
  try {
    const root = process.cwd();
    const raw = await fs.readFile(path.join(root, "data", "items.json"), "utf8");
    const parsed = JSON.parse(raw) as { id?: number; name?: string }[];
    const map: Record<string, number> = {};
    for (const item of parsed) {
      if (typeof item.id === "number" && typeof item.name === "string") {
        map[item.name.toLowerCase()] = item.id;
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchEsiIds(names: string[]): Promise<Record<string, number>> {
  if (!names.length) return {};
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(names),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { inventory_types?: { id: number; name: string }[] };
    const map: Record<string, number> = {};
    for (const item of data.inventory_types ?? []) {
      if (typeof item.id === "number" && typeof item.name === "string") {
        map[item.name.toLowerCase()] = item.id;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  let payload: ResolveRequest;
  try {
    payload = (await req.json()) as ResolveRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const names = Array.isArray(payload.names)
    ? payload.names.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  if (!names.length) {
    return NextResponse.json({ ok: false, error: "names required" }, { status: 400 });
  }

  const lower = names.map((n) => n.toLowerCase());
  const localMap = await loadLocalItems();
  const localHits: Record<string, number> = {};
  const missing: string[] = [];
  for (const name of lower) {
    if (localMap[name]) {
      localHits[name] = localMap[name];
    } else {
      missing.push(name);
    }
  }

  const esiMap = await fetchEsiIds(missing);
  const merged: Record<string, number> = { ...localHits };
  for (const [k, v] of Object.entries(esiMap)) merged[k] = v;

  return NextResponse.json({ ok: true, ids: merged });
}
