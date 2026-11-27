import type { Env } from '../_lib/sitemap';
import { rightsExportResponse } from '../_lib/rightsExport';

export const onRequestGet: PagesFunction<Env> = ({ env }) => rightsExportResponse(env, 'json');
