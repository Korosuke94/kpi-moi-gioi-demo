/* =============================================================================
 * screen-hoahong.js — MH05 "Hoa hồng & PQL" (TẠM TÍNH)
 * -----------------------------------------------------------------------------
 * Dùng: window.ScreenHoaHong.render(el, ctx)   — app.js gọi fn(el, ctx)
 *       window.renderHoaHong(el, ctx)          — bí danh cho resolveScreen()
 * Biểu đồ nằm ở file RIÊNG: window.HHChart.augment(el, ctx) (screen-hoahong-chart.js)
 *
 * BỐ CỤC (3 bảng + 1 khối biểu đồ):
 *   1. Hoa hồng phí giao dịch — bảng từng khách hàng (7 cột)
 *   2. Hoa hồng dư nợ      — bảng từng khách hàng (7 cột)
 *   3. Phí quản lý PQL     — PHÂN NHÁNH theo chức danh người đang xem:
 *        (a) chuc_danh bắt đầu "TP"  → chi tiết theo từng môi giới trong phòng
 *        (b) chuc_danh chứa "GĐ"     → phần gián tiếp: bảng các phòng trực thuộc
 *        (c) môi giới thường          → dòng thông báo, KHÔNG vẽ bảng rỗng
 *   4. Khối biểu đồ (canvas hh-*) — do HHChart.augment vẽ sau innerHTML
 *
 * SỐ LIỆU (data/hh_schema.json — KHÔNG tự đặt tên trường):
 *   window.HH.theo_ky[MA_MG][KY_ID]   -> mảng dong_kh
 *   window.HH.theo_thang[MA_MG][KY_ID] -> mảng doanh_thu_thang
 *   window.HH.phong[MA_PHONG]         -> {ten_phong, truong_phong_ma_mg,
 *                                          doanh_thu_phi_net_trieu, so_mg}
 *   window.HH.quan_ly[MA_MG]           -> {phong_truc_thuoc:[], cap_below:[]}
 *   window.HH.ty_le_hh_giao_dich / ty_le_hhdn / ty_le_pql_truc_tiep /
 *   ty_le_pql_gian_tiep / ty_le_pql_gd_khoi  -> map chuc_danh -> tỷ lệ 0..1
 *   window.HH.tran_pql = 0.07 · ngung_kpi_quy = 0.8 · lai_suat_tham_chieu_nam
 *
 * MỌI SỐ TIỀN ĐỀU LÀ TRIỆU ĐỒNG — ghi rõ ở tiêu đề cột và card-sub.
 * window.HH CÓ THỂ CHƯA TỒN TẠI: khi đó hiện empty state, không để lỗi JS
 * làm sập màn hình (toàn bộ render bọc try/catch).
 * ========================================================================== */
(function (global) {
  'use strict';

  var DASH = '—';
  var ROOT_ID = 'screen-hoahong';

  /* Trạng thái riêng: sắp xếp + tìm kiếm cho 2 bảng (giữ khi đổi kỳ/người) */
  var st = {
    t1: { sort: 'hoa_hong_phi_trieu', dir: -1, q: '' },
    t2: { sort: 'hoa_hong_dn_trieu', dir: -1, q: '' },
    t3: { sort: 'dt', dir: -1 },   /* bảng PQL theo nhân viên (vai trò TP) */
    t4: { sort: 'dt', dir: -1 }    /* bảng PQL theo phòng (vai trò GĐ) */
  };

  var lastEl = null, lastCtx = null;

  /* ============================================================== helpers */
  function A() { return global.App || null; }
  function CH() { return global.KPICharts || null; }
  function HH() { return global.HH || null; }
  function doc() { return global.document || null; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function n0(v) { return v == null ? 0 : v; }

  function esc(s) {
    if (s === null || s === undefined) return '';
    var a = A();
    if (a && typeof a.esc === 'function') { try { return a.esc(s); } catch (e) { /* tự escape */ } }
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, d) {
    if (!isNum(v)) return DASH;
    var a = A();
    if (a && typeof a.fmtNum === 'function') { try { return a.fmtNum(v, d); } catch (e) { /* tự */ } }
    return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function n1(v) { return num(v, 1); }
  function n2(v) { return num(v, 2); }
  function n0s(v) { return num(v, 0); }
  function n2s(v) { return num(v, 2); }

  /* TỶ LỆ 0..1 → "65%" (bỏ chữ số 0 thừa khi tròn) */
  function fpct(v) {
    if (!isNum(v)) return DASH;
    var x = v * 100;
    var d = (Math.abs(x - Math.round(x)) < 0.05) ? 0 : 1;
    var a = A();
    if (a && typeof a.pct === 'function') { try { return a.pct(v, d); } catch (e) { /* tự */ } }
    return num(x, d) + '%';
  }
  function signedPct(v) { return (v > 0 ? '+' : '') + fpct(v); }

  function warn(tag, e) {
    if (global.console && global.console.warn) console.warn('[hoahong/' + tag + ']', e);
  }

  /* ---------------------------------------------------------------- dữ liệu */
  /* Tra người theo ma_mg. THỨ TỰ: HH.mo_gioi → HH.quan_ly → KPI.mo_gioi.
   * Lý do: GĐTT (GD01..GD03) và GĐ Khối (GDK01) CHỈ có trong HH.quan_ly, KHÔNG
   * có trong KPI.mo_gioi — không fallback thì nhánh GĐ không lấy được chức danh. */
  function mgById(maMg) {
    var h = HH();
    if (h) {
      var l = h.mo_gioi || [];
      for (var i = 0; i < l.length; i++) if (l[i].ma_mg === maMg) return l[i];
      var ql = h.quan_ly || {};
      if (ql[maMg]) {
        return {
          ma_mg: maMg, ho_ten: ql[maMg].ho_ten, chuc_danh: ql[maMg].chuc_danh,
          ma_phong: ql[maMg].ma_phong, cap_quan_ly: ql[maMg].cap_quan_ly
        };
      }
    }
    var a = A();
    if (a && typeof a.mgById === 'function') { try { return a.mgById(maMg); } catch (e) { /* tự */ } }
    var k = global.KPI || {};
    var l2 = k.mo_gioi || [];
    for (var j = 0; j < l2.length; j++) if (l2[j].ma_mg === maMg) return l2[j];
    return null;
  }
  function tenPhong(maPhong) {
    var a = A();
    if (a && typeof a.tenPhong === 'function') { try { var t = a.tenPhong(maPhong); if (t) return t; } catch (e) { /* tự */ } }
    var k = global.KPI || {};
    var l = k.phong || [];
    for (var i = 0; i < l.length; i++) if (l[i].ma_phong === maPhong) return l[i].ten_phong;
    return maPhong || DASH;
  }
  /* Mã môi giới ĐANG XEM (ctx.params.ma_mg), fallback về người đăng nhập. */
  function maMgXem(ctx) {
    if (ctx && ctx.params && ctx.params.ma_mg) return ctx.params.ma_mg;
    if (ctx && ctx.ma_mg) return ctx.ma_mg;
    var a = A();
    if (a && a.state) {
      if (a.state.params && a.state.params.ma_mg) return a.state.params.ma_mg;
      if (a.state.ma_mg) return a.state.ma_mg;
      if (a.state.maMg) return a.state.maMg;
    }
    return null;
  }
  function kyId(ctx) {
    if (ctx && ctx.kyId) return ctx.kyId;
    var a = A();
    if (a && typeof a.kyHienTaiId === 'function') { try { return a.kyHienTaiId(); } catch (e) { /* tự */ } }
    if (a && a.state) return a.state.kyId;
    var h = HH();
    return (h && h.ngay_tinh) ? null : null;
  }
  function kyNhan(kyId) {
    var a = A();
    if (a && typeof a.kyLabel === 'function') { try { var t = a.kyLabel(kyId); if (t) return t; } catch (e) { /* tự */ } }
    var k = global.KPI || {};
    var l = k.danh_sach_ky || [];
    for (var i = 0; i < l.length; i++) if (l[i].ky_id === kyId) return l[i].nhan;
    return kyId || DASH;
  }

  /* window.HH.theo_ky[maMg][kyId] — luôn trả mảng (không bao giờ undefined) */
  function rows(maMg, kyId) {
    var h = HH();
    if (!h || !h.theo_ky) return [];
    var a = h.theo_ky[maMg];
    if (!a) return [];
    var v = a[kyId];
    return Array.isArray(v) ? v : [];
  }
  /* theo_thang[maMg][kyId] có thể là MẢNG hoặc OBJECT khoá "YYYY-MM" (dữ liệu
   * thật là object). Luôn trả mảng đã sắp tăng dần, khớp với HHChart._thang. */
  function rowsThang(maMg, kyId) {
    var h = HH();
    if (!h || !h.theo_thang) return [];
    var a = h.theo_thang[maMg];
    if (!a) return [];
    var v = a[kyId];
    if (Array.isArray(v)) return v.filter(function (x) { return !!x; });
    if (v && typeof v === 'object') {
      var ks = [];
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && v[k]) ks.push(k);
      ks.sort();
      return ks.map(function (k) { return v[k]; });
    }
    return [];
  }
  function phongHH(maPhong) {
    var h = HH();
    return (h && h.phong && h.phong[maPhong]) ? h.phong[maPhong] : null;
  }
  function quanLy(maMg) {
    var h = HH();
    return (h && h.quan_ly && h.quan_ly[maMg]) ? h.quan_ly[maMg] : null;
  }
  /* Tra tỷ lệ theo chức danh. Nguồn khai báo CÓ HAI DẠNG:
   *   - map chức danh -> tỷ lệ: ty_le_hh_giao_dich, ty_le_hhdn,
   *     ty_le_pql_truc_tiep, ty_le_pql_gian_tiep
   *   - MỘT SỐ áp dụng cho mọi cấp: ty_le_pql_gd_khoi (0.005 — số, KHÔNG phải
   *     object). Tra theo m[chucDanh] trên số sẽ ra undefined → hiển thị 0%.
   * Nay nhận cả hai dạng. */
  function rate(mapName, chucDanh, dflt) {
    var h = HH();
    var m = h && h[mapName];
    if (isNum(m)) return m;                 /* dạng số áp dụng chung */
    if (m && isNum(m[chucDanh])) return m[chucDanh];
    if (m && chucDanh == null) {
      /* GĐ Khối không khoá theo chức danh: lấy số duy nhất nếu map chỉ có 1 mục. */
      var ks = Object.keys(m);
      if (ks.length === 1 && isNum(m[ks[0]])) return m[ks[0]];
    }
    return dflt == null ? 0 : dflt;
  }
  function tranPql() {
    var h = HH();
    return (h && isNum(h.tran_pql)) ? h.tran_pql : 0.07;
  }
  function nguongKpi() {
    var h = HH();
    return (h && isNum(h.nguong_kpi_quy)) ? h.nguong_kpi_quy : 0.8;
  }
  function laiSuatThamChieu() {
    var h = HH();
    return (h && isNum(h.lai_suat_tham_chieu_nam)) ? h.lai_suat_tham_chieu_nam : null;
  }

  /* Bản ghi PQL của 1 môi giới trong kỳ nếu window.HH có (đã tính sẵn
   * ty_le_hoan_thanh, du_dieu_kien_kpi_80, ty_le_pql_ap_dung, phi_quan_ly_trieu). */
  function pqlKy(maMg, kyId) {
    var h = HH();
    if (!h || !h.pql_theo_ky || !kyId) return null;
    var k = h.pql_theo_ky[kyId];
    return (k && k[maMg]) ? k[maMg] : null;
  }

  /* KPI quý đạt của 1 môi giới trong kỳ (0..1): HH.pql_theo_ky trước,
   * không có thì lấy từ data.js (ty_le_hoan_thanh). */
  function kpiRatio(maMg, kyId) {
    var pk = pqlKy(maMg, kyId);
    if (pk && isNum(pk.ty_le_hoan_thanh)) return pk.ty_le_hoan_thanh;
    var a = A();
    if (a && typeof a.rowOf === 'function') {
      try { var r = a.rowOf(maMg, kyId); if (r && isNum(r.ty_le_hoan_thanh)) return r.ty_le_hoan_thanh; } catch (e) { /* tự */ }
    }
    var k = global.KPI || {};
    var l = k.ket_qua_theo_ky && k.ket_qua_theo_ky[kyId];
    if (Array.isArray(l)) {
      for (var i = 0; i < l.length; i++) {
        if (l[i].ma_mg === maMg && isNum(l[i].ty_le_hoan_thanh)) return l[i].ty_le_hoan_thanh;
      }
    }
    return null;
  }

  /* Tổng của 1 trường trong danh sách khách */
  function sumField(list, f) {
    var s = 0;
    for (var i = 0; i < list.length; i++) if (isNum(list[i][f])) s += list[i][f];
    return s;
  }

  /* ============================================================ phân nhánh
   * (a) TP  → 'tp'   (b) GĐ → 'gd'   (c) môi giới thường → 'mg' */
  function vaiTro(chucDanh) {
    var s = String(chucDanh || '').toUpperCase();
    if (!s) return 'mg';
    if (s.indexOf('GĐ') >= 0 || s.indexOf('GIÁM ĐỐC') >= 0 || /^GD/.test(s) || s.indexOf('GĐT') >= 0) return 'gd';
    if (s.indexOf('TP') === 0 || s.indexOf('TRƯỞNG') >= 0 || s.indexOf('GIAM DOC') >= 0) return 'tp';
    return 'mg';
  }

  /* ================================================================ CSS */
  var STYLE_ID = 'kpi-style-hoahong';
  var CSS = [
    '#screen-hoahong .hh-sec{margin-top:var(--sp-4,16px);}',
    '#screen-hoahong .hh-cap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    /* bảng */
    '#screen-hoahong .hh-tblwrap{overflow:auto;max-height:460px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);}',
    '#screen-hoahong .hh-tbl{width:100%;border-collapse:collapse;font-size:var(--fs-table,13px);}',
    '#screen-hoahong .hh-tbl th,#screen-hoahong .hh-tbl td{padding:8px 12px;',
    '  border-bottom:1px solid var(--border-soft);white-space:nowrap;}',
    '#screen-hoahong .hh-tbl thead th{position:sticky;top:0;z-index:2;background:var(--surface-2);',
    '  color:var(--muted);font-weight:600;font-size:var(--fs-small,12px);text-align:left;}',
    '#screen-hoahong .hh-tbl thead th.sortable{cursor:pointer;user-select:none;}',
    '#screen-hoahong .hh-tbl thead th.sortable:hover{color:var(--text);}',
    '#screen-hoahong .hh-tbl thead th[data-dir="1"]::after{content:" ▲";color:var(--cam);font-size:10px;}',
    '#screen-hoahong .hh-tbl thead th[data-dir="-1"]::after{content:" ▼";color:var(--cam);font-size:10px;}',
    '#screen-hoahong .hh-tbl td.num,#screen-hoahong .hh-tbl th.num{text-align:right;',
    '  font-variant-numeric:tabular-nums;}',
    '#screen-hoahong .hh-tbl tbody tr:hover{background:var(--row-hover);}',
    '#screen-hoahong .hh-tbl tfoot td{position:sticky;bottom:0;background:var(--surface-2);',
    '  font-weight:700;border-top:1px solid var(--border);}',
    '#screen-hoahong .hh-ma{color:var(--muted);font-size:var(--fs-small,12px);}',
    /* ô số 0 trần trụi / dòng không đủ điều kiện */
    '#screen-hoahong .hh-khong{color:var(--muted);font-size:var(--fs-small,12px);}',
    '#screen-hoahong .hh-zero{color:var(--muted);}',
    /* bộ lọc */
    '#screen-hoahong .hh-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
    '#screen-hoahong .hh-filter label{font-size:var(--fs-small,12px);color:var(--muted);}',
    '#screen-hoahong .hh-filter input,#screen-hoahong .hh-filter select{height:28px;padding:0 8px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);background:var(--surface);',
    '  color:var(--text);font-family:inherit;font-size:var(--fs-small,12px);}',
    '#screen-hoahong .hh-filter input{min-width:150px;}',
    /* chip tỷ lệ */
    '#screen-hoahong .hh-chip{display:inline-flex;align-items:center;gap:6px;min-height:24px;',
    '  padding:4px 9px;border-radius:999px;border:1px solid var(--border);',
    '  background:var(--surface-2);color:var(--muted);font-size:var(--fs-small,12px);}',
    '#screen-hoahong .hh-chip.on{border-color:var(--cam);color:var(--cam-ink);background:var(--cam-soft);}',
    '#screen-hoahong .hh-chip.warn{border-color:var(--c);color:var(--c-ink,var(--c));background:var(--c-soft);}',
    /* dòng nhắc nhở chính sách */
    '#screen-hoahong .hh-rules{margin:var(--sp-3,12px) 0 0;padding:var(--sp-3,12px) var(--sp-3,12px) var(--sp-3,12px) 28px;',
    '  border:1px solid var(--border-strong);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface-2);font-size:var(--fs-small,12px);color:var(--muted);line-height:1.6;}',
    '#screen-hoahong .hh-rules b{color:var(--text);}',
    '#screen-hoahong .hh-note{font-size:var(--fs-small,12px);color:var(--muted);margin-top:var(--sp-2,8px);line-height:1.55;}',
    '#screen-hoahong .hh-chartgrid{display:grid;gap:var(--sp-4,16px);',
    '  grid-template-columns:repeat(2,minmax(0,1fr));}',
    '@media (max-width:1000px){#screen-hoahong .hh-chartgrid{grid-template-columns:minmax(0,1fr);}}',
    '#screen-hoahong .hh-chartcell{min-width:0;}',
    '#screen-hoahong .hh-alert{border:1px solid var(--c);background:var(--c-soft);color:var(--text);',
    '  border-radius:var(--radius-sm,6px);padding:var(--sp-3,12px);font-size:var(--fs-small,12px);line-height:1.6;}',
    /* alert nhẹ — thông tin bổ sung, không phải lỗi */
    '#screen-hoahong .hh-alinh-soft{border-color:var(--border);background:var(--surface-2);',
    '  color:var(--muted);margin-top:var(--sp-3,12px);}',
    /* --- Vùng TẠM TÍNH (đầu màn) --- */
    '#screen-hoahong .hh-tamtinh table.hh-tbl-tamtinh{font-size:var(--fs-table,13px);}',
    '#screen-hoahong .hh-tamtinh td.hh-tamtinh-note,',
    '#screen-hoahong .hh-tamtinh .hh-tamtinh-note{margin-top:3px;color:var(--muted);',
    '  font-size:var(--fs-small,12px);font-weight:400;white-space:normal;max-width:520px;}',
    '#screen-hoahong .hh-tamtinh tfoot td{font-size:var(--fs-table,13px);}',
    '#screen-hoahong .hh-tamtinh-ok{color:var(--cam);font-weight:600;}',
    '#screen-hoahong .hh-tamtinh-no{color:var(--c);font-weight:600;}',
    '#screen-hoahong .hh-tamtinh-dash{color:var(--muted);}',
    /* tile TỔNG: số to như các màn khác, khung nhấn để tách khỏi bảng bên dưới */
    '#screen-hoahong .hh-tamtinh .tile-value{font-variant-numeric:tabular-nums;',
    '  letter-spacing:-0.01em;}',
    '#screen-hoahong .hh-tamtinh .tile.tom{background:var(--c-soft);border-color:var(--c);}',
    '#screen-hoahong .hh-tamtinh .tile.tom .tile-value{color:var(--c);}',
    /* Ô lớn mỗi khoản: 3 cột x 2 hàng cho 6 ô (kpi-tiles mặc định 4 cột →
     * 4+2 lệch). Bỏ nowrap/ellipsis của .tile-label: "Hoa hồng phí giao dịch"
     * bị cắt thành "Hoa hồng phí giao dịc…" ở nhãn 1 dòng. */
    '#screen-hoahong .hh-tt-grid{grid-template-columns:repeat(3,minmax(0,1fr));',
    '  gap:var(--sp-3,12px);}',
    '#screen-hoahong .hh-tt-grid .tile-label{white-space:normal;overflow:visible;',
    '  text-overflow:clip;line-height:1.3;letter-spacing:0.2px;}',
    '#screen-hoahong .hh-tt-grid .tile-sub{min-height:32px;}',
    /* số 0 ở giữa không phải lỗi — tô xám để khỏi đọc nhầm là số liệu thật */
    '#screen-hoahong .hh-tt-grid .tile.tt-r .tile-value{color:var(--muted);}',
    '#screen-hoahong .hh-tt-grid .tile.tt-up .tile-value{color:var(--cam);}',
    '#screen-hoahong .hh-tt-grid .tile.tom{grid-column:1 / -1;}',
    '@media (max-width:1100px){#screen-hoahong .hh-tt-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}',
    '@media (max-width:640px){#screen-hoahong .hh-tt-grid{grid-template-columns:1fr;}}',
    /* --- Badge dữ liệu giả + bảng điểm mở (DM01–DM08) --- */
    '#screen-hoahong .card-head{display:flex;align-items:flex-start;gap:var(--sp-3,12px);}',
    '#screen-hoahong .card-head > div:first-child{min-width:0;flex:1;}',
    '#screen-hoahong .hh-badge-gia{flex:none;align-self:flex-start;',
    '  display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
    '  font-size:var(--fs-small,12px);font-weight:600;letter-spacing:.02em;white-space:nowrap;',
    '  border:1px solid var(--c-warn,var(--c));background:var(--c-warn-soft,var(--c-soft));color:var(--c-warn,var(--c));}',
    '#screen-hoahong .hh-dm-wrap{margin-top:var(--sp-4,16px);}',
    '#screen-hoahong .hh-dm-head{display:flex;align-items:center;gap:8px;width:100%;',
    '  background:transparent;border:0;padding:6px 0;cursor:pointer;text-align:left;',
    '  font:inherit;font-size:var(--fs-small,12px);font-weight:600;color:var(--muted);}',
    '#screen-hoahong .hh-dm-head:hover{color:var(--text);}',
    '#screen-hoahong .hh-dm-head:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:2px;border-radius:4px;}',
    '#screen-hoahong .hh-dm-chev{transition:transform .18s ease;flex:none;}',
    '#screen-hoahong .hh-dm-toggle[aria-expanded="true"] .hh-dm-chev{transform:rotate(90deg);}',
    '#screen-hoahong .hh-dm-body{margin-top:6px;display:grid;gap:var(--sp-2,8px);}',
    '#screen-hoahong .hh-dm-body[hidden]{display:none;}',
    '#screen-hoahong .hh-dm-item{border:1px solid var(--border-strong);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface-2);padding:var(--sp-3,12px);}',
    '#screen-hoahong .hh-dm-t{font-size:var(--fs-small,12px);font-weight:600;color:var(--text);line-height:1.5;}',
    '#screen-hoahong .hh-dm-t b{color:var(--accent);font-family:var(--font-mono,ui-monospace,monospace);margin-right:6px;}',
    '#screen-hoahong .hh-dm-n{font-size:var(--fs-small,12px);color:var(--muted);line-height:1.6;margin-top:4px;}',
    '#screen-hoahong .hh-dm-x{font-size:var(--fs-small,12px);color:var(--muted);line-height:1.6;margin-top:6px;',
    '  padding-top:6px;border-top:1px dashed var(--border);}',
    '#screen-hoahong .hh-dm-x b{color:var(--text);}',
    '#screen-hoahong .hh-dm-src{font-size:11px;color:var(--muted);opacity:.85;margin-top:4px;font-style:italic;}',
    '#screen-hoahong .hh-dm-st{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:var(--radius-pill);',
    '  font-size:var(--fs-micro,11px);font-weight:600;border:1px solid var(--a);',
    '  background:var(--a-soft);color:var(--a);}',
    '#screen-hoahong .hh-dm-q{font-size:var(--fs-small);color:var(--text);line-height:var(--lh);',
    '  margin-top:6px;padding:var(--sp-1) var(--sp-2);border-left:2px solid var(--a);',
    '  background:var(--surface-2);border-radius:0 var(--radius-sm) var(--radius-sm) 0;}',
    '#screen-hoahong .hh-dm-q b{color:var(--a);}',
    '#screen-hoahong .hh-dm-when{color:var(--muted);font-size:var(--fs-micro);}',
    '#screen-hoahong .hh-dm-chot{border-color:var(--a);}',
    '#screen-hoahong .hh-dm-chot .hh-dm-x{display:none;}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ====================================================== helper popover (i)
   * Dùng UIPop.footnote nếu có; nếu không có ui-popover.js thì lùi về
   * .card-sub với nội dung gọn (KHÔNG tự dựng popover mới). */
  function fn(noiDungHTML, inlineText, id) {
    var up = global.UIPop;
    if (up && typeof up.footnote === 'function') {
      try {
        return up.footnote(noiDungHTML, {
          id: id,
          inlineHTML: inlineText ? esc(inlineText) : '',
          label: 'Xem cách tính',
          side: 'right', width: '380px'
        }) || '';
      } catch (e) { /* lùi xuống card-sub */ }
    }
    var plain = String(noiDungHTML || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return '<span class="card-sub">' + esc(plain) + '</span>';
  }

  function emptyBox(msg) {
    var C = CH();
    if (C && typeof C.empty === 'function') { try { return C.empty(msg); } catch (e) { /* tự */ } }
    return '<div class="chart-empty">' + esc(msg) + '</div>';
  }

  /* ======================================== PHẦN 0 — TẠM TÍNH (5 khoản thu)
   * Vùng đặt TRÊN ĐẦU màn [Hoa hồng & PQL], gom đúng 5 khoản anh chốt 30/09/2026:
   *   1 Lương cấp bậc · 2 Thưởng hiệu suất · 3 Hoa hồng phí giao dịch
   *   4 Hoa hồng dư nợ · 5 Phí quản lý
   *
   * NGUỒN — không tự tính lại ở UI:
   *   lương cấp bậc / thưởng hiệu suất → window.KH.luong_cap_bac["<chức danh>|<cấp>"]
   *     (nhúng nguyên văn từ data/kpi_config.json, nguồn sự thật duy nhất;
   *      giá trị null = DOCX không ghi số → hiện DASH, KHÔNG bịa 0)
   *   quyết thưởng hiệu suất → tỷ lệ hoàn thành của chính kỳ đang xem, đọc
   *     window.KPI.ket_qua_theo_ky[kyId][*].ty_le_hoan_thanh. Ngưỡng 1,0 do anh chốt
   *     30/09/2026 (KHÔNG phải ngưỡng 0,8 của PQL).
   *   hoa hồng phí giao dịch / dư nợ → cộng window.HH.theo_ky[ma][ky].hoa_hong_*
   *   phí quản lý → window.HH.pql_theo_ky[ky][ma].phi_quan_ly_trieu (môi giới
   *     thường không có PQL theo PL03 → 0, hiện rõ bằng ghi chú).
   */
  function khoaLuang(cd, cap) {
    var kh = global.KH || null;
    var m = kh && kh.luong_cap_bac;
    if (!m || !cd) return null;
    var k = (cap === null || cap === undefined || cap === '') ? (cd + '|*') : (cd + '|' + cap);
    return m[k] || m[cd + '|*'] || null;
  }
  /* Tỷ lệ hoàn thành của 1 người trong kỳ. null = không có kết quả KPI. */
  function tyLeHoanThanh(maMg, kyId) {
    var k = global.KPI || null;
    var kt = k && k.ket_qua_theo_ky;
    if (!kt) return null;
    var list = kt[kyId];
    if (!list) return null;
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].ma_mg === maMg) return list[i].ty_le_hoan_thanh;
      return null;
    }
    if (typeof list === 'object' && list[maMg]) return list[maMg].ty_le_hoan_thanh;
    return null;
  }
  function phanTamTinh(maMg, kyId) {
    var mg = maMg ? (mgById(maMg) || {}) : {};
    var cd = mg.chuc_danh || null;
    /* Cấp: ưu tiên chính kết quả KPI của kỳ (nơi chấm điểm), fallback về
     * danh sách môi giới. KHÔNG dùng cap_quan_ly — đó là nhãn cây quản lý
     * (CT/NV/TP/GD), không phải cấp chức danh trong bảng lương PL02. */
    var cap = null;
    var kt = (global.KPI || {}).ket_qua_theo_ky;
    var lst = kt && kt[kyId];
    if (Array.isArray(lst)) {
      for (var i = 0; i < lst.length; i++) if (lst[i] && lst[i].ma_mg === maMg) { cap = lst[i].cap; break; }
    } else if (lst && typeof lst === 'object' && lst[maMg]) { cap = lst[maMg].cap; }
    if (cap === null || cap === undefined) cap = (mg.cap !== undefined) ? mg.cap : null;

    var lv = khoaLuang(cd, cap);
    var luong = lv ? lv.luong_cap_bac : null;
    var hsGoc = lv ? lv.thuong_hieu_suat : null;

    var tlr = tyLeHoanThanh(maMg, kyId);
    var datKpi = (isNum(tlr) && tlr >= 1);
    var hs = hsGoc;
    var hsGhiChu = '';
    if (hsGoc === null || hsGoc === undefined) {
      hs = null;
      hsGhiChu = '<span class="hh-tamtinh-dash">' + DASH + '</span> — PL02 không ghi số cho chức danh này';
    } else {
      hs = datKpi ? hsGoc : 0;
      hsGhiChu = datKpi
        ? '<span class="hh-tamtinh-ok">Đạt KPI</span> (hoàn thành ' + fpct(tlr) + ') → hưởng ' + n0s(hsGoc) + ' triệu'
        : (hsGoc === 0
            ? 'PL02 ghi thưởng hiệu suất = 0 cho cấp này'
            : '<span class="hh-tamtinh-no">Chưa đạt KPI</span> (hoàn thành ' + fpct(tlr) +
              ') → không hưởng ' + n0s(hsGoc) + ' triệu');
    }

    var rw = rows(maMg, kyId);
    var hhPhi = sumField(rw, 'hoa_hong_phi_trieu');
    var hhDn = sumField(rw, 'hoa_hong_dn_trieu');

    /* Phí quản lý: môi giới thường không có PQL (PL03). Lấy đúng dòng PQL
     * của chính người đó; vắng mặt = 0 và phải nói rõ, không hiện số 0 trần. */
    var pq = 0, pqCo = true, pqLy = '';
    var pk = (HH() || {}).pql_theo_ky;
    var pr = pk && pk[kyId] ? pk[kyId][maMg] : null;
    if (pr && isNum(pr.phi_quan_ly_trieu)) { pq = pr.phi_quan_ly_trieu; pqLy = pr._ly_pql || ''; }
    else {
      pqCo = false;
      pqLy = 'Chức danh này không phát sinh phí quản lý theo PL03';
    }

    var tong = (luong || 0) + (hs || 0) + hhPhi + hhDn + pq;
    var thieu = [];
    if (luong === null || luong === undefined) thieu.push('lương cấp bậc');
    if (!isNum(tlr)) thieu.push('tỷ lệ hoàn thành KPI');
    if (!pqCo) thieu.push('phí quản lý');

    var h = [];
    h.push('<div class="card hh-sec hh-tamtinh" data-hh-tamtinh-card="1">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">TẠM TÍNH — thu nhập của người đang xem</div>');
    h.push('      <div class="card-sub">Đơn vị: <b>TRIỆU ĐỒNG</b> · kỳ <b>' + esc(kyNhan(kyId)) + '</b>' +
      (cd ? ' · <b>' + esc(cd) + '</b>' + (cap !== null ? ' cấp ' + esc(cap) : '') : '') +
      ' · lương và thưởng hiệu suất theo Phụ lục 02 Chính sách KD 18.8.2026.</div></div>');
    h.push('    <span class="hh-badge-gia" role="note">DỮ LIỆU GIẢ — tạm tính minh họa</span>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!maMg) {
      h.push('    <div class="hh-alert">Chưa chọn môi giới nên chưa tính được tạm tính.</div>');
      h.push('  </div></div>');
      return h.join('');
    }
    if (thieu.length === 3) {
      h.push('    <div class="hh-alert"><b>Chưa có số lương cho chức danh này.</b> ' +
        'Phụ lục 02 của Chính sách KD 18.8.2026 không ghi ở cột <b>Lương cấp bậc</b> cho <b>' +
        esc(cd || 'chức danh này') + '</b>, và không có kết quả KPI trong kỳ. ' +
        'Các khoản hoa hồng bên dưới vẫn tính bình thường.</div>');
    }

    /* Ô LỚN — mỗi khoản thu MỘT ô riêng, đúng kiểu các màn khác
     * (screen-canhan.js:774 dùng kpi-tiles/tile/tile-value). Ô tổng đứng
     * cuối. KHÔNG dựng bảng 5 cột nữa: bảng lặp lại y hệt số đã hiện ở ô lớn,
     * người dùng phải đọc hai lần. Ghi chú căn cứ chuyển vào .tile-sub. */
    h.push('    <div class="kpi-tiles hh-tt-grid">');
    var oKhoan = [
      { nhan: 'Lương cấp bậc', g: luong,
        sub: isNum(luong) ? 'PL02 · ' + esc(cd) + ' cấp ' + esc(cap)
                         : '<span class="hh-tamtinh-dash">PL02 không ghi số cho chức danh này</span>',
        khoa: 'luong', cls: '' },
      { nhan: 'Thưởng hiệu suất', g: hs, sub: hsGhiChu, khoa: 'thuong',
        cls: (isNum(hs) && hs > 0) ? 'up' : (isNum(hs) ? '' : 'r') },
      { nhan: 'Hoa hồng phí giao dịch', g: hhPhi,
        sub: 'Cộng ' + n0s(rw.length) + ' dòng khách hàng trong kỳ', khoa: 'hhphi', cls: '' },
      { nhan: 'Hoa hồng dư nợ', g: hhDn,
        sub: 'Tính trên phần chênh lãi suất thực tế và tham chiếu', khoa: 'hhdn', cls: '' },
      { nhan: 'Phí quản lý', g: pqCo ? pq : 0,
        sub: pqCo ? esc(pqLy || 'Theo tỷ lệ phí quản lý của chức danh')
                  : '<span class="hh-khong">Không phát sinh — PL03</span>',
        khoa: 'pql', cls: '' }
    ];
    for (var oi = 0; oi < oKhoan.length; oi++) {
      var o = oKhoan[oi];
      var gHien = isNum(o.g) ? n1(o.g) : DASH;
      h.push('      <div class="tile tt-khoan' + (o.cls ? ' tt-' + o.cls : '') + '">');
      h.push('        <div class="tile-label">' + o.nhan + '</div>');
      h.push('        <div class="tile-value"' +
             ' data-hh-tamtinh="' + o.khoa + '">' + gHien + '</div>');
      h.push('        <div class="tile-sub">' + o.sub + '</div>');
      h.push('      </div>');
    }
    /* Ô TỔNG — đậm, viền nhấn, tách khỏi 5 ô trên. */
    h.push('      <div class="tile tom">');
    h.push('        <div class="tile-label">TỔNG TẠM TÍNH</div>');
    h.push('        <div class="tile-value" data-hh-tamtinh="tong">' + n1(tong) + '</div>');
    h.push('        <div class="tile-sub">TRIỆU ĐỒNG · kỳ ' + esc(kyNhan(kyId)) + '</div>');
    h.push('      </div>');
    h.push('    </div>');
    h.push('    <p class="hh-note">Tổng = lương cấp bậc + thưởng hiệu suất + hoa hồng phí giao dịch + ' +
           'hoa hồng dư nợ + phí quản lý. Mọi số tiền tính bằng <b>TRIỆU ĐỒNG</b>.</p>');

    if (!isNum(tlr)) {
      h.push('    <div class="hh-alert hh-alinh-soft">Không có kết quả KPI cho kỳ này nên <b>chưa quyết được thưởng hiệu suất</b>. ' +
        'Chỉ các khoản cố định và hoa hồng mới tính được.</div>');
    }
    h.push('  </div></div>');
    return h.join('');
  }

  /* ============================================ PHẦN 1 — Hoa hồng phí giao dịch */
  var T1_COLS = [
    { k: 'ho_ten', ten: 'Khách hàng', num: false },
    /* ĐƠN VỊ: GTGD tính bằng TỶ VNĐ; phí và hoa hồng tính bằng TRIỆU VNĐ. */
    { k: 'doanh_so_giao_dich_ty', ten: 'Giá trị GD (tỷ VNĐ)', num: true, f: 2 },
    { k: 'phi_giao_dich_trieu', ten: 'Phí giao dịch (triệu VNĐ)', num: true, f: 2 },
    { k: 'phi_truoc_so_trieu', ten: 'Phí trả sở (triệu VNĐ)', num: true, f: 2 },
    { k: 'phi_net_trieu', ten: 'Phí Net (triệu VNĐ)', num: true, f: 2, b: true },
    { k: 'ty_le_hoa_hong', ten: 'Tỷ lệ HH', num: true, pct: true },
    { k: 'hoa_hong_phi_trieu', ten: 'Hoa hồng (triệu VNĐ)', num: true, f: 2, b: true }
  ];

  function sortList(list, s) {
    var k = s.sort, d = s.dir;
    return list.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string' || typeof y === 'string') {
        return d * String(x || '').localeCompare(String(y || ''), 'vi');
      }
      return d * ((isNum(y) ? y : 0) - (isNum(x) ? x : 0));
    });
  }
  function filterQ(list, q) {
    var t = String(q || '').trim().toLowerCase();
    if (!t) return list;
    return list.filter(function (r) {
      return String(r.ho_ten || '').toLowerCase().indexOf(t) >= 0
        || String(r.ma_kh || '').toLowerCase().indexOf(t) >= 0;
    });
  }
  function th(col, tbl) {
    var s = tbl === 1 ? st.t1 : st.t2;
    var d = (s.sort === col.k) ? s.dir : 0;
    return '<th class="' + (col.num ? 'num ' : '') + 'sortable" data-act="hh-sort" data-t="' + tbl +
      '" data-k="' + esc(col.k) + '" data-dir="' + d + '">' + esc(col.ten) + '</th>';
  }

  function phan1(maMg, kyId) {
    var rs = rows(maMg, kyId);
    var s = st.t1;
    var list = sortList(filterQ(rs, s.q), s);
    var C = CH();
    var h = [];

    /* data-hh-card="t1" — neo để paintTables() tìm đúng card này khi người
     * dùng đang gõ tìm kiếm. KHÔNG đánh số theo vị trí: vùng TẠM TÍNH có
     * thể không dựng (thiếu ma_mg) → chỉ số card lệch → sửa nhầm card. */
    h.push('<div class="card hh-sec" data-hh-card="t1">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">1 · Hoa hồng phí giao dịch</div>');
    h.push('      <div class="card-sub">Đơn vị: cột <b>Giá trị giao dịch</b> tính bằng <b>TỶ đồng</b>; phí, phí trả sở, phí Net và hoa hồng tính bằng <b>TRIỆU đồng</b> (trừ cột tỷ lệ) · mỗi dòng là 1 khách hàng của môi giới đang xem · bấm đầu cột để sắp xếp. ' +
           fn('<b>Công thức:</b> Phí Net = Phí giao dịch − Phí trả sở; Hoa hồng = Phí Net × tỷ lệ HH của chức danh.<br>' +
              'Tỷ lệ HH cố định theo bảng tham số (Phụ lục 03), KHÔNG lũy tiến.',
              'Cách tính', 'hh-fn-t1') + '</div></div>');
    h.push('    <div class="hh-filter">');
    h.push('      <label for="hhQ1">Tìm khách</label>');
    h.push('      <input id="hhQ1" type="search" data-act="hh-q" data-t="1" value="' + esc(s.q) + '" placeholder="Tên hoặc mã khách">');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!rs.length) {
      h.push(emptyBox('Chưa có dữ liệu hoa hồng phí giao dịch cho môi giới này trong kỳ ' + kyNhan(kyId) + '.'));
      h.push('  </div></div>');
      return h.join('');
    }
    if (!list.length) {
      h.push(emptyBox('Không có khách hàng nào khớp với từ khoá tìm kiếm "' + s.q + '".'));
      h.push('  </div></div>');
      return h.join('');
    }

    var tDS = sumField(list, 'doanh_so_giao_dich_ty');
    var tPG = sumField(list, 'phi_giao_dich_trieu');
    var tPS = sumField(list, 'phi_truoc_so_trieu');
    var tPN = sumField(list, 'phi_net_trieu');
    var tHH = sumField(list, 'hoa_hong_phi_trieu');
    var tlHien = tPN > 0 ? tHH / tPN : null;

    h.push('    <div class="hh-tblwrap">');
    h.push('      <table class="hh-tbl"><thead><tr>');
    for (var c = 0; c < T1_COLS.length; c++) h.push(th(T1_COLS[c], 1));
    h.push('      </tr></thead><tbody>');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      h.push('        <tr>');
      h.push('          <td>' + esc(r.ho_ten || DASH) + ' <span class="hh-ma">' + esc(r.ma_kh || '') + '</span></td>');
      h.push('          <td class="num">' + cell(r.doanh_so_giao_dich_ty, 2) + '</td>');
      h.push('          <td class="num">' + cell(r.phi_giao_dich_trieu, 2) + '</td>');
      h.push('          <td class="num">' + cell(r.phi_truoc_so_trieu, 2) + '</td>');
      h.push('          <td class="num"><b>' + cell(r.phi_net_trieu, 2) + '</b></td>');
      h.push('          <td class="num">' + (isNum(r.ty_le_hoa_hong) ? esc(fpct(r.ty_le_hoa_hong)) : '<span class="hh-zero">—</span>') + '</td>');
      h.push('          <td class="num"><b>' + cell(r.hoa_hong_phi_trieu, 2) + '</b></td>');
      h.push('        </tr>');
    }
    h.push('      </tbody><tfoot><tr>');
    h.push('        <td data-tot="so_kh">TỔNG ' + esc(n0s(list.length)) + ' khách</td>');
    h.push('        <td class="num" data-tot="doanh_so_giao_dich_ty">' + esc(n2s(tDS)) + '</td>');
    h.push('        <td class="num" data-tot="phi_giao_dich_trieu">' + esc(n2(tPG)) + '</td>');
    h.push('        <td class="num" data-tot="phi_truoc_so_trieu">' + esc(n2(tPS)) + '</td>');
    h.push('        <td class="num" data-tot="phi_net_trieu"><b>' + esc(n2(tPN)) + '</b></td>');
    h.push('        <td class="num" data-tot="ty_le_hh_effective">' + (tlHien == null ? DASH : esc(fpct(tlHien))) + '</td>');
    h.push('        <td class="num" data-tot="hoa_hong_phi_trieu"><b>' + esc(n2(tHH)) + '</b></td>');
    h.push('      </tr></tfoot></table>');
    h.push('    </div>');
    h.push('    <p class="hh-note">Tổng phí trả sở nằm TRONG phí giao dịch, không cộng thêm. Ô trống = không phát sinh khoản đó ở khách hàng này (không phải số 0 mất). ' +
           'Tỷ lệ HH ở hàng TỔNG là tỷ lệ hiệu dụng = tổng hoa hồng ÷ tổng phí Net.</p>');
    h.push('  </div></div>');
    return h.join('');
  }

  /* Sắp xếp bảng PQL theo khoá dt | tl | phi (t3 = nhân viên, t4 = phòng) */
  function sortPql(list, s) {
    var k = (s && s.sort) || 'dt';
    var d = (s && s.dir) || -1;
    return list.slice().sort(function (a, b) {
      var x = k === 'dt' ? a.dt : (k === 'tl' ? a.tl : a.r.phi);
      var y = k === 'dt' ? b.dt : (k === 'tl' ? b.tl : b.r.phi);
      return d * ((isNum(y) ? y : 0) - (isNum(x) ? x : 0));
    });
  }
  function thPql(k, ten, tbl) {
    var s = (tbl === 3) ? st.t3 : st.t4;
    var d = (s.sort === k) ? s.dir : 0;
    return '<th class="num sortable" data-act="hh-sort" data-t="' + tbl + '" data-k="' + esc(k) +
      '" data-dir="' + d + '">' + esc(ten) + '</th>';
  }

  /* Ô số: có số thì in, không có thì để trống (dùng .empty của style.css) */
  function cell(v, dg) {
    if (!isNum(v)) return '<span class="empty"></span>';
    if (v === 0) return '<span class="hh-zero">0</span>';
    return esc(num(v, dg));
  }

  /* ============================================ PHẦN 2 — Hoa hồng dư nợ (HHDN) */
  var T2_COLS = [
    { k: 'ho_ten', ten: 'Khách hàng', num: false },
    { k: 'du_no_tinh_lai_ty', ten: 'Dư nợ tính lãi (tỷ VNĐ)', num: true, f: 2 },
    { k: 'lai_suat_thuc_te_nam', ten: 'Lãi suất tạm tính', num: true, pct: true },
    { k: 'so_ngay_tinh_lai', ten: 'Số ngày tính lãi', num: true, f: 0 },
    { k: 'luy_ke_lai_vay_trieu', ten: 'Lãi vay luỹ kế (triệu VNĐ)', num: true, f: 2 },
    { k: 'ty_le_hhdn', ten: 'Tỷ lệ HHDN', num: true, pct: true },
    { k: 'hoa_hong_dn_trieu', ten: 'Hoa hồng dư nợ (triệu VNĐ)', num: true, f: 2, b: true }
  ];

  /* HHDN chỉ hưởng khi lãi thực thu CAO HƠN lãi suất tham chiếu (Nguồn vốn).
   * Ưu tiên lý do có sẵn trong dữ liệu (_ly_hhdn), tự tính khi thiếu.
   * trả về {ok:boolean, ly:string} — lý do dùng để hiện bằng CHỮ ở dòng HHDN. */
  function lyHHDN(r) {
    var tham = laiSuatThamChieu();
    var tt = r.lai_suat_thuc_te_nam;
    if (r._ly_hhdn === 'khong_co_du_no') return { ok: false, ly: 'không có dư nợ tính lãi' };
    if (r._ly_hhdn === 'lai_thuc_te_khong_cao_hon_tham_chieu')
      return { ok: false, ly: 'lãi thực thu không cao hơn lãi suất tham chiếu' };
    if (isNum(tt) && isNum(tham) && tt <= tham + 1e-9)
      return { ok: false, ly: 'lãi thực thu không cao hơn lãi suất tham chiếu' };
    if (r._ly_hhdn === 'du_dieu_kien' || (isNum(tt) && isNum(tham) && tt > tham)) return { ok: true, ly: '' };
    /* Không rõ: cứ hiện số 0 của dữ liệu, không tự kết luận là không đủ điều kiện */
    return { ok: true, ly: '' };
  }
  function duDieuKienHHDN(r) { return lyHHDN(r).ok; }

  function phan2(maMg, kyId) {
    var rs = rows(maMg, kyId);
    var s = st.t2;
    var list = sortList(filterQ(rs, s.q), s);
    var h = [];

    h.push('<div class="card hh-sec" data-hh-card="t2">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">2 · Hoa hồng dư nợ (HHDN)</div>');
    h.push('      <div class="card-sub">Đơn vị: Dư nợ tính bằng <b>TỶ VNĐ</b>; Lãi vay và hoa hồng tính bằng <b>TRIỆU VNĐ</b> · lãi suất hiển thị dạng %/năm · ' +
           fn('<b>Điều kiện hưởng HHDN:</b> chỉ hưởng khi lãi thực thu CAO HƠN lãi suất tham chiếu (Nguồn vốn).<br>' +
              'Công thức: HHDN = dư nợ tính lãi × (lãi suất thực tế theo ngày − lãi suất Nguồn vốn) × tỷ lệ chia sẻ ÷ 365.<br>' +
              'Khách không đủ điều kiện: dòng hoa hồng ghi rõ bằng chữ, không để số 0 trần trụi. Lãi suất tham chiếu: <b>' +
              (laiSuatThamChieu() == null ? DASH : esc(fpct(laiSuatThamChieu()))) + '/năm</b>.',
              'Điều kiện hưởng HHDN', 'hh-fn-t2') + '</div></div>');
    h.push('    <div class="hh-filter">');
    h.push('      <label for="hhQ2">Tìm khách</label>');
    h.push('      <input id="hhQ2" type="search" data-act="hh-q" data-t="2" value="' + esc(s.q) + '" placeholder="Tên hoặc mã khách">');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!rs.length) {
      h.push(emptyBox('Chưa có dữ liệu hoa hồng dư nợ cho môi giới này trong kỳ ' + kyNhan(kyId) + '.'));
      h.push('  </div></div>');
      return h.join('');
    }
    if (!list.length) {
      h.push(emptyBox('Không có khách hàng nào khớp với từ khoá tìm kiếm "' + s.q + '".'));
      h.push('  </div></div>');
      return h.join('');
    }

    var tDN = list.reduce(function (a, r) {
      var v = (r.du_no_tinh_lai_ty != null) ? r.du_no_tinh_lai_ty : (isNum(r.du_no_tinh_lai_trieu) ? r.du_no_tinh_lai_trieu / 1000.0 : 0);
      return a + v;
    }, 0);
    var tLV = sumField(list, 'luy_ke_lai_vay_trieu');
    var tDN2 = sumField(list, 'hoa_hong_dn_trieu');
    var nK = 0;
    for (var z = 0; z < list.length; z++) if (lyHHDN(list[z]).ok) nK++;
    var tlHien = tLV > 0 ? tDN2 / tLV : null;

    h.push('    <div class="hh-tblwrap">');
    h.push('      <table class="hh-tbl"><thead><tr>');
    for (var c = 0; c < T2_COLS.length; c++) h.push(th(T2_COLS[c], 2));
    h.push('      </tr></thead><tbody>');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var hh2 = lyHHDN(r);
      var ok = hh2.ok;
      var dnTy = (r.du_no_tinh_lai_ty != null) ? r.du_no_tinh_lai_ty : (isNum(r.du_no_tinh_lai_trieu) ? r.du_no_tinh_lai_trieu / 1000.0 : null);
      h.push('        <tr>');
      h.push('          <td>' + esc(r.ho_ten || DASH) + ' <span class="hh-ma">' + esc(r.ma_kh || '') + '</span></td>');
      h.push('          <td class="num">' + cell(dnTy, 2) + '</td>');
      h.push('          <td class="num">' + (isNum(r.lai_suat_thuc_te_nam) ? esc(fpct(r.lai_suat_thuc_te_nam)) : '<span class="empty"></span>') + '</td>');
      h.push('          <td class="num">' + cell(r.so_ngay_tinh_lai, 0) + '</td>');
      h.push('          <td class="num">' + cell(r.luy_ke_lai_vay_trieu, 2) + '</td>');
      h.push('          <td class="num">' + (isNum(r.ty_le_hhdn) ? esc(fpct(r.ty_le_hhdn)) : '<span class="hh-zero">—</span>') + '</td>');
      if (ok) {
        h.push('          <td class="num"><b>' + cell(r.hoa_hong_dn_trieu, 2) + '</b></td>');
      } else {
        h.push('          <td class="num" data-hhdn="khong-du-dieu-kien">' +
               '<span class="muted" title="' + esc('Không hưởng HHDN: ' + (hh2.ly || 'chưa đủ điều kiện')) + '">' +
               '0,00 <span class="badge" style="font-size:10px;padding:1px 4px;margin-left:4px;opacity:0.75">' + esc(hh2.ly || 'k.hưởng') + '</span></span></td>');
      }
      h.push('        </tr>');
    }
    h.push('      </tbody><tfoot><tr>');
    h.push('        <td data-tot="so_kh">TỔNG ' + esc(n0s(list.length)) + ' khách · ' + esc(n0s(nK)) + ' đủ điều kiện</td>');
    h.push('        <td class="num" data-tot="du_no_tinh_lai_ty">' + esc(n2(tDN)) + '</td>');
    var lsb = laiSuatTB(list), nnb = soNgayTB(list);
    h.push('        <td class="num" data-tot="lai_suat_tb">' + (lsb == null ? DASH : esc(fpct(lsb))) + '</td>');
    h.push('        <td class="num" data-tot="so_ngay_tb">' + (nnb == null ? DASH : esc(n0s(nnb))) + '</td>');
    h.push('        <td class="num" data-tot="luy_ke_lai_vay_trieu">' + esc(n2(tLV)) + '</td>');
    h.push('        <td class="num" data-tot="ty_le_hhdn_effective">' + (tlHien == null ? DASH : esc(fpct(tlHien))) + '</td>');
    h.push('        <td class="num" data-tot="hoa_hong_dn_trieu"><b>' + esc(n2(tDN2)) + '</b></td>');
    h.push('      </tr></tfoot></table>');
    h.push('    </div>');
    h.push('    <p class="hh-note">Lãi suất và số ngày ở hàng TỔNG là trung bình của các khách có dư nợ. Dư nợ 0 hoặc lãi vay 0 là ' +
           'khách không vay margin — không phải lỗi dữ liệu.</p>');
    h.push('  </div></div>');
    return h.join('');
  }

  function laiSuatTB(list) {
    var s = 0, c = 0;
    for (var i = 0; i < list.length; i++) {
      if (isNum(list[i].lai_suat_thuc_te_nam)) { s += list[i].lai_suat_thuc_te_nam; c++; }
    }
    return c ? s / c : null;
  }
  function soNgayTB(list) {
    var s = 0, c = 0;
    for (var i = 0; i < list.length; i++) {
      if (isNum(list[i].so_ngay_tinh_lai) && list[i].so_ngay_tinh_lai > 0) { s += list[i].so_ngay_tinh_lai; c++; }
    }
    return c ? s / c : null;
  }

  /* ============================== PHẦN 3 — Phí quản lý (PQL), theo chức danh */
  /* Ràng buộc chính sách BẮT BUỘC hiển thị ở mọi nhánh. */
  function rulesHTML() {
    return '<ul class="hh-rules">' +
      '<li><b>Phân cấp:</b> phí quản lý trả theo mô hình trực tiếp &gt; gián tiếp &gt; Giám đốc Khối; kiêm nhiệm nhiều cấp chỉ nhận ở cấp cao nhất, không cộng dồn.</li>' +
      '<li><b>Trần tổng tỷ lệ PQL: ' + esc(fpct(tranPql())) + '</b> doanh thu phí phát sinh của cấp quản lý.</li>' +
      '<li><b>Điều kiện KPI: quý đạt ≥ ' + esc(fpct(nguongKpi())) + '</b> thì mới hưởng phí quản lý; dưới mức này phí kỳ đó bằng 0, hoàn ngân sách, <b>không chuyển kỳ sau</b>.</li>' +
      '</ul>';
  }

  /* ============================== ĐIỂM MỞ (DM01–DM08) + BADGE DỮ LIỆU GIẢ
   * Nguồn: HH.meta_dieu_mo do data/gen_hh_data.py ghi ra cùng hh-meta.json.
   * Bắt buộc hiển thị: số liệu minh họa lấy từ văn bản DRAFT, chưa phải
   * số liệu thật — người đọc phải thấy các giả định bộ sinh trước khi tin. */
  function phanDiemMo() {
    var d = HH();
    if (!d) return '';
    var list = d.meta_dieu_mo;
    if (!list || !list.length) return '';
    var cb = d._canh_bao || 'DỮ LIỆU GIẢ — số liệu tạm tính minh họa.';
    var cb2 = d._nguon_so || '';
    var chot = (d.meta_dieu_mo_da_chot && d.meta_dieu_mo_da_chot.danh_sach) || [];
    var mo = [];
    for (var k = 0; k < list.length; k++) {
      if (chot.indexOf(list[k].ma) < 0) mo.push(list[k]);
    }
    var w = [];
    w.push('    <div class="hh-dm-wrap">');
    w.push('      <button type="button" class="hh-dm-head hh-dm-toggle" data-act="hh-dm-toggle" aria-expanded="false" aria-controls="hh-dm-body">' +
           '<svg class="hh-dm-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<polyline points="9 18 15 12 9 6"></polyline></svg>' +
           '<span>Điểm mở của chính sách — <b>' + mo.length + ' mục chưa chốt</b>' +
           (chot.length ? ' · ' + chot.length + ' mục đã chốt' : '') + ' (bấm để xem)</span>' +
           '</button>');
    w.push('      <div class="hh-dm-body" id="hh-dm-body" hidden>');
    for (var i = 0; i < mo.length; i++) {
      w.push(diemMoItem(mo[i], i));
    }
    /* Mục đã chốt: hiện đầy đủ để lưu vết quyết định, nhưng đánh dấu riêng
     * để không bị đọc nhầm là còn đang tranh luận. */
    for (var j = 0; j < list.length; j++) {
      if (chot.indexOf(list[j].ma) >= 0) w.push(diemMoItem(list[j], j, true));
    }
    w.push('      </div>');
    w.push('      <p class="hh-note">' + esc(cb) + (cb2 ? ' ' + esc(cb2) : '') + '</p>');
    w.push('    </div>');
    return w.join('');
  }

  function diemMoItem(x, i, daChot) {
    var h = [];
    h.push('        <div class="hh-dm-item' + (daChot ? ' hh-dm-chot' : '') + '" data-dm="' + esc(x.ma || ('DM' + (i + 1))) + '">');
    h.push('          <div class="hh-dm-t"><b>' + esc(x.ma || ('DM' + (i + 1))) + '</b>' + esc(x.tieu_de || '') + '</div>');
    if (x.trang_thai) h.push('          <div class="hh-dm-st">' + esc(x.trang_thai) + '</div>');
    if (x.noi_dung) h.push('          <div class="hh-dm-n">' + esc(x.noi_dung) + '</div>');
    if (x.quyet_dinh) h.push('          <div class="hh-dm-q"><b>Quyết định:</b> ' + esc(x.quyet_dinh) +
                             (x.ngay_chot ? ' <span class="hh-dm-when">(' + esc(x.ngay_chot) + ')</span>' : '') + '</div>');
    if (x.xu_ly_bo_sinh) h.push('          <div class="hh-dm-x"><b>Cách bộ sinh xử lý:</b> ' + esc(x.xu_ly_bo_sinh) + '</div>');
    if (x.nguon) h.push('          <div class="hh-dm-src">Nguồn: ' + esc(x.nguon) + '</div>');
    h.push('        </div>');
    return h.join('');
  }

  /* Tính phí quản lý 1 dòng.
   * QUY TẮC: tỷ lệ VÀ điều kiện KPI thuộc về CẤP QUẢN LÝ (người đang xem),
   * KHÔNG thuộc từng nhân viên cấp dưới — dưới 80% thì cả khối của quản lý
   * bằng 0, không phải từng dòng. Có chặn trần 7% doanh thu phí. */
  function pqlTinh(tyLe, doanhThuPhiNet, kpi) {
    var tran = tranPql();
    var truocTran = tyLe * doanhThuPhiNet;
    var sauTran = Math.min(truocTran, tran * doanhThuPhiNet);
    var duKpi = (kpi == null) ? null : (kpi >= nguongKpi());
    var phi = (duKpi === false) ? 0 : sauTran;
    return {
      phi: phi, truocTran: truocTran, sauTran: sauTran,
      biTran: truocTran > sauTran + 1e-9, duKpi: duKpi
    };
  }

  /* Tỷ lệ PQL thực áp dụng cho cấp quản lý đang xem: HH.pql_theo_ky
   * (đã tính sẵn theo Phụ lục 03) trước; không có thì tra map tỷ lệ theo chức danh. */
  function tyLePql(maMg, kyId, chucDanh) {
    var pk = pqlKy(maMg, kyId);
    if (pk && isNum(pk.ty_le_pql_ap_dung)) return pk.ty_le_pql_ap_dung;
    var ql = quanLy(maMg);
    if (ql && String(ql.cap_quan_ly || '').indexOf('Khối') >= 0) return rate('ty_le_pql_gd_khoi', null, 0);
    var gdt = rate('ty_le_pql_gian_tiep', chucDanh, 0);
    if (isNum(gdt) && gdt > 0) return gdt;
    return rate('ty_le_pql_truc_tiep', chucDanh, 0);
  }

  /* Ngưỡng DTPN tối thiểu cho NV QHKH hưởng PQL (Phụ lục 03) */
  function nguongDtpnNv() {
    var h = HH();
    return (h && isNum(h.muc_dtpn_toi_thieu_pql_nvqhkh)) ? h.muc_dtpn_toi_thieu_pql_nvqhkh : 50;
  }

  function chipKpi(kpi) {
    if (kpi == null) return '<span class="hh-chip">KPI chưa có số liệu</span>';
    var ok = kpi >= nguongKpi();
    return '<span class="hh-chip' + (ok ? ' on' : ' warn') + '">KPI quý đạt ' + esc(fpct(kpi)) +
      (ok ? ' — đủ điều kiện PQL' : ' — dưới ' + esc(fpct(nguongKpi())) + ', phí kỳ này = 0') + '</span>';
  }

  /* (a) TRƯỞNG PHÒNG — chi tiết theo TỪNG MÔI GIỚI trong phòng */
  function pqlNhanVien(maMg, kyId) {
    var h = [];
    var ql = quanLy(maMg);
    var nhanVien = (ql && Array.isArray(ql.cap_below) && ql.cap_below.length)
      ? ql.cap_below.slice()
      : nhanVienTrongPhong(maMg);

    if (!nhanVien.length) {
      h.push(emptyBox('Chưa có danh sách môi giới trực thuộc trong dữ liệu phí quản lý.'));
      h.push(rulesHTML());
      return h.join('');
    }

    /* Tỷ lệ + ngưỡng KPI là của NGƯỜI ĐANG XEM (TP), dùng chung cho mọi dòng. */
    var mgMe = mgById(maMg) || {};
    var tlPql = tyLePql(maMg, kyId, mgMe.chuc_danh);
    var kpiMe = kpiRatio(maMg, kyId);
    var pkl = pqlKy(maMg, kyId);

    var list = nhanVien.map(function (m) {
      var mg = mgById(m) || { ma_mg: m, ho_ten: m, chuc_danh: '' };
      var rs = rows(m, kyId);
      var dt = sumField(rs, 'phi_net_trieu');
      var kpiNv = kpiRatio(m, kyId);
      /* NV QHKH chỉ hưởng PQL khi DTPN cá nhân >= 50 triệu; dưới ngưỡng thì tỷ lệ = 0. */
      var tlDong = tlPql;
      var duDtpn = true;
      if (String(mg.chuc_danh || '').toUpperCase().indexOf('NV QHKH') === 0) {
        duDtpn = dt >= nguongDtpnNv();
        if (!duDtpn) tlDong = 0;
      }
      var r = pqlTinh(tlDong, dt, kpiMe);
      return { mg: mg, dt: dt, tl: tlDong, kpi: kpiNv, duDtpn: duDtpn, r: r };
    }).filter(function (x) { return x.dt > 0; });

    list = sortPql(list, st.t3);

    if (!list.length) {
      h.push('<div class="hh-alert">Phòng chưa phát sinh doanh thu phí trong kỳ ' + esc(kyNhan(kyId)) +
             ' nên chưa có cơ sở tính phí quản lý. Không hiển thị bảng trống.</div>');
      h.push(rulesHTML());
      return h.join('');
    }

    var tDT = 0, tPHI = 0;
    for (var i = 0; i < list.length; i++) { tDT += list[i].dt; tPHI += list[i].r.phi; }

    h.push('    <div class="hh-tblwrap">');
    h.push('      <table class="hh-tbl"><thead><tr>');
    h.push('        <th>Tên nhân viên</th>');
    h.push(thPql('dt', 'Doanh thu phí Net (triệu VNĐ)', 3));
    h.push(thPql('tl', 'Tỷ lệ tính phí quản lý', 3));
    h.push(thPql('phi', 'Phí quản lý (triệu VNĐ)', 3));
    h.push('      </tr></thead><tbody>');
    for (var j = 0; j < list.length; j++) {
      var x = list[j];
      h.push('        <tr>');
      h.push('          <td>' + esc(x.mg.ho_ten || DASH) + ' <span class="hh-ma">' + esc(x.mg.ma_mg || '') +
             (x.mg.chuc_danh ? ' · ' + esc(x.mg.chuc_danh) : '') + '</span></td>');
      h.push('          <td class="num">' + esc(n2(x.dt)) + '</td>');
      h.push('          <td class="num">' + esc(fpct(x.tl))
             + (x.duDtpn ? '' : ' <span class="hh-khong">(DTPN &lt; ' + esc(n0s(nguongDtpnNv())) + ' triệu)</span>')
             + (x.r.biTran ? ' <span class="hh-khong">(đã chặn trần)</span>' : '') + '</td>');
      h.push('          <td class="num"><b>' + (kpiMe != null && kpiMe < nguongKpi()
                 ? '<span class="hh-khong">0,00 — KPI quản lý &lt; ' + esc(fpct(nguongKpi())) + '</span>'
                 : esc(n2(x.r.phi))) + '</b></td>');
      h.push('        </tr>');
    }
    h.push('      </tbody><tfoot><tr>');
    h.push('        <td data-tot="so_nhan_vien">TỔNG ' + esc(n0s(list.length)) + ' nhân viên</td>');
    h.push('        <td class="num" data-tot="doanh_thu_phi_net_trieu"><b>' + esc(n2(tDT)) + '</b></td>');
    h.push('        <td class="num" data-tot="ty_le_pql">' + esc(fpct(tDT > 0 ? tPHI / tDT : 0)) + '</td>');
    h.push('        <td class="num" data-tot="phi_quan_ly_trieu"><b>' + esc(n2(tPHI)) + '</b></td>');
    h.push('      </tr></tfoot></table>');
    h.push('    </div>');
    h.push('    <p class="hh-note">Doanh thu phí Net = tổng phí Net của TẤT CẢ khách hàng của nhân viên đó trong kỳ (triệu đồng). ' +
           'Tỷ lệ tính phí quản lý là tỷ lệ của CHỨC DANH CỦA BẠN (' + esc(mgMe.chuc_danh || DASH) + ' = ' + esc(fpct(tlPql)) + '), ' +
           'áp cho doanh thu của từng nhân viên, có chặn trần ' + esc(fpct(tranPql())) + '. ' +
           'Điều kiện KPI xét trên KPI của BẠN (' + (kpiMe == null ? DASH : esc(fpct(kpiMe))) + '): dưới ' +
           esc(fpct(nguongKpi())) + ' thì toàn bộ phí quản lý kỳ này bằng 0. ' +
           'NV QHKH chỉ được tính PQL khi DTPN cá nhân ≥ ' + esc(n0s(nguongDtpnNv())) + ' triệu.' +
           (pkl && pkl.co_so_tinh ? ' Cơ sở tính: ' + esc(pkl.co_so_tinh) + '.' : '') + '</p>');
    h.push(rulesHTML());
    return h.join('');
  }

  /* Môi giới cùng phòng, trừ chính người đang xem. */
  function nhanVienTrongPhong(maMg) {
    var a = A();
    var mg = mgById(maMg);
    if (!mg) return [];
    var out = [];
    if (a && typeof a.mgOfPhong === 'function') {
      try {
        var l = a.mgOfPhong(mg.ma_phong) || [];
        for (var i = 0; i < l.length; i++) if (l[i].ma_mg && l[i].ma_mg !== maMg) out.push(l[i].ma_mg);
      } catch (e) { /* tự */ }
    }
    if (!out.length) {
      var k = global.KPI || {};
      var all = k.mo_gioi || [];
      for (var j = 0; j < all.length; j++) {
        if (all[j].ma_phong === mg.ma_phong && all[j].ma_mg !== maMg) out.push(all[j].ma_mg);
      }
    }
    /* PHẠM VI CÂY (MH05): nhánh dự phòng lấy theo CẢ PHÒNG, mà phòng có thể
     * chứa người ngoài cây. Thu về tập hậu duệ của người đang xem để bảng
     * "Phí quản lý theo từng nhân viên" không lộ tên người ngoài phạm vi.
     * mã không có trong cây → trả rỗng thay vì trả cả phòng. */
    return locTheoCayHoahong(out, maMg);
  }

  /** Hậu duệ cây quản lý, lọc một danh sách mã. Dự phòng khi app.js chưa có helper. */
  function locTheoCayHoahong(dsMa, maXem) {
    var a = A();
    if (a && typeof a.trongCay === 'function') {
      if (!maXem || !a.trongCay(maXem, maXem)) return [];
      return (dsMa || []).filter(function (m) { return a.trongCay(maXem, m); });
    }
    return (dsMa || []).slice();
  }

  /* (b) CẤP QUẢN LÝ CAO HƠN — phần gián tiếp: bảng các PHÒNG trực thuộc */
  function pqlPhong(maMg, kyId) {
    var h = [];
    var ql = quanLy(maMg);
    var ds = (ql && Array.isArray(ql.phong_truc_thuoc)) ? ql.phong_truc_thuoc.slice() : [];

    if (!ds.length) {
      h.push('<div class="hh-alert">Chưa có dữ liệu các phòng trực thuộc cho cấp quản lý này trong kỳ ' +
             esc(kyNhan(kyId)) + '.</div>');
      h.push(rulesHTML());
      return h.join('');
    }

    /* Tỷ lệ + ngưỡng KPI là của CẤP QUẢN LÝ đang xem (GĐTT / GĐ Khối). */
    var mgMe = mgById(maMg) || {};
    var tlPql = tyLePql(maMg, kyId, mgMe.chuc_danh);
    var kpiMe = kpiRatio(maMg, kyId);
    var pkl = pqlKy(maMg, kyId);

    var list = ds.map(function (p) {
      var info = phongHH(p);
      var rs = rowsOfPhong(p, kyId);
      var dt = info && isNum(info.doanh_thu_phi_net_trieu) ? info.doanh_thu_phi_net_trieu : sumField(rs, 'phi_net_trieu');
      var kpi = kpiPhong(p, kyId);
      var r = pqlTinh(tlPql, dt, kpiMe);
      return {
        ma: p, ten: (info && info.ten_phong) ? info.ten_phong : tenPhong(p),
        soMg: (info && isNum(info.so_mg)) ? info.so_mg : 0, dt: dt, tl: tlPql, kpi: kpi, r: r
      };
    }).filter(function (x) { return x.dt > 0; });

    list = sortPql(list, st.t4);

    if (!list.length) {
      h.push('<div class="hh-alert">Các phòng trực thuộc chưa phát sinh doanh thu phí trong kỳ ' +
             esc(kyNhan(kyId)) + ' nên chưa có cơ sở tính phí quản lý. Không hiển thị bảng trống.</div>');
      h.push(rulesHTML());
      return h.join('');
    }

    var tDT = 0, tPHI = 0;
    for (var i = 0; i < list.length; i++) { tDT += list[i].dt; tPHI += list[i].r.phi; }

    h.push('    <div class="hh-tblwrap">');
    h.push('      <table class="hh-tbl"><thead><tr>');
    h.push('        <th>Tên phòng</th>');
    h.push(thPql('dt', 'Doanh số phòng (triệu VNĐ)', 4));
    h.push(thPql('tl', 'Tỷ lệ phí quản lý', 4));
    h.push(thPql('phi', 'Phí quản lý (triệu VNĐ)', 4));
    h.push('      </tr></thead><tbody>');
    for (var j = 0; j < list.length; j++) {
      var x = list[j];
      h.push('        <tr>');
      h.push('          <td>' + esc(x.ten) + ' <span class="hh-ma">' + esc(x.ma) +
             (x.soMg ? ' · ' + esc(n0s(x.soMg)) + ' môi giới' : '') + '</span></td>');
      h.push('          <td class="num">' + esc(n2(x.dt)) + '</td>');
      h.push('          <td class="num">' + esc(fpct(x.tl)) + (x.r.biTran ? ' <span class="hh-khong">(đã chặn trần)</span>' : '') + '</td>');
      h.push('          <td class="num"><b>' + (kpiMe != null && kpiMe < nguongKpi()
                 ? '<span class="hh-khong">0,00 — KPI quản lý &lt; ' + esc(fpct(nguongKpi())) + '</span>'
                 : esc(n2(x.r.phi))) + '</b></td>');
      h.push('        </tr>');
    }
    h.push('      </tbody><tfoot><tr>');
    h.push('        <td data-tot="so_phong">TỔNG ' + esc(n0s(list.length)) + ' phòng</td>');
    h.push('        <td class="num" data-tot="doanh_so_trieu"><b>' + esc(n2(tDT)) + '</b></td>');
    h.push('        <td class="num" data-tot="ty_le_pql">' + esc(fpct(tDT > 0 ? tPHI / tDT : 0)) + '</td>');
    h.push('        <td class="num" data-tot="phi_quan_ly_trieu"><b>' + esc(n2(tPHI)) + '</b></td>');
    h.push('      </tr></tfoot></table>');
    h.push('    </div>');
    h.push('    <p class="hh-note">Doanh số tổng của phòng = tổng doanh thu phí phát sinh của cả phòng (triệu đồng). ' +
           'Tỷ lệ tính là tỷ lệ của CHỨC DANH CỦA BẠN (' + esc(mgMe.chuc_danh || DASH) + ' = ' + esc(fpct(tlPql)) + '), có chặn trần ' +
           esc(fpct(tranPql())) + '. Điều kiện KPI xét trên KPI của BẠN (' + (kpiMe == null ? DASH : esc(fpct(kpiMe))) +
           '), dưới ' + esc(fpct(nguongKpi())) + ' thì cả khối bằng 0. ' +
           'Đây là phần phí quản lý GIÁN TIẾP; nếu đồng thời kiêm nhiệm cấp trên thì chỉ nhận ở cấp cao nhất, không cộng dồn.' +
           (pkl && pkl.co_so_tinh ? ' Cơ sở tính: ' + esc(pkl.co_so_tinh) + '.' : '') + '</p>');
    h.push(rulesHTML());
    return h.join('');
  }

  /* Tổng phí Net của cả 1 phòng trong kỳ (từ window.HH.theo_ky). */
  function rowsOfPhong(maPhong, kyId) {
    var h = HH();
    if (!h || !h.theo_ky) return [];
    var out = [];
    for (var mg in h.theo_ky) {
      if (!Object.prototype.hasOwnProperty.call(h.theo_ky, mg)) continue;
      var lst = rows(mg, kyId);
      for (var i = 0; i < lst.length; i++) if (lst[i].ma_phong === maPhong) out.push(lst[i]);
    }
    return out;
  }
  /* KPI bình quân của phòng (gia quyền theo số khách) — chỉ để chặn điều kiện 80%. */
  function kpiPhong(maPhong, kyId) {
    var a = A();
    var k = global.KPI || {};
    var l = (k.ket_qua_theo_ky && k.ket_qua_theo_ky[kyId]) || [];
    if (a && typeof a.rows === 'function') { try { l = a.rows(kyId) || l; } catch (e) { /* tự */ } }
    var s = 0, c = 0;
    for (var i = 0; i < l.length; i++) {
      if (l[i] && l[i].ma_phong === maPhong && isNum(l[i].ty_le_hoan_thanh)) { s += l[i].ty_le_hoan_thanh; c++; }
    }
    return c ? s / c : null;
  }

  /* (c) MÔI GIỚI THƯỜNG — không thuộc diện tính PQL */
  function pqlKhongApDung(maMg, kyId) {
    var h = [];
    var mg = mgById(maMg) || {};
    var cd = mg.chuc_danh || '';
    var tham = rate('ty_le_pql_truc_tiep', cd, 0);
    var thamGD = rate('ty_le_pql_gd_khoi', null, 0);
    h.push('    <div class="hh-alert" data-hh-pql="khong-ap-dung">');
    h.push('      <b>Bạn không thuộc diện tính phí quản lý.</b><br>');
    h.push('      Chức danh <b>' + esc(cd || DASH) + '</b> không phải cấp quản lý (Trưởng phòng / Giám đốc), nên không phát sinh ' +
           'phí quản lý trực tiếp, gián tiếp hay Giám đốc Khối. Màn hình này không hiển thị bảng phí quản lý cho vai trò của bạn.');
    h.push('    </div>');
    h.push('    <p class="hh-note">Tỷ lệ PQL mang tính tham khảo theo bảng tham số: <b>' + esc(fpct(tham)) + '</b> ' +
           '(trực tiếp theo chức danh), Giám đốc Khối <b>' + esc(fpct(thamGD)) + '</b>. ' +
           'Tổng tỷ lệ PQL của một cấp quản lý không vượt trần ' + esc(fpct(tranPql())) + ' doanh thu phí.</p>');
    h.push('    <p class="hh-note">Kỳ ' + esc(kyNhan(kyId)) + ' · số khách có dữ liệu: ' +
           esc(n0s(rows(maMg, kyId).length)) + '.</p>');
    h.push(rulesHTML());
    return h.join('');
  }

  function phan3(maMg, kyId) {
    var mg = mgById(maMg) || {};
    var cd = mg.chuc_danh || '';
    var vt = vaiTro(cd);
    var h = [];

    h.push('<div class="card hh-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">3 · Phí quản lý (PQL) — theo vai trò của bạn</div>');
    h.push('      <div class="card-sub">Đơn vị: TRIỆU ĐỒNG · người đang xem: <b>' +
           esc((mg.ho_ten || maMg || DASH)) + '</b> · chức danh <b>' + esc(cd || DASH) + '</b> · kỳ ' + esc(kyNhan(kyId)) + '. ' +
           fn('<b>Ba ràng buộc bắt buộc:</b><br>' +
              '1) Phí quản lý trả theo mô hình phân cấp: trực tiếp &gt; gián tiếp &gt; Giám đốc Khối (kiêm nhiệm chỉ nhận cấp cao nhất, không cộng dồn).<br>' +
              '2) Tổng tỷ lệ phí quản lý giới hạn <b>' + esc(fpct(tranPql())) + '</b> doanh thu phí phát sinh.<br>' +
              '3) Quản lý chỉ hưởng phí quản lý khi KPI quý đạt ít nhất <b>' + esc(fpct(nguongKpi())) +
              '</b>; dưới mức này phí kỳ đó bằng 0, hoàn ngân sách, không chuyển kỳ sau.<br>' +
              'Phí quản lý tạm tính = Doanh thu phí Net × tỷ lệ của chức danh, có chặn trần và điều kiện KPI ở trên.',
              'Cách tính', 'hh-fn-pql') + '</div></div>');
    h.push('    <div class="hh-cap">' + (vt !== 'mg' ? chipKpi(kpiRatio(maMg, kyId)) : '') +
           '<span class="hh-chip">Vai trò: ' + esc(vt === 'tp' ? 'Trưởng phòng (trực tiếp)' :
                                                (vt === 'gd' ? 'Giám đốc (gián tiếp / Khối)' : 'Môi giới (không tính PQL)')) + '</span>' +
           '</div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (!HH()) {
      h.push(emptyBox('Chưa có dữ liệu phí quản lý (window.HH chưa nạp) — không tính được PQL cho vai trò này.'));
      h.push(rulesHTML());
      h.push('  </div></div>');
      return h.join('');
    }

    if (vt === 'tp')      h.push(pqlNhanVien(maMg, kyId));
    else if (vt === 'gd') h.push(pqlPhong(maMg, kyId));
    else                  h.push(pqlKhongApDung(maMg, kyId));

    h.push('  </div></div>');
    return h.join('');
  }

  /* ==================================================== khối biểu đồ (HTML) */
  function phan4(maMg, kyId) {
    var C = CH();
    var tt = rowsThang(maMg, kyId);
    var h = [];
    h.push('<div class="card hh-sec" data-hh-card="chart">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">4 · Cơ cấu thu nhập và tăng giảm theo tháng</div>');
    h.push('      <div class="card-sub">Đơn vị: TRIỆU ĐỒNG · tách nhỏ theo từng tháng trong kỳ ' + esc(kyNhan(kyId)) +
           ' · tháng đầu tiên không có tháng trước nên đường tăng trưởng để trống (không điền 0).</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="hh-chartgrid">');
    if (C && typeof C.box === 'function' && tt.length) {
      /* KPICharts.box() trả về HAI phần tử anh em (div.chart-box-head + div.chart-box).
       * Phải bọc mỗi cặp trong một div riêng, nếu không lưới 2 cột sẽ nhận 4 phần tử
       * con và xuống 2 hàng — hai biểu đồ chồng nhau dọc thay vì nằm cạnh nhau. */
      h.push('      <div class="hh-chartcell">');
      h.push(C.box('hh-cau-thu-nhap-thang', 300, 'Cơ cấu thu nhập theo tháng',
        'Cột chồng: hoa hồng phí giao dịch + hoa hồng dư nợ + phí quản lý (triệu đồng)'));
      h.push('      </div>');
      h.push('      <div class="hh-chartcell">');
      h.push(C.box('hh-tang-giam-thang', 300, 'Tăng giảm thu nhập theo tháng',
        'Cột = tổng thu nhập tháng; đường = tăng trưởng % so với tháng trước'));
      h.push('      </div>');
    } else {
      /* Không có dữ liệu theo tháng (ví dụ cấp quản lý không phải môi giới:
       * HH.theo_thang chỉ có 15 mã MG) thì KHÔNG tạo canvas — nếu tạo rồi
       * gọi augment, charts.js sẽ cảnh báo "không tìm thấy canvas" vô ích. */
      var ly = tt.length ? 'Chưa có thư viện biểu đồ để vẽ.' : 'Chưa có dữ liệu doanh thu theo tháng.';
      h.push('      <div class="hh-chartcell">' + emptyBox(ly) + '</div>');
      h.push('      <div class="hh-chartcell">' + emptyBox(ly) + '</div>');
    }
    h.push('    </div>');
    if (!tt.length) {
      h.push('    <p class="hh-note">Chưa có dữ liệu doanh thu theo tháng cho môi giới này trong kỳ ' +
             esc(kyNhan(kyId)) + ' — hai biểu đồ hiển thị trạng thái rỗng.</p>');
    }
    h.push('  </div></div>');
    return h.join('');
  }

  /* ================================================================ render */
  function renderHoaHong(el, ctx) {
    injectStyle();
    var node = null;
    if (el && el.nodeType) node = el;
    else if (typeof el === 'string') node = (doc() || {}).getElementById(el);
    else if (ctx && ctx.el) node = ctx.el;
    if (!node) node = doc() ? doc().getElementById(ROOT_ID) : null;

    lastEl = node;
    lastCtx = ctx || null;

    if (!node) return;

    try {
      var maMg = maMgXem(ctx);
      var ky = kyId(ctx);
      var h = [];

      var mg = maMg ? (mgById(maMg) || {}) : {};
      /* Badge "dữ liệu giả": số liệu lấy từ văn bản DRAFT + bộ sinh tự động,
       * KHÔNG phải số liệu thật. Đặt trong card-head để không phụ thuộc
       * position của khối bên ngoài. */
      h.push('<div class="card hh-sec hh-has-badge">');
      h.push('  <div class="card-head">');
      h.push('    <div><div class="card-title">Hoa hồng &amp; phí quản lý — TẠM TÍNH (MH05)</div>');
      h.push('      <div class="card-sub">' + (maMg
        ? esc((mg.ho_ten || maMg) + (mg.chuc_danh ? ' · ' + mg.chuc_danh : '') + (mg.cap != null ? ' · cấp ' + mg.cap : ''))
        : 'Chưa chọn môi giới') + ' · kỳ <b>' + esc(kyNhan(ky)) + '</b> · mọi số tiền tính bằng TRIỆU ĐỒNG.</div></div>');
      h.push('    <span class="hh-badge-gia" role="note">DỮ LIỆU GIẢ — tạm tính minh họa</span>');
      h.push('  </div>');
      h.push('  <div class="card-body">');
      if (!HH()) {
        h.push('    <div class="hh-alert"><b>Chưa có dữ liệu hoa hồng.</b> ' +
               'File dữ liệu <b>hh-data.js</b> (window.HH) chưa được nạp nên màn hình chỉ hiện khung, không có số liệu tính được. ' +
               'Các bảng và biểu đồ bên dưới đang ở trạng thái rỗng.</div>');
      } else if (!maMg) {
        h.push('    <div class="hh-alert">Chưa chọn môi giới để xem hoa hồng. Mở MH01 hoặc MH02 rồi chọn một môi giới.</div>');
      }
      /* VÙNG TẠM TÍNH — đặt trên đầu, ngay sau tiêu đề màn (PTSP yêu cầu
       * 30/09/2026). KHÔNG đặt sau rulesHTML()/phanDiemMo(): card đầu màn đó
       * cao ~600px, bảng tạm tính bị đẩy xuống dưới khung nhìn 1000px — người
       * dùng phải cuon mới thấy. Điểm mở chính sách chuyển xuống cuối màn. */
      h.push(phanTamTinh(maMg, ky));
      h.push(rulesHTML());
      h.push(phanDiemMo());
      h.push('  </div></div>');

      h.push(phan1(maMg, ky));
      h.push(phan2(maMg, ky));
      h.push(phan3(maMg, ky));
      h.push(phan4(maMg, ky));

      node.innerHTML = h.join('');

      /* Nối ký hiệu (i) nếu ui-popover.js có mặt (tip() tự đăng ký,
         bind() chỉ cần cho HTML viết tay — gọi thêm cho chắc). */
      try {
        var up = global.UIPop;
        if (up && typeof up.bind === 'function') up.bind(node);
      } catch (e) { /* không quan trọng */ }

      /* ĐĂNG KÝ BIỂU ĐỒ SAU innerHTML — canvas phải có trong DOM. */
      try {
        var hc = global.HHChart;
        if (hc && typeof hc.augment === 'function') hc.augment(node, ctx || { kyId: ky, params: { ma_mg: maMg } });
      } catch (e) { warn('chart', e); }

      try {
        if (global.lucide && A() && typeof A().lucideCreateIcons === 'function') A().lucideCreateIcons();
      } catch (e) { /* không có lucide là bình thường */ }
    } catch (e) {
      warn('render', e);
      try {
        node.innerHTML = '<div class="card loi"><b>Lỗi hiển thị màn hình Hoa hồng &amp; PQL.</b><pre>' +
          esc(e && e.message ? e.message : e) + '</pre></div>';
      } catch (e2) { /* hết cách */ }
    }
  }

  /* Vẽ lại chính màn hình này (sắp xếp / tìm kiếm) — không phụ thuộc App.render() */
  function refresh() {
    if (lastEl) renderHoaHong(lastEl, lastCtx);
  }

  /* ================================================================ EXPORT */
  global.ScreenHoaHong = {
    render: renderHoaHong,
    refresh: refresh,
    state: st,
    reset: function () {
      st.t1 = { sort: 'hoa_hong_phi_trieu', dir: -1, q: '' };
      st.t2 = { sort: 'hoa_hong_dn_trieu', dir: -1, q: '' };
      st.t3 = { sort: 'dt', dir: -1 };
      st.t4 = { sort: 'dt', dir: -1 };
    },
    _vaiTro: vaiTro,
    _rows: rows,
    _phan1: phan1, _phan2: phan2, _phan3: phan3, _phan4: phan4,
    _pqlTinh: pqlTinh, _rules: rulesHTML
  };
  global.renderHoaHong = renderHoaHong;

  /* ==================================================== sự kiện (delegate) */
  function bind() {
    if (!global.document || global.__hoaHongBound) return;
    var root = global.document.getElementById(ROOT_ID);
    if (!root) return;
    global.__hoaHongBound = true;

    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      /* Bật/tắt bảng điểm mở (DM01–DM08). Xử lý trước vì nút này không
       * mang data-act nên nếu để sau sẽ rơi xuống return sớm bên dưới. */
      var tgl = t.closest('[data-act="hh-dm-toggle"]');
      if (tgl) {
        ev.preventDefault();
        ev.stopPropagation();
        var body = global.document.getElementById(tgl.getAttribute('aria-controls'));
        if (body) {
          var open = tgl.getAttribute('aria-expanded') === 'true';
          tgl.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (open) body.setAttribute('hidden', ''); else body.removeAttribute('hidden');
        }
        return;
      }

      var hit = t.closest('[data-act="hh-sort"]');
      if (!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      var tbl = hit.getAttribute('data-t');
      var k = hit.getAttribute('data-k');
      var s;
      if (tbl === '1') s = st.t1;
      else if (tbl === '2') s = st.t2;
      else if (tbl === '3') s = st.t3;
      else if (tbl === '4') s = st.t4;
      else return;
      if (s.sort === k) s.dir = -s.dir;
      else { s.sort = k; s.dir = -1; }
      refresh();
    });

    root.addEventListener('input', function (ev) {
      var e2 = ev.target;
      if (!e2 || !e2.getAttribute) return;
      var act = e2.getAttribute('data-act');
      if (act !== 'hh-q') return;
      var t = e2.getAttribute('data-t');
      if (t === '1') st.t1.q = e2.value || '';
      else if (t === '2') st.t2.q = e2.value || '';
      else return;
      /* Chỉ vẽ lại 2 bảng, giữ con trỏ nhập: sửa từng dòng bảng trong DOM. */
      paintTables(t);
    });
  }

  /* Vẽ lại riêng bảng tương ứng khi đang gõ tìm kiếm (không mất focus).
   *
   * SỬA: trước đây lấy card theo CHỈ SỐ (cards[1] / cards[2]). Chỉ số này
   * đúng chỉ khi vùng TẠM TÍNH luôn dựng; khi phần đó không có (thiếu ma_mg)
   * hoặc vùng điểm mở không render, card bị thay nhầm → mất hẳn khối TẠM TÍNH
   * (6 ô biến mất) và nhân bản id="hhQ1" (2 input cùng id). Nay neo theo
   * data-hh-card do phan1/phan2 tự gắn. */
  function paintTables(tbl) {
    if (!lastEl) return refresh();
    var maMg = maMgXem(lastCtx);
    var ky = kyId(lastCtx);
    var anchor = (tbl === '1') ? 't1' : 't2';
    var host = lastEl.querySelector('.card[data-hh-card="' + anchor + '"]');
    /* Không tìm thấy card (màn chưa dựng / đã đổi bố cục) → vẽ lại cả màn. */
    if (!host || !host.parentNode) return refresh();
    var tmp = global.document.createElement('div');
    tmp.innerHTML = (tbl === '1') ? phan1(maMg, ky) : phan2(maMg, ky);
    var neu = tmp.firstChild;
    /* tmp.firstChild có thể là text node trắng do thụt lề trong HTML mẫu. */
    while (neu && neu.nodeType !== 1) neu = neu.nextSibling;
    if (!neu) return refresh();
    /* Giữ con trỏ nhập: sau khi thay node, focus lại vào ô tìm kiếm tương ứng
     * (node mới chứa ô mới, nên phải đặt lại sau khi thay). */
    var canFocus = global.document.activeElement &&
      global.document.activeElement.id === (tbl === '1' ? 'hhQ1' : 'hhQ2');
    var pos = canFocus ? global.document.activeElement.selectionStart : null;
    host.parentNode.replaceChild(neu, host);
    if (canFocus) {
      var box = neu.querySelector((tbl === '1' ? '#hhQ1' : '#hhQ2'));
      if (box && typeof box.focus === 'function') {
        try { box.focus(); if (pos != null) box.setSelectionRange(pos, pos); } catch (e) { /* im lặng */ }
      }
    }
  }

  /* Đăng ký vào App nếu app.js đã có màn hình này trong danh sách */
  function hookApp() {
    var a = global.App;
    if (!a || typeof a.registerScreen !== 'function' || global.__hoaHongHooked) return;
    var names = a.SCREEN_NAMES || [];
    if (names.indexOf('hoahong') === -1) return;   /* chưa có trong SCREEN_LIST → để resolveScreen tự tìm */
    global.__hoaHongHooked = true;
    try { a.registerScreen('hoahong', renderHoaHong); } catch (e) { /* không quan trọng */ }
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { bind(); hookApp(); });
    }
    bind();
    hookApp();
    /* app.js / #screen-hoahong có thể nạp sau → thử lại vài lần */
    var tries = 0;
    var tmr = global.setInterval || function () { return 0; };
    var iv = tmr(function () {
      tries++;
      bind();
      hookApp();
      if ((global.__hoaHongBound && global.__hoaHongHooked) || tries > 40) global.clearInterval(iv);
    }, 120);
  }

})(window);
