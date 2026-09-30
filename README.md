# KPI Môi giới — bản demo giao diện

Trang tĩnh, không build, không server, không CDN. Mở `index.html` là chạy.

> **Số liệu trong trang là DỮ LIỆU GIẢ** — sinh tự động để trình diễn giao diện,
> không phải số liệu thật của bất kỳ khách hàng hay môi giới nào. Nguồn quy ước
> là văn bản chính sách **DRAFT** (Chính sách KD TVĐT&QLTS 18.8.2026 — Quyết định
> và ngày hiệu lực còn trống).

## Mở trang

```
index.html
```

Không cần mạng. Chart.js 4.4.7 nằm sẵn ở `vendor/chart.umd.js`.

## 5 màn hình

| Tab | Nội dung |
|---|---|
| Phòng của tôi | Cây quản lý + KPI cấp phòng |
| Chi tiết môi giới | FKP theo 3 nhóm doanh thu, bảng khách hàng |
| KPI của tôi | Điểm đạt / điểm chuẩn, 6 tỷ trọng chấm điểm |
| Tổng hợp khối | So sánh 4 khối, 6 biểu đồ |
| Hoa hồng & PQL | Tạm tính 6 ô + HH phí giao dịch + HHDN + PQL theo vai trò |

## Ô TẠM TÍNH (6 ô, màn Hoa hồng & PQL)

Mỗi khoản thu một ô riêng, số lớn 22px, đơn vị **triệu đồng**:

```
Lương cấp bậc · Thưởng hiệu suất · Hoa hồng phí giao dịch
Hoa hồng dư nợ · Phí quản lý · TỔNG TẠM TÍNH
```

**Lương cấp bậc và thưởng hiệu suất** lấy từ Phụ lục 02 — Chính sách KD TVĐT&QLTS
18.8.2026 (bảng 15–20, cột `Lương cấp bậc` và `Thưởng hiệu suất*`). Văn bản **không
ghi đơn vị** cho cột này; đơn vị **triệu đồng** do PTSP chốt 30/09/2026.

- Thưởng hiệu suất phát khi `ty_le_hoan_thanh >= 1,0`; dưới ngưỡng = 0.
- `GĐ TVĐT` không có số trong Phụ lục 02 → hiện `—`, hoa hồng vẫn tính bình thường.
- Môi giới thường không phát sinh phí quản lý (PL03) → hiện `0` kèm ghi chú.

## Công thức FKP (PTSP chốt 30/09/2026)

| Khoản | Hệ số |
|---|---|
| Phí Net giao dịch CK cơ sở | 10 điểm / 1.000.000 VNĐ |
| Doanh thu lãi vay GDKQ/SP tương đương | 1 điểm / 1.000.000 VNĐ |
| Doanh số phân phối Trái phiếu DN | 10 điểm / 100.000.000 VNĐ |

Đơn vị 3 khoản **khác nhau** — trái phiếu phải chia 100 trước khi nhân.

## Cấu trúc

```
index.html            khung trang, thứ tự <script> có ý nghĩa
style.css             toàn bộ giao diện
app.js                khung chung, đăng ký màn hình
data.js               window.KPI  (mock KPI)
kh-data.js            window.KH   (khách hàng + điểm chuẩn)
hh-data.js            window.HH   (hoa hồng, PQL, cây quản lý)
screen-*.js           từng màn một file
vendor/chart.umd.js   Chart.js 4.4.7
```

`hh-data.js` phải nạp trước `screen-hoahong.js`. `app.js` phải có mặt trước các
module màn hình vì chúng tự đăng ký vào `App`.

## Điểm mở của chính sách

Màn Hoa hồng & PQL có mục **Điểm mở** liệt kê các điểm chưa chốt trong văn bản
(giới hạn trả phí quản lý, điều kiện KPI, tỷ lệ đối tác…). Đây là những chỗ văn bản
chưa quy định — hiển thị để không ai hiểu nhầm là đã chốt.

## Lưu ý kỹ thuật

- Dữ liệu nằm trong các file `.js` dạng `window.X = {...}` — mở bằng `file://` được,
  không cần web server.
- Mọi hệ số, điểm chuẩn, tỷ trọng, bảng lương đều nằm trong `data/kpi_config.json`
  khi sinh dữ liệu, nhúng vào các file `.js` ở trên. UI **không hardcode** — đổi cấu
  hình thì chạy lại generator, không sửa tay màn hình.
