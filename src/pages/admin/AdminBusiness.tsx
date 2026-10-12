import { Navigate, useParams, useSearchParams } from 'react-router';

/** Compatibility bridge for Business bookmarks and linked records. */
export default function AdminBusiness() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (next.get('tab') === 'review') return <Navigate replace to="/admin/quality" />;
  if (id) {
    next.set('edit', id);
    next.delete('tab');
  }
  if (next.has('role')) {
    next.set('roles', next.get('role')!);
    next.delete('role');
  }
  return <Navigate replace to={`/admin/content/organizations${next.size ? `?${next}` : ''}`} />;
}
