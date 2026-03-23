import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, MessageSquare, Sparkles, Loader2, Trash2 } from 'lucide-react'
import { useAiChat, type AiChatContext, type ChatMessage } from '@/hooks/useAiChat'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'

interface AiChatModalProps {
  context: AiChatContext
  silkUrl: string | null
  horseNumber: number | null
  onClose: () => void
}

const SUGGESTION_CHIPS = [
  'Full form analysis',
  'Jockey & trainer stats',
  'Course & distance record',
  'Compare with main rivals',
]

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-purple-600/80 text-white text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    )
  }

  const isError = msg.content.startsWith('Error:')

  return (
    <div className="flex justify-start">
      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl rounded-bl-md text-sm leading-relaxed ${
        isError
          ? 'bg-red-500/15 border border-red-500/30 text-red-300'
          : 'bg-gray-800 border border-gray-700 text-gray-200'
      }`}>
        <FormattedText text={msg.content} />
      </div>
    </div>
  )
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />

        const isBullet = /^[-•*]\s/.test(line.trim())
        const isNumbered = /^\d+[.)]\s/.test(line.trim())

        let formatted = line
          .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')

        if (isBullet || isNumbered) {
          const content = isBullet ? line.trim().replace(/^[-•*]\s/, '') : line.trim()
          formatted = content
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-purple-400 flex-shrink-0">{isBullet ? '•' : ''}</span>
              <span dangerouslySetInnerHTML={{ __html: isBullet ? formatted : line.trim().replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
            </div>
          )
        }

        return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
      })}
    </div>
  )
}

export function AiChatModal({ context, silkUrl, horseNumber, onClose }: AiChatModalProps) {
  const { messages, isLoading, sendMessage, clearChat } = useAiChat(context)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    sendMessage(input)
    setInput('')
  }

  const handleChip = (chip: string) => {
    sendMessage(`${chip} for ${context.horse_name}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl flex flex-col"
        style={{ height: 'min(85vh, 640px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-semibold text-base truncate">Chat with AI</h2>
                <span className="text-[10px] text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Sonnet 4.6</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <HorseNameWithSilk
                  horseName={context.horse_name}
                  silkUrl={silkUrl ?? undefined}
                  number={horseNumber ?? undefined}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="p-3 bg-purple-500/10 rounded-full mb-3">
                <Sparkles className="w-8 h-8 text-purple-400" />
              </div>
              <p className="text-gray-300 font-medium mb-1">Racing API Intelligence</p>
              <p className="text-gray-500 text-sm mb-5">
                Ask anything about {context.horse_name}'s form, connections, or race conditions
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTION_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => handleChip(chip)}
                    className="px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full hover:bg-purple-500/20 hover:border-purple-500/30 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gray-800 border border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Analysing with Racing API...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-gray-700 p-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about form, jockey, trainer, going..."
              disabled={isLoading}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">
            Powered by Claude Sonnet 4.6 + Racing API MCP
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
