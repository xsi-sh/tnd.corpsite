import { NextResponse } from "next/server";

const TYCOON_BASE = "https://evetycoon.com/api/v1/market";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const typeId = Number(searchParams.get("typeId"));
  const regionId = Number(searchParams.get("regionId"));

  if (!typeId || !regionId) {
    return NextResponse.json({ error: "typeId and regionId are required" }, { status: 400 });
  }

  const endpoint = `${TYCOON_BASE}/history/${regionId}/${typeId}`;
  const res = await fetch(endpoint, { cache: "no-store" });
  const text = await res.text();

  if (res.status === 429) {
    return NextResponse.json({ error: "Upstream rate limit" }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: text || res.statusText }, { status: res.status });
  }

  try {
    const parsed = JSON.parse(text);
    const history = Array.isArray(parsed) ? parsed : parsed.history ?? [];
    return NextResponse.json({ history }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON from upstream";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
