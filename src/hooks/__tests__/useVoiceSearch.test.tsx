import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVoiceSearch } from '../useVoiceSearch';

describe('useVoiceSearch', () => {
  beforeEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('reports unsupported when SpeechRecognition is missing', () => {
    const { result } = renderHook(() => useVoiceSearch());
    expect(result.current.supported).toBe(false);
  });

  it('detects support when SpeechRecognition is available', () => {
    class FakeRec {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      start() {}
      stop() {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRec;
    const { result } = renderHook(() => useVoiceSearch());
    expect(result.current.supported).toBe(true);
  });
});
