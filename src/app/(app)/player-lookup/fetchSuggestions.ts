import type {
  PlayerSuggestResponse,
  PlayerSuggestion,
} from "@/lib/types/player-intel";

export async function fetchPlayerSuggestions(
  value: string,
  setSuggestions: (items: PlayerSuggestion[]) => void,
) {
  const query = value.trim();
  if (!query || query.length < 2) {
    setSuggestions([]);
    return;
  }

  try {
    const res = await fetch(`/api/player-suggest?q=${encodeURIComponent(query)}`);
    if (res.status === 429 || !res.ok) {
      setSuggestions([]);
      return;
    }

    const data = (await res.json()) as PlayerSuggestResponse;
    setSuggestions(data.results ?? []);
  } catch {
    setSuggestions([]);
  }
}
