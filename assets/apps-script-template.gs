// 展場快閃預購 — 訂單總表＋通知信（Google Apps Script 模板）
//
// 功能：doPost 收單 → 依 HEADERS 寫入試算表一列 → 寄出 HTML 排版的通知信（公司收件、填單人收副本）
//       formatSheet 設定試算表版面（欄寬、自動換行、狀態下拉選單、隔行底色），首次建表時自動執行
//
// 部署：獨立專案即可（用 SHEET_ID 指定試算表，不需綁定）
//       部署為網頁應用程式 → 執行身分「我」、存取權「所有人」
// 改 CONFIG 後：部署 → 管理部署作業 → 鉛筆 → 版本「建立新版本」→ 部署（網址不變）
//
// HEADERS 的付款欄位命名必須是「階段名＋百分比＋%」，與網頁 PAY_STAGES 對應，例如「預購訂金50%」
var CONFIG = {
  SHEET_ID: "{{訂單試算表ID}}",              // 網址 /spreadsheets/d/<這一段>/edit
  ORDER_TO: "{{訂單收件信箱}}",
  BRAND: "{{品牌名稱}}",
  SENDER_NAME: "{{寄件人顯示名稱}}",
  SHEET_NAME: "訂單",
  DEFAULT_STATUS: "{{新訂單預設狀態}}",
  HEADERS: ["時間", "訂單編號", "類別", "價格方案", "姓名", "公司", "職稱", "電話", "信箱",
            "寄送方式", "收件人", "收件人電話", "收件地址", "取貨門市", "門市店號", "訂購明細", "商品金額", "運費", "訂購總金額", "{{階段1名稱}}{{階段1百分比}}%", "{{階段2名稱}}{{階段2百分比}}%",
            "名片下載連結", "處理狀態"],
  PHONE_FIELDS: ["電話", "收件人電話"]
};

// Apps Script 送出 POST 後有時會轉址，瀏覽器會改用 GET 再請求一次同一個網址。
// 沒有 doGet 就會回傳錯誤頁，讓前端誤判成「送出失敗」（訂單其實已寫入）。
function doGet(e) {
  return ContentService.createTextOutput("ok");
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) {}

  // 同一時間只允許一個請求進來，避免前端重試與原請求並行造成競態重複寫入
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) {
    return ContentService.createTextOutput("ok-busy");   // 拿不到鎖代表另一個請求正在處理同一批資料
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(CONFIG.HEADERS);
      formatSheet();
    }

    // 重試安全：訂單編號在前端重試之間不會變，已經寫過就不再寫第二次。
    // 寄信慢會拖住回應，前端讀不到就會重試——若不擋，同一筆訂單會出現兩列。
    var orderNo = String(d["訂單編號"] || "").trim();
    if (orderNo && isDuplicateOrder_(sh, orderNo)) {
      return ContentService.createTextOutput("ok-dup");  // 前端只認開頭的 ok，會正常顯示成功頁
    }

    // 依 HEADERS 名稱對應寫入，一筆一列
    var row = CONFIG.HEADERS.map(function (h) {
      if (h === "時間") return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");  // 固定台北時間，不受專案時區設定影響
      if (h === "處理狀態") return CONFIG.DEFAULT_STATUS;
      var v = d[h] || "";
      if (CONFIG.PHONE_FIELDS.indexOf(h) >= 0) v = "'" + v;
      return v;
    });
    sh.appendRow(row);
    var r = sh.getLastRow();
    sh.getRange(r, 1, 1, CONFIG.HEADERS.length).setWrap(true).setVerticalAlignment("top");
    sh.autoResizeRows(r, 1);
    SpreadsheetApp.flush();   // 確保資料真的落地後才釋放鎖，重試才查得到

    // 通知信：公司收件、填單人收副本；寄信失敗不影響訂單寫入
    var note = "";
    try {
      sendOrderMail_(d);
    } catch (err) { note = "-mailfail"; }
    return ContentService.createTextOutput("ok" + note);

  } finally {
    lock.releaseLock();
  }
}

// 查訂單編號欄是否已有同一筆（只讀該欄，資料量大也不會慢）
function isDuplicateOrder_(sh, orderNo) {
  var col = CONFIG.HEADERS.indexOf("訂單編號") + 1;
  var last = sh.getLastRow();
  if (col <= 0 || last < 2) return false;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === orderNo) return true;
  }
  return false;
}



// ===== 訂單通知信（HTML 排版，分區塊呈現）=====
var MAIL_SECTIONS = [
  { title: "訂購人",   fields: ["姓名", "類別", "價格方案", "公司", "職稱", "電話", "信箱"] },
  { title: "寄送資訊", fields: ["寄送方式", "收件人", "收件人電話", "收件地址", "取貨門市", "門市店號"] },
  { title: "金額",     fields: ["商品金額", "運費", "訂購總金額"] }
];

function sendOrderMail_(d) {
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  // 電話欄位在試算表加了 ' 前綴，寄信時去掉
  var val = function (k) { return String(d[k] == null ? "" : d[k]).replace(/^'/, ""); };

  var rows = function (fields) {
    var out = "";
    fields.forEach(function (f) {
      if (!val(f)) return;
      out += '<tr>'
        + '<td style="padding:7px 16px 7px 0;color:#767676;white-space:nowrap;vertical-align:top;font-size:13px">' + esc(f) + '</td>'
        + '<td style="padding:7px 0;color:#111;vertical-align:top;font-size:14px">' + esc(val(f)) + '</td>'
        + '</tr>';
    });
    return out;
  };

  var sec = function (title, inner) {
    if (!inner) return "";
    return '<div style="margin-top:26px">'
      + '<div style="font-size:11px;letter-spacing:.18em;color:#767676;border-bottom:1px solid #e3e3e3;padding-bottom:7px;margin-bottom:6px">' + esc(title) + '</div>'
      + '<table style="border-collapse:collapse;width:100%">' + inner + '</table></div>';
  };

  var html = ''
    + '<div style="font-family:-apple-system,\'Noto Sans TC\',sans-serif;max-width:640px;margin:0 auto;padding:28px 24px;color:#111;line-height:1.7">'
    + '<div style="border-bottom:2px solid #111;padding-bottom:14px">'
    +   '<div style="font-size:11px;letter-spacing:.2em;color:#767676">NEW ORDER</div>'
    +   '<div style="font-size:19px;font-weight:700;margin-top:6px">' + esc(CONFIG.BRAND) + '　{{活動名稱}}</div>'
    + '</div>'
    + '<table style="border-collapse:collapse;width:100%;margin-top:18px">'
    +   '<tr><td style="padding:4px 16px 4px 0;color:#767676;font-size:13px;white-space:nowrap">訂單編號</td>'
    +   '<td style="padding:4px 0;font-size:16px;font-weight:700;letter-spacing:.04em">' + esc(val("訂單編號")) + '</td></tr>'
    +   '<tr><td style="padding:4px 16px 4px 0;color:#767676;font-size:13px;white-space:nowrap">送出時間</td>'
    +   '<td style="padding:4px 0;font-size:14px">' + esc(Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm")) + '</td></tr>'
    + '</table>';

  MAIL_SECTIONS.forEach(function (s) { html += sec(s.title, rows(s.fields)); });

  // 訂購明細：多行，用 pre-wrap 保留換行
  if (val("訂購明細")) {
    html += '<div style="margin-top:26px">'
      + '<div style="font-size:11px;letter-spacing:.18em;color:#767676;border-bottom:1px solid #e3e3e3;padding-bottom:7px;margin-bottom:10px">訂購明細</div>'
      + '<div style="white-space:pre-wrap;background:#f4f4f4;padding:14px 16px;font-size:14px;line-height:1.9">'
      + esc(val("訂購明細")) + '</div></div>';
  }

  // 付款階段：欄名以 % 結尾者
  var payRows = "";
  CONFIG.HEADERS.forEach(function (h) {
    if (!/%$/.test(h) || !val(h)) return;
    payRows += '<tr>'
      + '<td style="padding:7px 16px 7px 0;color:#767676;white-space:nowrap;vertical-align:top;font-size:13px">' + esc(h) + '</td>'
      + '<td style="padding:7px 0;color:#111;vertical-align:top;font-size:14px">' + esc(val(h)) + '</td></tr>';
  });
  html += sec("付款階段", payRows);

  if (val("匯款資訊")) {
    html += '<div style="margin-top:26px">'
      + '<div style="font-size:11px;letter-spacing:.18em;color:#767676;border-bottom:1px solid #e3e3e3;padding-bottom:7px;margin-bottom:10px">匯款資訊</div>'
      + '<div style="white-space:pre-wrap;background:#f4f4f4;padding:14px 16px;font-size:14px;line-height:1.9">'
      + esc(val("匯款資訊").replace(/｜/g, "\n")) + '</div></div>';
  }

  if (val("名片下載連結") && val("名片下載連結").indexOf("http") === 0) {
    html += '<div style="margin-top:26px">'
      + '<div style="font-size:11px;letter-spacing:.18em;color:#767676;border-bottom:1px solid #e3e3e3;padding-bottom:7px;margin-bottom:10px">名片</div>'
      + '<a href="' + esc(val("名片下載連結")) + '" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 22px;font-size:13px;letter-spacing:.1em">開啟名片檔案</a></div>';
  }

  html += '<div style="margin-top:34px;padding-top:16px;border-top:1px solid #e3e3e3;color:#767676;font-size:12px">'
    + '本信由 ' + esc(CONFIG.BRAND) + ' 預購系統自動寄出。</div></div>';

  // 純文字備援（不支援 HTML 的信箱）
  var plain = [CONFIG.BRAND + " {{活動名稱}} — 新訂單", "", "訂單編號：" + val("訂單編號"), ""];
  MAIL_SECTIONS.forEach(function (s) {
    plain.push("【" + s.title + "】");
    s.fields.forEach(function (f) { if (val(f)) plain.push("  " + f + "：" + val(f)); });
    plain.push("");
  });
  if (val("訂購明細")) plain.push("【訂購明細】", val("訂購明細"), "");
  CONFIG.HEADERS.forEach(function (h) { if (/%$/.test(h) && val(h)) plain.push("  " + h + "：" + val(h)); });
  if (val("匯款資訊")) plain.push("", "【匯款資訊】", val("匯款資訊"));
  if (val("名片下載連結")) plain.push("", "名片：" + val("名片下載連結"));

  var opt = { name: CONFIG.SENDER_NAME, htmlBody: html, body: plain.join("\n") };
  if (val("信箱")) { opt.cc = val("信箱"); opt.replyTo = val("信箱"); }
  MailApp.sendEmail(CONFIG.ORDER_TO,
    "【" + CONFIG.BRAND + "】新訂單 " + val("訂單編號") + "－" + val("姓名"),
    plain.join("\n"), opt);
}

// ===== 版面設定：欄寬、自動換行、狀態下拉選單（新增表頭時套用，也可手動執行）=====
var COL_WIDTH = {
  "時間":150, "訂單編號":135, "類別":90, "價格方案":140, "姓名":100, "公司":170, "職稱":100,
  "電話":115, "信箱":190, "寄送方式":100, "收件人":100, "收件人電話":115, "收件地址":260,
  "取貨門市":130, "門市店號":90, "訂購明細":340, "商品金額":105, "運費":85, "訂購總金額":115,
  "名片下載連結":210, "處理狀態":120
};
var STATUS_OPTIONS = ["{{新訂單預設狀態}}", "訂金已收", "製作中", "待結清尾款", "已出貨", "已完成", "已取消"];

function formatSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) return;
  var n = CONFIG.HEADERS.length;

  // 表頭
  sh.getRange(1, 1, 1, n)
    .setFontWeight("bold").setBackground("#111111").setFontColor("#ffffff")
    .setVerticalAlignment("middle").setWrap(false);
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);                       // 時間＋訂單編號固定，橫向捲動時仍看得到

  // 欄寬：付款階段欄名含百分比，用開頭比對
  CONFIG.HEADERS.forEach(function (h, i) {
    var w = COL_WIDTH[h];
    if (w == null) w = /%$/.test(h) ? 130 : 120;
    sh.setColumnWidth(i + 1, w);
  });

  // 內容：自動換行、靠上對齊，長明細才不會被切掉
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 1, rows, n)
    .setWrap(true).setVerticalAlignment("top").setFontSize(10);

  // 處理狀態改成下拉選單，方便更新進度
  var si = CONFIG.HEADERS.indexOf("處理狀態");
  if (si >= 0) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build();
    sh.getRange(2, si + 1, rows, 1).setDataValidation(rule);
  }

  // 隔行淡底，一列一筆看得清楚
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(1, 1, sh.getMaxRows(), n)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
}

// 首次部署後在編輯器執行一次，觸發寄信權限授權
function authTest() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "寄信授權測試", "收到代表寄信功能已啟用。");
}
