"use client";

import { useEffect, useState } from "react";

function formatEveTime(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function OnlineBadge() {
  const [players, setPlayers] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  // Start with an empty string so server and client markup match on first render.
  // We'll populate the live EVE time after hydration via useEffect.
  const [eveTime, setEveTime] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("https://esi.evetech.net/latest/status/");
        if (!res.ok) throw new Error("status error");
        const data = (await res.json()) as { players?: number };
        if (!cancelled) {
          setPlayers(typeof data.players === "number" ? data.players : null);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    fetchStatus();

    const id = setInterval(() => {
      if (!cancelled) {
        setEveTime(formatEveTime(new Date()));
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const colorClass =
    status === "ok" ? "bg-emerald-400" : status === "error" ? "bg-red-500" : "bg-zinc-500";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1 text-[0.7rem] text-zinc-200 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      <span className="font-semibold tracking-wide">TQ</span>
      <span className="text-zinc-400">
        {status === "error"
          ? "TQ unreachable"
          : players !== null
          ? `${players.toLocaleString()} online`
          : "status"}
      </span>
      <span className="text-zinc-500">· EVE {eveTime || "--:--:--"}</span>
    </div>
  );
}
