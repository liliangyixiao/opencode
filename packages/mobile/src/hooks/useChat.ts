import { useState, useEffect, useCallback, useRef } from "react"
import type { Message, SSEEvent } from "../types"
import { api } from "../services/api"
import { useConnection } from "./useConnection"

// Server-emitted event types that reflect message changes. The server has no
// `session.message.*` events; it uses `message.*` (see core/src/v1/session.ts).
const MESSAGE_EVENT_TYPES = new Set([
  "message.updated",
  "message.part.updated",
  "message.removed",
])

// Signals the end of an AI turn. `session.status` with status.type "idle" is the
// canonical signal (status.ts). `session.next.step.ended/failed` only fire when
// the experimentalEventSystem flag is on, so they are unreliable on default
// configs; keep them as best-effort fallbacks alongside the deprecated
// `session.idle`.
function isTurnEnd(event: SSEEvent): boolean {
  if (event.type === "session.idle") return true
  if (event.type === "session.next.step.ended" || event.type === "session.next.step.failed") return true
  if (event.type === "session.status") {
    const status = event.properties?.status as { type?: string } | undefined
    return status?.type === "idle"
  }
  return false
}

export function useChat(sessionID: string | null, directory?: string) {
  const { activeConnection, subscribe } = useConnection()
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const directoryRef = useRef(directory)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIDRef = useRef(sessionID)
  const pendingReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeConnectionRef = useRef(activeConnection)
  activeConnectionRef.current = activeConnection
  directoryRef.current = directory
  sessionIDRef.current = sessionID

  const loadMessages = useCallback(async () => {
    const conn = activeConnectionRef.current
    if (!conn || !sessionIDRef.current) return
    try {
      const msgs = await api.getMessages(conn, sessionIDRef.current, directoryRef.current)
      setMessages(msgs)
    } catch (err) {
      console.error("[useChat] Failed to load messages:", err)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  // Fallback poll: refresh messages AND check session status. If the SSE stream
  // missed the `session.status` idle event, this is what clears `sending`.
  const pollOnce = useCallback(async () => {
    const conn = activeConnectionRef.current
    const sid = sessionIDRef.current
    if (!conn || !sid) return
    await loadMessages()
    try {
      const status = await api.getSessionStatus(conn, sid, directoryRef.current)
      if (status === "idle") {
        setSending(false)
        stopPolling()
      }
    } catch (err) {
      console.error("[useChat] Failed to poll session status:", err)
    }
  }, [loadMessages, stopPolling])

  const sendMessage = useCallback(
    async (content: string) => {
      const conn = activeConnectionRef.current
      if (!conn || !sessionIDRef.current || !content.trim()) return
      setSending(true)
      try {
        await api.sendMessage(conn, sessionIDRef.current, { content }, directoryRef.current)
        // Primary updates arrive via the subscribe() SSE handler below. This poll
        // is only a fallback for missed events (some transports drop idle events
        // even while delivering message events — see cli/.../stream.transport.ts).
        stopPolling()
        pollingRef.current = setInterval(pollOnce, 3000)
        pollOnce()
      } catch (err) {
        console.error("Failed to send message:", err)
        setSending(false)
      }
    },
    [pollOnce, stopPolling],
  )

  const abort = useCallback(async () => {
    const conn = activeConnectionRef.current
    if (!conn || !sessionIDRef.current) return
    try {
      await api.abortSession(conn, sessionIDRef.current, directoryRef.current)
    } catch (err) {
      console.error("Failed to abort:", err)
    }
  }, [])

  // Subscribe to SSE events for real-time updates.
  useEffect(() => {
    const unsubscribe = subscribe((event: SSEEvent) => {
      const eventSessionID = (event.properties?.sessionID as string | undefined) ?? null
      // Ignore events for other sessions; only refresh the one we're viewing.
      if (eventSessionID && sessionIDRef.current && eventSessionID !== sessionIDRef.current) return

      if (isTurnEnd(event)) {
        setSending(false)
        stopPolling()
        if (pendingReloadRef.current) clearTimeout(pendingReloadRef.current)
        loadMessages()
        return
      }

      if (MESSAGE_EVENT_TYPES.has(event.type)) {
        // message.part.updated fires per-token during streaming; coalesce into
        // a single trailing reload to avoid request storms and UI jitter.
        if (pendingReloadRef.current) clearTimeout(pendingReloadRef.current)
        pendingReloadRef.current = setTimeout(loadMessages, 300)
      }
    })
    return unsubscribe
  }, [subscribe, loadMessages, stopPolling])

  // Load messages when session changes
  useEffect(() => {
    if (!sessionID) return
    setLoading(true)
    loadMessages().finally(() => setLoading(false))
  }, [sessionID, loadMessages])

  // Cleanup polling and pending reload on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (pendingReloadRef.current) clearTimeout(pendingReloadRef.current)
    }
  }, [stopPolling])

  return { messages, sending, loading, sendMessage, abort, reload: loadMessages }
}
