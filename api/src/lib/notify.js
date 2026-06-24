const prisma = require('./prisma');
const nodemailer = require('nodemailer');
const { STEP_ROLE, getStepRoleMapping } = require('./approvalFlow');
const { expandRoleAliases } = require('./roleAliases');

// ─── LINE Messaging API ─────────────────────────────────────────────────────
// Requires env: LINE_CHANNEL_ACCESS_TOKEN
// User field:   lineUserId  (LINE User ID obtained when user adds the bot)

async function sendLine(lineUserId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineUserId) return;
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[LINE] Send failed to ${lineUserId}: HTTP ${res.status} — ${body}`);
    }
  } catch (err) {
    console.warn(`[LINE] Error:`, err.message);
  }
}

// ─── Email (SMTP via nodemailer) ────────────────────────────────────────────
// Requires env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional env: SMTP_SECURE (true = TLS/465, false = STARTTLS/587), SMTP_FROM
// User field:   email

let _transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t || !to) return;
  try {
    await t.sendMail({
      from: `"GreenDii" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#1a5c2d;padding:18px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">GreenDii</h2>
            <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px">ระบบจัดการงานขายและโครงการ</p>
          </div>
          <div style="padding:24px;background:#fff">
            <p style="font-size:15px;color:#1f2937;line-height:1.6;margin:0">${text}</p>
          </div>
          <div style="padding:12px 24px;background:#f3f4f6;font-size:12px;color:#9ca3af">
            นี่คือข้อความแจ้งเตือนอัตโนมัติจากระบบ GreenDii — กรุณาอย่าตอบกลับอีเมลนี้
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.warn(`[EMAIL] Send failed to ${to}:`, err.message);
  }
}

// ─── Core notification helpers ───────────────────────────────────────────────

// Notify a specific user by DB id (in-app + LINE + email)
async function notifyUser(userId, text) {
  await prisma.notification.create({ data: { userId, text } });

  // Fire-and-forget external channels — never block the main flow
  prisma.user.findUnique({
    where: { id: userId },
    select: { lineUserId: true, email: true },
  }).then(user => {
    if (!user) return;
    sendLine(user.lineUserId, text);
    sendEmail(user.email, 'GreenDii แจ้งเตือน', text);
  }).catch(() => {});
}

// Notify all active users of a given role (in-app + LINE + email)
// options.excludeUserId: skip a specific actor (e.g. submitter) from recipients
async function notifyByRole(role, text, options = {}) {
  const { excludeUserId } = options;
  const candidateRoles = expandRoleAliases(role);
  const users = await prisma.user.findMany({
    where: {
      role: { in: candidateRoles },
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, lineUserId: true, email: true },
  });
  if (!users.length) return;

  await prisma.notification.createMany({
    data: users.map(u => ({ userId: u.id, text })),
  });

  // Fire-and-forget external channels for each user
  for (const u of users) {
    sendLine(u.lineUserId, text);
    sendEmail(u.email, 'GreenDii แจ้งเตือน', text);
  }
}

// Notify approvers for a specific approval step
async function notifyStep(step, text, options = {}) {
  const { stepRole } = await getStepRoleMapping();
  const role = stepRole[step];
  if (!role) return;
  await notifyByRole(role, text, options);
}

module.exports = { notifyByRole, notifyUser, notifyStep, sendLine, sendEmail };
