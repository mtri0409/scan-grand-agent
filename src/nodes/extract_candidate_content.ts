import { GraphStateType } from "../state.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePath(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function scorePage(href: string, text: string): number {
  const hay = `${href} ${text}`.toLowerCase();
  let score = 0;
  if (/winners?|past winners?|alumni|cohort|winner|champion/.test(hay)) score += 8;
  if (/eligib|rules?|faq|apply|application|guideline|requirement/.test(hay)) score += 6;
  if (/about|program|competition|challenge|accelerator/.test(hay)) score += 3;
  if (/news|blog|press/.test(hay)) score += 2;
  return score;
}

async function fetchClean(url: string): Promise<{ url: string; title?: string; text: string }> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (scan-grant-agent)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(raw);
  const text = contentType.includes("text/html") ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
  return { url, title: titleMatch?.[1]?.trim(), text };
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const href = match[1];
    const text = stripHtml(match[2] || "");
    const normalized = normalizePath(baseUrl, href);
    if (!normalized || !sameOrigin(baseUrl, normalized)) continue;
    const score = scorePage(normalized, `${href} ${text}`);
    if (score > 0) links.add(normalized);
  }
  return [...links];
}

export async function extractCandidateContentNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const url = state.currentGrant?.website?.trim() ?? "";
  logStep("extract_candidate_content", "enter", { url, grant: state.currentGrant?.name ?? null });

  if (!url || !url.startsWith("http")) {
    return {
      sourceContent: undefined,
      chatComplement: "extract_candidate_content: không có URL hợp lệ để lấy nội dung.",
      messages: [AIMessage({ content: "extract_candidate_content: no url" })],
    };
  }

  try {
    const rawHome = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (scan-grant-agent)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    }).then((r) => r.text());

    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(rawHome);
    const homepageText = stripHtml(rawHome);
    logStep("extract_candidate_content", "homepage fetched", { url, chars: homepageText.length });

    const linkCandidates = new Set<string>();
    for (const link of extractLinks(rawHome, url)) linkCandidates.add(link);

    const keywords = [
      "eligibility",
      "rules",
      "faq",
      "apply",
      "application",
      "guidelines",
      "winner",
      "winners",
      "past-winners",
      "cohort",
      "alumni",
      "prize",
      "terms",
      "program",
    ];

    for (const keyword of keywords) {
      const guessed = normalizePath(url, `/${keyword}`);
      if (guessed && sameOrigin(url, guessed)) linkCandidates.add(guessed);
    }

    const ranked = [...linkCandidates]
      .map((href) => ({ href, score: scorePage(href, href) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.href);

    const pageChunks: string[] = [`=== HOMEPAGE: ${url} ===\n${titleMatch?.[1]?.trim() ?? ""}\n${homepageText.slice(0, 12000)}`];

    for (const pageUrl of ranked) {
      if (pageUrl === url) continue;
      try {
        const page = await fetchClean(pageUrl);
        logStep("extract_candidate_content", "page fetched", { pageUrl, chars: page.text.length });
        pageChunks.push(`=== PAGE: ${page.url} ===\n${page.title ?? ""}\n${page.text.slice(0, 12000)}`);
      } catch (err: any) {
        logStep("extract_candidate_content", "page failed", { pageUrl, error: err?.message ?? String(err) });
      }
    }

    const combined = pageChunks.join("\n\n").slice(0, 40000);
    logStep("extract_candidate_content", "exit", { chars: combined.length, pages: pageChunks.length, pageUrls: ranked });

    return {
      sourceContent: combined,
      chatComplement: `extract_candidate_content: ${combined.length} chars from ${pageChunks.length} page(s)`,
      messages: [AIMessage({ content: `extract_candidate_content: ${url}` })],
    };
  } catch (err: any) {
    logStep("extract_candidate_content", "failed", { url, error: err?.message ?? String(err) });
    return {
      sourceContent: undefined,
      chatComplement: `extract_candidate_content: lỗi lấy nội dung từ ${url}`,
      messages: [AIMessage({ content: `extract_candidate_content failed: ${url}` })],
    };
  }
}
