# 展場快閃預購網站 — Worker 建置腳本（通用版）
# 用法：把 CONFIG 改成品牌設定後執行 `python3 build_worker.py`
# 讀取 SITE_HTML_PATH，產出可部署到 Cloudflare Workers 的 OUTPUT_PATH
import json, base64, os

CONFIG = {
    "SITE_HTML_PATH": "site.html",
    "OUTPUT_PATH": "worker.js",
    "GATE_ENABLED": True,
    "BRAND": "品牌名稱",
    "TAGLINE": "頁首英文標語",
    "GATE_TITLE": "活動名稱",
    "GATE_DESC": "本頁面僅限受邀貴賓瀏覽<br>請輸入工作人員提供的 6 位數動態密碼",
    "LOGO_PATH": "",
    "LOGO_URL": "",   # 品牌 LOGO 圖片網址；留空則改用 BRAND 文字,
    "GATE_BG": "#e9e9e9", "GATE_INK": "#111111", "GATE_BTN": "#111111",
    "GATE_BTN_HOVER": "#3a3a3a", "GATE_LINE": "#d6d6d6", "GATE_ERR": "#111111",
}

site_html = open(CONFIG["SITE_HTML_PATH"], encoding="utf8").read()

logo_tag = f'<img class="logo" src="{CONFIG["LOGO_URL"]}" alt="{CONFIG["BRAND"]}" referrerpolicy="no-referrer">' if CONFIG.get("LOGO_URL") else f'<div style="font-size:1.4rem;font-weight:700;letter-spacing:.4em;text-indent:.4em;color:{CONFIG["GATE_INK"]}">{CONFIG["BRAND"]}</div>'
if CONFIG["LOGO_PATH"] and os.path.exists(CONFIG["LOGO_PATH"]):
    b64 = base64.b64encode(open(CONFIG["LOGO_PATH"], "rb").read()).decode()
    logo_tag = f'<img class="logo" src="data:image/png;base64,{b64}" alt="{CONFIG["BRAND"]}">'

gate_html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/png;base64,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" media="(prefers-color-scheme: light)">
<link rel="icon" href="data:image/png;base64,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" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="data:image/png;base64,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">
<title>{CONFIG["BRAND"]} {CONFIG["GATE_TITLE"]}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"Noto Sans TC",-apple-system,sans-serif;background:{CONFIG["GATE_BG"]};color:{CONFIG["GATE_INK"]};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}}
.box{{background:#fff;border:1px solid {CONFIG["GATE_LINE"]};padding:56px 40px;max-width:420px;width:100%;text-align:center}}
.logo{{height:56px;width:auto;margin:0 auto;object-fit:contain}}
.tagline{{font-size:.6rem;letter-spacing:.4em;text-indent:.4em;color:#8b8b8b;margin:16px 0 34px}}
h1{{font-size:1.15rem;letter-spacing:.16em;margin-bottom:10px;font-weight:700}}
.desc{{font-size:.85rem;color:#767676;margin-bottom:30px;line-height:1.9}}

/* 六格輸入：實際 input 透明覆蓋，視覺以格子呈現 */
.codewrap{{position:relative;width:100%;max-width:300px;margin:0 auto}}
.cells{{display:flex;gap:8px;justify-content:center}}
.cell{{flex:1;aspect-ratio:3/4;max-width:44px;border:1px solid {CONFIG["GATE_LINE"]};display:flex;align-items:center;justify-content:center;background:#fff;transition:border-color .18s,background .18s}}
.cell .pip{{width:7px;height:7px;background:{CONFIG["GATE_INK"]};opacity:0;transform:scale(.4);transition:opacity .18s,transform .18s}}
.cell.filled{{border-color:{CONFIG["GATE_INK"]}}}
.cell.filled .pip{{opacity:1;transform:scale(1)}}
.cell.active{{border-color:{CONFIG["GATE_INK"]};box-shadow:inset 0 0 0 1px {CONFIG["GATE_INK"]}}}
.codewrap.err .cell{{border-color:{CONFIG["GATE_ERR"]}}}
.codewrap.err .cell .pip{{background:{CONFIG["GATE_ERR"]}}}
.codewrap.ok .cell{{border-color:{CONFIG["GATE_INK"]};background:{CONFIG["GATE_INK"]}}}
.codewrap.ok .cell .pip{{background:#fff}}
.codewrap.shake{{animation:shake .45s}}
@keyframes shake{{0%,100%{{transform:translateX(0)}}20%{{transform:translateX(-8px)}}40%{{transform:translateX(8px)}}60%{{transform:translateX(-6px)}}80%{{transform:translateX(6px)}}}}
#code{{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;background:none;font-size:16px;letter-spacing:2em;text-align:center;cursor:pointer;-webkit-text-security:disc}}
#code:focus{{outline:none}}

button{{width:auto;min-width:180px;margin:26px auto 0;display:block;padding:0 44px;height:50px;border:1px solid {CONFIG["GATE_INK"]};background:{CONFIG["GATE_INK"]};color:#fff;font-size:.92rem;letter-spacing:.24em;font-family:inherit;cursor:pointer;transition:.18s}}
button:hover:not(:disabled){{background:#fff;color:{CONFIG["GATE_INK"]}}}
button:disabled{{opacity:.4;cursor:not-allowed}}
.err{{color:{CONFIG["GATE_ERR"]};font-size:.82rem;margin-top:14px;min-height:1.3em;line-height:1.6}}
</style>
</head>
<body>
<div class="box">
  {logo_tag}
  <div class="tagline">{CONFIG["TAGLINE"]}</div>
  <h1>{CONFIG["GATE_TITLE"]}</h1>
  <p class="desc">{CONFIG["GATE_DESC"]}</p>
  <div class="codewrap" id="wrap">
    <div class="cells" id="cells">
      <div class="cell"><span class="pip"></span></div><div class="cell"><span class="pip"></span></div>
      <div class="cell"><span class="pip"></span></div><div class="cell"><span class="pip"></span></div>
      <div class="cell"><span class="pip"></span></div><div class="cell"><span class="pip"></span></div>
    </div>
    <input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" autofocus>
  </div>
  <button id="go">進　入</button>
  <div class="err" id="err"></div>
</div>
<script>
const input=document.getElementById('code'), btn=document.getElementById('go'),
      err=document.getElementById('err'), wrap=document.getElementById('wrap'),
      cells=[...document.querySelectorAll('.cell')];

function paint(){{
  const v=input.value;
  cells.forEach((c,i)=>{{
    c.classList.toggle('filled', i < v.length);
    c.classList.toggle('active', i === v.length && document.activeElement === input);
  }});
}}
function shake(){{
  wrap.classList.add('shake','err');
  setTimeout(()=>wrap.classList.remove('shake'), 460);
}}
input.addEventListener('input', e => {{
  const before = input.value;
  input.value = input.value.replace(/\D/g,'').slice(0,6);
  if (before.length > 6) shake();
  else wrap.classList.remove('err');
  err.textContent = '';
  paint();
  if (input.value.length === 6) auth();
}});
input.addEventListener('keydown', e => {{
  if (e.key === 'Enter') auth();
  if (/^[0-9]$/.test(e.key) && input.value.length >= 6) {{ e.preventDefault(); shake(); }}
}});
input.addEventListener('focus', paint);
input.addEventListener('blur', paint);
document.querySelector('.cells').addEventListener('click', ()=>input.focus());

async function auth(){{
  const code=input.value.trim();
  if(!/^\d{{6}}$/.test(code)){{ err.textContent='請輸入 6 位數字'; shake(); return; }}
  btn.disabled=true; err.textContent='';
  try{{
    const r=await fetch('/auth',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{code}})}});
    if(r.ok){{ wrap.classList.remove('err'); wrap.classList.add('ok'); setTimeout(()=>location.reload(), 420); }}
    else{{
      err.textContent='密碼錯誤或已過期，請確認工作人員手機上的最新號碼';
      shake(); btn.disabled=false; input.value=''; paint(); input.focus();
    }}
  }}catch(e){{ err.textContent='連線失敗，請再試一次'; btn.disabled=false; }}
}}
btn.addEventListener('click',auth);
paint(); input.focus();
</script>
</body>
</html>"""

serve = 'SITE_HTML.replaceAll("__ORDER_EMAIL__", RECIPIENT).replaceAll("__SHEET_HOOK__", env.SHEET_HOOK || "")'

if CONFIG["GATE_ENABLED"]:
    routing = f"""    if (url.pathname === "/auth" && request.method === "POST") {{
      let code = "";
      try {{ code = String((await request.json()).code || ""); }} catch (e) {{}}
      if (/^\\d{{6}}$/.test(code) && await verifyTOTP(SECRET, code)) {{
        const hours = Number(env.SESSION_HOURS || 2);
        const exp = Date.now() + hours * 3600 * 1000;
        const sig = await hmacHex(SECRET, String(exp));
        return new Response("ok", {{
          headers: {{ "Set-Cookie": `fz=${{exp}}.${{sig}}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${{Math.round(hours * 3600)}}` }}
        }});
      }}
      return new Response("invalid", {{ status: 401 }});
    }}

    const m = (request.headers.get("Cookie") || "").match(/fz=(\\d+)\\.([a-f0-9]{{64}})/);
    if (m && Number(m[1]) > Date.now() && await hmacHex(SECRET, m[1]) === m[2]) {{
      return new Response({serve}, {{ headers: HTML_HEADERS }});
    }}
    return new Response(GATE_HTML, {{ status: 401, headers: HTML_HEADERS }});"""
else:
    routing = f"""    return new Response({serve}, {{ headers: HTML_HEADERS }});"""

worker = f"""// 展場快閃預購 — Cloudflare Worker（由 build_worker.py 產生）
// 環境變數：TOTP_SECRET（閘門啟用時必填）、SESSION_HOURS、ORDER_EMAIL、SHEET_HOOK
// 綁定：CARDS（KV namespace，存名片）
const SITE_HTML = {json.dumps(site_html, ensure_ascii=False)};
const GATE_HTML = {json.dumps(gate_html if CONFIG["GATE_ENABLED"] else "", ensure_ascii=False)};
const GATE_ENABLED = {"true" if CONFIG["GATE_ENABLED"] else "false"};
const HTML_HEADERS = {{ "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" }};

function b32decode(s) {{
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {{
    const i = A.indexOf(c); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) {{ out.push((val >>> (bits - 8)) & 255); bits -= 8; }}
  }}
  return new Uint8Array(out);
}}
async function hotp(keyBytes, counter) {{
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter);
  const key = await crypto.subtle.importKey("raw", keyBytes, {{ name: "HMAC", hash: "SHA-1" }}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const off = sig[19] & 0xf;
  return String(((sig[off] & 0x7f) << 24 | sig[off+1] << 16 | sig[off+2] << 8 | sig[off+3]) % 1e6).padStart(6, "0");
}}
async function verifyTOTP(secret, code) {{
  const key = b32decode(secret);
  const t = Math.floor(Date.now() / 1000 / 30);
  for (let i = -2; i <= 2; i++) if (await hotp(key, t + i) === code) return true;
  return false;
}}
async function hmacHex(secret, msg) {{
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {{ name: "HMAC", hash: "SHA-256" }}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}}

export default {{
  async fetch(request, env) {{
    const url = new URL(request.url);
    const SECRET = env.TOTP_SECRET || "";
    if (GATE_ENABLED && !SECRET) return new Response("TOTP_SECRET not configured", {{ status: 500 }});
    const RECIPIENT = env.ORDER_EMAIL || "";

    const validSession = async () => {{
      if (!GATE_ENABLED) return true;
      const m = (request.headers.get("Cookie") || "").match(/fz=(\\d+)\\.([a-f0-9]{{64}})/);
      return m && Number(m[1]) > Date.now() && await hmacHex(SECRET, m[1]) === m[2];
    }};

    // 名片上傳：存 KV、回傳下載連結
    if (url.pathname === "/card-upload" && request.method === "POST") {{
      const J = (obj, status) => new Response(JSON.stringify(obj), {{status, headers:{{"content-type":"application/json"}}}});
      if (!(await validSession())) return J({{ok:false, error:"驗證已過期，請重新整理頁面後再送出"}}, 401);
      let fd;
      try {{ fd = await request.formData(); }} catch (e) {{ return J({{ok:false, error:"資料無法解析"}}, 400); }}
      const v = fd.get("名片附件");
      if (!v || typeof v === "string" || v.size === 0) return J({{ok:false, error:"未收到檔案"}}, 400);
      if (v.size > 10 * 1024 * 1024) return J({{ok:false, error:"名片檔案超過 10MB"}}, 400);
      const id = crypto.randomUUID().replace(/-/g, "") + Math.floor(Math.random()*1e8).toString(16);
      await env.CARDS.put("card:" + id, await v.arrayBuffer(), {{
        expirationTtl: 60 * 86400,
        metadata: {{ ct: v.type || "application/octet-stream", name: v.name || "card" }}
      }});
      return J({{ok:true, link: url.origin + "/card/" + id}}, 200);
    }}

    // 網站圖示（存在 KV，不佔 Worker 體積；閘門前也能取用）
    if (url.pathname.startsWith("/fav/") && request.method === "GET") {{
      const k = url.pathname.slice(5).replace(/[^a-z0-9-]/g, "");
      const v = await env.CARDS.get("fav:" + k, {{type:"arrayBuffer"}});
      if (!v) return new Response("Not found", {{status:404}});
      return new Response(v, {{ headers: {{
        "content-type": "image/png",
        "cache-control": "public, max-age=604800"
      }} }});
    }}

    // 名片下載
    if (url.pathname.startsWith("/card/") && request.method === "GET") {{
      const id = url.pathname.slice(6);
      if (!/^[a-f0-9]{{30,}}$/.test(id)) return new Response("Not found", {{status:404}});
      const got = await env.CARDS.getWithMetadata("card:" + id, {{type:"arrayBuffer"}});
      if (!got || !got.value) return new Response("Not found or expired", {{status:404}});
      const md = got.metadata || {{}};
      return new Response(got.value, {{ headers: {{
        "content-type": md.ct || "application/octet-stream",
        "content-disposition": `inline; filename="${{encodeURIComponent(md.name || "card")}}"`,
        "cache-control": "private, max-age=0"
      }} }});
    }}

{routing}
  }}
}};
"""
open(CONFIG["OUTPUT_PATH"], "w", encoding="utf8").write(worker)
print("written:", CONFIG["OUTPUT_PATH"], len(worker.encode("utf8")), "bytes, gate =", CONFIG["GATE_ENABLED"])
