import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import * as SecureStore from "expo-secure-store"
import type { ServerConnection, ConnectionStatus, SSEEvent } from "../types"
import { api } from "../services/api"

const STORAGE_KEY = "opencode_connections"

function loadConnections(): ServerConnection[] {
  try {
    const raw = SecureStore.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    // Distinguish "no data" (return empty) from corruption. We deliberately do
    // NOT overwrite storage here — saveConnections([]) would permanently wipe
    // the user's saved connections if JSON.parse failed on a transient error.
    console.error("[useConnection] Failed to parse stored connections, leaving storage intact")
    return []
  }
}

function saveConnections(connections: ServerConnection[]) {
  SecureStore.setItem(STORAGE_KEY, JSON.stringify(connections))
}

// SSE connection health, surfaced to the UI. The underlying EventSource polyfill
// auto-reconnects; this only reflects what it reports via onopen/onerror.
export type SseHealth = "connected" | "reconnecting" | "disconnected"

interface ConnectionStore {
  connections: ServerConnection[]
  activeConnection: ServerConnection | null
  status: ConnectionStatus
  directory: string | undefined
  sseHealth: SseHealth
  connect: (conn: ServerConnection) => Promise<boolean>
  disconnect: () => void
  addConnection: (conn: ServerConnection) => void
  removeConnection: (id: string) => void
  // Switch the workspace the SSE stream is scoped to. The server's /event
  // stream is per-directory, so changing projects requires reconnecting.
  switchWorkspace: (directory: string | undefined) => void
  subscribe: (handler: (event: SSEEvent) => void) => () => void
}

const ConnectionContext = createContext<ConnectionStore | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<ServerConnection[]>(loadConnections)
  const [activeConnection, setActiveConnection] = useState<ServerConnection | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const [directory, setDirectory] = useState<string | undefined>(undefined)
  const [sseHealth, setSseHealth] = useState<SseHealth>("disconnected")
  const eventSourceRef = useRef<{ close: () => void; onEvent: (h: (e: SSEEvent) => void) => void } | null>(null)
  const handlersRef = useRef<Array<(event: SSEEvent) => void>>([])

  // Open (or reopen) the SSE stream for the current connection + directory.
  // The polyfill handles its own reconnect; we never open a second instance.
  const openEventSource = useCallback((conn: ServerConnection, dir: string | undefined) => {
    eventSourceRef.current?.close()
    const es = api.createEventSource(conn, dir, (health) => setSseHealth(health))
    es.onEvent((event) => {
      handlersRef.current.forEach((h) => h(event))
    })
    eventSourceRef.current = es
  }, [])

  const connect = useCallback(async (conn: ServerConnection): Promise<boolean> => {
    setStatus("connecting")
    try {
      const health = await api.health(conn)
      if (!health.healthy) {
        setStatus("error")
        return false
      }
      const updated = { ...conn, lastConnected: Date.now() }
      setActiveConnection(updated)
      setStatus("connected")

      setConnections((prev) => {
        const next = prev.some((c) => c.id === conn.id) ? prev.map((c) => (c.id === conn.id ? updated : c)) : [...prev, updated]
        saveConnections(next)
        return next
      })

      setDirectory(undefined)
      openEventSource(updated, undefined)
      return true
    } catch {
      setStatus("error")
      return false
    }
  }, [openEventSource])

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setActiveConnection(null)
    setDirectory(undefined)
    setStatus("disconnected")
    setSseHealth("disconnected")
  }, [])

  // Reconnect the SSE stream scoped to a different workspace (project).
  // Without this, events for the newly selected project never arrive.
  const switchWorkspace = useCallback((dir: string | undefined) => {
    setDirectory(dir)
    if (!activeConnection) return
    openEventSource(activeConnection, dir)
  }, [activeConnection, openEventSource])

  const addConnection = useCallback((conn: ServerConnection) => {
    setConnections((prev) => {
      // Dedupe by id: update existing rather than append a duplicate.
      const next = prev.some((c) => c.id === conn.id) ? prev.map((c) => (c.id === conn.id ? conn : c)) : [...prev, conn]
      saveConnections(next)
      return next
    })
  }, [])

  const removeConnection = useCallback((id: string) => {
    setConnections((prev) => {
      const next = prev.filter((c) => c.id !== id)
      saveConnections(next)
      return next
    })
    setActiveConnection((current) => {
      if (current?.id === id) {
        disconnect()
        return null
      }
      return current
    })
  }, [disconnect])

  const subscribe = useCallback((handler: (event: SSEEvent) => void) => {
    handlersRef.current.push(handler)
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler)
    }
  }, [])

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  return (
    <ConnectionContext.Provider
      value={{
        connections,
        activeConnection,
        status,
        directory,
        sseHealth,
        connect,
        disconnect,
        addConnection,
        removeConnection,
        switchWorkspace,
        subscribe,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  )
}

export function useConnection(): ConnectionStore {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider")
  return ctx
}
