'use client'

import { useId, useRef, useState } from 'react'
import { BULK_UPLOAD_MAX_ROWS } from '@/lib/csv'

const isCsv = (file: File) => /\.csv$/i.test(file.name)

// File picker for the bulk CSV uploads (Gatekeepers, Clubs). Works by drag &
// drop, click, or keyboard (Tab to it, then Enter or Space). Only .csv files
// are accepted; anything else is reported and the selection is cleared, so
// the upload button stays disabled.
export function CsvDropZone({ fileName, onFile }: { fileName: string | null; onFile: (file: File | null) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()

  const choose = (file: File | null) => {
    if (file && !isCsv(file)) {
      setTypeError(`"${file.name}" isn't a CSV file. Choose a file ending in .csv.`)
      if (inputRef.current) inputRef.current.value = ''
      onFile(null)
      return
    }
    setTypeError(null)
    onFile(file)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="button"
        tabIndex={0}
        aria-describedby={hintId}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() }
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (!file || !inputRef.current) return
          if (isCsv(file)) {
            const dt = new DataTransfer()
            dt.items.add(file)
            inputRef.current.files = dt.files
          }
          choose(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4BB8] ${
          isDragging ? 'bg-[#EFF4FF] ring-2 ring-[#1E4BB8]' : 'bg-[#F8FAFC] hover:bg-slate-100'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="csv_file"
          accept=".csv,text/csv"
          className="hidden"
          tabIndex={-1}
          onChange={e => choose(e.target.files?.[0] ?? null)}
        />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/cloud-upload.svg" alt="" width={18.33} height={13.33} />
        </span>
        <p className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
          {fileName ?? 'Drag & drop a CSV file, or click to browse'}
        </p>
        <p id={hintId} className="text-[11px] text-[#64748B]">Up to {BULK_UPLOAD_MAX_ROWS} rows per upload</p>
      </div>
      {typeError && <p className="text-[12px] text-[#DC2626]" role="alert">{typeError}</p>}
    </div>
  )
}
