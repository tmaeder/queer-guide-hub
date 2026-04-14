import type { BookingProvider, BookingVertical, BookingSearchParams, BookingResult } from './types';

class BookingProviderRegistry {
  private providers = new Map<string, BookingProvider>();

  register(provider: BookingProvider) {
    this.providers.set(`${provider.vertical}:${provider.name}`, provider);
  }

  getProviders(vertical: BookingVertical): BookingProvider[] {
    return Array.from(this.providers.values()).filter(p => p.vertical === vertical);
  }

  getProvider(vertical: BookingVertical, name: string): BookingProvider | undefined {
    return this.providers.get(`${vertical}:${name}`);
  }

  async search(params: BookingSearchParams): Promise<BookingResult[]> {
    const providers = this.getProviders(params.vertical);
    if (providers.length === 0) return [];

    const results = await Promise.allSettled(
      providers.map(p => p.search(params))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<BookingResult[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => a.price - b.price);
  }
}

export const bookingRegistry = new BookingProviderRegistry();
