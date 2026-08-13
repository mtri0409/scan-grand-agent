# Manual Test Flows

File này dùng để user tự test thủ công các luồng interrupt hiện tại.

## Cách chạy

```bash
npm run dev -- "<input>"
```

Khi graph dừng ở interrupt, nhập câu trả lời theo prompt.

## Case 1: Input mơ hồ

Input:

```text
scan grant
```

Expected:

```text
=== DỪNG CHỜ USER ===
Bạn đã có tên/link grant cụ thể muốn scan, hay muốn mình tìm giúp các grant đang có trên thị trường theo một chủ đề nào đó?
```

User trả lời:

```text
Tìm grant foodtech cho RetriV
```

Sau đó graph tiếp tục tới market scan và sẽ dừng ở bước chọn candidate.

## Case 2: Market scan, không chọn candidate

Input:

```text
Tìm grant foodtech cho RetriV
```

Expected:

```text
=== DỪNG CHỜ USER ===
Bạn chọn candidate nào để deep-scan? (nhập STT hoặc tên, cách nhau bằng dấu phẩy, hoặc 'không' nếu chưa cần).
```

User trả lời:

```text
không
```

Expected kết quả cuối:

```text
Không có candidate nào được chọn. Kết thúc tại Excel A.
```

## Case 3: Market scan, chọn candidate

Input:

```text
Tìm grant foodtech cho RetriV
```

User trả lời tại prompt chọn candidate:

```text
1
```

Expected:

```text
Deep-scan candidate: <tên candidate đầu tiên>
```

## Case 4: Scan grant cụ thể nhưng chưa có link

Input:

```text
Green Food Grant 2026
```

Expected:

```text
=== DỪNG CHỜ USER ===
Bạn chỉ nêu tên chương trình. Bạn muốn tôi tự tìm website chính thức hay bạn sẽ gửi link cụ thể? (trả lời 'tự tìm' hoặc dán link)
```

User trả lời:

```text
tự tìm
```

Sau đó graph sẽ tiếp tục sang `find_official_site`.

## Case 5: Scan grant cụ thể có link

Input:

```text
Scan grant https://example.com/green-food-grant-2026 Green Food Grant 2026
```

Expected:

```text
Không cần interrupt ở `resolve_source`
```
