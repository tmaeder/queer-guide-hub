import { useEffect } from 'react';

/**
 * Inject prerender-status-code + robots noindex meta tags into <head> while
 * mounted. SPA can't return a real 404 from the origin without SSR, but
 * crawlers and prerender services honor these signals.
 */
export function NotFoundMeta() {
  useEffect(() => {
    const tags: HTMLMetaElement[] = [];

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
      tags.push(el);
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

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
