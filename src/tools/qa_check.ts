#!/usr/bin/env ts-node
/**
 * qa_check.ts — Bản chuyển đổi 1:1 từ qa_check.py.
 *
 * Bước QA bắt buộc của skill scan-grant-vnf, chạy SAU Bước 6 (đã có report Word + đã
 * ghi Excel log), TRƯỚC khi báo cáo "xong" với user.
 *
 * Kiểm tra tự động những lỗi đã từng xảy ra trong thực tế (nên không được bỏ qua):
 *   1. Logo VNF có thực sự nhúng vào file Word không.
 *   2. File Word có đủ TOC field thật (đã bake page number) không, và đủ 8 mục nội dung.
 *   3. File Excel log: đủ 6 sheet, mọi dòng Skip/Maybe đều có Lý do + Owner follow-up,
 *      cột Link báo cáo không rỗng và (nếu là đường dẫn cục bộ) file có tồn tại thật.
 *   4. Không có dòng trùng tên chương trình trong Database mà chưa được cảnh báo.
 *
 * Usage:
 *   ts-node qa_check.ts --report path/to/report.docx [--report path2.docx ...] \
 *                        --excel path/to/Grant_Scan_Tracker_RetriV_VNF.xlsx \
 *                        [--market-excel path/to/Grant_Market_Scan_....xlsx]
 *
 * Exit code 0 = PASS toàn bộ. Exit code 1 = có ít nhất 1 FAIL — KHÔNG được báo "xong"
 * với user khi script này trả về exit code 1; phải sửa rồi chạy lại.
 */
import * as fs from "fs";
import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import { logStep } from "../logger.js";

const REQUIRED_SHEETS = [
  "📊 Dashboard", "🗄️ Database", "📅 Deadlines", "⭐ Scoring", "🔗 Links & Notes",
  "🤖 AI Automation Guide",
];
const REQUIRED_SECTION_MARKERS = [
  "1. Thông tin cơ bản", "2. Eligibility", "3. Chấm điểm chiến lược",
  "4. Challenge phù hợp nhất", "5. Yêu cầu hồ sơ", "6. Đội thắng",
  "7. Rủi ro", "8. ĐỀ XUẤT",
];

const FAILS: string[] = [];
const WARNS: string[] = [];

function fail(msg: string) {
  FAILS.push(msg);
  console.log(`❌ FAIL: ${msg}`);
}
function warn(msg: string) {
  WARNS.push(msg);
  console.log(`⚠️  WARN: ${msg}`);
}
function ok(msg: string) {
  console.log(`✅ OK: ${msg}`);
}

/** Trích toàn bộ text trong các node <w:t>...</w:t> của document.xml — tương đương
 * việc bản Python dùng xml.etree để iterate `{...}t` elements. Dùng regex đơn giản
 * (đủ dùng cho mục đích kiểm tra text hiện diện, không cần dựng full DOM). */
function extractWText(docXml: string): string {
  const matches = docXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  return matches
    .map((m) => {
      const inner = m.replace(/^<w:t[^>]*>/, "").replace(/<\/w:t>$/, "");
      return decodeXmlEntities(inner);
    })
    .join("");
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function checkReport(reportPath: string) {
  console.log(`\n--- QA báo cáo Word: ${reportPath} ---`);
  if (!fs.existsSync(reportPath)) {
    fail(`File không tồn tại: ${reportPath}`);
    return;
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(reportPath);
  } catch {
    fail(`File .docx hỏng / không mở được: ${reportPath}`);
    return;
  }

  const entries = zip.getEntries();
  const media = entries.filter((e) => e.entryName.startsWith("word/media/")).map((e) => e.entryName);
  if (media.length === 0) {
    fail(
      "KHÔNG có logo/hình ảnh nào nhúng trong file (word/media/ rỗng) — " +
        "kiểm tra lại logo_path truyền vào add_cover_page(), đường dẫn đúng phải " +
        "là <vnf-standard-style>/assets/logo-vnf.png (KHÔNG có 'scripts/' ở giữa)."
    );
  } else {
    ok(`Có ${media.length} hình ảnh nhúng (bao gồm logo cover) — ${JSON.stringify(media)}`);
  }

  const docXmlEntry = zip.getEntry("word/document.xml");
  if (!docXmlEntry) {
    fail(`File .docx thiếu word/document.xml: ${reportPath}`);
    return;
  }
  const docXml = docXmlEntry.getData().toString("utf-8");

  const hasTocField =
    docXml.includes("TOC \\o") ||
    docXml.includes("TOC \\h") ||
    (docXml.includes("fldChar") && docXml.includes("TOC"));
  if (!hasTocField) {
    fail("Không thấy TOC field thật trong document.xml — có thể quên chạy finalize.py");
  } else {
    ok(
      'Có Word TOC field thật (placeholder "Nhấn F9 để cập nhật" là bình thường — ' +
        "user tự bấm F9 trong Word để cập nhật, không cần bake số trang trước)"
    );
  }

  // đọc text thô để kiểm tra đủ 8 mục (không quan tâm định dạng, chỉ cần chuỗi xuất hiện)
  const fullText = extractWText(docXml);
  const missing = REQUIRED_SECTION_MARKERS.filter((m) => !fullText.includes(m));
  if (missing.length > 0) {
    fail(`Thiếu mục nội dung trong báo cáo (báo cáo bị cắt cụt hoặc sai cấu trúc 8 mục): ${JSON.stringify(missing)}`);
  } else {
    ok("Đủ 8 mục nội dung bắt buộc");
  }
}

/** Tương đương check_market_excel(): chỉ WARN, không FAIL. */
async function checkMarketExcel(marketPath: string) {
  console.log(`\n--- QA Excel Market Scan (Chế độ B): ${marketPath} ---`);
  if (!fs.existsSync(marketPath)) {
    warn(`File Market Scan Excel không tồn tại: ${marketPath}`);
    return;
  }
  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(marketPath);
  } catch (e: any) {
    warn(`Không mở được file Market Scan Excel: ${e?.message || e}`);
    return;
  }
  const ws = wb.worksheets[0];
  let hasRow = false;
  const maxRow = Math.min(ws.rowCount, 50);
  for (let r = 2; r <= maxRow; r++) {
    const row = ws.getRow(r);
    let rowHasVal = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== "") rowHasVal = true;
    });
    if (rowHasVal) {
      hasRow = true;
      break;
    }
  }
  if (hasRow) {
    ok(`File Market Scan Excel có dữ liệu (sheet '${ws.name}')`);
  } else {
    warn(`File Market Scan Excel '${marketPath}' chưa có dòng dữ liệu nào (sheet '${ws.name}')`);
  }
}

async function checkExcel(excelPath: string) {
  console.log(`\n--- QA Excel log: ${excelPath} ---`);
  if (!fs.existsSync(excelPath)) {
    fail(`File không tồn tại: ${excelPath}`);
    return;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  const sheetNames = wb.worksheets.map((w) => w.name);
  const missingSheets = REQUIRED_SHEETS.filter((s) => !sheetNames.includes(s));
  if (missingSheets.length > 0) {
    fail(`Thiếu sheet: ${JSON.stringify(missingSheets)} (cần đủ 6 sheet chuẩn)`);
  } else {
    ok("Đủ 6 sheet chuẩn");
  }

  const ws = wb.getWorksheet("🗄️ Database");
  if (!ws) return;

  const headers: (string | null)[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value ? String(cell.value) : null;
  });

  const colName = headers.indexOf("Tên chương trình");
  const colDexuat = headers.indexOf("Đề xuất (Go/Maybe/Skip)");
  const colLydo = headers.indexOf("Lý do (nếu Skip/Maybe)");
  const colOwner = headers.indexOf("Owner follow-up");
  const colLink = headers.indexOf("Link báo cáo (Word)");

  if (colName < 0 || colDexuat < 0 || colLydo < 0 || colOwner < 0 || colLink < 0) {
    const missingCols = [
      ["Tên chương trình", colName],
      ["Đề xuất (Go/Maybe/Skip)", colDexuat],
      ["Lý do (nếu Skip/Maybe)", colLydo],
      ["Owner follow-up", colOwner],
      ["Link báo cáo (Word)", colLink],
    ]
      .filter(([, idx]) => (idx as number) < 0)
      .map(([name]) => name);
    fail(`Thiếu cột bắt buộc trong Database: ${JSON.stringify(missingCols)}`);
    return;
  }

  const seenNames: Record<string, number[]> = {};
  let anyRow = false;
  for (let r = 2; r <= ws.rowCount; r++) {
    const nameVal = ws.getCell(r, colName).value;
    const name = nameVal ? String(nameVal) : "";
    if (!name) continue;
    anyRow = true;
    const deXuat = String(ws.getCell(r, colDexuat).value || "").toUpperCase();
    const lyDo = ws.getCell(r, colLydo).value;
    const owner = ws.getCell(r, colOwner).value;
    const linkCellVal = ws.getCell(r, colLink).value;
    // hyperlink cell trong exceljs có thể là {text, hyperlink} object
    const link =
      linkCellVal && typeof linkCellVal === "object" && "text" in (linkCellVal as any)
        ? (linkCellVal as any).text
        : linkCellVal;

    if ((deXuat.includes("SKIP") || deXuat.includes("MAYBE")) && (!lyDo || !owner)) {
      fail(`Dòng ${r} ('${name}'): Đề xuất là ${deXuat} nhưng thiếu Lý do hoặc Owner follow-up`);
    }

    if (!deXuat.includes("SKIP") && !link) {
      fail(`Dòng ${r} ('${name}'): cột Link báo cáo (Word) đang trống`);
    } else if (link) {
      const linkStr = String(link);
      if (linkStr.startsWith("/") || linkStr.startsWith("file://")) {
        const localPath = linkStr.replace("file://", "");
        if (!fs.existsSync(localPath)) {
          warn(`Dòng ${r} ('${name}'): Link báo cáo trỏ tới đường dẫn không tồn tại trên máy hiện tại: ${localPath}`);
        }
      }
    }

    const key = name.trim().toLowerCase();
    (seenNames[key] = seenNames[key] || []).push(r);
  }

  if (!anyRow) {
    warn("Sheet Database chưa có dòng dữ liệu nào");
  }

  const dups: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(seenNames)) {
    if (v.length > 1) dups[k] = v;
  }
  if (Object.keys(dups).length > 0) {
    warn(
      `Có tên chương trình trùng lặp trong Database: ${JSON.stringify(dups)} — xác nhận đây là cố ý ` +
        `(user đã được hỏi và đồng ý) trước khi coi là bình thường`
    );
  } else {
    ok("Không có tên chương trình trùng lặp");
  }
}

export interface QAOptions {
  reports?: string[];
  excel?: string;
  marketExcel?: string;
}

export async function run(options: QAOptions): Promise<{ ok: boolean; report: string }> {
  FAILS.length = 0;
  WARNS.length = 0;
  logStep("qa_check_tool", "enter", options);

  for (const r of (options.reports || [])) {
    checkReport(r);
  }
  if (options.excel) {
    await checkExcel(options.excel);
  }
  if (options.marketExcel) {
    await checkMarketExcel(options.marketExcel);
  }

  const lines: string[] = [];
  lines.push("=".repeat(60));
  if (FAILS.length > 0) {
    lines.push(`❌ QA FAIL — ${FAILS.length} lỗi cần sửa trước khi báo 'xong' với user:`);
    for (const f of FAILS) lines.push(`   - ${f}`);
    if (WARNS.length > 0) {
      lines.push(`⚠️  Kèm ${WARNS.length} cảnh báo (không chặn nhưng nên xem lại):`);
      for (const w of WARNS) lines.push(`   - ${w}`);
    }
    const report = lines.join("\n");
    logStep("qa_check_tool", "exit", { ok: false, fails: FAILS.length, warns: WARNS.length });
    return { ok: false, report };
  } else {
    lines.push(WARNS.length > 0 ? `✅ QA PASS (${WARNS.length} cảnh báo không chặn)` : "✅ QA PASS — không có lỗi hay cảnh báo");
    if (WARNS.length > 0) {
      lines.push(`⚠️  Cảnh báo không chặn:`);
      for (const w of WARNS) lines.push(`   - ${w}`);
    }
    const report = lines.join("\n");
    logStep("qa_check_tool", "exit", { ok: true, fails: FAILS.length, warns: WARNS.length });
    return { ok: true, report };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { reports: string[]; excel?: string; marketExcel?: string } {
  const reports: string[] = [];
  let excel: string | undefined;
  let marketExcel: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--report") reports.push(argv[++i]);
    else if (argv[i] === "--excel") excel = argv[++i];
    else if (argv[i] === "--market-excel") marketExcel = argv[++i];
  }
  return { reports, excel, marketExcel };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const { ok, report } = await run(args);
    console.log(report);
    process.exit(ok ? 0 : 1);
  })();
}
