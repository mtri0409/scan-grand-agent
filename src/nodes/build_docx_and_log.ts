import { GraphStateType } from "../state.js";
import * as fs from "fs";
import * as path from "path";
import { buildVNFReport } from "../tools/build_vnf_report.js";
import { run as runLogScan } from "../tools/log_scan_excel.js";
import { AIMessage } from "../messages.js";
import { getRunReportsDir, getRunTrackerPath } from "../output_paths.js";
import { logStep } from "../logger.js";

function toRows(items: unknown, source: "retriv" | "vnf"): { tieu_chi: string; ket_qua: string; ghi_chu: string }[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x) => x && typeof x === "object")
    .map((x: any) => ({
      tieu_chi: `${source.toUpperCase()}: ${x.tieu_chi ?? x.criterion ?? "Chưa rõ"}`,
      ket_qua: String(x.ket_qua ?? x.result ?? "Chưa rõ"),
      ghi_chu: String(x.ghi_chu ?? x.note ?? ""),
    }));
}

function toStrategyRows(strategyScore: Record<string, number | string> | undefined): { tieu_chi: string; diem: number | string; ly_do: string }[] {
  if (!strategyScore || typeof strategyScore !== "object") return [];
  return Object.entries(strategyScore).map(([tieu_chi, diem]) => ({
    tieu_chi,
    diem: typeof diem === "number" ? diem : Number(diem) || 0,
    ly_do: "",
  }));
}

function isValidScores(scores: unknown): boolean {
  if (!scores || typeof scores !== "object") return false;
  const keys = ["khop_linh_vuc", "doi_moi", "tac_dong_mt", "tiem_nang_qt", "dat_giai"];
  return keys.every((k) => typeof (scores as Record<string, unknown>)[k] === "number");
}

function toScoringRows(items: unknown): { tieu_chi: string; diem: number | string; ly_do: string }[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x) => x && typeof x === "object")
    .map((x: any) => ({
      tieu_chi: String(x.tieu_chi ?? x.criterion ?? "Chưa rõ"),
      diem: x.diem ?? x.score ?? "",
      ly_do: String(x.ly_do ?? x.reason ?? ""),
    }));
}

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function buildDocxAndLogNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const grant = state.currentGrant;
  const research = (state.grantResearch ?? {}) as any;
  const name = grant?.name ?? "Chưa rõ";
  logStep("build_docx_and_log", "enter", { grant: name, existingReports: state.reportPaths.length, queue: state.selectedCandidateQueue ?? [] });
  logStep("build_docx_and_log", "research keys", {
    grant: name,
    keys: Object.keys(research),
    hasDeXuat: Boolean(research.de_xuat),
    hasLyDo: Boolean(research.ly_do_de_xuat),
    hasNextSteps: Boolean(research.next_steps?.length),
    hasRetrivScores: isValidScores(research.retriv_scores),
    hasVnfScores: isValidScores(research.vnf_scores),
    hasStrategyScore: Boolean(research.strategyScore && Object.keys(research.strategyScore).length > 0),
  });
  const ts = state.runTimestamp;
  const reportDir = getRunReportsDir(ts);
  fs.mkdirSync(reportDir, { recursive: true });
  const output = state.excelPath ?? getRunTrackerPath(ts);
  logStep("build_docx_and_log", "paths", { reportDir, tracker: output });

  // Tránh tạo trùng lặp file Word khi retry QA: nếu đã có báo cáo cho grant hiện tại, dùng lại.
  const existingReport = state.reportPaths.find((p) => path.basename(p).includes(name.replace(/\s+/g, "_")));
  let reportPath: string;
  let logResult: string;
  if (existingReport) {
    logStep("build_docx_and_log", "reuse existing report", { existingReport });
    reportPath = existingReport;
    logResult = `Skipped: đã tồn tại báo cáo ${reportPath}, không ghi thêm dòng log mới khi retry.`;
  } else {
    const stt = (state.reportPaths.length + 1).toString();
    reportPath = await buildVNFReport({
      projectName: state.companyTarget ?? "RetriV",
      grantName: name,
      scanDate: todayDDMMYYYY(),
      stt,
      outputDir: reportDir,
      trackerPath: output,
      info: {
        ten_chuong_trinh: name,
        loai: research.loai ?? (grant?.sourceNote?.includes("competition") ? "competition" : "Chưa rõ"),
        quy_mo: research.quy_mo ?? "Chưa rõ",
        don_vi_to_chuc: research.don_vi_to_chuc ?? "Chưa rõ",
        muc_do_uu_tien: research.muc_do_uu_tien ?? "Chưa rõ",
        status: research.status ?? "Chưa rõ",
        mo_dk: research.mo_dk ?? "Chưa rõ",
        dong_dk: research.dong_dk ?? "Chưa rõ",
        chung_ket: research.chung_ket ?? "Chưa rõ",
        dia_diem: research.dia_diem ?? "Chưa rõ",
        nha_tai_tro: research.nha_tai_tro ?? grant?.sponsor ?? "Chưa rõ",
        funding: research.funding ?? grant?.funding ?? "Chưa rõ",
        deadline: research.deadline ?? grant?.deadline ?? "Chưa rõ",
        timeline: research.timeline ?? "Chưa rõ",
        website: research.website ?? grant?.website ?? "Chưa rõ",
        nguon_xac_nhan: research.nguon_xac_nhan ?? grant?.sourceNote ?? "Chưa rõ",
        eligibility: [
          ...toRows(research.eligibility?.retriv, "retriv"),
          ...toRows(research.eligibility?.vnf, "vnf"),
          ...(state.eligibility?.retriv.map((e) => ({ tieu_chi: `RetriV: ${e.criterion}`, ket_qua: e.result, ghi_chu: e.note })) ?? []),
        ],
        // Bảng chấm điểm chiến lược 6 tiêu chí 1-5 từ score_and_select_track, không phải research.scoring.
        scoring: toStrategyRows(state.strategyScore ?? (research.strategyScore as Record<string, number | string> | undefined)) as any,
        challenge_phu_hop_nhat: research.challenge_phu_hop_nhat ?? "Chưa rõ",
        ly_do_challenge: research.ly_do_challenge ?? "Chưa rõ",
        challenge_du_phong: research.challenge_du_phong ?? "Chưa rõ",
        application_form: research.application_form ?? "Chưa rõ",
        attachments: research.attachments ?? "Chưa rõ",
        word_limits: research.word_limits ?? "Chưa rõ",
        rubric: research.rubric ?? "Chưa rõ",
        past_winners: research.past_winners ?? [],
        diem_chung_quan_quan: research.diem_chung_quan_quan ?? "Chưa rõ",
        bai_hoc: research.bai_hoc ?? "Chưa rõ",
        risks: research.risks ?? "Chưa rõ",
        de_xuat: research.de_xuat ?? "MAYBE",
        ly_do_de_xuat: research.ly_do_de_xuat ?? "Chưa rõ",
        next_steps: research.next_steps ?? [],
        maybe_questions: research.maybe_questions ?? [],
        retriv_vnf_note: state.eligibility ? `RetriV/VNF eligibility đã được đánh giá song song.` : undefined,
      },
    });

    logResult = await runLogScan({
      entry: {
        ten_chuong_trinh: name,
        loai: research.loai ?? "",
        quy_mo: research.quy_mo ?? "",
        don_vi_to_chuc: research.don_vi_to_chuc ?? "",
        muc_do_uu_tien: research.muc_do_uu_tien ?? "",
        status: research.status ?? "",
        mo_dk: research.mo_dk ?? "",
        dong_dk: research.dong_dk ?? "",
        chung_ket: research.chung_ket ?? "",
        dia_diem: research.dia_diem ?? "",
        thuong_ty_vnd: research.funding ?? "",
        co_cau_giai: research.co_cau_giai ?? "",
        linh_vuc_retriv: grant?.field ?? research.linh_vuc ?? "",
        linh_vuc_vnf: grant?.field ?? research.linh_vuc ?? "",
        noi_dung_khac: research.noi_dung_khac ?? "",
        retriv_dang_ky: research.retriv_dang_ky ?? "",
        retriv_ket_qua: research.retriv_ket_qua ?? "",
        vnf_dang_ky: research.vnf_dang_ky ?? "",
        vnf_ket_qua: research.vnf_ket_qua ?? "",
        challenge_phu_hop_nhat: research.challenge_phu_hop_nhat ?? "",
        quan_quan: research.diem_chung_quan_quan ?? "",
        de_xuat: research.de_xuat ?? "MAYBE",
        // Không dùng fallback mơ hồ — để validate trong log_scan_excel bắt buộc LLM điền lý do thật.
        ly_do: research.ly_do_de_xuat,
        owner_follow_up: research.next_steps?.[0],
        watchlist: false,
        ghi_chu_1: research.ghi_chu_1 ?? "",
        ghi_chu_2: research.ghi_chu_2 ?? "",
        retriv_scores: research.retriv_scores ?? { khop_linh_vuc: 0, doi_moi: 0, tac_dong_mt: 0, tiem_nang_qt: 0, dat_giai: 0 },
        vnf_scores: research.vnf_scores ?? { khop_linh_vuc: 0, doi_moi: 0, tac_dong_mt: 0, tiem_nang_qt: 0, dat_giai: 0 },
        link_bao_cao: reportPath,
        ref: grant?.website ?? "",
      },
      output,
    });
  }
  logStep("build_docx_and_log", "exit", { reportPath, logResult });

  return {
    reportPaths: existingReport ? [] : [reportPath],
    excelPath: output,
    chatComplement: `build_docx_and_log: ${reportPath}\n${logResult}`,
    messages: [AIMessage({ content: `build_docx_and_log: ${reportPath}` })],
  };
}
