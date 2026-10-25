import { publicPages } from '../pages';
export const onRequest: PagesFunction = ({ request }) => publicPages(request);
