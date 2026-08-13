import { GraphStateType } from "../state.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const SEARXNG_API_URL = process.env.SEARXNG_API_URL ?? "https://searxng-railway-production-6a19.up.railway.app/search";

interface SearxngResult {
  title: string;
  url: string;
  content?: string;
  snippet?: string;
  score?: number;
}

interface SearxngResponse {
  query: string;
  results: SearxngResult[];
}

async function searxngSearch(query: string, timeRange?: string): Promise<SearxngResponse> {
  const url = new URL(SEARXNG_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "0");
  if (timeRange) {
    url.searchParams.set("time_range", timeRange);
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearxNG search failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { query?: string; results?: SearxngResult[] };
  return {
    query: data.query ?? query,
    results: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content ?? r.snippet,
      snippet: r.snippet ?? r.content,
      score: r.score,
    })),
  };
}

export async function runSearchNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("run_search", "enter", { queries: state.searchQueries.length, topic: state.topic ?? null });

  const queries = state.searchQueries.length > 0 ? state.searchQueries : [state.topic ?? "foodtech grants circular economy"];
  logStep("run_search", "queries", queries);

  const allResults: SearxngResult[] = [];
  // Dùng toàn bộ queries sinh ra, tối đa 8 để đảm bảo đầy đủ dữ liệu mà vẫn có giới hạn an toàn.
  const searchQueries = queries.slice(0, 8);
  if (searchQueries.length < queries.length) {
    logStep("run_search", "queries truncated", { kept: searchQueries.length, dropped: queries.length - searchQueries.length });
  }
  for (const query of searchQueries) {
    try {
      logStep("run_search", "searxng request", query);
      const result = await searxngSearch(query, "year");
      logStep("run_search", "searxng response", { query, results: result.results.length });
      allResults.push(...result.results);
    } catch (err: any) {
      console.error(`SearxNG error for query "${query}": ${err?.message ?? String(err)}`);
    }
  }

  // Deduplicate by URL.
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const output: SearxngResponse = {
    query: queries.join(" | "),
    results: deduped,
  };

  return {
    searchResults: JSON.stringify(output, null, 2),
    chatComplement: `run_search: ${deduped.length} unique results from SearxNG (${searchQueries.length}/${queries.length} queries searched).`,
    messages: [AIMessage({ content: `run_search: ${deduped.length} results` })],
  };
}
