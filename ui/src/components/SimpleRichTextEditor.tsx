'use client'

import { useEffect, useRef } from 'react'
import { Bold, Italic, Link2, List } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
}

export default function SimpleRichTextEditor({ value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '<p></p>'
    }
  }, [value])

  const exec = (command: 'bold' | 'italic' | 'insertUnorderedList' | 'createLink') => {
    if (!editorRef.current) return
    editorRef.current.focus()
    if (command === 'createLink') {
      const link = window.prompt('ใส่ลิงก์ (https://...)')
      if (!link) return
      document.execCommand('createLink', false, link)
      onChange(editorRef.current.innerHTML)
      return
    }
    document.execCommand(command, false)
    onChange(editorRef.current.innerHTML)
  }

  return (
    <div className="rounded-lg border border-gray-300 bg-white overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <button type="button" className="p-1.5 rounded hover:bg-gray-200" onClick={() => exec('bold')} title="Bold">
          <Bold size={14} />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-200" onClick={() => exec('italic')} title="Italic">
          <Italic size={14} />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-200" onClick={() => exec('createLink')} title="Link">
          <Link2 size={14} />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-200" onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <List size={14} />
        </button>
      </div>
      <div
        ref={editorRef}
        className="min-h-[180px] p-3 text-sm prose prose-sm max-w-none focus:outline-none"
        contentEditable
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        suppressContentEditableWarning
      />
    </div>
  )
}
