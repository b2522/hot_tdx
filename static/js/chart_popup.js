/* ============================================================================
 * 东方财富 日K线(含MACD) / 分时图 悬停弹窗 —— 热门个股 / 热门题材 两页通用
 * ----------------------------------------------------------------------------
 * 触发：鼠标悬停到「股票名称」单元格（.stock-name-link / .stock-name-cell）。
 *   - 整行本身仍保留「点击跳转通达信」行为，hover 弹窗不干扰点击。
 *   - 用事件委托，动态渲染（筛选/题材详情）出的表格同样生效。
 *
 * 股票代码：从最近的 [data-code] 祖先节点读取，并清洗掉 .SS/.SZ/.BJ 后缀。
 *   - index.html 代码在 .time-chart[data-code]；zqtc_tdx.html 代码在 <tr data-code>。
 *
 * 图片地址（东方财富 server-side 图片，无需 API key）：
 *   日K线： https://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=<nid>&formula=MACD&imageType=KXL&type=D|W|M
 *   分时图： https://webquotepic.eastmoney.com/GetPic.aspx?nid=<nid>&imageType=r
 *   nid 前缀：6/9 → 1. ；0/2/3 → 0. ；8/4/920（北交所/新三板）→ 0. ；其余 1. 兜底。
 *
 * 全局 API：window.EastMoneyChartPopup = { show(cell), hide(), config }
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.EastMoneyChartPopup) return;

  var TRIGGER_SELECTOR = ".stock-name-link, .stock-name-cell, .price, .change-percentage, .stock-price-cell, .stock-change-cell";
  var PERIODS = [["日K", "D"], ["周K", "W"], ["月K", "M"]];

  /* ---------- 代码清洗 & 图片地址 ---------- */
  // 清洗：去掉 .SS/.SZ/.BJ 等后缀，只保留前 6 位数字
  function cleanCode(raw) {
    if (!raw) return "";
    var digits = (raw + "").replace(/[^\d]/g, "");
    return digits.slice(0, 6);
  }
  // 东方财富 nid：市场前缀
  function emNid(code) {
    if (!code) return code;
    var c = code.charAt(0);
    if (c === "6" || c === "9") return "1." + code;            // 沪市 / B股
    if (c === "0" || c === "2" || c === "3") return "0." + code; // 深市 / 创业板
    if (c === "8" || c === "4") return "0." + code;            // 北交所 / 新三板
    if (code.indexOf("920") === 0) return "0." + code;          // 北交所 920 段
    return "1." + code;                                          // 兜底
  }
  function klineUrl(code, period) {
    var tp = period || "D";
    return "https://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + emNid(code)
         + "&formula=MACD&imageType=KXL&type=" + tp;
  }
  function intradayUrl(code) {
    return "https://webquotepic.eastmoney.com/GetPic.aspx?nid=" + emNid(code) + "&imageType=r";
  }

  /* ---------- 样式（自注入，页面无需额外 CSS；白底弹窗两主题都可用） ---------- */
  var CSS = [
    ".em-cp-pop{position:fixed;z-index:3000;display:none;padding:8px;background:#fff;",
      "border:1px solid #e3e6eb;border-radius:10px;box-shadow:0 8px 28px rgba(20,30,50,.22);}",
    ".em-cp-pop.show{display:block;}",
    ".em-cp-title{font-size:12.5px;font-weight:600;color:#1f2733;margin:0 0 6px;white-space:nowrap;}",
    ".em-cp-title .em-cp-code{color:#6b7280;font-weight:500;}",
    ".em-cp-body{display:flex;flex-direction:column;gap:10px;}",
    ".em-cp-sec{display:flex;flex-direction:column;}",
    ".em-cp-cap{display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;margin-bottom:3px;}",
    ".em-cp-cap .em-cp-btns{margin-left:auto;display:flex;gap:4px;}",
    ".em-cp-cap button{border:1px solid #d8dde5;background:#fff;color:#3a4a5e;border-radius:6px;",
      "padding:1px 8px;cursor:pointer;font-size:11px;line-height:1.5;}",
    ".em-cp-cap button.on{background:#eef3ff;border-color:#b9cdf5;}",
    ".em-cp-img{display:block;width:480px;max-width:76vw;height:auto;border-radius:6px;background:#fff;}",
    ".em-cp-err{font-size:11px;color:#d8392b;padding:6px 2px;}"
  ].join("");

  var styleEl = document.createElement("style");
  styleEl.setAttribute("data-em-chart-popup", "1");
  styleEl.appendChild(document.createTextNode(CSS));
  (document.head || document.documentElement).appendChild(styleEl);

  /* ---------- 弹窗 DOM ---------- */
  var pop = null, curCode = "", curPeriod = "D";
  var chgEl, klineImg, intradayImg, btnWrap;

  function build() {
    pop = document.createElement("div");
    pop.className = "em-cp-pop";
    pop.setAttribute("role", "tooltip");

    var title = document.createElement("div");
    title.className = "em-cp-title";
    var nameSpan = document.createElement("span");
    nameSpan.className = "em-cp-name";
    var codeSpan = document.createElement("span");
    codeSpan.className = "em-cp-code";
    chgEl = document.createElement("span");
    chgEl.className = "em-cp-chg";
    title.appendChild(nameSpan);
    title.appendChild(document.createTextNode(" "));
    title.appendChild(codeSpan);
    title.appendChild(chgEl);
    nameSpan.textContent = "";
    codeSpan.textContent = "";

    var body = document.createElement("div");
    body.className = "em-cp-body";

    // 区块 1：日K线 + 日/周/月切换
    var sec1 = document.createElement("div");
    sec1.className = "em-cp-sec";
    var cap1 = document.createElement("div");
    cap1.className = "em-cp-cap";
    var cap1txt = document.createElement("span");
    cap1txt.textContent = "日K线（MACD）";
    btnWrap = document.createElement("span");
    btnWrap.className = "em-cp-btns";
    PERIODS.forEach(function (p, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = p[0];
      if (idx === 0) b.className = "on";
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        curPeriod = p[1];
        Array.prototype.forEach.call(btnWrap.querySelectorAll("button"), function (x) {
          x.className = "";
        });
        b.className = "on";
        if (curCode) klineImg.src = klineUrl(curCode, curPeriod);
      });
      btnWrap.appendChild(b);
    });
    cap1.appendChild(cap1txt);
    cap1.appendChild(btnWrap);
    klineImg = document.createElement("img");
    klineImg.className = "em-cp-img";
    klineImg.alt = "东方财富 K线（MACD）";
    sec1.appendChild(cap1);
    sec1.appendChild(klineImg);

    // 区块 2：分时图
    var sec2 = document.createElement("div");
    sec2.className = "em-cp-sec";
    var cap2 = document.createElement("div");
    cap2.className = "em-cp-cap";
    var cap2txt = document.createElement("span");
    cap2txt.textContent = "分时图";
    cap2.appendChild(cap2txt);
    intradayImg = document.createElement("img");
    intradayImg.className = "em-cp-img";
    intradayImg.alt = "东方财富 分时图";
    sec2.appendChild(cap2);
    sec2.appendChild(intradayImg);

    body.appendChild(sec1);
    body.appendChild(sec2);
    pop.appendChild(title);
    pop.appendChild(body);
    document.body.appendChild(pop);

    // 图片加载完成后重新贴合（高度变化避免溢出）
    klineImg.addEventListener("load", function () { if (lastCell) position(lastCell); });
    intradayImg.addEventListener("load", function () { if (lastCell) position(lastCell); });

    // 加载失败时给出提示（东方财富可能防盗链）
    [klineImg, intradayImg].forEach(function (img) {
      img.addEventListener("error", function () {
        var tip = img.parentNode.querySelector(".em-cp-err");
        if (!tip) {
          tip = document.createElement("div");
          tip.className = "em-cp-err";
          tip.textContent = "图片加载失败（可能受东方财富防盗链限制）";
          img.parentNode.appendChild(tip);
        }
        img.style.display = "none";
      });
      img.addEventListener("load", function () {
        img.style.display = "";
        var tip = img.parentNode.querySelector(".em-cp-err");
        if (tip) tip.remove();
      });
    });

    // 鼠标进入弹窗（例如点 日/周/月）时不隐藏
    pop.addEventListener("mouseenter", cancelHide);
    pop.addEventListener("mouseleave", scheduleHide);
  }

  /* ---------- 读取单元格信息 ---------- */
  function nodeFor(cell) {
    if (!cell || !cell.closest) return null;
    // 名称单元格向上找最近的 tr：tr 上若有 data-code 直接用；否则在 tr 内查找 [data-code]；
    // 再不行回退到任意祖先 [data-code]。
    var row = cell.closest("tr");
    if (row && row.getAttribute("data-code")) return row;
    if (row) {
      var inRow = row.querySelector("[data-code]");
      if (inRow) return inRow;
    }
    return cell.closest("[data-code]");
  }
  function codeFor(cell) {
    var n = nodeFor(cell);
    return n ? cleanCode(n.getAttribute("data-code") || "") : "";
  }

  /* ---------- 显示 / 隐藏 ---------- */
  var hideTimer = null, lastCell = null;

  function show(cell) {
    if (!pop) build();
    var code = codeFor(cell);
    if (!code) { hide(); return; }
    if (code !== curCode) {
      curCode = code;
      curPeriod = "D";
      if (btnWrap) {
        Array.prototype.forEach.call(btnWrap.querySelectorAll("button"), function (x, i) {
          x.className = i === 0 ? "on" : "";
        });
      }
      klineImg.src = klineUrl(code, curPeriod);
      intradayImg.src = intradayUrl(code);
    }
    // 名称取行内第一列的名称行（.sn-name）；hover 名称单元格本身时也走同一逻辑
    var nameScope = cell.closest("tr") || cell;
    var nameEl = nameScope.querySelector ? nameScope.querySelector(".sn-name") : null;
    var nm = nameEl ? nameEl.textContent.trim() : (cell.textContent || "").replace(/\s+/g, " ").trim();
    pop.querySelector(".em-cp-name").textContent = nm;
    pop.querySelector(".em-cp-code").textContent = "(" + code + ")";
    lastCell = cell;
    pop.classList.add("show");
    position(cell);
  }

  function hide() {
    curCode = "";
    if (pop) {
      pop.classList.remove("show");
      if (klineImg) klineImg.removeAttribute("src");
      if (intradayImg) intradayImg.removeAttribute("src");
    }
  }
  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hide, 150);
  }
  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function position(cell) {
    if (!pop || !cell) return;
    var r = cell.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var pw = pop.offsetWidth || 500;
    var ph = pop.offsetHeight || 700;
    // 优先放在单元格右侧（不挡住下方要看的内容）
    var left = r.right + 12;
    if (left + pw > vw - 8) {
      // 右边放不下则改放左侧
      left = r.left - pw - 12;
    }
    if (left < 8) left = 8;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    // 垂直与单元格顶部对齐，clamp 到视口内
    var top = r.top;
    if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
    if (top < 8) top = 8;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  /* ---------- 事件（事件委托，动态生成的表格同样生效） ---------- */
  document.addEventListener("mouseover", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".em-cp-pop")) { cancelHide(); return; }
    var cell = t.closest(TRIGGER_SELECTOR);
    if (!cell) return;
    cancelHide();
    show(cell);
  });
  document.addEventListener("mouseout", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(TRIGGER_SELECTOR) || t.closest(".em-cp-pop")) scheduleHide();
  });
  window.addEventListener("scroll", hide, true);

  window.EastMoneyChartPopup = { show: show, hide: hide, config: { trigger: TRIGGER_SELECTOR } };
})();
