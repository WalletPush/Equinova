import { useState, useCallback, useRef } from 'react'
import { callSupabaseFunction } from '@/lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatContext {
  race_id: string
  horse_name: string
  course: string
  off_time: string
  race_type: string
  ensemble_proba: number
  implied_prob: number
  edge: number
  current_odds: number
  opening_odds: number
  jockey: string
  trainer: string
}

export function useAiChat(context: AiChatContext) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setError(null)
    abortRef.current = false

    try {
      const history = messages.slice(-10)

      const res = await callSupabaseFunction('ai-racing-chat', {
        message: text.trim(),
        history,
        context,
      })

      if (abortRef.current) return

      if (res?.success === false) {
        const raw = res?.error?.message || 'Unknown error'
        const friendly = raw.includes('rate_limit') ? 'AI is busy — please wait 30 seconds and try again.'
          : raw.includes('timeout') || raw.includes('abort') ? 'Request timed out — try a simpler question.'
          : raw
        setError(friendly)
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${friendly}` }])
        return
      }

      const aiText = res?.data?.response || res?.response || 'No response received.'
      const aiMsg: ChatMessage = { role: 'assistant', content: aiText }
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      if (abortRef.current) return
      const errMsg = err?.message || 'Failed to get AI response'
      setError(errMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, context])

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
    abortRef.current = true
  }, [])

  return { messages, isLoading, error, sendMessage, clearChat }
}
