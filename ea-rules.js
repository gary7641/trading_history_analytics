// ea-rules.js
// 定義各 EA 的基本屬性 + SWOT 規則，俾 trade-analyzer.js 用

// EA 規則主表
const EA_RULES = {
  SMA: {
    key: "SMA",
    name: "SMA (Standard)",
    martin: true,
    riskLevel: "medium",
    style: "trend-follow",
    comment:
      "標準 SMA EA，偏中長線，容許一定回撤，用馬丁層數做加倉。"
  },

  SMA_Pro: {
    key: "SMA_Pro",
    name: "SMA Pro",
    martin: true,
    riskLevel: "medium-high",
    style: "trend-follow",
    comment:
      "SMA Pro 版本，提升入場頻率與倉位調整，盈利潛力較高，同時風險較進取。"
  },

  MKD: {
    key: "MKD",
    name: "MKD (Standard)",
    martin: true,
    riskLevel: "high",
    style: "counter-trend",
    comment:
      "MKD 標準版偏向逆勢 / 回調加倉，適合側向或區間市，趨勢市時要控風險。"
  },

  MKD_Pro: {
    key: "MKD_Pro",
    name: "MKD Pro",
    martin: true,
    riskLevel: "very-high",
    style: "aggressive-grid",
    comment:
      "MKD Pro 版本屬高風險高回報格局，需要嚴格控倉及最大回撤限制。"
  },

  Flash: {
    key: "Flash",
    name: "Flash (Standard)",
    martin: false,
    riskLevel: "medium",
    style: "scalping",
    comment:
      "Flash 標準版偏短線 / Scalping，單筆持倉時間較短，靠交易次數累積盈虧。"
  },

  Flash_Pro: {
    key: "Flash_Pro",
    name: "Flash Pro",
    martin: false,
    riskLevel: "medium-high",
    style: "scalping-aggressive",
    comment:
      "Flash Pro 增加槓桿與頻率，適合點差 / 執行質素較好帳戶。"
  },

  S10: {
    key: "S10",
    name: "S10 (Standard)",
    martin: false,
    riskLevel: "medium",
    style: "swing",
    comment:
      "S10 標準版偏 swing / 波段，持倉時間比 Flash 長，追求較平滑曲線。"
  },

  S10_Pro: {
    key: "S10_Pro",
    name: "S10 Pro",
    martin: false,
    riskLevel: "medium-high",
    style: "swing-aggressive",
    comment:
      "S10 Pro 在波段邏輯上加強倉位與入場密度，表現好時增長快，遇連虧要嚴控。"
  },

  OtherBasic: {
    key: "OtherBasic",
    name: "Other EA (Basic)",
    martin: false,
    riskLevel: "unknown",
    style: "generic",
    comment:
      "未指定分類的一般 EA，按實際交易數據做中性分析。"
  },

  OtherPro: {
    key: "OtherPro",
    name: "Other EA (Pro)",
    martin: true,
    riskLevel: "unknown-high",
    style: "generic-martin",
    comment:
      "未指定分類但有馬丁 / 加倉特性，建議以最大回撤與層數作主要風險指標。"
  }
};

/**
 * 根據 EA 種類 + Symbol + 統計數據 + 馬丁摘要，生成 SWOT 分析
 * @param {string} eaKey
 * @param {string} symbol
 * @param {object} stats
 * @param {object|null} martinSummary
 * @returns {object} { ST, S, SW, T, W, OT, O, OW, centerAnalysis }
 */
function buildSwotForEA(eaKey, symbol, stats, martinSummary) {
  const rule = EA_RULES[eaKey] || EA_RULES.OtherBasic;
  const isAll = symbol === "ALL";
  const labelSymbol = isAll ? "整體組合" : `Symbol：${symbol}`;

  const totalTrades = stats ? stats.totalTrades : 0;
  const winRate = stats ? stats.winRate : 0;
  const lossRate = stats ? stats.lossRate : 0;
  const pf = stats ? stats.profitFactor : 0;
  const expectancy = stats ? stats.expectancy : 0;
  const maxDD = stats ? stats.maxDrawdown : 0;
  const maxConsecLoss = stats ? stats.maxConsecLoss : 0;
  const netProfit =
    stats && stats.grossProfit != null && stats.grossLoss != null
      ? stats.grossProfit - stats.grossLoss
      : 0;

  const hasMartin = !!rule.martin;
  const martinTotalProfit =
    martinSummary && martinSummary.totalProfit != null
      ? martinSummary.totalProfit
      : null;
  const martinFirstPositiveLevel =
    martinSummary && martinSummary.firstPositiveLevel != null
      ? martinSummary.firstPositiveLevel
      : null;
  const martinMaxLevel =
    martinSummary && martinSummary.maxLevel != null
      ? martinSummary.maxLevel
      : null;

  // ==== Helper: 按數值用文字歸類 ====
  function gradePF(pfVal) {
    if (!isFinite(pfVal) || pfVal <= 0) return "非常弱";
    if (pfVal < 1) return "偏弱";
    if (pfVal < 1.5) return "一般";
    if (pfVal < 2) return "不錯";
    if (pfVal < 3) return "強";
    return "非常強";
  }

  function gradeWinRate(w) {
    const p = w * 100;
    if (p < 40) return "低勝率策略";
    if (p < 55) return "中性勝率";
    if (p < 65) return "不錯勝率";
    return "高勝率";
  }

  function gradeDD(dd) {
    if (dd <= 0) return "幾乎無回撤";
    if (dd < 500) return "溫和回撤";
    if (dd < 1500) return "中等回撤";
    return "偏大回撤";
  }

  // ==== 初始化 SWOT 區 ====
  const ST = [];
  const S = [];
  const SW = [];
  const T = [];
  const W = [];
  const OT = [];
  const O = [];
  const OW = [];

  // ==== S / W 基於 stats ====
  if (totalTrades > 0) {
    S.push(`已完成交易數 ${totalTrades} 單，樣本量足夠作實戰評估。`);
  } else {
    W.push("交易樣本量不足，暫時難以評估 EA 穩定性。");
  }

  if (winRate > 0) {
    S.push(`${gradeWinRate(winRate)}，實際勝率約 ${(winRate * 100).toFixed(
      1
    )}%。`);
  }

  if (pf > 0) {
    const pfText =
      pf === Infinity ? "Profit Factor 無限（理論上極強）" : `PF 約 ${pf.toFixed(
        2
      )}，屬 ${gradePF(pf)}。`;
    S.push(pfText);
  } else {
    W.push("Profit Factor 低於 1，長線未必有優勢，需要優化策略或風控。");
  }

  if (expectancy > 0) {
    S.push(
      `每單期望值為正（約 ${expectancy.toFixed(
        2
      )}），長期理論上有正向優勢。`
    );
  } else if (expectancy < 0) {
    W.push(
      `每單期望值為負（約 ${expectancy.toFixed(
        2
      )}），需調整進出場或風險管理。`
    );
  }

  if (maxDD > 0) {
    const ddText = gradeDD(maxDD);
    W.push(
      `歷史最大回撤約 ${maxDD.toFixed(2)}，屬 ${ddText}，資金管理需按此作上限。`
    );
  }

  if (maxConsecLoss > 0) {
    W.push(
      `最大連續虧損約 ${maxConsecLoss} 單，建議資金規劃要承受至少此級別連虧。`
    );
  }

  if (netProfit > 0) {
    S.push(`歷史淨盈利為正（約 ${netProfit.toFixed(2)}），整體表現具增長性。`);
  } else if (netProfit < 0) {
    W.push(
      `目前淨盈利為負（約 ${netProfit.toFixed(2)}），仍處於回撤或未完成調整期。`
    );
  }

  // ==== 馬丁相關（Martin） ====
  if (hasMartin) {
    ST.push("利用馬丁 / 加倉結構，可以在高勝率區間放大盈利。");
    SW.push(
      "若遇趨勢反向或長時間不反轉，加倉容易令回撤迅速放大。"
    );

    if (martinTotalProfit != null) {
      if (martinTotalProfit > 0) {
        S.push(
          `馬丁整體結果為正（約 ${martinTotalProfit.toFixed(
            2
          )}），代表加倉邏輯目前仍然可控。`
        );
      } else if (martinTotalProfit < 0) {
        W.push(
          `馬丁整體結果為負（約 ${martinTotalProfit.toFixed(
            2
          )}），需重新檢視層數與 grid 距離。`
        );
      }
    }

    if (martinFirstPositiveLevel != null && martinMaxLevel != null) {
      ST.push(
        `由第 ${martinFirstPositiveLevel} 層開始轉正，最大層數為 ${martinMaxLevel} 層，可作為風險上限參考。`
      );
    } else if (martinMaxLevel != null) {
      SW.push(
        `歷史最大層數達 ${martinMaxLevel} 層，但未必每次都成功轉正，需保守設定最大層數。`
      );
    }

    OT.push(
      "在波動但無明顯趨勢的市況，馬丁結構有機會快速修復回撤。"
    );
    OW.push(
      "遇到單邊行情或政策消息，馬丁結構有機會觸及極限層數，甚至爆倉。"
    );
  } else {
    S.push("此 EA 不依賴馬丁加倉，回撤通常較易控制，風險結構較清晰。");
    O.push("可視乎帳戶風險承受度，酌量加入輕量級加倉或分批策略。");
  }

  // ==== 針對不同 EA 類型 的威脅 / 機會 ====
  if (rule.style === "trend-follow") {
    O.push("在有明確方向的趨勢市中，順勢策略有機會拉開淨盈利差距。");
    T.push(
      "長時間橫盤或假突破頻發時，趨勢策略容易頻繁止損，影響心態。"
    );
  } else if (rule.style === "counter-trend") {
    T.push(
      "遇到強單邊行情（例如大跌或大升趨勢）時，逆勢 / grid 策略風險急升。"
    );
  } else if (rule.style === "scalping" || rule.style === "scalping-aggressive") {
    T.push(
      "在點差擴大、交易成本高或滑點明顯環境，短線 Scalping 容易由盈轉虧。"
    );
  } else if (rule.style === "swing" || rule.style === "swing-aggressive") {
    T.push(
      "若市場缺乏方向、波動不足，波段策略可能長時間無單或盈利效率下降。"
    );
  }

  if (rule.riskLevel === "very-high" || rule.riskLevel === "high") {
    SW.push("整體風險屬偏高 / 非常高，需要嚴格控制單帳戶資金比例。");
    OW.push("建議分散多帳戶或多策略運行，減少單一 EA 失效時的致命影響。");
  } else if (rule.riskLevel === "medium-high") {
    SW.push("風險屬中高，需要配合稍保守槓桿與出金節奏。");
  } else if (rule.riskLevel === "medium") {
    ST.push("在合理資金管理下，整體風險屬中等，可長期觀察與持續運行。");
  }

  if (rule.comment) {
    O.push(`策略說明：${rule.comment}`);
  }

  // ==== 中心文字 (EA 總結 / 建議) ====
  const centerAnalysis = [];

  centerAnalysis.push(`${rule.name} – ${labelSymbol}`);
  centerAnalysis.push(
    `目前屬 ${rule.riskLevel} 風險等級，PF / 勝率 / 回撤綜合表現需要配合資金管理使用。`
  );
  if (hasMartin) {
    centerAnalysis.push(
      "建議重點監察：最大回撤、最大層數、單邊市表現，必要時人工暫停。"
    );
  } else {
    centerAnalysis.push(
      "建議重點監察：連續虧損段的長度及頻率，配合止損線及出金節奏。"
    );
  }

  if (expectancy > 0) {
    centerAnalysis.push(
      "期望值為正，可視為具備長線優勢的 EA，重點在於風險控制與心理承受度。"
    );
  } else if (expectancy < 0) {
    centerAnalysis.push(
      "期望值暫時為負，建議先以小倉位或模擬帳戶測試，再決定是否長期實盤。"
    );
  }

  return {
    ST,
    S,
    SW,
    T,
    W,
    OT,
    O,
    OW,
    centerAnalysis
  };
}
