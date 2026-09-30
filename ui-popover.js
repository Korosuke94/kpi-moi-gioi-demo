/* ==========================================================================
   UI-POPOVER — hệ thống popover / tooltip thống nhất cho demo KPI Môi giới
   --------------------------------------------------------------------------
   Mục đích: giấu mọi đoạn "diễn giải công thức" sau một ký hiệu nhỏ kiểu (i).
   Ký hiệu hiện popover khi RÊ CHUỘT **hoặc** khi BẤM (bắt buộc cả hai: hover
   không dùng được trên máy tính bản / thiết bị cảm ứng).

   Cách dùng (trong code vẽ màn hình):
       h.push('Tiêu đề ' + UIPop.tip('<b>Công thức:</b> (Thực tế ÷ Chỉ tiêu) × Trọng số',
                                      { label: 'Cách tính điểm nhóm', side: 'right' }));

   API (window.UIPop):
       UIPop.tip(noiDungHTML, opts)  -> chuỗi HTML của ký hiệu (i)
              opts = { label, cls, side:'top'|'bottom'|'left'|'right', width:320, id }
       UIPop.cssVars()               -> đọc getComputedStyle các biến màu của :root
       UIPop.hien(id) / UIPop.an(id) -> mở / đóng theo id (cho click-toggle)
       UIPop.closeAll()              -> đóng tất cả (đổi màn hình, click ra ngoài, Esc)
       UIPop.isOpen(id)              -> true/false
       UIPop.mount()                 -> gắn listener toàn cục đúng 1 LẦN (delegate)

   Ghi chú kỹ thuật:
     - Không thư viện ngoài. Một lớp CSS tự inject vào <head> (id: kpi-ui-popover),
       có kiểm tra getElementById trước nên gọi mount() bao nhiêu lần cũng an toàn.
     - Mọi màu lấy từ biến CSS của :root — KHÔNG hardcode hex.
     - Mọi lời gọi bọc try/catch: lỗi popover không được làm sập màn hình.
   ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  /* -------------------------------------------------------------- hằng số */

  var STYLE_ID   = 'kpi-ui-popover';
  var CLS_BTN    = 'kpi-tip';
  var CLS_POP    = 'kpi-pop';
  var CLS_FN     = 'kpi-fn';
  var HOVER_WAIT = 120;   /* ms: trễ đóng khi rê chuột rời cả nút lẫn popover */
  var PAD        = 8;     /* px: lề an toàn so với mép khung nhìn */
  var GAP        = 8;     /* px: khoảng cách nút <-> popover */
  var ARROW      = 6;     /* px: nửa cạnh mũi tên */
  var Z          = 2147483000;
  var OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  var SIDES = ['top', 'bottom', 'right', 'left'];

  var CSS = [
    /* ---- ký hiệu (i): chữ i trong vòng tròn viền mảnh, KHÔNG dùng emoji ---- */
    '.' + CLS_BTN + '{',
    '  display:inline-flex;align-items:center;justify-content:center;',
    '  width:16px;height:16px;min-width:16px;padding:0;margin:0 0 0 5px;',
    '  vertical-align:middle;line-height:1;',
    '  font-family:var(--font);font-size:10px;font-weight:700;',
    '  text-transform:uppercase;letter-spacing:0;',
    '  color:var(--muted);background:transparent;',
    '  border:1px solid var(--border-strong);border-radius:var(--radius-pill);',
    '  cursor:pointer;appearance:none;-webkit-appearance:none;',
    '  transition:color var(--tr),border-color var(--tr),background var(--tr);',
    '}',
    '.' + CLS_BTN + ':hover,' + '.' + CLS_BTN + '[aria-expanded="true"]' + '{',
    '  color:var(--cam);border-color:var(--cam);background:var(--cam-soft);',
    '}',
    '.' + CLS_BTN + ':focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}',
    '.' + CLS_BTN + '[aria-expanded="true"] + .' + CLS_POP + ' .kpi-pop-t{color:var(--cam-ink);}',

    /* ---- popover ---- */
    '.' + CLS_POP + '{',
    '  position:fixed;left:0;top:0;z-index:' + Z + ';',
    '  display:none;box-sizing:border-box;',
    '  width:320px;max-width:calc(100vw - ' + (PAD * 2) + 'px);',
    '  max-height:60vh;overflow:visible;overscroll-behavior:contain;',
    '  padding:0;',
    '  font-family:var(--font);font-size:var(--fs-small);line-height:var(--lh);',
    '  color:var(--text);text-align:left;',
    '  background:var(--surface-2);',
    '  border:1px solid var(--border-strong);',
    '  border-radius:var(--radius);',
    '  box-shadow:var(--shadow-pop);',
    '  --kpi-pop-pad:12px;',
    '}',
    '.' + CLS_POP + '[data-open="1"]{display:block;}',
    '.' + CLS_POP + '.kpi-pop-wide{width:min(420px,calc(100vw - ' + (PAD * 2) + 'px));}',

    /* ---- mũi tên: dùng cùng màu bề mặt + viền, không hardcode ---- */
    '.' + CLS_POP + '::after{',
    '  content:"";position:absolute;width:10px;height:10px;',
    '  background:var(--surface-2);',
    '  border-left:1px solid var(--border-strong);',
    '  border-top:1px solid var(--border-strong);',
    '  transform:rotate(45deg);',
    '}',
    '.' + CLS_POP + '[data-side="top"]::after{bottom:-5px;left:var(--kpi-pop-arrow,50%);margin-left:-5px;transform:rotate(225deg);}',
    '.' + CLS_POP + '[data-side="bottom"]::after{top:-5px;left:var(--kpi-pop-arrow,50%);margin-left:-5px;}',
    '.' + CLS_POP + '[data-side="left"]::after{right:-5px;top:var(--kpi-pop-arrow,50%);margin-top:-5px;transform:rotate(-45deg);}',
    '.' + CLS_POP + '[data-side="right"]::after{left:-5px;top:var(--kpi-pop-arrow,50%);margin-top:-5px;transform:rotate(135deg);}',
    /* mũi tên phải nằm trên nội dung */
    '.' + CLS_POP + '[data-side]::after{z-index:2;}',
    '.' + CLS_POP + '[data-side] > *{position:relative;z-index:1;}',

    '/* ---- nội dung bên trong (nội dung HTML do màn hình truyền vào) ---- */',
    /* vỏ popover overflow:visible để mũi tên ::after nhô ra được;
       phần cuộn nằm ở .kpi-pop-d bên trong. */
    '.' + CLS_POP + ' .kpi-pop-d{color:var(--text-soft);',
    '  max-height:var(--kpi-pop-max,60vh);overflow-y:auto;overscroll-behavior:contain;',
    '  padding:var(--sp-3) var(--sp-4);margin:0;}',
    '.' + CLS_POP + ' .kpi-pop-t{display:block;font-weight:700;font-size:var(--fs-small);',
    '  color:var(--cam-ink);margin:0;letter-spacing:.01em;',
    '  padding:var(--sp-3) var(--sp-4) 0;}',
    '.' + CLS_POP + ' p{margin:0 0 var(--sp-2);}',
    '.' + CLS_POP + ' p:last-child{margin-bottom:0;}',
    '.' + CLS_POP + ' b,.' + CLS_POP + ' strong{color:var(--text);font-weight:700;}',
    '.' + CLS_POP + ' .muted{color:var(--muted);}',
    '.' + CLS_POP + ' .small{font-size:var(--fs-small);}',
    '.' + CLS_POP + ' .neg{color:var(--d);}',
    '.' + CLS_POP + ' .pos{color:var(--a);}',
    '.' + CLS_POP + ' code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;',
    '  background:var(--surface-3);border:1px solid var(--border);',
    '  border-radius:var(--radius-sm);padding:1px 4px;color:var(--brand-ink);}',
    '.' + CLS_POP + ' ul,.' + CLS_POP + ' ol{margin:0 0 var(--sp-2);padding-left:18px;}',
    '.' + CLS_POP + ' li{margin:0 0 2px;}',
    '.' + CLS_POP + ' table{width:100%;border-collapse:collapse;font-size:var(--fs-small);}',
    '.' + CLS_POP + ' th,.' + CLS_POP + ' td{padding:3px 6px;border-bottom:1px solid var(--border-soft);',
    '  text-align:left;vertical-align:top;}',
    '.' + CLS_POP + ' th{color:var(--muted);font-weight:600;white-space:nowrap;}',
    '.' + CLS_POP + ' td.num,.' + CLS_POP + ' th.num{text-align:right;font-variant-numeric:tabular-nums;}',
    '/* ---- .pop-h / .pop-f: tiêu đề + dòng công thức trong popover ---- */',
    '.' + CLS_POP + ' .pop-h{font-weight:700;color:var(--text);margin:0 0 6px;',
    '  padding-bottom:5px;border-bottom:1px solid var(--border-soft);font-size:13.5px;}',
    '.' + CLS_POP + ' .pop-f{margin:0 0 6px;color:var(--text-soft);font-size:12.5px;line-height:1.55;}',
    '.' + CLS_POP + ' .pop-f:last-child{margin-bottom:0;}',
    '.' + CLS_POP + ' .pop-f b{color:var(--cam-ink);font-weight:700;}',
    '/* ---- .kpi-fn: dòng chữ nhỏ + ký hiệu (i), thay cho <div class="card-sub"> ---- */',
    '.' + CLS_FN + '{',
    '  display:inline-flex;align-items:center;flex-wrap:wrap;gap:0 2px;',
    '  font-size:var(--fs-small);line-height:var(--lh);color:var(--muted);',
    '  margin:0;',
    '}',
    '.' + CLS_FN + ' .' + CLS_BTN + '{margin:0 0 0 4px;vertical-align:middle;}',
    '.' + CLS_FN + ' .' + CLS_BTN + '{width:14px;height:14px;min-width:14px;',
    '  font-size:9px;border-color:var(--border-strong);}',

    '@media (prefers-reduced-motion:reduce){.' + CLS_BTN + '{transition:none;}}'
  ].join('');

  /* ------------------------------------------------------------ trạng thái */

  var REG   = {};   /* id -> { btn, pop, body, side, width, label, open, pinned, timer } */
  var seq   = 0;
  var mounted = false;

  function doc_() { return global.document; }

  function injectStyle() {
    try {
      var d = doc_();
      if (!d) return false;
      if (d.getElementById(STYLE_ID)) return true;
      var s = d.createElement('style');
      s.id = STYLE_ID;
      s.setAttribute('type', 'text/css');
      s.appendChild(d.createTextNode(CSS));
      (d.head || d.documentElement).appendChild(s);
      return true;
    } catch (e) { return false; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ============================================================ 1. CSS VARS */

  var VAR_LIST = ['bg', 'surface', 'surface-2', 'surface-3', 'text', 'muted', 'text-soft',
    'border', 'border-soft', 'border-strong', 'brand', 'brand-2', 'brand-ink', 'brand-soft',
    'brand-line', 'cam', 'cam-2', 'cam-ink', 'cam-soft', 'cam-line', 'a', 'b', 'c', 'd',
    'a-soft', 'b-soft', 'c-soft', 'd-soft', 'on-dark', 'on-bright', 'shadow-1', 'shadow-2',
    'shadow-pop', 'radius', 'radius-sm', 'radius-pill', 'sp-1', 'sp-2', 'sp-3', 'sp-4',
    'sp-5', 'sp-6', 'sp-7', 'fs-root', 'fs-table', 'fs-small', 'lh', 'tr', 'focus-ring',
    'chart-grid', 'chart-axis'];

  /**
   * Đọc giá trị thực tế của các biến màu trong :root.
   * @returns {Object} { '--bg': '#0e0b16', ... } hoặc { error } nếu không đọc được.
   */
  function cssVars() {
    var out = {};
    try {
      var d = doc_();
      var cs = global.getComputedStyle(d.documentElement);
      for (var i = 0; i < VAR_LIST.length; i++) {
        var v = cs.getPropertyValue('--' + VAR_LIST[i]);
        if (v) out['--' + VAR_LIST[i]] = String(v).trim();
      }
      out.__ok = true;
      return out;
    } catch (e) {
      out.__ok = false;
      out.__error = (e && e.message) ? e.message : String(e);
      return out;
    }
  }

  /* ============================================================== 2. tip() */

  function normSide(s) { return OPP[s] ? s : 'top'; }

  /* Chỉ nhận chuỗi là độ dài CSS hợp lệ; rác -> rơi về mặc định 320px
     (width sai sẽ làm popover vỡ layout, không được phép lọt vào CSS). */
  var W_RE = /^\s*(auto|min-content|max-content|\d*\.?\d+(px|em|rem|%|vh|vw|vmin|vmax|ch|ex|pt|pc|in|cm|mm)?|min\(.+\)|max\(.+\)|clamp\(.+\)|calc\(.+\))\s*$/i;

  function normWidth(w) {
    try {
      if (typeof w === 'number' && isFinite(w)) return clamp(w, 160, 900) + 'px';
      if (typeof w === 'string' && W_RE.test(w)) return w;
      return '320px';
    } catch (e) { return '320px'; }
  }

  /**
   * Tạo chuỗi HTML của ký hiệu (i).
   * @param {string} noiDungHTML nội dung hiển thị trong popover
   * @param {Object} [opts] {label, cls, side, width, id}
   * @returns {string} HTML <button class="kpi-tip" ...>
   */
  function tip(noiDungHTML, opts) {
    return makeTip(noiDungHTML, null, opts);
  }

  /**
   * Giống tip() nhưng nội dung popover do callback dựng LẦN ĐẦU khi mở.
   * @param {function} fx  function(bodyEl){ bodyEl.innerHTML = '...' }
   *                      hoặc gán bodyEl.__html / __label / __width / __side
   * @param {Object} [opts] giống tip()
   * @returns {string} HTML <button class="kpi-tip" ...>
   */
  function tipDeferred(fx, opts) {
    if (typeof fx !== 'function') fx = function (b) { b.__html = ''; };
    return makeTip(null, fx, opts);
  }

  function makeTip(noiDungHTML, fx, opts) {
    try {
      var o = opts || {};
      var id  = o.id ? String(o.id) : ('kpi-tip-' + (++seq));
      var side = normSide(o.side);
      var width = normWidth(o.width);
      var label = o.label ? String(o.label) : 'Xem cách tính';
      var cls = CLS_BTN + (o.cls ? ' ' + String(o.cls) : '');

      REG[id] = {
        id: id, body: noiDungHTML == null ? '' : String(noiDungHTML),
        side: side, width: width, label: label,
        fx: fx || null, fxDone: false,
        btn: null, pop: null, open: false, pinned: false, timer: null
      };

      /* aria-label chứa CHÍNH nhãn "Cách tính"/"Cách đọc" mà người dùng thấy
         cạnh ký hiệu, đạt WCAG 2.5.3 (Label in Name); title chỉ là tooltip
         dự phòng cho trình duyệt cũ, không phải tên truy cập được. */
      var accName = o.accName ? String(o.accName) : '';
      if (!accName && o.inlineText) accName = String(o.inlineText);
      if (!accName) accName = 'Xem cách tính';
      return '<button type="button" class="' + esc(cls) + '"'
        + ' data-kpi-tip="' + esc(id) + '"'
        + ' data-tip-side="' + esc(side) + '"'
        + ' data-tip-width="' + esc(width) + '"'
        + ' aria-expanded="false"'
        + ' aria-label="' + esc(accName) + '"'
        + ' title="' + esc(label) + '">i</button>';
    } catch (e) {
      /* Không được làm sập màn hình: trả về chuỗi rỗng an toàn. */
      return '';
    }
  }

  /**
   * Một dòng chữ nhỏ kèm ký hiệu (i) — thay thế cho <div class="card-sub">.
   * @param {string} noiDungHTML nội dung dự kiến hiện trong popover
   * @param {Object} [opts] giống tip(), thêm {inlineHTML} = nội dung hiện ngay
   *        trên dòng (mặc định rỗng -> chỉ hiện nút (i)).
   * @returns {string} HTML <span class="kpi-fn">…<button class="kpi-tip">i</button></span>
   */
  function footnote(noiDungHTML, opts) {
    try {
      var o = opts || {};
      var text = o.inlineHTML ? String(o.inlineHTML) : '';
      /* accName = chữ người dùng thấy, để WCAG 2.5.3 đúng và screen reader
         đọc liền mạch "Cách tính, nút, Xem cách tính". */
      var inlineText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      var oo = Object.assign({}, o);
      if (inlineText) oo.accName = inlineText;
      var b = tip(noiDungHTML, oo);
      if (!b) return '';
      return '<span class="' + CLS_FN + '">' + text + b + '</span>';
    } catch (e) { return ''; }
  }

  /**
   * Quét một phần tử gốc, nối mọi phần tử mang data-kpi-tip vào registry.
   * Dùng cho HTML sinh động / HTML viết tay ngoài UIPop.tip():
   *   <button class="kpi-tip" data-kpi-tip="x" data-tip-content="<b>Công thức</b>…"
   *           data-tip-side="right" data-tip-width="300" title="Nhãn">i</button>
   * Phần tử đã do tip()/footnote() sinh ra thì chỉ nối, không ghi đè nội dung.
   * @param {Element|Document} [root] mặc định document.body
   * @returns {number} số ký hiệu đã nối thành công
   */
  function bind(root) {
    var n = 0;
    try {
      injectStyle();
      var r = root || doc_().body || doc_();
      if (!r || !r.querySelectorAll) return 0;
      var list = r.querySelectorAll('[data-kpi-tip]');
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (!el || el.getAttribute('data-kpi-tip') === null) continue;
        var id = String(el.getAttribute('data-kpi-tip'));
        if (!id) continue;
        if (!REG[id]) {
          /* Chưa ai khai báo: tự tạo bản ghi từ thuộc tính trên thẻ. */
          var lb = el.getAttribute('title') || el.getAttribute('aria-label') || 'Xem cách tính';
          REG[id] = {
            id: id,
            body: el.getAttribute('data-tip-content') || '',
            side: normSide(el.getAttribute('data-tip-side') || 'top'),
            width: normWidth(el.getAttribute('data-tip-width')),
            label: String(lb),
            fx: null, fxDone: false,
            btn: el, pop: null, open: false, pinned: false, timer: null
          };
        }
        if (entryFromEl(el)) n++;
      }
      return n;
    } catch (e) { return n; }
  }

  /* ================================================== 3. tạo / gắn popover */

  function entryFromEl(el) {
    try {
      if (!el) return null;
      var id = el.getAttribute('data-kpi-tip');
      if (!id) return null;
      var e = REG[id];
      if (!e) return null;
      e.btn = el;
      /* Cập nhật tuỳ chọn từ thuộc tính nếu màn hình vẽ lại với giá trị khác. */
      var s = el.getAttribute('data-tip-side');
      if (s) e.side = normSide(s);
      var w = el.getAttribute('data-tip-width');
      if (w) e.width = normWidth(w);
      var l = el.getAttribute('title');
      if (l) e.label = l;
      return e;
    } catch (err) { return null; }
  }

  function ensurePop(e) {
    var d = doc_();
    if (e.pop && e.pop.parentNode) return e.pop;
    if (!d.body) return null;
    var pop = d.createElement('div');
    pop.className = CLS_POP;
    pop.id = 'kpi-pop-' + e.id;
    pop.setAttribute('role', 'tooltip');
    pop.setAttribute('data-kpi-for', e.id);
    pop.setAttribute('data-open', '0');
    pop.style.zIndex = String(Z);
    d.body.appendChild(pop);
    e.pop = pop;
    return pop;
  }

  function fillPop(e) {
    var pop = ensurePop(e);
    if (!pop) return null;
    /* Nội dung trì hoãn: chạy callback LẦN ĐẦU khi mở, ghi thẳng vào bodyEl. */
    if (e.fx && !e.fxDone) {
      try {
        var box = d_create();
        e.fxDone = true;                 /* đánh dấu trước để lỗi không gây lặp vô hạn */
        e.fx(box);
        var lbl = box.__label ? String(box.__label) : null;
        if (lbl) e.label = lbl;
        var w = box.__width ? normWidth(box.__width) : null;
        if (w) e.width = w;
        var sd = box.__side ? normSide(box.__side) : null;
        if (sd) e.side = sd;
        /* Callback được dùng theo 2 cách: gán bodyEl.innerHTML, hoặc gán
           bodyEl.__html. Ưu tiên __html, thiếu thì lấy innerHTML. */
        var bh = (box.__html == null || box.__html === '') ? box.innerHTML : box.__html;
        e.body = bh == null ? '' : String(bh);
      } catch (err) {
        e.body = '<span class="muted">Không tải được diễn giải.</span>';
      }
    }
    /* Tiêu đề tự thêm chỉ dùng khi nội dung truyền vào CHƯA có heading riêng
       (màn hình thường tự viết <div class="pop-h">Cách tính …</div>).
       Nếu không kiểm tra, popover hiện hai tiêu đề chồng nhau. */
    var coHeading = /class="[^"]*\bpop-h\b/.test(e.body) ||
                    /<h[1-4][\s>]/.test(e.body);
    var parts = [];
    if (!coHeading) {
      parts.push('<span class="kpi-pop-t">' + esc(e.label) + '</span>');
    }
    parts.push('<div class="kpi-pop-d">' + e.body + '</div>');
    var h = parts.join('');
    if (pop.__html !== h) { pop.innerHTML = h; pop__html_set(pop, h); }
    if (coHeading) { pop.setAttribute('data-notitle', '1'); }
    else { pop.removeAttribute('data-notitle'); }
    pop.style.width = normWidth(e.width);      /* lọc lại: không lọt CSS rác */
    return pop;
  }

  function d_create() {
    var d = doc_();
    var box = d.createElement('div');
    box.__html = ''; box.__label = null; box.__width = null; box.__side = null;
    return box;
  }

  function pop__html_set(pop, h) { try { pop.__html = h; } catch (e) { /* ignore */ } }

  /* ================================================ 4. định vị + tự đảo chiều */

  function place(e) {
    try {
      var d = doc_();
      var pop = e.pop, btn = e.btn;
      if (!pop || !btn || !btn.getBoundingClientRect) return;

      var vw = global.innerWidth || d.documentElement.clientWidth || 0;
      var vh = global.innerHeight || d.documentElement.clientHeight || 0;
      if (!vw || !vh) return;

      var side = normSide(e.side);
      var pw, ph, br;

      /* Đo 1 vòng ở side gốc để biết kích thước, rồi thử lần lượt các chiều. */
      pop.setAttribute('data-side', side);
      pop.setAttribute('data-open', '1');
      pop.style.left = '0px';
      pop.style.top = '0px';
      pop.style.maxHeight = Math.max(140, vh - PAD * 2) + 'px';
      pop.style.width = normWidth(e.width);  /* lọc lại: không lọt CSS rác */
      br = btn.getBoundingClientRect();
      pw = pop.offsetWidth || 320;
      ph = pop.offsetHeight || 0;

      var cand = [side, OPP[side], 'bottom', 'top', 'right', 'left'];
      var best = null, bestArea = -1;
      for (var i = 0; i < cand.length; i++) {
        var s = cand[i];
        if (SIDES.indexOf(s) < 0) continue;
        var pos = calc(s, br, pw, ph, vw, vh);
        if (pos.ok) { best = { s: s, pos: pos }; break; }
        var area = pos.room;
        if (area > bestArea) { bestArea = area; }
      }
      if (!best) best = { s: side, pos: calc(side, br, pw, ph, vw, vh) };

      side = best.s;
      pos = best.pos;
      pop.setAttribute('data-side', side);
      pop.setAttribute('data-open', '1');
      var maxH = Math.max(140, Math.min(vh - PAD * 2, pos.maxH));
      pop.style.maxHeight = maxH + 'px';
      /* vỏ overflow:visible (để mũi tên nhô ra), nên phần cuộn ở .kpi-pop-d
         phải nhận cùng giới hạn chiều cao trừ phần đệm + tiêu đề. */
      pop.style.setProperty('--kpi-pop-max', Math.max(120, maxH - 26) + 'px');
      pop.style.left = clamp(pos.left, PAD, Math.max(PAD, vw - PAD - pw)) + 'px';
      pop.style.top = clamp(pos.top, PAD, Math.max(PAD, vh - PAD - ph)) + 'px';

      /* Vị trí mũi tên: neo theo cạnh đã đảo. */
      var cxp = clamp(br.left + br.width / 2 - (parseFloat(pop.style.left) || 0), ARROW + 4, pw - ARROW - 4);
      var cyp = clamp(br.top + br.height / 2 - (parseFloat(pop.style.top) || 0), ARROW + 4, ph - ARROW - 4);
      pop.style.setProperty('--kpi-pop-arrow',
        (side === 'top' || side === 'bottom' ? (cxp - (parseFloat(pop.style.left) || 0)) + 'px'
          : (cyp - (parseFloat(pop.style.top) || 0)) + 'px'));
    } catch (e) { /* im lặng: lỗi định vị không được phá vỡ màn hình */ }
  }

  function calc(s, br, pw, ph, vw, vh) {
    var room = 0, maxH = vh - PAD * 2, left = 0, top = 0;
    if (s === 'top' || s === 'bottom') {
      var needY = ph + GAP;
      if (s === 'top')      { room = br.top - PAD - GAP;       top = br.top - GAP - ph; }
      else                  { room = vh - br.bottom - PAD - GAP; top = br.bottom + GAP; }
      maxH = (s === 'top' ? br.top - PAD * 2 - GAP : vh - br.bottom - PAD * 2 - GAP);
      left = br.left + br.width / 2 - pw / 2;
      var okW = (left >= PAD - 0.5) && (left + pw <= vw - PAD + 0.5);
      var okH = (room >= Math.min(needY, 120)) || (room >= 60 && maxH >= 60);
      if (!okW) { left = clamp(left, PAD, Math.max(PAD, vw - PAD - pw)); }
      return { ok: okH && (left >= PAD - 0.5) && (left + pw <= vw - PAD + 0.5),
               left: left, top: top, room: room, maxH: maxH };
    }
    /* left / right */
    var roomX = (s === 'left') ? br.left - PAD - GAP : vw - br.right - PAD - GAP;
    var okX = roomX >= Math.min(pw, 200);
    var cx = (s === 'left') ? br.left - GAP - pw : br.right + GAP;
    var cy = br.top + br.height / 2 - ph / 2;
    cy = clamp(cy, PAD, Math.max(PAD, vh - PAD - ph));
    maxH = vh - PAD * 2;
    return { ok: okX, left: cx, top: cy, room: roomX, maxH: maxH };
  }

  /* ========================================================= 5. mở / đóng */

  function syncAria(e, open) {
    if (!e.btn) return;
    try {
      e.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      e.btn.setAttribute('aria-controls', 'kpi-pop-' + e.id);
      if (open) e.btn.setAttribute('aria-describedby', 'kpi-pop-' + e.id);
      else e.btn.removeAttribute('aria-describedby');
    } catch (err) { /* ignore */ }
  }

  function hien(id, opts) {
    try {
      var e = typeof id === 'string' ? REG[id] : (id && id.id ? id : entryFromEl(id));
      if (!e) return false;
      if (e.timer) { global.clearTimeout(e.timer); e.timer = null; }
      if (!e.btn) return false;
      if (!e.btn.getAttribute('data-kpi-tip')) e.btn.setAttribute('data-kpi-tip', e.id);
      if (opts && opts.pinned) e.pinned = true;
      var pop = fillPop(e);
      if (!pop) return false;
      if (!e.open) { e.open = true; }
      syncAria(e, true);
      place(e);
      return true;
    } catch (err) { return false; }
  }

  function an(id) {
    try {
      var e = typeof id === 'string' ? REG[id] : (id && id.id ? id : entryFromEl(id));
      if (!e) return false;
      if (e.timer) { global.clearTimeout(e.timer); e.timer = null; }
      if (e.pop) e.pop.setAttribute('data-open', '0');
      e.open = false;
      e.pinned = false;
      syncAria(e, false);
      return true;
    } catch (err) { return false; }
  }

  function isOpen(id) {
    try {
      var e = typeof id === 'string' ? REG[id] : (id && id.id ? id : REG[id]);
      return !!(e && e.open);
    } catch (err) { return false; }
  }

  /** Đóng tất cả; dọn luôn các bản ghi đã bị tháo khỏi DOM. */
  function closeAll() {
    try {
      for (var id in REG) {
        if (!Object.prototype.hasOwnProperty.call(REG, id)) continue;
        var e = REG[id];
        if (!e) continue;
        /* Chỉ dọn khi nút THẬT SỰ rở khỏi DOM. Bản ghi `btn === null` (chưa
         * từng bind) trước đây bị coi là stale → closeAll() xoá sạch registry
         * mỗi lần click ra vùng trống, khiến popover không mở được nữa dù
         * nút vẫn còn trên DOM (đo được: registry tụt 13 → 3). */
        var stale = !(e.btn && e.btn.isConnected !== false && e.btn.ownerDocument && e.btn.ownerDocument.contains(e.btn));
        an(e);
        if (stale && e.pop && e.pop.parentNode) e.pop.parentNode.removeChild(e.pop);
        /* CHỈ xoá bản ghi đã mất nội dung. Bản ghi do footnote()/tip() tạo ra
           có `body` (nội dung popover) nhưng `btn === null` cho tới khi
           bind() gắn nút. Trước đây `stale` được tính cho mọi `btn === null`
           nên closeAll() xoá sạch registry mỗi lần đổi màn — nút còn trên DOM
           nhưng REG rỗng, bấm (i) không mở được (đo được: 11 → 0, chỉ 3 nút
           sinh qua UIPop.tip() còn sống sót). Giữ lại bản ghi có body; nó rẻ
           và tự tái sinh theo id khi màn vẽ lại. */
        if (stale && (e.body == null || e.body === '')) delete REG[id];
      }
      return true;
    } catch (err) { return false; }
  }

  function closeTimer(e) {
    if (e.timer) global.clearTimeout(e.timer);
    e.timer = global.setTimeout(function () {
      e.timer = null;
      if (e.open && !e.pinned) an(e); else if (!e.open) { /* noop */ }
    }, HOVER_WAIT);
  }

  function cancelTimer(e) { if (e.timer) { global.clearTimeout(e.timer); e.timer = null; } }

  function hoverIn(e) { cancelTimer(e); hien(e); }
  function hoverOut(e) { if (e.open && !e.pinned) closeTimer(e); }

  /* ==================================================== 6. listener delegate */

  function btnOf(node) {
    try {
      var d = doc_();
      if (!node || node.nodeType !== 1) return null;
      if (node.classList && node.classList.contains(CLS_BTN)) return node;
      var m = node.closest ? node.closest('.' + CLS_BTN) : null;
      return m || null;
    } catch (err) { return null; }
  }

  function popOf(node) {
    try {
      var d = doc_();
      if (!node || node.nodeType !== 1) return null;
      if (node.classList && node.classList.contains(CLS_POP)) return node;
      return node.closest ? node.closest('.' + CLS_POP) : null;
    } catch (err) { return null; }
  }

  function bindGlobal() {
    var d = doc_();
    if (!d) return;
    try { injectStyle(); } catch (e) { /* ignore */ }

    /* Rê chuột vào ký hiệu → hiện */
    d.addEventListener('mouseover', function (ev) {
      try {
        var b = btnOf(ev.target); if (!b) return;
        if (ev.relatedTarget && b.contains(ev.relatedTarget)) return;
        var e = entryFromEl(b); if (e) hoverIn(e);
      } catch (err) { /* ignore */ }
    }, true);

    /* Rê chuột rời ký hiệu → trễ 120ms rồi ẩn (đủ để rê qua popover) */
    d.addEventListener('mouseout', function (ev) {
      try {
        var b = btnOf(ev.target); if (!b) return;
        var to = ev.relatedTarget;
        if (to && (b.contains(to) || (popOf(to) && popOf(to).getAttribute('data-kpi-for') === b.getAttribute('data-kpi-tip')))) return;
        var e = entryFromEl(b); if (e) hoverOut(e);
      } catch (err) { /* ignore */ }
    }, true);

    /* Rê vào / rời popover */
    d.addEventListener('mouseover', function (ev) {
      try {
        var p = popOf(ev.target); if (!p) return;
        if (ev.relatedTarget && p.contains(ev.relatedTarget)) return;
        var e = REG[p.getAttribute('data-kpi-for')]; if (e) hoverIn(e);
      } catch (err) { /* ignore */ }
    }, true);
    d.addEventListener('mouseout', function (ev) {
      try {
        var p = popOf(ev.target); if (!p) return;
        var to = ev.relatedTarget;
        if (to && p.contains(to)) return;
        var e = REG[p.getAttribute('data-kpi-for')];
        if (!e) return;
        if (to && (btnOf(to) || popOf(to))) return;   /* còn ở trong cặp nút+pop */
        hoverOut(e);
      } catch (err) { /* ignore */ }
    }, true);

    /* BẤM: toggle (Enter/Space của <button> cũng đi qua đây) + đóng khi click ra ngoài */
    d.addEventListener('click', function (ev) {
      try {
        var b = btnOf(ev.target);
        if (b) {
          var e = entryFromEl(b);
          if (e) {
            if (e.open && e.pinned) an(e);
            else { cancelTimer(e); e.pinned = true; hien(e); }
          }
          return;
        }
        var p = popOf(ev.target);
        if (p) {
          var pe = REG[p.getAttribute('data-kpi-for')];
          if (pe) { cancelTimer(pe); hien(pe); }   /* rê trong popover: giữ mở */
          return;
        }
        closeAll();
      } catch (err) { /* ignore */ }
    }, false);

    /* Bàn phím: Esc đóng */
    d.addEventListener('keydown', function (ev) {
      try {
        if (ev.key !== 'Escape' && ev.key !== 'Esc' && ev.keyCode !== 27) return;
        var open = null;
        for (var id in REG) {
          if (Object.prototype.hasOwnProperty.call(REG, id) && REG[id] && REG[id].open) { open = REG[id]; break; }
        }
        if (!open) return;
        var back = open.btn;
        closeAll();
        if (back && back.focus) { try { back.focus(); } catch (e2) { /* ignore */ } }
      } catch (err) { /* ignore */ }
    }, false);

    /* Cuộn trang / đổi kích thước → đóng cho gọn */
    global.addEventListener('scroll', function () { closeAll(); }, true);
    global.addEventListener('resize', function () { closeAll(); }, false);
    global.addEventListener('orientationchange', function () { closeAll(); }, false);
  }

  /** Gắn listener toàn cục — chỉ 1 LẦN dù gọi bao nhiêu lần. */
  function mount() {
    if (mounted) return true;
    try { mounted = true; bindGlobal(); injectStyle(); return true; }
    catch (err) { mounted = false; return false; }
  }

  /* ------------------------------------------------------------- xuất ra */

  var UIPop = {
    tip: tip,
    tipDeferred: tipDeferred,
    footnote: footnote,
    bind: bind,
    cssVars: cssVars,
    hien: hien,
    an: an,
    closeAll: closeAll,
    isOpen: isOpen,
    mount: mount,
    /* tiện ích phụ (không bắt buộc) */
    close: an,
    open: function (id) { return hien(id, { pinned: true }); },
    ids: function () { var a = []; for (var k in REG) if (Object.prototype.hasOwnProperty.call(REG, k)) a.push(k); return a; },
    version: '1.1.0'
  };

  /* Nạp lại file (script bị thêm 2 lần): giữ bản đã cài, trả về bản cũ —
     nếu không, hai registry sẽ cạnh tranh và ký hiệu sẽ không bao giờ đóng. */
  try {
    if (global.UIPop && global.UIPop.__installed) return;
    global.UIPop = UIPop;
    UIPop.__installed = true;
  } catch (e) { /* ignore */ }

  /* Tự gắn listener ngay khi nạp (vẫn idempotent) + lại sau DOM sẵn sàng. */
  try {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', mount, { once: true });
    }
    mount();
  } catch (e) { /* ignore */ }

})(typeof window !== 'undefined' ? window : this);
