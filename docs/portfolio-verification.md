# Kiểm chứng portfolio — 03/11/2026

## Thay đổi

- Giữ nguyên source nghiệp vụ, schema SQLite và MIT License.
- Cập nhật lockfile trong giới hạn phiên bản đã khai báo để xử lý các cảnh báo npm.
  `npm audit` trước cập nhật báo 7 cảnh báo; sau cập nhật báo 0 tại thời điểm kiểm tra.
  Đây là kết quả cơ sở dữ liệu advisories, không phải chứng nhận không có lỗ hổng.
- Cho phép Prettier nhận diện kiểu xuống dòng hiện có (`endOfLine: auto`), để
  `format:check` hoạt động cả với checkout CRLF trên Windows mà không đổi hàng loạt source.
- Chụp lại ảnh lịch desktop/mobile từ bản build thật qua bộ kiểm thử trình duyệt;
  dữ liệu trong ảnh là fixture hư cấu của `e2e/browser.mjs`.

## Đã chạy trên Windows, Node.js 24.19.0

```powershell
npm ci
npm run check
npm run format:check
npx playwright install chromium
npm run test:browser
npm audit
```

TypeScript, 25 bài API/logic, build và kiểm tra định dạng đều vượt qua.
Ba bài trình duyệt Chromium vượt qua, gồm tải lịch thật từ màn hình công việc,
mobile 390 px, ngày ở múi giờ xa Việt Nam, tách tài khoản và hết hạn phiên.
Các bài dùng Express và SQLite local riêng; không tạo dữ liệu trên hosting.

Ảnh mới: `docs/screenshots/calendar-desktop.png` và `calendar-mobile.png`.
Chúng đã được xem lại để kiểm tra nội dung và bố cục. Các ảnh JPG khác là ảnh đã có,
không được trình bày là vừa chụp trong đợt này.

## Hosting và giới hạn

`https://giang-applyflow.onrender.com` trả HTTP 200, tiêu đề đúng ApplyFlow;
`GET /api/health` trả 200 với `{"status":"ok"}`.
Chưa kiểm tra lại luồng ghi dữ liệu, cookie production, đăng nhập hoặc Render logs
trên hosting trong đợt này. Chưa chạy Docker vì môi trường không có Docker.
Ảnh và E2E local không chứng minh bản hosting đang chạy cùng commit.

SQLite của bản Render Free là dữ liệu tạm, có thể mất khi service được tạo lại.
Xem [render-free.md](render-free.md) và [deployment.md](deployment.md) trước khi dùng
để lưu hồ sơ thật. Hệ thống chưa gửi hồ sơ đến nhà tuyển dụng, đồng bộ lịch hai chiều
hoặc gửi email nhắc việc.
