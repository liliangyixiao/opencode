import React, { useState, useRef, useEffect } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native"
import { theme } from "../theme"
import { useChat } from "../hooks/useChat"
import { useConnection } from "../hooks/useConnection"
import type { Message, MessagePart, ToolPartStatus } from "../types"

interface Props {
  sessionID: string
  directory: string
  onBack: () => void
}

export function ChatScreen({ sessionID, directory, onBack }: Props) {
  const { activeConnection } = useConnection()
  const { messages, sending, sendMessage, abort, loading } = useChat(sessionID, directory || undefined)
  const [input, setInput] = useState("")
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || sending) return
    sendMessage(input.trim())
    setInput("")
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>对话</Text>
        {sending && (
          <TouchableOpacity onPress={abort} style={styles.stopButton}>
            <Text style={styles.stopButtonText}>停止</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
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

      {sending && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.typingText}>AI 正在思考...</Text>
        </View>
      )}

      <View style={styles.inputBar}>
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
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    return (
      <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
        {part.text}
      </Text>
    )
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
        <View style={styles.cardBody}>
          <Text style={[styles.cardBodyText, mono && styles.monoText]}>{text}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, paddingTop: 56, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  backButton: { padding: theme.spacing.sm },
  backButtonText: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  headerTitle: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "600" },
  stopButton: { backgroundColor: theme.colors.error, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  stopButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: "600" },
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
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: theme.spacing.lg, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing.sm },
  input: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.radius.lg, padding: theme.spacing.lg, color: theme.colors.text, fontSize: theme.fontSize.md, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: theme.colors.border },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#fff", fontSize: theme.fontSize.xl, fontWeight: "700" },
  card: { backgroundColor: theme.colors.background, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  cardIcon: { fontSize: theme.fontSize.sm },
  cardTitle: { flexShrink: 1, color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "500" },
  cardBadge: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, backgroundColor: theme.colors.surface, borderRadius: theme.radius.xs, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, overflow: "hidden" },
  cardChevron: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, marginLeft: "auto" },
  cardBody: { padding: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  cardBodyText: { color: theme.colors.text, fontSize: theme.fontSize.sm, lineHeight: 18 },
  monoText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: theme.fontSize.xs },
})
