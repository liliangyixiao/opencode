import { useState, useEffect } from "react"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View, BackHandler } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ConnectionProvider, useConnection } from "./hooks/useConnection"
import { ConnectScreen } from "./screens/ConnectScreen"
import { ProjectScreen } from "./screens/ProjectScreen"
import { ChatScreen } from "./screens/ChatScreen"
import { FileBrowserScreen } from "./screens/FileBrowserScreen"
import { VcsScreen } from "./screens/VcsScreen"

type Screen = "connect" | "projects" | "chat" | "files" | "vcs"

function AppContent() {
  const { status, switchWorkspace } = useConnection()
  const [screen, setScreen] = useState<Screen>(status === "connected" ? "projects" : "connect")
  const [chatSessionID, setChatSessionID] = useState<string>("")
  const [chatDirectory, setChatDirectory] = useState<string>("")
  const [chatTitle, setChatTitle] = useState<string>("")
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [fileDirectory, setFileDirectory] = useState<string>("")
  const [vcsDirectory, setVcsDirectory] = useState<string>("")

  const handleSelectProject = (directory: string, _name: string) => {
    setSelectedDirectory(directory)
    switchWorkspace(directory)
  }
  const handleSelectSession = (sessionID: string, directory: string, title?: string) => {
    setChatSessionID(sessionID)
    setChatDirectory(directory)
    setChatTitle(title || "对话")
    setScreen("chat")
  }
  const handleBack = () => {
    setScreen("projects")
  }
  const handleOpenFiles = (directory: string) => {
    setFileDirectory(directory)
    setScreen("files")
  }
  const handleOpenVcs = (directory: string) => {
    setVcsDirectory(directory)
    setScreen("vcs")
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
      if (screen === "chat" || screen === "files" || screen === "vcs") {
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
          onOpenFiles={handleOpenFiles}
          onOpenVcs={handleOpenVcs}
          selectedDirectory={selectedDirectory}
        />
      )}
      {screen === "chat" && chatSessionID && (
        <ChatScreen sessionID={chatSessionID} directory={chatDirectory} title={chatTitle} onBack={handleBack} />
      )}
      {screen === "files" && fileDirectory && (
        <FileBrowserScreen directory={fileDirectory} onBack={handleBack} />
      )}
      {screen === "vcs" && vcsDirectory && (
        <VcsScreen directory={vcsDirectory} onBack={handleBack} />
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
