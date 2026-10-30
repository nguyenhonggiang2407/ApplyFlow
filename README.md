# ApplyFlow

<img src="client/public/logo.svg" width="56" height="56" alt="ApplyFlow" />

Ứng dụng theo dõi hồ sơ thực tập và việc cần chuẩn bị cho mỗi lần ứng tuyển.
Giao diện tiếng Việt, dùng React, TypeScript, Express và SQLite.

## Chức năng

- Lưu công ty, vị trí, hạn ứng tuyển, ghi chú và trạng thái hồ sơ.
- Theo dõi hồ sơ ở dạng bảng hoặc các cột Saved, Applied, Interview, Offer và Closed.
- Tạo việc cần làm cho từng hồ sơ, đánh dấu hoàn thành và xem lịch sử thay đổi.
- Tìm kiếm, lọc và xuất danh sách đang xem ra CSV.
- Đăng ký tài khoản riêng hoặc mở một không gian dùng thử với dữ liệu mẫu.

## Chạy ở máy cá nhân

Cần Node.js 24 trở lên vì backend dùng module `node:sqlite`.

```bash
npm ci
cp .env.example .env
npm run dev
```

Trên PowerShell, thay lệnh sao chép bằng `Copy-Item .env.example .env`.
Mở http://127.0.0.1:5173. Vite chuyển các yêu cầu `/api` đến backend ở cổng 3001.

Nút **Dùng thử với dữ liệu mẫu** tạo một không gian riêng, gồm các hồ sơ và công ty hư cấu.
Tài khoản đăng ký mới bắt đầu với danh sách trống.
Dữ liệu được lưu ở `data/applyflow.sqlite` và còn lại sau khi khởi động lại ứng dụng.

## Kiểm tra và build

```bash
npm run check
npm run format:check
```

`check` chạy kiểm tra TypeScript, kiểm thử API và build. Để chạy bản đã biên dịch:

```bash
npm run build
npm start
```

Khi chạy trực tiếp ở cổng 3001, đặt `APP_ORIGIN=http://127.0.0.1:3001` trong `.env`.
Cấu hình HTTPS, cookie và lưu trữ khi đưa lên host được ghi trong [hướng dẫn triển khai](docs/deployment.md).

## Cấu trúc

- `client/src/`: giao diện, biểu mẫu, bảng hồ sơ và việc cần làm.
- `server/src/`: API, xác thực, kiểm tra dữ liệu và truy vấn SQLite.
- `shared/types.ts`: kiểu dữ liệu và trạng thái dùng chung.
- `tests/`: kiểm thử API và xử lý yêu cầu từ client.

API kiểm tra chủ sở hữu của hồ sơ và công việc. Mật khẩu được băm bằng scrypt;
phiên đăng nhập dùng cookie HttpOnly và các thao tác ghi cần CSRF token.
Mỗi lần sửa hồ sơ có số phiên bản để phát hiện hai tab cùng sửa một bản ghi.

## Tài liệu

- [Kiến trúc và API](docs/architecture.md)
- [Cấu hình và triển khai](docs/deployment.md)
- [Cách dùng thử](docs/demo.md)

Ứng dụng hiện hiển thị hạn công việc trong trang, chưa gửi email nhắc việc.
Bản này chạy một tiến trình Node với SQLite trên ổ lưu trữ cố định.

## Hình ảnh

![Giao diện máy tính](docs/screenshots/desktop.jpg)

![Giao diện điện thoại](docs/screenshots/mobile.jpg)

## Giấy phép

Mã ứng dụng và logo dùng [MIT License](LICENSE). Thư viện bên ngoài giữ giấy phép riêng.
