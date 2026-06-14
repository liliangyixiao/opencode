import React, { useState, useEffect } from "react"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View, BackHandler } from "react-native"
import { ConnectionProvider, useConnection } from "./hooks/useConnection"
import { ConnectScreen } from "./screens/ConnectScreen"
import { ProjectScreen } from "./screens/ProjectScreen"
import { ChatScreen } from "./screens/ChatScreen"

type Screen = "connect" | "projects" | "chat"

function AppContent() {
  const { status, activeConnection } = useConnection()
  const [screen, setScreen] = useState<Screen>(status === "connected" ? "projects" : "connect")
  const [chatSessionID, setChatSessionID] = useState<string>("")
  const [chatDirectory, setChatDirectory] = useState<string>("")
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)

  const handleConnected = () => setScreen("projects")
  const handleSelectProject = (directory: string, _name: string) => {
    setSelectedDirectory(directory)
  }
  const handleSelectSession = (sessionID: string, directory: string) => {
    setChatSessionID(sessionID)
    setChatDirectory(directory)
    setScreen("chat")
  }
  const handleBack = () => {
    setScreen("projects")
  }

  // Auto-switch to projects when connected
  if (status === "connected" && screen === "connect") {
    setScreen("projects")
  }
  if (status === "disconnected" && screen !== "connect") {
    setScreen("connect")
  }

  // Android hardware back button. We intercept only when there is a meaningful
  // in-app navigation state to go back to; otherwise let the OS handle it
  // (e.g. exit the app from the top-level screen). iOS has no hardware back,
  // so this is a no-op there.
  useEffect(() => {
    const onBack = (): boolean => {
      if (screen === "chat") {
        setScreen("projects")
        return true
      }
      if (screen === "projects" && selectedDirectory !== null) {
        setSelectedDirectory(null)
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack)
    return () => sub.remove()
  }, [screen, selectedDirectory])

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === "connect" && <ConnectScreen />}
      {screen === "projects" && <ProjectScreen onSelectProject={handleSelectProject} onSelectSession={handleSelectSession} selectedDirectory={selectedDirectory} />}
      {screen === "chat" && chatSessionID && <ChatScreen sessionID={chatSessionID} directory={chatDirectory} onBack={handleBack} />}
    </View>
  )
}

export default function App() {
  return (
    <ConnectionProvider>
      <AppContent />
    </ConnectionProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
})
