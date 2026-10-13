
# 地址轉經緯度＋行政區註記工具（Finalguard v3）

本工具整合 Geocoder 與 GeoDataFrame，實現地址轉經緯度與行政區註記的一體化應用，支援 Streamlit GUI 操作與 GitHub 部署。

## ✅ 功能特色

- 📌 上傳檔案即自動清除行政區欄位（避免欄位衝突與錯碼）
- 🧠 Geocode 過程支援筆數上限控制，保護 API 配額
- 🔁 重複地址自動補 gx/gy，減少查詢次數
- 🧼 行政區註記採下載前補值邏輯，穩定不漏註
- 🌐 支援部署至 [Streamlit Cloud](https://share.streamlit.io/)，即時更新不變網址

## 🧩 使用流程

1. 上傳含「地址」欄的 Excel 或 CSV 檔
2. 選擇地址欄位與 Geocode 筆數上限（可跳過）
3. 點選「執行 Geocode」產生 gx/gy
4. 點選「📥 下載最終結果」，即自動完成行政區註記並匯出 Excel

## 🔧 技術說明

- Geocoder 使用 ArcGIS 引擎：`geocoder.arcgis(...)`
- 行政區資料使用台灣村里 SHP 檔（EPSG:4326）
- GeoPandas 進行空間 join，欄位包含：`COUNTYNAME`, `TOWNNAME`, `VILLNAME`
- 避免 session 錯誤，採 `st.session_state["df"]` 為全程主控

## 📂 主要檔案

- `geocode_app_autojoin_finalguard_v3.py`：最終執行程式（推薦設為 Streamlit 主入口）
- `app.py`：可視需求匯入主程式或直接貼入整段
- `requirements.txt`：包含必要套件（streamlit、geopandas、geocoder 等）

## 👨‍🏫 教學應用建議

- 適用高中資訊課、Python 圖資應用入門
- 可結合 folium 製作地圖互動與視覺化敘事
- 推薦納入教師聯盟內部模組化應用流程

---

© 2025 陳警官 × 小智協作出品
