#!/usr/bin/env ts-node
/**
 * log_scan_excel.ts — Bản chuyển đổi 1:1 từ log_scan_excel.py (v2).
 *
 * Ghi 1 dòng kết quả scan grant vào file Excel tracker RIÊNG của skill scan-grant-vnf
 * (KHÔNG đụng file tracker gốc trong input/ — file gốc chỉ dùng để tham khảo cấu trúc cột).
 *
 * Giữ nguyên toàn bộ đặc tả nghiệp vụ của bản Python:
 *   - Đủ 6 sheet, mirror cấu trúc & màu sắc của file tracker gốc VNF:
 *     📊 Dashboard | 🗄️ Database | 📅 Deadlines | ⭐ Scoring | 🔗 Links & Notes | 🤖 AI Automation Guide
 *   - Chấm điểm 0-10 SONG SONG cho CẢ RetriV VÀ VNF trên mọi entry.
 *   - Bắt buộc "de_xuat" (Go/Maybe/Skip); nếu là Skip/Maybe thì "ly_do" và
 *     "owner_follow_up" là bắt buộc (script chặn và báo lỗi nếu thiếu).
 *   - Dashboard & Deadlines được TÍNH LẠI TOÀN BỘ mỗi lần chạy; Database/Scoring/
 *     Links & Notes chỉ APPEND dòng mới, giữ nguyên dữ liệu cũ.
 *   - Sheet Scoring có conditional formatting color-scale tự mở rộng theo số dòng.
 *   - Sheet Deadlines tự tô màu theo độ gấp deadline + legend.
 *   - Sheet Database/Links & Notes tô màu cả dòng theo Mức độ ưu tiên.
 *
 * Usage:
 *   ts-node log_scan_excel.ts --data entry.json --output "<workspace>/output/Grant_Scan_Tracker_RetriV_VNF.xlsx"
 *   ts-node log_scan_excel.ts --data entry.json --output "..." --today 07/07/2026
 *
 * entry.json schema: giữ nguyên schema gốc — xem SKILL.md / README.
 */
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import {
  NAVY,
  DARK_NAVY,
  GOLD,
  WHITE,
  GREEN,
  ORANGE,
  RED,
  BLUE,
  HEADER_FILL,
  HEADER_FONT,
  GROUP_RETRIV_FILL,
  GROUP_VNF_FILL,
  TITLE_FONT,
  SUB_FONT,
  SECTION_FONT,
  WRAP,
  CENTER,
  BORDER,
  solidFill,
  styleHeaderRow,
  setWidths,
  tintRow,
  writeRow,
  argb,
} from "./xlsx-style-helpers.js";
import { logStep } from "../logger.js";

// ---------------------------------------------------------------------------
// Hằng số cấu trúc — copy nguyên văn từ bản Python
// ---------------------------------------------------------------------------

const DASH_SHEET = "📊 Dashboard";
const DB_SHEET = "🗄️ Database";
const DL_SHEET = "📅 Deadlines";
const SCORE_SHEET = "⭐ Scoring";
const LINKS_SHEET = "🔗 Links & Notes";
const GUIDE_SHEET = "🤖 AI Automation Guide";

const DB_HEADERS = [
  "STT", "Tên chương trình", "Loại", "Quy mô", "Đơn vị tổ chức", "Mức độ ưu tiên", "Status",
  "Mở ĐK", "Đóng ĐK", "Chung kết", "Địa điểm", "Thưởng (tỷ VND)", "Cơ cấu giải",
  "Lĩnh vực RetriV", "Lĩnh vực VNF", "Nội dung khác",
  "RetriV Đăng ký", "RetriV Kết quả", "RetriV ⭐",
  "VNF Đăng ký", "VNF Kết quả", "VNF ⭐",
  "Challenge phù hợp nhất", "Quán quân",
  "Đề xuất (Go/Maybe/Skip)", "Theo dõi vòng sau?", "Lý do (nếu Skip/Maybe)", "Owner follow-up",
  "Ghi chú 1", "Ghi chú 2", "Ref (nguồn)", "Link báo cáo (Word)",
];
const DB_WIDTHS = [5, 30, 10, 14, 22, 12, 18, 11, 11, 11, 16, 12, 22, 22, 22, 22, 11, 11, 9, 11, 11, 9, 20, 20, 14, 12, 30, 26, 26, 26, 30];
const DB_KEYS = [
  "stt", "ten_chuong_trinh", "loai", "quy_mo", "don_vi_to_chuc", "muc_do_uu_tien", "status",
  "mo_dk", "dong_dk", "chung_ket", "dia_diem", "thuong_ty_vnd", "co_cau_giai",
  "linh_vuc_retriv", "linh_vuc_vnf", "noi_dung_khac",
  "retriv_dang_ky", "retriv_ket_qua", "retriv_tb",
  "vnf_dang_ky", "vnf_ket_qua", "vnf_tb",
  "challenge_phu_hop_nhat", "quan_quan",
  "de_xuat", "watchlist", "ly_do", "owner_follow_up",
  "ghi_chu_1", "ghi_chu_2", "ref", "link_bao_cao",
] as const;

const SCORE_SUBHEADERS = [
  "STT", "Tên chương trình", "Loại", "Mức độ ưu tiên", "Status", "Thưởng (tỷ VND)",
  "Khớp lĩnh vực", "Đổi mới", "Tác động MT", "Tiềm năng QT", "Đạt giải", "⭐ TB RetriV",
  "Khớp lĩnh vực", "Đổi mới", "Tác động MT", "Tiềm năng QT", "Đạt giải", "⭐ TB VNF",
  "Ghi chú",
];
const SCORE_WIDTHS = [3, 30, 10, 12, 18, 12, 11, 9, 11, 11, 9, 10, 11, 9, 11, 11, 9, 10, 34];

const DEADLINE_HEADERS = [
  "STT", "Tên chương trình", "Loại", "Quy mô", "Mức độ ưu tiên", "Status",
  "Mở ĐK", "Đóng ĐK ⚡", "Chung kết", "📅 Còn lại", "Địa điểm",
  "Thưởng (tỷ VND)", "RetriV ⭐", "VNF ⭐", "Đề xuất",
];
const DEADLINE_WIDTHS = [5, 30, 10, 14, 12, 18, 11, 15, 11, 18, 22, 12, 9, 9, 12];

const LINKS_HEADERS = ["STT", "Tên chương trình", "Mức độ", "Ref / Nguồn", "Ghi chú 1", "Ghi chú 2", "Quán quân"];
const LINKS_WIDTHS = [5, 30, 14, 34, 34, 30, 30];

const GUIDE_LINES: Array<[string, string]> = [
  ["Mục đích file", "Log riêng của skill scan-grant-vnf — KHÔNG phải file tracker gốc VNF (input/Grant_Fund_Tracker_VNF_2026.xlsx). Chỉ tham khảo cấu trúc cột từ file gốc, không copy/ghi đè."],
  ["Khi nào thêm dòng mới", "Mỗi lần user yêu cầu scan 1 grant/fund/competition mới cho RetriV và/hoặc VNF."],
  ["Bắt buộc chấm điểm song song", "Luôn chấm điểm 0–10 cho CẢ RetriV VÀ VNF trên 5 tiêu chí (Khớp lĩnh vực, Đổi mới, Tác động MT, Tiềm năng QT, Đạt giải) — kể cả khi chỉ 1 công ty có ý định apply, để so sánh mức độ phù hợp giữa 2 công ty."],
  ["Cột Đề xuất (Go/Maybe/Skip)", "Bắt buộc điền 🟢 GO / 🟡 MAYBE / 🔴 SKIP theo thang điểm 6 tiêu chí (Bước 4 của skill: 25-30=GO, 18-24=MAYBE, <18=SKIP) hoặc theo hard-stop eligibility (Bước 3)."],
  ["Cột Lý do (nếu Skip/Maybe)", "BẮT BUỘC điền khi Đề xuất là 🔴 SKIP hoặc 🟡 MAYBE — script sẽ báo lỗi và không ghi nếu thiếu. Nêu rõ hard-stop nào bị fail hoặc điểm nào thấp, có so sánh RetriV vs VNF nếu liên quan."],
  ["Cột Owner follow-up", "BẮT BUỘC điền khi Skip/Maybe (script chặn nếu thiếu) — ai chịu trách nhiệm theo dõi vòng sau, hoặc ghi rõ 'Không cần follow-up' nếu loại vĩnh viễn."],
  ["Màu tô theo Mức độ ưu tiên", "Ưu tiên = xanh lá nhạt (D9F2D9), Cần xem gấp = hồng nhạt (FBE4E4), Xem xét = xanh dương nhạt (DCE6F1), Không phù hợp = xám nhạt (EFEFEF) — tô cả dòng ở sheet Database & Links and Notes, tự động theo giá trị 'muc_do_uu_tien'."],
  ["Màu tô theo mức độ gấp deadline", "≤14 ngày = đỏ, 15–30 ngày = cam, 31–90 ngày = vàng, >90 ngày = xanh lá, đã qua/chưa có ngày = xám — áp dụng ở sheet Deadlines, cột 'Còn lại', TÍNH LẠI mỗi lần script chạy theo ngày hiện tại."],
  ["Link báo cáo Word", "Luôn build báo cáo Word bằng skill vnf-standard-style (DS01ReportBuilder) TRƯỚC, rồi mới điền đường dẫn file .docx vào cột 'Link báo cáo (Word)' — không để trống."],
  ["Dashboard & Deadlines tự tính lại", "2 sheet này KHÔNG lưu trạng thái riêng — mỗi lần script chạy sẽ đọc lại toàn bộ Database hiện có rồi build lại từ đầu, nên luôn phản ánh đúng ngày hiện tại + toàn bộ lịch sử scan."],
];

// TODAY — global, có thể override bằng --today (giống biến module-level TODAY trong Python)
let TODAY: Date = new Date();

// ---------------------------------------------------------------------------
// Helpers ngày tháng / điểm số — copy logic nguyên văn
// ---------------------------------------------------------------------------

function parseDate(s: any): Date | null {
  if (!s) return null;
  const str = String(s);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime())) return null;
  return d;
}

function dateOnlyDiffDays(a: Date, b: Date): number {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(ms / 86400000);
}

function daysLeft(deadlineStr: any): number | null {
  const d = parseDate(deadlineStr);
  if (!d) return null;
  return dateOnlyDiffDays(d, TODAY);
}

function daysLeftLabel(deadlineStr: any): string {
  const dl = daysLeft(deadlineStr);
  if (dl === null) return "Chưa có ngày";
  if (dl < 0) return `ĐÃ QUA (${Math.abs(dl)} ngày)`;
  if (dl === 0) return "HÔM NAY";
  return `Còn ${dl} ngày`;
}

function urgencyFill(deadlineStr: any): string {
  const dl = daysLeft(deadlineStr);
  if (dl === null || dl < 0) return "D9D9D9";
  if (dl <= 14) return "F8CBCB";
  if (dl <= 30) return "FCE4D6";
  if (dl <= 90) return "FFF2CC";
  return "D9F2D9";
}

function avgScores(scores: Record<string, any> | undefined | null, keys: string[]): number | null {
  const vals = keys
    .map((k) => (scores ? scores[k] : undefined))
    .filter((v) => v !== undefined && v !== null && v !== "") as number[];
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + Number(b), 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const DATE_MAX = new Date(8640000000000000); // tương đương datetime.date.max cho mục đích sort

function sortByDongDk<T extends { dong_dk?: any }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = parseDate(a.dong_dk) || DATE_MAX;
    const db = parseDate(b.dong_dk) || DATE_MAX;
    return da.getTime() - db.getTime();
  });
}

// ---------------------------------------------------------------------------
// Đọc/ghi worksheet — tương đương style_header_row/set_widths (dùng chung từ helpers)
//  + refresh_headers / ensure_workbook / read_existing_db_rows / next_stt /
//    rebuild_dashboard / rebuild_deadlines / reapply_scoring_colorscale
// ---------------------------------------------------------------------------

function refreshHeaders(wb: ExcelJS.Workbook) {
  const wsDb = wb.getWorksheet(DB_SHEET)!;
  styleHeaderRow(wsDb, 1, DB_HEADERS, 1);
  setWidths(wsDb, DB_WIDTHS, 1);

  const wsLn = wb.getWorksheet(LINKS_SHEET)!;
  styleHeaderRow(wsLn, 1, LINKS_HEADERS, 1);
  setWidths(wsLn, LINKS_WIDTHS, 1);

  const wsSc = wb.getWorksheet(SCORE_SHEET)!;
  stampScoreSubheaderBlock(wsSc);
  setWidths(wsSc, SCORE_WIDTHS, 1);
}

/** Merge idempotent — openpyxl's merge_cells() là no-op an toàn khi range đã merge
 * sẵn (ví dụ khi refresh_headers() chạy lại trên file có sẵn), nhưng ExcelJS ném lỗi
 * "already merged" trong trường hợp đó — nên unmerge trước rồi merge lại để tương đương
 * hành vi idempotent của bản Python. */
function safeMergeCells(ws: ExcelJS.Worksheet, range: string) {
  try {
    ws.unMergeCells(range);
  } catch {
    /* chưa merge thì bỏ qua */
  }
  ws.mergeCells(range);
}

function stampScoreSubheaderBlock(wsSc: ExcelJS.Worksheet) {
  safeMergeCells(wsSc, "B4:H4");
  wsSc.getCell("B4").value = "THÔNG TIN";
  wsSc.getCell("B4").font = HEADER_FONT;
  wsSc.getCell("B4").fill = HEADER_FILL;
  wsSc.getCell("B4").alignment = CENTER;

  safeMergeCells(wsSc, "I4:N4");
  wsSc.getCell("I4").value = "🔬 RetriV — Điểm phù hợp";
  wsSc.getCell("I4").font = HEADER_FONT;
  wsSc.getCell("I4").fill = GROUP_RETRIV_FILL;
  wsSc.getCell("I4").alignment = CENTER;

  safeMergeCells(wsSc, "O4:T4");
  wsSc.getCell("O4").value = "🌿 VNF — Điểm phù hợp";
  wsSc.getCell("O4").font = HEADER_FONT;
  wsSc.getCell("O4").fill = GROUP_VNF_FILL;
  wsSc.getCell("O4").alignment = CENTER;

  styleHeaderRow(wsSc, 5, SCORE_SUBHEADERS, 2);
}

/** Tương đương ensure_workbook(): load file có sẵn (validate schema) hoặc tạo mới đủ 6 sheet. */
async function ensureWorkbook(outPath: string): Promise<{ wb: ExcelJS.Workbook; isNew: boolean }> {
  logStep("log_scan_excel", "ensure workbook", outPath);
  if (fs.existsSync(outPath)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outPath);
    for (const name of [DASH_SHEET, DB_SHEET, DL_SHEET, SCORE_SHEET, LINKS_SHEET, GUIDE_SHEET]) {
      if (!wb.getWorksheet(name)) {
        console.error(
          `ERROR: file output đã tồn tại nhưng thiếu sheet '${name}'. ` +
            `Không tự ý ghi đè — kiểm tra lại file hoặc đổi tên output.`
        );
        process.exit(1);
      }
    }
    const wsDb = wb.getWorksheet(DB_SHEET)!;
    const headerRow = wsDb.getRow(1);
    let existingNcols = 0;
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== "") existingNcols++;
    });
    let hasDataRows = false;
    for (let r = 2; r <= wsDb.rowCount; r++) {
      const v = wsDb.getCell(r, 1).value;
      if (v !== null && v !== undefined && v !== "") {
        hasDataRows = true;
        break;
      }
    }
    if (hasDataRows && existingNcols !== DB_HEADERS.length) {
      console.error(
        `ERROR: sheet '${DB_SHEET}' hiện có ${existingNcols} cột nhưng script này dùng ` +
          `${DB_HEADERS.length} cột (schema đã đổi, ví dụ thêm cột 'Theo dõi vòng sau?'). ` +
          `Dữ liệu cũ cần migrate tay trước khi append tiếp — không tự ý ghi đè để tránh lệch cột.`
      );
      process.exit(1);
    }
    refreshHeaders(wb);
    return { wb, isNew: false };
  }

  const wb = new ExcelJS.Workbook();

  const wsDash = wb.addWorksheet(DASH_SHEET);
  wsDash.properties.tabColor = { argb: argb(NAVY) };

  const wsDb = wb.addWorksheet(DB_SHEET);
  wsDb.properties.tabColor = { argb: argb(NAVY) };
  styleHeaderRow(wsDb, 1, DB_HEADERS, 1);
  wsDb.views = [{ state: "frozen", ySplit: 1 }];
  setWidths(wsDb, DB_WIDTHS, 1);

  const wsDl = wb.addWorksheet(DL_SHEET);
  wsDl.properties.tabColor = { argb: argb("C0504D") };
  styleHeaderRow(wsDl, 1, DEADLINE_HEADERS, 1);
  wsDl.views = [{ state: "frozen", ySplit: 1 }];
  setWidths(wsDl, DEADLINE_WIDTHS, 1);

  const wsSc = wb.addWorksheet(SCORE_SHEET);
  wsSc.properties.tabColor = { argb: argb(GOLD) };
  wsSc.getCell("B2").value = "⭐ BẢNG CHẤM ĐIỂM PHÙ HỢP — RetriV & VNF (Thang 10)";
  wsSc.getCell("B2").font = TITLE_FONT;
  stampScoreSubheaderBlock(wsSc);
  wsSc.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
  setWidths(wsSc, SCORE_WIDTHS, 1);

  const wsLn = wb.addWorksheet(LINKS_SHEET);
  wsLn.properties.tabColor = { argb: argb("8064A2") };
  styleHeaderRow(wsLn, 1, LINKS_HEADERS, 1);
  wsLn.views = [{ state: "frozen", ySplit: 1 }];
  setWidths(wsLn, LINKS_WIDTHS, 1);

  const wsAi = wb.addWorksheet(GUIDE_SHEET);
  wsAi.properties.tabColor = { argb: argb("8064A2") };
  wsAi.views = [{ showGridLines: false }];
  wsAi.getCell("B2").value = "🤖 HƯỚNG DẪN AI / SKILL scan-grant-vnf — Cách ghi tiếp vào file này";
  wsAi.getCell("B2").font = TITLE_FONT;
  let r = 4;
  for (const [label, desc] of GUIDE_LINES) {
    const labelCell = wsAi.getCell(r, 2);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: argb(NAVY) } };
    labelCell.alignment = WRAP;
    const descCell = wsAi.getCell(r, 5);
    descCell.value = desc;
    descCell.alignment = WRAP;
    descCell.font = { size: 10, color: { argb: argb("333333") } };
    wsAi.mergeCells(r, 5, r, 10);
    r += 2;
  }
  setWidths(wsAi, [3, 26], 1);
  for (let col = 5; col <= 10; col++) {
    wsAi.getColumn(col).width = 14;
  }

  return { wb, isNew: true };
}

interface DbRow {
  [key: string]: any;
}

/** Tương đương read_existing_db_rows(). */
function readExistingDbRows(wsDb: ExcelJS.Worksheet): DbRow[] {
  const rows: DbRow[] = [];
  for (let r = 2; r <= wsDb.rowCount; r++) {
    const stt = wsDb.getCell(r, 1).value;
    if (stt === null || stt === undefined || stt === "") continue;
    const row: DbRow = {};
    DB_KEYS.forEach((key, c) => {
      row[key] = wsDb.getCell(r, c + 1).value;
    });
    rows.push(row);
  }
  return rows;
}

/** Tương đương next_stt(). */
function nextStt(wsDb: ExcelJS.Worksheet): number {
  let maxStt = 0;
  for (let r = 2; r <= wsDb.rowCount; r++) {
    const v = wsDb.getCell(r, 1).value;
    if (typeof v === "number") maxStt = Math.max(maxStt, Math.trunc(v));
  }
  return maxStt + 1;
}

/** Tương đương rebuild_dashboard(). */
function rebuildDashboard(wb: ExcelJS.Workbook, allRows: DbRow[], watchlistStts: any[]) {
  const existing = wb.getWorksheet(DASH_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet(DASH_SHEET);
  ws.properties.tabColor = { argb: argb(NAVY) };
  ws.views = [{ showGridLines: false }];

  ws.getCell("B2").value = "🏆 GRANT SCAN TRACKER — RetriV & VNF (đầu ra riêng của skill scan-grant-vnf)";
  ws.getCell("B2").font = TITLE_FONT;
  ws.getCell("B3").value =
    `Cập nhật: ${fmtDate(TODAY)}  |  Nguồn: scan-grant-vnf output log (không đụng file tracker gốc VNF trong input/)`;
  ws.getCell("B3").font = SUB_FONT;

  const total = allRows.length;
  const go = allRows.filter((e) => String(e.de_xuat || "").toUpperCase().includes("GO")).length;
  const maybe = allRows.filter((e) => String(e.de_xuat || "").toUpperCase().includes("MAYBE")).length;
  const skip = allRows.filter((e) => String(e.de_xuat || "").toUpperCase().includes("SKIP")).length;
  const watch = watchlistStts.length;

  ws.getCell("B5").value = "📌 TỔNG QUAN NHANH";
  ws.getCell("B5").font = SECTION_FONT;
  const kpis: Array<[string, number, string]> = [
    ["Tổng đã scan", total, NAVY],
    ["🟢 GO", go, GREEN],
    ["🟡 MAYBE", maybe, ORANGE],
    ["🔴 SKIP", skip, RED],
    ["🔵 Theo dõi vòng sau", watch, BLUE],
  ];
  kpis.forEach(([lab, val, color], i) => {
    const col = 2 + i * 2;
    const c1 = ws.getCell(7, col);
    c1.value = val;
    c1.font = { bold: true, size: 18, color: { argb: argb(WHITE) } };
    c1.fill = solidFill(color);
    c1.alignment = { horizontal: "center", vertical: "middle" };
    const c2 = ws.getCell(8, col);
    c2.value = lab;
    c2.font = { size: 9, color: { argb: argb("555555") }, bold: true };
    c2.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(7, col, 7, col + 1);
    ws.mergeCells(8, col, 8, col + 1);
  });

  ws.getCell("B10").value = "🗂️ ĐIỀU HƯỚNG NHANH";
  ws.getCell("B10").font = SECTION_FONT;
  const nav: Array<[string, string, string]> = [
    ["📋 DATABASE đầy đủ", `'${DB_SHEET}'!A1`, "→ Toàn bộ dữ liệu chuẩn hóa mỗi lần scan, chấm điểm song song RetriV & VNF + cột Lý do/Owner khi Skip/Maybe"],
    ["📅 DEADLINES", `'${DL_SHEET}'!A1`, "→ Sắp xếp theo ngày đóng ĐK, tự tính số ngày còn lại / đã qua, màu theo mức độ gấp"],
    ["⭐ SCORING chi tiết", `'${SCORE_SHEET}'!A1`, "→ Bảng chấm điểm 0–10 song song RetriV & VNF"],
    ["🔗 LINKS & NOTES", `'${LINKS_SHEET}'!A1`, "→ Link nguồn, ghi chú tham khảo, quán quân các mùa trước"],
    ["🤖 AI AUTOMATION GUIDE", `'${GUIDE_SHEET}'!A1`, "→ Schema & quy tắc để AI/skill tiếp tục ghi log đúng chuẩn"],
  ];
  nav.forEach(([label, target, desc], i) => {
    const r = 11 + i;
    const c = ws.getCell(r, 2);
    c.value = { text: label, hyperlink: `#${target}` } as any;
    c.font = { bold: true, color: { argb: argb(NAVY) }, underline: true };
    ws.getCell(r, 5).value = desc;
    ws.getCell(r, 5).font = { color: { argb: argb("555555") }, size: 10 };
  });

  ws.getCell("B17").value = "🔥 KẾT QUẢ SCAN — Deadline gần nhất trước";
  ws.getCell("B17").font = SECTION_FONT;
  const prioHeaders = ["STT", "Tên chương trình", "Loại", "Quy mô", "Mức độ", "Status", "Đóng ĐK", "Thưởng (tỷ VND)", "RetriV ⭐", "VNF ⭐", "Đề xuất"];
  styleHeaderRow(ws, 18, prioHeaders, 2);
  const sortedRows = sortByDongDk(allRows);
  sortedRows.forEach((e, i) => {
    const r = 19 + i;
    const vals = [
      e.stt, e.ten_chuong_trinh, e.loai, e.quy_mo, e.muc_do_uu_tien,
      e.status, e.dong_dk, e.thuong_ty_vnd, e.retriv_tb, e.vnf_tb, e.de_xuat,
    ];
    writeRow(ws, r, vals, 2);
    tintRow(ws, r, 12, e.muc_do_uu_tien);
  });

  const followStart = 19 + sortedRows.length + 2;
  ws.getCell(followStart - 1, 2).value = "🔴 CÁC ĐỀ XUẤT SKIP / MAYBE — Lý do & Owner follow-up";
  ws.getCell(followStart - 1, 2).font = SECTION_FONT;
  const followHeaders = ["Tên chương trình", "Đề xuất", "Lý do (rút gọn)", "Owner follow-up"];
  styleHeaderRow(ws, followStart, followHeaders, 2);
  let r2 = followStart + 1;
  for (const e of allRows) {
    const dx = String(e.de_xuat || "").toUpperCase();
    if (dx.includes("SKIP") || dx.includes("MAYBE")) {
      ws.getCell(r2, 2).value = e.ten_chuong_trinh;
      ws.getCell(r2, 2).alignment = WRAP;
      ws.getCell(r2, 3).value = e.de_xuat;
      ws.getCell(r2, 3).alignment = WRAP;
      ws.getCell(r2, 4).value = e.ly_do;
      ws.getCell(r2, 4).alignment = WRAP;
      ws.getCell(r2, 5).value = e.owner_follow_up;
      ws.getCell(r2, 5).alignment = WRAP;
      for (let c = 2; c <= 5; c++) ws.getCell(r2, c).border = BORDER;
      r2 += 1;
    }
  }

  setWidths(ws, [3, 30, 12, 12, 12, 18, 12, 14, 10, 10, 12], 1);
  ws.getColumn(1).width = 3;
}

/** Tương đương rebuild_deadlines(). */
function rebuildDeadlines(wb: ExcelJS.Workbook, allRows: DbRow[]) {
  const existing = wb.getWorksheet(DL_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet(DL_SHEET);
  ws.properties.tabColor = { argb: argb("C0504D") };
  styleHeaderRow(ws, 1, DEADLINE_HEADERS, 1);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  setWidths(ws, DEADLINE_WIDTHS, 1);

  const sortedRows = sortByDongDk(allRows);
  sortedRows.forEach((e, i) => {
    const r = i + 2;
    const rowVals = [
      e.stt, e.ten_chuong_trinh, e.loai, e.quy_mo, e.muc_do_uu_tien,
      e.status, e.mo_dk, e.dong_dk, e.chung_ket,
      daysLeftLabel(e.dong_dk), e.dia_diem, e.thuong_ty_vnd,
      e.retriv_tb, e.vnf_tb, e.de_xuat,
    ];
    writeRow(ws, r, rowVals, 1);
    const leftCell = ws.getCell(r, 10);
    leftCell.fill = solidFill(urgencyFill(e.dong_dk));
    const dl = daysLeft(e.dong_dk);
    const color = dl !== null && dl >= 0 && dl <= 14 ? RED : dl !== null && dl > 14 ? "CC6600" : "808080";
    leftCell.font = { bold: true, color: { argb: argb(color) } };
  });

  const legendRow = sortedRows.length + 3;
  ws.getCell(legendRow, 1).value = "Màu sắc:";
  ws.getCell(legendRow, 1).font = { bold: true };
  const legendItems: Array<[string, string]> = [
    ["≤14 ngày (GẤP)", "F8CBCB"],
    ["15-30 ngày", "FCE4D6"],
    ["31-90 ngày", "FFF2CC"],
    [">90 ngày", "D9F2D9"],
    ["Đã qua / Chưa có ngày", "D9D9D9"],
  ];
  let col = 2;
  for (const [label, color] of legendItems) {
    const cell = ws.getCell(legendRow, col);
    cell.value = label;
    cell.fill = solidFill(color);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(legendRow, col, legendRow, col + 1);
    col += 2;
  }
}

/** Tương đương reapply_scoring_colorscale(): xoá hết cf rules hiện có rồi add lại
 * cho từng cột I..T, phạm vi {col}6:{col}{last_row}. */
function reapplyScoringColorscale(wsSc: ExcelJS.Worksheet, lastRow: number) {
  (wsSc as any).conditionalFormattings = [];
  const cols = ["I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"];
  for (const colLetter of cols) {
    const ref = `${colLetter}6:${colLetter}${lastRow}`;
    wsSc.addConditionalFormatting({
      ref,
      rules: [
        {
          type: "colorScale",
          cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
          color: [{ argb: argb("F8696B") }, { argb: argb("FFEB84") }, { argb: argb("63BE7B") }],
        } as any,
      ],
    });
  }
}

/** Đưa sheet Dashboard về vị trí đầu tiên — tương đương wb.move_sheet(DASH_SHEET, offset=...).
 * ExcelJS quyết định thứ tự sheet lúc ghi file theo field `orderNo` (KHÔNG phải theo id hay
 * theo thứ tự add), nên phải hạ orderNo của Dashboard xuống thấp nhất rồi renumber các sheet
 * còn lại theo đúng orderNo hiện có của chúng (giữ nguyên thứ tự tương đối). */
function moveSheetToFront(wb: ExcelJS.Workbook, sheetName: string) {
  const target = wb.getWorksheet(sheetName) as any;
  if (!target) return;
  const others = wb.worksheets.filter((s) => s.name !== sheetName) as any[];
  target.orderNo = 0;
  others.forEach((s, i) => {
    s.orderNo = i + 1;
  });
}

export interface LogScanEntry {
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
  thuong_ty_vnd?: string | number;
  co_cau_giai?: string;
  linh_vuc_retriv?: string;
  linh_vuc_vnf?: string;
  noi_dung_khac?: string;
  retriv_dang_ky?: string;
  retriv_ket_qua?: string;
  vnf_dang_ky?: string;
  vnf_ket_qua?: string;
  challenge_phu_hop_nhat?: string;
  quan_quan?: string;
  de_xuat: string;
  watchlist?: boolean;
  ly_do?: string;
  owner_follow_up?: string;
  ghi_chu_1?: string;
  ghi_chu_2?: string;
  ref?: string;
  link_bao_cao?: string;
  retriv_scores?: Record<string, number | string>;
  vnf_scores?: Record<string, number | string>;
}

export interface LogScanOptions {
  entry: LogScanEntry;
  output: string;
  today?: Date | string;
}

export async function run(options: LogScanOptions): Promise<string> {
  const entry = options.entry;
  const output = options.output;
  logStep("log_scan_excel", "enter", { output, ten_chuong_trinh: entry.ten_chuong_trinh });
  if (options.today) {
    const d = typeof options.today === "string" ? parseDate(options.today) : options.today;
    if (d) TODAY = d;
  }

  if (!entry.ten_chuong_trinh) {
    throw new Error("ERROR: entry cần tối thiểu 'ten_chuong_trinh'");
  }
  const deXuat = String(entry.de_xuat || "");
  if (deXuat.toUpperCase().includes("SKIP") || deXuat.toUpperCase().includes("MAYBE")) {
    if (!entry.ly_do || !entry.owner_follow_up) {
      throw new Error(
        "ERROR: Đề xuất là Skip/Maybe nhưng thiếu 'ly_do' và/hoặc 'owner_follow_up'. " +
          "2 field này BẮT BUỘC khi Skip/Maybe — không ghi dòng."
      );
    }
  }

  const { wb } = await ensureWorkbook(output);
  const wsDb = wb.getWorksheet(DB_SHEET)!;
  const wsSc = wb.getWorksheet(SCORE_SHEET)!;
  const wsLn = wb.getWorksheet(LINKS_SHEET)!;

  const newNameNorm = String(entry.ten_chuong_trinh).trim().toLowerCase();
  let duplicateWarning = "";
  for (let r = 2; r <= wsDb.rowCount; r++) {
    const existingName = wsDb.getCell(r, 2).value;
    if (existingName && String(existingName).trim().toLowerCase() === newNameNorm) {
      duplicateWarning = `WARNING: '${entry.ten_chuong_trinh}' đã có trong log (dòng ${r}) — vẫn thêm dòng mới, hãy tự kiểm tra trùng lặp.`;
    }
  }

  const stt = nextStt(wsDb);
  const rs = entry.retriv_scores || {};
  const vs = entry.vnf_scores || {};
  const scoreKeys = ["khop_linh_vuc", "doi_moi", "tac_dong_mt", "tiem_nang_qt", "dat_giai"];
  const retrivTb = avgScores(rs, scoreKeys);
  const vnfTb = avgScores(vs, scoreKeys);

  const dbRowVals: DbRow = {
    stt, ten_chuong_trinh: entry.ten_chuong_trinh, loai: entry.loai,
    quy_mo: entry.quy_mo, don_vi_to_chuc: entry.don_vi_to_chuc,
    muc_do_uu_tien: entry.muc_do_uu_tien, status: entry.status,
    mo_dk: entry.mo_dk, dong_dk: entry.dong_dk, chung_ket: entry.chung_ket,
    dia_diem: entry.dia_diem, thuong_ty_vnd: entry.thuong_ty_vnd,
    co_cau_giai: entry.co_cau_giai,
    linh_vuc_retriv: entry.linh_vuc_retriv, linh_vuc_vnf: entry.linh_vuc_vnf,
    noi_dung_khac: entry.noi_dung_khac,
    retriv_dang_ky: entry.retriv_dang_ky, retriv_ket_qua: entry.retriv_ket_qua, retriv_tb: retrivTb,
    vnf_dang_ky: entry.vnf_dang_ky, vnf_ket_qua: entry.vnf_ket_qua, vnf_tb: vnfTb,
    challenge_phu_hop_nhat: entry.challenge_phu_hop_nhat, quan_quan: entry.quan_quan,
    de_xuat: entry.de_xuat,
    watchlist: entry.watchlist ? "TRUE" : "FALSE",
    ly_do: entry.ly_do, owner_follow_up: entry.owner_follow_up,
    ghi_chu_1: entry.ghi_chu_1, ghi_chu_2: entry.ghi_chu_2,
    ref: entry.ref, link_bao_cao: entry.link_bao_cao,
  };

  let lastUsed = 1;
  for (let r = 2; r <= wsDb.rowCount; r++) {
    const v = wsDb.getCell(r, 1).value;
    if (v !== null && v !== undefined && v !== "") lastUsed = r;
  }
  const newRowDb = lastUsed + 1;

  DB_KEYS.forEach((key, i) => {
    const cell = wsDb.getCell(newRowDb, i + 1);
    cell.value = dbRowVals[key] === undefined ? null : dbRowVals[key];
    cell.alignment = WRAP;
    cell.border = BORDER;
  });
  tintRow(wsDb, newRowDb, DB_HEADERS.length, entry.muc_do_uu_tien);

  const refColIdx = DB_KEYS.indexOf("ref") + 1;
  const refCell = wsDb.getCell(newRowDb, refColIdx);
  if (entry.ref) {
    refCell.value = { text: String(entry.ref), hyperlink: String(entry.ref) } as any;
    refCell.font = { color: { argb: argb(DARK_NAVY) }, underline: true };
  }
  const linkColIdx = DB_KEYS.indexOf("link_bao_cao") + 1;
  const linkCell = wsDb.getCell(newRowDb, linkColIdx);
  const linkVal = entry.link_bao_cao;
  if (linkVal) {
    let target = linkVal as string;
    if (fs.existsSync(linkVal)) {
      target = "file://" + path.resolve(linkVal).replace(/\\/g, "/");
    }
    linkCell.value = { text: String(linkVal), hyperlink: target } as any;
    linkCell.font = { color: { argb: argb(DARK_NAVY) }, underline: true };
  }
  const dxColIdx = DB_KEYS.indexOf("de_xuat") + 1;
  const dxCell = wsDb.getCell(newRowDb, dxColIdx);
  const dxUpper = String(entry.de_xuat || "").toUpperCase();
  const dxColor = dxUpper.includes("SKIP") ? RED : dxUpper.includes("MAYBE") ? ORANGE : GREEN;
  dxCell.font = { bold: true, color: { argb: argb(dxColor) } };

  let lastSc = 5;
  for (let r = 6; r <= wsSc.rowCount; r++) {
    const v = wsSc.getCell(r, 2).value;
    if (v !== null && v !== undefined && v !== "") lastSc = r;
  }
  const newRowSc = lastSc + 1;
  const scVals = [
    stt, entry.ten_chuong_trinh, entry.loai, entry.muc_do_uu_tien, entry.status,
    entry.thuong_ty_vnd,
    rs.khop_linh_vuc, rs.doi_moi, rs.tac_dong_mt, rs.tiem_nang_qt, rs.dat_giai, retrivTb,
    vs.khop_linh_vuc, vs.doi_moi, vs.tac_dong_mt, vs.tiem_nang_qt, vs.dat_giai, vnfTb,
    entry.ghi_chu_1,
  ];
  writeRow(wsSc, newRowSc, scVals, 2);
  reapplyScoringColorscale(wsSc, newRowSc);

  let lastLn = 1;
  for (let r = 2; r <= wsLn.rowCount; r++) {
    const v = wsLn.getCell(r, 1).value;
    if (v !== null && v !== undefined && v !== "") lastLn = r;
  }
  const newRowLn = lastLn + 1;
  const lnVals = [stt, entry.ten_chuong_trinh, entry.muc_do_uu_tien, entry.ref, entry.ghi_chu_1, entry.ghi_chu_2, entry.quan_quan];
  writeRow(wsLn, newRowLn, lnVals, 1);
  tintRow(wsLn, newRowLn, LINKS_HEADERS.length, entry.muc_do_uu_tien);
  const lnRefCell = wsLn.getCell(newRowLn, 4);
  if (entry.ref) {
    lnRefCell.value = { text: String(entry.ref), hyperlink: String(entry.ref) } as any;
    lnRefCell.font = { color: { argb: argb(DARK_NAVY) }, underline: true };
  }

  const allRows = readExistingDbRows(wsDb);
  const watchlistStts = allRows.filter((e) => String(e.watchlist || "").toUpperCase() === "TRUE").map((e) => e.stt);
  rebuildDeadlines(wb, allRows);
  rebuildDashboard(wb, allRows, watchlistStts);

  moveSheetToFront(wb, DASH_SHEET);

  await wb.xlsx.writeFile(output);
  logStep("log_scan_excel", "saved", output);
  return (
    `OK: đã ghi dòng ${newRowDb} (Database) / ${newRowSc} (Scoring) / ${newRowLn} (Links & Notes) ` +
    `vào ${output}; Dashboard & Deadlines đã tính lại theo ngày ${fmtDate(TODAY)}.` +
    (duplicateWarning ? "\n" + duplicateWarning : "")
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { data: string; output: string; today?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data") args.data = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
    else if (argv[i] === "--today") args.today = argv[++i];
  }
  if (!args.data || !args.output) {
    console.error("Usage: ts-node log_scan_excel.ts --data entry.json --output out.xlsx [--today dd/mm/yyyy]");
    process.exit(1);
  }
  return { data: args.data, output: args.output, today: args.today };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const entry: LogScanEntry = JSON.parse(fs.readFileSync(args.data, "utf-8"));
    const result = await run({ entry, output: args.output, today: args.today });
    console.log(result);
  })();
}
