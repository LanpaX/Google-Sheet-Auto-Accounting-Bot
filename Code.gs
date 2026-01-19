/**
 * 全自動記帳系統 V3.0 (總戰情室整合版)
 * * ✨ 更新亮點：
 * 1. 📊 戰情室合併：所有年份的統計集中在「📊 總戰情室」一張表，由新到舊排列。
 * 2. 🤖 自動開表：新的一年自動建立工作表 + 自動寫入標題列。
 * 3. 🛡️ V2 解析器內建：保留了之前修正的強力郵件解析功能。
 */

// ==========================================
// ⚙️ 設定區
// ==========================================
var CONFIG = {
  WAR_ROOM_SHEET_NAME: "📊 總戰情室", // 統一的戰情室名稱
  EMAIL_QUERY: 'from:cathaybk.com.tw subject:"消費彙整通知" is:unread',
  
  // 🏷️ 8 大分類設定
  CATEGORIES: {
    "🍔 餐飲美食": ["餐飲", "星巴克", "麥當勞", "路易莎", "餐廳", "EAT", "FOOD", "咖啡", "食品", "小吃", "早餐", "午餐", "晚餐", "雞肉飯"],
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
// 📱 iOS API (處理捷徑傳來的資料)
// ==========================================
function doPost(e) {
  var merchant = "未知項目";
  var finalAmount = "0";
  var category = "未知分類";

  try {
    // 1. 解析資料
    var data = {};
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput("資料格式解析失敗");
    }
    
    var date = data.date ? new Date(data.date) : new Date();
    // 轉成台灣時間
    var twDate = new Date(date.getTime() + 8 * 60 * 60 * 1000); 
    var year = data.date ? date.getFullYear().toString() : new Date().getFullYear().toString();
    
    // 2. 判斷收支
    var rawAmount = (data.amount || "").toString();
    var expenseVal = ""; 
    var incomeVal = "";  
    var cleanAmount = parseFloat(rawAmount.replace(/[^0-9.]/g, "")); 

    if (cleanAmount > 0) {
      if (rawAmount.indexOf("+") > -1) incomeVal = cleanAmount;
      else expenseVal = cleanAmount;
    }
    
    // 3. 判斷分類
    var inputType = data.type || "";
    merchant = data.note || data.type || "手動輸入"; 
    if (CONFIG.CATEGORIES[inputType]) {
        category = inputType;
    } else {
        category = determineCategory(inputType || merchant);
    }
    finalAmount = (incomeVal !== "") ? incomeVal : expenseVal;

    // 4. 寫入資料 (這裡會自動處理新年度開表 + 標題)
    var sheet = getOrCreateSheet(year);
    writeRowToSheet(sheet, date, expenseVal, incomeVal, merchant, category, '📱 iOS捷徑');

    // 5. 更新總戰情室
    updateUnifiedWarRoom();
    
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
// 📩 自動抓取郵件邏輯 (V2 強力版)
// ==========================================
function processConsolidatedEmails() {
  var threads = GmailApp.search(CONFIG.EMAIL_QUERY);
  if (threads.length === 0) return;
  processThreadsBatch(threads, false);
}

function processThreadsBatch(threads, isTestMode) {
  var hasNewData = false;
  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(msg) {
      if (!isTestMode && !msg.isUnread()) return;

      var body = msg.getPlainBody();
      var transactions = parseCathayEmail_V2(body);
      
      if (transactions.length > 0) {
        hasNewData = true;
        transactions.forEach(function(tx) {
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
  
  // 如果有新資料，更新戰情室
  if (hasNewData) {
    updateUnifiedWarRoom();
  }
}

// V2 解析器 (保留你之前的修復)
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
// 🧠 核心功能區 (自動開表、合併戰情室)
// ==========================================

// 寫入單行資料的共用函式
function writeRowToSheet(sheet, dateObj, expense, income, note, category, source) {
  var dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy/MM/dd");
  sheet.insertRowsAfter(1, 1);
  var row = sheet.getRange(2, 1, 1, 6);
  row.setValues([[dateStr, expense, income, note, category, source]]);
  row.setBackground(null).setFontWeight("normal").setFontColor("black");
  sheet.getRange(2, 2, 1, 2).setNumberFormat("NT$#,##0");
}

// 自動建立年度工作表 + 自動設定標題
function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // 如果找不到這年份的表，就建立一個新的
    sheet = ss.insertSheet(sheetName);
    // ✨ 自動建立標題列 (這就是您要的功能)
    sheet.appendRow(["日期", "支出", "收入", "內容", "分類", "來源"]); 
    sheet.setFrozenRows(1); // 凍結第一行
    
    // 把新表移到最前面，方便查看
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }
  return sheet;
}

// 👑 更新「總戰情室」 (合併所有年份)
function updateUnifiedWarRoom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var warRoom = ss.getSheetByName(CONFIG.WAR_ROOM_SHEET_NAME);
  if (!warRoom) {
    warRoom = ss.insertSheet(CONFIG.WAR_ROOM_SHEET_NAME, 0);
  } else {
    warRoom.clear(); // 清空舊資料，重新產生
  }

  // 1. 找出所有年份的工作表 (名稱是 4 個數字的)
  var allSheets = ss.getSheets();
  var yearSheets = allSheets.filter(function(s) { 
    return s.getName().match(/^\d{4}$/); 
  });
  
  // 按照年份倒序排列 (2025 -> 2024)
  yearSheets.sort(function(a, b) {
    return Number(b.getName()) - Number(a.getName());
  });
// ==========================================
  // 🆕 [新增] 自動更新「支出明細查詢」的年份選單
  // ==========================================
  var querySheet = ss.getSheetByName("支出明細查詢");
  if (querySheet) {
    // 取得所有年份名稱列表 (e.g., ["2026", "2025", "2024"])
    // 這裡直接沿用上面已經抓到且排序好的 yearSheets 變數
    var yearsList = yearSheets.map(function(s) { return s.getName(); });
    
    if (yearsList.length > 0) {
      // 建立下拉選單規則
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(yearsList, true) // true 代表顯示下拉箭頭
        .setAllowInvalid(false)
        .build();
        
      // 套用到 B1 儲存格
      querySheet.getRange("B1").setDataValidation(rule);
    }
  }
  // ==========================================
  var currentWriteRow = 1; // 戰情室目前的寫入行數

  // 2. 逐年產生報表
  yearSheets.forEach(function(sourceSheet) {
    var year = sourceSheet.getName();
    var stats = calculateStatsForYear(sourceSheet);
    
    if (stats) {
      // 寫入年份標題
      var titleRange = warRoom.getRange(currentWriteRow, 1);
      titleRange.setValue("📅 " + year + " 年度報表");
      titleRange.setFontSize(14).setFontWeight("bold").setFontColor("#1155cc");
      currentWriteRow++;

      // 寫入表格
      var numRows = stats.length;
      var numCols = stats[0].length;
      
      var tableRange = warRoom.getRange(currentWriteRow, 1, numRows, numCols);
      tableRange.setValues(stats);
      
      // 美化表格
      // 標題列
      warRoom.getRange(currentWriteRow, 1, 1, numCols).setBackground("#f3f3f3").setFontWeight("bold");
      // 底部總計列
      warRoom.getRange(currentWriteRow + numRows - 1, 1, 1, numCols).setBackground("#fff2cc").setFontWeight("bold");
      
      currentWriteRow += (numRows + 2); // 空兩行準備寫下一個年份
    }
  });
}

// 計算單一年度的統計矩陣
function calculateStatsForYear(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null; // 沒資料

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var matrix = {};
  var categories = new Set();
  var hasData = false;

  data.forEach(function(row){
    var d = new Date(row[0]);
    var amt = Number(row[1]); // 支出
    var cat = row[4] || CONFIG.DEFAULT_CATEGORY; 
    
    if (isNaN(amt) || amt === 0) return;
    hasData = true;
    
    var month = d.getMonth() + 1;
    if (!matrix[cat]) matrix[cat] = {};
    if (!matrix[cat][month]) matrix[cat][month] = 0;
    
    matrix[cat][month] += amt;
    categories.add(cat);
  });

  if (!hasData) return null;

  // 產出表格陣列
  var headers = ["支出類別"];
  for(var m=1; m<=12; m++) headers.push(m + "月");
  headers.push("🔥 總計");
  
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
  
  return output;
}

// 輔助分類
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

// 選單功能
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 記帳小幫手')
      .addItem('📩 立即抓信', 'processConsolidatedEmails')
      .addItem('🔄 刷新總戰情室', 'updateUnifiedWarRoom')
      .addToUi();
}
