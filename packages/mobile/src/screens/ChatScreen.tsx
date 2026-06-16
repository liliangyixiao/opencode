import { useState, useRef, useEffect, useCallback } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useChat } from "../hooks/useChat"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import { AgentModelPicker } from "../components/AgentModelPicker"
import { MarkdownText } from "../components/MarkdownText"
import type { Message, MessagePart, ToolPartStatus, PermissionResponse } from "../types"

interface Props {
  sessionID: string
  directory: string
  title: string
  onBack: () => void
}

export function ChatScreen({ sessionID, directory, title, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { sseHealth, activeConnection } = useConnection()
  const { messages, sending, sendMessage, abort, loading, pendingPermission, replyPermission, error, clearError, lastFailedContent, retryLastMessage, selection, setSelection } = useChat(sessionID, directory || undefined)
  const [input, setInput] = useState("")
  const [pickerVisible, setPickerVisible] = useState(false)
  const [enhancing, setEnhancing] = useState(false)

  const handleEnhance = async () => {
    if (!activeConnection || !input.trim() || enhancing) return
    setEnhancing(true)
    try {
      const enhanced = await api.enhanceText(activeConnection, input.trim(), directory || undefined)
      if (enhanced) setInput(enhanced)
    } catch (err) {
      console.error("Enhance failed:", err)
    } finally {
      setEnhancing(false)
    }
  }
  const flatListRef = useRef<FlatList>(null)
  const userScrolledUpRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-scroll on new messages — but only if the user hasn't scrolled up to
  // read history. Otherwise streaming updates would yank them back to bottom.
  const maybeScrollToEnd = useCallback(() => {
    if (userScrolledUpRef.current) return
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50)
  }, [])

  useEffect(() => {
    maybeScrollToEnd()
  }, [messages, maybeScrollToEnd])

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  const handleSend = () => {
    if (!input.trim() || sending) return
    sendMessage(input.trim())
    setInput("")
    userScrolledUpRef.current = false
  }

  const onScroll = (event: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
    // Consider the user "at the bottom" if within 80px of the end.
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80
    userScrolledUpRef.current = !atBottom
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user"
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {item.parts.length === 0 ? (
            <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
              {item.content}
            </Text>
          ) : (
            item.parts.map((part, idx) => (
              <MessagePartView key={`${item.id}-${idx}`} part={part} isUser={isUser} />
            ))
          )}
        </View>
      </View>
    )
  }

  // Android's default adjustResize already handles the keyboard; setting
  // behavior="height" on top of that double-offsets the input bar. iOS still
  // needs behavior="padding".
  const keyboardBehavior = Platform.OS === "ios" ? ("padding" as const) : undefined

  return (
    <KeyboardAvoidingView style={styles.container} behavior={keyboardBehavior} keyboardVerticalOffset={insets.top}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          style={styles.configIconButton}
          accessibilityRole="button"
          accessibilityLabel="选择 Agent 和模型"
        >
          <Text style={styles.configIconText}>⚙</Text>
        </TouchableOpacity>
        {sending && (
          <TouchableOpacity onPress={abort} style={styles.stopButton}>
            <Text style={styles.stopButtonText}>停止</Text>
          </TouchableOpacity>
        )}
      </View>

      {(selection.agent || selection.model) && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionText} numberOfLines={1}>
            {selection.agent ? `Agent: ${selection.agent}` : "Agent: 默认"} · {selection.model ? `${selection.model.modelID}` : "模型: 默认"}
          </Text>
        </View>
      )}

      <AgentModelPicker
        visible={pickerVisible}
        selection={selection}
        directory={directory || undefined}
        onClose={() => setPickerVisible(false)}
        onApply={setSelection}
      />

      {sseHealth === "reconnecting" && (
        <View style={styles.sseBanner}>
          <ActivityIndicator size="small" color={theme.colors.warning} />
          <Text style={styles.sseBannerText}>实时连接断开，正在重连...</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        onScroll={onScroll}
        scrollEventThrottle={200}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>OpenCode AI</Text>
              <Text style={styles.emptySubtitle}>输入指令控制 Mac 端项目</Text>
            </View>
          )
        }
      />

      {pendingPermission && (
        <PermissionCard
          permission={pendingPermission.permission}
          patterns={pendingPermission.patterns}
          onReply={replyPermission}
        />
      )}

      {sending && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.typingText}>AI 正在思考...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={3}>⚠ {error}</Text>
          {lastFailedContent ? (
            <TouchableOpacity onPress={retryLastMessage} style={styles.retryButton}>
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={clearError} style={styles.errorClose}>
            <Text style={styles.errorCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        <TextInput
          style={styles.input}
          placeholder="输入指令..."
          placeholderTextColor={theme.colors.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.enhanceButton, (!input.trim() || enhancing) && styles.sendButtonDisabled]}
          onPress={handleEnhance}
          disabled={!input.trim() || enhancing}
          accessibilityRole="button"
          accessibilityLabel="AI 增强输入"
        >
          {enhancing ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text style={styles.enhanceText}>✨</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="发送消息"
        >
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function PermissionCard({
  permission,
  patterns,
  onReply,
}: {
  permission: string
  patterns: string[]
  onReply: (response: PermissionResponse) => void
}) {
  return (
    <View style={styles.permCard}>
      <View style={styles.permHeader}>
        <Text style={styles.permIcon}>🔐</Text>
        <Text style={styles.permTitle} numberOfLines={1}>请求权限：{permission}</Text>
      </View>
      {patterns.length > 0 && (
        <ScrollView style={styles.permPatterns} scrollEnabled={patterns.join(", ").length > 120}>
          <Text style={styles.permPatternsText}>{patterns.join("\n")}</Text>
        </ScrollView>
      )}
      <View style={styles.permActions}>
        <TouchableOpacity style={[styles.permButton, styles.permAllow]} onPress={() => onReply("once")}>
          <Text style={styles.permButtonText}>允许一次</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.permButton, styles.permAlways]} onPress={() => onReply("always")}>
          <Text style={styles.permButtonText}>永久允许</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.permButton, styles.permReject]} onPress={() => onReply("reject")}>
          <Text style={styles.permButtonText}>拒绝</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const TOOL_STATUS_LABEL: Record<ToolPartStatus, string> = {
  pending: "等待中",
  running: "执行中",
  completed: "完成",
  error: "出错",
}

function MessagePartView({ part, isUser }: { part: MessagePart; isUser: boolean }) {
  if (part.type === "text") {
    if (!part.text) return null
    // User input is plain text. AI replies are Markdown.
    if (isUser) {
      return <Text style={[styles.messageText, styles.userText]}>{part.text}</Text>
    }
    return <MarkdownText text={part.text} color={theme.colors.text} />
  }
  if (part.type === "reasoning") {
    return <CollapsibleCard icon="💭" title="思考过程" text={part.text} />
  }
  // tool
  const { tool, state } = part
  const body = state.error ? state.error : state.output
  const title = state.title ? `${tool} · ${state.title}` : tool
  return <CollapsibleCard icon="🔧" title={title} badge={TOOL_STATUS_LABEL[state.status]} text={body} mono />
}

function CollapsibleCard({
  icon,
  title,
  badge,
  text,
  mono,
}: {
  icon: string
  title: string
  badge?: string
  text?: string
  mono?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasBody = !!text?.trim()
  const toggle = () => hasBody && setExpanded((v) => !v)

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={toggle} disabled={!hasBody} activeOpacity={0.7}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        {badge ? <Text style={styles.cardBadge}>{badge}</Text> : null}
        {hasBody ? (
          <Text style={styles.cardChevron}>{expanded ? "▾" : "▸"}</Text>
        ) : null}
      </TouchableOpacity>
      {expanded && hasBody && text ? (
        // Cap body height so long tool output doesn't take over the screen;
        // scroll inside.
        <ScrollView style={styles.cardBody} bounces={false}>
          <Text style={[styles.cardBodyText, mono && styles.monoText]}>{text}</Text>
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  backButton: { padding: theme.spacing.sm },
  backButtonText: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  headerTitle: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "600" },
  stopButton: { backgroundColor: theme.colors.error, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  stopButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: "600" },
  configIconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceLight, justifyContent: "center", alignItems: "center" },
  configIconText: { color: theme.colors.textMuted, fontSize: theme.fontSize.lg },
  selectionBanner: { backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  selectionText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  sseBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surface, gap: theme.spacing.sm },
  sseBannerText: { color: theme.colors.warning, fontSize: theme.fontSize.sm },
  messageList: { flex: 1 },
  messageListContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  messageRow: { flexDirection: "row", marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center", marginTop: 2 },
  avatarText: { color: "#fff", fontSize: theme.fontSize.xs, fontWeight: "700" },
  messageBubble: { maxWidth: "85%", borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm },
  userBubble: { backgroundColor: theme.colors.primary, borderBottomRightRadius: theme.radius.xs },
  assistantBubble: { backgroundColor: theme.colors.surfaceLight, borderBottomLeftRadius: theme.radius.xs },
  messageText: { fontSize: theme.fontSize.md, lineHeight: 22 },
  userText: { color: "#fff" },
  assistantText: { color: theme.colors.text },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 120 },
  emptyTitle: { fontSize: theme.fontSize.xxl, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.sm },
  emptySubtitle: { fontSize: theme.fontSize.md, color: theme.colors.textFaint },
  typingIndicator: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm },
  typingText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  errorBanner: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.error, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm },
  errorBannerText: { flex: 1, color: theme.colors.error, fontSize: theme.fontSize.sm },
  retryButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.xs, backgroundColor: theme.colors.error },
  retryText: { color: "#fff", fontSize: theme.fontSize.xs, fontWeight: "600" },
  errorClose: { paddingHorizontal: theme.spacing.sm },
  errorCloseText: { color: theme.colors.error, fontSize: theme.fontSize.md },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: theme.spacing.lg, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing.sm },
  input: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.radius.lg, padding: theme.spacing.lg, color: theme.colors.text, fontSize: theme.fontSize.md, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: theme.colors.border },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  enhanceButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceLight, justifyContent: "center", alignItems: "center" },
  enhanceText: { fontSize: theme.fontSize.lg },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#fff", fontSize: theme.fontSize.xl, fontWeight: "700" },
  // Permission request card
  permCard: { backgroundColor: theme.colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.warning, padding: theme.spacing.lg },
  permHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  permIcon: { fontSize: theme.fontSize.lg },
  permTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600", flex: 1 },
  permPatterns: { maxHeight: 100, marginBottom: theme.spacing.md, backgroundColor: theme.colors.background, borderRadius: theme.radius.sm, padding: theme.spacing.sm },
  permPatternsText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  permActions: { flexDirection: "row", gap: theme.spacing.sm },
  permButton: { flex: 1, borderRadius: theme.radius.sm, paddingVertical: theme.spacing.md, alignItems: "center" },
  permAllow: { backgroundColor: theme.colors.primary },
  permAlways: { backgroundColor: theme.colors.success },
  permReject: { backgroundColor: theme.colors.error },
  permButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: "600" },
  card: { backgroundColor: theme.colors.background, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  cardIcon: { fontSize: theme.fontSize.sm },
  cardTitle: { flexShrink: 1, color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "500" },
  cardBadge: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, backgroundColor: theme.colors.surface, borderRadius: theme.radius.xs, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, overflow: "hidden" },
  cardChevron: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, marginLeft: "auto" },
  cardBody: { maxHeight: 300, padding: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  cardBodyText: { color: theme.colors.text, fontSize: theme.fontSize.sm, lineHeight: 18 },
  monoText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: theme.fontSize.xs },
})
