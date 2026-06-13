import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_BASE from "./prompt/base.txt"
import TUNING_ANTHROPIC from "./prompt/tuning-anthropic.txt"
import TUNING_BEAST from "./prompt/tuning-beast.txt"
import TUNING_GEMINI from "./prompt/tuning-gemini.txt"
import TUNING_GPT from "./prompt/tuning-gpt.txt"
import TUNING_KIMI from "./prompt/tuning-kimi.txt"
import TUNING_CODEX from "./prompt/tuning-codex.txt"
import TUNING_TRINITY from "./prompt/tuning-trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { Reference } from "@opencode-ai/core/reference"

export function provider(model: Provider.Model) {
  const id = model.api.id.toLowerCase()
  if (id.includes("gpt-4") || id.includes("o1") || id.includes("o3"))
    return [PROMPT_BASE, TUNING_BEAST]
  if (id.includes("gpt")) {
    if (id.includes("codex")) return [PROMPT_BASE, TUNING_CODEX]
    return [PROMPT_BASE, TUNING_GPT]
  }
  if (id.includes("gemini-")) return [PROMPT_BASE, TUNING_GEMINI]
  if (id.includes("claude")) return [PROMPT_BASE, TUNING_ANTHROPIC]
  if (id.includes("trinity")) return [PROMPT_BASE, TUNING_TRINITY]
  if (id.includes("kimi")) return [PROMPT_BASE, TUNING_KIMI]
  return [PROMPT_BASE, TUNING_GPT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const locations = yield* LocationServiceMap

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const references = yield* Effect.gen(function* () {
          yield* (yield* PluginBoot.Service).wait()
          return (yield* (yield* Reference.Service).list()).filter((reference) => reference.description !== undefined)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        return [
          [
            `You are powered by model **${model.api.id}** (${model.providerID}/${model.api.id}).`,
            `Working directory: \`${ctx.directory}\``,
            `Workspace root: \`${ctx.worktree}\``,
            `Git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `Platform: ${process.platform}`,
            `Date: ${new Date().toDateString()}`,
          ].join("\n"),
          references.length === 0
            ? undefined
            : [
                "## Available References",
                ...references
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .flatMap((reference) => [
                    `- **${reference.name}**: \`${reference.path}\``,
                    ...(reference.description === undefined
                      ? []
                      : [`  ${reference.description}`]),
                  ]),
              ].join("\n"),
        ].filter((part): part is string => part !== undefined)
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer), Layer.provide(LocationServiceMap.layer))

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [Skill.node, locationServiceMapNode])

export * as SystemPrompt from "./system"
