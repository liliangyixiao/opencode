import React, { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import type { ServerConnection } from "../types"

export function ConnectScreen() {
  const { connections, connect, addConnection, removeConnection, status, activeConnection } = useConnection()
  const [host, setHost] = useState("")
  const [port, setPort] = useState("5001")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [tls, setTls] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async (conn: ServerConnection) => {
    setConnecting(true)
    const ok = await connect(conn)
    setConnecting(false)
    if (!ok) Alert.alert("连接失败", "无法连接到服务器，请检查地址和端口")
  }

  const handleAdd = () => {
    if (!host.trim()) return Alert.alert("提示", "请输入服务器地址")
    const conn: ServerConnection = {
      id: `${tls ? "https" : "http"}://${host.trim()}:${port}`,
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: Number(port) || 3000,
      password: password || undefined,
      tls,
    }
    addConnection(conn)
    handleConnect(conn)
    setHost("")
    setPort("5001")
    setPassword("")
    setName("")
    setTls(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OpenCode AI</Text>
      <Text style={styles.subtitle}>连接到 Mac 端 OpenCode</Text>

      {activeConnection && status === "connected" && (
        <View style={styles.connectedBanner}>
          <View style={styles.statusDot} />
          <Text style={styles.connectedText}>已连接: {activeConnection.name}</Text>
        </View>
      )}

      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="服务器名称" placeholderTextColor={theme.colors.textFaint} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="地址 (如 192.168.1.100 或 opencode.example.com)" placeholderTextColor={theme.colors.textFaint} value={host} onChangeText={setHost} keyboardType="url" autoCapitalize="none" />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.portInput]} placeholder="端口" placeholderTextColor={theme.colors.textFaint} value={port} onChangeText={setPort} keyboardType="number-pad" />
          <TouchableOpacity
            style={[styles.tlsToggle, tls && styles.tlsToggleActive]}
            onPress={() => setTls((v) => !v)}
          >
            <Text style={[styles.tlsToggleText, tls && styles.tlsToggleTextActive]}>HTTPS</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.input} placeholder="密码 (可选)" placeholderTextColor={theme.colors.textFaint} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>添加并连接</Text>
        </TouchableOpacity>
      </View>

      {connections.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.sectionTitle}>已保存的连接</Text>
          {connections.map((conn) => (
            <View key={conn.id} style={styles.savedItem}>
              <TouchableOpacity style={styles.savedItemInfo} onPress={() => handleConnect(conn)} disabled={connecting}>
                <Text style={styles.savedItemName}>{conn.name}</Text>
                <Text style={styles.savedItemHost}>{conn.tls ? "https" : "http"}://{conn.host}:{conn.port}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeConnection(conn.id)}>
                <Text style={styles.deleteButtonText}>删除</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {connecting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.overlayText}>正在连接...</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.xl },
  title: { fontSize: theme.fontSize.xxl, fontWeight: "700", color: theme.colors.text, textAlign: "center", marginTop: 60 },
  subtitle: { fontSize: theme.fontSize.md, color: theme.colors.textMuted, textAlign: "center", marginTop: theme.spacing.sm, marginBottom: theme.spacing.xxl },
  connectedBanner: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, padding: theme.spacing.lg, borderRadius: theme.radius.md, marginBottom: theme.spacing.xl, gap: theme.spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  connectedText: { color: theme.colors.success, fontSize: theme.fontSize.sm, fontWeight: "500" },
  form: { gap: theme.spacing.md },
  input: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, color: theme.colors.text, fontSize: theme.fontSize.md, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: "row", gap: theme.spacing.md },
  portInput: { flex: 1 },
  tlsToggle: { justifyContent: "center", alignItems: "center", paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  tlsToggleActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tlsToggleText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: "600" },
  tlsToggleTextActive: { color: "#fff" },
  addButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: theme.spacing.lg, alignItems: "center", marginTop: theme.spacing.sm },
  addButtonText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  savedSection: { marginTop: theme.spacing.xxl },
  sectionTitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: "600", marginBottom: theme.spacing.md, textTransform: "uppercase", letterSpacing: 1 },
  savedItem: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm },
  savedItemInfo: { flex: 1 },
  savedItemName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" },
  savedItemHost: { color: theme.colors.textFaint, fontSize: theme.fontSize.sm, marginTop: 2 },
  deleteButton: { padding: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.error, fontSize: theme.fontSize.sm },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", gap: theme.spacing.lg },
  overlayText: { color: theme.colors.text, fontSize: theme.fontSize.md },
})
