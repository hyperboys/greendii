/**
 * Script: update-user-names.js
 * อัพเดต firstName, lastName, firstNameEn, lastNameEn ให้ทุก user
 * หากไม่พบ user จะสร้างใหม่ด้วย default password = Greendii@2025
 * Run: node scripts/update-user-names.js
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

const userData = [
  { username: 'sirin.jad',       firstName: 'สิริน',       lastName: 'จาดเมือง',      firstNameEn: 'Sirin',      lastNameEn: 'Jadmuang',        fullName: 'สิริน จาดเมือง',          initials: 'SJ',  role: 'director',    email: 'sirin@greendii.com',        phone: '0819187138', department: 'บริหาร',     position: 'Managing Director',      lineUserId: '0819187138' },
  { username: 'sarayut.yuk',     firstName: 'ศรายุทธ',     lastName: 'อยู่เกิด',       firstNameEn: 'Sarayut',    lastNameEn: 'Yukoet',          fullName: 'ศรายุทธ อยู่เกิด',         initials: 'SY',  role: 'project_mgr', email: 'sarayut.yukoet@gmail.com',  phone: '0873538529', department: 'โรงงาน',     position: 'Manager',                lineUserId: 'yut9750' },
  { username: 'sindhorn.jad',    firstName: 'สินธร',       lastName: 'จาดเมือง',      firstNameEn: 'Sindhorn',   lastNameEn: 'Jadmuang',        fullName: 'สินธร จาดเมือง',          initials: 'SD',  role: 'admin_mgr',   email: 'sindhorn@greendii.com',     phone: '0825588146', department: 'การตลาด',    position: 'Marketing',              lineUserId: 'ice.adisorn' },
  { username: 'natnaleepat.sri', firstName: 'ณัฐนรีภัทร',  lastName: 'ศรีวิเชียร',    firstNameEn: 'Natnaleepat',lastNameEn: 'Sriwichian',      fullName: 'ณัฐนรีภัทร ศรีวิเชียร',   initials: 'NS',  role: 'sales',       email: 'natnaleepat@greendii.com',  phone: '0899009415', department: 'ฝ่ายขาย',    position: 'Senior Sales Executive', lineUserId: 'applemichi' },
  { username: 'harnchai.sri',    firstName: 'หาญชัย',      lastName: 'ศรีเกษม',       firstNameEn: 'Harnchai',   lastNameEn: 'Srikasem',        fullName: 'หาญชัย ศรีเกษม',          initials: 'HS',  role: 'sale_mgr',    email: 'harnchai@greendii.com',     phone: '0899008935', department: 'ฝ่ายขาย',    position: 'Assistant Manager',      lineUserId: 'mark-greendii' },
  { username: 'anongporn.yin',   firstName: 'อนงภรณ์',    lastName: 'ยิ่งเจริญมาก',  firstNameEn: 'Anongporn',  lastNameEn: 'Yingcharoenmak',  fullName: 'อนงภรณ์ ยิ่งเจริญมาก',   initials: 'AY',  role: 'sales',       email: 'anongporn@greendii.com',    phone: '0899003062', department: 'ฝ่ายขาย',    position: 'Senior Sales Executive', lineUserId: 'aumaim1809' },
  { username: 'kullanit.cha',    firstName: 'กุลนิษฐ์',   lastName: 'แจ้งพิพัฒน์',   firstNameEn: 'Kullanit',   lastNameEn: 'Chaengpipat',     fullName: 'กุลนิษฐ์ แจ้งพิพัฒน์',  initials: 'KC',  role: 'sales',       email: 'kullanit@greendii.com',     phone: '0819006685', department: 'ฝ่ายขาย',    position: 'Sales Executive',        lineUserId: 'by-noonjungko' },
  { username: 'wilailuck.kon',   firstName: 'วิไลลักษณ์', lastName: 'คงพลปาน',       firstNameEn: 'Wilailuck',  lastNameEn: 'Kongpholpan',     fullName: 'วิไลลักษณ์ คงพลปาน',     initials: 'WK',  role: 'sales',       email: 'wilailuck@greendii.com',    phone: '0899008936', department: 'ฝ่ายขาย',    position: 'Sales Executive',        lineUserId: 'kung232981' },
  { username: 'siriya.aru',      firstName: 'สิริญา',      lastName: 'อรุณจิตต์',     firstNameEn: 'Siriya',     lastNameEn: 'Arunjit',         fullName: 'สิริญา อรุณจิตต์',        initials: 'SAR', role: 'sales',       email: 'siriya@greendii.com',       phone: '0641018875', department: 'ฝ่ายขาย',    position: 'Sales Executive',        lineUserId: 'nutarunjit' },
  { username: 'sudarat.pro',     firstName: 'สุดารัตน์',  lastName: 'พรมสิทธิ์',     firstNameEn: 'Sudarat',    lastNameEn: 'Promsit',         fullName: 'สุดารัตน์ พรมสิทธิ์',    initials: 'SB',  role: 'procurement', email: 'sudaratp@greendii.com',     phone: '0819007925', department: 'ธุรการ',      position: 'จัดซื้อ',               lineUserId: 'sudarat_gd' },
  { username: 'weerayut.bua',    firstName: 'วีระยุทธ',   lastName: 'บัวใหญ่',       firstNameEn: 'Weerayut',   lastNameEn: 'Buayai',          fullName: 'วีระยุทธ บัวใหญ่',        initials: 'WB',  role: 'admin_mgr',   email: 'admin2gd@greendii.com',     phone: '0899009275', department: 'ธุรการ',      position: 'การเงิน',               lineUserId: '0908864373' },
  { username: 'panida.kri',      firstName: 'พนิดา',       lastName: 'กฤษณะทรัพย์',  firstNameEn: 'Panida',     lastNameEn: 'Kritsanasap',     fullName: 'พนิดา กฤษณะทรัพย์',      initials: 'PK',  role: 'procurement', email: 'admin1gd@greendii.com',     phone: '0899009413', department: 'ธุรการ',      position: 'จัดซื้อ',               lineUserId: 'mam_greendii' },
  { username: 'preecha.fak',     firstName: 'ปรีชา',       lastName: 'ฟักสี',         firstNameEn: 'Preecha',    lastNameEn: 'Faksee',          fullName: 'ปรีชา ฟักสี',             initials: 'PF',  role: 'factory',     email: 'preecha@greendii.com',      phone: '0899003061', department: 'โรงงาน',     position: 'Factory Manager',        lineUserId: '0899003061' },
  { username: 'somporn.kan',     firstName: 'สมพร',        lastName: 'คลังกูล',       firstNameEn: 'Somporn',    lastNameEn: 'Kangkoon',        fullName: 'สมพร คลังกูล',            initials: 'SK',  role: 'factory',     email: 'admin3gd@greendii.com',     phone: '0650795985', department: 'โรงงาน',     position: 'Factory Manager',        lineUserId: '0650795985' },
  { username: 'nattaya.kan',     firstName: 'นาตยา',       lastName: 'กัญญาพันธ์',   firstNameEn: 'Nattaya',    lastNameEn: 'Kanyaphan',       fullName: 'นาตยา กัญญาพันธ์',       initials: 'NK',  role: 'admin_mgr',   email: 'adminsales@greendii.com',   phone: '0922915063', department: 'Admin sale',  position: 'Admin sale',             lineUserId: '0922915063' },
  { username: 'sukanya.pro',     firstName: 'สุกัญญา',    lastName: 'พรมสิทธิ์',     firstNameEn: 'Sukanya',    lastNameEn: 'Promsit',         fullName: 'สุกัญญา พรมสิทธิ์',      initials: 'SP',  role: 'factory',     email: 'sukanya@greendii.com',      phone: '0908864373', department: 'โรงงาน',     position: 'Admin',                  lineUserId: '0908864373' },
  { username: 'chaiyaporn.sri',  firstName: 'ชัยพร',       lastName: 'ศรีบัวบาล',    firstNameEn: 'Chaiyaporn', lastNameEn: 'Sribuabal',       fullName: 'ชัยพร ศรีบัวบาล',         initials: 'CS',  role: 'factory',     email: 'chaiyaporn@greendii.com',   phone: '0961270681', department: 'โรงงาน',     position: 'Factory Manager',        lineUserId: 'mokwankc' },
  { username: 'pimchanok.sud',   firstName: 'พิมพ์ชนก',  lastName: 'สุดรัมย์',      firstNameEn: 'Pimchanok',  lastNameEn: 'Sudrum',          fullName: 'พิมพ์ชนก สุดรัมย์',      initials: 'PS',  role: 'factory',     email: 'salesco@gng19.com',         phone: '0987425995', department: 'โรงงาน',     position: 'Admin',                  lineUserId: 'smile59959' },
]

async function main() {
  console.log('🔄 Updating / creating users...\n')
  const defaultPass = await bcrypt.hash('Greendii@2025', 10)

  let updated = 0
  let created = 0

  for (const u of userData) {
    const { username, ...fields } = u

    const result = await prisma.user.upsert({
      where:  { username },
      update: fields,
      create: {
        username,
        passwordHash: defaultPass,
        mustChangePassword: true,
        ...fields,
      },
    })

    const isNew = result.createdAt.getTime() === result.updatedAt.getTime()
    if (isNew) {
      console.log(`  ➕ สร้างใหม่: ${username} → ${fields.fullName}`)
      created++
    } else {
      console.log(`  ✅ อัพเดต:   ${username} → ${fields.fullName}`)
      updated++
    }
  }

  console.log(`\n✅ Done: อัพเดต ${updated} คน, สร้างใหม่ ${created} คน`)
  console.log('   Default password: Greendii@2025')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
