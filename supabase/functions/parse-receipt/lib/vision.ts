/**
 * Vision client interface + OpenRouter implementation.
 * Network I/O is isolated here so the pipeline can inject fixtures in tests.
 */

import type {
  ModelGroceryGateResult,
  ModelParseResult,
  ModelPricing,
  ReceiptImageInput,
  TokenUsage,
  VisionCallResult,
} from './types.ts';
import { DEFAULT_GATE_MODEL, DEFAULT_PRICING, DEFAULT_VISION_MODEL } from './types.ts';
import {
  GROCERY_GATE_JSON_SCHEMA,
  RECEIPT_PARSE_JSON_SCHEMA,
  parseJsonContent,
  validateGroceryGateResult,
  validateModelParseResult,
} from './schema.ts';
import {
  groceryGateSystemPrompt,
  groceryGateUserPrompt,
  receiptParseSystemPrompt,
  receiptParseUserPrompt,
} from './prompts.ts';
import { safeLog } from './privacy.ts';

export interface VisionClient {
  groceryGate(args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelGroceryGateResult>>;

  parseReceipt(args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelParseResult>>;
}

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly visionModel?: string;
  readonly gateModel?: string;
  readonly pricing?: ModelPricing;
  readonly fetchImpl?: typeof fetch;
  readonly siteUrl?: string;
  readonly siteName?: string;
}

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

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

function imageToUrl(img: ReceiptImageInput): string {
  if (img.url) return img.url;
  if (!img.data) {
    throw new Error('image_missing_data_and_url');
  }
  if (img.data.startsWith('data:')) return img.data;
  const mime = img.mimeType ?? 'image/jpeg';
  return `data:${mime};base64,${img.data}`;
}

function buildImageParts(images: readonly ReceiptImageInput[]): ChatContentPart[] {
  return images.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: imageToUrl(img) },
  }));
}

function usageFrom(resp: OpenRouterChatResponse): TokenUsage {
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const totalTokens =
    resp.usage?.total_tokens ?? promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

export class OpenRouterVisionClient implements VisionClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly visionModel: string;
  private readonly gateModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly siteUrl: string;
  private readonly siteName: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(
      /\/$/,
      '',
    );
    this.visionModel = config.visionModel ?? DEFAULT_VISION_MODEL;
    this.gateModel = config.gateModel ?? DEFAULT_GATE_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.siteUrl = config.siteUrl ?? 'https://thegoodpantry.app';
    this.siteName = config.siteName ?? 'The Good Pantry';
  }

  async groceryGate(args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelGroceryGateResult>> {
    const content = await this.chat({
      model: this.gateModel,
      system: groceryGateSystemPrompt(args.locale),
      userText: groceryGateUserPrompt(args.images.length),
      images: args.images,
      jsonSchema: GROCERY_GATE_JSON_SCHEMA,
      maxTokens: 200,
    });
    const parsed = parseJsonContent(content.rawContent);
    if (!parsed.ok) {
      throw new SchemaViolationError(parsed.errors, content);
    }
    const validated = validateGroceryGateResult(parsed.value);
    if (!validated.ok) {
      throw new SchemaViolationError(validated.errors, content);
    }
    return {
      data: validated.value,
      model: content.model,
      usage: content.usage,
      rawContent: content.rawContent,
    };
  }

  async parseReceipt(args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelParseResult>> {
    const content = await this.chat({
      model: this.visionModel,
      system: receiptParseSystemPrompt(args.locale),
      userText: receiptParseUserPrompt({
        imageCount: args.images.length,
        locale: args.locale,
      }),
      images: args.images,
      jsonSchema: RECEIPT_PARSE_JSON_SCHEMA,
      maxTokens: 4096,
    });
    const parsed = parseJsonContent(content.rawContent);
    if (!parsed.ok) {
      throw new SchemaViolationError(parsed.errors, content);
    }
    const validated = validateModelParseResult(parsed.value);
    if (!validated.ok) {
      throw new SchemaViolationError(validated.errors, content);
    }
    return {
      data: validated.value,
      model: content.model,
      usage: content.usage,
      rawContent: content.rawContent,
    };
  }

  private async chat(args: {
    readonly model: string;
    readonly system: string;
    readonly userText: string;
    readonly images: readonly ReceiptImageInput[];
    readonly jsonSchema: unknown;
    readonly maxTokens: number;
  }): Promise<{
    readonly model: string;
    readonly usage: TokenUsage;
    readonly rawContent: string;
  }> {
    const userContent: ChatContentPart[] = [
      { type: 'text', text: args.userText },
      ...buildImageParts(args.images),
    ];

    const body = {
      model: args.model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: userContent },
      ],
      max_tokens: args.maxTokens,
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: args.jsonSchema,
      },
    };

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: OpenRouterChatResponse;
    try {
      json = JSON.parse(text) as OpenRouterChatResponse;
    } catch {
      safeLog('error', 'openrouter_non_json', {
        note: `status=${res.status}`,
      });
      throw new ModelError(`OpenRouter HTTP ${res.status}: non-JSON body`);
    }

    if (!res.ok) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      safeLog('error', 'openrouter_http_error', {
        note: `status=${res.status}`,
        model: args.model,
      });
      throw new ModelError(`OpenRouter error: ${msg}`);
    }

    const rawContent = json.choices?.[0]?.message?.content ?? '';
    if (!rawContent) {
      throw new ModelError('OpenRouter returned empty content');
    }

    return {
      model: json.model ?? args.model,
      usage: usageFrom(json),
      rawContent,
    };
  }
}

export class SchemaViolationError extends Error {
  readonly errors: readonly string[];
  readonly usage: TokenUsage;
  readonly model: string;
  readonly rawContent: string;

  constructor(
    errors: readonly string[],
    call: { usage: TokenUsage; model: string; rawContent: string },
  ) {
    super(`schema_violation:${errors.join(',')}`);
    this.name = 'SchemaViolationError';
    this.errors = errors;
    this.usage = call.usage;
    this.model = call.model;
    this.rawContent = call.rawContent;
  }
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

/** Fixture-backed client for tests. */
export class FixtureVisionClient implements VisionClient {
  constructor(
    private readonly impl: {
      gate?: ModelGroceryGateResult | (() => ModelGroceryGateResult);
      parse?:
        | ModelParseResult
        | (() => ModelParseResult)
        | (() => never);
      gateUsage?: TokenUsage;
      parseUsage?: TokenUsage;
      failParseTimes?: number;
      parseSequence?: Array<ModelParseResult | 'schema_error' | 'model_error'>;
    },
  ) {}

  private parseCalls = 0;

  async groceryGate(_args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelGroceryGateResult>> {
    const raw =
      typeof this.impl.gate === 'function' ? this.impl.gate() : this.impl.gate;
    if (!raw) {
      throw new ModelError('fixture_gate_missing');
    }
    return {
      data: raw,
      model: DEFAULT_GATE_MODEL,
      usage: this.impl.gateUsage ?? {
        promptTokens: 500,
        completionTokens: 40,
        totalTokens: 540,
      },
      rawContent: JSON.stringify(raw),
    };
  }

  async parseReceipt(_args: {
    readonly images: readonly ReceiptImageInput[];
    readonly locale: string;
  }): Promise<VisionCallResult<ModelParseResult>> {
    this.parseCalls += 1;
    if (this.impl.parseSequence) {
      const step = this.impl.parseSequence[this.parseCalls - 1];
      if (step === 'schema_error') {
        throw new SchemaViolationError(['fixture_schema'], {
          usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
          model: DEFAULT_VISION_MODEL,
          rawContent: '{bad',
        });
      }
      if (step === 'model_error') {
        throw new ModelError('fixture_model_error');
      }
      if (!step) throw new ModelError('fixture_sequence_exhausted');
      return {
        data: step,
        model: DEFAULT_VISION_MODEL,
        usage: this.impl.parseUsage ?? {
          promptTokens: 2000,
          completionTokens: 800,
          totalTokens: 2800,
        },
        rawContent: JSON.stringify(step),
      };
    }

    if (
      this.impl.failParseTimes !== undefined &&
      this.parseCalls <= this.impl.failParseTimes
    ) {
      throw new SchemaViolationError(['fixture_forced'], {
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
        model: DEFAULT_VISION_MODEL,
        rawContent: '{',
      });
    }

    const raw =
      typeof this.impl.parse === 'function' ? this.impl.parse() : this.impl.parse;
    if (!raw) throw new ModelError('fixture_parse_missing');
    return {
      data: raw,
      model: DEFAULT_VISION_MODEL,
      usage: this.impl.parseUsage ?? {
        promptTokens: 2000,
        completionTokens: 800,
        totalTokens: 2800,
      },
      rawContent: JSON.stringify(raw),
    };
  }
}

export function pricingFromEnv(env: {
  get(key: string): string | undefined;
}): ModelPricing {
  const p = env.get('RECEIPT_PROMPT_USD_PER_M');
  const c = env.get('RECEIPT_COMPLETION_USD_PER_M');
  return {
    promptPerMillionUsd: p ? Number(p) : DEFAULT_PRICING.promptPerMillionUsd,
    completionPerMillionUsd: c
      ? Number(c)
      : DEFAULT_PRICING.completionPerMillionUsd,
  };
}
