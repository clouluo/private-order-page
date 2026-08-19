# 部署與驗收指南

三個部署對象：Google Apps Script（收單）、Cloudflare Worker（網站本體）、金鑰與 QR。
帳號註冊、密碼登入、OAuth 授權、付款都必須由使用者本人操作——到那一步時明確請使用者執行。

## A. Google 端（先做，因為 Worker 需要它的網址）

1. 使用者的 Google 帳號開 `sheets.new` 建試算表，命名「<品牌> 預購訂單總表」，記下網址中的試算表 ID
2. 開 script.google.com → 新專案。**用獨立專案就好**——模板靠 `CONFIG.SHEET_ID` 指定試算表，
   不必從試算表選單進去綁定（那條路開出來的分頁常常不在可控範圍內，抓不到）
3. 貼上客製後的 apps-script-template.gs
   - 用 `monaco.editor.getModels()[0].setValue(code)` 直接注入編輯器
   - 程式碼較長時，在頁面注入一個 `<input type="file">`，用 file_upload 把 .gs 傳進去再讀檔設值，
     避免把幾千字的程式碼塞進對話內容
4. 部署 → 新增部署作業 → 網頁應用程式 → 執行身分「我」、存取權「所有人」→ 部署
   - 會出現「需要授權」：**請使用者自己點完** OAuth（試算表＋寄信兩種權限）
5. 記下網頁應用程式網址（`https://script.google.com/macros/s/…/exec`）＝ SHEET_HOOK
6. 把編輯器上方的函式選單切到 `formatSheet` 執行一次，套用試算表版面
   - 選函式的下拉要確實點中，沒點中會變成執行 doPost，在表裡寫一列空白資料
7. 之後改程式碼：部署 → 管理部署作業 → 鉛筆 → 版本「**建立新版本**」→ 部署（網址不變）
   - 只按 cmd+S 存檔不會生效，一定要建新版本

驗證：從任意頁面
`fetch(SHEET_HOOK, {method:"POST", headers:{"content-type":"text/plain"}, body:'{"姓名":"測試"}'})`，
回應文字應為 `ok`；`ok-mailfail` 表示表有寫入但寄信權限未授權。

**時區**：不要把 `new Date()` 直接寫進儲存格——Apps Script 會依專案時區換算，容易差 8 小時。
模板已改成 `Utilities.formatDate(new Date(), "Asia/Taipei", …)` 寫入字串，不受任何設定影響。

## B. Cloudflare 端

前置（新帳號一次性）：Email 驗證要完成。
若要用 workers.dev 網址，**必須先註冊 workers.dev 子網域**，否則建立精靈的 Deploy 按鈕會停用且無提示。
介面找不到入口時直接打 API：`PUT /accounts/{account_id}/workers/subdomain`，body `{"subdomain":"<名稱>"}`

建立與部署：
1. 建 KV namespace：`POST /accounts/{id}/storage/kv/namespaces`，body `{"title":"<品牌>-cards"}`，記下 id
2. 上傳程式：`PUT /accounts/{id}/workers/scripts/<name>`，multipart 兩個部分：
   `metadata`（application/json）＋ `worker.js`（application/javascript+module）。
   metadata 必含 bindings 與 keep_bindings，否則會掉設定：
   ```json
   {"main_module":"worker.js","compatibility_date":"2025-01-01",
    "bindings":[
      {"type":"kv_namespace","name":"CARDS","namespace_id":"<KV id>"},
      {"type":"plain_text","name":"ORDER_EMAIL","text":"<收件信箱>"},
      {"type":"plain_text","name":"SHEET_HOOK","text":"<GAS 網址>"}],
    "keep_bindings":["secret_text"]}
   ```
   在已登入的 dashboard 分頁注入 `<input type="file">`，用 file_upload 把 worker.js 傳進去，
   再用頁面 fetch 讀檔組 multipart PUT——上百 KB 的程式碼完全不經過對話內容。每次改版重複即可。
3. 設 Secret：`PUT /accounts/{id}/workers/scripts/<name>/secrets`
   - `{"name":"TOTP_SECRET","text":"<base32金鑰>","type":"secret_text"}`
   - `{"name":"SESSION_HOURS","text":"0.5","type":"secret_text"}`（0.5＝30 分鐘）
4. 網站圖示放 KV（模板已內建 `/fav/<key>` 路由）：
   `PUT /accounts/{id}/storage/kv/namespaces/{ns}/values/fav:light`，body 直接放 PNG blob，
   另外再存 `fav:dark`、`fav:touch`。
   在瀏覽器分頁用 canvas 讀圖、加留白、`toBlob()` 後直接 PUT，二進位不必經過對話。

Worker 改名後，已綁定的自訂網域會自動跟著新名字，不用重設。

## C. 自訂網域（建議做法）

比 workers.dev 好：網址短、每個客戶一個子網域、不會綁在別的客戶的帳號名稱上。
建議買一個中性域名（例如 `yourbrand.page`）當所有案子的容器，每接一個案子開一個子網域。
域名本身不要用客戶名，否則換客戶就得換網址；也不要讓 A 客戶從網址看出你在做 B 客戶。

1. 域名加入 Cloudflare：`POST /api/v4/zones`，body `{"name":"<域名>","account":{"id":"<acc>"},"type":"full"}`
2. **⚠️ 用 API 建立的 zone 會卡在 `initializing`**——因為 dashboard 的「選擇方案」那步沒走完，
   Cloudflare 根本不會開始檢查 nameserver。**一定要開
   `https://dash.cloudflare.com/<account_id>/<域名>` 手動選 Free 方案**，狀態才會變 `pending`。
   選方案頁 Pro 的按鈕是實心藍色、Free 是外框的——別點錯。
   這個坑很隱蔽：API 全部回傳成功、RDAP 也查得到正確 NS，但就是永遠不會 active。
   卡超過一小時就先去看這裡，不要一直等。
3. 到註冊商把 nameserver 換成 Cloudflare 給的兩組（**取代**，不是新增）。
   這是帳號設定，取得使用者明確同意後才能代為操作。
4. 等 DNS 快取過期。`https://dns.google/resolve?name=<域名>&type=NS` 回應裡的 `TTL`
   就是還要等多久（gTLD 委派通常 6～24 小時）。
   `https://rdap.org/domain/<域名>` 可確認註冊局是否已收到變更——註冊局對了就純粹是快取，
   不用再動任何設定。等待期間可建每小時檢查的排程任務，生效後自動接續。
5. zone 變 `active` 後綁定：`PUT /accounts/{id}/workers/domains`，body
   `{"environment":"production","hostname":"<客戶>.<域名>","service":"<worker名>","zone_id":"<zone id>"}`
   憑證簽發要幾分鐘，期間會看到 SSL 錯誤，重試即可。
6. **驗收通過後才關掉 workers.dev**：
   `POST /accounts/{id}/workers/scripts/<name>/subdomain`，body `{"enabled":false,"previews_enabled":false}`
   只影響指定的 Worker。順序不能顛倒——先關再測會有網站掛掉的空窗。
7. 同一個站不要留兩個入口。多餘的自訂網域用
   `DELETE /accounts/{id}/workers/domains/{domain_id}` 移除。

## D. 金鑰與 QR

```
python3 scripts/gen_keys.py <品牌名> <正式網址> <輸出目錄> <QR色碼>
```
產出 TOTP_SECRET.txt（填入 Cloudflare Secret）、authenticator-qr.png（現場人員手機掃）、
展場QR-印刷用.png（≥5×5cm 印刷、已含留白、H 級容錯）。
用 opencv 的 QRCodeDetector 實測解碼確認可掃。

**網址若有變更，QR 一定要重產**——最容易忘記的一步。

## E. 上線驗收清單（照順序全部做完）

1. 無痕開網址 → 應見閘門頁（無閘門版則直接見訂購頁）
2. 用金鑰即時算出 TOTP 輸入 → 進站（Python: hmac+sha1, RFC 6238, period 30）
3. 商品圖全部正常載入。輪播中未進入視窗的圖 `naturalWidth` 為 0 是 lazy loading 的正常現象，
   不是錯誤——把 `loading` 改成 eager 再測就知道
4. 選擇專業身份 → 全站價格切換成折扣價、標籤文字也跟著換
5. **金額一致性**：置底總計列、成功頁「訂購總金額」、各期付款金額、訂單信、試算表欄位
   ——五處必須完全相同，且含運費
6. 條款捲到底 → 同意框解鎖；不捲直接送出 → 應被擋
7. 完整送一筆測試單（含名片附件）→ 成功頁金額拆分正確
   - 順便測防呆：宅配地址填「台北市」應被擋下並說明缺什麼；超商取貨要能選 7-11／全家
8. 收件信箱收到訂單信（HTML 排版正常、名片連結點得開）；填單信箱收到副本
9. 試算表自動多一列、電話開頭 0 保留、長欄位有換行沒被切掉
10. **手機實際量一次置底列高度**（420px 寬視窗下應在 100px 內）；
    確認底部安全區沒有多出一大塊黑
11. 刪除試算表測試列，交接

## F. 歷史教訓（新專案不要重蹈）

- **絕不使用 FormSubmit 或同類免費表單轉信服務**。曾在實戰中三次踩雷：AJAX 模式靜默丟附件、
  Cloudflare Workers 共用 IP 被限流、展期中 CORS 突遭封鎖導致現場收單中斷。
  寄信一律走 Google Apps Script MailApp（額度：免費 Gmail 約 100 收件人/天，每單 2 收件人）。
- **「確認成功才顯示成功」**：送單必須讀到後端回應 `ok` 才顯示成功頁；失敗顯示明確錯誤讓客人重試，
  訂單絕不無聲消失。
- **運費要計入總額**。做過一次「置底列含運費、成功頁不含」的 bug，等於每筆少收運費，
  客人還會看到兩個不同數字。改完務必跑上面第 5 項。
- **時間一律明確指定台北時區**。訂單編號用 `new Date().toISOString()` 會用 UTC 算，
  台灣時間半夜下的單會被編成前一天。
- **Apps Script 一定要有 `doGet`**。POST 之後 Google 偶爾會轉址，瀏覽器改用 GET 再打一次同一個網址；
  沒有 doGet 就回錯誤頁，前端誤判成「送出失敗」——但**訂單其實已經寫進試算表了**。
  客人看到失敗會重送，於是變成兩筆。判斷方法：查 Apps Script 執行記錄，
  doPost 全部「已完成」卻有客訴送不出去，就是這個。
- **送出失敗的訊息不要叫客人重送**。連線類失敗有可能後端已寫入、只是回應沒讀到。
  正確做法是重試一次，仍失敗就顯示訂單編號並請對方「先別重送、帶編號聯繫」。
  訂單編號在重試之間不變，萬一真的寫兩次也能用編號辨識。
- **⚠️ 光有前端重試會製造重複訂單，後端一定要做去重**。實際發生過：
  `appendRow()` 已經寫入，但接著 `sendOrderMail_()` 寄兩封信很慢，回應被拖住，
  前端讀不到就重試，於是同一個訂單編號在試算表出現兩列（間隔約 30 秒）。
  修法：`doPost` 進來先取 `LockService.getScriptLock()` 序列化，再用訂單編號
  查一次「這筆是不是已經寫過」，寫過就直接回 `ok-dup` 不再寫、也不再寄信。
  寫完加 `SpreadsheetApp.flush()` 確保資料落地後才釋放鎖，否則重試可能查不到剛寫的那列。
  前端只認回應開頭是不是 `ok`，所以 `ok-dup` 會正常顯示成功頁。
  **判斷方法**：試算表出現訂單編號相同、時間差幾十秒的兩列，就是這個問題。
- **media query 要放在對應的基本樣式之後**。同樣特異性下後面的規則會覆蓋前面的，
  手機版區塊寫在前面等於完全沒生效——實際踩過，手機底部總計列變成兩倍高才發現。
- **置底固定列要處理 iPhone 安全區**：`padding-bottom: calc(12px + env(safe-area-inset-bottom,0px))`，
  否則內容會被底部的 home indicator 區域推得很奇怪。
- **同一個外部連結會出現在好幾個地方**（成功頁按鈕、匯款資訊文字、頁尾），
  漏改一處就會「有的按鈕能用、有的死掉」。check_site.js 已加入一致性檢查。
- **不要把大量 base64 經過對話內容轉手**。圖片二進位在對話裡複製會出錯（實際發生過，
  PNG 解不開）。要嘛在瀏覽器端處理完直接 PUT 進 KV，要嘛用 file_upload 傳檔。
- 對話裡貼的圖片不是檔案（見 intake.md 檔案收取規則）。
- Workers 伺服器端 fetch 對外部第三方可能因共用 IP 被限流——需要打第三方時改由訪客瀏覽器直接打。
- Apps Script 回應接受跨域讀取的條件：POST body 用 `text/plain`（simple request 免 preflight）。
- 測試時瀏覽器會還原表單值與捲動位置，造成「條款已捲到底」假象——驗證要用全新網址參數。
- **宅配地址只設 required 不夠**。客人會只填「台北市」或漏掉郵遞區號、門牌號碼，
  這種地址寄不出去，而且通常發現時對方已經匯完款。送出前檢查四件事：
  開頭 3 或 5 碼郵遞區號、縣市、鄉鎮市區、`\d+號`。錯誤訊息要列出缺哪幾項並附正確範例。
- **超商取貨門市不能只給一個自由填寫欄位**。客人會直接打「711台北濟新」，
  工作人員看不出到底是 7-11 還是全家。要先讓客人選品牌（7-11／全家）再填店名。
  這個欄位可以是純 UI 選擇（`form=""` 讓它脫離表單自動送出），送出前把品牌字串併進
  既有的「取貨門市」欄位值就好，不必為此改 Google 試算表欄位或重新部署 Apps Script。
