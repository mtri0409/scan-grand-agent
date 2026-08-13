# scan-grant-agent

Agent quét và đánh giá grant (quỹ tài trợ) cho RetriV / VNF. Chạy trên LangGraph StateGraph, có 2 chế độ: scan sâu 1 grant cụ thể (Mode A) hoặc market scan tìm nhiều candidate (Mode B). Tự động nghiên cứu, kiểm tra eligibility, chấm điểm, build báo cáo Word DS01 và ghi log Excel.

## Cấu trúc thư mục

```
scan-grant-agent/
├── src/
│   ├── index.ts              # Entry point CLI, xử lý interrupt/resume
│   ├── graph.ts              # Định nghĩa LangGraph StateGraph + routing
│   ├── state.ts              # Schema state của graph
│   ├── llm.ts                # Wrapper gọi LLM (OpenAI/Mistral)
│   ├── checkpointer.ts       # Persist state (LangGraph checkpoint)
│   ├── nodes/                # 20 node: classify, research, eligibility, build report, QA...
│   ├── tools/                # Helper build docx/xlsx, QA check, log scan
│   ├── skills/               # Logic skill tách riêng
│   └── data-context/         # 3 file markdown mô tả công ty RetriV/VNF
├── dist/                     # Output compile TypeScript
├── docs/                     # Tài liệu thiết kế: k-base, progress, manual-test-flows
├── output/runs/              # Báo cáo Word và Excel được tạo ra
├── package.json              # Scripts và dependency
├── tsconfig.json             # TypeScript config
├── .env.example              # Template biến môi trường
└── k-base.md                 # Workflow chi tiết scan-grant-vnf
```

## Cách chạy

1. Cài dependency:

```bash
pnpm install
```

2. Copy env và điền API key:

```bash
cp .env.example .env
```

3. Chạy development (hot reload):

```bash
pnpm dev
```

Hoặc build rồi chạy:

```bash
pnpm build
pnpm start
```

4. Chạy test flows:

```bash
pnpm test:flows
```

Khi agent dừng chờ user (`=== DỪNG CHỜ USER ===`), nhập câu trả lời trong terminal và nhấn Enter để resume.

## Côngng nghệ sử dụng

- **Runtime**: Node.js + TypeScript (ES2022, NodeNext module)
- **Orchestration**: LangGraph (`@langchain/langgraph`)
- **LLM**: OpenAI SDK, cấu hình qua `.env` (Mistral/OpenAI-compatible)
- **Tìm kiếm**: Tavily / SearxNG API
- **File output**: `docx` (Word DS01), `exceljs` (Excel log + market scan)
- **Dev tools**: `tsx`, `typescript`, `pnpm`

## Các điểm cần lưu ý

- **Graph cứng, agent-loop bên trong node**: mọi điều kiện chuyển tiếp (routing) được code explicit trong `graph.ts`, không để LLM tự quyết định trình tự.
- **2 chế độ chính**:
  - Mode A: user đưa tên/link grant → research sâu, eligibility, chấm điểm, build Word + log.
  - Mode B: user chỉ đưa chủ đề → market scan, tìm candidate, export Excel tóm tắt, chờ user chọn rồi mới chạy deep-scan.
- **Human-in-the-loop**: dùng `interrupt()` của LangGraph. State được persist qua `FileSaver`, có thể resume bằng `Command({ resume: answer })`.
- **Context công ty**: 3 file trong `src/data-context/` được load để LLM đánh giá eligibility khớp RetriV/VNF.
- **QA gate**: mỗi báo cáo Word phải qua `qa_check` (logo, TOC, 8 mục, Excel log). Fail → retry tối đa 3 lần, hết retry thì `report_error`.
- **Output files**: nằm trong `output/runs/` với timestamp đính kèm để tránh file lock.
