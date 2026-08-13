#!/usr/bin/env ts-node
/**
 * market_scan_excel.ts — Bản chuyển đổi 1:1 từ market_scan_excel.py.
 *
 * Xuất Excel A của Market Scan Mode (Chế độ B) trong skill scan-grant-vnf: 1 file liệt kê
 * TOÀN BỘ candidate grant/fund/competition/accelerator tìm được từ một đợt quét thị trường
 * theo chủ đề, kèm eligibility sơ bộ song song RetriV/VNF.
 *
 * Đây là file ĐỘC LẬP với Excel log chính (log_scan_excel.ts /
 * Grant_Scan_Tracker_RetriV_VNF.xlsx) — không append, không trộn dữ liệu 2 file. Mỗi lần
 * chạy market scan tạo (hoặc ghi đè) đúng 1 file snapshot cho đợt quét đó; không cần lịch
 * sử tích luỹ như Excel log vì mục đích của Excel A chỉ là giúp user nhìn nhanh danh sách
 * vừa tìm được để quyết định deep-scan tiếp candidate nào.
 *
 * Usage:
 *   ts-node market_scan_excel.ts --data candidates.json \
 *     --output "<workspace>/output/Grant_Market_Scan_<slug-chu-de>_<ddmmyyyy>.xlsx"
 *
 * candidates.json schema: xem README hoặc SKILL.md — giữ nguyên schema gốc:
 * {
 *   "chu_de": "...",
 *   "nguon_chu_de": "User cung cấp | Mặc định theo hồ sơ RetriV/VNF",
 *   "ngay_scan": "dd/mm/yyyy",              // optional, mặc định = ngày hệ thống
 *   "candidates": [
 *     {
 *       "ten_chuong_trinh": "...",           // bắt buộc
 *       "nha_tai_tro": "...", "linh_vuc": "...", "funding": "...",
 *       "deadline": "dd/mm/yyyy hoặc mô tả (vd: Rolling / Chưa rõ)",
 *       "geography": "...",
 *       "eligibility_retriv": "Có thể | Không | Chưa rõ",
 *       "eligibility_vnf": "Có thể | Không | Chưa rõ",
 *       "website": "https://...", "nguon_tim_thay": "...",
 *       "da_deep_scan": true, "ghi_chu": "..."
 *     }
 *   ]
 * }
 */
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import {
  NAVY,
  GOLD,
  WHITE,
  GREEN,
  RED,
  DARK_NAVY,
  solidFill,
  styleHeaderRow,
  setWidths,
  writeRow,
  TITLE_FONT,
  SUB_FONT,
  argb,
} from "./xlsx-style-helpers.js";
import { logStep } from "../logger.js";

const ELIG_FILL: Record<string, string> = {
  "CÓ THỂ": "D9F2D9",
  KHÔNG: "F8CBCB",
  "CHƯA RÕ": "FFF2CC",
};
const ELIG_FONT_COLOR: Record<string, string> = {
  "CÓ THỂ": GREEN,
  KHÔNG: RED,
  "CHƯA RÕ": "9C6500",
};

const HEADERS = [
  "STT",
  "Tên chương trình",
  "Nhà tài trợ",
  "Lĩnh vực",
  "Funding",
  "Deadline",
  "Geography",
  "Eligibility sơ bộ (RetriV)",
  "Eligibility sơ bộ (VNF)",
  "Website",
  "Nguồn tìm thấy",
  "Đã deep-scan?",
  "Ghi chú",
];
const WIDTHS = [5, 30, 22, 24, 16, 16, 16, 20, 18, 30, 26, 12, 30];
const KEYS = [
  "stt",
  "ten_chuong_trinh",
  "nha_tai_tro",
  "linh_vuc",
  "funding",
  "deadline",
  "geography",
  "eligibility_retriv",
  "eligibility_vnf",
  "website",
  "nguon_tim_thay",
  "da_deep_scan",
  "ghi_chu",
] as const;

export interface MarketCandidate {
  ten_chuong_trinh: string;
  nha_tai_tro?: string;
  linh_vuc?: string;
  funding?: string;
  deadline?: string;
  geography?: string;
  eligibility_retriv?: string;
  eligibility_vnf?: string;
  website?: string;
  nguon_tim_thay?: string;
  da_deep_scan?: boolean;
  ghi_chu?: string;
}

export interface MarketScanPayload {
  chu_de?: string;
  nguon_chu_de?: string;
  ngay_scan?: string;
  candidates?: MarketCandidate[];
}

export interface MarketScanOptions {
  payload: MarketScanPayload;
  output: string;
  today?: string | Date;
}

function eligKey(v: string | undefined | null): string {
  return (v || "").trim().toUpperCase();
}

function todayStrDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function run(options: MarketScanOptions): Promise<string> {
  const payload = options.payload;
  const output = options.output;
  logStep("market_scan_excel", "enter", { output, topic: payload.chu_de ?? null, candidates: payload.candidates?.length ?? 0 });

  let today = new Date();
  if (options.today) {
    if (typeof options.today === "string") {
      const [dd, mm, yyyy] = options.today.split("/").map(Number);
      today = new Date(yyyy, mm - 1, dd);
    } else {
      today = options.today;
    }
  }

  const candidates = payload.candidates || [];
  if (candidates.length === 0) {
    throw new Error("ERROR: 'candidates' rỗng — cần ít nhất 1 candidate để xuất Excel Market Scan.");
  }

  const chuDe = payload.chu_de || "Chưa nêu chủ đề";
  const nguonChuDe = payload.nguon_chu_de || "Chưa rõ";
  const ngayScan = payload.ngay_scan || todayStrDDMMYYYY(today);

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  logStep("market_scan_excel", "output dir ready", path.dirname(path.resolve(output)));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("🔍 Market Scan", { views: [{ showGridLines: false }] });

  ws.getCell("B2").value = "🔍 GRANT MARKET SCAN — Danh sách chương trình tìm được";
  ws.getCell("B2").font = TITLE_FONT;
  ws.getCell("B3").value = `Chủ đề: ${chuDe}   |   Nguồn chủ đề: ${nguonChuDe}   |   Ngày scan: ${ngayScan}`;
  ws.getCell("B3").font = SUB_FONT;

  const total = candidates.length;
  const canRetriv = candidates.filter((c) => eligKey(c.eligibility_retriv) === "CÓ THỂ").length;
  const canVnf = candidates.filter((c) => eligKey(c.eligibility_vnf) === "CÓ THỂ").length;
  const deepScanned = candidates.filter((c) => c.da_deep_scan).length;

  const kpis: Array<[string, number, string]> = [
    ["Tổng tìm được", total, NAVY],
    ["Có thể — RetriV", canRetriv, GREEN],
    ["Có thể — VNF", canVnf, GREEN],
    ["Đã deep-scan", deepScanned, GOLD],
  ];
  kpis.forEach(([lab, val, color], i) => {
    const col = 2 + i * 2;
    const c1 = ws.getCell(5, col);
    c1.value = val;
    c1.font = { bold: true, size: 16, color: { argb: argb(WHITE) } };
    c1.fill = solidFill(color);
    c1.alignment = { horizontal: "center", vertical: "middle" };
    const c2 = ws.getCell(6, col);
    c2.value = lab;
    c2.font = { size: 9, color: { argb: argb("555555") }, bold: true };
    c2.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(5, col, 5, col + 1);
    ws.mergeCells(6, col, 6, col + 1);
  });

  const headerRow = 8;
  styleHeaderRow(ws, headerRow, HEADERS, 1);
  ws.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false }];

  candidates.forEach((cand, idx) => {
    const i = idx + 1;
    const r = headerRow + i;
    const rowVals: Record<string, any> = {
      stt: i,
      ten_chuong_trinh: cand.ten_chuong_trinh || "Chưa rõ",
      nha_tai_tro: cand.nha_tai_tro,
      linh_vuc: cand.linh_vuc,
      funding: cand.funding,
      deadline: cand.deadline,
      geography: cand.geography,
      eligibility_retriv: cand.eligibility_retriv || "Chưa rõ",
      eligibility_vnf: cand.eligibility_vnf || "Chưa rõ",
      website: cand.website,
      nguon_tim_thay: cand.nguon_tim_thay,
      da_deep_scan: cand.da_deep_scan ? "✅ Đã deep-scan" : "Chưa",
      ghi_chu: cand.ghi_chu,
    };
    writeRow(
      ws,
      r,
      KEYS.map((k) => rowVals[k]),
      1
    );

    (["eligibility_retriv", "eligibility_vnf"] as const).forEach((key, ci) => {
      const colIdx = ci === 0 ? 8 : 9;
      const ek = eligKey(rowVals[key]);
      const fillColor = ELIG_FILL[ek];
      const fontColor = ELIG_FONT_COLOR[ek];
      const cell = ws.getCell(r, colIdx);
      if (fillColor) cell.fill = solidFill(fillColor);
      if (fontColor) cell.font = { bold: true, color: { argb: argb(fontColor) } };
    });

    const website = rowVals.website;
    if (website) {
      const wcell = ws.getCell(r, 10);
      wcell.value = { text: String(website), hyperlink: String(website) };
      wcell.font = { color: { argb: argb(DARK_NAVY) }, underline: true };
    }
  });

  setWidths(ws, WIDTHS, 1);

  const footerRow = headerRow + candidates.length + 2;
  const footerCell = ws.getCell(footerRow, 2);
  footerCell.value =
    "Đây là snapshot của 1 đợt quét thị trường — không phải Excel log chính. " +
    "Candidate được chọn deep-scan sẽ có 1 dòng riêng trong Excel log " +
    "(Grant_Scan_Tracker_RetriV_VNF.xlsx) + 1 báo cáo Word riêng.";
  footerCell.font = SUB_FONT;
  ws.mergeCells(footerRow, 2, footerRow, 10);

  await wb.xlsx.writeFile(output);
  logStep("market_scan_excel", "saved", output);
  return (
    `OK: đã tạo Excel Market Scan với ${total} candidate tại ${output} ` +
    `(Có thể-RetriV: ${canRetriv}, Có thể-VNF: ${canVnf}, Đã deep-scan: ${deepScanned}).`
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
    console.error("Usage: ts-node market_scan_excel.ts --data candidates.json --output out.xlsx [--today dd/mm/yyyy]");
    process.exit(1);
  }
  return { data: args.data, output: args.output, today: args.today };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const payload: MarketScanPayload = JSON.parse(fs.readFileSync(args.data, "utf-8"));
    const result = await run({ payload, output: args.output, today: args.today });
    console.log(result);
  })();
}
