'use client'

// Branded sheet for two related actions on the admin home:
//
//   - "Decline this request" — collect an optional reason then POST
//     /api/admin/booking-requests/:id/decline. Replaces the old
//     window.prompt().
//   - "Can't approve" — when the approve endpoint returns 409 with
//     conflicts, surface them in a branded sheet and offer "Decline"
//     as a one-click next step. Replaces the old window.alert().
//
// Both share the same slide-up panel + backdrop animation as
// SessionEditSheet.

import { useEffect, useRef, useState } from 'react'

export interface RequestSummary {
  id: string
  athleteName: string
  trainerName: string
  when: string       // pre-formatted local string e.g. "Wed, May 27, 3:00 PM"
  duration: number
}

type Mode =
  | { kind: 'decline'; request: RequestSummary; suggestedReason?: string }
  | { kind: 'conflict'; request: RequestSummary; conflicts: string[] }

interface Props {
  mode: Mode
  onClose: () => void
  onDeclineSubmit: (id: string, reason: string | null) => Promise<void> | void
  // Called from the conflict view's "Decline this request" CTA to swap
  // the sheet over to decline-mode without closing.
  onConflictDecline: (request: RequestSummary, suggestedReason: string) => void
}

export function RequestActionSheet({
  mode,
  onClose,
  onDeclineSubmit,
  onConflictDecline,
}: Props) {
  const [reason, setReason] = useState(
    mode.kind === 'decline' ? mode.suggestedReason ?? '' : ''
  )
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Focus the textarea on decline-mode entry so keyboard pops up on
  // mobile and the user can start typing immediately.
  useEffect(() => {
    if (mode.kind === 'decline') {
      // small delay so the slide-up animation doesn't fight the focus
      const t = setTimeout(() => textareaRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [mode.kind])

  // Esc closes; Cmd/Ctrl+Enter submits in decline mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (
        mode.kind === 'decline' &&
        (e.metaKey || e.ctrlKey) &&
        e.key === 'Enter'
      ) {
        e.preventDefault()
        void submitDecline()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, reason])

  async function submitDecline() {
    if (submitting || mode.kind !== 'decline') return
    setSubmitting(true)
    try {
      await onDeclineSubmit(mode.request.id, reason.trim() || null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[85vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {mode.kind === 'conflict' ? (
          <ConflictBody
            request={mode.request}
            conflicts={mode.conflicts}
            onClose={onClose}
            onDecline={() => {
              // The most informative single conflict makes a good
              // starting suggestion the owner can edit before sending.
              const suggestion = mode.conflicts[0] ?? ''
              onConflictDecline(mode.request, suggestion)
            }}
          />
        ) : (
          <DeclineBody
            request={mode.request}
            reason={reason}
            setReason={setReason}
            submitting={submitting}
            textareaRef={textareaRef}
            onClose={onClose}
            onSubmit={submitDecline}
          />
        )}
      </div>
    </div>
  )
}

function ConflictBody({
  request,
  conflicts,
  onClose,
  onDecline,
}: {
  request: RequestSummary
  conflicts: string[]
  onClose: () => void
  onDecline: () => void
}) {
  return (
    <div className="px-5 pt-5 pb-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="dsc-label text-red-700 mb-1">Can&rsquo;t approve</div>
          <h2 className="dsc-headline text-2xl text-black leading-tight">
            Schedule conflict.
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60 shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="rounded-2xl bg-black/[0.04] p-4 mb-4">
        <div className="dsc-label text-black/40 mb-1">Request</div>
        <div className="text-sm text-black">
          <span className="font-medium">{request.athleteName}</span>
          <span className="text-black/50"> with </span>
          <span className="font-medium">{request.trainerName}</span>
        </div>
        <div className="text-xs text-black/60 mt-0.5">
          {request.when} · {request.duration}min
        </div>
      </div>

      <div className="mb-5">
        <div className="dsc-label text-black/40 mb-2">What&rsquo;s in the way</div>
        <ul className="space-y-2">
          {conflicts.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-black">
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0"
                aria-hidden
              />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <button
          onClick={onDecline}
          className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base"
        >
          Decline this request
        </button>
        <button
          onClick={onClose}
          className="w-full h-12 text-black/60 rounded-full text-sm hover:text-black"
        >
          Back
        </button>
      </div>
    </div>
  )
}

function DeclineBody({
  request,
  reason,
  setReason,
  submitting,
  textareaRef,
  onClose,
  onSubmit,
}: {
  request: RequestSummary
  reason: string
  setReason: (s: string) => void
  submitting: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="px-5 pt-5 pb-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="dsc-label text-black/40 mb-1">Decline</div>
          <h2 className="dsc-headline text-2xl text-black leading-tight">
            Send a note?
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60 shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="rounded-2xl bg-black/[0.04] p-4 mb-4">
        <div className="dsc-label text-black/40 mb-1">Declining</div>
        <div className="text-sm text-black">
          <span className="font-medium">{request.athleteName}</span>
          <span className="text-black/50"> with </span>
          <span className="font-medium">{request.trainerName}</span>
        </div>
        <div className="text-xs text-black/60 mt-0.5">
          {request.when} · {request.duration}min
        </div>
      </div>

      <label className="block mb-5">
        <div className="dsc-label text-black/40 mb-2">
          Reason (optional, sent to the athlete)
        </div>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Mike’s booked at 3pm — try 5pm?"
          rows={3}
          className="w-full bg-black/[0.04] rounded-2xl px-4 py-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
        />
      </label>

      <div className="space-y-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send decline'}
        </button>
        <button
          onClick={onClose}
          disabled={submitting}
          className="w-full h-12 text-black/60 rounded-full text-sm hover:text-black disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
