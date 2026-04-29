const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── USERS ────────────────────────────────────────────────────────────────
  const defaultPass = await bcrypt.hash('1234', 10);
  const usersData = [
    { username: 'somchai',        fullName: 'สมชาย ใจดี',        initials: 'SC', role: 'sales' },
    { username: 'somsri',         fullName: 'สมศรี รักงาน',      initials: 'SS', role: 'sales2' },
    { username: 'manager_sale',   fullName: 'วิชัย ขายเก่ง',     initials: 'WC', role: 'sale_mgr' },
    { username: 'manager_admin',  fullName: 'ปรีชา จัดการ',      initials: 'PC', role: 'admin_mgr' },
    { username: 'manager_project',fullName: 'นิพนธ์ โปรเจกต์',  initials: 'NP', role: 'project_mgr' },
    { username: 'director',       fullName: 'ประยุทธ์ ผู้บริหาร',initials: 'PY', role: 'director' },
    { username: 'procurement',    fullName: 'มาลี จัดซื้อ',      initials: 'ML', role: 'procurement' },
    { username: 'factory',        fullName: 'สมบูรณ์ โรงงาน',   initials: 'SB', role: 'factory' },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash: defaultPass },
    });
  }
  console.log('✅ Users seeded (password: 1234)');

  // ── CUSTOMERS ────────────────────────────────────────────────────────────
  const customersData = [
    { name: 'บริษัท ABC จำกัด',         contactPerson: 'คุณมานี',       tel: '02-123-4567', email: 'info@abc.com',           address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',   taxId: '0105123456789' },
    { name: 'บริษัท XYZ จำกัด',         contactPerson: 'คุณสมพร',       tel: '02-987-6543', email: 'contact@xyz.co.th',      address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',   taxId: '0105987654321' },
    { name: 'โรงแรม สยามรีสอร์ท',       contactPerson: 'คุณวิไล',       tel: '053-111-222', email: 'booking@siamresort.com', address: '789 ถ.ราชดำเนิน เชียงใหม่ 50200', taxId: '0105555666777' },
    { name: 'บริษัท กรีนเทค จำกัด',     contactPerson: 'คุณสมชาย',     tel: '02-555-8888', email: 'info@greentech.co.th',   address: '321 ถ.พระราม 4 กรุงเทพฯ 10500',   taxId: '0105444555666' },
    { name: 'บริษัท สมาร์ทบิลด์ จำกัด', contactPerson: 'คุณประเสริฐ',  tel: '02-777-9999', email: 'contact@smartbuild.co.th',address: '999 ถ.เพชรบุรี กรุงเทพฯ 10310',  taxId: '0105888999000' },
  ];
  for (const c of customersData) {
    await prisma.customer.upsert({ where: { name: c.name }, update: {}, create: c });
  }
  console.log('✅ Customers seeded');

  // ── PRODUCTS ─────────────────────────────────────────────────────────────
  const productsData = [
    { code: 'GW-1200-600', name: 'Green Wall Panel 1200x600mm',  category: 'Green Wall', unit: 'แผ่น',    price: 1500, cost: 900,   description: 'แผ่นกรีนวอลล์ขนาด 1200x600mm พร้อมระบบรดน้ำอัตโนมัติ' },
    { code: 'AC-600-600',  name: 'Acoustic Panel 600x600mm',     category: 'Acoustic',   unit: 'แผ่น',    price: 950,  cost: 450,   description: 'แผ่นดูดซับเสียงขนาด 600x600mm หนา 50mm' },
    { code: 'MF-STD',      name: 'โครงเหล็กรองรับ',            category: 'Structure',  unit: 'ชุด',     price: 800,  cost: 400,   description: 'โครงเหล็กรองรับสำหรับติดตั้งแผ่นกรีนวอลล์' },
    { code: 'INS-001',     name: 'ค่าติดตั้ง',                  category: 'Service',    unit: 'งาน',     price: 25000,cost: 15000, description: 'ค่าบริการติดตั้งและทดสอบระบบ' },
    { code: 'GF-SYS',      name: 'Green Facade System',          category: 'Green Wall', unit: 'ตร.ม.',   price: 3500, cost: 2100,  description: 'ระบบปลูกพืชผนังภายนอกอาคารแบบครบชุด' },
    { code: 'MAT-INS',     name: 'วัสดุติดตั้ง',               category: 'Material',   unit: 'ชุด',     price: 15000,cost: 8000,  description: 'วัสดุประกอบการติดตั้งครบชุด' },
  ];
  for (const p of productsData) {
    await prisma.product.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  console.log('✅ Products seeded');

  // ── UNITS ─────────────────────────────────────────────────────────────────
  const unitsData = ['แผ่น', 'ชิ้น', 'ชุด', 'ตร.ม.', 'เมตร', 'งาน', 'ล็อต'];
  for (const name of unitsData) {
    await prisma.unit.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('✅ Units seeded');

  console.log('\n🎉 Seed complete! Default password for all users: 1234\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
