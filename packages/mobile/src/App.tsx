import React, { useState } from "react"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View } from "react-native"
import { ConnectionProvider, useConnection } from "./hooks/useConnection"
import { ConnectScreen } from "./screens/ConnectScreen"
import { ProjectScreen } from "./screens/ProjectScreen"
import { ChatScreen } from "./screens/ChatScreen"

type Screen = "connect" | "projects" | "chat"

function AppContent() {
  const { status } = useConnection()
  const [screen, setScreen] = useState<Screen>(status === "connected" ? "projects" : "connect")
  const [chatSessionID, setChatSessionID] = useState<string>("")
  const [chatDirectory, setChatDirectory] = useState<string>("")

  const handleConnected = () => setScreen("projects")
  const handleSelectProject = (directory: string, _name: string) => {
    setChatDirectory(directory)
    // Create a new session for this project
    setScreen("chat")
  }
  const handleSelectSession = (sessionID: string, directory: string) => {
    setChatSessionID(sessionID)
    setChatDirectory(directory)
    setScreen("chat")
  }
  const handleBack = () => setScreen("projects")

  // Auto-switch to projects when connected
  if (status === "connected" && screen === "connect") {
    setScreen("projects")
  }
  if (status === "disconnected" && screen !== "connect") {
    setScreen("connect")
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === "connect" && <ConnectScreen />}
      {screen === "projects" && <ProjectScreen onSelectProject={handleSelectProject} onSelectSession={handleSelectSession} />}
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
