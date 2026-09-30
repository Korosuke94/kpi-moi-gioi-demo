/* =============================================================================
 * screen-canhan.js — MH03 "KPI của tôi"
 * -----------------------------------------------------------------------------
 * Dùng: window.ScreenCanhan.render(sec, ctx)   — sec = #screen-canhan
 *       (app.js tự resolve qua window.ScreenCanhan / renderCanhan)
 *
 * Chỉ ĐỌC window.KPI (data.js) và App.* — không định nghĩa, không sửa App.
 * Mọi lời gọi App.* đều bọc try/catch: App chưa có thì màn hình vẫn dựng được.
 * ========================================================================== */
(function (global) {
  'use strict';

  var ROOT_ID = 'screen-canhan';
  var STYLE_ID = 'kpi-style-canhan';
  var DASH = '—';

  /* ------------------------------------------------------------------ data */
  function K() { return global.KPI || {}; }
  function A() { return global.App || null; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function r1(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }

  /* ------------------------------------------------------------------
   * HỆ SỐ QUY ĐỔI SANG ĐIỂM FKP — PTSP chốt 30/09/2026 (data/kpi_config.json)
   *   phí net      × 10 điểm / 1 triệu
   *   lãi vay      ×  1 điểm / 1 triệu
   *   phí trái phiếu × 10 điểm / 100 triệu   (ĐƠN VỊ KHÁC HAI KHOẢN TRÊN)
   *   ⇒ diem_fkp = phi×10 + lai×1 + (phi_tp÷100)×10
   * Khoản "tài khoản mở mới" KHÔNG còn nằm trong FKP (thành chỉ tiêu KH_MOI).
   *
   * QUY TẮC: đọc THẲNG từ tham_so, KHÔNG có số mặc định âm thầm. Thiếu hệ
   * số → hàm trả null và phần hiển thị báo LỖI rõ ràng để người dùng sửa
   * tham số, thay vì ra điểm sai mà không ai biết.
   * ------------------------------------------------------------------ */
  var KHOAN_FKP = [
    { ten: 'Phí Net',        tien: 'phi_net_trieu',           diem: 'diem_phi',
      hs: 'he_so_phi_1trieu', donVi: 1,   nhanHs: 'đ/tr' },
    { ten: 'Lãi vay',        tien: 'lai_gdkq_thuc_thu_trieu', diem: 'diem_lai',
      hs: 'he_so_lai_1trieu', donVi: 1,   nhanHs: 'đ/tr' },
    { ten: 'Phí trái phiếu', tien: 'phi_traiphieu_trieu',    diem: 'diem_traiphieu',
      hs: 'he_so_tp_100trieu', donVi: 100, nhanHs: '100 tr' }
  ];
  function heSoFKP(ts, ten) {
    var v = (ts || {})[ten];
    return isNum(v) ? v : null;
  }
  /* Số hệ số trong ô (bảng) — thiếu thì đỏ + nêu đúng tên khoá. */
  function heSoCell(hs, ten) {
    if (isNum(hs)) return esc(n1(hs));
    return '<span class="neg">thiếu ' + esc(ten) + '</span>';
  }
  /* Số hệ số trong câu chữ (popover / dòng công thức) */
  function heSoText(hs, ten) {
    return isNum(hs) ? esc(n1(hs)) : '<span class="neg">thiếu ' + esc(ten) + '</span>';
  }
  /* 1 điểm FKP ứng với bao nhiêu tiền — suy ra TỪ hệ số, không gõ số cứng. */
  function tienTrenDiem(hs, donVi) {
    if (!isNum(hs) || hs <= 0) return null;
    return donVi / hs;
  }
  /* Điểm chuẩn: số nguyên thì in 0 chữ số, số lẻ thì in 2 chữ số. KHÔNG
     làm tròn về 0 — 0,1 điểm in thành "0 đ" là hiển thị sai. */
  function nChuan(v) {
    if (!isNum(v)) return DASH;
    return (Math.abs(v - Math.round(v)) < 1e-9) ? n0(v) : n2(v);
  }

  /* Ký hiệu (i): diễn giải/cách tính giấu sau popover, rê hoặc click là hiện.
     Dùng UIPop.footnote -> ký hiệu đứng ngay sau chữ; truyền chuỗi rỗng
     thì ký hiệu đứng trần (cũng dùng được như tooltip thuần). */
  function fn(text, pop, id) {
    var u = global.UIPop;
    if (!u || typeof u.footnote !== 'function') {
      return '<div class="card-sub">' + esc(text || '') + '</div>';
    }
    try {
      /* footnote(noiDungPopover, {inlineHTML: chuỗi hiện tại trên trang}) */
      return '<div class="card-sub">' + u.footnote(pop || '', {
        inlineHTML: esc(text || ''), id: id || ('fn-' + (fnSeq++))
      }) + '</div>';
    } catch (e) {
      return '<div class="card-sub">' + esc(text || '') + '</div>';
    }
  }
  var fnSeq = 0;

  function esc(s) {
    if (s === null || s === undefined) return DASH;
    var a = A();
    if (a && typeof a.esc === 'function') { try { return a.esc(s); } catch (e) { /* tự escape */ } }
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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

  /* App.pct nhận TỈ LỆ (1.02 → "102,0%"). Dò 1 lần rồi cache để chắc chắn
     đúng hợp đồng, kể cả khi App chưa nạp. */
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
  function pctDiem(v) { // chênh lệch so với 100%, có dấu
    if (!isNum(v)) return DASH;
    var s = pct(Math.abs(v), 1);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
  }

  function currentKyId() {
    var a = A();
    if (a && a.state && a.state.kyId) return a.state.kyId;
    var k = K();
    return (k.ky_hien_tai || {}).ky_id || null;
  }
  function rowsKy(kyId) {
    var k = K(), id = kyId || currentKyId();
    if (id && k.ket_qua_theo_ky && Array.isArray(k.ket_qua_theo_ky[id])) return k.ket_qua_theo_ky[id];
    if (!id && Array.isArray(k.ket_qua_ky_hien_tai)) return k.ket_qua_ky_hien_tai;
    if (id && k.ky_hien_tai && id === k.ky_hien_tai.ky_id) return k.ket_qua_ky_hien_tai || [];
    if (id && (k.ky_hien_tai || {}).ky_id === id) return k.ket_qua_ky_hien_tai || [];
    return Array.isArray(k.ket_qua_ky_hien_tai) ? k.ket_qua_ky_hien_tai : [];
  }
  function rowOf(maMg, list) {
    var l = list || rowsKy();
    for (var i = 0; i < l.length; i++) if (l[i].ma_mg === maMg) return l[i];
    return null;
  }
  function meMaMg(params) {
    if (params && params.ma_mg) return params.ma_mg;
    var a = A();
    if (a && a.state) {
      if (a.state.maMg) return a.state.maMg;
      if (a.state.ma_mg) return a.state.ma_mg;
    }
    if (a && a.user && a.user.ma_mg) return a.user.ma_mg;
    var l = rowsKy();
    return l.length ? l[0].ma_mg : null;
  }
  function phongTen(maPhong) {
    var ps = K().phong || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].ma_phong === maPhong) return ps[i].ten_phong;
    return maPhong || DASH;
  }

  /* ---------------------------------------------------------------------
   * PHẠM VI HIỂN THỊ — MH03 "KPI của tôi"
   * Toàn bộ khối số của màn (điểm, cơ cấu điểm, khách hàng, 6 kỳ) đều lấy
   * theo đúng mã môi giới đang xem — rows(r.ma_mg), lich_su[r.ma_mg] — nên
   * KHÔNG có dòng nào của người khác. Ràng buộc 5 của SPEC.md ("chỉ hiện
   * khách hàng của chính môi giới đang đăng nhập") vì thế đang được giữ.
   *
   * Chỗ duy nhất lộ tên người ngoài cây là <select> "Đang xem" liệt kê toàn
   * bộ KPI.mo_gioi. → chỉ liệt kê mã trong tập hậu duệ (App.mgTrongCay).
   * Lưu ý: dùng hậu duệ (không phải chính người) vì màn này mở được cho cả
   * cấp quản lý xem cấp dưới, và mọi mã trong tập đều là hàng hợp lệ.
   */
  function mgXemDuoc(maMg) {
    var a = A();
    if (a && typeof a.mgTrongCay === 'function') return a.mgTrongCay(maMg);
    /* Dự phòng khi app.js chưa có helper: chỉ hiện chính người đang xem. */
    var ds = K().mo_gioi || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].ma_mg === maMg) return [ds[i]];
    return [];
  }
  function chuanKey(row) {
    var bang = (K().tham_so || {}).diem_chuan || {};
    if (!row) return null;
    var k = row.chuc_danh + '|' + row.cap;
    if (bang[k]) return k;
    var pref = String(row.chuc_danh || '') + '|';
    var keys = Object.keys(bang);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(pref) === 0) return keys[i];
    return null;
  }

  /* ===================================================================== CSS
   * style.css đã có sẵn lớp nền cho màn hình này (cn-head, cn-ava, cn-alert,
   * cn-mini, svg.cn-chartsvg …) nên khối dưới CHỈ bổ sung phần style.css chưa
   * có. Không khai lại màu/size đã có để tránh đè nhầm tone của style.css.
   * ===================================================================== */
  var CSS = [
    /* Ô số lớn trong header (tỷ lệ) — chưa có trong style.css */
    '#screen-canhan .cn-xl{display:flex;flex-direction:column;align-items:flex-end;gap:4px;',
    '  text-align:right;}',
    '#screen-canhan .cn-xl .cn-xl-v{font-size:34px;font-weight:700;line-height:1.1;',
    '  letter-spacing:-.6px;font-variant-numeric:tabular-nums;color:var(--tone,var(--text));}',
    '#screen-canhan .cn-xl .tile-sub{white-space:normal;}',
    /* Ô chọn người xem (demo) */
    '#screen-canhan .cn-switch{display:flex;flex-direction:column;gap:4px;align-items:flex-end;',
    '  font-size:12px;color:var(--muted);}',
    '#screen-canhan .cn-sel{height:28px;max-width:210px;padding:0 8px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm);',
    '  background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;}',
    /* Bảng 7 cột của màn hình: các cột text không dính trái như mặc định */
    '#screen-canhan .table th,#screen-canhan .table td{padding:8px 12px;}',
    '#screen-canhan .table th:nth-child(1),#screen-canhan .table td:nth-child(1),',
    '#screen-canhan .table th:nth-child(2),#screen-canhan .table td:nth-child(2){position:static;',
    '  width:auto;min-width:0;box-shadow:none;}',
    '#screen-canhan .table tfoot td{position:static;background:var(--surface-2);}',
    '#screen-canhan .table td.num,#screen-canhan .table th.num{text-align:right;}',
    /* Dòng phụ (Phí Net / lãi vay) thụt lề để thấy nó thuộc chỉ tiêu FKP */
    '#screen-canhan .table tbody tr.cn-sub td:first-child{padding-left:28px;}',
    /* Thanh nhỏ trong cột "Tỷ lệ" — rộng hơn nền, có viền mảnh cho dễ thấy */
    '#screen-canhan .cn-mini{width:72px;height:6px;margin-top:4px;display:block;}',
    '#screen-canhan .cn-mini.ok > *{background:var(--a);}',
    '#screen-canhan .cn-mini.warn > *{background:var(--c);}',
    /* SVG 6 kỳ: màu cột do JS chọn, chỉ bổ sung phần chưa vẽ */
    '#screen-canhan svg.cn-chartsvg .bar-over{fill:#16a34a;}',
    '#screen-canhan svg.cn-chartsvg .bar-under{fill:#7dd3fc;}',
    '#screen-canhan svg.cn-chartsvg text{font-family:var(--font);',
    '  font-variant-numeric:tabular-nums;}',
    '@media (max-width:900px){#screen-canhan .cn-xl{align-items:flex-start;text-align:left;}}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ================================================================ helpers */
  function xlClass(g) { return 'xl-' + String(g || 'x').toUpperCase(); }
  function capNhan(cap) {
    if (cap === null || cap === undefined || cap === '') return '';
    return 'cấp ' + cap;
  }
  function initials(ten) {
    var p = String(ten || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[p.length - 2].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
  }
  function kyNhanTu(kyNhan) {
    var s = String(kyNhan || '');
    var p = s.split(/\s*→\s*/);
    return p.length > 1 ? p[0] : s;
  }

  /* --------------------------------------------------------------- 1. header */
  function blockHeader(r) {
    var tl = isNum(r.ty_le_hoan_thanh) ? r.ty_le_hoan_thanh : null;
    var chuan = diemChuanCuaToi(r);
    var h = [];
    h.push('<div class="cn-head">');
    h.push('  <div class="cn-id">');
    h.push('    <div class="cn-ava">' + esc(initials(r.ho_ten)) + '</div>');
    h.push('    <div>');
    h.push('      <h2 class="cn-name">' + esc(r.ho_ten) + '</h2>');
    h.push('      <div class="cn-meta">');
    h.push('        <span class="chip">' + esc(r.ma_mg) + '</span>');
    h.push('        <span class="chip">' + esc(r.chuc_danh) + (capNhan(r.cap) ? ' · ' + esc(capNhan(r.cap)) : '') + '</span>');
    h.push('        <span class="chip">' + esc(phongTen(r.ma_phong)) + '</span>');
    h.push('        <span class="chip">Kỳ ' + esc(r.ky_nhan || currentKyId() || DASH) + '</span>');
    h.push('      </div>');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="cn-right">');
    h.push('    <div class="cn-xl ' + xlClass(r.xep_loai) + '">');
    h.push('      <div class="cn-xl-v">' + esc(pct(tl, 1)) + '</div>');
    h.push('      <div class="tile-sub">' + (isNum(diemTuyetDoi(r)) ? '<b>' + esc(n0(diemTuyetDoi(r))) + '</b> điểm / chuẩn ' + esc(n0(chuan)) : 'Điểm chuẩn <span class="empty"></span>') + '</div>');
    h.push('      <span class="pill lg ' + xlClass(r.xep_loai) + '">Xếp loại ' + esc(r.xep_loai || DASH) + '</span>');
    h.push('    </div>');
    h.push('    <label class="cn-switch">');
    h.push('      <span>Đang xem</span>');
    h.push('      <select class="cn-sel" data-act="canhan-mg" aria-label="Chọn môi giới để xem KPI">' +
      mgXemDuoc(r.ma_mg).map(function (m) {
        return '<option value="' + esc(m.ma_mg) + '"' + (m.ma_mg === r.ma_mg ? ' selected' : '') + '>' +
          esc(m.ma_mg + ' · ' + m.ho_ten) + '</option>';
      }).join('') + '</select>');
    h.push('    </label>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* Điểm chuẩn: ưu tiên lich_su của đúng kỳ, fallback bảng tham_so. */
  function diemChuanCuaToi(r) {
    var ls = (K().lich_su || {})[r.ma_mg] || [];
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].ky_nhan === r.ky_nhan && isNum(ls[i].diem_chuan)) return ls[i].diem_chuan;
    }
    var fkp = ((r.chi_tieu || []).filter(function (c) { return c.ma_chi_tieu === 'FKP'; })[0] || {}).chi_tieu_muc;
    if (isNum(fkp)) return fkp;
    var ck = chuanKey(r);
    var o = ((K().tham_so || {}).diem_chuan || {})[ck];
    return (o && isNum(o.FKP)) ? o.FKP : null;
  }

  /* --------------------------------------------- 2. ô "tổng điểm" (ĐƠN VỊ!)
   * LƯU Ý: data.js để tong_diem là TỶ LỆ (0,66 = 66%), còn diem_chuan là ĐIỂM
   * TUYỆT ĐỐI. Nên "tổng điểm" hiển thị đúng là điểm tuyệt đối = tong_diem ×
   * diem_chuan; nếu in thẳng tong_diem sẽ ra 0,66 điểm — sai đơn vị. */
  function diemTuyetDoi(r) {
    var t = r.tong_diem, c = diemChuanCuaToi(r);
    if (isNum(t) && isNum(c)) return t * c;
    if (isNum(t) && t > 5) return t;      /* dự phòng dữ liệu đã đổi sang điểm */
    return null;
  }

  /* ------------------------------------------------- 2. ô "chênh lệch" */
  /* Chênh lệch = (Tỷ lệ hoàn thành − 1) × điểm chuẩn, ra ĐIỂM TUYỆT ĐỐI:
     dương = vượt chuẩn, âm = thiếu. Trước đây ô này in "còn thiếu bao nhiêu
     điểm phần trăm để đạt 100%" — thang phần trăm, không phải số tuyệt đối. */
  function blockConThieu(r) {
    var tl = isNum(r.ty_le_hoan_thanh) ? r.ty_le_hoan_thanh : null;
    var dc = diemChuanCuaToi(r);
    if (!isNum(tl) || !isNum(dc)) {
      return '<div class="tile"><div class="tile-label">Chênh lệch so với chuẩn</div>' +
        '<div class="tile-value"><span class="empty"></span></div>' +
        '<div class="tile-sub">Kỳ này chưa có đủ tỷ lệ hoàn thành và điểm chuẩn để tính.</div></div>';
    }
    var d = (tl - 1) * dc;
    if (Math.abs(d) < 0.05) {
      return '<div class="tile xl-A"><div class="tile-label">Chênh lệch so với chuẩn</div>' +
        '<div class="tile-value up">Đúng chuẩn</div>' +
        '<div class="tile-sub up">Bằng đúng ' + esc(n1(dc)) + ' điểm chuẩn.</div></div>';
    }
    var du = d > 0;
    return '<div class="tile ' + (du ? 'xl-A' : (tl >= 0.6 ? 'xl-C' : 'xl-D')) + '">' +
      '<div class="tile-label">Chênh lệch so với chuẩn</div>' +
      '<div class="tile-value ' + (du ? 'up' : (tl >= 0.6 ? 'warn' : 'down')) + '">' +
      (du ? '+' : '−') + esc(n1(Math.abs(d))) + '</div>' +
      '<div class="tile-sub">' + (du ? 'Vượt' : 'Thiếu') + ' ' + esc(n1(Math.abs(d))) +
      ' điểm so với chuẩn ' + esc(n1(dc)) + ' điểm.</div></div>';
  }

  /* ------------------------------------------------ 3. bảng giải thích tỷ lệ */
  function barMini(ratio) {
    if (!isNum(ratio)) return '<div class="cn-mini" aria-hidden="true"><i style="width:0"></i></div>';
    var w = Math.max(0, Math.min(100, ratio * 100));
    var cls = ratio >= 1 ? ' ok' : (ratio < 0.6 ? ' warn' : '');
    return '<div class="cn-mini' + cls + '" aria-hidden="true"><i style="width:' + w.toFixed(1) + '%"></i></div>';
  }
  /* style.css định nghĩa .cn-mini > * là khối cao 100% — dùng <i> trực tiếp. */

  /* Ô "Chênh lệch" = Thực tế − Chỉ tiêu, TUYỆT ĐỐI và cùng đơn vị với hai cột
   * trước nên đọc thẳng được. Giữ dấu: âm = thiếu (đỏ), dương = vượt (xanh),
   * 0 = đúng chỉ tiêu. */
  function canThieuCell(ct) {
    if (!ct || !isNum(ct.can_thieu)) return '<span class="empty"></span>';
    var d = ct.can_thieu;
    if (Math.abs(d) < 0.005) return '<span class="pos">đúng chỉ tiêu</span>';
    return '<span class="' + (d < 0 ? 'neg' : 'pos') + '">' +
      (d > 0 ? '+' : '−') + n1(Math.abs(d)) + '</span>';
  }

  function rowChiTieu(ct, subRows, noteRows) {
    var h = [];
    h.push('<tr>');
    h.push('  <td>' + esc(ct.ten) + ' <span class="muted small">(' + esc(ct.ma_chi_tieu) + ')</span></td>');
    // Chỉ tiêu tỷ lệ lưu 0..1 trong dữ liệu — dùng *_hien_thi (đã ×100) để
    // hiện "62,0 %" thay vì "0,6 %".
    h.push('  <td class="num">' + esc(n0(ct.gia_tri_hien_thi)) + (ct.don_vi ? ' <span class="muted small">' + esc(ct.don_vi) + '</span>' : '') + '</td>');
    h.push('  <td class="num">' + esc(n0(ct.chi_tieu_muc_hien_thi)) + '</td>');
    h.push('  <td class="num"><b>' + esc(pct(ct.ty_le_hoan_thanh, 1)) + '</b>' + barMini(ct.ty_le_hoan_thanh) + '</td>');
    // trong_so trong data.js là TỶ LỆ 0..1 (0.80 = 80%) — in ra phần trăm.
    h.push('  <td class="num">' + esc(pct(ct.trong_so, 0)) + '</td>');
    h.push('  <td class="num"><b>' + esc(n2(ct.diem_nhom)) + '</b></td>');
    h.push('  <td class="num">' + canThieuCell(ct) + '</td>');
    h.push('</tr>');
    if (subRows) h.push(subRows);
    if (noteRows) h.push(noteRows);
    return h.join('');
  }

  function blockGiaiThich(r) {
    var ts = K().tham_so || {};
    var fin = r.chi_tiet_tai_chinh || {};
    var thang = isNum(ts.so_thang_active) ? ts.so_thang_active : 3;
    var list = r.chi_tieu || [];
    var h = [];
    var sumDiem = 0, sumTs = 0, sumThieu = 0;

    h.push('<div class="card">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Giải thích tỷ lệ hoàn thành</div>');
    h.push(fn('Cách tính', '<div class="pop-h">Cách tính điểm nhóm</div>' +
      '<div class="pop-f"><b>Điểm nhóm</b> = (Thực tế ÷ Chỉ tiêu) × Trọng số</div>' +
      '<div class="pop-f">Tổng các nhóm là tổng điểm của nhân viên.</div>' +
      '<div class="pop-f">"Thực tế" và "Chỉ tiêu" là số gốc của chỉ tiêu; điểm nhóm mới là phần đóng góp sau trọng số.</div>' +
      '<div class="pop-f">Cột "Chênh lệch" = Thực tế − Chỉ tiêu, tuyệt đối và cùng đơn vị với hai cột trước: âm là thiếu, dương là vượt.</div>',
      'canhan-diem-nhom'));
    h.push('</div>');
    h.push('  </div>');
    h.push('  <div class="table-wrap">');
    h.push('    <table class="table"><thead><tr>');
    h.push('      <th>Chỉ tiêu</th><th class="num">Thực tế</th><th class="num">Chỉ tiêu</th>');
    h.push('      <th class="num">Tỷ lệ</th><th class="num">Trọng số</th><th class="num">Điểm nhóm</th>');
    h.push('      <th class="num">Chênh lệch</th>');
    h.push('    </tr></thead><tbody>');

    if (!list.length) {
      h.push('      <tr><td colspan="7"><span class="empty"></span> — kỳ này không có chỉ tiêu nào được giao.</td></tr>');
    }

    for (var i = 0; i < list.length; i++) {
      var ct = list[i];
      var sub = '', note = '';
      if (ct.ma_chi_tieu === 'FKP') {
        sub = subFKP(fin, ts);
      }
      if (ct.ma_chi_tieu === 'KH_ACTIVE') {
        note = '<tr class="cn-note-row"><td class="cn-note-cell" colspan="7">' +
          'Định nghĩa khách hàng active: khách hàng phát sinh giao dịch hoặc dư nợ trong ' +
          esc(num(thang, 0)) + ' tháng gần nhất.</td></tr>';
      }
      h.push(rowChiTieu(ct, sub, note));
      if (isNum(ct.diem_nhom)) sumDiem += ct.diem_nhom;
      if (isNum(ct.trong_so)) sumTs += ct.trong_so;
    }

    var dc = diemChuanCuaToi(r);
    var tl = isNum(r.ty_le_hoan_thanh) ? r.ty_le_hoan_thanh : null;
    var chenhLechTong = (isNum(tl) && isNum(dc)) ? (tl - 1) * dc : null;
    var chenhLechCell = '<span class="empty">—</span>';
    if (isNum(chenhLechTong)) {
      if (Math.abs(chenhLechTong) < 0.05) {
        chenhLechCell = '<span class="pos">Đúng chuẩn</span>';
      } else if (chenhLechTong > 0) {
        chenhLechCell = '<span class="pos">+' + esc(n1(chenhLechTong)) + '</span>';
      } else {
        chenhLechCell = '<span class="neg">−' + esc(n1(Math.abs(chenhLechTong))) + '</span>';
      }
    }

    h.push('    </tbody><tfoot><tr>');
    h.push('      <td>Tổng</td><td class="num">—</td><td class="num">—</td>');
    h.push('      <td class="num"><b>' + esc(pct(r.ty_le_hoan_thanh, 1)) + '</b></td>');
    // sumTs là TỔNG trọng số 0..1 -> in phần trăm ("100%"), không phải "1,00".
    h.push('      <td class="num">' + esc(pct(sumTs, 0)) + '</td>');
    h.push('      <td class="num"><b>' + esc(n2(sumDiem)) + '</b></td>');
    h.push('      <td class="num">' + chenhLechCell + '</td>');
    h.push('    </tr></tfoot></table>');
    h.push('  </div>');
    h.push('  <div class="cn-note-2">Trong bảng "Cột thực tế / chỉ tiêu" là số gốc của chỉ tiêu; ' +
      'điểm nhóm mới là phần đóng góp sau trọng số.</div>');
    h.push('</div>');
    return h.join('');
  }

  /* Các dòng phụ của FKP lấy từ chi_tiet_tai_chinh: 3 khoản phí / lãi /
     trái phiếu, mỗi dòng in đúng hệ số + đơn vị của chính khoản đó.
     Trái phiếu quy đổi theo 100 TRIỆU nên nhãn hệ số là "100 tr", không
     phải "đ/tr" (đó là thang của phí/lãi). */
  function subFKP(fin, ts) {
    var coSo = false, coDiem = false;
    for (var i = 0; i < KHOAN_FKP.length; i++) {
      if (isNum(fin[KHOAN_FKP[i].tien])) coSo = true;
      if (isNum(fin[KHOAN_FKP[i].diem])) coDiem = true;
    }
    if (!coSo && !coDiem) return '';
    var h = [];
    for (var j = 0; j < KHOAN_FKP.length; j++) {
      var k = KHOAN_FKP[j];
      var hs = heSoFKP(ts, k.hs);
      h.push('<tr class="cn-sub">');
      h.push('  <td>' + esc(k.ten) + ' (' +
        (k.donVi === 100 ? '100 triệu VNĐ' : 'triệu VNĐ') + ') → điểm</td>');
      h.push('  <td class="num">' + esc(n1(fin[k.tien])) + ' <span class="muted small">triệu</span></td>');
      h.push('  <td class="num">' + heSoCell(hs, k.hs) + ' <span class="muted small">' +
        esc(k.nhanHs) + '</span></td>');
      h.push('  <td class="num">—</td><td class="num">—</td>');
      h.push('  <td class="num"><b>' + esc(n1(fin[k.diem])) + '</b></td>');
      h.push('  <td class="num">—</td>');
      h.push('</tr>');
    }
    return h.join('');
  }

  /* ------------------------------------------------- 4. điểm chuẩn của tôi */
  function blockChuan(r) {
    var ts = K().tham_so || {};
    var ck = chuanKey(r);
    var o = ((ts.diem_chuan || {})[ck]) || {};
    var w = ts.trong_so_nhan_vien || {};
    var thang = isNum(ts.so_thang_active) ? ts.so_thang_active : 3;
    /* Hệ số đọc thẳng từ tham_so — KHÔNG có giá trị mặc định. Thiếu thì
       hiện lỗi đỏ kèm tên khoá, không thay bằng 1 / 0,1 âm thầm. */
    var hsPhi = heSoFKP(ts, 'he_so_phi_1trieu');
    var hsLai = heSoFKP(ts, 'he_so_lai_1trieu');
    var hsTp = heSoFKP(ts, 'he_so_tp_100trieu');

    /* 3 chỉ tiêu nhân viên: FKP + KH active + KH mở mới = 100%.
       KH_MOI là CHỈ TIÊU RIÊNG (PTSP chốt 30/09/2026) — trước đây nó bị
       hấp thụ vào FKP nên không còn là khoản của công thức FKP. */
    var CHI_TIEU = [
      { ma: 'FKP',       ten: 'FKP (kết quả kinh doanh chính)' },
      { ma: 'KH_ACTIVE', ten: 'KH active' },
      { ma: 'KH_MOI',    ten: 'KH mở mới' }
    ];
    var tongChuan = 0, coChuan = false, tongW = 0, thieuW = [];
    for (var i = 0; i < CHI_TIEU.length; i++) {
      var m = CHI_TIEU[i].ma;
      if (isNum(o[m])) { tongChuan += o[m]; coChuan = true; }
      if (isNum(w[m])) tongW += w[m]; else thieuW.push(m);
    }
    var tongW100 = pct(tongW, 0);

    /* Công thức: viết ra đúng từ hệ số trong tham_so, kèm đơn vị thật. */
    var formula =
      'Điểm nhóm i = (Thực tế i ÷ Chỉ tiêu i) × Trọng số i. ' +
      'Tổng điểm = ' + pct(w.FKP, 0) + '×tỷ lệ FKP + ' +
      pct(w.KH_ACTIVE, 0) + '×tỷ lệ KH active + ' +
      pct(w.KH_MOI, 0) + '×tỷ lệ KH mở mới ' +
      '(FKP + KH active + KH mở mới = ' + tongW100 + '). ' +
      'FKP = phí net (triệu) × ' + heSoText(hsPhi, 'he_so_phi_1trieu') +
      ' + lãi vay (triệu) × ' + heSoText(hsLai, 'he_so_lai_1trieu') +
      ' + (phí trái phiếu ÷ 100) × ' + heSoText(hsTp, 'he_so_tp_100trieu') + '. ' +
      'ĐƠN VỊ KHÁC NHAU: phí và lãi tính theo TRIỆU, trái phiếu theo 100 TRIỆU. ' +
      'Tương đương 1 điểm FKP: ' +
      (tienTrenDiem(hsPhi, 1) !== null ? n1(tienTrenDiem(hsPhi, 1)) + ' triệu phí net' : DASH) +
      ' · ' +
      (tienTrenDiem(hsLai, 1) !== null ? n1(tienTrenDiem(hsLai, 1)) + ' triệu lãi vay' : DASH) +
      ' · ' +
      (tienTrenDiem(hsTp, 100) !== null ? n1(tienTrenDiem(hsTp, 100)) + ' triệu phí trái phiếu' : DASH) +
      ' (PTSP chốt 30/09/2026). ' +
      'Khoản "tài khoản mở mới" KHÔNG còn là một phần của FKP — nó là chỉ tiêu ' +
      'KH mở mới với trọng số ' + pct(w.KH_MOI, 0) + '. ' +
      'Khách hàng active tính trong ' + n0(thang) + ' tháng gần nhất.';

    var canhBaoW = (thieuW.length)
      ? '<div class="cn-alert warn"><span class="cn-ic">!</span><div>Thiếu trọng số ' +
        esc(thieuW.join(', ')) + ' trong tham_so.trong_so_nhan_vien — tổng hiện ' +
        esc(tongW100) + ', cần đủ 3 mục FKP / KH active / KH mở mới.</div></div>'
      : '';

    var h = [];
    h.push('<div class="card">');
    h.push('  <div class="card-head"><div><div class="card-title">Điểm chuẩn của tôi</div>');
    h.push('    <div class="card-sub">Tra cứu theo chức danh + cấp: ' + esc(ck || DASH) + '</div></div>' +
      fn('Công thức', '<div class="pop-h">Công thức chấm đã dùng</div><div class="pop-f">' + formula + '</div>', 'canhan-ct-chuan') +
      '</div>');
    if (canhBaoW) h.push('  ' + canhBaoW);
    h.push('  <div class="detail-grid">');
    h.push('    <div class="detail-item"><span class="detail-label">Chức danh</span>' +
      '<span class="detail-value">' + esc(r.chuc_danh) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Cấp</span>' +
      '<span class="detail-value">' + (r.cap === null || r.cap === undefined ? '<span class="empty"></span>' : 'Cấp ' + esc(r.cap)) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Điểm chuẩn FKP</span>' +
      '<span class="detail-value">' + (isNum(o.FKP) ? esc(nChuan(o.FKP)) + ' <span class="muted small">đ</span>' : '<span class="empty"></span>') +
      ' <span class="muted small">— phẳng theo vai trò</span></span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Thành phần điểm FKP</span>' +
      '<span class="detail-value" style="font-weight:400;font-size:12.5px;line-height:1.6">' +
      'Phí Net (triệu VNĐ) × ' + heSoText(hsPhi, 'he_so_phi_1trieu') +
      ' + Lãi vay (triệu VNĐ) × ' + heSoText(hsLai, 'he_so_lai_1trieu') +
      ' + (Phí trái phiếu ÷ 100 triệu) × ' + heSoText(hsTp, 'he_so_tp_100trieu') +
      '</span></div>');
    for (var j = 0; j < CHI_TIEU.length; j++) {
      var k2 = CHI_TIEU[j].ma;
      var ghi = (k2 === 'KH_MOI') ? ' <span class="muted small">— chỉ tiêu riêng, không nằm trong FKP</span>' : '';
      h.push('    <div class="detail-item"><span class="detail-label">Điểm chuẩn ' + esc(CHI_TIEU[j].ten) + '</span>' +
        '<span class="detail-value">' + (isNum(o[k2]) ? esc(nChuan(o[k2])) + ' <span class="muted small">đ</span>' : '<span class="empty"></span>') +
        ghi + '</span></div>');
    }
    h.push('    <div class="detail-item"><span class="detail-label">Trọng số 3 chỉ tiêu</span>' +
      '<span class="detail-value">' + esc(pct(w.FKP, 0)) + ' FKP + ' + esc(pct(w.KH_ACTIVE, 0)) +
      ' KH active + ' + esc(pct(w.KH_MOI, 0)) + ' KH mở mới = ' + esc(tongW100) + '</span></div>');
    h.push('    <div class="detail-item"><span class="detail-label">Tổng điểm chuẩn của tôi</span>' +
      '<span class="detail-value">' + (coChuan ? esc(n0(diemTuyetDoi(r) || 0)) : '<span class="empty"></span>') +
      ' <span class="muted small">điểm</span></span></div>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* --------------------------------------------------------- 5. cảnh báo */
  function blockCanhBao(r) {
    var x = String(r.xep_loai || '').toUpperCase();
    var tl = isNum(r.ty_le_hoan_thanh) ? r.ty_le_hoan_thanh : null;
    if (x === 'D') {
      return '<div class="cn-alert bad"><span class="cn-ic">!</span><div>' +
        '<b>Cảnh báo — KPI kỳ này dưới 60%</b>' +
        'KPI kỳ này dưới 60%. Theo chính sách, nhân viên dưới 60% không được nhận thu nhập theo KPI ' +
        'và có thể bị điều chuyển khác phòng.' +
        (isNum(tl) ? ' Mức hiện tại ' + esc(pct(tl, 1)) + ', cần thêm ' + esc(num(r1((0.6 - tl) * 100), 1)) + '% để chạm ngưỡng 60%.' : '') +
        '</div></div>';
    }
    if (x === 'C') {
      return '<div class="cn-alert warn"><span class="cn-ic">!</span><div>' +
        '<b>Cảnh báo — KPI chưa đạt mức 80%</b>' +
        'KPI kỳ này dưới 80%. Theo chính sách, mức này chưa đủ điều kiện nhận thu nhập theo KPI; ' +
        'cần cải thiện để vượt ngưỡng 80%.' +
        (isNum(tl) ? ' Mức hiện tại ' + esc(pct(tl, 1)) + ', cần thêm ' + esc(num(r1((0.8 - tl) * 100), 1)) + '% để chạm mức 80%.' : '') +
        '</div></div>';
    }
    var nd = x === 'A' ? 'Xuất sắc (từ 110%)' : 'Đạt (từ 80%)';
    return '<div class="cn-alert ok"><span class="cn-ic">✓</span><div>' +
      '<b>Đạt chuẩn — xếp loại ' + esc(r.xep_loai || DASH) + '</b>' +
      'Kỳ này đạt mức ' + esc(nd) + (isNum(tl) ? ' với tỷ lệ ' + esc(pct(tl, 1)) : '') + '. Không bị cảnh báo KPI.</div></div>';
  }

  /* ------------------------------------------- 6. biểu đồ 6 kỳ (SVG thuần) */
  function bieuDo6Ky(maMg) {
    var ls = (K().lich_su || {})[maMg] || [];
    var n = ls.length;
    if (!n) {
      return '<div class="card"><div class="card-head"><div class="card-title">Diễn biến 6 kỳ</div></div>' +
        '<div class="card-body"><p class="muted">Chưa có dữ liệu lịch sử cho môi giới ' + esc(maMg) + '.</p></div></div>';
    }
    var W = 720, H = 260, padL = 54, padR = 54, padT = 20, padB = 40;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    /* trục trái = tỷ lệ (tong_diem), trục phải = điểm chuẩn (điểm tuyệt đối) */
    var maxR = 0, maxC = 0;
    for (var i = 0; i < n; i++) {
      if (isNum(ls[i].tong_diem) && ls[i].tong_diem > maxR) maxR = ls[i].tong_diem;
      if (isNum(ls[i].diem_chuan) && ls[i].diem_chuan > maxC) maxC = ls[i].diem_chuan;
    }
    if (!(maxR > 0)) maxR = 1;
    if (!(maxC > 0)) maxC = 1;
    var hiR = maxR * 1.12, hiC = maxC * 1.12;
    function yR(v) { return padT + plotH - (Math.max(0, v) / hiR) * plotH; }
    function yC(v) { return padT + plotH - (Math.max(0, v) / hiC) * plotH; }

    var slot = plotW / n;
    var barW = Math.max(16, Math.min(48, slot * 0.5));
    var s = [];
    s.push('<svg class="cn-chartsvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Biểu đồ 6 kỳ của ' + esc(maMg) + ': cột là tỷ lệ hoàn thành, đường là điểm chuẩn" ' +
      'preserveAspectRatio="xMidYMid meet">');
    s.push('<defs><pattern id="cnNaHatch" width="6" height="6" patternUnits="userSpaceOnUse">' +
      '<rect width="6" height="6" fill="#f1f5f9"/><path d="M0,6 L6,0" stroke="#e2e8f0" stroke-width="1.5"/></pattern></defs>');

    /* lưới + nhãn trục (4-5 vạch) */
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var f = t / ticks;
      var y = padT + plotH - f * plotH;
      s.push('<line class="grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>');
      s.push('<text class="axis" x="' + (padL - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10">' +
        esc(num(hiR * f, hiR < 2 ? 2 : 1)) + '</text>');
      s.push('<text class="axis" x="' + (W - padR + 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="start" font-size="10">' +
        esc(num(hiC * f, 0)) + '</text>');
    }
    s.push('<line class="zero" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"/>');
    s.push('<text class="axis" x="' + padL + '" y="12" font-size="10">Tỷ lệ hoàn thành</text>');
    s.push('<text class="axis" x="' + (W - padR) + '" y="12" font-size="10" text-anchor="end">Điểm chuẩn</text>');

    /* cột = tỷ lệ (tong_diem) */
    var pts = [];
    for (var c = 0; c < n; c++) {
      var cx = padL + slot * c + slot / 2;
      var v = ls[c].tong_diem;
      var ch = ls[c].diem_chuan;
      var tip = esc(ls[c].ky_nhan) + ' — Tổng điểm: ' + esc(n2(v)) +
        (isNum(ch) ? ' · Điểm chuẩn: ' + esc(n0(ch)) : '') +
        (isNum(ls[c].ty_le_hoan_thanh) ? ' · Hoàn thành: ' + esc(pct(ls[c].ty_le_hoan_thanh, 1)) : '') +
        (ls[c].xep_loai ? ' · Xếp loại ' + esc(ls[c].xep_loai) : '');
      if (isNum(v)) {
        var yv = yR(v);
        var h = Math.max(1, (padT + plotH) - yv);
        /* Cột vượt chuẩn (tỷ lệ > 1) tô xanh lá, còn lại tô xanh nhạt. */
        var over = isNum(ls[c].ty_le_hoan_thanh) ? ls[c].ty_le_hoan_thanh > 1 : v > 1;
        var cls = over ? 'bar-over' : 'bar-under';
        s.push('<rect class="' + cls + '" x="' + (cx - barW / 2).toFixed(1) + '" y="' + yv.toFixed(1) +
          '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + tip + '</title></rect>');
        s.push('<text class="axis" x="' + cx.toFixed(1) + '" y="' + (yv - 4).toFixed(1) +
          '" text-anchor="middle" font-size="9.5">' + esc(num(v, 2)) + '</text>');
      } else {
        s.push('<rect x="' + (cx - barW / 2).toFixed(1) + '" y="' + (padT + plotH - 30) +
          '" width="' + barW + '" height="30" rx="3" fill="url(#cnNaHatch)" stroke="#cbd5e1" stroke-dasharray="3 3">' +
          '<title>' + tip + ' — chưa có dữ liệu, không hiển thị số 0</title></rect>');
      }
      if (isNum(ch)) pts.push(cx.toFixed(1) + ',' + yC(ch).toFixed(1));
    }

    /* đường = điểm chuẩn (trục phải) */
    if (pts.length) {
      s.push('<polyline fill="none" stroke="#f97316" stroke-width="2" stroke-linejoin="round" points="' + pts.join(' ') + '"/>');
      for (var p = 0; p < pts.length; p++) {
        var xy = pts[p].split(',');
        s.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3" fill="#f97316"/>');
      }
      var lastCh = ls[n - 1].diem_chuan;
      /* Nhãn "Điểm chuẩn" neo bên TRONG vùng vẽ, canh phải — đặt ngoài
         (W - padR + 2) thì vượt viewBox 720 và bị cắt. */
      s.push('<text class="ref-label" x="' + (W - padR - 4) + '" y="' + (yC(lastCh) - 5).toFixed(1) +
        '" text-anchor="end" font-size="10">Điểm chuẩn</text>');
    }

    /* trục X — nhãn kỳ rút gọn */
    for (var e = 0; e < n; e++) {
      var lx = padL + slot * e + slot / 2;
      s.push('<text class="axis" x="' + lx.toFixed(1) + '" y="' + (padT + plotH + 15) +
        '" text-anchor="middle" font-size="10">' + esc(kyNhanTu(ls[e].ky_nhan)) + '</text>');
      if (ls[e].xep_loai) {
        s.push('<text class="axis ' + xlClass(ls[e].xep_loai) + '" x="' + lx.toFixed(1) + '" y="' + (padT + plotH + 29) +
          '" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:var(--tone)">' + esc(ls[e].xep_loai) + '</text>');
      }
    }
    s.push('</svg>');
    return s.join('');
  }

  function blockBieuDo(maMg) {
    var h = [];
    h.push('<div class="card">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Diễn biến 6 kỳ</div>');
    h.push('      ' + fn('Cách đọc', '<div class="pop-h">Cách đọc biểu đồ 6 kỳ</div>' +
      '<div class="pop-f"><b>Cột</b> (trục trái) = tỷ lệ hoàn thành, tính bằng Thực tế ÷ Chỉ tiêu × 100.</div>' +
      '<div class="pop-f"><b>Đường</b> (trục phải) = điểm chuẩn của kỳ đó.</div>' +
      '<div class="pop-f">Cột vượt đường là kỳ vượt chuẩn; cột nằm dưới đường là kỳ chưa đạt.</div>',
      'canhan-6ky') + '</div>');
    h.push('    <div class="legend">');
    h.push('      <span class="legend-item"><i class="legend-swatch" style="background:#16a34a"></i>Vượt chuẩn</span>');
    h.push('      <span class="legend-item"><i class="legend-swatch" style="background:#7dd3fc"></i>Dưới chuẩn</span>');
    h.push('      <span class="legend-item"><i class="legend-swatch" style="background:#f97316"></i>Điểm chuẩn</span>');
    h.push('    </div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="chart tall">' + bieuDo6Ky(maMg) + '</div>');
    h.push('  </div>');
    h.push('</div>');
    return h.join('');
  }

  /* =============================================================== RENDER */
  function render(sec, ctx) {
    var el = typeof sec === 'string' ? global.document.getElementById(sec) : sec;
    if (!el) return;
    injectStyle();

    var params = (ctx && ctx.params) || null;
    var kyId = (ctx && ctx.kyId) || currentKyId();
    var list = rowsKy(kyId);
    var maMg = meMaMg(params);
    var r = rowOf(maMg, list);

    if (!r) {
      var k = K();
      el.innerHTML =
        '<div class="card"><div class="card-body">' +
        '<div class="tile-label">KPI của tôi</div>' +
        '<p class="muted">Môi giới <b>' + esc(maMg || DASH) + '</b> không có số liệu trong kỳ ' +
        esc(kyId || DASH) + '.</p>' +
        '<p class="muted small">Màn hình hiển thị "—" thay cho số 0, không dựng số liệu cho kỳ không có dữ liệu.</p>' +
        '</div></div>';
      return;
    }

    var h = [];
    h.push(blockHeader(r));
    h.push('<div class="kpi-tiles" style="margin-top:var(--sp-4)">');
    h.push('  <div class="tile ' + xlClass(r.xep_loai) + '">');
    h.push('    <div class="tile-label">Tỷ lệ hoàn thành</div>');
    h.push('    <div class="tile-value">' + esc(pct(r.ty_le_hoan_thanh, 1)) + '</div>');
    h.push('    <div class="tile-sub ' + (isNum(r.ty_le_hoan_thanh) ? (r.ty_le_hoan_thanh >= 1 ? 'up' : 'down') : '') + '">' +
      (isNum(r.ty_le_hoan_thanh) ? esc(pctDiem(r.ty_le_hoan_thanh - 1)) + ' so với chuẩn 100%' : '<span class="empty"></span>') + '</div>');
    h.push('  </div>');
    h.push('  <div class="tile">');
    h.push('    <div class="tile-label">Điểm đạt / điểm chuẩn</div>');
    h.push('    <div class="tile-value">' + (isNum(diemTuyetDoi(r)) ? esc(n0(diemTuyetDoi(r))) : '<span class="empty"></span>') + '</div>');
    h.push('    <div class="tile-sub">' + (isNum(diemChuanCuaToi(r)) ? 'Chuẩn ' + esc(n0(diemChuanCuaToi(r))) + ' điểm' : '<span class="empty"></span> chưa có điểm chuẩn') + '</div>');
    h.push('  </div>');
    h.push('  <div class="tile ' + xlClass(r.xep_loai) + '">');
    h.push('    <div class="tile-label">Xếp loại</div>');
    h.push('    <div class="tile-value">' + esc(r.xep_loai || DASH) + '</div>');
    h.push('    <div class="tile-sub">A ≥ 110% · B ≥ 80% · C ≥ 60% · D &lt; 60%</div>');
    h.push('  </div>');
    h.push(blockConThieu(r));
    h.push('</div>');
    h.push('<div style="margin:var(--sp-4) 0">' + blockCanhBao(r) + '</div>');
    h.push(blockGiaiThich(r));
    h.push('<div style="height:var(--sp-4)"></div>');
    h.push(blockChuan(r));
    h.push('<div style="height:var(--sp-4)"></div>');
    h.push(blockBieuDo(r.ma_mg));

    el.innerHTML = h.join('');

    /* 3 khối KPI cá nhân (FKP theo khách / chi tiết từng KH / tăng trưởng kỳ
     * trước) do screen-canhan-kh.js chèn vào. Gọi SAU innerHTML để canvas có
     * trong DOM rồi Chart.js mới mount được. */
    var kh = global.CanhanKH;
    if (kh && typeof kh.augment === 'function') {
      try { kh.augment(el, { params: params, kyId: kyId }); }
      catch (e2) { if (global.console && console.warn) console.warn('[screen-canhan] kh:', e2); }
    }

    var a = A();
    if (a && typeof a.lucideCreateIcons === 'function') { try { a.lucideCreateIcons(); } catch (e) { /* không có lucide là bình thường */ } }
  }

  /* ==================================================== EVENT DELEGATION 1×
   * Gắn đúng 1 lần nhờ cờ window.__canhanBound, listener gắn trên chính
   * section nên không đụng tới app khác. */
  function bindOnce(el) {
    if (!el || global.__canhanBound) return;
    global.__canhanBound = true;
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var hit = t.closest('[data-act]');
      if (!hit) return;
      var act = hit.getAttribute('data-act');
      if (act === 'moigioi') {
        ev.preventDefault();
        var a = A();
        if (a && typeof a.go === 'function') a.go('moigioi', { ma_mg: hit.getAttribute('data-ma-mg') });
      } else if (act === 'ky') {
        ev.preventDefault();
        var a2 = A();
        if (a2 && a2.state) { a2.state.kyId = hit.getAttribute('data-ky'); }
        if (a2 && typeof a2.setKy === 'function') { try { a2.setKy(hit.getAttribute('data-ky')); return; } catch (e) { /* không có setKy */ } }
        render(el);
      } else if (act === 'refresh') {
        ev.preventDefault();
        render(el);
      }
    });
    el.addEventListener('change', function (ev) {
      var sel = ev.target;
      if (!sel || !sel.getAttribute) return;
      if (sel.getAttribute('data-act') !== 'canhan-mg') return;
      var a = A();
      if (a && typeof a.setUser === 'function') { try { a.setUser(sel.value); return; } catch (e) { /* không có setUser */ } }
      render(el);
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
    /* try/catch ở đây là bắt buộc: nếu render ném lỗi (dữ liệu kỳ đặc biệt, App
     * chưa sẵn sàng…) thì màn hình chỉ báo lỗi, KHÔNG làm sập cả module — vì
     * window.ScreenCanhan phải được đăng ký để app.js còn resolve được hook. */
    try {
      boot();
    } catch (e) {
      if (global.console && console.warn) console.warn('[screen-canhan] render lỗi:', e);
      var el = global.document && global.document.getElementById(ROOT_ID);
      if (el) {
        el.innerHTML = '<div class="empty-state"><div class="empty-title">Không dựng được màn hình KPI cá nhân</div>' +
          '<p class="empty-note">' + esc(String((e && e.message) || e)) +
          ' — thử chuyển kỳ hoặc tải lại trang.</p></div>';
      }
    }
  }

  /* ================================================================ EXPORT
   * Đăng ký hook TRƯỚC khi boot: nếu render lỗi thì app.js vẫn gọi được
   * window.ScreenCanhan.render thay vì báo "chưa có hàm render". */
  global.ScreenCanhan = { render: render, id: 'canhan' };
  global.KpiScreenCanhan = global.ScreenCanhan;
  global.renderCanhan = function (sec, ctx) { return render(sec, ctx); };

  /* Boot chạy NGAY (script nạp sau các <section> trong index.html) và chạy lại
   * khi DOMContentLoaded nếu script có nạp trước thẻ section. bindOnce có cờ
   * nên listener không bao giờ gắp 2 lần. */
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', safeBoot);
    }
    safeBoot();
  }

})(window);
