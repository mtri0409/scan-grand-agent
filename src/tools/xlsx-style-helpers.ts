/**
 * xlsx-style-helpers.ts
 *
 * Các hằng số màu sắc + helper style dùng chung, mirror 1:1 phần khai báo
 * Font/PatternFill/Border/Alignment ở đầu log_scan_excel.py và market_scan_excel.py gốc.
 * Tách riêng file này để không lặp code giữa 2 script (bản Python cũng định nghĩa
 * gần như y hệt các hằng số này ở cả 2 file).
 */
import ExcelJS from "exceljs";

// ---- Màu (giữ đúng mã hex gốc, không có "FF" alpha prefix — thêm khi gán vào ExcelJS) ----
export const NAVY = "1F497D";
export const DARK_NAVY = "21439A";
export const GOLD = "C5940A";
export const WHITE = "FFFFFF";
export const GREEN = "1E7B34";
export const ORANGE = "C55A11";
export const RED = "CC0000";
export const BLUE = "2E75B6";
export const GREY = "666666";

export function argb(hex: string): string {
  // ExcelJS cần ARGB 8 ký tự
  return hex.length === 8 ? hex : "FF" + hex;
}

export function solidFill(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } };
}

export const HEADER_FILL = solidFill(NAVY);
export const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: argb(WHITE) }, bold: true };
export const GROUP_RETRIV_FILL = solidFill("2E8B57");
export const GROUP_VNF_FILL = solidFill("2E75B6");
export const TITLE_FONT: Partial<ExcelJS.Font> = { color: { argb: argb(NAVY) }, bold: true, size: 14 };
export const SUB_FONT: Partial<ExcelJS.Font> = { color: { argb: argb("666666") }, italic: true, size: 10 };
export const SECTION_FONT: Partial<ExcelJS.Font> = { color: { argb: argb(NAVY) }, bold: true, size: 12 };

export const WRAP: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: "top" };
export const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: argb("CCCCCC") } };
export const BORDER: Partial<ExcelJS.Borders> = { left: THIN, right: THIN, top: THIN, bottom: THIN };

export const PRIORITY_FILL: Record<string, string> = {
  "Ưu tiên": "D9F2D9",
  "Cần xem gấp": "FBE4E4",
  "Xem xét": "DCE6F1",
  "Không phù hợp": "EFEFEF",
};

/** Tương đương style_header_row() trong cả 2 script gốc. */
export function styleHeaderRow(
  ws: ExcelJS.Worksheet,
  row: number,
  headers: string[],
  ncolsOffset: number = 1,
  fill: ExcelJS.Fill = HEADER_FILL
) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, ncolsOffset + i);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = fill;
    cell.alignment = CENTER;
    cell.border = BORDER;
  });
}

/** Tương đương set_widths(). */
export function setWidths(ws: ExcelJS.Worksheet, widths: number[], startCol: number = 1) {
  widths.forEach((w, i) => {
    ws.getColumn(startCol + i).width = w;
  });
}

/** Tương đương tint_row(): tô cả dòng theo Mức độ ưu tiên. */
export function tintRow(ws: ExcelJS.Worksheet, row: number, ncols: number, priority: string | undefined | null) {
  const color = (priority && PRIORITY_FILL[priority]) || "FFFFFF";
  const fill = solidFill(color);
  for (let c = 1; c <= ncols; c++) {
    ws.getCell(row, c).fill = fill;
  }
}

/** Ghi giá trị + wrap + border cho 1 dòng dữ liệu theo mảng values, bắt đầu từ cột startCol. */
export function writeRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: any[],
  startCol: number = 1,
  alignment: Partial<ExcelJS.Alignment> = WRAP,
  border: Partial<ExcelJS.Borders> = BORDER
) {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = v === undefined ? null : v;
    cell.alignment = alignment;
    cell.border = border;
  });
}

/** Tìm dòng dữ liệu cuối cùng thực sự có giá trị ở cột `col`, bắt đầu quét từ `fromRow`.
 * Tương đương pattern lặp "last_used" xuất hiện nhiều lần trong log_scan_excel.py gốc
 * (tránh cách dòng do sheet mới tạo / do openpyxl max_row không chính xác). */
export function lastUsedRow(ws: ExcelJS.Worksheet, fromRow: number, col: number, defaultRow: number): number {
  let last = defaultRow;
  const maxRow = ws.rowCount;
  for (let r = fromRow; r <= maxRow; r++) {
    const v = ws.getCell(r, col).value;
    if (v !== null && v !== undefined && v !== "") {
      last = r;
    }
  }
  return last;
}
