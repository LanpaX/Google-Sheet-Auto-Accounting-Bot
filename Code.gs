/**
 * 全自動記帳系統 V4.0 (Spend Analytics 強化版)
 *
 * 🆕 V4 更新亮點 (對應企業採購分析框架):
 *  1. 📊 異常偵測   月支出 > 平均 + 2σ 時自動標紅 (Spend Variance Alert)
 *  2. 📈 類別 KPI   筆數 / 平均單筆 / 占比 (Category Deep Dive)
 *  3. 🎯 Pareto     Top 20% 商家貢獻分析 (Supplier Concentration / 80-20)
 *  4. 📉 MoM / YoY  月增率與年增率 (Spend Trend Analysis)
 *
 * Procurement Mapping (履歷 / 面試敘事用):
 *   個人記帳        → Personal Spend Analytics
 *   8 大商家分類    → Category Management
 *   Top 5 商家排行  → Vendor Concentration / Tail Spend Analysis
 *   異常標紅        → Spend Variance & Anomaly Detection
 *   MoM / YoY       → Spend Trend Analysis
 */

// ==========================================
// ⚙️ 設定區
// ==========================================
var CONFIG = {
  WAR_ROOM_SHEET_NAME: "📊 總戰情室",
  EMAIL_QUERY: 'from:cathaybk.com.tw subject:"消費彙整通知" is:unread',

  // 🆕 異常偵測閾值 (標準差倍數,2 ≒ 95% 信賴區間外)
  ANOMALY_SIGMA: 2,
  // 🆕 Pareto 分析:Top % 商家、與額外列出的 Top N
  PARETO_TOP_PCT: 0.20,
  PARETO_TOP_N: 5,

  // 注意:keyword 比對前會先做「全形→半形 + 移除引號 + toUpperCase」正規化
  // 所以 keyword 寫半形 + 任意大小寫即可,引號要不要寫都行
  CATEGORIES: {
    "🍔 餐飲美食": ["餐飲", "星巴克", "麥當勞", "路易莎", "餐廳", "EAT", "FOOD", "咖啡", "食品", "小吃", "早餐", "午餐", "晚餐", "雞肉飯", "BAKERY"],
    "🥦 雜貨超商": ["統一超商", "7-ELEVEN", "全家", "FamilyMart", "全聯", "超市", "量販", "家樂福", "美廉社", "OP錢包", "日常支出", "SAFEWAY", "OK超商"],
    "🛍️ 生活購物": ["一般購物", "蝦皮", "MOMO", "PCHOME", "百貨", "UNIQLO", "IKEA", "服飾", "休閒用品", "GlobalMall", "家電", "TAOBAO", "Newbalance", "燦坤", "陳守"],
    "⛽ 交通出行": ["交通", "運輸", "臺灣鐵路", "臺鐵", "高鐵", "捷運", "悠遊卡", "中油", "台塑", "加油", "停車", "UBER", "TAXI", "微笑單車", "監理所", "車麗屋"],
    "✈️ 旅遊出行": ["HOTEL", "飯店", "住宿", "旅行社", "Booking", "BKG", "STARLUX", "星宇", "華航", "長榮航", "TWAY", "Airbnb", "Agoda", "民宿", "LONDON", "KLOOK", "Golden Gate"],
    "📺 數位娛樂": ["NETFLIX", "SPOTIFY", "YOUTUBE", "APPLE", "GOOGLE", "STEAM", "CLIPPER", "娛樂", "威秀", "影城"],
    "🏥 醫療保健": ["醫院", "診所", "藥局", "屈臣氏", "康是美", "醫療救護"],
    "🛡️ 保險": ["保險", "富邦產物", "國泰人壽", "新光人壽"],
    "🎓 教育學習": ["學費", "註冊費", "教育", "學雜費", "TUITION", "臺灣銀行", "台灣銀行", "書局", "誠品", "金石堂", "電腦技能基金會", "Kobo", "博客來", "LEADERSHIP"],
    "🏦 提款轉帳": ["提款", "轉帳", "CASH", "全支付"],
    "🏠 房屋雜費": ["房租", "水費", "電費", "瓦斯", "管理費", "中華電信"],
    "🪙 投資支出": ["定期定額", "Alchemy", "alchemypay", "AlchemyPay", "MAX交易所", "BitoPro", "幣安", "Binance", "加密"],
    "💰 個人收入": ["生活費", "獎助學金", "薪水", "薪資", "零用金", "家教", "收入"]
  },
  DEFAULT_CATEGORY: "其他支出"
};

// ==========================================
// 📱 iOS API (捷徑)
// ==========================================
function doPost(e) {
  var merchant = "未知項目";
  var finalAmount = "0";
  var category = "未知分類";

  try {
    var data = {};
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput("資料格式解析失敗");
    }

    var date = data.date ? new Date(data.date) : new Date();
    var year = date.getFullYear().toString();

    var rawAmount = (data.amount || "").toString();
    var expenseVal = "";
    var incomeVal = "";
    var cleanAmount = parseFloat(rawAmount.replace(/[^0-9.]/g, ""));

    if (cleanAmount > 0) {
      if (rawAmount.indexOf("+") > -1) incomeVal = cleanAmount;
      else expenseVal = cleanAmount;
    }

    var inputType = data.type || "";
    merchant = data.note || data.type || "手動輸入";
    if (CONFIG.CATEGORIES[inputType]) {
      category = inputType;
    } else {
      category = determineCategory(inputType || merchant);
    }
    finalAmount = (incomeVal !== "") ? incomeVal : expenseVal;

    var sheet = getOrCreateSheet(year);
    writeRowToSheet(sheet, date, expenseVal, incomeVal, merchant, category, '📱 iOS捷徑');

    updateUnifiedWarRoom();

    return ContentService.createTextOutput("✅ 記帳成功!\n" +
      "💰 金額:$" + finalAmount + "\n" +
      "📝 項目:" + merchant + "\n" +
      "📂 分類:" + category
    );

  } catch (criticalErr) {
    return ContentService.createTextOutput("⚠️ 寫入失敗\n" + criticalErr.toString());
  }
}

// ==========================================
// 📩 自動抓取信用卡彙整郵件
// ==========================================
function processConsolidatedEmails() {
  var threads = GmailApp.search(CONFIG.EMAIL_QUERY);
  if (threads.length === 0) return;
  processThreadsBatch(threads, false);
}

function processThreadsBatch(threads, isTestMode) {
  var hasNewData = false;
  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    messages.forEach(function (msg) {
      if (!isTestMode && !msg.isUnread()) return;

      var body = msg.getPlainBody();
      var transactions = parseCathayEmail_V2(body);

      if (transactions.length > 0) {
        hasNewData = true;
        transactions.forEach(function (tx) {
          var date = new Date(tx.date);
          var year = date.getFullYear().toString();
          var sheet = getOrCreateSheet(year);
          var category = determineCategory(tx.merchant);

          writeRowToSheet(sheet, date, tx.amount, "", tx.merchant, category, '📧 國泰信箱');
        });
        if (!isTestMode) msg.markRead();
      }
    });
  });

  if (hasNewData) {
    updateUnifiedWarRoom();
  }
}

function parseCathayEmail_V2(body) {
  var lines = body.split('\n');
  var results = [];
  var tempDate = null;
  var dateRegex = /(\d{4}\/\d{1,2}\/\d{1,2})/;
  var amountLineRegex = /NT\$\s*([\d,]+)\s+([^\s]+)/;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "") continue;
    var dateMatch = line.match(dateRegex);
    if (dateMatch) {
      tempDate = dateMatch[1];
      continue;
    }
    if (tempDate) {
      var moneyMatch = line.match(amountLineRegex);
      if (moneyMatch) {
        results.push({
          date: tempDate,
          amount: parseFloat(moneyMatch[1].replace(/,/g, "")),
          merchant: moneyMatch[2]
        });
      }
    }
  }
  return results;
}

// ==========================================
// 🧠 寫入工作表 (共用)
// ==========================================
function writeRowToSheet(sheet, dateObj, expense, income, note, category, source) {
  var dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy/MM/dd");
  sheet.insertRowsAfter(1, 1);
  var row = sheet.getRange(2, 1, 1, 6);
  row.setValues([[dateStr, expense, income, note, category, source]]);
  row.setBackground(null).setFontWeight("normal").setFontColor("black");
  sheet.getRange(2, 2, 1, 2).setNumberFormat("NT$#,##0");
}

function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["日期", "支出", "收入", "內容", "分類", "來源"]);
    sheet.setFrozenRows(1);
    // 🆕 新年度表放在戰情室之後 (位置 2),不要把戰情室擠開
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(2);
  }
  return sheet;
}

// ==========================================
// 👑 戰情室 Spend Analytics Dashboard
// ==========================================
function updateUnifiedWarRoom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var warRoom = ss.getSheetByName(CONFIG.WAR_ROOM_SHEET_NAME);
  if (!warRoom) {
    warRoom = ss.insertSheet(CONFIG.WAR_ROOM_SHEET_NAME, 0);
  } else {
    warRoom.clear();
  }
  // 戰情室固定在第一個 tab
  ss.setActiveSheet(warRoom);
  ss.moveActiveSheet(1);

  // 找出所有「四位數年份」工作表並倒序排列 (新到舊)
  var yearSheets = ss.getSheets().filter(function (s) {
    return s.getName().match(/^\d{4}$/);
  });
  yearSheets.sort(function (a, b) {
    return Number(b.getName()) - Number(a.getName());
  });

  // 維護「支出明細查詢」的年份下拉選單 (保留原邏輯)
  var querySheet = ss.getSheetByName("支出明細查詢");
  if (querySheet) {
    var yearsList = yearSheets.map(function (s) { return s.getName(); });
    if (yearsList.length > 0) {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(yearsList, true)
        .setAllowInvalid(false)
        .build();
      querySheet.getRange("B1").setDataValidation(rule);
    }
  }

  var currentRow = 1;

  yearSheets.forEach(function (sourceSheet) {
    var year = sourceSheet.getName();
    var prevSheet = ss.getSheetByName((Number(year) - 1).toString());

    var stats = calculateStatsForYear(sourceSheet, prevSheet);
    if (!stats) return;

    var report = buildYearReport(stats);
    currentRow = renderYearReport(warRoom, currentRow, year, report);
  });

  warRoom.autoResizeColumns(1, 14);
}

// ==========================================
// 📊 統計引擎 (純資料,沒有副作用)
// ==========================================
function calculateStatsForYear(sheet, prevYearSheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  var matrix = {};         // matrix[cat][month] = 月支出總額
  var countMatrix = {};    // countMatrix[cat][month] = 月交易筆數
  var merchantTotals = {}; // merchantTotals[name]   = 全年累計
  var categories = {};
  var hasData = false;

  data.forEach(function (row) {
    var d = new Date(row[0]);
    var amt = Number(row[1]); // 只看「支出」欄
    var note = (row[3] || "未知").toString();
    var cat = row[4] || CONFIG.DEFAULT_CATEGORY;

    if (isNaN(amt) || amt === 0) return;
    hasData = true;

    var month = d.getMonth() + 1;
    if (!matrix[cat]) { matrix[cat] = {}; countMatrix[cat] = {}; }
    matrix[cat][month] = (matrix[cat][month] || 0) + amt;
    countMatrix[cat][month] = (countMatrix[cat][month] || 0) + 1;

    merchantTotals[note] = (merchantTotals[note] || 0) + amt;
    categories[cat] = true;
  });

  if (!hasData) return null;

  // 上一年度月份合計 (給 YoY 用)
  var prevYearMonthly = {};
  if (prevYearSheet && prevYearSheet.getLastRow() >= 2) {
    var prevData = prevYearSheet.getRange(2, 1, prevYearSheet.getLastRow() - 1, 6).getValues();
    prevData.forEach(function (row) {
      var d = new Date(row[0]);
      var amt = Number(row[1]);
      if (isNaN(amt) || amt === 0) return;
      var month = d.getMonth() + 1;
      prevYearMonthly[month] = (prevYearMonthly[month] || 0) + amt;
    });
  }

  return {
    matrix: matrix,
    countMatrix: countMatrix,
    merchantTotals: merchantTotals,
    categories: Object.keys(categories).sort(),
    prevYearMonthly: prevYearMonthly
  };
}

// ==========================================
// 🏗️ 報表建構
// ==========================================
function buildYearReport(stats) {
  // ---------- Section 1: 類別 × 月份 矩陣 ----------
  var headers = ["支出類別"];
  for (var m = 1; m <= 12; m++) headers.push(m + "月");
  headers.push("🔥 總計");

  var mainTable = [headers];
  var monthlyTotals = {};
  var yearlyGrandTotal = 0;
  var anomalies = []; // {rowOffset, colOffset}  相對於資料起始行

  stats.categories.forEach(function (cat, catIdx) {
    var row = [cat];
    var catTotal = 0;
    var monthValues = [];

    for (var m = 1; m <= 12; m++) {
      var val = (stats.matrix[cat] && stats.matrix[cat][m]) || 0;
      monthValues.push(val);
      row.push(val === 0 ? "-" : val);
      catTotal += val;
      monthlyTotals[m] = (monthlyTotals[m] || 0) + val;
    }

    // 🚨 異常偵測:單月支出 > μ + Nσ 即標紅
    var nonZero = monthValues.filter(function (v) { return v > 0; });
    if (nonZero.length >= 3) {
      var mean = nonZero.reduce(function (a, b) { return a + b; }, 0) / nonZero.length;
      var variance = nonZero.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / nonZero.length;
      var std = Math.sqrt(variance);
      if (std > 0) {
        var threshold = mean + CONFIG.ANOMALY_SIGMA * std;
        for (var i = 0; i < 12; i++) {
          if (monthValues[i] > threshold) {
            anomalies.push({ rowOffset: catIdx + 1, colOffset: i + 2 });
          }
        }
      }
    }

    row.push(catTotal);
    mainTable.push(row);
    yearlyGrandTotal += catTotal;
  });

  // 每月總計列
  var totalRow = ["💰 每月總計"];
  for (var m = 1; m <= 12; m++) {
    var v = monthlyTotals[m] || 0;
    totalRow.push(v === 0 ? "-" : v);
  }
  totalRow.push(yearlyGrandTotal);
  mainTable.push(totalRow);

  // MoM (Month-over-Month) 變化
  var momRow = ["📊 MoM 變化"];
  for (var m = 1; m <= 12; m++) {
    var prev = monthlyTotals[m - 1] || 0;
    var curr = monthlyTotals[m] || 0;
    if (m === 1 || prev === 0 || curr === 0) {
      momRow.push("-");
    } else {
      var pct = ((curr - prev) / prev) * 100;
      momRow.push((pct >= 0 ? "+" : "") + pct.toFixed(1) + "%");
    }
  }
  momRow.push("-");
  mainTable.push(momRow);

  // YoY (Year-over-Year) 變化 — 僅當有去年資料時加上
  var hasPrev = Object.keys(stats.prevYearMonthly).length > 0;
  if (hasPrev) {
    var yoyRow = ["🎯 YoY 變化"];
    for (var m = 1; m <= 12; m++) {
      var prev = stats.prevYearMonthly[m] || 0;
      var curr = monthlyTotals[m] || 0;
      if (prev === 0 || curr === 0) {
        yoyRow.push("-");
      } else {
        var pct = ((curr - prev) / prev) * 100;
        yoyRow.push((pct >= 0 ? "+" : "") + pct.toFixed(1) + "%");
      }
    }
    yoyRow.push("-");
    mainTable.push(yoyRow);
  }

  // ---------- Section 2: 類別 KPI ----------
  var kpiTable = [["類別", "筆數", "總額", "平均單筆", "占比"]];
  stats.categories.forEach(function (cat) {
    var total = 0, count = 0;
    for (var m = 1; m <= 12; m++) {
      total += (stats.matrix[cat] && stats.matrix[cat][m]) || 0;
      count += (stats.countMatrix[cat] && stats.countMatrix[cat][m]) || 0;
    }
    var avg = count > 0 ? Math.round(total / count) : 0;
    var pct = yearlyGrandTotal > 0 ? (total / yearlyGrandTotal) * 100 : 0;
    kpiTable.push([cat, count, total, avg, pct.toFixed(1) + "%"]);
  });

  // ---------- Section 3: Pareto / 供應商集中度 ----------
  var sortedMerchants = Object.keys(stats.merchantTotals).map(function (name) {
    return [name, stats.merchantTotals[name]];
  }).sort(function (a, b) { return b[1] - a[1]; });

  var totalSpend = sortedMerchants.reduce(function (a, b) { return a + b[1]; }, 0);
  var top20Count = Math.max(1, Math.ceil(sortedMerchants.length * CONFIG.PARETO_TOP_PCT));
  var top20Spend = sortedMerchants.slice(0, top20Count).reduce(function (a, b) { return a + b[1]; }, 0);
  var top20Pct = totalSpend > 0 ? (top20Spend / totalSpend) * 100 : 0;

  var paretoTable = [
    ["指標", "數值", "比例"],
    ["全年商家總數", sortedMerchants.length, "100%"],
    ["Top 20% 商家數", top20Count, ((top20Count / Math.max(1, sortedMerchants.length)) * 100).toFixed(0) + "%"],
    ["Top 20% 貢獻支出", top20Spend, top20Pct.toFixed(1) + "%"],
    ["", "", ""],
    ["排名", "商家", "支出"]
  ];
  var topN = Math.min(CONFIG.PARETO_TOP_N, sortedMerchants.length);
  for (var i = 0; i < topN; i++) {
    paretoTable.push(["#" + (i + 1), sortedMerchants[i][0], sortedMerchants[i][1]]);
  }

  return {
    mainTable: mainTable,
    anomalies: anomalies,
    kpiTable: kpiTable,
    paretoTable: paretoTable,
    numCategories: stats.categories.length,
    hasYoY: hasPrev
  };
}

// ==========================================
// 🎨 報表渲染 (寫入 + 排版)
// ==========================================
function renderYearReport(warRoom, startRow, year, report) {
  var currentRow = startRow;
  var moneyFmt = "NT$#,##0;-NT$#,##0;\"-\"";

  // 年度大標
  warRoom.getRange(currentRow, 1).setValue("📅 " + year + " 年度報表")
    .setFontSize(14).setFontWeight("bold").setFontColor("#1155cc");
  currentRow++;

  // ---------- Section 1: 主矩陣 ----------
  warRoom.getRange(currentRow, 1).setValue("📊 類別 × 月份 支出矩陣 (Spend Matrix)")
    .setFontWeight("bold").setFontColor("#666666");
  currentRow++;

  var mainRows = report.mainTable.length;
  var mainCols = report.mainTable[0].length; // 14
  warRoom.getRange(currentRow, 1, mainRows, mainCols).setValues(report.mainTable);

  // 標題列
  warRoom.getRange(currentRow, 1, 1, mainCols).setBackground("#f3f3f3").setFontWeight("bold");

  // 類別資料區
  var dataStartRow = currentRow + 1;
  if (report.numCategories > 0) {
    warRoom.getRange(dataStartRow, 2, report.numCategories, mainCols - 1).setNumberFormat(moneyFmt);
  }

  // 🚨 異常標紅
  report.anomalies.forEach(function (a) {
    warRoom.getRange(dataStartRow + a.rowOffset - 1, a.colOffset)
      .setBackground("#fce5cd").setFontColor("#990000").setFontWeight("bold");
  });

  // 每月總計列 (黃底)
  var totalRowIdx = dataStartRow + report.numCategories;
  warRoom.getRange(totalRowIdx, 1, 1, mainCols).setBackground("#fff2cc").setFontWeight("bold");
  warRoom.getRange(totalRowIdx, 2, 1, mainCols - 1).setNumberFormat(moneyFmt);

  // MoM 列 (淡藍底,斜體)
  warRoom.getRange(totalRowIdx + 1, 1, 1, mainCols).setBackground("#e6f0ff").setFontStyle("italic");
  // YoY 列 (淡綠底,斜體)
  if (report.hasYoY) {
    warRoom.getRange(totalRowIdx + 2, 1, 1, mainCols).setBackground("#d9ead3").setFontStyle("italic");
  }

  currentRow += mainRows + 1;

  // ---------- Section 2: 類別 KPI ----------
  warRoom.getRange(currentRow, 1).setValue("📈 類別深度分析 (Category KPIs)")
    .setFontWeight("bold").setFontColor("#666666");
  currentRow++;

  var kpiRows = report.kpiTable.length;
  var kpiCols = report.kpiTable[0].length;
  warRoom.getRange(currentRow, 1, kpiRows, kpiCols).setValues(report.kpiTable);
  warRoom.getRange(currentRow, 1, 1, kpiCols).setBackground("#f3f3f3").setFontWeight("bold");
  if (kpiRows > 1) {
    // 總額 (col 3) 與 平均單筆 (col 4) 套用金額格式
    warRoom.getRange(currentRow + 1, 3, kpiRows - 1, 2).setNumberFormat(moneyFmt);
  }

  currentRow += kpiRows + 1;

  // ---------- Section 3: Pareto / 供應商集中度 ----------
  warRoom.getRange(currentRow, 1).setValue("🎯 供應商集中度分析 (Pareto 80-20)")
    .setFontWeight("bold").setFontColor("#666666");
  currentRow++;

  var paretoRows = report.paretoTable.length;
  var paretoCols = 3;
  warRoom.getRange(currentRow, 1, paretoRows, paretoCols).setValues(report.paretoTable);
  // 主標頭
  warRoom.getRange(currentRow, 1, 1, paretoCols).setBackground("#f3f3f3").setFontWeight("bold");
  // 「Top 20% 貢獻支出」金額格式
  warRoom.getRange(currentRow + 3, 2).setNumberFormat(moneyFmt);
  // 排行榜小標頭與 Top N 列
  var topListCount = paretoRows - 6;
  if (topListCount > 0) {
    warRoom.getRange(currentRow + 5, 1, 1, paretoCols).setBackground("#f3f3f3").setFontWeight("bold");
    warRoom.getRange(currentRow + 6, 3, topListCount, 1).setNumberFormat(moneyFmt);
  }

  currentRow += paretoRows + 2; // 留兩行空白進入下一年度
  return currentRow;
}

// ==========================================
// 🔍 輔助函式
// ==========================================

/**
 * 把字串裡的全形字元轉半形 + 移除引號類符號,
 * 用來修「ＩＫＥＡ」對不到「IKEA」、「T`WAY」對不到「TWAY」的問題。
 *   - 全形 ASCII (U+FF01 ~ U+FF5E)  →  對應半形
 *   - 全形空白 (U+3000)             →  半形空白
 *   - 各種引號/撇號 (`'"  ' ' " " 等) →  直接移除
 */
function normalizeText(str) {
  if (!str) return "";
  return str
    .replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    })
    .replace(/\u3000/g, ' ')
    .replace(/[`'\u2018\u2019"\u201C\u201D]/g, '');
}

function determineCategory(merchantName) {
  var normalized = normalizeText(merchantName || "").toUpperCase();
  for (var cat in CONFIG.CATEGORIES) {
    var keywords = CONFIG.CATEGORIES[cat];
    for (var i = 0; i < keywords.length; i++) {
      // keyword 也經過同樣的 normalize,讓字典寫法可以隨意用引號或不用
      var normalizedKeyword = normalizeText(keywords[i]).toUpperCase();
      if (normalized.indexOf(normalizedKeyword) > -1) return cat;
    }
  }
  return CONFIG.DEFAULT_CATEGORY;
}

// ==========================================
// 🔍 Tail Spend 診斷 (analyzeUnclassified)
// ==========================================
/**
 * 掃描所有年份工作表,找出被歸到「其他支出」的交易,
 * 在「🔍 待分類診斷」工作表裡列出 Top 商家排行榜。
 *
 * 採購視角:這就是 Tail Spend Analysis,目標是把
 * Unclassified Spend 的占比壓到 5% 以下。
 */
function analyzeUnclassified() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var DIAG_SHEET_NAME = "🔍 待分類診斷";

  // 找出所有年份工作表
  var yearSheets = ss.getSheets().filter(function (s) {
    return s.getName().match(/^\d{4}$/);
  });
  yearSheets.sort(function (a, b) {
    return Number(b.getName()) - Number(a.getName());
  });

  if (yearSheets.length === 0) {
    SpreadsheetApp.getUi().alert("還沒有任何年度工作表可以分析。");
    return;
  }

  // 彙總統計 (跨年份)
  var merchantTotals = {};   // {商家名: {count, total, years: Set, lastDate}}
  var grandTotalAllYears = 0;
  var unclassifiedTotalAllYears = 0;
  var perYearStats = {};     // {year: {total, unclassified}}

  yearSheets.forEach(function (sheet) {
    var year = sheet.getName();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    perYearStats[year] = { total: 0, unclassified: 0 };

    data.forEach(function (row) {
      var date = row[0];
      var amt = Number(row[1]);
      var note = (row[3] || "未知").toString().trim();
      var cat = row[4] || CONFIG.DEFAULT_CATEGORY;

      if (isNaN(amt) || amt === 0) return;

      perYearStats[year].total += amt;
      grandTotalAllYears += amt;

      if (cat !== CONFIG.DEFAULT_CATEGORY) return; // 只看「其他支出」

      perYearStats[year].unclassified += amt;
      unclassifiedTotalAllYears += amt;

      if (!merchantTotals[note]) {
        merchantTotals[note] = { count: 0, total: 0, years: {}, lastDate: null };
      }
      merchantTotals[note].count += 1;
      merchantTotals[note].total += amt;
      merchantTotals[note].years[year] = true;
      var dateObj = (date instanceof Date) ? date : new Date(date);
      if (!merchantTotals[note].lastDate || dateObj > merchantTotals[note].lastDate) {
        merchantTotals[note].lastDate = dateObj;
      }
    });
  });

  // 排序商家 (按累計金額)
  var sorted = Object.keys(merchantTotals).map(function (name) {
    return {
      name: name,
      count: merchantTotals[name].count,
      total: merchantTotals[name].total,
      years: Object.keys(merchantTotals[name].years).sort().join(", "),
      lastDate: merchantTotals[name].lastDate,
      pctOfUnclassified: unclassifiedTotalAllYears > 0
        ? (merchantTotals[name].total / unclassifiedTotalAllYears) * 100 : 0
    };
  }).sort(function (a, b) { return b.total - a.total; });

  // 建立 / 清空診斷工作表
  var diag = ss.getSheetByName(DIAG_SHEET_NAME);
  if (!diag) {
    diag = ss.insertSheet(DIAG_SHEET_NAME);
  } else {
    diag.clear();
    diag.clearConditionalFormatRules();
  }

  var moneyFmt = "NT$#,##0";
  var row = 1;

  // ---------- 標題 ----------
  diag.getRange(row, 1).setValue("🔍 Tail Spend 診斷報告 (Unclassified Spend Analysis)")
    .setFontSize(14).setFontWeight("bold").setFontColor("#cc0000");
  row += 2;

  // ---------- Section A: 整體佔比 ----------
  diag.getRange(row, 1).setValue("📊 各年度未分類占比")
    .setFontWeight("bold").setFontColor("#666666");
  row++;

  var summaryHeaders = ["年度", "總支出", "未分類支出", "未分類占比", "健康度"];
  diag.getRange(row, 1, 1, 5).setValues([summaryHeaders])
    .setBackground("#f3f3f3").setFontWeight("bold");
  row++;

  Object.keys(perYearStats).sort(function (a, b) { return Number(b) - Number(a); })
    .forEach(function (year) {
      var s = perYearStats[year];
      var pct = s.total > 0 ? (s.unclassified / s.total) * 100 : 0;
      var health;
      if (pct < 5) health = "🟢 優秀 (<5%)";
      else if (pct < 10) health = "🟡 可接受 (5-10%)";
      else if (pct < 20) health = "🟠 需改善 (10-20%)";
      else health = "🔴 嚴重 (>20%)";

      diag.getRange(row, 1, 1, 5).setValues([[
        year, s.total, s.unclassified, pct.toFixed(1) + "%", health
      ]]);
      diag.getRange(row, 2, 1, 2).setNumberFormat(moneyFmt);
      row++;
    });

  // 總計列
  var grandPct = grandTotalAllYears > 0
    ? (unclassifiedTotalAllYears / grandTotalAllYears) * 100 : 0;
  diag.getRange(row, 1, 1, 5).setValues([[
    "📈 全期間合計", grandTotalAllYears, unclassifiedTotalAllYears,
    grandPct.toFixed(1) + "%", ""
  ]]).setBackground("#fff2cc").setFontWeight("bold");
  diag.getRange(row, 2, 1, 2).setNumberFormat(moneyFmt);
  row += 2;

  // ---------- Section B: 商家排行榜 ----------
  if (sorted.length === 0) {
    diag.getRange(row, 1).setValue("✅ 沒有任何「其他支出」分類,完美!")
      .setFontWeight("bold").setFontColor("#0c8a4e");
  } else {
    diag.getRange(row, 1).setValue("🏆 未分類商家排行榜 (Top 30)")
      .setFontWeight("bold").setFontColor("#666666");
    row++;
    diag.getRange(row, 1).setValue("👉 把這裡的高頻商家加進 CONFIG.CATEGORIES 對應分類,可大幅降低未分類比例")
      .setFontStyle("italic").setFontColor("#888888");
    row++;

    var headers = ["排名", "商家名稱", "出現年份", "筆數", "累計支出", "占未分類比例", "最後出現"];
    diag.getRange(row, 1, 1, headers.length).setValues([headers])
      .setBackground("#f3f3f3").setFontWeight("bold");
    row++;

    var topN = Math.min(30, sorted.length);
    var rowsToWrite = [];
    for (var i = 0; i < topN; i++) {
      var m = sorted[i];
      rowsToWrite.push([
        "#" + (i + 1),
        m.name,
        m.years,
        m.count,
        m.total,
        m.pctOfUnclassified.toFixed(1) + "%",
        m.lastDate ? Utilities.formatDate(m.lastDate, Session.getScriptTimeZone(), "yyyy/MM/dd") : "-"
      ]);
    }
    diag.getRange(row, 1, topN, headers.length).setValues(rowsToWrite);
    diag.getRange(row, 5, topN, 1).setNumberFormat(moneyFmt);

    // 累計占比達 80% 的位置標一條線 (Pareto 80/20 視覺化)
    var cumPct = 0;
    for (var i = 0; i < topN; i++) {
      cumPct += sorted[i].pctOfUnclassified;
      if (cumPct >= 80) {
        diag.getRange(row + i, 1, 1, headers.length)
          .setBorder(null, null, true, null, null, null,
            "#ff0000", SpreadsheetApp.BorderStyle.DASHED);
        diag.getRange(row + i, headers.length + 1)
          .setValue("← 累計 80% 在這條線以上")
          .setFontColor("#cc0000").setFontStyle("italic");
        break;
      }
    }
    row += topN;
  }

  diag.autoResizeColumns(1, 8);
  ss.setActiveSheet(diag);

  // 跳出提示
  SpreadsheetApp.getUi().alert(
    "✅ 診斷完成!\n\n" +
    "全期間未分類占比:" + grandPct.toFixed(1) + "%\n" +
    "未分類商家數:" + sorted.length + "\n\n" +
    "請查看「🔍 待分類診斷」工作表,把高頻商家加進 CONFIG.CATEGORIES。"
  );
}

// ==========================================
// ♻️ 重新分類所有交易 (reclassifyAllRows)
// ==========================================
/**
 * 用最新的 CONFIG.CATEGORIES 規則重跑所有歷史交易的分類。
 *
 * 採購視角:這對應企業導入新分類體系時的「Spend Re-classification」步驟,
 * 把過去未分類或誤分類的交易納入新規則,確保歷史可比性 (apples-to-apples)。
 *
 * 流程:
 *   1. Dry-run 預覽會改幾筆
 *   2. 跳出確認對話框
 *   3. 確認後實際寫入並刷新戰情室
 */
function reclassifyAllRows() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var yearSheets = ss.getSheets().filter(function (s) {
    return s.getName().match(/^\d{4}$/);
  });

  if (yearSheets.length === 0) {
    ui.alert("沒有找到任何年度工作表。");
    return;
  }

  // ----- Step 1: Dry-run -----
  var totalRows = 0;
  var changedCount = 0;
  var fromOtherCount = 0;       // 從「其他」改成具體分類
  var betweenCatsCount = 0;     // 在具體分類之間移動
  var sampleChanges = [];       // 留前 5 筆當預覽

  yearSheets.forEach(function (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

    data.forEach(function (row) {
      var merchant = (row[3] || "").toString();
      var oldCat = row[4] || CONFIG.DEFAULT_CATEGORY;
      var newCat = determineCategory(merchant);
      totalRows++;
      if (oldCat !== newCat) {
        changedCount++;
        if (oldCat === CONFIG.DEFAULT_CATEGORY) fromOtherCount++;
        else betweenCatsCount++;
        if (sampleChanges.length < 5) {
          sampleChanges.push(merchant + ":「" + oldCat + "」→「" + newCat + "」");
        }
      }
    });
  });

  if (changedCount === 0) {
    ui.alert("✅ 全部分類都已是最新規則,無需更新。\n\n總交易筆數:" + totalRows);
    return;
  }

  // ----- Step 2: 確認 -----
  var confirmMsg = "📊 重新分類預覽\n\n" +
    "總交易筆數:" + totalRows + "\n" +
    "將更新分類:" + changedCount + " 筆\n" +
    "  ├─ 從「其他」轉具體分類:" + fromOtherCount + " 筆\n" +
    "  └─ 具體分類之間調整:" + betweenCatsCount + " 筆\n\n" +
    "前 5 筆變動範例:\n" + sampleChanges.join("\n") + "\n\n" +
    "⚠️ 此操作會直接覆寫各年度工作表的「分類」欄。建議先在副本測試。\n\n是否繼續?";

  var response = ui.alert("確認重新分類", confirmMsg, ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) {
    ui.alert("已取消,沒有任何變動。");
    return;
  }

  // ----- Step 3: 實際寫入 -----
  var actualChanged = 0;
  yearSheets.forEach(function (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, 1, lastRow - 1, 6);
    var data = range.getValues();
    var modified = false;

    data.forEach(function (row) {
      var merchant = (row[3] || "").toString();
      var oldCat = row[4] || CONFIG.DEFAULT_CATEGORY;
      var newCat = determineCategory(merchant);
      if (oldCat !== newCat) {
        row[4] = newCat;
        actualChanged++;
        modified = true;
      }
    });

    if (modified) {
      range.setValues(data);
    }
  });

  // ----- Step 4: 同步刷新戰情室 -----
  updateUnifiedWarRoom();

  ui.alert("✅ 完成!\n\n" +
    "已更新 " + actualChanged + " 筆交易的分類。\n" +
    "戰情室已同步刷新。\n\n" +
    "建議再跑一次「🔍 Tail Spend 診斷」看新的未分類比例。"
  );
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 記帳小幫手')
    .addItem('📩 立即抓信', 'processConsolidatedEmails')
    .addItem('🔄 刷新總戰情室', 'updateUnifiedWarRoom')
    .addSeparator()
    .addItem('🔍 Tail Spend 診斷', 'analyzeUnclassified')
    .addItem('♻️ 重新分類所有交易', 'reclassifyAllRows')
    .addToUi();
}
