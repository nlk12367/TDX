# TDX｜充電與續航規劃

本專案提供手機優先的充電與續航規劃網頁，支援手動輸入車輛目前電量、估算基準可行駛距離，以及使用 Google Maps Routes 規劃起點至目的地的路線。網頁可作為 LINE LIFF 入口使用。

> **目前功能狀態：** 手動電量與續航估算、路線查詢，以及伺服器端 TDX OAuth 憑證驗證已實作。附近道路車流資料查詢與交通狀況續航修正尚未接入；TDX 憑證驗證成功不代表已取得道路資料。

## 功能

- 手動輸入目前電量百分比，並同步調整電量滑桿。
- 依電池名目容量與參考效率估算基準續航；基準可行駛距離最高以 **480 km** 顯示。
- 初始參考參數為 74.7 kWh 電池容量與 6.7 km/kWh 參考效率，可由使用者調整。
- 透過 Google Maps Routes 查詢路線距離與預估時間，再估算抵達電量及剩餘基準續航。
- 附近位置功能會在使用者同意後於瀏覽器取得位置，並檢查伺服器端 TDX 憑證；目前不會送出位置，也不查詢附近車流。
- 在 LINE App 中使用時，可透過 LIFF（LINE Front-end Framework）初始化網頁。

## 續航估算

基準可行駛距離依下式計算，並設有 480 km 上限：

```text
基準距離 (km) = min(電池名目容量 (kWh) × 電量比例 × 參考效率 (km/kWh), 480 km)
```

路線抵達電量以目前電量、路線距離、電池容量及參考效率估算。抵達後顯示的基準續航同樣受 480 km 上限限制，且不高於出發時的基準續航。

此估算不是車輛即時電池資料或續航保證，未包含電池可用容量差異、氣溫、坡度、空調、車速及駕駛方式造成的能耗變化。

## 技術與檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 續航規劃頁面結構、電量輸入、路線及附近位置介面 |
| `app.js` | LIFF 初始化、電量與續航估算、Google Maps Routes 路線規劃及定位互動 |
| `style.css` | 響應式介面樣式 |
| `server.py` | 靜態檔案服務、前端設定輸出及 TDX 憑證狀態 API |
| `Dockerfile` | 容器啟動設定 |

前端由原生 HTML、CSS 與 JavaScript 組成；後端使用 Python 標準函式庫提供 HTTP 服務。Google Maps JavaScript API、Routes API、LINE LIFF SDK 與 TDX OAuth 服務為外部服務。

## 本機啟動

需要 Python 3.10 或更新版本。在 PowerShell 設定所需環境變數並啟動：

```powershell
$env:PORT = "8080"
$env:LIFF_ID = "你的 LINE LIFF ID"
$env:GOOGLE_MAPS_API_KEY = "你的 Google Maps JavaScript API key"
$env:TDX_CLIENT_ID = "你的 TDX Client ID"
$env:TDX_CLIENT_SECRET = "你的 TDX Client Secret"
python server.py
```

開啟 <http://localhost:8080/>。`PORT` 未設定時預設為 `8080`。LIFF ID 也可使用程式預設值；Google Maps Map ID 為選填設定。

## Zeabur 部署

1. 將 GitHub 儲存庫連接至 Zeabur，使用專案中的 Dockerfile 建立服務。
2. 設定 `LIFF_ID`、`GOOGLE_MAPS_API_KEY`、`TDX_CLIENT_ID` 及 `TDX_CLIENT_SECRET` 等環境變數；`GOOGLE_MAPS_MAP_ID` 可選填。
3. 確認服務使用 Zeabur 提供的 `PORT`，並部署至 HTTPS 網址。
4. 在 LINE Developers 的 LIFF 設定中，將 Endpoint URL 指向部署網址；Rich Menu 或其他入口需連到相應 LIFF URL。
5. 部署後測試頁面、Google Maps 路線及 `/api/tdx/status`。TDX 認證狀態只驗證 OAuth 憑證，不代表附近道路資料查詢已完成。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/config.js` | 提供 LIFF ID 與 Google Maps 前端設定；不輸出 TDX 機密憑證 |
| `GET` | `/api/tdx/status` | 由伺服器驗證 TDX OAuth Client Credentials；回傳設定及驗證狀態 |

TDX Access Token 僅由伺服器取得並暫存在記憶體至到期；Client Secret 和 Access Token 不會回傳給瀏覽器。伺服器狀態端點不會回傳任何憑證內容。

## 隱私與限制

- 電量、電池參數與續航估算在瀏覽器端處理，不會寫入本專案資料庫。
- Google Maps 路線查詢只在使用者送出起點與目的地後進行；地點資料會交由 Google Maps 處理。
- 附近位置功能目前只在瀏覽器取得位置並檢查 TDX 認證，不會傳送或保存座標，也未查詢附近道路車流。
- 請在 Google Cloud 限制瀏覽器 API Key 可使用的網站來源與 API；不可將 TDX Client Secret 或其他私密憑證寫入程式碼或提交至 GitHub。
- 路線距離和續航結果僅供行程參考，不能取代車輛儀表資訊或實際道路狀況。
