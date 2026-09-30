/* MH01 — Bảng quản lý cấp phòng (trưởng phòng theo dõi môi giới trong phòng mình).
 *
 * Dùng: window.ScreenPhong.render(sec) — sec = #screen-phong.
 * Chỉ ĐỌC window.KPI (data.js) và window.App (app.js); không định nghĩa gì thuộc App.
 * ES5 thuần: không module, không optional chaining, không template literal.
 *
 * LƯU Ý ĐƠN VỊ (giống hệt app.js): tong_diem và ty_le_hoan_thanh trong data.js là TỶ LỆ 0..1
 * đã chia trọng số, KHÔNG phải điểm tuyệt đối. Điểm tuyệt đối = tỷ lệ × điểm chuẩn.
 * App.pct() nhận tỷ lệ 0..1 và tự nhân 100 — đừng truyền số phần trăm vào đó.
 */
(function () {
  'use strict';

  /* ================= trạng thái giao diện (giữ qua các lần render) ================= */
  var UI = { xl: 'ALL', sort: 'tl_desc' };
  var XL_LIST = ['A', 'B', 'C', 'D'];

  /* ================= truy cập App / KPI ================= */

  function A() { return window.App || {}; }
  function K() { return window.KPI || {}; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* ---- định dạng: ưu tiên App.*, có fallback khi App chưa nạp ---- */

  function esc(s) {
    var a = A();
    if (typeof a.esc === 'function') return a.esc(s);
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Số kiểu Việt Nam: 1234.5 -> "1.234,5" */
  function fmtNum(v, digits) {
    if (v === null || v === undefined) return '—';
    var a = A();
    if (typeof a.fmtNum === 'function') return a.fmtNum(v, digits);
    if (!isNum(v)) return '—';
    var d = (digits === undefined || digits === null) ? 0 : digits;
    var neg = v < 0;
    var p = Math.abs(v).toFixed(d).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + p.join(',');
  }

  /* tl là TỶ LỆ 0..1 -> "86,7%" */
  function pctText(tl, digits) {
    if (tl === null || tl === undefined) return '—';
    var a = A();
    if (typeof a.pct === 'function') return a.pct(tl, digits);
    return fmtNum(tl * 100, digits === undefined ? 1 : digits) + '%';
  }

  /* Ô số chưa có nguồn -> '—' với class="empty". TUYỆT ĐỐI không hiện 0. */
  function num(v, digits) {
    if (!isNum(v)) return '<span class="empty">—</span>';
    return '<b class="strong">' + fmtNum(v, digits) + '</b>';
  }
  function pctCell(tl, digits) {
    if (!isNum(tl)) return '<span class="empty">—</span>';
    return '<b class="strong">' + pctText(tl, digits) + '</b>';
  }
  function emptyCell() { return '<span class="empty">—</span>'; }

  /* ---- kỳ / phòng ---- */

  function currentKyId() {
    var a = A();
    if (a.state && a.state.kyId) return a.state.kyId;
    if (typeof a.kyHienTaiId === 'function') return a.kyHienTaiId();
    return (K().ky_hien_tai || {}).ky_id || null;
  }

  function getKy(kyId) {
    var a = A();
    if (typeof a.getKy === 'function') { var k = a.getKy(kyId); if (k) return k; }
    if (typeof a.kyById === 'function') { var k2 = a.kyById(kyId); if (k2) return k2; }
    var list = K().danh_sach_ky || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].ky_id === kyId) return list[i];
    return K().ky_hien_tai || null;
  }

  /* ================= cây quản lý (HH.quan_ly) — thay cho lọc theo ma_phong =====
   * HH.quan_ly là OBJECT, mỗi nút có: ma_qlt (quản lý TRỰC TIẾP, null = gốc),
   * cap_below (con TRỰC TIẾP), he_so_cap, ho_ten, chuc_danh, ma_phong.
   * Trước đây màn này lọc rowsInKy(maPhong) nên chọn ai cũng thấy cả phòng và
   * chuyên viên cũng thấy TP. Nay phạm vi = tập hậu duệ theo cap_below. */

  function ql() { return (window.HH && window.HH.quan_ly) ? window.HH.quan_ly : null; }

  /* Môi giới đang chọn = App.user (getter sống của người đang đăng nhập). */
  function currentMaGoc() {
    var a = A();
    var u = a.user;
    if (u && u.ma_mg) return u.ma_mg;
    if (a.state && a.state.maMg) return a.state.maMg;
    return null;
  }

  /* Tập hậu duệ của một nút: CHÍNH nút gốc + toàn bộ nhánh con, duyệt theo
   * cap_below (quan hệ ma_qlt). Trả null khi mã không có trong cây quản lý —
   * KHÔNG rơi về danh sách phòng. */
  function descendants(maGoc) {
    var q = ql();
    if (!q || !maGoc || !q[maGoc]) return null;
    var out = [], seen = {};
    (function dfs(ma) {
      if (seen[ma]) return;
      seen[ma] = 1;
      out.push(ma);
      var cb = (q[ma] || {}).cap_below || [];
      for (var i = 0; i < cb.length; i++) dfs(cb[i]);
    })(maGoc);
    return out;

  }

  /* ---- dòng kết quả KPI của đúng kỳ (không lọc phòng) ---- */
  function rowsKy(kyId) {
    var a = A();
    var all = null;
    if (kyId && K().ket_qua_theo_ky && K().ket_qua_theo_ky[kyId]) {
      all = K().ket_qua_theo_ky[kyId];
    } else if (typeof a.rows === 'function') {
      all = a.rows(kyId);
    } else if (kyId === (K().ky_hien_tai || {}).ky_id) {
      all = K().ket_qua_ky_hien_tai;
    }
    return Array.isArray(all) ? all : [];
  }

  function rowByMa(ma, kyId) {
    var all = rowsKy(kyId);
    for (var i = 0; i < all.length; i++) if (all[i] && all[i].ma_mg === ma) return all[i];
    return null;
  }

  /* Dựng cây của người đang chọn. ok=false khi mã không nằm trong HH.quan_ly. */
  function buildScope(kyId) {
    var maGoc = currentMaGoc();
    var q = ql();
    if (!q || !maGoc || !q[maGoc]) return { ok: false, maGoc: maGoc, nodes: [], rows: [] };
    var list = descendants(maGoc) || [];
    var nodes = [], rows = [];
    for (var i = 0; i < list.length; i++) {
      var n = q[list[i]] || {};
      var r = rowByMa(list[i], kyId);
      nodes.push({
        ma: list[i],
        ho_ten: n.ho_ten || list[i],
        chuc_danh: n.chuc_danh || (r ? r.chuc_danh : null),
        he_so_cap: isNum(n.he_so_cap) ? n.he_so_cap : 0,
        la: !(n.cap_below && n.cap_below.length),
        dep: 0,
        row: r
      });
      if (r) rows.push(r);
    }
    nodes = sortTree(nodes);
    /* hasNextChild: nhánh còn con thì vẽ "├", hết nhánh thì vẽ "└". */
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].hasNext = (j + 1 < nodes.length) && (nodes[j + 1].dep > nodes[j].dep);
    }
    return { ok: true, maGoc: maGoc, node: q[maGoc] || {}, nodes: nodes, rows: rows };
  }

  /* Sắp xếp TRONG TỪNG NHÁNH: giữ nguyên cấu trúc cây, chỉ đảo thứ tự anh em
   * cùng cha theo tiêu chí đang chọn. Không có dữ liệu KPI thì xuống cuối. */
  function nodeCmp(x, y) {
    var tx = x.row ? tyLe(x.row) : null;
    var ty = y.row ? tyLe(y.row) : null;
    switch (UI.sort) {
      case 'tl_asc':    return cmpNum(tx, ty) || cmpTen(x, y);
      case 'ten_asc':   return cmpTen(x, y) || cmpNum(tx, ty);
      case 'diem_desc': return -cmpNum(x.row ? diemThucTe(x.row) : null, y.row ? diemThucTe(y.row) : null) || cmpNum(tx, ty);
      case 'thieu_asc': return cmpNum(x.row ? diemThieu(x.row) : null, y.row ? diemThieu(y.row) : null) || cmpNum(tx, ty);
      default:          return -cmpNum(tx, ty) || cmpTen(x, y);
    }
  }

  function sortTree(nodes) {
    var q = ql() || {};
    var byMa = {}, kids = {}, roots = [];
    var i, k;
    for (i = 0; i < nodes.length; i++) byMa[nodes[i].ma] = nodes[i];
    for (i = 0; i < nodes.length; i++) {
      var cha = (q[nodes[i].ma] || {}).ma_qlt;
      if (cha && byMa[cha]) { if (!kids[cha]) kids[cha] = []; kids[cha].push(nodes[i]); }
      else roots.push(nodes[i]);
    }
    roots.sort(nodeCmp);
    var out = [];
    (function emit(arr, dep) {
      for (var k2 = 0; k2 < arr.length; k2++) {
        arr[k2].dep = dep;
        out.push(arr[k2]);
        if (kids[arr[k2].ma]) { kids[arr[k2].ma].sort(nodeCmp); emit(kids[arr[k2].ma], dep + 1); }
      }
    })(roots, 0);
    return out;
  }

  function filterTreeXl(nodes, xl) {
    if (!xl || xl === 'ALL') return nodes.slice();
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].row && xepLoai(nodes[i].row) === xl) out.push(nodes[i]);
    }
    return out;
  }

  /* ---- điểm chuẩn / điểm thực tế / điểm còn thiếu ---- */

  function diemChuan(row) {
    var a = A();
    if (typeof a.diemChuan === 'function') { var d = a.diemChuan(row); if (isNum(d)) return d; }
    var bang = (K().tham_so || {}).diem_chuan || {};
    var key = (row.chuc_danh || '') + '|' + (row.cap === null || row.cap === undefined ? '' : row.cap);
    if (bang[key] && isNum(bang[key].FKP)) return bang[key].FKP;
    /* Khoá chuẩn dùng "chuc_danh|cap" nhưng điểm chuẩn FKP PHẲNG theo vai trò
     * (PTSP 29/09/2026): CV TVĐT cấp 1/2/3 đều 30, TP TVĐT cấp 1 và 2 đều 200,
     * GĐ TVĐT 550. Nên khi khoá đúng cấp không có, thử mọi cấp cùng chức danh. */
    var pref = String(row.chuc_danh || '') + '|';
    var keys = Object.keys(bang);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(pref) === 0 && isNum(bang[keys[i]].FKP)) return bang[keys[i]].FKP;
    }
    return null;
  }

  /* Điểm thực tế = tỷ lệ tổng × điểm chuẩn. Không có điểm chuẩn -> null (hiện '—'). */
  function diemThucTe(row) {
    var dc = diemChuan(row);
    if (!isNum(dc) || !isNum(row.tong_diem)) return null;
    return row.tong_diem * dc;
  }

  /* Chênh lệch (điểm) = (Tỷ lệ hoàn thành − 1) × điểm chuẩn.
     Đây là CHÊNH LỆCH TUYỆT ĐỐI giữa tổng điểm thực tế và điểm chuẩn: dương
     = vượt chuẩn (xanh), âm = thiếu (đỏ), 0 = đúng chuẩn.
     KHÔNG cộng ct[i].can_thieu rồi nhân điểm chuẩn: can_thieu đã là chênh lệch
     tuyệt đối của từng nhóm (đơn vị riêng: điểm / tài khoản / khách hàng) nên
     cộng lại rồi × điểm chuẩn sẽ nhân sai — MG001 sẽ ra 36.000 thay vì +24.
     Không có điểm chuẩn hoặc tỷ lệ (chưa có dữ liệu) -> null để hiện '—',
     KHÔNG hiện 0. */
  function diemThieu(row) {
    var dc = diemChuan(row);
    var tl = tyLe(row);
    if (!isNum(dc) || !isNum(tl)) return null;
    return (tl - 1) * dc;
  }

  function tyLe(row) {
    var a = A();
    if (typeof a.tyLe === 'function') { var t = a.tyLe(row); if (isNum(t)) return t; }
    return isNum(row.ty_le_hoan_thanh) ? row.ty_le_hoan_thanh : null;
  }

  function xepLoai(row) {
    var a = A();
    if (typeof a.xepLoaiOf === 'function') { var x = a.xepLoaiOf(row); if (x) return x; }
    return row.xep_loai || null;
  }

  function xlClass(xl) {
    var x = String(xl || '').toUpperCase();
    return (x === 'A' || x === 'B' || x === 'C' || x === 'D') ? ('xl-' + x) : '';
  }

  function icon(name) {
    var a = A();
    var n = name;
    if (a.icons && a.icons[name]) n = a.icons[name];
    return '<i data-lucide="' + esc(n) + '"></i>';
  }

  function lucide() {
    var a = A();
    if (typeof a.lucideCreateIcons === 'function') {
      try { a.lucideCreateIcons(); } catch (e) { /* không có lucide thì bỏ qua */ }
    }
  }

  /* ================= lọc + sắp xếp ================= */

  function cmpNum(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;            /* số chưa có nguồn luôn xuống cuối */
    if (b === null) return -1;
    return a - b;
  }

  function cmpTen(x, y) {
    var a = String(x.ho_ten || ''), b = String(y.ho_ten || '');
    if (a.localeCompare) { var v = a.localeCompare(b, 'vi'); if (v) return v; }
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function countXl(rows, xl) {
    var n = 0;
    for (var i = 0; i < rows.length; i++) if (xepLoai(rows[i]) === xl) n++;
    return n;
  }

  /* ================= khối giao diện ================= */

  function tile(o) {
    var subContent = '';
    if (o.sub && o.tip) {
      subContent = o.sub + ' · ' + fn(o.tip, o.tipHTML, o.tipId);
    } else if (o.sub) {
      subContent = o.sub;
    } else if (o.tip) {
      subContent = fn(o.tip, o.tipHTML, o.tipId);
    }
    return '<div class="tile' + (o.tone ? ' ' + o.tone : '') + '">' +
      '<div class="tile-label">' + esc(o.label) + '</div>' +
      '<div class="tile-value">' + (o.isEmpty ? '—' : o.value) + '</div>' +
      (subContent ? '<div class="tile-sub' + (o.subTone ? ' ' + o.subTone : '') + '">' + subContent + '</div>' : '') +
      '</div>';
  }

  /* Ký hiệu (i): giải thích ngưỡng giấu sau popover, rê hoặc click là hiện. */
  function fn(text, pop, id) {
    var u = window.UIPop;
    if (!u || typeof u.footnote !== 'function') return '';
    try {
      /* footnote(noiDungPopover, {inlineHTML: chuỗi hiện tại trên trang}) */
      return u.footnote(pop || '', { inlineHTML: esc(text || ''), id: id || ('fn-ph-' + (fnSeq++)) });
    } catch (e) { return ''; }
  }
  var fnSeq = 0;

  /* 4 ô số tổng quan PHẠM VI CÂY QUẢN LÝ (không theo phòng).
     Tổng điểm = cộng ĐIỂM TUYỆT ĐỐI của từng người trong phạm vi cây
     (tỷ lệ × điểm chuẩn). Trước đây ô này lấy tong_diem_phong của
     tong_hop_phong — tức số của CẢ PHÒNG, lệch với phạm vi cây, nên đã bỏ. */
  function statBlock(rows) {
    var sTl = 0, dat = 0, loaiD = 0, tongDiem = 0, tongChuan = 0, coDiem = false, coChuan = false;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var t = tyLe(r);
      if (isNum(t)) { sTl += t; if (t >= 1) dat++; }
      if (xepLoai(r) === 'D') loaiD++;
      var tt = diemThucTe(r);
      if (isNum(tt)) { tongDiem += tt; coDiem = true; }
      var dc = diemChuan(r);
      if (isNum(dc)) { tongChuan += dc; coChuan = true; }
    }

    /* Tỷ lệ hoàn thành bình quân = trung bình tỷ lệ của các môi giới trong phạm vi,
       làm tròn 1 chữ số. Môi giới chưa có số liệu không tính vào tử số nhưng vẫn
       nằm trong mẫu số. */
    var avgTl = rows.length ? (sTl / rows.length) : null;

    var h = '<div class="kpi-tiles" id="phongTiles">';
    h += tile({
      label: 'Tổng điểm phạm vi cây quản lý',
      isEmpty: !coDiem,
      value: coDiem ? fmtNum(tongDiem, 2) : '—',
      sub: coDiem
        ? (coChuan ? '/ điểm chuẩn ' + fmtNum(tongChuan, 0)
                   : '<span class="muted">chưa có điểm chuẩn cho các môi giới trong cây</span>')
        : '<span class="warn-text">chưa có số liệu KPI trong phạm vi cây quản lý cho kỳ này</span>'
    });
    h += tile({
      label: 'Tỷ lệ hoàn thành bình quân',
      isEmpty: !isNum(avgTl),
      value: isNum(avgTl) ? pctText(Math.round(avgTl * 1000) / 1000, 1) : '—',
      tone: isNum(avgTl) && avgTl >= 1 ? 'xl-A' : '',
      sub: '',
      tip: 'Cách tính',
      tipId: 'ph-bqh',
      tipHTML: '<div class="pop-h">Tỷ lệ hoàn thành bình quân trong phạm vi cây quản lý</div>' +
        '<div class="pop-f"><b>Bình quân</b> = Tổng tỷ lệ hoàn thành của các môi giới ÷ Số môi giới có số liệu KPI trong phạm vi</div>' +
        '<div class="pop-f">Phạm vi = người đang xem và toàn bộ những người dưới theo cây quản lý, không tính cả phòng.</div>' +
        '<div class="pop-f">Môi giới chưa có số liệu không tính vào tổng nhưng vẫn nằm trong mẫu số.</div>' +
        '<div class="pop-f">Kết quả làm tròn 1 chữ số phần trăm.</div>'
    });
    h += tile({
      label: 'Môi giới đạt chỉ tiêu',
      value: String(dat),
      tone: 'xl-B',
      sub: rows.length ? (dat + '/' + rows.length + ' người · tỷ lệ ≥ 100%') : '',
      tip: rows.length ? 'Ngưỡng' : '',
      tipId: 'ph-dat',
      tipHTML: '<div class="pop-h">Ai được tính là đạt chỉ tiêu</div>' +
        '<div class="pop-f"><b>Đạt chỉ tiêu</b> = tỷ lệ hoàn thành ≥ 100%, tức Thực tế ≥ Chỉ tiêu.</div>' +
        '<div class="pop-f">Tỷ lệ hoàn thành = Tổng điểm thực tế ÷ Điểm chuẩn.</div>' +
        '<div class="pop-f">Đây là điều kiện tối thiểu, không phải xếp loại. Xếp loại A/B/C/D áp dụng ngưỡng khác.</div>'
    });
    h += tile({
      label: 'Môi giới xếp loại D',
      value: String(loaiD),
      tone: loaiD ? 'xl-D' : '',
      subTone: loaiD ? 'warn' : '',
      sub: loaiD ? 'dưới 60% chỉ tiêu' : '0 người',
      tip: loaiD ? 'Ngưỡng' : '',
      tipId: 'ph-loai-d',
      tipHTML: '<div class="pop-h">Xếp loại D — dưới 60% chỉ tiêu</div>' +
        '<div class="pop-f"><b>Xếp loại D</b> = tỷ lệ hoàn thành dưới 60%.</div>' +
        '<div class="pop-f">Đây là mức thấp nhất, áp dụng cơ chế đánh giá điểm kinh doanh của người quản lý.</div>' +
        '<div class="pop-f">Ngưỡng xếp loại lấy từ bảng tham số KPI, không ghi cứng trong giao diện.</div>'
    });
    h += '</div>';
    return h;
  }

  function headBlock(scope, ky) {
    var n = scope.node || {};
    var kyNhan = ky && ky.nhan ? ky.nhan : '—';
    var cd = n.chuc_danh || '—';
    var ten = n.ho_ten || scope.maGoc || '—';
    var ph = n.ma_phong ? phongTen(n.ma_phong) : null;
    return '<div class="screen-head" id="phongHead">' +
      '<div>' +
      '<h2 class="screen-title" id="phongTen">Phòng của tôi</h2>' +
      '<p class="screen-sub">' + esc(ten) + ' · ' + esc(cd) + ' · <b>' + esc(scope.maGoc || '—') + '</b> · Kỳ KPI <b>' + esc(kyNhan) + '</b>'
      + (ky && ky.tu_ngay ? ' <span class="muted">(' + esc(ky.tu_ngay) + ' → ' + esc(ky.den_ngay) + ')</span>' : '')
      + '</p></div>' +
      '<div class="screen-actions">' +
      '<span class="pill">' + icon('users') + ' <b>' + scope.nodes.length + '</b> người trong cây</span>' +
      '<span class="pill">' + icon('hash') + ' ' + esc(scope.maGoc || '—') + '</span>' +
      (ph ? '<span class="pill muted-pill">' + esc(ph) + '</span>' : '') +
      '</div></div>';
  }

  /* Tên phòng hiển thị — chỉ để NHÃN phụ, KHÔNG dùng làm phạm vi. */
  function phongTen(maPhong) {
    if (!maPhong) return null;
    var a = A();
    if (typeof a.tenPhong === 'function') {
      var t = a.tenPhong(maPhong);
      if (t) return t;
    }
    var ds = K().phong || [];
    for (var i = 0; i < ds.length; i++) if (ds[i] && ds[i].ma_phong === maPhong) return ds[i].ten_phong || maPhong;
    return maPhong;
  }

  function opt(v, label) {
    return '<option value="' + v + '"' + (UI.sort === v ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function filterBar(nodes) {
    var rows = [];
    for (var z = 0; z < nodes.length; z++) if (nodes[z].row) rows.push(nodes[z].row);
    var h = '<div class="filter-bar" id="phongFilterBar">';
    h += '<span class="filter-label">Xếp loại</span>';
    h += '<button type="button" class="chip' + (UI.xl === 'ALL' ? ' active' : '') + '" data-xl="ALL">'
      + 'Tất cả <span class="count">' + rows.length + '</span></button>';
    for (var i = 0; i < XL_LIST.length; i++) {
      var x = XL_LIST[i];
      h += '<button type="button" class="chip ' + xlClass(x) + (UI.xl === x ? ' active' : '') + '"'
        + ' data-xl="' + x + '">' + x + ' <span class="count">' + countXl(rows, x) + '</span></button>';
    }
    h += '<span class="spacer"></span>';
    h += '<label class="filter-label" for="phongSort">Sắp xếp trong từng nhánh</label>';
    h += '<select id="phongSort">';
    h += opt('tl_desc', 'Tỷ lệ hoàn thành giảm dần');
    h += opt('tl_asc', 'Tỷ lệ hoàn thành tăng dần');
    h += opt('ten_asc', 'Họ tên A-Z');
    h += opt('diem_desc', 'Tổng điểm giảm dần');
    /* can_thieu giờ là CHÊNH LỆCH có dấu: âm = thiếu, dương = vượt. Nên "thiếu
       nhiều nhất" là giá trị âm nhất → cmpNum tăng dần vẫn đúng (nhỏ trước). */
    h += opt('thieu_asc', 'Chênh lệch thấp nhất trước');
    h += '</select></div>';
    return h;
  }

  /* Thanh tiến độ + vạch mốc 60 / 80 / 110% (đúng class trong style.css) */
  /* Thanh đo theo thang 0 → 110%.
     tl là TỶ LỆ 0..1 (không phải phần trăm). Công thức đúng là
     (tl × 100) / THANG × 100 — tức tl / THANG × 100.
     Trước đây viết (tl*100)/THANG rồi lấy đó làm width%, tức thiếu đúng một
     lần nhân 100: 107,9% chỉ ra 1% (fill 3px trên thanh 230px).

     Thang 110 thay vì 100 có chủ ý: vạch mốc 110% phải NẰM TRONG thanh,
     không tràn ra ngoài ô bảng. */
  function progressBar(tl) {
    var THANG = 110;
    var pctTL = isNum(tl) ? (tl * 100) : null;
    var w = pctTL == null ? 0 : Math.max(0, Math.min(100, pctTL / THANG * 100));
    var dat = pctTL != null && pctTL >= 100;
    return '<div class="progress ' + (dat ? 'xl-B' : 'xl-C') + '">' +
      '<div class="progress-bar">' +
      '<div class="progress-marks">' +
      '<span class="mark" style="left:' + (60 / THANG * 100).toFixed(2) + '%"></span>' +
      '<span class="mark" style="left:' + (80 / THANG * 100).toFixed(2) + '%"></span>' +
      '<span class="mark mark-110" style="left:100%"></span>' +
      '</div>' +
      '<div class="progress-fill" style="width:' + w.toFixed(1) + '%"></div>' +
      '</div></div>';
  }

  /* Bề rộng 2 cột dính trái: cột 1 giờ chứa CÂY (thụt lề theo cấp) + chức danh
     nên cần rộng hơn mặc định 92px. Ghi đè biến CSS ngay trên thẻ <table>
     để không phải đụng style.css. */
  var COL_ID_W = '190px';
  var COL_NAME_W = '190px';
  var INDENT_PX = 18;      /* mỗi cấp thụt lề 18px */

  function thead() {
    return '<thead><tr>' +
      '<th>Cây quản lý</th>' +
      '<th>Họ và tên</th>' +
      '<th>Mã / cấp quản lý</th>' +
      '<th class="num">Tỷ lệ hoàn thành</th>' +
      '<th class="num">Tổng điểm / điểm chuẩn</th>' +
      '<th class="text-center">Xếp loại</th>' +
      '<th class="num">Chênh lệch</th>' +
      '</tr></thead>';
  }

  /* Nhánh cây trước mỗi dòng: thụt lề theo cấp + ký hiệu "còn con / hết nhánh". */
  function treePrefix(node) {
    if (!node.dep) return '';
    return (node.hasNext ? '├─ ' : '└─ ');
  }

  function rowHtml(node) {
    var r = node.row;
    var ma = node.ma;
    var cd = node.chuc_danh || '—';
    var ten = node.ho_ten || ma;
    var h;
    var xl = r ? xepLoai(r) : null;
    var tl = r ? tyLe(r) : null;
    var dc = r ? diemChuan(r) : null;
    var tt = r ? diemThucTe(r) : null;
    var thieu = r ? diemThieu(r) : null;
    var cls = xlClass(xl);
    var pad = node.dep * INDENT_PX;

    /* Nút LÁ: ghi rõ không có người dưới — không rơi về danh sách phòng,
       không để danh sách trống lặng. */
    var laGhi = node.la
      ? '<div class="muted small">không có người dưới</div>'
      : '<div class="muted small">còn ' + soNguoiDưới(ma) + ' người dưới</div>';

    /* Môi giới chưa có số liệu KPI kỳ này (GĐTT / GĐ Khối) — dòng cây vẫn hiện
       đủ chức danh + tên + mã, chỉ các ô số in '—'. */
    h = '<tr class="row-link" data-ma-mg="' + esc(ma) + '"'
      + ' data-ten="' + esc(ten) + '"'
      + ' data-xl="' + esc(xl || '') + '"'
      + ' data-chuc-danh="' + esc(node.chuc_danh || '') + '"'
      + ' data-cap="' + esc(r && r.cap !== null && r.cap !== undefined ? r.cap : '') + '"'
      + ' data-dep="' + node.dep + '">';

    /* Cột 1 — CÂY: thụt lề theo cấp + ký hiệu nhánh + chức danh */
    h += '<td style="padding-left:' + (8 + pad) + 'px">'
      + (treePrefix(node) ? '<span class="muted">' + treePrefix(node) + '</span>' : '')
      + esc(cd) + '</td>';
    /* Cột 2 — họ tên (dính trái) */
    h += '<td><b class="strong">' + esc(ten) + '</b></td>';
    /* Cột 3 — mã + cấp quản lý + ghi chú lá/nhánh */
    h += '<td>' + esc(ma)
      + '<div class="muted small">' + esc(nhanCapQL(node)) + '</div>'
      + laGhi + '</td>';
    /* Cột 4 — tỷ lệ hoàn thành */
    h += '<td class="num">' + progressBar(tl)
      + '<div style="margin-top:3px">' + pctCell(tl, 1) + '</div></td>';
    /* Cột 5 — tổng điểm thực tế / điểm chuẩn */
    h += '<td class="num">' + (isNum(tt) ? num(tt, 1) : emptyCell())
      + '<div class="muted small">' + (isNum(dc) ? 'điểm chuẩn ' + fmtNum(dc, 0) : 'chưa có điểm chuẩn') + '</div></td>';
    /* Cột 6 — xếp loại A/B/C/D */
    h += '<td class="text-center">' + (xl ? '<span class="badge ' + cls + '">' + esc(xl) + '</span>' : emptyCell()) + '</td>';
    /* Cột 7 — chênh lệch: dương = vượt chuẩn (xanh), âm = thiếu (đỏ) */
    h += '<td class="num' + (isNum(thieu) && thieu < -0.05 ? ' neg' : '') + '">'
      + (!isNum(thieu) ? emptyCell()
         : (Math.abs(thieu) <= 0.05 ? '<span class="pos">Đúng chuẩn</span>'
            : '<span class="' + (thieu > 0 ? 'pos' : 'neg') + '">'
              + (thieu > 0 ? '+' : '−') + num(Math.abs(thieu), 1) + '</span>'))
      + '</td>';
    h += '</tr>';
    return h;
  }

  /* "TP TVĐT · hệ số cấp 2" — cấp quản lý + hệ số cấp của nút trong cây quản lý. */
  function nhanCapQL(node) {
    var q = ql() || {};
    var n = q[node.ma] || {};
    var cd = n.cap_quan_ly || '—';
    var hs = isNum(n.he_so_cap) ? n.he_so_cap : null;
    return hs === null ? cd : (cd + ' · hệ số cấp ' + hs);
  }

  /* Số người nằm trong nhánh con trực tiếp + hậu duệ (không tính chính nó). */
  function soNguoiDưới(ma) {
    var list = descendants(ma) || [];
    return Math.max(0, list.length - 1);
  }

  function emptyState(msg) {
    return '<div class="card" id="phongEmpty"><p class="empty">' + esc(msg) + '</p></div>';
  }

  /* ================= biểu đồ tỷ lệ hoàn thành (Chart.js) =================
   * Thanh ngang: mỗi môi giới một thanh, dừng ở 100% là đạt chuẩn.
   * Mọi giá trị nhân 100 trước khi đưa vào dataset nên trục/nhãn/tooltip
   * đều là PHẦN TRĂM, không bao giờ hiện "0,84" hay "1,12" trần. */

  var CHART_ID = 'phong-tyle-chart';

  function charts() { return window.KPICharts || null; }

  function chartCSS() {
    var c = charts();
    if (c && typeof c.empty === 'function') return c.empty;
    return function (m) { return '<div class="chart-empty">' + esc(m || 'Chưa có số liệu.') + '</div>'; };
  }

  function chartBox(height) {
    var c = charts();
    if (c && typeof c.box === 'function') return c.box(CHART_ID, height);
    return '<div class="chart-box" style="height:' + (height || 260) + 'px">' +
      '<canvas id="' + CHART_ID + '" role="img" aria-label="Tỷ lệ hoàn thành của môi giới trong phòng"></canvas></div>';
  }

  /* Khối chứa biểu đồ. Luôn có vùng vẽ để layout không nhảy giữa 2 trạng thái. */
  function chartBlock(rows) {
    var c = charts();
    var ok = !!(c && typeof c.box === 'function' && typeof c.bar === 'function');
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var t = tyLe(rows[i]);
      if (isNum(t)) list.push({ ten: rows[i].ho_ten || rows[i].ma_mg, tl: t });
    }

    var sub = list.length
      ? ('Thanh dài = tỷ lệ hoàn thành; đường đứt đoạn là mốc 100% (đạt chuẩn) · ' +
         fmtNum(list.length, 0) + ' môi giới có số liệu')
      : 'Chưa có số liệu tỷ lệ hoàn thành trong kỳ này';

    var body = ok
      ? chartBox(Math.max(220, Math.min(460, 90 + list.length * 34)))
      : chartCSS()('Thư viện biểu đồ chưa nạp nên chưa vẽ được.');

    return '<div class="card" id="phongChartCard">' +
      '<div class="card-head"><div>' +
      '<div class="card-title">Tỷ lệ hoàn thành của môi giới trong phòng</div>' +
      '<div class="card-sub">' + esc(sub) + '</div></div></div>' +
      '<div class="card-body" id="phongChartBody">' + body + '</div></div>';
  }

  /* Vẽ sau khi innerHTML xong. Mọi lỗi bị nuốt: hỏng biểu đồ không được sập màn. */
  function drawChart(rows) {
    try {
      var c = charts();
      if (!c || typeof c.bar !== 'function' || typeof c.isReady === 'function' && !c.isReady()) return;
      var body = document.getElementById('phongChartBody');
      if (!body) return;

      var list = [];
      for (var i = 0; i < rows.length; i++) {
        var t = tyLe(rows[i]);
        if (isNum(t)) list.push({ ten: rows[i].ho_ten || rows[i].ma_mg, tl: t });
      }
      list.sort(function (a, b) { return b.tl - a.tl; });
      if (!list.length) {
        body.innerHTML = chartCSS()('Kỳ này phòng chưa có tỷ lệ hoàn thành để vẽ biểu đồ.');
        return;
      }

      var labels = [], vals = [], vars = [];
      for (var j = 0; j < list.length; j++) {
        var x = list[j];
        labels.push(x.ten);
        /* 1.1154 (tỷ lệ) -> 111.5 (phần trăm). Giữ 1 chữ số để trục gọn. */
        vals.push(Math.round(x.tl * 1000) / 10);
        vars.push(x.tl >= 1 ? '--a' : (x.tl >= 0.8 ? '--b' : (x.tl >= 0.6 ? '--c' : '--d')));
      }

      var maxV = 0;
      for (var m = 0; m < vals.length; m++) if (vals[m] > maxV) maxV = vals[m];
      /* Trần = bội số 20% nhỏ nhất ≥ max(120%, lớn nhất) để vạch 100% luôn nằm
         trong khung và trục không thừa mảnh trống. */
      var yMax = Math.max(120, Math.ceil(maxV / 20) * 20);

      /* Vạch tham chiếu 100%. Plugin PHẢI được đăng ký TRƯỚC khi Chart khởi tạo —
         plugin nhét vào config sau đó không được Chart.js nhận (cache descriptor đã
         dựng lúc init). Đăng ký 1 lần toàn cục, chỉ vẽ đúng canvas của màn phòng. */
      ensureRefPlugin(c);

      c.bar(CHART_ID, labels, [{ label: 'Tỷ lệ hoàn thành', data: vals, colorVar: vars }], {
        indexAxis: 'y', horizontal: true, legend: false,
        unit: '%', maxTicks: 6, maxBarThickness: 22,
        /* decimals: 1 để tooltip khớp đúng chữ ở cột "Tỷ lệ hoàn thành"
           của bảng bên dưới. Không có khai báo này fmtVal() mặc định 0 chữ số
           nên 107,9% ra "108 %". */
        decimals: 1,
        /* min/max/stepSize PHẢI truyền lúc mount. Gán vào inst.config.options
           rồi update('none') như trước đây khiến Chart.js giữ thanh ở pixel của
           scale cũ (suggestedMax ≈ 150) trong khi vạch 100% đọc từ scale mới
           (max 120) — hai hệ toạ độ lệch nhau, thanh đạt 100% không vượt vạch. */
        min: 0, max: yMax, stepSize: 20, maxTicksLimit: 12,
        emptyMsg: 'Kỳ này phòng chưa có tỷ lệ hoàn thành để vẽ biểu đồ.'
      });

      var inst = (typeof c.get === 'function') ? c.get(CHART_ID) : null;
      if (!inst) return;

      /* Trục là PHẦN TRĂM: "0%", "20%", … — gán callback SAU mount là an toàn vì
         chỉ đổi nhãn, không đổi hệ toạ độ nên không lệch thanh. */
      var cfg = inst.config;
      var sx = cfg && cfg.options && cfg.options.scales && cfg.options.scales.x;
      if (sx) {
        sx.ticks = sx.ticks || {};
        sx.ticks.callback = function (val) {
          return (typeof val === 'number' ? fmtNum(val, 0) : val) + '%';
        };
      }

      /* bar() chỉ tô 1 màu cho cả dataset — màu theo xếp loại (A/B/C/D) phải gán
         mảng màu từng cột SAU khi mount, rồi update (giống cách screen-khoi-chart.js
         tô cột histogram). */
      if (inst.data && inst.data.datasets && inst.data.datasets[0]) {
        var css = c.cssVars();
        inst.data.datasets[0].backgroundColor = vars.map(function (v) {
          return css[v] || v;
        });
      }

      if (typeof inst.update === 'function') inst.update('none');
    } catch (e) {
      if (window.console && console.warn) console.warn('[screen-phong] vẽ biểu đồ tỷ lệ lỗi:', e);
    }
  }

  var refPluginReady = false;

  /* Plugin vẽ vạch 100% — tự bỏ qua mọi biểu đồ không phải của màn phòng. */
  function ensureRefPlugin(c) {
    try {
      if (refPluginReady) return;
      var Ch = window.Chart;
      if (!Ch || typeof Ch.register !== 'function') return;
      refPluginReady = true;
      Ch.register({
        id: 'kpiPhongRef100',
        afterDatasetsDraw: function (ch) {
          try {
            var cv = ch.canvas;
            if (!cv || cv.id !== CHART_ID) return;
            var area = ch.chartArea;
            var sc = ch.scales && ch.scales.x;
            if (!area || !sc || !sc.getPixelForValue) return;
            var x = sc.getPixelForValue(100);
            if (!(x >= area.left && x <= area.right)) return;
            var css = c.cssVars();
            var ctx = ch.ctx;
            ctx.save();
            ctx.strokeStyle = css['--cam'] || css['--chart-series-2'];
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(x, area.top);
            ctx.lineTo(x, area.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = css['--muted'];
            ctx.font = '600 10px ' + fontFamily();
            var benPhai = (x > area.right - 46);
            ctx.textAlign = benPhai ? 'right' : 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('100%', x + (benPhai ? -4 : 4), area.top + 2);
            ctx.restore();
          } catch (e) { /* vạch tham chiếu lỗi không được làm mất biểu đồ */ }
        }
      });
    } catch (e) { /* không đăng ký được thì vẫn giữ biểu đồ, chỉ mất vạch 100% */ }
  }

  function fontFamily() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--font');
      if (v && String(v).trim()) return String(v).trim();
    } catch (e) { /* bỏ qua */ }
    return '-apple-system,"Segoe UI",Tahoma,Roboto,Helvetica Neue,Arial,sans-serif';
  }

  /* ================= render ================= */

  function render(sec) {
    if (!sec) return;
    var kyId = currentKyId();
    var ky = getKy(kyId);
    var scope = buildScope(kyId);
    var h = '';

    /* Mã đang chọn không có trong HH.quan_ly: báo rõ, KHÔNG crash và KHÔNG
       rơi về danh sách phòng. */
    if (!scope.ok) {
      h += '<div class="screen-head" id="phongHead"><div>'
        + '<h2 class="screen-title" id="phongTen">Phòng của tôi</h2>'
        + '<p class="screen-sub">Mã <b>' + esc(scope.maGoc || '—') + '</b> · Kỳ KPI <b>'
        + esc(ky && ky.nhan ? ky.nhan : '—') + '</b></p></div></div>';
      h += emptyState('Môi giới này chưa có dữ liệu cây quản lý'
        + (scope.maGoc ? ' (mã ' + scope.maGoc + ')' : '')
        + '. Cây quản lý lấy từ HH.quan_ly — cần bổ sung nút tương ứng trước khi xem được phạm vi quản lý.');
      sec.innerHTML = h;
      lucide();
      bind(sec);
      return;
    }

    var allRows = scope.rows;
    var shown = filterTreeXl(scope.nodes, UI.xl);

    h += headBlock(scope, ky);
    h += statBlock(allRows);
    h += chartBlock(allRows);
    h += filterBar(scope.nodes);

    h += '<div class="table-wrap" id="phongTableWrap">';
    if (shown.length) {
      h += '<table class="table" id="phongTable" style="--col-id-w:' + COL_ID_W
        + ';--col-name-w:' + COL_NAME_W + '">' + thead() +
        '<tbody id="phongBody">' + shown.map(rowHtml).join('') + '</tbody></table>';
    } else {
      /* Rỗng thì nói rõ vì sao: lọc xếp loại, hay cây có nút nhưng chưa có số liệu. */
      h += emptyState(allRows.length
        ? 'Trong cây quản lý này không có ai thuộc xếp loại ' + UI.xl + ' trong kỳ này. Bấm "Tất cả" để xem lại toàn bộ.'
        : 'Cây quản lý có ' + scope.nodes.length + ' nút nhưng kỳ '
          + (ky && ky.nhan ? ky.nhan : 'đang chọn') + ' chưa có số liệu KPI cho các nút đó.');
    }
    h += '</div>';

    /* Ghi chú phạm vi: nói thẳng màn này lấy cây, không lấy phòng. */
    h += '<p class="screen-sub" id="phongGhiChu">' + icon('info') + ' '
      + 'Phạm vi: <b>' + esc(scope.maGoc) + '</b> và '
      + fmtNum(Math.max(0, scope.nodes.length - 1), 0) + ' người dưới theo cây quản lý'
      + (scope.node && scope.node.cap_quan_ly
          ? ' (cấp ' + esc(scope.node.cap_quan_ly) + ')' : '')
      + ' — KHÔNG lấy theo phòng, nên người cùng phòng nhưng ngoài nhánh quản lý sẽ không hiện. '
      + 'Cây quản lý nằm trong HH.quan_ly (quan hệ ma_qlt / cap_below).'
      + '</p>';

    sec.innerHTML = h;
    lucide();
    bind(sec);
    /* Vẽ SAU innerHTML (canvas phải nằm trong DOM mới mount được). KHÔNG gọi
       charts.destroyAll() ở đây — nó dọn sạch mọi biểu đồ của app, kể cả biểu đồ
       thuộc màn khác. charts.bar() tự thay instance cũ đúng canvas id này. */
    drawChart(allRows);
  }

  /* Đổi thứ tự dòng trong DOM bằng appendChild — không vẽ lại bảng.
     Cây phải giữ cấu trúc nên chỉ sắp anh em cùng nhánh, không sắp phẳng. */
  function resortDom(sec) {
    var tb = sec.querySelector('#phongBody');
    if (!tb) return;
    var scope = buildScope(currentKyId());
    var byId = {};
    for (var i = 0; i < scope.nodes.length; i++) byId[scope.nodes[i].ma] = scope.nodes[i];

    /* Giữ đúng các dòng đang hiện (đã lọc xếp loại), rồi sắp lại cây. */
    var hien = [];
    var trs = tb.querySelectorAll('tr');
    for (var j = 0; j < trs.length; j++) {
      var n = byId[trs[j].getAttribute('data-ma-mg')];
      if (n) hien.push(n);
    }
    var sorted = sortTree(hien);
    for (var k = 0; k < sorted.length; k++) {
      var node = tb.querySelector('tr[data-ma-mg="' + sorted[k].ma + '"]');
      if (node) tb.appendChild(node);   /* appendChild = di chuyển node cũ, không tạo lại */
    }
  }

  /* ================= event delegation (chỉ bind 1 lần) ================= */

  function bind(sec) {
    if (window.__phongBound) return;
    window.__phongBound = true;

    sec.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var chip = t.closest('.chip');
      if (chip && sec.contains(chip)) {
        var xl = chip.getAttribute('data-xl') || 'ALL';
        if (xl !== UI.xl) { UI.xl = xl; render(sec); }
        return;
      }

      var tr = t.closest('tr.row-link');
      if (tr && sec.contains(tr)) {
        var ma = tr.getAttribute('data-ma-mg');
        var a = A();
        if (ma && typeof a.go === 'function') a.go('moigioi', { ma_mg: ma });
      }
    });

    sec.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'phongSort') {
        var v = e.target.value || 'tl_desc';
        if (v !== UI.sort) { UI.sort = v; resortDom(sec); }
      }
    });
  }

  window.ScreenPhong = { render: render };
})();

console.log('[screen-phong] ready');
