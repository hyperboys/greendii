const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { sendLine } = require('../lib/notify');

// ─── Signature verification ──────────────────────────────────────────────────
function verifyLineSignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

// ─── Welcome message ─────────────────────────────────────────────────────────
const WELCOME_MSG =
  '👋 สวัสดีครับ! ยินดีต้อนรับสู่ระบบ GreenDii\n\n' +
  'เพื่อรับการแจ้งเตือนจากระบบ กรุณาพิมพ์ Username ของคุณ\n' +
  '(username ที่ใช้ login เข้าระบบ GreenDii)\n\n' +
  'ตัวอย่าง: natnaleepat.sri';

// ─── POST /api/line/webhook ──────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Verify LINE signature using raw body saved by express.json verify callback
  const signature = req.headers['x-line-signature'];
  const rawBody = req.rawBody;

  if (!rawBody || !verifyLineSignature(rawBody, signature)) {
    return res.status(401).json({ message: 'Invalid LINE signature' });
  }

  // Respond 200 immediately — LINE requires fast response
  res.sendStatus(200);

  const events = req.body?.events ?? [];

  for (const event of events) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    try {
      // ── User adds the bot ────────────────────────────────────────────────
      if (event.type === 'follow') {
        // Check if already linked
        const existing = await prisma.user.findFirst({
          where: { lineUserId },
          select: { fullName: true },
        });
        if (existing) {
          await sendLine(lineUserId,
            `✅ บัญชี LINE ของคุณผูกกับ ${existing.fullName} อยู่แล้ว\n` +
            `คุณจะได้รับแจ้งเตือนจากระบบ GreenDii ทาง LINE นี้`
          );
        } else {
          await sendLine(lineUserId, WELCOME_MSG);
        }
      }

      // ── User sends a text message ────────────────────────────────────────
      if (event.type === 'message' && event.message?.type === 'text') {
        const username = event.message.text.trim().toLowerCase();

        // Already linked? — just confirm
        const alreadyOwner = await prisma.user.findFirst({
          where: { lineUserId },
          select: { fullName: true },
        });
        if (alreadyOwner) {
          await sendLine(lineUserId,
            `✅ บัญชีของคุณ (${alreadyOwner.fullName}) ผูกกับ LINE นี้อยู่แล้วครับ`
          );
          continue;
        }

        // Look up by username
        const user = await prisma.user.findUnique({
          where: { username },
          select: { id: true, fullName: true, lineUserId: true, active: true },
        });

        if (!user) {
          await sendLine(lineUserId,
            `❌ ไม่พบ username "${username}" ในระบบ\n` +
            `กรุณาตรวจสอบ username แล้วลองใหม่ครับ`
          );
          continue;
        }

        if (!user.active) {
          await sendLine(lineUserId,
            `❌ บัญชี "${username}" ถูกระงับการใช้งาน\nติดต่อผู้ดูแลระบบครับ`
          );
          continue;
        }

        if (user.lineUserId && user.lineUserId !== lineUserId) {
          await sendLine(lineUserId,
            `⚠️ บัญชี "${username}" ผูกกับ LINE อื่นไว้แล้ว\n` +
            `ติดต่อผู้ดูแลระบบเพื่อแก้ไขครับ`
          );
          continue;
        }

        // Link LINE userId to user
        await prisma.user.update({
          where: { id: user.id },
          data: { lineUserId },
        });

        await sendLine(lineUserId,
          `✅ ผูกบัญชีสำเร็จ!\n` +
          `ชื่อ: ${user.fullName}\n\n` +
          `ต่อไปนี้คุณจะได้รับแจ้งเตือนจากระบบ GreenDii ทาง LINE นี้ครับ 🎉`
        );
      }
    } catch (err) {
      console.error('[LINE webhook] Error processing event:', err.message);
    }
  }
});

module.exports = router;
