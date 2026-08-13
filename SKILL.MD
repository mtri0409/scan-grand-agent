---
name: "scan-grant-vnf"
description: "Scan 1 grant/fund/competition/accelerator CỤ THỂ, HOẶC quét rộng thị trường tìm nhiều grant đang có sẵn, rồi đề xuất Go/Maybe/Skip cho RetriV/VNF (Vietnam Food JSC). Chế độ A: user nêu tên/link 1 chương trình cụ thể — vd \"scan grant này\", \"grant X có phù hợp RetriV/VNF không\". Chế độ B (Market Scan): user CHƯA có tên cụ thể, muốn tìm/khám phá — vd \"có grant nào phù hợp cho RetriV không\", \"quét thị trường tìm quỹ tài trợ cho VNF\", \"list chương trình tài trợ về chitosan/circular economy\". Đọc hồ sơ data-context/, kiểm tra eligibility, chấm điểm, chọn challenge/track phù hợp, search kỹ đội thắng các mùa trước để rút bài học, xuất Excel log + báo cáo Word chuẩn VNF cho mỗi grant scan sâu. Ở Chế độ B, luôn xuất 1 Excel liệt kê toàn bộ candidate tìm được TRƯỚC, rồi hỏi user muốn scan sâu (ra Excel log + báo cáo Word) candidate nào — không tự động deep-scan hàng loạt. Dùng khi user muốn đánh giá HOẶC đi tìm chương trình tài trợ, kể cả chỉ paste link, tên grant, hoặc chỉ nêu chủ đề/ngành muốn tìm."
---

# Skill: Scan Grant — Đánh giá, Quét thị trường, Đề xuất & Ghi log

## Mục đích

Skill này giúp team RetriV và VNF đánh giá nhanh một grant/fund/competition/accelerator để
quyết định có nên đầu tư thời gian apply hay không. Mục tiêu là cung cấp đủ thông tin để team ra
quyết định Go/Maybe/Skip trong vòng 10 phút, thay vì tốn vài tiếng đọc website — và tự động ghi
lại kết quả vào một file Excel log riêng để theo dõi qua thời gian.

Ngoài việc đánh giá một grant đã biết tên (Chế độ A), skill còn giúp **chủ động đi tìm**
grant mới mà team chưa biết tới (Chế độ B — Market Scan): quét rộng thị trường theo lĩnh vực của
RetriV/VNF, liệt kê toàn bộ candidate tìm được vào 1 Excel riêng, rồi hỏi user muốn deep-scan
(đúng quy trình Chế độ A) candidate nào trước khi chạy tiếp — để team không bỏ lỡ cơ hội tài trợ
chỉ vì chưa nghe tên chương trình đó bao giờ, và cũng không tốn công deep-scan những grant mà họ
thực ra không quan tâm.

**Quan trọng:** Skill chỉ đề xuất — quyết định cuối là của team.

---

## Input cần có

**Chế độ A — Scan 1 grant cụ thể:**
- Tên grant hoặc URL website (bắt buộc ít nhất 1 trong 2)

**Chế độ B — Market Scan (quét thị trường):**
- Chủ đề/lĩnh vực/khu vực muốn tìm grant (tuỳ chọn — nếu user không nêu, mặc định lấy lĩnh vực
  cốt lõi từ hồ sơ RetriV/VNF trong `data-context/`)

**Chung cho cả 2 chế độ:**
- Dự án đứng tên apply cho báo cáo Word (Bước 6a): **RetriV** hoặc **VNF** (mặc định là RetriV
  nếu không nói rõ) — Excel log (Bước 6b) luôn chấm điểm song song CẢ HAI công ty bất kể lựa chọn
  này, để so sánh mức độ phù hợp.
- (tự động) Hồ sơ công ty/dự án của CẢ RetriV và VNF, lấy từ thư mục `data-context/` trong cùng
  workspace

---

## Bước 0 — Xác định chế độ & nguồn thông tin (luôn làm đầu tiên)

### Bước 0a — Chế độ A hay Chế độ B?

Đọc yêu cầu của user để xác định đang cần chế độ nào:

- **Chế độ A — Scan 1 grant cụ thể:** user đã nêu TÊN hoặc LINK của một chương trình tài trợ cụ
  thể (dù chỉ 1 cái). Ví dụ: "scan grant MIT Solve", "check cái link này giúp mình", "grant XYZ
  2026 có phù hợp không". → tiếp tục Bước 0b bên dưới.
- **Chế độ B — Market Scan (quét thị trường):** user CHƯA có tên grant cụ thể, mà muốn đi tìm/
  khám phá xem có chương trình nào phù hợp. Ví dụ: "có grant nào phù hợp cho RetriV không",
  "quét thị trường tìm quỹ tài trợ cho VNF", "tìm giúp mình vài accelerator về circular
  economy", "list các grant đang mở liên quan chitosan". → chuyển sang mục **"Market Scan Mode
  (Chế độ B)"** ngay bên dưới, KHÔNG làm Bước 0b này.

Nếu không rõ ràng (ví dụ user chỉ nói "check grant giúp mình" mà không có tên/link/chủ đề nào),
hỏi ngắn gọn: "Bạn đã có tên/link grant cụ thể muốn scan, hay muốn mình tìm giúp các grant đang
có trên thị trường theo một chủ đề nào đó?"

### Bước 0b — Xác định nguồn thông tin (chỉ áp dụng Chế độ A)

Nếu user đã dán sẵn một URL cụ thể trong tin nhắn, dùng thẳng URL đó và bỏ qua bước hỏi này.

Nếu user chỉ nêu **tên** grant mà chưa kèm link, luôn hỏi user một câu trước khi làm bất cứ
việc gì khác (dùng công cụ hỏi lựa chọn nếu có sẵn):

> "Bạn muốn mình tự tìm website chính thức của [Tên grant], hay bạn sẽ gửi link cụ thể để mình
> lấy thông tin từ đó?"

Hai lựa chọn:
1. **Để mình tự tìm** — Claude sẽ search để xác định trang chính thức trước khi phân tích.
2. **Gửi link cụ thể** — chờ user gửi URL, chỉ phân tích đúng trang đó.

Lý do bước này quan trọng: grant/competition thường có nhiều trang phụ (báo chí đưa tin,
aggregator, trang mùa cũ của năm trước) chứa thông tin sai lệch hoặc lỗi thời. Để user xác nhận
nguồn giúp tránh scan nhầm trang — đặc biệt rủi ro với các cuộc thi/accelerator tổ chức nhiều
mùa/cohort khác nhau (ví dụ chương trình đang ở Cohort 8 nhưng Claude tự tìm ra trang Cohort 5
đã cũ).

Nếu user chọn "tự tìm", trước khi phân tích sâu, xác nhận lại đây đúng là trang **chính thức**
của chương trình (không phải bài báo nói về grant) rồi mới sang Bước 2.

---

## Market Scan Mode (Chế độ B) — Quét thị trường tìm nhiều grant

Chế độ này dùng khi user chưa có tên grant cụ thể mà muốn chủ động đi tìm. Kết quả trước tiên là
1 Excel liệt kê toàn bộ candidate tìm được (Bước B5) — sau đó Claude LUÔN dừng lại hỏi user muốn
deep-scan candidate nào (Bước B6) trước khi chạy tiếp quy trình Chế độ A (Bước 1 → Bước 7) cho
đúng những candidate đó. Team vẫn nhận được đầy đủ báo cáo Word + dòng ghi vào Excel log như một
scan bình thường cho mỗi candidate được chọn, chỉ khác là Claude tự tìm ra grant thay vì user đưa
sẵn tên, và user là người quyết định candidate nào đáng deep-scan chứ không phải Claude tự chọn.

### B1 — Xác định chủ đề tìm kiếm

Nếu user đã nêu rõ chủ đề/ngành/khu vực (vd: "circular economy thủy sản Đông Nam Á", "grant về
phụ phẩm nông nghiệp"), dùng đúng chủ đề đó. Nếu user không nêu, đọc hồ sơ RetriV và VNF trong
`data-context/` (giống Bước 1 bên dưới) trước, rồi tự suy ra 1-2 chủ đề tìm kiếm mặc định từ
lĩnh vực cốt lõi của 2 công ty (vd: chitosan, phụ phẩm tôm, circular economy, foodtech, biotech
nông nghiệp) — nói rõ cho user biết chủ đề mặc định này trước khi search, để họ có thể chỉnh lại
nếu muốn tìm phạm vi khác.

### B2 — Search rộng nhiều truy vấn

Chạy nhiều truy vấn web search khác nhau quanh chủ đề đã chọn (không chỉ 1 câu tìm kiếm) để phủ
được nhiều nguồn: tên chương trình cụ thể, aggregator grant/accelerator, tin tức ngành, trang của
các quỹ/tổ chức lớn trong lĩnh vực. Mục tiêu thực tế: khoảng 8-15 candidate còn đang mở hoặc rõ
ràng có tính lặp lại hàng năm (loại bỏ chương trình đã đóng hẳn/ngừng tổ chức). Nếu tìm được ít
hơn nhiều, cứ báo cáo đúng số lượng thật, không cố "độn" cho đủ số.

### B3 — Thu thập nhanh từng candidate

Với mỗi candidate, lấy nhanh (không cần fetch sâu như Bước 2 của Chế độ A): tên chương trình,
nhà tài trợ, lĩnh vực, funding, deadline, geography, website, nguồn tìm thấy candidate này.

### B4 — Chấm eligibility sơ bộ song song RetriV/VNF

Dùng bảng tiêu chí cứng ở Bước 3 bên dưới (geography, entity type, TRL, IP, deadline,
double-dipping, giai đoạn) để chấm nhanh mỗi candidate là "Có thể" / "Không" / "Chưa rõ" cho
CẢ RetriV và VNF — chỉ cần đủ thông tin để lọc thô, chưa cần phân tích sâu như Bước 3 đầy đủ.

### B5 — Xuất Excel A (danh sách candidate)

Dùng `scripts/market_scan_excel.py` để xuất 1 file Excel liệt kê toàn bộ candidate + kết quả
Bước B3-B4, lưu tại `output/Grant_Market_Scan_<slug-chủ-đề>_<ddmmyyyy>.xlsx`. File này độc lập
với Excel log ở Bước 6b — không ghi đè, không trộn 2 file.

### B6 — Trình bày danh sách cho user & hỏi muốn deep-scan candidate nào

**KHÔNG tự động deep-scan bất kỳ candidate nào ở bước này.** Deep-scan đầy đủ (Bước 1 → 7) tốn
nhiều thời gian và request (web search, tạo Word, ghi Excel log) cho mỗi candidate — tự động chạy
hàng loạt dễ tốn công vào những grant mà thực ra user không quan tâm, hoặc bỏ sót đúng grant họ
muốn ưu tiên. Vì vậy sau khi xuất xong Excel A (Bước B5), dừng lại và để user quyết định.

Trình bày ngay trong chat một bảng tóm tắt các candidate vừa tìm được (không cần mở lại file
Excel), gồm ít nhất: STT, Tên chương trình, Nhà tài trợ, Funding, Deadline, Eligibility sơ bộ
(RetriV/VNF). Nếu có candidate nào rõ ràng đáng chú ý hơn (không fail hard-stop nào, deadline gần,
funding lớn), có thể gợi ý ngắn gọn "mấy candidate này có vẻ đáng cân nhắc trước" — nhưng đây chỉ
là gợi ý, không phải lựa chọn tự động.

Sau bảng, hỏi thẳng user (dùng công cụ hỏi lựa chọn nếu có sẵn):

> "Mình đã liệt kê [N] candidate vào file Excel. Bạn muốn mình scan sâu (ra báo cáo Word + ghi
> Excel log) candidate nào? Có thể chọn 1, vài, hoặc tất cả — hoặc dừng ở đây và tự xem xét thêm
> file Excel trước."

Chỉ tiếp tục sang B6b bên dưới sau khi user đã trả lời rõ candidate nào (tên/STT) cần deep-scan.
Nếu user không chọn gì hoặc nói chưa cần deep-scan ngay, dừng lại ở đây — Excel A đã đủ để họ tự
xem xét, không tự ý chạy tiếp.

### B6b — Deep-scan đúng những candidate user đã chọn

Với MỖI candidate user đã chỉ định ở B6 (không thêm, không bớt ngoài danh sách họ chọn), chạy đầy
đủ **Bước 1 → Bước 7** bên dưới (y hệt quy trình Chế độ A, không rút gọn) — nghĩa là mỗi candidate
ra 1 báo cáo Word riêng (Bước 6a) và 1 dòng trong Excel log chung (Bước 6b), cộng thêm Bước 7 QA
cho từng báo cáo. Nếu user chọn quá nhiều candidate cùng lúc (ví dụ >5) khiến việc chạy hết sẽ mất
nhiều thời gian, cứ báo trước cho user biết ước tính rồi tiếp tục theo đúng số họ đã chọn — không
tự ý cắt bớt danh sách của họ.

### B7 — Tổng kết cho user

Sau khi xong, báo cáo ngắn gọn: tổng số candidate tìm thấy (trong Excel A), danh sách candidate
vừa được deep-scan theo yêu cầu của user (kèm tên + đề xuất Go/Maybe/Skip của từng cái), và nhắc
rằng các candidate còn lại vẫn nằm trong Excel A nếu user muốn deep-scan thêm bất cứ lúc nào sau
đó.

---

## Bước 1 — Đọc hồ sơ công ty/dự án (`data-context/`)

Trước khi scan, đọc toàn bộ file trong thư mục `data-context/` (nằm cùng cấp với `input/` và
`output/` trong workspace Grant Fund) để lấy profile của **CẢ HAI** dự án cần đối chiếu: **RetriV**
và **VNF** (Vietnam Food JSC). Từ bản cập nhật này, mọi grant scan đều BẮT BUỘC chấm điểm song
song cho cả 2 công ty (không còn hỏi "RetriV hoặc VNF" rồi chỉ đánh giá 1 công ty như trước) —
mirror đúng cách file tracker gốc VNF (`Grant_Fund_Tracker_VNF_2026.xlsx`) luôn chấm điểm song
song 2 cột RetriV/BiarmO cho mọi entry để so sánh mức độ phù hợp. Thư mục này có thể chứa file
`.md`, `.docx`, `.pdf`, `.xlsx` — đọc hết những gì có, không giả định định dạng cố định.

Thông tin cần rút ra cho MỖI công ty (nếu có trong hồ sơ):

- TRL hiện tại
- Giai đoạn thương mại (pre-revenue, đã có pilot, đã có doanh thu...)
- Geography (Việt Nam, đang mở rộng sang đâu)
- Entity (loại pháp nhân: JSC, LLC, NGO, startup riêng...)
- Pilot partners / khách hàng hiện có
- Grant đang chạy song song (để kiểm tra double-dipping)
- Chủ sở hữu IP
- Sản phẩm/công nghệ cốt lõi, thị trường mục tiêu (dùng cho Bước 5 — chọn challenge phù hợp nhất)

Nếu `data-context/` đang trống hoặc thiếu thông tin quan trọng cho một trong hai công ty, đừng
đoán — hỏi nhanh user vài dòng về công ty đó (tối thiểu: TRL, loại pháp nhân, geography, IP)
trước khi làm Bước 3 (eligibility), vì đây là nền để đối chiếu hard-stop cho cả RetriV và VNF.

**Báo cáo Word ở Bước 6a vẫn tập trung vào 1 dự án chính** (dự án nào có khả năng đứng tên apply
thực tế, mặc định RetriV nếu user không chỉ định) — dual-scoring RetriV/VNF chỉ áp dụng ở file
Excel log (Bước 6b) để so sánh; báo cáo Word nên thêm 1 ghi chú ngắn ở Bước 3 (chấm điểm) nêu điểm
so sánh với công ty còn lại, tham chiếu tới sheet ⭐ Scoring trong Excel log.

---

## Bước 2 — Fetch & phân tích thông tin grant

Dùng web search/fetch để lấy thông tin từ website đã xác định ở Bước 0. Thu thập đầy đủ:

| Mục | Nội dung cần lấy |
|-----|-----------------|
| Tên chính thức | Tên đầy đủ của chương trình (kèm cohort/mùa nếu có) |
| Nhà tài trợ | Tổ chức/quỹ tài trợ, corporate partners nếu là accelerator |
| Funding/Award | Số tiền hoặc giá trị giải thưởng |
| Deadline | Deadline nộp hồ sơ |
| Timeline | Các mốc quan trọng (announcement, shortlist, final) |
| Eligibility | Geography, loại tổ chức, TRL, co-funding, IP, doanh thu |
| Application requirements | Form, attachments, video, pitch deck, word limits |
| Rubric/Judging criteria | Tiêu chí chấm điểm của ban giám khảo |
| Past winners | Search KỸ tối thiểu 2-3 mùa/năm gần nhất (không chỉ đọc trang chủ — tìm thêm press release, LinkedIn, báo chí ngành nếu trang chính thức không liệt kê đủ): tên đội/dự án thắng, năm/mùa, lĩnh vực/sản phẩm, và (nếu tìm được) lý do BGK chọn họ. Dùng để ước lượng win probability VÀ để phân tích ở Mục 6 của báo cáo — không chỉ liệt kê tên suông |
| Focus area / Challenges | Lĩnh vực ưu tiên; nếu chương trình chia theo nhiều challenge/track cụ thể (thường gặp ở accelerator có nhiều corporate partner), liệt kê đầy đủ từng track |
| Co-funding requirement | Có yêu cầu co-funding không, tỷ lệ bao nhiêu |
| IP restrictions | Grant có yêu cầu gì về IP không |
| Reporting obligations | Nghĩa vụ báo cáo sau khi nhận grant |

Nếu trang web là dạng client-rendered (JS nặng) và fetch thường trả về trang trống, chuyển sang
dùng trình duyệt (Claude in Chrome) để đọc nội dung thật thay vì đoán từ HTML thô.

Nếu không lấy được đủ thông tin, ghi rõ "Chưa rõ — cần xác minh thủ công" thay vì đoán mò.

---

## Bước 3 — Kiểm tra Eligibility (Hard Stop)

Đối chiếu thông tin grant với profile CẢ RetriV và VNF (từ Bước 1). Đa số hard-stop (deadline,
geography, waste-stream/lĩnh vực) áp dụng chung cho cả 2 công ty vì cùng hệ sinh thái VNF — chỉ
cần kiểm tra 1 lần và ghi rõ "áp dụng chung cho cả RetriV và VNF" trong Lý do. Một số tiêu chí có
thể khác nhau giữa 2 công ty (TRL/giai đoạn, entity type nếu RetriV có pháp nhân riêng) — khi đó
ghi kết quả riêng cho từng công ty. Nếu fail bất kỳ tiêu chí cứng nào dưới đây (cho ít nhất 1 công
ty) → đề xuất **SKIP ngay** cho công ty đó, không cần chấm điểm:

| Tiêu chí cứng | Câu hỏi cần kiểm tra |
|---------------|---------------------|
| Geography | Grant có cho phép công ty Việt Nam apply không? |
| Entity type | Grant có chấp nhận công ty (JSC/LLC) không, hay chỉ dành cho NGO/startup/university? |
| TRL | Yêu cầu TRL có phù hợp với TRL hiện tại của dự án không? |
| IP | Grant có yêu cầu chuyển nhượng hoặc chia sẻ IP không (dự án cần giữ toàn bộ IP)? |
| Deadline | Còn ít hơn 2 tuần → thường không đủ thời gian chuẩn bị hồ sơ tốt |
| Double-dipping | Grant có cấm nhận đồng thời với các grant khác đang chạy không? |
| Giai đoạn | Grant yêu cầu chưa có doanh thu trong khi dự án đã có pilot/doanh thu? |

Nếu eligibility "Chưa rõ" ở nhiều tiêu chí quan trọng → đề xuất **MAYBE**, không SKIP.

---

## Bước 4 — Chấm điểm chiến lược

Chấm 1–5 điểm cho từng tiêu chí dưới đây, giải thích ngắn lý do từng điểm:

| # | Tiêu chí | Câu hỏi đánh giá | Điểm 1–5 |
|---|----------|-----------------|----------|
| 1 | **Strategic fit** | Grant có align với mục tiêu hiện tại của dự án không? | /5 |
| 2 | **Funding vs effort** | Giá trị tài trợ có xứng với công sức viết hồ sơ không? | /5 |
| 3 | **Win probability** | Dựa trên past winners và profile dự án, xác suất thắng cao không? | /5 |
| 4 | **Deadline feasibility** | Còn đủ thời gian chuẩn bị hồ sơ tốt không? (T-4 tuần trở lên = tốt) | /5 |
| 5 | **Restrictions** | Các điều kiện ràng buộc (IP, co-funding, reporting) có chấp nhận được không? | /5 |
| 6 | **Network value** | Tham gia có giúp mở rộng quan hệ, market access, uy tín dù không thắng không? | /5 |

**Thang điểm:**
- **25–30 điểm → GO** (nên apply, ưu tiên cao)
- **18–24 điểm → MAYBE** (có tiềm năng nhưng cần xem xét thêm — nêu rõ đang **nghiêng về GO** hay
  **nghiêng về SKIP** dựa trên số lượng và mức độ nghiêm trọng của các câu hỏi còn treo)
- **<18 điểm → SKIP** (không đáng đầu tư thời gian)

Thang 6 tiêu chí trên dùng cho báo cáo Word (Bước 6a), chấm cho dự án chính đang được apply
(mặc định RetriV). Ngoài ra, quy đổi thêm sang 5 tiêu chí thang 0–10 (Khớp lĩnh vực, Đổi mới, Tác
động môi trường, Tiềm năng quốc tế, Đạt giải) để điền vào file Excel log ở Bước 6b — **BẮT BUỘC
chấm thang 0–10 này cho CẢ RetriV VÀ VNF**, kể cả khi chỉ 1 công ty có ý định apply, để so sánh
mức độ phù hợp giữa 2 công ty (mirror đúng cách sheet ⭐ Scoring của file tracker gốc VNF luôn có
2 cột điểm song song). Quy đổi hợp lý theo nhận định chuyên môn, không cần công thức máy móc giữa
hai thang điểm.

---

## Bước 5 — Xác định Challenge/Track phù hợp nhất (nếu có)

Nhiều accelerator/competition (đặc biệt loại có nhiều corporate partner) chia chương trình thành
nhiều challenge/track riêng biệt — mỗi track có tiêu chí và ban giám khảo khác nhau. Việc chọn
đúng track ảnh hưởng trực tiếp đến xác suất thắng.

- Nếu chương trình **có** nhiều track: đối chiếu từng track với sản phẩm/công nghệ/thị trường
  của dự án (lấy từ Bước 1), chọn ra track phù hợp nhất và giải thích ngắn gọn lý do (điểm mạnh
  nào của dự án khớp nhất với track đó). Có thể liệt kê thêm 1 track dự phòng nếu có.
- Nếu chương trình **không** chia track: ghi rõ "N/A — chương trình không chia track" trong mục
  này, không được bỏ trống hoặc bỏ qua mục này trong báo cáo.

---

## Bước 6 — Xuất file đầu ra (2 file/grant; Chế độ B có thêm Excel A ở bước B5)

Trong Chế độ A hoặc khi deep-scan từng candidate user đã chọn ở Chế độ B (Bước B6b), mỗi grant
được scan sâu luôn ra đúng 2 file như mô tả bên dưới (Word + dòng Excel log). Chế độ B còn có
thêm 1 file Excel A riêng (danh sách toàn bộ candidate tìm được, xem Bước B5) — file này xuất ra
NGAY sau khi tìm xong candidate, trước khi hỏi user, và không tính vào 2 file này vì nó là output
của bước quét thị trường, không phải của 1 lần deep-scan cụ thể.

### 6a. Báo cáo đầy đủ — file Word chuẩn thương hiệu VNF

Làm bước này **trước** để có sẵn đường dẫn file cần điền vào cột link của Excel ở bước 6b.

Dùng skill `vnf-standard-style` (DS01) để build báo cáo Word đầy đủ — đây là engine style dùng
chung cho mọi tài liệu VNF nên báo cáo sẽ đồng bộ với các tài liệu khác của công ty. Xác nhận
nhanh với user headline (gợi ý mặc định: "VNF Grant Scan Report"), footer (mặc định
"Confidential"), và orientation (mặc định portrait — báo cáo nhiều chữ, không cần landscape) rồi
build nội dung theo đúng cấu trúc 8 mục ở phần "Format nội dung báo cáo" bên dưới bằng
`DS01ReportBuilder`: cover page → mục lục → 8 heading tương ứng 8 mục → bảng eligibility → bảng
chấm điểm chiến lược → callout box cho đề xuất Go/Maybe/Skip.

Lưu file vào `output/reports/` với tên gợi ý: `<STT hoặc slug>_<Tên chương trình>_ScanReport.docx`.

**Mục lục dùng Word TOC field chuẩn, không cần bake số trang bằng script.** Sau khi `rb.save()` +
`finalize.py`, file Word đã có sẵn TOC field thật cùng text placeholder "Nhấn F9 để cập nhật" —
đây là hành vi mặc định của Word đối với mọi TOC field, không phải lỗi. Không cần chạy thêm script
nào để bake số trang: user tự mở file bằng Word rồi bấm **F9** (hoặc chuột phải vào Mục lục →
"Update Field") để Word tính toán layout thật và điền tiêu đề + số trang + hyperlink — thao tác
này chỉ mất vài giây và Word làm chính xác hơn bất kỳ cách bake số trang nào từ bên ngoài.

**Trình bày nội dung — tránh xuống dòng quá nhiều:** Với các mục chỉ là cặp label–giá trị (ví dụ
Mục 1 "Thông tin cơ bản": Nhà tài trợ/Funding/Deadline/Timeline/Website/Nguồn xác nhận; Mục 5
"Yêu cầu hồ sơ": Form/Attachments/Rubric...), dùng `rb.add_table(["Mục", "Nội dung"], rows,
col_widths=[1.6, 4.9])` thay vì `rb.add_bullet(..., bold_prefix=...)` — bullet dài dễ bị wrap 3–6
dòng trông lộn xộn, còn bảng 2 cột nhìn "chuẩn chỉnh" hơn và tận dụng `add_table`'s auto word-wrap.
Chỉ dùng bullet cho nội dung thật sự dạng danh sách/checklist (Rủi ro, việc cần làm tiếp theo...).
**Không lặp lại label trong `bold_prefix` vào đầu chuỗi `text`** — `add_bullet(text, bold_prefix=X)`
tự thêm `"X: "` phía trước, nếu `text` cũng bắt đầu bằng `"X: ..."` sẽ bị lặp thành `"X: X: ..."`
(lỗi thực tế đã xảy ra) — viết `text` bắt đầu thẳng vào nội dung, không lặp lại label.

Nếu vì lý do nào đó không dùng được `vnf-standard-style` (thiếu dependency, lỗi môi trường...),
dùng skill `docx` để tạo báo cáo Word thường thay thế — vẫn phải giữ đủ nội dung 8 mục, không
được rút gọn chỉ vì đổi công cụ.

### 6b. File Excel — log riêng (KHÔNG đụng vào file tracker gốc)

**Quan trọng:** file `input/Grant_Fund_Tracker_VNF_2026.xlsx` (hoặc file tracker tương tự trong
`input/`) chỉ dùng để **tham khảo cấu trúc cột** — tuyệt đối không copy, không ghi đè, không tạo
bản sao của file này. Skill duy trì một file log riêng, độc lập, dành cho 2 dự án RetriV và VNF.

File log này có đủ **6 sheet**, mirror cấu trúc & màu sắc của file tracker gốc:
`📊 Dashboard | 🗄️ Database | 📅 Deadlines | ⭐ Scoring | 🔗 Links & Notes | 🤖 AI Automation Guide`.
Dashboard tổng hợp KPI (Tổng đã scan / 🟢 GO / 🟡 MAYBE / 🔴 SKIP / 🔵 Theo dõi vòng sau) + điều
hướng nhanh + bảng ưu tiên theo deadline. Database chấm điểm song song RetriV & VNF trên mọi
dòng, tô màu cả dòng theo Mức độ ưu tiên. Deadlines tự tính "còn lại/đã qua" theo ngày chạy script
và tô màu theo độ gấp. Scoring có conditional-formatting color-scale (đỏ→vàng→xanh) trên các cột
điểm. Links & Notes lưu link nguồn/quán quân. AI Automation Guide ghi lại toàn bộ quy tắc này để
lần chạy sau (hoặc một agent khác) đọc và tiếp tục ghi đúng chuẩn.

Dùng script đi kèm skill này, `scripts/log_scan_excel.py`, để ghi 1 dòng dữ liệu mới vào file log
này (mặc định: `output/Grant_Scan_Tracker_RetriV_VNF.xlsx`). Script tự tạo file mới với đủ 6 sheet
nếu chưa tồn tại, hoặc append thêm dòng vào Database/Scoring/Links & Notes nếu đã có (Dashboard và
Deadlines được **tính lại toàn bộ mỗi lần chạy** vì phụ thuộc ngày hiện tại + toàn bộ lịch sử scan)
— dữ liệu các lần scan trước luôn được giữ nguyên.

Quy trình:

1. Chuẩn hoá kết quả scan thành 1 file JSON theo đúng schema mô tả trong docstring đầu file
   `scripts/log_scan_excel.py` (mở file để xem chi tiết từng field trước khi viết JSON). Các field
   bắt buộc:
   - `ten_chuong_trinh` — luôn bắt buộc.
   - `retriv_scores` và `vnf_scores` — object 5 field (`khop_linh_vuc`, `doi_moi`, `tac_dong_mt`,
     `tiem_nang_qt`, `dat_giai`), thang 0–10, LUÔN điền cả 2 (không chỉ 1 công ty).
   - `de_xuat` — 🟢 GO / 🟡 MAYBE / 🔴 SKIP.
   - `ly_do` và `owner_follow_up` — **BẮT BUỘC** nếu `de_xuat` là MAYBE hoặc SKIP. Script sẽ
     **chặn và không ghi dòng** nếu thiếu 1 trong 2 field này khi Skip/Maybe — nếu gặp lỗi này,
     bổ sung lại lý do/owner rồi chạy lại, không tự ý xoá `de_xuat` để né lỗi.
   - `watchlist` — `true` nếu nên theo dõi vòng kế tiếp (hiện trên KPI Dashboard), `false` nếu
     loại vĩnh viễn.
   - `link_bao_cao` — đường dẫn tới file Word vừa tạo ở Bước 6a — không để trống.
2. Chạy:
   ```
   python3 scripts/log_scan_excel.py \
     --data entry.json \
     --output "<workspace>/output/Grant_Scan_Tracker_RetriV_VNF.xlsx"
   ```
3. Script tự thêm cột "Link báo cáo (Word)" dạng hyperlink trỏ tới đúng file — nếu đường dẫn
   trong `link_bao_cao` tồn tại trên máy, cell sẽ là link bấm được; nếu không, vẫn lưu path dạng
   text để user tự mở.
4. Sau khi script chạy xong, đọc lại nhanh dòng vừa thêm ở Database + Scoring + Dashboard (KPI đã
   cập nhật đúng chưa) để xác nhận dữ liệu đúng trước khi gửi file cho user.
5. Nếu script báo lỗi (thiếu `ly_do`/`owner_follow_up`, hoặc lệch số cột Database so với file
   log hiện có do schema đã đổi) — **dừng lại và báo cho user**, không tự sửa entry.json hay xoá
   dữ liệu cũ để né lỗi.

Nếu grant đang scan có tên trùng (hoặc gần trùng) với một dòng đã có sẵn trong file log, script sẽ
in cảnh báo ra ngoài (không tự ý bỏ qua) — báo cho user biết thay vì âm thầm tạo dòng trùng lặp,
hỏi họ có muốn ghi đè dòng cũ hay vẫn thêm dòng mới.

---

## Bước 7 — Kiểm tra QA (BẮT BUỘC, chạy sau Bước 6, trước khi báo "xong" với user)

**Đây là bước bắt buộc, không được bỏ qua dù báo cáo và Excel "nhìn có vẻ ổn".** Bước này tồn
tại vì đã từng xảy ra lỗi thực tế: sai đường dẫn `logo_path` khiến `add_cover_page()` âm thầm bỏ
qua logo VNF trên trang bìa mà không báo lỗi gì — chỉ phát hiện được khi user tự mở file lên xem.
QA tự động giúp bắt các lỗi kiểu "chạy không lỗi nhưng output sai" như vậy trước khi gửi cho user.

Chạy script đi kèm skill này, `scripts/qa_check.py`, ngay sau khi hoàn tất Bước 6a + 6b:

```
python3 scripts/qa_check.py \
  --report "<đường dẫn file .docx báo cáo 1>" \
  --report "<đường dẫn file .docx báo cáo 2>" \
  ...(lặp lại --report cho mỗi file Word vừa tạo trong lượt scan này)... \
  --excel "<workspace>/output/Grant_Scan_Tracker_RetriV_VNF.xlsx"
```

Script kiểm tra:
1. **Logo VNF có thực sự nhúng vào file Word không** (kiểm tra `word/media/` trong file .docx có
   ảnh hay không — không chỉ tin rằng code "chạy không lỗi" là logo đã hiện).
2. File Word có **Word TOC field thật** (placeholder "Nhấn F9 để cập nhật" là bình thường — user
   sẽ tự bấm F9 trong Word để cập nhật, không cần bake số trang trước bằng script), và đủ **8 mục
   nội dung** bắt buộc, không bị cắt cụt.
3. File Excel log: đủ 6 sheet, mọi dòng 🟡 MAYBE/🔴 SKIP đều có Lý do + Owner follow-up không
   rỗng, cột Link báo cáo không rỗng, không có tên chương trình trùng lặp chưa được xác nhận.

**Exit code 0 (QA PASS) mới được coi là hoàn tất và báo "xong" với user.** Nếu script trả về exit
code 1 (QA FAIL) — đọc danh sách lỗi in ra, sửa lại (ví dụ: sửa `logo_path`, chạy lại
`finalize.py`, bổ sung Lý do/Owner còn thiếu), rồi chạy lại `qa_check.py` cho đến khi PASS. Không
tự ý bỏ qua lỗi QA để "giao việc cho xong" — nếu không sửa được trong hợp lý, dừng lại và báo rõ
cho user vấn đề gì chưa qua QA.

Các cảnh báo (⚠️ WARN, ví dụ "Link báo cáo trỏ tới đường dẫn không tồn tại trên máy hiện tại")
không chặn PASS nhưng nên đọc qua — thường là dấu hiệu file đích chưa được copy vào đúng vị trí
cuối cùng (`output/reports/`), cần kiểm tra lại trước khi báo user.

**Chế độ B (Market Scan):** ngoài `--report`/`--excel` cho từng candidate deep-scan, thêm
`--market-excel "<đường dẫn Excel A vừa tạo ở Bước B5>"` vào lệnh `qa_check.py` để kiểm tra
nhanh Excel A có tồn tại và có dữ liệu (đây chỉ là cảnh báo nhẹ, không chặn PASS như Excel log
chính).

---

## Format nội dung báo cáo (dùng cho file Word ở Bước 6a)

**Mục lục là phần bắt buộc của báo cáo, đứng ngay sau trang bìa, trước Mục 1.** Dùng
`rb.add_h1("Mục lục", page_break_before=False)` rồi bảng placeholder TOC ngay dưới (không có
paragraph nào ở giữa) để `finalize.py` nhận diện và thay bằng Word TOC field thật. Field này sẽ
hiện text "Nhấn F9 để cập nhật" cho tới khi user tự mở file bằng Word và bấm F9 — đây là hành vi
chuẩn của Word, không cần chạy thêm bước nào để bake số trang trước. Bước 7 (QA) chỉ kiểm tra có
tồn tại TOC field thật hay không, không yêu cầu đã bake số trang.

Dùng đúng 8 mục nội dung theo thứ tự này (đứng sau Mục lục) — không thêm/bớt mục, kể cả khi một
mục không có nhiều nội dung (ghi "Không áp dụng" hoặc "Chưa rõ" thay vì xoá mục):

```
═══════════════════════════════════════════════
📋 GRANT SCAN REPORT — [Tên chương trình]
Dự án: [RetriV / VNF]   |   Ngày scan: [DD/MM/YYYY]
═══════════════════════════════════════════════

## 1. Thông tin cơ bản
- Nhà tài trợ: ...
- Funding: ...
- Deadline: ...
- Timeline: ...
- Website: ...
- Nguồn xác nhận: [Claude tự tìm / User cung cấp link]

## 2. Eligibility — Kiểm tra Hard-Stop
| Tiêu chí | Kết quả | Ghi chú |
|----------|---------|---------|
| Geography | ✅ Pass / ❌ Fail / ⚠️ Chưa rõ | ... |
| Entity type | ... | ... |
| TRL | ... | ... |
| IP | ... | ... |
| Deadline khả thi | ... | ... |
| Double-dipping | ... | ... |
| Giai đoạn dự án | ... | ... |

## 3. Chấm điểm chiến lược
| Tiêu chí | Điểm | Lý do |
|----------|------|-------|
| Strategic fit | .../5 | ... |
| Funding vs effort | .../5 | ... |
| Win probability | .../5 | ... |
| Deadline feasibility | .../5 | ... |
| Restrictions | .../5 | ... |
| Network value | .../5 | ... |
| **TỔNG** | **/30** | |

## 4. Challenge phù hợp nhất
- Track/challenge đề xuất: ...
- Lý do phù hợp: ...
- Track dự phòng (nếu có): ...
(hoặc "Không áp dụng — chương trình không chia track")

## 5. Yêu cầu hồ sơ
- Form: ...
- Attachments cần có: ...
- Word/character limit đáng chú ý: ...
- Rubric/criteria của ban giám khảo: ...

## 6. Đội thắng các mùa trước & Bài học cho RetriV/VNF
| Năm/Mùa | Đội/Dự án thắng | Lĩnh vực/Sản phẩm | Lý do thắng (theo BGK/thông cáo, nếu tìm được) |
|---------|-----------------|--------------------|-----------------------------------------------|
| ... | ... | ... | ... |

**Điểm chung giữa các đội thắng:** ...
**Bài học RetriV/VNF có thể rút ra:** ...
(Nếu tìm hiểu kỹ mà vẫn không có dữ liệu đội thắng công khai — ghi rõ "Đã search nhưng không tìm
thấy dữ liệu đội thắng công khai" thay vì bỏ trống mục này hoặc chỉ liệt kê tên suông)

## 7. Rủi ro & điểm cần lưu ý
...

## 8. ĐỀ XUẤT: [🟢 GO / 🟡 MAYBE → Nghiêng về GO/SKIP nếu [điều kiện] / 🔴 SKIP]

**Lý do chính:**
...

**Nếu GO (hoặc MAYBE nghiêng GO) — việc cần làm tiếp theo:**
- [ ] Team xác nhận quyết định Go chính thức
- [ ] Tạo calendar reminder: T-[X] tuần trước deadline [Date]
- [ ] Đăng nhập portal lấy câu hỏi application (nếu cần login)
- [ ] Team xác định: use of funds, KPI, budget, owner

**Nếu MAYBE — câu hỏi cần giải đáp trước khi quyết định:**
- ...

═══════════════════════════════════════════════
⚠️  Quyết định cuối cùng thuộc về team. Skill chỉ đề xuất.
📎 Đã ghi vào log: output/Grant_Scan_Tracker_RetriV_VNF.xlsx
═══════════════════════════════════════════════
```

---

## Nguyên tắc quan trọng

**Không bịa số liệu:** Nếu thông tin không có trên website (funding amount, eligibility
details...), ghi rõ "Chưa rõ — cần xác minh" và đưa vào danh sách "câu hỏi cần giải đáp" khi MAYBE.

**Không tự quyết thay team:** Dù điểm cao đến đâu, luôn kết thúc bằng nhắc nhở team xác nhận
quyết định.

**Ưu tiên eligibility trước:** Fail tiêu chí cứng → SKIP ngay, không cần chấm điểm.

**Past winners phải search kỹ, không liệt kê suông:** Mục 6 của báo cáo Word yêu cầu tìm tối
thiểu 2-3 mùa/năm gần nhất, nêu rõ năm/mùa, tên đội thắng, lĩnh vực, và lý do thắng nếu tìm được
— rồi rút ra bài học cụ thể cho RetriV/VNF. Nếu chỉ có tên đội mà không có gì để phân tích, đó là
dấu hiệu cần search thêm (báo chí, LinkedIn, press release) trước khi kết luận "không tìm thấy".

**Market Scan (Chế độ B) không thay thế Chế độ A:** Quét thị trường chỉ để tìm VÀ lọc sơ bộ ra
candidate đáng deep-scan — vẫn phải chạy đủ Bước 1-7 cho từng candidate được chọn, không được
rút gọn quy trình chỉ vì grant đó đến từ market scan thay vì user tự nêu tên.

**Market Scan không tự động deep-scan:** Sau khi xuất Excel A (danh sách candidate), LUÔN dừng lại
và hỏi user muốn deep-scan candidate nào (Bước B6) — không tự chọn top 5 hay bất kỳ số lượng nào
để chạy ngầm. Việc tạo báo cáo Word + ghi Excel log tốn thời gian và tài nguyên, nên chỉ chạy cho
đúng những candidate user đã xác nhận muốn xem sâu, tương tự cách Chế độ A luôn cần user nêu rõ
tên/link trước khi scan.

**MAYBE không phải SKIP:** MAYBE là khi thiếu thông tin hoặc cần người có chuyên môn xác nhận —
luôn nêu rõ đang nghiêng về GO hay nghiêng về SKIP và vì sao.

**Luôn hỏi nguồn trước khi scan:** Bỏ qua Bước 0 dễ dẫn đến scan nhầm trang (mùa/cohort cũ, tin
tức phụ, bản dịch không chính thức) — không được tự ý bỏ qua bước này trừ khi user đã đưa sẵn URL.

**File tracker gốc trong `input/` là bất khả xâm phạm:** Chỉ đọc để tham khảo cấu trúc cột khi
cần — không copy, không ghi đè, không tạo bản sao của file này. Toàn bộ output đi vào
`output/` (file log Excel riêng + thư mục `output/reports/` chứa các file Word).

**Luôn điền cột Link báo cáo:** Tạo file Word (Bước 6a) trước khi ghi Excel (Bước 6b), để có
đường dẫn thật điền vào cột "Link báo cáo (Word)" — không để trống cột này.

**Báo cáo Word BẮT BUỘC phải có Mục lục là Word TOC field thật** (không phải bảng/text giả lập) —
`finalize.py` tạo field này ngay sau `rb.save()`. Field sẽ hiện placeholder "Nhấn F9 để cập nhật"
cho tới khi user tự mở file trong Word và bấm F9 để cập nhật — đây là bước user tự làm, skill
không cần (và không) chạy thêm script nào để bake số trang trước khi gửi file.

**Luôn chấm điểm song song RetriV và VNF:** Mọi entry trong Excel log (sheet Database + Scoring)
phải có điểm 0–10 cho CẢ 2 công ty, kể cả khi báo cáo Word chỉ tập trung vào 1 dự án chính — mục
đích là để team so sánh mức độ phù hợp giữa RetriV và VNF trước khi quyết định đứng tên công ty
nào apply.

**Lý do và Owner follow-up là bắt buộc khi Skip/Maybe:** Không được để trống 2 cột này trong Excel
log nếu đề xuất là 🟡 MAYBE hoặc 🔴 SKIP — `scripts/log_scan_excel.py` sẽ tự chặn ghi dòng và báo
lỗi nếu thiếu, đây là chốt an toàn cuối để đảm bảo mọi quyết định loại bỏ đều có lý do rõ ràng và
người chịu trách nhiệm theo dõi (hoặc xác nhận rõ "không cần follow-up").

**QA (Bước 7) là bắt buộc, không phải "nice to have":** Không báo "xong" với user chỉ vì code chạy
không lỗi — phải chạy `scripts/qa_check.py` và nhận PASS (exit code 0) trước. "Chạy không lỗi"
không đồng nghĩa "output đúng" (ví dụ: logo có thể âm thầm không hiện ra dù `add_cover_page()`
không báo exception gì) — QA là lớp kiểm tra độc lập với chính output đã tạo ra, không phải kiểm
tra lại logic code.
