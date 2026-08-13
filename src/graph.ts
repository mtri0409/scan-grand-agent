import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { GraphState, GraphStateType } from "./state.js";
import { FileSaver } from "./checkpointer.js";

import { classifyModeNode } from "./nodes/classify.js";
import { askModeClarifyNode } from "./nodes/ask_mode_clarify.js";
import { resolveSourceNode } from "./nodes/resolve_source.js";
import { findOfficialSiteNode } from "./nodes/find_official_site.js";
import { generateSearchQueriesNode } from "./nodes/generate_search_queries.js";
import { runSearchNode } from "./nodes/run_search.js";
import { extractCandidatesNode } from "./nodes/extract_candidates.js";
import { exportExcelAAndPresentNode } from "./nodes/export_excel_a_and_present.js";
import { waitForSelectionNode } from "./nodes/wait_for_selection.js";
import { fanoutSelectedCandidatesNode } from "./nodes/fanout_selected_candidates.js";
import { extractCandidateContentNode } from "./nodes/extract_candidate_content.js";
import { retrievePastWinnersNode } from "./nodes/retrieve_past_winners.js";
import { researchGrantNode } from "./nodes/research_grant.js";
import { checkEligibilityNode } from "./nodes/check_eligibility.js";
import { scoreAndSelectTrackNode } from "./nodes/score_and_select_track.js";
import { buildDocxAndLogNode } from "./nodes/build_docx_and_log.js";
import { qaCheckNode } from "./nodes/qa_check.js";
import { loadCompanyContextNode } from "./nodes/load_company_context.js";
import { reportErrorNode } from "./nodes/report_error.js";

// ---- Routing helpers ----

function afterClassify(state: GraphStateType): string {
  if (state.mode === "unclear") return "ask_mode_clarify";
  if (state.mode === "A" || state.mode === "B") return "load_company_context";
  return END;
}

function afterLoadCompanyContext(state: GraphStateType): string {
  if (state.mode === "A") return "resolve_source";
  if (state.mode === "B") return "generate_search_queries";
  return END;
}

function afterClarify(state: GraphStateType): string {
  // Sau interrupt resume, user answer đã được ghi vào messages.
  // Chạy lại classify để phân loại lại.
  return "classify_mode";
}

function afterResolveSource(state: GraphStateType): string {
  // Nếu node đã set pendingHumanQuestion (interrupt) thì sau resume nó sẽ null.
  // Nếu chưa có URL hợp lệ → interrupt đã xảy ra.
  const grant = state.currentGrant;
  if (!grant?.website?.trim().startsWith("http")) return "find_official_site";
  return "find_official_site";
}

function afterFindOfficialSite(state: GraphStateType): string {
  return "extract_candidate_content";
}

function afterExtractCandidateContent(state: GraphStateType): string {
  return "retrieve_past_winners";
}

function afterRetrievePastWinners(state: GraphStateType): string {
  return "research_grant";
}

function afterResearchGrant(state: GraphStateType): string {
  return "check_eligibility";
}

function afterCheckEligibility(state: GraphStateType): string {
  // Luôn qua score_and_select_track để AI điền de_xuat, ly_do_de_xuat, next_steps/owner.
  // Ngay cả khi eligibility fail, AI vẫn phải đưa ra đề xuất SKIP kèm lý do rõ.
  return "score_and_select_track";
}

function afterScoreAndSelectTrack(state: GraphStateType): string {
  // Luôn tạo báo cáo Word + ghi Excel log, kể cả khi đề xuất SKIP.
  // Theo SKILL.MD, mỗi grant scan sâu cần cả 2 file.
  return "build_docx_and_log";
}

function afterBuildDocxAndLog(state: GraphStateType): string {
  return "qa_check";
}

function afterQACheck(state: GraphStateType): string {
  // Ưu tiên xử lý QA result của candidate hiện tại trước khi chuyển sang candidate khác.
  if (!state.qaResult?.pass) {
    if (state.qaRetryCount >= 3) return "report_error";
    return "qa_check";
  }
  if ((state.selectedCandidateQueue ?? []).length > 0) return "fanout_selected_candidates";
  return END;
}

function afterExportExcelA(state: GraphStateType): string {
  return "wait_for_selection";
}

function afterWaitForSelection(state: GraphStateType): string {
  return "fanout_selected_candidates";
}

function afterFanout(state: GraphStateType): string {
  if (state.selectedCandidates.length > 0) return "research_grant";
  return END;
}

function afterRunSearch(state: GraphStateType): string {
  return "extract_candidates";
}

function afterExtractCandidates(state: GraphStateType): string {
  return "export_excel_a_and_present";
}

function afterGenerateQueries(state: GraphStateType): string {
  return "run_search";
}

// ---- Build graph ----

const builder = new StateGraph(GraphState)
  // Mode routing
  .addNode("classify_mode", classifyModeNode)
  .addNode("ask_mode_clarify", askModeClarifyNode)
  .addNode("resolve_source", resolveSourceNode)
  .addNode("find_official_site", findOfficialSiteNode)

  .addNode("load_company_context", loadCompanyContextNode)

  // Mode B: market scan
  .addNode("generate_search_queries", generateSearchQueriesNode)
  .addNode("run_search", runSearchNode)
  .addNode("extract_candidates", extractCandidatesNode)
  .addNode("export_excel_a_and_present", exportExcelAAndPresentNode)
  .addNode("wait_for_selection", waitForSelectionNode)
  .addNode("fanout_selected_candidates", fanoutSelectedCandidatesNode)
  .addNode("extract_candidate_content", extractCandidateContentNode)
  .addNode("retrieve_past_winners", retrievePastWinnersNode)

  // Mode A / deep-scan pipeline
  .addNode("research_grant", researchGrantNode)
  .addNode("check_eligibility", checkEligibilityNode)
  .addNode("score_and_select_track", scoreAndSelectTrackNode)
  .addNode("build_docx_and_log", buildDocxAndLogNode)
  .addNode("qa_check", qaCheckNode)
  .addNode("report_error", reportErrorNode)

  // Edges
  .addEdge("__start__", "classify_mode")
  .addConditionalEdges("classify_mode", afterClassify)
  .addConditionalEdges("ask_mode_clarify", afterClarify)
  .addConditionalEdges("load_company_context", afterLoadCompanyContext)
  .addConditionalEdges("resolve_source", afterResolveSource)
  .addConditionalEdges("find_official_site", afterFindOfficialSite)
  .addConditionalEdges("extract_candidate_content", afterExtractCandidateContent)
  .addConditionalEdges("retrieve_past_winners", afterRetrievePastWinners)
  .addConditionalEdges("generate_search_queries", afterGenerateQueries)
  .addConditionalEdges("run_search", afterRunSearch)
  .addConditionalEdges("extract_candidates", afterExtractCandidates)
  .addConditionalEdges("export_excel_a_and_present", afterExportExcelA)
  .addConditionalEdges("wait_for_selection", afterWaitForSelection)
  .addConditionalEdges("fanout_selected_candidates", afterFanout)
  .addConditionalEdges("research_grant", afterResearchGrant)
  .addConditionalEdges("check_eligibility", afterCheckEligibility)
  .addConditionalEdges("score_and_select_track", afterScoreAndSelectTrack)
  .addConditionalEdges("build_docx_and_log", afterBuildDocxAndLog)
  .addConditionalEdges("qa_check", afterQACheck)
  .addEdge("report_error", END);

export const graph = builder.compile({ checkpointer: new FileSaver() });
export type AgentGraph = typeof graph;

export { interrupt };
