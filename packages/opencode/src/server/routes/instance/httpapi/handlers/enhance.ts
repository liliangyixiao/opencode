import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { LLMEvent } from "@opencode-ai/llm"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

const ENHANCE_AGENT: Agent.Info = {
  name: "enhance-input",
  mode: "primary",
  permission: [],
  options: {},
  native: true,
  prompt: "",
}

const SYSTEM_PROMPT = `You are a text enhancement assistant. Your task is to improve the user's input text to be clearer, more precise, and more effective for communicating with an AI coding assistant.

Rules:
- Preserve the user's original intent completely - do not add new requirements or change the meaning
- Improve clarity, grammar, and structure
- Use precise technical terminology where appropriate
- If the text is already well-written, make minimal changes
- Keep the same language as the input (if input is in Chinese, output in Chinese; if English, output in English)
- Do NOT add explanations, commentary, or meta-text
- Do NOT wrap the output in quotes or code blocks
- Output ONLY the enhanced text, nothing else`

export const enhanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "enhance", (handlers) =>
  Effect.gen(function* () {
    const llm = yield* LLM.Service
    const provider = yield* Provider.Service

    const enhanceText = Effect.fn("EnhanceHttpApi.enhanceText")(function* (input: {
      text: string
      providerID?: string
      modelID?: string
    }) {
      const text = input.text.trim()
      if (!text) return { text }

      let model
      if (input.providerID && input.modelID) {
        model = yield* provider.getModel(ProviderV2.ID.make(input.providerID), ModelV2.ID.make(input.modelID))
      } else {
        const fallback = yield* provider.defaultModel().pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!fallback) return { text }
        model =
          (yield* provider.getSmallModel(fallback.providerID)) ??
          (yield* provider.getModel(fallback.providerID, fallback.modelID))
      }

      const sessionID = SessionID.descending()
      const result = yield* llm
        .stream({
          agent: ENHANCE_AGENT,
          user: {
            id: MessageID.ascending(),
            sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: ENHANCE_AGENT.name,
            model: { providerID: model.providerID, modelID: model.id },
          },
          system: [SYSTEM_PROMPT],
          small: true,
          tools: {},
          model,
          sessionID,
          retries: 2,
          messages: [
            { role: "user", content: `Enhance the following text for an AI coding assistant:\n\n${text}` },
          ],
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((event) => event.text),
          Stream.mkString,
        )

      const output = result.trim()
      return { text: output || text }
    })

    return handlers.handle("enhanceText", (ctx) =>
      enhanceText({
        text: ctx.payload.text,
        providerID: ctx.payload.providerID,
        modelID: ctx.payload.modelID,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("text enhancement failed", { cause }).pipe(
            Effect.as({ text: ctx.payload.text }),
          ),
        ),
      ),
    )
  }),
)
