import { test, expect } from '@playwright/test';
import { isVisitRequest } from './visit-request';

test('hosted tools send only one bounded first-party PV, independently of GA choice', async ({ page }) => {
  const endpoint = '/wp-json/mst-visits/v1/page-view';
  const writes: unknown[] = [], unexpected: string[] = [];
  const external = process.env.MST_TOOLS_BASE_URL;
  const origin = 'https://mst-us.ai';
  if (!external) {
    await page.route(origin + '/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === endpoint) return route.fulfill({ status: 204 });
      const response = await fetch('http://127.0.0.1:4173' + new URL(request.url()).pathname);
      return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    });
  }
  await page.addInitScript(() => { localStorage.setItem('mst_us_analytics_consent_v1','declined'); });
  page.on('request', request => {
    if (request.method() === 'POST') {
      if (!isVisitRequest(request)) unexpected.push('Unexpected POST');
      writes.push(request.postDataJSON());
    }
    if (/googletagmanager|google-analytics/.test(request.url())) unexpected.push('Unexpected Google request');
  });
  page.on('pageerror', error => unexpected.push(error.message));
  await page.goto((external || origin) + '/tools/bom-compare/', { referer: 'https://cn.bing.com/search?q=PRIVATE-DRAWING' });
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({v:1,path:'/tools/bom-compare/',source:'bing',traffic:'test'});
  await page.getByRole('button',{name:'Try sample revisions'}).click();
  await expect(page.getByRole('button',{name:'Compare BOMs'})).toBeEnabled();
  expect(writes).toHaveLength(1);
  expect(JSON.stringify(writes)).not.toMatch(/PRIVATE|PART|description|quantity|file/i);
  expect(unexpected).toEqual([]);
  await expect(page.getByRole('link',{name:'Page visit privacy'})).toBeVisible();
});
