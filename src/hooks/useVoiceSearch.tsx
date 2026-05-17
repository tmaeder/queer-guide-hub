import { useCallback, useEffect, useRef, useState } from 'react';

type AnyWindow = Window & {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
};

/**
 * Web Speech API wrapper. Returns `{ supported, listening, start, stop, transcript }`.
 * Progressive enhancement — unsupported browsers report `supported: false`.
 */
export function useVoiceSearch(lang = 'en-US') {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Ctor =
      (window as AnyWindow).SpeechRecognition ||
      (window as AnyWindow).webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor =
      (window as AnyWindow).SpeechRecognition ||
      (window as AnyWindow).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (text) setTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, transcript, start, stop };
}
