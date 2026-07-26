/**
 * Client for the parse-receipt Edge Function.
 * Quota is charged on commit, not parse.
 */

import { getSupabaseClient } from '../../supabase/config';
import { dataUrlToBase64 } from './image-compress';
import type {
  AbandonSuccessResponse,
  CommitSuccessResponse,
  CompressedImage,
  ParseErrorResponse,
  ParseResponse,
} from './types';

export type ParseClient = {
  parse(input: {
    images: readonly CompressedImage[];
    locale?: string;
    householdId?: string;
  }): Promise<ParseResponse>;
  commit(input: {
    attemptId: string;
    committedLineCount: number;
  }): Promise<CommitSuccessResponse | ParseErrorResponse>;
  abandon(
    attemptId: string,
  ): Promise<AbandonSuccessResponse | ParseErrorResponse>;
};

function functionUrl(): string | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) return null;
  return `${envUrl.replace(/\/$/, '')}/functions/v1/parse-receipt`;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (anon) headers.apikey = anon;

  if (client) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (anon) headers.Authorization = `Bearer ${anon}`;
  } else if (anon) {
    headers.Authorization = `Bearer ${anon}`;
  }
  return headers;
}

async function postJson(body: unknown): Promise<unknown> {
  const url = functionUrl();
  if (!url) {
    return {
      ok: false,
      code: 'missing_secret',
      message:
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    } satisfies ParseErrorResponse;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify(body),
    });
    return (await res.json()) as unknown;
  } catch (err) {
    const offline =
      typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      ok: false,
      code: offline ? 'offline' : 'network',
      message:
        err instanceof Error
          ? err.message
          : offline
            ? 'You are offline'
            : 'Network error',
    } satisfies ParseErrorResponse;
  }
}

export const liveParseClient: ParseClient = {
  async parse({ images, locale, householdId }) {
    return (await postJson({
      action: 'parse',
      images: images.map((img) => ({
        data: dataUrlToBase64(img.dataUrl),
        mimeType: img.mimeType,
      })),
      locale: locale ?? 'en-US',
      householdId,
      retainImage: false,
    })) as ParseResponse;
  },

  async commit({ attemptId, committedLineCount }) {
    return (await postJson({
      action: 'commit',
      attemptId,
      committedLineCount,
    })) as CommitSuccessResponse | ParseErrorResponse;
  },

  async abandon(attemptId) {
    return (await postJson({
      action: 'abandon',
      attemptId,
    })) as AbandonSuccessResponse | ParseErrorResponse;
  },
};

/**
 * In-memory / fixture parse client for tests and offline demos.
 */
export function createFixtureParseClient(
  parseResult: ParseResponse,
  options: {
    onCommit?: (attemptId: string, count: number) => void;
    onAbandon?: (attemptId: string) => void;
  } = {},
): ParseClient {
  return {
    async parse() {
      return parseResult;
    },
    async commit({ attemptId, committedLineCount }) {
      options.onCommit?.(attemptId, committedLineCount);
      if (parseResult.ok && parseResult.attemptId === attemptId) {
        return {
          ok: true,
          attemptId,
          status: 'committed',
          quotaCharged: true,
          committedScansThisMonth: 1,
          scanLimit: 15,
        };
      }
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Unknown attempt',
        attemptId,
      };
    },
    async abandon(attemptId) {
      options.onAbandon?.(attemptId);
      return {
        ok: true,
        attemptId,
        status: 'abandoned',
        quotaCharged: false,
      };
    },
  };
}
