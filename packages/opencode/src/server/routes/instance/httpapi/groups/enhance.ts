import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
} from "../middleware/workspace-routing"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

export const EnhancePayload = Schema.Struct({
  text: Schema.String,
  providerID: Schema.optional(ProviderV2.ID),
  modelID: Schema.optional(ModelV2.ID),
})

export const EnhanceApi = HttpApi.make("enhance").add(
  HttpApiGroup.make("enhance")
    .add(
      HttpApiEndpoint.post("enhanceText", "/experimental/enhance", {
        query: WorkspaceRoutingQuery,
        payload: EnhancePayload,
        success: Schema.Struct({ text: Schema.String }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.enhance.text",
          summary: "Enhance input text",
          description: "Use AI to intelligently optimize and enrich user input text for better clarity and expression.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "enhance", description: "Text enhancement routes." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
