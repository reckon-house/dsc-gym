'use client'

// Sport chips (pick any) + grade dropdown. Used on signup and the staff edit
// sheet so both collect the same thing the same way.

import { useState } from 'react'
import { GRADE_OPTIONS, MAX_SPORTS, SPORTS } from '@/lib/grade'

interface Props {
  sports: string[]
  onSportsChange: (v: string[]) => void
  grade: string
  onGradeChange: (v: string) => void
  /** Visual style of the inputs, to sit inside each form's own look. */
  inputClassName?: string
  labelClassName?: string
  /** 'dark' for the white-on-black signup form. */
  tone?: 'light' | 'dark'
}

export function SportGradePicker({
  sports,
  onSportsChange,
  grade,
  onGradeChange,
  inputClassName = 'w-full h-11 px-3 bg-black/[0.04] rounded-xl text-sm text-black',
  labelClassName = 'dsc-label text-black/50 mb-1',
  tone = 'light',
}: Props) {
  const chipOn = tone === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
  const chipOff = tone === 'dark' ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-black/5 text-black/70 hover:bg-black/10'
  const addBtn = tone === 'dark' ? 'bg-white/10 text-white' : 'bg-black/5 text-black'
  const [other, setOther] = useState('')
  const custom = sports.filter((s) => !(SPORTS as readonly string[]).includes(s))

  function toggle(s: string) {
    if (sports.includes(s)) onSportsChange(sports.filter((x) => x !== s))
    else if (sports.length < MAX_SPORTS) onSportsChange([...sports, s])
  }

  function addOther() {
    const v = other.trim()
    if (!v || sports.some((s) => s.toLowerCase() === v.toLowerCase()) || sports.length >= MAX_SPORTS) return
    onSportsChange([...sports, v])
    setOther('')
  }

  return (
    <div className="space-y-4">
      <div>
        <div className={labelClassName}>Sport{sports.length > 1 ? 's' : ''} (pick any)</div>
        <div className="flex flex-wrap gap-1.5">
          {[...SPORTS, ...custom].map((s) => {
            const on = sports.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                className={`h-9 px-3 rounded-full text-sm ${on ? chipOn : chipOff}`}
              >
                {s}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addOther()
              }
            }}
            placeholder="Other sport"
            maxLength={40}
            className={inputClassName}
          />
          <button type="button" onClick={addOther} className={`h-11 px-4 rounded-xl text-sm font-semibold shrink-0 ${addBtn}`}>
            Add
          </button>
        </div>
      </div>
      <div>
        <div className={labelClassName}>Grade</div>
        <select value={grade} onChange={(e) => onGradeChange(e.target.value)} className={inputClassName}>
          <option value="">Choose…</option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
