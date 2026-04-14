import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

/**
 * Handles incoming shares from the Web Share Target API.
 * Reads title/text/url from query params and redirects to search.
 */
export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useLocalizedNavigate();

  useEffect(() => {
    const url = params.get('url') || '';
    const text = params.get('text') || '';
    const title = params.get('title') || '';

    // Build a search query from whatever was shared
    const query = (title || text || url).trim();

    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [params, navigate]);

  return null;
}
