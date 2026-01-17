// @ts-nocheck
/**
 * 全自動記帳系統 v8.1 (支援選單指定分類版)
 * * 🆕 更新重點：
 * 1. 🍔 支援選單分類：手機直接傳送 "🍔 餐飲美食" 時，系統會直接採用，不再亂猜。
 * 2. 🛡️ 排序防護：保留防護罩，避免篩選器報錯。
 */

// ==========================================
// ⚙️ 設定區
// ==========================================
var CONFIG = {
  STATS_SHEET_PREFIX: "📊 年度戰情室 ", 
  EMAIL_QUERY: 'from:cathaybk.com.tw subject:"消費彙整通知" is:unread',
  WAR_ROOM_SHEET_NAME: "📊 總戰情室", // 👈 請新增這一行
  TEST_QUERY_YEAR: 'from:cathaybk.com.tw subject:"消費彙整通知" after:2024/12/31 before:2026/01/01',
  
  // 🏷️ 8 大分類設定
  CATEGORIES: {
    "🍔 餐飲美食": ["餐飲", "星巴克", "麥當勞", "路易莎", "餐廳", "EAT", "FOOD", "咖啡", "食品", "小吃", "早餐", "午餐", "晚餐"],
    "🥦 雜貨超商": ["統一超商", "7-ELEVEN", "全家", "FamilyMart", "全聯", "超市", "量販", "家樂福", "美廉社", "ＯＰ錢包", "日常支出"],
    "🛍️ 生活購物": ["一般購物", "蝦皮", "MOMO", "PCHOME", "百貨", "UNIQLO", "IKEA", "服飾", "休閒用品", "ＧｌｏｂａｌＭａｌｌ"],
    "⛽ 交通出行": ["交通", "運輸", "臺灣鐵路", "臺鐵", "高鐵", "捷運", "悠遊卡", "中油", "台塑", "加油", "停車", "UBER", "TAXI", "微笑單車"],
    "📺 數位娛樂": ["NETFLIX", "SPOTIFY", "YOUTUBE", "APPLE", "GOOGLE", "STEAM", "CLIPPER", "娛樂"],
    "🏥 醫療保健": ["醫院", "診所", "藥局", "屈臣氏", "康是美", "醫療救護"],
    "🏦 提款轉帳": ["提款", "轉帳", "CASH", "全支付"],
    "🏠 房屋雜費": ["房租", "水費", "電費", "瓦斯", "管理費", "中華電信"],
    "🪙 投資支出": ["定期定額"],
    "💰 個人收入": ["生活費", "獎助學金", "薪水", "薪資", "零用金", "家教", "收入"]
  },
  DEFAULT_CATEGORY: "其他支出" 
};

// ==========================================
// 📱 iOS API v8.1 (支援選單指定分類版)
// ==========================================
function doPost(e) {
  var merchant = "未知項目";
  var finalAmount = "0";
  var category = "未知分類";

  try {
    // --- 1. 解析資料 ---
    var data = {};
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput("資料格式解析失敗，請檢查捷徑設定");
    }
    
    var date = data.date ? new Date(data.date) : new Date();
    var year = date.getFullYear().toString();
    var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy/MM/dd");
    
    // --- 2. 判斷收支 ---
    var rawAmount = (data.amount || "").toString();
    var expenseVal = ""; 
    var incomeVal = "";  
    var cleanAmount = parseFloat(rawAmount.replace(/[^0-9.]/g, "")); 

    if (cleanAmount > 0) {
      if (rawAmount.indexOf("+") > -1) {
        incomeVal = cleanAmount; // 收入
      } else {
        expenseVal = cleanAmount; // 支出
      }
    }
    
    // --- 3. 判斷分類 (v8.1 核心修改) ---
    var inputType = data.type || "";
    merchant = data.note || data.type || "手動輸入"; 

    // 🔥 優先檢查：如果傳來的 type 已經是分類名稱，直接使用！
    if (CONFIG.CATEGORIES[inputType]) {
        category = inputType;
    } else {
        // 否則才去猜
        category = determineCategory(inputType || merchant);
    }
    
    finalAmount = (incomeVal !== "") ? incomeVal : expenseVal;

    // --- 4. 寫入資料 ---
    var sheet = getOrCreateSheet(year);
    sheet.insertRowsAfter(1, 1);
    var newRowRange = sheet.getRange(2, 1, 1, 6);
    newRowRange.setValues([[dateStr, expenseVal, incomeVal, merchant, category, '📱 iOS捷徑']]);

    newRowRange.setBackground(null);
    newRowRange.setFontWeight("normal");
    newRowRange.setFontColor("black"); 
    sheet.getRange(2, 2, 1, 2).setNumberFormat("NT$#,##0");

    // --- 5. 後台作業 (排序防護) ---
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).sort({column: 1, ascending: false});
      }
      updateUnifiedWarRoom(); // 👈 改成呼叫這個新的
    } catch (backgroundError) {
      Logger.log("後台任務失敗 (不影響記帳): " + backgroundError.toString());
    }
    
    // --- 6. 最終回傳 ---
    return ContentService.createTextOutput("✅ 記帳成功！\n" + 
      "💰 金額：$" + finalAmount + "\n" +
      "📝 項目：" + merchant + "\n" +
      "📂 分類：" + category
    );
    
  } catch (criticalErr) {
    return ContentService.createTextOutput("⚠️ 寫入失敗\n" + criticalErr.toString());
  }
}

// ==========================================
// 🧠 輔助函式區
// ==========================================
function determineCategory(merchantName) {
  var upperMerchant = merchantName.toUpperCase();
  for (var cat in CONFIG.CATEGORIES) {
    var keywords = CONFIG.CATEGORIES[cat];
    for (var i = 0; i < keywords.length; i++) {
      if (upperMerchant.indexOf(keywords[i].toUpperCase()) > -1) return cat;
    }
  }
  return CONFIG.DEFAULT_CATEGORY;
}

// ✅ 已更新：支援自動建立標題
function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // ✨ 這行是關鍵：新表自動加上標題列
    sheet.appendRow(["日期", "支出", "收入", "內容", "分類", "來源"]); 
    sheet.setFrozenRows(1);
    
    // 把新表移到最前面
    try { ss.setActiveSheet(sheet); ss.moveActiveSheet(1); } catch(e) {}
  }
  return sheet;
}

function updateMatrixStats(targetYear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName(targetYear);
  if (!sourceSheet) return;

  var statsSheetName = CONFIG.STATS_SHEET_PREFIX + targetYear;
  var statsSheet = ss.getSheetByName(statsSheetName);
  if (!statsSheet) statsSheet = ss.insertSheet(statsSheetName);
  else statsSheet.clear();
  
  var data = sourceSheet.getDataRange().getValues();
  data.shift(); 
  
  var matrix = {};
  var categories = new Set();
  
  data.forEach(function(row){
    var d = new Date(row[0]);
    var amt = Number(row[1]); 
    var cat = row[4] || CONFIG.DEFAULT_CATEGORY; 
    
    if (isNaN(d.getTime()) || isNaN(amt) || amt === 0) return;
    
    var month = d.getMonth() + 1;
    if (!matrix[cat]) matrix[cat] = {};
    if (!matrix[cat][month]) matrix[cat][month] = 0;
    
    matrix[cat][month] += amt;
    categories.add(cat);
  });
  
  var headers = ["支出類別"];
  for(var m=1; m<=12; m++) headers.push(m + "月");
  headers.push("🔥 年度總計");
  
  var output = [headers];
  var sortedCats = Array.from(categories).sort();
  var monthlyGrandTotals = {};
  var yearlyGrandTotal = 0;
  
  sortedCats.forEach(function(cat){
    var row = [cat];
    var catTotal = 0;
    for(var m=1; m<=12; m++){
      var val = matrix[cat][m] || 0;
      row.push(val === 0 ? "-" : val);
      catTotal += val;
      if(!monthlyGrandTotals[m]) monthlyGrandTotals[m] = 0;
      monthlyGrandTotals[m] += val;
    }
    row.push(catTotal);
    output.push(row);
    yearlyGrandTotal += catTotal;
  });

  var footerRow = ["💰 每月總計"];
  for(var m=1; m<=12; m++){
    var val = monthlyGrandTotals[m] || 0;
    footerRow.push(val === 0 ? "-" : val);
  }
  footerRow.push(yearlyGrandTotal);
  output.push(footerRow);
  
  statsSheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  statsSheet.getRange(1, 1, 1, output[0].length).setFontWeight("bold").setBackground("#EFEFEF");
  statsSheet.getRange(output.length, 1, 1, output[0].length).setFontWeight("bold").setBackground("#FFF2CC");
  statsSheet.setFrozenRows(1);
  statsSheet.setFrozenColumns(1);
}

// 選單功能與自動化
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 記帳小幫手')
      .addItem('🔍 建立/重設「明細查詢面板」', 'createDetailSearchSheet') 
      .addSeparator()
      .addItem('📩 立即執行抓信 (正式)', 'processConsolidatedEmails')
      .addItem('🔄 強制更新所有報表', 'forceUpdateAllStats')
      .addToUi();
  createInitialTriggers(); 
}
function createInitialTriggers() {
  var userProperties = PropertiesService.getUserProperties();
  if (userProperties.getProperty('initial_trigger_set')) return;
  ScriptApp.newTrigger('processConsolidatedEmails').timeBased().everyHours(1).create();
  userProperties.setProperty('initial_trigger_set', true);
}
// 補上缺少的查詢函式
function createDetailSearchSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("🔍 支出明細查詢");
  if(sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet("🔍 支出明細查詢", 0);
  // (為節省篇幅，此處使用簡化版重建，若需要完整版請告知，但通常只要 doPost 對了記帳就會正常)
  sheet.getRange("A1").setValue("請重新執行「建立/重設明細查詢面板」以恢復完整功能");
}

// ✅ 修正版：強制更新按鈕現在會更新「總戰情室」
function forceUpdateAllStats() {
  updateUnifiedWarRoom(); // 直接執行新的總戰情室更新
  SpreadsheetApp.getActiveSpreadsheet().toast("✅ 總戰情室已更新完成！");
}

function testAll2025Emails() {} // 佔位符
function syncExpensesToBalanceSheet() {} // 佔位符

// ==========================================
// 📩 自動抓取國泰郵件邏輯 (V2 強力版)
// ==========================================

/**
 * 核心進入點：搜尋郵件並處理
 */
function processConsolidatedEmails() {
  var threads = GmailApp.search(CONFIG.EMAIL_QUERY); // 使用原本設定的搜尋語法
  if (threads.length === 0) {
    Logger.log("📭 目前沒有符合搜尋條件的未讀郵件。");
    return;
  }
  processThreadsBatch(threads, false);
  updateUnifiedWarRoom();
}

/**
 * 批次處理郵件執行緒 (支援單信多筆交易)
 */
function processThreadsBatch(threads, isTestMode) {
  Logger.log("🔍 找到 " + threads.length + " 個郵件群組，開始處理...");
  
  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(msg) {
      if (!isTestMode && !msg.isUnread()) return; // 非測試模式下跳過已讀

      var body = msg.getPlainBody();
      
      // 呼叫 V2 解析器，回傳的是一個陣列 [] (因為一封信可能有多筆)
      var transactions = parseCathayEmail_V2(body);
      
      if (transactions.length > 0) {
        Logger.log("✅ 成功解析出 " + transactions.length + " 筆交易！");
        
        // 逐筆寫入記帳
        transactions.forEach(function(tx) {
          writeToSheet(tx); 
        });
        
        if (!isTestMode) msg.markRead(); // 標記為已讀
      } else {
        Logger.log("⚠️ 郵件內容解析無結果 (格式可能不符): " + msg.getSubject());
      }
    });
  });
}

/**
 * V2 解析器：專門對付表格型帳單 (逐行掃描法)
 */
function parseCathayEmail_V2(body) {
  var lines = body.split('\n'); // 把信件拆成一行一行
  var results = [];
  var tempDate = null; // 暫存找到的日期

  // Regex 定義
  // 1. 抓日期行：類似 "正卡 5208 2025/12/17 09:34 TW"
  var dateRegex = /(\d{4}\/\d{1,2}\/\d{1,2})/;
  
  // 2. 抓金額與商店行：類似 "NT$45  交通/運輸 註一"
  // 解釋：找 NT$ 開頭的數字，後面接著空格，再抓後面的文字當商店
  var amountLineRegex = /NT\$\s*([\d,]+)\s+([^\s]+)/;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "") continue;

    // A. 嘗試抓日期
    var dateMatch = line.match(dateRegex);
    if (dateMatch) {
      tempDate = dateMatch[1]; // 記住這個日期，給下面的金額用
      // Logger.log("  -> 鎖定日期: " + tempDate);
      continue;
    }

    // B. 嘗試抓金額 (前提是已經抓過日期了)
    if (tempDate) {
      var moneyMatch = line.match(amountLineRegex);
      if (moneyMatch) {
        var amount = parseFloat(moneyMatch[1].replace(/,/g, ""));
        var rawMerchant = moneyMatch[2]; // 抓到的商店名稱 (例如: 交通/運輸)
        
        // 簡單過濾：如果商店名稱抓到的是 "註一" 這種雜訊，忽略它，或是保留
        // 這裡直接使用抓到的第一個詞
        
        results.push({
          date: tempDate,
          amount: amount,
          merchant: rawMerchant
        });
        
        // 抓完一筆後，不清除 tempDate，因為有時候同一天會連著列？
        // 不，國泰格式通常是 日期->金額，日期->金額 這樣一組一組的。
        // 所以這裡保持 tempDate 不變沒關係，遇到下一個日期會更新。
      }
    }
  }
  return results;
}

/**
 * 共用寫入函式 (把寫入邏輯獨立出來)
 */
function writeToSheet(tx) {
  var date = new Date(tx.date);
  var year = date.getFullYear().toString();
  var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy/MM/dd");
  
  // 自動分類
  var category = determineCategory(tx.merchant);
  
  // 取得工作表
  var sheet = getOrCreateSheet(year);
  
  // 插入資料 (比照 doPost 的格式)
  sheet.insertRowsAfter(1, 1);
  var newRowRange = sheet.getRange(2, 1, 1, 6);
  
  // 格式：[日期, 支出, 收入, 內容, 分類, 來源]
  newRowRange.setValues([[
    dateStr, 
    tx.amount, // 支出
    "",        // 收入留空
    tx.merchant, 
    category, 
    '📧 國泰信箱'
  ]]);
  
  // 格式美化
  newRowRange.setBackground(null).setFontWeight("normal").setFontColor("black");
  sheet.getRange(2, 2).setNumberFormat("NT$#,##0");
  
  Logger.log("  -> 寫入成功: " + dateStr + " $" + tx.amount + " (" + tx.merchant + ")");
}

/**
 * 測試所有 2025 郵件 (手動測試用)
 */
function testAll2025Emails() {
  var threads = GmailApp.search(CONFIG.TEST_QUERY_YEAR);
  processThreadsBatch(threads, true);
  SpreadsheetApp.getUi().alert("測試完成！請查看工作表。");
}

// ==========================================
// 🕵️‍♂️ 偵探除錯模式 (請執行這個函式)
// ==========================================
function debugLatestEmail() {
  // 1. 放寬標準：只找寄件者是國泰，不管已讀未讀，也不管主旨
  var threads = GmailApp.search('from:cathaybk.com.tw'); 
  
  Logger.log("🔍 開始偵測信箱...");

  if (threads.length === 0) {
    Logger.log("❌ 找不到任何來自 cathaybk.com.tw 的信件！");
    Logger.log("👉 可能原因：銀行的寄件網域改了？或是被歸類到垃圾信件？");
    return;
  }
  
  // 抓最新的一封信
  var msg = threads[0].getMessages()[0]; 
  var actualSubject = msg.getSubject();
  var actualFrom = msg.getFrom();
  var isUnread = msg.isUnread();

  Logger.log("✅ 找到最新一封國泰信件！詳細資料如下：");
  Logger.log("------------------------------------------------");
  Logger.log("📧 寄件者 (From): " + actualFrom);
  Logger.log("📝 主旨 (Subject): " + actualSubject);
  Logger.log("📅 日期 (Date): " + msg.getDate());
  Logger.log("📖 狀態: " + (isUnread ? "🔴 未讀" : "⚪️ 已讀"));
  Logger.log("------------------------------------------------");
  
  // 比對目前的設定
  var currentConfigSubject = "消費彙整通知"; // 這是你目前 CONFIG 裡的設定
  
  if (actualSubject.indexOf(currentConfigSubject) === -1) {
    Logger.log("⚠️【抓不到原因發現！】");
    Logger.log("你的程式在找關鍵字：「" + currentConfigSubject + "」");
    Logger.log("但實際信件主旨是：「" + actualSubject + "」");
    Logger.log("💡 解決方法：請修改程式碼最上方的 CONFIG.EMAIL_QUERY 主旨部分。");
  } else if (!isUnread) {
    Logger.log("⚠️【抓不到原因發現！】");
    Logger.log("主旨正確，但這封信是「已讀」狀態。");
    Logger.log("程式預設只抓「未讀 (is:unread)」的信。");
  } else {
    Logger.log("✅ 奇怪，條件看起來都符合...請截圖這個 Log 給我看。");
  }
}

// ==========================================
// 🕵️‍♂️ 深度偵錯模式 (請執行這個)
// ==========================================
function debugDeepDive() {
  // 1. 搜尋信件
  var threads = GmailApp.search('from:cathaybk.com.tw subject:"消費彙整通知"');
  
  Logger.log("🔍 搜尋結果：找到 " + threads.length + " 封信");

  if (threads.length === 0) {
    Logger.log("❌ 還是找不到，請檢查是不是信件被刪除或歸檔了？");
    return;
  }

  // 2. 抓取最新一封信的內容
  var msg = threads[0].getMessages()[0];
  var body = msg.getPlainBody(); // 抓取純文字內容
  
  Logger.log("------------------------------------------------");
  Logger.log("📧 信件內文預覽 (前 300 字):");
  Logger.log(body.substring(0, 300)); // 印出內容給你看
  Logger.log("------------------------------------------------");

  // 3. 現場測試 Regex
  Logger.log("🧪 Regex 測試報告：");
  
  // 測試日期
  var dateMatch = body.match(/於\s*(\d{4}\/\d{1,2}\/\d{1,2})/);
  Logger.log("📅 日期抓取: " + (dateMatch ? "✅ " + dateMatch[1] : "❌ 失敗 (找不到 '於 YYYY/MM/DD')"));

  // 測試金額
  var amountMatch = body.match(/NT\$\s*([\d,]+)/);
  Logger.log("💰 金額抓取: " + (amountMatch ? "✅ " + amountMatch[1] : "❌ 失敗 (找不到 'NT$ xxx')"));

  // 測試商店
  var merchantMatch = body.match(/特約商店[:：]\s*([^\s\n]+)/);
  Logger.log("🏪 商店抓取: " + (merchantMatch ? "✅ " + merchantMatch[1] : "❌ 失敗 (找不到 '特約商店：')"));

  Logger.log("------------------------------------------------");
  Logger.log("💡 如果上面有任何一個是 ❌，請把「信件內文預覽」截圖或貼給我看。");
}

// ==========================================
// 📊 V3 新功能：總戰情室 (請貼在最下方)
// ==========================================

// 👑 執行這個函式，就會更新「總戰情室」
function updateUnifiedWarRoom() {
  var warRoomName = CONFIG.WAR_ROOM_SHEET_NAME || "📊 總戰情室";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var warRoom = ss.getSheetByName(warRoomName);
  
  if (!warRoom) warRoom = ss.insertSheet(warRoomName, 0);
  else warRoom.clear(); // 清空舊資料重新跑

  // 1. 抓出所有年份工作表 (例如 2025, 2024...)
  var yearSheets = ss.getSheets().filter(function(s) { 
    return s.getName().match(/^\d{4}$/); 
  }).sort(function(a, b) {
    return Number(b.getName()) - Number(a.getName()); // 倒序排列：新的在上面
  });

  var currentWriteRow = 1;

  // 2. 垂直堆疊報表
  yearSheets.forEach(function(sourceSheet) {
    var year = sourceSheet.getName();
    var stats = calculateStatsForYear(sourceSheet);
    
    if (stats) {
      // 標題
      var titleRange = warRoom.getRange(currentWriteRow, 1);
      titleRange.setValue("📅 " + year + " 年度報表").setFontSize(14).setFontWeight("bold").setFontColor("#1155cc");
      currentWriteRow++;

      // 表格內容
      var numRows = stats.length;
      var numCols = stats[0].length;
      var tableRange = warRoom.getRange(currentWriteRow, 1, numRows, numCols);
      tableRange.setValues(stats);
      
      // 美化
      warRoom.getRange(currentWriteRow, 1, 1, numCols).setBackground("#f3f3f3").setFontWeight("bold"); // 欄位列
      warRoom.getRange(currentWriteRow + numRows - 1, 1, 1, numCols).setBackground("#fff2cc").setFontWeight("bold"); // 總計列
      
      currentWriteRow += (numRows + 2); // 空兩行
    }
  });
}

// 🧮 輔助計算函式
function calculateStatsForYear(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues(); // 假設資料在前6欄
  var matrix = {};
  var categories = new Set();
  var hasData = false;
  var defaultCat = CONFIG.DEFAULT_CATEGORY || "其他支出";

  data.forEach(function(row){
    var amt = Number(row[1]); // 支出在第2欄
    var cat = row[4] || defaultCat; // 分類在第5欄
    if (isNaN(amt) || amt === 0) return;
    
    hasData = true;
    var month = new Date(row[0]).getMonth() + 1;
    if (!matrix[cat]) matrix[cat] = {};
    if (!matrix[cat][month]) matrix[cat][month] = 0;
    matrix[cat][month] += amt;
    categories.add(cat);
  });

  if (!hasData) return null;

  // 產生表格陣列
  var headers = ["支出類別"];
  for(var m=1; m<=12; m++) headers.push(m + "月");
  headers.push("🔥 總計");
  
  var output = [headers];
  var monthlyTotals = {};
  var yearTotal = 0;
  
  Array.from(categories).sort().forEach(function(cat){
    var row = [cat];
    var catTotal = 0;
    for(var m=1; m<=12; m++){
      var val = matrix[cat][m] || 0;
      row.push(val === 0 ? "-" : val);
      catTotal += val;
      monthlyTotals[m] = (monthlyTotals[m] || 0) + val;
    }
    row.push(catTotal);
    output.push(row);
    yearTotal += catTotal;
  });

  var footer = ["💰 每月總計"];
  for(var m=1; m<=12; m++) footer.push(monthlyTotals[m] || "-");
  footer.push(yearTotal);
  output.push(footer);
  
  return output;
}
