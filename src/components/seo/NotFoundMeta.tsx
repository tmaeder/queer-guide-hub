import { useEffect } from 'react';

interface NotFoundMetaProps {
  /** Document title for the 404 page (suffix " — Queer Guide" appended). */
  title?: string;
}

/**
 * Inject prerender-status-code + robots noindex meta tags into <head> while
 * mounted. SPA can't return a real 404 from the origin without SSR, but
 * crawlers and prerender services honor these signals. Optionally sets a
 * route-specific document title.
 */
export function NotFoundMeta({ title }: NotFoundMetaProps = {}) {
  useEffect(() => {
    const ensure = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const owned = !el;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      const previous = el.getAttribute('content');
      el.setAttribute('content', content);
      return () => {
        if (owned) {
          el?.parentNode?.removeChild(el);
        } else if (previous !== null) {
          el?.setAttribute('content', previous);
        }
      };
    };

    const cleanups = [
      ensure('prerender-status-code', '404'),
      ensure('robots', 'noindex, nofollow'),
    ];

    let prevTitle: string | null = null;
    if (title) {
      prevTitle = document.title;
      document.title = `${title} — Queer Guide`;
    }

    return () => {
      cleanups.forEach((fn) => fn());
      if (prevTitle !== null) document.title = prevTitle;
    };
  }, [title]);

  return null;
}
