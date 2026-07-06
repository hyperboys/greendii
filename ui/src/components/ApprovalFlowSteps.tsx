'use client'

import type { ApprovalLog, DocStatus } from '@/types'

type StageInput = number | number[]

type Props = {
  title: string
  steps: StageInput[]
  currentStep: number
  status: DocStatus
  approvalLogs?: ApprovalLog[]
  stepRoleConfig: Record<string, string>
  getRoleLabel: (roleKey: string) => string
  creatorName?: string
  showSubmitState?: boolean
}

function getLatestCycleLogs(approvalLogs?: ApprovalLog[]) {
  const historyLogs = [...(approvalLogs ?? [])].sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())
  const latestSubmitAt = [...historyLogs].reverse().find(log => log.action === 'submit')?.actedAt
  return latestSubmitAt
    ? historyLogs.filter(log => new Date(log.actedAt).getTime() >= new Date(latestSubmitAt).getTime())
    : historyLogs
}

function actionRank(action: ApprovalLog['action']): number {
  if (action === 'approve') return 3
  if (action === 'reject') return 2
  return 1
}

function buildStepLatestLogMap(cycleLogs: ApprovalLog[]) {
  const stepLogs = new Map<number, ApprovalLog>()

  for (const log of cycleLogs) {
    if (log.action === 'submit') continue

    const prev = stepLogs.get(log.step)
    if (!prev) {
      stepLogs.set(log.step, log)
      continue
    }

    const prevTime = new Date(prev.actedAt).getTime()
    const nextTime = new Date(log.actedAt).getTime()

    if (nextTime > prevTime) {
      stepLogs.set(log.step, log)
      continue
    }

    if (nextTime === prevTime && actionRank(log.action) >= actionRank(prev.action)) {
      stepLogs.set(log.step, log)
    }
  }

  return stepLogs
}

function normalizeStages(steps: StageInput[]) {
  if (!Array.isArray(steps)) return [] as number[][]

  return steps
    .map((entry) => {
      if (Array.isArray(entry)) {
        const stage = entry
          .map(n => Number(n))
          .filter(n => Number.isInteger(n) && n > 0)
        return Array.from(new Set(stage))
      }

      const step = Number(entry)
      if (!Number.isInteger(step) || step <= 0) return []
      return [step]
    })
    .filter(stage => stage.length > 0)
}

function pickStageLatestLog(stage: number[], stepLogs: Map<number, ApprovalLog>) {
  const logs = stage
    .map(step => stepLogs.get(step))
    .filter((log): log is ApprovalLog => !!log)

  if (logs.length === 0) return undefined

  return logs.sort((a, b) => {
    const aTime = new Date(a.actedAt).getTime()
    const bTime = new Date(b.actedAt).getTime()
    if (aTime !== bTime) return bTime - aTime
    return actionRank(b.action) - actionRank(a.action)
  })[0]
}

export default function ApprovalFlowSteps({
  title,
  steps,
  currentStep,
  status,
  approvalLogs,
  stepRoleConfig,
  getRoleLabel,
  creatorName,
  showSubmitState = false,
}: Props) {
  const cycleLogs = getLatestCycleLogs(approvalLogs)
  const stepLogs = buildStepLatestLogMap(cycleLogs)
  const stages = normalizeStages(steps)

  if (stages.length === 0) return null

  return (
    <div className="card p-5 no-print">
      <h3 className="font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {creatorName && (
          <div className="flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[88px] bg-green-pale border-green-main text-green-dark">
            <span className="font-semibold">ผู้สร้าง</span>
            <span className="mt-1 min-h-[14px]">✓</span>
            <span className="mt-0.5 text-[11px] text-gray-600">{creatorName}</span>
          </div>
        )}
        {stages.map((stage) => {
          const labels = stage.map(step => {
            const roleKey = stepRoleConfig[String(step)]
            return roleKey ? getRoleLabel(roleKey) : `Step ${step}`
          })
          const label = labels.join(' / ')
          const log = pickStageLatestLog(stage, stepLogs)
          const isCurrent = status === 'pending' && stage.includes(currentStep)
          const isApproved = log?.action === 'approve'
          const isRejected = log?.action === 'reject'
          const isSubmitted = log?.action === 'submit'
          const displayName = log?.approver?.fullName ?? ''

          return (
            <div
              key={stage.join('-')}
              className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[88px] ${
                isApproved
                  ? 'bg-green-pale border-green-main text-green-dark'
                  : isRejected
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : showSubmitState && isSubmitted
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : isCurrent
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              <span className="font-semibold">{label}</span>
              <span className="mt-1 min-h-[14px]">
                {isApproved ? '✓' : isRejected ? '✕' : showSubmitState && isSubmitted ? 'ส่งอนุมัติ' : isCurrent ? 'รออนุมัติ' : ''}
              </span>
              {displayName && <span className="mt-0.5 text-[11px] text-gray-600">{displayName}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}