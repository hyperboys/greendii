# Server-side PDF — ติดตั้ง & ใช้งาน

แก้ปัญหา "PDF ของเครื่อง Mac กับ Windows แสดงผลไม่เหมือนกัน" โดยให้ **server เป็นผู้ render PDF** (Puppeteer + headless Chromium) → ทุกเครื่องดาวน์โหลด PDF ที่เหมือนกัน 100%.

## สถาปัตยกรรม

```
User Browser ──(1)── GET /api/quotations/:id/pdf  ──> API (Express)
                                                    │
                                  (2) launch Puppeteer headless
                                                    │
                                  (3) goto UI_URL/print/quotation/:id?token=JWT
                                                    │
                          UI (Next.js) ─── render <QuotationPrint />
                          (โหลด Google Fonts: Sarabun / Inter / Bebas Neue / Dancing Script)
                                                    │
                                  (4) wait window.__printReady = true
                                  (5) page.pdf({ format: 'A4', margin: 10mm })
                                                    │
            ◄──(6)── PDF Buffer ──── streamed back as application/pdf
```

## ติดตั้ง

### 1. API – ติดตั้ง puppeteer

```powershell
cd api
npm install
```

> หมายเหตุ: Puppeteer จะดาวน์โหลด Chromium อัตโนมัติ (~170MB) ตอน `npm install` ครั้งแรก ใช้เวลาสักครู่.

### 2. ENV (`api/.env`)

เพิ่มตัวแปร:

```env
# URL ของ UI ที่ Puppeteer จะเข้าไปดึงหน้า print (ต้อง access ได้จาก server)
UI_URL=http://localhost:3000
```

ตอน production (Coolify):

```env
UI_URL=https://app.greendii.com   # หรือ URL ภายในของ container UI
```

### 3. รัน

```powershell
# Terminal 1
cd api ; npm run dev

# Terminal 2
cd ui ; npm run dev
```

ทดสอบ: เปิดใบเสนอราคาใดๆ → คลิกปุ่ม **"PDF"** ข้างปุ่มพิมพ์ → ดาวน์โหลด `QUO2025-XXXX.pdf`.

## Deploy บน Coolify / Docker

Puppeteer ต้องการ system libraries ของ Chromium. ใน Dockerfile ของ API ให้ใช้ base image ที่มี chromium dependencies:

```dockerfile
FROM node:20-bookworm-slim

# Chromium runtime deps
RUN apt-get update && apt-get install -y \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
```

**ENV ใน Coolify:**
- `UI_URL` = URL ของ UI service ที่ container API เรียกถึงได้  
  - ใน Docker network เดียวกัน: เช่น `http://ui:3000`  
  - หรือใช้ public URL: `https://app.greendii.com`

## วิธีทำงาน (สรุปย่อ)

| ขั้นตอน | รายละเอียด |
|---|---|
| 1 | คลิกปุ่ม **PDF** → UI เรียก `GET /api/{type}/:id/pdf` พร้อม JWT |
| 2 | API ส่งต่อ JWT ผ่าน query param ให้ Puppeteer |
| 3 | Puppeteer เปิดหน้า `/print/{type}/:id?token=…` ใน UI |
| 4 | หน้า print โหลด Google Fonts + ดึงข้อมูล → set `window.__printReady = true` |
| 5 | Puppeteer call `page.pdf()` ด้วย A4 + margin 10mm → ได้ PDF buffer |
| 6 | API ส่ง PDF กลับ → browser ดาวน์โหลด |

## ทำไม PDF จะเหมือนกันแล้ว

1. **Chromium เดียวกัน**: render บน server ครั้งเดียว ไม่ขึ้นกับ browser ของผู้ใช้
2. **Google Fonts**: `Sarabun` (ไทย), `Inter` (EN), `Bebas Neue` (display), `Dancing Script` (signature) — load จาก CDN เหมือนกันทุก request
3. **ฟอนต์ระบบที่หายไป (Cordia New / Century Gothic / Broadway / Brush Script MT) ถูก override** ผ่าน CSS ใน `print/layout.tsx`
4. **`preferCSSPageSize: true`**: ใช้ `@page size: A4` จาก CSS, ไม่ขึ้นกับ print dialog ของผู้ใช้

## ปุ่ม "พิมพ์" เดิม

ยังเก็บไว้เป็น fallback (กรณีเครื่อง user offline จาก API หรือต้องการพิมพ์ผ่าน browser โดยตรง). หน้า detail page เปลี่ยนแสดงทั้ง 2 ปุ่ม:

- **พิมพ์** = `window.print()` (เดิม – อาจต่างกันต่อ OS)
- **PDF** = server-side (เหมือนกันทุก OS) ← **แนะนำ**
