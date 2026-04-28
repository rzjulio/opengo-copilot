import { ModelInfo, ApiFormat } from "../types";
import { ConfigManager } from "../core/config";
import { log } from "../utils/logger";

export interface RoutingResult {
  modelId: string;
  effectiveModelId: string;
  apiFormat: ApiFormat;
  endpoint: string;
  supportsVision: boolean;
}

export function resolveModelRoute(
  selectedModelId: string,
  config: ConfigManager
): RoutingResult {
  const info = config.getModelInfo(selectedModelId);
  const effectiveId = config.resolveEffectiveModelId(selectedModelId);

  if (!info) {
    log("model-router", `Unknown model ${selectedModelId}, defaulting to openai`);
    return {
      modelId: selectedModelId,
      effectiveModelId: effectiveId,
      apiFormat: "openai",
      endpoint: config.getEndpointForModel(selectedModelId),
      supportsVision: false,
    };
  }

  return {
    modelId: selectedModelId,
    effectiveModelId: effectiveId,
    apiFormat: info.apiFormat,
    endpoint: info.endpoint ?? config.getEndpointForModel(selectedModelId),
    supportsVision: info.supportsVision,
  };
}
