/**
 * Phase 3 — Finalize a DS01 report: outline tagging + Word TOC field + blank-page cleanup.
 * TypeScript port of finalize.py — uses jszip to manipulate the OOXML zip directly.
 *
 * USAGE (ts-node / node with tsx):
 *   npx tsx finalize.ts "<path to .docx>"
 *   npx tsx finalize.ts "<path>" "Mục lục"
 */
import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import { logStep } from "../logger.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WNS = `xmlns:w="${W}"`;

const DEFAULT_TOC_LIST = ["Mục lục", "MỤC LỤC", "Table of Contents", "Nội dung"];

// DS01 heading signatures: [fontSizePt, hexColor, outlineLevel, maxChars]
const HEADINGS: Array<[number, string, number, number]> = [
  [18, "21439A", 0, 100],
  [14, "1B2A4A", 1, 200],
  [12, "4A6FA5", 2, 200],
];

const TOC_FIELD_XML = `<w:p ${WNS}>
<w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>
<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>
<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:i/><w:color w:val="888888"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Nhấn F9 (hoặc chuột phải → Update Field) để cập nhật Mục lục / Press F9 to update.</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;

// ---- Minimal XML helpers (no external XML library required) ----

function extractText(paraXml: string): string {
  return (paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
    .map(m => m.replace(/<[^>]+>/g, ""))
    .join("");
}

function getAttr(xml: string, attr: string): string | null {
  const m = new RegExp(`${attr}="([^"]*)"`, "i").exec(xml);
  return m ? m[1] : null;
}

function getFontSize(paraXml: string): number | null {
  const m = /<w:sz w:val="(\d+)"/.exec(paraXml);
  if (!m) return null;
  return parseInt(m[1], 10) / 2; // half-points → points
}

function getFontColor(paraXml: string): string | null {
  const m = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(paraXml);
  return m ? m[1].toUpperCase() : null;
}

function isBold(paraXml: string): boolean {
  return /<w:b(?:\s|\/|>)/.test(paraXml);
}

function setOutlineLevel(paraXml: string, level: number): string {
  // Remove existing outlineLvl
  let p = paraXml.replace(/<w:outlineLvl[^/]*\/>/g, "").replace(/<w:outlineLvl[^>]*>.*?<\/w:outlineLvl>/g, "");
  // Add into pPr
  if (/<w:pPr>/.test(p)) {
    p = p.replace(/<\/w:pPr>/, `<w:outlineLvl w:val="${level}"/></w:pPr>`);
  } else {
    p = p.replace(/<w:p[ >]/, `<w:p><w:pPr><w:outlineLvl w:val="${level}"/></w:pPr>`);
  }
  return p;
}

function hasPageBreakBefore(paraXml: string): boolean {
  return /<w:pageBreakBefore/.test(paraXml);
}

function isPageBreakRun(paraXml: string): boolean {
  return /<w:br[^>]*w:type="page"/.test(paraXml);
}

function isEmpty(paraXml: string): boolean {
  const text = extractText(paraXml);
  if (text.trim()) return false;
  return !/<w:drawing/.test(paraXml);
}

/**
 * So khớp CHÍNH XÁC thẻ `<w:tbl>` (mở) hoặc `</w:tbl>` (đóng) tại vị trí i —
 * không phải chỉ prefix "<w:tbl". Bug gốc: bodyXml.startsWith("<w:tbl", j)
 * cũng khớp cả "<w:tblPr>", "<w:tblGrid>", "<w:tblStyle .../>"... vì các
 * thẻ con này TOÀN BỘ đều bắt đầu bằng 6 ký tự "<w:tbl" — khiến depth bị
 * tăng sai (mỗi <w:tblPr>/<w:tblGrid> tưởng là một bảng lồng mới), trong
 * khi phía đóng "</w:tbl>" không có false-positive tương ứng (vì
 * "</w:tblPr>" không khớp "</w:tbl>" 8 ký tự chính xác). Hệ quả: depth
 * không bao giờ về 0, vòng lặp nuốt luôn toàn bộ phần còn lại của body
 * vào một "phần tử bảng" duy nhất.
 */
function matchTag(bodyXml: string, pos: number, open: boolean): boolean {
  const needle = open ? "<w:tbl" : "</w:tbl>";
  if (!bodyXml.startsWith(needle, pos)) return false;
  if (open) {
    // Ký tự ngay sau "<w:tbl" phải là khoảng trắng hoặc ">" — không phải
    // một chữ cái khác (loại trừ <w:tblPr>, <w:tblGrid>, <w:tblStyle>...).
    const next = bodyXml[pos + needle.length];
    return next === " " || next === ">" || next === "/";
  }
  return true; // "</w:tbl>" đã đủ 8 ký tự chính xác, không cần kiểm tra thêm
}

// Split body content into top-level <w:p> and <w:tbl> elements
function splitBodyElements(bodyXml: string): string[] {
  const elements: string[] = [];
  let i = 0;
  while (i < bodyXml.length) {
    if (bodyXml.startsWith("<w:p", i) && !bodyXml.startsWith("<w:pPr", i)) {
      const end = bodyXml.indexOf("</w:p>", i);
      if (end === -1) break;
      elements.push(bodyXml.slice(i, end + 6));
      i = end + 6;
    } else if (matchTag(bodyXml, i, true)) {
      // Đếm độ sâu để hỗ trợ bảng lồng nhau thật sự (hiếm nhưng có thể có),
      // dùng matchTag() thay vì so khớp prefix thô để tránh false-positive
      // với tblPr/tblGrid/tblStyle... (xem giải thích ở matchTag()).
      let depth = 0, j = i;
      while (j < bodyXml.length) {
        if (matchTag(bodyXml, j, true)) { depth++; j += 6; }
        else if (matchTag(bodyXml, j, false)) { depth--; j += 8; if (depth === 0) break; }
        else j++;
      }
      elements.push(bodyXml.slice(i, j));
      i = j;
    } else if (bodyXml.startsWith("<w:sectPr", i)) {
      const end = bodyXml.indexOf("</w:sectPr>", i);
      if (end === -1) break;
      elements.push(bodyXml.slice(i, end + 11));
      i = end + 11;
    } else {
      i++;
    }
  }
  return elements;
}

export async function finalizeDocx(
  docPath: string,
  tocCandidates: string[] = DEFAULT_TOC_LIST,
): Promise<void> {
  logStep("finalize_docx", "enter", { docPath, tocCandidates });
  const docxBuffer = fs.readFileSync(docPath);
  const zip: JSZip = await JSZip.loadAsync(docxBuffer);

  const docXml: string = await zip.file("word/document.xml")!.async("string");

  // Extract body content between <w:body> and </w:body>
  const bodyMatch = /<w:body>([\s\S]*)<\/w:body>/.exec(docXml);
  if (!bodyMatch) throw new Error("Cannot find <w:body> in document.xml");
  const bodyContent = bodyMatch[1];

  let elements = splitBodyElements(bodyContent);
  const paras = elements.filter(e => e.startsWith("<w:p"));

  // Cảnh báo sớm nếu số lượng phần tử bất thường (ví dụ: chỉ 1-2 phần tử
  // cho một tài liệu nhiều trang — dấu hiệu bảng đã nuốt hết phần còn lại).
  if (elements.length < 3) {
    console.warn(
      `WARNING: chỉ tách được ${elements.length} phần tử top-level trong body — ` +
      `có thể splitBodyElements() đã gộp nhầm nội dung. Kiểm tra lại trước khi tin tưởng kết quả.`,
    );
  }

  // ---- Find TOC heading ----
  let tocIdx = -1, tocText = "";
  for (const cand of tocCandidates) {
    tocIdx = paras.findIndex(p => extractText(p).trim() === cand);
    if (tocIdx !== -1) { tocText = cand; break; }
  }
  if (tocIdx === -1) {
    throw new Error(
      `TOC heading not found (tried ${JSON.stringify(tocCandidates)}). ` +
      `Pass it explicitly: npx tsx finalize.ts <doc> '<heading>'`,
    );
  }
  console.log(`TOC heading: "${tocText}" at paragraph ${tocIdx}`);

  // ---- Tag H1/H2/H3 outline levels ----
  const counts = [0, 0, 0];
  const taggedParas = paras.map((p, i) => {
    if (i <= tocIdx || !extractText(p).trim() || !isBold(p)) return p;
    const sz = getFontSize(p);
    const col = getFontColor(p);
    const text = extractText(p).trim();
    for (const [hsz, hcol, lvl, cap] of HEADINGS) {
      if (sz === hsz && col === hcol && text.length <= cap) {
        counts[lvl]++;
        return setOutlineLevel(p, lvl);
      }
    }
    return p;
  });
  console.log(`Tagged headings: H1=${counts[0]}, H2=${counts[1]}, H3=${counts[2]}`);

  // Rebuild full elements list with tagged paragraphs
  let pIdx = 0;
  const rebuiltElements = elements.map(el => {
    if (el.startsWith("<w:p")) return taggedParas[pIdx++];
    return el;
  });

  // ---- Replace placeholder TOC table with real Word TOC field ----
  // Find the TOC heading paragraph's index in rebuiltElements
  let elPIdx = 0;
  let tocElIdx = -1;
  for (let i = 0; i < rebuiltElements.length; i++) {
    if (rebuiltElements[i].startsWith("<w:p")) {
      if (elPIdx === tocIdx) { tocElIdx = i; break; }
      elPIdx++;
    }
  }

  let replacedToc = false;
  if (tocElIdx !== -1) {
    // Find first <w:tbl> immediately after the TOC paragraph element
    for (let i = tocElIdx + 1; i < rebuiltElements.length; i++) {
      if (rebuiltElements[i].startsWith("<w:tbl")) {
        rebuiltElements.splice(i, 1, TOC_FIELD_XML);
        replacedToc = true;
        console.log("Replaced placeholder TOC table with Word TOC field");
        break;
      }
      if (rebuiltElements[i].startsWith("<w:p") && extractText(rebuiltElements[i]).trim()) break;
    }
  }
  if (!replacedToc) console.log("WARNING: no placeholder TOC table found after the heading — skipped");

  // ---- 4-pass blank-page cleanup ----
  let removed = 0;

  // Pass A: remove page-break runs and empty paras before pageBreakBefore headings
  const ps_a = rebuiltElements.filter(e => e.startsWith("<w:p"));
  const toRemove = new Set<string>();
  for (let i = 0; i < ps_a.length; i++) {
    if (!hasPageBreakBefore(ps_a[i])) continue;
    let j = i - 1;
    while (j >= 0 && (isPageBreakRun(ps_a[j]) || isEmpty(ps_a[j]))) {
      toRemove.add(ps_a[j]); j--;
    }
  }
  const afterA = rebuiltElements.filter(e => !e.startsWith("<w:p") || !toRemove.has(e));
  removed += rebuiltElements.length - afterA.length;

  // Pass B: collapse consecutive empty paragraphs
  const afterB: string[] = [];
  let prevEmpty = false;
  for (const el of afterA) {
    if (el.startsWith("<w:p")) {
      const cur = isEmpty(el) && !isPageBreakRun(el);
      if (cur && prevEmpty) { removed++; continue; }
      prevEmpty = cur;
    } else {
      prevEmpty = false;
    }
    afterB.push(el);
  }

  // Pass C: empty paras right after tables
  const afterC: string[] = [];
  let prevTbl = false;
  for (const el of afterB) {
    if (el.startsWith("<w:tbl")) { prevTbl = true; afterC.push(el); continue; }
    if (el.startsWith("<w:p")) {
      if (prevTbl && isEmpty(el) && !isPageBreakRun(el)) { removed++; prevTbl = false; continue; }
      prevTbl = false;
    } else {
      prevTbl = false;
    }
    afterC.push(el);
  }

  // Pass D: trailing empty paragraphs at doc end
  const afterD = [...afterC];
  while (afterD.length > 0) {
    const last = afterD[afterD.length - 1];
    if (last.startsWith("<w:p") && isEmpty(last) && !isPageBreakRun(last)) {
      afterD.pop(); removed++;
    } else break;
  }

  console.log(`Removed ${removed} redundant page-break / empty paragraphs`);

  // ---- Rebuild document.xml ----
  const newBody = afterD.join("");
  // Dùng replacer dạng hàm, KHÔNG dùng string trực tiếp: nếu newBody chứa
  // literal "$&", "$$", "$1".. (ví dụ giá tiền, ký hiệu kỹ thuật hiếm gặp),
  // String.replace(regex, string) sẽ hiểu nhầm thành pattern thay thế đặc
  // biệt và làm hỏng nội dung một cách âm thầm. Dùng hàm thì newBody luôn
  // được chèn nguyên văn.
  const newDocXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, () => `<w:body>${newBody}</w:body>`);
  zip.file("word/document.xml", newDocXml);

  // ---- Set updateFields=true in settings ----
  const settingsFile = zip.file("word/settings.xml");
  if (settingsFile) {
    let settingsXml = await settingsFile.async("string");
    settingsXml = settingsXml.replace(/<w:updateFields[^/]*\/>/g, "").replace(/<w:updateFields[^>]*>.*?<\/w:updateFields>/g, "");
    settingsXml = settingsXml.replace(/<\/w:settings>/, '<w:updateFields w:val="true"/></w:settings>');
    zip.file("word/settings.xml", settingsXml);
  }
  console.log("Set updateFields=true");

  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(docPath, output);
  logStep("finalize_docx", "saved", docPath);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cliDocPath = process.argv[2] ?? "report.docx";
  const cliTocArg = process.argv.slice(3);
  const cliTocCandidates = cliTocArg.length ? cliTocArg : ["Mục lục", "MỤC LỤC", "Table of Contents", "Nội dung"];
  finalizeDocx(cliDocPath, cliTocCandidates).catch((err) => { console.error(err); process.exit(1); });
}
