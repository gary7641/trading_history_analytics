// trade-analyzer.js
// v0.0260308003 + sort-by-closeTime (Perplexity整合版)

// CSV → 帳戶摘要 + 圖表 + All Symbols / 各貨幣按鈕 +
// 馬丁表(只限單一Symbol) + MFE/MAE (Pips / Money) + SWOT
// + Symbol 累積 Profit 小圖 + Reset
// + Symbol 深入分析：Cumulative / Weekday / Hourly Profit & Count
// + Dark/Light Theme Switch + Cumulative All / Separate Switch
// + 帳戶統計、Symbol 指標 2 行橫向排版

let globalTrades = [];
let globalBySymbol = {};
let globalEAKey = "SMA";

let equityChart, weekdayChart, symbolProfitChart;
let mfeChart, maeChart, holdingChart;
let symbolCumulativeChart,
  symbolWeekdayProfitChart,
  symbolWeekdayCountChart,
  symbolHourlyProfitChart,
  symbolHourlyCountChart;

let mfeMaeMode = "pips"; // "pips" | "money"
let cumulativeMode = "all"; // "all" | "separate"

// ---------- Theme Switch (Dark / Light) ----------
// 勾 = dark，default = light
(function setupThemeSwitch() {
  const html = document.documentElement;
  const themeInput = document.getElementById("themeSwitch");
  if (!themeInput) return;

  const saved = localStorage.getItem("theme") || "light";
  html.setAttribute("data-theme", saved);
  themeInput.checked = saved === "dark";

  themeInput.addEventListener("change", () => {
    const theme = themeInput.checked ? "dark" : "light";
    html.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  });
})();

// ---------- Cumulative Switch (All / Separate) ----------
(function setupCumSwitch() {
  const cumInput = document.getElementById("cumSwitch");
  if (!cumInput) return;

  cumulativeMode = "all";
  cumInput.checked = false; // off = all, on = separate

  cumInput.addEventListener("change", () => {
    cumulativeMode = cumInput.checked ? "separate" : "all";

    const activeSymbolBtn = document.querySelector(".symbol-btn.active");
    const sym = activeSymbolBtn ? activeSymbolBtn.dataset.symbol : "ALL";
    const trades = sym === "ALL" ? globalTrades : globalBySymbol[sym] || [];
    renderSymbolExtraCharts(sym, trades);
  });
})();

// Analyze button
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  analyzeBtn.addEventListener("click", handleAnalyze);
}

// Reset button
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) resetBtn.addEventListener("click", resetView);

// Pips / Money switch for MFE/MAE/Holding
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-mode");
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (!mode || mode === mfeMaeMode) return;
  mfeMaeMode = mode;

  document
    .querySelectorAll(".toggle-mode")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

  const activeSymbolBtn = document.querySelector(".symbol-btn.active");
  const sym = activeSymbolBtn ? activeSymbolBtn.dataset.symbol : "ALL";
  const trades = sym === "ALL" ? globalTrades : globalBySymbol[sym] || [];
  renderMfeMaeHoldingCharts(trades);
});

function handleAnalyze() {
  const fileInput = document.getElementById("csvFile");
  const file = fileInput ? fileInput.files[0] : null;
  if (!file) {
    alert("請先選擇 CSV 檔案");
    return;
  }
  const eaSelect = document.getElementById("eaSelect");
  globalEAKey = eaSelect ? eaSelect.value : "SMA";

  const reader = new FileReader();
  reader.onload = (e) => {
    parseCsv(e.target.result);
    buildAll();
  };
  reader.readAsText(file);
}

// ---------- CSV 解析（統一按 closeTime 由最舊到最新排序） ----------
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) {
    globalTrades = [];
    globalBySymbol = {};
    return;
  }

  const headers = lines[0].split(",");
  const idx = (name) =>
    headers.findIndex(
      (h) => h.trim().toLowerCase() === name.trim().toLowerCase()
    );

  const iOpenTime =
    idx("open time") !== -1 ? idx("open time") : idx("Open Time");
  const iCloseTime =
    idx("close time") !== -1 ? idx("close time") : idx("Close Time");
  const iType = idx("type");
  const iLots = idx("lots") !== -1 ? idx("lots") : idx("volume");
  const iSymbol = idx("symbol");
  const iNetProfit =
    idx("net profit") !== -1 ? idx("net profit") : idx("profit");
  const iNetPips = idx("net pips") !== -1 ? idx("net pips") : idx("pips");
  const iMFE = idx("mfe") !== -1 ? idx("mfe") : idx("max profit pips");
  const iMAE = idx("mae") !== -1 ? idx("mae") : idx("max loss pips");
  const iHold = idx("holding time") !== -1 ? idx("holding time") : -1;

  const trades = [];
  for (let i = 1; i < lines.length; i++) {
    const rowRaw = lines[i];
    if (!rowRaw.trim()) continue;
    const cells = rowRaw.split(",");

    if (iType < 0 || iSymbol < 0) continue;

    const type = (cells[iType] || "").trim().toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    const t = {
      openTime: iOpenTime >= 0 ? cells[iOpenTime] || "" : "",
      closeTime: iCloseTime >= 0 ? cells[iCloseTime] || "" : "",
      type,
      symbol: (cells[iSymbol] || "").trim(),
      lots: iLots >= 0 ? parseFloat(cells[iLots] || "0") || 0 : 0,
      netProfit:
        iNetProfit >= 0 ? parseFloat(cells[iNetProfit] || "0") || 0 : 0,
      netPips: iNetPips >= 0 ? parseFloat(cells[iNetPips] || "0") || 0 : 0,
      mfe: iMFE >= 0 ? parseFloat(cells[iMFE] || "0") || 0 : 0,
      mae: iMAE >= 0 ? parseFloat(cells[iMAE] || "0") || 0 : 0,
      holdingRaw: iHold === -1 ? "" : cells[iHold] || ""
    };
    t.holdingDays = parseHoldingToDays(t.holdingRaw);
    trades.push(t);
  }

  // 入口統一排序：按 closeTime（無就用 openTime）由最舊到最新
  globalTrades = trades;
  globalTrades.sort((a, b) => {
    const da = new Date(a.closeTime || a.openTime);
    const db = new Date(b.closeTime || b.openTime);
    return da - db;
  });

  // 以已排序的 globalTrades 做 groupBySymbol
  globalBySymbol = groupBySymbol(globalTrades);
}

function parseHoldingToDays(text) {
  if (!text) return 0;
  const t = text.toLowerCase().trim();
  if (t.endsWith("days") || t.endsWith("day")) {
    const v = parseFloat(t);
    return isNaN(v) ? 0 : v;
  }
  if (t.endsWith("hrs") || t.endsWith("hours") || t.endsWith("hr")) {
    const v = parseFloat(t);
    return isNaN(v) ? 0 : v / 24.0;
  }
  return 0;
}

function groupBySymbol(trades) {
  const map = {};
  for (const t of trades) {
    if (!t.symbol) continue;
    if (!map[t.symbol]) map[t.symbol] = [];
    map[t.symbol].push(t);
  }
  return map;
}

// ---------- 基本統計 ----------
function buildStats(trades) {
  const totalTrades = trades.length;
  if (!totalTrades) return null;

  let grossProfit = 0;
  let grossLoss = 0;
  let profitTrades = 0;
  let lossTrades = 0;
  let maxConsecLoss = 0;
  let curConsecLoss = 0;
  let cum = 0;
  let peak = 0;
  let maxDD = 0;

  for (const t of trades) {
    const p = t.netProfit;
    if (p > 0) {
      profitTrades++;
      grossProfit += p;
      curConsecLoss = 0;
    } else if (p < 0) {
      lossTrades++;
      grossLoss += -p;
      curConsecLoss++;
      if (curConsecLoss > maxConsecLoss) maxConsecLoss = curConsecLoss;
    }

    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  const winRate = profitTrades / totalTrades || 0;
  const lossRate = lossTrades / totalTrades || 0;
  const avgWin = profitTrades ? grossProfit / profitTrades : 0;
  const avgLoss = lossTrades ? grossLoss / lossTrades : 0;
  const expectancy = avgWin * winRate - avgLoss * lossRate;
  const pf =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return {
    totalTrades,
    grossProfit,
    grossLoss,
    profitTrades,
    lossTrades,
    winRate,
    lossRate,
    avgWin,
    avgLoss,
    expectancy,
    profitFactor: pf,
    maxDrawdown: maxDD,
    maxConsecLoss
  };
}

function buildAccountSummary() {
  const stats = buildStats(globalTrades);
  const bySymbolProfit = {};
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  let cum = 0;
  const curve = [];
  let firstTime = null;
  let lastTime = null;

  for (const t of globalTrades) {
    cum += t.netProfit;
    const ts = new Date(t.closeTime || t.openTime);
    const label = isNaN(ts.getTime()) ? "" : ts.toISOString().slice(0, 10);
    const wd = ts.getDay();
    weekdayCounts[wd]++;
    bySymbolProfit[t.symbol] = (bySymbolProfit[t.symbol] || 0) + t.netProfit;
    curve.push({ x: label, y: cum });

    if (!firstTime || ts < firstTime) firstTime = ts;
    if (!lastTime || ts > lastTime) lastTime = ts;
  }

  const symbolRanking = Object.entries(bySymbolProfit).sort(
    (a, b) => b[1] - a[1]
  );

  return { stats, weekdayCounts, symbolRanking, curve, firstTime, lastTime };
}

// ---------- Collapsible ----------
document.addEventListener("click", (e) => {
  const header = e.target.closest(".collapsible-header");
  if (!header) return;

  const targetId = header.dataset.target;
  if (!targetId) return;

  const body = document.getElementById(targetId);
  if (!body) return;

  const btn = header.querySelector(".collapse-toggle");

  const isCollapsed = body.classList.toggle("collapsed");
  if (isCollapsed) {
    body.style.maxHeight = "0px";
    if (btn) btn.textContent = "＋";
  } else {
    body.style.maxHeight = body.scrollHeight + "px";
    if (btn) btn.textContent = "－";
  }
});

function expandBody(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.remove("collapsed");
  body.style.maxHeight = body.scrollHeight + "px";
}

// ---------- 總流程 / RESET ----------
function buildAll() {
  if (!globalTrades.length) {
    alert("CSV 內沒有有效交易紀錄");
    return;
  }

  const acc = buildAccountSummary();

  renderSummaryCards(acc);
  document.getElementById("summaryCardsSection").style.display = "block";
  expandBody("summaryCardsBody");

  renderAccountStats(acc.stats);
  renderMinimumArea(acc.stats);
  renderAccountCharts(acc);
  document.getElementById("accountSection").style.display = "block";
  expandBody("accountBody");

  renderSymbolButtons();
  document.getElementById("symbolSection").style.display = "block";
  renderSymbolMiniCharts();
  expandBody("symbolBody");

  renderSymbol("ALL");
}

function resetView() {
  globalTrades = [];
  globalBySymbol = {};
  globalEAKey = "SMA";
  mfeMaeMode = "pips";
  cumulativeMode = "all";

  if (equityChart) equityChart.destroy();
  if (weekdayChart) weekdayChart.destroy();
  if (symbolProfitChart) symbolProfitChart.destroy();
  if (mfeChart) mfeChart.destroy();
  if (maeChart) maeChart.destroy();
  if (holdingChart) holdingChart.destroy();
  if (symbolCumulativeChart) symbolCumulativeChart.destroy();
  if (symbolWeekdayProfitChart) symbolWeekdayProfitChart.destroy();
  if (symbolWeekdayCountChart) symbolWeekdayCountChart.destroy();
  if (symbolHourlyProfitChart) symbolHourlyProfitChart.destroy();
  if (symbolHourlyCountChart) symbolHourlyCountChart.destroy();

  equityChart = weekdayChart = symbolProfitChart = null;
  mfeChart = maeChart = holdingChart = null;
  symbolCumulativeChart =
    symbolWeekdayProfitChart =
    symbolWeekdayCountChart =
    symbolHourlyProfitChart =
    symbolHourlyCountChart =
      null;

  const hideIds = [
    "summaryCardsSection",
    "accountSection",
    "symbolSection",
    "symbolDetailSection",
    "swotSection",
    "martinSection"
  ];
  hideIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const clearIds = [
    "accountStats",
    "symbolButtons",
    "symbolMiniCharts",
    "symbolStats",
    "martinTables",
    "minimumArea",
    "swotST",
    "swotS",
    "swotSW",
    "swotT",
    "swotW",
    "swotOT",
    "swotO",
    "swotOW",
    "eaCenterAnalysis"
  ];
  clearIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  const summaryDefaults = {
    growthValue: "0 %",
    growthPeriod: "",
    radarAlgo: "EA Radar",
    radarProfitTrades: "",
    radarLossTrades: "",
    radarMaxDD: "",
    radarPF: "",
    radarActivity: "",
    equityValue: "0.00",
    profitValue: "0.00",
    initialDepositValue: "0.00"
  };
  Object.entries(summaryDefaults).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
  const equityBar = document.getElementById("equityBar");
  const profitBar = document.getElementById("profitBar");
  if (equityBar) equityBar.style.width = "0%";
  if (profitBar) profitBar.style.width = "0%";

  const fileInput = document.getElementById("csvFile");
  if (fileInput) fileInput.value = "";
  const eaSelect = document.getElementById("eaSelect");
  if (eaSelect) eaSelect.value = "SMA";

  const symbolTitle = document.getElementById("symbolTitle");
  if (symbolTitle) symbolTitle.textContent = "5. Symbol 深入分析 📊";

  const eaTag = document.getElementById("eaTag");
  if (eaTag) eaTag.textContent = "EA";

  document
    .querySelectorAll(".toggle-mode")
    .forEach((b) => b.classList.remove("active"));
  const pipsBtn = document.querySelector('.toggle-mode[data-mode="pips"]');
  if (pipsBtn) pipsBtn.classList.add("active");

  const themeInput = document.getElementById("themeSwitch");
  if (themeInput) {
    themeInput.checked = false; // false = light
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  }

  const cumInput = document.getElementById("cumSwitch");
  if (cumInput) cumInput.checked = false;
  cumulativeMode = "all";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- 帳戶摘要卡 ----------
function renderSummaryCards(acc) {
  const stats = acc.stats;
  const netProfit = stats.grossProfit - stats.grossLoss;
  const initialDeposit = 5000;
  const equity = initialDeposit + netProfit;

  const growthPct = (equity / initialDeposit - 1) * 100;
  const periodDays =
    acc.firstTime && acc.lastTime
      ? Math.max(
          1,
          Math.round(
            (acc.lastTime.getTime() - acc.firstTime.getTime()) /
              (1000 * 3600 * 24)
          )
        )
      : 0;
  const weeks = (periodDays / 7).toFixed(1);

  document.getElementById("growthValue").textContent =
    growthPct.toFixed(2) + " %";
  document.getElementById("growthPeriod").textContent = "Week(s): " + weeks;

  const radarProfit = document.getElementById("radarProfitTrades");
  const radarLoss = document.getElementById("radarLossTrades");
  const radarMaxDD = document.getElementById("radarMaxDD");
  const radarPF = document.getElementById("radarPF");
  const radarActivity = document.getElementById("radarActivity");
  if (radarProfit)
    radarProfit.textContent = (stats.winRate * 100).toFixed(1) + " %";
  if (radarLoss)
    radarLoss.textContent = (stats.lossRate * 100).toFixed(1) + " %";
  if (radarMaxDD) radarMaxDD.textContent = stats.maxDrawdown.toFixed(2);
  if (radarPF)
    radarPF.textContent =
      stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);
  if (radarActivity) radarActivity.textContent = stats.totalTrades + " trades";

  document.getElementById("equityValue").textContent = equity.toFixed(2);
  document.getElementById("profitValue").textContent = netProfit.toFixed(2);
  document.getElementById("initialDepositValue").textContent =
    initialDeposit.toFixed(2);

  const equityPct = Math.min(100, (equity / initialDeposit) * 20);
  const profitPct = Math.min(100, Math.abs(netProfit / initialDeposit) * 20);
  document.getElementById("equityBar").style.width = equityPct + "%";
  document.getElementById("profitBar").style.width = profitPct + "%";
}

// ---------- 帳戶總覽圖表 + MINIMUM ----------
function renderAccountStats(stats) {
  const net = stats.grossProfit - stats.grossLoss;
  const el = document.getElementById("accountStats");
  el.innerHTML = `
    <div class="account-row">
      <span>總交易: ${stats.totalTrades}</span>
      <span>勝率: ${(stats.winRate * 100).toFixed(1)}%</span>
      <span>淨盈利: ${net.toFixed(2)}</span>
      <span>Profit Factor: ${
        stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)
      }</span>
    </div>
    <div class="account-row">
      <span>期望值/單: ${stats.expectancy.toFixed(2)}</span>
      <span>最大回撤: ${stats.maxDrawdown.toFixed(2)}</span>
      <span>最大連虧: ${stats.maxConsecLoss}</span>
    </div>
  `;
}

function renderMinimumArea(stats) {
  const el = document.getElementById("minimumArea");
  if (!el) return;

  el.innerHTML = `
    <div><strong>Avg Win:</strong> ${stats.avgWin.toFixed(2)}</div>
    <div><strong>Avg Loss:</strong> ${stats.avgLoss.toFixed(2)}</div>
    <div><strong>Expectancy:</strong> ${stats.expectancy.toFixed(2)}</div>
    <div><strong>Max DD:</strong> ${stats.maxDrawdown.toFixed(2)}</div>
  `;
}

function renderAccountCharts(acc) {
  const ctx1 = document.getElementById("equityChart").getContext("2d");
  const ctx2 = document.getElementById("weekdayChart").getContext("2d");
  const ctx3 = document.getElementById("symbolProfitChart").getContext("2d");

  if (equityChart) equityChart.destroy();
  if (weekdayChart) weekdayChart.destroy();
  if (symbolProfitChart) symbolProfitChart.destroy();

  const POS = "#22d3ee";
  const NEG = "#ef4444";

  equityChart = new Chart(ctx1, {
    type: "line",
    data: {
      labels: acc.curve.map((p) => p.x),
      datasets: [
        {
          label: "Equity",
          data: acc.curve.map((p) => p.y),
          borderColor: "#0b5c7f",
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: {
      scales: {
        x: {
          type: "category",
          title: { display: true, text: "時間 (按交易順序)" },
          ticks: { maxTicksLimit: 10 }
        },
        y: { title: { display: true, text: "累積 Profit" } }
      }
    }
  });

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  weekdayChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: weekdayNames,
      datasets: [
        {
          label: "交易數",
          data: acc.weekdayCounts,
          backgroundColor: POS
        }
      ]
    },
    options: {
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "單數" } }
      }
    }
  });

  const labels = acc.symbolRanking.map((r) => r[0]);
  const data = acc.symbolRanking.map((r) => r[1]);
  symbolProfitChart = new Chart(ctx3, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "淨盈利",
          data,
          backgroundColor: data.map((v) => (v >= 0 ? POS : NEG))
        }
      ]
    },
    options: {
      indexAxis: "y",
      scales: {
        x: { title: { display: true, text: "Profit" } }
      }
    }
  });
}

// ---------- Symbol 按鈕 + 詳細 ----------
function renderSymbolButtons() {
  const container = document.getElementById("symbolButtons");
  container.innerHTML = "";

  const symbols = Object.keys(globalBySymbol).sort();

  const allStats = buildStats(globalTrades);
  const allNet = allStats.grossProfit - allStats.grossLoss;
  const allBtn = document.createElement("button");
  allBtn.className = "symbol-btn active";
  allBtn.dataset.symbol = "ALL";
  allBtn.innerHTML = `
    <span>All Symbols</span>
    <span class="value">${allNet.toFixed(0)}</span>
  `;
  allBtn.onclick = () => {
    [...container.querySelectorAll(".symbol-btn")].forEach((b) =>
      b.classList.remove("active")
    );
    allBtn.classList.add("active");
    renderSymbol("ALL");
  };
  container.appendChild(allBtn);

  symbols.forEach((sym) => {
    const stats = buildStats(globalBySymbol[sym]);
    const net = stats.grossProfit - stats.grossLoss;

    const btn = document.createElement("button");
    btn.className = "symbol-btn";
    btn.dataset.symbol = sym;
    btn.innerHTML = `
      <span>${sym}</span>
      <span class="value">${net.toFixed(0)}</span>
    `;
    btn.onclick = () => {
      [...container.querySelectorAll(".symbol-btn")].forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");
      renderSymbol(sym);
    };
    container.appendChild(btn);
  });
}

function renderSymbol(symbol) {
  const trades = symbol === "ALL" ? globalTrades : globalBySymbol[symbol] || [];
  if (!trades.length) return;

  document.getElementById("symbolDetailSection").style.display = "block";
  document.getElementById("swotSection").style.display = "block";
  expandBody("symbolDetailBody");
  expandBody("swotBody");

  document.getElementById("symbolTitle").textContent =
    symbol === "ALL"
      ? "5. Symbol 深入分析 📊 – All Symbols"
      : `5. Symbol 深入分析 📊 – ${symbol}`;

  const cumWrap = document.getElementById("cumSwitchWrapper");
  if (cumWrap) {
    if (symbol === "ALL") {
      cumWrap.style.display = "inline-flex";
    } else {
      cumWrap.style.display = "none";
    }
  }

  const stats = buildStats(trades);
  renderSymbolStats(stats);

  const rule = EA_RULES[globalEAKey] || EA_RULES.OtherBasic;
  const eaTag = document.getElementById("eaTag");
  if (eaTag)
    eaTag.textContent =
      symbol === "ALL" ? `${rule.name} – 全組合` : rule.name;

  let martinSummary = null;

  if (rule.martin && symbol !== "ALL") {
    const m = buildMartinForSymbol(trades);
    martinSummary = m.martinSummary;
    renderMartinTables(symbol, m.tablePerSide);
    document.getElementById("martinSection").style.display = "block";
  } else {
    document.getElementById("martinSection").style.display = "none";
  }

  renderMfeMaeHoldingCharts(trades);
  renderSymbolExtraCharts(symbol, trades);

  const swot = buildSwotForEA(globalEAKey, symbol, stats, martinSummary);
  renderSwot(swot);
}

function renderSymbolStats(stats) {
  const net = stats.grossProfit - stats.grossLoss;
  const el = document.getElementById("symbolStats");
  el.innerHTML = `
    <div class="symbol-row">
      <span>Symbol 單數: ${stats.totalTrades}</span>
      <span>勝率: ${(stats.winRate * 100).toFixed(1)}%</span>
      <span>淨盈利: ${net.toFixed(2)}</span>
      <span>PF: ${
        stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)
      }</span>
    </div>
    <div class="symbol-row">
      <span>期望值/單: ${stats.expectancy.toFixed(2)}</span>
      <span>Max DD: ${stats.maxDrawdown.toFixed(2)}</span>
      <span>最大連虧: ${stats.maxConsecLoss}</span>
    </div>
  `;
}

// ---------- Symbol 累積 Profit 小圖 ----------
function renderSymbolMiniCharts() {
  const container = document.getElementById("symbolMiniCharts");
  container.innerHTML = "";

  addMiniChartCard(container, "All Symbols", globalTrades);

  const symbols = Object.keys(globalBySymbol).sort();
  symbols.forEach((sym) => {
    addMiniChartCard(container, sym, globalBySymbol[sym]);
  });
}

function addMiniChartCard(container, label, trades) {
  if (!trades || !trades.length) return;

  const stats = buildStats(trades);
  const net = stats.grossProfit - stats.grossLoss;

  const div = document.createElement("div");
  div.className = "mini-chart-card";

  const canvas = document.createElement("canvas");
  div.appendChild(canvas);

  const title = document.createElement("div");
  title.className = "mini-chart-title";
  title.innerHTML = `<span>${label}</span><span class="value">${net.toFixed(
    0
  )}</span>`;
  div.appendChild(title);

  container.appendChild(div);

  let cum = 0;
  const points = [];
  trades.forEach((t) => {
    cum += t.netProfit;
    points.push(cum);
  });

  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: points.map((_, i) => i + 1),
      datasets: [
        {
          data: points,
          borderColor: "#22c55e",
          borderWidth: 1,
          fill: false,
          pointRadius: 0,
          tension: 0.2
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

// ---------- Symbol 深入分析：Cumulative / Weekday / Hourly ----------
function renderSymbolExtraCharts(symbol, trades) {
  const cumCtx = document.getElementById("symbolCumulativeChart");
  const wdProfitCtx = document.getElementById("symbolWeekdayProfitChart");
  const wdCountCtx = document.getElementById("symbolWeekdayCountChart");
  const hrProfitCtx = document.getElementById("symbolHourlyProfitChart");
  const hrCountCtx = document.getElementById("symbolHourlyCountChart");

  if (symbolCumulativeChart) symbolCumulativeChart.destroy();
  if (symbolWeekdayProfitChart) symbolWeekdayProfitChart.destroy();
  if (symbolWeekdayCountChart) symbolWeekdayCountChart.destroy();
  if (symbolHourlyProfitChart) symbolHourlyProfitChart.destroy();
  if (symbolHourlyCountChart) symbolHourlyCountChart.destroy();

  if (!trades || !trades.length) return;
  if (!cumCtx || !wdProfitCtx || !wdCountCtx || !hrProfitCtx || !hrCountCtx)
    return;

  // trades 已在 parseCsv 時做過時間排序，這裡直接用
  const sorted = trades;

  const cumCtx2d = cumCtx.getContext("2d");

  // Cumulative: All / Separate
  if (symbol === "ALL" && cumulativeMode === "separate") {
    const grouped = {};
    sorted.forEach((t) => {
      if (!t.symbol) return;
      if (!grouped[t.symbol]) grouped[t.symbol] = [];
      grouped[t.symbol].push(t);
    });

    const baseColors = [
      "#22d3ee",
      "#a855f7",
      "#f97316",
      "#22c55e",
      "#eab308",
      "#ec4899",
      "#0ea5e9"
    ];
    let colorIndex = 0;
    const datasets = [];
    let maxLen = 0;

    Object.entries(grouped).forEach(([symKey, arr]) => {
      let cum = 0;
      const data = [];
      arr.forEach((t) => {
        cum += t.netProfit;
        data.push(cum);
      });
      if (data.length > maxLen) maxLen = data.length;

      const c = baseColors[colorIndex++ % baseColors.length];
      datasets.push({
        label: symKey,
        data,
        borderColor: c,
        fill: false,
        pointRadius: 0,
        tension: 0.15
      });
    });

    const labels = Array.from({ length: maxLen }, (_, i) => i + 1);

    symbolCumulativeChart = new Chart(cumCtx2d, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        plugins: {
          legend: { display: true }
        },
        scales: {
          x: { title: { display: true, text: "Trade Index (per Symbol)" } },
          y: { title: { display: true, text: "Profit" } }
        }
      }
    });
  } else {
    let cum = 0;
    const cumLabels = [];
    const cumData = [];
    sorted.forEach((t, idx) => {
      cum += t.netProfit;
      cumLabels.push(idx + 1);
      cumData.push(cum);
    });

    symbolCumulativeChart = new Chart(cumCtx2d, {
      type: "line",
      data: {
        labels: cumLabels,
        datasets: [
          {
            label: "Cumulative Profit",
            data: cumData,
            borderColor: "#2563eb",
            fill: false,
            pointRadius: 0,
            tension: 0.15
          }
        ]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "Trade Index" } },
          y: { title: { display: true, text: "Profit" } }
        }
      }
    });
  }

  // Weekday / Hourly
  const weekdayProfit = Array(7).fill(0);
  const weekdayCount = Array(7).fill(0);
  sorted.forEach((t) => {
    const d = new Date(t.closeTime || t.openTime);
    const wd = isNaN(d) ? 0 : d.getDay();
    weekdayProfit[wd] += t.netProfit;
    weekdayCount[wd] += 1;
  });
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  symbolWeekdayProfitChart = new Chart(wdProfitCtx.getContext("2d"), {
    type: "bar",
    data: {
      labels: weekdayNames,
      datasets: [
        {
          label: "Profit",
          data: weekdayProfit,
          backgroundColor: weekdayProfit.map((v) =>
            v >= 0 ? "#22d3ee" : "#ef4444"
          )
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: "Profit" } }
      }
    }
  });

  symbolWeekdayCountChart = new Chart(wdCountCtx.getContext("2d"), {
    type: "bar",
    data: {
      labels: weekdayNames,
      datasets: [
        {
          label: "Count",
          data: weekdayCount,
          backgroundColor: "#6366f1"
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: "Trades" }, beginAtZero: true }
      }
    }
  });

  const hourlyProfit = Array(24).fill(0);
  const hourlyCount = Array(24).fill(0);
  sorted.forEach((t) => {
    const d = new Date(t.closeTime || t.openTime);
    const h = isNaN(d) ? 0 : d.getHours();
    hourlyProfit[h] += t.netProfit;
    hourlyCount[h] += 1;
  });
  const hourLabels = Array.from({ length: 24 }, (_, i) =>
    i.toString().padStart(2, "0")
  );

  symbolHourlyProfitChart = new Chart(hrProfitCtx.getContext("2d"), {
    type: "bar",
    data: {
      labels: hourLabels,
      datasets: [
        {
          label: "Profit",
          data: hourlyProfit,
          backgroundColor: hourlyProfit.map((v) =>
            v >= 0 ? "#22d3ee" : "#ef4444"
          )
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Hour" } },
        y: { title: { display: true, text: "Profit" } }
      }
    }
  });

  symbolHourlyCountChart = new Chart(hrCountCtx.getContext("2d"), {
    type: "bar",
    data: {
      labels: hourLabels,
      datasets: [
        {
          label: "Count",
          data: hourlyCount,
          backgroundColor: "#3b82f6"
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Hour" } },
        y: { title: { display: true, text: "Trades" }, beginAtZero: true }
      }
    }
  });
}

// ---------- 馬丁 Table ----------
function buildMartinForSymbol(symbolTrades) {
  const map = {};
  for (const t of symbolTrades) {
    const key = `${t.symbol}|${t.type}|${t.lots.toFixed(2)}`;
    if (!map[key]) {
      map[key] = {
        symbol: t.symbol,
        side: t.type.toUpperCase(),
        lots: t.lots,
        tradeCount: 0,
        sumProfit: 0,
        sumPips: 0
      };
    }
    const m = map[key];
    m.tradeCount++;
    m.sumProfit += t.netProfit;
    m.sumPips += t.netPips;
  }
  const rows = Object.values(map);
  const bySide = {};
  for (const r of rows) {
    const key = `${r.symbol}|${r.side}`;
    if (!bySide[key]) bySide[key] = [];
    bySide[key].push(r);
  }

  const tablePerSide = [];
  const martinSummary = {
    totalProfit: 0,
    firstPositiveLevel: null,
    maxLevel: 0,
    worstSideNegative: null
  };

  for (const key of Object.keys(bySide)) {
    const [symbol, side] = key.split("|");
    const arr = bySide[key].sort((a, b) => a.lots - b.lots);
    let totalProfit = 0;
    let totalPips = 0;
    let totalTrades = 0;
    for (const r of arr) {
      totalProfit += r.sumProfit;
      totalPips += r.sumPips;
      totalTrades += r.tradeCount;
    }
    let cum = 0;
    let levelIndex = 0;
    let firstPositiveLevel = null;
    const rowsOut = [];

    for (const r of arr) {
      levelIndex++;
      cum += r.sumProfit;
      if (cum >= 0 && firstPositiveLevel == null)
        firstPositiveLevel = levelIndex;

      rowsOut.push({
        symbol,
        side,
        level: levelIndex,
        lots: r.lots,
        levelTrades: r.tradeCount,
        levelSumProfit: r.sumProfit,
        levelSumPips: r.sumPips,
        cumulativeProfit: cum,
        totalProfit,
        totalPips,
        totalTrades
      });
    }

    tablePerSide.push({
      symbol,
      side,
      totalProfit,
      totalPips,
      totalTrades,
      rows: rowsOut,
      firstPositiveLevel,
      maxLevel: levelIndex
    });

    martinSummary.totalProfit += totalProfit;
    if (levelIndex > martinSummary.maxLevel)
      martinSummary.maxLevel = levelIndex;

    if (totalProfit < 0) {
      martinSummary.worstSideNegative = {
        symbol,
        side,
        totalProfit
      };
    }
    if (
      martinSummary.firstPositiveLevel == null &&
      firstPositiveLevel != null
    ) {
      martinSummary.firstPositiveLevel = firstPositiveLevel;
    } else if (
      firstPositiveLevel != null &&
      firstPositiveLevel <
        (martinSummary.firstPositiveLevel || Number.MAX_SAFE_INTEGER)
    ) {
      martinSummary.firstPositiveLevel = firstPositiveLevel;
    }
  }

  return { tablePerSide, martinSummary };
}

function renderMartinTables(symbol, tablePerSide) {
  const container = document.getElementById("martinTables");
  container.innerHTML = "";
  tablePerSide.forEach((block) => {
    const title = document.createElement("div");
    title.className = "martin-header";
    const totalClass =
      block.totalProfit < 0 ? "row-total-negative" : "row-total-positive";
    title.innerHTML = `${symbol} - ${block.side} (Total Profit: <span class="${totalClass}">${block.totalProfit.toFixed(
      2
    )}</span>, Trades: ${block.totalTrades})`;
    container.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "martin-table-wrapper";
    const table = document.createElement("table");
    table.className = "martin-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>層數</th>
          <th>Lots</th>
          <th>開單數量</th>
          <th>該層SUM Profit</th>
          <th>該層SUM Pips</th>
          <th>由第1層累積Profit</th>
          <th>Symbol+Side TOTAL Profit</th>
          <th>Total Trades</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    block.rows.forEach((r) => {
      const tr = document.createElement("tr");

      let cls = "";
      if (block.totalProfit < 0) {
        cls = "row-total-negative";
      } else if (block.firstPositiveLevel != null) {
        if (r.level < block.firstPositiveLevel) cls = "level-risk";
        else cls = "level-safe";
      }
      if (cls) tr.classList.add(cls);

      tr.innerHTML = `
        <td>${r.level}</td>
        <td>${r.lots.toFixed(2)}</td>
        <td>${r.levelTrades}</td>
        <td>${r.levelSumProfit.toFixed(2)}</td>
        <td>${r.levelSumPips.toFixed(1)}</td>
        <td>${r.cumulativeProfit.toFixed(2)}</td>
        <td>${r.totalProfit.toFixed(2)}</td>
        <td>${r.totalTrades}</td>
      `;
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    container.appendChild(wrap);
  });
}

// ---------- MFE / MAE / Holding ----------
function renderMfeMaeHoldingCharts(trades) {
  const mfeCtx = document.getElementById("mfeChart").getContext("2d");
  const maeCtx = document.getElementById("maeChart").getContext("2d");
  const holdCtx = document.getElementById("holdingChart").getContext("2d");

  if (mfeChart) mfeChart.destroy();
  if (maeChart) maeChart.destroy();
  if (holdingChart) holdingChart.destroy();

  const xKey = mfeMaeMode === "pips" ? "netPips" : "netProfit";

  const mfeData = trades.map((t) => ({
    x: t[xKey],
    y: t.mfe,
    c: t.netProfit >= 0 ? "#16a34a" : "#dc2626"
  }));
  const maeData = trades.map((t) => ({
    x: t[xKey],
    y: t.mae,
    c: t.netProfit >= 0 ? "#16a34a" : "#dc2626"
  }));
  const holdData = trades.map((t) => ({
    x: t[xKey],
    y: t.holdingDays,
    c: t.netProfit >= 0 ? "#16a34a" : "#dc2626"
  }));

  const xTitle =
    mfeMaeMode === "pips" ? "Result (Net Pips)" : "Result (Net Profit)";

  mfeChart = new Chart(mfeCtx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "MFE vs Result",
          data: mfeData,
          backgroundColor: mfeData.map((d) => d.c)
        }
      ]
    },
    options: {
      parsing: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: xTitle } },
        y: { title: { display: true, text: "MFE (pips)" } }
      }
    }
  });

  maeChart = new Chart(maeCtx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "MAE vs Result",
          data: maeData,
          backgroundColor: maeData.map((d) => d.c)
        }
      ]
    },
    options: {
      parsing: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: xTitle } },
        y: { title: { display: true, text: "MAE (pips)" } }
      }
    }
  });

  holdingChart = new Chart(holdCtx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Holding Time vs Result",
          data: holdData,
          backgroundColor: holdData.map((d) => d.c)
        }
      ]
    },
    options: {
      parsing: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: xTitle } },
        y: { title: { display: true, text: "Holding Time (days)" } }
      }
    }
  });
}

// ---------- SWOT ----------
function renderSwot(swot) {
  if (!swot) return;

  document.getElementById("swotST").innerHTML =
    "<strong>ST</strong><br>" + swot.ST.join("<br>");
  document.getElementById("swotS").innerHTML =
    "<strong>S</strong><br>" + swot.S.join("<br>");
  document.getElementById("swotSW").innerHTML =
    "<strong>SW</strong><br>" + swot.SW.join("<br>");

  document.getElementById("swotT").innerHTML =
    "<strong>T</strong><br>" + swot.T.join("<br>");
  document.getElementById("swotW").innerHTML =
    "<strong>W</strong><br>" + swot.W.join("<br>");

  document.getElementById("swotOT").innerHTML =
    "<strong>OT</strong><br>" + swot.OT.join("<br>");
  document.getElementById("swotO").innerHTML =
    "<strong>O</strong><br>" + swot.O.join("<br>");
  document.getElementById("swotOW").innerHTML =
    "<strong>OW</strong><br>" + swot.OW.join("<br>");

  const eaCenterText = document.getElementById("eaCenterAnalysis");
  eaCenterText.innerHTML = swot.centerAnalysis
    ? swot.centerAnalysis.join("<br>")
    : "";
}
