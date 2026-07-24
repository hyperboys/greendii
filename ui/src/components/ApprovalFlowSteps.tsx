'use client'

import type { ApprovalLog, DocStatus } from '@/types'
import { formatBangkokDateTime } from '@/lib/timezone'

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
  showStageComments?: boolean
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

function getActionBadge(action?: ApprovalLog['action']) {
  if (action === 'approve') {
    return { label: 'อนุมัติ', cls: 'bg-green-pale text-green-dark border-green-main/40' }
  }
  if (action === 'reject') {
    return { label: 'ปฏิเสธ', cls: 'bg-red-50 text-red-700 border-red-300' }
  }
  return { label: 'ดำเนินการ', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
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
  showStageComments = false,
}: Props) {
  const cycleLogs = getLatestCycleLogs(approvalLogs)
  const stepLogs = buildStepLatestLogMap(cycleLogs)
  const stages = normalizeStages(steps)
  const stageCommentRows = stages
    .map((stage) => {
      const log = pickStageLatestLog(stage, stepLogs)
      const comment = (log?.comment ?? '').trim()
      if (!comment) return null

      const labels = stage.map(step => {
        const roleKey = stepRoleConfig[String(step)]
        return roleKey ? getRoleLabel(roleKey) : `Step ${step}`
      })

      return {
        key: stage.join('-'),
        stageLabel: labels.join(' / '),
        comment,
        actedAt: formatBangkokDateTime(log?.actedAt, 'th-TH'),
        approverName: log?.approver?.fullName ?? '',
        action: log?.action,
      }
    })
    .filter((row): row is {
      key: string
      stageLabel: string
      comment: string
      actedAt: string
      approverName: string
      action?: ApprovalLog['action']
    } => !!row)

  // Find latest submit log for creator timestamp
  const latestSubmitLog = cycleLogs.find(log => log.action === 'submit')
  const creatorActedAt = formatBangkokDateTime(latestSubmitLog?.actedAt, 'th-TH')

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
            {creatorActedAt && <span className="mt-0.5 text-[10px] text-gray-500">{creatorActedAt}</span>}
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
          const actedAt = formatBangkokDateTime(log?.actedAt, 'th-TH')

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
              {actedAt && <span className="mt-0.5 text-[10px] text-gray-500">{actedAt}</span>}
            </div>
          )
        })}
      </div>
      {showStageComments && stageCommentRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold text-gray-700">ความคิดเห็นแต่ละขั้น</div>
          <div className="space-y-2">
            {stageCommentRows.map((row) => {
              const badge = getActionBadge(row.action)
              return (
                <div key={row.key} className="rounded-md border border-gray-200 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-800">{row.stageLabel}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="mt-1.5 whitespace-pre-line break-words text-xs text-gray-800">{row.comment}</div>
                  {(row.approverName || row.actedAt) && (
                    <div className="mt-1.5 text-[10px] text-gray-500">
                      {row.approverName || '—'}{row.actedAt ? ` · ${row.actedAt}` : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}