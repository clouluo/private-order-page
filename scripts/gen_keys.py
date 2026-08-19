#!/usr/bin/env python3
# 產生動態密碼金鑰＋兩張 QR（驗證器掃描用／展場入口用）
# 用法：python3 gen_keys.py <品牌名> <網站網址> [輸出目錄] [QR顏色hex] [驗證器標籤]
#      驗證器標籤預設「貴賓動態碼」，會顯示在工作人員手機的 Authenticator 清單中
# 需要：pip install qrcode pillow --break-system-packages
import sys, secrets, base64, urllib.parse, os

brand = sys.argv[1] if len(sys.argv) > 1 else "BRAND"
site_url = sys.argv[2] if len(sys.argv) > 2 else ""
outdir = sys.argv[3] if len(sys.argv) > 3 else "."
color = "#" + (sys.argv[4].lstrip("#") if len(sys.argv) > 4 else "1a1a1a")
label_suffix = sys.argv[5] if len(sys.argv) > 5 else "貴賓動態碼"
os.makedirs(outdir, exist_ok=True)

import qrcode
from qrcode.constants import ERROR_CORRECT_H

# 1) TOTP 金鑰
b32 = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
open(os.path.join(outdir, "TOTP_SECRET.txt"), "w").write(b32)

# 2) 驗證器 QR（現場人員手機 Google Authenticator 掃描）
uri = f"otpauth://totp/{urllib.parse.quote(brand + ' ' + label_suffix)}?secret={b32}&issuer={urllib.parse.quote(brand)}&period=30&digits=6"
qrcode.make(uri).save(os.path.join(outdir, "authenticator-qr.png"))

# 3) 展場入口 QR（印刷用，高容錯、品牌色）
if site_url:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=40, border=4)
    qr.add_data(site_url)
    qr.make(fit=True)
    qr.make_image(fill_color=color, back_color="white").convert("RGB").save(
        os.path.join(outdir, "展場QR-印刷用.png"))

print("TOTP_SECRET:", b32)
print("已產生：TOTP_SECRET.txt / authenticator-qr.png" + (" / 展場QR-印刷用.png" if site_url else ""))
print("提醒：這兩個檔案等同鑰匙，只交給現場人員，勿印在對外物料上")
