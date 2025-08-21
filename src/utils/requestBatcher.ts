// Request batching utility to reduce sequential API calls
type BatchedRequest = {
  id: string;
  query: () => Promise<any>;
  resolve: (data: any) => void;
  reject: (error: any) => void;
};

class RequestBatcher {
  private batches = new Map<string, BatchedRequest[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly batchDelay = 50; // 50ms batching window

  // Batch similar requests together
  batch<T>(key: string, query: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);
      const request: BatchedRequest = {
        id: requestId,
        query,
        resolve,
        reject,
      };

      // Add to batch
      if (!this.batches.has(key)) {
        this.batches.set(key, []);
      }
      this.batches.get(key)!.push(request);

      // Clear existing timer and set new one
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key)!);
      }

      this.timers.set(key, setTimeout(() => {
        this.executeBatch(key);
      }, this.batchDelay));
    });
  }

  private async executeBatch(key: string) {
    const requests = this.batches.get(key) || [];
    if (requests.length === 0) return;

    // Clear the batch
    this.batches.delete(key);
    this.timers.delete(key);

    // Execute all requests in parallel
    const promises = requests.map(async (request) => {
      try {
        const result = await request.query();
        request.resolve(result);
        return { success: true, result };
      } catch (error) {
        request.reject(error);
        return { success: false, error };
      }
    });

    await Promise.allSettled(promises);
  }

  // Clear all pending batches
  clear() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.batches.forEach(requests => {
      requests.forEach(request => {
        request.reject(new Error('Batch cleared'));
      });
    });
    this.batches.clear();
  }
}

// Global request batcher instance
export const requestBatcher = new RequestBatcher();

// Utility function for batching similar queries
export function batchedQuery<T>(key: string, query: () => Promise<T>): Promise<T> {
  return requestBatcher.batch(key, query);
}

// Parallel request execution with error isolation
export async function executeParallel<T>(
  requests: Array<() => Promise<T>>,
  options: {
    maxConcurrent?: number;
    continueOnError?: boolean;
  } = {}
): Promise<Array<{ success: boolean; data?: T; error?: any }>> {
  const { maxConcurrent = 5, continueOnError = true } = options;
  const results: Array<{ success: boolean; data?: T; error?: any }> = [];

  // Execute requests in chunks to avoid overwhelming the server
  for (let i = 0; i < requests.length; i += maxConcurrent) {
    const chunk = requests.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.allSettled(
      chunk.map(request => request())
    );

    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push({ success: true, data: result.value });
      } else {
        results.push({ success: false, error: result.reason });
        if (!continueOnError) {
          throw result.reason;
        }
      }
    });
  }

  return results;
}