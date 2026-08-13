import { GraphStateType } from "../state.js";
import { run as runQA } from "../tools/qa_check.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

export async function qaCheckNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("qa_check", "enter", { reports: state.reportPaths, excel: state.excelPath ?? null, marketExcel: state.marketExcelPath ?? null });
  const { ok, report } = await runQA({
    reports: state.reportPaths,
    excel: state.excelPath ?? undefined,
    marketExcel: state.marketExcelPath ?? undefined,
  });

  return {
    qaResult: { pass: ok, errors: ok ? [] : [report], warnings: [] },
    qaRetryCount: state.qaRetryCount + 1,
    chatComplement: report,
    messages: [AIMessage({ content: ok ? "QA PASS" : "QA FAIL" })],
  };
}
