# TỌA ĐỘ Việt Nam · CSV → Excel (10.000 địa chỉ)

Ứng dụng web tĩnh, giao diện tiếng Việt. Giữ nguyên các tệp Streamlit/shapefile Đài Loan của repository để không làm hỏng công việc cũ.

**Trang web:** https://base27-cvnss.github.io/toado/ (cần bật GitHub Pages → Deploy from branch → main / root).

## Sử dụng

1. Mở trang, tải CSV (tối đa **10.000 dòng dữ liệu**, có tiêu đề). Hỗ trợ UTF-8/UTF-8 BOM, dấu phẩy hoặc chấm phẩy.
2. Ứng dụng tự nhận cột \`dia_chi\`, \`địa chỉ\`, \`address\`; cũng đọc cột \`lat\`/\`latitude\` và \`lon\`/\`longitude\` có sẵn.
3. Kết quả tự chạy; có tiến độ, bộ lọc chất lượng, dừng, chạy lại và **Xuất Excel (.xlsx)**.

Excel gồm \`Ket_qua\`, \`Can_kiem_tra\`, \`Thong_ke\`, \`Nguon_du_lieu\`. Giữ cột CSV gốc, thêm vĩ/kinh độ WGS84, tên và mã tỉnh/xã theo danh mục 2025, loại tọa độ, nguồn, độ tin cậy (nếu API cung cấp), ghi chú, liên kết bản đồ.

### QUAN TRỌNG: phân biệt tọa độ địa chỉ và điểm đại diện

Không thể suy ra vị trí chính xác của nhà/số đường từ tên xã, tỉnh. Ứng dụng **không giả mạo geocode**:

- Có lat/lon hợp lệ trong CSV → bảo toàn với nguồn \`CSV\`.
- Có API riêng → geocode địa chỉ và ghi nguồn \`API\`.
- Chưa có API nhưng khớp rõ tên xã → dùng **điểm tham chiếu cấp xã**, ghi chú _không phải vị trí nhà_.
- Nếu chỉ khớp tỉnh → dùng **điểm tham chiếu cấp tỉnh**, ghi chú độ chính xác thấp.
- Không đủ dữ kiện → để trống tọa độ, đưa vào \`Can_kiem_tra\`.

Đối chiếu tên xã/tỉnh bằng chuỗi không thay thế kiểm tra GIS point-in-polygon. Không khẳng định đơn vị hành chính từ tọa độ đầu vào nếu chưa có lớp ranh giới.

## Hành chính Việt Nam 2025

Dữ liệu [Open Admin Data](https://github.com/open-admin-data/vietnam-administrative-divisions) (CC BY 4.0), 34 tỉnh/thành và 3.321 xã/phường sau 01-07-2025. Tải qua HTTPS từ GitHub khi mở web và được cache theo trình duyệt. Tham chiếu pháp lý: [Quyết định 19/2025/QĐ-TTg](https://baochinhphu.vn/bang-danh-muc-va-ma-so-cua-34-tinh-thanh-moi-3321-don-vi-hanh-chinh-cap-xa-moi-102250704153652947.htm). Trước khi dùng chính thức cần kiểm tra thay đổi danh mục sau thời điểm dữ liệu.

## Geocoding thực địa cho 10.000 địa chỉ

GitHub Pages chỉ là hosting tĩnh; để tự động định vị đến số nhà trên quy mô lớn phải cấu hình dịch vụ geocoding riêng có quota phù hợp. Không tích hợp Nominatim công cộng để chạy batch 10.000 địa chỉ vì [chính sách OSMF](https://operations.osmfoundation.org/policies/nominatim/) không cho phép dùng kiểu này. Mã mẫu Cloudflare Worker + Geoapify đặt tại \`worker/\`; **chưa triển khai và chưa có API key mặc định**.

Ví dụ với Wrangler (cài Node/npm trước):
\`\`\`sh
cd worker
npx wrangler secret put GEOAPIFY_API_KEY
npx wrangler deploy
\`\`\`
Sau đó mở **Cấu hình dịch vụ định vị địa chỉ chi tiết** trên trang web và điền endpoint \`https://<worker>.workers.dev/api/geocode\`. Quản trị viên cần tự bảo vệ Worker bằng quota, hạn mức tài khoản, WAF/rate limiting, giới hạn domain \`ALLOWED_ORIGIN\`, theo dõi chi phí và các điều khoản provider. Trình duyệt xử lý tuần tự và áp dụng giãn cách request do người vận hành lựa chọn. Không chèn secret trực tiếp vào HTML/JS.

**Quyền riêng tư:** CSV không tự tải lên GitHub. Nếu bật API, nội dung trường địa chỉ sẽ chuyển đến máy chủ đã cấu hình và nhà cung cấp geocoding. Không gửi dữ liệu cá nhân nếu chưa có căn cứ hợp lệ.

## Kiểm thử thủ công

- Tải \`sample.csv\`; kiểm tra 4 dòng có kết quả khác nhau và không được gán tọa độ nhà cho điểm hành chính.
- Tải CSV có \`latitude,longitude\`; đảm bảo tọa độ gốc không bị thay thế.
- Tải CSV có 10.000 dòng; kiểm tra bộ lọc preview tối đa 100 dòng, Excel đầy đủ số dòng.
- Tải CSV 10.001 dòng; ứng dụng phải từ chối rõ ràng.
- Tạm tắt mạng: CSV có tọa độ vẫn xử lý, báo lỗi thiếu danh mục/ExcelJS nếu thư viện chưa tải.
- Với API riêng: kiểm tra 429, mạng đứt, địa chỉ trùng, API không tìm được, dừng giữa chừng.

Phần HTML/JS mới không ghi đè mã nguồn Python gốc. Long Ngo 2026.
