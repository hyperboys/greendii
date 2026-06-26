'use client'

import type { ApprovalLog, DocStatus } from '@/types'

type Props = {
  title: string
  steps: number[]
  currentStep: number
  status: DocStatus
  approvalLogs?: ApprovalLog[]
  stepRoleConfig: Record<string, string>
  getRoleLabel: (roleKey: string) => string
}

function getLatestCycleLogs(approvalLogs?: ApprovalLog[]) {
  const historyLogs = [...(approvalLogs ?? [])].sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())
  const latestSubmitAt = [...historyLogs].reverse().find(log => log.action === 'submit')?.actedAt
  return latestSubmitAt
    ? historyLogs.filter(log => new Date(log.actedAt).getTime() >= new Date(latestSubmitAt).getTime())
    : historyLogs
}

export default function ApprovalFlowSteps({
  title,
  steps,
  currentStep,
  status,
  approvalLogs,
  stepRoleConfig,
  getRoleLabel,
}: Props) {
  const cycleLogs = getLatestCycleLogs(approvalLogs)
  const stepLogs = new Map<number, ApprovalLog>()

  for (const log of cycleLogs) {
    if (log.action === 'submit') continue
    stepLogs.set(log.step, log)
  }

  if (steps.length === 0) return null

  return (
    <div className="card p-5 no-print">
      <h3 className="font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {steps.map(step => {
          const roleKey = stepRoleConfig[String(step)]
          const label = roleKey ? getRoleLabel(roleKey) : `Step ${step}`
          const log = stepLogs.get(step)
          const isCurrent = status === 'pending' && currentStep === step
          const displayName = log?.approver?.fullName ?? ''

          return (
            <div
              key={step}
              className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[88px] ${
                log?.action === 'approve'
                  ? 'bg-green-pale border-green-main text-green-dark'
                  : log?.action === 'reject'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : isCurrent
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              <span className="font-semibold">{label}</span>
              <span className="mt-1 min-h-[14px]">
                {log?.action === 'approve' ? '✓' : log?.action === 'reject' ? '✕' : isCurrent ? 'รออนุมัติ' : ''}
              </span>
              {displayName && <span className="mt-0.5 text-[11px] text-gray-600">{displayName}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}