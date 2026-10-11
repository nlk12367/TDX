# 充電與續航規劃

獨立的手機優先 LIFF 網頁：手動輸入目前電量，計算基準續航；可用 Google Maps Routes 規劃起點至目的地。附近位置模式可驗證伺服器端 TDX 憑證，但附近道路車流資料尚未查詢，也不會套用未驗證的交通耗電係數。

## 本機啟動

需要 Python 3.10 以上。PowerShell：

```powershell
$env:PORT = "8080"
$env:LIFF_ID = "你的 LIFF ID"
$env:GOOGLE_MAPS_API_KEY = "你的 Google Maps JavaScript API key"
$env:TDX_CLIENT_ID = "你的 TDX Client ID"
$env:TDX_CLIENT_SECRET = "你的 TDX Client Secret"
python server.py
```

開啟 <http://localhost:8080/>。地圖路線需啟用 Google Maps JavaScript API 與 Routes API。Google Maps JavaScript API key 會送至瀏覽器，請在 Google Cloud 限制可用網站來源與 API；不要使用 server-side private key。

## Zeabur 部署

1. 建立 GitHub repository，將這個資料夾的檔案放在 repository 根目錄。
2. 在 Zeabur 建立 Python/Docker 服務並連接該 repository；專案內的 `Dockerfile` 會啟動 `server.py`。
3. 在 Zeabur Variables 設定 `LIFF_ID`、`GOOGLE_MAPS_API_KEY`、`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`；`GOOGLE_MAPS_MAP_ID` 可選填。不要把金鑰寫進程式碼或推到 GitHub。
4. 部署完成後，複製 Zeabur HTTPS 網址。
5. LINE Developers 的 LIFF Endpoint URL 設為這個網址。若沿用另一個已綁定舊網域的 LIFF，請將 endpoint 改到新服務，或在 LINE 建立對應新網域的 LIFF app。Rich Menu 連到該 LIFF URL。

伺服器會用 TDX 的 OAuth Client Credentials 流程驗證憑證，並將 Access Token 暫存在記憶體至到期；狀態端點只回傳驗證結果，不回傳 Client Secret 或 Token。附近路況資料查詢仍未接入，車流轉能耗模型亦待資料驗證；不要把 TDX Client Secret 放在前端或 repository，只由後端環境變數管理。

## 續航公式

`基準續航 (km) = 電池名目容量 (kWh) × SOC (%) ÷ 100 × 參考效率 (km/kWh)`

起點到目的地的剩餘電量估算：`抵達 SOC = 目前 SOC − 路線距離 (km) ÷ 參考效率 ÷ 電池容量 × 100`，低於 0% 時以 0% 顯示。此為參考模型，不是車輛即時電量或保證續航。
