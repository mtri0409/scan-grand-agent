import { GraphStateType } from "../state.js";
import * as fs from "fs";
import * as path from "path";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const DATA_CONTEXT_DIR = "src/data-context";

function readContextFiles(): string {
  const dir = path.resolve(DATA_CONTEXT_DIR);
  logStep("load_company_context", "reading directory", dir);
  if (!fs.existsSync(dir)) {
    return `Không tìm thấy thư mục data-context: ${dir}`;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
  const parts: string[] = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      logStep("load_company_context", "read file", { file, size: content.length });
      parts.push(`=== ${file} ===\n${content.slice(0, 20000)}`);
    } catch (err: any) {
      parts.push(`=== ${file} ===\nLỗi đọc: ${err?.message ?? String(err)}`);
    }
  }
  return parts.join("\n\n");
}

export async function loadCompanyContextNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const context = readContextFiles();
  logStep("load_company_context", "exit", { chars: context.length });
  return {
    companyContext: context,
    chatComplement: `load_company_context: đã đọc ${context.length} ký tự từ data-context/`,
    messages: [AIMessage({ content: "load_company_context: done" })],
  };
}
