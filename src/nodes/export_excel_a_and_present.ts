import { GraphStateType } from "../state.js";
import { run as runMarketScan } from "../tools/market_scan_excel.js";
import { AIMessage } from "../messages.js";
import { getRunMarketExcelPath } from "../output_paths.js";
import { logStep } from "../logger.js";

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function slugifyTopic(topic: string): string {
  return topic
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export async function exportExcelAAndPresentNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("export_excel_a_and_present", "enter", { candidates: state.candidates.length, runTimestamp: state.runTimestamp });
  if (state.candidates.length === 0) {
    logStep("export_excel_a_and_present", "no candidates");
    return {
      chatComplement: "export_excel_a: không có candidate để xuất.",
      messages: [AIMessage({ content: "Không có candidate nào để xuất Excel A." })],
    };
  }

  const topic = state.topic ?? "market-scan";
  const ts = state.runTimestamp;
  const output = getRunMarketExcelPath(ts, slugifyTopic(topic), todayDDMMYYYY().replace(/\//g, ""));
  logStep("export_excel_a_and_present", "output path", output);

  const result = await runMarketScan({
    payload: {
      chu_de: topic,
      nguon_chu_de: "Mặc định theo hồ sơ RetriV/VNF",
      ngay_scan: todayDDMMYYYY(),
      candidates: state.candidates.map((c, idx) => ({
        ten_chuong_trinh: c.name,
        nha_tai_tro: c.sponsor,
        linh_vuc: c.field,
        funding: c.funding,
        deadline: c.deadline,
        geography: c.geography,
        eligibility_retriv: eligibilitySummary(c.prelimEligibility?.retriv),
        eligibility_vnf: eligibilitySummary(c.prelimEligibility?.vnf),
        website: c.website,
        nguon_tim_thay: c.sourceNote,
        da_deep_scan: false,
        ghi_chu: "",
      })),
    },
    output,
  });

  const summary = state.candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} | ${c.sponsor || "N/A"} | ${c.funding || "N/A"} | ${c.deadline} | R:${eligibilitySummary(
          c.prelimEligibility?.retriv
        )} V:${eligibilitySummary(c.prelimEligibility?.vnf)}`
    )
    .join("\n");

  return {
    marketExcelPath: output,
    chatComplement: `${result}\n\nBảng tóm tắt:\n${summary}\n\nChọn candidate để deep-scan (nhập STT hoặc tên).`,
    messages: [AIMessage({ content: `Excel A đã xuất: ${output}\n${summary}` })],
  };
}

function eligibilitySummary(rows?: { result?: string }[]): string {
  if (!rows || rows.length === 0) return "Chưa rõ";
  if (rows.some((r) => r.result === "fail")) return "Không";
  if (rows.every((r) => r.result === "pass")) return "Có thể";
  return "Chưa rõ";
}
