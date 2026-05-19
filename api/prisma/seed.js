const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── USERS ────────────────────────────────────────────────────────────────
  const defaultPass = await bcrypt.hash('Greendii@2025', 10);
  const usersData = [
    // ─── Super Admin (System) ──────────────────────────────────────────────
    { username: 'superadmin',      fullName: 'Super Admin',             initials: 'SU',  role: 'admin',       email: 'admin@greendii.com',        phone: '',           department: 'System',    position: 'Super Administrator',    lineUserId: '',              signatureText: 'Super Admin',           mustChangePassword: true },

    // ─── บริหาร ────────────────────────────────────────────────────────────
    { username: 'sirin.jad',       fullName: 'สิริน จาดเมือง',          initials: 'SJ',  role: 'director',    email: 'sirin@greendii.com',        phone: '0819187138', department: 'บริหาร',    position: 'Managing Director',      lineUserId: '0819187138',    signatureText: 'Sirin Jadmuang',        mustChangePassword: true },
    { username: 'sarayut.yuk',     fullName: 'ศราวุทธ อยู่เกิด',        initials: 'SY',  role: 'project_mgr', email: 'sarayut.yukoet@gmail.com',  phone: '0873538529', department: 'โรงงาน',    position: 'Manager',                lineUserId: 'yut9750',       signatureText: 'Sarayut Yukoet',        mustChangePassword: true },
    { username: 'sindhorn.jad',    fullName: 'สินธร จาดเมือง',          initials: 'SD',  role: 'admin_mgr',   email: 'sindhorn@greendii.com',     phone: '0825588146', department: 'การตลาด',   position: 'Marketing',              lineUserId: 'ice.adisorn',   signatureText: 'Sindhorn Jadmuang',     mustChangePassword: true },

    // ─── ฝ่ายขาย ───────────────────────────────────────────────────────────
    { username: 'natnaleepat.sri', fullName: 'ณัฐรินภัทร ศรีวิเชียร',   initials: 'NS',  role: 'sales',       email: 'natnaleepat@greendii.com',  phone: '0899009415', department: 'ฝ่ายขาย',   position: 'Senior Sales Executive', lineUserId: 'applemichi',    signatureText: 'Natnaleepat Sriwichian',mustChangePassword: true },
    { username: 'harnchai.sri',    fullName: 'หาญชัย ศรีเกษม',          initials: 'HS',  role: 'sale_mgr',    email: 'harnchai@greendii.com',     phone: '0899008935', department: 'ฝ่ายขาย',   position: 'Assistant Manager',      lineUserId: 'mark-greendii', signatureText: 'Harnchai Srikasem',     mustChangePassword: true },
    { username: 'anongporn.yin',   fullName: 'อนงภรณ์ ยิ่งเจริญมาก',   initials: 'AY',  role: 'sales',       email: 'anongporn@greendii.com',    phone: '0899003062', department: 'ฝ่ายขาย',   position: 'Senior Sales Executive', lineUserId: 'aumaim1809',    signatureText: 'Anongporn Yingcharoenmak', mustChangePassword: true },
    { username: 'kullanit.cha',    fullName: 'กุลนิษฐ์ แจ้งทิพย์พันธ์', initials: 'KC',  role: 'sales',       email: 'kullanit@greendii.com',     phone: '0819006685', department: 'ฝ่ายขาย',   position: 'Sales Executive',        lineUserId: 'by-noonjungko', signatureText: 'Kullanit Chaengpipat',  mustChangePassword: true },
    { username: 'wilailuck.kon',   fullName: 'วิไลลักษณ์ คงพลปาน',     initials: 'WK',  role: 'sales',       email: 'wilailuck@greendii.com',    phone: '0899008936', department: 'ฝ่ายขาย',   position: 'Sales Executive',        lineUserId: 'kung232981',    signatureText: 'Wilailuck Kongponpan',  mustChangePassword: true },
    { username: 'siriya.aru',      fullName: 'สิริญา อรุณจิตต์',        initials: 'SAR', role: 'sales',       email: 'siriya@greendii.com',       phone: '0641018875', department: 'ฝ่ายขาย',   position: 'Sales Executive',        lineUserId: 'nutarunjit',    signatureText: 'Siriya Arunjit',        mustChangePassword: true },

    // ─── ธุรการ ─────────────────────────────────────────────────────────────
    { username: 'sudarat.pro',     fullName: 'สุดารัตน์ บัวใหญ่',       initials: 'SB',  role: 'procurement', email: 'sudarat@greendii.com',      phone: '0819007925', department: 'ธุรการ',     position: 'จัดซื้อ',               lineUserId: 'sudarat_gd',    signatureText: 'Sudarat Buayai',        mustChangePassword: true },
    { username: 'weerayut.bua',    fullName: 'วีระยุทธ บัวใหญ่',        initials: 'WB',  role: 'admin_mgr',   email: 'admin2gd@greendii.com',     phone: '0899009275', department: 'ธุรการ',     position: 'การเงิน',               lineUserId: '0908864373',    signatureText: 'Weerayut Buayai',       mustChangePassword: true },
    { username: 'panida.kri',      fullName: 'พนิดา กฤษณเทรัพย์',       initials: 'PK',  role: 'procurement', email: 'admin1gd@greendii.com',     phone: '0899009413', department: 'ธุรการ',     position: 'จัดซื้อ',               lineUserId: 'mam_greendii',  signatureText: 'Panida Kritsanasap',    mustChangePassword: true },

    // ─── โรงงาน ─────────────────────────────────────────────────────────────
    { username: 'preecha.fak',     fullName: 'ปรีชา ฟักสี',             initials: 'PF',  role: 'factory',     email: 'preecha@greendii.com',      phone: '0899003061', department: 'โรงงาน',    position: 'Factory Manager',        lineUserId: '0899003061',    signatureText: 'Preecha Faksee',        mustChangePassword: true },
    { username: 'somporn.kan',     fullName: 'สมพร คล้งกูล',            initials: 'SK',  role: 'factory',     email: 'admin3gd@greendii.com',     phone: '0650795985', department: 'โรงงาน',    position: 'Factory Manager',        lineUserId: '0650795985',    signatureText: 'Somporn Kangkoon',      mustChangePassword: true },
    { username: 'nattaya.kan',     fullName: 'นาตยา กัณฑาทิพย์',        initials: 'NK',  role: 'admin_mgr',   email: 'adminsales@greendii.com',   phone: '0922915063', department: 'โรงงาน',    position: 'Admin Sale',             lineUserId: '0922915063',    signatureText: 'Nattaya Kanyaphan',     mustChangePassword: true },
    { username: 'sukanya.pro',     fullName: 'สุกัญญา พรมสิทธิ์',       initials: 'SP',  role: 'factory',     email: 'sukanya@greendii.com',      phone: '0908864373', department: 'โรงงาน',    position: 'Admin',                  lineUserId: '0908864373',    signatureText: 'Sukanya Promsit',       mustChangePassword: true },
    { username: 'chaiyaporn.sri',  fullName: 'ชัยพร ศรีบัวบาล',         initials: 'CS',  role: 'factory',     email: 'chaiyaporn@greendii.com',   phone: '0961270681', department: 'โรงงาน',    position: 'Factory Manager',        lineUserId: 'mokwankc',      signatureText: 'Chaiyaporn Sribuabal',  mustChangePassword: true },
    { username: 'pimchanok.sud',   fullName: 'พิมพ์ชนก สุดรมย์',        initials: 'PS',  role: 'factory',     email: 'salesco@gng19.com',         phone: '0987425995', department: 'โรงงาน',    position: 'Admin',                  lineUserId: 'smile59959',    signatureText: 'Pimchanok Sudrum',      mustChangePassword: true },
  ];

  for (const u of usersData) {
    const { mustChangePassword, ...updateFields } = u;
    await prisma.user.upsert({
      where:  { username: u.username },
      update: updateFields,            // อัพเดตข้อมูลถ้า user มีอยู่แล้ว (ยกเว้น password)
      create: { ...u, passwordHash: defaultPass },
    });
  }
  console.log('✅ Users seeded (19 users, default password: Greendii@2025)');

  // ── CUSTOMERS ────────────────────────────────────────────────────────────
  const customersData = [
    { name: 'บริษัท ABC จำกัด',         contactPerson: 'คุณมานี',       tel: '02-123-4567', email: 'info@abc.com',           address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',   taxId: '0105123456789' },
    { name: 'บริษัท XYZ จำกัด',         contactPerson: 'คุณสมพร',       tel: '02-987-6543', email: 'contact@xyz.co.th',      address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',   taxId: '0105987654321' },
    { name: 'โรงแรม สยามรีสอร์ท',       contactPerson: 'คุณวิไล',       tel: '053-111-222', email: 'booking@siamresort.com', address: '789 ถ.ราชดำเนิน เชียงใหม่ 50200', taxId: '0105555666777' },
    { name: 'บริษัท กรีนเทค จำกัด',     contactPerson: 'คุณสมชาย',     tel: '02-555-8888', email: 'info@greentech.co.th',   address: '321 ถ.พระราม 4 กรุงเทพฯ 10500',   taxId: '0105444555666' },
    { name: 'บริษัท สมาร์ทบิลด์ จำกัด', contactPerson: 'คุณประเสริฐ',  tel: '02-777-9999', email: 'contact@smartbuild.co.th',address: '999 ถ.เพชรบุรี กรุงเทพฯ 10310',  taxId: '0105888999000' },
  ];
  await prisma.customer.createMany({ data: customersData, skipDuplicates: true });
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
