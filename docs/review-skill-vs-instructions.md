# Rà soát: SKILL copy.md vs instructions.ts + 3 điểm kiểm tra

> Ngày: 10/08/2026  
> Đối chiếu: `SKILL copy.md` (bản đầy đủ) và `src/skills/scan-grant-vnf/instructions.ts` (bản rút gọn dùng trong prompt).  
> Phạm vi kiểm tra: `load_company_context`, routing flow, QA node.

---

## 1. So sánh `SKILL copy.md` vs `instructions.ts`

| Tiêu chí | `SKILL copy.md` (600 dòng) | `instructions.ts` (126 dòng) | Kết luận |
|---|---|---|---|
| Cấu trúc 7 bước (0–7) | Có đầy đủ, chi tiết | Rút gọn nhưng giữ đúng 7 bước | Tương đồng |
| Chế độ A / B | Định nghĩa rõ ràng | Giữ nguyên | Tương đồng |
| Dual-scoring RetriV/VNF | Bắt buộc trong Excel log | Bắt buộc trong Excel log | Tương đồng |
| TOC / Mục lục | **BẮT BUỘC bake số trang** bằng `scripts/update_toc.py` | Chấp nhận placeholder F9, **KHÔNG chạy update_toc.py** | Khác biệt quan trọng |
| QA | Gọi `scripts/qa_check.py` | Gọi `scripts/qa_check.py` (văn bản), code thực tế gọi `src/tools/qa_check.ts` | Khác biệt về đuôi file |
| Excel log | Gọi `scripts/log_scan_excel.py` | Gọi `scripts/log_scan_excel.py` (văn bản), code thực tế gọi `src/tools/log_scan_excel.ts` | Khác biệt về đuôi file |

**Nhận xét chính:**
- `instructions.ts` là bản **rút gọn** phù hợp để nhét vào system prompt, không mất nghiệp vụ cốt lõi.
- Tuy nhiên, có sự **lệch quan trọng về TOC**: `SKILL copy.md` yêu cầu bake số trang thật, còn `instructions.ts` và code thực tế chấp nhận placeholder F9. Nếu bản `SKILL copy.md` vẫn là single source of truth, cần cập nhật `instructions.ts` để khớp hoặc ngược lại.
- `instructions.ts` vẫn tham chiếu file `.py` trong khi repo đã chuyển sang `.ts` — nên sửa lại để tránh nhầm lẫn khi maintain.

---

## 2. Kiểm tra `load_company_context.ts`

**File:** `src/nodes/load_company_context.ts`

### Đã được gọi đúng chưa?

✅ **Có.**
- Node được import và đăng ký trong `src/graph.ts` dòng 23 và 129.
- `afterClassify` (dòng 28–32) route cả mode A và mode B về `load_company_context`.
- `afterLoadCompanyContext` (dòng 34–38) sau đó route đúng:
  - Mode A → `resolve_source`
  - Mode B → `generate_search_queries`

### Vấn đề phát hiện

1. **Chỉ đọc `.md` và `.txt`, bỏ qua `.docx`, `.pdf`, `.xlsx`.**
   ```ts
   const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
   ```
   Trong khi `SKILL copy.md` và `instructions.ts` yêu cầu: *"Thư mục này có thể chứa `.md`, `.docx`, `.pdf`, `.xlsx` — đọc hết những gì có, không giả định định dạng cố định."*

2. **Hardcode đường dẫn `src/data-context`.**
   ```ts
   const DATA_CONTEXT_DIR = "src/data-context";
   ```
   Theo tài liệu, `data-context/` nằm cùng cấp với `input/`/`output/` trong workspace, không nhất thiết trong `src/`.

3. **Không có xử lý nếu thiếu thông tin quan trọng.**
   - Tài liệu yêu cầu nếu thiếu TRL / entity / geography / IP thì phải hỏi user nhanh trước Bước 3.
   - Node hiện chỉ trả về chuỗi `Không tìm thấy thư mục...` hoặc nội dung đọc được, không kiểm tra completeness.

**Khuyến nghị:**
- Mở rộng filter để đọc `.docx`, `.pdf`, `.xlsx` (có thể cần thêm tool riêng cho PDF/DOCX).
- Chuyển đường dẫn sang `data-context/` hoặc đọc từ config/workspace root.
- Thêm kiểm tra tối thiểu: nếu context thiếu TRL/pháp nhân/geography/IP thì ghi flag để `research_grant` hoặc một node riêng hỏi user.

---

## 3. Kiểm tra các flow đã đi đúng chưa, xử lý đủ chưa

(loại trừ `update_toc.py` vì đã loại bỏ khỏi quy trình)

### 3.1. Các flow đã đúng

| Flow | Đánh giá | Ghi chú |
|---|---|---|
| Mode A (có URL) | ✅ Đúng hướng | classify → load_context → resolve_source (skip) → find_official_site → extract_candidate_content → retrieve_past_winners → research_grant → check_eligibility → score/build → QA |
| Mode A (chỉ tên) | ✅ Có interrupt hỏi nguồn | `resolve_source` dùng `interrupt()` để hỏi user tự tìm hay gửi link |
| Mode B | ✅ Đúng hướng | classify → load_context → generate_search_queries → run_search → extract_candidates → export_excel_a_and_present → wait_for_selection → fanout_selected_candidates → deep-scan từng candidate |
| Skip eligibility | ✅ Tách biệt | `skip_and_log` ghi SKIP vào Excel log khi hard-stop fail |
| Word trước Excel | ✅ Đúng | `build_docx_and_log` tạo báo cáo Word trước, rồi mới ghi Excel log để có link |
| QA gate | ✅ Có kiểm tra | `qa_check` chạy sau build, kiểm tra logo/TOC/8 mục/Excel |

### 3.2. Các lỗi / thiếu sót cần sửa

#### 3.2.1. Routing QA ưu tiên sai thứ tự

**File:** `src/graph.ts` dòng 88–93

```ts
function afterQACheck(state: GraphStateType): string {
  if ((state.selectedCandidateQueue ?? []).length > 0) return "fanout_selected_candidates";
  if (state.qaResult?.pass) return END;
  if (state.qaResult?.pass) return END;
  if (state.qaRetryCount >= 3) return "report_error";
  return "build_docx_and_log";
}
```

**Vấn đề:** Nếu **QA FAIL** nhưng vẫn còn candidate trong queue, graph sẽ nhảy sang candidate tiếp theo thay vì retry candidate hiện tại hoặc báo lỗi.

**Sửa:** Ưu tiên kiểm tra `qaResult.pass` **trước** queue:

```ts
function afterQACheck(state: GraphStateType): string {
  if (state.qaResult?.pass) {
    if ((state.selectedCandidateQueue ?? []).length > 0) return "fanout_selected_candidates";
    return END;
  }
  if (state.qaRetryCount >= 3) return "report_error";
  return "build_docx_and_log";
}
```

---

#### 3.2.2. `companyTarget` không được trích xuất từ user

**File:** `src/nodes/classify.ts` dòng 75–90

- `classifyModeNode` không tìm kiếm cũng không hỏi user dự án nào đứng tên apply.
- `build_docx_and_log.ts` dòng 49 luôn mặc định `RetriV`:
  ```ts
  projectName: state.companyTarget ?? "RetriV",
  ```
- Tài liệu yêu cầu: *"Báo cáo Word ở Bước 6a vẫn tập trung vào 1 dự án chính (mặc định RetriV nếu user không chỉ định)."* — nhưng hiện tại không có cách nào để user chỉ định.

**Khuyến nghị:** Cho `classify.ts` trích xuất `companyTarget` từ input (ví dụ nhận diện từ khóa "VNF", "RetriV", "cho VNF", "apply bằng RetriV"). Nếu không rõ thì hỏi ngắn sau khi xác định mode.

---

#### 3.2.3. `score_and_select_track` gần như không tác dụng

**File:** `src/nodes/score_and_select_track.ts` dòng 31–57

- Node này ghi `strategyScore` và `trackSelection` vào state.
- Nhưng `build_docx_and_log.ts` dòng 77 lại lấy scoring từ `research.scoring`:
  ```ts
  scoring: toScoringRows(research.scoring),
  ```
- Và lấy challenge từ `research.challenge_phu_hop_nhat` / `research.ly_do_challenge` (dòng 78–80), không dùng `state.trackSelection`.

**Kết quả:** LLM chấm điểm 2 lần (một lần ở `research_grant`, một lần ở `score_and_select_track`) nhưng chỉ kết quả của `research_grant` được dùng. `score_and_select_track` trở thành dead code.

**Khuyến nghị:** Một trong hai cách:
- Gộp kết quả của `score_and_select_track` vào `grantResearch` trước khi build, hoặc
- Bỏ node này và để `research_grant` làm luôn cả scoring + track selection.

---

#### 3.2.4. `skip_and_log` không tạo báo cáo Word, để trống cột link

**File:** `src/nodes/skip_and_log.ts` dòng 12–43

- Khi eligibility fail, node chỉ ghi dòng SKIP vào Excel log.
- Cột `link_bao_cao` không được truyền, nên trong Excel sẽ trống.
- Tài liệu yêu cầu: *"Luôn điền cột Link báo cáo; tạo file Word (Bước 6a) trước khi ghi Excel."*

**Khuyến nghị:**
- Hoặc vẫn tạo một báo cáo Word ngắn cho SKIP (tốn công nhưng đúng quy trình), hoặc
- Ghi rõ `"N/A — SKIP do eligibility"` vào cột link và cập nhật QA cho phép trường hợp này.

---

#### 3.2.5. `resolve_source` → `find_official_site` thừa bước khi đã có URL

**File:** `src/graph.ts` dòng 46–51

```ts
function afterResolveSource(state: GraphStateType): string {
  const grant = state.currentGrant;
  if (!grant?.website?.trim().startsWith("http")) return "find_official_site";
  return "find_official_site";
}
```

**Vấn đề:** Cả hai nhánh đều trả về `find_official_site`, dù `resolve_source` đã xử lý skip khi có URL. Node `find_official_site` tự skip nếu có URL, nhưng vẫn là một bước thừa.

**Khuyến nghị:** Nếu đã có URL, route thẳng sang `extract_candidate_content`:

```ts
function afterResolveSource(state: GraphStateType): string {
  const grant = state.currentGrant;
  if (grant?.website?.trim().startsWith("http")) return "extract_candidate_content";
  return "find_official_site";
}
```

---

#### 3.2.6. `retrieve_past_winners` phụ thuộc hoàn toàn Tavily

**File:** `src/nodes/retrieve_past_winners.ts` dòng 52–63

```ts
const apiKey = process.env.TAVILY_KEY;
if (!apiKey || !domain) {
  return { pastWinnersContent: undefined, ... };
}
```

**Vấn đề:** Nếu thiếu `TAVILY_KEY` hoặc URL không có domain, node bỏ qua hoàn toàn, không có fallback search/web.

**Khuyến nghị:** Thêm ít nhất một fallback (ví dụ: tìm kiếm web công khai, hoặc để `research_grant` tự xử lý phần past winners từ search results đã có).

---

#### 3.2.7. `extract_candidate_content` không xử lý client-rendered JS

- Node dùng `fetch` thuần. Nếu trang render bằng JS nặng, kết quả có thể trống.
- Tài liệu yêu cầu: *"Nếu trang web là dạng client-rendered (JS nặng) và fetch thường trả về trang trống, chuyển sang dùng trình duyệt (Claude in Chrome)."*

**Khuyến nghị:** Ghi log cảnh báo khi nội dung trang quá ngắn (< 500 ký tự) và để `research_grant` biết để xử lý.

---

## 4. Kiểm tra node QA — Hoạt động đúng hay đang mock?

**File:** `src/nodes/qa_check.ts` và `src/tools/qa_check.ts`

### Kết luận: **Không phải mock — hoạt động thật.**

`src/nodes/qa_check.ts` gọi `runQA` từ `src/tools/qa_check.ts`, bản port 1:1 từ `qa_check.py`. Các kiểm tra thực tế bao gồm:

1. **Logo / hình ảnh nhúng** — kiểm tra `word/media/` trong `.docx` có ảnh hay không (`src/tools/qa_check.ts` dòng 91–100).
2. **TOC field thật** — kiểm tra `document.xml` có `TOC \o`, `TOC \h`, hoặc `fldChar` + `TOC` (dòng 109–120).
3. **Đủ 8 mục nội dung** — kiểm tra text có các marker `1. Thông tin cơ bản`, `2. Eligibility`, ..., `8. ĐỀ XUẤT` (dòng 32–36, 124–129).
4. **Excel log đủ 6 sheet** — `📊 Dashboard`, `🗄️ Database`, `📅 Deadlines`, `⭐ Scoring`, `🔗 Links & Notes`, `🤖 AI Automation Guide` (dòng 28–31, 177–183).
5. **Lý do và Owner cho SKIP/MAYBE** — đọc sheet Database, bắt buộc 2 cột này không trống (dòng 230–232).
6. **Cột Link báo cáo không trống** — dòng 234–244.
7. **Cảnh báo trùng tên chương trình** — dòng 254–265.

### Lưu ý về QA

- QA **chấp nhận placeholder F9** (`"Nhấn F9 để cập nhật"`) — điều này phù hợp với `instructions.ts` nhưng **không phù hợp** với `SKILL copy.md` gốc, nơi yêu cầu bake số trang thật.
- Nếu muốn theo `SKILL copy.md` nghiêm ngặt, cần cài `update_toc.py` trở lại hoặc tìm cách bake số trang trong TypeScript. Nếu quyết định giữ placeholder F9, nên cập nhật `SKILL copy.md` cho nhất quán.

---

## 5. Tổng hợp khuyến nghị sửa

| STT | Vấn đề | File cần sửa | Mức độ |
|---|---|---|---|
| 1 | `load_company_context` chỉ đọc `.md`/`.txt`, bỏ qua `.docx`/`.pdf`/`.xlsx` | `src/nodes/load_company_context.ts` | Cao |
| 2 | `load_company_context` hardcode `src/data-context` | `src/nodes/load_company_context.ts` | Trung bình |
| 3 | `load_company_context` không kiểm tra completeness để hỏi user | `src/nodes/load_company_context.ts` hoặc `src/state.ts` | Trung bình |
| 4 | `afterQACheck` ưu tiên queue trước `qaResult.pass` | `src/graph.ts` | Cao |
| 5 | `classify.ts` không trích `companyTarget` (RetriV/VNF) | `src/nodes/classify.ts` | Trung bình |
| 6 | `score_and_select_track` không được sử dụng | `src/nodes/build_docx_and_log.ts` hoặc `src/nodes/score_and_select_track.ts` | Cao |
| 7 | `skip_and_log` để trống cột link báo cáo | `src/nodes/skip_and_log.ts` | Trung bình |
| 8 | `afterResolveSource` route thừa qua `find_official_site` khi đã có URL | `src/graph.ts` | Thấp |
| 9 | `retrieve_past_winners` không có fallback khi thiếu Tavily | `src/nodes/retrieve_past_winners.ts` | Trung bình |
| 10 | `instructions.ts` vẫn tham chiếu file `.py` thay vì `.ts` | `src/skills/scan-grant-vnf/instructions.ts` | Thấp |
| 11 | Lệch lạc về TOC: `SKILL copy.md` yêu cầu bake, code chỉ placeholder F9 | `SKILL copy.md` hoặc `instructions.ts` + code | Cần quyết định |

---

## 6. Kết luận

- `load_company_context` **đã được gọi đúng vị trí** trong flow, nhưng nội dung đọc còn hạn chế định dạng.
- Các flow **đã đi đúng hướng tổng thể**, nhưng còn một số lỗi routing/usage cần sửa, đặc biệt là `afterQACheck` và `score_and_select_track`.
- Node QA **không phải mock**, hoạt động thật và kiểm tra nhiều điều kiện quan trọng. Tuy nhiên, cần quyết định rõ về tiêu chí TOC (bake số trang vs placeholder F9) để đồng bộ giữa tài liệu và code.
