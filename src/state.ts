import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "./messages.js";

function append<T>(existing?: T[], incoming?: T[]): T[] {
  if (!incoming || incoming.length === 0) return existing ?? [];
  if (!existing || existing.length === 0) return incoming;
  return [...existing, ...incoming];
}

function appendString(existing?: string, incoming?: string): string {
  if (!incoming) return existing ?? "";
  if (!existing) return incoming;
  return `${existing}\n---\n${incoming}`;
}

function lastOrDefault<T>(existing: T | undefined, incoming: T | undefined): T | undefined {
  return incoming !== undefined ? incoming : existing;
}

export interface EligibilityResult {
  criterion: string;
  result: "pass" | "fail" | "unclear";
  note: string;
}

export interface GrantCandidate {
  name: string;
  sponsor: string;
  field: string;
  funding: string;
  deadline: string;
  geography: string;
  website: string;
  sourceNote: string; // "Claude tự tìm" | "User cung cấp link"
  status?: "open" | "upcoming" | "closed" | "unknown";
  prelimEligibility?: { retriv: EligibilityResult[]; vnf: EligibilityResult[] };
}

export interface ScoreMap {
  khop_linh_vuc: number | string;
  doi_moi: number | string;
  tac_dong_mt: number | string;
  tiem_nang_qt: number | string;
  dat_giai: number | string;
}

export const GraphState = Annotation.Root({
  // ---- Run timestamp (attached to output filenames to avoid file locks) ----
  runTimestamp: Annotation<string>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => "",
  }),

  // ---- Conversation / control ----
  messages: Annotation<BaseMessage[]>({
    reducer: append,
    default: () => [],
  }),
  chatComplement: Annotation<string>({
    reducer: appendString,
    default: () => "",
  }),

  // ---- Mode routing ----
  mode: Annotation<"A" | "B" | "unclear" | null>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => null,
  }),

  // ---- Company context ----
  companyContext: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),

  // ---- Latest search results for downstream LLM nodes ----
  searchResults: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),

  // ---- Market scan (Mode B) ----
  topic: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  searchQueries: Annotation<string[]>({
    reducer: append,
    default: () => [],
  }),
  candidates: Annotation<GrantCandidate[]>({
    reducer: append,
    default: () => [],
  }),
  selectedCandidates: Annotation<string[]>({
    reducer: append,
    default: () => [],
  }),
  selectedCandidateQueue: Annotation<string[]>({
    reducer: (_prev, next) => next ?? [],
    default: () => [],
  }),

  // ---- Current grant being deep-scanned (Mode A or fanout from B) ----
  currentGrant: Annotation<GrantCandidate | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  sourceContent: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  pastWinnersContent: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  grantResearch: Annotation<Record<string, unknown> | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  companyTarget: Annotation<"RetriV" | "VNF" | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  eligibility: Annotation<{ retriv: EligibilityResult[]; vnf: EligibilityResult[] } | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  eligibilityGatePassed: Annotation<boolean | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  strategyScore: Annotation<Record<string, number | string> | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  trackSelection: Annotation<string | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),

  // ---- Outputs ----
  reportPaths: Annotation<string[]>({
    reducer: append,
    default: () => [],
  }),
  excelPath: Annotation<string | null>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => null,
  }),
  marketExcelPath: Annotation<string | null>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => null,
  }),

  // ---- Human-in-the-loop ----
  pendingHumanQuestion: Annotation<string | null>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => null,
  }),
  humanAnswer: Annotation<string | null>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => null,
  }),

  // ---- QA retry ----
  qaResult: Annotation<{ pass: boolean; errors: string[]; warnings: string[] } | undefined>({
    reducer: lastOrDefault,
    default: () => undefined,
  }),
  qaRetryCount: Annotation<number>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => 0,
  }),
});

export type GraphStateType = typeof GraphState.State;
