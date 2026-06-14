import React, { useState, useEffect } from "react"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View, BackHandler } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ConnectionProvider, useConnection } from "./hooks/useConnection"
import { ConnectScreen } from "./screens/ConnectScreen"
import { ProjectScreen } from "./screens/ProjectScreen"
import { ChatScreen } from "./screens/ChatScreen"

type Screen = "connect" | "projects" | "chat"

function AppContent() {
  const { status, switchWorkspace } = useConnection()
  const [screen, setScreen] = useState<Screen>(status === "connected" ? "projects" : "connect")
  const [chatSessionID, setChatSessionID] = useState<string>("")
  const [chatDirectory, setChatDirectory] = useState<string>("")
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)

  const handleSelectProject = (directory: string, _name: string) => {
    setSelectedDirectory(directory)
    // The server's /event stream is per-workspace, so selecting a different
    // project requires rescoping the SSE connection.
    switchWorkspace(directory)
  }
  const handleSelectSession = (sessionID: string, directory: string) => {
    setChatSessionID(sessionID)
    setChatDirectory(directory)
    setScreen("chat")
  }
  const handleBack = () => {
    setScreen("projects")
  }

  // Connection status drives the top-level screen. Side effects must not run
  // in the render body — do it in an effect.
  useEffect(() => {
    if (status === "connected") {
      setScreen((s) => (s === "connect" ? "projects" : s))
    } else if (status === "disconnected") {
      setScreen("connect")
    }
  }, [status])

  // Android hardware back button. We intercept only when there is a meaningful
  // in-app navigation state to go back to; otherwise let the OS handle it.
  useEffect(() => {
    const onBack = (): boolean => {
      if (screen === "chat") {
        setScreen("projects")
        return true
      }
      if (screen === "projects" && selectedDirectory !== null) {
        setSelectedDirectory(null)
        switchWorkspace(undefined)
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack)
    return () => sub.remove()
  }, [screen, selectedDirectory, switchWorkspace])

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === "connect" && <ConnectScreen />}
      {screen === "projects" && (
        <ProjectScreen
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          selectedDirectory={selectedDirectory}
        />
      )}
      {screen === "chat" && chatSessionID && (
        <ChatScreen sessionID={chatSessionID} directory={chatDirectory} onBack={handleBack} />
      )}
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <AppContent />
      </ConnectionProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
})
