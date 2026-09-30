/* =============================================================================
 * screen-hoahong-chart.js — PHẦN BIỂU ĐỒ cho MH05 "Hoảng hồng & PQL"
 * -----------------------------------------------------------------------------
 * Dùng: window.HHChart.augment(el, ctx)   — gọi TỪ screen-hoahong.js SAU khi
 *       innerHTML đã xong (canvas phải có trong DOM thì Chart.js mới mount được)
 *       window.HHChart.refresh()           — vẽ lại bằng dữ liệu hiện tại
 *
 * 2 BIỂU ĐỒ (id tiền tố 'hh-', KHÔNG trùng id của các màn khác):
 *   1) hh-cau-thu-nhap-thang — CỘT CHỒNG cơ cấu thu nhập theo THÁNG
 *        3 series: hoa_hong_phi_trieu / hoa_hong_dn_trieu / phi_quan_ly_trieu
 *        (window.HH.theo_thang[maMg][kyId] — schema doanh_thu_thang), bật legend
 *   2) hh-tang-giam-thang — BARLINE: cột = tổng thu nhập tháng,
 *        đường (y1) = tăng trưởng % so với tháng trước.
 *        Tháng đầu tiên KHÔNG có tháng trước → để null (trống), TUYỆT ĐỐI không
 *        điền 0 (0 sẽ bị đọc thành "giảm 100%").
 *
 * DỮ LIỆU window.HH CÓ THỂ CHƯA TỒN TẠI → mọi hàm bọc try/catch, không
 * để lỗi JS làm sập màn hình; gọi KPICharts.empty() để hiện trạng thái rỗng.
 * Màu: chỉ dùng TÊN BIẾN CSS (--chart-series-N) qua colorVar, charts.js tự
 * resolve qua cssVars() — không hardcode hex.
 * ========================================================================== */
(function (global) {
  'use strict';

  var C1 = 'hh-cau-thu-nhap-thang';
  var C2 = 'hh-tang-giam-thang';
  var DASH = '—';

  var lastEl = null, lastCtx = null;

  function A() { return global.App || null; }
  function C() { return global.KPICharts || null; }
  function HHD() { return global.HH || null; }
  function doc() { return global.document || null; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function warn(tag, e) {
    if (global.console && global.console.warn) console.warn('[hh-chart/' + tag + ']', e);
  }
  function r1(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }
  function r2(v) { return isNum(v) ? Math.round(v * 100) / 100 : null; }

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
  function kyIdXem(ctx) {
    if (ctx && ctx.kyId) return ctx.kyId;
    var a = A();
    if (a && typeof a.kyHienTaiId === 'function') { try { return a.kyHienTaiId(); } catch (e) { /* tự */ } }
    if (a && a.state) return a.state.kyId;
    return null;
  }

  /* window.HH.theo_thang[maMg][kyId]
   * DỮ LIỆU THẬT là OBJECT khoá theo tháng {"2026-09": {...}, "2026-10": {...}};
   * schema mô tả "mảng" nên vẫn chấp nhận cả mảng. Luôn trả MẢNG các object
   * doanh_thu_thang, đã sắp TĂNG DẦN theo tháng (tháng sau nằm bên phải). */
  function thang(maMg, kyId) {
    var h = HHD();
    if (!h || !h.theo_thang || !maMg) return [];
    var a = h.theo_thang[maMg];
    if (!a) return [];
    var v = a[kyId];
    var out = [];
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) if (v[i]) out.push(v[i]);
    } else if (v && typeof v === 'object') {
      var ks = [];
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && v[k]) ks.push(k);
      ks.sort();
      for (var j = 0; j < ks.length; j++) out.push(v[ks[j]]);
    }
    return out;
  }

  /* Nhãn tháng ngắn gọn: ưu tiên theo_ky.ky_nhan, thiếu thì dựng từ ky_id. */
  function nhanThang(t, idx) {
    if (t && t.thang) {
      var p = String(t.thang).split('-');
      return 'T' + (p.length === 2 ? p[1] : t.thang) + '/' + (p.length === 2 ? p[0].slice(2) : '');
    }
    if (t && t.ky_nhan) return String(t.ky_nhan);
    return 'T' + (idx + 1);
  }
  function val(t, f) { return (t && isNum(t[f])) ? t[f] : 0; }

  /* Có dữ liệu vẽ được không (tổng > 0) */
  function coSoLieu(tt) {
    if (!tt.length) return false;
    for (var i = 0; i < tt.length; i++) {
      if (val(tt[i], 'tong_thu_nhap_trieu') > 0) return true;
    }
    return false;
  }

  /* ====================================================== 1) CỘT CHỒNG theo tháng */
  function veCoCau(el) {
    var c = C();
    if (!c) return null;
    var maMg = maMgXem(lastCtx), kyId = kyIdXem(lastCtx);
    var tt = thang(maMg, kyId);

    if (!tt.length || !coSoLieu(tt)) {
      return c.bar(C1, [], [], { emptyMsg: 'Kỳ này chưa có dữ liệu doanh thu theo tháng để dựng cơ cấu thu nhập.' }) || null;
    }

    var labels = [], phi = [], dn = [], pql = [];
    for (var i = 0; i < tt.length; i++) {
      var t = tt[i];
      labels.push(nhanThang(t, i));
      phi.push(r2(val(t, 'hoa_hong_phi_trieu')));
      dn.push(r2(val(t, 'hoa_hong_dn_trieu')));
      pql.push(r2(val(t, 'phi_quan_ly_trieu')));
    }
    var tPhi = 0, tDn = 0, tPql = 0;
    for (var j = 0; j < tt.length; j++) { tPhi += phi[j]; tDn += dn[j]; tPql += pql[j]; }

    return c.bar(C1, labels, [
      { label: 'Hoa hồng phí giao dịch', colorVar: '--chart-series-1', data: phi },
      { label: 'Hoa hồng dư nợ',        colorVar: '--chart-series-2', data: dn },
      { label: 'Phí quản lý',           colorVar: '--chart-series-3', data: pql }
    ], {
      stacked: true,
      legend: true, legendPosition: 'bottom',
      unit: 'tr đ', decimals: 1, maxTicks: 6,
      maxBarThickness: 46,
      emptyMsg: 'Kỳ này chưa có dữ liệu doanh thu theo tháng.',
      formatter: function (ctx, api) {
        var s = (ctx && ctx.dataset && ctx.dataset.label) ? ctx.dataset.label : '';
        var v = (ctx && ctx.parsed && isNum(ctx.parsed.y)) ? ctx.parsed.y : 0;
        var tot = tPhi + tDn + tPql;
        var out = ' ' + s + ': ' + (api && api.n1 ? api.n1(v) : v) + ' triệu đ';
        if (tot > 0) out += '  (' + (api && api.pct ? api.pct(v / tot, 1) : '') + ')';
        return out;
      }
    });
  }

  /* ================================ 2) BARLINE tăng giảm theo tháng (có y1 %) */
  function veTangGiam(el) {
    var c = C();
    if (!c) return null;
    var maMg = maMgXem(lastCtx), kyId = kyIdXem(lastCtx);
    var tt = thang(maMg, kyId);

    if (!tt.length || !coSoLieu(tt)) {
      return c.barLine(C2, [], [], [], {
        emptyMsg: 'Kỳ này chưa có dữ liệu doanh thu theo tháng để so sánh tăng giảm.'
      }) || null;
    }

    var labels = [], bars = [], growth = [];
    for (var i = 0; i < tt.length; i++) {
      var t = tt[i];
      labels.push(nhanThang(t, i));
      bars.push(r1(val(t, 'tong_thu_nhap_trieu')));
      /* Tháng đầu: KHÔNG có tháng trước → null (trống), không phải 0 */
      if (i === 0) { growth.push(null); continue; }
      var truoc = val(tt[i - 1], 'tong_thu_nhap_trieu');
      var hien = val(t, 'tong_thu_nhap_trieu');
      if (truoc > 0 && hien > 0) growth.push(r2((hien - truoc) / truoc * 100));
      else growth.push(null);      /* mẫu số 0 → không chia, để trống */
    }

    return c.barLine(C2, labels,
      [{ label: 'Tổng thu nhập tháng', colorVar: '--chart-series-1', data: bars }],
      [{ label: 'Tăng trưởng so với tháng trước', colorVar: '--chart-series-2', data: growth, fill: false }],
      {
        unit: 'tr đ', decimals: 1, maxTicks: 6,
        legend: true, legendPosition: 'bottom',
        maxBarThickness: 44,
        emptyMsg: 'Kỳ này chưa có dữ liệu doanh thu theo tháng.',
        formatter: function (ctx, api) {
          var ds = (ctx && ctx.dataset) || {};
          var p = ctx && ctx.parsed;
          var y = p && isNum(p.y) ? p.y : (isNum(p) ? p : null);
          var nm = ds.label || '';
          if (y == null) return ' ' + nm + ': ' + DASH + ' (không có tháng trước)';
          if (ds.yAxisID === 'y1') {
            return ' ' + nm + ': ' + (y > 0 ? '+' : '') + (api && api.n1 ? api.n1(y) : y) + '%';
          }
          return ' ' + nm + ': ' + (api && api.n1 ? api.n1(y) : y) + ' triệu đ';
        }
      });
  }

  /* charts.js dùng CHUNG opts.unit cho cả trục trái (triệu đồng) và trục phải
   * y1 (%), nên nhãn trục y1 ra "300,0 tr đ" — sai đơn vị.
   *
   * KHÔNG sửa được qua options: Chart.js v4 bọc inst.options / inst.config bằng
   * proxy đệ quy, gán vào đó là "RangeError: Maximum call stack size exceeded"
   * (đã thử cả ticks.callback và scales.y1.setOptions). Cách an toàn: plugin
   * sửa NÃN của các tick đã dựng, chỉ áp cho canvas của MH05. Không sửa charts.js. */
  function vietNhanY1(inst) {
    var sc = inst && inst.scales ? inst.scales.y1 : null;
    if (!sc || !sc.ticks) return;
    for (var i = 0; i < sc.ticks.length; i++) {
      var t = sc.ticks[i];
      if (!t || typeof t.label !== 'string') continue;
      if (t.label.indexOf('%') >= 0) continue;
      t.label = t.label.replace(/\s*tr đ\s*$/i, '').replace(/\s*$/, '') + '%';
    }
  }

  var pctPlugin = {
    id: 'hhY1Pct',
    /* Sau mỗi lần dựng lại: nhãn tick bị Chart.js tính lại từ options.unit */
    afterUpdate: function (chart) {
      var cv = chart.canvas;
      if (!cv || cv.id !== C2) return;          /* CHỈ chart của MH05 */
      try { vietNhanY1(chart); } catch (e) { /* im lặng */ }
    }
  };

  function dangKyPlugin() {
    var g = global.Chart;
    if (!g || !g.register || global.__hhY1Plugin) return;
    global.__hhY1Plugin = true;
    try { g.register(pctPlugin); } catch (e) { /* Chart.js cũ không có register */ }
  }

  /* ================================================================ AUGMENT */
  function augment(el, ctx) {
    try {
      if (el && el.nodeType) lastEl = el;
      else if (typeof el === 'string') lastEl = doc() ? doc().getElementById(el) : null;
      else if (!el) lastEl = lastEl;
      if (ctx) lastCtx = ctx;

      var c = C();
      if (!c) return { ok: 0, reason: 'chưa có window.KPICharts' };
      if (typeof c.isReady === 'function' && !c.isReady()) return { ok: 0, reason: 'Chart.js chưa nạp' };
      dangKyPlugin();                    /* trục y1 phải hiện %, không phải triệu đồng */

      var maMg = maMgXem(lastCtx), kyId = kyIdXem(lastCtx);
      var tt = thang(maMg, kyId);

      /* Vai trò không phải môi giới (GĐTT, GĐ Khối) không có HH.theo_thang,
       * nên phần 4 trong screen-hoahong.js KHÔNG tạo canvas. Gọi veCoCau /
       * veTangGiam ở đây chỉ sinh cảnh báo "không tìm thấy canvas" — bỏ qua. */
      if (!tt.length) {
        return { ok: 0, err: 0, thang: 0, coSoLieu: false, ma_mg: maMg, kyId: kyId,
                 reason: 'không có dữ liệu theo tháng' };
      }
      var ok = 0, err = 0;

      /* 1) cột chồng cơ cấu thu nhập */
      try { if (veCoCau(lastEl)) ok++; } catch (e) { err++; warn('co-cau', e); }
      /* 2) barLine tăng giảm */
      try { if (veTangGiam(lastEl)) ok++; } catch (e) { err++; warn('tang-giam', e); }

      return { ok: ok, err: err, thang: tt.length, coSoLieu: coSoLieu(tt), ma_mg: maMg, kyId: kyId };
    } catch (e) {
      warn('augment', e);
      return { ok: 0, err: 1, reason: (e && e.message) || String(e) };
    }
  }

  function refresh() { return augment(lastEl, lastCtx); }

  /* Dọn 2 chart của MH05 mà KHÔNG đụng chart của màn khác. */
  function destroy() {
    var c = C();
    if (!c) return 0;
    var n = 0;
    var ids = [C1, C2];
    for (var i = 0; i < ids.length; i++) {
      try {
        var inst = (typeof c.get === 'function') ? c.get(ids[i]) : null;
        if (inst && typeof inst.destroy === 'function') { inst.destroy(); n++; }
      } catch (e) { /* không có chart */ }
    }
    return n;
  }

  global.HHChart = {
    augment: augment,
    refresh: refresh,
    destroy: destroy,
    ids: [C1, C2],
    _veCoCau: veCoCau,
    _veTangGiam: veTangGiam,
    _thang: thang
  };
  global.HHChartAugment = augment;

  /* Nghe App phát sự kiện để vẽ lại khi đổi kỳ / đổi người (best-effort). */
  /* Chỉ vẽ lại khi màn MH05 ĐANG MỞ. Hook bắt cả sự kiện 'render' của mọi
   * màn khác — nếu không có điều kiện này, augment() chạy lúc trang vừa nạp
   * (đang ở MH01) và charts.js cảnh báo "không tìm thấy canvas #hh-*". */
  function manDangMo() {
    /* id section của MH05 (xem ROOT_ID trong screen-hoahong.js) */
    var el = doc() ? doc().getElementById('screen-hoahong') : null;
    return !!(el && el.classList && el.classList.contains('active'));
  }

  function hookApp() {
    var a = global.App;
    if (!a || typeof a.on !== 'function' || global.__hhChartHooked) return;
    global.__hhChartHooked = true;
    ['render', 'go', 'ky', 'user'].forEach(function (evt) {
      try {
        a.on(evt, function () {
          if (!manDangMo()) return;
          setTimeout(function () { if (manDangMo()) refresh(); }, 0);
        });
      } catch (e) { /* App không có sự kiện này — bỏ qua */ }
    });
  }
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', hookApp);
    }
    hookApp();
  }

})(window);
