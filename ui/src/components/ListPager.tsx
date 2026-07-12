'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ListPagerProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function ListPager({ page, totalPages, onPageChange }: ListPagerProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 p-3 border-t bg-gray-50">
      <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={14} />
      </button>
      <span className="text-sm text-gray-600">หน้า {page} / {totalPages}</span>
      <button className="btn-outline btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        <ChevronRight size={14} />
      </button>
    </div>
  )
}