/** Snapshot metadata stored on `messages.metadata` for message_type='entity_share'. */
export interface EntityShareMeta {
  kind: 'entity_share';
  entity_table?: string | null;
  entity_id?: string | null;
  title: string;
  /** Pre-formatted context line, e.g. "Jul 12 · SchwuZ, Berlin". Omitted when gated. */
  subtitle?: string | null;
  /** Omitted when gated. */
  image_url?: string | null;
  path: string;
  /** Safety-gated entity: card renders title-only; destination page enforces the gate. */
  gated?: boolean;
}

export function isEntityShareMeta(meta: unknown): meta is EntityShareMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    (meta as { kind?: string }).kind === 'entity_share' &&
    typeof (meta as { title?: unknown }).title === 'string' &&
    typeof (meta as { path?: unknown }).path === 'string'
  );
}
