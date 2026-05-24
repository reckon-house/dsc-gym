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

  async function sendMessage(text: string) {
    setPending(true)
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: 'user', content: text },
    ])
    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      if (!data.success) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${data.error}`,
          },
        ])
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Network error: ${String(err)}`,
        },
      ])
    } finally {
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
