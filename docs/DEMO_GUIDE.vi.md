# Tự hiểu và demo ApplyFlow

## Demo trong khoảng 3 phút

1. Mở ứng dụng và chọn **Dùng thử với dữ liệu mẫu**. Nói rõ các công ty, vị trí và việc chuẩn bị là dữ liệu hư cấu; mỗi người xem có một không gian riêng.
2. Xem tổng quan: số hồ sơ theo từng bước, việc sắp đến hạn và hoạt động gần đây. Ứng dụng hiển thị hạn trong trang, chưa gửi email nhắc việc.
3. Mở **Hồ sơ ứng tuyển**, tìm Nori Studio rồi mở chi tiết. Chuyển trạng thái, ghi chú và thêm một việc có hạn hoàn thành.
4. Sang **Việc cần làm**, đánh dấu hoàn thành rồi lọc việc đã xong. Quay lại hồ sơ để thấy thay đổi vẫn được lưu.
5. Chuyển bảng/cột và thử xuất CSV. File xuất theo danh sách đã lọc; dữ liệu nhạy cảm của tài khoản không nằm trong mã nguồn GitHub.
6. Mở ứng dụng bằng màn hình điện thoại hoặc điều hướng biểu mẫu bằng bàn phím. Đăng xuất khi kết thúc.

## Các câu hỏi nên tự trả lời được

- Vì sao chọn SQLite? Database nằm ở đâu và điều gì xảy ra nếu host xóa ổ lưu trữ tạm?
- Vì sao kiểm tra quyền ở API thay vì chỉ ẩn nút trên giao diện? Một người dùng nhập ID của người khác sẽ nhận gì?
- Cookie HttpOnly, CSRF token và kiểm tra Origin giải quyết những vấn đề nào?
- Nếu hai tab sửa cùng một hồ sơ, số phiên bản giúp ngăn mất thay đổi ra sao?
- Xóa hồ sơ ảnh hưởng các việc liên quan và bản ghi hoạt động thế nào?
- Vì sao file CSV cần xử lý giá trị bắt đầu bằng `=`, `+`, `-` hoặc `@`?
- Những tính năng nào chưa có: email, khôi phục mật khẩu, thông báo ngoài trang, nhiều máy chủ?

## Cách giới thiệu trung thực trong CV

Chỉ dùng nội dung dưới đây khi bạn đã chạy, đọc và có thể giải thích dự án:

> ApplyFlow — dự án theo dõi ứng tuyển/thực tập với React, TypeScript, Express và SQLite. Xây dựng luồng tài khoản, quản lý hồ sơ/việc chuẩn bị, phân quyền theo chủ sở hữu, bảo vệ yêu cầu bằng cookie/CSRF và kiểm tra cập nhật xung đột. Viết kiểm thử API cho xác thực, quyền truy cập và tính toàn vẹn dữ liệu; thực hiện production build.

Không thêm số người dùng, tỷ lệ tăng hiệu quả hoặc kinh nghiệm triển khai thương mại nếu chưa có bằng chứng. Dự án có hỗ trợ AI; phần quan trọng khi phỏng vấn là hiểu, tự chỉnh sửa và giải thích được quyết định trong mã nguồn.
