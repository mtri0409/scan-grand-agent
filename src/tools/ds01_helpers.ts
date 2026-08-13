/**
 * DS01-compliant ReportBuilder for VNF Strategy Framework documents.
 * TypeScript port of ds01_helpers.py — uses the `docx` npm package.
 *
 * API is intentionally close to the Python original so call-sites can be
 * translated with minimal changes. Build-up is lazy: add_* methods collect
 * elements; save() assembles and writes the docx.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Header,
  Footer,
  AlignmentType,
  VerticalAlign,
  PageOrientation,
  SectionType,
  BorderStyle,
  WidthType,
  TableLayoutType,
  LineRuleType,
  PageNumber,
  convertInchesToTwip,
  ShadingType,
} from "docx";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NAVY_HEX, GOLD_HEX, DARK_HEX, BODY_HEX, LIGHT_HEX, GREY_HEX,
  WHITE_HEX, RED_HEX, TABLE_ALT_HEX, INFO_BOX_BG_HEX, BORDER_GREY_HEX,
  FONT_NAME, DEFAULT_HEADLINE, DEFAULT_FOOTER_TEXT, DEFAULT_WIDTH_LEVEL,
  LANDSCAPE_SIDE_MARGIN, normalizeWidthLevel,
} from "./ds01_constants.js";

// ---- Twip helpers ----
const IN = convertInchesToTwip;
// FIX (đơn vị font size sai): docx (npm) quy định TextRun.size tính bằng
// HALF-POINT — 12pt phải truyền 24 (pt*2), KHÔNG phải pt*20. Bản cũ dùng
// pt*20 khiến mọi chữ trong tài liệu hiển thị gấp 10 lần kích thước dự kiến
// (12pt dự kiến -> ra 120pt thật). PT() ở đây chỉ được dùng cho size của
// TextRun trong toàn file (spacing before/after/line đã truyền số dxa thật
// trực tiếp, không qua PT(), nên không bị ảnh hưởng).
const PT = (pt: number) => pt * 2; // pt -> half-point, đúng chuẩn docx (npm)

type DocxElement = Paragraph | Table;

interface CoverElements {
  header: Header;
  body: DocxElement[];
}

interface ContentSection {
  header: Header;
  footer: Footer;
  children: DocxElement[];
  properties: {
    type: (typeof SectionType)[keyof typeof SectionType];
    page: { size: { width: number; height: number; orientation: string } };
    margin: { top: number; bottom: number; left: number; right: number };
  };
}

function makeBorderDef(color: string, sz: number, style: (typeof BorderStyle)[keyof typeof BorderStyle] = BorderStyle.SINGLE) {
  return { color, size: sz, style };
}

function textRun(
  text: string,
  opts: {
    size?: number; bold?: boolean; italic?: boolean; color?: string;
    font?: string; allCaps?: boolean;
  } = {}
): TextRun {
  return new TextRun({
    text,
    size: PT(opts.size ?? 12),
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    color: opts.color ?? BODY_HEX,
    font: { name: opts.font ?? FONT_NAME, eastAsia: opts.font ?? FONT_NAME },
    allCaps: opts.allCaps ?? false,
  });
}

function spacingProps(before = 0, after = 120, line = 340, lineRule: (typeof LineRuleType)[keyof typeof LineRuleType] = LineRuleType.AUTO) {
  return { before, after, line, lineRule };
}

function truncateToWidth(text: string, widthIn: number, sizePt = 12): string {
  const usable = Math.max(0.2, widthIn - 0.17);
  const charW = 0.132 * (sizePt / 12.0);
  const maxChars = Math.max(6, Math.floor(usable / charW));
  if (text.length <= maxChars) return text;
  const head = Math.floor(((maxChars - 1) * 3) / 5);
  const tail = maxChars - 1 - head;
  return text.slice(0, head) + "…" + (tail ? text.slice(-tail) : "");
}

function noBreak(text: string): string {
  const joiner = "⁠";
  return [...text].map(ch => "/.-_:?&=;…".includes(ch) ? ch + joiner : ch).join("");
}

// FIX (markdown **text** chưa được render): các add_* nhận text thô từ LLM,
// nhiều khi còn chứa inline markdown như **bold**, *italic*, ***bold+italic***.
// docx (npm) không tự parse markdown, nên cần helper tách thành các TextRun
// tương ứng. Chỉ hỗ trợ inline bold/italic bằng * hoặc _; không xử lý block.
function markdownRuns(
  text: string,
  base: { size?: number; bold?: boolean; italic?: boolean; color?: string; font?: string; allCaps?: boolean } = {}
): TextRun[] {
  const runs: TextRun[] = [];
  // Ưu tiên dài nhất trước: ***...***, **...**, *...* ; tương tự với _
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|___[^_]+___|__[^_]+__|_[^_]+_)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      runs.push(textRun(text.slice(lastIndex, m.index), base));
    }
    const raw = m[1];
    const trimmed = raw.replace(/^[*_]+/, "").replace(/[*_]+$/, "");
    const isBold = raw.startsWith("**") || raw.startsWith("__") || raw.startsWith("***") || raw.startsWith("___");
    const isItalic = raw.startsWith("*") || raw.startsWith("_");
    runs.push(textRun(trimmed, { ...base, bold: isBold, italic: isItalic }));
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push(textRun(text.slice(lastIndex), base));
  }
  return runs;
}

// FIX (ảnh bị ép tỉ lệ cứng + sai định dạng): 2 helper dưới đây đọc kích
// thước thật của ảnh (PNG/JPEG) để giữ đúng tỉ lệ gốc, và suy ra đúng
// `type` cho ImageRun theo phần mở rộng file — thay vì hardcode height =
// width*0.6 (hoặc *0.4 cho logo) và type: "png" cho mọi ảnh như bản cũ.

function inferImageType(imagePath: string): "png" | "jpg" | "gif" | "bmp" {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "jpg";
  if (ext === ".gif") return "gif";
  if (ext === ".bmp") return "bmp";
  return "png";
}

/**
 * Đọc width/height thật (px) từ header PNG hoặc JPEG. Trả về null nếu
 * không nhận diện được định dạng — chỗ gọi sẽ tự fallback về tỉ lệ ước
 * lượng cũ để không bao giờ throw.
 */
function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: signature 8 byte, IHDR ngay sau đó — width @16, height @20 (big-endian, 4 byte mỗi giá trị)
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: quét marker tìm segment SOFn (Start Of Frame) đầu tiên
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      const segLen = buf.readUInt16BE(i + 2);
      if (isSOF) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 2 + segLen;
    }
  }
  return null;
}

// ============================================================
export interface DS01ReportBuilderOptions {
  outputPath: string;
  docCode?: string;
  docTitle?: string;
  orientation?: string;
  width?: string;
  sourcePath?: string;
  headline?: string;
  footerText?: string;
}

export class DS01ReportBuilder {
  readonly outputPath: string;
  readonly docCode: string;
  readonly docTitle: string;
  readonly headline: string;
  readonly footerText: string;
  readonly orientation: "portrait" | "landscape";
  readonly widthLevel: string;
  readonly sideMargin: number;
  readonly contentWidth: number;

  private readonly pageW: number; // twips
  private readonly pageH: number;
  private _figureCount = 0;

  // FIX (estimatePages sai công thức): docx (npm) không cho đọc lại text đã
  // add() (khác python-docx đọc được doc.paragraphs) — nên phải tự đếm dồn
  // số ký tự thật mỗi khi có text được thêm vào, để estimatePages() dùng
  // đúng công thức total_chars/2500 + table_count*0.5 giống bản Python,
  // thay vì công thức cũ (sections.length + tableCount*0.5) không liên
  // quan gì tới độ dài nội dung thật.
  private _charCount = 0;

  // Accumulated content — assembled on save()
  private _coverElements: CoverElements | null = null;
  private _sections: ContentSection[] = [];
  private _currentSection: ContentSection | null = null;

  constructor(opts: DS01ReportBuilderOptions) {
    this.outputPath = opts.outputPath;
    this.docCode = opts.docCode ?? "SP02";
    this.docTitle = opts.docTitle ?? "Document Title";
    this.headline = opts.headline ?? DEFAULT_HEADLINE;
    this.footerText = opts.footerText ?? DEFAULT_FOOTER_TEXT;
    this.widthLevel = normalizeWidthLevel(opts.width);

    const o = (opts.orientation ?? "portrait").trim().toLowerCase();
    if (["landscape", "horizontal", "ngang", "l", "h"].includes(o)) {
      this.orientation = "landscape";
      this.pageW = IN(11);
      this.pageH = IN(8.5);
      this.sideMargin = LANDSCAPE_SIDE_MARGIN[this.widthLevel as keyof typeof LANDSCAPE_SIDE_MARGIN] ?? 0.6;
      this.contentWidth = Math.round((11.0 - 2 * this.sideMargin) * 100) / 100;
    } else {
      this.orientation = "portrait";
      this.pageW = IN(8.5);
      this.pageH = IN(11);
      this.sideMargin = 1.0;
      this.contentWidth = 6.5;
    }
  }

  private _countText(...parts: (string | undefined)[]): void {
    for (const s of parts) this._charCount += (s ?? "").length;
  }

  // ============== COVER PAGE ==============
  addCoverPage(
    titleLine1: string,
    titleLine2: string,
    subtitle: string,
    versionDate: string,
    logoPath?: string,
    docCode?: string,
  ): void {
    const code = docCode ?? this.docCode;
    this._countText(titleLine1, titleLine2, subtitle, versionDate, `Document Code: ${code}`, "CONFIDENTIAL");

    const headerParagraphs = [
      new Paragraph({
        children: [],
        shading: { type: ShadingType.SOLID, fill: NAVY_HEX, color: NAVY_HEX },
        spacing: { before: 0, after: 0, line: 40, lineRule: LineRuleType.EXACT },
      }),
      new Paragraph({
        children: [textRun(this.headline.toUpperCase(), { size: 10, bold: true, color: WHITE_HEX })],
        shading: { type: ShadingType.SOLID, fill: NAVY_HEX, color: NAVY_HEX },
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.EXACT },
      }),
      new Paragraph({
        children: [textRun(this.docTitle.toUpperCase(), { size: 10, bold: true, color: WHITE_HEX })],
        shading: { type: ShadingType.SOLID, fill: NAVY_HEX, color: NAVY_HEX },
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.EXACT },
      }),
      new Paragraph({
        children: [],
        shading: { type: ShadingType.SOLID, fill: NAVY_HEX, color: NAVY_HEX },
        spacing: { before: 0, after: 0, line: 40, lineRule: LineRuleType.EXACT },
      }),
    ];

    const coverHeader = new Header({ children: headerParagraphs });

    const bodyElements: DocxElement[] = [];

    if (logoPath && fs.existsSync(logoPath)) {
      const imgData = fs.readFileSync(logoPath);
      const targetW = Math.round(1.56 * 96);
      const dims = readImageDimensions(imgData);
      const targetH = dims ? Math.round(targetW * (dims.height / dims.width)) : Math.round(targetW * 0.4);
      bodyElements.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          indent: { left: IN(1), right: IN(1) },
          children: [
            new ImageRun({
              data: imgData,
              transformation: { width: targetW, height: targetH },
              type: inferImageType(logoPath),
            }),
          ],
        }),
      );
    }

    bodyElements.push(
      new Paragraph({
        children: [textRun(titleLine1, { size: 24, bold: true, color: DARK_HEX })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        indent: { left: IN(1), right: IN(1) },
      }),
      new Paragraph({
        children: [textRun(titleLine2, { size: 20, bold: true, color: NAVY_HEX })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        indent: { left: IN(1), right: IN(1) },
      }),
      // Gold divider
      new Paragraph({
        children: [],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        indent: { left: IN(1), right: IN(1) },
        border: { bottom: { color: GOLD_HEX, size: 12, style: BorderStyle.SINGLE, space: 4 } },
      }),
      new Paragraph({
        children: [textRun(subtitle, { size: 12, italic: true, color: LIGHT_HEX })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        indent: { left: IN(1), right: IN(1) },
      }),
      new Paragraph({
        children: [textRun(versionDate, { size: 11, color: GREY_HEX })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        indent: { left: IN(1), right: IN(1) },
      }),
      new Paragraph({
        children: [textRun(`Document Code: ${code}`, { size: 11, bold: true, color: GREY_HEX })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        indent: { left: IN(1), right: IN(1) },
      }),
      new Paragraph({
        children: [textRun("CONFIDENTIAL", { size: 14, bold: true, color: RED_HEX, allCaps: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        indent: { left: IN(1), right: IN(1) },
      }),
    );

    this._coverElements = { header: coverHeader, body: bodyElements };
  }

  // ============== BEGIN CONTENT SECTION ==============
  beginContentSection(_preserveHeaderFooter = false): void {
    const hdr = new Header({
      children: [
        new Paragraph({
          children: [textRun(`${this.docCode} — ${this.docTitle}`, { size: 9, color: NAVY_HEX })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 80, line: 240, lineRule: LineRuleType.AUTO },
          border: { bottom: { color: NAVY_HEX, size: 4, style: BorderStyle.SINGLE, space: 4 } },
        }),
      ],
    });

    const footerLeftWidth = this.contentWidth - 2.5;

    const ftr = new Footer({
      children: [
        // Navy top border paragraph
        new Paragraph({
          children: [],
          spacing: { before: 80, after: 0, line: 80, lineRule: LineRuleType.EXACT },
          border: { top: { color: NAVY_HEX, size: 4, style: BorderStyle.SINGLE, space: 4 } },
        }),
        // 1×2 table for CONFIDENTIAL | Page X of Y
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.AUTOFIT,
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: IN(footerLeftWidth), type: WidthType.DXA },
                  borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                  children: [
                    new Paragraph({
                      children: [textRun(this.footerText, { size: 9, bold: true, color: RED_HEX })],
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: IN(2.5), type: WidthType.DXA },
                  borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                  children: [
                    new Paragraph({
                      children: [
                        textRun("Page ", { size: 9, color: GREY_HEX }),
                        new TextRun({ children: [PageNumber.CURRENT], size: PT(9), color: GREY_HEX }),
                        textRun(" of ", { size: 9, color: GREY_HEX }),
                        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: PT(9), color: GREY_HEX }),
                      ],
                      alignment: AlignmentType.RIGHT,
                      spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const isLandscape = this.orientation === "landscape";
    this._currentSection = {
      header: hdr,
      footer: ftr,
      children: [],
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            width: isLandscape ? IN(11) : IN(8.5),
            height: isLandscape ? IN(8.5) : IN(11),
            orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
        },
        margin: {
          top: IN(1),
          bottom: IN(1),
          left: IN(this.sideMargin),
          right: IN(this.sideMargin),
        },
      },
    };
    this._sections.push(this._currentSection);
  }

  private _add(el: DocxElement): void {
    if (this._currentSection) {
      this._currentSection.children.push(el);
    } else {
      // Before beginContentSection — accumulate on cover body
      this._coverElements?.body.push(el);
    }
  }

  // ============== HEADINGS ==============
  addH1(text: string, pageBreakBefore = true): Paragraph {
    this._countText(text);
    const p = new Paragraph({
      children: markdownRuns(text, { size: 18, bold: true, color: NAVY_HEX }),
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 120 },
      pageBreakBefore,
      keepNext: true,
      keepLines: true,
      border: { bottom: { color: GOLD_HEX, size: 12, style: BorderStyle.SINGLE, space: 4 } },
    });
    this._add(p);
    return p;
  }

  addH2(text: string): Paragraph {
    this._countText(text);
    const p = new Paragraph({
      children: markdownRuns(text, { size: 14, bold: true, color: DARK_HEX }),
      alignment: AlignmentType.LEFT,
      spacing: { before: 200, after: 80 },
      keepNext: true,
      keepLines: true,
    });
    this._add(p);
    return p;
  }

  addH3(text: string): Paragraph {
    this._countText(text);
    const p = new Paragraph({
      children: markdownRuns(text, { size: 12, bold: true, color: LIGHT_HEX }),
      alignment: AlignmentType.LEFT,
      spacing: { before: 160, after: 60 },
      keepNext: true,
      keepLines: true,
    });
    this._add(p);
    return p;
  }

  // ============== BODY ==============
  addPara(text: string): Paragraph {
    this._countText(text);
    const p = new Paragraph({
      children: markdownRuns(text, { size: 12, color: BODY_HEX }),
      alignment: AlignmentType.BOTH,
      spacing: spacingProps(0, 120, 340),
    });
    this._add(p);
    return p;
  }

  addBullet(text: string, boldPrefix?: string): Paragraph {
    this._countText(text, boldPrefix);
    const runs: TextRun[] = [textRun("• ", { size: 12, color: BODY_HEX })];
    if (boldPrefix) runs.push(...markdownRuns(`${boldPrefix}: `, { size: 12, bold: true, color: BODY_HEX }));
    runs.push(...markdownRuns(text, { size: 12, color: BODY_HEX }));
    const p = new Paragraph({
      children: runs,
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 80 },
      indent: { left: 360 },
    });
    this._add(p);
    return p;
  }

  addNote(text: string): Paragraph {
    this._countText(text);
    const p = new Paragraph({
      children: markdownRuns(text, { size: 10, italic: true, color: GREY_HEX }),
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 120 },
    });
    this._add(p);
    return p;
  }

  // ============== TABLES ==============
  addTable(
    headers: string[],
    rows: (string | number)[][],
    colWidths?: number[],
    centerCols?: number[],
    urlCols?: number[],
    _noCharWrap = true,
  ): Table {
    this._countText(...headers.map(String));
    for (const row of rows) this._countText(...row.map(String));

    const cw = this.contentWidth;
    const nCols = headers.length;
    let widths = colWidths ?? Array(nCols).fill(cw / nCols) as number[];
    const total = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(total - cw) > 0.05) widths = widths.map(w => w * (cw / total));

    const centerSet = new Set(centerCols ?? []);
    const urlSet = new Set(urlCols ?? []);

    const borderDef = (sz: number) => ({
      top: makeBorderDef(BORDER_GREY_HEX, sz),
      bottom: makeBorderDef(BORDER_GREY_HEX, sz),
      left: makeBorderDef(BORDER_GREY_HEX, sz),
      right: makeBorderDef(BORDER_GREY_HEX, sz),
    });

    const headerRow = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: headers.map((h, i) =>
        new TableCell({
          width: { size: IN(widths[i]), type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, fill: NAVY_HEX, color: NAVY_HEX },
          borders: borderDef(8),
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              children: markdownRuns(String(h), { size: 12, bold: true, color: WHITE_HEX }),
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0, line: 260, lineRule: LineRuleType.AUTO },
            }),
          ],
        }),
      ),
    });

    const dataRows = rows.map((rowData, rIdx) => {
      const fill = rIdx % 2 === 0 ? TABLE_ALT_HEX : WHITE_HEX;
      return new TableRow({
        cantSplit: true,
        children: rowData.map((val, i) => {
          let disp = String(val);
          if (urlSet.has(i)) disp = noBreak(truncateToWidth(disp, widths[i], 12));
          return new TableCell({
            width: { size: IN(widths[i]), type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, fill, color: fill },
            borders: borderDef(4),
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                children: markdownRuns(disp, { size: 12, color: BODY_HEX }),
                alignment: centerSet.has(i) ? AlignmentType.CENTER : AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: 260, lineRule: LineRuleType.AUTO },
              }),
            ],
          });
        }),
      });
    });

    const tbl = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      rows: [headerRow, ...dataRows],
    });
    this._add(tbl);
    this._add(new Paragraph({ children: [], spacing: { before: 0, after: 120 } }));
    return tbl;
  }

  // ============== CALLOUT BOX ==============
  addCalloutBox(text: string, title = "KEY INSIGHT"): Table {
    this._countText(title, text);
    const tbl = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: IN(this.contentWidth), type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, fill: INFO_BOX_BG_HEX, color: INFO_BOX_BG_HEX },
              borders: {
                top: makeBorderDef(NAVY_HEX, 16),
                right: makeBorderDef(NAVY_HEX, 16),
                bottom: makeBorderDef(NAVY_HEX, 16),
                left: makeBorderDef(NAVY_HEX, 48),
              },
              margins: { top: 120, bottom: 120, left: 200, right: 120 },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({
                  children: markdownRuns(title, { size: 11, bold: true, color: NAVY_HEX }),
                  alignment: AlignmentType.LEFT,
                  spacing: { before: 0, after: 80, line: 260, lineRule: LineRuleType.AUTO },
                }),
                new Paragraph({
                  children: markdownRuns(text, { size: 11, color: DARK_HEX }),
                  alignment: AlignmentType.LEFT,
                  spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.AUTO },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    this._add(tbl);
    this._add(new Paragraph({ children: [], spacing: { before: 0, after: 120 } }));
    return tbl;
  }

  // ============== TOC PLACEHOLDER ==============
  /**
   * Add a 1-row placeholder TOC table directly under the TOC H1.
   * finalize.ts will swap this for a real Word TOC field.
   * MUST be placed immediately after addH1('Mục lục', false) with no paragraph between.
   */
  addTocPlaceholder(): void {
    const noteText = "Nhấn F9 để cập nhật Mục lục / Press F9 to update TOC.";
    this._countText(noteText);
    const tbl = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [textRun(noteText, { size: 10, italic: true, color: GREY_HEX })],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 80, after: 80 },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    this._add(tbl);
  }

  // ============== UTILITY ==============
  addPageBreak(): void {
    // FIX (không ngắt trang thật): TextRun({ break: 1 }) chỉ chèn <w:br/>
    // (ngắt DÒNG thường) trong docx (npm) — không có w:type="page". Phải
    // dùng class PageBreak riêng của thư viện để ra đúng ngắt TRANG.
    this._add(new Paragraph({ children: [new PageBreak()] }));
  }

  addFigure(imagePath: string, caption: string, widthIn?: number): void {
    this._figureCount++;
    const w = widthIn ?? Math.round((this.contentWidth - 0.2) * 100) / 100;
    const imgData = fs.readFileSync(imagePath);
    const imgPxW = Math.round(w * 96);
    // FIX (ảnh bị ép tỉ lệ cứng): đọc kích thước thật của ảnh để tính đúng
    // height theo tỉ lệ gốc, thay vì luôn nhân width*0.6 cho mọi ảnh.
    const dims = readImageDimensions(imgData);
    const imgPxH = dims ? Math.round(imgPxW * (dims.height / dims.width)) : Math.round(imgPxW * 0.6);
    this._add(
      new Paragraph({
        children: [new ImageRun({ data: imgData, transformation: { width: imgPxW, height: imgPxH }, type: inferImageType(imagePath) })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 40 },
      }),
    );
    const [num, rest] = caption.includes("—") ? caption.split("—").map(s => s.trim()) : [caption, ""];
    this._countText(caption);
    this._add(
      new Paragraph({
        children: [
          textRun(num + (rest ? ". " : ""), { size: 10, bold: true, color: NAVY_HEX }),
          ...(rest ? markdownRuns(rest, { size: 10, italic: true, color: GREY_HEX }) : []),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
      }),
    );
  }

  estimatePages(): number {
    let tableCount = 0;
    for (const sec of this._sections) {
      for (const el of sec.children) {
        if (el instanceof Table) tableCount++;
      }
    }
    // FIX (công thức không liên quan tới nội dung thật): trước đây dùng
    // sections.length + tableCount*0.5, không đếm chữ. Giờ dùng đúng công
    // thức của bản Python: total_chars/2500 + table_count*0.5, dựa vào
    // _charCount đã đếm dồn ở mọi add_* (xem _countText()).
    return Math.floor(this._charCount / 2500 + tableCount * 0.5);
  }

  async save(): Promise<number> {
    const isLandscape = this.orientation === "landscape";
    const coverMargin = { top: 0, bottom: IN(1), left: 0, right: 0 };

    const sections: object[] = [];

    // Cover section
    if (this._coverElements) {
      sections.push({
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            size: {
              width: isLandscape ? IN(11) : IN(8.5),
              height: isLandscape ? IN(8.5) : IN(11),
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: coverMargin,
          },
          verticalAlign: "center",
        },
        headers: { default: this._coverElements.header },
        children: this._coverElements.body,
      });
    }

    // Content sections
    for (const sec of this._sections) {
      sections.push({
        properties: {
          ...sec.properties,
          verticalAlign: "top",
          headerDistance: IN(0.5),
          footerDistance: IN(0.5),
        },
        headers: { default: sec.header },
        footers: { default: sec.footer },
        children: sec.children,
      });
    }

    // FIX (thiếu default document style): style "Normal" mặc định của
    // Word/docx (npm) không phải Calibri — mọi text KHÔNG override font
    // (đáng chú ý nhất: mục lục do Word tự sinh khi nhấn F9, kế thừa style
    // Normal/TOC1-3) sẽ hiện sai font. Set default document style đúng
    // Calibri/BODY_HEX/line-spacing 1.42 (dxa 340) như bản Python
    // (_setup_default_style) để nhất quán toàn tài liệu.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: FONT_NAME, size: PT(12), color: BODY_HEX },
            paragraph: { spacing: { line: 340, lineRule: LineRuleType.AUTO } },
          },
        },
      },
      sections: sections as any[],
    });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(this.outputPath, buffer);
    const pages = this.estimatePages();
    console.log(`Saved: ${this.outputPath} (~${pages} pages)`);
    return pages;
  }
}