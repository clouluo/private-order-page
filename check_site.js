#!/usr/bin/env node
// 客製後的自動驗收：node check_site.js <site.html>
// 檢查語法、品牌殘留、角色/階段/商品設定、金額一致性、關鍵機制是否完好
// 需要 jsdom：npm install jsdom（沒有也能跑，會略過 DOM 檢查）
const fs = require("fs");
const file = process.argv[2] || "site.html";
const html = fs.readFileSync(file, "utf8");
const ok = [], bad = [], warn = [];
const t = (c, m) => (c ? ok : bad).push(m);

// 1) JS 語法
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
try { new (require("vm").Script)(js); ok.push("JS 語法正確"); }
catch (e) { bad.push("JS 語法錯誤：" + e.message); }

// 2) 不該有的殘留（含常見禁用轉信服務、模板佔位符未清空）
["formsubmit"].forEach(k => {
  t(!new RegExp(k, "i").test(html), `無殘留：${k}`);
});
t(!/\{\{[^}]+\}\}/.test(html), "模板佔位符 {{…}} 皆已清空");
t(html.includes("__SHEET_HOOK__"), "SHEET_HOOK 佔位符保留（由 Worker 注入）");

// 3) 設定解析
const grab = (name) => {
  const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!m) return null;
  // 設定裡可能呼叫頁面自訂函式（如自動排場次的 makeSessions），先給無害的替身
  try { return eval("(function(){ const makeSessions = () => []; return (" + m[1] + "); })()"); }
  catch (e) { return null; }
};
const roles = grab("ROLES"), stages = grab("PAY_STAGES"), products = grab("PRODUCTS");
t(roles && roles.length > 0, `角色設定：${roles ? roles.map(r => r.name + (r.pro ? "(專業)" : "")).join("／") : "解析失敗"}`);
t(roles && roles.some(r => r.pro === false), "至少一個一般角色（免公司/名片）");
t(products && products.length > 0, `商品數：${products ? products.length : 0}`);
if (products) products.forEach(p => {
  t(p.id && p.name && p.cat && p.list > 0 && p.sale > 0, `商品 ${p.id} 欄位完整`);
  t(p.sale <= p.list, `商品 ${p.id} 活動價未高於牌價`);
});

// 4) 付款階段
if (stages) {
  const sum = stages.reduce((a, s) => a + s.pct, 0);
  t(sum === 100, `付款階段百分比總和 = ${sum}`);
  t(stages.filter(s => s.remainder).length === 1, "恰有一個 remainder 階段（吃尾差）");
  t(stages.some(s => s.highlight), "有 highlight 階段（成功頁強調）");
  // 金額一致性抽驗
  [1, 7, 999, 12345, 88888].forEach(total => {
    const amts = stages.map(s => s.remainder ? 0 : Math.round(total * s.pct / 100));
    const ri = stages.findIndex(s => s.remainder);
    amts[ri] = total - amts.reduce((a, b) => a + b, 0);
    t(amts.reduce((a, b) => a + b, 0) === total && amts.every(a => a >= 0), `金額加總一致（總額 ${total}）`);
  });
} else bad.push("PAY_STAGES 解析失敗");

// 5) 關鍵機制
t(html.includes("unlockAgree") && html.includes("onTermsScroll"), "強制捲動條款機制存在");
t(/agreeChk\.disabled/.test(html) && /agreeChk\.checked/.test(html), "送出前二次驗證條款勾選");
t(/card-upload/.test(html), "名片上傳走 /card-upload");
t(/txt\.indexOf\("ok"\)\s*(!==|===)\s*0/.test(html), "確認回應 ok 才顯示成功頁");
t(/for \(let attempt = 0; attempt < 2; attempt\+\+\)/.test(html), "送單失敗會自動重試一次");
t(/maybeSent/.test(html), "連線不確定時不叫客人重送（避免重複訂單）");
t(html.includes("colorQty"), "分色數量機制存在");

// 5.5) 外部連結一致性：同一個 LINE／金流連結常出現在成功頁、匯款資訊、頁尾多處，
//      漏改其中一處就會有「有的按鈕能用、有的死掉」。這裡檢查是否有多組不同的連結。
const linkGroups = [
  // 終止字元含全形括號與引號，否則會把後面的中文一起吃進來
  { name: "LINE", re: /https?:\/\/(?:line\.me|lin\.ee)\/[^\s"'<>)）」｜、，。]+/g },
  { name: "金流／刷卡", re: /https?:\/\/(?:p\.ecpay\.com\.tw|www\.newebpay\.com)\/[^\s"'<>)）」｜、，。]+/g },
];
linkGroups.forEach(g => {
  const found = [...new Set(html.match(g.re) || [])];
  if (found.length > 1) bad.push(`${g.name} 連結有 ${found.length} 組不一致：${found.join(" / ")}——應該全站同一個`);
  else if (found.length === 1) ok.push(`${g.name} 連結全站一致`);
});

// 5.6) media query 順序：同樣特異性下後面的規則會覆蓋前面的，
//      手機版區塊若寫在基本樣式之前等於完全失效（實際踩過，手機底部條子變超高）
const iBase = html.indexOf(".totalbar .in{max-width");
const iMob  = html.search(/@media\(max-width:600px\)\{[^}]*\.totalbar \.in\{/);
if (iBase >= 0 && iMob >= 0) {
  t(iMob > iBase, "手機版總計列樣式排在基本樣式之後（順序錯會被覆蓋）");
}
t(/env\(safe-area-inset-bottom/.test(html), "置底列有處理手機安全區");

// 5.7) 超商取貨要先選品牌（7-11／全家）再填店名，不能只給一個自由填寫的門市欄位
//      實際發生過：客人直接打「711台北濟新」，工作人員看不出到底是哪一家超商
if (/cvsStore/.test(html)) {
  t(/cvsBrandChoice/.test(html), "超商取貨有「7-11／全家」品牌選擇（不是只有自由填寫的門市欄位）");
  t(/brandEl\.value \+ " " \+ storeEl\.value/.test(html),
    "品牌選擇有併入取貨門市欄位一起送出（送出前組字串，後端試算表欄位不必變動）");
}

// 5.8) 宅配地址防呆：只靠 required 擋不住「台北市」這種寄不出去的地址
if (/shipAddr/.test(html)) {
  t(/\^\\d\{3\}\(\\d\{2\}\)\?/.test(html), "宅配地址有檢查郵遞區號（開頭 3 或 5 碼）");
  t(/\\d\+\\s\*號/.test(html), "宅配地址有檢查門牌號碼");
  t(/\[縣市\]/.test(html) && /\[鄉鎮市區\]/.test(html), "宅配地址有檢查縣市與鄉鎮市區");
}

// 5.9) 送出失敗要一次列出所有問題，而不是靠原生泡泡一次擋一個
//      客人最常見的抱怨是「按了沒反應，不知道哪裡沒填」
if (/errSum/.test(html)) {
  t(/novalidate/.test(html), "表單設 novalidate（改由自訂驗證統一回報，不跳原生泡泡）");
  t(/function validateOrder/.test(html), "有集中收集所有問題的 validateOrder()");
  t(/id="errSum"[^>]*display:none|errSum[\s\S]{0,200}display:\s*none/.test(html),
    "錯誤總覽預設隱藏（沒按送出前保持版面乾淨）");
} else {
  warn.push("沒有錯誤總覽區塊：送出失敗時客人可能看不出是哪個欄位沒填");
}

// 6) 待補提醒
// 佔位標記用 {{…}}（中文法律條文常用【】，故不以【】判定）
const ph = html.match(/\{\{[^}]{1,16}\}\}/g) || [];
if (ph.length) bad.push(`尚有 ${ph.length} 處未替換的佔位標記：${[...new Set(ph)].slice(0, 8).join("、")}`);
if (/待補|TODO/.test(html)) warn.push("頁面含「待補／TODO」字樣——上線前確認是否已補齊（法律條款等）");
if (/images\//.test(html) && !/drive\.google\.com\/thumbnail/.test(html)) warn.push("商品圖仍指向本機 images/ 路徑，尚未接上圖床連結");

console.log(ok.map(m => "  ✅ " + m).join("\n"));
if (warn.length) console.log("\n" + warn.map(m => "  ⚠️  " + m).join("\n"));
if (bad.length) { console.log("\n" + bad.map(m => "  ❌ " + m).join("\n")); console.log(`\n${bad.length} 項未通過`); process.exit(1); }
console.log(`\n全部 ${ok.length} 項通過`);
