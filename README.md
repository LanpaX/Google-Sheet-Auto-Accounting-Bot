# Personal Spend Analytics Dashboard
## 個人支出分析儀表板 — A Procurement-Style Spend Analytics Toolkit

![Status](https://img.shields.io/badge/status-live-success)
![Stack](https://img.shields.io/badge/built_with-Google_Apps_Script-blue)
![Result](https://img.shields.io/badge/unclassified_spend-37%25→7.2%25-brightgreen)

A personal expense tracker built in **Google Apps Script**, designed around corporate procurement analytics concepts. Auto-classifies transactions from credit-card emails, detects spend anomalies, analyzes vendor concentration (Pareto), and tracks MoM / YoY trends — all rendered into a single Google Sheets dashboard.

> **中文導讀**
> 一個用 Google Apps Script 寫的個人記帳工具,設計上刻意對應**企業採購 (Procurement) 的支出分析框架** — 自動分類、異常偵測、供應商集中度、月增率/年增率追蹤。所有功能整合在 Google Sheets 戰情室 (War Room) 一頁中。

---

## 📌 Why This Project / 為什麼做這個

Tracking personal expenses is a solved problem. **Reframing the same data through the lens of how a procurement team analyzes corporate spend is not.**

The technical infrastructure is identical — transactions in, structured analytics out — but the framing forces design decisions that mirror what a real Procure-to-Pay (P2P) system needs to handle: classification taxonomy, tail spend governance, vendor concentration risk, anomaly detection, and trend monitoring.

> **中文重點:**這個專案技術核心很簡單,真正有趣的是把同一份資料用「採購支出分析」的視角重新設計。每一個功能都對應企業 P2P 系統的標配 — 分類治理、長尾支出、供應商集中度、異常偵測、趨勢監控。

---

## 🎯 Procurement Concept Mapping

| Personal Finance Feature | Corporate Procurement Concept |
|---|---|
| Email auto-parsing → row insertion | Invoice ingestion in P2P system |
| 13-category keyword taxonomy | Category Management / Spend Cube |
| "Unclassified" bucket diagnostic | Tail Spend Analysis |
| Top 20% merchant analysis | Vendor Concentration / Supplier Rationalization |
| μ + 2σ outlier flagging | Spend Variance Alert / Anomaly Detection |
| MoM / YoY % change | Spend Trend Analysis |
| Re-classification tool for historical rows | Spend Cube Re-mapping after taxonomy update |

---

## 🚀 Key Features

### 1. Auto-Classification Engine
Parses Gmail for credit-card consolidated statements, extracts each transaction (date, amount, merchant), and assigns it to one of 13 categories using a keyword dictionary. Includes full-width-to-half-width normalization and quote/apostrophe stripping to handle real-world merchant name inconsistencies (e.g., `ＩＫＥＡ` → `IKEA`, `T\`WAY` → `TWAY`).

### 2. Spend Variance Alert
For each category-month, calculates μ + 2σ from that category's own historical pattern. Months exceeding the threshold are auto-highlighted in red. Statistically, this flags the top ~2.5% most extreme months — the ones a procurement reviewer would want to investigate.

Skips detection when fewer than 3 data points exist (avoids small-sample false positives).

### 3. Pareto / Vendor Concentration
Computes what percentage of total spend the **top 20% of merchants** account for. In healthy procurement, this number tends toward 80% (classic Pareto). Lists the top 5 merchants with cumulative spend.

### 4. MoM / YoY Trend Tracking
Two rows under the spend matrix:
- **MoM** (Month-over-Month): captures recent shifts, but inflated by seasonality.
- **YoY** (Year-over-Year): cancels out seasonality, surfaces structural changes.

Together they let you distinguish "December is high because December is always high" from "December is genuinely escalating year over year."

### 5. Tail Spend Diagnostic
A dedicated tool that scans all unclassified transactions, ranks them by cumulative spend, and overlays a Pareto 80%-cumulative line. Tells you exactly which merchants to add to the keyword dictionary to maximize coverage gain per keyword added.

### 6. Historical Re-classification
When the taxonomy is updated, a one-click tool re-runs classification across all historical rows. Includes dry-run preview + confirmation dialog before any data is overwritten. The corporate-procurement equivalent is **Spend Cube re-mapping** after a category-taxonomy revision.

---

## 📈 Case Study: 37% → 7.2% Unclassified Spend in 2 Iterations

The most procurement-relevant part of this project isn't the features — it's the **process of using the system to fix itself**.

**Initial state.** After running the Tail Spend Diagnostic for the first time, 37% of total historical spend was sitting in the "Other" bucket. By corporate standards (typical KPI threshold: <5% unclassified), this was a 🔴 severity issue. Worse, the trend was deteriorating: 11% (2023) → 28.7% (2024) → 45.5% (2025) → 49.7% (2026 YTD).

**Root cause analysis.** The diagnostic's Top-30 ranking immediately surfaced three structural issues:
1. **Missing category** — travel & lodging was scattered across hotels, airlines, booking platforms, accounting for ~39% of unclassified spend on its own.
2. **Insufficient keyword depth** — a generic "Investment" category had only one keyword and missed actual investment activity (crypto on-ramps, securities deposits via 臺灣銀行 which were tuition payments).
3. **Encoding mismatch** — credit-card statements rendered some merchants in full-width characters (`ＩＫＥＡ`), but the keyword dictionary used half-width (`IKEA`). String comparison failed silently.

**Iteration 1: Structural fix.** Added 3 new categories (Travel, Insurance, Education), expanded the Investment category, and implemented a Unicode normalizer for full-width → half-width conversion. **Result: 37% → 11.4%.**

**Iteration 2: Long-tail cleanup.** Re-ran the diagnostic on the residual 11.4%. Identified one more silent failure: an apostrophe-encoding mismatch (a Korean airline merchant used backtick `` ` `` instead of straight apostrophe `'`). Generalized the normalizer to strip all quote-character variants. Added ~10 more domain-specific keywords from the new Top-30 list. **Result: 11.4% → 7.2%.**

**Decision to stop.** At 7.2% — within corporate "🟢 Good" range — the remaining tail was confirmed irreducible: one-time international travel merchants, ambiguous merchant codes, and genuinely unknowable transactions. Continuing to expand the dictionary would have entered diminishing returns. **Knowing when to stop is itself a procurement competency** — Pareto governance is about the 80/20, not about chasing 100%.

| Iteration | Unclassified % | Health Rating |
|---|---|---|
| Baseline | 37.0% | 🔴 Severe |
| Iter 1 (taxonomy + Unicode fix) | 11.4% | 🟠 Needs Work |
| Iter 2 (apostrophe fix + long-tail) | **7.2%** | **🟢 Good** |

> **中文重點:**這個專案最有意思的地方不是功能,是用功能反過來修自己。從 37% 未分類降到 7.2% 這一段過程,完整展示了「發現問題 → 拆解根因 → 系統性改善 → 知道何時收手」的迭代邏輯,也是企業採購最看重的能力。

---

## 🏗️ Architecture

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  iOS Shortcut    │     │  Gmail (credit  │     │  Manual Entry    │
│  (HTTP POST)     │     │  card emails)   │     │  (Sheet UI)      │
└────────┬─────────┘     └────────┬────────┘     └────────┬─────────┘
         │                        │                       │
         │   doPost()             │  processEmails()      │
         │                        │                       │
         └────────────────────────┼───────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │   determineCategory()       │
                    │   • normalize (FW→HW, ‵→‘)  │
                    │   • keyword match           │
                    │   • 13 categories + tail    │
                    └──────────────┬──────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │   Year Sheets (2023, 2024,  │
                    │   2025, 2026 — auto-created)│
                    └──────────────┬──────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │   War Room Dashboard        │
                    │   • Spend Matrix            │
                    │   • Anomalies (red cells)   │
                    │   • MoM / YoY rows          │
                    │   • Category KPIs           │
                    │   • Pareto / Top vendors    │
                    └─────────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Runtime:** Google Apps Script (V8 runtime, JavaScript)
- **Storage:** Google Sheets (one tab per year + a unified dashboard)
- **Inputs:** Gmail API (credit-card consolidation emails) + iOS Shortcuts webhook
- **Outputs:** Conditional formatting, color-coded matrix, dynamic data validation

No external dependencies. No paid APIs. The entire system runs inside the user's Google account.

---

## ⚠️ Limitations & Honest Trade-offs

This is a personal project, not a production system. A few things were intentionally **not** built:

- **No LLM-based classification.** Considered but rejected — the data is structured and the keyword approach is faster, cheaper, and more interpretable for this scale (a few thousand transactions/year). For larger taxonomies (10k+ unique merchants), LLM fallback for keyword-miss cases would make sense.
- **No deduplication.** Reprocessing the same email twice would create duplicate rows. Not an issue with the current "unread-only" filter, but a real production system would need transaction-hash idempotency.
- **No budget vs actual.** Skipped because it requires manual budget input and the case-study value of the existing analytics features was already strong without it.
- **Anomaly detection ignores seasonality.** μ + 2σ uses the full year's history, which means December (or other seasonally-high months) can produce false positives. A production system would compare against same-month-prior-year (a YoY-anchored anomaly detector).

---

## 📷 Screenshots

> Screenshots use **anonymized mock data** to protect personal financial information.

| | |
|---|---|
| ![Dashboard](docs/screenshots/01_dashboard.png) | ![Pareto](docs/screenshots/02_pareto.png) |
| **War Room dashboard** with anomaly highlighting and trend rows | **Pareto / vendor concentration** view |
| ![Diagnostic](docs/screenshots/03_diagnostic.png) | ![Reduction](docs/screenshots/04_reduction.png) |
| **Tail Spend Diagnostic** with Top-30 merchant ranking | **Before / after** of the 37% → 7.2% reduction |

---

## 🚀 Getting Started

1. Create a new Google Sheet.
2. **Extensions → Apps Script** → paste `expense_tracker_v4.gs`.
3. Save and reload the sheet.
4. Use the **💰 記帳小幫手** (Expense Helper) menu:
   - `📩 立即抓信` — Pull credit-card emails now
   - `🔄 刷新總戰情室` — Refresh the dashboard
   - `🔍 Tail Spend 診斷` — Run unclassified-spend diagnostic
   - `♻️ 重新分類所有交易` — Re-classify historical rows after taxonomy update

Optional: configure a **time-driven trigger** in the Apps Script editor to run `processConsolidatedEmails()` daily for fully unattended operation.

---

## 📝 What This Demonstrates

For anyone reading this as part of an application:

- **Domain reframing** — taking a familiar problem (personal finance) and re-architecting it through a different professional lens (procurement analytics).
- **Iterative quantitative improvement** — the 37% → 7.2% case study isn't a "look I built something" story; it's a "look how I diagnosed and fixed it" story.
- **Trade-off literacy** — the *Limitations* section is intentional. Knowing what *not* to build is as important as knowing what to build.
- **End-to-end ownership** — ingestion (Gmail/Shortcuts), processing (classifier, normalizer), analytics (variance, Pareto, trends), presentation (formatted dashboard), and governance (re-classification tool) — all built and integrated.

---

## License

MIT. Take it, fork it, adapt it.
