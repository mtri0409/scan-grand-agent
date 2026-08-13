# scan-grant-agent — Code Review & Hướng dẫn hiểu code

> Nguồn: https://github.com/minhtrivnf/scan-grant-agent.git (clone --depth 1)
> Phạm vi quét: 56 file / 8.941 dòng (45 file TypeScript lõi = 5.688 dòng, phần còn lại là
> `pnpm-lock.yaml`, `SKILL.MD`/`SKILL copy.md`, docs). Đọc toàn bộ 45 file `.ts`, không cần
> chọn lọc vì thuộc nhóm "medium" (≤150 file).

## 1. Tóm tắt tổng quan

**Dự án này làm gì**: đây là bản triển khai thật bằng **LangGraph (TypeScript)** của skill
`scan-grant-vnf` — 1 agent tự động quét, đánh giá eligibility, chấm điểm, và viết báo cáo Word +
Excel cho các grant/competition phù hợp với 2 công ty RetriV và VNF. Agent chạy qua CLI
(`npm run dev "<yêu cầu>"`), có 2 chế độ: **A** (scan 1 grant cụ thể theo tên/link) và **B**
(market scan — tìm nhiều candidate theo chủ đề rồi cho user chọn deep-scan).

**Tech stack**: Node.js + TypeScript, `@langchain/langgraph` (StateGraph, interrupt/resume),
OpenAI SDK trỏ vào endpoint tùy chỉnh (`AI_API_URL`, mặc định Mistral qua `AI_API_KEY`), Tavily
search API cho market scan, `docx`/`exceljs`/`adm-zip` để build file Word/Excel output.

**Điểm vào**: `src/index.ts` (chạy graph, đọc input từ `process.argv`) và `src/resume.ts` (resume
1 thread đã bị `interrupt()` từ trước, dùng `thread_id`). Cả hai stream trực tiếp qua
`graph.stream()` được compile trong `src/graph.ts`.

## 2. Kiến trúc tổng thể

```text
src/
├── index.ts, resume.ts        # CLI entry points (chạy mới / resume sau interrupt)
├── graph.ts                   # StateGraph — khai báo toàn bộ node + routing (nguồn sự thật của luồng)
├── state.ts                   # GraphState schema (Annotation.Root) — toàn bộ dữ liệu chạy qua graph
├── checkpointer.ts            # FileSaver — checkpoint tự viết, lưu JSON theo thread_id để hỗ trợ resume
├── nodes/                     # 1 node = 1 file, đúng tên gọi trong graph.ts
├── tools/                     # Logic build file thật (Word/Excel/QA) — nodes gọi vào đây
├── skills/vnf-standard-style/ # Style engine build Word (DS01ReportBuilder)
└── skills/scan-grant-vnf/     # instructions.ts — KHÔNG được graph.ts dùng (xem mục 5.2, #5)
```

**Luồng dữ liệu chính**: user input → `classify_mode` (LLM phân loại A/B) →
`load_company_context` (đọc `src/data-context/*.md` vào state) → rẽ nhánh:

- **Mode A**: `resolve_source` (interrupt nếu chưa có link) → `find_official_site` → `extract_candidate_content` (fetch + strip HTML) → `research_grant` → `check_eligibility` → (fail → `skip_and_log`) / (pass → `score_and_select_track`) → `build_docx_and_log` → `qa_check` → (fail → lặp lại `build_docx_and_log`, pass → kết thúc).
- **Mode B**: `generate_search_queries` → `run_search` (Tavily) → `extract_candidates` → `export_excel_a_and_present` → `wait_for_selection` (interrupt) → `fanout_selected_candidates` → chạy lại đúng pipeline Mode A cho từng candidate được chọn.

Kiến trúc này **khớp gần như hoàn toàn** với thiết kế graph cứng + node LLM cục bộ mà 1 dự án
scan-grant-vnf kiểu này nên có: mọi gate quan trọng (eligibility, QA) đều là edge điều kiện dựa
trên state, không giao cho 1 agent tự do quyết định trình tự — đây là điểm mạnh kiến trúc lớn
nhất của repo.

## 3. Giải thích chi tiết theo module/file

### `src/state.ts`

- **Vai trò**: định nghĩa toàn bộ "bộ nhớ" của agent qua 1 lần chạy — mỗi field có 1 `reducer`
  riêng (LangGraph gọi đây là `Annotation`) quyết định cách merge giá trị cũ/mới mỗi khi 1 node
  trả về update.
- **Giải thích logic chính**: 3 kiểu reducer chính được dùng — `append` (gộp mảng, dùng cho
  `messages`, `candidates`), `lastOrDefault` (giá trị mới luôn ghi đè giá trị cũ, dùng cho hầu hết
  field đơn như `currentGrant`, `eligibility`), và `appendString` (nối chuỗi có phân cách, dùng
  cho `chatComplement` — nhật ký hiển thị cho user).
- **Điểm đáng học**: đây là pattern cốt lõi của LangGraph — thay vì object state thông thường,
  mỗi field tự khai báo cách nó được "gộp" khi nhiều node cùng ghi vào cùng 1 lượt chạy. Hiểu rõ
  reducer nào đang dùng ở đâu là chìa khóa để debug state không đúng như mong đợi.

### `src/graph.ts`

- **Vai trò**: đây là "bản đồ" duy nhất của toàn bộ luồng — mọi node + mọi cạnh điều kiện (hàm
  `afterXxx`) đều khai báo tập trung ở đây.
- **Giải thích logic chính**: mỗi cạnh là 1 hàm nhỏ `(state) => "tên node tiếp theo"`. Ví dụ
  `afterCheckEligibility` đọc `state.eligibilityGatePassed` để quyết định đi `skip_and_log` hay
  `score_and_select_track` — đúng đúng tinh thần "gate cứng, không giao cho LLM tự quyết".
- **Điểm đáng học**: khi cần thêm 1 bước mới vào luồng, chỉ cần thêm `.addNode(...)` +
  `.addConditionalEdges(...)` ở đây — không cần sửa logic bên trong các node khác. Đây là lý do
  tách graph khỏi node giúp dễ bảo trì. **Nhưng cũng chính file này đang có 1 lỗi routing quan
  trọng** — xem mục 5.2 #2.

### `src/nodes/classify.ts`, `find_official_site.ts`, `research_grant.ts`

- **Vai trò**: 3 node "hỏi LLM 1 câu, ép trả JSON" điển hình của repo — pattern lặp lại xuyên suốt
  toàn bộ codebase.
- **Giải thích logic chính**: mỗi node build 1 system prompt cố định (khai báo ngay trong file,
  dạng template string) + 1 user message chứa dữ liệu ngữ cảnh, gọi
  `openai.chat.completions.create(..., response_format: { type: "json_object" })`, rồi
  `JSON.parse` kết quả (bọc `try/catch`, fallback về object rỗng nếu parse lỗi).
- **Điểm đáng học**: đây là pattern "structured output qua JSON mode" rất phổ biến khi build agent
  với OpenAI-compatible API — đáng học vì cách xử lý fallback khi LLM trả JSON hỏng (không crash
  toàn bộ graph, chỉ tiếp tục với object rỗng). Điểm cần cải thiện: `research_grant.ts` có 1 lỗi
  nghiêm trọng về cách dữ liệu được truyền tiếp — xem 5.2 #1.

### `src/nodes/check_eligibility.ts`, `score_and_select_track.ts`

- **Vai trò**: áp 7 tiêu chí hard-stop và chấm 6 tiêu chí chiến lược.
- **Giải thích logic chính**: thay vì đọc `state.grantResearch` (nơi `research_grant` đã lưu toàn
  bộ JSON kết quả nghiên cứu), 2 node này lại tìm 1 tin nhắn AI cũ theo **chuỗi con cố định**
  (`"research_grant completed"`, `"check_eligibility: PASS"`) rồi dùng `.content` của tin nhắn đó
  làm input cho LLM.
- **Điểm đáng học / cần sửa**: đây là ví dụ thực tế rất tốt để học về **data flow bug** trong hệ
  thống nhiều bước — code chạy được, không throw lỗi, JSON parse vẫn hợp lệ, nhưng **kết quả gần
  như vô nghĩa** vì LLM không có dữ liệu thật để đánh giá. Xem phân tích đầy đủ ở 5.2 #1 (Critical).

### `src/nodes/run_search.ts`

- **Vai trò**: gọi Tavily `/search` cho từng query trong `searchQueries`, dedupe theo URL.
- **Giải thích logic chính**: bọc từng lời gọi Tavily trong `try/catch` riêng (1 query lỗi không
  làm hỏng các query khác) — pattern resilience tốt. Nhưng có `queries.slice(0, 4)` giới hạn cứng
  chỉ chạy 4 query đầu — xem 5.2 #3.

### `src/tools/log_scan_excel.ts` (772 dòng) và `src/tools/qa_check.ts` (336 dòng)

- **Vai trò**: 2 file lớn nhất, xử lý ghi Excel log (6 sheet, tính KPI, tô màu điều kiện) và kiểm
  tra QA cuối cùng (logo, TOC field, đủ 8 mục, Excel hợp lệ) trước khi báo "xong" với user.
- **Giải thích logic chính**: `log_scan_excel.ts` có validate cứng — nếu `de_xuat` là Skip/Maybe mà
  thiếu `ly_do` hoặc `owner_follow_up` thì **throw Error**, không ghi dòng nào cả (dòng 610-617).
  `qa_check.ts` mở file `.docx` như 1 file zip (`AdmZip`), đọc `word/document.xml` bằng regex để
  kiểm tra có TOC field thật và logo trong `word/media/` không — không cần LibreOffice, đúng như
  thiết kế "user tự bấm F9".
- **Điểm đáng học**: cách kiểm tra 1 file `.docx` mà không cần thư viện Word nặng — `.docx` chỉ là
  file zip chứa XML, mở bằng `AdmZip` + regex đơn giản là đủ để kiểm tra sự tồn tại của 1 phần tử
  (ở đây là `<w:fldChar>`/`TOC`), không cần parse full DOM.

## 4. Thuật ngữ & khái niệm cần nắm

| Thuật ngữ | Giải thích ngắn | Xuất hiện ở đâu trong repo |
|---|---|---|
| `Annotation.Root` / reducer | Cách LangGraph định nghĩa 1 field state tự merge khi nhiều node ghi vào cùng lúc | `src/state.ts` |
| `interrupt()` / `Command({ resume })` | Cơ chế LangGraph dừng graph giữa chừng, lưu checkpoint, chờ input rồi resume đúng chỗ dừng | `ask_mode_clarify.ts`, `resolve_source.ts`, `wait_for_selection.ts`, `src/resume.ts` |
| `BaseCheckpointSaver` | Interface LangGraph yêu cầu để lưu/khôi phục state — ở đây được cài đặt thủ công bằng file JSON thay vì dùng Postgres/SQLite saver có sẵn | `src/checkpointer.ts` |
| Conditional edge (`addConditionalEdges`) | Cạnh trong graph có hàm quyết định node tiếp theo dựa trên state, thay vì cạnh cố định | `src/graph.ts`, mọi hàm `afterXxx` |
| JSON mode (`response_format: json_object`) | Ép model OpenAI-compatible trả về đúng JSON, tránh phải tự parse text tự do | Mọi node LLM trong `src/nodes/` |
| DS01 / `DS01ReportBuilder` | Style engine nội bộ VNF để build Word đúng chuẩn (cover, TOC, table, callout) | `src/skills/vnf-standard-style/index.ts`, `src/tools/ds01_helpers.ts` |

## 5. Đánh giá & Review

### 5.1 Điểm làm tốt

- **Kiến trúc graph cứng + node LLM cục bộ đúng nguyên tắc**: mọi gate quan trọng (eligibility,
  QA) là conditional edge dựa trên state, không phải LLM tự quyết định có nên dừng hay tiếp tục —
  đây là nền tảng đúng cho 1 hệ thống ảnh hưởng quyết định thật của công ty.
- **`log_scan_excel.ts` validate cứng Lý do/Owner khi Skip/Maybe bằng `throw Error`** (dòng
  610-617) — đúng tinh thần "không được ghi log thiếu dữ liệu quan trọng", dù có 1 lỗ hổng nhỏ ở
  cách gọi (xem 5.2 #4).
- **`qa_check.ts` kiểm tra file `.docx` bằng cách đọc trực tiếp XML trong zip**, không phụ thuộc
  LibreOffice/Word cài sẵn — nhẹ, nhanh, portable.
- **3 điểm `interrupt()` đặt đúng chỗ** (`ask_mode_clarify`, `resolve_source`, `wait_for_selection`)
  — không có node nào tự động chạy tiếp khi lẽ ra cần hỏi user trước.
- **`wait_for_selection.ts` dùng LLM để hiểu câu trả lời tự nhiên của user** ("chọn cái đầu và cái
  thứ 3" thay vì ép nhập đúng format số) — trải nghiệm người dùng tốt hơn hẳn so với parse cứng.
- **`.env` đã gitignore đúng, không có secret hardcode** ở bất kỳ đâu trong source.
- **Có bộ kịch bản test thủ công** (`src/test_flows.ts`, 4 scenario chính) chạy end-to-end qua cả
  interrupt/resume — tốt cho smoke test dù chưa có assertion tự động (xem 5.2, mục Testing).

### 5.2 Vấn đề phát hiện

| Mức độ | Vị trí | Vấn đề | Vì sao quan trọng | Đề xuất sửa |
|---|---|---|---|---|
| 🔴 Critical | `check_eligibility.ts` dòng 20-21, `score_and_select_track.ts` dòng 26-27 | Node tìm 1 tin nhắn AI cũ theo chuỗi con cố định (`"research_grant completed"`, `"check_eligibility: PASS"`) rồi dùng `.content` của tin nhắn đó (chỉ là 1 câu xác nhận ngắn, KHÔNG chứa dữ liệu grant) làm input cho LLM — thay vì đọc `state.grantResearch`/`state.eligibility` (nơi JSON đầy đủ đã được lưu) | Đây là 2 bước ra quyết định quan trọng nhất của cả hệ thống (pass/fail eligibility, GO/MAYBE/SKIP) nhưng đang chạy gần như "mù" — LLM không có thông tin thật về grant để đánh giá, kết quả trả về gần như ngẫu nhiên/mặc định | Đổi user content thành `JSON.stringify(state.grantResearch)` (cho `check_eligibility`) và `JSON.stringify({ research: state.grantResearch, eligibility: state.eligibility })` (cho `score_and_select_track`) |
| 🔴 Critical | `graph.ts` hàm `afterQACheck` (dòng ~78-83) | Kiểm tra `selectedCandidateQueue.length > 0` **trước** khi kiểm tra `qaResult.pass` — nếu QA vừa FAIL nhưng còn candidate khác trong hàng đợi, graph nhảy thẳng sang `fanout_selected_candidates` thay vì retry `build_docx_and_log`, bỏ qua lỗi QA hoàn toàn cho candidate hiện tại | Vi phạm chính nguyên tắc thiết kế "QA fail không bao giờ được bỏ qua" — trong luồng Mode B với ≥2 candidate được chọn, 1 báo cáo lỗi (thiếu logo, thiếu mục, TOC hỏng...) có thể lọt ra ngoài mà không ai biết | Đảo thứ tự kiểm tra: check `qaResult.pass` trước; chỉ chuyển sang candidate tiếp theo khi QA đã pass (hoặc đã vượt max retry và ghi nhận lỗi rõ ràng) |
| 🟠 High | `graph.ts` + `state.ts` (`qaRetryCount`) | `qaRetryCount` là 1 counter dùng chung cho toàn bộ lần chạy graph, không reset theo từng candidate — khi xử lý nhiều candidate trong 1 lượt Mode B, candidate thứ 2 trở đi kế thừa luôn số lần retry còn lại của candidate trước | Candidate được xử lý sau có thể bị đẩy sang `report_error` chỉ sau 1 lần fail thật (do đã "dùng hết" retry budget từ candidate trước) — hành vi không nhất quán, khó debug vì log không nói rõ retry đang tính cho candidate nào | Đổi `qaRetryCount` thành field theo candidate (map `candidateName -> count`) hoặc reset về 0 mỗi khi `fanout_selected_candidates` gán `currentGrant` mới |
| 🟠 High | `run_search.ts` dòng ~54 (`queries.slice(0, 4)`) | `generate_search_queries` sinh 5-8 query nhưng `run_search` chỉ dùng 4 query đầu tiên, không log rõ đã bỏ query nào | Giảm độ phủ tìm kiếm candidate ở Mode B mà không có cảnh báo — người debug sau này dễ tưởng hệ thống đã search hết 5-8 query như thiết kế | Nếu giới hạn 4 là chủ đích (tiết kiệm Tavily credit), thêm comment giải thích rõ lý do + log số query bị bỏ; nếu không, bỏ giới hạn hoặc tăng lên khớp với số query LLM sinh ra |
| 🟡 Medium | `build_docx_and_log.ts`, `skip_and_log.ts` khi gọi `runLogScan` | Luôn truyền fallback (`"Chưa rõ"`, `"Team VNF"`) cho `ly_do`/`owner_follow_up` khi LLM không trả về — khiến validate `throw Error` trong `log_scan_excel.ts` (xem 5.1) **không bao giờ thực sự kích hoạt**, vì giá trị luôn khác rỗng | Cơ chế chặn cứng được thiết kế đúng nhưng bị vô hiệu hóa ngầm bởi cách gọi — Excel log có thể chứa nhiều dòng `"Chưa rõ"` mà lẽ ra phải bị chặn để buộc điền lý do thật | Không dùng fallback text mơ hồ cho 2 field này ở tầng gọi — để giá trị rỗng/`undefined` đi qua nguyên trạng, để validate trong `log_scan_excel.ts` phát huy đúng tác dụng |
| 🟡 Medium | `src/nodes/agent.ts`, `tools.ts`, `human.ts`, `conditions.ts`, `src/tools/definitions.ts`, `src/skills/scan-grant-vnf/instructions.ts` (~438 dòng) | Toàn bộ nhóm file này định nghĩa 1 kiểu ReAct-agent (agent gọi tool tự do theo vòng lặp) nhưng **không được `graph.ts` import ở bất kỳ đâu** — xác nhận bằng grep, các symbol này chỉ tự tham chiếu nhau, không ai gọi vào | Code chết dễ gây nhầm lẫn cho người đọc mới (tưởng đây là cách agent hoạt động thật), và có nguy cơ bị sửa/maintain song song với `graph.ts` gây lệch pha logic nếu không ai để ý nó không chạy | Xóa hẳn nếu không còn dùng, hoặc di chuyển vào 1 thư mục `experimental/`/`_unused/` kèm comment giải thích rõ đây là bản nháp chưa nối vào graph chính |
| 🟢 Low | Repo root có cả `SKILL.MD` (592 dòng) và `SKILL copy.md` (600 dòng) | 2 file gần như trùng nội dung cùng tồn tại trong repo | Gây nhầm lẫn không biết file nào là bản chuẩn hiện hành | Xóa file thừa hoặc đổi tên rõ ràng (`SKILL.archive.md`) nếu cố tình giữ lại làm lịch sử |
| ⚪ Nit | `src/tools/qa_check.ts` message lỗi | Thông báo lỗi khi thiếu TOC field vẫn ghi "có thể quên chạy **finalize.py**" dù bản TS gọi `finalize.ts` | Chi tiết nhỏ nhưng có thể khiến người debug tìm nhầm file khi bản Python gốc không còn tồn tại trong repo này | Sửa message thành `finalize.ts` cho khớp codebase hiện tại |

### 5.3 Rủi ro bảo mật

Đã rà theo checklist chuẩn (secret hardcode, injection, deserialize không an toàn, exposure lỗi):
không phát hiện secret hardcode (đã kiểm tra bằng grep + đọc `.env.example`/`.gitignore`), không
có `eval`/`Function()`/deserialize không an toàn. 1 điểm cần lưu ý nhẹ: `extract_candidate_content.ts`
fetch trực tiếp URL do LLM (`find_official_site`) hoặc user cung cấp mà không giới hạn domain hay
kiểm tra kiểu response ngoài `content-type` — về lý thuyết có thể bị dẫn tới fetch nội bộ (SSRF)
nếu URL trỏ vào địa chỉ nội bộ của môi trường chạy; rủi ro thấp trong ngữ cảnh CLI cá nhân nhưng
đáng cân nhắc nếu sau này expose thành service công khai.

### 5.4 Đề xuất cải thiện — ưu tiên làm gì trước

1. **Sửa 2 lỗi Critical trước tiên** (#1 truyền sai dữ liệu cho `check_eligibility`/
   `score_and_select_track`, #2 thứ tự kiểm tra sai trong `afterQACheck`) — đây là 2 lỗi ảnh hưởng
   trực tiếp tới độ tin cậy của kết quả GO/MAYBE/SKIP, effort sửa thấp (đổi vài dòng) nhưng tác
   động cao nhất trong toàn bộ review.
2. Sửa `qaRetryCount` thành theo-candidate ngay sau đó — phụ thuộc logic với #2 nên nên làm cùng
   đợt.
3. Dọn code chết (`nodes/agent.ts` và nhóm liên quan) — effort thấp, giảm đáng kể chi phí đọc hiểu
   cho người mới join sau này.
4. Xem lại cơ chế fallback text ở `build_docx_and_log.ts`/`skip_and_log.ts` để validate trong
   `log_scan_excel.ts` phát huy đúng tác dụng đã thiết kế.
5. Bổ sung assertion tự động cho `test_flows.ts` (hiện chỉ chạy và in ra, chưa tự check pass/fail)
   — ưu tiên thấp hơn nhưng sẽ giúp bắt sớm các lỗi kiểu #1/#2 ở trên trong tương lai.

## 6. Câu hỏi tự kiểm tra

1. Nếu `check_eligibility.ts` không tìm thấy tin nhắn AI chứa `"research_grant completed"` (ví dụ
   do đổi câu chữ ở `research_grant.ts`), điều gì xảy ra tiếp theo? Graph có dừng lại và báo lỗi
   không, hay vẫn chạy tiếp với dữ liệu rỗng?
2. Giả sử `afterQACheck` được sửa đúng thứ tự (check `qaResult.pass` trước `selectedCandidateQueue`)
   — cần sửa thêm gì ở `qaRetryCount` để candidate thứ 2 không bị ảnh hưởng bởi số lần retry của
   candidate thứ 1?
3. Vì sao `resolve_source.ts` và `find_official_site.ts` đều có logic kiểm tra
   `website.trim().startsWith("http")` giống nhau? Có thể gộp lại thành 1 helper dùng chung được
   không, và nên đặt ở đâu?
4. `FileSaver` (checkpointer tự viết) lưu checkpoint dưới dạng file JSON trên đĩa cục bộ — điều gì
   sẽ xảy ra nếu 2 tiến trình `node dist/index.js` chạy đồng thời với cùng 1 `thread_id`? Có race
   condition không?
5. Nếu Tavily trả lỗi cho **cả 4** query trong `run_search.ts`, `searchResults` sẽ có giá trị gì?
   `extract_candidates.ts` xử lý trường hợp đó ra sao — có báo rõ cho user là search thất bại hoàn
   toàn không, hay âm thầm trả về 0 candidate?
6. Tại sao `qa_check.ts` chọn cách đọc `word/document.xml` bằng regex thay vì dùng 1 thư viện XML
   parser đầy đủ? Đánh đổi ở đây là gì (điểm lợi và điểm rủi ro của cách làm này)?

## 7. Gợi ý bước tiếp theo cho intern

- Đọc thêm về LangGraph's `Annotation`/reducer pattern và `interrupt()`/`Command(resume)` — đây là
  2 khái niệm nền tảng của toàn bộ repo, hiểu rõ sẽ giúp đọc mọi node còn lại nhanh hơn nhiều.
- Bài tập thực hành: tự sửa lỗi Critical #1 (đổi input của `check_eligibility.ts` từ
  `lastAi?.content` sang `JSON.stringify(state.grantResearch)`), rồi chạy `npm run test:flows`
  và so sánh output `chatComplement` trước/sau — quan sát sự khác biệt về chất lượng lý do
  pass/fail để cảm nhận rõ tác động thật của bug này.
- Sau khi quen luồng chính, thử trace tiếp 1 lượt Mode B với 2 candidate được chọn cùng lúc, đặt
  breakpoint hoặc thêm `logStep` tạm thời quanh `afterQACheck` để tự quan sát lỗi #2 xảy ra trong
  thực tế trước khi sửa.