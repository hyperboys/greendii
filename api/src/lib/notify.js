const prisma = require('./prisma');
const { STEP_ROLE } = require('./approvalFlow');

// Notify all active users that match a given role
async function notifyByRole(role, text) {
  const users = await prisma.user.findMany({
    where: { role, active: true },   // fixed: 'active' not 'isActive'
    select: { id: true },
  });
  if (!users.length) return;
  await prisma.notification.createMany({
    data: users.map(u => ({ userId: u.id, text })),
  });
}

// Notify a specific user by id
async function notifyUser(userId, text) {
  await prisma.notification.create({ data: { userId, text } });
}

// Notify the approver(s) for a given approval step
async function notifyStep(step, text) {
  const role = STEP_ROLE[step];
  if (!role) return;
  await notifyByRole(role, text);
}

module.exports = { notifyByRole, notifyUser, notifyStep };
