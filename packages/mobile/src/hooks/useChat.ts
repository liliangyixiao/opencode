import { useState, useEffect, useCallback, useRef } from "react"
import type { Message, SSEEvent, PermissionRequest, PermissionResponse, AgentModelSelection } from "../types"
import { api } from "../services/api"
import { useConnection } from "./useConnection"

// Server-emitted event types that reflect message changes. The server has no
// `session.message.*` events; it uses `message.*` (see core/src/v1/session.ts).
const MESSAGE_EVENT_TYPES = new Set([
  "message.updated",
  "message.part.updated",
  "message.removed",
])

// 5-minute watchdog: if neither the SSE turn-end signal nor the status poll
// clears `sending` within this window, force-clear it so the user is not
// permanently locked out of the input when both realtime and polling fail.
const SENDING_WATCHDOG_MS = 5 * 60 * 1000

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

// Build a PermissionRequest from a `permission.asked` event payload.
function parsePermission(props: Record<string, unknown>): PermissionRequest | null {
  const id = props.id as string | undefined
  if (!id) return null
  return {
    id,
    permission: (props.permission as string) ?? "",
    patterns: (props.patterns as string[]) ?? [],
    metadata: props.metadata as Record<string, unknown> | undefined,
    always: props.always as string[] | undefined,
  }
}

export function useChat(sessionID: string | null, directory?: string) {
  const { activeConnection, subscribe, status } = useConnection()
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null)
  const [selection, setSelection] = useState<AgentModelSelection>({})
  const [error, setError] = useState<string | null>(null)
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null)
  const directoryRef = useRef(directory)
  const selectionRef = useRef<AgentModelSelection>({})
  const lastSentContentRef = useRef<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIDRef = useRef(sessionID)
  const loadSeqRef = useRef(0)
  const pendingReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeConnectionRef = useRef(activeConnection)
  activeConnectionRef.current = activeConnection
  directoryRef.current = directory
  selectionRef.current = selection
  sessionIDRef.current = sessionID

  const loadMessages = useCallback(async () => {
    const conn = activeConnectionRef.current
    const sid = sessionIDRef.current
    if (!conn || !sid) return
    // Guard against out-of-order responses when switching sessions rapidly:
    // only the most recent invocation's result is applied.
    const seq = ++loadSeqRef.current
    try {
      const msgs = await api.getMessages(conn, sid, directoryRef.current)
      if (seq !== loadSeqRef.current) return
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
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const clearSending = useCallback(() => {
    setSending(false)
    stopPolling()
  }, [stopPolling])

  // Fallback poll: refresh messages AND check session status. If the SSE stream
  // missed the `session.status` idle event, this is what clears `sending`.
  const pollOnce = useCallback(async () => {
    const conn = activeConnectionRef.current
    const sid = sessionIDRef.current
    if (!conn || !sid) return
    await loadMessages()
    try {
      const status = await api.getSessionStatus(conn, sid, directoryRef.current)
      if (status === "idle") clearSending()
    } catch (err) {
      console.error("[useChat] Failed to poll session status:", err)
    }
  }, [clearSending, loadMessages])

  const sendMessage = useCallback(
    async (content: string) => {
      const conn = activeConnectionRef.current
      if (!conn || !sessionIDRef.current || !content.trim()) return
      setSending(true)
      setError(null)
      lastSentContentRef.current = content
      try {
        await api.sendMessage(conn, sessionIDRef.current, { content, ...selectionRef.current }, directoryRef.current)
        stopPolling()
        pollingRef.current = setInterval(pollOnce, 3000)
        // Watchdog: if neither SSE nor polling clears sending within 5 min
        // (both realtime and polling failed), unlock the input so the user is
        // not permanently stuck.
        watchdogRef.current = setTimeout(clearSending, SENDING_WATCHDOG_MS)
        pollOnce()
      } catch (err) {
        console.error("Failed to send message:", err)
        setLastFailedContent(content)
        setSending(false)
      }
    },
    [clearSending, pollOnce, stopPolling],
  )

  // One-tap retry of the last message that failed (either network error on
  // send, or a session.error from the server). Clears the failed marker so it
  // can only retry once per failure.
  const retryLastMessage = useCallback(() => {
    const content = lastFailedContent
    if (!content) return
    setLastFailedContent(null)
    sendMessage(content)
  }, [lastFailedContent, sendMessage])

  const abort = useCallback(async () => {
    const conn = activeConnectionRef.current
    if (!conn || !sessionIDRef.current) return
    try {
      await api.abortSession(conn, sessionIDRef.current, directoryRef.current)
    } catch (err) {
      console.error("Failed to abort:", err)
    }
  }, [])

  const replyPermission = useCallback(
    async (response: PermissionResponse) => {
      const conn = activeConnectionRef.current
      const sid = sessionIDRef.current
      const req = pendingPermission
      if (!conn || !sid || !req) return
      try {
        await api.replyPermission(conn, sid, req.id, response, directoryRef.current)
        setPendingPermission(null)
      } catch (err) {
        console.error("Failed to reply permission:", err)
      }
    },
    [pendingPermission],
  )

  // Subscribe to SSE events for real-time updates.
  useEffect(() => {
    const unsubscribe = subscribe((event: SSEEvent) => {
      const eventSessionID = (event.properties?.sessionID as string | undefined) ?? null
      if (eventSessionID && sessionIDRef.current && eventSessionID !== sessionIDRef.current) return

      // Permission request: surface to UI. Block on user decision.
      if (event.type === "permission.asked") {
        const req = parsePermission(event.properties)
        if (req) setPendingPermission(req)
        return
      }
      // Permission was replied elsewhere (e.g. desktop), dismiss local prompt.
      if (event.type === "permission.replied") {
        setPendingPermission(null)
        return
      }

      // Server-side prompt failure (e.g. invalid model, provider auth error).
      // prompt_async is fire-and-forget, so this is the only signal. Surface
      // the message and unblock the input so the user can retry.
      if (event.type === "session.error") {
        const err = event.properties?.error as { message?: string; name?: string } | undefined
        setError(err?.message || err?.name || "AI 回复失败，请检查 agent/model 或重试")
        // Remember the content so the user can one-tap retry.
        if (lastSentContentRef.current) setLastFailedContent(lastSentContentRef.current)
        clearSending()
        return
      }

      if (isTurnEnd(event)) {
        clearSending()
        // A successful turn clears any prior error banner + retry state.
        setError(null)
        setLastFailedContent(null)
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
  }, [subscribe, loadMessages, clearSending])

  // Load messages when session changes. Clear state first so switching sessions
  // does not briefly show the previous session's messages.
  useEffect(() => {
    if (!sessionID) return
    setMessages([])
    setPendingPermission(null)
    setError(null)
    setLoading(true)
    loadMessages().finally(() => setLoading(false))
  }, [sessionID, loadMessages])

  // Reset sending state when the connection drops. Otherwise a user who hits
  // "disconnect" while AI is replying is left with a permanently locked input.
  useEffect(() => {
    if (status === "disconnected") {
      clearSending()
      setPendingPermission(null)
      setError(null)
    }
  }, [status, clearSending])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (pendingReloadRef.current) clearTimeout(pendingReloadRef.current)
    }
  }, [stopPolling])

  return {
    messages,
    sending,
    loading,
    pendingPermission,
    error,
    clearError: () => setError(null),
    lastFailedContent,
    retryLastMessage,
    selection,
    setSelection,
    sendMessage,
    abort,
    replyPermission,
    reload: loadMessages,
  }
}
