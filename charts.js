/* =============================================================================
 * charts.js — lớp bọc (wrapper) mỏng quanh Chart.js cho 4 màn hình
 * -----------------------------------------------------------------------------
 * Dùng: window.KPICharts.*
 *   cssVars() / bar() / barNgang() / donut() / line() / barLine() /
 *   destroyAll() / isReady() / box() / empty()
 *
 * Hợp đồng quan trọng:
 *  - KHÔNG tự gọi Chart lúc nạp file. Hàm vẽ chỉ chạy khi app.js gọi SAU khi
 *    đã innerHTML (canvas phải có trong DOM thì Chart mới mount được).
 *  - box() trả HTML, empty() trả HTML, các hàm vẽ trả chart instance (hoặc
 *    null + hiện .chart-empty khi không có dữ liệu).
 *  - Mọi màu đọc từ biến CSS của :root (theme tối + tím + cam) và đọc LẠI mỗi
 *    lần vẽ — không cache vĩnh viễn, đổi theme là biểu đồ tự theo kịp.
 *  - Mọi lời gọi Chart bọc try/catch: Chart.js hỏng không được làm sập màn hình.
 * ========================================================================== */
(function (global) {
  'use strict';

  var STYLE_ID = 'kpi-style-charts';
  var DASH = '—';
  var ANIM_MS = 400;

  /* Danh sách biến CSS cần đọc. Tên phải KHỚP :root trong style.css. */
  var VAR_NAMES = [
    '--text', '--muted', '--border', '--border-soft',
    '--brand', '--brand-2', '--cam', '--cam-2',
    '--a', '--b', '--c', '--d',
    '--chart-grid', '--chart-axis', '--focus-ring',
    '--chart-series-1', '--chart-series-2', '--chart-series-3',
    '--chart-series-4', '--chart-series-5', '--chart-series-6'
  ];

  /* Dự phòng khi style.css chưa kịp khai báo biến mới (theme đang chuyển) —
     biểu đồ vẫn phải vẽ được chứ không trắng xóa. */
  var FALLBACK = {
    '--text': '#ece9f7', '--muted': '#a49fbd', '--border': '#2f2a45',
    '--border-soft': '#241f36', '--brand': '#7c3aed', '--brand-2': '#a78bfa',
    '--cam': '#f59e0b', '--cam-2': '#fbbf24', '--a': '#22c55e', '--b': '#38bdf8',
    '--c': '#f59e0b', '--d': '#ef4444',
    '--chart-grid': '#241f36', '--chart-axis': '#a49fbd', '--focus-ring': '#a78bfa',
    '--chart-series-1': '#7c3aed', '--chart-series-2': '#f59e0b',
    '--chart-series-3': '#22d3ee', '--chart-series-4': '#f472b6',
    '--chart-series-5': '#a3e635', '--chart-series-6': '#818cf8'
  };

  /* Mảng instance + ResizeObserver để destroyAll() dọn sạch. */
  var REG = {};        /* id -> {inst, ro, box} */
  var COUNT = 0;

  /* ===================================================================== CSS
   * Chỉ bổ sung phần KHUNG (chart-box / chart-empty) mà style.css chưa chắc
   * đã có. Không khai lại màu/size — mọi màu lấy qua var() + fallback.
   * ===================================================================== */
  var CSS = [
    '.chart-box{position:relative;width:100%;min-width:0;}',
    '.chart-box > canvas{display:block;width:100%!important;height:100%!important;}',
    '.chart-box-head{margin:0 0 var(--sp-2,8px);}',
    '.chart-box-title{font-size:var(--fs-small,12px);font-weight:700;color:var(--text,#ece9f7);}',
    '.chart-box-sub{font-size:12px;color:var(--muted,#a49fbd);margin-top:4px;}',
    '.chart-empty{height:100%;min-height:90px;display:flex;align-items:center;',
    '  justify-content:center;gap:8px;padding:var(--sp-3,12px);text-align:center;',
    '  border:1px dashed var(--border,#2f2a45);border-radius:var(--radius-sm,6px);',
    '  background:var(--surface-2,rgba(255,255,255,.02));',
    '  color:var(--muted,#a49fbd);font-size:var(--fs-small,12px);line-height:1.5;}',
    '.chart-empty::before{content:"—";opacity:.6;}'
  ].join('');

  function injectStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var s = global.document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(global.document.createTextNode(CSS));
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  /* ============================================================== helpers */

  function hasDoc() { return !!global.document; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function n(v) { return isNum(v) ? v : 0; }

  function A() { return global.App || null; }

  function esc(s) {
    if (s === null || s === undefined) return DASH;
    var a = A();
    if (a && typeof a.esc === 'function') { try { return a.esc(s); } catch (e) { /* tự escape */ } }
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Số kiểu VN: 1.234.567,89 — ưu tiên App.fmtNum nếu app đã có. */
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
    return (neg ? '−' : '') + parts.join(',');
  }
  function n0(v) { return num(v, 0); }
  function n1(v) { return num(v, 1); }
  function n2(v) { return num(v, 2); }
  /* TỶ LỆ (0.66) → "66,0%" */
  function pct(v, d) {
    if (!isNum(v)) return DASH;
    return num(v * 100, d == null ? 1 : d) + '%';
  }

  /* ------------------------------------------- màu: đọc biến CSS mỗi lần vẽ */
  function cssVars() {
    var out = {};
    var i, name, cs = null;
    if (hasDoc() && global.getComputedStyle) {
      try { cs = global.getComputedStyle(global.document.documentElement); } catch (e) { cs = null; }
    }
    for (i = 0; i < VAR_NAMES.length; i++) {
      name = VAR_NAMES[i];
      var val = '';
      if (cs && typeof cs.getPropertyValue === 'function') {
        try { val = cs.getPropertyValue(name); } catch (e) { val = ''; }
      }
      val = String(val == null ? '' : val).trim();      /* bỏ khoảng trắng thừa */
      out[name] = val || FALLBACK[name] || '#7c3aed';
    }
    return out;
  }

  /* "#7c3aed" | "rgb(124,58,237)" | "rgba(...,0.5)" → rgba(...,alpha) */
  function withAlpha(color, alpha) {
    var c = String(color || '').trim();
    if (!c) return 'rgba(124,58,237,' + alpha + ')';
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length === 6) h += 'ff';
      if (h.length === 8) {
        var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        var a0 = parseInt(h.slice(6, 8), 16) / 255;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (a0 * alpha).toFixed(3) + ')';
      }
    }
    var m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var p = m[1].split(',');
      return 'rgba(' + p[0].trim() + ',' + p[1].trim() + ',' + p[2].trim() + ',' + alpha + ')';
    }
    return c;                                        /* không parse được → trả nguyên */
  }

  /* colorVar có thể là tên biến ('--chart-series-1') hoặc mảng màu/biến sẵn.
     Mảng phải resolve TỪNG PHẦN TỬ qua cssVars, nếu không Chart.js nhận
     nguyên chuỗi '--a' và vẽ ra màu rỗng (nền đen mặc định). */
  function colorList(colorVar, idx, css) {
    if (Array.isArray(colorVar)) {
      var cv = colorVar[idx] != null ? colorVar[idx] : colorVar[0];
      if (typeof cv === 'string' && cv.charAt(0) === '-' && css[cv]) return css[cv];
      return cv || css['--chart-series-1'];
    }
    if (typeof colorVar === 'string' && colorVar) return css[colorVar] || colorVar;
    return css['--chart-series-' + ((idx % 6) + 1)] || css['--chart-series-1'];
  }

  /* ======================================================== trạng thái sẵn sàng */

  function isReady() {
    return typeof global.Chart !== 'undefined' && global.Chart !== null;
  }

  function warn(msg, e) {
    if (global.console && global.console.warn) {
      global.console.warn('[charts] ' + msg + (e ? ': ' + ((e && e.message) || e) : ''));
    }
  }

  /* ================================================== defaults dùng chung */

  function applyDefaults(css, fontFamily) {
    var C = global.Chart;
    if (!C || !C.defaults) return;
    C.defaults.color = css['--chart-axis'];
    C.defaults.borderColor = css['--chart-grid'];
    if (!C.defaults.font) C.defaults.font = {};
    C.defaults.font.family = fontFamily || FALLBACK['--font'] ||
      '-apple-system,"Segoe UI",Tahoma,Roboto,Helvetica Neue,Arial,sans-serif';
    if (!isNum(C.defaults.font.size)) C.defaults.font.size = 11;
  }

  /* --font không phải màu nên đọc riêng (VAR_NAMES chỉ liệt kê biến màu). */
  function fontVar() {
    var f = FALLBACK['--font'] ||
      '-apple-system,"Segoe UI",Tahoma,Roboto,Helvetica Neue,Arial,sans-serif';
    if (hasDoc() && global.getComputedStyle) {
      try {
        var v = global.getComputedStyle(global.document.documentElement).getPropertyValue('--font');
        if (v && String(v).trim()) f = String(v).trim();
      } catch (e) { /* giữ dự phòng */ }
    }
    return f;
  }

  function baseOpts(css, opts) {
    var o = opts || {};
    var ff = fontVar();
    applyDefaults(css, ff);
    return {
      responsive: true,
      maintainAspectRatio: false,      /* BẮT BUỘC — không thì chart giãn phá layout */
      devicePixelRatio: 1,
      animation: { duration: ANIM_MS, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      resizeDelay: 80,
      plugins: {
        legend: {
          display: o.legend !== false,
          position: o.legendPosition || 'bottom',
          align: o.legendAlign || 'center',
          labels: {
            color: css['--chart-axis'],
            boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded',
            padding: 14, font: { family: fontVar(), size: 11 }
          }
        },
        tooltip: tooltipCfg(css, o)
      }
    };
  }

  function tooltipCfg(css, o) {
    return {
      enabled: true,
      backgroundColor: css['--surface-2'] || '#171327',
      titleColor: css['--text'],
      bodyColor: css['--text'],
      borderColor: css['--border'],
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      boxWidth: 10, boxHeight: 10,
      usePointStyle: true,
      titleFont: { family: fontVar(), size: 11.5, weight: '600' },
      bodyFont: { family: fontVar(), size: 11.5 },
      /* formatter truyền vào được ưu tiên tuyệt đối (app.js tự định nghĩa) */
      callbacks: { label: function (ctx) { return o.formatter ? o.formatter(ctx, api) : defaultLabel(ctx, o, api); } }
    };
  }

  /* Bộ công cụ truyền cho formatter của app.js — đủ dùng, không ép API Chart. */
  var api = {
    num: num, n0: n0, n1: n1, n2: n2, pct: pct, esc: esc,
    css: function (name) { return cssVars()[name] || FALLBACK[name] || ''; },
    alpha: withAlpha,
    dash: DASH
  };

  function fmtVal(v, o) {
    var unit = o.unit || '';
    if (o.kind === 'pct') return pct(v, o.decimals == null ? 1 : o.decimals);
    return num(v, o.decimals == null ? 0 : o.decimals) + (unit ? ' ' + unit : '');
  }

  /* Lấy giá trị số từ ctx mà không phụ thuộc loại chart:
     ctx.parsed = số (bar/doughnut) | {x,y} (line) | {x,y} (mixed)

     VỚI BAR NGANG (indexAxis 'y') Chart.js trả {x: giá trị, y: CHỈ SỐ MỤC}.
     Nếu lấy p.y thì tooltip in ra 0% cho mọi thanh — phải ưu tiên p.x.
     Điều này chỉ đúng khi người gọi truyền opts.indexAxis/horizontal. */
  function pickVal(ctx, o) {
    var p = ctx && ctx.parsed;
    if (isNum(p)) return p;
    if (p && typeof p === 'object') {
      var opt = o || {};
      var nganhGia = opt.indexAxis === 'y' || opt.horizontal === true;
      if (nganhGia) {
        if (isNum(p.x)) return p.x;
      } else if (isNum(p.y)) {
        return p.y;
      } else if (isNum(p.x)) {
        return p.x;
      }
    }
    var raw = ctx && ctx.raw;
    if (isNum(raw)) return raw;
    if (raw && !Array.isArray(raw)) {
      if (typeof raw === 'object') {
        var oo = o || {};
        var ng2 = oo.indexAxis === 'y' || oo.horizontal === true;
        if (isNum(ng2 ? raw.x : raw.y)) return ng2 ? raw.x : raw.y;
        if (isNum(ng2 ? raw.y : raw.x)) return ng2 ? raw.y : raw.x;
      }
    }
    if (Array.isArray(raw)) return n(raw[0]);
    if (raw && isNum(raw.y)) return raw.y;
    if (raw && isNum(raw.x)) return raw.x;
    return 0;
  }

  function defaultLabel(ctx, o) {
    var txt = fmtVal(pickVal(ctx, o), o);
    var name = (ctx && ctx.dataset && ctx.dataset.label) ? ctx.dataset.label : '';
    var out = name ? name + ': ' + txt : txt;
    var arr = (ctx && ctx.dataset && ctx.dataset.data) || [];
    if (o.showPercent && arr.length) {
      var tot = 0;
      for (var i = 0; i < arr.length; i++) tot += n(arr[i]);
      if (tot > 0) out += '  (' + pct(pickVal(ctx, o) / tot, 1) + ')';
    }
    return out;
  }

  function axisTicks(css, o) {
    var maxTicks = isNum(o.maxTicks) ? o.maxTicks : 6;
    return {
      color: css['--chart-axis'],
      font: { family: fontVar(), size: 10.5 },
      maxTicksLimit: maxTicks,
      padding: 6,
      callback: function (val, idx) {
        if (typeof val !== 'number') return val;
        if (o.tickValues && typeof o.tickValues[idx] === 'string') return o.tickValues[idx];
        return fmtVal(val, o);
      }
    };
  }

  function gridCfg(css, show) {
    return { color: css['--chart-grid'], drawTicks: false, drawBorder: false, display: show !== false };
  }

  /* ================================================= kiểm tra dữ liệu rỗng */

  function flatNums(datasets) {
    var out = [];
    for (var i = 0; i < (datasets || []).length; i++) {
      var d = (datasets[i] || {}).data;
      if (!Array.isArray(d)) continue;
      for (var j = 0; j < d.length; j++) if (isNum(Number(d[j]))) out.push(Number(d[j]));
    }
    return out;
  }
  function hasData(labels, datasets) {
    if (!Array.isArray(labels) || !labels.length) return false;
    if (!Array.isArray(datasets) || !datasets.length) return false;
    var v = flatNums(datasets);
    if (!v.length) return false;
    var sum = 0;
    for (var i = 0; i < v.length; i++) sum += Math.abs(v[i]);
    return sum > 0;                                   /* toàn 0 => coi như rỗng */
  }

  /* ==================================================== mount / teardown */

  function findCanvas(id) {
    if (!hasDoc() || !id) return null;
    return global.document.getElementById(id) || global.document.querySelector('#' + String(id));
  }

  /* Rời vùng chứa canvas (wrapper .chart-box hoặc cha) để hiện .chart-empty. */
  function showEmpty(id, msg) {
    var cv = findCanvas(id);
    if (!cv) return null;
    var host = cv.parentNode;
    if (host) {
      host.innerHTML = empty(msg);
      var b = REG[id];
      if (b) b.box = null;
    }
    return null;
  }

  function release(id) {
    var rec = REG[id];
    if (!rec) return;
    if (rec.ro) { try { rec.ro.disconnect(); } catch (e) { /* không có */ } }
    if (rec.inst) { try { rec.inst.destroy(); } catch (e) { /* đã destroy */ } }
    delete REG[id];
  }

  /* Tạo chart: dọn chart cũ của id trước (tránh "Canvas is already in use"),
   * rồi resize trong rAF + ResizeObserver để không vỡ khi container ẩn.
   * `extraPlugins` là mảng plugin NỘI BỘ — Chart.js chỉ nhận plugin inline qua
   * config.plugins[] (đặt trong options.plugins sẽ bị bỏ qua, không chạy). */
  function mount(id, type, data, options, extraPlugins) {
    if (!isReady()) { warn('Chart.js chưa nạp — bỏ qua biểu đồ ' + id); return null; }
    var cv = findCanvas(id);
    if (!cv) { warn('không tìm thấy canvas #' + id); return null; }
    release(id);
    var cfg = { type: type, data: data, options: options };
    if (extraPlugins && extraPlugins.length) cfg.plugins = extraPlugins;
    var inst;
    try {
      inst = new global.Chart(cv.getContext('2d'), cfg);
    } catch (e) {
      warn('tạo chart ' + id + ' lỗi', e);
      showEmpty(id, 'Không dựng được biểu đồ.');
      return null;
    }
    var rec = { inst: inst, ro: null, box: cv.parentNode };
    REG[id] = rec;
    COUNT++;

    /* Chart.js tự co theo khung nhưng canvas vừa mount trong khung ẩn (display:none
       / màn hình chưa bật) sẽ đo ra 0×0 → gọi resize ở khung hình kế tiếp. */
    var raf = global.requestAnimationFrame || function (f) { return global.setTimeout(f, 16); };
    raf(function () { try { inst.resize(); } catch (e) { /* bỏ qua */ } });

    if (typeof global.ResizeObserver === 'function' && rec.box) {
      try {
        rec.ro = new global.ResizeObserver(function () {
          try { if (inst && !inst._destroyed) inst.resize(); } catch (e) { /* bỏ qua */ }
        });
        rec.ro.observe(rec.box);
      } catch (e) { rec.ro = null; }
    }
    return inst;
  }

  /* ============================================================== 1) cssVars */
  /* Gọi lại mỗi lần vẽ — KHÔNG cache vĩnh viễn. */

  /* =========================================================== 2) bar chung */

  function bar(id, labels, datasets, opts) {
    var o = opts || {};
    var css = cssVars();
    if (!hasData(labels, datasets)) { showEmpty(id, o.emptyMsg || 'Chưa có số liệu để vẽ biểu đồ.'); return null; }

    var horizontal = o.horizontal === true || o.indexAxis === 'y';
    var list = (datasets || []).map(function (ds, i) {
      var col = colorList(ds.colorVar, i, css);
      return {
        label: ds.label || '',
        data: (ds.data || []).slice(),
        backgroundColor: col,
        borderWidth: 0,
        borderRadius: o.borderRadius == null ? 4 : o.borderRadius,
        borderSkipped: false,
        barPercentage: o.barPercentage == null ? 0.72 : o.barPercentage,
        categoryPercentage: o.categoryPercentage == null ? 0.78 : o.categoryPercentage,
        yAxisID: ds.yAxisID || 'y',
        maxBarThickness: o.maxBarThickness || 34
      };
    });

    var vOpt = baseOpts(css, o);
    vOpt.indexAxis = horizontal ? 'y' : 'x';
    /* min/max phải vào LÚC MOUNT. Nếu để người gọi gán inst.config.options
       rồi update('none'), Chart.js giữ thanh ở pixel của scale cũ còn
       getPixelForValue() đọc scale mới → thanh và vạch tham chiếu lệch nhau
       (biểu đồ "không chủ động co dãn"). */
    function gioi(oc) {
      if (!oc) return oc;
      if (isNum(o.min)) oc.min = o.min;
      if (isNum(o.max)) oc.max = o.max;
      if (isNum(o.stepSize)) { oc.ticks = oc.ticks || {}; oc.ticks.stepSize = o.stepSize; }
      if (isNum(o.maxTicksLimit)) { oc.ticks = oc.ticks || {}; oc.ticks.maxTicksLimit = o.maxTicksLimit; }
      return oc;
    }
    vOpt.scales = horizontal
      ? { x: { stacked: !!o.stacked, beginAtZero: true, ticks: axisTicks(css, o), grid: gridCfg(css, true) },
          y: { stacked: !!o.stacked, grid: { display: false } } }
      : { x: { stacked: !!o.stacked, grid: { display: false } },
          y: { stacked: !!o.stacked, beginAtZero: true, ticks: axisTicks(css, o), grid: gridCfg(css, true) } };
    vOpt.scales[horizontal ? 'x' : 'y'] = gioi(vOpt.scales[horizontal ? 'x' : 'y']);
    /* interaction cho phép GHI ĐÈ mặc định chung (mode:'index') khi biểu đồ
     * xếp chồng cần chỉ bật 1 thành phần. Không có dòng này thì o.interaction
     * bị bỏ qua và popup luôn gom mọi dataset. */
    if (o.interaction) vOpt.interaction = o.interaction;

    return mount(id, 'bar', { labels: labels, datasets: list }, vOpt);
  }

  /* ==================================================== 3) barNgang (top) */

  function barNgang(id, labels, values, opts) {
    var o = opts || {};
    var data = (values || []).map(function (v) { return isNum(Number(v)) ? Number(v) : 0; });
    if (!hasData(labels, [{ data: data }])) { showEmpty(id, o.emptyMsg || 'Chưa có số liệu để vẽ biểu đồ.'); return null; }

    var c1 = o.colorVar || '--chart-series-1';
    var c2 = o.colorVar2 || '--chart-series-2';
    var css = cssVars();
    var ds = {
      label: o.label || '',
      data: data,
      /* Gradient tím: đọc biến NGAY LÚC VẼ (scriptable) để đổi theme được */
      backgroundColor: function (c) {
        var v = cssVars();
        var a = c.chart.chartArea;
        if (!a) return v[c1] || v['--brand'];
        var g = c.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
        g.addColorStop(0, withAlpha(v[c1] || v['--brand'], 0.55));
        g.addColorStop(1, v[c2] || v['--cam'] || v['--brand-2']);
        return g;
      },
      hoverBackgroundColor: function () { var v = cssVars(); return v[c2] || v['--brand-2']; },
      borderRadius: o.borderRadius == null ? 4 : o.borderRadius,
      borderSkipped: false,
      maxBarThickness: o.maxBarThickness || 20
    };

    var vOpt = baseOpts(css, o);
    vOpt.indexAxis = 'y';
    vOpt.scales = {
      x: { beginAtZero: true, ticks: axisTicks(css, o), grid: gridCfg(css, true) },
      y: { grid: { display: false }, ticks: { color: css['--chart-axis'], font: { family: fontVar(), size: 11 }, crossAlign: 'far' } }
    };
    return mount(id, 'bar', { labels: labels, datasets: [ds] }, vOpt);
  }

  /* ============================================================== 4) donut */

  function donut(id, labels, values, opts) {
    var o = opts || {};
    var vals = (values || []).map(function (v) { return isNum(Number(v)) ? Number(v) : 0; });
    if (!hasData(labels, [{ data: vals }])) { showEmpty(id, o.emptyMsg || 'Chưa có số liệu để vẽ biểu đồ.'); return null; }

    var css = cssVars();
    var ds = {
      label: o.label || '',
      data: vals,
      backgroundColor: (labels || []).map(function (_, i) { return colorList(o.colorVar, i, css); }),
      borderColor: css['--surface'] || css['--surface-2'] || '#171327',
      borderWidth: o.borderWidth == null ? 2 : o.borderWidth,
      hoverOffset: o.hoverOffset == null ? 6 : o.hoverOffset,
      hoverBorderColor: css['--surface'] || '#171327'
    };

    var vOpt = baseOpts(css, o);
    vOpt.cutout = o.cutout || '62%';
    vOpt.radius = o.radius || '92%';
    vOpt.plugins.legend.position = o.legendPosition || 'right';   /* chú giải bên phải */
    vOpt.plugins.legend.align = o.legendAlign || 'center';
    vOpt.plugins.legend.labels.padding = 12;
    vOpt.animation.duration = ANIM_MS;
    vOpt.plugins.tooltip.callbacks.label = function (ctx) {
      var t = fmtVal(n(vals[ctx.dataIndex]), o);
      var tot = 0;
      for (var i = 0; i < vals.length; i++) tot += vals[i];
      return ' ' + String(ctx.label || '') + ': ' + t +
        (tot > 0 ? '  (' + pct(vals[ctx.dataIndex] / tot, 1) + ')' : '');
    };

    /* Chuỗi trung tâm — plugin NỘI BỘ phải nằm ở config.plugins[] (mount tự
     * gắn), không đặt trong options.plugins thì Chart.js không bao giờ gọi. */
    var plugins = [];
    if (o.centerText) {
      var cText = String(o.centerText);
      var cSub = o.centerSub ? String(o.centerSub) : '';
      var cCol = css['--text'], cSubCol = css['--muted'], ff = fontVar();
      plugins.push({
        id: 'kpiCenterText',
        afterDatasetsDraw: function (ch) {
          try {
            var meta = ch.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;
            var arc = meta.data[0], c2 = ch.ctx;
            if (!isNum(arc.x) || !isNum(arc.y)) return;
            c2.save();
            c2.textAlign = 'center';
            c2.textBaseline = 'middle';
            c2.fillStyle = cCol;
            c2.font = '700 19px ' + ff;
            c2.fillText(cText, arc.x, arc.y - (cSub ? 7 : 0));
            if (cSub) {
              c2.fillStyle = cSubCol;
              c2.font = '500 11px ' + ff;
              c2.fillText(cSub, arc.x, arc.y + 13);
            }
            c2.restore();
          } catch (e) { /* lỗi ở chữ trung tâm không được làm mất biểu đồ */ }
        }
      });
    }
    return mount(id, 'doughnut', { labels: labels, datasets: [ds] }, vOpt, plugins);
  }

  /* =============================================================== 5) line */

  function line(id, labels, datasets, opts) {
    var o = opts || {};
    var css = cssVars();
    if (!hasData(labels, datasets)) { showEmpty(id, o.emptyMsg || 'Chưa có số liệu để vẽ biểu đồ.'); return null; }

    var list = (datasets || []).map(function (ds, i) {
      var col = colorList(ds.colorVar, i, css);
      var first = i === 0;
      return {
        label: ds.label || '',
        data: (ds.data || []).slice(),
        borderColor: col,
        backgroundColor: (first || ds.fill) ? withAlpha(col, 0.16) : withAlpha(col, 0.06),
        borderWidth: o.borderWidth || 2.2,
        fill: first ? 'origin' : (ds.fill ? 'origin' : false),   /* chỉ series đầu có fill */
        tension: o.tension == null ? 0.32 : o.tension,
        pointRadius: o.pointRadius == null ? 3 : o.pointRadius,
        pointHoverRadius: o.pointHoverRadius == null ? 5 : o.pointHoverRadius,
        pointBackgroundColor: col,
        pointBorderColor: css['--surface'] || css['--surface-2'] || '#171327',
        pointBorderWidth: 2,
        pointHitRadius: 12,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        yAxisID: ds.yAxisID || 'y',
        spanGaps: true
      };
    });

    var vOpt = baseOpts(css, o);
    vOpt.interaction = { mode: 'index', intersect: false };
    vOpt.scales = {
      x: { grid: { display: false }, ticks: { color: css['--chart-axis'], font: { family: fontVar(), size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: isNum(o.maxTicks) ? o.maxTicks : 8 } },
      y: { beginAtZero: o.beginAtZero !== false, ticks: axisTicks(css, o), grid: gridCfg(css, true) }
    };
    return mount(id, 'line', { labels: labels, datasets: list }, vOpt);
  }

  /* =========================================================== 6) barLine */

  function barLine(id, labels, bars, lines, opts) {
    var o = opts || {};
    var css = cssVars();
    var bDs = (Array.isArray(bars) ? bars : [bars]).filter(Boolean);
    var lDs = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!hasData(labels, bDs.concat(lDs))) { showEmpty(id, o.emptyMsg || 'Chưa có số liệu để vẽ biểu đồ.'); return null; }

    var barDs = bDs.map(function (ds, i) {
      return {
        label: ds.label || '',
        data: (ds.data || []).slice(),
        backgroundColor: colorList(ds.colorVar || '--chart-series-1', i, css),
        borderRadius: 4, borderSkipped: false,
        barPercentage: 0.68, categoryPercentage: 0.74,
        maxBarThickness: o.maxBarThickness || 30,
        yAxisID: ds.yAxisID || 'y'
      };
    });
    var lineDs = lDs.map(function (ds, i) {
      var col = colorList(ds.colorVar || '--chart-series-2', i, css);
      return {
        label: ds.label || '',
        data: (ds.data || []).slice(),
        type: 'line',
        borderColor: col,
        backgroundColor: withAlpha(col, 0.14),
        borderWidth: 2.4,
        fill: ds.fill === false ? false : 'origin',
        tension: 0.32,
        pointRadius: 3, pointHoverRadius: 5,
        pointBackgroundColor: col,
        pointBorderColor: css['--surface'] || css['--surface-2'] || '#171327',
        pointBorderWidth: 2,
        pointHitRadius: 12,
        borderCapStyle: 'round',
        yAxisID: ds.yAxisID || 'y1',
        spanGaps: true
      };
    });

    var vOpt = baseOpts(css, o);
    vOpt.scales = {
      x: { grid: { display: false }, ticks: { color: css['--chart-axis'], font: { family: fontVar(), size: 10.5 }, maxRotation: 0, autoSkip: true } },
      y: {                                   /* trục trái — cột "kỳ trước" */
        position: 'left', beginAtZero: true,
        ticks: axisTicks(css, o), grid: gridCfg(css, true)
      },
      y1: {                                  /* trục phải — đường "kỳ này" */
        position: 'right', beginAtZero: o.beginAtZeroY1 !== false,
        grid: { display: false },
        ticks: { color: css['--chart-axis'], font: { family: fontVar(), size: 10.5 }, padding: 6, maxTicksLimit: isNum(o.maxTicks) ? o.maxTicks : 6,
          callback: function (v) { return fmtVal(v, o); } }
      }
    };
    return mount(id, 'bar', { labels: labels, datasets: barDs.concat(lineDs) }, vOpt);
  }

  /* ========================================================== 7) destroyAll */

  function destroyAll() {
    var ids = Object.keys(REG);
    for (var i = 0; i < ids.length; i++) release(ids[i]);
    REG = {};
    COUNT = 0;
    return ids.length;
  }

  function get(id) { return (REG[id] || {}).inst || null; }
  function count() { return Object.keys(REG).length; }

  /* ======================================================= 9) box / 10) empty */

  /* box(id, height, title, sub) — height số (px) hoặc chuỗi CSS ('260px', '45vh') */
  function box(id, height, title, sub) {
    injectStyle();
    var h = isNum(height) ? (height + 'px') : (height ? String(height) : '260px');
    var head = (title || sub)
      ? '<div class="chart-box-head">' +
        (title ? '<div class="chart-box-title">' + esc(title) + '</div>' : '') +
        (sub ? '<div class="chart-box-sub">' + esc(sub) + '</div>' : '') +
        '</div>'
      : '';
    var a11y = (title || sub)
      ? ' role="img" aria-label="' + esc(title || sub) + '"'
      : ' role="img" aria-label="Biểu đồ"';
    return head +
      '<div class="chart-box" style="height:' + h + '">' +
      '<canvas id="' + esc(id) + '"' + a11y + '></canvas>' +
      '</div>';
  }

  function empty(msg) {
    injectStyle();
    return '<div class="chart-empty">' + esc(msg || 'Chưa có số liệu để hiển thị.') + '</div>';
  }

  /* ================================================================== EXPORT */
  injectStyle();
  global.KPICharts = {
    cssVars: cssVars,
    bar: bar,
    barNgang: barNgang,
    donut: donut,
    line: line,
    barLine: barLine,
    destroyAll: destroyAll,
    isReady: isReady,
    box: box,
    empty: empty,
    /* phụ trợ (không bắt buộc) */
    get: get,
    count: count,
    api: api
  };
  global.KpiCharts = global.KPICharts;

})(window);
