/* =============================================================================
 * screen-khoi-chart.js — PHẦN BIỂU ĐỒ TƯƠNG TÁC cho MH04 "Tổng hợp khối"
 * -----------------------------------------------------------------------------
 * Dùng: window.KhoiChart.augment(secEl, ctx)   — secEl = #screen-khoi
 *       window.KhoiChart.setPhong(maPhong)      — đặt phòng khi không đọc được DOM
 *       window.KhoiChart.refresh()              — vẽ lại bằng dữ liệu hiện tại
 *
 * NGUYÊN TẮC SỐ LIỆU (bắt buộc — đã đối chiếu với data.js):
 *   - tong_diem là TỶ LỆ (1.12 = 112%), KHÔNG phải điểm. Mọi biểu đồ "điểm" ở
 *     đây dùng điểm THẬT: chi_tieu[] phần tử ma_chi_tieu === 'FKP' → gia_tri_thuc_te,
 *     dự phòng bằng chi_tiet_tai_chinh.diem_phi + diem_lai.
 *   - ty_le_hoan_thanh cũng là TỶ LỆ (1.1154 = 111,54%) → mọi nhãn % nhân 100
 *     (hàm pct() ở đây tự nhân; App.pct cũng nhân sẵn).
 *   - danh_sach_ky trong data.js xếp MỚI → CŨ (index 0 = kỳ mới nhất) nên mọi
 *     biểu đồ theo thời gian đều sắp lại theo tu_ngay tăng dần.
 *   - Mọi màu lấy từ biến CSS qua KPICharts.colorVar / cssVars(), không hardcode.
 *
 * Hợp đồng với màn hình gốc: file này KHÔNG sửa screen-khoi.js. Nó tự bọc hàm
 * render của MH04 (App.registerScreen) và nghe sự kiện đổi phòng (chip
 * [data-act="phong"]) để vẽ lại — vì screen-khoi.js tự render lại bằng hàm nội
 * bộ nên App.render() không phải lúc nào cũng chạy qua bọc của file này.
 * ========================================================================== */
(function (global) {
  'use strict';

  var ROOT_ID = 'screen-khoi';
  var HOST_ID = 'khoi-chart-host';      /* <section> chứa 4 thẻ biểu đồ (B/D/E/F) */
  var MAX_PHONG_BAR = 10;               /* khối B: tối đa 10 phòng */
  var MAX_PHONG_STACK = 8;              /* khối E: tối đa 8 phòng */
  var MAX_MG_BULLET = 6;                /* khối F: tối đa 6 môi giới */
  var XL = ['A', 'B', 'C', 'D'];
  var XL_VAR = { A: '--a', B: '--b', C: '--c', D: '--d' };
  var DASH = '—';

  /* 5 khoảng tỷ lệ hoàn thành — màu lấy từ biến CSS, từ thấp → cao */
  var KHOANG = [
    { ten: 'Dưới 50%', lo: -Infinity, hi: 0.5, colorVar: '--d' },
    { ten: '50% – 80%', lo: 0.5, hi: 0.8, colorVar: '--c' },
    { ten: '80% – 100%', lo: 0.8, hi: 1, colorVar: '--b' },
    { ten: '100% – 120%', lo: 1, hi: 1.2, colorVar: '--chart-series-3' },
    { ten: 'Trên 120%', lo: 1.2, hi: Infinity, colorVar: '--a' }
  ];

  /* Phòng đang lọc, dùng khi KHÔNG đọc được từ DOM (fallback của setPhong). */
  var phongFallback = null;
  var augQueued = false;

  /* ------------------------------------------------------------------ util */
  function K() { return global.KPI || {}; }
  function A() { return global.App || null; }
  function C() { return global.KPICharts || null; }
  function doc() { return global.document || null; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function n(v) { return isNum(v) ? v : 0; }

  function esc(s) {
    if (s === null || s === undefined) return '';
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
    var dd = d == null ? 0 : d, neg = x < 0;
    var parts = Math.abs(x).toFixed(dd).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + parts.join(',');
  }
  function n0(v) { return num(v, 0); }
  function n1(v) { return num(v, 1); }
  /* TỶ LỆ (0.66) → "66,0%" — luôn nhân 100 vì dữ liệu đã là tỷ lệ. */
  function pct(v, d) {
    if (!isNum(v)) return DASH;
    var a = A();
    if (a && typeof a.pct === 'function') { try { return a.pct(v, d == null ? 1 : d); } catch (e) { /* tự format */ } }
    return num(v * 100, d == null ? 1 : d) + '%';
  }

  function warn(msg, e) {
    if (global.console && console.warn) {
      console.warn('[khoi-chart] ' + msg + (e ? ': ' + ((e && e.message) || e) : ''));
    }
  }

  /* ============================================================== dữ liệu */

  function kyHienTaiId() {
    var a = A();
    if (a && a.state && a.state.kyId) return a.state.kyId;
    return (K().ky_hien_tai || {}).ky_id || null;
  }
  function kyIdFromCtx(ctx) {
    return (ctx && ctx.kyId) || kyHienTaiId();
  }
  function kyNhan(kyId) {
    var a = A();
    if (a && typeof a.kyNhan === 'function') { try { var s = a.kyNhan(kyId); if (s) return s; } catch (e) { /* tự tìm */ } }
    var list = kys();
    for (var i = 0; i < list.length; i++) if (list[i].ky_id === kyId) return list[i].nhan;
    return kyId || DASH;
  }

  /* danh_sach_ky: data.js xếp MỚI → CŨ. Luôn trả về bản đã sắp lại
     theo tu_ngay TĂNG DẦN để trục thời gian đi đúng chiều. */
  function kys() {
    var src = Array.isArray(K().danh_sach_ky) ? K().danh_sach_ky.slice() : [];
    src.sort(function (x, y) {
      var a = String((x && x.tu_ngay) || ''), b = String((y && y.tu_ngay) || '');
      if (!a || !b) return String((x && x.ky_id) || '').localeCompare(String((y && y.ky_id) || ''));
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return src;
  }

  function rowsKy(kyId) {
    var k = K(), id = kyId || kyHienTaiId();
    if (id && k.ket_qua_theo_ky && Array.isArray(k.ket_qua_theo_ky[id])) return k.ket_qua_theo_ky[id];
    if (id === (K().ky_hien_tai || {}).ky_id && Array.isArray(k.ket_qua_ky_hien_tai)) return k.ket_qua_ky_hien_tai;
    return Array.isArray(k.ket_qua_ky_hien_tai) ? k.ket_qua_ky_hien_tai : [];
  }
  function filterPhong(rows, maPhong) {
    if (!maPhong || maPhong === 'ALL') return (rows || []).slice();
    return (rows || []).filter(function (r) { return r && r.ma_phong === maPhong; });
  }

  /* --------------------------------------------------- PHẠM VI CÂY QUẢN LÝ
   * MH04 có biểu đồ "Điểm chuẩn vs thực tế (top môi giới)" với nhãn là HỌ TÊN
   * từng người, nên nếu rowsKy() trả toàn khối thì tên người ngoài cây hiện
   * thẳng trên trục biểu đồ. Ở đây rows KHÔNG lấy từ ctx mà tự gọi rowsKy(),
   * vì vậy phải tự lọc lại theo cây của người đang xem.
   * Mã người xem lấy theo thứ tự: ctx → App.user() → App.state. */
  function maMgXem(ctx) {
    if (ctx && ctx.ma_mg) return ctx.ma_mg;
    if (ctx && ctx.params && ctx.params.ma_mg) return ctx.params.ma_mg;
    var a = A();
    if (!a) return null;
    if (a.state && a.state.params && a.state.params.ma_mg) return a.state.params.ma_mg;
    if (a.user && a.user.ma_mg) return a.user.ma_mg;
    if (a.state && a.state.maMg) return a.state.maMg;
    return null;
  }
  function rowsKyCay(kyId, ctx) {
    var a = A();
    var ma = maMgXem(ctx);
    if (!a || typeof a.locTheoCay !== 'function' || !ma) return [];
    return a.locTheoCay(rowsKy(kyId), ma);
  }

  function phongList() {
    var a = A();
    if (a && typeof a.phongList === 'function') {
      try { var l = a.phongList(); if (Array.isArray(l) && l.length) return l; } catch (e) { /* đọc KPI */ }
    }
    return Array.isArray(K().phong) ? K().phong : [];
  }
  function phongTen(ma) {
    var l = phongList();
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].ma_phong === ma) return l[i].ten_phong || ma;
    var a = A();
    if (a && typeof a.tenPhong === 'function') { try { var t = a.tenPhong(ma); if (t) return t; } catch (e) { /* tự tìm */ } }
    return ma || DASH;
  }
  /* rút gọn tên phòng cho nhãn trục Y (giữ những phần khác nhau) */
  function phongTenNgan(ma) {
    var t = String(phongTen(ma) || ma || '');
    t = t.replace(/^Ph[oò]ng\s+/i, '').replace(/\s*Môi giới\s*/i, ' ').replace(/\s+/g, ' ').trim();
    return t || String(ma || DASH);
  }

  /* Phòng đang lọc: ưu tiên chip active của screen-khoi.js, sau đó select phòng,
     sau đó giá trị setPhong(), cuối cùng 'ALL'. */
  function currentPhong(root) {
    var d = doc();
    if (d && root) {
      var act = root.querySelector('[data-act="phong"].active');
      if (act) { var mp = act.getAttribute('data-phong'); if (mp) return mp; }
      var sel = root.querySelector('select[data-phong], select[name="phong"], select#sel-phong');
      if (sel && sel.value) return sel.value;
    }
    return phongFallback || 'ALL';
  }
  function setPhong(maPhong) {
    phongFallback = (maPhong === 'ALL' || !maPhong) ? null : maPhong;
    queue();
    return phongFallback || 'ALL';
  }
  function phongLabel(maPhong) {
    if (!maPhong || maPhong === 'ALL') return 'Tất cả phòng';
    return phongTen(maPhong);
  }

  /* ---------------------------------------------------------- điểm thật */
  /* Điểm của một môi giới: ưu tiên chi tiêu FKP (đã là ĐIỂM), dự phòng
     điểm phí + điểm lãi. Tuyệt đối không dùng tong_diem (đó là tỷ lệ). */
  function fkpDiem(r) {
    var list = (r && r.chi_tieu) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ma_chi_tieu === 'FKP' && isNum(list[i].gia_tri_thuc_te)) return list[i].gia_tri_thuc_te;
    }
    var c = (r && r.chi_tiet_tai_chinh) || {};
    if (isNum(c.diem_phi) || isNum(c.diem_lai)) return n(c.diem_phi) + n(c.diem_lai);
    return null;
  }
  function fkpChuan(r) {
    var list = (r && r.chi_tieu) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ma_chi_tieu === 'FKP' && isNum(list[i].chi_tieu_muc)) return list[i].chi_tieu_muc;
    }
    return null;
  }
  function diemPhi(r) { var c = (r && r.chi_tiet_tai_chinh) || {}; return isNum(c.diem_phi) ? c.diem_phi : 0; }
  function diemLai(r) { var c = (r && r.chi_tiet_tai_chinh) || {}; return isNum(c.diem_lai) ? c.diem_lai : 0; }
  function tyLe(r) { return (r && isNum(r.ty_le_hoan_thanh)) ? r.ty_le_hoan_thanh : null; }
  function xepLoai(r) { return String((r && r.xep_loai) || '').toUpperCase(); }

  function countXL(rows, g) {
    var c = 0;
    (rows || []).forEach(function (r) { if (xepLoai(r) === g) c++; });
    return c;
  }
  function sum(list, fn) {
    var t = 0, co = 0;
    (list || []).forEach(function (r) { var v = fn(r); if (isNum(v)) { t += v; co++; } });
    return { sum: t, co: co, tb: co ? t / co : null };
  }

  /* KHỐI A (donut cơ cấu xếp loại A/B/C/D) đã XÓA — trùng legend
     bảng "Môi giới trong khối" (blockBangMG) ở screen-khoi.js. */

  /* ================================================================ KHỐI B
   * % hoàn thành bình quân của từng phòng — ĐƠN VỊ % (khác đơn vị
   * điểm của bảng phòng, bổ sung thông tin mới cho bảng).
   * ---------------------------------------------------------------------- */
  function theoPhong(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      var ma = (r && r.ma_phong) || DASH;
      var o = map[ma] || (map[ma] = { ma: ma, ten: phongTenNgan(ma), tenDayDu: phongTen(ma), diem: 0, coDiem: 0, so: 0, coTyLe: 0, sumTyLe: 0, phi: 0, lai: 0 });
      o.so++;
      if (isNum(tyLe(r))) { o.coTyLe++; o.sumTyLe += tyLe(r); }
      var v = fkpDiem(r);
      if (isNum(v)) { o.diem += v; o.coDiem++; }
      o.phi += diemPhi(r);
      o.lai += diemLai(r);
    });
    return map;
  }
  function listPhong(rows) {
    var map = theoPhong(rows);
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  /* topPhong (sắp xếp theo điểm FKP) chỉ còn dùng bởi khối E;
     khối B sắp theo tỷ lệ hoàn thành bình quân ngay trong blockB. */
  function topPhong(rows, max) {
    var list = listPhong(rows);
    list.sort(function (a, b) { return b.diem - a.diem; });
    return list.slice(0, max);
  }
  function blockB(d) {
    var out = { id: 'khoi-ty-le-bq-phong', title: 'Tỷ lệ hoàn thành bình quân theo phòng', ok: false, data: null };
    var list = listPhong(d.rows).filter(function (p) { return p.coTyLe > 0; });
    list.sort(function (a, b) { return (b.sumTyLe / b.coTyLe) - (a.sumTyLe / a.coTyLe); });
    list = list.slice(0, MAX_PHONG_BAR);
    out.height = Math.max(180, Math.min(340, 70 + list.length * 42));
    if (!list.length) { out.emptyMsg = 'Chưa có môi giới nào có tỷ lệ hoàn thành trong phạm vi lọc.'; return out; }
    var vals = list.map(function (p) { return Math.round((p.sumTyLe / p.coTyLe) * 10000) / 100; });
    out.sub = 'Bình quân % hoàn thành của các môi giới trong phòng (đơn vị %) · ' +
      phongLabel(d.phong) + ' · kỳ ' + d.kyNhan;
    out.data = { labels: list.map(function (p) { return p.ten; }), values: vals };
    out.ok = vals.some(function (v) { return v > 0; });
    if (!out.ok) out.emptyMsg = 'Kỳ ' + d.kyNhan + ' chưa có tỷ lệ hoàn thành nào ở cấp phòng.';
    out.draw = function (c) {
      c.barNgang(out.id, out.data.labels, out.data.values, {
        label: 'Tỷ lệ hoàn thành bình quân', unit: '%', kind: 'pct',
        colorVar: '--chart-series-1', colorVar2: '--chart-series-2',
        maxTicks: 6, emptyMsg: out.emptyMsg,
        formatter: function (ctx) {
          var v = n(ctx.raw);
          return ' ' + (ctx.dataset.label || '') + ': ' + num(v, 1) + '% (' +
            (list[ctx.dataIndex] ? list[ctx.dataIndex].tenDayDu || list[ctx.dataIndex].ten : '') + ')';
        }
      });
    };
    return out;
  }

  /* KHỐI C (barLine diễn biến theo kỳ) đã XÓA — trùng bảng
     "Diễn biến 6 kỳ" (blockTrendKy, đã thêm sparkline cột Tổng điểm).
     Lọc cây đã được sửa ở đây trước khi xóa (P0). */

  /* ================================================================ KHỐI D
   * Phân bố tỷ lệ hoàn thành (histogram 5 khoảng).
   * ---------------------------------------------------------------------- */
  function blockD(d) {
    var out = { id: 'khoi-phan-bo-ty-le', title: 'Phân bố tỷ lệ hoàn thành', height: 240, ok: false, data: null };
    var rows = d.rows.filter(function (r) { return isNum(tyLe(r)); });
    if (!rows.length) {
      out.emptyMsg = 'Môi giới trong phạm vi lọc chưa có tỷ lệ hoàn thành để chia khoảng.';
      return out;
    }
    var labels = [], vals = [], vars = [];
    KHOANG.forEach(function (k) {
      labels.push(k.ten);
      vars.push(k.colorVar);
      vals.push(rows.filter(function (r) { var t = tyLe(r); return t >= k.lo && t < k.hi; }).length);
    });
    out.sub = 'Tỷ lệ hoàn thành của ' + n0(rows.length) + ' môi giới có số liệu · ' + phongLabel(d.phong);
    out.data = { labels: labels, values: vals, colorVars: vars, tyLeTB: sum(rows, tyLe).tb };
    out.ok = vals.some(function (v) { return v > 0; });
    if (!out.ok) out.emptyMsg = 'Chưa có môi giới nào rơi vào 5 khoảng tỷ lệ này.';
    out.draw = function (c) {
      c.bar(out.id, labels, [{ label: 'Số môi giới', data: vals, colorVar: '--chart-series-1' }], {
        unit: 'người', maxTicks: 6, emptyMsg: out.emptyMsg
      });
      paintBars(c, out.id, vars);
    };
    return out;
  }

  /* ================================================================ KHỐI E
   * Phí Net và lãi vay theo phòng (điểm) — thanh ngang xếp chồng.
   * ---------------------------------------------------------------------- */
  function blockE(d) {
    var out = { id: 'khoi-phi-lai-theo-phong', title: 'Phí Net và lãi vay theo phòng', ok: false, data: null };
    var all = listPhong(d.rows);
    all.sort(function (a, b) { return (b.phi + b.lai) - (a.phi + a.lai); });
    var list = all.slice(0, MAX_PHONG_STACK);
    out.height = Math.max(200, Math.min(340, 70 + list.length * 46));
    if (!list.length) { out.emptyMsg = 'Chưa có phòng nào có số liệu tài chính trong phạm vi lọc.'; return out; }
    var labels = list.map(function (p) { return p.ten; });
    var phi = list.map(function (p) { return Math.round(p.phi * 10) / 10; });
    var lai = list.map(function (p) { return Math.round(p.lai * 10) / 10; });
    out.sub = 'Điểm phí Net + điểm lãi vay · ' + phongLabel(d.phong) + ' · kỳ ' + d.kyNhan;
    out.data = { labels: labels, phi: phi, lai: lai };
    out.ok = phi.some(function (v) { return v > 0; }) || lai.some(function (v) { return v > 0; });
    if (!out.ok) out.emptyMsg = 'Kỳ ' + d.kyNhan + ' chưa có điểm phí / lãi ở cấp phòng.';
    out.draw = function (c) {
      c.bar(out.id, labels, [
        { label: 'Điểm phí Net', data: phi, colorVar: '--chart-series-1' },
        { label: 'Điểm lãi vay', data: lai, colorVar: '--chart-series-2' }
      ], { indexAxis: 'y', horizontal: true, stacked: true, maxTicks: 6, emptyMsg: out.emptyMsg });
    };
    return out;
  }

  /* ================================================================ KHỐI F
   * Điểm chuẩn vs thực tế cho top môi giới (bullet-style, 2 series).
   * ---------------------------------------------------------------------- */
  function blockF(d) {
    var out = { id: 'khoi-diem-chuan-thuc-te', title: 'Điểm chuẩn vs thực tế (top môi giới)', height: 300, ok: false, data: null };
    var list = d.rows.map(function (r) {
      return { r: r, thuc: fkpDiem(r), chuan: fkpChuan(r), ten: (r.ho_ten || r.ma_mg || DASH), ma: r.ma_mg };
    }).filter(function (x) { return isNum(x.thuc) && isNum(x.chuan); });
    list.sort(function (a, b) { return b.thuc - a.thuc; });
    list = list.slice(0, MAX_MG_BULLET);
    if (!list.length) {
      out.emptyMsg = 'Không có môi giới nào có cả điểm FKP thực tế lẫn điểm chuẩn ở kỳ ' + d.kyNhan + '.';
      return out;
    }
    var labels = list.map(function (x) {
      var tenRutGon = (x.ten && x.ten !== DASH) ? x.ten.split(' ').slice(-2).join(' ') : x.ma;
      return tenRutGon + ' (' + x.ma + ')';
    });
    var names = list.map(function (x) { return x.ten; });
    var thuc = list.map(function (x) { return x.thuc; });
    var chuan = list.map(function (x) { return x.chuan; });
    out.sub = 'Chi tiêu FKP: giá trị thực tế vs chỉ tiêu mức của ' + n0(list.length) +
      ' môi giới điểm cao nhất · ' + phongLabel(d.phong);
    out.data = { labels: labels, names: names, thuc: thuc, chuan: chuan };
    out.ok = thuc.some(function (v) { return v > 0; }) || chuan.some(function (v) { return v > 0; });
    if (!out.ok) out.emptyMsg = 'Điểm thực tế và điểm chuẩn đều bằng 0 ở kỳ ' + d.kyNhan + '.';
    out.draw = function (c) {
      c.bar(out.id, labels, [
        { label: 'FKP thực tế', data: thuc, colorVar: '--chart-series-1' },
        { label: 'FKP chỉ tiêu', data: chuan, colorVar: '--cam' }
      ], {
        unit: 'đ', maxTicks: 6, emptyMsg: out.emptyMsg,
        formatter: function (ctx) {
          var i = ctx.dataIndex, ds = ctx.dataset || {};
          var v = (ds.data && isNum(ds.data[i])) ? ds.data[i] : 0;
          return ' ' + (ds.label || '') + ': ' + n0(v) + ' đ (' + (names[i] || '') + ')';
        }
      });
    };
    return out;
  }

  /* Tô màu từng cột theo danh sách biến CSS (histogram khối D). */
  function paintBars(c, id, varNames) {
    try {
      var inst = c.get(id);
      if (!inst || !inst.data || !inst.data.datasets || !inst.data.datasets[0]) return;
      var css = c.cssVars();
      inst.data.datasets[0].backgroundColor = varNames.map(function (v) { return css[v] || v; });
      if (typeof inst.update === 'function') inst.update('none');
    } catch (e) { /* tô màu lỗi không được làm mất biểu đồ */ }
  }

  var _blocks = {
    B: blockB, D: blockD, E: blockE, F: blockF
  };

  /* ============================================================== khung HTML */
  function cardHTML(b) {
    var c = C();
    var head = '<div class="card-head"><div>' +
      '<div class="card-title">' + esc(b.title) + '</div>' +
      '<div class="card-sub">' + esc(b.sub || '') + '</div></div>';
    if (b.legend && b.legend.length) {
      head += '<div class="legend">';
      b.legend.forEach(function (l) {
        head += '<span class="legend-item ' + l.cls + '"><i class="legend-swatch"></i>' + esc(l.text) + '</span>';
      });
      head += '</div>';
    }
    head += '</div>';

    var body;
    if (!b.ok) {
      body = c.empty(b.emptyMsg || 'Chưa có số liệu để hiển thị.');
    } else {
      body = c.box(b.id, b.height);          /* title/sub đã nằm ở .card-head */
    }
    return '<div class="card">' + head + '<div class="card-body">' + body + '</div></div>';
  }

  function removeHost(root) {
    var old = root.querySelector('#' + HOST_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    return old;
  }

  function insertHost(root) {
    var d = doc();
    var host = d.createElement('section');
    host.id = HOST_ID;
    host.className = 'grid grid-2';
    host.setAttribute('style', 'margin-top:var(--sp-4)');
    host.setAttribute('aria-label', 'Biểu đồ tương tác tổng hợp khối');
    /* P2: host biểu đồ chèn NGAY SAU bảng "Môi giới trong khối"
       (marker .khoi-charts-after do screen-khoi.js render) — bảng
       tổng hợp được đọc trước, biểu đồ tương tác nằm phía dưới. */
    var marker = root.querySelector('.khoi-charts-after');
    if (marker && marker.parentNode) marker.parentNode.insertBefore(host, marker.nextSibling);
    else root.appendChild(host);
    return host;
  }

  /* ================================================================ AUGMENT */
  /* sec/ctx = đúng tham số ScreenKhoi.render nhận. Nhận luôn cả chuỗi id. */
  function augment(sec, ctx) {
    var d = doc();
    if (!d) return null;
    var root = typeof sec === 'string' ? d.getElementById(sec) : sec;
    if (!root) return null;
    var c = C();
    if (!c || typeof c.box !== 'function') {
      warn('chưa có charts.js — bỏ qua phần biểu đồ của MH04');
      return null;
    }
    try { c.destroyAll(); } catch (e) { warn('destroyAll lỗi', e); }

    var kyId = kyIdFromCtx(ctx);
    var maPhong = currentPhong(root);
    var d0 = {
      kyId: kyId,
      kyNhan: kyNhan(kyId),
      phong: maPhong,
      ctx: ctx,
      rows: filterPhong(rowsKyCay(kyId, ctx), maPhong)
    };

    removeHost(root);
    var host = insertHost(root);

    var made = [];
    for (var key in _blocks) {
      if (!Object.prototype.hasOwnProperty.call(_blocks, key)) continue;
      var b;
      try { b = _blocks[key](d0); } catch (e) { warn('khối ' + key + ' lỗi', e); continue; }
      if (!b) continue;
      b.key = key;
      var tmp = d.createElement('div');
      tmp.innerHTML = cardHTML(b);
      while (tmp.firstChild) host.appendChild(tmp.firstChild);
      made.push(b);
    }

    /* Vẽ SAU khi innerHTML xong (canvas phải nằm trong DOM mới mount được) */
    var ready = c.isReady();
    if (!ready) {
      made.forEach(function (b) {
        var body = host.querySelectorAll('.card-body')[made.indexOf(b)];
        if (body) body.innerHTML = c.empty('Thư viện biểu đồ (Chart.js) chưa nạp nên chưa vẽ được.');
      });
      warn('Chart.js chưa nạp — các khối biểu đồ hiện thông báo thay vì vẽ');
    } else {
      made.forEach(function (b) {
        if (!b.ok || typeof b.draw !== 'function') return;
        try { b.draw(c); } catch (e) { warn('vẽ khối ' + b.key + ' lỗi', e); }
      });
    }

    /* Số liệu thật để kiểm chứng / in ra console khi cần. */
    lastReport = {
      kyId: kyId, kyNhan: d0.kyNhan, phong: maPhong, soMoiGioi: d0.rows.length,
      canvas: made.filter(function (b) { return b.ok; }).map(function (b) { return b.id; }),
      blocks: made.map(function (b) { return { key: b.key, id: b.id, ok: b.ok, data: b.data }; })
    };
    host.setAttribute('data-khoi-charts', String(made.length));
    return host;
  }

  var lastReport = null;

  /* Vẽ lại sau khi DOM đã đổi (chip phòng, đổi kỳ) — gộp nhiều lần gọi. */
  function queue() {
    if (augQueued) return;
    augQueued = true;
    var run = function () {
      augQueued = false;
      try {
        var a = A();
        if (a && a.state && a.state.screen && a.state.screen !== 'khoi') return;
        augment(ROOT_ID, null);
      } catch (e) { warn('vẽ lại lỗi', e); }
    };
    var raf = global.requestAnimationFrame || function (f) { return global.setTimeout(f, 16); };
    try { raf(function () { global.setTimeout(run, 0); }); } catch (e) { global.setTimeout(run, 0); }
  }

  function refresh() { return augment(ROOT_ID, null); }

  /* ============================================================ nối vào app */
  /* Bọc hàm render của MH04: App.render() (đổi kỳ, đổi màn hình, back/forward)
     đi qua đây nên biểu đồ luôn được dựng lại đúng kỳ đang xem. */
  function wrapRender(orig) {
    return function (sec, ctx) {
      var el = typeof sec === 'string' ? doc().getElementById(sec) : sec;
      var out;
      try { out = orig(sec, ctx); }
      finally {
        try { augment(el || ROOT_ID, ctx); } catch (e) { warn('augment lỗi', e); }
      }
      return out;
    };
  }
  function hookApp() {
    var a = A();
    if (!a) return;
    /* 1) bọc hàm render của màn hình khoi */
    if (typeof a.registerScreen === 'function' && !global.__khoiChartHooked) {
      global.__khoiChartHooked = true;
      var cur = (a.screens && a.screens.khoi) || (global.ScreenKhoi && global.ScreenKhoi.render) || null;
      if (typeof cur === 'function') a.registerScreen('khoi', wrapRender(cur));
    }
    /* 2) nghe render/go của app (phòng vệ khi resolveScreen lấy đường khác) */
    if (typeof a.on === 'function' && !global.__khoiChartListened) {
      global.__khoiChartListened = true;
      ['render', 'go', 'ky'].forEach(function (evt) {
        try { a.on(evt, function () { queue(); }); } catch (e) { /* không quan trọng */ }
      });
    }
  }

  /* 3) nghe trực tiếp trong DOM: screen-khoi.js tự render lại bằng hàm nội bộ
        khi bấm chip phòng / sắp xếp, nên App.render() không chạy. */
  function bindDom() {
    var d = doc();
    if (!d || global.__khoiChartDom) return;
    global.__khoiChartDom = true;
    d.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      var hit = t.closest('#' + ROOT_ID + ' [data-act="phong"]');
      if (hit) { phongFallback = null; queue(); }   /* đọc lại từ chip active */
    }, true);
    d.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'SELECT') return;
      if (t.closest && t.closest('#' + ROOT_ID) &&
        (t.getAttribute('data-phong') || /phong/i.test((t.name || '') + ' ' + (t.id || '')))) {
        phongFallback = (t.value === 'ALL' || !t.value) ? null : t.value;
        queue();
      }
    }, true);
  }

  function boot() {
    bindDom();
    hookApp();
    queue();
  }

  /* ================================================================== EXPORT */
  global.KhoiChart = {
    augment: augment,
    refresh: refresh,
    setPhong: setPhong,
    phong: function () { return currentPhong(doc() ? doc().getElementById(ROOT_ID) : null); },
    report: function () { return lastReport; },
    _blocks: _blocks
  };
  global.KhoiChartAugment = augment;

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', boot);
    }
    try { boot(); } catch (e) { warn('boot lỗi', e); }
  }

})(window);
