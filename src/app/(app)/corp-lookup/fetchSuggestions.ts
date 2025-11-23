import type { CorpSuggestion } from "@/lib/types/corp-intel";

export async function fetchCorpSuggestions(
  query: string,
): Promise<CorpSuggestion[]> {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(`/api/corp-lookup/suggest?q=${encodeURIComponent(query)}`);
    if (res.status === 429) {
      return [];
    }
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: CorpSuggestion[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}
