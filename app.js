/* =============================================================================
 * app.js — tầng điều phối của demo "Theo dõi KPI Môi giới"
 * -----------------------------------------------------------------------------
 * File này load CUỐI CÙNG (sau data.js và 4 file màn hình), nên:
 *   1. window.App phải có mặt TRƯỚC khi gọi render.
 *   2. App.boot() tự chạy khi script nạp xong — không cần ai gọi.
 *
 * Trách nhiệm của file này (KHÔNG vẽ nội dung màn hình):
 *   - Tiện ích định dạng / escape HTML ......... App.fmtNum, App.pct, App.esc
 *   - Truy cập dữ liệu từ window.KPI .......... App.rows, App.rowOf, App.lichSu...
 *   - Quản lý kỳ ............................... App.setKy, App.stepKy, App.ky*
 *   - Quản lý trạng thái chung .................. App.state, App.setState, App.on
 *   - Điều hướng 4 màn hình .................... App.go, App.key
 *   - Vẽ chrome: header / tabs / chọn kỳ / user / footer
 *   - Gọi render màn hình tương ứng ............. App.registerScreen / App.render
 *
 * Hợp đồng với các file màn hình (screen-*.js):
 *   Cách 1 (khuyến nghị, không cần App):
 *       window.renderPhong(el, ctx) / renderMoigioi / renderCanhan / renderKhoi
 *   Cách 2: window.ScreenPhong = { render(el, ctx) }  — hoặc window.ScreenPhong(el, ctx)
 *   Cách 3: window.render_phong(el, ctx) / window.renderPhongScreen(...)
 *   Cách 4: tự đăng ký:  App.registerScreen('phong', function (el, ctx) { ... })
 *
 *   ctx = { el, screen, kyId, ky, params, data, App, fmtNum, pct, esc, classOf,
 *           lichSu, row, ... }  — màn hình nhận el (section đích) + ctx.
 *   Nếu hàm render có 0 tham số thì App gọi không tham số (màn hình tự tìm el).
 *
 * Lưu ý: mọi chỗ đụng tới DOM của app đều bọc try/catch — một màn hình hỏng
 * không được làm chết cả trang.
 * ========================================================================== */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- hằng số */

  var SCREEN_LIST = [
    { ten: 'phong',    tenHienThi: 'Phòng của tôi',            ma: 'MH01' },
    { ten: 'moigioi',  tenHienThi: 'Chi tiết môi giới',     ma: 'MH02' },
    { ten: 'canhan',   tenHienThi: 'KPI của tôi',           ma: 'MH03' },
    { ten: 'khoi',     tenHienThi: 'Tổng hợp khối',         ma: 'MH04' },
    { ten: 'hoahong',  tenHienThi: 'Hoa hồng & PQL',        ma: 'MH05' }
  ];
  var SCREEN_NAMES = SCREEN_LIST.map(function (s) { return s.ten; });

  var DEFAULT_MA_MG = 'MG010';           // TP phòng HN1 — có đủ dữ liệu quản lý
  var STORE_KEY = 'kpi-moi-gioi.state.v1';
  var LOG = '[App]';

  /* Tên class dùng chung cho 4 màn hình. Gộp nhiều bí danh để khớp với
   * style.css dù tên gì (đổi ở đây, không phải trong 4 file màn hình). */
  var CLASS = {
    screenActive: 'active',
    tabActive: 'active',
    xepLoai: function (g) {
      var t = String(g || 'x').toLowerCase();
      return ['grade-' + String(g || 'x'), 'xep-loai-' + t, 'loai-' + t];
    },
    bar: function (g) { return ['bar-' + String(g || 'x').toLowerCase()]; }
  };

  /* ------------------------------------------------------------------ dữ liệu */

  var KPI = global.KPI;
  if (!KPI) {
    fatal('window.KPI chưa có. Kiểm tra lại thứ tự <script> trong index.html: '
      + 'data.js phải nạp trước app.js.');
    return;
  }

  var danhSachKy = Array.isArray(KPI.danh_sach_ky) ? KPI.danh_sach_ky : [];
  var kyMacDinh = (KPI.ky_hien_tai && KPI.ky_hien_tai.ky_id) || (danhSachKy.length ? danhSachKy[danhSachKy.length - 1].ky_id : null);
  var thamSo = KPI.tham_so || {};
  var nguongXL = thamSo.nguong_xep_loai || { A: 1.1, B: 0.8, C: 0.6, D: 0 };

  /* ------------------------------------------------------------------ trạng thái */

  var state = {
    screen: SCREEN_NAMES[0],
    kyId: kyMacDinh,
    params: {},                 // tham số của màn hình hiện tại (vd {ma_mg:'MG003'})
    paramsByScreen: {},          // nhớ tham số theo từng màn hình để quay lại
    maMg: DEFAULT_MA_MG,         // người đang đăng nhập
    sort: { key: 'ty_le_hoan_thanh', dir: 'desc' },
    filter: { xep_loai: 'ALL', ma_phong: 'ALL', q: '' }
  };

  /* Bí danh sống cho các file màn hình: đọc state.ma_mg / state.maPhong /
   * state.ma_phong / state.phong luôn trả về giá trị mới nhất, không bị lệch.
   * Ghi đè thì setState ghi vào state._maPhong để không đụng getter. */
  function liveAlias(obj, prop, get) {
    Object.defineProperty(obj, prop, { get: get, enumerable: false, configurable: true });
  }
  function currentMaPhong() {
    return state._maPhong || (mgById(state.maMg) || {}).ma_phong || null;
  }
  /* state.ma_mg = môi giới ĐANG XEM (params), fallback về người đăng nhập.
   * Người đăng nhập luôn đọc qua App.user / state.maMg. */
  function currentMaMg() {
    return (state.params && state.params.ma_mg) || state.maMg;
  }
  liveAlias(state, 'ma_mg', function () { return currentMaMg(); });
  liveAlias(state, 'maPhong', function () { return currentMaPhong(); });
  liveAlias(state, 'ma_phong', function () { return currentMaPhong(); });
  liveAlias(state, 'phong', function () { return currentMaPhong(); });

  var screens = {};              // App.screens[name] = fn | {render}
  var listeners = {};            // App.on(evt, cb)
  var booted = false;
  var lastRenderKey = null;

  /* =========================================================================
   * 1. TIỆN ÍCH
   * ====================================================================== */

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Số kiểu Việt Nam: 1234.5 → "1.234,5". null/undefined/NaN → "—" */
  function fmtNum(v, digits) {
    if (v === null || v === undefined || v === '') return '—';
    var d = (digits === undefined || digits === null) ? 0 : digits;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
    if (!isFinite(n)) return '—';
    var neg = n < 0;
    var a = Math.abs(n).toFixed(d).split('.');
    a[0] = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + a.join(',');
  }

  /** Tự chọn số lẻ: <10 → 2 chữ số, <100 → 1, còn lại → 0. Cho bảng số liệu. */
  function fmtNumAuto(v) {
    if (!isNum(v)) return fmtNum(v, 2);
    var a = Math.abs(v);
    return fmtNum(v, a < 10 ? 2 : (a < 100 ? 1 : 0));
  }

  /** Triệu đồng → "1.978,0 tr" */
  function fmtTria(v, digits) {
    if (!isNum(v)) return '—';
    return fmtNum(v, digits === undefined ? 1 : digits) + ' tr';
  }

  /** Tỷ lệ 0..1 → "92,3%". null → "—" */
  function pct(v, digits) {
    if (v === null || v === undefined || v === '') return '—';
    var n = typeof v === 'number' ? v : Number(v);
    if (!isFinite(n)) return '—';
    var d = (digits === undefined || digits === null) ? 1 : digits;
    return fmtNum(n * 100, d) + '%';
  }

  /** Escape HTML — luôn bọc mọi chuỗi lấy từ dữ liệu trước khi chèn. */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Bỏ dấu tiếng Việt — để ô tìm kiếm gõ "nguyen" vẫn ra "Nguyễn". */
  var DEACCENT = { 'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a',
    'ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e',
    'ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i','ò':'o','ó':'o',
    'ỏ':'o','õ':'o','ọ':'o','ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o','ơ':'o','ờ':'o','ớ':'o',
    'ở':'o','ỡ':'o','ợ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ừ':'u','ứ':'u','ử':'u',
    'ữ':'u','ự':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d','Đ':'D' };

  function deaccent(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/g,
        function (c) { return DEACCENT[c] || c; });
  }

  /* ---- ngày tháng: dữ liệu dùng ISO, hiển thị kiểu Việt ---- */

  function fmtDate(iso) {
    if (!iso) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return String(iso);
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var s = String(iso);
    var d = fmtDate(s);
    var m = /T(\d{2}):(\d{2})/.exec(s);
    return m ? d + ' ' + m[1] + ':' + m[2] : d;
  }

  function fmtKyRange(ky) {
    if (!ky) return '—';
    if (ky.tu_ngay && ky.den_ngay) {
      return fmtDate(ky.tu_ngay) + ' → ' + fmtDate(ky.den_ngay);
    }
    return ky.nhan || ky.ky_id || '—';
  }

  /* =========================================================================
   * 2. TRUY CẬP DỮ LIỆU
   * ====================================================================== */

  function kyList() { return danhSachKy; }

  function kyById(id) {
    if (!id) return null;
    for (var i = 0; i < danhSachKy.length; i++) {
      if (danhSachKy[i].ky_id === id) return danhSachKy[i];
    }
    return null;
  }

  function kyIndex(id) {
    for (var i = 0; i < danhSachKy.length; i++) {
      if (danhSachKy[i].ky_id === id) return i;
    }
    return -1;
  }

  function kyHienTai() { return kyById(state.kyId) || kyById(kyMacDinh) || { ky_id: state.kyId, nhan: state.kyId }; }

  function isKyHienTai(id) { return (id || state.kyId) === kyMacDinh; }

  function kyNhan(id) {
    var k = kyById(id || state.kyId);
    return k ? (k.nhan || k.ky_id) : '—';
  }

  /** Nhãn đầy đủ: "Kỳ 6 · 25/09 → 24/10 (hiện tại)" */
  function kyLabel(id) {
    var kId = id || state.kyId;
    var i = kyIndex(kId);
    var k = kyById(kId);
    if (!k) return '—';
    return 'Kỳ ' + (i + 1) + ' · ' + (k.nhan || k.ky_id) + (isKyHienTai(kId) ? ' (hiện tại)' : '');
  }

  /** Dòng kết quả của một kỳ. Luôn trả về mảng (có thể rỗng). */
  function rows(kyId) {
    var id = kyId || state.kyId;
    var theoKy = KPI.ket_qua_theo_ky || {};
    if (Array.isArray(theoKy[id])) return theoKy[id];
    if (id === kyMacDinh && Array.isArray(KPI.ket_qua_ky_hien_tai)) return KPI.ket_qua_ky_hien_tai;
    return [];
  }

  function rowOf(maMg, kyId) {
    var list = rows(kyId);
    for (var i = 0; i < list.length; i++) if (list[i].ma_mg === maMg) return list[i];
    return null;
  }

  /** Dòng của chính người đang đăng nhập trong kỳ hiện tại. */
  function rowCuaToi(kyId) { return rowOf(state.maMg, kyId); }

  function lichSu(maMg) {
    var lh = KPI.lich_su || {};
    return Array.isArray(lh[maMg]) ? lh[maMg] : [];
  }

  /* --- Dữ liệu khách hàng (window.KH / kh-data.js) -----------------------
   * Script kh-data.js có thể chưa nạp (index.html chưa khai báo) — mọi hàm
   * bên dưới đều an toàn, trả giá trị mặc định thay vì ném lỗi. */

  /** Toàn bộ dữ liệu khách hàng. null nếu chưa nạp. */
  function khData() { return global.KH || null; }

  /** Các dòng khách hàng của một môi giới trong một kỳ. Luôn trả mảng. */
  function khTheoKy(maMg, kyId) {
    var KH = global.KH;
    if (!KH || !maMg) return [];
    var theoKy = KH.theo_ky || {};
    var theoMg = theoKy[maMg];
    if (!theoMg) return [];
    var list = theoMg[kyId || state.kyId];
    return Array.isArray(list) ? list : [];
  }

  /** Tổng hợp tăng trưởng của một môi giới. null nếu không có. */
  function khTongHop(maMg) {
    var KH = global.KH;
    if (!KH || !maMg) return null;
    var tt = KH.tang_truong || {};
    return tt[maMg] || null;
  }

  /** Danh sách khách hàng thuộc một môi giới. Luôn trả mảng. */
  function khDanhSach(maMg) {
    var KH = global.KH;
    if (!KH || !maMg || !Array.isArray(KH.khach_hang)) return [];
    return KH.khach_hang.filter(function (k) { return k && k.ma_mg === maMg; });
  }

  function mgList() { return Array.isArray(KPI.mo_gioi) ? KPI.mo_gioi : []; }
  function phongList() { return Array.isArray(KPI.phong) ? KPI.phong : []; }

  /* -------------------------------------------------------------- danh sách chọn người
   * GĐTT (GD01..GD03) và GĐ Khối (GDK01) KHÔNG có trong KPI.mo_gioi — chỉ nằm
   * trong HH.quan_ly (hh-data.js). Danh sách chọn môi giới cần thấy đủ cả hai
   * nguồn nên gộp tại đây, loại trùng theo ma_mg: bản ghi đến trước giữ nguyên
   * (KPI.mo_gioi → HH.mo_gioi → HH.quan_ly). Một mã chỉ xuất hiện đúng 1 lần.
   * Lưu ý: logic lọc/tính toán vẫn dùng mgList() — không đổi phần này. */
  var _mgAllCache = null;
  function mgAll() {
    if (_mgAllCache) return _mgAllCache;
    var out = [];
    var seen = {};
    function them(src) {
      if (!Array.isArray(src)) return;
      for (var i = 0; i < src.length; i++) {
        var m = src[i];
        if (!m || !m.ma_mg || seen[m.ma_mg]) continue;
        seen[m.ma_mg] = 1;
        out.push(m);
      }
    }
    them(mgList());
    var HH = global.HH;
    if (HH) {
      them(HH.mo_gioi);
      var ql = HH.quan_ly || {};
      var keys = Object.keys(ql);
      for (var k = 0; k < keys.length; k++) {
        if (seen[keys[k]]) continue;
        seen[keys[k]] = 1;
        var q = ql[keys[k]] || {};
        out.push({
          ma_mg: keys[k],
          ho_ten: q.ho_ten || keys[k],
          chuc_danh: q.chuc_danh || null,
          ma_phong: q.ma_phong || null,
          cap_quan_ly: q.cap_quan_ly || null
        });
      }
    }
    _mgAllCache = out;
    return out;
  }

  /** Mã phòng viết tắt: 'P.HN01' -> 'HN1', 'P.HCM01' -> 'HCM1'.
   *  Mã nội bộ trong data giữ dạng 2 chữ số (P.HN01) để khớp với khối
   *  TT_TVDT; NHÃNG HIỂN THỊ bỏ chữ số 0 vì không ai gọi phòng là "HN01". */
  function phongNgan(maPhong) {
    var s = maPhong ? String(maPhong) : '';
    if (!s) return '\u2014';
    return s.replace(/^P\./i, '').replace(/^([A-Za-z]+)0+(\d+)$/, '$1$2');
  }

  /** 4 thành phần của một dòng người, đúng thứ tự nhãn hiển thị. */
  function mgLabelParts(row) {
    if (!row) return ['—', '—', '—', '—'];
    return [
      row.ma_mg || '—',
      row.chuc_danh || '—',
      row.ho_ten || '—',
      phongNgan(row.ma_phong)
    ];
  }

  /** Nhãn 4 thành phần: "MG001 · CV TVĐT · Nguyễn Minh Anh · HN1" */
  function mgLabel(row) { return mgLabelParts(row).join(' · '); }

  function mgById(maMg) {
    var list = mgList();
    for (var i = 0; i < list.length; i++) if (list[i].ma_mg === maMg) return list[i];
    /* GĐTT / GĐ Khối chỉ có ở HH.quan_ly — select đổi người có cả nhóm này
     * nên phải tra được, nếu không setUser() sẽ từ chối mã đó. */
    var all = mgAll();
    for (var j = 0; j < all.length; j++) if (all[j].ma_mg === maMg) return all[j];
    return null;
  }

  /* =========================================================================
   * PHẠM VI CÂY QUẢN LÝ — dùng để chặn lộ dữ liệu ra ngoài tầm nhìn
   * -------------------------------------------------------------------------
   * Cây nằm ở window.HH.quan_ly (hh-data.js): 21 nút, mỗi nút có
   * ma_qlt (quản lý TRỰC TIẾP, null = gốc GDK01) và cap_below (CHỈ con trực
   * tiếp — KHÔNG phẳng, KHÔNG trộn cấp). Không có KPI.mo_gioi nào chứa cây.
   *
   * Mỗi màn MH02..MH05 chỉ được hiện người nằm trong tập HẬU DUỆ của người
   * đang xem (tập đó gồm cả chính nút gốc). Các hàm dưới đây là nguồn duy
   * nhất để lọc — KHÔNG tự dựng lại từ cap_below ở từng file màn hình, vì
   * sai một chỗ là lộ tên người ngoài cây.
   * ====================================================================== */

  var _cayCache = null;

  /** HH.quan_ly (21 nút). Cache vì cây không đổi trong phiên demo. */
  function cayQuanLy() {
    if (_cayCache) return _cayCache;
    var HH = global.HH;
    _cayCache = (HH && HH.quan_ly && typeof HH.quan_ly === 'object') ? HH.quan_ly : {};
    return _cayCache;
  }

  /**
   * Tập mã môi giới thuộc phạm vi của maXem = {maXem} ∪ hậu duệ.
   * Duyệt theo cap_below nên KHÔNG bao giờ vòng, kể cả dữ liệu rác.
   * Trả về null khi maXem không có trong cây (không đoán — caller tự xử lý).
   */
  function phamViCay(maXem) {
    var ql = cayQuanLy();
    if (!maXem || !ql[maXem]) return null;
    var ra = {};
    ra[maXem] = 1;
    var stack = [maXem];
    while (stack.length) {
      var x = stack.pop();
      var con = ql[x] && ql[x].cap_below;
      if (!con || !con.length) continue;
      for (var i = 0; i < con.length; i++) {
        var y = con[i];
        if (!y || ra[y] || !ql[y]) continue;
        ra[y] = 1;
        stack.push(y);
      }
    }
    return ra;
  }

  /** true nếu maDong nằm trong phạm vi cây của maXem. */
  function trongCay(maXem, maDong) {
    var p = phamViCay(maXem);
    return !!(p && maDong && p[maDong]);
  }

  /**
   * Danh sách môi giới trong phạm vi cây, giữ đúng thứ tự mgAll().
   * maXem không có trong cây → trả về [] (KHÔNG trả cả danh sách).
   */
  function mgTrongCay(maXem) {
    var p = phamViCay(maXem);
    if (!p) return [];
    return mgAll().filter(function (m) { return p[m.ma_mg]; });
  }

  /** Lọc một danh sách dòng dữ liệu (có trường ma_mg) theo phạm vi cây. */
  function locTheoCay(list, maXem) {
    var p = phamViCay(maXem);
    if (!p) return [];
    return (list || []).filter(function (r) { return r && p[r.ma_mg]; });
  }

  function phongById(maPhong) {
    var list = phongList();
    for (var i = 0; i < list.length; i++) if (list[i].ma_phong === maPhong) return list[i];
    return null;
  }

  function phongCua(maMg) {
    var mg = mgById(maMg);
    return mg ? phongById(mg.ma_phong) : null;
  }

  function tenPhong(maPhong) {
    var p = phongById(maPhong);
    return p ? p.ten_phong : (maPhong || '—');
  }

  function maKhoi(maPhong) {
    var p = phongById(maPhong);
    return p ? p.ma_khoi : null;
  }

  /** Chuỗi "CV TVĐT · cấp 2" */
  function chucDanhChuc(row) {
    if (!row) return '—';
    var cd = row.chuc_danh || '—';
    return (row.cap === null || row.cap === undefined) ? cd : cd + ' · cấp ' + row.cap;
  }

  /** Điểm chuẩn của một dòng, lấy từ lich_su của đúng kỳ, fallback tham số. */
  function diemChuan(row) {
    if (!row) return null;
    var ls = lichSu(row.ma_mg);
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].ky_nhan === row.ky_nhan) return isNum(ls[i].diem_chuan) ? ls[i].diem_chuan : null;
    }
    var tail = ls[ls.length - 1];
    if (tail && isNum(tail.diem_chuan) && (!row.ky_nhan || tail.ky_nhan === row.ky_nhan)) return tail.diem_chuan;
    var bang = (thamSo.diem_chuan || {})[row.chuc_danh + '|' + row.cap];
    if (bang && isNum(bang.FKP)) return bang.FKP;
    return null;
  }

  /**
   * LƯU Ý QUAN TRỌNG về cách sinh dữ liệu:
   *   ket_qua[].tong_diem là TỶ LỆ 0..1 (đã chia trọng số), không phải điểm tuyệt đối.
   *   Điểm tuyệt đối = tong_diem × diem_chuan. Màn hình nào cần "điểm" thì dùng
   *   hàm này, đừng in thẳng tong_diem (sẽ ra 1,02 thay vì 1.224).
   */
  function tongDiemDiem(row) {
    if (!row || !isNum(row.tong_diem)) return null;
    var dc = diemChuan(row);
    return isNum(dc) ? row.tong_diem * dc : null;
  }

  function tyLe(row) {
    if (!row) return null;
    if (isNum(row.ty_le_hoan_thanh)) return row.ty_le_hoan_thanh;
    var ls = lichSu(row.ma_mg);
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].ky_nhan === row.ky_nhan) return ls[i].ty_le_hoan_thanh;
    }
    return isNum(row.tong_diem) ? row.tong_diem : null;
  }

  /** Xếp loại theo tỷ lệ, dùng tham_so.nguong_xep_loai. */
  function gradeOf(tyLeHT) {
    if (!isNum(tyLeHT)) return null;
    var keys = Object.keys(nguongXL).sort(function (a, b) { return nguongXL[b] - nguongXL[a]; });
    for (var i = 0; i < keys.length; i++) {
      if (tyLeHT >= nguongXL[keys[i]]) return keys[i];
    }
    return keys.length ? keys[keys.length - 1] : null;
  }

  function xepLoaiOf(row) {
    if (!row) return null;
    return row.xep_loai || gradeOf(tyLe(row));
  }

  function chiTieu(row, maChiTieu) {
    if (!row || !Array.isArray(row.chi_tieu)) return null;
    for (var i = 0; i < row.chi_tieu.length; i++) {
      if (row.chi_tieu[i].ma_chi_tieu === maChiTieu) return row.chi_tieu[i];
    }
    return null;
  }

  function chiTieuList(row) { return (row && Array.isArray(row.chi_tieu)) ? row.chi_tieu : []; }

  /** Tách nhỏ FKP: phí Net → điểm phí, lãi vay → điểm lãi, AUM bq (chỉ theo dõi). */
  function fkpDetail(row) {
    var c = (row && row.chi_tiet_tai_chinh) || {};
    return {
      phi_net_trieu: isNum(c.phi_net_trieu) ? c.phi_net_trieu : null,
      diem_phi: isNum(c.diem_phi) ? c.diem_phi : null,
      lai_gdkq_thuc_thu_trieu: isNum(c.lai_gdkq_thuc_thu_trieu) ? c.lai_gdkq_thuc_thu_trieu : null,
      diem_lai: isNum(c.diem_lai) ? c.diem_lai : null,
      aum_bq_trieu: isNum(c.aum_bq_trieu) ? c.aum_bq_trieu : null,
      so_tai_khoan_quan_ly: isNum(c.so_tai_khoan_quan_ly) ? c.so_tai_khoan_quan_ly : null,
      co_so_lieu: !!(row && row.chi_tiet_tai_chinh)
    };
  }

  /** Tổng hợp cấp phòng — chỉ có sẵn cho kỳ hiện tại. */
  function tongHopPhong(kyId) {
    var id = kyId || state.kyId;
    var list = Array.isArray(KPI.tong_hop_phong) ? KPI.tong_hop_phong : [];
    return list.filter(function (t) { return !t.ky_id || t.ky_id === id; });
  }

  function coTongHopPhong(kyId) { return tongHopPhong(kyId).length > 0; }

  /** Môi giới thuộc một phòng (mặc định: phòng của người đang đăng nhập). */
  function mgOfPhong(maPhong) {
    var p = maPhong || (mgById(state.maMg) || {}).ma_phong;
    return mgList().filter(function (m) { return m.ma_phong === p; });
  }

  function tenKhoi(maPhong) {
    var k = maKhoi(maPhong);
    return k ? String(k).replace(/_/g, ' ') : '—';
  }

  /* ---- lọc / sắp xếp dùng chung cho các bảng ---- */

  function cmp(a, b) {
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a).localeCompare(String(b), 'vi');
    }
    return a - b;
  }

  function sortRows(list) {
    var s = state.sort;
    var out = (list || []).slice();
    out.sort(function (r1, r2) {
      var v = cmp(valueFor(r1, s.key), valueFor(r2, s.key));
      return s.dir === 'asc' ? v : -v;
    });
    return out;
  }

  function valueFor(row, key) {
    if (!row) return null;
    if (key === 'xep_loai') return xepLoaiOf(row);
    if (key === 'ty_le_hoan_thanh') return tyLe(row);
    if (key === 'tong_diem') return isNum(row.tong_diem) ? row.tong_diem : null;
    if (key === 'ho_ten') return row.ho_ten;
    if (key === 'ma_mg') return row.ma_mg;
    return row[key];
  }

  function filterRows(list, extra) {
    var f = state.filter, e = extra || {};
    var xepLoai = e.xep_loai || f.xep_loai;
    var maPhong = e.ma_phong || f.ma_phong;
    var q = deaccent(e.q !== undefined ? e.q : f.q || '').toString().trim().toLowerCase();
    return (list || []).filter(function (r) {
      if (xepLoai && xepLoai !== 'ALL' && xepLoaiOf(r) !== xepLoai) return false;
      if (maPhong && maPhong !== 'ALL' && r.ma_phong !== maPhong) return false;
      if (q) {
        var s = deaccent(r.ma_mg + ' ' + (r.ho_ten || '') + ' ' + (r.chuc_danh || '')).toLowerCase();
        if (s.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /** rows() + filter + sort — tiện cho cả 4 màn hình. */
  function bang(kyId, extra) {
    return sortRows(filterRows(rows(kyId), extra));
  }

  function thongKe(list) {
    var t = { tong: 0, dat: 0, A: 0, B: 0, C: 0, D: 0, tyLeTB: null };
    (list || []).forEach(function (r) {
      t.tong++;
      var g = xepLoaiOf(r), tl = tyLe(r);
      if (isNum(tl) && tl >= 1) t.dat++;
      if (t[g] !== undefined) t[g]++;
      t._sum = (t._sum || 0) + (isNum(tl) ? tl : 0);
    });
    if (t.tong) t.tyLeTB = (t._sum || 0) / t.tong;
    delete t._sum;
    return t;
  }

  /* =========================================================================
   * 3. SỰ KIỆN / TRẠNG THÁI
   * ====================================================================== */

  function on(evt, cb) {
    (listeners[evt] = listeners[evt] || []).push(cb);
    return function off() { App.off(evt, cb); };
  }

  function off(evt, cb) {
    var a = listeners[evt] || [];
    var i = a.indexOf(cb);
    if (i >= 0) a.splice(i, 1);
  }

  function emit(evt, payload) {
    (listeners[evt] || []).slice().forEach(function (cb) {
      try { cb(payload); } catch (e) { console.error(LOG, 'listener lỗi:', evt, e); }
    });
    // Kênh thứ hai: các file màn hình có thể nghe bằng DOM event
    try {
      document.dispatchEvent(new CustomEvent('app:' + evt, { detail: payload }));
    } catch (e) { /* CustomEvent không có trong trình duyệt quá cũ — bỏ qua */ }
  }

  /* state có getter không gán được (ma_mg, maPhong, phong...) — ghi maPhong
   * qua _maPhong cho an toàn. */
  var STATE_ALIAS = { maPhong: '_maPhong', ma_phong: '_maPhong', phong: '_maPhong', ma_mg: 'maMg' };

  function setState(patch, opts) {
    if (patch) {
      Object.keys(patch).forEach(function (k) {
        var real = STATE_ALIAS[k] || k;
        state[real] = patch[k];
      });
    }
    if (!opts || opts.render !== false) {
      save();
      render();
    }
    emit('state', state);
    return state;
  }

  function setSort(key) {
    state.sort = (state.sort.key === key)
      ? { key: key, dir: state.sort.dir === 'desc' ? 'asc' : 'desc' }
      : { key: key, dir: 'desc' };
    setState();
    return state.sort;
  }

  function setFilter(patch) {
    Object.keys(patch || {}).forEach(function (k) { state.filter[k] = patch[k]; });
    setState();
    return state.filter;
  }

  function resetFilter() {
    state.filter = { xep_loai: 'ALL', ma_phong: 'ALL', q: '' };
    setState();
  }

  /* ---- lưu kỳ + người dùng vào localStorage (demo đổi tab là nhớ) ---- */

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ kyId: state.kyId, maMg: state.maMg, screen: state.screen }));
    } catch (e) { /* chế độ ẩn danh / file:// — bỏ qua */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.kyId && kyById(s.kyId)) state.kyId = s.kyId;
      if (s.maMg && mgById(s.maMg)) state.maMg = s.maMg;
      if (s.screen && SCREEN_NAMES.indexOf(s.screen) >= 0) state.screen = s.screen;
    } catch (e) { /* dữ liệu hỏng — dùng mặc định */ }
  }

  /* =========================================================================
   * 4. QUẢN LÝ KỲ
   * ====================================================================== */

  function setKy(kyId, opts) {
    var id = kyById(kyId) ? kyId : kyMacDinh;
    if (id === state.kyId) return state.kyId;
    state.kyId = id;
    if (opts && opts.render === false) { save(); emit('ky', kyHienTai()); return id; }
    writeHash();                       // kỳ nằm trong hash → back/forward và deep-link giữ được
    render();
    emit('ky', kyHienTai());
    return id;
  }

  /** +1 = kỳ sau, -1 = kỳ trước. Ra ngoài biên thì đứng yên. */
  function stepKy(delta) {
    var i = kyIndex(state.kyId);
    var j = clamp(i + (delta > 0 ? 1 : -1), 0, danhSachKy.length - 1);
    if (j === i) return null;
    return setKy(danhSachKy[j].ky_id);
  }

  function kyKeTiep() { return stepKy(1); }
  function kyTruoc() { return stepKy(-1); }
  function kyVoiHienTai() { return setKy(kyMacDinh); }

  /* =========================================================================
   * 5. ĐIỀU HƯỚNG
   * ====================================================================== */

  function keyOf(screen, params) {
    var p = params || {};
    return screen + ':' + (p.ma_mg || '');
  }

  function currentKey() { return keyOf(state.screen, state.params); }

  /**
   * App.go(screen, params) — chuyển màn hình.
   *   screen: 'phong' | 'moigioi' | 'canhan' | 'khoi'
   *   params: { ma_mg:'MG003', kyId:'...' } — ma_mg tùy chọn, kyId tùy chọn.
   * Trả về key (screen + ':' + ma_mg) để tiện debug.
   */
  function go(screen, params) {
    if (SCREEN_NAMES.indexOf(screen) === -1) {
      console.warn(LOG, 'Không có màn hình "' + screen + '". Đang giữ nguyên: ' + state.screen);
      return currentKey();
    }
    var p = params || {};
    state.paramsByScreen[state.screen] = state.params;
    state.screen = screen;
    state.params = { ma_mg: p.ma_mg || (state.paramsByScreen[screen] || {}).ma_mg || null };
    if (p.kyId && kyById(p.kyId)) state.kyId = p.kyId;
    writeHash();
    render();
    emit('go', { screen: screen, params: state.params, key: currentKey() });
    return currentKey();
  }

  function buildHash() {
    var h = '#/' + state.screen;
    if (state.params && state.params.ma_mg) h += '/' + state.params.ma_mg;
    if (state.kyId !== kyMacDinh) h += '?ky=' + encodeURIComponent(state.kyId);
    return h;
  }

  function parseHash(hash) {
    var m = /^#\/([a-z]+)(?:\/([A-Za-z0-9_]+))?(?:\?ky=(.+))?$/.exec(hash || '');
    if (!m) return null;
    return {
      screen: m[1],
      ma_mg: m[2] || null,
      kyId: m[3] ? decodeURIComponent(m[3]) : null
    };
  }

  function writeHash() {
    var h = buildHash();
    if (global.location.hash !== h) global.location.hash = h;
  }

  function applyHash(push) {
    var t = parseHash(global.location.hash);
    if (!t || SCREEN_NAMES.indexOf(t.screen) === -1) return false;
    if (t.screen === state.screen &&
        (t.ma_mg || null) === (state.params.ma_mg || null) &&
        (!t.kyId || t.kyId === state.kyId)) return false;
    state.paramsByScreen[state.screen] = state.params;
    state.screen = t.screen;
    state.params = { ma_mg: t.ma_mg || (state.paramsByScreen[t.screen] || {}).ma_mg || null };
    if (t.kyId && kyById(t.kyId)) state.kyId = t.kyId;
    render();
    emit('go', { screen: t.screen, params: state.params, key: currentKey() });
    return true;
  }

  /* =========================================================================
   * 6. REGISTRY MÀN HÌNH + RENDER
   * ====================================================================== */

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /**
   * Tìm hàm render của một màn hình, chấp nhận nhiều cách đặt tên để khớp với
   * file màn hình viết song song. Thứ tự ưu tiên:
   *   1. App.screens[ten]
   *   2. window.renderPhong / window['render' + Tên]
   *   3. window.render_phong, window.renderPhongScreen
   *   4. window.ScreenPhong (hàm hoặc {render})
   */
  function resolveScreen(name) {
    var c = cap(name);
    var cand = [
      screens[name],
      global['render' + c],
      global['render_' + name],
      global['render' + c + 'Screen'],
      global['Screen' + c],
      global['screen_' + name]
    ];
    for (var i = 0; i < cand.length; i++) {
      var v = cand[i];
      if (typeof v === 'function') return v;
      if (v && typeof v.render === 'function') return v.render.bind(v);
    }
    return null;
  }

  function registerScreen(name, fn) {
    if (SCREEN_NAMES.indexOf(name) === -1) {
      console.warn(LOG, 'Đăng ký màn hình lạ: ' + name);
    }
    screens[name] = fn;
    if (booted && state.screen === name) renderScreen(name);
    return fn;
  }

  function buildContext(name) {
    var ky = kyHienTai();
    return {
      el: screenEl(name),
      screen: name,
      screenId: 'screen-' + name,
      kyId: state.kyId,
      ky: ky,
      kyNhan: kyLabel(state.kyId),
      params: state.params,
      ma_mg: state.params.ma_mg || null,
      data: KPI,
      App: App,
      // tiện ích chèn thẳng vào ctx cho màn hình khỏi phải gọi App.
      fmtNum: fmtNum, fmtNumAuto: fmtNumAuto, fmtTria: fmtTria, pct: pct, esc: esc,
      fmtDate: fmtDate, fmtDateTime: fmtDateTime, clamp: clamp,
      classOf: function (g) { return CLASS.xepLoai(g).join(' '); },
      // dữ liệu
      rows: rows, rowOf: rowOf, rowCuaToi: rowCuaToi, lichSu: lichSu,
      mgList: mgList, phongList: phongList, mgById: mgById, phongById: phongById,
      mgAll: mgAll, mgLabel: mgLabel, mgLabelParts: mgLabelParts, phongNgan: phongNgan,
      cayQuanLy: cayQuanLy, phamViCay: phamViCay, trongCay: trongCay,
      mgTrongCay: mgTrongCay, locTheoCay: locTheoCay,
      tenPhong: tenPhong, chucDanhChuc: chucDanhChuc,
      diemChuan: diemChuan, tongDiemDiem: tongDiemDiem, tyLe: tyLe,
      gradeOf: gradeOf, xepLoaiOf: xepLoaiOf, chiTieu: chiTieu, fkpDetail: fkpDetail,
      tongHopPhong: tongHopPhong, thongKe: thongKe, filterRows: filterRows, sortRows: sortRows,
      thamSo: thamSo, nguongXepLoai: nguongXL
    };
  }

  /* Select môi giới do file màn khác dựng (screen-canhan.js, screen-moigioi.js)
   * vẫn in nhãn cũ "MG001 · Nguyễn Minh Anh". Chuẩn hoá ở đây thay vì sửa từng
   * file: mọi <select> chọn môi giới đều ra đúng 4 thành phần, value giữ ma_mg.
   * Chạy sau mỗi lần dựng màn hình nên không cần các file màn khác biết App. */
  var MG_SELECT_IDS = ['userSelect', 'mh02MgSelect'];
  function chuanHoaSelectMg(root) {
    var scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    var sels = [];
    for (var i = 0; i < MG_SELECT_IDS.length; i++) {
      var s = document.getElementById(MG_SELECT_IDS[i]);
      if (s) sels.push(s);
    }
    if (scope.querySelectorAll) {
      var found = scope.querySelectorAll('select.cn-sel[data-act="canhan-mg"], select[data-act="canhan-mg"]');
      for (var j = 0; j < found.length; j++) if (sels.indexOf(found[j]) === -1) sels.push(found[j]);
    }
    for (var k = 0; k < sels.length; k++) {
      var sel = sels[k];
      var opts = sel.options;
      var cur = sel.value;
      for (var o = 0; o < opts.length; o++) {
        var opt = opts[o];
        if (!opt.value) continue;                      // option "Tất cả" / rỗng
        var lbl = mgLabel(mgById(opt.value) || { ma_mg: opt.value });
        if (opt.textContent !== lbl) opt.textContent = lbl;
      }
      if (cur && sel.value !== cur) sel.value = cur;
    }
  }

  function renderScreen(name) {
    var el = screenEl(name);
    if (!el) return;
    var ctx = buildContext(name);
    var fn = resolveScreen(name);
    try {
      if (fn) {
        if (fn.length === 0) fn();
        else fn(el, ctx);
      } else {
        el.innerHTML = fallbackHTML(name);
        console.warn(LOG, 'Chưa có hàm render cho màn hình "' + name +
          '". Dùng render' + cap(name) + '(el, ctx) hoặc App.registerScreen("' + name + '", fn).');
      }
      /* nhãn select môi giới: 4 thành phần, sau khi màn hình đã dựng xong */
      chuanHoaSelectMg(el);
    } catch (e) {
      console.error(LOG, 'Lỗi render màn hình "' + name + '":', e);
      el.innerHTML = '<div class="card loi"><b>Lỗi hiển thị màn hình ' + esc(name) + '.</b>'
        + '<pre>' + esc(e && e.message ? e.message : e) + '</pre></div>';
    }
  }

  /** Nội dung tối giản khi chưa có file màn hình — để demo vẫn chạy được. */
  function fallbackHTML(name) {
    var info = SCREEN_LIST.filter(function (s) { return s.ten === name; })[0] || { ten: name, tenHienThi: name, ma: '—' };
    var list = rows();
    var th = '<table class="table"><thead><tr>'
      + '<th>Mã MG</th><th>Họ tên</th><th>Chức danh</th><th>Phòng</th>'
      + '<th class="num">Tỷ lệ</th><th>Xếp loại</th><th class="num">Điểm</th></tr></thead><tbody>';
    var tb = list.map(function (r) {
      return '<tr><td>' + esc(r.ma_mg) + '</td><td>' + esc(r.ho_ten) + '</td>'
        + '<td>' + esc(chucDanhChuc(r)) + '</td><td>' + esc(tenPhong(r.ma_phong)) + '</td>'
        + '<td class="num">' + pct(tyLe(r)) + '</td>'
        + '<td class="' + CLASS.xepLoai(xepLoaiOf(r)).join(' ') + '">' + esc(xepLoaiOf(r) || '—') + '</td>'
        + '<td class="num">' + fmtNum(tongDiemDiem(r), 0) + '</td></tr>';
    }).join('');
    return '<div class="card bo-sung" title="Chưa nạp được file màn hình — hiển thị tối giản">'
      + '<h2>' + esc(info.ma) + ' · ' + esc(info.tenHienThi) + '</h2>'
      + '<p class="sub">' + esc(kyLabel()) + ' — ' + list.length + ' môi giới. '
      + '<em>Bảng tối giản: chưa nạp được file render của màn hình này.</em></p>'
      + th + tb + '</tbody></table></div>';
  }

  function screenEl(name) {
    return document.getElementById('screen-' + name) ||
      document.querySelector('main#main .screen[data-screen="' + name + '"]');
  }

  /* =========================================================================
   * 7. CHROME: header / tabs / chọn kỳ / user / footer
   * ====================================================================== */

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderHeader() {
    var ky = kyHienTai();
    var lbl = 'Kỳ KPI ' + (ky.nhan || ky.ky_id || '—') + ' · ' + fmtKyRange(ky);
    setText('kyHienTai', lbl);
    var mg = mgById(state.maMg) || {};
    setText('userName', mg.ho_ten || '—');
    setText('userRole', (mg.chuc_danh || '—') + (mg.cap !== null && mg.cap !== undefined ? ' · cấp ' + mg.cap : '')
      + ' · ' + (mg.ma_phong ? tenPhong(mg.ma_phong) : '—'));

    var chip = document.querySelector('.user-chip');
    if (chip) {
      chip.style.cursor = 'pointer';
      chip.title = 'Bấm để đổi người đang đăng nhập (demo)';
      if (!chip.getAttribute('data-app-bound')) {
        chip.setAttribute('data-app-bound', '1');
        chip.addEventListener('click', function () { openUserPicker(chip); });
      }
    }
    var sel = document.getElementById('userSelect');
    if (sel && sel.value !== state.maMg) {
      sel.value = state.maMg;
    }
  }

  function renderUserSwitch() {
    if (document.getElementById('userSelect')) return;         // đã có rồi
    var host = document.querySelector('.topbar-right');
    if (!host) return;
    var wrap = document.createElement('label');
    wrap.className = 'user-switch';
    wrap.title = 'Demo: đổi người đăng nhập để xem góc nhìn khác';
    var sel = document.createElement('select');
    sel.id = 'userSelect';
    sel.className = 'ky-select';
    sel.innerHTML = mgAll().map(function (m) {
      return '<option value="' + esc(m.ma_mg) + '"' + (m.ma_mg === state.maMg ? ' selected' : '') + '>'
        + esc(mgLabel(m)) + '</option>';
    }).join('');
    wrap.appendChild(document.createTextNode('Đang xem: '));
    wrap.appendChild(sel);
    host.appendChild(wrap);
    sel.addEventListener('change', function () { setUser(sel.value); });
  }

  /** Đổi người đang đăng nhập (demo). Chuyển màn hình cá nhân nếu đang xem. */
  function setUser(maMg) {
    var sel = document.getElementById('userSelect');
    if (!mgById(maMg)) {
      // 30/09/2026: mã không hợp lệ -> KHÔNG đổi state, nhưng PHẢI trả select
      // về đúng người đang chọn. Trước đây return sớm mà không đồng bộ lại,
      // khiến select hiện mã A còn màn hình vẫn dữ liệu của mã B — đúng loại
      // lộn lộn mà màn phân quyền cây quản lý phải chặn.
      if (sel && sel.value !== state.maMg) sel.value = state.maMg;
      return state.maMg;
    }
    state.maMg = maMg;
    if (sel && sel.value !== maMg) sel.value = maMg;
    state.paramsByScreen.canhan = { ma_mg: maMg };
    state.paramsByScreen.moigioi = { ma_mg: maMg };
    state.paramsByScreen.hoahong = { ma_mg: maMg };
    if (state.screen === 'canhan' || state.screen === 'moigioi' || state.screen === 'hoahong') {
      state.params = { ma_mg: maMg };
    }
    writeHash();
    render();
    emit('user', maMg);
    return maMg;
  }

  function openUserPicker(anchor) {
    var old = document.getElementById('appUserPicker');
    if (old) { old.parentNode.removeChild(old); return; }
    var box = document.createElement('div');
    box.id = 'appUserPicker';
    box.style.cssText = 'position:absolute;z-index:50;background:var(--surface-2,#1e293b);border:1px solid var(--border,#334155);'
      + 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.45);padding:6px;max-height:60vh;'
      + 'overflow:auto;min-width:280px;font-size:13px;color:var(--text,#f8fafc);';
    box.innerHTML = mgAll().map(function (m) {
      var p = mgLabelParts(m);
      return '<div class="picker-item" data-ma-mg="' + esc(m.ma_mg) + '" style="padding:6px 8px;cursor:pointer;'
        + 'border-radius:5px' + (m.ma_mg === state.maMg ? ';background:var(--brand-soft,rgba(56,189,248,0.15));color:var(--brand,#38bdf8);font-weight:600' : '') + '">'
        + esc(p[0]) + ' <span class="sub" style="color:var(--muted)">· ' + esc(p[1]) + ' · ' + esc(p[2])
        + ' · ' + esc(p[3]) + '</span></div>';
    }).join('');
    document.body.appendChild(box);
    var r = anchor.getBoundingClientRect();
    box.style.top = (r.bottom + global.scrollY + 6) + 'px';
    box.style.left = Math.max(8, r.right + global.scrollX - 300) + 'px';
    box.addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.picker-item') : null;
      if (it) { setUser(it.getAttribute('data-ma-mg')); box.parentNode.removeChild(box); }
    });
    setTimeout(function () {
      document.addEventListener('click', function h(e) {
        if (!box.contains(e.target)) { box.parentNode.removeChild(box); document.removeEventListener('click', h); }
      });
    }, 0);
  }

  function renderTabs() {
    var tabs = document.querySelectorAll('#tabs .tab[data-screen]');
    Array.prototype.forEach.call(tabs, function (tab) {
      var ten = tab.getAttribute('data-screen');
      var on_ = ten === state.screen;
      tab.classList.toggle(CLASS.tabActive, on_);
      tab.setAttribute('aria-current', on_ ? 'page' : 'false');
      if (on_) tab.setAttribute('aria-selected', 'true'); else tab.removeAttribute('aria-selected');
      if (!tab.getAttribute('data-app-bound')) {
        tab.setAttribute('data-app-bound', '1');
        tab.addEventListener('click', function () { go(ten); });
      }
    });
  }

  function renderKySwitch() {
    var host = document.getElementById('kySwitch');
    if (!host) return;
    var i = kyIndex(state.kyId);
    host.innerHTML = ''
      + '<span class="ky-label">Kỳ KPI</span>'
      + '<button class="ky-nav" type="button" data-app-ky="-1" title="Kỳ trước"'
      + (i <= 0 ? ' disabled' : '') + '>‹</button>'
      + '<select class="ky-select" id="kySelect" title="' + esc(kyLabel()) + '">'
      + danhSachKy.map(function (k, idx) {
        return '<option value="' + esc(k.ky_id) + '"' + (k.ky_id === state.kyId ? ' selected' : '') + '>'
          + 'Kỳ ' + (idx + 1) + ' · ' + esc(k.nhan || k.ky_id)
          + (k.ky_id === kyMacDinh ? ' — hiện tại' : '') + '</option>';
      }).join('')
      + '</select>'
      + '<button class="ky-nav" type="button" data-app-ky="1" title="Kỳ sau"'
      + (i >= danhSachKy.length - 1 ? ' disabled' : '') + '>›</button>'
      + '<span class="ky-note' + (coTongHopPhong() ? '' : ' ky-note-mat') + '" title="'
      + (coTongHopPhong() ? 'Kỳ này có dữ liệu tổng hợp phòng' : 'Kỳ này KHÔNG có dữ liệu tổng hợp phòng — màn hình khối sẽ trống')
      + '">' + (coTongHopPhong() ? fmtKyRange(kyHienTai()) : 'thiếu số liệu phòng') + '</span>';

    var sel = document.getElementById('kySelect');
    if (sel) sel.addEventListener('change', function () { setKy(sel.value); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-app-ky]'), function (b) {
      b.addEventListener('click', function () { stepKy(Number(b.getAttribute('data-app-ky'))); });
    });
  }

  function renderFooter() {
    setText('footerNguon', KPI._nguon_so || '—');
    setText('footerCapNhat', fmtDateTime(KPI.thoi_diem_cap_nhat));
    var f = document.querySelector('.footer');
    if (f) {
      f.title = KPI._canh_bao || '';
      var warn = f.querySelector('.footer-warn');
      if (KPI._canh_bao && !warn) {
        warn = document.createElement('span');
        warn.className = 'footer-warn dot';
        warn.textContent = '· ' + KPI._canh_bao;
        f.insertBefore(warn, f.firstChild);
      }
    }
  }

  /* =========================================================================
   * 8. RENDER TỔNG
   * ====================================================================== */

  function renderScreenContainers() {
    var secs = document.querySelectorAll('main#main .screen');
    Array.prototype.forEach.call(secs, function (s) {
      var ten = s.getAttribute('data-screen');
      var on_ = ten === state.screen;
      s.classList.toggle(CLASS.screenActive, on_);
      s.classList.toggle('is-active', on_);
      s.hidden = !on_;
      s.setAttribute('aria-hidden', on_ ? 'false' : 'true');
    });
    var main = document.getElementById('main');
    if (main) main.setAttribute('data-screen', state.screen);
  }

  function render() {
    var k = currentKey() + '|' + state.kyId;
    try {
      renderScreenContainers();
      renderHeader();
      renderTabs();
      renderKySwitch();
      renderUserSwitch();
      renderFooter();
      renderScreen(state.screen);
    } catch (e) {
      console.error(LOG, 'Lỗi render:', e);
    }
    if (k !== lastRenderKey) {
      lastRenderKey = k;
      emit('render', { screen: state.screen, params: state.params, kyId: state.kyId, key: currentKey() });
    }
  }

  function refresh() { lastRenderKey = null; render(); }

  /* =========================================================================
   * 9. KHỞI ĐỘNG
   * ====================================================================== */

  function bindGlobal() {
    if (global.__kpiAppBound) return;
    global.__kpiAppBound = true;

    global.addEventListener('hashchange', function () {
      // Bỏ qua nếu hash vừa do chính App ghi ra.
      var t = parseHash(global.location.hash);
      if (t && t.screen === state.screen
        && (t.ma_mg || null) === (state.params.ma_mg || null)
        && (!t.kyId || t.kyId === state.kyId)) return;
      applyHash();
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      var ae = d_act();
      if (tag === 'input' || tag === 'select' || tag === 'textarea'
        || (e.target && e.target.isContentEditable)
        || (ae && ae.tagName && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(ae.tagName) >= 0)) return;
      var i = '1234'.indexOf(e.key);
      if (i >= 0) { go(SCREEN_NAMES[i]); e.preventDefault(); return; }
      if (e.key === '[') { stepKy(-1); e.preventDefault(); }
      if (e.key === ']') { stepKy(1); e.preventDefault(); }
    });
  }

  function boot() {
    if (booted) return App;
    booted = true;
    load();
    bindGlobal();
    if (!parseHash(global.location.hash)) writeHash();
    else applyHash();
    render();
    return App;
  }

  function fatal(msg) {
    console.error(LOG, msg);
    try {
      var m = document.getElementById('main');
      if (m) m.innerHTML = '<div class="card loi"><b>Không khởi động được demo.</b><p>' + esc(msg) + '</p></div>';
    } catch (e) { /* bỏ qua */ }
  }

  /** document.activeElement — bọc riêng để chắc không vỡ trên trình duyệt cũ. */
  function d_act() {
    try { return document.activeElement; } catch (e) { return null; }
  }

  /* =========================================================================
   * 10. XUẤT BẢN
   * ====================================================================== */

  var App = {
    version: '1.0.0',
    KPI: KPI,
    state: state,
    screens: screens,
    CLASS: CLASS,
    SCREENS: SCREEN_LIST.slice(),
    SCREEN_NAMES: SCREEN_NAMES.slice(),

    // tiện ích
    fmtNum: fmtNum, fmtNumAuto: fmtNumAuto, fmtTria: fmtTria,
    pct: pct, esc: esc, clamp: clamp, deaccent: deaccent,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtKyRange: fmtKyRange,
    isNum: isNum, pad2: pad2,
    classOf: function (g) { return CLASS.xepLoai(g).join(' '); },
    classXL: function (g) { return CLASS.xepLoai(g).join(' '); },

    // dữ liệu
    thamSo: thamSo, nguongXepLoai: nguongXL,
    kyList: kyList, kyById: kyById, kyIndex: kyIndex, kyHienTai: kyHienTai,
    kyNhan: kyNhan, kyLabel: kyLabel, isKyHienTai: isKyHienTai,
    rows: rows, rowOf: rowOf, rowCuaToi: rowCuaToi, lichSu: lichSu,
    mgList: mgList, phongList: phongList, mgById: mgById, phongById: phongById,
    mgAll: mgAll, mgLabel: mgLabel, mgLabelParts: mgLabelParts, phongNgan: phongNgan,
    cayQuanLy: cayQuanLy, phamViCay: phamViCay, trongCay: trongCay,
    mgTrongCay: mgTrongCay, locTheoCay: locTheoCay,
    phongCua: phongCua, mgOfPhong: mgOfPhong, tenPhong: tenPhong, tenKhoi: tenKhoi,
    chucDanhChuc: chucDanhChuc,
    diemChuan: diemChuan, tongDiemDiem: tongDiemDiem, tyLe: tyLe,
    gradeOf: gradeOf, xepLoaiOf: xepLoaiOf, chiTieu: chiTieu, chiTieuList: chiTieuList,
    fkpDetail: fkpDetail, tongHopPhong: tongHopPhong, coTongHopPhong: coTongHopPhong,
    thongKe: thongKe, filterRows: filterRows, sortRows: sortRows, bang: bang,

    // dữ liệu khách hàng (window.KH — kh-data.js, có thể chưa nạp)
    get KH() { return global.KH || null; },
    khData: khData, khTheoKy: khTheoKy, khTongHop: khTongHop, khDanhSach: khDanhSach,

    // kỳ
    setKy: setKy, stepKy: stepKy, kyKeTiep: kyKeTiep, kyTruoc: kyTruoc,
    kyVoiHienTai: kyVoiHienTai,
    /* Bí danh các file màn hình đang gọi — giữ đúng tên gọi, cùng nghĩa. */
    getKy: kyById, kyHienTaiId: function () { return state.kyId; },
    danhSachKyHienTai: danhSachKy, danhSachKy: danhSachKy,

    // người dùng (getter sống — luôn khớp state.maMg)
    get user() { return mgById(state.maMg); },
    get role() { return (mgById(state.maMg) || {}).chuc_danh || null; },

    // icon: để các file màn hình không phải tự xử lý lucide
    icons: {},
    lucideCreateIcons: function () {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        try { global.lucide.createIcons(); } catch (e) { /* không có lucide là bình thường */ }
      }
    },

    // trạng thái
    on: on, off: off, emit: emit, setState: setState,
    setSort: setSort, setFilter: setFilter, resetFilter: resetFilter,
    setUser: setUser,

    // điều hướng + render
    go: go, key: keyOf, currentKey: currentKey,
    registerScreen: registerScreen, resolveScreen: resolveScreen,
    screenEl: screenEl, context: buildContext,
    render: render, refresh: refresh, boot: boot,

    // debug
    debug: function () {
      console.table({
        'screen': state.screen, 'kyId': state.kyId, 'ky': kyLabel(),
        'ma_mg': state.maMg, 'so_dong': rows().length, 'key': currentKey()
      });
      return { screen: state.screen, kyId: state.kyId, maMg: state.maMg, rows: rows().length };
    }
  };

  global.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
