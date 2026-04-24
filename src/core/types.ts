/**
 * Keel's internal, provider-neutral request/response shape.
 *
 * Both the OpenAI-compatible and Anthropic-compatible HTTP adapters translate
 * inbound requests into this shape, and translate the selected provider's
 * response back into the client's expected wire format. This is the only
 * shape the router/cache/shadow/providers actually deal with.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string;
  /** OpenAI tool calls / Anthropic tool use — passthrough, not routed on. */
  name?: string;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** If true, the client wants a streaming response. Caching is skipped. */
  stream?: boolean;
  /** Arbitrary tags from the client (e.g. tenant, feature). Used for stats. */
  metadata?: Record<string, string>;
}

export interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface CompletionResponse {
  id: string;
  model: string;
  /** Concatenated assistant text. Tool calls / structured outputs are not first-class yet. */
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'other';
  usage: CompletionUsage;
  /** Wall-clock provider latency in ms. */
  latencyMs: number;
}

export type CacheStatus = 'miss' | 'exact' | 'semantic';

export interface RoutingContext {
  apiKeyId: string;
  endpoint: 'messages' | 'chat.completions';
  /** Populated after routing. */
  servedModel?: string;
  cacheStatus?: CacheStatus;
  routingRule?:
    | 'exact-cache'
    | 'semantic-cache'
    | 'override'
    | 'shadow-promoted'
    | 'default';
  routingReason?: string;
}
