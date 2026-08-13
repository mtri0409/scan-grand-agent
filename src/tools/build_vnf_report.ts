/**
 * build_vnf_report.ts
 *
 * Tool tạo báo cáo Word chuẩn VNF cho skill scan-grant-vnf.
 * Dùng DS01ReportBuilder gốc (ds01_helpers.ts) + finalize.ts để tạo cover,
 * mục lục placeholder, 8 mục nội dung, bảng eligibility, scoring, callout.
 */
import * as fs from "fs";
import * as path from "path";
import { DS01ReportBuilder } from "./ds01_helpers.js";
import { finalizeDocx } from "./finalize.js";
import { logStep } from "../logger.js";

export interface GrantInfo {
  ten_chuong_trinh: string;
  loai?: string;
  quy_mo?: string;
  don_vi_to_chuc?: string;
  muc_do_uu_tien?: string;
  status?: string;
  mo_dk?: string;
  dong_dk?: string;
  chung_ket?: string;
  dia_diem?: string;
  nha_tai_tro?: string;
  funding?: string;
  deadline?: string;
  timeline?: string;
  website?: string;
  nguon_xac_nhan?: string;
  eligibility?: EligibilityRow[];
  scoring?: ScoringRow[];
  challenge_phu_hop_nhat?: string;
  ly_do_challenge?: string;
  challenge_du_phong?: string;
  application_form?: string;
  attachments?: string;
  word_limits?: string;
  rubric?: string;
  past_winners?: PastWinnerRow[];
  diem_chung_quan_quan?: string;
  bai_hoc?: string;
  risks?: string;
  de_xuat?: string;
  ly_do_de_xuat?: string;
  next_steps?: string[];
  maybe_questions?: string[];
  retriv_vnf_note?: string;
}

export interface EligibilityRow {
  tieu_chi: string;
  ket_qua: string;
  ghi_chu: string;
}

export interface ScoringRow {
  tieu_chi: string;
  diem: number | string;
  ly_do: string;
}

export interface PastWinnerRow {
  nam_mua?: string;
  doi?: string;
  linh_vuc?: string;
  ly_do_thang?: string;
}

export interface BuildReportInput {
  projectName?: "RetriV" | "VNF";
  grantName: string;
  scanDate?: string;
  headline?: string;
  footer?: string;
  logoPath?: string;
  outputDir?: string;
  trackerPath?: string;
  stt?: number | string;
  info: GrantInfo;
}

export async function buildVNFReport(input: BuildReportInput): Promise<string> {
  const projectName = input.projectName ?? "RetriV";
  const headline = input.headline ?? "VNF Grant Scan Report";
  const footer = input.footer ?? "Confidential";
  const scanDate = input.scanDate ?? new Date().toLocaleDateString("vi-VN");
  const outputDir = input.outputDir ?? "output/reports";
  const trackerPath = input.trackerPath ?? "output/Grant_Scan_Tracker_RetriV_VNF.xlsx";
  const stt = input.stt ? String(input.stt) : "X";
  const logoPath = input.logoPath ?? "src/asset/logo-vnf.png";

  const info = input.info;
  const safeGrantName = info.ten_chuong_trinh.replace(/[^a-zA-Z0-9\u00C0-\u1EF9\s]/g, "").replace(/\s+/g, "_").slice(0, 60);
  const outPath = path.join(outputDir, `${stt}_${safeGrantName}_ScanReport.docx`);
  logStep("build_vnf_report", "enter", { outPath, grantName: info.ten_chuong_trinh, outputDir, trackerPath });

  const rb = new DS01ReportBuilder({
    outputPath: outPath,
    docCode: "SP02",
    docTitle: headline,
    headline,
    footerText: footer,
    orientation: "portrait",
  });

  rb.addCoverPage(
    headline,
    info.ten_chuong_trinh,
    `Dự án: ${projectName}  |  Ngày scan: ${scanDate}`,
    `Document Code: SP02  |  ${scanDate}`,
    logoPath,
    "SP02"
  );

  rb.beginContentSection();

  // Mục lục (heading + placeholder table để finalize.ts swap thành TOC field)
  rb.addH1("Mục lục", false);
  rb.addTocPlaceholder();

  // 1. Thông tin cơ bản
  rb.addH1("1. Thông tin cơ bản");
  rb.addTable(
    ["Mục", "Nội dung"],
    [
      ["Tên chương trình", info.ten_chuong_trinh],
      ["Loại", info.loai ?? "Chưa rõ"],
      ["Quy mô", info.quy_mo ?? "Chưa rõ"],
      ["Đơn vị tổ chức", info.don_vi_to_chuc ?? "Chưa rõ"],
      ["Mức độ ưu tiên", info.muc_do_uu_tien ?? "Chưa rõ"],
      ["Status", info.status ?? "Chưa rõ"],
      ["Mở ĐK", info.mo_dk ?? "Chưa rõ"],
      ["Đóng ĐK", info.dong_dk ?? "Chưa rõ"],
      ["Chung kết", info.chung_ket ?? "Chưa rõ"],
      ["Địa điểm", info.dia_diem ?? "Chưa rõ"],
      ["Nhà tài trợ", info.nha_tai_tro ?? "Chưa rõ"],
      ["Funding", info.funding ?? "Chưa rõ"],
      ["Deadline", info.deadline ?? "Chưa rõ"],
      ["Timeline", info.timeline ?? "Chưa rõ"],
      ["Website", info.website ?? "Chưa rõ"],
      ["Nguồn xác nhận", info.nguon_xac_nhan ?? "Chưa rõ"],
    ],
    [1.6, 4.9]
  );

  // 2. Eligibility
  rb.addH1("2. Eligibility — Kiểm tra Hard-Stop");
  rb.addTable(
    ["Tiêu chí", "Kết quả", "Ghi chú"],
    info.eligibility?.map((e) => [e.tieu_chi, e.ket_qua, e.ghi_chu]) ?? [["Không có dữ liệu", "", ""]],
    [1.6, 1.2, 3.7]
  );

  // 3. Chấm điểm
  rb.addH1("3. Chấm điểm chiến lược");
  const scoringRows = info.scoring?.map((s) => [s.tieu_chi, String(s.diem), s.ly_do]) ?? [];
  const totalScore = info.scoring ? String(info.scoring.reduce((sum, s) => sum + Number(s.diem || 0), 0)) : "";
  rb.addTable(
    ["Tiêu chí", "Điểm", "Lý do"],
    [...scoringRows, ["TỔNG", totalScore, ""]],
    [2.5, 0.8, 3.2]
  );
  rb.addNote(info.retriv_vnf_note ?? "Ghi chú: Excel log đã chấm điểm song song RetriV & VNF (thang 0-10) — xem sheet ⭐ Scoring.");

  // 4. Challenge
  rb.addH1("4. Challenge phù hợp nhất");
  rb.addBullet(info.challenge_phu_hop_nhat ?? "N/A — chương trình không chia track", "Track/challenge đề xuất");
  rb.addBullet(info.ly_do_challenge ?? "Chưa rõ", "Lý do phù hợp");
  rb.addBullet(info.challenge_du_phong ?? "Không có", "Track dự phòng");

  // 5. Yêu cầu hồ sơ
  rb.addH1("5. Yêu cầu hồ sơ");
  rb.addTable(
    ["Mục", "Nội dung"],
    [
      ["Form", info.application_form ?? "Chưa rõ"],
      ["Attachments cần có", info.attachments ?? "Chưa rõ"],
      ["Word/character limit", info.word_limits ?? "Chưa rõ"],
      ["Rubric/criteria", info.rubric ?? "Chưa rõ"],
    ],
    [1.6, 4.9]
  );

  // 6. Past winners
  rb.addH1("6. Đội thắng các mùa trước & Bài học cho RetriV/VNF");
  const pastRows = info.past_winners?.map((w) => [w.nam_mua ?? "", w.doi ?? "", w.linh_vuc ?? "", w.ly_do_thang ?? ""]) ?? [];
  rb.addTable(
    ["Năm/Mùa", "Đội/Dự án thắng", "Lĩnh vực/Sản phẩm", "Lý do thắng (theo BGK)"],
    pastRows.length > 0 ? pastRows : [["Chưa rõ", "", "", "Đã search nhưng không tìm thấy dữ liệu đội thắng công khai"]],
    [1.0, 1.8, 1.8, 2.1]
  );
  rb.addPara("**Điểm chung giữa các đội thắng:** " + (info.diem_chung_quan_quan ?? "Chưa rõ"));
  rb.addPara("**Bài học RetriV/VNF có thể rút ra:** " + (info.bai_hoc ?? "Chưa rõ"));

  // 7. Rủi ro
  rb.addH1("7. Rủi ro & điểm cần lưu ý");
  rb.addPara(info.risks ?? "Chưa rõ");

  // 8. Đề xuất
  rb.addH1("8. ĐỀ XUẤT: " + (info.de_xuat ?? "MAYBE"));
  rb.addPara("**Lý do chính:** " + (info.ly_do_de_xuat ?? "Chưa rõ"));
  if (info.next_steps && info.next_steps.length > 0) {
    rb.addH2("Việc cần làm tiếp theo");
    for (const step of info.next_steps) rb.addBullet(step);
  }
  if (info.maybe_questions && info.maybe_questions.length > 0) {
    rb.addH2("Nếu MAYBE — câu hỏi cần giải đáp trước khi quyết định");
    for (const q of info.maybe_questions) rb.addBullet(q);
  }
  rb.addCalloutBox(
    (info.de_xuat ?? "MAYBE") + " — " + (info.ly_do_de_xuat ?? "Chưa rõ"),
    "ĐỀ XUẤT"
  );

  rb.addPara("Quyết định cuối cùng thuộc về team. Skill chỉ đề xuất.");
  rb.addPara(`Đã ghi vào log: ${trackerPath}`);

  await rb.save();
  // finalize: thay placeholder TOC bằng Word TOC field thật (vẫn để F9)
  await finalizeDocx(outPath, ["Mục lục", "MỤC LỤC"]);
  logStep("build_vnf_report", "saved", outPath);
  return outPath;
}

// CLI
function parseArgs(argv: string[]): { input: string; outputDir?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--output-dir") args.outputDir = argv[++i];
  }
  if (!args.input) {
    console.error("Usage: ts-node build_vnf_report.ts --input report.json [--output-dir output/reports]");
    process.exit(1);
  }
  return { input: args.input, outputDir: args.outputDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const input: BuildReportInput = JSON.parse(fs.readFileSync(args.input, "utf-8"));
    if (args.outputDir) input.outputDir = args.outputDir;
    const outPath = await buildVNFReport(input);
    console.log(outPath);
  })();
}
