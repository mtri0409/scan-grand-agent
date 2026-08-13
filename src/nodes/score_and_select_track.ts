import { GraphStateType } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const SCORE_PROMPT = `Bạn là strategic scorer cho skill scan-grant-vnf. Dựa trên kết quả research và eligibility, đưa ra đề xuất cuối cùng cho RetriV/VNF.

Nếu eligibility có bất kỳ tiêu chí hard-stop nào fail (geography, entity type, TRL, IP, deadline, double-dipping, giai đoạn dự án) cho ít nhất 1 công ty → de_xuat PHẢI là SKIP, ly_do_de_xuat phải nêu rõ tiêu chí nào fail và vì sao.

Nếu không fail hard-stop, chấm 6 tiêu chí chiến lược (1-5, tổng 30):
1. Strategic fit
2. Funding vs effort
3. Win probability
4. Deadline feasibility
5. Restrictions
6. Network value

25-30 = GO, 18-24 = MAYBE (nêu rõ nghiêng GO hay nghiêng SKIP), <18 = SKIP.

Dù de_xuat là gì (GO/MAYBE/SKIP), BẮT BUỘC quy đổi sang 5 tiêu chí thang 0-10 cho CẢ RetriV VÀ VNF:
- khop_linh_vuc
- doi_moi
- tac_dong_mt
- tiem_nang_qt
- dat_giai
Nếu SKIP do eligibility fail, các điểm này phản ánh mức độ phù hợp tổng thể (thường thấp) chứ không được để trống.

Trả về JSON:
{
  "strategyScore": { "Strategic fit": 4, "Funding vs effort": 3, ... },
  "total": 18,
  "trackSelection": "...",
  "retriv_scores": { "khop_linh_vuc": 8, "doi_moi": 7, "tac_dong_mt": 6, "tiem_nang_qt": 5, "dat_giai": 7 },
  "vnf_scores": { "khop_linh_vuc": 8, "doi_moi": 7, "tac_dong_mt": 6, "tiem_nang_qt": 5, "dat_giai": 7 },
  "de_xuat": "GO|MAYBE|SKIP",
  "ly_do_de_xuat": "lý do chi tiết, bắt buộc nếu MAYBE hoặc SKIP",
  "next_steps": ["owner follow-up / việc cần làm"],
  "maybe_questions": ["..."]
}

Quy tắc:
- de_xuat là GO/Maybe/Skip phải đi kèm ly_do_de_xuat và next_steps đầy đủ.
- Không để trống ly_do_de_xuat hoặc next_steps.
- retriv_scores và vnf_scores phải đủ 5 key số.
- Không thêm nội dung ngoài JSON.`;

const RETRY_PROMPT = `Bạn vừa trả về JSON thiếu hoặc sai định dạng điểm số. Hãy sửa lại và trả về JSON đúng với retriv_scores và vnf_scores đầy đủ 5 key (khop_linh_vuc, doi_moi, tac_dong_mt, tiem_nang_qt, dat_giai) và giá trị là số 0-10.`;

const DEFAULT_SCORES = { khop_linh_vuc: 0, doi_moi: 0, tac_dong_mt: 0, tiem_nang_qt: 0, dat_giai: 0 };
const SCORE_KEYS = ["khop_linh_vuc", "doi_moi", "tac_dong_mt", "tiem_nang_qt", "dat_giai"];

function isValidScores(scores: unknown): scores is Record<string, number> {
  if (!scores || typeof scores !== "object") return false;
  return SCORE_KEYS.every((k) => typeof (scores as Record<string, unknown>)[k] === "number");
}

function normalizeScores(scores: unknown): Record<string, number> {
  if (!scores || typeof scores !== "object") return { ...DEFAULT_SCORES };
  const normalized: Record<string, number> = {};
  for (const k of SCORE_KEYS) {
    const v = (scores as Record<string, unknown>)[k];
    normalized[k] = typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0;
  }
  return normalized;
}

async function callScoreLLM(state: GraphStateType, systemPrompt: string): Promise<any> {
  const inputData = { research: state.grantResearch, eligibility: state.eligibility };
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(inputData, null, 2) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  try {
    return JSON.parse(response.choices[0].message.content ?? "{}");
  } catch {
    return {};
  }
}

export async function scoreAndSelectTrackNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("score_and_select_track", "enter", { hasData: Boolean(state.grantResearch && state.eligibility), grant: state.currentGrant?.name ?? null });

  let parsed = await callScoreLLM(state, SCORE_PROMPT);
  let validationWarnings: string[] = [];

  // Validate scores — nếu thiếu thì retry 1 lần.
  if (!isValidScores(parsed.retriv_scores) || !isValidScores(parsed.vnf_scores)) {
    logStep("score_and_select_track", "invalid scores, retry", { retriv: parsed.retriv_scores, vnf: parsed.vnf_scores });
    parsed = await callScoreLLM(state, `${SCORE_PROMPT}\n\n${RETRY_PROMPT}`);
    if (!isValidScores(parsed.retriv_scores) || !isValidScores(parsed.vnf_scores)) {
      validationWarnings.push("LLM không trả đủ điểm RetriV/VNF sau retry — dùng 0 cho các điểm thiếu.");
      parsed.retriv_scores = normalizeScores(parsed.retriv_scores);
      parsed.vnf_scores = normalizeScores(parsed.vnf_scores);
    }
  }

  // Validate de_xuat + ly_do + next_steps
  const deXuat = String(parsed.de_xuat ?? "MAYBE").toUpperCase();
  const isSkipMaybe = deXuat.includes("SKIP") || deXuat.includes("MAYBE");
  if (isSkipMaybe && (!parsed.ly_do_de_xuat || !parsed.next_steps?.length)) {
    validationWarnings.push(`de_xuat=${parsed.de_xuat} nhưng thiếu ly_do_de_xuat hoặc next_steps.`);
  }

  // Merge kết quả LLM vào grantResearch để build_docx_and_log dùng.
  const previousResearch = (state.grantResearch ?? {}) as Record<string, unknown>;
  const mergedResearch = {
    ...previousResearch,
    de_xuat: parsed.de_xuat ?? previousResearch.de_xuat ?? "MAYBE",
    ly_do_de_xuat: parsed.ly_do_de_xuat ?? previousResearch.ly_do_de_xuat,
    next_steps: parsed.next_steps ?? previousResearch.next_steps ?? [],
    maybe_questions: parsed.maybe_questions ?? previousResearch.maybe_questions ?? [],
    retriv_scores: parsed.retriv_scores ?? previousResearch.retriv_scores,
    vnf_scores: parsed.vnf_scores ?? previousResearch.vnf_scores,
    strategyScore: parsed.strategyScore ?? previousResearch.strategyScore,
    trackSelection: parsed.trackSelection ?? previousResearch.trackSelection,
  };

  const chatComplement = [
    `score_and_select_track: total=${parsed.total ?? 0}, de_xuat=${parsed.de_xuat ?? "MAYBE"}, track=${parsed.trackSelection ?? ""}`,
    validationWarnings.length > 0 ? `Warnings: ${validationWarnings.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return {
    strategyScore: parsed.strategyScore ?? {},
    trackSelection: parsed.trackSelection ?? "",
    grantResearch: mergedResearch,
    chatComplement,
    messages: [AIMessage({ content: `score_and_select_track: ${parsed.de_xuat ?? "MAYBE"} (total ${parsed.total ?? 0})` })],
  };
}
