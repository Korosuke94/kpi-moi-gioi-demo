/* =============================================================================
 * screen-khoi.js — MH04 "Tổng hợp khối"
 * -----------------------------------------------------------------------------
 * Dùng: window.ScreenKhoi.render(sec, ctx)   — sec = #screen-khoi
 *
 * Nguồn dữ liệu:
 *   - KPI.tong_hop_phong  : CHỈ có cho kỳ hiện tại (mỗi phòng 1 dòng)
 *   - KPI.ket_qua_theo_ky : từng môi giới, mọi kỳ (để tính số tổng hợp)
 *   - KPI.tham_so.trong_so_quan_ly : công thức chấm cấp khối/phòng
 *
 * Quy tắc số liệu thiếu: hiện "—" kèm lý do, KHÔNG dựng số 0.
 * Chỉ ĐỌC window.KPI + App.*, không định nghĩa/sửa App.
 * ========================================================================== */
(function (global) {
  'use strict';

  var ROOT_ID = 'screen-khoi';
  var STYLE_ID = 'kpi-style-khoi';
  var DASH = '—';

  /* UI state giữ qua các lần render (mỗi phiên mở trang) */
  var UI = { phong: 'ALL', sort: { key: 'ty_le_hoan_thanh', dir: 'desc' } };

  /* ------------------------------------------------------------------ data */
  function K() { return global.KPI || {}; }
  function A() { return global.App || null; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function byId(arr, id) { for (var i = 0; i < (arr || []).length; i++) if (arr[i].id === id) return arr[i]; return null; }

  function esc(s) {
    if (s === null || s === undefined) return DASH;
    var a = A();
    if (a && typeof a.esc === 'function') { try { return a.esc(s); } catch (e) { /* tự escape */ } }
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Ký hiệu (i): diễn giải/cách tính giấu sau popover, rê hoặc click là hiện. */
  function fn(text, pop, id) {
    var u = global.UIPop;
    if (!u || typeof u.footnote !== 'function') {
      return '<div class="card-sub">' + esc(text || '') + '</div>';
    }
    try {
      /* footnote(noiDungPopover, {inlineHTML: chuỗi hiện tại trên trang}) */
      return '<div class="card-sub">' + u.footnote(pop || '', {
        inlineHTML: esc(text || ''), id: id || ('fn-kh-' + (fnSeq++))
      }) + '</div>';
    } catch (e) {
      return '<div class="card-sub">' + esc(text || '') + '</div>';
    }
  }
  var fnSeq = 0;
  function num(v, d) {
    if (v === null || v === undefined || v === '') return DASH;
    var a = A();
    if (a && typeof a.fmtNum === 'function') { try { return a.fmtNum(v, d); } catch (e) { /* tự format */ } }
    var x = Number(v);
    if (!isFinite(x)) return DASH;
    var dd = d == null ? 0 : d;
    var neg = x < 0;
    var parts = Math.abs(x).toFixed(dd).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + parts.join(',');
  }
  function n0(v) { return num(v, 0); }
  function n1(v) { return num(v, 1); }
  function n2(v) { return num(v, 2); }

  var _pctRatio = null;
  function pct(v, d) {
    if (!isNum(v)) return DASH;
    var a = A();
    if (_pctRatio === null) {
      if (a && typeof a.pct === 'function') {
        try {
          var raw = String(a.pct(1, 1)).replace(/[^0-9,.\-]/g, '').replace(/\./g, '').replace(',', '.');
          var probe = parseFloat(raw);
          _pctRatio = (!isNaN(probe) && probe >= 20);
        } catch (e) { _pctRatio = true; }
      } else { _pctRatio = true; }
    }
    var dd = d == null ? 1 : d;
    if (a && typeof a.pct === 'function') { try { return a.pct(_pctRatio ? v : v * 100, dd); } catch (e) { /* tự format */ } }
    return num(v * 100, dd) + '%';
  }

  function currentKyId() {
    var a = A();
    if (a && a.state && a.state.kyId) return a.state.kyId;
    var k = K();
    return (k.ky_hien_tai || {}).ky_id || null;
  }
  function kyHienTaiId() { return (K().ky_hien_tai || {}).ky_id || null; }
  function kyNhan() {
    var a = A();
    if (a && typeof a.kyNhan === 'function') { try { var s = a.kyNhan(currentKyId()); if (s) return s; } catch (e) { /* tự tính */ } }
    var k = K();
    var list = k.danh_sach_ky || [];
    for (var i = 0; i < list.length; i++) if (list[i].ky_id === currentKyId()) return list[i].nhan;
    return (k.ky_hien_tai || {}).nhan || currentKyId() || DASH;
  }
  function rowsKy(kyId) {
    var k = K(), id = kyId || currentKyId();
    if (id && k.ket_qua_theo_ky && Array.isArray(k.ket_qua_theo_ky[id])) return k.ket_qua_theo_ky[id];
    if (id === kyHienTaiId() && Array.isArray(k.ket_qua_ky_hien_tai)) return k.ket_qua_ky_hien_tai;
    return Array.isArray(k.ket_qua_ky_hien_tai) ? k.ket_qua_ky_hien_tai : [];
  }
  /* tong_hop_phong chỉ có ở kỳ hiện tại → lọc theo ky_id, không mặc định "mọi kỳ" */
  function tongHopPhong(kyId) {
    var id = kyId || currentKyId();
    var list = Array.isArray(K().tong_hop_phong) ? K().tong_hop_phong : [];
    return list.filter(function (t) { return !t.ky_id || t.ky_id === id; });
  }
  function coTongHopPhong(kyId) { return tongHopPhong(kyId).length > 0; }
  function phongList() { return K().phong || []; }
  function phongTen(ma) {
    for (var i = 0; i < phongList().length; i++) if (phongList()[i].ma_phong === ma) return phongList()[i].ten_phong;
    return ma || DASH;
  }
  function maKhoiChinh() {
    var tp = tongHopPhong();
    if (tp.length) return tp[0].ma_khoi;
    var ps = phongList();
    return ps.length ? ps[0].ma_khoi : null;
  }
  function tenKhoi(maKhoi) {
    var code = maKhoi || maKhoiChinh();
    if (!code) return DASH;
    var a = A();
    if (a && typeof a.tenKhoi === 'function') {
      try {
        var s = a.tenKhoi();
        if (s && s !== DASH && s !== '—') return s;
      } catch (e) { /* tự dịch tên khối */ }
    }
    var NAM = {
      TT_TVDT: 'Trái chứng — Dịch vụ chứng khoán tài chính',
      TT_TD: 'Trái chứng — Tín dụng',
      TT_PH: 'Trái chứng — Phái sinh'
    };
    if (NAM[code]) return NAM[code];
    return String(code).replace(/_/g, ' ');
  }
  function maPhongCuaToi() {
    var a = A();
    if (a && a.user && a.user.ma_phong) return a.user.ma_phong;
    if (a && a.state && a.state.maPhong) return a.state.maPhong;
    return null;
  }

  /* ---------------------------------------------------------------------
   * PHẠM VI HIỂN THỊ — MH04 "Tổng hợp khối"
   * -------------------------------------------------------------------------
   * MH04 là màn DUY NHẤT trong MH02..MH05 hiện bảng "Môi giới trong khối" với
   * họ tên từng người, nên đây cũng là màn dễ lộ nhất. Dữ liệu của nó
   * (KPI.ket_qua_theo_ky[kyId]) CÓ trường ma_mg trên từng dòng → gắn được
   * với cây quản lý, nên áp bộ lọc cây cho toàn màn:
   *   • bảng "Môi giới trong khối"      → chỉ dòng có ma_mg thuộc cây
   *   • bảng "Kết quả theo phòng"      → chỉ phòng còn có người trong cây
   *   • chip lọc phòng                  → cùng danh sách phòng đó
   *   • ô số + "Diễn biến 6 kỳ"        → tính lại trên tập đã lọc
   *   • screen-khoi-chart.js            → nhận tập dòng đã lọc qua ctx
   * Không lọc thì tên người ở rìa cây (ví dụ MG001 khi đang xé MG010 ở
   * HCM) hiện lên bảng và các biểu đồ.
   *
   * Lưu ý: tên PHÒNG không phải tên người, nhưng phòng nằm ngoài cây cũng
   * để lộ sự tồn tại của nhóm người ngoài tầm nhìn, nên danh sách phòng cũng
   * được thu theo tập cây (giữ nguyên thứ tự KPI.phong).
   * ------------------------------------------------------------------- */
  function maMgXem(ctx) {
    if (ctx && ctx.params && ctx.params.ma_mg) return ctx.params.ma_mg;
    if (ctx && ctx.ma_mg) return ctx.ma_mg;
    var a = A();
    if (a) {
      if (a.state && a.state.params && a.state.params.ma_mg) return a.state.params.ma_mg;
      if (a.user && a.user.ma_mg) return a.user.ma_mg;
      if (a.state && a.state.maMg) return a.state.maMg;
    }
    return null;
  }

  /** true nếu màn này có bộ lọc cây khả dụng; mã không có trong cây → false
   *  (lúc đó màn hiện "không có quyền xem" chứ không trả toàn khối). */
  function coLocCay(maMg) {
    var a = A();
    return !!(a && typeof a.trongCay === 'function' && maMg && a.trongCay(maMg, maMg));
  }

  /** Dòng KPI của kỳ, đã lọc theo cây. maXem không hợp lệ → mảng rỗng. */
  function rowsKyTrongCay(kyId, maMg) {
    var all = rowsKy(kyId);
    if (!coLocCay(maMg)) return [];
    var a = A();
    return a.locTheoCay(all, maMg);
  }

  /** Các phòng còn chứa ít nhất một môi giới trong cây, giữ thứ tự phongList(). */
  function phongTrongCay(rowsDaLoc) {
    var set = {};
    (rowsDaLoc || []).forEach(function (r) { if (r && r.ma_phong) set[r.ma_phong] = 1; });
    return phongList().filter(function (p) { return p && set[p.ma_phong]; });
  }

  /* Phạm vi cây đang áp cho lần render này. render() gán đầu mỗi lượt; các
   * hàm bên dưới đọc biến này nên không phải xâu chuỗi tham số qua từng
   * block. LOC.ok = false nghĩa là mã người xem không có trong cây → màn
   * phải dừng, không được đổi sang dữ liệu toàn khối. */
  var LOC = { ok: false, ma: null };

  /** rowsKy(kyId) đã giới hạn theo cây. Không có phạm vi hợp lệ → rỗng. */
  function rowsKyCay(kyId) {
    if (!LOC.ok) return [];
    var a = A();
    if (a && typeof a.locTheoCay === 'function') return a.locTheoCay(rowsKy(kyId), LOC.ma);
    return [];
  }

  /* -------------------------------------------------- điểm THẬT của 1 MG
     ket_qua[].tong_diem là TỶ LỆ 0..1 (đã chia trọng số) — KHÔNG phải điểm.
     In thẳng tong_diem ra "1,02" thay vì "1.230" nên mọi chỗ cần ĐIỂM đều
     phải gọi hàm này. Thứ tự ưu tiên:
       1. chi_tieu[] có ma_chi_tieu === 'FKP' → gia_tri_thuc_te
       2. fallback: chi_tiet_tai_chinh.diem_phi + diem_lai
     Cả hai đều thiếu → null (không điền 0 có điều kiện). */
  function diemThuc(r) {
    if (!r) return null;
    var ct = Array.isArray(r.chi_tieu) ? r.chi_tieu : null;
    if (ct) {
      for (var i = 0; i < ct.length; i++) {
        var c = ct[i];
        if (c && c.ma_chi_tieu === 'FKP' && isNum(c.gia_tri_thuc_te)) return c.gia_tri_thuc_te;
      }
    }
    var ft = r.chi_tiet_tai_chinh;
    if (ft && isNum(ft.diem_phi) && isNum(ft.diem_lai)) return ft.diem_phi + ft.diem_lai;
    return null;
  }

  /* ================================================================ thống kê */
  /* Tổng hợp khối tính lại từ dữ liệu từng môi giới để có số ở MỌI kỳ
     (tong_hop_phong chỉ có kỳ hiện tại). Không đụng số có sẵn khi có. */
  function thongKeKhoi(kyId, maPhongLoc) {
    var all = rowsKyCay(kyId);
    var list = (maPhongLoc && maPhongLoc !== 'ALL')
      ? all.filter(function (r) { return r.ma_phong === maPhongLoc; })
      : all;
    var t = {
      so_mg: 0, so_dat: 0,
      sumDiemThuc: 0, coDiem: 0, sumTyLe: 0, coTyLe: 0
    };
    list.forEach(function (r) {
      t.so_mg++;
      if (isNum(r.ty_le_hoan_thanh)) { t.sumTyLe += r.ty_le_hoan_thanh; t.coTyLe++; if (r.ty_le_hoan_thanh >= 1) t.so_dat++; }
      var d = diemThuc(r);
      if (isNum(d)) { t.sumDiemThuc += d; t.coDiem++; }
    });
    t.tyLeTB = t.coTyLe ? t.sumTyLe / t.coTyLe : null;
    t.diemTBThuc = t.coDiem ? t.sumDiemThuc / t.coDiem : null;
    t.tyLeDat = t.coTyLe ? t.so_dat / t.coTyLe : null;
    return t;
  }
  /* VAI TRÒ QUẢN LÝ = TP (trưởng phòng) và GĐ (giám đốc).
   * Dùng so khớp CHÍNH XÁC theo danh sách tham_so.vai_tro_quan_ly (fallback
   * ['TP','GĐ']) vì 'GĐ TVĐT' KHÔNG bắt đầu bằng 'TP' — điều kiện indexOf('TP')
   * === 0 bỏ sót 2 người GĐ (MG016, MG017). Không dùng so chuỗi chung chung
   * kiểu indexOf('G') vì dễ bắt nhầm chức danh khác. */
  function vaiTroQuanLy() {
    var ts = (K().tham_so || {});
    var ds = Array.isArray(ts.vai_tro_quan_ly) && ts.vai_tro_quan_ly.length
      ? ts.vai_tro_quan_ly : ['TP', 'GĐ'];
    var out = [];
    for (var i = 0; i < ds.length; i++) {
      var s = String(ds[i] || '').trim().toUpperCase();
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }
  function laQuanLy(chucDanh) {
    var s = String(chucDanh || '').trim().toUpperCase();
    if (!s) return false;
    var ds = vaiTroQuanLy();
    for (var i = 0; i < ds.length; i++) {
      if (s === ds[i] || s.indexOf(ds[i] + ' ') === 0) return true;
    }
    return false;
  }

  /* Số trưởng phòng + giám đốc: đếm theo danh sách vai trò quản lý để khớp
   * cột so_tp của tong_hop_phong. Trả 2 số: { tp, gd, tong }. */
  function soQuanLy(list) {
    var o = { tp: 0, gd: 0, tong: 0 };
    (list || []).forEach(function (r) {
      var s = String(r.chuc_danh || '').trim().toUpperCase();
      if (!laQuanLy(s)) return;
      o.tong++;
      if (s.indexOf('GĐ') === 0 || s === 'GD' || s.indexOf('GIAM') === 0 || s.indexOf('GIÁM') === 0) o.gd++;
      else o.tp++;
    });
    return o;
  }
  function soTP(list) { return soQuanLy(list).tong; }

  function cmp(a, b) {
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b), 'vi');
    return a - b;
  }
  function valueFor(r, key) {
    if (key === 'ten') return r.ho_ten;
    if (key === 'ma_mg') return r.ma_mg;
    if (key === 'chuc_danh') return r.chuc_danh;
    if (key === 'phong') return phongTen(r.ma_phong);
    if (key === 'xep_loai') return r.xep_loai;
    /* tong_diem là tỷ lệ 0..1 — cột "Tổng điểm" phải sắp theo ĐIỂM thật. */
    if (key === 'diem_thuc') return diemThuc(r);
    return r[key];
  }
  function sortList(list) {
    var s = UI.sort;
    var out = (list || []).slice();
    out.sort(function (a, b) {
      var v = cmp(valueFor(a, s.key), valueFor(b, s.key));
      return s.dir === 'asc' ? v : -v;
    });
    return out;
  }
  function thSort(key, label, cls) {
    var act = UI.sort.key === key;
    var arrow = act ? (UI.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th class="' + (cls || 'num') + '" data-act="sort" data-key="' + esc(key) + '"' +
      ' style="cursor:pointer" title="Sắp xếp theo ' + esc(label) + '">' + esc(label) + arrow + '</th>';
  }

  /* ===================================================================== CSS
   * style.css đã có lớp nền #screen-khoi (kh-head, kh-title, kh-meta, kh-code,
   * kh-bars, cn-na) nên khối dưới CHỈ bổ sung phần style.css chưa có.
   * ===================================================================== */
  var CSS = [
    /* Ô số lớn bên phải header */
    '#screen-khoi .kh-big{text-align:right;min-width:190px;}',
    '#screen-khoi .kh-big-v{font-size:28px;font-weight:700;line-height:1.15;letter-spacing:-.4px;',
    '  font-variant-numeric:tabular-nums;}',
    '#screen-khoi .kh-big-v.up{color:var(--a);}',
    '#screen-khoi .kh-big-v.warn{color:var(--c);}',
    '#screen-khoi .kh-big-v.down{color:var(--d);}',
    /* Bảng phòng / bảng môi giới: cột 2 là tên dài, không dính trái như cột Mã */
    '#screen-khoi .table-kh-phong th:nth-child(2),',
    '#screen-khoi .table-kh-phong td:nth-child(2){position:static;width:auto;min-width:0;box-shadow:none;}',
    '#screen-khoi .table-kh-mg th:nth-child(2),#screen-khoi .table-kh-mg td:nth-child(2){',
    '  position:static;width:auto;min-width:0;box-shadow:none;}',
    /* Dòng chú thích dưới thanh: style.css chỉ có border-top cho .bar-row liền kề,
     * nên dòng ghi chú phải tự lấy lại đường kẻ ngăn cách. */
    '#screen-khoi .bar-note{font-size:var(--fs-small);color:var(--muted);padding:0 0 8px;',
    '  margin:0;line-height:1.5;}',
    '#screen-khoi .bar-row + .bar-note{padding-top:4px;}',
    /* Tên phòng dài không cắt bằng ellipsis — ưu tiên xuống dòng cho đủ chữ. */
    '#screen-khoi .bar-label{white-space:normal;overflow:visible;text-overflow:clip;',
    '  line-height:1.4;}',
    '@media (max-width:900px){#screen-khoi .kh-big{text-align:left;min-width:0;}}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ================================================================ blocks */
  function blockHead(stats, kyId) {
    var h = [];
    h.push('<div class="kh-head">');
    h.push('  <div>');
    h.push('    <h2 class="kh-title">Tổng hợp khối — ' + esc(tenKhoi()) + '</h2>');
    h.push('    <div class="kh-meta">');
    h.push('      <span class="chip kh-code">' + esc(maKhoiChinh() || DASH) + '</span>');
    h.push('      <span class="chip">' + esc(n0(stats.so_phong)) + ' phòng</span>');
    h.push('      <span class="chip">' + esc(n0(stats.so_mg)) + ' môi giới</span>');
    h.push('      <span class="chip">' + esc(n0(stats.so_nv)) + ' nhân viên</span>');
    h.push('      <span class="chip">Kỳ ' + esc(kyNhan()) + '</span>');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="kh-big">');
    h.push('    <div class="tile-label">Tỷ lệ hoàn thành bình quân</div>');
    h.push('    <div class="kh-big-v' + (stats.tyLeTB == null ? '' : stats.tyLeTB >= 1 ? ' up' : stats.tyLeTB >= 0.6 ? ' warn' : ' down') + '">' +
      esc(pct(stats.tyLeTB, 1)) + '</div>');
    h.push('    <div class="tile-sub">Trung bình ' + esc(n0(stats.coTyLe)) + ' môi giới có số liệu' +
      (kyId ? ' · kỳ ' + esc(kyNhan()) : '') + '</div>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  function blockTiles(stats) {
    var h = [];
    h.push('<div class="kpi-tiles" style="margin-top:var(--sp-4)">');

    h.push('  <div class="tile">');
    h.push('    <div class="tile-label">Tổng môi giới</div>');
    h.push('    <div class="tile-value">' + esc(n0(stats.so_mg)) + '</div>');
    h.push('    <div class="tile-sub">' + esc(n0(stats.so_nv)) + ' nhân viên · ' + esc(n0(stats.so_tp)) +
      ' cấp quản lý (' + esc(n0(stats.so_tp_vn)) + ' trưởng phòng · ' + esc(n0(stats.so_gd)) + ' giám đốc)' +
      (stats.gdNgoaiCay ? ' — GĐ TVĐT MG016 ngoài phạm vi cây không tính' : '') + '</div>');
    h.push('  </div>');

    h.push('  <div class="tile">');
    h.push('    <div class="tile-label">Tổng điểm khối (cộng dồn)</div>');
    h.push('    <div class="tile-value">' + esc(stats.tongDiem == null ? DASH : n2(stats.tongDiem)) + '</div>');
    h.push('    <div class="tile-sub">' + (stats.coDiem ? 'Cộng điểm FKP của ' + esc(n0(stats.coDiem)) + ' môi giới' +
      (stats.diemTBThuc == null ? '' : ' · TB ' + esc(n2(stats.diemTBThuc)) + ' điểm') : 'Chưa có môi giới nào có điểm FKP') + '</div>');
    h.push('  </div>');

    h.push('  <div class="tile ' + (stats.tyLeTB == null ? '' : stats.tyLeTB >= 1 ? 'xl-B' : stats.tyLeTB >= 0.6 ? 'xl-C' : 'xl-D') + '">');
    h.push('    <div class="tile-label">Tỷ lệ hoàn thành bình quân</div>');
    h.push('    <div class="tile-value">' + esc(pct(stats.tyLeTB, 1)) + '</div>');
    h.push('    <div class="tile-sub">TB tỷ lệ của ' + esc(n0(stats.coTyLe)) + ' môi giới trong kỳ</div>');
    h.push('  </div>');

    h.push('  <div class="tile ' + (stats.tyLeDat == null ? '' : stats.tyLeDat >= 0.5 ? 'xl-B' : 'xl-C') + '">');
    h.push('    <div class="tile-label">Môi giới đạt chỉ tiêu</div>');
    h.push('    <div class="tile-value">' + (stats.tyLeDat == null ? DASH : esc(n0(stats.so_dat)) + '/' + esc(n0(stats.coTyLe))) + '</div>');
    h.push('    <div class="tile-sub">' + (stats.tyLeDat == null ? DASH : esc(pct(stats.tyLeDat, 1)) + ' đạt tỷ lệ ≥ 100%') + '</div>');
    h.push('  </div>');

    h.push('</div>');
    return h.join('');
  }

  function blockPhongFilter(danhSachPhong, statsAll) {
    var h = [];
    h.push('<div class="filter-bar" style="margin-top:var(--sp-4)">');
    h.push('  <span class="filter-label">Phòng:</span>');
    h.push('  <button type="button" class="chip' + (UI.phong === 'ALL' ? ' active' : '') +
      '" data-act="phong" data-phong="ALL">Tất cả <span class="count">' + esc(n0(statsAll.so_mg)) + '</span></button>');
    danhSachPhong.forEach(function (p) {
      var so = statsAll.theoPhong[p.ma_phong] || 0;
      h.push('  <button type="button" class="chip' + (UI.phong === p.ma_phong ? ' active' : '') +
        '" data-act="phong" data-phong="' + esc(p.ma_phong) + '">' + esc(p.ten_phong) +
        ' <span class="count">' + esc(n0(so)) + '</span></button>');
    });
    h.push('  <span class="spacer"></span>');
    h.push('  <span class="muted small">Bấm phòng để lọc bảng và ô số bên dưới.</span>');
    h.push('</div>');
    return h.join('');
  }

  /* --------------------------------------------------------- bảng phòng */
  function oTruong(v) { return isNum(v) ? '' : ' title="Chưa có nguồn dữ liệu"'; }
  function cellSo(v) { return isNum(v) ? esc(n0(v)) : '<span class="empty"></span>'; }
  function cellPct(v) { return isNum(v) ? esc(pct(v, 1)) : '<span class="empty"></span>'; }
  /* tong_diem_phong là TỔNG ĐIỂM (5.358,00) — không phải tỷ lệ, không nhân 100. */
  function cellDiem(v) { return isNum(v) ? esc(n2(v)) : '<span class="empty"></span>'; }
  /* Ô trọng số/tham số dạng phần trăm: 0.7 → "70%", 0 → "0%" (0 số thập phân).
     Dùng chung hàm pct() của file để không lặp logic định dạng. */
  function valPct(v, d) { return isNum(v) ? esc(pct(v, d == null ? 0 : d)) : '<span class="empty"></span>'; }

  function blockBangPhong(list, kyId, coSo) {
    var h = [];
    h.push('<div class="card" style="margin-top:var(--sp-4)">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Kết quả theo phòng</div>');
    h.push('      ' + fn('Nguồn dữ liệu', '<div class="pop-h">Nguồn số liệu</div>' +
      '<div class="pop-f">Bảng lấy từ <b>KPI.tong_hop_phong</b> — số liệu tổng hợp sẵn theo từng phòng.</div>' +
      '<div class="pop-f">Trạng thái: ' + (coSo ? 'kỳ <b>' + esc(kyNhan()) + '</b>' : 'kỳ này chưa có dữ liệu tổng hợp phòng') + '.</div>' +
      '<div class="pop-f">Các cột chưa có nguồn hiển thị "—" chứ không thay bằng 0.</div>',
      'khoi-nguon') + '</div>');
    h.push('  </div>');

    if (!list.length) {
      h.push('  <div class="card-body">');
      h.push('    <p class="muted">Chưa có dữ liệu tổng hợp cấp phòng cho kỳ <b>' + esc(kyNhan()) + '</b>.</p>');
      h.push('    <p class="muted small">Màn hình hiển thị "—" thay cho số 0, không dựng số liệu cho kỳ không có nguồn.</p>');
      h.push('  </div></div>');
      return h.join('');
    }

    h.push('  <div class="table-wrap">');
    h.push('    <table class="table table-kh-phong tbl-chuan"><thead><tr>');
    h.push('      <th class="col-id">Mã</th>');
    h.push('      <th>Phòng</th>');
    h.push('      <th class="num">Số MG</th>');
    h.push('      <th class="num">Trưởng phòng</th>');
    h.push('      <th class="num" title="Tổng điểm thật của các môi giới trong phòng (điểm, không phải tỷ lệ)">Tổng điểm</th>');
    h.push('      <th class="num">Tỷ lệ HB bình quân</th>');
    h.push('      <th class="num" title="Số môi giới đạt chỉ tiêu / tổng nhân sự phòng · tỷ lệ trên tổng nhân sự">Đạt chỉ tiêu (số/tổng)</th>');
    h.push('      <th class="num" title="Số môi giới cấp 2 trở lên / tổng nhân sự phòng · tỷ lệ trên tổng nhân sự">Cấp 2+ (số/tổng)</th>');
    h.push('      <th class="cn-na">Ghi chú</th>');
    h.push('    </tr></thead><tbody>');
    list.forEach(function (p) {
      h.push('    <tr>');
      h.push('      <td class="col-id"><b>' + esc(p.ma_phong) + '</b></td>');
      h.push('      <td>' + esc(p.ten_phong) + '</td>');
      h.push('      <td class="num">' + cellSo(p.so_mg) + '</td>');
      h.push('      <td class="num">' + cellSo(p.so_tp) + '</td>');
      h.push('      <td class="num"><b>' + cellDiem(p.tong_diem_phong) + '</b></td>');
      h.push('      <td class="num"' + oTruong(p.ty_le_hoan_thanh_binh_quan) + '>' + cellPct(p.ty_le_hoan_thanh_binh_quan) + '</td>');
      h.push('      <td class="num" title="Số môi giới đạt chỉ tiêu / tổng nhân sự phòng">' +
        cellSo(p.so_mg_dat_chi_tieu) + '/' + cellSo(p.so_mg_nhan_vien) +
        (isNum(p.ty_le_nv_dat_chi_tieu) ? ' · ' + esc(pct(p.ty_le_nv_dat_chi_tieu, 1)) : '') + '</td>');
      h.push('      <td class="num" title="Số môi giới cấp 2 trở lên / tổng nhân sự phòng">' +
        cellSo(p.so_mg_cap2_tro_len) + '/' + cellSo(p.so_mg_nhan_vien) +
        (isNum(p.ty_le_cap2_tro_len) ? ' · ' + esc(pct(p.ty_le_cap2_tro_len, 1)) : '') + '</td>');
      h.push('      <td class="cn-na muted small">' + (p.ghi_chu ? esc(p.ghi_chu) : '<span class="empty"></span>') + '</td>');
      h.push('    </tr>');
    });
    h.push('    </tbody></table>');
    h.push('  </div>');
    h.push('  <div class="card-foot">Điểm chuẩn phòng, tỷ lệ hoàn thành phòng và xếp loại phòng chưa có nguồn dữ liệu ' +
        '(KPI.xlsx không có các cột này) nên không hiển thị. Bảng này là số liệu <b>toàn phòng</b> ' +
        '(KPI.tong_hop_phong), chưa lọc cây quản lý — bộ lọc phòng ở trên chỉ đổi bảng môi giới ' +
        'và các biểu đồ; Đạt chỉ tiêu / Cấp 2+ là số môi giới / tổng nhân sự phòng.</div>');
    h.push('</div>');
    return h.join('');
  }

  /* ------------------------------------------- thanh ngang so sánh phòng */
  /* Thanh đo ĐIỂM BÌNH QUÂN của phòng (đơn vị điểm) = Tổng điểm phòng ÷ Số
   * môi giới trong phòng. tong_diem_phong là ĐIỂM (5.358) và ty_le_hoan_thanh_
   * binh_quan mới là tỷ lệ (0,8669) — đừng trộn hai đơn vị này. */
  function blockBars(list, statsAll) {
    if (!list.length) return '';
    var rows = list.map(function (p) {
      var v = p.tong_diem_phong;
      var tb = isNum(v) && isNum(p.so_mg) && p.so_mg > 0 ? v / p.so_mg : null;
      return { p: p, tb: tb };
    }).filter(function (r) { return isNum(r.tb); });
    var max = 0;
    rows.forEach(function (r) { if (r.tb > max) max = r.tb; });
    var h = [];
    h.push('<div class="card" style="margin-top:var(--sp-4)">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">So sánh bình quân hoàn thành giữa các phòng</div>');
    h.push('      ' + fn('Cách đọc', '<div class="pop-h">So sánh bình quân giữa các phòng</div>' +
      '<div class="pop-f"><b>Bình quân phòng</b> = Tổng điểm phòng ÷ Số môi giới trong phòng (đơn vị: điểm).</div>' +
      '<div class="pop-f">Thanh ngang cạnh mỗi phòng là <b>tỷ lệ hoàn thành bình quân</b> của phòng, đơn vị %.</div>' +
      '<div class="pop-f"><b>Vạch xanh lá</b> = bình quân điểm ≥ bình quân điểm toàn khối.</div>' +
      '<div class="pop-f"><b>Vạch hổ phách</b> = bình quân điểm thấp hơn bình quân điểm toàn khối.</div>' +
      '<div class="pop-f">Phòng không có môi giới trong kỳ thì không có thanh so sánh.</div>',
      'khoi-binh-quan') + '</div>');
    h.push('  </div>');
    h.push('  <div class="card-body kh-bars">');
    if (!rows.length) {
      h.push('    <p class="empty-note">Chưa có đủ dữ liệu để so sánh các phòng.</p>');
    } else {
      var tbKhoi = statsAll.diemTBThuc;
      rows.forEach(function (r) {
        var w = max > 0 ? Math.max(0, Math.min(100, (r.tb / max) * 100)) : 0;
        var tone = isNum(tbKhoi) && r.tb >= tbKhoi ? 'xl-B' : 'xl-C';
        h.push('    <div class="bar-row ' + tone + '">');
        h.push('      <div class="bar-label" title="' + esc(r.p.ten_phong) + '">' + esc(r.p.ten_phong) + '</div>');
        h.push('      <div class="bar-track" title="' + esc(r.p.ten_phong + ' — bình quân ' + n2(r.tb) + ' điểm') + '">' +
          '<div class="bar-fill" style="width:' + w.toFixed(1) + '%"></div></div>');
        /* Số điểm bình quân (đơn vị điểm) — KHÔNG nhân 100, khác tỷ lệ % ở dòng ghi chú. */
        h.push('      <div class="bar-value"><b>' + esc(n2(r.tb)) + '</b></div>');
        h.push('    </div>');
        h.push('    <div class="bar-note">Tổng điểm ' + cellDiem(r.p.tong_diem_phong) +
          ' điểm ÷ ' + esc(n0(r.p.so_mg)) + ' môi giới = ' + esc(n2(r.tb)) + ' điểm/môi giới' +
          (isNum(r.p.ty_le_hoan_thanh_binh_quan) ? '; tỷ lệ hoàn thành bình quân ' + esc(pct(r.p.ty_le_hoan_thanh_binh_quan, 1)) : '') +
          (isNum(r.p.ty_le_nv_dat_chi_tieu) ? '; tỷ lệ môi giới đạt chỉ tiêu ' + esc(pct(r.p.ty_le_nv_dat_chi_tieu, 1)) : '') + '.</div>');
      });
    }
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* ------------------------------------------- bảng môi giới trong khối */
  /* --- helper cho bảng "Diễn biến 6 kỳ": sparkline + gộp xếp loại --- */
  /* Tổng điểm từng kỳ (chưa lọc phòng — bảng này tóm tắt khối). */
  function sparkTongDiem(list) {
    return (list || []).map(function (k) {
      var s = thongKeKhoi(k.ky_id, null);
      return isNum(s.sumDiemThuc) ? s.sumDiemThuc : null;
    });
  }
  /* Trả về chuỗi SVG polyline + chấm cuối cùng. Điểm null -> bỏ qua. */
  function sparkSVG(vals) {
    var ds = vals.map(function (v, i) { return { v: v, i: i }; }).filter(function (p) { return p.v != null; });
    if (!ds.length) return '';
    var min = Math.min.apply(null, ds.map(function (p) { return p.v; }));
    var max = Math.max.apply(null, ds.map(function (p) { return p.v; }));
    var span = max - min || 1;
    var W = 76, H = 20, PAD = 2;
    var pts = ds.map(function (p) {
      var x = PAD + (W - PAD * 2) * (ds.length === 1 ? 0.5 : p.i / (vals.length - 1));
      var y = H - PAD - (H - PAD * 2) * ((p.v - min) / span);
      return [x.toFixed(1), y.toFixed(1)];
    });
    var last = pts[pts.length - 1];
    return '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') +
      '" fill="none" stroke="var(--series-1)" stroke-width="1.5" opacity="0.8"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2" fill="var(--series-1)"/>';
  }
  /* Đếm xếp loại A/B/C/D của 1 kỳ (cây lọc). */
  function rkCounts(kyId) {
    var rk = rowsKyCay(kyId);
    return { A: countXL(rk, 'A'), B: countXL(rk, 'B'), C: countXL(rk, 'C'), D: countXL(rk, 'D') };
  }
  /* Gộp A·B·C·D thành 1 ô "1·3·1·1", nhóm không có thì là "—". */
  function xlPhanHo(cnt) {
    var parts = ['A', 'B', 'C', 'D'].map(function (g) {
      return (cnt[g] ? '<span class="pill ' + xlClass(g) + '">' + esc(n0(cnt[g])) + '</span>' : '<span class="muted">—</span>');
    });
    return parts.join('<span class="muted"> · </span>');
  }

  function blockTrendKy(kyHienTaiId) {
    var list = Array.isArray(K().danh_sach_ky) ? K().danh_sach_ky : [];
    var h = [];
    h.push('<div class="card" style="margin-top:var(--sp-4)">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Diễn biến 6 kỳ của khối</div>');
    h.push('      ' + fn('Cách đọc', '<div class="pop-h">Diễn biến 6 kỳ của khối</div>' +
      '<div class="pop-f"><b>Bình quân</b> tính trên các môi giới có tỷ lệ hoàn thành trong từng kỳ.</div>' +
      '<div class="pop-f">Môi giới mới vào kỳ đang xem chưa có tỷ lệ ở các kỳ trước nên không tính vào bình quân kỳ đó.</div>' +
      '<div class="pop-f"><b>Ô đậm</b> là kỳ đang chọn; kỳ trước đứng bên phải vì trục thời gian đi từ cũ đến mới.</div>',
      'khoi-6ky') + '</div>');
    h.push('  </div>');
    if (list.length < 2) {
      h.push('  <div class="card-body"><p class="muted">Cần ít nhất 2 kỳ dữ liệu để dựng bảng diễn biến.</p></div></div>');
      return h.join('');
    }
    h.push('  <div class="table-wrap">');
    h.push('    <table class="table table-sm tbl-chuan"><thead><tr>');
    h.push('      <th>Kỳ</th>');
    h.push('      <th class="num">Có tỷ lệ</th>');
    h.push('      <th class="num">Tổng điểm</th>');
    h.push('      <th class="num">TB điểm</th>');
    h.push('      <th class="num">Tỷ lệ bình quân</th>');
    h.push('      <th class="num">Đạt chỉ tiêu</th>');
    h.push('      <th class="num" title="Xếp loại A·B·C·D">Xếp loại (A·B·C·D)</th>');
    h.push('      <th class="num" title="Biến động tổng điểm qua các kỳ — chấm nhỏ, cao = điểm cao">Diễn biến</th>');
    h.push('    </tr></thead><tbody>');
    var spark = sparkTongDiem(list);
    list.forEach(function (k) {
      var loc = (UI.phong && UI.phong !== 'ALL') ? UI.phong : null;
      var s = thongKeKhoi(k.ky_id, loc);
      var hienTai = k.ky_id === kyHienTaiId;
      h.push('    <tr' + (hienTai ? ' class="row-active"' : '') + '>');
      h.push('      <td>' + (hienTai ? '<b>' + esc(k.nhan) + '</b> <span class="chip">đang xem</span>' : esc(k.nhan)) + '</td>');
      h.push('      <td class="num">' + cellSo(s.coTyLe) + '</td>');
      h.push('      <td class="num">' + (s.coDiem ? esc(n2(s.sumDiemThuc)) : '<span class="empty"></span>') + '</td>');
      h.push('      <td class="num">' + cellDiem(s.diemTBThuc) + '</td>');
      h.push('      <td class="num"><b>' + cellPct(s.tyLeTB) + '</b></td>');
      h.push('      <td class="num">' + (s.tyLeDat == null ? '<span class="empty"></span>' : esc(n0(s.so_dat)) + ' · ' + esc(pct(s.tyLeDat, 1))) + '</td>');
      h.push('      <td class="num">' + xlPhanHo(rkCounts(k.ky_id)) + '</td>');
      h.push('      <td class="num"><svg class="spark" width="76" height="20" viewBox="0 0 76 20" aria-hidden="true">' +
        sparkSVG(spark) + '</svg></td>');
      h.push('    </tr>');
    });
    h.push('    </tbody></table>');
    h.push('  </div>');
    h.push('  <div class="card-foot">Bảng tính lại từ dữ liệu từng môi giới (KPI.ket_qua_theo_ky) ' +
        'nên có đủ số ở mọi kỳ; cột tổng điểm / tỷ lệ / xếp loại cấp phòng (KPI.tong_hop_phong) ' +
        'chỉ có cho kỳ hiện tại. Cột Diễn biến là sparkline tổng điểm qua các kỳ.</div>');
    h.push('</div>');
    return h.join('');
  }

  function blockBangMG(list) {
    var h = [];
    h.push('<div class="card" style="margin-top:var(--sp-4)">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Môi giới trong khối</div>');
    h.push('      ' + fn('Thao tác', '<div class="pop-h">Sắp xếp bảng môi giới</div>' +
      '<div class="pop-f"><b>Bấm đầu cột</b> để sắp xếp tăng dần; bấm lần hai để đảo chiều giảm dần.</div>' +
      '<div class="pop-f">Mũi tên nhỏ cạnh tên cột cho biết đang sắp theo chiều nào.</div>' +
      '<div class="pop-f">Xếp loại A/B/C/D hiển thị bằng 4 màu khác nhau, không chỉ dựa vào chữ.</div>',
      'khoi-sap-xep') + '</div>');
    h.push('    <div class="legend">');
    h.push('      <span class="legend-item xl-A"><i class="legend-swatch"></i>A ' + esc(n0(countXL(list, 'A'))) + '</span>');
    h.push('      <span class="legend-item xl-B"><i class="legend-swatch"></i>B ' + esc(n0(countXL(list, 'B'))) + '</span>');
    h.push('      <span class="legend-item xl-C"><i class="legend-swatch"></i>C ' + esc(n0(countXL(list, 'C'))) + '</span>');
    h.push('      <span class="legend-item xl-D"><i class="legend-swatch"></i>D ' + esc(n0(countXL(list, 'D'))) + '</span>');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="table-wrap">');
    h.push('    <table class="table table-kh-mg tbl-chuan"><thead><tr>');
    h.push(thSort('ma_mg', 'Mã MG', ''));
    h.push(thSort('ho_ten', 'Họ và tên', ''));
    h.push(thSort('chuc_danh', 'Chức danh', ''));
    h.push(thSort('phong', 'Phòng', ''));
    h.push(thSort('diem_thuc', 'Tổng điểm'));
    h.push(thSort('ty_le_hoan_thanh', 'Tỷ lệ hoàn thành'));
    h.push(thSort('xep_loai', 'Xếp loại'));
    h.push('    </tr></thead><tbody>');
    var sorted = sortList(list);
    if (!sorted.length) {
      h.push('      <tr><td colspan="7" class="muted">Không có môi giới nào khớp bộ lọc.</td></tr>');
    }
    sorted.forEach(function (r) {
      var g = String(r.xep_loai || '').toUpperCase();
      h.push('      <tr>');
      h.push('        <td class="col-id"><b>' + esc(r.ma_mg) + '</b></td>');
      h.push('        <td>' + esc(r.ho_ten) + '</td>');
      h.push('        <td>' + esc(r.chuc_danh) + (isNum(r.cap) ? ' · cấp ' + esc(r.cap) : '') + '</td>');
      h.push('        <td>' + esc(phongTen(r.ma_phong)) + '</td>');
      h.push('        <td class="num">' + cellDiem(diemThuc(r)) + '</td>');
      h.push('        <td class="num"><b>' + (isNum(r.ty_le_hoan_thanh) ? esc(pct(r.ty_le_hoan_thanh, 1)) : '<span class="empty"></span>') + '</b></td>');
      h.push('        <td class="num"><span class="pill ' + xlClass(g) + '">' + (r.xep_loai ? esc(r.xep_loai) : '&mdash;') + '</span></td>');
      h.push('      </tr>');
    });
    h.push('    </tbody></table>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }
  function countXL(list, g) {
    var n = 0;
    (list || []).forEach(function (r) { if (String(r.xep_loai || '').toUpperCase() === g) n++; });
    return n;
  }

  /* ------------------------------------------- công thức chấm cấp quản lý */
  function blockCongThuc(stats) {
    var ts = K().tham_so || {};
    var w = ts.trong_so_quan_ly || {};
    var h = [];
    h.push('<div class="card" style="margin-top:var(--sp-4)">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Cách tính của khối</div>');
    h.push('      ' + fn('Trọng số', '<div class="pop-h">Trọng số của khối</div>' +
      '<div class="pop-f">Trọng số cấp quản lý lấy từ <b>tham_so.trong_so_quan_ly</b> trong bảng tham số KPI.</div>' +
      '<div class="pop-f">Tổng các trọng số của một nhân viên luôn bằng 100%.</div>' +
      '<div class="pop-f">Đổi trọng số chỉ cần sửa bảng tham số, không phải sửa mã nguồn.</div>',
      'khoi-trong-so') + '</div>');
    h.push('  </div>');
    h.push('  <div class="detail-grid" style="padding:0">');
    h.push('    <div class="detail-item"><span class="detail-label">FKP bộ phận</span>' +
      '<span class="detail-value">' + valPct(w.FKP, 0) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">NV đạt chỉ tiêu</span>' +
      '<span class="detail-value">' + valPct(w.TY_LE_DAT_CHI_TIEU, 0) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">NV cấp 2 trở lên</span>' +
      '<span class="detail-value">' + valPct(w.TY_LE_CAP_2_TRO_LEN, 0) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Giữ nhân sự</span>' +
      '<span class="detail-value">' + valPct(w.TY_LE_GIU_NHAN_SU, 0) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Tỷ lệ bình quân</span>' +
      '<span class="detail-value">' + esc(pct(stats.tyLeTB, 1)) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Tổng điểm khối (cộng dồn)</span>' +
      '<span class="detail-value">' + (stats.tongDiem == null ? '<span class="empty"></span>' : esc(n2(stats.tongDiem)) + ' điểm') + '</span></div>');
    h.push('    <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Ghi chú</span>' +
      '<span class="detail-value" style="font-weight:400;font-size:12.5px;line-height:1.6">' +
      'Điểm chuẩn và xếp loại cấp phòng chưa có nguồn (KPI.xlsx không có cột này) nên bảng trên hiển thị "—" cho ' +
      'ba cột đó. Các ô khác lấy thẳng từ KPI.tong_hop_phong của kỳ hiện tại.</span></div>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  function xlClass(g) { return 'xl-' + String(g || 'x').toUpperCase(); }

  /* =============================================================== RENDER */
  function render(sec, ctx) {
    var el = typeof sec === 'string' ? global.document.getElementById(sec) : sec;
    if (!el) return;
    injectStyle();

    var kyId = (ctx && ctx.kyId) || currentKyId();
    var maXem = maMgXem(ctx);
    LOC.ma = maXem;
    LOC.ok = coLocCay(maXem);

    /* Mã người xem không có trong cây quản lý (dữ liệu lệch) → dừng màn,
     * KHÔNG rơi về bảng toàn khối. */
    if (!LOC.ok) {
      el.innerHTML = '<div class="card"><div class="card-body"><p class="muted">' +
        'Mã <b>' + esc(maXem || DASH) + '</b> không có trong cây quản lý nên không có quyền xem khối.</p>' +
        '</div></div>';
      icons();
      return;
    }

    var allRows = rowsKyCay(kyId);

    /* Thống kê toàn khối + theo từng phòng */
    var tinhS = thongKeKhoi(kyId, null);
    var qLy = soQuanLy(allRows);
    var stats = {
      so_phong: phongList().length,
      so_mg: tinhS.so_mg, so_nv: 0, so_tp: qLy.tong, so_tp_vn: qLy.tp, so_gd: qLy.gd,
      sumDiemThuc: tinhS.sumDiemThuc, coDiem: tinhS.coDiem, diemTBThuc: tinhS.diemTBThuc,
      sumTyLe: tinhS.sumTyLe, coTyLe: tinhS.coTyLe, tyLeTB: tinhS.tyLeTB,
      so_dat: tinhS.so_dat, tyLeDat: tinhS.tyLeDat,
      tongDiem: tinhS.sumDiemThuc, theoPhong: {}
    };
    allRows.forEach(function (r) {
      var o = stats.theoPhong[r.ma_phong] || (stats.theoPhong[r.ma_phong] = 0);
      stats.theoPhong[r.ma_phong] = o + 1;
    });
    stats.so_nv = Math.max(0, stats.so_mg - stats.so_tp);
    stats.gdNgoaiCay = !allRows.some(function (r) {
      return r.ma_mg === 'MG016' || r.ma_mg === 'MG017';
    });

    var tpList = tongHopPhong(kyId);
    var coSo = coTongHopPhong(kyId);
    /* tong_hop_phong là số tổng hợp CẤP PHÒNG theo cả khối — phòng ngoài cây
     * không được hiện, nên thu về phòng còn có môi giới trong phạm vi. */
    var phongTrongScope = phongTrongCay(allRows);
    var tapPhong = {};
    phongTrongScope.forEach(function (p) { tapPhong[p.ma_phong] = 1; });
    tpList = tpList.filter(function (p) { return tapPhong[p.ma_phong]; });
    /* Ô "N phòng" ở header đếm trong phạm vi cây, không phải cả khối —
     * nếu để phongList().length thì con số tự nó đã lộ số phòng ngoài tầm. */
    stats.so_phong = phongTrongScope.length;
    var tpHienThi = (UI.phong && UI.phong !== 'ALL')
      ? tpList.filter(function (p) { return p.ma_phong === UI.phong; })
      : tpList;

    var h = [];
    h.push(blockHead(stats, kyId));
    h.push(blockTiles(stats));
    h.push(blockPhongFilter(phongTrongScope, stats));
    if (!allRows.length) {
      h.push('<div class="card" style="margin-top:var(--sp-4)"><div class="card-body">' +
        '<p class="muted">Kỳ <b>' + esc(kyNhan()) + '</b> không có dữ liệu môi giới.</p></div></div>');
      el.innerHTML = h.join('');
      icons();
      return;
    }
    h.push(blockBangPhong(tpHienThi, kyId, coSo));
    h.push(blockBars(tpHienThi, stats));
    h.push(blockTrendKy(kyId));
    /* P2: bảng "Môi giới trong khối" (blockBangMG) được đẩy LÊN TRƯỚC
       cụm biểu đồ — người xem đọc bảng tổng hợp trước, biểu đồ tương tác
       ở cuối màn. screen-khoi-chart.js insertHost() chèn host biểu đồ
       NGAY SAU bảng này (marker .khoi-charts-after). */
    h.push(blockBangMG((UI.phong && UI.phong !== 'ALL')
      ? allRows.filter(function (r) { return r.ma_phong === UI.phong; })
      : allRows));
    h.push('<div class="khoi-charts-after"></div>');
    h.push(blockCongThuc(stats));

    el.innerHTML = h.join('');
    el.setAttribute('data-ready', '1');
    icons();
    /* khối biểu đồ tương tác (Chart.js) do screen-khoi-chart.js gắn thêm */
    try {
      var kc = global.KhoiChart;
      if (kc && typeof kc.augment === 'function') {
        /* truyền kèm ma_mg để screen-khoi-chart.js lấy đúng tập dòng đã lọc
         * cây; hàm đó tự rowsKy() nên nếu không truyền thì biểu đồ vẽ lại
         * toàn khối và lộ tên người ngoài phạm vi. */
        kc.augment(el, { params: null, kyId: kyId, phong: UI.phong, ma_mg: LOC.ma });
      }
    } catch (e) { console.warn('[khoi-chart] augment loi:', e && e.message); }
  }
  function icons() {
    var a = A();
    if (a && typeof a.lucideCreateIcons === 'function') { try { a.lucideCreateIcons(); } catch (e) { /* không có lucide là bình thường */ } }
  }

  /* ==================================================== EVENT DELEGATION 1× */
  function bindOnce(el) {
    if (!el || global.__khoiBound) return;
    global.__khoiBound = true;

    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var hit = t.closest('[data-act]');
      if (!hit) return;
      var act = hit.getAttribute('data-act');

      if (act === 'phong') {
        ev.preventDefault();
        UI.phong = (UI.phong === hit.getAttribute('data-phong')) ? 'ALL' : hit.getAttribute('data-phong');
        render(el);
      } else if (act === 'sort') {
        ev.preventDefault();
        var key = hit.getAttribute('data-key');
        if (UI.sort.key === key) {
          UI.sort.dir = UI.sort.dir === 'desc' ? 'asc' : 'desc';
        } else {
          UI.sort.key = key;
          UI.sort.dir = 'desc';
        }
        render(el);
      } else if (act === 'ky') {
        ev.preventDefault();
        var a = A();
        var ky = hit.getAttribute('data-ky');
        if (a && a.state) a.state.kyId = ky;
        if (a && typeof a.setKy === 'function') { try { a.setKy(ky); return; } catch (e) { /* không có setKy */ } }
        render(el);
      } else if (act === 'moigioi') {
        ev.preventDefault();
        var a2 = A();
        if (a2 && typeof a2.go === 'function') a2.go('moigioi', { ma_mg: hit.getAttribute('data-ma-mg') });
      } else if (act === 'refresh') {
        ev.preventDefault();
        render(el);
      }
    });
  }

  /* ================================================================== BOOT */
  function boot() {
    injectStyle();
    var el = global.document.getElementById(ROOT_ID);
    if (!el) return;
    bindOnce(el);
    render(el);
  }

  function safeBoot() {
    /* try/catch bắt buộc: render lỗi không được làm sập module, vì
     * window.ScreenKhoi phải đăng ký được để app.js còn resolve hook. */
    try {
      boot();
    } catch (e) {
      if (global.console && console.warn) console.warn('[screen-khoi] render lỗi:', e);
      var el = global.document && global.document.getElementById(ROOT_ID);
      if (el) {
        el.innerHTML = '<div class="empty-state"><div class="empty-title">Không dựng được màn hình tổng hợp khối</div>' +
          '<p class="empty-note">' + esc(String((e && e.message) || e)) +
          ' — thử chuyển kỳ hoặc tải lại trang.</p></div>';
      }
    }
  }

  /* ================================================================ EXPORT
   * Đăng ký hook TRƯỚC khi boot — xem giải thích ở screen-canhan.js. */
  global.ScreenKhoi = { render: render, id: 'khoi' };
  global.KpiScreenKhoi = global.ScreenKhoi;
  global.renderKhoi = function (sec, ctx) { return render(sec, ctx); };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', safeBoot);
    }
    safeBoot();
  }

})(window);
