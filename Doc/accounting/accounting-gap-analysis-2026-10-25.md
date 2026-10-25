# Accounting: งานที่ยังขาดและข้อมูลที่ต้องยืนยัน

วันที่ตรวจ: 25/10/2026  
สถานะ: รายงานจากการอ่าน source code และข้อกำหนดปัจจุบัน ไม่ใช่ผลรับรองการใช้งานจริง  
ขอบเขต: เมนู Accounting ทั้งหมด โดยเน้นเมนูอื่นนอกเหนือจาก PO และความเชื่อมโยงกับ PO

## 1. สรุปสำหรับเจ้าของงาน

**Accounting ยังไม่ครบตาม spec และยังไม่ควรถือว่าทุกเมนูพร้อมทำธุรกรรมเงินจริง/Stock จริง**

- Customer, Sale บัญชี และ Supplier มีหน้าจัดการที่เป็นรูปเป็นร่างกว่าส่วนอื่น แต่ Supplier ยังไม่รองรับหลายสาขาและหลายบัญชีธนาคารแบบเป็นรายการ
- Invoice / ใบส่งของชั่วคราวยังเป็นฟอร์มย่อรายการเดียว ไม่ใช่ฟอร์มเอกสารเต็มแบบ PO
- ใบวางบิลมีหน้ารายการและปุ่มสร้าง แต่การ submit ใน UI ยังไม่เรียก API สร้างใบวางบิล
- ใบลดหนี้ (CN), ใบเบิกจ่ายผู้รับเหมา (PS) และใบคืนสินค้ายังไม่มีเมนูจัดการเฉพาะ แม้มี API สร้างบางส่วน
- GR, PV และเช็คจ่ายมีชื่อเมนู แต่หน้า Accounting ปัจจุบันแสดงข้อความว่ายังไม่อยู่ในขอบเขตที่ทำ
- หน้ารับชำระเงินแสดง Invoice ค้างรับ ไม่ใช่ทะเบียนใบรับชำระที่บันทึกไปแล้ว
- การเบิก/คืนสินค้าและ GR ใน API มีการบันทึกเป็น approved และกระทบ Stock ทันที ยังไม่ใช่ workflow อนุมัติตาม spec
- รายงานมีเพียง 4 หน้าหลัก และบางสูตรยังไม่ใช่ยอดทางบัญชีที่ยืนยันแล้ว โดยเฉพาะ AP Aging
- Approval, การยกเลิกและกลับยอด, ประวัติ, การพิมพ์/Export และ Notification ยังไม่ได้เชื่อมครบสำหรับเอกสาร Accounting
- ผล test/build ที่ผ่านก่อนหน้านี้ไม่ได้พิสูจน์ว่า workflow ธุรกิจครบ หรือฐานข้อมูลที่เปิดใช้อยู่มี schema ตรงกับโค้ด

**รอบนี้จัดทำเอกสารเท่านั้น ไม่เพิ่ม/แก้ business rule ไม่ปรับฐานข้อมูล และไม่ดำเนินการจ่ายเงินหรือ Stock**

## 2. Scope Baseline และวิธีตรวจ

### 2.1 แหล่งข้อกำหนด

1. [Overview.txt](Overview.txt): ข้อกำหนดขยาย โดยเฉพาะหัวข้อ 3–12 และ 14–18
2. [Req Acc.txt](Req%20Acc.txt): ข้อกำหนดต้นฉบับฉบับย่อ
3. [Customer Requirements ฉบับขยาย](สรุป_Customer_Requirements_ระบบบัญชีและคลังสินค้า_ฉบับขยายรายละเอียด.docx): ข้อมูลและ business rule ของเอกสาร
4. ข้อสรุปจากผู้ใช้ในการสนทนาก่อนหน้า: ใช้ปรับ baseline ของ PO และรูปแบบวันที่

ตรวจเมนูจาก [accounting-navigation.ts](../../accounting-ui/src/lib/accounting-navigation.ts) และ [app-shell.tsx](../../accounting-ui/src/components/app-shell.tsx), อ่านหน้าจอ/แบบฟอร์ม, API client, route handlers, schema, permission และ tests ที่เกี่ยวข้อง

ครอบคลุมหน้าหลัก/เมนูย่อย 23 จุด: Dashboard 1, AR 4, AP 4, Inventory 2, Master 6, Reports 4, บทบาทและสิทธิ์ 1, Profile 1 รวมทั้งงานตาม spec ที่ไม่มีเมนู เช่น CN, PS, คืนสินค้า, Approval และ Audit

หน้า login, ลืมรหัสผ่านและเปลี่ยนรหัสผ่านเป็นส่วนสนับสนุนที่มีอยู่ ไม่ได้ทดสอบการส่งอีเมลหรือ identity workflow ใหม่ในรายงานนี้

### 2.2 ขอบเขตความเชื่อมั่น

- “มี API” หมายถึงพบ handler ไม่ได้หมายถึงผ่าน integration/concurrency test หรือพร้อมใช้งาน
- “ยังไม่พบ” หมายถึงยังไม่พบใน Accounting UI และ routes/services ที่ตรวจ ไม่ได้หมายถึงระบบ Sales ไม่มีความสามารถนั้น
- ไม่ได้ตรวจข้อมูลจริง, schema ของฐานข้อมูลที่ใช้งาน, migration history หรือไฟล์เอกสารจริงทุกแบบ
- ไม่ได้รันธุรกรรม end-to-end ใหม่ในรอบวิเคราะห์นี้ และไม่ใช่ security penetration review
- ไม่ให้เปอร์เซ็นต์ความครบ เพราะ spec แต่ละหัวข้อมีน้ำหนักต่างกันและหลายข้อยังรอข้อมูลธุรกิจ

### 2.3 ข้อสรุปที่ยืนยันแล้ว ไม่ต้องถามซ้ำ

- PO อ้างอิง PR ได้หลายใบหรือไม่อ้างอิงก็ได้; PR ใช้เป็นเลขอ้างอิง ไม่คัดลอกรายการ และไม่ผูกจำนวนคงเหลือ PR ในระยะนี้
- รายการ PO กรอกเอง ราคา ภาษี และส่วนลดแก้ได้ใน Draft
- PO ระยะแรกเป็น Draft-only พิมพ์/บันทึก PDF ไม่ส่งอีเมล และยังไม่ทำ Approval เต็ม
- ใช้ภาพ PO เป็นแนวทางเอกสาร ข้อมูลบริษัทจาก Settings และข้อมูลผู้จัดทำจาก User; เงื่อนไขท้ายเอกสารที่ยังไม่ยืนยันไม่ใส่เอง
- PO รองรับไฟล์แนบจาก PR ที่อ้างอิงและไฟล์แนบ PO เพิ่มเติม
- PO สร้าง/แก้/ดูเป็นหน้าแยก ไม่ใช่ Popup; ช่องจำนวนเพิ่มทีละ 1 และรับจำนวนเต็มตามการแก้ล่าสุด
- วันที่ที่แสดงและกรอกใน Accounting ใช้ dd/mm/yyyy ปี ค.ศ.; API ยังใช้รูปแบบ ISO

**ข้อกำหนด PO เก่าในไฟล์ที่บังคับ PR/ห้ามสั่งเกิน PR ไม่ถือเป็น defect ของระยะ Draft ที่ผู้ใช้ปรับข้อกำหนดแล้ว** ส่วน workflow เต็มในอนาคตต้องกำหนด scope แยก ไม่ทำกลับไปตาม spec เก่าโดยอัตโนมัติ

## 3. ตารางสถานะทุกเมนู

| เมนู / งาน | สิ่งที่มีแล้ว | ยังขาด / ผลต่อผู้ใช้ | สถานะ |
|---|---|---|---|
| Dashboard | การ์ดและกราฟ UI, ลิงก์ตามสิทธิ์ | ยอด 0, กราฟและจำนวนงานเป็นข้อมูลกำหนดไว้ ไม่ได้คำนวณจากเอกสาร; รอบบัญชีใน header ยังเป็นข้อความคงที่ | ตัวอย่างหน้าจอ |
| ลูกค้า | แยกจาก Sales, ค้นหา, สร้าง/ดู/แก้หน้าแยก, หลายสาขา/ที่อยู่, Sale, VAT, credit term, active, เตือน Tax ID ซ้ำ | ทะเบียนรายงาน/Export/ประวัติยังไม่มีใน UI; ต้องยืนยันนโยบายข้อมูลซ้ำและ field บังคับ | ทำแล้วส่วนหลัก แต่ยังไม่ครบทุกมิติ |
| Sale บัญชี | ทะเบียนอิสระ, เพิ่ม/แก้/active, ผูกลูกค้า | ยังไม่มีรายงาน/ประวัติเฉพาะ; ต้องยืนยันสิทธิ์การมอบหมายลูกค้า | ทำบางส่วน |
| Supplier / ผู้รับเหมา | ค้นหา, หน้าเพิ่ม/ดู/แก้, active, VAT, term, ข้อมูลติดต่อและธนาคาร | สาขาเดียวใน record, ที่อยู่ทั่วไป/วางบิลเป็นข้อความ, บัญชีธนาคารหนึ่งชุด; ไม่ใช่หลายสาขา/หลายบัญชีตาม spec | ทำบางส่วน |
| สินค้าและบริการ | รายการและเพิ่มรหัส/ชื่อ/ประเภท/ราคา; API มีข้อมูลเพิ่มเติม | UI ขาดหน่วย, category, VAT, cost, description, edit/detail/active และการค้นหา/filter ที่ครบ | ฟอร์มย่อ |
| คลังสินค้า | รายการและเพิ่ม code/name; API มี location และ CRUD | UI ไม่ให้จัดการ location/edit/active; ยังไม่มีตำแหน่งย่อยหรือการตั้งค่าสต็อกต่ำ | ฟอร์มย่อ |
| ผังบัญชี | รายการ, เพิ่ม code/name/category; API มี accountType/accountMapping | UI ยังไม่จัดการชนิด header/detail, mapping, edit/active; ไม่พบ GL posting จากธุรกรรม Accounting ที่ตรวจ | ทำบางส่วน |
| ใบส่งของชั่วคราว SO | รายการและสร้าง Draft, API เก็บหลาย lines/WO/receiver/unit | UI ใช้ฟอร์มร่วมกับ Invoice, กรอกได้รายการเดียว ไม่มีเลือกสินค้า/WO/ผู้รับ/หน่วย/วันที่ SO เฉพาะ; ไม่มีดู/แก้/ยืนยัน/ยกเลิก/พิมพ์ | ยังไม่ครบเอกสาร |
| Invoice IV | รายการ, สร้าง Draft, ลูกค้า/สาขา/ที่อยู่/Sale/VAT/เครดิต/วันครบกำหนด | รายการเดียว ไม่มีเลือกรายการ SO หรือ WO, เลข PO ลูกค้า, ส่วนลด, เอกสารแนบ, ดู/แก้/ยกเลิก/พิมพ์/history; API ยังไม่ได้คำนวณทั้งหมดใหม่จาก lines | ยังไม่ครบเอกสาร |
| ใบวางบิล BI | API list/create และตารางรายการ | UI ไม่มีเลือกหลาย Invoice และไม่มีการเรียก createBillingNote ตอน submit; ขาดดู/แก้/ยกเลิก/พิมพ์ | ปุ่มสร้างยังไม่ทำงานจริง |
| ใบลดหนี้ CN | API สร้างและลดยอด Invoice | ไม่มีเมนู/ฟอร์ม/list/detail/edit/print/cancel; ยังต้องตรวจยอดสะสมและ concurrency | API บางส่วน ไม่มี UI |
| รับชำระ / RV | เลือก Invoice หนึ่งใบ, ยอดรับ/วิธีรับ/ธนาคาร/WHT บางส่วน; API allocations หลายใบ | ไม่มีทะเบียน RV, เลือก BI, หลาย Invoice ใน UI, รายละเอียดเช็ค/วันรับ/เลขอ้างอิง/ค่าธรรมเนียมที่ครบ, พิมพ์/ยกเลิก/กลับยอด | ทำบางส่วน |
| PO | หน้า list/new/edit/view/print, ค้นหาผู้ขาย, หลาย lines/PR, แนบไฟล์ | ยังเป็น Draft-only ตาม scope; รายการกรอกเองยังไม่เชื่อม Product master เพื่อ GR; ต้องตรวจ schema/client และทดสอบกับฐานข้อมูลจริง | ทำตามระยะ Draft ไม่ใช่ AP เต็ม |
| เบิกจ่ายผู้รับเหมา PS | API create, คำนวณยอดที่เคยขอและคงเหลือ PO | ไม่มีเมนู/ทะเบียน/ฟอร์ม/ดู/แก้/อนุมัติ/พิมพ์; ไม่มีเส้นทาง PS approved → PV ที่ครบ | API บางส่วน ไม่มี UI |
| รับสินค้า GR | API create และ posting Stock/Movement สำหรับสินค้าที่ไม่ใช่ Service | เมนู placeholder, ไม่พบการบังคับยอดรับคงเหลือจาก PO lines ที่คำนวณเอง; ไม่มี cancel/reversal | ยังไม่พร้อมใช้งานเต็ม |
| ใบสำคัญจ่าย PV | API create Draft พร้อมยอดภาษี/หักต่าง ๆ | เมนู placeholder, ไม่มีเลือกต้นทางที่อนุมัติ/ยอดคงเหลือ, approval, ป้องกันจ่ายซ้ำ, print/cancel | ยังไม่พร้อมใช้งานเต็ม |
| เช็คจ่าย CQ | API create/status, unique เลขเช็คต่อบัญชี | เมนู placeholder, ไม่มีทะเบียน/พิมพ์/ประวัติใน UI; API ยังไม่ได้บังคับ PV approved และ transition ตามลำดับครบ | ยังไม่พร้อมใช้งานเต็ม |
| ยอดคงเหลือคลัง | ตาราง onHand/reserved/available | ไม่มีตัวกรองคลัง/สินค้าและสต็อกต่ำที่ครบ, pagination UI, initial balance/adjustment flow | ดูข้อมูลได้บางส่วน |
| Stock Movement / Stock Card | ตาราง movement และ source document number | ยังไม่ใช่ Stock Card แบบยอดยกมา/เข้า/ออก/คงเหลือ ณ วัน, ไม่เชื่อมเปิดต้นทาง/กลับรายการครบ | ทำบางส่วน |
| เบิกสินค้า | Popup เลือกสินค้า/คลัง/จำนวนหนึ่งรายการ; API เก็บ requested/issued/cancelled | UI ส่ง requested=issued จึงยังทำขอ 10 เบิก 5 ยกเลิก 5 ไม่ได้; ไม่มี approval/ทะเบียน/print/cancel | ทำบางส่วนและต่างจาก spec |
| คืนสินค้า | API create เพิ่ม Stock และ movement | ไม่มีเมนู/ฟอร์ม/ทะเบียน; ตรวจคืนเทียบยอดเบิกต่อครั้ง ไม่ใช่หักยอดคืนสะสมทั้งหมด | API บางส่วน ไม่มี UI |
| AR Aging | ตารางและ API bucket 0/1–30/31–60/61–90/>90 | ไม่มีเลือก as-of/filter/export/pagination UI; ใช้ยอดคงค้างปัจจุบัน ไม่ได้สร้างยอดย้อนหลัง ณ as-of | รายงานเบื้องต้น |
| AP Aging | ตารางและ API bucket | ใช้ยอด PO ทั้งใบและอายุจากวันที่ PO ไม่หักชำระ/ไม่ใช้กำหนดชำระตามเจ้าหนี้; ไม่ควรตีความเป็นหนี้ค้างจ่ายจริง | สูตรยังไม่ยืนยัน |
| กระทบยอด SO → IV | แสดงเลข Invoice ที่เชื่อมและมี/ไม่มีการออก Invoice | ไม่เทียบจำนวน/ยอดระดับรายการ ไม่แยกออกบางส่วน/ส่วนที่เหลือครบ | ตรวจความสัมพันธ์เบื้องต้น |
| กระทบยอด PO → GR | แสดงเลข GR ที่เชื่อมและมี/ไม่มีรับ | ไม่เทียบรับแล้ว/เหลือ/รับเกินระดับรายการและสถานะ cancellation | ตรวจความสัมพันธ์เบื้องต้น |
| บทบาท/สิทธิ์ | แยก AccountingRole/assignment จาก role ระบบเดิม, module CRUD ตามที่ API รองรับ | ยังไม่มีสิทธิ์ submit/approve/return/cancel/print/export/VAT/ประวัติเฉพาะ และ config สายอนุมัติ Accounting | พื้นฐานมีแล้ว |
| Profile / Auth สนับสนุน | มีหน้า profile/login/password ใช้บัญชีระบบเดิม | ไม่ใช่งานบัญชีที่ต้องสร้างใหม่; ยังไม่รับรองการส่งอีเมล/ทุก auth flow ในรอบนี้ | มีอยู่ ต้องทดสอบตอน UAT |

## 4. Findings สำคัญและผลกระทบ

### 4.1 รายการที่ควรแก้ก่อนนำไปใช้งานธุรกรรมจริง

| Finding | หลักฐานปัจจุบัน | ผลกระทบ / สิ่งที่ต้องทำ |
|---|---|---|
| F-01 BI กดบันทึกแต่ไม่สร้าง | [Invoices UI](../../accounting-ui/src/app/ar/invoices/page.tsx): handleCreateInvoice มี branch เฉพาะ invoices/so แต่ปิด form ต่อแม้เป็น billingNotes | ผู้ใช้อาจเข้าใจว่าสร้างแล้ว; ต้องทำฟอร์ม BI และเรียก API พร้อมตรวจผลจริง |
| F-02 วันที่ SO ไม่ส่ง field ที่ handler ใช้ | UI ใช้ ivDate ใน form; [AR API](../../api/src/routes/ar.js) SO อ่าน docDate และ UI ไม่แสดงวันที่เฉพาะ SO | วันที่ SO จะใช้ค่าเริ่มต้น ณ ตอนบันทึก แทนวันที่ที่ผู้ใช้อาจคาดว่าจะเลือกได้ |
| F-03 Invoice ยอดรวมยังไม่ authoritative จาก lines | AR API รับ subTotal/discount/vat/netAmount และ amount ของ lines จาก request; ยังตรวจไม่ครบเทียบการคำนวณใหม่ | ยอดหัว/รายการอาจไม่ตรง; ต้องตัดสินสูตรส่วนลดและปัดเศษ แล้วบังคับ API |
| F-04 Draft Invoice สร้าง outstanding ทันที | AR API create ตั้ง status=draft พร้อม outstandingAmount; unpaidOnly ใช้ outstanding; Aging เลือก approved/pending | รายการรับชำระกับ Aging อาจไม่ตรงกัน; ต้องกำหนด effective state และตัดยอดในจุดเดียวกัน |
| F-05 Billing Note ยังตรวจเอกสารต้นทางไม่ครบ | API ตรวจ customer ที่อ่านได้ แต่ไม่บังคับครบทุก invoiceId, outstanding > 0 และไม่ตรวจอยู่ใน BI active ซ้ำ | ต้องกันใบผิดสถานะ/ไม่พบ/ซ้ำ รวมถึง concurrent billing |
| F-06 RV/WHT และยอดจัดสรรยังไม่ครบ | RV API ตัด Invoice ด้วย receivedAmount เท่านั้น; UI ส่ง whtAmount ต่อ allocation แต่ยอด WHT ระดับหัวไม่ได้ส่งให้สอดคล้อง | ต้องยืนยันว่า WHT/fee ลดหนี้อย่างไร ตรวจผลรวม header/allocations และ customer/status ทุกใบ |
| F-07 GR รับยอดคงเหลือจาก request | [AP API](../../api/src/routes/ap.js) เก็บ ordered/previouslyReceived/remaining/current จาก request; [GR line schema](../../api/prisma/schema.prisma) ไม่มี FK ไป PO line | ไม่พิสูจน์ว่ารับไม่เกินจริง; ต้องอ้าง PO line และรวมการรับเดิมที่มีผลก่อน posting |
| F-08 PO ปัจจุบันยังไม่ส่ง productId จาก UI | [PO form](../../accounting-ui/src/components/purchase-orders.tsx) ใช้ partNo/desc/unit อิสระ; [PO draft type](../../accounting-ui/src/lib/purchase-order.ts) ไม่มี productId | ต่อ GR อัตโนมัติยังไม่ได้ ต้อง map Product/Service อย่างชัดเจน ไม่ถือ partNo ว่าเป็น FK |
| F-09 Stock เบิก/คืนยังไม่ผ่าน approval | [Inventory API](../../api/src/routes/inventory.js) create ตั้ง approved และสร้าง movement ทันที; GR ก็มีลักษณะ immediate posting | ขัด flow approval ที่ระบุ; ต้องแยกบันทึกร่าง/อนุมัติ/posting และทำ reversal |
| F-10 คืนสินค้ายังไม่ตรวจยอดสะสมครบ | API เทียบ returnedQty กับ issuedQty ของ issue line ที่หาเจอ แต่ไม่รวมยอดคืนก่อนหน้า; สินค้าที่ไม่พบใน issue ยังไม่ถูกปฏิเสธในส่วนนี้ | คืนหลายครั้งอาจเกินที่เคยเบิก; ต้อง validate ทุก line และ cumulative remaining |
| F-11 เช็คมีเพียง allowed status ไม่ใช่ transition matrix | AP API status ตรวจชื่อใน list และห้ามเปลี่ยนจาก Cancelled แต่ไม่ได้ใช้ transition matrix จริง | ต้องกันข้าม Prepared → Cleared และบังคับเหตุผลยกเลิก; test ตัวอย่างไม่ใช่ handler นี้ |
| F-12 AP Aging ยังไม่ใช่ยอดเจ้าหนี้สุทธิ | [Report API](../../api/src/routes/accounting-reports.js) ใช้ netAmount ของ PO และ poDate โดยไม่หักจ่าย | ห้ามใช้รายงานนี้สรุปยอดค้างจ่ายจริงก่อนยืนยันฐานหนี้และสูตร |
| F-13 transaction ไม่ได้แปลว่าปลอด concurrent update | CN/RV/PS/GR/Issue/Return อ่านยอดแล้วคำนวณก่อน update; ไม่พบ lock/conditional update/retry สำหรับยอดร่วมครบ | ต้องทดสอบพร้อมกันบนเอกสาร/Stock เดียวกันและป้องกันซ้ำใน production path |
| F-14 Running Stock Issue/Return ใช้ count+1 | Inventory API สร้าง IS-/SR- จากจำนวน record; GR/PV/CQ มี pattern hardcoded ใน [runningNumber.js](../../api/src/lib/runningNumber.js) ทั้งที่ spec ระบุยังไม่กำหนด | ต้องยืนยันรูปแบบก่อนและใช้ sequence atomic; อย่าสร้างเลขจริงต่อจาก pattern ที่ยังไม่รับรอง |

นอกจากนี้ Stock Return loop ปัจจุบันไม่ได้แยกการเพิ่ม Stock ตาม condition แม้ comment ระบุ good condition และไม่เห็น guard Service แบบเดียวกับ Issue; ต้องยืนยันวิธีจัดการของเสีย/คืนบริการก่อนเปิดใช้ (Q-13)

### 4.2 ความสามารถกลางที่ยังไม่เชื่อมครบ

- **Approval:** [approvalEngine.js](../../api/src/lib/approvalEngine.js) และ [pending approvals](../../api/src/routes/approvals.js) รองรับเอกสาร Sales เป็นหลัก (quotation/workOrder/handover/pr); ไม่ใช่สายอนุมัติ PS/PV/Stock ที่พร้อมใช้กับ Accounting แล้ว
- **สิทธิ์:** [accountingAccess.js](../../api/src/lib/accountingAccess.js) เปิด ar=view/create, ap=view/create/update, inventory=view/create, master=CRUD, reports=view; ยังไม่พอสำหรับสิทธิ์ตาม action ใน spec
- **สิทธิ์รายงาน:** Aging เรียก assertActionAuthorized(..., export) ของ [legacy policy](../../api/src/lib/authorizationPolicy.js) เพิ่มด้วย ผู้มี reports.view ใน Accounting อย่างเดียวจึงอาจยังถูกปฏิเสธ ต้องทำ policy ให้สอดคล้องกันโดยไม่ไปเปลี่ยน role ระบบ Sales
- **Audit:** หลาย create เขียน recordAuditLog แล้ว และมี [domain logs API](../../api/src/routes/audit.js) แต่ Accounting ไม่มีหน้า timeline/history และยังไม่มีทุก action ตาม spec; Product/Warehouse/COA routes ที่ตรวจยังไม่ได้เรียก audit helper ใน write handlers
- **Notification:** มี [API เดิม](../../api/src/routes/notifications.js) แต่ไม่พบ Accounting UI inbox และการสร้าง event ใกล้ครบกำหนด/Stock ต่ำ/PS/PV รออนุมัติใน flow ที่ตรวจ
- **Cancel/Reversal:** AR/AP/Inventory routes ที่ตรวจยังไม่มี cancellation ที่คืน outstanding/Stock/payment allocation ครบ ไม่ใช่แค่เพิ่มปุ่มเปลี่ยน status
- **Print/Export:** ตอนนี้พบแบบพิมพ์ PO ใน Accounting; ยังไม่พบแบบพิมพ์ IV/SO/BI/CN/RV/PS/GR/PV/เช็ค/เบิก/คืน และ export รายงานใน UI
- **ข้อมูลหลัก/เอกสารย้อนหลัง:** PO อ่านชื่อ/Tax ID/โทรศัพท์จาก Supplier relation ปัจจุบัน ไม่ใช่ snapshot ทั้งหมด ต้องตกลงว่าการแก้ master ภายหลังควรเปลี่ยนเอกสารเก่าหรือไม่
- **Schema rollout:** เคยพบ Attachment.purchaseOrderId ไม่ตรง SQL purchase_order_id และแก้ mapping ใน schema แล้ว แต่ยังต้อง verify generate/restart/DB เป้าหมาย ไม่ถือว่ารัน script แล้วทุก environment ตรงกัน
- **ข้อความ error:** ภาพ error ล่าสุดแสดง Prisma invocation และ path ของ server ให้ผู้ใช้เห็น; ต้องจัด user-facing error และเก็บรายละเอียดสำหรับผู้ดูแลอย่างเหมาะสม

## 5. รายงานตาม spec ที่ยังไม่ครอบคลุม

| กลุ่ม | สิ่งที่มี | งานค้าง |
|---|---|---|
| Master | หน้ารายการ CRUD บางส่วน | รายงานข้อมูลซ้ำ/ไม่ครบ, mapping, export ทะเบียน |
| AR | AR Aging เบื้องต้น | Invoice/Billing/CN/RV registers, outstanding/overdue ที่ตรง effective state, Customer Statement |
| AP | AP Aging เบื้องต้น | PO register, PR-PO reference/outstanding ตาม scope ใหม่, GR status, PV report, ภาษี, cheque register |
| Inventory | Balance/Movement tables | Stock Card แบบยอดต่อเนื่อง, Low/Out of Stock, Issue/Return, Stock by WO, Valuation |
| Approval/Audit | Backend เดิมบางส่วน | Pending/History/Rejected/Returned/Changes after approval สำหรับ Accounting พร้อมสิทธิ์ |
| Reconciliation | SO-IV / PO-GR แบบเชื่อมเอกสาร | Invoice-RV, PS/PV-Cheque, Document-Stock Movement; quantity/amount discrepancy ของรายงานเดิม; PR-PO ต้องไม่เดา remaining จาก reference-only |
| ความสามารถรายงานกลาง | Refresh, API asOfDate บางรายงาน | ตัวกรองจริง, as-of historical balance, sorting, pagination, export และ total ที่ reconcile ได้ |

## 6. Requirement Traceability / งานที่ต้องทำ

REQ ด้านล่างเป็นรหัสติดตามงานของรายงานนี้ ไม่ใช่การยืนยัน business rule ที่ยังไม่ได้ตอบ  
สถานะ Planned = ข้อเสนอ backlog ยังไม่ได้สั่งเริ่ม; In Progress = มีบางส่วน; Blocked = ต้องยืนยันข้อมูลก่อนสรุปแบบ; Implemented หมายถึงเฉพาะขอบเขตที่บอก ไม่ใช่ sign-off ทั้งระบบ

| ID | ข้อกำหนด/ผลลัพธ์ที่ต้องได้ | มีแล้ว → ช่องว่าง | ตำแหน่งที่เกี่ยวข้อง | Test / เกณฑ์พิสูจน์ | สถานะ |
|---|---|---|---|---|---|
| REQ-001 | Dashboard ใช้ยอดจริงตามสิทธิ์ | UI ตัวอย่าง → query และนิยามยอด | dashboard/page.tsx; reports API | ยอดตรงชุดเอกสารตัวอย่างและสถานะ | Blocked Q-18 |
| REQ-002 | Customer/Sale ครบข้อมูลที่ยืนยัน | CRUD/หลายสาขามี → reports/history/policy duplicate | customer-master.tsx; account-customers/account-sales API | บันทึก-เปิดใหม่คงทุกสาขา/ที่อยู่, active และ duplicate | In Progress |
| REQ-003 | Supplier หลายสาขา/ที่อยู่/ธนาคาร | scalar ชุดเดียว → entities/form/snapshot | supplier-master.tsx; suppliers.js; schema | ผู้ขาย 2 สาขา 2 บัญชีเลือกบนเอกสารได้ | Blocked Q-02 |
| REQ-004 | Product จัดการ field และสถานะครบ | API CRUD → UI เต็มและ validation | master/page.tsx; account-products.js | บันทึก unit/category/VAT/type แล้วเปิดแก้ไม่หาย | In Progress |
| REQ-005 | Warehouse จัดการ location/active | API CRUD → UI เต็ม | master/page.tsx; warehouses.js | ปิดคลังแล้วไม่เลือกสร้างใหม่; ประวัติยังอ่านได้ | In Progress |
| REQ-006 | COA จัดการ accountType/mapping | API field → UI/validation/กติกา mapping | master/page.tsx; chart-of-accounts.js | mapping ที่ยืนยันบันทึกและอ่านกลับได้ | Blocked Q-19 |
| REQ-007 | SO หลายรายการและต้นทางที่เลือกได้ | create/list → form/docDate/detail/edit/print/confirm/cancel | invoices/page.tsx; ar.js | SO 2 lines/มีหรือไม่มี WO และ Invoice ดึงรายการ | In Progress |
| REQ-008 | IV ครบ header/lines/references | customer defaults → หลาย lines, SO/WO/PO ลูกค้า/discount | invoices/page.tsx; ar.js; schema | ดึง SO, คำนวณใหม่, ป้องกันออกซ้ำ, พิมพ์ตรงข้อมูล | In Progress |
| REQ-009 | ยอด Invoice คำนวณจากข้อมูลที่ตรวจแล้ว | รับยอด request → สูตร authoritative และ effective state | ar.js; account-customers.ts | request ยอดไม่ตรง lines ถูกปฏิเสธหรือคำนวณใหม่ตาม contract | Blocked Q-04/Q-05 |
| REQ-010 | BI เลือกหลาย IV ลูกค้าเดียวกัน | API create → UI ทำงานจริงและกัน active ซ้ำ | invoices/page.tsx; ar.js; BillingNoteInvoice | บันทึกแล้วมี BI จริง, ข้ามลูกค้า/ยอดศูนย์/ซ้ำต้องไม่ผ่าน | In Progress |
| REQ-011 | CN มีวงจรเอกสารและคืนยอดได้ | API create → UI/read/update/cancel/print/limit | ar.js; CreditNote | 2 CN พร้อมกันไม่เกินยอด; cancel คืนยอดถูก | Blocked Q-07 |
| REQ-012 | RV หลาย IV/BI, ภาษีและจัดสรรครบ | 1 IV ใน UI → form/registry/detail/print/reversal | receipts/page.tsx; ar.js; ReceiptAllocation | partial/full/WHT/fee ยอดตรงและไม่รับซ้ำ | Blocked Q-08 |
| REQ-013 | PS หลายรอบและวงเงินคงเหลือ | API Draft → menu/list/detail/edit/approve/print/duplicate round | ap.js; ContractorPaymentRequest | เบิกสะสมไม่เกิน PO รวม concurrent round | Blocked Q-10 |
| REQ-014 | GR รับตาม PO line คงเหลือจริง | API posting → UI/line linkage/validation/reversal | ap.js; GoodsReceiptLine; StockBalance | PO 10 รับ 6+4 ได้ รับเพิ่มไม่ได้; Service ไม่เพิ่ม Stock | Blocked Q-11 |
| REQ-015 | PV เลือกยอดอนุมัติที่ยังไม่จ่าย | API Draft → approved-source selector/allocation/approval/print | ap.js; PaymentVoucher | source ที่ไม่ approved/จ่ายซ้ำ/เกินยอดถูกปฏิเสธ | Blocked Q-12 |
| REQ-016 | เช็คจาก PV approved พร้อม state/history | unique/status API → UI/transition/reason/amount validation | ap.js; ChequePayment | Prepared ข้าม Cleared ไม่ได้; cancelled เลขไม่ reuse | Blocked Q-12/Q-15 |
| REQ-017 | เบิกบางส่วนและอนุมัติก่อนตัด Stock | UI 1 line immediate → multi-line/requested-issued-cancelled | inventory/page.tsx; inventory.js | ขอ 10 เบิก 5 ยกเลิก 5; ก่อนอนุมัติ Stock ไม่เปลี่ยน | Blocked Q-13 |
| REQ-018 | คืนสะสมไม่เกินเบิกและไม่เพิ่ม Stock ผิดประเภท | API per-request → UI/cumulative/service/condition/reversal | inventory.js; StockReturn | เบิก 5 คืน 3+2 ได้ แต่คืนอีกไม่ได้; ทดสอบพร้อมกัน | Blocked Q-13 |
| REQ-019 | Balance/Movement ตรวจย้อนกลับได้ | ตาราง → filter/card/reversal/initial balance | inventory/page.tsx; inventory.js; StockMovement | ยกมา+เข้า-ออก=คงเหลือ และเปิด source ได้ | Blocked Q-14 |
| REQ-020 | Approval Accounting แยกสายตามเงื่อนไข | engine Sales → Accounting config/actions/history | approvalEngine.js; approvals.js; access | ลำดับอนุมัติ/return/reject/ซ้ำ/คนไม่มีสิทธิ์ | Blocked Q-01 |
| REQ-021 | สิทธิ์ตรง action และไม่ขึ้นกับ legacy role โดยไม่ตั้งใจ | module CRUD → approve/cancel/print/export/VAT/audit | accountingAccess.js; accountingAccess middleware; UI access | UI/API direct request ใช้ permission เดียวกัน | Blocked Q-01/Q-17 |
| REQ-022 | Cancel คืนเงิน/Stock/สัมพันธ์ครบ | ยังไม่มีครบ → reversal/idempotency/เหตุผล | ar.js; ap.js; inventory.js; audit | cancel 1 ครั้งคืนยอดครั้งเดียว; cancel ซ้ำไม่ลงซ้ำ | Planned |
| REQ-023 | Audit/Notification ใช้งานผ่าน Accounting ได้ | helpers/API เดิม → events/inbox/history/retry | audit.js; notifications.js; Accounting UI | สร้าง/อนุมัติ/ยกเลิก trace ผู้ทำ เวลา เหตุผล; ไม่ส่งซ้ำ | Blocked Q-17 |
| REQ-024 | Aging ใช้ฐานหนี้และ as-of ที่ยืนยัน | report 4 endpoints → สูตร/history/filter | accounting-reports.js; reports/page.tsx | รับ/จ่ายหลัง as-of ไม่เปลี่ยนยอดก่อน as-of | Blocked Q-16 |
| REQ-025 | Reports/Reconciliation/Export ครบตามลำดับที่ตกลง | 4 หน้าเบื้องต้น → registers/variance/export | accounting-reports.js; reports/page.tsx | total/export ตรงหน้าจอและ source; discrepancy ระบุได้ | Blocked Q-16 |
| REQ-026 | เลขเอกสารเป็นรูปแบบที่รับรองและไม่ชน | atomic sequence บางชนิด → IS/SR และ pattern pending | runningNumber.js; inventory.js; DocumentSequence | สร้างพร้อมกัน/เปลี่ยนเดือน/rollback/ยกเลิกไม่ชน | Blocked Q-15 |
| REQ-027 | เอกสารพิมพ์ข้อมูลคงที่ตามกติกา | PO มี template → เอกสารอื่น/snapshot/page overflow | purchase-order-document.tsx; UI/doc models | master เปลี่ยนไม่แก้เอกสารเก่าตาม policy; หลายหน้าไม่ตกบรรทัด | Blocked Q-09 |
| REQ-028 | PO ตาม scope ล่าสุดและวันที่กลาง | หน้าแยก/Draft/วันที่มีแล้ว → DB smoke และต่อ Product-GR | purchase-orders.tsx; accounting-date.ts; schema/SQL | save/detail/edit/print กับ DB เป้าหมาย; dd/mm/yyyy ทุกหน้า | In Progress |

ตำแหน่งในตารางย่อชื่อไฟล์เพื่ออ่านง่าย: UI ใต้ [accounting-ui/src](../../accounting-ui/src), API ใต้ [api/src](../../api/src), models ใต้ [schema.prisma](../../api/prisma/schema.prisma)

## 7. Open Questions / ข้อมูลที่ควรเตรียม

**บันทึกไว้ก่อนตามคำขอ ไม่ต้องตอบทั้งหมดทันที** คำถามเหล่านี้ไม่ได้ยกเลิกข้อสรุป PO ระยะ Draft ที่ยืนยันแล้ว

| Q | เรื่อง | ข้อมูล/คำตอบที่ต้องการ | ใช้กับงาน |
|---|---|---|---|
| Q-01 | สายอนุมัติและสิทธิ์ | PS/PV/เบิก/คืนใช้กี่ขั้น, ใคร, วงเงิน/แผนก/ประเภท, แทนกันได้ไหม, สิทธิ์ submit/reject/return/cancel และคนเดียวสร้าง-อนุมัติได้หรือไม่ | REQ-020/021 และเอกสารที่มี approval |
| Q-02 | Supplier หลายสาขา | code ต่อบริษัทหรือสาขา, สาขา default, ที่อยู่แต่ละประเภท, บัญชีธนาคารหลายบัญชีและบัญชี default; ธุรกรรมเก่าต้องคง snapshot ใด | REQ-003 |
| Q-03 | Master quality | Tax ID ซ้ำเตือนหรือห้ามตามประเภท/สาขา; field บังคับ, หน่วย/หมวดหมู่สินค้า, ต้องเก็บจำนวนทศนิยมในเอกสารอื่นหรือไม่ (PO ยืนยันจำนวนเต็มแล้ว) | REQ-002/004/005 |
| Q-04 | สูตร Invoice | ส่วนลดต่อรายการเป็นบาทหรือ %, ลำดับหักส่วนลดพิเศษ, VAT รวม/แยก, ปัดเศษบรรทัดหรือหัวเอกสาร และใครเปลี่ยน VAT ได้ | REQ-008/009 |
| Q-05 | สถานะที่ตั้งหนี้ | IV/SO มีผลเมื่อ Save, Confirm หรือ Approved; รับเงินจาก Draft ได้หรือไม่, หลังมี RV/CN แล้วยกเลิก IV อย่างไร | REQ-007/009/022/024 |
| Q-06 | SO → IV / BI | SO แยกออก IV หลายครั้งหรือรวม SO ได้ไหม, ผูกระดับรายการอย่างไร; BI วางบิลบางส่วนได้หรือเต็มยอด, วิธีแก้/ออกใหม่หลังยกเลิก | REQ-007/008/010 |
| Q-07 | ลดหนี้ CN | ลดเป็นยอดหรือหลายรายการ, คืนสินค้าหรือไม่, VAT ลดอย่างไร, ต้องอนุมัติไหม, ลดหลังรับเงินเต็มแล้วได้ไหม/คืนเงินอย่างไร | REQ-011 |
| Q-08 | รับเงิน RV | WHT/ค่าธรรมเนียมนับเป็นยอดปิดหนี้อย่างไร, หลาย IV ผ่าน BI, จัดสรรเกิน/เงินล่วงหน้า, เช็ครับผ่านบัญชีเมื่อใด, หลักฐานแนบและเลขอ้างอิงใดบังคับ | REQ-012 |
| Q-09 | แม่แบบและ snapshot | ตัวอย่าง SO/IV/BI/CN/RV/PS/GR/PV/เช็ค/เบิก/คืน, สำเนา/ลายเซ็น/จำนวนเงินตัวอักษร, เงื่อนไขและข้อความภาษี, บริษัท/สาขาและข้อมูลที่ต้องคงย้อนหลัง | REQ-027 |
| Q-10 | เบิกจ่ายผู้รับเหมา | ฐานวงเงินใช้ก่อนหรือรวม VAT, รอบซ้ำ/revision, % retention/WHT, เงื่อนไขคืน retention และผู้มีสิทธิ์สร้าง PS | REQ-013 |
| Q-11 | รับสินค้า GR | map PO manual lines เข้าสินค้า/บริการอย่างไร, รับตาม line/คลังหลายแห่ง, ตรวจรับบริการแบบจำนวนหรือผลงาน, ของเสีย/คืนผู้ขาย/PO ปิดเมื่อใด | REQ-014 |
| Q-12 | PV และการจ่าย | ใช้ PR/PO/PS แบบใดจริง, ยอด ready-to-pay เกิดเมื่อใด, จ่ายบางส่วน/รวมหลาย source/PV หลายวิธีจ่ายได้ไหม, บัญชีธนาคารและหลักฐาน/ภาษีบังคับ | REQ-015/016 |
| Q-13 | เบิก/คืน | ขั้นตอนผู้ขอ-อนุมัติ-จ่ายของ, partial แล้วค้างหรือยกเลิกทันที, คืนไม่อ้าง Issue ได้ไหม, คืนของเสียเข้า Stock ใช้งานหรือแยก quarantine, อนุญาต stock ติดลบหรือไม่ | REQ-017/018 |
| Q-14 | คลังและต้นทุน | ยอดยกมาและวันเริ่มใช้, adjustment/โอนคลังอยู่ในขอบเขตไหม, ยอดจองเกิดจากเอกสารใด, Stock ต่ำตั้งระดับไหน, Valuation ใช้ FIFO/เฉลี่ย/อื่น ๆ | REQ-019/025 |
| Q-15 | เลขเอกสาร/เช็ค | รูปแบบ GR/PV/CQ/IS/SR ที่ใช้งานจริง, PS ใช้เลขฐานเดิมต่อรอบหรือเลขใหม่, ปี ค.ศ./พ.ศ. และออกเลขจริงตั้งแต่ Draft หรือเมื่อมีผล | REQ-016/026 |
| Q-16 | รายงานบัญชี | Aging bucket/วันฐาน/หนี้เริ่มจากเอกสารใด, as-of แบบย้อนหลัง, เลือกชุดรายงานเร่งด่วน, tax format, Excel/CSV/PDF, วิธี reconcile และเกณฑ์ปิดหนี้ | REQ-024/025 |
| Q-17 | ประวัติ/แจ้งเตือน | ใครดูข้อมูลเดิม/ธนาคาร/Export ได้, แจ้งในระบบหรืออีเมล, ผู้รับและกำหนดเวลา/stock threshold, วิธี retry และไม่แจ้งซ้ำ | REQ-021/023 |
| Q-18 | Dashboard | ยอดค้าง/ใกล้ครบกำหนด/งานรอทำคิดจากสถานะใด, cash flow ใช้รับจ่ายจริงหรือคาดการณ์, รอบบัญชีเริ่มวันใด | REQ-001 |
| Q-19 | ผังบัญชี/GL | ต้องแค่ทะเบียนรหัสและ mapping หรือรวมสมุดรายวัน/ลงบัญชี/ปิดงวด; ใครรับรอง mapping และ posting rule | REQ-006 |
| Q-20 | UX เมนูอื่น | ต้องการหน้าแยกแทน Popup สำหรับ IV/SO/BI/RV/เบิก/สินค้า/คลัง/COA ด้วยหรือไม่; ตอนนี้ยืนยันเปลี่ยนเป็นหน้าแยกเฉพาะ PO | ทุก UI ถัดไป |
| Q-21 | ต่างประเทศ | สกุลเงิน/อัตราแลกเปลี่ยน/วันที่ใช้ rate/ภาษีและยอดฐาน THB; ไม่อนุมานจากการเลือก overseas อย่างเดียว | PO/PS/PV/รายงานอนาคต |

## 8. User Scenarios & Testing

ใช้เป็นเกณฑ์ออกแบบและทดสอบงานถัดไป ไม่ใช่ผลทดสอบที่ผ่านแล้ว

| Priority | Scenario | Given / When / Then |
|---|---|---|
| P1 | วางบิลจริง | มี IV ค้างรับลูกค้าเดียวกัน 2 ใบ → เลือกและบันทึก BI → ได้เลข BI/รายการจริง, เปิดใหม่ได้ และไม่บันทึกซ้ำใน BI active |
| P1 | ตั้งหนี้และรับชำระ | IV มีผล 1,000 → รับบางส่วน 400 → เหลือ 600; cancel RV → กลับเป็น 1,000 ตามกติกา WHT/fee ที่ยืนยัน |
| P1 | รับของหลายครั้ง | PO สินค้า 10 → GR 6 แล้ว 4 → เหลือ 0 และ Stock เพิ่มรวม 10; รับเพิ่ม/รับพร้อมกันเกินต้องไม่ผ่าน |
| P1 | เบิกบางส่วน | ขอ 10, available 5 → อนุมัติเบิก 5/ยกเลิก 5 → Stock ลด 5, เก็บ requested/issued/cancelled แยกกัน |
| P1 | คืนสะสม | เบิก 5 คืนแล้ว 3 → คืน 2 ได้ คืน 3 ไม่ได้; คำขอพร้อมกันไม่ทำให้ยอดคืนรวมเกิน 5 |
| P1 | จ่ายเงินจาก source | มี PS/PV ยังไม่อนุมัติ → นำไปจ่าย/ทำเช็คไม่ได้; approved และเหลือยอดจึงเลือกได้; จ่ายซ้ำไม่สำเร็จ |
| P2 | Audit/approval | ผู้มีสิทธิ์อนุมัติตามขั้น → action เปลี่ยนสถานะพร้อม history; ผู้ไม่มีสิทธิ์หรือกดซ้ำไม่เกิด posting ซ้ำ |
| P2 | Historical Aging | มีรับชำระหลัง as-of → รายงานก่อนวันรับยังแสดงหนี้เดิม และรายงานหลังวันรับแสดงยอดลดถูกต้อง |
| P2 | Print และวันที่ | เอกสารหลายรายการ/หลายหน้า → พิมพ์ครบ, ยอดตรง, วันที่ dd/mm/yyyy และข้อมูลย้อนหลังตาม snapshot policy |
| P2 | Master หลายสาขา | เลือก Supplier/Customer สาขา B → ที่อยู่/บัญชี/ภาษีตรง B; เปลี่ยน master แล้วเอกสารเก่าเปลี่ยนเฉพาะที่ policy อนุญาต |

### ข้อจำกัดของ tests ที่มีอยู่

- [ar.test.js](../../api/test/ar.test.js), [inventory.test.js](../../api/test/inventory.test.js) และบางส่วนของ [ap.test.js](../../api/test/ap.test.js) ทดสอบฟังก์ชันตัวอย่างที่ประกาศใน test เอง ไม่ใช่ route handlers ทั้ง workflow
- เช่น test คืนสินค้ามี parameter previouslyReturnedQty แต่ production return handler ยังไม่ได้รวมยอดคืนก่อนหน้า จึง **test ผ่านไม่ได้แปลว่า cumulative limit ใน API ทำแล้ว**
- มี route/permission tests ของ Customer/Supplier และ Accounting access ที่ให้หลักฐานตรงขึ้น; ต้องขยายวิธีทดสอบนี้ไปธุรกรรม
- Tests PO ใหม่ครอบคลุม helper/หน้า/วันที่บางส่วน; ไม่แทน integration บนฐานข้อมูลจริง, rollback, cancellation และ concurrency
- ต้องเพิ่มกรณี double submit, request timeout แล้ว retry, inactive master, source ถูกยกเลิก, ยอดติดลบ, ปัดเศษ, ข้ามเดือนและเปลี่ยน permission ระหว่างใช้งาน

## 9. Success Criteria ก่อนเรียกแต่ละงานว่าเสร็จ

1. ทุก requirement ของ batch มีหน้าจอ/ผลบันทึกที่ตรวจย้อนกลับได้ หรือระบุเหตุผลที่ยัง Blocked ชัดเจน
2. บันทึกแล้วเปิดเอกสารใหม่ได้ครบทุก field/line และจำนวนเงินเทียบ source ตรงถึง 2 ตำแหน่งตามสูตรที่รับรอง
3. กรณี invalid/ไม่มีสิทธิ์/ผิดสถานะที่ระบุใน acceptance tests ทั้งหมดต้องถูกปฏิเสธ ไม่ใช่เพียงซ่อนปุ่ม
4. ทดสอบคำขอซ้ำและคำขอพร้อมกันบนยอดเดียวกันแล้วไม่เกิดเลขชน/รับเกิน/ลดหนี้เกิน/จ่ายซ้ำ/Stock ผิด
5. ยกเลิกและ rollback แล้วจำนวนเงิน/Stock/ความสัมพันธ์กลับถูกต้อง 100% ของชุดทดสอบ
6. รายงานและ Export total ตรงเอกสารที่มีผล รวมทดสอบ as-of ก่อนและหลัง receipt/payment/reversal
7. พิมพ์เอกสารตัวอย่างที่ผู้ใช้รับรองได้ครบทุกบรรทัด ทุกหน้า วันที่ dd/mm/yyyy และยอดตรงเอกสาร
8. UAT ยืนยัน workflow พร้อมตรวจ migration/client/API restart กับฐานข้อมูลเป้าหมายแล้ว ไม่อาศัย build ผ่านอย่างเดียว

## 10. Recommended Implementation Order

1. **แก้สิ่งที่ชวนเข้าใจผิดก่อน:** BI save ไม่ทำงาน, SO date field, ป้ายสถานะ prototype ของ Dashboard/AP Aging และ user-facing error
2. **ยืนยัน flow ที่มีผลต่อยอด:** Q-01, Q-04/05, Q-08, Q-11/12/13, Q-15/16 ก่อนลง posting จริง
3. **ปิด master ที่เป็น dependency:** Product/Service หน่วย/VAT/type, Supplier หลายสาขา/บัญชี และ PO line → Product เพื่อ GR
4. **ทำเส้นทาง AR ครบทีละเส้น:** SO → IV → BI → RV พร้อม CN, print และ cancel/reversal ไม่แยกทำแต่ฟอร์ม
5. **ทำเส้นทางคลัง:** PO → GR → Stock → Issue/Return พร้อม approval/ยอดคงเหลือ/locking/reversal
6. **ทำเส้นทางจ่าย:** PS → PV → Cheque/Transfer พร้อมยอดพร้อมจ่าย/ภาษี/กันซ้ำ/ประวัติ
7. **ทำส่วนกลางประกบแต่ละเส้นทาง:** RBAC แบบ action, Approval, Audit และ Notification ไม่รอให้ form ทั้งหมดเสร็จแล้วค่อยตรวจสิทธิ์
8. **ปิด reports/Dashboard/Export:** หลังนิยาม effective state และยอดจริงนิ่ง เพื่อไม่สร้างรายงานจากสูตรที่ยังไม่รับรอง

### สิ่งที่ควรส่งเพิ่มก่อนเริ่ม batch ถัดไป

- ตัวอย่างเอกสารจริงแต่ละชนิด โดยปิดข้อมูลส่วนบุคคล/เลขบัญชีที่ไม่จำเป็น
- ตัวอย่าง flow 1 เคสปกติ + 1 เคสบางส่วน + 1 เคสยกเลิก ต่อ AR/AP/Stock
- ตารางสายอนุมัติและสิทธิ์ตาม Q-01
- รูปแบบเลขเอกสารที่ยังไม่กำหนดตาม Q-15
- ตัวอย่างรายงานที่ใช้ตรวจยอดจริง และคำตอบว่ายอดหนี้เริ่ม/ปิดเมื่อใด

**เอกสารนี้เป็น backlog และคำถามรอการตัดสินใจ ไม่ใช่คำสั่งเริ่มพัฒนาทุกข้อ และยังไม่พร้อม sign-off ว่าระบบ Accounting ครบ spec**
