import type { SystemSuggestResponse, SystemSuggestion } from "@/lib/types/system-intel";

export async function fetchSuggestions(
  value: string,
  setSuggestions: (items: SystemSuggestion[]) => void,
) {
  const query = value.trim();
  if (!query || query.length < 2) {
    setSuggestions([]);
    return;
  }

  try {
    const res = await fetch(`/api/system-suggest?q=${encodeURIComponent(query)}`);
    if (res.status === 429 || !res.ok) {
      setSuggestions([]);
      return;
    }

    const data = (await res.json()) as SystemSuggestResponse;
    setSuggestions(data.results ?? []);
  } catch {
    setSuggestions([]);
  }
}
