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
    return []
  }
}

function saveConnections(connections: ServerConnection[]) {
  SecureStore.setItem(STORAGE_KEY, JSON.stringify(connections))
}

interface ConnectionStore {
  connections: ServerConnection[]
  activeConnection: ServerConnection | null
  status: ConnectionStatus
  connect: (conn: ServerConnection) => Promise<boolean>
  disconnect: () => void
  addConnection: (conn: ServerConnection) => void
  removeConnection: (id: string) => void
  subscribe: (handler: (event: SSEEvent) => void) => () => void
}

const ConnectionContext = createContext<ConnectionStore | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<ServerConnection[]>(loadConnections)
  const [activeConnection, setActiveConnection] = useState<ServerConnection | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const eventSourceRef = useRef<{ close: () => void; onEvent: (h: (e: SSEEvent) => void) => void } | null>(null)
  const handlersRef = useRef<Array<(event: SSEEvent) => void>>([])

  const connect = useCallback(async (conn: ServerConnection): Promise<boolean> => {
    setStatus("connecting")
    try {
      const health = await api.health(conn)
      if (!health.healthy) {
        setStatus("error")
        return false
      }
      setActiveConnection(conn)
      setStatus("connected")

      const updated = { ...conn, lastConnected: Date.now() }
      setConnections((prev) => {
        const next = prev.map((c) => (c.id === conn.id ? updated : c))
        saveConnections(next)
        return next
      })

      eventSourceRef.current?.close()
      eventSourceRef.current = api.createEventSource(conn)
      eventSourceRef.current.onEvent((event) => {
        handlersRef.current.forEach((h) => h(event))
      })

      return true
    } catch {
      setStatus("error")
      return false
    }
  }, [])

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setActiveConnection(null)
    setStatus("disconnected")
  }, [])

  const addConnection = useCallback((conn: ServerConnection) => {
    setConnections((prev) => {
      const next = [...prev, conn]
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
    if (activeConnection?.id === id) disconnect()
  }, [activeConnection, disconnect])

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
        connect,
        disconnect,
        addConnection,
        removeConnection,
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
