/**
 * Script: update-user-names.js
 * อัพเดต firstName, lastName, firstNameEn, lastNameEn ให้ทุก user
 * Run: node scripts/update-user-names.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const userData = [
  { username: 'sirin.jad',       firstName: 'สิริน',       lastName: 'จาดเมือง',      firstNameEn: 'Sirin',      lastNameEn: 'Jadmuang',        fullName: 'สิริน จาดเมือง' },
  { username: 'sarayut.yuk',     firstName: 'ศรายุทธ',     lastName: 'อยู่เกิด',       firstNameEn: 'Sarayut',    lastNameEn: 'Yukoet',          fullName: 'ศรายุทธ อยู่เกิด' },
  { username: 'sindhorn.jad',    firstName: 'สินธร',       lastName: 'จาดเมือง',      firstNameEn: 'Sindhorn',   lastNameEn: 'Jadmuang',        fullName: 'สินธร จาดเมือง' },
  { username: 'natnaleepat.sri', firstName: 'ณัฐนรีภัทร',  lastName: 'ศรีวิเชียร',    firstNameEn: 'Natnaleepat',lastNameEn: 'Sriwichian',      fullName: 'ณัฐนรีภัทร ศรีวิเชียร' },
  { username: 'harnchai.sri',    firstName: 'หาญชัย',      lastName: 'ศรีเกษม',       firstNameEn: 'Harnchai',   lastNameEn: 'Srikasem',        fullName: 'หาญชัย ศรีเกษม' },
  { username: 'anongporn.yin',   firstName: 'อนงภรณ์',    lastName: 'ยิ่งเจริญมาก',  firstNameEn: 'Anongporn',  lastNameEn: 'Yingcharoenmak',  fullName: 'อนงภรณ์ ยิ่งเจริญมาก' },
  { username: 'kullanit.cha',    firstName: 'กุลนิษฐ์',   lastName: 'แจ้งพิพัฒน์',   firstNameEn: 'Kullanit',   lastNameEn: 'Chaengpipat',     fullName: 'กุลนิษฐ์ แจ้งพิพัฒน์' },
  { username: 'wilailuck.kon',   firstName: 'วิไลลักษณ์', lastName: 'คงพลปาน',       firstNameEn: 'Wilailuck',  lastNameEn: 'Kongpholpan',     fullName: 'วิไลลักษณ์ คงพลปาน' },
  { username: 'siriya.aru',      firstName: 'สิริญา',      lastName: 'อรุณจิตต์',     firstNameEn: 'Siriya',     lastNameEn: 'Arunjit',         fullName: 'สิริญา อรุณจิตต์' },
  { username: 'sudarat.pro',     firstName: 'สุดารัตน์',  lastName: 'พรมสิทธิ์',     firstNameEn: 'Sudarat',    lastNameEn: 'Promsit',         fullName: 'สุดารัตน์ พรมสิทธิ์',  email: 'sudaratp@greendii.com' },
  { username: 'weerayut.bua',    firstName: 'วีระยุทธ',   lastName: 'บัวใหญ่',       firstNameEn: 'Weerayut',   lastNameEn: 'Buayai',          fullName: 'วีระยุทธ บัวใหญ่' },
  { username: 'panida.kri',      firstName: 'พนิดา',       lastName: 'กฤษณะทรัพย์',  firstNameEn: 'Panida',     lastNameEn: 'Kritsanasap',     fullName: 'พนิดา กฤษณะทรัพย์' },
  { username: 'preecha.fak',     firstName: 'ปรีชา',       lastName: 'ฟักสี',         firstNameEn: 'Preecha',    lastNameEn: 'Faksee',          fullName: 'ปรีชา ฟักสี' },
  { username: 'somporn.kan',     firstName: 'สมพร',        lastName: 'คลังกูล',       firstNameEn: 'Somporn',    lastNameEn: 'Kangkoon',        fullName: 'สมพร คลังกูล' },
  { username: 'nattaya.kan',     firstName: 'นาตยา',       lastName: 'กัญญาพันธ์',   firstNameEn: 'Nattaya',    lastNameEn: 'Kanyaphan',       fullName: 'นาตยา กัญญาพันธ์',     department: 'Admin sale' },
  { username: 'sukanya.pro',     firstName: 'สุกัญญา',    lastName: 'พรมสิทธิ์',     firstNameEn: 'Sukanya',    lastNameEn: 'Promsit',         fullName: 'สุกัญญา พรมสิทธิ์' },
  { username: 'chaiyaporn.sri',  firstName: 'ชัยพร',       lastName: 'ศรีบัวบาล',    firstNameEn: 'Chaiyaporn', lastNameEn: 'Sribuabal',       fullName: 'ชัยพร ศรีบัวบาล' },
  { username: 'pimchanok.sud',   firstName: 'พิมพ์ชนก',  lastName: 'สุดรัมย์',      firstNameEn: 'Pimchanok',  lastNameEn: 'Sudrum',          fullName: 'พิมพ์ชนก สุดรัมย์' },
]

async function main() {
  console.log('🔄 Updating user name fields...\n')

  let updated = 0
  let notFound = 0

  for (const u of userData) {
    const { username, email, department, ...nameFields } = u

    // Build update object — only include fields that are provided
    const updateData = { ...nameFields }
    if (email)      updateData.email      = email
    if (department) updateData.department = department

    const result = await prisma.user.updateMany({
      where: { username },
      data:  updateData,
    })

    if (result.count > 0) {
      console.log(`  ✅ ${username} → ${nameFields.fullName}`)
      updated++
    } else {
      console.log(`  ⚠️  ${username} — ไม่พบ user นี้ในฐานข้อมูล`)
      notFound++
    }
  }

  console.log(`\n✅ Done: อัพเดตสำเร็จ ${updated} คน, ไม่พบ ${notFound} คน`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
