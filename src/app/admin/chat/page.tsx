'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import { ChatThread, type ChatMsg } from '../_components/ChatThread'

interface PendingProposal {
  id: string
  action: 'create' | 'move' | 'cancel'
  trainerName: string | null
  athleteName: string | null
  scheduledAt: string | null
  duration: number
  conflictReason: string | null
}

export default function ChatView() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [proposals, setProposals] = useState<PendingProposal[]>([])
  const [pending, setPending] = useState(false)

  const loadChat = useCallback(async () => {
    const res = await fetch('/api/admin/chat')
    const data = await res.json()
    if (!data.success) return
    setMessages(
      data.messages.map((m: { id: string; role: 'user' | 'assistant'; content: string }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
    )
    setProposals(data.proposals ?? [])
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  useEffect(() => {
    loadChat()
  }, [loadChat])

  // Stream a chat message via SSE. The server emits text_delta events
  // for each token, tool_use_start for each tool call the model fires,
  // tool_result when it lands, and a final 'done' event. We render text
  // into a single in-flight assistant bubble that grows as deltas
  // arrive — basically the ChatGPT pattern.
  async function sendMessage(text: string) {
    setPending(true)
    const userId = `tmp-${Date.now()}`
    const streamId = `stream-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: userId, role: 'user', content: text },
      // Empty assistant bubble we'll fill with deltas.
      { id: streamId, role: 'assistant', content: '' },
    ])

    const appendDelta = (chunk: string) => {
      setMessages((msgs) => {
        const last = msgs[msgs.length - 1]
        if (last?.id !== streamId) return msgs
        return [
          ...msgs.slice(0, -1),
          { ...last, content: last.content + chunk },
        ]
      })
    }

    const startNewAssistantTurn = () => {
      // After a tool round finishes, the next assistant deltas should
      // accrue into a fresh bubble — otherwise commentary across rounds
      // would smush together.
      setMessages((msgs) => [
        ...msgs,
        { id: `stream-${Date.now()}-${msgs.length}`, role: 'assistant', content: '' },
      ])
    }

    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Stream failed' }))
        appendDelta(`Error: ${data.error}`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let currentEvent: string | null = null
      let firstDeltaInCurrentTurn = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE chunks are separated by blank lines. Process complete
        // events; leave any partial trailing chunk in the buffer.
        let blankIdx = buffer.indexOf('\n\n')
        while (blankIdx !== -1) {
          const raw = buffer.slice(0, blankIdx)
          buffer = buffer.slice(blankIdx + 2)
          blankIdx = buffer.indexOf('\n\n')

          // Parse the event block (event: X / data: Y).
          let evName = ''
          let evData = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) evName = line.slice(7).trim()
            else if (line.startsWith('data: ')) evData = line.slice(6)
          }
          if (!evName) continue
          currentEvent = evName
          let payload: Record<string, unknown> = {}
          try {
            payload = JSON.parse(evData)
          } catch {
            /* ignore malformed */
          }

          if (evName === 'text_delta') {
            if (firstDeltaInCurrentTurn) firstDeltaInCurrentTurn = false
            appendDelta((payload.text as string) ?? '')
          } else if (evName === 'tool_use_start') {
            // Drop a subtle inline mark so the user knows a tool is firing.
            appendDelta(
              firstDeltaInCurrentTurn
                ? `_calling \`${payload.name}\`…_\n\n`
                : `\n\n_calling \`${payload.name}\`…_\n\n`
            )
            firstDeltaInCurrentTurn = false
          } else if (evName === 'tool_result') {
            // Could surface a tick or x; keeping it quiet for now —
            // the next round's text deltas will narrate it.
          } else if (evName === 'assistant_turn_complete') {
            // Round finished. If there's another tool round coming,
            // open a fresh bubble so the next narration doesn't merge.
            if (payload.stopReason === 'tool_use') {
              startNewAssistantTurn()
              firstDeltaInCurrentTurn = true
            }
          } else if (evName === 'wrap_up_start') {
            startNewAssistantTurn()
            firstDeltaInCurrentTurn = true
          } else if (evName === 'done') {
            // Server signals end. We'll let the loop finish naturally
            // via the reader closing.
          } else if (evName === 'error') {
            appendDelta(`\n\n**Error:** ${payload.message}`)
          }
        }
        // Tell TS we used currentEvent for something so the var isn't dead.
        void currentEvent
      }
    } catch (err) {
      appendDelta(`\n\nNetwork error: ${String(err)}`)
    } finally {
      // Sync up with the persisted DB state so proposals/draftId are
      // current and stream-only IDs get replaced with real ones.
      await loadChat()
      setPending(false)
    }
  }

  async function handlePhoto(file: File) {
    setPending(true)
    setMessages((m) => [
      ...m,
      {
        id: `photo-${Date.now()}`,
        role: 'user',
        content: '📷 (photo of notepad)',
      },
    ])
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/admin/vision', { method: 'POST', body: form })
      const data = await res.json()
      if (data.success && data.transcript) {
        await sendMessage(data.transcript)
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: data.error ?? 'Could not read the photo.',
          },
        ])
        setPending(false)
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Photo error: ${String(err)}`,
        },
      ])
      setPending(false)
    }
  }

  async function handleReset() {
    setPending(true)
    await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, message: '' }),
    })
    setMessages([])
    setProposals([])
    setPending(false)
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <AdminHeader title="Chat" />

      <div className="flex-1 min-h-0 flex flex-col w-full max-w-3xl mx-auto">
        {proposals.length > 0 && (
          <div className="px-4 py-2 border-b border-blue-200 bg-blue-50 flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="dsc-label text-blue-900">
              {proposals.length} pending · say &ldquo;commit&rdquo; to confirm
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ChatThread
            messages={messages}
            pending={pending}
            onSend={sendMessage}
            onVoiceCapture={sendMessage}
            onPhotoCapture={handlePhoto}
            onReset={handleReset}
          />
        </div>
      </div>
    </div>
  )
}
