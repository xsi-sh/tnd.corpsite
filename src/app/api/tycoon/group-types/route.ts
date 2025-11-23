import { NextResponse } from "next/server";

const TYCOON_BASE = "https://evetycoon.com/api/v1/market";

async function fetchUpstream(url: string) {
  const res = await fetch(url, { cache: "force-cache" });
  const text = await res.text();
  if (res.status === 429) {
    return NextResponse.json({ error: "Upstream rate limit" }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: text || res.statusText }, { status: res.status });
  }
  try {
    const json = JSON.parse(text);
    return NextResponse.json(json, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON from upstream";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const groupId = Number(searchParams.get("groupId"));

  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const endpoint = `${TYCOON_BASE}/groups/${groupId}/types`;
  return fetchUpstream(endpoint);
}
