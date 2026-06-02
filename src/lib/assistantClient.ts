/**
 * Client for the queer-guide-assistant worker (assistant.queer.guide).
 *
 * POST /assistant  { message, conversation_id?, user_id?, session_id? }
 *   → { conversation_id, reply, cards, grounding_ok, unverified_refs? }
 *
 * The worker runs a Workers AI tool-calling loop grounded in the search_documents
 * RPCs + AutoRAG knowledge_search; `cards` are the only thing the UI renders as
 * entities (grounding by construction). Non-streaming for now.
 */

import { getSessionId } from '@/lib/searchClient';

const ASSISTANT_URL =
  import.meta.env.VITE_ASSISTANT_URL || 'https://assistant.queer.guide';

/** A grounded entity card — mirrors the worker `Card` shape. */
export interface AssistantCard {
  objectID: string;
  type: string;
  title?: string;
  city?: string;
  country?: string;
  slug?: string;
  imageUrl?: string;
  category?: string;
  [key: string]: unknown;
}

export interface AssistantReply {
  conversation_id: string;
  reply: string;
  cards: AssistantCard[];
  grounding_ok: boolean;
  unverified_refs?: string[];
}

export interface AskAssistantArgs {
  message: string;
  conversationId?: string;
  userId?: string;
  signal?: AbortSignal;
}

export class AssistantException extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AssistantException';
  }
}

export async function askAssistant({
  message,
  conversationId,
  userId,
  signal,
}: AskAssistantArgs): Promise<AssistantReply> {
  const controller = new AbortController();
  // The tool loop can take a few seconds (embed + RPC + synthesis turn).
  const timeout = setTimeout(() => controller.abort('timeout'), 25_000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${ASSISTANT_URL}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        ...(conversationId && { conversation_id: conversationId }),
        ...(userId && { user_id: userId }),
        session_id: getSessionId(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = `assistant ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        /* non-JSON error body */
      }
      throw new AssistantException(detail, res.status);
    }

    return (await res.json()) as AssistantReply;
  } catch (err) {
    if (err instanceof AssistantException) throw err;
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new AssistantException('The guide took too long to respond.');
    }
    throw new AssistantException("Couldn't reach the guide.");
  } finally {
    clearTimeout(timeout);
  }
}
