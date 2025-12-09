/**
 * 全自動記帳系統 v5.0 (倒序插入 + 統一分類版)
 * * 🆕 更新重點：
 * 1. 🔼 倒序排列：新資料會直接插入在「標題列下方」，越新的帳記在越上面。
 * 2. 🧹 統一分類：修正了重複的類別名稱，避免戰情室太亂。
 */

// ==========================================
// ⚙️ 設定區
// ==========================================
var CONFIG = {
  STATS_SHEET_PREFIX: "📊 年度戰情室 ", 
  
  // 正式運作搜尋 (只抓未讀)
  EMAIL_QUERY: 'from:cathaybk.com.tw subject:"消費彙整通知" is:unread',
  
  // 測試搜尋 (抓 2025 全年)
  TEST_QUERY_YEAR: 'from:cathaybk.com.tw subject:"消費彙整通知" after:2024/12/31 before:2026/01/01',
  
  // 🏷️ 重新整理後的 8 大分類 (統一圖示與名稱)
  CATEGORIES: {
    // 統一用漢堡圖示，關鍵字包含原本的「食品」與「小吃」
    "🍔 餐飲美食": ["餐飲", "星巴克", "麥當勞", "路易莎", "餐廳", "EAT", "FOOD", "咖啡", "食品", "小吃"],
    
    // 統一雜貨與超商
    "🥦 雜貨超商": ["統一超商", "7-ELEVEN", "全家", "FamilyMart", "全聯", "超市", "量販", "家樂福", "美廉社", "ＯＰ錢包", "日常支出"],
    
    // 一般購物
    "🛍️ 生活購物": ["一般購物", "蝦皮", "MOMO", "PCHOME", "百貨", "UNIQLO", "IKEA", "服飾", "休閒用品", "ＧｌｏｂａｌＭａｌｌ"],
    
    // 交通
    "⛽ 交通出行": ["交通", "運輸", "臺灣鐵路", "臺鐵", "高鐵", "捷運", "悠遊卡", "中油", "台塑", "加油", "停車", "UBER", "TAXI"],
    
    // 統一用電視圖示，包含手機娛樂
    "📺 數位娛樂": ["NETFLIX", "SPOTIFY", "YOUTUBE", "APPLE", "GOOGLE", "STEAM", "CLIPPER", "娛樂"],
    
    // 醫療
    "🏥 醫療保健": ["醫院", "診所", "藥局", "屈臣氏", "康是美", "醫療救護"],
    
    // 金融
    "🏦 提款轉帳": ["提款", "轉帳", "CASH", "全支付"],
    
    // 居住
    "🏠 房屋雜費": ["房租", "水費", "電費", "瓦斯", "管理費", "中華電信"]
  },
  DEFAULT_CATEGORY: "其他支出" 
};

// ==========================================
// 🔘 選單區 (v6.0 - 整合自動安裝)
// ==========================================
function onOpen() {
  // 1. 建立選單 (不變)
  SpreadsheetApp.getUi()
      .createMenu('💰 記帳小幫手')
      .addItem('🔍 建立/重設「明細查詢面板」', 'createDetailSearchSheet') 
      .addSeparator()
      .addItem('📩 立即執行抓信 (正式)', 'processConsolidatedEmails')
      .addItem('🧪 測試：回溯跑 2025 整年信件', 'testAll2025Emails')
      .addItem('🔄 強制更新所有報表', 'forceUpdateAllStats')
      .addToUi();

  // 2. 呼叫自動設定觸發器功能
  createInitialTriggers(); 
}

// ==========================================
// 🚀 核心功能：抓信 + 倒序寫入
// ==========================================
function processConsolidatedEmails() {
  Logger.log('🚀 系統啟動...');
  var threads = GmailApp.search(CONFIG.EMAIL_QUERY);
  
  if (threads.length === 0) { Logger.log('💤 無未讀郵件'); return; }
  
  // 呼叫處理邏輯 (false = 正式模式，會標記已讀)
  processThreadsBatch(threads, false);
}

// ==========================================
// 🧪 測試功能：回溯 2025
// ==========================================
function testAll2025Emails() {
  var ui = SpreadsheetApp.getUi();
  var threads = GmailApp.search(CONFIG.TEST_QUERY_YEAR);
  
  if (threads.length === 0) { ui.alert("❌ 找不到 2025 年的信。"); return; }
  
  // 呼叫處理邏輯 (true = 測試模式，不標記已讀)
  var count = processThreadsBatch(threads, true);
  ui.alert("✅ 測試完成！共處理 " + count + " 筆交易。");
}

// ==========================================
// ⚙️ 批次處理核心 (改寫為整批插入)
// ==========================================
function processThreadsBatch(threads, isTestMode) {
  var allDataByYear = {}; // 用來分類存放資料： { "2025": [[Row1], [Row2]], "2024": [...] }
  var totalCount = 0;
  
  // 1. 收集資料 (先不寫入)
  for (var t = 0; t < threads.length; t++) {
    var message = threads[t].getMessages().pop();
    var cleanBody = message.getBody().replace(/(\r\n|\n|\r)/gm, "");
    var rows = cleanBody.match(/<tr[^>]*>.*?<\/tr>/g);
    
    if (!rows) continue;
    
    var pendingDate = "";
    var hasDataInThisThread = false;
    
    for (var i = 0; i < rows.length; i++) {
      var rowHtml = rows[i];
      var cleanText = rowHtml.replace(/<[^>]+>/g, '|').replace(/&nbsp;/g, ' ').replace(/\|+/g, '|').trim();
      
      var dateMatch = rowHtml.match(/>(\d{4}\/\d{2}\/\d{2})</);
      if (dateMatch) { pendingDate = dateMatch[1]; continue; }
      
      if (pendingDate !== "") {
        var amountMatch = rowHtml.match(/>NT\$([\d,]+)</);
        if (amountMatch) {
          var amount = amountMatch[1].replace(/,/g, '');
          var parts = cleanText.split('|').filter(e => e.trim()!='');
          var merchant = "未知商家";
          for(var k=0; k<parts.length; k++){
            if(parts[k].includes('NT$') && k+1 < parts.length){
               merchant = parts[k+1]; break;
            }
          }
          
          if (amount > 0) {
             var txDate = new Date(pendingDate);
             var txYear = txDate.getFullYear().toString();
             var category = determineCategory(merchant);
             var sourceLabel = isTestMode ? '🧪 測試執行' : '';
             
             if (!allDataByYear[txYear]) allDataByYear[txYear] = [];
             
             // 收集資料列：[日期, 金額, 內容, 分類, 來源]
             allDataByYear[txYear].push([pendingDate, amount, merchant, category, sourceLabel]);
             
             totalCount++;
             hasDataInThisThread = true;
          }
          pendingDate = ""; 
        }
      }
    }
    if (!isTestMode && hasDataInThisThread) message.markRead();
  }
  
// 2. 寫入資料 (使用 insertRowsAfter(1) 達到倒序效果)
  for (var year in allDataByYear) {
    var sheet = getOrCreateSheet(year);
    var newRows = allDataByYear[year];
    
    if (newRows.length > 0) {
      // 在第 1 列之後 (即標題下方) 插入空白列
      sheet.insertRowsAfter(1, newRows.length);
      
      // 寫入資料
      sheet.getRange(2, 1, newRows.length, 5).setValues(newRows);
      
      // 🎨 新增這行：選取剛寫入的 B 欄(金額)，設定格式為 "三位一撇" (#,##0)
      sheet.getRange(2, 2, newRows.length, 1).setNumberFormat("#,##0");
      
      Logger.log("✅ [" + year + "] 已插入 " + newRows.length + " 筆新資料到最上方");
      updateMatrixStats(year); // 更新報表
    }
  }
  
  return totalCount;
}

// 🧠 分類判斷
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

// ==========================================
// 📊 報表更新 (維持原樣)
// ==========================================
function updateMatrixStats(targetYear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName(targetYear);
  if (!sourceSheet) return;

  var statsSheetName = CONFIG.STATS_SHEET_PREFIX + targetYear;
  var statsSheet = ss.getSheetByName(statsSheetName);
  if (!statsSheet) statsSheet = ss.insertSheet(statsSheetName);
  else statsSheet.clear();
  
  var data = sourceSheet.getDataRange().getValues();
  data.shift(); // 移除標題
  
  var matrix = {};
  var categories = new Set();
  
  data.forEach(function(row){
    var d = new Date(row[0]);
    var amt = Number(row[1]);
    var cat = row[3] || CONFIG.DEFAULT_CATEGORY;
    
    if (isNaN(d.getTime()) || isNaN(amt)) return;
    
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

// 📱 iOS API (也改成插入到最上面)
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var date = data.date ? new Date(data.date) : new Date();
    var year = date.getFullYear().toString();
    var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy/MM/dd");
    var amount = data.amount;
    var merchant = data.type || "手動輸入";
    
    var sheet = getOrCreateSheet(year);
    var category = determineCategory(merchant);

    // 🆕 改成插入到第 2 行 (Row 2)
    sheet.insertRowsAfter(1, 1);
    sheet.getRange(2, 1, 1, 5).setValues([[dateStr, amount, merchant, category, '📱 iOS捷徑']]);
    
    updateMatrixStats(year);
    return ContentService.createTextOutput(JSON.stringify({status: "success", year: year, cat: category}));
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", msg: err.toString()}));
  }
}

// ==========================================
// 🔄 修正版：強制更新 (改用 toast 通知)
// ==========================================
function forceUpdateAllStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var count = 0;
  
  // 顯示開始通知
  ss.toast("正在掃描並更新所有年度報表...", "系統運作中", -1);

  try {
    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      // 檢查是否為 4 位數年份 (例如 2024, 2025)
      if (name.match(/^\d{4}$/)) { 
        updateMatrixStats(name);
        count++;
      }
    });
    
    // ✅ 改用 toast，5秒後自動消失，不會卡住程式
    ss.toast("✅ 已成功更新 " + count + " 個年度的報表。", "更新完成", 5);
    
  } catch (e) {
    // 萬一出錯，改用 alert 警告
    SpreadsheetApp.getUi().alert("❌ 更新失敗：\n" + e.toString());
  }
}

function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["日期", "金額", "內容", "分類", "原始訊息"]); // 這是標題列 (Row 1)
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ==========================================
// 🔍 v5.5 最終版：建立互動式明細查詢表
// (新增總計區塊 - 即時顯示所選分類花費)
// ==========================================
function createDetailSearchSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "🔍 支出明細查詢";
  var sheet = ss.getSheetByName(sheetName);
  
  // 顯示開始通知
  ss.toast("正在建立查詢面板，請稍候...", "系統運作中", -1);

  try {
    // 1. 如果已經有這個表，先刪除舊的
    if (sheet) { ss.deleteSheet(sheet); }
    sheet = ss.insertSheet(sheetName, 0); 
    
    // 2. 設定選單區 (第 1 列)
    sheet.getRange("A1").setValue("📅 選擇年份：").setFontWeight("bold").setHorizontalAlignment("right");
    sheet.getRange("C1").setValue("🏷️ 選擇分類：").setFontWeight("bold").setHorizontalAlignment("right");
    
    // 抓取年份
    var sheets = ss.getSheets();
    var years = [];
    sheets.forEach(function(s) {
      if (s.getName().match(/^\d{4}$/)) years.push(s.getName());
    });
    if (years.length === 0) years = ["2025"];
    
    // 年份選單
    var ruleYear = SpreadsheetApp.newDataValidation().requireValueInList(years, true).build();
    var cellYear = sheet.getRange("B1");
    cellYear.setDataValidation(ruleYear);
    cellYear.setValue(years[0]); 
    cellYear.setBackground("#FFF2CC"); 
    
    // 分類選單
    var categories = Object.keys(CONFIG.CATEGORIES);
    categories.push(CONFIG.DEFAULT_CATEGORY);
    categories.sort();
    
    var ruleCat = SpreadsheetApp.newDataValidation().requireValueInList(categories, true).build();
    var cellCat = sheet.getRange("D1");
    cellCat.setDataValidation(ruleCat);
    cellCat.setValue(categories[0]); 
    cellCat.setBackground("#D9EAD3"); 
    
    // 🔥🔥🔥 新增總計區塊 (第 2 列) 🔥🔥🔥
    sheet.getRange("C2").setValue("當前分類總計：").setFontWeight("bold").setHorizontalAlignment("right");
    
    // 核心公式：SUMIFS(金額範圍, 分類範圍, D1)
    var sumFormula = '=SUMIFS(INDIRECT(B1&"!B:B"), INDIRECT(B1&"!D:D"), D1)';
    sheet.getRange("D2").setFormula(sumFormula);
    
    // 格式化總計金額
    sheet.getRange("D2").setFontWeight("bold").setBackground("#FFF7E0").setNumberFormat("NT$ #,##0");
    // 🔥🔥🔥 總計區塊新增結束 🔥🔥🔥
    
    // 3. 設定標題 (第 3 列)
    var headers = [["📅 日期", "💰 金額", "📝 內容", "🔗 來源"]];
    sheet.getRange("A3:D3").setValues(headers);
    sheet.getRange("A3:D3").setBackground("#434343").setFontColor("white").setFontWeight("bold");
    
    // 4. 設定公式 (從第 4 列開始顯示資料)
    sheet.getRange("A4").setFormula('=IFERROR(QUERY(INDIRECT(B1&"!A2:E"), "SELECT A, B, C, E WHERE D = \'"&D1&"\' ORDER BY A DESC", 0), "⚠️ 該分類無資料")');
    
    // 5. 格式美化
    sheet.setColumnWidth(1, 100); 
    sheet.setColumnWidth(2, 100); 
    sheet.setColumnWidth(3, 250); 
    sheet.setColumnWidth(4, 100); 
    
    // 格式修正
    sheet.getRange("A4:A").setNumberFormat("yyyy/mm/dd");
    sheet.getRange("B4:B").setNumberFormat("#,##0");
    
    ss.toast("✅ 查詢面板升級完成！總計金額已新增到上方。", "完成", 5);
    
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ 建立失敗：\n" + e.toString());
  }
}
// ==========================================
// 🤖 首次執行：自動設定觸發器
// ==========================================
function createInitialTriggers() {
  // 使用 PropertiesService 檢查是否已經設定過觸發器
  var userProperties = PropertiesService.getUserProperties();
  if (userProperties.getProperty('initial_trigger_set')) return;
  
  // 1. 設定每小時執行抓信的觸發器 (processConsolidatedEmails)
  ScriptApp.newTrigger('processConsolidatedEmails')
      .timeBased()
      .everyHours(1)
      .create();

  // 2. 標記觸發器已設置，確保只執行一次
  userProperties.setProperty('initial_trigger_set', true);
  
  // 3. 提示用戶
  SpreadsheetApp.getActive().toast("✨ 自動抓信已設定完畢！", "初始化完成", 5);
}
