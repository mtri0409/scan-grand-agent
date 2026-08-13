import { GraphStateType } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { run as runLogScan } from "../tools/log_scan_excel.js";
import { AIMessage } from "../messages.js";
import { getRunTrackerPath } from "../output_paths.js";
import { logStep } from "../logger.js";

const SKIP_REASON_PROMPT = `Bạn đang ghi log SKIP cho một grant bị fail eligibility hoặc điểm thấp.
Dựa trên thông tin grant và eligibility dưới đây, trả về JSON chính xác:
{
  "ly_do": "lý do SKIP cụ thể, rõ ràng",
  "owner_follow_up": "người/việc cần làm tiếp theo, hoặc 'Không cần follow-up' nếu loại vĩnh viễn"
}
Không thêm nội dung ngoài JSON.`;

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function generateSkipReason(state: GraphStateType): Promise<{ ly_do: string; owner_follow_up: string }> {
  logStep("skip_and_log", "generate reason via LLM");
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SKIP_REASON_PROMPT },
      {
        role: "user",
        content: `Grant: ${state.currentGrant?.name ?? "chưa rõ"}\nEligibility: ${JSON.stringify(state.eligibility)}\nResearch de_xuat/ly_do: ${JSON.stringify({ de_xuat: (state.grantResearch as any)?.de_xuat, ly_do_de_xuat: (state.grantResearch as any)?.ly_do_de_xuat })}`,
      },
    ],
  });
  let parsed: any = {};
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  return {
    ly_do: parsed.ly_do || "Fail eligibility hard-stop",
    owner_follow_up: parsed.owner_follow_up || "Team VNF xác nhận lý do và quyết định",
  };
}

export async function skipAndLogNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const grant = state.currentGrant;
  const name = grant?.name ?? "Chưa rõ";
  const ts = state.runTimestamp;
  const output = state.excelPath ?? getRunTrackerPath(ts);
  logStep("skip_and_log", "enter", { grant: name, tracker: output });

  const retrivRows = state.eligibility?.retriv ?? [];
  const vnfRows = state.eligibility?.vnf ?? [];
  const failReasons = [...retrivRows, ...vnfRows]
    .filter((r) => r.result === "fail")
    .map((r) => `${r.criterion}: ${r.note}`)
    .join("; ");

  let ly_do = (state.grantResearch as any)?.ly_do_de_xuat || failReasons || undefined;
  let owner_follow_up = (state.grantResearch as any)?.next_steps?.[0] || undefined;

  // Nếu AI chưa điền đủ, gọi LLM fallback để đảm bảo log không bị crash.
  if (!ly_do || !owner_follow_up) {
    const generated = await generateSkipReason(state);
    ly_do = ly_do || generated.ly_do;
    owner_follow_up = owner_follow_up || generated.owner_follow_up;
  }

  const result = await runLogScan({
    entry: {
      ten_chuong_trinh: name,
      de_xuat: "SKIP",
      ly_do,
      owner_follow_up,
      retriv_scores: { khop_linh_vuc: 0, doi_moi: 0, tac_dong_mt: 0, tiem_nang_qt: 0, dat_giai: 0 },
      vnf_scores: { khop_linh_vuc: 0, doi_moi: 0, tac_dong_mt: 0, tiem_nang_qt: 0, dat_giai: 0 },
      ref: grant?.website ?? "",
    },
    output,
  });

  return {
    excelPath: output,
    chatComplement: `skip_and_log: ${name} → SKIP.\n${result}`,
    messages: [AIMessage({ content: `skip_and_log: ${name} → SKIP` })],
  };
}
