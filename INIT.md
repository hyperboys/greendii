# GreenDii Init Status

อัปเดตล่าสุด: 2026-07-06

เอกสารนี้สรุปว่า "ตอนนี้ระบบทำอะไรได้แล้วบ้าง" จากโค้ดที่มีอยู่ในโปรเจกต์

## 1) ภาพรวมระบบ

- Backend: Node.js + Express + Prisma (PostgreSQL)
- Frontend: Next.js 14 + React + TypeScript
- โฟลว์หลัก: Quotation -> Work Order -> Hand Over -> Purchase Request
- เอกสาร API: Swagger UI ที่ `/docs`

## 2) ความสามารถที่มีแล้ว (Ready)

### Authentication & User
- Login / me / forgot-password
- เปลี่ยนรหัสผ่าน
- จัดการผู้ใช้ (Users)
- รองรับบทบาทผู้ใช้งานหลายระดับ (Approval roles)

### Master Data
- Customers
- Products
- Units
- PR Types
- Settings พื้นฐาน

### ธุรกรรมหลัก
- Quotations: สร้าง, แก้ไข, ส่งอนุมัติ, ติดตามสถานะ
- Work Orders: สร้าง, แก้ไข, อีเมลเอกสาร, พิมพ์
- Handovers: สร้าง, แก้ไข, พิมพ์
- PR (Purchase Request): สร้าง, แก้ไข, พิมพ์

### Approval Workflow
- รายการรออนุมัติ (Pending approvals)
- อนุมัติ/ปฏิเสธตามลำดับสิทธิ์
- จัดการกฎ approval flow และ role mapping

### Reports & Dashboard
- Dashboard ภาพรวม
- รายงาน Sales
- รายงาน Quotations
- รายงาน Workflow
- รายงาน Work Orders (รวมมุมมอง PO / No-PO)
- รายงาน PR

### Files / Print / Export
- อัปโหลดไฟล์แนบ
- แสดงไฟล์แนบจาก `/uploads`
- หน้า print สำหรับ Quotation / WorkOrder / Handover / PR / WorkOrder Email
- มี utility สำหรับ export report

### Notification / Audit / Activity
- Notifications
- Audit logs
- Activity logs
- Access log (morgan + rotating logs)
- Request correlation id (`X-Request-Id`)

### Security / Reliability
- Helmet + CORS whitelist
- Rate limit สำหรับ login และ forgot-password
- Health check: `/health`
- Graceful shutdown

### Integrations
- LINE webhook route
- Email (workorder-emails)
- S3/R2 client support ในโค้ดฝั่ง API

## 3) เส้นทาง API ที่เปิดใช้งานแล้ว (Route Modules)

- `/api/auth`
- `/api/users`
- `/api/customers`
- `/api/products`
- `/api/units`
- `/api/pr-types`
- `/api/quotations`
- `/api/workorders`
- `/api/workorder-emails`
- `/api/handovers`
- `/api/pr`
- `/api/approvals`
- `/api/reports`
- `/api/upload`
- `/api/settings`
- `/api/notifications`
- `/api/line`
- `/api/audit`
- `/api/activity-logs`

## 4) หน้าหลักฝั่ง UI ที่มีแล้ว

- Auth: login, forgot-password, change-password
- App: dashboard, profile
- Master: users, customers, products, units
- Transaction: quotations, workorders, handovers, pr
- Admin: roles, menu-access, pr-types, approval-flow, activity-log, audit-log, email-log
- Reports: sales, quotations, workflow, workorders, pr
- Print routes: quotation, workorder, handover, pr, workorder-email

## 5) วิธีรันระบบอย่างเร็ว

### API
1. `cd api`
2. `npm install`
3. ตั้งค่า `.env`
4. `npm run db:generate`
5. `npm run db:migrate`
6. `npm run db:seed`
7. `npm run dev`

### UI
1. `cd ui`
2. `npm install`
3. `npm run dev`
4. เปิด `http://localhost:3000`

## 6) เช็คลิสต์ก่อนเริ่มงานใหม่

- API up: `http://localhost:4000/health`
- Swagger up: `http://localhost:4000/docs`
- UI up: `http://localhost:3000`
- Login ได้ด้วยบัญชี seed
- สร้าง Quotation -> ส่งอนุมัติ -> อนุมัติ -> ออก Work Order ได้

## 7) หมายเหตุ

- เอกสารนี้เป็น snapshot ตามโครงสร้างและ route ที่มีอยู่ ณ วันที่อัปเดต
- หากมีการเพิ่ม route/page ใหม่ ให้ปรับเอกสารนี้ตามจริง
