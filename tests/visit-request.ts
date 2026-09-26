import type { Request } from '@playwright/test';
// Only the bounded baseline event is allowed alongside read-only file processing.
export function isVisitRequest(request: Request): boolean {
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/wp-json/mst-visits/v1/page-view') return false;
  try {
    const body = request.postDataJSON();
    return Object.keys(body).sort().join(',') === 'event_id,path,source,traffic,v'
      && body.v === 1 && body.traffic === 'test'
      && /^\/tools\/(?:[a-z0-9-]+\/)?$/.test(body.path)
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.event_id)
      && ['direct','internal','bing','google','baidu','duckduckgo','yahoo','ai','social','email','campaign','referral'].includes(body.source);
  } catch { return false; }
}
