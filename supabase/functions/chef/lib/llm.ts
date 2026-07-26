/**
 * OpenRouter chat client for chef.
 * Network I/O isolated so the pipeline can inject fixtures in tests.
 */

import type {
  ChefIntent,
  ModelPricing,
  TokenUsage,
} from './types.ts';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_PRICING,
  DEFAULT_RECIPE_MODEL,
} from './types.ts';
import {
  parseJsonContent,
  validateModelChefResponse,
} from './schema.ts';
import type { ModelChefResponse } from './types.ts';
import { safeLog } from './privacy.ts';

export interface LlmCallResult {
  readonly data: ModelChefResponse;
  readonly model: string;
  readonly usage: TokenUsage;
  readonly rawContent: string;
}

export interface ChefLlmClient {
  complete(args: {
    readonly messages: readonly {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[];
    readonly intent: ChefIntent;
  }): Promise<LlmCallResult>;
}

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly chatModel?: string;
  readonly recipeModel?: string;
  readonly pricing?: ModelPricing;
  readonly fetchImpl?: typeof fetch;
  readonly siteUrl?: string;
  readonly siteName?: string;
}

interface OpenRouterChatResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
    readonly finish_reason?: string;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
  readonly error?: { readonly message?: string };
}

function usageFrom(resp: OpenRouterChatResponse): TokenUsage {
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const totalTokens =
    resp.usage?.total_tokens ?? promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

export class SchemaViolationError extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`schema_violation: ${errors.join('; ')}`);
    this.name = 'SchemaViolationError';
    this.errors = errors;
  }
}

export class OpenRouterChefClient implements ChefLlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly recipeModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly siteUrl: string;
  private readonly siteName: string;

  constructor(cfg: OpenRouterConfig) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? 'https://openrouter.ai/api/v1').replace(
      /\/$/,
      '',
    );
    this.chatModel = cfg.chatModel ?? DEFAULT_CHAT_MODEL;
    this.recipeModel = cfg.recipeModel ?? DEFAULT_RECIPE_MODEL;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.siteUrl = cfg.siteUrl ?? 'https://thegoodpantry.app';
    this.siteName = cfg.siteName ?? 'The Good Pantry';
  }

  async complete(args: {
    readonly messages: readonly {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[];
    readonly intent: ChefIntent;
  }): Promise<LlmCallResult> {
    const model =
      args.intent === 'generate_recipe' ? this.recipeModel : this.chatModel;

    const resp = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      safeLog('error', 'openrouter_http_error', {
        code: String(resp.status),
        model,
      });
      throw new ModelError(`OpenRouter HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as OpenRouterChatResponse;
    if (json.error?.message) {
      throw new ModelError(json.error.message);
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new ModelError('empty model content');
    }

    let parsed: unknown;
    try {
      parsed = parseJsonContent(content);
    } catch {
      throw new SchemaViolationError(['response is not valid JSON']);
    }
    const validated = validateModelChefResponse(parsed);
    if (!validated.ok) {
      throw new SchemaViolationError(validated.errors);
    }

    return {
      data: validated.value,
      model: json.model ?? model,
      usage: usageFrom(json),
      rawContent: content,
    };
  }
}

/** Fixture client for unit tests — no network. */
export class FixtureChefClient implements ChefLlmClient {
  constructor(
    private readonly fixture: ModelChefResponse | (() => ModelChefResponse),
    private readonly model = 'fixture/chef',
  ) {}

  async complete(_args: {
    readonly messages: readonly {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[];
    readonly intent: ChefIntent;
  }): Promise<LlmCallResult> {
    const data =
      typeof this.fixture === 'function' ? this.fixture() : this.fixture;
    return {
      data,
      model: this.model,
      usage: {
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
      },
      rawContent: JSON.stringify(data),
    };
  }
}

export function pricingFromEnv(env: {
  get: (k: string) => string | undefined;
}): ModelPricing {
  const p = env.get('CHEF_PROMPT_USD_PER_M');
  const c = env.get('CHEF_COMPLETION_USD_PER_M');
  return {
    promptPerMillionUsd: p ? Number(p) : DEFAULT_PRICING.promptPerMillionUsd,
    completionPerMillionUsd: c
      ? Number(c)
      : DEFAULT_PRICING.completionPerMillionUsd,
  };
}
