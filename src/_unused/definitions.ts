import { z } from "zod";
import { run as runLogScan } from "../tools/log_scan_excel.js";
import { run as runMarketScan } from "../tools/market_scan_excel.js";
import { run as runQA } from "../tools/qa_check.js";
import { buildVNFReport } from "../tools/build_vnf_report.js";
import { logStep } from "../logger.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<string>;
}

const scoreSchema = z.object({
  khop_linh_vuc: z.union([z.number(), z.string()]).describe("Điểm 0-10"),
  doi_moi: z.union([z.number(), z.string()]).describe("Điểm 0-10"),
  tac_dong_mt: z.union([z.number(), z.string()]).describe("Điểm 0-10"),
  tiem_nang_qt: z.union([z.number(), z.string()]).describe("Điểm 0-10"),
  dat_giai: z.union([z.number(), z.string()]).describe("Điểm 0-10"),
}).describe("Object 5 tiêu chí thang 0-10: khop_linh_vuc, doi_moi, tac_dong_mt, tiem_nang_qt, dat_giai.");

export const logScanExcelSchema = z.object({
  entry: z.object({
    ten_chuong_trinh: z.string().describe("Tên chương trình grant cần ghi log."),
    loai: z.string().optional().describe("Loại chương trình (grant/competition/accelerator)."),
    quy_mo: z.string().optional().describe("Quy mô chương trình."),
    don_vi_to_chuc: z.string().optional().describe("Đơn vị tổ chức."),
    muc_do_uu_tien: z.string().optional().describe("Mức độ ưu tiên."),
    status: z.string().optional().describe("Trạng thái (đang mở / sắp mở / đã đóng)."),
    mo_dk: z.string().optional().describe("Ngày mở đăng ký (dd/mm/yyyy)."),
    dong_dk: z.string().optional().describe("Ngày đóng đăng ký (dd/mm/yyyy)."),
    chung_ket: z.string().optional().describe("Ngày chung kết (dd/mm/yyyy)."),
    dia_diem: z.string().optional().describe("Địa điểm."),
    thuong_ty_vnd: z.union([z.string(), z.number()]).optional().describe("Thưởng tỷ VND."),
    co_cau_giai: z.string().optional().describe("Cơ cấu giải."),
    linh_vuc_retriv: z.string().optional().describe("Lĩnh vực RetriV."),
    linh_vuc_vnf: z.string().optional().describe("Lĩnh vực VNF."),
    noi_dung_khac: z.string().optional().describe("Nội dung khác."),
    retriv_dang_ky: z.string().optional().describe("RetriV đăng ký."),
    retriv_ket_qua: z.string().optional().describe("RetriV kết quả."),
    vnf_dang_ky: z.string().optional().describe("VNF đăng ký."),
    vnf_ket_qua: z.string().optional().describe("VNF kết quả."),
    challenge_phu_hop_nhat: z.string().optional().describe("Challenge phù hợp nhất."),
    quan_quan: z.string().optional().describe("Quán quân."),
    de_xuat: z.string().describe("Đề xuất: GO / MAYBE / SKIP."),
    watchlist: z.boolean().optional().describe("Có theo dõi vòng sau không."),
    ly_do: z.string().optional().describe("Lý do nếu MAYBE/SKIP (bắt buộc)."),
    owner_follow_up: z.string().optional().describe("Owner follow-up nếu MAYBE/SKIP (bắt buộc)."),
    ghi_chu_1: z.string().optional().describe("Ghi chú 1."),
    ghi_chu_2: z.string().optional().describe("Ghi chú 2."),
    ref: z.string().optional().describe("Link nguồn."),
    link_bao_cao: z.string().optional().describe("Đường dẫn file báo cáo Word."),
    retriv_scores: scoreSchema.describe("Điểm RetriV: 5 tiêu chí thang 0-10 (khop_linh_vuc, doi_moi, tac_dong_mt, tiem_nang_qt, dat_giai). BẮT BUỘC điền đủ 5 field."),
    vnf_scores: scoreSchema.describe("Điểm VNF: 5 tiêu chí thang 0-10 (khop_linh_vuc, doi_moi, tac_dong_mt, tiem_nang_qt, dat_giai). BẮT BUỘC điền đủ 5 field."),
  }).describe("Dữ liệu một dòng grant cần append vào Excel log."),
  output: z.string().describe("Đường dẫn file Excel log đầu ra (ví dụ: output/Grant_Scan_Tracker_RetriV_VNF.xlsx)."),
  today: z.string().optional().describe("Ngày chạy dạng dd/mm/yyyy, mặc định là hôm nay."),
});

export const marketScanExcelSchema = z.object({
  payload: z.object({
    chu_de: z.string().optional().describe("Chủ đề tìm kiếm."),
    nguon_chu_de: z.string().optional().describe("Nguồn chủ đề (User cung cấp / Mặc định theo hồ sơ)."),
    ngay_scan: z.string().optional().describe("Ngày scan dd/mm/yyyy."),
    candidates: z.array(
      z.object({
        ten_chuong_trinh: z.string().describe("Tên chương trình."),
        nha_tai_tro: z.string().optional().describe("Nhà tài trợ."),
        linh_vuc: z.string().optional().describe("Lĩnh vực."),
        funding: z.string().optional().describe("Funding/award."),
        deadline: z.string().optional().describe("Deadline (dd/mm/yyyy hoặc Rolling / Chưa rõ)."),
        geography: z.string().optional().describe("Geography."),
        eligibility_retriv: z.string().optional().describe("Eligibility sơ bộ RetriV: Có thể / Không / Chưa rõ."),
        eligibility_vnf: z.string().optional().describe("Eligibility sơ bộ VNF: Có thể / Không / Chưa rõ."),
        website: z.string().optional().describe("Website."),
        nguon_tim_thay: z.string().optional().describe("Nguồn tìm thấy."),
        da_deep_scan: z.boolean().optional().describe("Đã deep-scan chưa."),
        ghi_chu: z.string().optional().describe("Ghi chú."),
      })
    ).describe("Danh sách candidate tìm được."),
  }).describe("Payload Market Scan."),
  output: z.string().describe("Đường dẫn file Excel Market Scan đầu ra."),
  today: z.string().optional().describe("Ngày scan dd/mm/yyyy."),
});

export const buildVNFReportSchema = z.object({
  projectName: z.enum(["RetriV", "VNF"]).optional().describe("Dự án đứng tên apply cho báo cáo Word (mặc định RetriV)."),
  grantName: z.string().describe("Tên chương trình grant."),
  scanDate: z.string().optional().describe("Ngày scan dd/mm/yyyy (mặc định hôm nay)."),
  headline: z.string().optional().describe("Tiêu đề báo cáo (mặc định VNF Grant Scan Report)."),
  footer: z.string().optional().describe("Footer (mặc định Confidential)."),
  logoPath: z.string().optional().describe("Đường dẫn logo VNF (mặc định src/asset/logo-vnf.png)."),
  outputDir: z.string().optional().describe("Thư mục lưu báo cáo (mặc định output/reports)."),
  stt: z.union([z.string(), z.number()]).optional().describe("STT dùng làm tiền tố tên file."),
  info: z.object({
    ten_chuong_trinh: z.string().describe("Tên chương trình."),
    nha_tai_tro: z.string().optional().describe("Nhà tài trợ."),
    funding: z.string().optional().describe("Funding."),
    deadline: z.string().optional().describe("Deadline."),
    timeline: z.string().optional().describe("Timeline."),
    website: z.string().optional().describe("Website."),
    nguon_xac_nhan: z.string().optional().describe("Nguồn xác nhận (Claude tự tìm / User cung cấp link)."),
    eligibility: z.array(z.object({ tieu_chi: z.string(), ket_qua: z.string(), ghi_chu: z.string() })).optional().describe("Bảng eligibility hard-stop."),
    scoring: z.array(z.object({ tieu_chi: z.string(), diem: z.union([z.number(), z.string()]), ly_do: z.string() })).optional().describe("Bảng chấm điểm chiến lược."),
    challenge_phu_hop_nhat: z.string().optional().describe("Challenge phù hợp nhất."),
    ly_do_challenge: z.string().optional().describe("Lý do chọn challenge."),
    challenge_du_phong: z.string().optional().describe("Challenge dự phòng."),
    application_form: z.string().optional().describe("Form apply."),
    attachments: z.string().optional().describe("Attachments cần có."),
    word_limits: z.string().optional().describe("Word/character limits."),
    rubric: z.string().optional().describe("Rubric/judging criteria."),
    past_winners: z.array(z.object({ nam_mua: z.string().optional(), doi: z.string().optional(), linh_vuc: z.string().optional(), ly_do_thang: z.string().optional() })).optional().describe("Danh sách đội thắng."),
    diem_chung_quan_quan: z.string().optional().describe("Điểm chung giữa các đội thắng."),
    bai_hoc: z.string().optional().describe("Bài học cho RetriV/VNF."),
    risks: z.string().optional().describe("Rủi ro & điểm cần lưu ý."),
    de_xuat: z.string().optional().describe("Đề xuất GO/MAYBE/SKIP."),
    ly_do_de_xuat: z.string().optional().describe("Lý do chính."),
    next_steps: z.array(z.string()).optional().describe("Việc cần làm tiếp theo."),
    maybe_questions: z.array(z.string()).optional().describe("Câu hỏi cần giải đáp nếu MAYBE."),
    retriv_vnf_note: z.string().optional().describe("Ghi chú so sánh điểm RetriV/VNF."),
  }).describe("Dữ liệu 8 mục nội dung báo cáo."),
}).describe("Tạo báo cáo Word chuẩn VNF cho 1 grant scan sâu.");

export const qaCheckSchema = z.object({
  reports: z.array(z.string()).optional().describe("Các đường dẫn file báo cáo Word cần QA."),
  excel: z.string().optional().describe("Đường dẫn file Excel log chính."),
  marketExcel: z.string().optional().describe("Đường dẫn file Excel Market Scan (nếu có)."),
}).describe("Kiểm tra QA sau khi tạo báo cáo và Excel log.");

export type LogScanExcelInput = z.infer<typeof logScanExcelSchema>;
export type MarketScanExcelInput = z.infer<typeof marketScanExcelSchema>;
export type QACheckInput = z.infer<typeof qaCheckSchema>;
export type BuildVNFReportInput = z.infer<typeof buildVNFReportSchema>;

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as any;
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any).shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional || value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema(def.type) };
  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: zodToJsonSchema(def.valueType) };
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodToJsonSchema(def.innerType ?? def.schema);
  }
  if (schema instanceof z.ZodUnion) {
    return { anyOf: def.options.map((o: z.ZodTypeAny) => zodToJsonSchema(o)) };
  }
  return { type: "object" };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "log_scan_excel",
    description:
      "Ghi 1 dòng grant vào file Excel log chung (6 sheet: Dashboard, Database, Deadlines, Scoring, Links & Notes, AI Automation Guide). Chấm điểm song song RetriV & VNF. BẮT BUỘC điền ly_do và owner_follow_up khi de_xuat là MAYBE hoặc SKIP.",
    parameters: zodToJsonSchema(logScanExcelSchema),
    invoke: async (args) => {
      const input = logScanExcelSchema.parse(args) as LogScanExcelInput;
      try {
        logStep("tool:log_scan_excel", "invoke", { ten_chuong_trinh: input.entry.ten_chuong_trinh, output: input.output });
        return await runLogScan(input);
      } catch (err: any) {
        return `Lỗi log_scan_excel: ${err?.message || String(err)}`;
      }
    },
  },
  {
    name: "market_scan_excel",
    description:
      "Xuất Excel A — danh sách toàn bộ candidate tìm được trong Market Scan (Chế độ B), kèm eligibility sơ bộ RetriV/VNF. File độc lập với Excel log chính.",
    parameters: zodToJsonSchema(marketScanExcelSchema),
    invoke: async (args) => {
      const input = marketScanExcelSchema.parse(args) as MarketScanExcelInput;
      try {
        logStep("tool:market_scan_excel", "invoke", { output: input.output, candidates: input.payload.candidates?.length ?? 0 });
        return await runMarketScan(input);
      } catch (err: any) {
        return `Lỗi market_scan_excel: ${err?.message || String(err)}`;
      }
    },
  },
  {
    name: "qa_check",
    description:
      "Chạy QA bắt buộc sau khi tạo báo cáo Word và Excel log: kiểm tra logo nhúng, TOC field, đủ 8 mục nội dung, đủ 6 sheet, điền Lý do/Owner/Link đầy đủ. Trả về PASS/FAIL.",
    parameters: zodToJsonSchema(qaCheckSchema),
    invoke: async (args) => {
      const input = qaCheckSchema.parse(args) as QACheckInput;
      try {
        logStep("tool:qa_check", "invoke", input);
        const { ok, report } = await runQA(input);
        return `[QA ${ok ? "PASS" : "FAIL"}]\n${report}`;
      } catch (err: any) {
        return `Lỗi qa_check: ${err?.message || String(err)}`;
      }
    },
  },
  {
    name: "build_vnf_report",
    description:
      "Tạo báo cáo Word chuẩn VNF cho 1 grant scan sâu (Bước 6a): cover page, mục lục placeholder, 8 mục nội dung (thông tin cơ bản, eligibility, scoring, challenge, yêu cầu hồ sơ, đội thắng, rủi ro, đề xuất). Trả về đường dẫn file .docx vừa tạo.",
    parameters: zodToJsonSchema(buildVNFReportSchema),
    invoke: async (args) => {
      const input = buildVNFReportSchema.parse(args) as BuildVNFReportInput;
      try {
        logStep("tool:build_vnf_report", "invoke", { grantName: input.grantName, outputDir: input.outputDir ?? null });
        const outPath = await buildVNFReport(input);
        return `OK: đã tạo báo cáo Word tại ${outPath}`;
      } catch (err: any) {
        return `Lỗi build_vnf_report: ${err?.message || String(err)}`;
      }
    },
  },
];
