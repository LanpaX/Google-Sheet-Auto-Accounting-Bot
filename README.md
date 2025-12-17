# 💰 iOS 捷徑 + Google Apps Script 全自動記帳系統 (v8.1)

這是一個基於 **Google Apps Script (GAS)** 與 **iOS 捷徑 (Shortcuts)** 的自動化記帳解決方案。透過 iPhone 快速輸入或選單選擇，資料會自動同步至 Google Sheets，並生成即時的年度收支儀表板。

## 🚀 版本 v8.1 功能亮點

* **雙向記帳核心**：自動偵測金額前的 `+` 號來區分「收入」與「支出/提款」。
* **智慧分類邏輯**：
    * **優先權 (Priority)**：若 iOS 選單直接指定分類，系統優先採用。
    * **關鍵字偵測 (Fallback)**：若無指定分類，自動根據備註 (Merchant) 關鍵字進行歸類。
* **強效防護機制**：寫入資料後的自動排序功能加入防呆機制，即使試算表開啟篩選器也不會導致腳本報錯。
* **美化回傳訊息**：回傳整齊的純文字摘要至 iPhone 通知，包含金額、項目與最終分類。

## 🛠️ 安裝與部署

### 後端：Google Apps Script (GAS)

1. 建立一個新的 Google Sheet。
2. 點擊 `擴充功能` > `Apps Script`。
3. 將 `Code.gs` 的內容複製並貼上。
4. 部署為網路應用程式：
    * **部署類型**：網頁應用程式 (Web App)
    * **存取權限**：**所有人 (Anyone)** (這點非常重要，否則捷徑無法存取)
5. 取得部署網址 (Deployment URL)。

### 前端：iOS 捷徑設定

1. 建立一個新的捷徑。
2. 設定邏輯如下：
    * **輸入金額** (儲存為變數 `MyMoney`)
    * **輸入備註** (儲存為變數 `MyNote`)
    * **選擇分類** (儲存為變數 `MyCategory`，需對應 GAS 中的 Keys)
    * **取得網路內容 (POST)**：
        * URL: `[你的 GAS 部署網址]`
        * Method: `POST`
        * JSON Body:
            * `amount`: `MyMoney`
            * `note`: `MyNote`
            * `type`: `MyCategory`

## ⚙️ 設定檔 (Configuration)

你可以於 `Code.gs` 上方的 `CONFIG` 物件中自定義分類與關鍵字：

```javascript
var CONFIG = {
  STATS_SHEET_PREFIX: "📊 年度戰情室 ",
  CATEGORIES: {
    "🍔 餐飲美食": ["餐飲", "星巴克", "麥當勞", "路易莎"],
    "🥦 雜貨超商": ["7-ELEVEN", "全家", "全聯"],
    // ... 自行新增
  },
  DEFAULT_CATEGORY: "其他支出"
};
