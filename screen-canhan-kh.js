/* =============================================================================
 * screen-canhan-kh.js — 3 KHỐI KPI CÁ NHÂN cho màn hình MH03 "KPI của tôi"
 * -----------------------------------------------------------------------------
 * Bổ sung vào ScreenCanhan.render() (gọi qua window.CanhanKH.augment()).
 * File RIÊNG, không sửa screen-canhan.js — giữ màn hình cũ nguyên vẹn.
 *
 * Ba khối (theo yêu cầu 28/09/2026):
 *   1. FKP đến từ khách hàng nào   → cột ngang XẾP CHỒNG top-N theo 5 nhóm
 *                                   khoản thu + vòng tròn cơ cấu điểm theo
 *                                   5 NHÓM DOANH THU
 *   2. Chi tiết theo từng khách hàng → bảng 3 nhóm khoản thu, lọc + sắp xếp
 *   3. Tăng trưởng so với kỳ trước  → cột kỳ trước + đường kỳ này
 *
 * Ràng buộc số liệu (SPEC.md §6b):
 *   - TỔNG diem_phi của môi giới trong kỳ = ĐÚNG điểm FKP ở MH01/MH02
 *   - diem_phi là ĐIỂM; các *_trieu là TRIỆU ĐỒNG. Quy đổi sang điểm dùng
 *     hệ số RIÊNG của từng nhóm và đúng đơn vị của nhóm đó (PTSP chốt
 *     30/09/2026): phí giao dịch × 10 điểm/triệu, lãi vay × 1 điểm/triệu,
 *     phí trái phiếu × 10 điểm/100 triệu.
 *   - ty_le là TỶ LỆ (0,05 = +5%), kỳ trước = 0 thì "mới phát sinh", không chia
 *   - aum_trieu = 0 là khách không có dư nợ, không phải lỗi dữ liệu
 *   - chỉ hiện khách của CHÍNH môi giới đang xem, không có dữ liệu người khác
 * ========================================================================== */
(function (global) {
  'use strict';

  var DASH = '—';
  var TOP_N = 10;              /* số khách hiện trên cột ngang */
  var NHOM = [                 /* 3 nhóm khoản thu, thứ tự cố định (đã loại bỏ phí dịch vụ & phí khác).
                               * dv = ĐƠN VỊ QUY ĐỔI của khoản: phí/lãi tính theo
                               * TRIỆU, trái phiếu theo 100 TRIỆU (PTSP 30/09/2026). */
    { k: 'phi_giao_dich', ten: 'Phí giao dịch (triệu VNĐ)',  f: 'phi_giao_dich_trieu',  c: '--chart-series-1', dv: 1 },
    { k: 'lai_vay',       ten: 'Lãi vay (triệu VNĐ)',        f: 'lai_vay_trieu',        c: '--chart-series-2', dv: 1 },
    { k: 'phi_traiphieu', ten: 'Phí trái phiếu (triệu VNĐ)', f: 'phi_traiphieu_trieu',  c: '--chart-series-3', dv: 100 }
  ];

  /* Trạng thái riêng của 3 khối (giữ khi đổi kỳ / đổi người) */
  var st = { sort: 'diem_phi', dir: -1, loai: '', top: TOP_N, q: '' };
  /* Phân trang bảng chi tiết KH — pattern screen-duno.js.
     TRANG=40 ≥ MAX_KH_ROWS (30) nên mọi row luôn nằm 1 trang;
     pager chỉ hiện khi danh sách LỌC > 40 row (mg03 section C đọc
     tbody tr nên phải thấy đủ mọi row). */
  var TRANG = 40;
  var stTrang = { page: 1 };

  /* TỔNG doanh thu / tổng điểm hiển thị NGOÀI biểu đồ (#khkC1-tong).
   * tong1 = [{ten, tongTien, tongDiem}] theo ĐÚNG thứ tự labels của khkC1;
   * tong1Ten/nhoặc tong1Def = nhãn + số của trạng thái mặc định (tổng top-N).
   * Rê chuột thì nhãn này đổi sang tổng của đúng khách đang chỉ. */
  var tong1 = [];
  var tong1DefTen = '';
  var tong1DefTien = 0;
  var tong1DefDiem = 0;

  /* ============================================================== helpers */
  function A() { return global.App || null; }
  function CH() { return global.KPICharts || null; }
  function KHD() { return global.KH || null; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, d) {
    if (!isNum(v)) return DASH;
    return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function n1(v) { return num(v, 1); }
  function n0(v) { return num(v, 0); }
  function n2(v) { return num(v, 2); }

  /* Điểm PHẢI là số nguyên ≥ 0 để vẽ; dữ liệu rỗng → 0 (chart tự hiện empty) */
  function px(v) { return isNum(v) && v > 0 ? v : 0; }

  /* Hệ số quy đổi SANG ĐIỂM FKP — PTSP chốt 30/09/2026
   * (data/kpi_config.json → window.KH, kh-data.js):
   *     phí giao dịch × 10 điểm / 1 triệu
   *     lãi vay       ×  1 điểm / 1 triệu
   *     phí trái phiếu × 10 điểm / 100 triệu  ← ĐƠN VỊ KHÁC
   *   ⇒ diem = Σ( khoản ÷ đơn vị của khoản × hệ số của khoản )
   *
   * Đọc từ App.thamSo (nguồn UI) trước, thiếu mới đọc window.KH. KHÔNG có
   * số mặc định: thiếu hệ số thì hệ số = null, điểm của nhóm đó không tính
   * và UI báo lỗi — không bao giờ tự điền 1 / 0,1 / 10.
   */
  function heSoThamSo(ten) {
    var a = A();
    var ts = (a && a.thamSo) ? a.thamSo : ((global.KPI && global.KPI.tham_so) || null);
    if (ts && isNum(ts[ten]) && ts[ten] > 0) return ts[ten];
    var k = KHD();
    if (k && isNum(k[ten]) && k[ten] > 0) return k[ten];
    return null;
  }
  function heSoPhi() { return heSoThamSo('he_so_phi_1trieu'); }
  function heSoLai() { return heSoThamSo('he_so_lai_1trieu'); }
  function heSoTp() { return heSoThamSo('he_so_tp_100trieu'); }

  /* HỆ SỐ DUY NHẤT cho từng nhóm khoản thu — cả 3 chỗ dùng (bảng tăng
     trưởng, bộ dữ liệu biểu đồ C3, điểm 1 khách) đều gọi hàm này. Đổi thang
     quy đổi sau này chỉ cần sửa 1 chỗ. 'tong' đã là ĐIỂM nên hệ số = 1. */
  function heSoNhom(tenNhom) {
    if (tenNhom === 'tong') return 1;
    if (tenNhom === 'lai_vay') return heSoLai();
    if (tenNhom === 'phi_traiphieu') return heSoTp();
    return heSoPhi();
  }

  /* Hệ số thiếu trong tham số → thông báo lỗi ngắn cho người dùng, đặt trong
     mảng để các chỗ gọi gom lại in ra đúng một lần. */
  var loiHeSo = [];
  function ghiLoiHeSo(tenNhom) {
    var ten = (tenNhom === 'lai_vay') ? 'he_so_lai_1trieu'
            : (tenNhom === 'phi_traiphieu') ? 'he_so_tp_100trieu'
            : 'he_so_phi_1trieu';
    var s = 'Thiếu hệ số quy đổi ' + ten + ' trong tham số — nhóm "' + tenNhom +
            '" không tính điểm FKP cho tới khi bổ sung.';
    if (loiHeSo.indexOf(s) < 0) loiHeSo.push(s);
  }
  function resetLoiHeSo() { loiHeSo = []; }
  function canhBaoHeSoHTML() {
    if (!loiHeSo.length) return '';
    return '<div class="cn-alert bad"><span class="cn-ic">!</span><div>' +
           loiHeSo.join(' ') + '</div></div>';
  }

  /* Doanh thu (triệu) của 1 khách theo 1 nhóm; thiếu/không phải số → 0 */
  function tienNhom(r, f) { return isNum(r && r[f]) ? r[f] : 0; }

  /* ĐƠN VỊ QUY ĐỔI của 1 nhóm (triệu). Trái phiếu = 100, phí/lãi = 1. */
  function donViNhom(tenNhom) {
    for (var i = 0; i < NHOM.length; i++) if (NHOM[i].k === tenNhom) return NHOM[i].dv;
    return 1;
  }

  /* ĐIỂM của 1 khách theo 1 nhóm = tiền(triệu) ÷ đơn vị × hệ số.
     Đây là con số DUY NHẤT được dùng cho cả vòng tròn và cột xếp chồng, để
     tổng các lát luôn cộng lại đúng bằng tổng điểm khách.
     Thiếu hệ số → KHÔNG tự điền số: nhóm đó ra 0 điểm và ghi lỗi để hiện. */
  function diemNhom(r, n) {
    var hs = heSoNhom(n.k);
    if (!isNum(hs)) { ghiLoiHeSo(n.k); return 0; }
    return tienNhom(r, n.f) / donViNhom(n.k) * hs;
  }

  /* Tổng điểm 5 nhóm của 1 khách. */
  function diemNhomTong(r) {
    var s = 0;
    for (var i = 0; i < NHOM.length; i++) s += diemNhom(r, NHOM[i]);
    return s;
  }

  /* Tổng doanh thu (triệu) của 1 khách. */
  function doanhThuTong(r) {
    var s = 0;
    for (var i = 0; i < NHOM.length; i++) s += tienNhom(r, NHOM[i].f);
    return s;
  }

  /* Gom điểm theo các nhóm khoản thu cho cả danh sách khách. */
  function gomNhom(rs) {
    var v = [];
    for (var i = 0; i < NHOM.length; i++) v.push(0);
    for (var j = 0; j < rs.length; j++) {
      for (var k = 0; k < NHOM.length; k++) v[k] += diemNhom(rs[j], NHOM[k]);
    }
    return v;
  }

  /* Gom DOANH THU THUẦN (triệu VNĐ) theo 3 nhóm khoản thu cho cả danh sách khách. */
  function gomNhomTien(rs) {
    var v = [];
    for (var i = 0; i < NHOM.length; i++) v.push(0);
    for (var j = 0; j < rs.length; j++) {
      for (var k = 0; k < NHOM.length; k++) v[k] += tienNhom(rs[j], NHOM[k].f);
    }
    return v;
  }

  function kyLabel(kyId) {
    var d = KHD() && KHD().danh_sach_ky;
    if (!d) return kyId || DASH;
    for (var i = 0; i < d.length; i++) if (d[i].ky_id === kyId) return d[i].nhan;
    return kyId || DASH;
  }

  /* Kỳ liền trước: sắp theo ngày, KHÔNG đoán vị trí mảng (danh_sach_ky của
   * mock_data.json và của gen_kh_data.py sort NGƯỢC chiều nhau). */
  function kyPrevId(kyId) {
    var d = (KHD() && KHD().danh_sach_ky) || [];
    if (!d.length) return null;
    var srt = d.slice().sort(function (a, b) {
      return String(a.tu_ngay) < String(b.tu_ngay) ? -1 : 1;
    });
    for (var i = 0; i < srt.length; i++) {
      if (srt[i].ky_id === kyId) return i > 0 ? srt[i - 1].ky_id : null;
    }
    return null;
  }

  function loaiTen(ma) {
    var d = (KHD() && KHD().loai_khach_hang) || [];
    for (var i = 0; i < d.length; i++) if (d[i].ma === ma) return d[i].ten;
    return ma || DASH;
  }

  function rows(maMg, kyId) {
    var a = A();
    if (a && typeof a.khTheoKy === 'function') return a.khTheoKy(maMg, kyId) || [];
    var k = KHD();
    return (k && k.theo_ky && k.theo_ky[maMg] && k.theo_ky[maMg][kyId]) || [];
  }

  function tongHop(maMg) {
    var a = A();
    if (a && typeof a.khTongHop === 'function') {
      var t = a.khTongHop(maMg);
      if (t) return t;
    }
    var k = KHD();
    return (k && k.tang_truong && k.tang_truong[maMg]) || null;
  }

  /* ================================================================== CSS */
  var STYLE_ID = 'kpi-style-canhan-kh';
  var CSS = [
    '#screen-canhan .khk-sec{margin-top:var(--sp-5,20px);}',
    '#screen-canhan .khk-grid{display:grid;gap:var(--sp-3,12px);',
    '  grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);}',
    '@media (max-width:1080px){#screen-canhan .khk-grid{grid-template-columns:minmax(0,1fr);}}',
    /* Nhãn phụ của biểu đồ nhỏ quá trên nền tối — nâng lên đọc được */
    '#screen-canhan .chart-box-sub{font-size:12.5px;color:var(--muted);line-height:1.5;}',
    '#screen-canhan .chart-box-title{font-size:14.5px;}',
    /* Bảng chi tiết khách — migration .table + .tbl-chuan (28/10):
       width/border-collapse/padding/sticky thead+num right/hover/
       sticky tfoot/sortable ▲▼ đều do .table/.tbl-chuan đảm nhận.
       GIỮ LẠI: khung cuộn + reset sticky cột 1/2 (bảng này KHÔNG
       dính cột ID như .table mặc định — cột # hẹp, tên tự co)
       + khk-ma/kh-rank riêng màn. */
    '#screen-canhan .khk-tblwrap{overflow:auto;max-height:440px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  overscroll-behavior:contain;scrollbar-width:thin;',
    '  scrollbar-color:var(--border-strong) transparent;}',
    '#screen-canhan .khk-tblwrap::-webkit-scrollbar{width:10px;height:10px;}',
    '#screen-canhan .khk-tblwrap::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:var(--radius-pill);}',
    '#screen-canhan .khk-tblwrap::-webkit-scrollbar-track{background:transparent;}',
    '#screen-canhan .khk-tbl th:nth-child(1),#screen-canhan .khk-tbl td:nth-child(1),',
    '#screen-canhan .khk-tbl th:nth-child(2),#screen-canhan .khk-tbl td:nth-child(2){position:static;',
    '  width:auto;min-width:0;box-shadow:none;}',
    '#screen-canhan .khk-tbl thead th:nth-child(1),#screen-canhan .khk-tbl thead th:nth-child(2){z-index:2;}',
    '#screen-canhan .khk-tbl .khk-ma{color:var(--muted);font-size:12px;}',
    '#screen-canhan .khk-rank{display:inline-block;min-width:20px;color:var(--muted);font-size:12px;}',
    /* Thanh tỷ trọng trong ô điểm */
    '#screen-canhan .khk-bar{display:block;height:4px;margin-top:4px;border-radius:2px;',
    '  background:linear-gradient(90deg,var(--brand),var(--cam));}',
    /* Bộ lọc (Loại khách + Tìm) */
    '#screen-canhan .khk-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
    '#screen-canhan .khk-filter label{font-size:12px;color:var(--muted);}',
    '#screen-canhan .khk-filter select{height:28px;padding:0 8px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;}',
    /* Tìm KH — ô input */
    '#screen-canhan .khk-filter input[type="search"]{height:28px;padding:0 8px;min-width:160px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;}',
    /* Phân trang bảng chi tiết KH (pattern MH06) */
    '#screen-canhan .khk-pager{display:flex;align-items:center;justify-content:space-between;',
    '  gap:8px;padding:6px 10px;font-size:12px;color:var(--muted);',
    '  border-top:1px solid var(--border-soft);}',
    '#screen-canhan .khk-pager button{height:26px;padding:0 10px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;cursor:pointer;}',
    '#screen-canhan .khk-pager button:hover:not([disabled]){border-color:var(--cam);color:var(--cam-ink);}',
    '#screen-canhan .khk-pager button[disabled]{opacity:.45;cursor:default;}',
    /* Chip loại khách cho vùng cơ cấu */
    '#screen-canhan .khk-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}',
    '#screen-canhan .khk-chip{font-size:12px;min-height:24px;display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;',
    '  border:1px solid var(--border);background:var(--surface-2);color:var(--muted);}',
    '#screen-canhan .khk-chip.on{border-color:var(--cam);color:var(--cam-ink);background:var(--cam-soft);}',
    /* Dòng tăng trưởng */
    '#screen-canhan .khk-delta{font-variant-numeric:tabular-nums;}',
    '#screen-canhan .khk-delta.up{color:var(--a);}',
    '#screen-canhan .khk-delta.down{color:var(--d);}',
    '#screen-canhan .khk-delta.flat{color:var(--muted);}',
    /* Tổng doanh thu / tổng điểm của khách — NGOÀI biểu đồ (không nằm trong popup) */
    '#screen-canhan .khkC1-tong{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;',
    '  margin:var(--sp-1,4px) 0 var(--sp-2,8px);padding:6px 10px;',
    '  border:1px solid var(--border-soft);border-left:2px solid var(--chart-series-1);',
    '  border-radius:var(--radius-sm,6px);background:var(--surface-2);',
    '  font-size:var(--fs-small,12px);line-height:1.5;}',
    '#screen-canhan .khkC1-tong .khkC1-tong-k{color:var(--muted);}',
    '#screen-canhan .khkC1-tong .khkC1-tong-v{color:var(--text);font-weight:600;',
    '  font-variant-numeric:tabular-nums;}',
    '#screen-canhan .khkC1-tong .khkC1-tong-n{color:var(--text-soft);font-weight:600;',
    '  max-width:min(46%,340px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#screen-canhan .khk-note{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.55;}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ============================================ KHỐI 1 — Doanh thu & FKP từ khách nào */
  function khoi1(maMg, kyId) {
    var C = CH();
    var rs = rows(maMg, kyId);
    var tong = rs.reduce(function (a, r) { return a + px(r.diem_phi); }, 0);
    var tongTienAll = rs.reduce(function (a, r) { return a + doanhThuTong(r); }, 0);

    var h = [];
    h.push('<div class="card khk-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Doanh thu và FKP theo khách hàng</div>');
    h.push('      <div class="card-sub">Tổng doanh thu ' + esc(n1(tongTienAll)) + ' triệu VNĐ (' +
           esc(n1(tong)) + ' điểm FKP) từ ' + esc(n0(rs.length)) +
           ' khách hàng — khớp đúng điểm FKP ở MH01/MH02.</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!rs.length) {
      tong1 = []; tong1DefTen = ''; tong1DefTien = 0; tong1DefDiem = 0;
      h.push(C ? C.empty('Kỳ này không có dữ liệu khách hàng.') : '<p class="muted">' + DASH + '</p>');
      h.push('  </div></div>');
      return h.join('');
    }

    /* Sắp theo TỔNG DOANH THU THUẦN (triệu VNĐ) giảm dần */
    var srt = rs.slice().sort(function (a, b) { return doanhThuTong(b) - doanhThuTong(a); });
    var top = srt.slice(0, st.top);

    /* Tổng doanh thu / tổng điểm TỪNG khách top-N → dải số NGOÀI biểu đồ. */
    tong1 = tongTongTop(top);
    tong1DefTen = 'Top ' + top.length + ' khách hàng';
    tong1DefTien = tong1.reduce(function (a, t) { return a + t.tongTien; }, 0);
    tong1DefDiem = tong1.reduce(function (a, t) { return a + t.tongDiem; }, 0);

    /* Cột ngang xếp chồng theo giá trị thuần (triệu VNĐ) — C1 giữ toàn bộ
       vùng lưới (donut C2 đã bỏ: thừa so với chips bên dưới + trùng màu C1) */
    h.push('      <div>');
    h.push(C ? C.box('khkC1', Math.max(240, top.length * 34 + 70),
                     'Top ' + top.length + ' khách hàng theo doanh thu',
                     'Đơn vị: triệu VNĐ · mỗi thanh chia theo 3 nhóm khoản thu')
              : '<div class="chart-empty">' + DASH + '</div>');
    /* Dải tổng nằm TRÊN khung biểu đồ, ngoài canvas (popup không chứa tổng) */
    h.push('        ' + khoi1TongHTML());
    h.push('      </div>');

    /* Cơ cấu theo NHÓM KHOẢN THU (giá trị thuần triệu VNĐ) — chips */
    h.push('      <div>');
    h.push('        <div class="khk-chips">');
    var gN = gomNhomTien(rs);
    for (var j = 0; j < NHOM.length; j++) {
      var dg = px(gN[j]);
      var pc = tongTienAll > 0 ? (dg / tongTienAll * 100) : 0;
      h.push('          <span class="khk-chip"><i class="khk-dot" style="background:var(' +
             NHOM[j].c + ')"></i>' + esc(NHOM[j].ten) + ' · ' + esc(n1(dg)) +
             ' triệu VNĐ (' + esc(n1(pc)) + '%)</span>');
    }
    h.push('        </div>');
    h.push('        <div class="khk-loai" data-act="khk-loai-sel-mini">' +
           esc(loaiText(rs, tongTienAll)) + '</div>');
    h.push('      </div>');
    h.push('    </div>');
    h.push('    <p class="khk-note">Bấm vào một loại khách ở dòng dưới (hoặc dùng ô lọc phía dưới) để xem chi tiết. ' +
           'Biểu đồ scale theo giá trị thuần (triệu VNĐ). Tổng điểm quy đổi FKP khớp đúng điểm FKP của môi giới trong kỳ.</p>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* Công thức FKP viết ra từ hệ số đọc được — không gõ số cứng trong câu
     chữ, nên đổi tham số là câu chữ tự đổi theo. */
  function congThucFKPText() {
    var hPhi = heSoPhi(), hLai = heSoLai(), hTp = heSoTp();
    return 'phí giao dịch (triệu) × ' + (isNum(hPhi) ? n1(hPhi) : 'thiếu he_so_phi_1trieu') +
      ' + lãi vay (triệu) × ' + (isNum(hLai) ? n1(hLai) : 'thiếu he_so_lai_1trieu') +
      ' + (phí trái phiếu ÷ 100 triệu) × ' + (isNum(hTp) ? n1(hTp) : 'thiếu he_so_tp_100trieu');
  }

  /* Một dòng chú thích tóm tắt cơ cấu LOẠI KHÁCH theo doanh thu thuần */
  function loaiText(rs, tongTien) {
    var gom = {}, ten = [];
    for (var i = 0; i < rs.length; i++) {
      var lk = rs[i].loai_kh || 'KH_KHAC';
      gom[lk] = (gom[lk] || 0) + doanhThuTong(rs[i]);
    }
    for (var k in gom) if (Object.prototype.hasOwnProperty.call(gom, k)) ten.push(k);
    ten.sort(function (a, b) { return gom[b] - gom[a]; });
    var parts = [];
    for (var j = 0; j < ten.length; j++) {
      var pc = tongTien > 0 ? (gom[ten[j]] / tongTien * 100) : 0;
      parts.push(loaiTen(ten[j]) + ' ' + n1(pc) + '%');
    }
    return 'Cơ cấu loại khách: ' + parts.join(' · ');
  }

  /* ================================ KHỐI 2 — Chi tiết từng khách hàng */
  function khoi2(maMg, kyId) {
    var rs = rows(maMg, kyId);
    var h = [];
    h.push('<div class="card khk-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Chi tiết theo từng khách hàng</div>');
    h.push('      <div class="card-sub">Số tiền tính bằng triệu đồng; điểm quy đổi theo hệ số PTSP chốt 30/09/2026: ' +
           esc(congThucFKPText()) + '.</div></div>');
    h.push('    <div class="khk-filter">');
    h.push('      <label for="khkLoai">Loại khách</label>');
    h.push('      <select id="khkLoai" data-act="khk-loai-sel">');
    h.push('        <option value="">Tất cả</option>');
    var seen = {}, opts = [];
    for (var i = 0; i < rs.length; i++) if (rs[i].loai_kh && !seen[rs[i].loai_kh]) { seen[rs[i].loai_kh] = 1; opts.push(rs[i].loai_kh); }
    opts.sort();
    for (var j = 0; j < opts.length; j++) {
      h.push('        <option value="' + esc(opts[j]) + '"' + (st.loai === opts[j] ? ' selected' : '') + '>' +
             esc(loaiTen(opts[j])) + '</option>');
    }
    h.push('      </select>');
    h.push('      <label for="khkQ" style="margin-left:8px">Tìm</label>');
    h.push('      <input id="khkQ" type="search" data-act="khk-q" value="' + esc(st.q) + '"' +
           ' placeholder="Tên hoặc mã KH…" autocomplete="off">');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!rs.length) {
      h.push('<div class="chart-empty">' + DASH + ' Kỳ này không có dữ liệu khách hàng.</div>');
      h.push('  </div></div>');
      return h.join('');
    }

    /* Lọc Loại + Tìm (không dấu) */
    var list = locKhk(rs);
    var k = st.sort, d = st.dir;
    list.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string' || typeof y === 'string') {
        return d * String(x || '').localeCompare(String(y || ''), 'vi');
      }
      return d * (px(y) - px(x));
    });

    var maxDiem = list.reduce(function (a, r) { return Math.max(a, px(r.diem_phi)); }, 0) || 1;

    /* Phân trang — chỉ hiện khi danh sách LỌC > 1 trang */
    var soTrang = Math.max(1, Math.ceil(list.length / TRANG));
    if (stTrang.page > soTrang) stTrang.page = soTrang;
    var pg = stTrang.page - 1;
    var listPage = (soTrang > 1) ? list.slice(pg * TRANG, pg * TRANG + TRANG) : list;
    if (soTrang > 1) {
      h.push('    <div class="khk-pager" data-khk-pager>');
      h.push('      <span>' + esc(n0(list.length)) + ' khách · trang ' + esc(n0(stTrang.page)) + '/' + esc(n0(soTrang)) + '</span>');
      h.push('      <button type="button" data-act="khk-trang" data-p="-1"' +
             (stTrang.page <= 1 ? ' disabled' : '') + '>Trước</button>');
      h.push('      <button type="button" data-act="khk-trang" data-p="1"' +
             (stTrang.page >= soTrang ? ' disabled' : '') + '>Sau</button>');
      h.push('    </div>');
    }

    h.push('    <div class="khk-tblwrap">');
    h.push('      <table class="table tbl-chuan khk-tbl">');
    h.push('        <thead><tr>');
    h.push('          <th>#</th>');
    h.push('          <th class="sortable" data-act="khk-sort" data-k="ho_ten" data-dir="' + (k === 'ho_ten' ? d : 0) + '">Khách hàng</th>');
    h.push('          <th class="sortable" data-act="khk-sort" data-k="loai_kh" data-dir="' + (k === 'loai_kh' ? d : 0) + '">Loại</th>');
    for (var m = 0; m < NHOM.length; m++) {
      h.push('          <th class="num sortable" data-act="khk-sort" data-k="' + NHOM[m].f + '" data-dir="' + (k === NHOM[m].f ? d : 0) + '">' +
             esc(NHOM[m].ten) + '</th>');
    }
    h.push('          <th class="num sortable" data-act="khk-sort" data-k="aum_trieu" data-dir="' + (k === 'aum_trieu' ? d : 0) + '">Dư nợ (tỷ VNĐ)</th>');
    h.push('          <th class="num sortable" data-act="khk-sort" data-k="diem_phi" data-dir="' + (k === 'diem_phi' ? d : 0) + '">Điểm</th>');
    h.push('        </tr></thead>');
    h.push('        <tbody data-khk-body>');
    for (var t = 0; t < listPage.length; t++) {
      var r = listPage[t];
      var aumTy = (r.aum_ty != null) ? r.aum_ty : (isNum(r.aum_trieu) ? r.aum_trieu / 1000.0 : null);
      h.push('        <tr>');
      h.push('          <td><span class="khk-rank">' + (pg * TRANG + t + 1) + '</span></td>');
      h.push('          <td>' + esc(r.ho_ten || DASH) + ' <span class="khk-ma">' + esc(r.ma_kh || '') + '</span></td>');
      h.push('          <td>' + esc(loaiTen(r.loai_kh)) + '</td>');
      for (var q = 0; q < NHOM.length; q++) {
        var v = r[NHOM[q].f];
        h.push('          <td class="num">' + (isNum(v) && v !== 0 ? esc(n2(v)) : '<span class="empty"></span>') + '</td>');
      }
      h.push('          <td class="num">' + (isNum(aumTy) && aumTy > 0 ? esc(n2(aumTy)) : '<span class="empty"></span>') + '</td>');
      h.push('          <td class="num"><b>' + esc(n1(px(r.diem_phi))) + '</b>' +
             '<span class="khk-bar" style="width:' + (px(r.diem_phi) / maxDiem * 100).toFixed(1) + '%"></span></td>');
      h.push('        </tr>');
    }
    h.push('        </tbody>');

    /* Chân bảng = tổng của phần đang lọc, KHÔNG phải tổng cả kỳ */
    var sumAumTy = list.reduce(function (a, r) {
      var at = (r.aum_ty != null) ? r.aum_ty : (isNum(r.aum_trieu) ? r.aum_trieu / 1000.0 : 0);
      return a + at;
    }, 0);
    h.push('        <tfoot><tr>');
    h.push('          <td colspan="3">Tổng ' + (st.loai ? esc(loaiTen(st.loai)) : 'tất cả') + ' (' + esc(n0(list.length)) + ' khách)</td>');
    for (var u = 0; u < NHOM.length; u++) {
      var s = list.reduce(function (a, r) { return a + (isNum(r[NHOM[u].f]) ? r[NHOM[u].f] : 0); }, 0);
      h.push('          <td class="num">' + esc(n2(s)) + '</td>');
    }
    h.push('          <td class="num">' + esc(n2(sumAumTy)) + '</td>');
    h.push('          <td class="num">' + esc(n1(list.reduce(function (a, r) { return a + px(r.diem_phi); }, 0))) + '</td>');
    h.push('        </tr></tfoot>');
    h.push('      </table>');
    h.push('    </div>');
    h.push('    <p class="khk-note">Ô trống = không phát sinh khoản thu đó ở khách hàng này, không phải số 0 bị mất. ' +
           'Dư nợ (tỷ VNĐ) trống = khách không có margin. Lãi vay scale theo dư nợ bình quân ~12%/năm (khoảng 1,0%/kỳ).</p>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* Lọc Loại + Tìm — tách riêng để Tìm chỉ vẽ lại tbody/tfoot/pager
     (veLaiKhk) mà KHÔNG innerHTML lại cả card: giữ con trỏ nhập
     khi đang gõ (pattern dn-q của MH06). */
  function locKhk(rs) {
    var list = st.loai ? rs.filter(function (r) { return r.loai_kh === st.loai; }) : rs.slice();
    if (st.q) {
      var _a = A();
      var _dq = (_a && typeof _a.deaccent === 'function')
        ? _a.deaccent(st.q).toString().toLowerCase()
        : st.q.toString().toLowerCase();
      list = list.filter(function (r) {
        var _s = (_a && typeof _a.deaccent === 'function')
          ? _a.deaccent((r.ho_ten || '') + ' ' + (r.ma_kh || '')).toString().toLowerCase()
          : ((r.ho_ten || '') + ' ' + (r.ma_kh || '')).toLowerCase();
        return _s.indexOf(_dq) >= 0;
      });
    }
    return list;
  }
  /* html -> Node (bỏ text node trắng do thụt lề) — như parseNode MH06 */
  function khkNode(html) {
    var tmp = global.document.createElement('div');
    tmp.innerHTML = html;
    var n = tmp.firstChild;
    while (n && n.nodeType !== 1) n = n.nextSibling;
    return n;
  }
  /* Vẽ lại bảng khi đang gõ Tìm. */
  function veLaiKhk() {
    var a = A();
    if (a && typeof a.render === 'function') a.render();
  }

  /* ================================ KHỐI 3 — Tăng trưởng so với kỳ trước */
  function khoi3(maMg, kyId) {
    var C = CH();
    var tt = tongHop(maMg);
    var kyPrev = kyPrevId(kyId);
    var h = [];
    h.push('<div class="card khk-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Tăng trưởng so với kỳ trước</div>');
    h.push('      <div class="card-sub">Kỳ ' + esc(kyLabel(kyPrev)) + ' → kỳ ' + esc(kyLabel(kyId)) + '.</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!tt || !tt.tong) {
      h.push('<div class="chart-empty">' + DASH + ' Chưa có dữ liệu tăng trưởng cho kỳ này.</div>');
      h.push('  </div></div>');
      return h.join('');
    }

    /* Bảng tăng trưởng: điểm FKP + 3 nhóm khoản thu theo giá trị thuần */
    var keys = ['tong'].concat(NHOM.map(function (x) { return x.k; }));
    var ten = ['Tổng điểm FKP (điểm)'].concat(NHOM.map(function (x) { return x.ten; }));
    function val(g, f) { return isNum(g && g[f]) ? g[f] : 0; }

    h.push('    <div class="khk-tblwrap" style="max-height:none">');
    h.push('      <table class="table tbl-chuan khk-tbl">');
    /* KHÔNG sortable: cột đều tính từ dữ liệu tóm tắt (tt.tong,
       tt[nhom]) — sort theo giá trị cần map key riêng, không có
       field thẳng trên row như bảng chi tiết. */
    h.push('        <thead><tr><th>Nhóm khoản thu</th><th class="num">Kỳ trước</th><th class="num">Kỳ này</th>' +
           '<th class="num">Chênh lệch</th><th class="num">Tăng trưởng</th></tr></thead>');
    h.push('        <tbody>');
    for (var i = 0; i < keys.length; i++) {
      var g = tt[keys[i]];
      if (!g) continue;
      /* 'tong' là ĐIỂM FKP; 3 nhóm khoản thu là TRIỆU ĐỒNG (giá trị thuần) */
      var isTong = (keys[i] === 'tong');
      var hs = val(g, 'hien_tai');
      var tr = val(g, 'ky_truoc');
      var ch = isNum(g.chenh_lech) ? g.chenh_lech : null;
      var tl = g.ty_le;
      var cls = (isNum(ch) && ch > 0) ? 'up' : ((isNum(ch) && ch < 0) ? 'down' : 'flat');
      /* Mũi tên tăng/giảm: ▲ xanh (.pos) khi > 0, ▼ đỏ (.neg) khi < 0 —
         WCAG 1.4.1: không chỉ màu, có hình dạng. Ký tự chèn trực tiếp
         vào TD (không phải text node riêng của TH) nên innerText của
         bảng tăng trưởng vẫn đọc được giá trị. */
      var mCh = isNum(ch) ? (ch > 0 ? '<span class="pos">▲</span> ' : (ch < 0 ? '<span class="neg">▼</span> ' : '')) : '';
      var mTl = (isNum(tl) && tl !== 0) ? (tl > 0 ? '<span class="pos">▲</span> ' : '<span class="neg">▼</span> ') : '';
      var fmtCh = isNum(ch) ? (ch > 0 ? '+' : '−') + esc(n1(Math.abs(ch))) + (isTong ? ' đ' : '') : DASH;
      var fmtTl = (tl === null || !isNum(tl)) ? '<span class="empty"></span>' : (tl > 0 ? '+' : '−') + esc(num(Math.abs(tl) * 100, 1)) + '%';
      h.push('        <tr>');
      h.push('          <td>' + esc(ten[i]) + '</td>');
      h.push('          <td class="num">' + esc(n1(tr)) + (isTong ? ' đ' : '') + '</td>');
      h.push('          <td class="num"><b>' + esc(n1(hs)) + (isTong ? ' đ' : '') + '</b></td>');
      h.push('          <td class="num khk-delta ' + cls + '">' + mCh + fmtCh + '</td>');
      h.push('          <td class="num khk-delta ' + (isNum(tl) ? cls : 'flat') + '">' + mTl + fmtTl + '</td>');
      h.push('        </tr>');
    }
    h.push('        </tbody>');
    h.push('      </table>');
    h.push('    </div>');
    h.push('    <p class="khk-note">Các nhóm khoản thu tính theo <b>giá trị thuần (triệu VNĐ)</b>; ' +
           'Tổng điểm FKP quy đổi theo hệ số PTSP chốt 30/09/2026: ' + esc(congThucFKPText()) + '. ' +
           'Trái phiếu quy đổi theo 100 triệu, khác đơn vị của phí và lãi. ' +
           'Kỳ trước bằng 0 thì để trống cột tăng trưởng — không chia, vì mẫu số bằng 0.</p>');

    /* Khối tóm tắt biến động Tổng FKP */
    var gTong = tt.tong;
    if (gTong) {
      var hsTong = val(gTong, 'hien_tai');
      var trTong = val(gTong, 'ky_truoc');
      var chTong = isNum(gTong.chenh_lech) ? gTong.chenh_lech : null;
      var tlTong = gTong.ty_le;
      var clsTong = (isNum(chTong) && chTong > 0) ? 'up' : ((isNum(chTong) && chTong < 0) ? 'down' : 'flat');
      h.push('    <div class="row-between" style="background:var(--surface-2);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);margin-top:var(--sp-3,12px);margin-bottom:var(--sp-3,12px);">' +
             '      <div><span class="muted small">Biến động Tổng điểm FKP: </span>' +
             '<b>' + esc(n1(trTong)) + ' đ</b> <span class="muted small">(kỳ trước)</span> → <b>' + esc(n1(hsTong)) + ' đ</b> <span class="muted small">(kỳ này)</span></div>' +
             '      <div class="khk-delta ' + clsTong + '"><b>' +
             (isNum(chTong) ? (chTong > 0 ? '<span class="pos">▲</span> +' : (chTong < 0 ? '<span class="neg">▼</span> −' : '')) : '') + (isNum(chTong) ? esc(n1(Math.abs(chTong))) + ' điểm' : '') +
             (isNum(tlTong) ? ' (' + (tlTong > 0 ? '+' : '−') + esc(num(Math.abs(tlTong) * 100, 1)) + '%)' : '') +
             '</b></div>' +
             '    </div>');
    }

    /* (biểu đồ C3 đã bỏ 28/10 — trùng hoàn toàn bảng [2] ngay trên:
       cùng 3 nhóm khoản thu, cùng giá trị kỳ trước/kỳ này; bảng đủ
       thông tin hơn: có chênh lệch + tăng trưởng + sortable) */
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* ==================================================== vẽ biểu đồ SAU DOM */
  function ve(maMg, kyId) {
    var C = CH();
    if (!C || typeof C.isReady === 'function' && !C.isReady()) return;
    var rs = rows(maMg, kyId);

    /* 1a — cột ngang XẾP CHỒNG top-N theo GIÁ TRỊ THUẦN (triệu VNĐ) */
    if (rs.length) {
      var srt = rs.slice().sort(function (a, b) { return doanhThuTong(b) - doanhThuTong(a); });
      var top = srt.slice(0, st.top);
      var el = global.document.getElementById('khkC1');
      if (el) {
        try {
          /* Tra cứu doanh thu gốc (triệu) + điểm của từng khách top-N */
          var meta = top.map(function (r) {
            var t = {}, tt = 0;
            for (var m = 0; m < NHOM.length; m++) {
              var v = tienNhom(r, NHOM[m].f);
              t[NHOM[m].f] = v;
              tt += v;
            }
            return { ten: String(r.ho_ten || DASH), tien: t, tongTien: tt, tongDiem: diemNhomTong(r) };
          });
          var labels = meta.map(function (m) {
            return m.ten.length > 24 ? m.ten.slice(0, 23) + '…' : m.ten;
          });
          var series = NHOM.map(function (n) {
            return {
              label: n.ten,
              colorVar: n.c,
              data: top.map(function (r) { return Math.round(tienNhom(r, n.f) * 100) / 100; })
            };
          });
          C.bar('khkC1', labels, series, {
            horizontal: true, stacked: true,
            legend: true, legendPosition: 'bottom',
            unit: 'triệu VNĐ', decimals: 1, maxTicks: 6,
            maxBarThickness: 22,
            interaction: { mode: 'index', axis: 'y', intersect: false },
            formatter: function (ctx) { return fmtKHC1(ctx, meta, series); }
          });
          bindHoverC1(C.get ? C.get('khkC1') : null);
        } catch (e) { warn('C1', e); }
      }
    }

    /* (donut C2 đã bỏ — xem lịch sử commit) */

    /* (biểu đồ C3 đã bỏ 28/10 — trùng hoàn toàn bảng [2] ngay trên:
       cùng 3 nhóm khoản thu, cùng giá trị kỳ trước/kỳ này; bảng đủ
       thông tin hơn: có chênh lệch + tăng trưởng + sortable) */
  }

  function warn(tag, e) {
    if (global.console && console.warn) console.warn('[canhan-kh/' + tag + ']', e);
  }

  /* --------------------------------------------------------------- tooltip C1
   * Cột NGANG XẾP CHỒNG 5 nhóm, interaction mode:'index' + intersect:false.
   * Vì vậy khi chỉ vào bất kỳ đâu trên thanh của 1 khách, Chart.js gọi formatter
   * cho CẢ 5 dataset của khách đó → nếu mỗi dataset cùng trả về một danh sách
   * dài, popup sẽ dài gấp 5 lần. Đó chính là lý do popup cũ quá dài.
   *
   * Cách sửa: CHỈ dataset mà con trỏ thực sự nằm trên mới trả nội dung, các
   * dataset khác trả null. Việc này KHÔNG đoán mò theo datasetIndex: ta tự
   * hit-test đúng hình chữ nhật của từng bar (element.inRange) tại điểm chuột
   * — cùng tiêu chuẩn mà chính Chart.js dùng khi bắt element.
   *
   *   - Rê đúng vào 1 lát        → popup chỉ có tên lát đó + tiền + điểm.
   *   - Rê lệch/không xác định   → FALLBACK AN TOÀN: liệt kê MỌI nhóm có
   *     giá trị > 0 của khách đó, nhưng CHỈ dataset đầu tiên có giá trị được
   *     phát ra → không lặp 5 lần, và không bao giờ rỗng.
   *
   * SỐ TỔNG không nằm trong popup: hiển thị ở dải #khkC1-tong BÊN NGOÀI chart
   * (xem khoi1TongHTML / setTong1). */
  function fmtKHC1(ctx, meta, series) {
    if (!ctx) return null;

    /* ctx.dataIndex = chỉ số KHÁCH (đúng, nhờ mode:'index' + axis:'y').
     * ctx.datasetIndex KHÔNG phải lát đang chỉ — Chart.js gọi formatter cho cả
     * 5 dataset của khách đó, nên phải tự hit-test theo toạ độ chuột thật.
     * Chỉ dataset khớp lát đó được in; 4 dataset còn lại trả null ⇒ 1 dòng. */
    var i = ctx.dataIndex;
    if (!isNum(i) || i < 0) return null;
    var m = meta && meta[i];
    if (!m) return null;

    /* Dải tổng NGOÀI chart theo đúng khách đang chỉ. */
    setTong1(i);

    var d = khitNhom(ctx);
    if (d < 0) return null;                 /* không nằm trên lát nào → rỗng */
    if (ctx.datasetIndex !== d) return null; /* dataset khác → không in */

    var n = NHOM[d];
    var tv = m.tien[n.f] || 0;
    if (tv <= 0) return null;                /* lát rỗng, không hiện số 0 */
    var hs = heSoNhom(n.k);
    return '  ' + n.ten + ': ' + n1(tv) + ' triệu VNĐ (' +
      (isNum(hs) ? n1(tv / donViNhom(n.k) * hs) + ' điểm' : 'thiếu hệ số — chưa tính điểm') +
      (n.dv === 100 ? ', tính theo 100 triệu' : '') + ')';
  }

  /* Lát nào trong thanh khách i đang nằm dưới con trỏ? -1 = không trúng.
   * Hình học tường minh theo mép trái/phải lấy từ phần tử liền kề trong
   * stack; KHÔNG dùng element.inRange() vì hit-box của Chart.js cho bar xếp
   * chồng dựng theo tâm nên trượt ở các lát mỏng. */
  function khitNhom(ctx) {
    var ch = ctx && ctx.chart;
    if (!ch || !ch.getDatasetMeta) return -1;
    var pt = posChuot(ch);
    if (!pt || !isNum(pt.x) || !isNum(pt.y)) return -1;
    var i = ctx.dataIndex;
    if (!isNum(i) || i < 0) return -1;
    var a = ch.chartArea;
    if (!a || pt.y < a.top || pt.y > a.bottom) return -1;

    var nD = ch.data.datasets.length;
    for (var d = 0; d < nD; d++) {
      var e = elOf(ch, i, d);
      if (!e) continue;
      var xTrai = (d === 0) ? a.left : xRightOf(ch, i, d - 1);
      var xPhai = (d === nD - 1) ? a.right : xRightOf(ch, i, d);
      if (xTrai === null || xPhai === null) continue;
      if (xPhai - xTrai < 0.6) continue;                /* lát rỗng / 0px */
      var tol = (e.height ? Math.max(3, e.height / 2) : 7);
      if (pt.y < e.y - tol || pt.y > e.y + tol) continue;
      if (pt.x >= xTrai - 0.5 && pt.x <= xPhai + 0.5) return d;
    }
    return -1;
  }

  /* Toạ độ chuột (px trong canvas). ƯU TIÊN chart.__khkPt do bindHoverC1 ghi ở
   * mỗi mousemove — đó là vị trí chuột THẬT, đáng tin hơn tooltip._eventPosition
   * (Chart.js có thể để lại giá trị cũ khi ta ép tooltip.update). */
  function posChuot(ch) {
    if (!ch) return null;
    var q = ch.__khkPt;
    if (q && isNum(q.x) && isNum(q.y)) return q;
    var tp = ch.tooltip;
    if (tp && tp._eventPosition && isNum(tp._eventPosition.x) && isNum(tp._eventPosition.y)) {
      return tp._eventPosition;
    }
    var ev = ch._lastEvent;
    var H = global.Chart && global.Chart.helpers;
    if (ev && H && typeof H.getRelativePosition === 'function') {
      try {
        var pt = H.getRelativePosition(ev, ch);
        if (pt && isNum(pt.x) && isNum(pt.y)) return pt;
      } catch (e) { /* không đọc được → coi như không xác định */ }
    }
    return null;
  }


  /* Mép phải (px trong canvas) của lát dataset di của khách i. Các lát trong
   * biểu đồ xếp chồng nằm kề nhau nên mép phải lát d chính là mép trái lát d+1. */
  function xRightOf(chart, idx, di) {
    var e = elOf(chart, idx, di);
    return (e && isNum(e.x)) ? e.x : null;
  }

  function elOf(chart, idx, di) {
    try {
      var md = chart.getDatasetMeta(di);
      return (md && md.data && md.data[idx]) ? md.data[idx] : null;
    } catch (e) { return null; }
  }

  /* Tổng doanh thu + tổng điểm từng khách top-N (cùng thứ tự với labels C1).
     Điểm = Σ(doanh thu nhóm × hệ số của nhóm đó) qua diemNhomTong, để khớp
     đúng tổng điểm của khách chứ không nhân một hệ số chung cho mọi nhóm. */
  function tongTongTop(top) {
    var out = [];
    for (var i = 0; i < top.length; i++) {
      var t = 0;
      for (var k = 0; k < NHOM.length; k++) t += tienNhom(top[i], NHOM[k].f);
      out.push({ ten: String(top[i].ho_ten || DASH), tongTien: t, tongDiem: diemNhomTong(top[i]) });
    }
    return out;
  }

  /* Dải tổng NGOÀI biểu đồ. id=khkC1-tong để test/JS cập nhật khi rê chuột. */
  function khoi1TongHTML() {
    return '<div class="khkC1-tong" id="khkC1-tong">' +
             '<span class="khkC1-tong-k">Tổng doanh thu</span>' +
             '<span class="khkC1-tong-v" data-k="tien">' + esc(n1(tong1DefTien)) + ' triệu VNĐ</span>' +
             '<span class="khkC1-tong-k">Tổng điểm FKP</span>' +
             '<span class="khkC1-tong-v" data-k="diem">' + esc(n1(tong1DefDiem)) + ' điểm</span>' +
             '<span class="khkC1-tong-k">·</span>' +
             '<span class="khkC1-tong-n">' + esc(tong1DefTen) + '</span>' +
           '</div>';
  }

  /* Rê chuột trên C1 → dải tổng đổi sang tổng của đúng khách đang chỉ.
   * Rời chuột (idx = -1) → trả về tổng mặc định (cả top-N). */
  var tong1Cur = -2;
  function setTong1(idx) {
    if (tong1Cur === idx) return;               /* formatter gọi 5 lần/khách */
    tong1Cur = idx;
    if (!global.document) return;
    var el = global.document.getElementById('khkC1-tong');
    if (!el) return;
    var t = (idx != null && idx >= 0) ? tong1[idx] : null;
    var vT = el.querySelector('[data-k="tien"]');
    var vD = el.querySelector('[data-k="diem"]');
    var vN = el.querySelector('.khkC1-tong-n');
    var tien = t ? t.tongTien : tong1DefTien;
    var diem = t ? t.tongDiem : tong1DefDiem;
    var ten  = t ? t.ten : tong1DefTen;
    if (vT) vT.textContent = n1(tien) + ' triệu VNĐ';
    if (vD) vD.textContent = n1(diem) + ' điểm';
    if (vN) { vN.textContent = ten; vN.title = ten; }
  }

  /* Cầu nối rê chuột của khkC1.
   *
   * Chart.js với interaction mode:'index' chỉ gọi lại formatter khi con trỏ
   * đổi THANH (dataIndex), không đổi LÁT (datasetIndex) — nên rê ngang một
   * thanh xếp chồng, popup vẫn giữ dòng của lát đã rê trước đó. Ta nghe
   * mousemove trên canvas, tự hit-test xem đang ở lát nào, và khi LÁT đổi
   * thì ép Chart.js tính lại tooltip.
   *
   * Gắn đúng 1 lần mỗi chart instance; không đụng charts.js/app.js. */
  function bindHoverC1(chart) {
    if (!chart || !chart.canvas) return;
    if (chart.__khkHoverBound) return;
    chart.__khkHoverBound = true;
    var last = { i: -1, d: -2 };
    chart.canvas.addEventListener('mousemove', function (ev) {
      try {
        var hit = latChuot(chart, ev);
        /* Luôn ghi toạ độ chuột hiện tại: formatter đọc ở đây để biết đang
         * chỉ lát nào (Chart.js không truyền toạ độ chuột cho label callback). */
        var h = global.Chart && global.Chart.helpers;
        var pt = (h && typeof h.getRelativePosition === 'function')
                 ? h.getRelativePosition(ev, chart) : null;
        if (pt) chart.__khkPt = pt;
        if (hit.i === last.i && hit.d === last.d) return;
        last.i = hit.i; last.d = hit.d;
        setTong1(hit.i);
        /* Rê ngang trong CÙNG một thanh: dataIndex không đổi nên Chart.js
         * không gọi lại formatter → popup kẹt ở lát cũ. Ép tính lại khi
         * LÁT đổi. setActiveElements chỉ đặt lại phần tử active của trục y
         * (đã đúng) nên không gây gom nhiều dataset. */
        var tp = chart.tooltip;
        if (tp && hit.i >= 0) {
          tp._eventPosition = chart.__khkPt || { x: 0, y: 0 };
          tp.update(true, true);
          chart.render();
        }
      } catch (e) { /* không được làm hỏng biểu đồ */ }
    }, true);
    chart.canvas.addEventListener('mouseleave', function () {
      try {
        last.i = -1; last.d = -2;
        chart.__khkPt = null;
        setTong1(-1);
      } catch (e) { /* bỏ qua */ }
    }, true);
  }

  /* Trả {i, d} = thanh + nhóm mà con trỏ đang ở; d = -1 nếu không trúng lát.
   *
   * KHÔNG dùng element.inRange(): với bar XẾP CHỒNG, Chart.js v4 dựng hit-box
   * theo tâm + nửa "base" nên rê vào giữa một lát thường trượt (đặc biệt lát
   * cuối rất mỏng) → trả -1 → rơi vào nhánh fallback in cả 5 nhóm. Dùng cùng
   * hình học tường minh như khitNhom: lát d của khách i kẹp trong
   * [mép trái, mép phải] lấy từ phần tử liền kề trong stack. */
  function latChuot(chart, ev) {
    var h = global.Chart && global.Chart.helpers;
    if (!h || typeof h.getRelativePosition !== 'function') return { i: -1, d: -1 };
    var pt = h.getRelativePosition(ev, chart);
    if (!pt || !isNum(pt.x) || !isNum(pt.y)) return { i: -1, d: -1 };
    var a = chart.chartArea;
    if (!a || pt.y < a.top || pt.y > a.bottom) return { i: -1, d: -1 };

    var nD = (chart.data && chart.data.datasets) ? chart.data.datasets.length : 0;
    var nI = (chart.data && chart.data.labels) ? chart.data.labels.length : 0;
    for (var i = 0; i < nI; i++) {
      for (var d = 0; d < nD; d++) {
        var e = elOf(chart, i, d);
        if (!e) continue;
        var xTrai = (d === 0) ? a.left : xRightOf(chart, i, d - 1);
        var xPhai = (d === nD - 1) ? a.right : xRightOf(chart, i, d);
        if (xTrai === null || xPhai === null) continue;
        if (xPhai - xTrai < 0.6) continue;              /* lát rỗng / 0px */
        var tol = (e.height ? Math.max(3, e.height / 2) : 7);
        if (pt.y < e.y - tol || pt.y > e.y + tol) continue;
        if (pt.x >= xTrai - 0.5 && pt.x <= xPhai + 0.5) return { i: i, d: d };
      }
    }
    return { i: -1, d: -1 };
  }

  /* ================================================================ AUGMENT
   * Chèn 3 khối vào HTML của ScreenCanhan rồi vẽ biểu đồ.
   * Nhận (el, ctx) = phần cuối của ScreenCanhan.render, chèn TRƯỚC
   * blockBieuDo (diễn biến 6 kỳ) để phần cũ giữ nguyên vị trí. */
  function augment(el, ctx) {
    try {
      injectStyle();
      var params = (ctx && ctx.params) || null;
      var kyId = (ctx && ctx.kyId) || '';
      var maMg = (params && params.ma_mg) || (A() && A().state && A().state.maMg) || null;
      if (!maMg) return;

      var C = CH();
      if (C && typeof C.destroyAll === 'function') C.destroyAll();
      tong1Cur = -2;              /* render lại → dải tổng về mặc định */

      var rs = rows(maMg, kyId);
      if (!rs.length) return;   /* màn hình cũ đã hiện "không có số liệu" */

      resetLoiHeSo();
      var html = khoi1(maMg, kyId) + khoi2(maMg, kyId) + khoi3(maMg, kyId);
      /* Hệ số quy đổi thiếu trong tham số → hiện lỗi, không tự điền số cứng. */
      var cb = canhBaoHeSoHTML();
      if (cb) html = cb + html;

      /* Chèn trước card "Diễn biến 6 kỳ" nếu có, không có thì append */
      var target = el.querySelector ? el.querySelector('.card:last-of-type') : null;
      var host = null;
      var cards = el.querySelectorAll ? el.querySelectorAll('.card') : [];
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].querySelector && cards[i].querySelector('svg.cn-chartsvg')) { host = cards[i]; break; }
      }
      if (host && host.parentNode) host.parentNode.insertBefore(global.document.createElement('div'), host);
      if (host && host.parentNode) {
        var tmp = global.document.createElement('div');
        tmp.innerHTML = html;
        while (tmp.firstChild) host.parentNode.insertBefore(tmp.firstChild, host);
      } else {
        el.insertAdjacentHTML('beforeend', html);
      }

      ve(maMg, kyId);
    } catch (e) {
      warn('augment', e);
    }
  }

  /* ============================================================== EXPORT */
  global.CanhanKH = {
    augment: augment,     /* gọi từ ScreenCanhan.render */
    reset: function () { st.sort = 'diem_phi'; st.dir = -1; st.loai = ''; st.q = ''; st.top = TOP_N; stTrang.page = 1; },
    state: st,
    _khoi1: khoi1, _khoi2: khoi2, _khoi3: khoi3, _ve: ve,   /* để kiểm chứng */
    _fmtKHC1: fmtKHC1, _tong1: function () { return tong1; }
  };

  /* Sự kiện: lọc loại khách + sắp xếp cột (delegate trên #screen-canhan) */
  function bind() {
    if (!global.document || global.__canhanKhBound) return;
    var root = global.document.getElementById('screen-canhan');
    if (!root) return;
    global.__canhanKhBound = true;
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var hit = t.closest('[data-act]');
      if (!hit) return;
      var act = hit.getAttribute('data-act');
      if (act !== 'khk-sort' && act !== 'khk-loai' && act !== 'khk-trang') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (act === 'khk-loai') {
        var lk = hit.getAttribute('data-loai') || '';
        st.loai = (st.loai === lk) ? '' : lk;
      } else if (act === 'khk-trang') {
        var dp = parseInt(hit.getAttribute('data-p') || '0', 10) || 0;
        stTrang.page = Math.max(1, stTrang.page + dp);
      } else {
        var k = hit.getAttribute('data-k') || 'diem_phi';
        if (st.sort === k) st.dir = -st.dir;
        else { st.sort = k; st.dir = -1; }
      }
      var a = A();
      if (a && typeof a.render === 'function') a.render();
    });
    root.addEventListener('change', function (ev) {
      var s = ev.target;
      if (!s || s.getAttribute && s.getAttribute('data-act') !== 'khk-loai-sel') return;
      st.loai = s.value || '';
      stTrang.page = 1;          /* đổi lọc → về trang 1 */
      var a = A();
      if (a && typeof a.render === 'function') a.render();
    });
    /* Tìm KH — input event (không đợi Enter), không dấu.
       Chỉ vẽ lại tbody + tfoot + pager, GIỮ con trỏ nhập khi đang
       gõ (giống dn-q của MH06). */
    root.addEventListener('input', function (ev) {
      var s = ev.target;
      if (!s || s.getAttribute && s.getAttribute('data-act') !== 'khk-q') return;
      if (s.value === st.q) return;
      st.q = s.value || '';
      stTrang.page = 1;          /* đổi tìm → về trang 1 */
      veLaiKhk();
    });
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', bind);
    }
    bind();
    /* ScreenCanhan có thể nạp sau → thử lại vài lần */
    var tries = 0;
    var t = global.setInterval || function () { return 0; };
    var iv = t(function () {
      tries++;
      bind();
      if (global.__canhanKhBound || tries > 40) global.clearInterval(iv);
    }, 120);
  }

})(window);
