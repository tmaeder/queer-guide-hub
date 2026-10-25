export interface QueueReading {
  available: boolean;
  backlog_count: number | null;
  backlog_bytes: number | null;
  oldest_message_at: string | null;
}

/** Measurements only: never pull, acknowledge, purge or publish queue messages. */
export async function readQueueMetrics(
  queue: Pick<Queue, 'metrics'> | undefined,
): Promise<QueueReading> {
  const unavailable: QueueReading = {
    available: false,
    backlog_count: null,
    backlog_bytes: null,
    oldest_message_at: null,
  };
  try {
    if (!queue) return unavailable;
    const result = await queue.metrics();
    if (
      !Number.isSafeInteger(result.backlogCount) ||
      result.backlogCount < 0 ||
      !Number.isSafeInteger(result.backlogBytes) ||
      result.backlogBytes < 0
    )
      return unavailable;
    // Current runtime types expose Date; the JS API documentation also describes
    // epoch milliseconds. Both representations retain 0 as an unknown timestamp.
    const oldest: unknown = result.oldestMessageTimestamp;
    const milliseconds = oldest instanceof Date ? oldest.getTime() : oldest;
    if (
      milliseconds !== undefined &&
      (typeof milliseconds !== 'number' ||
        !Number.isFinite(milliseconds) ||
        milliseconds < 0 ||
        !Number.isFinite(new Date(milliseconds).getTime()))
    )
      return unavailable;
    return {
      available: true,
      backlog_count: result.backlogCount,
      backlog_bytes: result.backlogBytes,
      oldest_message_at:
        result.backlogCount > 0 && typeof milliseconds === 'number' && milliseconds > 0
          ? new Date(milliseconds).toISOString()
          : null,
    };
  } catch {
    return unavailable;
  }
}
