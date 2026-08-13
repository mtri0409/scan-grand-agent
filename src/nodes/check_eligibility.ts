import { GraphStateType, EligibilityResult } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const TODAY = new Date().toLocaleDateString("vi-VN");

const ELIGIBILITY_PROMPT = `Bạn là eligibility checker. Ngày hôm nay là ${TODAY}. Dựa trên kết quả nghiên cứu grant, chấm 7 tiêu chí hard-stop cho cả RetriV và VNF:

Quan trọng: khi đánh giá "deadline khả thi", so sánh deadline (định dạng dd/mm/yyyy hoặc Rolling) với ngày hôm nay ${TODAY}:
- Nếu deadline đã qua hoặc còn < 2 tuần → result = "fail" (không kịp chuẩn bị hồ sơ).
- Nếu Rolling hoặc còn ≥ 4 tuần → result = "pass".
- Nếu không rõ → result = "unclear".
- geography
- entity type
- TRL
- IP
- deadline khả thi
- double-dipping
- giai đoạn dự án

Trả về JSON:
{
  "retriv": [{ "criterion": "...", "result": "pass|fail|unclear", "note": "..." }],
  "vnf": [{ "criterion": "...", "result": "pass|fail|unclear", "note": "..." }]
}

Rule: bất kỳ tiêu chí nào = fail → gate = false. Chỉ pass khi không có fail.
Không thêm nội dung ngoài JSON.`;

export async function checkEligibilityNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const researchData = state.grantResearch;
  logStep("check_eligibility", "enter", { hasResearch: Boolean(researchData), grant: state.currentGrant?.name ?? null });

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: ELIGIBILITY_PROMPT },
      { role: "user", content: researchData ? JSON.stringify(researchData, null, 2) : "Không có dữ liệu grant" },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  let parsed: { retriv?: EligibilityResult[]; vnf?: EligibilityResult[] } = { retriv: [], vnf: [] };
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? "{}");
  } catch {
    parsed = { retriv: [], vnf: [] };
  }

  const retriv = parsed.retriv ?? [];
  const vnf = parsed.vnf ?? [];
  const anyFail = retriv.some((r) => r.result === "fail") || vnf.some((r) => r.result === "fail");

  logStep("check_eligibility", "parsed", {
    grant: state.currentGrant?.name ?? null,
    retrivCount: retriv.length,
    vnfCount: vnf.length,
    retrivResults: retriv.map((r) => ({ criterion: r.criterion, result: r.result })),
    vnfResults: vnf.map((r) => ({ criterion: r.criterion, result: r.result })),
    anyFail,
  });

  return {
    eligibility: { retriv, vnf },
    eligibilityGatePassed: !anyFail,
    chatComplement: `check_eligibility: ${anyFail ? "FAIL" : "PASS"} (RetriV ${retriv.length} tiêu chí, VNF ${vnf.length} tiêu chí)`,
    messages: [AIMessage({ content: `check_eligibility: ${anyFail ? "FAIL" : "PASS"}` })],
  };
}
