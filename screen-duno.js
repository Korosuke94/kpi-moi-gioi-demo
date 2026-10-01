/* =============================================================================
 * screen-duno.js — MH06 "Dư nợ đang quản lý"
 * -----------------------------------------------------------------------------
 * Dùng: window.ScreenDuno.render(el, ctx)  — app.js gọi fn(el, ctx)
 *       window.renderDuno(el, ctx)         — bí danh cho resolveScreen()
 *
 * Dữ liệu: window.DUNO (web/duno-data.js, sinh bởi data/gen_duno_data.py).
 *   theo_ky[ky].theo_ma      — dư nợ từng KH  (KHỐI CHÍNH, theo phạm vi)
 *   theo_ky[ky].theo_ma_mg   — tổng theo môi giới (CHỈ tầng quản lý mới thấy)
 *   theo_ky[ky].theo_phong   — tổng theo phòng  (CHỉ tầng quản lý, dòng phụ)
 *   theo_ngay[ky][ma_mg]    — chuỗi NGÀY trong kỳ (bám ma_mg, không bám ma_kh)
 *
 * PHÂN QUYỀN — 3 quy tắc (SPEC §6k mục 1). Nguồn lọc DUY NHẤT là cây quản lý
 * trong app.js; KHÔNG tự dựng lại cap_below ở đây (sai một chỗ là lộ tên):
 *   Q1 NV  : chỉ dư nợ CHI TIẾT của chính mình (phamViCay = {chính mình}).
 *   Q2 TP/GĐ: dư nợ CHI TIẾT của các KH mình TRỰC TIẾP quản lý (tập hậu duệ).
 *   Q3 TP/GĐ: thêm dư nợ TỔNG của các nhân viên trong phòng (theo_ma_mg).
 * Dữ liệu NGOÀI phạm vi không được đưa vào DOM — kể cả trong data-*, title,
 * aria-label. Vì vậy lọc PHẢI chạy TRƯỚC khi dựng HTML, không lọc bằng CSS.
 *
 * BÀI HỌC ĐÃ VẤP (không được vi phạm lại):
 *  1. Nút (i) PHẢI sinh qua UIPop.tip/footnote. UIPop.closeAll() trước đây
 *     xoá sạch registry mỗi lần đổi màn (11 -> 0) làm 14/17 nút chết; đã
 *     sửa ở ui-popover.js (chỉ xoá bản ghi stale VÀ không có body). Không
 *     tự dựng popover riêng cho màn này, không gọi closeAll() ở đây.
 *  2. Không có <select> chọn người riêng: dùng CHUNG App.state.maMg + #userSelect
 *     để 6 màn hiển thị cùng một người. Selector màn này chỉ liệt kê mã TRONG
 *     phạm vi cây (App.mgTrongCay), không liệt kê danh sách đầy rồi lọc ở client.
 *  3. Trên trang có 3 thẻ <select>; test Playwright phải trỏ #userSelect.
 *  4. Kỳ dùng CHUNG App.state.kyId (App.setKy) — không tự dựng bộ chọn kỳ.
 *
 * window.DUNO CÓ THỂ CHƯA TỒN TẠI (generator chưa chạy xong): khi đó hiện
 * thông báo tại chỗ, KHÔNG ném lỗi, KHÔNG dựng số 0 giả.
 * ========================================================================== */
(function (global) {
  'use strict';

  var DASH = '—';
  var ROOT_ID = 'screen-duno';
  var STYLE_ID = 'kpi-style-duno';
  var TOP_N = 10;              /* BĐ2 chỉ vẽ top-N khách, phần còn lại gom 1 dòng */
  var MAX_ROW = 50;            /* vượt 50 dòng thì phân trang */
  var TRANG = 40;              /* số dòng mỗi trang (>= 10 để dòng cao vẫn nhìn thấy) */

  /* Sắp xếp + tìm kiếm + lọc + thời điểm xem: giữ khi đổi kỳ/người, giống
   * screen-hoahong.js. `bang` = bảng chi tiết KH, `nhan_vien` = vùng E. */
  var st = {
    kh: { sort: 'du_no_tinh_lai', dir: -1, q: '', loai: '', page: 0 },
    nhan_vien: { sort: 'du_no_tinh_lai', dir: -1 },
    tdXem: 1,              /* chỉ số mốc xem trong danh sách mốc của kỳ (mặc định CUỐI kỳ) */
    loaiDung: ''           /* vùng C xem theo KH hay theo môi giới; '' = theo tập đang xem */
  };

  var lastEl = null, lastCtx = null;

  /* ============================================================== helpers */
  function A() { return global.App || null; }
  function CH() { return global.KPICharts || null; }
  function D() { return global.DUNO || null; }
  function doc() { return global.document || null; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function esc(s) {
    if (s === null || s === undefined) return '';
    var a = A();
    if (a && typeof a.esc === 'function') { try { return a.esc(s); } catch (e) { /* tự */ } }
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Mọi số tiền in bằng App.fmtNum — KHÔNG tự viết hàm format khác.
   * BẪY ĐÃ GẶP: regex bỏ dấu chấm rồi replace dấu phẩy làm 1288.6 -> 12886
   * (lệch ×10). fmtNum đã lo phần đó. */
  function num(v, d) {
    if (!isNum(v)) return DASH;
    var a = A();
    if (a && typeof a.fmtNum === 'function') { try { return a.fmtNum(v, d); } catch (e) { /* tự */ } }
    return String(v);
  }
  function n0(v) { return num(v, 0); }
  function n1(v) { return num(v, 1); }
  function n2(v) { return num(v, 2); }

  /* Tỷ lệ 0..1 -> "65%" (bỏ chữ số 0 thừa khi tròn). pct() của app.js là
   * chuẩn của cả 5 màn nên dùng chung. */
  function fpct(v, d) {
    if (!isNum(v)) return DASH;
    var a = A();
    if (a && typeof a.pct === 'function') { try { return a.pct(v, d == null ? 1 : d); } catch (e) { /* tự */ } }
    return n1(v * 100) + '%';
  }
  /* Tỷ lệ CÓ DẤU: biến động tăng/giảm cần thấy rõ chiều. */
  function fpctSigned(v) { return isNum(v) ? (v > 0 ? '+' : '') + fpct(v) : DASH; }

  function warn(tag, e) {
    if (global.console && global.console.warn) global.console.warn('[duno/' + tag + ']', e);
  }

  function sumField(list, f) {
    var s = 0;
    for (var i = 0; i < list.length; i++) if (isNum(list[i][f])) s += list[i][f];
    return s;
  }

  /* ------------------------------------------------------------ dữ liệu */
  /* window.DUNO dùng đúng schema: theo_ky[ky] là OBJECT 3 khoá con, các
   * tầng bên trong là OBJECT khoá ma_kh / ma_mg / ma_phong. Bài học: đã có test
   * kiem isinstance trước khi lặp vì mock_data.ket_qua_theo_ky[ky] là LIST —
   * gọi Object.keys trên list ra chỉ số 0,1,2 nên vẽ ra dữ liệu rác. */
  function kyDuno(kyId) {
    var d = D();
    if (!d || !d.theo_ky) return null;
    var t = d.theo_ky[kyId];
    if (!t || typeof t !== 'object') return null;
    return t;
  }
  function kyDanhSach(kyId) {
    var d = D();
    var l = (d && d.danh_sach_ky) || [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].ky_id === kyId) return l[i];
    return null;
  }
  function maMgXem(ctx) {
    if (ctx && ctx.params && ctx.params.ma_mg) return ctx.params.ma_mg;
    if (ctx && ctx.ma_mg) return ctx.ma_mg;
    var a = A();
    if (a && a.state) return a.state.maMg || null;
    return null;
  }
  function kyId(ctx) {
    if (ctx && ctx.kyId) return ctx.kyId;
    var a = A();
    if (a && typeof a.kyHienTaiId === 'function') { try { return a.kyHienTaiId(); } catch (e) { /* tự */ } }
    return null;
  }
  function kyNhan(kyId) {
    var a = A();
    if (a && typeof a.kyLabel === 'function') { try { var t = a.kyLabel(kyId); if (t) return t; } catch (e) { /* tự */ } }
    var k = kyDanhSach(kyId);
    return (k && k.nhan) || kyId || DASH;
  }

  /* Tra người theo ma_mg. THỨ TỰ: HH.quan_ly -> KPI.mo_gioi.
   * Lý do: GD01/GDK01 chỉ có trong HH.quan_ly, không có trong KPI.mo_gioi. */
  function mgById(maMg) {
    var h = global.HH;
    if (h && h.quan_ly && h.quan_ly[maMg]) {
      var q = h.quan_ly[maMg];
      return {
        ma_mg: maMg, ho_ten: q.ho_ten, chuc_danh: q.chuc_danh,
        ma_phong: q.ma_phong, cap_quan_ly: q.cap_quan_ly, he_so_cap: q.he_so_cap
      };
    }
    var a = A();
    if (a && typeof a.mgById === 'function') { try { return a.mgById(maMg); } catch (e) { /* tự */ } }
    return null;
  }
  /* Tên phòng rút gọn theo §6h: P.HN01 -> HN1, P.HN10 -> HN10. */
  function phongNgan(maPhong) {
    var a = A();
    if (a && typeof a.phongNgan === 'function') { try { return a.phongNgan(maPhong); } catch (e) { /* tự */ } }
    return maPhong || DASH;
  }

  /* --------------------------------------------------------- phạm vi cây
   * Dùng hàm SẴN CÓ của app.js. KHÔNG tự dựng lại từ cap_below.
   *   phamViCay(ma)  -> {ma:1, ...hậu duệ} hoặc null
   *   mgTrongCay(ma) -> mảng môi giới trong tập đó (theo thứ tự mgAll) */
  function phamVi(ma) {
    var a = A();
    if (a && typeof a.phamViCay === 'function') { try { return a.phamViCay(ma); } catch (e) { return null; } }
    return ma ? ({}) : null;
  }
  function mgTrongCay(ma) {
    var a = A();
    if (a && typeof a.mgTrongCay === 'function') { try { return a.mgTrongCay(ma) || []; } catch (e) { return []; } }
    return ma ? [{ ma_mg: ma }] : [];
  }
  /* Cấp quản lý: >= 2 (TP) mới được thấy vùng E — tổng hợp nhân viên.
   * Nguồn: HH.quan_ly[ma].he_so_cap. Không đoán theo tên chức danh vì chức
   * danh tiếng Việt rất dễ khác nhau ("TP TVĐT" / "GĐ TVĐT" / "GĐTT TVĐT"). */
  function capQuanLy(ma) {
    var m = mgById(ma);
    if (m && isNum(m.he_so_cap)) return m.he_so_cap;
    return 0;
  }

  /* ================================================================ CSS
   * Chỉ phần RIÊNG của màn (bảng dư nợ, ô tổng hợp 4 cột...). Phần thẻ/tile
   * dùng class có sẵn của style.css: kpi-tiles, tile, tile-label, tile-value,
   * tile-sub, card, card-head, card-title, card-sub, card-body, table-wrap,
   * table, num. KHÔNG khai lại màu/size của hệ thống. */
  var CSS = [
    '#screen-duno .dn-sec{margin-top:var(--sp-4,16px);}',
    /* Vùng A: 3 ô tổng hợp. Mặc định .kpi-tiles là 4 cột nên 3 ô
     * khai lại 3 cột cho đều. */
    '#screen-duno .dn-tt{grid-template-columns:repeat(3,minmax(0,1fr));',
    '  gap:var(--sp-3,12px);}',
    '@media (max-width:1100px){#screen-duno .dn-tt{grid-template-columns:repeat(2,minmax(0,1fr));}}',
    '@media (max-width:640px){#screen-duno .dn-tt{grid-template-columns:1fr;}}',
    /* .tile-label mặc định nowrap+ellipsis: nhãn dài bị cắt thành "Dư nợ tính lã…".
     * Ở đây nhãn ngắn nhưng vẫn cho xuống dòng để không phụ thuộc độ rộng cột. */
    '#screen-duno .dn-tt .tile-label{white-space:normal;overflow:visible;',
    '  text-overflow:clip;line-height:1.3;letter-spacing:.2px;}',
    '#screen-duno .dn-tt .tile-value{font-variant-numeric:tabular-nums;}',
    /* Lọc loại KH + tìm kiếm */
    '#screen-duno .dn-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
    '#screen-duno .dn-filter label{font-size:var(--fs-small,12px);color:var(--muted);}',
    '#screen-duno .dn-filter select,#screen-duno .dn-filter input{height:28px;padding:0 8px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface);color:var(--text);font-family:inherit;',
    '  font-size:var(--fs-small,12px);}',
    '#screen-duno .dn-filter input{min-width:170px;}',
    /* bảng: bám .table + .tbl-chuan của hệ thống (4 rule sort đã chuyển sang
     * style.css .tbl-chuan); giữ alias .dn-tbl để test cũ không vỡ */
    '#screen-duno .dn-tbl th.sortable{cursor:pointer;user-select:none;}',
    '#screen-duno .dn-tbl th.sortable:hover{color:var(--text);}',
    '#screen-duno .dn-tbl th[data-dir="1"]::after{content:" \\25B2";color:var(--cam);font-size:10px;}',
    '#screen-duno .dn-tbl th[data-dir="-1"]::after{content:" \\25BC";color:var(--cam);font-size:10px;}',
    /* ô biến động có dấu — xanh tăng / đỏ giảm */
    '#screen-duno .dn-up{color:var(--a);font-weight:600;}',
    '#screen-duno .dn-down{color:var(--d);font-weight:600;}',
    /* ô số chưa có nguồn: gạch đầu dòng, không phải 0 */
    '#screen-duno .dn-dash{color:var(--muted);}',
    /* cảnh báo dữ liệu giả — nói ra ở 2 nơi: badge đầu màn + khối quy tắc */
    // KHONG dung flex:none + white-space:nowrap o day: badge chu "DỮ LIỆU GIẢ
    // dai ~150px, o be rong <=360 no tran ra ngoai khung ma khong co vung cuon
    // nao chua (chi table-wrap moi co overflow-x). De no tu xuong hang,
    // cho phep xuong dong, va gioi han do rong noi.
    '#screen-duno .dn-badge{flex:0 1 auto;min-width:0;max-width:100%;align-self:flex-start;display:inline-flex;',
    '  align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
    '  font-size:var(--fs-small,12px);font-weight:600;letter-spacing:.02em;',
    '  white-space:normal;overflow-wrap:anywhere;border:1px solid var(--c);background:var(--c-soft);color:var(--c);}',
    '#screen-duno .dn-rules{margin:var(--sp-3,12px) 0 0;padding:var(--sp-3,12px) var(--sp-3,12px) var(--sp-3,12px) 28px;',
    '  border:1px solid var(--border);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface-2);font-size:var(--fs-small,12px);color:var(--muted);line-height:1.6;}',
    '#screen-duno .dn-rules b{color:var(--text);}',
    '#screen-duno .dn-note{font-size:var(--fs-small,12px);color:var(--muted);',
    '  margin-top:var(--sp-2,8px);line-height:1.55;}',
    '#screen-duno .dn-alert{border:1px solid var(--c);background:var(--c-soft);color:var(--text);',
    '  border-radius:var(--radius-sm,6px);padding:var(--sp-3,12px);',
    '  font-size:var(--fs-small,12px);line-height:1.6;}',
    '#screen-duno .dn-alert.soft{border-color:var(--border);background:var(--surface-2);color:var(--muted);}',
    /* lưới 2 biểu đồ: cùng chiều cao để nhìn cân */
    '#screen-duno .dn-grid{display:grid;gap:var(--sp-4,16px);',
    '  grid-template-columns:repeat(2,minmax(0,1fr));}',
    '@media (max-width:1000px){#screen-duno .dn-grid{grid-template-columns:minmax(0,1fr);}}',
    '#screen-duno .dn-cell{min-width:0;}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ================================================== nút (i) — UIPop
   * Dùng ĐÚNG cơ chế của 5 màn hiện có. Tuyệt đối không tự dựng popover
   * riêng: registry của UIPop dùng chung, tự dựng sẽ không đóng được. */
  function tip(html, id) {
    var up = global.UIPop;
    if (up && typeof up.tip === 'function') {
      try {
        return up.tip(html, { id: id, label: 'Xem cách tính', side: 'right', width: 380 }) || '';
      } catch (e) { /* lùi xuống dòng chú thích */ }
    }
    return '';
  }
  /* Bản "nhãn + (i)" cho tiêu đề cột — cùng kiểu footnote() của screen-hoahong. */
  function fn(html, text, id) {
    var up = global.UIPop;
    if (up && typeof up.footnote === 'function') {
      try {
        return up.footnote(html, { id: id, inlineHTML: esc(text), label: 'Xem cách tính', side: 'right', width: 380 }) || '';
      } catch (e) { /* lùi */ }
    }
    return esc(text);
  }

  /* ====================================================== nội dung popover */
  var NOI_DUNG_TIP = {
    'duno-cong-thuc': '<b>Lãi tạm tính (triệu đồng)</b> = Dư nợ tạm tính × Lãi suất tạm tính × '
      + 'Số ngày tính lãi ÷ 365.<br><br>'
      + '<b>Dư nợ tạm tính</b> và <b>Dư nợ tính lãi</b> là HAI số khác nhau: dư nợ tính lãi '
      + 'là dư nợ chịu lãi thực tế của khách, còn dư nợ tạm tính là căn cứ dùng để '
      + 'tính lãi tạm tính. Dùng chung một con số cho hai số làm lãi tạm tính '
      + 'mất hết ý nghĩa.<br><br>'
      + '<b>Khác hoa hồng dư nợ:</b> hoa hồng dư nợ tính trên PHẦN CHÊNH LÃI '
      + '(lãi suất thực tế − lãi suất tham chiếu nguồn vốn) rồi nhân tỷ lệ chia '
      + 'sẻ và chặn về 0 khi chênh lãi âm. Ở đây tính trên TOÀN BỘ dư nợ tạm tính, '
      + 'không trừ lãi suất tham chiếu, không nhân tỷ lệ chia sẻ. '
      + 'Màn này KHÔNG hiện riêng số Dư nợ tạm tính — số đó chỉ là căn cứ '
      + 'nội bộ để tính Lãi tạm tính.',
    'duno-don-vi': '<b>Đơn vị: TRIỆU ĐỒNG</b> cho mọi khoản tiền trên màn này — '
      + 'khớp với <i>aum_trieu</i> và <i>lai_vay_trieu</i> của dữ liệu hiện có.<br><br>'
      + '<b>Lãi suất tính theo %/năm</b>, lưu dạng thập phân 0..1 (0,1275 = 12,75%). '
      + 'Giao diện in ra phần trăm, dữ liệu vẫn là số thập phân.<br><br>'
      + '<b>Số chưa có nguồn hiện dấu gạch</b>, không hiện 0 — tránh đọc nhầm số '
      + '0 là số liệu thật.',
    'duno-thoi-diem-xem': '<b>Thời điểm xem</b> = ngày cắt dữ liệu của biểu đồ cơ cấu '
      + 'và bảng xếp hạng. Mặc định là <b>ngày cuối kỳ</b> (ngày <i>den_ngay</i>).<br><br>'
      + 'Chuỗi ngày được sinh theo TỪNG NGÀY từ đầu kỳ đến cuối kỳ, không gom theo '
      + 'tháng và không lấy mẫu rời rạc. Đổi thời điểm xem chỉ đổi lát cắt của '
      + 'biểu đồ cơ cấu; biểu đồ biến động vẫn giữ trọn cả kỳ.',
    'duno-quyen': '<b>Phạm vi xem dư nợ</b> theo cây quản lý:<br>'
      + '· <b>Nhân viên</b> — chỉ dư nợ CHI TIẾT của các khách hàng mình đang quản lý.<br>'
      + '· <b>Trưởng phòng / Giám đốc</b> — dư nợ CHI TIẾT của các khách hàng mình '
      + 'trực tiếp quản lý, <b>cộng</b> dư nợ TỔNG của các nhân viên trong phòng '
      + 'đang quản lý.<br><br>'
      + 'Tập mã lấy từ hàm phạm vi cây sẵn có của app.js, lọc trước khi dựng '
      + 'trang — tên khách hàng ngoài phạm vi không có trong DOM, kể cả trong '
      + 'thuộc tính data-*.'
  };

  /* ======================================================== chuỗi NGÀY
   * theo_ngay bám ma_mg (không bám ma_kh — 6 kỳ × 368 khách là hàng chục nghìn
   * dòng). Vì vậy BĐ1 gộp các mã trong phạm vi rồi cộng từng ngày. */
  function gopNgy(ky, maList) {
    var d = D();
    var src = (d && d.theo_ngay && d.theo_ngay[ky]) || null;
    if (!src) return null;
    var ngay = null, tinhLai = null, tamTinh = null, lai = null;
    var co = false;
    for (var i = 0; i < maList.length; i++) {
      var g = src[maList[i]];
      /* isinstance trước khi lấy .ngay: dữ liệu rác có thể cho số rời rạc,
       * dùng thuộc tính của số sẽ ra undefined và cộng NaN vào cả biểu đồ. */
      if (!g || typeof g !== 'object' || !Array.isArray(g.ngay)) continue;
      if (!ngay) {
        ngay = g.ngay.slice();
        tinhLai = (g.du_no_tinh_lai || []).slice();
        tamTinh = (g.du_no_tam_tinh || []).slice();
        lai = (g.lai_tam_tinh || []).slice();
        co = true;
      } else {
        /* Cộng từng ngày theo CHỈ SỐ, không cộng mảng: hai mã có thể lệch độ
         * dài (một mã mở dư nợ giữa kỳ) — cộng mảng sẽ ra NaN. */
        for (var j = 0; j < ngay.length; j++) {
          if (isNum(g.du_no_tinh_lai && g.du_no_tinh_lai[j])) tinhLai[j] += g.du_no_tinh_lai[j];
          if (isNum(g.du_no_tam_tinh && g.du_no_tam_tinh[j])) tamTinh[j] += g.du_no_tam_tinh[j];
          if (isNum(g.lai_tam_tinh && g.lai_tam_tinh[j])) lai[j] += g.lai_tam_tinh[j];
        }
      }
    }
    if (!co) return null;
    return { ngay: ngay, du_no_tinh_lai: tinhLai, du_no_tam_tinh: tamTinh, lai_tam_tinh: lai };
  }

  /* Nhãn ngày ngắn gọn cho trục X: "25/04" — giữ đúng NGUYÊN TẮC: trục X là
   * NGÀY, mỗi điểm là một ngày trong kỳ, không gom theo tháng. */
  function nhanNgay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return m[3] + '/' + m[2];
  }

  /* ================================================ danh sách mốc thời gian
   * BĐ2 chỉ vẽ MỘT lát cắt. Người đọc phải biết mốc đó là ngày nào và có
   * thể đổi — không có nút đổi thì ảnh chụp một ngày bị hiểu nhầm thành cơ
   * cấu cả kỳ. Mốc gồm: đầu kỳ, cuối kỳ, và các mốc giữa chia đều. */
  function mocXem(ngay) {
    var out = [];
    if (!ngay || !ngay.length) return out;
    var n = ngay.length;
    out.push(ngan(ngay[0], 'đầu kỳ'));
    out.push(ngan(ngay[n - 1], 'cuối kỳ'));
    var giua = Math.floor(n / 2);
    if (giua > 0 && giua < n - 1) out.push(ngan(ngay[giua], 'giữa kỳ'));
    /* BUG: bản gốc trả về [đầu kỳ, cuối kỳ, giữa kỳ] — thứ tự NGÀY bị đảo, mốc
     * "cuối kỳ" nằm giữa dãy. BĐ2 đọc mốc theo chỉ số nên cắt nhầm lát. Sắp theo
     * ISO (YYYY-MM-DD so sánh chuỗi là đúng thứ tự ngày). */
    out.sort(function (a, b) { return a.iso < b.iso ? -1 : (a.iso > b.iso ? 1 : 0); });
    return out;
  }
  function ngan(iso, ten) {
    return { iso: iso, ten: ten, nhan: nhanNgay(iso) };
  }

  /* ============================================================== vùng A
   * 4 ô tổng hợp. NGUỒN: cộng trên tập khách TRONG PHẠM VI (theo_ma đã lọc).
   * KHÔNG đọc theo_phong cho ô chính — đọc sẽ lộ dư nợ cả phòng, vi phạm Q1.
   * Với TP/GĐ thì thêm dÒNG PHỤ "trong đó tổng phòng" lấy từ theo_phong —
   * đây là nơi DUY NHẤT được đọc theo_phong. */
  function vungTongHop(ky, mgList, laQuanLy) {
    var t = kyDuno(ky) || {};
    var kh = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
    var tong = tinhTong(kh, mgList);

    var h = [];
    h.push('<div class="card dn-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">TỔNG HỢP DƯ NỢ — phạm vi đang xem</div>');
    h.push('      <div class="card-sub">Đơn vị: <b>TRIỆU ĐỒNG</b> · kỳ <b>' + esc(kyNhan(ky)) + '</b>'
      + (laQuanLy ? ' · gồm dư nợ chi tiết của các mã trong cây quản lý' : ' · chỉ khách hàng của chính bạn')
      + tip(NOI_DUNG_TIP['duno-quyen'], 'duno-quyen') + '</div></div>');
    h.push('    <span class="dn-badge" role="note">' + esc((D() && D()._canh_bao) || 'DỮ LIỆU GIẢ') + '</span>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="kpi-tiles dn-tt">');

    h.push(tile('Dư nợ tính lãi', n1(tong.du_no_tinh_lai), 'tr', 'duno-cong-thuc',
      laQuanLy ? phuPhong(ky, mgList, 'du_no_tinh_lai', 'trong đó tổng phòng: ')
                     + n1(tongPhong(ky, mgList, 'du_no_tinh_lai')) + ' tr'
               : 'khối khách hàng bạn quản lý'));
    h.push(tile('Lãi tạm tính', n2(tong.lai_tam_tinh), 'tr', 'duno-cong-thuc',
      'ước tính theo quy ước mô phỏng, không phải lãi thực thu'));
    h.push(tile('Số khách có dư nợ', n0(tong.so_kh) , 'khách', 'duno-don-vi',
      'trong ' + n0(tong.so_kh_tt) + ' khách hàng trong phạm vi'));

    h.push('    </div>');
    h.push('  </div></div>');
    return h.join('');
  }

  function tile(label, value, donVi, tipId, sub) {
    var h = [];
    h.push('      <div class="tile">');
    h.push('        <div class="tile-label">' + esc(label) + tip(NOI_DUNG_TIP[tipId], tipId) + '</div>');
    h.push('        <div class="tile-value">' + value + (donVi ? ' <small>' + esc(donVi) + '</small>' : '') + '</div>');
    h.push('        <div class="tile-sub">' + (sub || '') + '</div>');
    h.push('      </div>');
    return h.join('');
  }

  /* Tổng phòng trong phạm vi: cộng các mã trong cây QUY về đúng phòng của họ.
   * Chỉ gọi khi laQuanLy = true (vùng E / dòng phụ), nên không vi phạm Q1. */
  function tongPhong(ky, mgList, field) {
    var t = kyDuno(ky) || {};
    var phong = (t.theo_phong && typeof t.theo_phong === 'object') ? t.theo_phong : {};
    var s = 0, co = false;
    for (var i = 0; i < mgList.length; i++) {
      var p = phong[mgList[i].ma_phong];
      if (p && isNum(p[field])) { s += p[field]; co = true; }
    }
    return co ? s : null;
  }
  function phuPhong(ky, mgList, field, nhan) {
    var v = tongPhong(ky, mgList, field);
    return isNum(v) ? nhan + ' tr' : '';
  }

  /* Cộng trên tập khách TRONG PHẠM VI. `dict` ở đây là `theo_ma`
   * (khoá theo MA_KH) — KHÔNG duyệt `dict[ma_mg]` (bản gốc làm
   * vậy nên luôn trượt → 4 ô tổng hợp hiện "0,0 tr"). Duyệt mọi
   * bản ghi rồi lọc `r.ma_mg` thuộc tập mgList: không lộ người
   * ngoài phạm vi vì chỉ cộng bản ghi khớp. */
  function tinhTong(dict, mgList) {
    var tong = { du_no_tinh_lai: 0, lai_tam_tinh: 0, so_kh: 0, so_kh_tt: 0 };
    if (!dict || typeof dict !== 'object') return tong;
    var inRange = {};
    for (var i = 0; i < mgList.length; i++) { inRange[mgList[i].ma_mg] = 1; }
    for (var k in dict) {
      if (!Object.prototype.hasOwnProperty.call(dict, k)) continue;
      var r = dict[k];
      if (!r || !inRange[r.ma_mg]) continue;
      if (isNum(r.du_no_tinh_lai)) tong.du_no_tinh_lai += r.du_no_tinh_lai;
      if (isNum(r.lai_tam_tinh)) tong.lai_tam_tinh += r.lai_tam_tinh;
      /* Mỗi bản ghi chỉ tính 1 lần (bản gốc đếm đôi `so_kh`). */
      tong.so_kh++;
      if (isNum(r.du_no_tinh_lai) && r.du_no_tinh_lai > 0) tong.so_kh_tt++;
    }
    return tong;
  }

  /* ============================================================== vùng B
   * BĐ1 — biến động dư nợ theo NGÀY trong kỳ (dư nợ tính lãi /
   * lãi tạm tính). Đơn vị triệu đồng. */
  function vungBienDong(ky, mgList) {
    var g = gopNgy(ky, maTrong(ky, mgList));
    var h = [];
    h.push('<div class="card dn-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Biến động dư nợ theo NGÀY trong kỳ</div>');
    h.push('      <div class="card-sub">Trục ngang là <b>từng ngày</b> từ đầu kỳ đến cuối kỳ '
      + '(không gom theo tháng) · đơn vị triệu đồng'
      + tip(NOI_DUNG_TIP['duno-thoi-diem-xem'], 'duno-thoi-diem-xem') + '</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="dn-grid">');

    /* Ô trái: dư nợ (1 series). Ô phải: lãi tạm tính theo ngày. */
    h.push('      <div class="dn-cell">' + veBox('dn-bd-du-no', 260, 'Dư nợ theo ngày', 'triệu đồng') + '</div>');
    h.push('      <div class="dn-cell">' + veBox('dn-bd-lai', 260, 'Lãi tạm tính theo ngày', 'triệu đồng · ước tính') + '</div>');

    h.push('    </div>');
    if (!g) {
      h.push('    <div class="dn-alert soft">Chưa có chuỗi dư nợ theo ngày cho kỳ này.</div>');
    } else {
      h.push('    <div class="dn-note">Chuỗi ' + esc(n0(g.ngay.length)) + ' ngày · từ '
        + esc(g.ngay[0]) + ' đến ' + esc(g.ngay[g.ngay.length - 1])
        + ' · gồm ' + esc(n0(maTrong(ky, mgList).length)) + ' mã môi giới trong phạm vi.</div>');
    }
    h.push('  </div></div>');
    return h.join('');
  }

  /* ============================================================== vùng C
   * BĐ2 — cơ cấu dư nợ theo MÃ tại thời điểm xem. Mặc định ngày cuối kỳ.
   * Ở cấp quản lý vẽ theo MÔI GIỚI (donut, theo_ma_mg); ở cấp nhân viên vẽ
   * theo KHÁCH HÀNG top-N (cột ngang) vì nhân viên không được thấy tổng theo
   * môi giới. Phần ngoài top-N gom 1 dòng "Còn lại (n khách)" — không cắt
   * im lặng làm tổng trông thiếu. */
  function vungCoCau(ky, mgList, laQuanLy) {
    var g = gopNgy(ky, maTrong(ky, mgList));
    var moc = mocXem(g && g.ngay);
    var i = Math.min(Math.max(st.tdXem, 0), Math.max(moc.length - 1, 0));
    var mocChon = moc[i] || null;

    var h = [];
    h.push('<div class="card dn-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">Cơ cấu dư nợ theo mã tại thời điểm xem</div>');
    h.push('      <div class="card-sub">Một lát cắt tại <b>' + (mocChon ? esc(mocChon.iso) : DASH) + '</b>'
      + (mocChon ? ' (' + esc(mocChon.ten) + ')' : '') + ' · đơn vị triệu đồng'
      + tip(NOI_DUNG_TIP['duno-thoi-diem-xem'], 'duno-thoi-diem-xem') + '</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');

    if (moc.length < 2) {
      h.push('    <div class="dn-alert">Chưa có chuỗi ngày cho kỳ này nên chưa dựng được biểu đồ cơ cấu.</div>');
      h.push('  </div></div>');
      return h.join('');
    }

    h.push('    <div class="row" style="gap:8px">');
    h.push('      <label for="dnTdXem" style="font-size:var(--fs-small,12px);color:var(--muted)">Thời điểm xem</label>');
    h.push('      <select id="dnTdXem" data-act="dn-td" style="height:28px;padding:0 8px;'
      + 'border:1px solid var(--border);border-radius:var(--radius-sm,6px);background:var(--surface);'
      + 'color:var(--text);font-family:inherit;font-size:var(--fs-small,12px)">');
    for (var j = 0; j < moc.length; j++) {
      h.push('        <option value="' + j + '"' + (j === i ? ' selected' : '') + '>'
        + esc(moc[j].iso + ' · ' + moc[j].ten) + '</option>');
    }
    h.push('      </select>');
    h.push('    </div>');

    h.push('    <div class="dn-grid">');
    h.push('      <div class="dn-cell">' + veBox(laQuanLy ? 'dn-cc-mg' : 'dn-cc-kh', 300,
      laQuanLy ? 'Theo môi giới' : 'Top ' + TOP_N + ' khách hàng', 'triệu đồng') + '</div>');
    h.push('      <div class="dn-cell">' + veXepHang(ky, mgList, laQuanLy, mocChon) + '</div>');
    h.push('    </div>');
    h.push('  </div></div>');
    return h.join('');
  }

  /* Mã môi giới TRONG phạm vi mà CÓ chuỗi ngày trong kỳ. Lọc trước khi dựng
   * chuỗi để không cộng nhầm người ngoài phạm vi. */
  function maTrong(ky, mgList) {
    var d = D();
    var src = (d && d.theo_ngay && d.theo_ngay[ky]) || {};
    var out = [];
    for (var i = 0; i < mgList.length; i++) {
      if (src[mgList[i].ma_mg]) out.push(mgList[i].ma_mg);
    }
    return out;
  }

  /* Bảng XẾP HẠNG đi cùng biểu đồ cơ cấu: tên · dư nợ · tỷ lệ trong phạm vi.
   * Ở cấp quản lý xếp theo MÔI GIỚI; ở cấp nhân viên xếp theo KHÁCH HÀNG.
   * Cả hai đều lấy từ tập ĐÃ LỌC nên không có tên ngoài phạm vi trong DOM. */
  function veXepHang(ky, mgList, laQuanLy, moc) {
    var t = kyDuno(ky) || {};
    var tong = tongCoCau(ky, mgList, laQuanLy);
    var ds = [];
    if (laQuanLy) {
      var mm = (t.theo_ma_mg && typeof t.theo_ma_mg === 'object') ? t.theo_ma_mg : {};
      for (var i = 0; i < mgList.length; i++) {
        var r = mm[mgList[i].ma_mg];
        if (r && isNum(r.du_no_tinh_lai) && r.du_no_tinh_lai > 0) {
          ds.push({ ten: r.ho_ten, ma: r.ma_mg, v: r.du_no_tinh_lai });
        }
      }
    } else {
      var theoMa = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
      var rows = locRows(theoMa, mgList);
      for (var j = 0; j < rows.length; j++) {
        if (isNum(rows[j].du_no_cuoi_ky) && rows[j].du_no_cuoi_ky > 0) {
          ds.push({ ten: rows[j].ho_ten, ma: rows[j].ma_kh, v: rows[j].du_no_cuoi_ky });
        }
      }
    }
    ds.sort(function (a, b) { return b.v - a.v; });

    var h = [];
    h.push('<div class="chart-box-title">' + (laQuanLy ? 'Xếp hạng theo môi giới' : 'Xếp hạng theo khách hàng') + '</div>');
    h.push('<div class="chart-box-sub">' + (laQuanLy ? 'Môi giới' : 'Khách hàng')
      + ' · dư nợ tính lãi · ' + (moc ? esc(moc.iso) : DASH) + '</div>');
    if (!ds.length) {
      h.push(veBox('dn-xh', 300));
      h.push(emptyBox('Chưa có dư nợ trong phạm vi tại thời điểm này.'));
      return h.join('');
    }
    var top = ds.slice(0, 12);
    h.push('<div class="table-wrap" style="max-height:300px">');
    h.push('  <table class="table dn-tbl"><thead><tr>');
    h.push('    <th scope="col">' + (laQuanLy ? 'Môi giới' : 'Khách hàng') + '</th>');
    h.push('    <th class="num" scope="col">Dư nợ (tr)</th>');
    h.push('    <th class="num" scope="col">Tỷ lệ</th>');
    h.push('  </tr></thead><tbody>');
    for (var k = 0; k < top.length; k++) {
      var ty = (tong > 0) ? top[k].v / tong : null;
      h.push('    <tr><td>' + esc(top[k].ten) + ' <span class="dn-dash">(' + esc(top[k].ma) + ')</span></td>');
      h.push('      <td class="num">' + n1(top[k].v) + '</td>');
      h.push('      <td class="num">' + fpct(ty) + '</td></tr>');
    }
    if (ds.length > top.length) {
      h.push('    <tr class="sub-row"><td>Còn lại ' + esc(n0(ds.length - top.length)) + ' mã</td>');
      h.push('      <td class="num">' + n1(tong - ds.slice(0, top.length).reduce(function (a, b) { return a + b.v; }, 0)) + '</td>');
      h.push('      <td class="num">' + fpct((tong > 0)
        ? (tong - ds.slice(0, top.length).reduce(function (a, b) { return a + b.v; }, 0)) / tong : null) + '</td></tr>');
    }
    h.push('  </tbody></table>');
    h.push('</div>');
    return h.join('');
  }

  function emptyBox(msg) {
    var C = CH();
    if (C && typeof C.empty === 'function') { try { return C.empty(msg); } catch (e) { /* tự */ } }
    return '<div class="chart-empty">' + esc(msg) + '</div>';
  }

  /* Tổng làm mẫu (mẫu số của tỷ lệ): cấp quản lý dùng theo_ma_mg, cấp nhân
   * viên dùng theo_ma — đều trong tập đã lọc. */
  function tongCoCau(ky, mgList, laQuanLy) {
    var t = kyDuno(ky) || {};
    var tong = 0;
    if (laQuanLy) {
      var mm = (t.theo_ma_mg && typeof t.theo_ma_mg === 'object') ? t.theo_ma_mg : {};
      for (var i = 0; i < mgList.length; i++) {
        var r = mm[mgList[i].ma_mg];
        if (r && isNum(r.du_no_tinh_lai)) tong += r.du_no_tinh_lai;
      }
    } else {
      var theoMa = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
      tong = sumField(locRows(theoMa, mgList), 'du_no_cuoi_ky');
    }
    return tong;
  }

  /* ============================================================== vùng D
   * Bảng chi tiết khách hàng — tầng `theo_ma`, CHỈ trong phạm vi.
   * Lọc loại KH mặc định "Tất cả" (quy tắc P2: KHÔNG ép về KH_MARGIN). */
  function vungChiTiet(ky, mgList, laQuanLy) {
    var t = kyDuno(ky) || {};
    var theoMa = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
    var rows = locRows(theoMa, mgList);
    var h = [];

    h.push('<div class="card dn-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">CHI TIẾT KHÁCH HÀNG</div>');
    h.push('      <div class="card-sub">Nguồn <i>theo_ma</i> của kỳ · '
      + esc(n0(rows.length)) + ' khách hàng trong phạm vi</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="dn-filter">');
    h.push('      <label for="dnLoai">Loại khách hàng</label>');
    h.push('      <select id="dnLoai" data-act="dn-loai">');
    h.push('        <option value="">Tất cả</option>');
    var loai = loaiTrong(rows);
    for (var i = 0; i < loai.length; i++) {
      h.push('        <option value="' + esc(loai[i].ten) + '"' + (st.kh.loai === loai[i].ten ? ' selected' : '') + '>'
        + esc(loai[i].ten) + ' (' + esc(n0(loai[i].n)) + ')</option>');
    }
    h.push('      </select>');
    h.push('      <label for="dnQ">Tìm</label>');
    h.push('      <input id="dnQ" type="search" data-act="dn-q" value="' + esc(st.kh.q) + '"'
      + ' placeholder="Tên hoặc mã khách hàng">');
    h.push('    </div>');

    if (!rows.length) {
      h.push('    <div class="dn-alert">Chưa có dữ liệu khách hàng cho kỳ này trong phạm vi của bạn.</div>');
      h.push('  </div></div>');
      return h.join('');
    }

    h.push('    <div class="table-wrap">');
    h.push('      <table class="table dn-tbl" id="dnTblKh"><thead>');
    h.push(theadRow('dn-tbl', 'kh', [
      { k: 'ma_kh', t: 'Mã KH' },
      { k: 'ho_ten', t: 'Họ tên' },
      { k: 'loai_kh', t: 'Loai KH' },
      { k: 'ma_phong', t: 'Phòng' },
      { k: 'du_no_tinh_lai', t: 'Dư nợ tính lãi', num: 1 },
      { k: 'lai_tam_tinh', t: 'Lãi tạm tính', num: 1 },
      { k: 'lai_suat_tam_tinh', t: 'Lãi suất tạm tính', num: 1 },
      { k: 'du_no_dau_ky', t: 'Dư nợ đầu kỳ', num: 1 },
      { k: 'du_no_cuoi_ky', t: 'Dư nợ cuối kỳ', num: 1 },
      { k: 'bien_dong', t: 'Biến động', num: 1 }
    ]));
    h.push('      </thead><tbody id="dnTblKhBody">');
    h.push(tbodyKh(rows));
    h.push('      </tbody></table>');
    h.push('    </div>');
    h.push(pager(rows.length, 'dnTrang'));
    h.push('    <div class="dn-note">Dư nợ cuối kỳ là dư nợ tính lãi tại ngày cuối kỳ. '
      + 'Biến động giữ dấu: <b>+</b> tăng, <b>−</b> giảm.</div>');
    h.push('  </div></div>');
    return h.join('');
  }

  /* Lọc `theo_ma` (khoá theo MA_KH) theo phạm vi môi giới.
   *
   *  BUG THAT DA GIET MAN NAY (30/09/2026): bản gốc duyệt `dict[ma_mg]`, nhưng
   *  `theo_ma` khoá theo `KH000001`… nên `dict[ma]` luôn `undefined` → màn dư nợ
   *  trả 0 dòng, mọi bảng chi tiết rỗng. Chỉ `theo_ma_mg` mới khoá theo mã
   *  môi giới. Sửa: duyệt theo tập mã rồi lọc `r.ma_mg` — vẫn KHÔNG lộ người
   *  ngoài phạm vi vì chỉ push bản ghi khớp `mgList` (không duyệt mọi khoá của
   *  dict như bản gốc, vốn lộ tên nếu dict lỡ chứa thừa).
   */
  function locRows(dict, mgList) {
    var out = [];
    if (!dict || typeof dict !== 'object') return out;
    var inRange = {};
    for (var i = 0; i < mgList.length; i++) { inRange[mgList[i].ma_mg] = 1; }
    for (var k in dict) {
      if (!Object.prototype.hasOwnProperty.call(dict, k)) continue;
      var r = dict[k];
      if (r && inRange[r.ma_mg]) { out.push(r); }
    }
    return out;
  }

  function loaiTrong(rows) {
    var seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var ten = rows[i].ten_loai_kh || rows[i].loai_kh;
      if (!ten || seen[ten]) continue;
      seen[ten] = 1;
      var n = 0;
      for (var j = 0; j < rows.length; j++) if ((rows[j].ten_loai_kh || rows[j].loai_kh) === ten) n++;
      out.push({ ten: ten, n: n });
    }
    out.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

  /* Lọc tìm kiếm + loại + sắp xếp. Bỏ dấu khi so khớp để tìm "Nguyen" ra
   * "Nguyễn" — dùng App.deaccent, không tự viết bảng bỏ dấu. */
  function locTheoBieuLoc(rows) {
    var out = [];
    var q = chuanHoaDeaccent(st.kh.q);
    var loai = st.kh.loai;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (loai && (r.ten_loai_kh || r.loai_kh) !== loai) continue;
      if (q) {
        var s = chuanHoaDeaccent((r.ma_kh || '') + ' ' + (r.ho_ten || ''));
        if (s.indexOf(q) < 0) continue;
      }
      out.push(r);
    }
    out.sort(function (a, b) {
      var x = a[st.kh.sort], y = b[st.kh.sort];
      if (typeof x === 'string' || typeof y === 'string') {
        return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'vi') * st.kh.dir;
      }
      var xv = isNum(x) ? x : -Infinity, yv = isNum(y) ? y : -Infinity;
      return (xv - yv) * st.kh.dir;
    });
    return out;
  }
  function chuanHoaDeaccent(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    var a = A();
    if (a && typeof a.deaccent === 'function') { try { return a.deaccent(t); } catch (e) { /* tự */ } }
    return t;
  }

  function tbodyKh(rows) {
    var all = locTheoBieuLoc(rows);
    var tong = all.length;
    var soTrang = Math.max(1, Math.ceil(tong / TRANG));
    if (st.kh.page >= soTrang) st.kh.page = soTrang - 1;
    if (st.kh.page < 0) st.kh.page = 0;
    var cat = all.slice(st.kh.page * TRANG, (st.kh.page + 1) * TRANG);

    var h = [];
    if (!cat.length) {
      h.push('        <tr><td colspan="10" class="dn-dash">Không có khách hàng nào khớp bộ lọc.</td></tr>');
      return h.join('');
    }
    for (var i = 0; i < cat.length; i++) {
      var r = cat[i];
      var bd = r.bien_dong;
      var cls = isNum(bd) ? (bd > 0 ? 'num dn-up' : (bd < 0 ? 'num dn-down' : 'num')) : 'num dn-dash';
      h.push('        <tr data-dn-kh="' + esc(r.ma_kh) + '">');
      h.push('          <td>' + esc(r.ma_kh) + '</td>');
      h.push('          <td>' + esc(r.ho_ten) + '</td>');
      h.push('          <td>' + esc(r.ten_loai_kh || r.loai_kh) + '</td>');
      h.push('          <td>' + esc(phongNgan(r.ma_phong)) + '</td>');
      h.push('          <td class="num">' + n1(r.du_no_tinh_lai) + '</td>');
      h.push('          <td class="num">' + n1(r.lai_tam_tinh) + '</td>');
      h.push('          <td class="num">' + fpct(r.lai_suat_tam_tinh) + '</td>');
      h.push('          <td class="num">' + n1(r.du_no_dau_ky) + '</td>');
      h.push('          <td class="num">' + n1(r.du_no_cuoi_ky) + '</td>');
      h.push('          <td class="' + cls + '">' + (isNum(bd) ? fpctSigned(bd) : DASH) + '</td>');
      h.push('        </tr>');
    }
    return h.join('');
  }

  function pager(tong, id) {
    var soTrang = Math.max(1, Math.ceil(tong / TRANG));
    if (tong <= MAX_ROW) return '<div class="dn-note" style="margin-top:var(--sp-2,8px)">'
      + esc(n0(tong)) + ' khách hàng.</div>';
    var h = [];
    h.push('<div class="row" data-dn-pager style="margin-top:var(--sp-2,8px);gap:8px">');
    h.push('  <span class="dn-note" style="margin:0">' + esc(n0(tong)) + ' khách hàng · trang '
      + esc(n0(st.kh.page + 1)) + '/' + esc(n0(soTrang)) + '</span>');
    h.push('  <button type="button" class="ky-btn" data-act="dn-trang" data-p="-1"'
      + (st.kh.page <= 0 ? ' disabled' : '') + '>Trước</button>');
    h.push('  <button type="button" class="ky-btn" data-act="dn-trang" data-p="1"'
      + (st.kh.page >= soTrang - 1 ? ' disabled' : '') + '>Sau</button>');
    h.push('</div>');
    return h.join('');
  }

  /* ============================================================== vùng E
   * Bảng tổng hợp nhân viên — CHỈ dựng cho cấp quản lý (he_so_cap >= 2).
   * Nhân viên KHÔNG thấy vùng này: không sinh vào DOM, không ẩn bằng CSS. */
  function vungNhanVien(ky, mgList) {
    var t = kyDuno(ky) || {};
    var mm = (t.theo_ma_mg && typeof t.theo_ma_mg === 'object') ? t.theo_ma_mg : {};
    var rows = [];
    for (var i = 0; i < mgList.length; i++) {
      var r = mm[mgList[i].ma_mg];
      if (r) rows.push(r);
    }
    if (!rows.length) return '';

    var h = [];
    h.push('<div class="card dn-sec">');
    h.push('  <div class="card-head">');
    h.push('    <div><div class="card-title">TỔNG HỢP DƯ NỢ THEO NHÂN VIÊN</div>');
    h.push('      <div class="card-sub">Nguồn <i>theo_ma_mg</i> · chỉ hiện với Trưởng phòng / '
      + 'Giám đốc (quyền xem dư nợ TỔNG của nhân viên trong phòng) · đơn vị triệu đồng</div></div>');
    h.push('  </div>');
    h.push('  <div class="card-body">');
    h.push('    <div class="table-wrap">');
    h.push('      <table class="table dn-tbl" id="dnTblNv"><thead>');
    h.push(theadRow('dn-tbl', 'nhan_vien', [
      { k: 'ma_mg', t: 'Mã MG' },
      { k: 'ho_ten', t: 'Họ tên' },
      { k: 'chuc_danh', t: 'Chức danh' },
      { k: 'ma_phong', t: 'Phòng' },
      { k: 'so_kh', t: 'Số KH', num: 1 },
      { k: 'du_no_tinh_lai', t: 'Dư nợ tính lãi', num: 1 },
      { k: 'du_no_lai_tam_tinh', t: 'Dư nợ lãi tạm tính', num: 1 }
    ]));
    h.push('      </thead><tbody id="dnTblNvBody">' + tbodyNv(rows) + '</tbody></table>');
    h.push('    </div>');
    h.push('  </div></div>');
    return h.join('');
  }

  function tbodyNv(rows) {
    var s = st.nhan_vien;
    var a = rows.slice();
    a.sort(function (x, y) {
      var xv = isNum(x[s.sort]) ? x[s.sort] : -Infinity;
      var yv = isNum(y[s.sort]) ? y[s.sort] : -Infinity;
      return (xv - yv) * s.dir;
    });
    var h = [];
    for (var i = 0; i < a.length; i++) {
      var r = a[i];
      h.push('        <tr>');
      h.push('          <td>' + esc(r.ma_mg) + '</td>');
      h.push('          <td>' + esc(r.ho_ten) + '</td>');
      h.push('          <td>' + esc(r.chuc_danh) + '</td>');
      h.push('          <td>' + esc(phongNgan(r.ma_phong)) + '</td>');
      h.push('          <td class="num">' + n0(r.so_kh) + '</td>');
      h.push('          <td class="num">' + n1(r.du_no_tinh_lai) + '</td>');
      h.push('          <td class="num">' + n2(r.du_no_lai_tam_tinh) + '</td>');
      h.push('        </tr>');
    }
    return h.join('');
  }

  /* ================================================== đầu bảng (thead)
   * Một hàm cho cả 2 bảng, tham số 'khoa' = st của bảng đó. `data-dir` dùng
   * để CSS vẽ mũi tên ▼/▲ — không chèn ký tự vào text (sẽ lọt vào innerText
   * mà bộ kiểm đối chiếu đọc). */
  function theadRow(cls, khoa, cols) {
    var s = st[khoa];
    var h = [];
    h.push('        <tr>');
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var dir = (s.sort === c.k) ? s.dir : 0;
      h.push('          <th class="' + (c.num ? 'num ' : '') + 'sortable"'
        + ' data-act="dn-sort" data-t="' + esc(khoa) + '" data-k="' + esc(c.k) + '"'
        + ' data-dir="' + dir + '" scope="col">' + esc(c.t) + '</th>');
    }
    h.push('        </tr>');
    return h.join('');
  }

  /* ============================================================== render */
  function renderDuno(el, ctx) {
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
      var ky = kyId(ctx);
      var maMg = maMgXem(ctx);
      var h = [];

      h.push('<div class="card">');
      h.push('  <div class="card-head">');
      h.push('    <div><div class="card-title">DƯ NỢ ĐANG QUẢN LÝ (MH06)</div>');
      h.push('      <div class="card-sub">' + (maMg
        ? esc((mgById(maMg) || {}).ho_ten || maMg) + ' · ' + esc(capQuanLy(maMg) >= 2 ? 'cấp quản lý' : 'cấp nhân viên')
        : 'Chưa chọn môi giới') + ' · kỳ <b>' + esc(kyNhan(ky)) + '</b> · đơn vị <b>TRIỆU ĐỒNG</b>'
        + tip(NOI_DUNG_TIP['duno-don-vi'], 'duno-don-vi') + '</div></div>');
      h.push('    <span class="dn-badge" role="note">' + esc((D() && D()._canh_bao) || 'DỮ LIỆU GIẢ') + '</span>');
      h.push('  </div>');
      h.push('  <div class="card-body">');

      if (!D()) {
        /* Generator chưa chạy / file dữ liệu chưa nạp: nói rõ, không ném lỗi
         * và KHÔNG dựng số 0 giả — số 0 ở đây là khẳng định sai. */
        h.push('    <div class="dn-alert"><b>Đang tải dữ liệu dư nợ…</b><br>File dữ liệu '
          + '<b>duno-data.js</b> (window.DUNO) chưa được nạp nên màn hình chỉ hiện '
          + 'khung, chưa có số liệu nào tính được.</div>');
      } else {
        var t = kyDuno(ky);
        if (!t) {
          h.push('    <div class="dn-alert">Chưa có dữ liệu dư nợ cho kỳ <b>' + esc(kyNhan(ky))
            + '</b>. Chọn kỳ khác ở thanh trên.</div>');
        } else {
          var laQuanLy = capQuanLy(maMg) >= 2;
          /* Tập mã TRONG phạm vi — nguồn duy nhất cho MỌI vùng. Dữ liệu ngoài
           * tập này không được chạm tới, nên không thể lọt vào DOM. */
          var mgList = mgTrongCay(maMg);
          if (!mgList.length) {
            h.push('    <div class="dn-alert">Chưa có môi giới nào trong phạm vi cây quản lý của bạn.</div>');
          } else {
            h.push(vungTongHop(ky, mgList, laQuanLy));
            h.push(vungBienDong(ky, mgList));
            h.push(vungCoCau(ky, mgList, laQuanLy));
            h.push(vungChiTiet(ky, mgList, laQuanLy));
            /* Vùng E chỉ sinh cho cấp quản lý — nhân viên không có trong DOM. */
            if (laQuanLy) h.push(vungNhanVien(ky, mgList));
            h.push('    <div class="dn-rules">');
            h.push('      <b>DỮ LIỆU GIẢ — quy ước mô phỏng.</b> Lãi tạm tính và lãi suất tạm '
                    + 'tính KHÔNG phải số thực thu: dư nợ tạm tính, lãi suất và lãi tạm tính được '
                    + 'sinh theo quy ước ghi ở <i>duno_data.json</i> (dư nợ tạm tính chỉ là căn cứ '
                    + 'nội bộ để tính lãi tạm tính, KHÔNG hiện trên màn này) · ' + esc((D() && D()._nguon_so) || '') + '.');
            h.push('    </div>');
          }
        }
      }
      h.push('  </div></div>');

      node.innerHTML = h.join('');

      /* Nối ký hiệu (i): tip() tự đăng ký vào registry, bind() chỉ cần cho
       * HTML viết tay — gọi thêm cho chắc. KHÔNG gọi UIPop.closeAll() ở đây. */
      try {
        var up = global.UIPop;
        if (up && typeof up.bind === 'function') up.bind(node);
      } catch (e) { /* không quan trọng */ }

      /* ĐĂNG KÝ BIỂU ĐỒ SAU innerHTML — canvas phải có trong DOM. */
      try { veBieuDo(ky, mgListVar(maMg), capQuanLy(maMg) >= 2); } catch (e) { warn('chart', e); }

      try {
        if (global.lucide && A() && typeof A().lucideCreateIcons === 'function') A().lucideCreateIcons();
      } catch (e) { /* không có lucide là bình thường */ }
    } catch (e) {
      warn('render', e);
      try {
        node.innerHTML = '<div class="card loi"><b>Lỗi hiển thị màn hình Dư nợ đang quản lý.</b><pre>'
          + esc(e && e.message ? e.message : e) + '</pre></div>';
      } catch (e2) { /* hết cách */ }
    }
  }

  /* Biểu đồ phải dùng LẠI đúng tập mã đã lọc ở phần render, không dựng lại từ
   * biến khác — nếu hai chỗ lệch nhau, biểu đồ có thể vẽ nhầm người ngoài
   * phạm vi (đúng loại lỗi bảo mật dữ liệu mà §9 cấm). */
  function mgListVar(maMg) {
    return mgTrongCay(maMg);
  }

  /* ================================================================ biểu đồ */
  function veBox(id, h, title, sub) {
    var C = CH();
    if (C && typeof C.box === 'function') { try { return C.box(id, h, title, sub); } catch (e) { /* tự */ } }
    return '<div class="chart-box" style="height:' + h + 'px"><canvas id="' + esc(id) + '"></canvas></div>';
  }

  function veBieuDo(ky, mgList, laQuanLy) {
    var C = CH();
    if (!C || typeof C.line !== 'function') return;   /* Chart.js chưa sẵn sàng */
    var g = gopNgy(ky, maTrong(ky, mgList));
    if (!g) return;
    var lbl = g.ngay.map(nhanNgay);

    /* BĐ1a — dư nợ theo ngày (1 series: dư nợ tính lãi). */
    C.line('dn-bd-du-no', lbl, [
      { label: 'Dư nợ tính lãi', data: g.du_no_tinh_lai, colorVar: '--chart-series-1' }
    ], {
      unit: 'tr', decimals: 0, maxTicks: 8,
      emptyMsg: 'Chưa có số liệu dư nợ theo ngày cho kỳ này.'
    });
    /* BĐ1b — lãi tạm tính theo ngày */
    C.line('dn-bd-lai', lbl, [
      { label: 'Lãi tạm tính', data: g.lai_tam_tinh, colorVar: '--chart-series-3' }
    ], {
      unit: 'tr', decimals: 1, maxTicks: 8,
      emptyMsg: 'Chưa có số liệu lãi tạm tính theo ngày cho kỳ này.'
    });

    /* BĐ2 — cơ cấu. Cấp quản lý xem theo MÔI GIỚI (theo_ma_mg); cấp nhân viên
     * xem theo KHÁCH HÀNG top-N — nhân viên không được thấy tổng theo môi giới. */
    var moc = mocXem(g.ngay);
    var i = Math.min(Math.max(st.tdXem, 0), Math.max(moc.length - 1, 0));
    var idx = g.ngay.indexOf(moc[i] ? moc[i].iso : '');
    if (idx < 0) idx = g.ngay.length - 1;

    if (laQuanLy) {
      var t = kyDuno(ky) || {};
      var mm = (t.theo_ma_mg && typeof t.theo_ma_mg === 'object') ? t.theo_ma_mg : {};
      var ds = [];
      for (var a = 0; a < mgList.length; a++) {
        var r = mm[mgList[a].ma_mg];
        if (r && isNum(r.du_no_tinh_lai) && r.du_no_tinh_lai > 0) ds.push(r);
      }
      ds.sort(function (x, y) { return y.du_no_tinh_lai - x.du_no_tinh_lai; });
      C.donut('dn-cc-mg', ds.map(function (x) { return x.ma_mg; }),
        ds.map(function (x) { return x.du_no_tinh_lai; }), {
          unit: 'tr', decimals: 0, showPercent: true,
          centerText: n0(ds.length) + ' MG', centerSub: 'có dư nợ',
          emptyMsg: 'Chưa có số liệu cơ cấu dư nợ cho thời điểm này.'
        });
    } else {
      var cs = coCauKh(ky, mgList, idx);
      C.barNgang('dn-cc-kh', cs.labels, cs.values, {
        unit: 'tr', decimals: 0, showPercent: true,
        label: 'Dư nợ tính lãi', indexAxis: 'y', horizontal: true,
        emptyMsg: 'Chưa có số liệu cơ cấu dư nợ cho thời điểm này.'
      });
    }
  }

  /* Cơ cấu tầng khách: top-N + gom phần ngoài top-N thành 1 dòng. Cắt im lặng
   * làm tổng trông thiếu — phải nói rõ còn lại bao nhiêu khách. */
  function coCauKh(ky, mgList, idx) {
    var t = kyDuno(ky) || {};
    var theoMa = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
    var rows = locRows(theoMa, mgList);
    var co = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i].du_no_cuoi_ky;
      if (isNum(v) && v > 0) co.push({ ten: rows[i].ho_ten, ma: rows[i].ma_kh, v: v });
    }
    co.sort(function (a, b) { return b.v - a.v; });
    var labels = [], values = [];
    for (var j = 0; j < Math.min(TOP_N, co.length); j++) {
      labels.push(co[j].ten + ' (' + co[j].ma + ')');
      values.push(co[j].v);
    }
    if (co.length > TOP_N) {
      var s = 0;
      for (var m = TOP_N; m < co.length; m++) s += co[m].v;
      labels.push('Còn lại (' + co.length - TOP_N + ' khách)');
      values.push(s);
    }
    return { labels: labels, values: values };
  }

  /* ================================================================ sự kiện */
  function bind() {
    if (!global.document || global.__dunoBound) return;
    var root = global.document.getElementById(ROOT_ID);
    if (!root) return;
    global.__dunoBound = true;

    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      var hitSort = t.closest('[data-act="dn-sort"]');
      if (hitSort) {
        ev.preventDefault();
        var kh = hitSort.getAttribute('data-t');
        var s = st[kh];
        if (!s) return;
        var k = hitSort.getAttribute('data-k');
        if (s.sort === k) s.dir = -s.dir;
        else { s.sort = k; s.dir = -1; }
        refresh();
        return;
      }

      var hitTrang = t.closest('[data-act="dn-trang"]');
      if (hitTrang) {
        ev.preventDefault();
        var p = parseInt(hitTrang.getAttribute('data-p'), 10);
        if (!isNaN(p)) st.kh.page += p;
        refresh();
        return;
      }
    });

    root.addEventListener('input', function (ev) {
      var e2 = ev.target;
      if (!e2 || !e2.getAttribute) return;
      var act = e2.getAttribute('data-act');
      if (act !== 'dn-q') return;
      st.kh.q = e2.value || '';
      st.kh.page = 0;
      /* Chỉ vẽ lại phần tbody + pager, giữ con trỏ nhập: sửa từng node trong
       * DOM thay vì innerHTML lại cả card (sẽ mất focus khi đang gõ). */
      veLaiBangKh();
    });

    root.addEventListener('change', function (ev) {
      var e2 = ev.target;
      if (!e2 || !e2.getAttribute) return;
      var act = e2.getAttribute('data-act');
      if (act === 'dn-loai') {
        st.kh.loai = e2.value || '';
        st.kh.page = 0;
        refresh();
      } else if (act === 'dn-td') {
        st.tdXem = parseInt(e2.value, 10) || 0;
        refresh();
      }
    });
  }

  /* Vẽ lại riêng bảng chi tiết khi đang gõ tìm — không mất focus.
   * Chỉ thay <tbody> + khối phân trang; KHÔNG innerHTML lại cả card, nếu không
   * con trỏ nhập sẽ nhảy về đầu mỗi ký tự gõ. */
  function veLaiBangKh() {
    if (!lastEl) return refresh();
    var body = lastEl.querySelector('#dnTblKhBody');
    if (!body) return refresh();
    body.innerHTML = tbodyKh(rowsHienTai());
    /* Khối phân trang nằm ngay sau </div> của .table-wrap, gắn data-dn-pager
     * để tìm được bằng thuộc tính thay vì đoán chỉ số phần tử. */
    var old = lastEl.querySelector('[data-dn-pager]');
    if (old && old.parentNode) {
      var p2 = parseNode(pager(locTheoBieuLoc(rowsHienTai()).length, 'dnTrang'));
      if (p2) old.parentNode.replaceChild(p2, old);
    }
  }

  function rowsHienTai() {
    var ky = kyId(lastCtx);
    var maMg = maMgXem(lastCtx);
    var t = kyDuno(ky) || {};
    var theoMa = (t.theo_ma && typeof t.theo_ma === 'object') ? t.theo_ma : {};
    return locRows(theoMa, mgTrongCay(maMg));
  }

  /* innerHTML -> Node. tmp.firstChild có thể là text node trắng do thụt lề. */
  function parseNode(html) {
    var tmp = doc().createElement('div');
    tmp.innerHTML = html;
    var n = tmp.firstChild;
    while (n && n.nodeType !== 1) n = n.nextSibling;
    return n;
  }

  function refresh() {
    if (lastEl) renderDuno(lastEl, lastCtx);
  }

  /* ================================================================ EXPORT */
  global.ScreenDuno = {
    render: renderDuno,
    refresh: refresh,
    state: st,
    reset: function () {
      st.kh = { sort: 'du_no_tinh_lai', dir: -1, q: '', loai: '', page: 0 };
      st.nhan_vien = { sort: 'du_no_tinh_lai', dir: -1 };
      st.tdXem = 1;
    },
    _gopNgy: gopNgy,
    _tinhTong: tinhTong
  };
  global.renderDuno = renderDuno;

  /* Đăng ký vào App. File này nạp SAU app.js nên dùng cơ chế tự đăng ký
   * (giống screen-hoahong.js) thay vì sửa SCREEN_LIST. */
  function hookApp() {
    var a = global.App;
    if (!a || typeof a.registerScreen !== 'function' || global.__dunoHooked) return;
    var names = a.SCREEN_NAMES || [];
    if (names.indexOf('duno') === -1) return;
    global.__dunoHooked = true;
    try { a.registerScreen('duno', renderDuno); } catch (e) { /* không quan trọng */ }
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { bind(); hookApp(); });
    }
    bind();
    hookApp();
    /* app.js / #screen-duno có thể nạp sau → thử lại vài lần. */
    var tries = 0;
    var tmr = global.setInterval || function () { return 0; };
    var id = tmr(function () {
      tries++;
      bind();
      hookApp();
      if (global.__dunoHooked || tries > 40) {
        var clr = global.clearInterval || function () { };
        clr(id);
      }
    }, 120);
  }

})(typeof window !== 'undefined' ? window : this);
