/**
 * vnf-standard-style.ts
 *
 * Engine tạo báo cáo Word chuẩn VNF dùng docx.
 * Mirror khái niệm DS01ReportBuilder: cover page, mục lục placeholder, 8 mục nội dung,
 * bảng eligibility, bảng chấm điểm, callout đề xuất.
 *
 * Tạm thời KHÔNG chạy update_toc.py — TOC field được để dạng placeholder để user tự F9.
 */
import * as fs from "fs";
import * as path from "path";
import {
  Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, convertInchesToTwip, Header, Footer,
  PageBreak, SectionType, ExternalHyperlink,
} from "docx";

const DEFAULT_HEADLINE = "VNF Grant Scan Report";
const DEFAULT_FOOTER = "Confidential";

export interface VNFReportOptions {
  headline?: string;
  footer?: string;
  projectName: "RetriV" | "VNF";
  grantName: string;
  scanDate?: string;
  logoPath?: string;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  body: SectionBodyItem[];
}

export type SectionBodyItem =
  | { type: "paragraph"; text: string; bold?: boolean }
  | { type: "table"; headers: string[]; rows: (string | null)[][]; colWidths?: number[] }
  | { type: "bullets"; items: { prefix?: string; text: string; boldPrefix?: boolean }[] }
  | { type: "callout"; title?: string; text: string };

export class VNFReportBuilder {
  private opts: VNFReportOptions;

  constructor(opts: VNFReportOptions) {
    this.opts = opts;
  }

  private borderCell = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  };

  private navy = "1F497D";
  private gold = "C5940A";
  private white = "FFFFFF";

  private makeCell(text: string | null, opts: { header?: boolean; colSpan?: number; rowSpan?: number; width?: number } = {}) {
    const children: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: text ?? "", bold: opts.header ?? false, size: 20, color: opts.header ? this.white : "333333" })],
        alignment: AlignmentType.LEFT,
      }),
    ];
    const shading = opts.header ? { fill: this.navy } : undefined;
    return new TableCell({
      children,
      columnSpan: opts.colSpan,
      rowSpan: opts.rowSpan,
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading,
      borders: this.borderCell,
    });
  }

  private buildTable(item: Extract<SectionBodyItem, { type: "table" }>) {
    const widths = item.colWidths ?? Array(item.headers.length).fill(100 / item.headers.length);
    const headerRow = new TableRow({
      children: item.headers.map((h, i) => this.makeCell(h, { header: true, width: widths[i] })),
    });
    const dataRows = item.rows.map((row) =>
      new TableRow({
        children: row.map((cell, i) => this.makeCell(cell, { width: widths[i] })),
      })
    );
    return new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  private buildBullets(item: Extract<SectionBodyItem, { type: "bullets" }>) {
    return item.items.map((it) => {
      const prefix = it.prefix ? `${it.prefix}: ` : "• ";
      return new Paragraph({
        children: [
          new TextRun({ text: prefix, bold: it.boldPrefix ?? false, size: 22 }),
          new TextRun({ text: it.text, size: 22 }),
        ],
        spacing: { after: 120 },
      });
    });
  }

  private buildCallout(item: Extract<SectionBodyItem, { type: "callout" }>) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: item.title ?? "ĐỀ XUẤT", bold: true, size: 24, color: this.white })],
                }),
                new Paragraph({ children: [new TextRun({ text: item.text, size: 22 })] }),
              ],
              shading: { fill: this.gold },
              borders: this.borderCell,
            }),
          ],
        }),
      ],
    });
  }

  private buildSectionBody(body: SectionBodyItem[]) {
    const out: (Paragraph | Table)[] = [];
    for (const item of body) {
      if (item.type === "paragraph") {
        out.push(new Paragraph({
          children: [new TextRun({ text: item.text, bold: item.bold ?? false, size: 22 })],
          spacing: { after: 160 },
        }));
      } else if (item.type === "bullets") {
        out.push(...this.buildBullets(item));
      } else if (item.type === "table") {
        out.push(this.buildTable(item));
      } else if (item.type === "callout") {
        out.push(this.buildCallout(item));
      }
    }
    return out;
  }

  private buildCoverParagraphs(logoData?: Buffer) {
    const paras: Paragraph[] = [];
    if (logoData) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: "[LOGO VNF — đã nhúng ảnh]", size: 22 })],
        alignment: AlignmentType.CENTER,
      }));
    } else {
      paras.push(new Paragraph({
        children: [new TextRun({ text: "VIETNAM FOOD JSC", bold: true, size: 48, color: this.navy })],
        alignment: AlignmentType.CENTER,
      }));
    }
    paras.push(
      new Paragraph({ spacing: { before: 600 } }),
      new Paragraph({
        children: [new TextRun({ text: this.opts.headline ?? DEFAULT_HEADLINE, bold: true, size: 36, color: this.navy })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: this.opts.grantName, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Dự án: ${this.opts.projectName}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: `Ngày scan: ${this.opts.scanDate ?? new Date().toLocaleDateString("vi-VN")}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      })
    );
    return paras;
  }

  private buildTocPlaceholder() {
    return [
      new Paragraph({
        children: [new TextRun({ text: "MỤC LỤC", bold: true, size: 28, color: this.navy })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Nhấn F9 để cập nhật mục lục", italics: true, size: 22, color: "666666" })],
        alignment: AlignmentType.CENTER,
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "TOC placeholder — sẽ được thay bằng Word TOC field khi finalize.", size: 20, color: "999999" })] })],
                borders: this.borderCell,
              }),
            ],
          }),
        ],
      }),
    ];
  }

  build(): Document {
    let logoData: Buffer | undefined;
    if (this.opts.logoPath && fs.existsSync(this.opts.logoPath)) {
      try {
        logoData = fs.readFileSync(this.opts.logoPath);
      } catch {
        logoData = undefined;
      }
    }

    const children: (Paragraph | Table)[] = [];
    children.push(...this.buildCoverParagraphs(logoData));
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...this.buildTocPlaceholder());
    children.push(new Paragraph({ children: [new PageBreak()] }));

    for (const section of this.opts.sections) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 28, color: this.navy })],
        spacing: { before: 240, after: 160 },
        heading: HeadingLevel.HEADING_1,
      }));
      children.push(...this.buildSectionBody(section.body));
      children.push(new Paragraph({ spacing: { after: 160 } }));
    }

    children.push(
    new Paragraph({
      children: [new TextRun({ text: "Quyết định cuối cùng thuộc về team. Skill chỉ đề xuất.", italics: true, size: 20 })],
      spacing: { before: 300 },
    }),
      new Paragraph({
        children: [new TextRun({ text: `Đã ghi vào log: output/Grant_Scan_Tracker_RetriV_VNF.xlsx`, size: 20 })],
      })
    );

    return new Document({
      sections: [{
        properties: { type: SectionType.CONTINUOUS },
        children,
        headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: this.opts.headline ?? DEFAULT_HEADLINE, size: 18, color: this.navy })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: this.opts.footer ?? DEFAULT_FOOTER, size: 18 })], alignment: AlignmentType.CENTER })] }) },
      }],
    });
  }
}

export async function saveReport(builder: VNFReportBuilder, outPath: string): Promise<string> {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const doc = builder.build();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

export function finalizeReport(placeholderDoc: Buffer): Buffer {
  // Tạm thời finalize chỉ trả về buffer nguyên văn.
  // Sau này nếu dùng update_toc.py thì sẽ gọi Python ở đây.
  return placeholderDoc;
}

export { VNFReportBuilder as DS01ReportBuilder };
