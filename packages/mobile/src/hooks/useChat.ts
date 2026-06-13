import { useState, useEffect, useCallback, useRef } from "react"
import type { Message, SSEEvent } from "../types"
import { api } from "../services/api"
import { useConnection } from "./useConnection"

export function useChat(sessionID: string | null, directory?: string) {
  const { activeConnection, subscribe } = useConnection()
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const directoryRef = useRef(directory)

  directoryRef.current = directory

  const loadMessages = useCallback(async () => {
    if (!activeConnection || !sessionID) return
    setLoading(true)
    try {
      const msgs = await api.getMessages(activeConnection, sessionID, directoryRef.current)
      setMessages(msgs)
    } catch (err) {
      console.error("Failed to load messages:", err)
    } finally {
      setLoading(false)
    }
  }, [activeConnection, sessionID])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConnection || !sessionID || !content.trim()) return
      setSending(true)
      try {
        await api.sendMessage(activeConnection, sessionID, { content }, directoryRef.current)
      } catch (err) {
        console.error("Failed to send message:", err)
      } finally {
        setSending(false)
      }
    },
    [activeConnection, sessionID],
  )

  const abort = useCallback(async () => {
    if (!activeConnection || !sessionID) return
    try {
      await api.abortSession(activeConnection, sessionID, directoryRef.current)
    } catch (err) {
      console.error("Failed to abort:", err)
    }
  }, [activeConnection, sessionID])

  // Subscribe to SSE events for real-time updates
  useEffect(() => {
    const unsubscribe = subscribe((event: SSEEvent) => {
      if (event.type === "session.message.created" || event.type === "session.message.updated") {
        loadMessages()
      }
    })
    return unsubscribe
  }, [subscribe, loadMessages])

  // Load messages when session changes
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  return { messages, sending, loading, sendMessage, abort, reload: loadMessages }
}
