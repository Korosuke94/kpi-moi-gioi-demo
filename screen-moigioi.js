/* MH02 — Chi tiết môi giới (mở khi bấm một dòng ở MH01).
 * Dùng: window.ScreenMoigioi.render(sec, ctx) — app.js gọi fn(el, ctx).
 * Chỉ đọc window.KPI và App.*, không định nghĩa App.
 * class dùng đúng bộ từ vựng của style.css: card / card-head / card-title /
 * card-sub / card-body / card-foot / detail-grid / detail-item / detail-label /
 * detail-value / tile / kpi-tiles / chart / legend / legend-item / progress /
 * table / table-wrap / row-link / pill / badge / empty / pos / neg.
 *
 * LƯU Ý DỮ LIỆU: lich_su[].tong_diem là TỶ LỆ (1,02 = 102%), còn diem_chuan là
 * ĐIỂM TUYỆT ĐỐI (1.200). Vẽ cột bằng tong_diem × diem_chuan — đưa thẳng tỷ lệ
 * vào trục Y thì mọi cột sập về 0, nhìn như không có biểu đồ.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ tiện ích */

  function K() { return window.KPI || {}; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* Ký hiệu (i): diễn giải/cách tính giấu sau popover, rê hoặc click là hiện. */
  function fn(text, pop, id) {
    var u = window.UIPop;
    if (!u || typeof u.footnote !== 'function') {
      return '<div class="card-sub">' + (text || '') + '</div>';
    }
    try {
      /* footnote(noiDungPopover, {inlineHTML: chuỗi hiện tại trên trang}) */
      return '<div class="card-sub">' + u.footnote(pop || '', {
        inlineHTML: (text || ''), id: id || ('fn-mg-' + (fnSeq++))
      }) + '</div>';
    } catch (e) {
      return '<div class="card-sub">' + (text || '') + '</div>';
    }
  }
  var fnSeq = 0;

  function fmtNum(v, digits) {
    if (!isNum(v)) return '—';
    if (window.App && typeof App.fmtNum === 'function') return App.fmtNum(v, digits);
    var d = (digits === undefined || digits === null) ? 0 : digits;
    var a = Math.abs(v).toFixed(d).split('.');
    a[0] = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '-' : '') + a.join(',');
  }

  function pctText(v, digits) {
    if (!isNum(v)) return '—';
    if (window.App && typeof App.pct === 'function') {
      var s = String(App.pct(v, digits));
      if (s.indexOf('%') < 0) s = s + '%';
      return s;
    }
    return fmtNum(v * 100, digits === undefined ? 1 : digits) + '%';
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    if (window.App && typeof App.esc === 'function') return App.esc(s);
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Số chưa có nguồn -> ô rỗng class="empty" (style.css tự vẽ dấu —),
     TUYỆT ĐỐI không hiện 0. */
  function val(v, digits) {
    if (!isNum(v)) return '<span class="empty"></span>';
    return fmtNum(v, digits);
  }

  function valPct(v, digits) {
    if (!isNum(v)) return '<span class="empty"></span>';
    return pctText(v, digits);
  }

  /* Bản số thô để ghép chuỗi (tooltip): null giữ nguyên null, không đổi thành 0. */
  function numOrNull(v, digits) {
    if (!isNum(v)) return null;
    return fmtNum(v, digits);
  }

  /* "25/09 → 24/10" -> "25/09" cho nhãn trục X. */
  function nganKy(ky_nhan) {
    if (!ky_nhan) return '—';
    return String(ky_nhan).split('→')[0].trim() || '—';
  }

  function classXL(xl) {
    var x = String(xl || '').toUpperCase();
    if (x === 'A' || x === 'B' || x === 'C' || x === 'D') return 'xl-' + x;
    return 'muted-pill';
  }

  function capText(cap) {
    if (!isNum(cap)) return null;
    return cap <= 0 ? 'Khác' : 'Cấp ' + cap;
  }

  /* --------------------------------------------------------- lấy dữ liệu */

  function kyIdHienTai(ctx) {
    if (ctx && ctx.kyId) return ctx.kyId;
    if (window.App && App.state && App.state.kyId) return App.state.kyId;
    return (K().ky_hien_tai || {}).ky_id;
  }

  function kyHienTai(ctx) {
    var id = kyIdHienTai(ctx);
    if (window.App && typeof App.getKy === 'function') {
      var k = App.getKy(id);
      if (k) return k;
    }
    var ds = K().danh_sach_ky || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].ky_id === id) return ds[i];
    return K().ky_hien_tai || {};
  }

  /* Mã môi giới đang xem. KHÔNG lấy App.state.ma_mg: đó là bí danh sống của
     NGƯỜI ĐANG ĐĂNG NHẬP, không phải dòng được bấm ở MH01. */
  function maMgDangXem(ctx) {
    if (ctx && ctx.params && ctx.params.ma_mg) return ctx.params.ma_mg;
    if (ctx && ctx.ma_mg) return ctx.ma_mg;
    if (window.App && App.state) {
      if (App.state.params && App.state.params.ma_mg) return App.state.params.ma_mg;
      if (App.state.viewMaMg) return App.state.viewMaMg;
      if (App.state.paramsByScreen && App.state.paramsByScreen.moigioi && App.state.paramsByScreen.moigioi.ma_mg) {
        return App.state.paramsByScreen.moigioi.ma_mg;
      }
      if (App.state.maMg) return App.state.maMg;
    }
    var list = (K().mo_gioi || []);
    return list.length ? list[0].ma_mg : null;
  }

  function rowOf(ma_mg, ctx) {
    var id = kyIdHienTai(ctx);
    if (window.App && typeof App.rowOf === 'function') {
      var r = App.rowOf(ma_mg, id);
      if (r) return r;
    }
    var ds = (K().ket_qua_theo_ky || {})[id];
    if (ds && ds.length) {
      for (var i = 0; i < ds.length; i++) if (ds[i].ma_mg === ma_mg) return ds[i];
      return null;
    }
    var cur = K().ket_qua_ky_hien_tai || [];
    for (var j = 0; j < cur.length; j++) if (cur[j].ma_mg === ma_mg) return cur[j];
    return null;
  }

  function lichSu(ma_mg) {
    if (window.App && typeof App.lichSu === 'function') {
      var l = App.lichSu(ma_mg);
      if (l && l.length) return l;
    }
    var ls = (K().lich_su || {})[ma_mg];
    return Array.isArray(ls) ? ls : [];
  }

  function mgOf(ma_mg) {
    if (window.App && typeof App.mgById === 'function') {
      var m = App.mgById(ma_mg);
      if (m) return m;
    }
    var ds = K().mo_gioi || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].ma_mg === ma_mg) return ds[i];
    return null;
  }

  function tenPhong(ma_phong) {
    if (!ma_phong) return null;
    if (window.App && typeof App.tenPhong === 'function') {
      var t = App.tenPhong(ma_phong);
      if (t) return t;
    }
    var ds = K().phong || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].ma_phong === ma_phong) return ds[i].ten_phong;
    return null;
  }

  function heSo(ten) {
    var t = K().tham_so || {};
    return isNum(t[ten]) ? t[ten] : null;
  }

  /* ---------------------------------------------------------------------
   * PHẠM VI HIỂN THỊ — MH02
   * Dữ liệu MH02 (điểm, lịch sử, KPI) gắn với đúng mã môi giới đang xem
   * nên bản thân các bảng số không lộ người khác. Chỗ lộ là <select>
   * "Đổi người" liệt kê TOÀN BỘ KPI.mo_gioi (17 mã) — mỗi <option> chứa
   * tên đầy đủ của người ngoài cây.
   * → Chỉ liệt kê mã nằm trong tập hậu duệ của người đang xem (App.mgTrongCay).
   */
  function mgXemDuoc(ma_mg) {
    var a = window.App;
    if (a && typeof a.mgTrongCay === 'function') return a.mgTrongCay(ma_mg);
    /* Dự phòng khi app.js chưa có helper: chỉ hiện chính người đang xem,
     * thay vì mặc định lộ toàn bộ danh sách. */
    var ds = K().mo_gioi || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].ma_mg === ma_mg) return [ds[i]];
    return [];
  }

  /* -------------------------------------------- biểu đồ cột SVG tự vẽ */

  /* Điểm tuyệt đối của một kỳ. tong_diem là tỷ lệ, diem_chuan là điểm. */
  function diemThucTe(ky) {
    if (!ky) return null;
    if (isNum(ky.tong_diem) && isNum(ky.diem_chuan)) return ky.tong_diem * ky.diem_chuan;
    /* dự phòng: nếu dữ liệu sau này đã đổi sang điểm tuyệt đối */
    if (isNum(ky.tong_diem) && ky.tong_diem > 5) return ky.tong_diem;
    return null;
  }

  function bieuDoSVG(ls) {
    var W = 720, H = 260;
    var padL = 58, padR = 18, padT = 20, padB = 46;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var diem = [], chuan = [], n = 0;
    for (var i = 0; i < ls.length; i++) {
      diem.push(diemThucTe(ls[i]));
      chuan.push(isNum(ls[i].diem_chuan) ? ls[i].diem_chuan : null);
      n++;
    }
    if (!n) return '';

    var all = [];
    for (var a = 0; a < n; a++) {
      if (isNum(diem[a])) all.push(diem[a]);
      if (isNum(chuan[a])) all.push(chuan[a]);
    }
    if (!all.length) return '';

    var maxV = all[0], minV = all[0];
    for (var b = 1; b < all.length; b++) {
      if (all[b] > maxV) maxV = all[b];
      if (all[b] < minV) minV = all[b];
    }
    var lo = Math.min(0, minV), hi = maxV;
    if (hi <= lo) hi = lo + 1;
    hi += (hi - lo) * 0.15;

    var ticks = 5;
    var step = (hi - lo) / (ticks - 1);
    function yOf(v) { return padT + plotH - ((v - lo) / (hi - lo)) * plotH; }

    var slot = plotW / n;
    var barW = Math.min(54, Math.max(18, slot * 0.56));
    var y0 = yOf(0);

    var s = [];
    s.push('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Tổng điểm ' + n + ' kỳ so với điểm chuẩn" preserveAspectRatio="xMidYMid meet">');

    /* ô sọc cho kỳ chưa có số liệu — KHÔNG vẽ cột cao 0.
       Màu đặt bằng style="..." chứ không phải fill="...": var() trong thuộc tính
       trình bày của SVG không được trình duyệt phân giải, sẽ ra màu đen. */
    s.push('<defs><pattern id="mgNa" width="6" height="6" patternUnits="userSpaceOnUse">' +
      '<rect width="6" height="6" style="fill:var(--surface-3)"/>' +
      '<path d="M0,6 L6,0" style="stroke:var(--border-strong)" stroke-width="1.4"/></pattern></defs>');

    /* lưới ngang + nhãn trục Y (5 vạch) */
    for (var t = 0; t < ticks; t++) {
      var gv = lo + step * t, gy = yOf(gv);
      s.push('<line class="grid" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + gy.toFixed(1) + '"/>');
      s.push('<text class="axis" x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) +
        '" text-anchor="end">' + fmtNum(gv, 0) + '</text>');
    }
    if (lo < 0) {
      s.push('<line class="zero" x1="' + padL + '" y1="' + y0.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + y0.toFixed(1) + '"/>');
    }

    /* cột */
    for (var c = 0; c < n; c++) {
      var d = diem[c], ch = chuan[c];
      var x = padL + slot * c + slot / 2 - barW / 2;
      var cls = 'bar';
      var fill = 'var(--muted)';
      if (isNum(d)) {
        if (isNum(ch)) {
          if (d > ch) { cls += ' bar-over'; fill = 'var(--a)'; }
          else if (d < ch) { cls += ' bar-under'; fill = 'var(--b)'; }
          else { cls += ' bar-eq'; fill = 'var(--muted)'; }
        } else {
          cls += ' bar-eq';
        }
        var yv = yOf(d);
        var top = Math.min(yv, y0), hgt = Math.abs(y0 - yv);
        if (hgt < 1.5) hgt = 1.5;
        s.push('<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) +
          '" width="' + barW.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="3" style="fill:' + fill + '">' +
          '<title>' + esc(ls[c].ky_nhan) + ' — Tổng điểm: ' + numOrNull(d, 0) + ' điểm' +
          (isNum(ch) ? ' · Chuẩn ' + numOrNull(ch, 0) + ' điểm' : '') +
          (isNum(ls[c].ty_le_hoan_thanh) ? ' · Hoàn thành ' + pctText(ls[c].ty_le_hoan_thanh, 1) : '') +
          '</title></rect>');
      } else {
        s.push('<rect class="bar bar-na" x="' + x.toFixed(1) + '" y="' + (y0 - 30).toFixed(1) +
          '" width="' + barW.toFixed(1) + '" height="30" rx="3" fill="url(#mgNa)" ' +
          'style="stroke:var(--border-strong)" stroke-dasharray="3 3">' +
          '<title>' + esc(ls[c].ky_nhan) + ' — chưa có dữ liệu, hiển thị “—” thay vì 0</title></rect>');
      }
    }

    /* đường ngang điểm chuẩn */
    var coChuan = false;
    for (var d2 = 0; d2 < n; d2++) { if (isNum(chuan[d2])) { coChuan = true; break; } }
    if (coChuan) {
      var refY = yOf(chuan[0]);
      s.push('<line class="ref-line" x1="' + padL + '" y1="' + refY.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + refY.toFixed(1) + '" style="stroke:var(--c)" stroke-width="2" stroke-dasharray="6 4"/>');
      s.push('<text class="ref-label" x="' + (W - padR - 2) + '" y="' + (refY - 5).toFixed(1) +
        '" text-anchor="end">Điểm chuẩn ' + fmtNum(chuan[0], 0) + '</text>');
    }

    /* nhãn kỳ trục X: rút gọn dd/mm */
    for (var e = 0; e < n; e++) {
      s.push('<text class="axis" x="' + (padL + slot * e + slot / 2).toFixed(1) + '" y="' + (H - 24) +
        '" text-anchor="middle">' + esc(nganKy(ls[e].ky_nhan)) + '</text>');
    }
    s.push('<text class="axis" x="' + padL + '" y="' + (H - 8) + '">Kỳ đánh giá (ngày đầu)</text>');
    s.push('</svg>');
    return s.join('');
  }

  /* ------------------------------------------- bảng cơ cấu điểm (3) */

  function thanhTiLe(ratio) {
    if (!isNum(ratio)) {
      /* Chưa có số liệu: thanh sọc rỗng, không vẽ 0%. */
      return '<div class="progress" aria-hidden="true" style="background:repeating-linear-gradient(45deg,' +
        'var(--surface-3),var(--surface-3) 3px,var(--border-soft) 3px,var(--border-soft) 6px)"></div>';
    }
    var w = Math.max(0, Math.min(100, ratio * 100));
    /* --tone đặt inline: .progress-fill lấy var(--tone, var(--brand-2)), nên mỗi
       ô tự đổi màu theo trạng thái mà không cần class .over (không có trong CSS). */
    var tone = ratio > 1 ? 'var(--a)' : 'var(--b)';
    return '<div class="progress slim" aria-hidden="true"><div class="progress-bar">' +
      '<div class="progress-fill" style="width:' + w.toFixed(1) + '%;--tone:' + tone + '"></div>' +
      '</div></div>';
  }

  /* Ô "Chênh lệch" = Thực tế − Chỉ tiêu, TUYỆT ĐỐI và CÙNG ĐƠN VỊ với hai cột
   * kế bên nên đọc thẳng được. Giữ dấu: âm = thiếu (đỏ), dương = vượt (xanh),
   * 0 = đúng chỉ tiêu. Dùng *_hien_thi — chỉ tiêu tỷ lệ đã ×100 cho khớp
   * giá trị đang in ở hai cột bên cạnh. */
  function chenhLech(c) {
    if (!c || !isNum(c.can_thieu)) return emptyCell();
    var d = c.can_thieu;
    if (Math.abs(d) < 0.005) return '<span class="pos">Đúng chỉ tiêu</span>';
    var cls = d < 0 ? 'neg' : 'pos';
    return '<span class="' + cls + '">' + (d > 0 ? '+' : '−') + val(Math.abs(d), 1) + '</span>';
  }

  function bangDiem(row) {
    var ct = row.chi_tieu || [];
    var h = ['<div class="card">',
      '<div class="card-head"><div class="card-title">Cơ cấu điểm</div>',
      fn('Cách tính', '<div class="pop-h">Cách tính điểm nhóm</div>' +
        '<div class="pop-f"><b>Điểm nhóm</b> = (Thực tế ÷ Chỉ tiêu) × Trọng số</div>' +
        '<div class="pop-f">Tổng các nhóm là tổng điểm của môi giới.</div>' +
        '<div class="pop-f">Thực tế và Chỉ tiêu là số gốc; điểm nhóm mới là phần đóng góp sau trọng số.</div>',
        'mg-diem-nhom') + '</div>'];
    if (!ct.length) {
      h.push('<div class="card-body"><p class="muted">Kỳ này không có chỉ tiêu nào được gán điểm.</p></div></div>');
      return h.join('');
    }
    h.push('<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Chỉ tiêu</th><th class="num">Thực tế</th><th class="num">Chỉ tiêu</th>' +
      '<th class="num">Chênh lệch</th><th class="num">Tỷ lệ</th><th class="num">Trọng số</th>' +
      '<th class="num">Điểm nhóm</th></tr></thead><tbody>');
    for (var i = 0; i < ct.length; i++) {
      var c = ct[i];
      h.push('<tr>');
      h.push('<td><div class="strong">' + esc(c.ten) + '</div>' +
        '<div class="card-sub">' + esc(c.ma_chi_tieu) + (c.don_vi ? ' · ' + esc(c.don_vi) : '') + '</div></td>');
      h.push('<td class="num strong">' + val(c.gia_tri_hien_thi, 0) + '</td>');
      h.push('<td class="num">' + val(c.chi_tieu_muc_hien_thi, 0) + '</td>');
      h.push('<td class="num">' + chenhLech(c) + '</td>');
      h.push('<td class="num">' + valPct(c.ty_le_hoan_thanh, 1) + '</td>' + thanhTiLe(c.ty_le_hoan_thanh) + '</td>');
      h.push('<td class="num">' + valPct(c.trong_so, 0) + '</td>');
      h.push('<td class="num strong">' + val(c.diem_nhom, 2) + '</td>');
      h.push('</tr>');
    }
    h.push('</tbody></table></div>');
    h.push('<div class="card-foot">Cột “Chênh lệch” = Thực tế − Chỉ tiêu, tuyệt đối và ' +
      'cùng đơn vị với hai cột trước: âm là thiếu, dương là vượt. ' +
      'Trường chưa có nguồn hiện “—”, không dùng 0.</div>');
    h.push('</div>');
    return h.join('');
  }

  /* ------------------------------------- diễn giải tổng điểm FKP (4) */

  function dienGiaiFKP(row) {
    var ctf = row.chi_tiet_tai_chinh || {};
    if (!isNum(ctf.phi_net_trieu)) return '';   /* chỉ hiện với môi giới cá nhân */

    /* Hệ số quy đổi sang điểm FKP — PTSP chốt 30/09/2026
     * (data/kpi_config.json → tham_so):
     *     phí net × 10 điểm/triệu
     *     lãi vay ×  1 điểm/triệu
     *     phí trái phiếu × 10 điểm/100 triệu  ← ĐƠN VỊ KHÁC
     *   ⇒ diem_fkp = phi×10 + lai×1 + (phi_tp÷100)×10
     * Khoản "tài khoản mở mới" KHÔNG còn là khoản của FKP.
     * KHÔNG có số mặc định: thiếu hệ số thì ô hiện lỗi tên khoá, không tự
     * điền 1 / 0,1 / 10 (sai thang mà không ai thấy). */
    var kpPhi = heSo('he_so_phi_1trieu');
    var kpLai = heSo('he_so_lai_1trieu');
    var kpTp = heSo('he_so_tp_100trieu');

    function heSoCell(hs, ten) {
      if (isNum(hs)) return fmtNum(hs, 1);
      return '<span class="neg">thiếu ' + esc(ten) + '</span>';
    }

    function buoc(label, value, ghiChu, rong) {
      return '<div class="detail-item' + (rong ? ' wide' : '') + '">' +
        '<div class="detail-label">' + esc(label) + '</div>' +
        '<div class="detail-value">' + value + '</div>' +
        (ghiChu ? '<div class="card-sub">' + esc(ghiChu) + '</div>' : '') + '</div>';
    }

    var fkp = null, ct = row.chi_tieu || [];
    for (var i = 0; i < ct.length; i++) if (ct[i].ma_chi_tieu === 'FKP') { fkp = ct[i]; break; }
    /* Tổng điểm FKP = phí (×10) + lãi vay (×1) + trái phiếu (÷100 ×10).
       Chỉ cộng khoản nào có điểm; KHÔNG cộng "tài khoản mở mới" — khoản đó
       đã bị loại khỏi FKP (PTSP 30/09/2026), thành chỉ tiêu KH_MOI 10%. */
    var tong = null;
    if (isNum(ctf.diem_phi) || isNum(ctf.diem_lai) || isNum(ctf.diem_traiphieu)) {
      tong = (isNum(ctf.diem_phi) ? ctf.diem_phi : 0)
        + (isNum(ctf.diem_lai) ? ctf.diem_lai : 0)
        + (isNum(ctf.diem_traiphieu) ? ctf.diem_traiphieu : 0);
    }

    var h = ['<div class="card">',
      '<div class="card-head"><div class="card-title">Diễn giải tổng điểm FKP</div>',
      fn('Quy đổi điểm', '<div class="pop-h">Quy đổi tiền thực thu sang điểm</div>' +
        '<div class="pop-f"><b>Điểm</b> = Số gốc ÷ Đơn vị quy đổi × Hệ số</div>' +
        '<div class="pop-f">Hệ số PTSP chốt 30/09/2026: phí net × ' +
        (isNum(kpPhi) ? fmtNum(kpPhi, 1) : 'thiếu he_so_phi_1trieu') +
        ' điểm/triệu · lãi vay × ' +
        (isNum(kpLai) ? fmtNum(kpLai, 1) : 'thiếu he_so_lai_1trieu') +
        ' điểm/triệu · phí trái phiếu × ' +
        (isNum(kpTp) ? fmtNum(kpTp, 1) : 'thiếu he_so_tp_100trieu') +
        ' điểm/100 triệu.</div>' +
        '<div class="pop-f">ĐƠN VỊ KHÁC NHAU: phí và lãi tính theo TRIỆU, trái phiếu theo 100 TRIỆU.</div>' +
        '<div class="pop-f">Phần ở dưới cộng dồn thành tổng điểm FKP của môi giới trong kỳ. ' +
        'Khoản "tài khoản mở mới" không còn là một phần của FKP — nó là chỉ tiêu ' +
        'phí tài chính riêng (KH mở mới, trọng số 10%).</div>',
        'mg-quy-doi') + '</div>',
      '<div class="card-body"><div class="detail-grid">'];
    /* 3 bước: số tiền → nhân hệ số → ra điểm, rồi tổng lại */
    h.push(buoc('Phí Net thực thu (tr)', val(ctf.phi_net_trieu, 1)));
    h.push('<div class="detail-op">÷ 1 × hệ số ' + heSoCell(kpPhi, 'he_so_phi_1trieu') + '</div>');
    h.push(buoc('Điểm phí', val(ctf.diem_phi, 0),
      isNum(ctf.diem_phi) ? '' : 'chưa có báo cáo phí net tách theo mã môi giới trên FLEX'));
    h.push('<div class="detail-op">+</div>');
    h.push(buoc('Lãi vay (tr)', val(ctf.lai_gdkq_thuc_thu_trieu, 1)));
    h.push('<div class="detail-op">÷ 1 × hệ số ' + heSoCell(kpLai, 'he_so_lai_1trieu') + '</div>');
    h.push(buoc('Điểm lãi', val(ctf.diem_lai, 0),
      isNum(ctf.diem_lai) ? '' : 'chưa có báo cáo tiền lãi vay tách theo mã môi giới trên FLEX'));
    h.push('<div class="detail-op">+</div>');
    h.push(buoc('Phí trái phiếu (tr)', val(ctf.phi_traiphieu_trieu, 1)));
    h.push('<div class="detail-op">÷ 100 × hệ số ' + heSoCell(kpTp, 'he_so_tp_100trieu') + '</div>');
    h.push(buoc('Điểm trái phiếu', val(ctf.diem_traiphieu, 0),
      isNum(ctf.diem_traiphieu) ? '' : 'chưa có báo cáo phí trái phiếu tách theo mã môi giới trên FLEX'));
    h.push(buoc('Tổng điểm FKP', val(tong, 0),
      fkp && isNum(fkp.gia_tri_thuc_te) ? 'khớp chỉ tiêu FKP: ' + fmtNum(fkp.gia_tri_thuc_te, 0) + ' điểm' : '',
      true));
    h.push('</div></div></div>');
    return h.join('');
  }

  /* ------------------------------------------ chỉ số theo dõi (5) */

  function chiSoTheoDoi(row) {
    var ctf = row.chi_tiet_tai_chinh || {};
    if (!isNum(ctf.aum_bq_trieu)) return '';   /* chỉ hiện khi có AUM */
    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">Chỉ số theo dõi</div>' +
      '<span class="badge warn">giai đoạn 1 chỉ theo dõi, không tính điểm</span></div>' +
      '<div class="card-body"><div class="detail-grid">' +
      '<div class="detail-item"><div class="detail-label">AUM bình quân kỳ (tr)</div>' +
      '<div class="detail-value">' + val(ctf.aum_bq_trieu, 0) + '</div></div>' +
      '<div class="detail-item"><div class="detail-label">Số tài khoản quản lý</div>' +
      '<div class="detail-value">' + val(ctf.so_tai_khoan_quan_ly, 0) + '</div></div>' +
      '</div></div></div>';
  }

  /* --------------------------------- biểu đồ + bảng kỳ (6) */

  function kyIdTuNhan(ky_nhan) {
    if (!ky_nhan) return '';
    var ds = K().danh_sach_ky || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].nhan === String(ky_nhan).trim()) return ds[i].ky_id;
    return '';
  }

  function bieuDoVaBang(ls) {
    var h = ['<div class="card">',
      '<div class="card-head"><div class="card-title">Tổng điểm theo kỳ so với điểm chuẩn</div>',
      fn('Cách đọc', '<div class="pop-h">Cách đọc biểu đồ theo kỳ</div>' +
        '<div class="pop-f"><b>Cột</b> = tổng điểm quy đổi của kỳ đó (điểm).</div>' +
        '<div class="pop-f"><b>Đường ngang</b> = điểm chuẩn của kỳ.</div>' +
        '<div class="pop-f">Cột vượt đường là kỳ đạt chuẩn; cột nằm dưới đường là kỳ chưa đạt.</div>',
        'mg-theo-ky') + '</div>'];
    if (!ls.length) {
      h.push('<div class="card-body"><p class="muted">Chưa có dữ liệu lịch sử cho môi giới này.</p></div></div>');
      return h.join('');
    }
    h.push('<div class="card-body">');
    h.push(bieuDoSVG(ls));
    h.push('<div class="legend">' +
      '<span class="legend-item"><i class="legend-swatch" style="background:var(--a)"></i>Trên chuẩn</span>' +
      '<span class="legend-item"><i class="legend-swatch" style="background:var(--b)"></i>Dưới chuẩn</span>' +
      '<span class="legend-item"><i class="legend-swatch" style="background:var(--muted)"></i>Bằng chuẩn</span>' +
      '<span class="legend-item"><i class="legend-swatch" style="background:repeating-linear-gradient(45deg,' +
      'var(--surface-3),var(--surface-3) 3px,var(--border-strong) 3px,var(--border-strong) 6px)"></i>' +
      'Chưa có dữ liệu</span></div>');
    h.push('</div>');

    h.push('<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Kỳ</th><th class="num">Tổng điểm</th><th class="num">Điểm chuẩn</th>' +
      '<th class="num">Tỷ lệ</th><th>Xếp loại</th></tr></thead><tbody>');
    for (var i = 0; i < ls.length; i++) {
      var r = ls[i], d = diemThucTe(r);
      var ch = isNum(r.diem_chuan) ? r.diem_chuan : null;
      var kyid = kyIdTuNhan(r.ky_nhan);
      var tl = r.ty_le_hoan_thanh;
      var tlCls = isNum(tl) ? (tl > 1 ? ' pos' : (tl < 1 ? ' neg' : '')) : '';
      h.push('<tr class="row-link mg-ky"' + (kyid ? ' data-kyid="' + esc(kyid) + '" tabindex="0"' : '') +
        ' title="Bấm để xem kỳ này">');
      h.push('<td>' + esc(r.ky_nhan) + '</td>');
      h.push('<td class="num strong">' + val(d, 0) + '</td>');
      h.push('<td class="num">' + val(ch, 0) + '</td>');
      h.push('<td class="num' + tlCls + '">' + valPct(tl, 1) + '</td>');
      h.push('<td><span class="pill ' + classXL(r.xep_loai) + '">' + esc(r.xep_loai || '—') + '</span></td>');
      h.push('</tr>');
    }
    h.push('</tbody></table></div>');
    h.push('<div class="card-foot">Bấm một dòng kỳ để nhảy sang kỳ đó. ' +
      'Điểm chuẩn FKP phẳng theo vai trò (PTSP chốt 29/09/2026): NV QHKH 25 · CV TVĐT 30 · TP TVĐT 200 · GĐ TVĐT 550. ' +
      'Chỉ tiêu KH active vẫn tra theo chức danh + cấp.</div>');
    h.push('</div>');
    return h.join('');
  }

  /* -------------------------------- chưa có nguồn dữ liệu (7) */

  function chuaCoNguon(row) {
    var ctf = row.chi_tiet_tai_chinh || {};
    var ds = [];
    function them(ten, ly) { ds.push({ ten: ten, ly: ly }); }

    if (!isNum(ctf.phi_net_trieu)) them('Phí Net thực thu', 'chưa có báo cáo phí net tách theo mã môi giới trên FLEX.');
    if (!isNum(ctf.diem_phi)) them('Điểm phí', 'chưa có nguồn quy đổi vì thiếu phí net thực thu.');
    if (!isNum(ctf.lai_gdkq_thuc_thu_trieu)) them('Lãi vay', 'chưa có báo cáo tiền lãi vay tách theo mã môi giới trên FLEX.');
    if (!isNum(ctf.diem_lai)) them('Điểm lãi', 'chưa có nguồn quy đổi vì thiếu tiền lãi vay.');
    if (!isNum(ctf.aum_bq_trieu)) them('AUM bình quân kỳ', 'chưa có nguồn NAV bình quân theo mã môi giới trên FLEX (RE0016).');

    var ct = row.chi_tieu || [];
    for (var i = 0; i < ct.length; i++) {
      if (!isNum(ct[i].gia_tri_thuc_te)) them('Chỉ tiêu ' + ct[i].ten, 'chưa có số liệu thực tế cho chỉ tiêu này trong kỳ.');
      if (!isNum(ct[i].chi_tieu_muc)) them('Chỉ tiêu mục của ' + ct[i].ten, 'KPI.xlsx chưa chốt giá trị chỉ tiêu ở cấp hiện tại.');
    }
    if (!isNum(row.tong_diem)) them('Tổng điểm', 'chưa tổng hợp được vì một nhóm chỉ tiêu còn thiếu số liệu.');
    if (!isNum(row.ty_le_hoan_thanh)) them('Tỷ lệ hoàn thành', 'chưa có dữ liệu để tính tỷ lệ hoàn thành.');

    if (!ds.length) {
      return '<div class="card"><div class="card-head"><div class="card-title">Chưa có nguồn dữ liệu</div></div>' +
        '<div class="card-body"><p class="muted">Trong kỳ này không có trường nào của <b>' + esc(row.ma_mg) +
        '</b> bị thiếu nguồn. Khối này chỉ liệt kê khi dữ liệu thật còn null — ' +
        'màn hình không thay số chưa có bằng 0.</p></div></div>';
    }

    var h = ['<div class="card">',
      '<div class="card-head"><div class="card-title">Chưa có nguồn dữ liệu</div>',
      fn('Quy ước hiển thị', '<div class="pop-h">Quy ước khi thiếu dữ liệu</div>' +
        '<div class="pop-f">Trường đang <b>null</b> hiển thị "—" chứ không thay bằng 0.</div>' +
        '<div class="pop-f">Lý do: chưa có giao dịch phát sinh trong kỳ, hoặc FLEX chưa có mã báo cáo tương ứng.</div>' +
        '<div class="pop-f">Dùng "—" giúp phân biệt "không có giá trị" với "giá trị bằng 0".</div>',
        'mg-null') + '</div>',
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>Trường</th><th class="num">Giá trị</th><th>Lý do chưa có</th>' +
      '</tr></thead><tbody>'];
    for (var j = 0; j < ds.length; j++) {
      h.push('<tr><td class="strong">' + esc(ds[j].ten) + '</td>' +
        '<td class="num"><span class="empty"></span></td>' +
        '<td class="muted">' + esc(ds[j].ly) + '</td></tr>');
    }
    h.push('</tbody></table></div>');
    h.push('<div class="card-foot">Màn hình không thay số chưa có nguồn bằng 0 — ' +
      '0 là một giá trị đo được, “—” là chưa có số liệu.</div>');
    h.push('</div>');
    return h.join('');
  }

  /* --------------------------- kỳ chưa có dữ liệu / chưa chọn môi giới (8) */

  function theKhongCoKy(ma_mg, ky) {
    var mg = mgOf(ma_mg);
    var ten = mg ? (mg.ho_ten || ma_mg) : ma_mg;
    return '<a class="back-link" href="#" data-back="phong">Về danh sách phòng</a>' +
      '<div class="card"><div class="card-body">' +
      '<h2 class="screen-title" style="margin:0 0 6px">Chưa có dữ liệu kỳ này</h2>' +
      '<p class="muted"><b>' + esc(ten) + '</b> (' + esc(ma_mg) + ') không có kết quả trong kỳ <b>' +
      esc(ky.nhan || ky.ky_id || '—') + '</b>. Môi giới này có thể mới vào làm việc, ' +
      'hoặc kỳ đã chọn nằm trước thời điểm bắt đầu.</p>' +
      '<p class="muted">Màn hình hiển thị “—” thay cho số 0, không dựng số liệu cho kỳ không có dữ liệu.</p>' +
      '</div></div>';
  }

  function theChuaChon() {
    return '<a class="back-link" href="#" data-back="phong">Về danh sách phòng</a>' +
      '<div class="card"><div class="card-body">' +
      '<h2 class="screen-title" style="margin:0 0 6px">Chưa chọn môi giới</h2>' +
      '<p class="muted">Bấm vào một dòng môi giới ở danh sách phòng để xem chi tiết.</p>' +
      '</div></div>';
  }

  /* -------------------------------------------------------------- render */

  function render(sec, ctx) {
    /* --- 30/09/2026: o diem chuan NULL (vi du GĐ TVĐT — DOCX khong co hang nay)
       phai hien "—", KHONG hien 0,0. La quy uoc HIEN THI rieng, khong dung
       fmtNum — fmtNum(0) ra "0" va bien nguoi doc thanh diem bang 0. --- */
    function emptyCell() { return '<span class="empty">—</span>'; }

    var el = null;
    if (sec && sec.nodeType) el = sec;
    else if (typeof sec === 'string') el = document.getElementById(sec);
    else if (ctx && ctx.el) el = ctx.el;
    if (!el) el = document.getElementById('screen-moigioi');
    if (!el) return;

    bindEvents(el);

    var ma_mg = maMgDangXem(ctx);
    var ky = kyHienTai(ctx);

    if (!ma_mg) {
      el.innerHTML = theChuaChon();
      if (window.lucide && window.App) App.lucideCreateIcons();
      return;
    }

    var row = rowOf(ma_mg, ctx);
    if (!row) {
      el.innerHTML = theKhongCoKy(ma_mg, ky);
      if (window.lucide && window.App) App.lucideCreateIcons();
      return;
    }

    var ls = lichSu(ma_mg);
    var tenPh = tenPhong(row.ma_phong);
    var cap = capText(row.cap);

    /* Điểm chuẩn của đúng kỳ đang xem, lấy từ lịch sử. */
    var chuan = null;
    for (var q = 0; q < ls.length; q++) {
      if (ls[q].ky_nhan === row.ky_nhan && isNum(ls[q].diem_chuan)) { chuan = ls[q].diem_chuan; break; }
    }
    if (chuan === null && window.App && typeof App.diemChuan === 'function') {
      chuan = App.diemChuan(row);
    }

    var tl = row.ty_le_hoan_thanh;
    var tlCls = isNum(tl) ? (tl > 1 ? ' pos' : (tl < 1 ? ' neg' : '')) : '';

    var h = [];

    /* 1. quay lại — ::before của .back-link tự vẽ mũi tên "←" */
    h.push('<a class="back-link" href="#" data-back="phong">Về danh sách phòng</a>');

    /* 2. header chi tiết + tổng điểm / điểm chuẩn / tỷ lệ */
    h.push('<div class="card"><div class="card-body">');
    h.push('<div class="row-between">');
    h.push('<div><h2 class="screen-title" style="margin:0">' + esc(row.ho_ten) + '</h2>');
    h.push('<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">');
    h.push('<span class="badge">' + esc(row.ma_mg) + '</span>');
    if (row.chuc_danh) h.push('<span class="badge">' + esc(row.chuc_danh) + '</span>');
    if (cap) h.push('<span class="badge">' + esc(cap) + '</span>');
    if (tenPh) h.push('<span class="badge">' + esc(tenPh) + '</span>');
    h.push('</div></div>');
    h.push('<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">');
    h.push('  <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px"><span>Đổi người:</span>' +
           '    <select class="ky-select" id="mh02MgSelect" style="max-width:210px" aria-label="Chọn môi giới để xem">' +
           mgXemDuoc(ma_mg).map(function (m) {
             return '<option value="' + esc(m.ma_mg) + '"' + (m.ma_mg === ma_mg ? ' selected' : '') + '>' +
               esc(m.ma_mg + ' · ' + m.ho_ten) + '</option>';
           }).join('') +
           '    </select></label>');
    h.push('  <span class="pill lg ' + classXL(row.xep_loai) + '">Xếp loại ' + esc(row.xep_loai || '—') + '</span>');
    h.push('</div>');
    h.push('</div>');
    h.push('<div class="kpi-tiles" style="margin-top:12px">');
    /* tong_diem trong dữ liệu là TỶ LỆ 0..1 (0,92 = 92%), điểm chuẩn là ĐIỂM
       TUYỆT ĐỐI. In thẳng tong_diem dưới nhãn "Tổng điểm" ra "0,92" — sai đơn vị
       và lệch với bảng kỳ ngay dưới (2.760). Phải quy đổi: tong_diem × chuẩn. */
    h.push('<div class="tile"><div class="tile-label">Tổng điểm</div>' +
      '<div class="tile-value">' + (isNum(row.tong_diem) && isNum(chuan)
        ? esc(fmtNum(row.tong_diem * chuan, 1)) : emptyCell()) + '</div>' +
      '<div class="tile-sub">điểm chuẩn ' + val(chuan, 0) + '</div></div>');
    h.push('<div class="tile"><div class="tile-label">Tỷ lệ hoàn thành</div>' +
      '<div class="tile-value' + tlCls + '">' + valPct(tl, 1) + '</div>' +
      '<div class="tile-sub">' + (isNum(tl) ? (tl > 1 ? 'vượt chuẩn' : (tl < 1 ? 'dưới chuẩn' : 'đúng chuẩn')) :
        '<span class="empty"></span>') + '</div></div>');
    h.push('<div class="tile"><div class="tile-label">Kỳ đánh giá</div>' +
      '<div class="tile-value" style="font-size:15px">' + esc(row.ky_nhan || (ky.nhan || '—')) + '</div>' +
      '<div class="tile-sub">' + esc((ky.tu_ngay || '') + ' → ' + (ky.den_ngay || '')) + '</div></div>');
    h.push('</div></div></div>');

    /* 3-7 */
    h.push(bangDiem(row));
    h.push(dienGiaiFKP(row));
    h.push(chiSoTheoDoi(row));
    h.push(bieuDoVaBang(ls));
    h.push(chuaCoNguon(row));

    el.innerHTML = h.join('');
    if (window.lucide && window.App) App.lucideCreateIcons();
  }

  /* ------------------------- điều hướng: delegation, listener gắn đúng 1 lần */

  function bindEvents(el) {
    if (!el || window.__mgBound) return;
    window.__mgBound = true;

    function nhayKy(kyid) {
      if (!kyid || !window.App) return;
      if (App.state) App.state.kyId = kyid;
      if (typeof App.go === 'function') {
        App.go('moigioi', { ma_mg: maMgDangXem(null), kyId: kyid });
      }
    }

    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      var back = t.closest('[data-back]');
      if (back) {
        ev.preventDefault();
        if (window.App && typeof App.go === 'function') {
          App.go(back.getAttribute('data-back') || 'phong');
        }
        return;
      }

      var kyRow = t.closest('.mg-ky');
      if (kyRow) nhayKy(kyRow.getAttribute('data-kyid'));
    });

    el.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var kyRow = t.closest('.mg-ky');
      if (!kyRow) return;
      ev.preventDefault();
      nhayKy(kyRow.getAttribute('data-kyid'));
    });

    el.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'mh02MgSelect') {
        var newMa = ev.target.value;
        if (newMa && window.App && typeof App.go === 'function') {
          App.go('moigioi', { ma_mg: newMa });
        }
      }
    });
  }

  window.ScreenMoigioi = { render: render };
  console.log('[screen-moigioi] ready');
})();
