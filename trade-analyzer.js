// trade-analyzer.js
// v0.0260308004
// CSV → 帳戶摘要 + 圖表 + All Symbols / 各貨幣按鈕 +
// 馬丁表 + MFE/MAE (Pips / Money) + SWOT
// + Symbol 累積 Profit 小圖 + Reset
// + Symbol 深入分析：Cumulative / Weekday / Hourly Profit & Count
// + Dark/Light Theme Switch + Cumulative All / Separate Switch
// + 帳戶統計、Symbol 指標 (原本 2 行) + 新 4-columns Symbol Advanced 指標
// + Menu Section (1 & 2 中間) 按開始分析顯示、Reset 隱藏

const ACCOUNT_CCY = 'USD';

let globalTrades = [];
let globalBySymbol = {};
let globalEAKey = "SMA";

let equityChart, weekdayChart, symbolProfitChart;
let mfeChart, maeChart, holdingChart;
let symbolCumulativeChart, symbolWeekdayProfitChart, symbolWeekdayCountChart;
let symbolHourlyProfitChart, symbolHourlyCountChart;

let mfeMaeMode = "pips";      // "pips" | "money"
let cumulativeMode = "all";   // "all" | "separate"

// ---------- Theme Switch (Dark / Light) ----------
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

// Analyze button / Reset button 事件綁定會喺 C 段 DOMContentLoaded 再做

// ---------- CSV 解析（新版，支援 Commission / Swap / Max Profit 等） ----------
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

  const iOpenTime = idx("open time") !== -1 ? idx("open time") : idx("Open Time");
  const iCloseTime = idx("close time") !== -1 ? idx("close time") : idx("Close Time");
  const iType = idx("type");
  const iLots = idx("lots") !== -1 ? idx("lots") : idx("volume");
  const iSymbol = idx("symbol");
  const iNetProfit =
    idx("net profit") !== -1 ? idx("net profit") : idx("profit");
  const iNetPips =
    idx("net pips") !== -1 ? idx("net pips") : idx("pips");

  // 新增欄位
  const iCommission = idx("commission");
  const iSwap = idx("swap");
  const iMaxProfit = idx("max profit");
  const iMaxPips = idx("max pips");
  const iMaxLoss = idx("max loss");
  const iMaxLossPips = idx("max loss pips");
  const iMagic = idx("magic number");
  const iComment = idx("comment");
  const iHoldHours =
    idx("holding time (hours)") !== -1
      ? idx("holding time (hours)")
      : idx("holding time in hours");
  const iHold = iHoldHours === -1 ? idx("holding time") : -1;

  const trades = [];

  for (let i = 1; i < lines.length; i++) {
    const rowRaw = lines[i];
    if (!rowRaw.trim()) continue;
    const cells = rowRaw.split(",");

    if (iType < 0 || iSymbol < 0) continue;
    const type = (cells[iType] || "").trim().toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    const symbol = (cells[iSymbol] || "").trim();
    if (!symbol) continue;

    const parseNum = (v) => {
      const n = parseFloat((v || "").replace(/"/g, "").trim());
      return isNaN(n) ? 0 : n;
    };

    const t = {
      openTime: iOpenTime >= 0 ? cells[iOpenTime] || "" : "",
      closeTime: iCloseTime >= 0 ? cells[iCloseTime] || "" : "",
      type,
      symbol,
      lots: iLots >= 0 ? parseNum(cells[iLots]) : 0,
      netProfit: iNetProfit >= 0 ? parseNum(cells[iNetProfit]) : 0,
      netPips: iNetPips >= 0 ? parseNum(cells[iNetPips]) : 0,
      // 原有 MFE/MAE
      mfe: 0,
      mae: 0,
      holdingRaw: "",
      holdingDays: 0,
      // 新增欄位
      commission: iCommission >= 0 ? parseNum(cells[iCommission]) : 0,
      swap: iSwap >= 0 ? parseNum(cells[iSwap]) : 0,
      maxProfit: iMaxProfit >= 0 ? parseNum(cells[iMaxProfit]) : 0,
      maxPips: iMaxPips >= 0 ? parseNum(cells[iMaxPips]) : 0,
      maxLoss: iMaxLoss >= 0 ? parseNum(cells[iMaxLoss]) : 0,
      maxLossPips: iMaxLossPips >= 0 ? parseNum(cells[iMaxLossPips]) : 0,
      magic: iMagic >= 0 ? (cells[iMagic] || "").trim() : "",
      comment: iComment >= 0 ? (cells[iComment] || "").trim() : ""
    };

    // 若有舊欄位 MFE/MAE，照舊讀
    const iMFE = idx("mfe") !== -1 ? idx("mfe") : idx("max profit pips");
    const iMAE = idx("mae") !== -1 ? idx("mae") : idx("max loss pips");
    if (iMFE >= 0) t.mfe = parseNum(cells[iMFE]);
    if (iMAE >= 0) t.mae = parseNum(cells[iMAE]);

    if (iHoldHours >= 0) {
      const v = cells[iHoldHours] || "";
      t.holdingRaw = v;
      t.holdingDays = parseFloat(v) ? parseFloat(v) / 24.0 : 0;
    } else if (iHold >= 0) {
      t.holdingRaw = cells[iHold] || "";
      t.holdingDays = parseHoldingToDays(t.holdingRaw);
    }

    trades.push(t);
  }

  globalTrades = trades;
  globalBySymbol = groupBySymbol(trades);
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
// ---------- Symbol Advanced Stats (004) ----------

function formatMoney(v) {
  return `${v.toFixed(2)} ${ACCOUNT_CCY}`;
}

function formatPercent(v) {
  return `${v.toFixed(2)} %`;
}

function safeDiv(num, den) {
  return den === 0 ? 0 : num / den;
}

function buildSymbolAdvancedStats(trades) {
  const bySymbol = {};
  for (const t of trades) {
    if (!t.symbol) continue;
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }

  const result = [];

  for (const symbol of Object.keys(bySymbol)) {
    const list = bySymbol[symbol].slice().sort((a, b) => {
      const ta = a.closeTime || a.openTime || "";
      const tb = b.closeTime || b.openTime || "";
      return ta.localeCompare(tb);
    });

    const totalTrades = list.length;
    let grossProfit = 0;
    let grossLoss = 0;
    let netProfit = 0;

    let profitTrades = 0;
    let lossTrades = 0;

    let longTrades = 0;
    let shortTrades = 0;

    let sumProfitWins = 0;
    let sumProfitLoss = 0;

    let bestTrade = -Infinity;
    let worstTrade = Infinity;

    let maxConsecWins = 0;
    let maxConsecLosses = 0;
    let curConsecWins = 0;
    let curConsecLosses = 0;

    let maxConsecProfit = 0;
    let maxConsecLoss = 0;
    let curConsecProfit = 0;
    let curConsecLoss = 0;
    let maxConsecProfitTrades = 0;
    let maxConsecLossTrades = 0;
    let curConsecProfitTrades = 0;
    let curConsecLossTrades = 0;

    let totalSwap = 0;
    let totalCommission = 0;

    let sumHoldingHours = 0;
    let tradeWithHolding = 0;

    let equity = 0;
    let peakEquity = 0;
    let maxDrawdown = 0;

    const now = new Date();
    let latestClose = null;

    for (const t of list) {
      const p = t.netProfit;
      netProfit += p;
      totalSwap += t.swap || 0;
      totalCommission += t.commission || 0;

      if (p > 0) {
        grossProfit += p;
        profitTrades += 1;
        sumProfitWins += p;
      } else if (p < 0) {
        grossLoss += Math.abs(p);
        lossTrades += 1;
        sumProfitLoss += Math.abs(p);
      }

      if (p > bestTrade) bestTrade = p;
      if (p < worstTrade) worstTrade = p;

      if (t.type === "buy") longTrades++;
      if (t.type === "sell") shortTrades++;

      const hDays = t.holdingDays || 0;
      if (hDays > 0) {
        sumHoldingHours += hDays * 24;
        tradeWithHolding++;
      }

      equity += p;
      if (equity > peakEquity) peakEquity = equity;
      const dd = peakEquity - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (p > 0) {
        curConsecWins++;
        curConsecLosses = 0;
        if (curConsecWins > maxConsecWins) maxConsecWins = curConsecWins;

        curConsecProfit += p;
        curConsecLoss = 0;
        curConsecProfitTrades++;
        curConsecLossTrades = 0;
        if (curConsecProfit > maxConsecProfit) {
          maxConsecProfit = curConsecProfit;
          maxConsecProfitTrades = curConsecProfitTrades;
        }
      } else if (p < 0) {
        curConsecLosses++;
        curConsecWins = 0;
        if (curConsecLosses > maxConsecLosses) maxConsecLosses = curConsecLosses;

        curConsecLoss += Math.abs(p);
        curConsecProfit = 0;
        curConsecLossTrades++;
        curConsecProfitTrades = 0;
        if (curConsecLoss > maxConsecLoss) {
          maxConsecLoss = curConsecLoss;
          maxConsecLossTrades = curConsecLossTrades;
        }
      } else {
        curConsecWins = 0;
        curConsecLosses = 0;
        curConsecProfit = 0;
        curConsecLoss = 0;
        curConsecProfitTrades = 0;
        curConsecLossTrades = 0;
      }

      const ct = t.closeTime || t.openTime;
      if (ct && (!latestClose || ct > latestClose)) latestClose = ct;
    }

    const winRate = safeDiv(profitTrades * 100, totalTrades);
    const lossRate = safeDiv(lossTrades * 100, totalTrades);
    const profitFactor = grossLoss === 0 ? 0 : grossProfit / grossLoss;
    const expectedPayoff = safeDiv(netProfit, totalTrades);
    const avgProfit = safeDiv(sumProfitWins, profitTrades);
    const avgLoss = safeDiv(sumProfitLoss, lossTrades);
    const avgHoldingHours = safeDiv(sumHoldingHours, tradeWithHolding);
    const recoveryFactor = maxDrawdown === 0 ? 0 : netProfit / maxDrawdown;

    let latestTradeDaysAgo = null;
    if (latestClose) {
      const diffMs = new Date(latestClose).getTime() - now.getTime();
      latestTradeDaysAgo = -diffMs / (1000 * 60 * 60 * 24);
    }

    result.push({
      symbol,
      totalTrades,
      profitTrades,
      lossTrades,
      winRate,
      lossRate,
      grossProfit,
      grossLoss,
      netProfit,
      bestTrade,
      worstTrade,
      profitFactor,
      expectedPayoff,
      avgProfit,
      avgLoss,
      maxConsecWins,
      maxConsecLosses,
      maxConsecProfit,
      maxConsecProfitTrades,
      maxConsecLoss,
      maxConsecLossTrades,
      longTrades,
      shortTrades,
      totalSwap,
      totalCommission,
      avgHoldingHours,
      maxDrawdown,
      recoveryFactor,
      latestTradeDaysAgo
    });
  }

  return result;
}

function renderSymbolAdvancedStats(symbolStats) {
  const container = document.getElementById("symbolStats");
  if (!container) return;

  // 先清空，再畫 4-columns block（你原本 2 行簡略指標可以搬去其他地方）
  container.innerHTML = "";

  const stats = symbolStats.slice().sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  for (const s of stats) {
    const block = document.createElement("div");
    block.className = "symbol-block";
    block.style.border = "1px solid #ccc";
    block.style.padding = "8px";
    block.style.marginBottom = "12px";

    const title = document.createElement("h3");
    title.textContent = s.symbol;
    block.appendChild(title);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
    grid.style.gap = "6px 16px";

    const addRow = (label, value) => {
      const item = document.createElement("div");
      item.innerHTML = `<strong>${label}</strong><br>${value}`;
      grid.appendChild(item);
    };

    addRow("Trades", s.totalTrades.toString());
    addRow("Profit trades", `${s.profitTrades} (${formatPercent(s.winRate)})`);
    addRow("Loss trades", `${s.lossTrades} (${formatPercent(s.lossRate)})`);
    addRow("Net profit", formatMoney(s.netProfit));

    addRow("Gross profit", formatMoney(s.grossProfit));
    addRow("Gross loss", formatMoney(-s.grossLoss));
    addRow("Best trade", formatMoney(s.bestTrade));
    addRow("Worst trade", formatMoney(s.worstTrade));

    addRow("Profit factor", s.profitFactor.toFixed(2));
    addRow("Expected payoff", formatMoney(s.expectedPayoff));
    addRow("Average profit", formatMoney(s.avgProfit));
    addRow("Average loss", formatMoney(-s.avgLoss));

    addRow("Max consec wins", `${s.maxConsecWins}`);
    addRow("Max consec losses", `${s.maxConsecLosses}`);
    addRow(
      "Max consec profit",
      `${formatMoney(s.maxConsecProfit)} (${s.maxConsecProfitTrades} trades)`
    );
    addRow(
      "Max consec loss",
      `${formatMoney(-s.maxConsecLoss)} (${s.maxConsecLossTrades} trades)`
    );

    addRow("Long trades", s.longTrades.toString());
    addRow("Short trades", s.shortTrades.toString());
    addRow("Swaps", formatMoney(s.totalSwap));
    addRow("Commission", formatMoney(s.totalCommission));

    addRow("Avg holding (hrs)", s.avgHoldingHours.toFixed(2));
    addRow("Max drawdown", formatMoney(-s.maxDrawdown));
    addRow("Recovery factor", s.recoveryFactor.toFixed(2));
    addRow(
      "Latest trade (days ago)",
      s.latestTradeDaysAgo != null
        ? s.latestTradeDaysAgo.toFixed(2)
        : "N/A"
    );

    block.appendChild(grid);
    container.appendChild(block);
  }
}
function buildAll() {
  // 你原本已有的 account summary / charts / symbol buttons / martin / swot 等
  // ...

  const symbolAdv = buildSymbolAdvancedStats(globalTrades);
  renderSymbolAdvancedStats(symbolAdv);
}
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

    const menuSection = document.getElementById("menuSection");
    if (menuSection) menuSection.style.display = "block";
  };
  reader.readAsText(file);
}

function resetView() {
  globalTrades = [];
  globalBySymbol = {};

  // 清空各種 DOM / charts（保持你原本 logic，下面只示意）
  const idsToClear = [
    "accountStats",
    "minimumArea",
    "symbolButtons",
    "symbolMiniCharts",
    "symbolStats",
    "martinTables",
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
  idsToClear.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

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

  const summarySection = document.getElementById("summaryCardsSection");
  const accountSection = document.getElementById("accountSection");
  const symbolSection = document.getElementById("symbolSection");
  const symbolDetailSection = document.getElementById("symbolDetailSection");
  const martinSection = document.getElementById("martinSection");
  const swotSection = document.getElementById("swotSection");

  [summarySection, accountSection, symbolSection, symbolDetailSection, martinSection, swotSection].forEach(
    (sec) => {
      if (sec) sec.style.display = "none";
    }
  );

  // 隱藏 Menu Section
  const menuSection = document.getElementById("menuSection");
  if (menuSection) menuSection.style.display = "none";
}

function setupMenuBar() {
  const menu = document.querySelector(".main-menu");
  if (!menu) return;

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    const targetId = btn.dataset.target;
    const section = document.getElementById(targetId);
    if (!section) return;

    section.style.display = "block";
    section.scrollIntoView({ behavior: "smooth", block: "start" });

    menu.querySelectorAll("button").forEach((b) =>
      b.classList.remove("active")
    );
    btn.classList.add("active");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) analyzeBtn.addEventListener("click", handleAnalyze);

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetView);

  setupMenuBar();
});
