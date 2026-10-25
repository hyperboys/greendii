# Accounting: งานที่ยังขาดและข้อมูลที่ต้องยืนยัน

วันที่ตรวจ: 25/10/2026  
สถานะ: รายงานจากการอ่าน source code และข้อกำหนดปัจจุบัน ไม่ใช่ผลรับรองการใช้งานจริง  
ขอบเขต: เมนู Accounting ทั้งหมด โดยเน้นเมนูอื่นนอกเหนือจาก PO และความเชื่อมโยงกับ PO

## 1. สรุปสำหรับเจ้าของงาน

**Accounting ยังไม่ครบตาม spec และยังไม่ควรถือว่าทุกเมนูพร้อมทำธุรกรรมเงินจริง/Stock จริง**

- Customer, Sale บัญชี และ Supplier มีหน้าจัดการที่เป็นรูปเป็นร่างกว่าส่วนอื่น แต่ Supplier ยังไม่รองรับหลายสาขาและหลายบัญชีธนาคารแบบเป็นรายการ
- SO Draft และ Invoice ปรับเป็นหน้าแยกหลายรายการแล้ว; Invoice ใหม่มี Draft → ยืนยันตั้งหนี้ → ยกเลิกแบบมีเงื่อนไข ดูหัวข้อ 1.1–1.4 ยังรอ rollout/UAT จริง ไม่ใช่ AR ครบทุก Process
- ใบวางบิลมีหน้ารายการและปุ่มสร้าง แต่การ submit ใน UI ยังไม่เรียก API สร้างใบวางบิล
- ใบลดหนี้ (CN), ใบเบิกจ่ายผู้รับเหมา (PS) และใบคืนสินค้ายังไม่มีเมนูจัดการเฉพาะ แม้มี API สร้างบางส่วน
- GR, PV และเช็คจ่ายมีชื่อเมนู แต่หน้า Accounting ปัจจุบันแสดงข้อความว่ายังไม่อยู่ในขอบเขตที่ทำ
- หน้ารับชำระเงินแสดง Invoice ค้างรับ ไม่ใช่ทะเบียนใบรับชำระที่บันทึกไปแล้ว
- การเบิก/คืนสินค้าและ GR ใน API มีการบันทึกเป็น approved และกระทบ Stock ทันที ยังไม่ใช่ workflow อนุมัติตาม spec
- รายงานมีเพียง 4 หน้าหลัก และบางสูตรยังไม่ใช่ยอดทางบัญชีที่ยืนยันแล้ว โดยเฉพาะ AP Aging
- Approval, การยกเลิกและกลับยอด, ประวัติ, การพิมพ์/Export และ Notification ยังไม่ได้เชื่อมครบสำหรับเอกสาร Accounting
- ผล test/build ที่ผ่านก่อนหน้านี้ไม่ได้พิสูจน์ว่า workflow ธุรกิจครบ หรือฐานข้อมูลที่เปิดใช้อยู่มี schema ตรงกับโค้ด

**การวิเคราะห์เดิมเป็นงานเอกสารเท่านั้น ส่วนการลงมือทำต่อให้ติดตามตามหัวข้ออัปเดตด้านล่าง ไม่ถือว่ารายการ gap ทั้งหมดถูกแก้แล้ว**

### 1.1 อัปเดต Process แรก: SO Draft (25/10/2026)

ขอบเขตที่ผู้ใช้ยืนยันเพิ่มเติม:

- สร้าง/แก้ไข/ดู/พิมพ์เป็นหน้าแยกเหมือน PO, หลายรายการ, จำนวนเต็มบวกเพิ่มทีละ 1
- ทำ Draft ก่อน ยังไม่เปิดยืนยัน/อนุมัติ และ **ยังไม่ตัด Stock เพราะข้อมูล Stock ยังไม่เรียบร้อย**
- ผู้มีสิทธิ์สร้างยกเลิกได้ ต้องระบุเหตุผล และห้ามยกเลิกเมื่อมี Invoice ที่ยังไม่ยกเลิกอ้างอิง

ทำแล้ว: หน้า SO แยกพร้อม list/search/status, ลูกค้า/สาขา/ที่อยู่จัดส่ง/ผู้รับ, ค้นหา WO อ้างอิงเลขเท่านั้น, เลือกสินค้า Accounting หรือกรอกรายการเอง, หมายเหตุหัว/รายการ, วันที่ dd/mm/yyyy, พิมพ์ A4/PDF และประวัติสร้าง/แก้/ยกเลิก

API เพิ่ม detail/update/cancel และ validation ของวันที่จริง/จำนวนเต็ม/สินค้า-ลูกค้า-WO ที่เปิดใช้; แก้ได้เฉพาะ Draft และกันแก้ทับด้วย updatedAt; ใช้สิทธิ์ ar.create จัดการ Draft ส่วน ar.view ดู/พิมพ์ได้ การแก้และยกเลิกห้ามมี Invoice ที่ยังไม่ยกเลิกอ้างอิง และ Invoice create API ปฏิเสธ SO ที่ยกเลิกโดยใช้ row lock ร่วมกัน

หลักฐาน: [SO UI](../../accounting-ui/src/components/delivery-orders.tsx), [SO API](../../api/src/routes/delivery-orders.js), [validation/lock](../../api/src/lib/deliveryOrder.js), [HTTP tests](../../api/test/deliveryOrders.test.js), [UI tests](../../accounting-ui/test/delivery-order.test.cjs)

ตรวจแล้ว: API regression 50 tests, UI 25 tests, production build/type-check และ lint ของหน้าที่แก้ผ่าน; ทดสอบ browser ด้วยข้อมูลจำลองสร้าง/แก้/เปิดใหม่/ยกเลิก/สิทธิ์อ่านอย่างเดียว/วันที่ผิด/จำนวนทศนิยม และจอ 320/390/768/1280 ไม่ล้นระดับหน้า; พิมพ์ตัวอย่าง 80 รายการเป็น PDF A4 ได้ 5 หน้า

ยังไม่เสร็จใน Process SO → IV เต็ม: ยืนยัน/อนุมัติ, ดึงรายการไป Invoice/การออกบางส่วน/ยอดคงเหลือ, snapshot ชื่อ master และ UAT ฐานข้อมูลจริง/การทดสอบ PostgreSQL พร้อมกัน ห้ามนำผล HTTP tests ซึ่งใช้ฐานข้อมูลจำลองไปอ้างว่า production DB ผ่านแล้ว รอบ Draft แรกไม่ได้เปลี่ยน schema; ส่วนขยาย PDF ด้านล่างต้องเพิ่มคอลัมน์

### 1.2 อัปเดต SO ตาม PDF ที่ผู้ใช้ส่ง (25/10/2026)

แม่แบบหลัก: [ใบส่งของชั่วคราว.pdf](ใบส่งของชั่วคราว.pdf) ใช้ชื่ออังกฤษ TEMPORARY INVOICE, หัวบริษัทจาก Settings, กล่องเลขที่/วันที่, ข้อมูลลูกค้า โทรศัพท์/โทรสาร, กำหนดส่ง/เครดิต, ตาราง 7 คอลัมน์, ยอดรวม และลายเซ็นผู้รับสินค้า/ผู้ส่งสินค้า/ผู้มีอำนาจ ใส่ชื่อผู้สร้างเฉพาะช่องผู้ส่งสินค้า ไม่เติมลายเซ็นหรือข้อมูลบริษัทจากภาพเป็นค่าคงที่

ข้อสรุปใหม่ที่ยืนยัน:

- ปรับทั้งฟอร์มและข้อมูลที่บันทึก ไม่ใช่เพิ่มช่องว่างในหน้าพิมพ์อย่างเดียว
- ราคาไม่รวม VAT, ส่วนลดรายการเป็นบาทและส่วนลดท้ายเอกสารเป็นบาท, VAT 7% หรือ No VAT
- ยอดบรรทัด = จำนวน × ราคาต่อหน่วย − ส่วนลดรายการ; รวมเงิน = ผลรวมยอดบรรทัด จากนั้นหักส่วนลดท้ายเอกสารก่อนคิด VAT; ใช้หน่วยสตางค์ใน API และปัดภาษี 2 ตำแหน่ง ไม่ยึดยอดรวมที่ client ส่ง
- ช่องใบสั่งจอง / ลงวันที่ / เงื่อนไขการวางบิล **เว้นว่างก่อน** ไม่ผูกกับ WO แทนเอง
- เพิ่มรหัสสินค้าบนเอกสาร, ราคา/ส่วนลด, โทรศัพท์/โทรสาร, กำหนดส่งและเครดิตในฟอร์ม; ยังเป็น Draft และไม่ตัด Stock/ไม่ตั้งหนี้

การติดตั้งส่วนขยาย: สำรอง/ตรวจแล้วใช้ [accounting-delivery-orders.sql](../../api/scripts/sql/accounting-delivery-orders.sql) เพิ่มคอลัมน์เดิมแบบรันซ้ำได้ แล้ว generate Prisma และ restart API/UI; ไม่ได้ apply กับฐานข้อมูลร่วมให้ เอกสารเก่ามียอดเริ่มต้น 0 และเครดิต 30 วัน ไม่ backfill ราคา/ภาษี/ข้อมูลย้อนหลังจาก master ปัจจุบัน

ตรวจแล้ว: API 51 tests, UI 27 tests, Prisma validate/generate, build/type-check และ lint ผ่าน; browser ใช้ API จำลองร่วมกับตัวคำนวณจริงทดสอบแก้ส่วนลดแล้วบันทึก/เปิดใหม่ รวมถึงจอ 320/390/768/1280 ไม่ล้น; PDF ตัวอย่าง 2 รายการลง A4 1 หน้า และ 80 รายการ 5 หน้า เลขหน้าตรงจำนวนหน้า PDF พร้อมแสดงยอดรวมเฉพาะหน้าสุดท้าย ยังต้อง UAT กับ DB เป้าหมายหลัง rollout

### 1.3 อัปเดต SO UX และจุดส่งต่องาน (25/10/2026 เวลา 20:37)

**สถานะ ณ รอบ SO UX: SO Draft ทำแล้วตามขอบเขตที่ตกลง; Invoice ทำต่อในหัวข้อ 1.4 และยังไม่ผ่าน UAT ฐานข้อมูลจริง**

ทำเพิ่มหลังรอบ PDF:

- ลูกค้าและ WO เป็น dropdown ค้นหาในช่องเดียว เลือกด้วยเมาส์หรือคีย์บอร์ดได้; ออกจากช่องหรือกด Escape ไม่เปลี่ยนค่าที่เลือก
- ลูกค้าค้นจากรหัส/ชื่อ และเติมสาขา/ที่อยู่/ผู้รับ/ข้อมูลติดต่อ/เครดิต/VAT ตามเดิม; ต้องเลือกจากรายการจริง ไม่ใช่พิมพ์ชื่อแล้วถือว่าเลือก
- WO ค้นจากเลข/โครงการ แสดงกำลังค้นหา/ข้อผิดพลาด/ไม่พบ และไม่แสดงผลตอบกลับเก่าทับคำค้นใหม่; คงชื่อ WO ที่เลือกไว้แม้อยู่นอกผลค้นหา และล้างเป็น “ไม่อ้างอิง WO” ได้
- รายการส่งสินค้าเป็นตารางย่อ: สินค้า/รหัส, จำนวน, หน่วย, ราคา, ส่วนลด, จำนวนเงินและปุ่มลบ
- **รายละเอียดและหมายเหตุอยู่ด้านล่างของแต่ละรายการ** ตามข้อเสนอแนะล่าสุด ไม่แย่งความกว้างกับยอดเงิน; บนจอเล็กเรียงช่องลงมา ไม่ต้องเลื่อนซ้าย–ขวา
- เพิ่มรายการได้จากด้านบน/ล่าง ลบได้แต่ต้องเหลืออย่างน้อยหนึ่งรายการ; ยอดบรรทัด/ยอดรวมคำนวณทันที จำนวนยังเป็นจำนวนเต็มบวก
- “กรอกรายการเอง” คือบันทึกรายการเฉพาะเอกสาร ไม่สร้างหรือผูกทะเบียนสินค้าใหม่; ทั้งแบบเลือกสินค้าและกรอกเองยังไม่ตัด Stock ในระยะนี้

หลักฐานเพิ่ม: [dropdown component](../../accounting-ui/src/components/searchable-select.tsx), [dropdown tests](../../accounting-ui/test/searchable-select.test.cjs), [SO form/tests](../../accounting-ui/test/delivery-order.test.cjs), [คู่มือและข้อจำกัด rollout](../../accounting-ui/README.md)

การตรวจรอบ UX ล่าสุด: focused SO/dropdown tests **12/12 ผ่าน**, production build/type-check และ focused lint ผ่าน; browser จำลอง API ตรวจเลือกสินค้า/เติมค่า, จำนวนเต็ม, ส่วนลด, เพิ่มสามรายการแล้วลบแถวกลาง, ยอด 30 + 40 = 70, บันทึก–เปิดแก้ไข และการคงค่า customer/WO ผ่าน ทดสอบจอ **320/390/768/1024/1280/1440px** ทั้งรายการว่างและมีข้อมูล: หน้าและส่วนรายการไม่เลื่อนแนวนอน รายละเอียดอยู่ใต้แถวหลัก ยอดเงินและปุ่มลบเห็นครบ ตัวเลข test 50/25 และ 51/27 ในหัวข้อก่อนหน้าเป็นผลของรอบนั้น ไม่ใช่จำนวน tests ที่รันใหม่ในรอบนี้

การเปลี่ยน UX ไม่เพิ่ม schema และไม่ต้อง restart API; แต่ข้อกำหนด rollout SQL ของส่วนขยาย PDF ในหัวข้อ 1.2 ยังมีผล ไม่ได้ยืนยันว่า operator apply แล้ว

**งานถัดไปที่เสนอ: Invoice / ใบแจ้งหนี้–ใบกำกับภาษี (REQ-007/009 และส่วนเชื่อม REQ-008)** ตามลำดับ Process SO → Invoice ที่เลือกไว้ ไม่ข้ามไปทำ BI/RV/Stock พร้อมกัน

ตรวจโค้ด Invoice ปัจจุบันซ้ำแล้ว: UI ยังเป็น Popup หนึ่งรายการ ไม่มีหน้า detail/edit/print; API สร้าง Draft แต่ตั้ง `outstandingAmount` เท่ากับยอดสุทธิทันที และยังรับยอดเงินบางส่วนจาก client จึงต้องยืนยันจุดตั้งหนี้และสูตรก่อนขยาย workflow ไม่ถือว่าข้อสรุป Draft ของ SO ใช้แทน Invoice โดยอัตโนมัติ

คำถามขณะส่งต่องานคือหน้าแยก/ขอบเขต Draft, สูตรเงิน, วิธีดึง SO และจุดตั้งหนี้; ได้คำตอบและลงมือในหัวข้อ 1.4 ด้านล่างแล้ว

### 1.4 Process ถัดไป: Invoice Draft → ยืนยันตั้งหนี้ (25/10/2026)

**ทำแล้วในโค้ดและผ่านการทดสอบจำลอง; ยังไม่ apply SQL กับฐานข้อมูลร่วม และยังไม่รับรองการตั้งหนี้/การพิมพ์กับเครื่องจริง**

ข้อสรุปที่ผู้ใช้ยืนยันในรอบนี้:

1. หน้าแยกสร้าง/แก้ไข/ดู หลายรายการ พร้อม **Draft และปุ่มยืนยันในรอบนี้** ไม่ใช่เลื่อนยืนยันไปรอบหน้า
2. Draft ใหม่ยังไม่ตั้งหนี้และนำไป BI/RV/CN ไม่ได้; กดยืนยันจึงตั้งยอดค้างรับเท่ายอดสุทธิ ใช้สถานะฐานข้อมูล `approved` แสดงใน UI ว่า “ยืนยันแล้ว” ไม่ได้ผ่าน approval หลายขั้น
3. ผู้มีสิทธิ์ `ar.create` สร้าง/แก้ Draft/ยืนยัน/ยกเลิกได้; `ar.view` ดูอย่างเดียว การยกเลิกต้องมีเหตุผล และห้ามเมื่อมี BI/RV/CN ที่ยังไม่ยกเลิกอ้างอิง; ยืนยันแล้วห้ามแก้
4. ราคาไม่รวม VAT; ส่วนลดรายการและท้ายเอกสารเป็นบาท; VAT 7% / No VAT; ปัด 2 ตำแหน่งตาม SO โดย API คำนวณใหม่ ไม่รับยอดรวม client เป็นความจริง
5. ไม่อ้างอิง SO ก็ได้; ถ้าเลือก ให้คัดลอก **ทุกรายการจาก SO หนึ่งใบ** โดย API อ่านจาก SO จริง ไม่รับรายการต้นทางปลอมจาก client ห้ามมี Invoice ที่ยังไม่ยกเลิกซ้ำจาก SO เดียว รวมถึงตรวจเอกสารเก่า ยกเลิก Invoice แล้วจึงออกใหม่ได้
6. หลังบันทึกไม่เปลี่ยน SO ต้นทาง หากต้องเปลี่ยนให้ยกเลิกและสร้างใหม่; รายการ/ราคา/ส่วนลด/VAT/เครดิตของแบบดึง SO อ่านอย่างเดียว ไม่ใช่ออกบางส่วน
7. พิมพ์ **เฉพาะข้อมูลเพื่อทับกระดาษแบบฟอร์มสำเร็จรูป** ตาม [invoice.pdf](invoice.pdf) ไม่พิมพ์โลโก้ หัวเอกสาร เส้นตารางหรือส่วนรับชำระซ้ำ ผู้ใช้ยืนยันให้ใช้แบบนี้แม้ภาพมีหัว “ใบเสร็จรับเงิน / RECEIPT”; ไม่เติมวิธีรับเงิน/ผู้รับเงิน/ลายเซ็น

สิ่งที่ทำ:

- เส้นทางเดิม `/ar/invoices` และ `?tab=invoices` ใช้ทะเบียนใหม่; เพิ่ม `/ar/invoices/new`, `/ar/invoices/:id`, `/ar/invoices/:id/edit` และเมนูย่อย active ถูกต้อง
- ลูกค้า/SO เป็น dropdown ค้นหาได้, ข้อมูลสาขา/ที่อยู่ออกบิล/จัดส่ง/Tax ID/เลข PO ลูกค้า/เครดิต/วันครบกำหนด/หมายเหตุ; ตารางรายการใช้ component ร่วมกับ SO และคงรายละเอียด/หมายเหตุใต้แถวโดยไม่เลื่อนแนวนอน
- API list/search/filter/detail/history/create/update/confirm/cancel และค้นหา SO ที่ยังไม่มี Invoice active; ใช้ `updatedAt` กันเขียนทับและคำสั่งจากหน้าจอเก่า
- ใช้ row lock ของ Invoice ร่วมกับ BI/RV/CN และ lock ของ SO ร่วมกับการแก้/ยกเลิก SO; ตั้งหนี้ได้ครั้งเดียว ยกเลิกแล้วคงเอกสาร/ประวัติและยอดค้างรับเป็น 0 ไม่ลบรายการ
- BI/RV/CN ตรวจ Invoice ใหม่ว่าต้องยืนยันก่อน; รับชำระผิดลูกค้า/ยอดติดลบ/เกินยอดถูกปฏิเสธ การใช้ BI/RV/CN อ้างอิงจะกันการยกเลิก Invoice โดยตรง ไม่ทำ reversal เอกสารต่อเนื่องในรอบนี้
- เอกสารใหม่เก็บ snapshot ชื่อ/รหัสลูกค้า ที่อยู่/ภาษีและข้อมูลรายการ; ไม่อ้างว่าข้อมูลย้อนหลัง Legacy ถูกเติม snapshot แล้ว
- หน้าพิมพ์เป็น A4 portrait ระบุตำแหน่งหน่วย mm, แบ่งหน้าและแสดงยอดเฉพาะหน้าสุดท้าย; ยืนยันแล้วจึงเปิดพิมพ์ ลดขนาดข้อความหัวให้พอดีและแจ้งข้อผิดพลาด/ปิดพิมพ์ถ้ายาวเกินพื้นที่ ไม่ตัดข้อความทิ้งเงียบ ๆ
- **ไม่ตัด Stock และไม่สร้างรายการ GL/สมุดรายวัน** “ตั้งหนี้” ในรอบนี้หมายถึงยอดค้างรับของ AR Invoice

การคงเอกสารเก่า: เพิ่ม `lifecycleVersion` ค่าเริ่มต้น 0 สำหรับข้อมูลเดิม ส่วนที่สร้างใหม่กำหนด 1; Legacy เป็นอ่านอย่างเดียวในวงจรใหม่ ไม่ยืนยัน/แก้/ยกเลิกผ่านปุ่มใหม่ และ **ไม่เปลี่ยนยอดค้างรับ/สถานะเดิมอัตโนมัติ** การใช้งานปลายทางของ Legacy คงกติกาเดิมที่ไม่ใช่ cancelled จนกว่าจะตรวจและย้ายข้อมูลอย่างชัดเจน ดังนั้นไม่ได้รับรองว่า Legacy Draft ไม่มีหนี้แล้ว

ติดตั้ง: สำรองฐานข้อมูลและให้ operator ตรวจ [accounting-invoices.sql](../../api/scripts/sql/accounting-invoices.sql) ก่อนรัน เพิ่มคอลัมน์แบบ additive และ unique index ของ SO สำหรับวงจรใหม่; ไม่ UPDATE ยอดเก่า ต้องมีส่วนขยาย SO PDF ตามหัวข้อ 1.2 ด้วย จากนั้น generate Prisma และ restart API/อัปเดต UI ให้เป็นรุ่นเดียวกัน ห้ามใช้ db reset หรือ blanket migration บนฐานข้อมูลร่วม

หลักฐาน: [Invoice UI](../../accounting-ui/src/components/invoices.tsx), [ตารางรายการร่วม](../../accounting-ui/src/components/document-items.tsx), [พิมพ์ข้อมูลล้วน](../../accounting-ui/src/components/invoice-document.tsx), [Invoice API](../../api/src/routes/invoices.js), [กติกาและ locks](../../api/src/lib/invoice.js), [HTTP tests](../../api/test/ar.test.js), [UI tests](../../accounting-ui/test/invoice.test.cjs)

ตรวจแล้ว: API suite **53/53**, UI suite **38/38**, production build/type-check และ focused lint ของ UI Invoice/SO ผ่าน; lint รวมไฟล์ API client ยังพบ `any` เดิม 17 จุดนอกส่วนที่เพิ่มในรอบนี้ (ไม่ได้แก้นอก scope) browser จำลอง API ร่วมกับ validator จริงตรวจ SO copy ทั้งหมด, Draft ยอดค้างรับ 0, เปิดแก้/ยืนยัน/ยกเลิก, dependent guard, Legacy/สิทธิ์ดู, จอ 320–1440px และ SO regression ผ่าน PDF ข้อมูลล้วน 2 รายการ = 1 หน้า, 80 รายการ = 8 หน้า ไม่มีหัว/โลโก้/เส้นแม่แบบ ไม่มีข้อมูลรับชำระ และตรวจภาพซ้อนแม่แบบบนจอแล้ว

ยังต้องทำ/ตรวจต่อ:

- UAT บน PostgreSQL เป้าหมายหลัง SQL รวมการส่งคำขอพร้อมกันจริง (HTTP tests ใช้ฐานข้อมูลจำลอง ไม่พิสูจน์ locking ของ PostgreSQL)
- ทดลองเครื่องพิมพ์กับกระดาษจริง: A4, actual size 100%, ปิด browser headers/footers และตรวจระยะป้อนกระดาษ; ยังไม่รับรองตำแหน่งกับเครื่องพิมพ์ทุกเครื่อง
- ทบทวน/ย้าย Legacy แยกต่างหาก ห้ามล้างยอด Draft เดิมตามกติกาใหม่โดยไม่มีการตรวจ
- BI UI ยังเป็น gap เดิม: เลือกหลาย IV/สร้างจริง/ดู/แก้/ยกเลิก/พิมพ์/กันวางบิลซ้ำ เป็น **Process ถัดไปที่เสนอ**
- RV/CN workflow เต็ม, สูตร WHT/fee, reversal, attachments, approval หลายขั้น, รายงาน as-of และ GL ยังไม่ได้ทำครบ; ไม่ถือว่าการเพิ่ม guard ในรอบนี้ปิด gap เหล่านี้แล้ว

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
| ใบส่งของชั่วคราว SO | หน้าแยก Draft หลายรายการ, ค้นหาลูกค้า/WO, ตารางย่อ, ดู/แก้/พิมพ์/ยกเลิก/history; ดึงทั้งใบไป Invoice ได้ | ยังไม่เปิดยืนยัน/ตัด Stock ตาม scope; ไม่ทำ partial Invoice; UAT DB จริงยังค้าง | ทำแล้วระยะ Draft ดูหัวข้อ 1.1–1.4 |
| Invoice IV | หน้าแยก list/new/edit/view/history, หลายรายการ/ส่วนลด/VAT, คัดลอก SO ทั้งใบและกันซ้ำ, Draft/ยืนยันตั้งหนี้/ยกเลิกแบบมีเงื่อนไข, พิมพ์ข้อมูลทับแบบฟอร์ม | รอ SQL/UAT/เครื่องพิมพ์จริง; Legacy ไม่ย้ายอัตโนมัติ; ยังไม่มีไฟล์แนบ/approval หลายขั้น/WO selector อิสระ/partial SO | ทำแล้วตาม scope รอบนี้ ดู 1.4 ไม่ใช่ AR ครบ |
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
| F-02 แก้แล้วใน SO Draft: field วันที่ | ฟอร์ม SO ใหม่ส่ง docDate โดยตรงและ API ตรวจวันที่จริง | มีกรณีทดสอบวันที่ผิด/บันทึก-เปิดใหม่; Invoice process ยังแยกทำต่อ |
| F-03 แก้แล้วสำหรับ Invoice ใหม่: authoritative totals | Invoice API คำนวณใหม่จากรายการที่ตรวจแล้ว และคัดลอก SO โดย server | สูตรเงินยืนยันแล้วตาม 1.4; ไม่คำนวณย้อนหลังทับเอกสารเก่า รอ DB UAT |
| F-04 แก้แล้วสำหรับ Invoice ใหม่: Draft ไม่ตั้งหนี้ | lifecycleVersion=1 สร้าง outstanding=0; confirm ตั้งหนี้ครั้งเดียว; unpaidOnly/BI/RV/CN กัน Draft ใหม่ | Legacy ยังคงยอดและกติกาเดิม ต้องตรวจการย้ายข้อมูลแยกต่างหาก |
| F-05 Billing Note ยังตรวจเอกสารต้นทางไม่ครบ | รอบ Invoice เพิ่ม lock/ตรวจ missing/status/ยอดบวก/ลูกค้า และ id ซ้ำใน request แล้ว แต่ยังไม่กันอยู่ใน BI active ซ้ำ | ยังต้องทำ BI UI/workflow และ concurrent duplicate billing ใน Process ถัดไป |
| F-06 RV/WHT และยอดจัดสรรยังไม่ครบ | RV API ตัด Invoice ด้วย receivedAmount เท่านั้น; UI ส่ง whtAmount ต่อ allocation แต่ยอด WHT ระดับหัวไม่ได้ส่งให้สอดคล้อง | ต้องยืนยันว่า WHT/fee ลดหนี้อย่างไร ตรวจผลรวม header/allocations และ customer/status ทุกใบ |
| F-07 GR รับยอดคงเหลือจาก request | [AP API](../../api/src/routes/ap.js) เก็บ ordered/previouslyReceived/remaining/current จาก request; [GR line schema](../../api/prisma/schema.prisma) ไม่มี FK ไป PO line | ไม่พิสูจน์ว่ารับไม่เกินจริง; ต้องอ้าง PO line และรวมการรับเดิมที่มีผลก่อน posting |
| F-08 PO ปัจจุบันยังไม่ส่ง productId จาก UI | [PO form](../../accounting-ui/src/components/purchase-orders.tsx) ใช้ partNo/desc/unit อิสระ; [PO draft type](../../accounting-ui/src/lib/purchase-order.ts) ไม่มี productId | ต่อ GR อัตโนมัติยังไม่ได้ ต้อง map Product/Service อย่างชัดเจน ไม่ถือ partNo ว่าเป็น FK |
| F-09 Stock เบิก/คืนยังไม่ผ่าน approval | [Inventory API](../../api/src/routes/inventory.js) create ตั้ง approved และสร้าง movement ทันที; GR ก็มีลักษณะ immediate posting | ขัด flow approval ที่ระบุ; ต้องแยกบันทึกร่าง/อนุมัติ/posting และทำ reversal |
| F-10 คืนสินค้ายังไม่ตรวจยอดสะสมครบ | API เทียบ returnedQty กับ issuedQty ของ issue line ที่หาเจอ แต่ไม่รวมยอดคืนก่อนหน้า; สินค้าที่ไม่พบใน issue ยังไม่ถูกปฏิเสธในส่วนนี้ | คืนหลายครั้งอาจเกินที่เคยเบิก; ต้อง validate ทุก line และ cumulative remaining |
| F-11 เช็คมีเพียง allowed status ไม่ใช่ transition matrix | AP API status ตรวจชื่อใน list และห้ามเปลี่ยนจาก Cancelled แต่ไม่ได้ใช้ transition matrix จริง | ต้องกันข้าม Prepared → Cleared และบังคับเหตุผลยกเลิก; test ตัวอย่างไม่ใช่ handler นี้ |
| F-12 AP Aging ยังไม่ใช่ยอดเจ้าหนี้สุทธิ | [Report API](../../api/src/routes/accounting-reports.js) ใช้ netAmount ของ PO และ poDate โดยไม่หักจ่าย | ห้ามใช้รายงานนี้สรุปยอดค้างจ่ายจริงก่อนยืนยันฐานหนี้และสูตร |
| F-13 transaction ไม่ได้แปลว่าปลอด concurrent update | Invoice/BI/RV/CN ใช้ lock ร่วมของ Invoice ในรอบ 1.4 แล้ว; PS/GR/Issue/Return ยังไม่พบการป้องกันครบ | ต้องทดสอบ PostgreSQL พร้อมกันจริง และแก้ Stock/AP ใน Process นั้น ไม่อ้าง mock ว่าพิสูจน์ concurrency จริง |
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
| REQ-007 | SO หลายรายการและต้นทางที่เลือกได้ | Draft form/detail/edit/print/cancel และ Invoice full-copy ทำแล้ว; SO confirm/Stock ไม่อยู่ในระยะนี้ | delivery-orders.tsx; delivery-orders.js; invoice.js | Draft และคัดลอก SO ทั้งใบ/กัน IV ซ้ำ ผ่าน mock tests; ไม่ทำ partial | Implemented agreed scope; รอ DB UAT |
| REQ-008 | IV ครบ header/lines/references | หน้าแยก/หลายรายการ/SO/PO ลูกค้า/discount/confirm/cancel/data-only print ทำแล้ว; attachments/WO อิสระยังค้าง | invoices.tsx; invoices.js; schema | ดึง SO/คำนวณใหม่/กันซ้ำ/พิมพ์หลายหน้า ผ่าน tests; รอเครื่องพิมพ์จริง | Implemented current scope; remaining backlog |
| REQ-009 | ยอด Invoice คำนวณจากข้อมูลที่ตรวจแล้ว | API authoritative; Draft=0/confirm ตั้งหนี้/guard ปลายทางทำแล้ว; Legacy คงเดิม | invoice.js; invoices.js; ar.js | forged totals ถูกแทนด้วยยอดคำนวณจริง ยืนยันซ้ำไม่เพิ่มหนี้ และ Draft ใหม่ใช้ต่อไม่ได้ | Implemented; รอ DB/concurrency UAT |
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
| REQ-027 | เอกสารพิมพ์ข้อมูลคงที่ตามกติกา | PO/SO template และ IV data-only overlay ทำแล้ว; snapshot/page overflow ตาม scope; เอกสารอื่นยังค้าง | purchase-order-document.tsx; delivery-order-document.tsx; invoice-document.tsx | หลายหน้าไม่ตกบรรทัด; IV snapshot ไม่เปลี่ยนตาม master; รอเครื่องพิมพ์จริงและ policy เอกสารอื่น | Partial: ดู 1.4; remaining Q-09 |
| REQ-028 | PO ตาม scope ล่าสุดและวันที่กลาง | หน้าแยก/Draft/วันที่มีแล้ว → DB smoke และต่อ Product-GR | purchase-orders.tsx; accounting-date.ts; schema/SQL | save/detail/edit/print กับ DB เป้าหมาย; dd/mm/yyyy ทุกหน้า | In Progress |

ตำแหน่งในตารางย่อชื่อไฟล์เพื่ออ่านง่าย: UI ใต้ [accounting-ui/src](../../accounting-ui/src), API ใต้ [api/src](../../api/src), models ใต้ [schema.prisma](../../api/prisma/schema.prisma)

## 7. Open Questions / ข้อมูลที่ควรเตรียม

**บันทึกไว้ก่อนตามคำขอ ไม่ต้องตอบทั้งหมดทันที** คำถามเหล่านี้ไม่ได้ยกเลิกข้อสรุป PO ระยะ Draft ที่ยืนยันแล้ว

| Q | เรื่อง | ข้อมูล/คำตอบที่ต้องการ | ใช้กับงาน |
|---|---|---|---|
| Q-01 | สายอนุมัติและสิทธิ์ | PS/PV/เบิก/คืนใช้กี่ขั้น, ใคร, วงเงิน/แผนก/ประเภท, แทนกันได้ไหม, สิทธิ์ submit/reject/return/cancel และคนเดียวสร้าง-อนุมัติได้หรือไม่ | REQ-020/021 และเอกสารที่มี approval |
| Q-02 | Supplier หลายสาขา | code ต่อบริษัทหรือสาขา, สาขา default, ที่อยู่แต่ละประเภท, บัญชีธนาคารหลายบัญชีและบัญชี default; ธุรกรรมเก่าต้องคง snapshot ใด | REQ-003 |
| Q-03 | Master quality | Tax ID ซ้ำเตือนหรือห้ามตามประเภท/สาขา; field บังคับ, หน่วย/หมวดหมู่สินค้า, ต้องเก็บจำนวนทศนิยมในเอกสารอื่นหรือไม่ (PO ยืนยันจำนวนเต็มแล้ว) | REQ-002/004/005 |
| Q-04 | สูตร Invoice — ตอบแล้วรอบ 1.4 | ราคาไม่รวม VAT, ส่วนลดรายการและท้ายเอกสารเป็นบาท, ปัด 2 ตำแหน่ง; ar.create แก้ Draft แบบไม่ผูก SO ได้, แบบดึง SO คงสูตรต้นทาง | REQ-008/009 |
| Q-05 | สถานะที่ตั้งหนี้ — ตอบแล้วสำหรับ Invoice ใหม่ | Draft ไม่มีหนี้/ใช้ BI/RV/CN ไม่ได้; ar.create ยืนยันแล้วตั้งหนี้; ยืนยันห้ามแก้; ยกเลิกต้องเหตุผลและไม่มี BI/RV/CN active ไม่รวมการย้าย Legacy/reversal | REQ-007/009/022/024 |
| Q-06 | SO → IV ตอบแล้ว / BI ยังรอ | SO หนึ่งใบคัดลอกทั้งหมดไป IV หนึ่งใบที่ยังไม่ยกเลิก ไม่ออกบางส่วน/รวมหลาย SO; ไม่อ้าง SO ก็ได้; BI ยังรอเต็มยอดหรือบางส่วนและกติกาออกใหม่ | REQ-007/008/010 |
| Q-07 | ลดหนี้ CN | ลดเป็นยอดหรือหลายรายการ, คืนสินค้าหรือไม่, VAT ลดอย่างไร, ต้องอนุมัติไหม, ลดหลังรับเงินเต็มแล้วได้ไหม/คืนเงินอย่างไร | REQ-011 |
| Q-08 | รับเงิน RV | WHT/ค่าธรรมเนียมนับเป็นยอดปิดหนี้อย่างไร, หลาย IV ผ่าน BI, จัดสรรเกิน/เงินล่วงหน้า, เช็ครับผ่านบัญชีเมื่อใด, หลักฐานแนบและเลขอ้างอิงใดบังคับ | REQ-012 |
| Q-09 | แม่แบบและ snapshot — ตอบบางส่วน | SO ตาม PDF และ IV พิมพ์ข้อมูลล้วนทับกระดาษที่ยืนยันแล้วตาม 1.4; BI/CN/RV/PS/GR/PV/เช็ค/เบิก/คืน ยังรอแบบ/สำเนา/ลายเซ็น/เงื่อนไข/นโยบาย snapshot ในแต่ละ Process | REQ-027 |
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
| Q-20 | UX เมนูอื่น | ยืนยันและทำหน้าแยกสำหรับ PO/SO/IV แล้ว; BI/RV/เบิก/สินค้า/คลัง/COA รอยืนยันใน Process นั้น | ทุก UI ถัดไป |
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

สถานะหลังรอบ 1.4: SO date/หน้าเอกสาร และ Invoice ใหม่ตาม Q-04/Q-05 ทำแล้วตามขอบเขต; **BI เป็น Process ถัดไป** โดยยังต้องตอบส่วน BI ใน Q-06 ก่อนออกแบบยอด/ยกเลิก ไม่ต้องตอบคำถาม Invoice ที่ปิดแล้วซ้ำ ลำดับด้านล่างเป็นแผนภาพรวมจากการวิเคราะห์เดิม

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
