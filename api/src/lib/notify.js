const prisma = require('./prisma');

const STEP_ROLE = {
  1: 'sales', 2: 'sales2', 3: 'sale_mgr', 4: 'admin_mgr',
  5: 'project_mgr', 6: 'director', 7: 'procurement', 8: 'factory',
};

// Notify all active users that match a given role
async function notifyByRole(role, text) {
  const users = await prisma.user.findMany({
    where: { role, isActive: true },
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

// Notify the approver(s) for a given approval step (standard 8-step flow)
async function notifyStep(step, text) {
  const role = STEP_ROLE[step];
  if (!role) return;
  await notifyByRole(role, text);
}

module.exports = { notifyByRole, notifyUser, notifyStep };
