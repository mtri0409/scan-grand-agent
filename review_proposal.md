# Review & Đề xuất cải tiến — scan-grant-vnf agent

Tài liệu này tổng hợp nghiệp vụ, đánh giá source code và đề xuất cải tiến cho agent `scan-grant-vnf` (workspace `D:\VNF\scan-grant-agent`).

---

## 1. Hệ thống đang làm gì

`scan-grant-vnf` là agent LangGraph (TypeScript/`@langchain/langgraph`) tự động đánh giá grant/fund/competition/accelerator cho **RetriV** và **VNF** (Vietnam Food JSC). Có 2 chế độ:

- **Chế độ A — Scan 1 grant cụ thể**: user đưa tên/link → agent xác định nguồn chính thức → fetch nội dung → tìm đội thắng các mùa trước → đánh giá eligibility hard-stop → chấm điểm chiến lược + chọn track → xuất **báo cáo Word** chuẩn DS01 + **ghi dòng Excel log** (6 sheet) → chạy QA bắt buộc.
- **Chế độ B — Market Scan**: user chưa có tên grant → agent tìm rộng 8–15 candidate → xuất **Excel A** danh sách → dừng hỏi user chọn candidate nào deep-scan → chạy đủ Chế độ A cho từng candidate được chọn.

**Output chuẩn:**

- `output/runs/<timestamp>/reports/<STT>_<Tên>_ScanReport.docx` — báo cáo 8 mục + TOC field thật.
- `output/runs/<timestamp>/Grant_Scan_Tracker_RetriV_VNF.xlsx` — log 6 sheet với chấm điểm song song RetriV/VNF.
- `Grant_Market_Scan_<topic>_<date>.xlsx` — snapshot candidate (chỉ Chế độ B).

Nghiệp vụ tổng thể **đúng hướng**: quy trình rõ ràng, dual-scoring, QA bắt buộc, không tự động deep-scan hàng loạt, không đụng file tracker gốc.

---

## 2. Điểm mạnh

- **Workflow đúng nghiệp vụ**: phân biệt rõ Mode A/B, luôn hỏi nguồn trước khi scan, chấm điểm song song RetriV/VNF, QA là bước bắt buộc.
- **Output chuẩn hóa tốt**: Word DS01 + Excel log mirror đúng cấu trúc tracker gốc, có TOC field thật (`finalize.ts`), style VNF nhất quán.
- **Logging & checkpoint**: có `logger.ts`, `checkpointer.ts`, `FileSaver` hỗ trợ interrupt/resume.
- **Bảo vệ dữ liệu gốc**: không đụng `input/Grant_Fund_Tracker_VNF_2026.xlsx`, ghi ra file log riêng.
- **Cơ chế an toàn**: validate schema Excel, bắt buộc `ly_do` + `owner_follow_up` khi Skip/Maybe, cảnh báo trùng tên.

---

## 3. Các vấn đề & rủi ro

### 🔴 Critical

| # | Vấn đề | File / vị trí | Rủi ro nghiệp vụ |
|---|--------|---------------|-------------------|
| 1 | `skip_and_log` tồn tại nhưng **không được nối vào graph** | `src/graph.ts` dòng 150, 173, 82–85 | Dead code gây hiểu nhầm. `afterCheckEligibility` luôn đi `score_and_select_track` — vẫn đúng vì SKILL yêu cầu ra 2 file, nhưng cần dọn dẹp. |
| 2 | `afterResolveSource` có 2 nhánh trả về cùng 1 giá trị | `src/graph.ts` dòng 46–52 | Code smell: dù có URL hay không vẫn vào `find_official_site`. Dễ che giấu bug điều hướng sau này. |
| 3 | `find_official_site` **không thực sự search web** | `src/nodes/find_official_site.ts` toàn file | SKILL.MD yêu cầu "Claude sẽ search để xác định trang chính thức", nhưng code chỉ hỏi LLM. Rủi ro hallucinate URL, scan nhầm trang mùa cũ/aggregator. |
| 4 | **QA retry loop không sửa được lỗi** | `src/nodes/qa_check.ts` dòng 14–18, `src/graph.ts` dòng 91–99 | QA fail → quay lại `qa_check` mà không sửa. Lặp 3 lần rồi vào `report_error`. Mất công, không self-healing. |
| 5 | `extract_candidate_content` **không xử lý JS-rendered sites** | `src/nodes/extract_candidate_content.ts` dòng 44–56 | SKILL.MD dặn dùng browser nếu fetch thường trả trang trống. Code chỉ `fetch()` thô. Nhiều grant site hiện đại (Submittable, HelloAlice, v.v.) bị miss nội dung. |
| 6 | Trùng lặp tên chương trình chỉ cảnh báo, **không hỏi user** | `src/tools/log_scan_excel.ts` dòng 627–634 | SKILL.MD yêu cầu "hỏi họ có muốn ghi đè". Hiện tại chỉ in warning và append tiếp, dễ sinh duplicate. |

### 🟠 High

| # | Vấn đề | File / vị trí | Rủi ro |
|---|--------|---------------|--------|
| 7 | Eligibility/scoring bị chấm lặp 3 lần | `src/nodes/research_grant.ts`, `check_eligibility.ts`, `score_and_select_track.ts` | Tốn token, có thể mâu thuẫn kết quả giữa các node. |
| 8 | `build_docx_and_log` gộp 2 trách nhiệm và lỗi reuse | `src/nodes/build_docx_and_log.ts` dòng 73–80 | Khi retry QA, nếu báo cáo đã tồn tại thì **không ghi log Excel nữa**. Nếu lần đầu log fail, retry mất luôn dòng Excel. |
| 9 | `companyTarget` không bao giờ được set | `src/state.ts` dòng 120–123, `src/nodes/build_docx_and_log.ts` dòng 84 | Luôn mặc định "RetriV". User không thể chọn VNF làm dự án chính cho báo cáo Word. |
| 10 | Bảng eligibility trong Word bị lẫn key | `src/nodes/build_docx_and_log.ts` dòng 107–111 | `research.eligibility` theo prompt là array 1 chiều, code gọi `.retriv`/`.vnf`. Dễ nhầm lẫn, dù vẫn fallback bằng `state.eligibility`. |
| 11 | `load_company_context` chỉ đọc `.md/.txt` | `src/nodes/load_company_context.ts` dòng 16 | SKILL.MD nói data-context có thể chứa `.docx`, `.pdf`, `.xlsx`. Nếu hồ sơ ở định dạng đó, agent thiếu thông tin. |
| 12 | `run_search` dedup theo URL, không theo nội dung | `src/nodes/run_search.ts` dòng 77–82 | Có thể giữ nhiều URL khác nhau cùng nội dung, hoặc bỏ kết quả cùng URL khác nội dung. |

### 🟡 Medium

| # | Vấn đề | File / vị trí |
|---|--------|---------------|
| 13 | `DB_WIDTHS` thiếu 1 giá trị (31 widths cho 32 headers) | `src/tools/log_scan_excel.ts` dòng 78 |
| 14 | `resolve_source` không dùng choice tool | `src/nodes/resolve_source.ts` toàn file |
| 15 | `wait_for_selection` interrupt không kèm summary/file path | `src/nodes/wait_for_selection.ts` dòng 12, 59–61 |
| 16 | Thiếu validation data-context trống/thiếu | `src/nodes/load_company_context.ts` toàn file |
| 17 | `retrieve_past_winners` search quá thiên về domain chính | `src/nodes/retrieve_past_winners.ts` dòng 65–72 |
| 18 | Error handling "nuốt" lỗi | Nhiều node dùng `catch { parsed = {} }` |
| 19 | Không có unit test | Không thấy test cho `finalize.ts`, `qa_check.ts`, `log_scan_excel.ts` |

---

## 4. Đề xuất cải tiến

### A. Sửa bug nghiệp vụ ngay

1. **Xóa hoặc kích hoạt `skip_and_log`**
   - Nếu giữ triết lý "mỗi scan sâu ra 2 file" thì xóa `skip_and_log` và `afterSkipAndLog` để khỏi confuse.
   - Nếu muốn rút ngắn khi hard-fail, nối `check_eligibility` → `skip_and_log` khi `anyFail`, nhưng `skip_and_log` phải vẫn build Word report tóm tắt lý do SKIP.

2. **Làm `find_official_site` thật sự search**
   Dùng Tavily (hoặc search tool) với query `"<tên grant> official site"` và để LLM chọn URL chính thức từ kết quả search, không để LLM bịa URL.

3. **Hỗ trợ JS-rendered sites**
   - Bước 1: dùng Tavily `extract` hoặc `include_raw_content=true` để lấy nội dung rendered.
   - Bước 2: nếu vẫn trống, ghi warning và đề xuất MAYBE thay vì đoán.

4. **Sửa QA retry loop**
   - Nếu QA fail, chuyển sang node sửa lỗi cụ thể (ví dụ: thiếu logo → build lại cover; thiếu lý do → bổ sung lý do) rồi mới chạy lại QA.
   - Hoặc bỏ retry nếu không tự sửa được: fail luôn và báo user.

5. **Xử lý duplicate trong graph**
   Trước khi append Excel, kiểm tra tên đã có trong `Database` → interrupt hỏi user "ghi đè / thêm mới / bỏ qua".

### B. Tối ưu chất lượng & chi phí

6. **Giảm chấm lặp eligibility/scoring**
   - Option 1: Bỏ `check_eligibility` node, dùng `research_grant.eligibility` và validate bằng code.
   - Option 2: Giữ `check_eligibility` nhưng bỏ yêu cầu scoring trong `research_grant` prompt để tiết kiệm token.
   - Khuyến nghị **Option 2**: `check_eligibility` tập trung hard-stop, `score_and_select_track` tập trung chiến lược.

7. **Tách `build_docx_and_log` thành 2 node**
   - `build_report`: tạo Word.
   - `log_excel`: ghi Excel.
   - Đảm bảo log luôn chạy, kể khi retry báo cáo.

8. **Set `companyTarget` từ user**
   Trong `classify.ts` hoặc `resolve_source`, hỏi user "báo cáo Word tập trung vào RetriV hay VNF?" và lưu vào `state.companyTarget`.

### C. Polish & maintainability

9. **Sửa `DB_WIDTHS`** thêm width cho cột 32 (`Link báo cáo (Word)`).

10. **Mở rộng `load_company_context`** đọc `.docx`, `.pdf`, `.xlsx` (dùng mammoth/pdf-parse/xlsx), hoặc ít nhất cảnh báo nếu thiếu info quan trọng.

11. **Cải thiện `wait_for_selection`**
    Interrupt kèm bảng tóm tắt + đường dẫn Excel A trong câu hỏi, không chỉ dựa vào `chatComplement`.

12. **Tăng coverage `retrieve_past_winners`**
    Thêm queries: `"<grant> winner LinkedIn"`, `"<grant> alumni press release"`, `"<grant> finalist news"` không giới hạn `site:`.

13. **Thêm unit test**
    Ưu tiên test: `finalize.ts` (TOC field, outline tagging), `qa_check.ts` (PASS/FAIL cases), `log_scan_excel.ts` (append + rebuild Dashboard/Deadlines), `xlsx-style-helpers.ts`.

14. **Log lỗi rõ ràng hơn**
    Thay các `catch { parsed = {} }` bằng `logStep("node", "parse_error", err.message)` và trả về `chatComplement` cảnh báo user.

### D. Kiến trúc dài hạn

15. **Cân nhắc tracker tập trung**
    Hiện mỗi run tạo thư mục `output/runs/<timestamp>/` riêng. Cân nhắc 1 file `output/Grant_Scan_Tracker_RetriV_VNF.xlsx` chung để lịch sử không bị phân mảnh, hoặc thêm bước merge từ các run.

16. **Thêm tool calling thay vì chỉ interrupt**
    Ví dụ: tool chọn candidate, tool xác nhận ghi đè duplicate — giúp agent có thể chạy hands-free hơn trong tương lai.

---

## 5. Kết luận nhanh

Hệ thống đã **bắt đúng tinh thần nghiệp vụ** của `SKILL.MD`. Tuy nhiên cần sửa các lỗi kỹ thuật: `find_official_site` search ảo, QA retry vô hiệu, `build_docx_and_log` mất log khi retry, dead code `skip_and_log`, và tối ưu chấm điểm lặp.

### Top 3 việc nên làm trước

1. **Sửa `find_official_site` để search thật** — tránh scan nhầm URL/mùa cũ.
2. **Tách `build_docx_and_log` và đảm bảo log luôn được ghi** — đúng output 2 file/grant.
3. **Sửa QA retry loop + xử lý duplicate trong graph** — đúng quy trình `SKILL.MD`.
