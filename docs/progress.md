# Tiến độ triển khai: scan-grant-vnf StateGraph

> File cập nhật: 10/08/2026  
> Đối chiếu với: `k-base.md` (Workflow scan-grant-vnf trên LangGraph)

---

## 1. Tổng quan

Đã chuyển từ agent-loop đơn giản (agent → tools → agent) sang **StateGraph cứng** theo đúng nguyên tắc của `k-base.md`: **graph cứng ở tầng orchestration, agent-loop chỉ ở bên trong từng node**.

### Tỷ lệ mapping tổng thể với `k-base.md`

| Phần | Trạng thái | Phần trăm ước tính |
|---|---|---|
| Luồng tổng quan & định tuyến A/B (Mục 2) | ✅ Hoạt động | ~90% |
| Chế độ A — Nghiên cứu & Eligibility (Mục 3) | ✅ Hoạt động cơ bản | ~70% |
| Chế độ A — Build file & QA gate (Mục 4) | ✅ Hoạt động, cần tinh chỉnh retry | ~70% |
| Chế độ B — Market Scan (Mục 5) | ✅ Hoạt động với Tavily thật | ~80% |
| State schema (Mục 7) | ✅ Mapping đầy đủ | ~90% |
| Edge / routing logic (Mục 8) | ✅ Hoạt động | ~85% |
| Interrupt / human-in-the-loop | ✅ Triển khai xong | ~90% |
| Data-context reader + Tavily | ✅ Triển khai xong | ~80% |

**Tổng ước tính: ~75–80% so với `k-base.md` đã được triển khai và chạy được end-to-end.**

---

## 2. Các node đã triển khai (mapping Mục 6 k-base)

| Node k-base | File TS | Loại | Trạng thái |
|---|---|---|---|
| `classify_mode` | `nodes/classify.ts` | 🟣 LLM | ✅ |
| `ask_mode_clarify` | `nodes/ask_mode_clarify.ts` | 🟠 INTERRUPT | ✅ Dùng `interrupt()` |
| `resolve_source` | `nodes/resolve_source.ts` | ⚪ HARD + 🟠 INTERRUPT | ✅ Dùng `interrupt()` khi chưa có URL |
| `find_official_site` | `nodes/find_official_site.ts` | 🟣 LLM+TOOL | ✅ Stub LLM |
| `load_company_context` | `nodes/load_company_context.ts` | ⚪ HARD | ✅ Đọc 3 file `data-context/` |
| `generate_search_queries` | `nodes/generate_search_queries.ts` | 🟣 LLM | ✅ |
| `run_search` | `nodes/run_search.ts` | 🟢 TOOL | ✅ Gọi Tavily API thật |
| `extract_candidates` | `nodes/extract_candidates.ts` | 🟣 LLM | ✅ Map field + eligibility sơ bộ |
| `export_excel_a_and_present` | `nodes/export_excel_a_and_present.ts` | ⚪ HARD | ✅ Ghi Excel A + bảng tóm tắt |
| `wait_for_selection` | `nodes/wait_for_selection.ts` | 🟠 INTERRUPT | ✅ Dùng `interrupt()` |
| `fanout_selected_candidates` | `nodes/fanout_selected_candidates.ts` | ⚪ HARD | ✅ Chọn candidate đầu tiên |
| `research_grant` | `nodes/research_grant.ts` | 🟣 LLM+TOOL | ✅ Có data-context + Tavily results |
| `check_eligibility` | `nodes/check_eligibility.ts` | 🟣 LLM (áp khung HARD) | ✅ 7 tiêu chí RetriV/VNF |
| `skip_and_log` | `nodes/skip_and_log.ts` | ⚪ HARD | ✅ Ghi Excel log SKIP |
| `score_and_select_track` | `nodes/score_and_select_track.ts` | 🟣 LLM | ✅ 6 tiêu chí + chọn track |
| `build_docx_and_log` | `nodes/build_docx_and_log.ts` | ⚪ HARD | ✅ Build Word + ghi Excel log |
| `qa_check` | `nodes/qa_check.ts` | ⚪ HARD | ✅ Kiểm logo, TOC, 8 mục, Excel |
| `report_error` | `nodes/report_error.ts` | ⚪ HARD | ✅ Báo lỗi khi hết retry |

---

## 3. State schema đã mở rộng

Các field theo Mục 7 `k-base.md` đã có:

- `mode`: `"A" | "B" | "unclear" | null`
- `topic`, `candidates`, `selectedCandidates`
- `currentGrant`, `companyTarget`, `eligibility`, `eligibilityGatePassed`
- `strategyScore`, `trackSelection`
- `reportPaths`, `excelPath`, `marketExcelPath`
- `pendingHumanQuestion`, `humanAnswer`
- `qaResult`, `qaRetryCount`
- Thêm: `companyContext`, `searchQueries`, `searchResults`

---

## 4. Interrupt / human-in-the-loop

3 điểm interrupt bắt buộc của `k-base.md` đã được triển khai:

1. ✅ `ask_mode_clarify` — khi mode unclear.
2. ✅ `resolve_source` — khi chỉ có tên chương trình, chưa có URL.
3. ✅ `wait_for_selection` — sau Excel A, chờ user chọn candidate deep-scan.

Dùng `interrupt()` của LangGraph + `FileSaver` custom để lưu checkpoint vào `.langgraph-checkpoints/`, cho phép resume giữa các process qua `node dist/resume.js <thread_id> "<answer>"`.

---

## 5. Tích hợp Tavily & data-context

- ✅ `TAVILY_KEY` trong `.env` được sử dụng.
- ✅ `run_search` gọi Tavily `/search` với `search_depth: advanced`, `max_results: 8`.
- ✅ `load_company_context` đọc 3 file `data-context/` (36K+ ký tự).
- ✅ `research_grant` nhận cả company context + search results để đánh giá.
- ✅ `extract_candidates` trích field và eligibility sơ bộ từ Tavily results.

---

## 6. Test đã chạy thành công

### Mode B (Market Scan)
```bash
node dist/index.js "Tìm các grant về foodtech cho RetriV"
```
→ classify B → load context → generate queries → Tavily search (32 results) → extract 8 candidates → export Excel A → interrupt `wait_for_selection`.

### Mode A (có URL)
```bash
node dist/index.js "Scan grant https://example.com/green-food-grant-2026 Green Food Grant 2026"
```
→ classify A → load context → resolve_source (skip vì có URL) → find_official_site → research_grant → check_eligibility → score → build_docx → QA PASS.

### Interrupt flow
```bash
node dist/index.js "scan grant"
# Dừng ở ask_mode_clarify
node dist/resume.js <thread_id> "Tìm grant foodtech cho RetriV"
# Chạy tiếp đến wait_for_selection
```

---

## 7. Những phần chưa hoàn thiện / cần cải thiện

| Hạng mục | Mô tả | Mức độ |
|---|---|---|
| **Tavily `/extract`** | Hiện chỉ dùng `/search`; chưa dùng `/extract` để lấy nội dung sạch cho từng candidate. | Trung bình |
| **Fanout song song** | `fanout_selected_candidates` chỉ chạy candidate đầu tiên; chưa chạy subgraph song song cho nhiều candidate. | Trung bình |
| **QA retry loop** | `qa_check` đã có retry count nhưng chưa tự động sửa lỗi tái phát; chỉ lặp lại build. | Trung bình |
| **Excel file lock (EBUSY)** | Trên Windows, file Excel log đôi khi bị lock sau khi tạo, cần xử lý thêm. | Cao (trên Windows) |
| **Find official site** | Hiện là stub LLM, chưa gọi Tavily để xác định site chính thức. | Trung bình |
| **Rubric scoring cố định** | `score_and_select_track` dùng LLM; chưa có deterministic conversion 1-5 ↔ 0-10. | Thấp |
| **Xử lý đa vòng market scan** | Chưa hỗ trợ user resume từ `wait_for_selection` để chọn thêm candidate. | Trung bình |
| **Graph visualization / Mermaid** | Chưa tự động sinh sơ đồ từ graph. | Thấp |

---

## 8. Các file đã thay đổi / tạo mới

### Tạo mới
- `src/nodes/classify.ts`
- `src/nodes/ask_mode_clarify.ts`
- `src/nodes/resolve_source.ts`
- `src/nodes/find_official_site.ts`
- `src/nodes/load_company_context.ts`
- `src/nodes/generate_search_queries.ts`
- `src/nodes/run_search.ts`
- `src/nodes/extract_candidates.ts`
- `src/nodes/export_excel_a_and_present.ts`
- `src/nodes/wait_for_selection.ts`
- `src/nodes/fanout_selected_candidates.ts`
- `src/nodes/research_grant.ts`
- `src/nodes/check_eligibility.ts`
- `src/nodes/skip_and_log.ts`
- `src/nodes/score_and_select_track.ts`
- `src/nodes/build_docx_and_log.ts`
- `src/nodes/qa_check.ts`
- `src/nodes/report_error.ts`
- `src/checkpointer.ts`
- `src/resume.ts`
- `docs/progress.md` (file này)

### Sửa đổi chính
- `src/state.ts` — mở rộng schema đầy đủ theo k-base.
- `src/graph.ts` — xây dựng StateGraph với định tuyến A/B và interrupt.
- `src/index.ts` — dùng `stream` để bắt interrupt.
- `src/tools/market_scan_excel.ts`, `log_scan_excel.ts`, `qa_check.ts`, `build_vnf_report.ts`, `finalize.ts` — sửa CLI guard cho ESM.
- `src/tools/log_scan_excel.ts` — thay `require("path")` bằng ESM import.

---

## 9. Kết luận

Workflow đã chạy end-to-end cho cả Mode A (có URL) và Mode B (market scan + interrupt chọn candidate). Interrupt hoạt động đúng với persistent checkpoint. Cần tiếp tục tinh chỉnh Tavily `/extract`, fanout song song, và xử lý lỗi file lock trên Windows.
