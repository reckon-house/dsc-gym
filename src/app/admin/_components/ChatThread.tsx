'use client'

import { useEffect, useRef, useState } from 'react'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

interface Props {
  messages: ChatMsg[]
  pending: boolean
  onSend: (text: string) => void
  onVoiceCapture: (text: string) => void
  onPhotoCapture: (file: File) => void
  onReset: () => void
}

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    SpeechRecognition?: SpeechRecognitionConstructor
  }
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionErrorEvent {
  error: string
}

export function ChatThread({
  messages,
  pending,
  onSend,
  onVoiceCapture,
  onPhotoCapture,
  onReset,
}: Props) {
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceUnsupported, setVoiceUnsupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, pending])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      setVoiceUnsupported(true)
      return
    }
    const rec = new Ctor()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) onVoiceCapture(transcript)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    return () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleVoice() {
    if (voiceUnsupported || !recognitionRef.current) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  function handlePhotoClick() {
    fileInputRef.current?.click()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onPhotoCapture(file)
    e.target.value = ''
  }

  function handleSubmit() {
    if (!input.trim() || pending) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
        <span className="dsc-label text-black/60">Conversation</span>
        <button
          onClick={onReset}
          className="dsc-label text-black/40 hover:text-black"
        >
          Start fresh
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[260px]"
      >
        {messages.length === 0 && !pending && (
          <div className="text-center py-12 max-w-xs mx-auto space-y-3">
            <div className="dsc-label text-black/40">Start here</div>
            <div className="text-base text-black/70 leading-snug">
              Tap the mic and tell me about the week. Or snap a photo of your
              notepad.
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-black text-white rounded-2xl rounded-tr-md'
                  : 'bg-black/5 text-black rounded-2xl rounded-tl-md'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="bg-black/5 text-black/40 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[15px] italic">
              thinking…
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pt-2 pb-3 border-t border-black/10 flex items-center gap-2">
        <button
          onClick={toggleVoice}
          disabled={voiceUnsupported}
          className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg transition-colors ${
            listening
              ? 'bg-red-500 text-white animate-pulse'
              : voiceUnsupported
                ? 'bg-black/5 text-black/30 cursor-not-allowed'
                : 'bg-black text-white hover:bg-black/85'
          }`}
          aria-label="Voice"
          title={voiceUnsupported ? 'Voice unavailable in this browser' : 'Tap to speak'}
        >
          {listening ? (
            <span className="block w-3 h-3 bg-white rounded-sm" />
          ) : (
            <MicIcon />
          )}
        </button>

        <button
          onClick={handlePhotoClick}
          className="shrink-0 w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:bg-black/85"
          aria-label="Photo"
          title="Take a photo of your notepad"
        >
          <CameraIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={pending ? '…' : 'Or type a message'}
          className="flex-1 px-4 h-12 bg-black/5 rounded-full text-[15px] text-black placeholder:text-black/40 focus:outline-none focus:bg-black/[0.07]"
          disabled={pending}
        />

        <button
          onClick={handleSubmit}
          disabled={pending || !input.trim()}
          className="shrink-0 h-12 px-4 bg-black text-white rounded-full text-sm font-semibold disabled:bg-black/20 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
