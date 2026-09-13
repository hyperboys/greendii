/**
 * policy.ts — Frontend Authorization Policy Helper
 */

import { AuthUser } from './auth';

const DOC_MANAGERS = ['admin', 'sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];

export function canManageAllDocs(user?: AuthUser | null): boolean {
  if (!user?.role) return false;
  return DOC_MANAGERS.includes(user.role.toLowerCase());
}

export function canEditDocument(user: AuthUser | null, docOwnerId?: string | null, status?: string | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const currentStatus = (status || 'draft').toLowerCase();
  const isEditableState = ['draft', 'rejected', 'returned'].includes(currentStatus);
  const isOwner = docOwnerId ? String(user.id) === String(docOwnerId) : true;

  return isEditableState && (isOwner || canManageAllDocs(user));
}

export function canApproveDocument(user: AuthUser | null, currentStepRole?: string | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!currentStepRole) return canManageAllDocs(user);
  return user.role.toLowerCase() === currentStepRole.toLowerCase();
}
