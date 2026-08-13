import { GraphStateType, GrantCandidate, EligibilityResult } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const CURRENT_YEAR = new Date().getFullYear();
const TODAY = new Date().toLocaleDateString("vi-VN");

function normalizeDateString(deadline: string): string {
  return deadline.toLowerCase().trim();
}

function parseDeadlineToDate(deadline: string): Date | null {
  const normalized = normalizeDateString(deadline);

  if (/rolling|open|upcoming|chưa rõ|unknown|liên tục/i.test(normalized)) return null;
  if (/closed|đã đóng|hết hạn|expired|ended|passed|no longer/i.test(normalized)) return new Date(0);

  const ddmmyyyy = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const d = Number(ddmmyyyy[1]);
    const m = Number(ddmmyyyy[2]);
    const y = Number(ddmmyyyy[3]);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime())) return date;
  }

  const ddmmyyyyDash = normalized.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (ddmmyyyyDash) {
    const d = Number(ddmmyyyyDash[1]);
    const m = Number(ddmmyyyyDash[2]);
    const y = Number(ddmmyyyyDash[3]);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime())) return date;
  }

  const yyyymmdd = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const y = Number(yyyymmdd[1]);
    const m = Number(yyyymmdd[2]);
    const d = Number(yyyymmdd[3]);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime())) return date;
  }

  const parsed = Date.parse(deadline);
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

function isCandidateOpen(candidate: any): boolean {
  const status = (candidate.status ?? "unknown").toLowerCase();
  if (status === "closed") return false;
  if (status === "open" || status === "upcoming") return true;

  const deadline = candidate.deadline ?? "";
  if (/closed|đã đóng|hết hạn|expired|ended|passed|no longer/i.test(deadline)) return false;

  const date = parseDeadlineToDate(deadline);
  if (!date) return true; // deadline mơ hồ / Rolling / Chưa rõ → giữ lại để user tự đánh giá

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

const EXTRACT_PROMPT = `Bạn là extractor cho Market Scan Mode. Dựa trên kết quả tìm kiếm SearxNG (JSON gồm title, url, snippet/content), hãy trích xuất các candidate grant thành JSON:
{
  "candidates": [
    {
      "name": "tên chương trình",
      "sponsor": "nhà tài trợ",
      "field": "lĩnh vực",
      "funding": "funding/award",
      "deadline": "dd/mm/yyyy hoặc Rolling / Chưa rõ",
      "geography": "geography",
      "website": "https://...",
      "sourceNote": "Tavily: <title> (<url>)",
      "prelimEligibility": {
        "retriv": [{ "criterion": "geography", "result": "pass|fail|unclear", "note": "..." }, ...],
        "vnf": [{ "criterion": "geography", "result": "pass|fail|unclear", "note": "..." }, ...]
      },
      "status": "open|upcoming|closed|unknown",
      "year": "2026|2027|unknown"
    }
  ]
}

Ngày hôm nay là ${TODAY}. Khi đánh status:
- Nếu deadline đã qua so với ${TODAY} → status = "closed".
- Nếu deadline trong tương lai hoặc Rolling → status = "open".
- Nếu chưa mở nhưng sắp mở → status = "upcoming".
- Nếu không rõ → status = "unknown".
Tiêu chí eligibility sơ bộ: geography, entity type, TRL, IP, deadline, double-dipping, giai đoạn dự án.
RetriV là Vietnam Food JSC spin-off: công nghệ thu hồi protein/lipid từ nước thải chế biến thực phẩm, dùng chitosan từ phụ phẩm tôm, containerized, TRL 7-9, đã pilot tại Việt Nam.
VNF là Vietnam Food JSC: công ty chế biến phụ phẩm tôm, chitosan, biopolymer, circular bioeconomy, Việt Nam.

Năm hiện tại là ${new Date().getFullYear()}. ƯU TIÊN các candidate:
- Đang mở (status: open) hoặc sắp mở (status: upcoming) trong năm ${new Date().getFullYear()} hoặc ${new Date().getFullYear() + 1}.
- Có deadline rõ ràng hoặc ghi "Rolling".

LOẠI BỎ hoàn toàn candidate:
- Đã đóng hoàn toàn (closed) trước năm ${new Date().getFullYear()}.
- Không còn tổ chức nữa, chỉ là tin tức/bài báo về grant cũ.
- Không có website hoặc thông tin quá sơ sài.

Mục tiêu 8-15 candidate còn hạn. Nếu không đủ, trả về đúng số lượng tìm được.
Không thêm nội dung ngoài JSON.`;

export async function extractCandidatesNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const searchResults = state.searchResults ?? "Không có kết quả tìm kiếm";
  logStep("extract_candidates", "enter", { searchResultsChars: searchResults.length });

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: searchResults.slice(0, 20000) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  let parsed: { candidates?: any[] } = {};
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? "{}");
  } catch {
    parsed = { candidates: [] };
  }

  const candidates: GrantCandidate[] = (parsed.candidates ?? [])
    .filter(isCandidateOpen)
    .map((c: any) => ({
      name: c.name ?? "Chưa rõ",
      sponsor: c.sponsor ?? "",
      field: c.field ?? "",
      funding: c.funding ?? "",
      deadline: c.deadline ?? "Chưa rõ",
      geography: c.geography ?? "",
      website: c.website ?? "",
      sourceNote: c.sourceNote ?? (c.website ? `SearxNG: ${c.website}` : "SearxNG search result"),
      status: c.status ?? "unknown",
      prelimEligibility: c.prelimEligibility ?? { retriv: [], vnf: [] },
    }));

  const dropped = (parsed.candidates ?? []).length - candidates.length;
  if (dropped > 0) {
    logStep("extract_candidates", "dropped closed/expired", { dropped, kept: candidates.length });
  }

  // Log chi tiết candidate để theo dõi nguồn mới/cũ.
  logStep("extract_candidates", "candidates detail", candidates.map((c) => ({
    name: c.name,
    deadline: c.deadline,
    status: c.status ?? "unknown",
    year: (c as any).year ?? "unknown",
    website: c.website,
  })));

  logStep("extract_candidates", "exit", { candidates: candidates.length });
  return {
    candidates,
    chatComplement: `extract_candidates: ${candidates.length} candidate(s)`,
    messages: [AIMessage({ content: `extract_candidates: ${candidates.length}` })],
  };
}
