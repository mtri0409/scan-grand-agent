# Unused / Legacy Code

Các file trong thư mục này là bản nháp kiến trúc ReAct-agent cũ, không được `graph.ts` import hay sử dụng trong luồng chính.

Đã được thay thế bởi StateGraph cố định trong `src/graph.ts` với các node riêng lẻ (`classify.ts`, `research_grant.ts`, `score_and_select_track.ts`, ...).

- `agent.ts`, `human.ts`, `conditions.ts`, `tools.ts`: ReAct loop cũ.
- `definitions.ts`: Zod schemas cho tool definitions của ReAct-agent.
- `instructions.ts`: Bản tóm tắt `SKILL.MD` dưới dạng prompt string — `SKILL.MD` vẫn là nguồn chuẩn.

Giữ lại để tham khảo, có thể xóa khi chắc chắn không cần.
