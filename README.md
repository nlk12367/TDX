# 充電與續航規劃

獨立的手機優先 LIFF 網頁：手動輸入目前電量，計算基準續航；可用 Google Maps Routes 規劃起點至目的地。附近位置／車流模式目前保留介面，TDX 尚未串接，也沒有使用未驗證的交通耗電係數。

## 本機啟動

需要 Python 3.10 以上。PowerShell：

```powershell
$env:PORT = "8080"
$env:LIFF_ID = "你的 LIFF ID"
$env:GOOGLE_MAPS_API_KEY = "你的 Google Maps JavaScript API key"
python server.py
```

開啟 <http://localhost:8080/>。地圖路線需啟用 Google Maps JavaScript API 與 Routes API。Google Maps JavaScript API key 會送至瀏覽器，請在 Google Cloud 限制可用網站來源與 API；不要使用 server-side private key。

## Zeabur 部署

1. 建立 GitHub repository，將這個資料夾的檔案放在 repository 根目錄。
2. 在 Zeabur 建立 Python/Docker 服務並連接該 repository；專案內的 `Dockerfile` 會啟動 `server.py`。
3. 在 Zeabur Variables 設定 `LIFF_ID`、`GOOGLE_MAPS_API_KEY`；`GOOGLE_MAPS_MAP_ID` 可選填。不要把金鑰寫進程式碼或推到 GitHub。
4. 部署完成後，複製 Zeabur HTTPS 網址。
5. LINE Developers 的 LIFF Endpoint URL 設為這個網址。若沿用另一個已綁定舊網域的 LIFF，請將 endpoint 改到新服務，或在 LINE 建立對應新網域的 LIFF app。Rich Menu 連到該 LIFF URL。

TDX 目前尚未接通，所以附近路況不會顯示即時車流。接入前需要 TDX 憑證，以及經資料驗證的車流到能耗換算模型；不要把 TDX Client Secret 放在此前端服務或 repository，應由後端環境變數管理。

## 續航公式

`基準續航 (km) = 電池名目容量 (kWh) × SOC (%) ÷ 100 × 參考效率 (km/kWh)`

起點到目的地的剩餘電量估算：`抵達 SOC = 目前 SOC − 路線距離 (km) ÷ 參考效率 ÷ 電池容量 × 100`，低於 0% 時以 0% 顯示。此為參考模型，不是車輛即時電量或保證續航。
