/* MST visit baseline v1. Shared verbatim by both overseas sites and tools.
 * No visitor storage, third-party transport, query/referrer strings or tool inputs.
 */
(function (win) {
  'use strict';
  if (!win || win.MSTSiteVisits) return;
  var sent = false;
  var hosts = ['mst-sg.com', 'www.mst-sg.com', 'mst-us.ai', 'www.mst-us.ai'];
  function read(store, key) { try { return win[store].getItem(key); } catch (_) { return null; } }
  function remember(store, key, value) {
    try { if (value === null) win[store].removeItem(key); else win[store].setItem(key, value); } catch (_) { /* Optional exclusion preference. */ }
  }
  function params() { return new URLSearchParams(win.location.search || ''); }
  function isInternal() {
    var flag = params().get('mst_internal');
    if (/^(1|true|on|enable)$/.test(flag || '')) remember('localStorage', 'mst_internal_traffic', '1');
    if (/^(0|false|off|clear|disable)$/.test(flag || '')) remember('localStorage', 'mst_internal_traffic', null);
    return read('localStorage', 'mst_internal_traffic') === '1' || /(?:^|;\s*)mst_internal_traffic=1(?:;|$)/.test(win.document.cookie || '');
  }
  function isTest() {
    var q = params();
    if (q.get('mst_analytics_test') === '0') remember('sessionStorage', 'mst_analytics_test', null);
    var preview = false;
    try { preview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(win.document.referrer).hostname); } catch (_) { /* Empty referrer. */ }
    var explicit = q.get('mst_analytics_test') === '1' || /^(internal[-_]qa|qa|test|e2e)$/i.test(q.get('utm_source') || '') || preview;
    if (explicit) remember('sessionStorage', 'mst_analytics_test', '1');
    return win.navigator.webdriver === true || explicit || read('sessionStorage', 'mst_analytics_test') === '1';
  }
  function privacyOptOut() { return win.navigator.globalPrivacyControl === true || win.navigator.doNotTrack === '1' || win.doNotTrack === '1'; }
  function publicPath(path) {
    if (typeof path !== 'string' || path.length > 240 || !/^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]*(?:\.html)?\/?$/i.test(path)) return null;
    if (/^\/(?:wp-|api(?:\/|$)|adviser-api|drawingdiff(?:\/|$)|go(?:\/|$)|login|admin|account|checkout|preview)/i.test(path)) return null;
    return path.replace(/\/index\.html$/, '/');
  }
  function source(referrer, query, host) {
    var q = new URLSearchParams(query || '');
    var campaign = (q.get('utm_source') || '').toLowerCase();
    if (/^(bing|cn\.bing\.com|bing\.com)$/.test(campaign)) return 'bing';
    if (/^(google|google\.com)$/.test(campaign)) return 'google';
    if (/^(email|newsletter)$/.test(campaign)) return 'email';
    if (campaign) return 'campaign';
    var ref;
    try { ref = new URL(referrer).hostname.toLowerCase(); } catch (_) { return 'direct'; }
    if (ref.replace(/^www\./, '') === host.replace(/^www\./, '')) return 'internal';
    if (/(^|\.)bing\.(com|cn)$/.test(ref)) return 'bing';
    if (/(^|\.)google\.(com|co\.uk|com\.sg|com\.au|co\.jp|de|fr|ca|co\.in|es|it|nl|com\.hk|com\.tw)$/.test(ref)) return 'google';
    if (/(^|\.)baidu\.com$/.test(ref)) return 'baidu';
    if (/(^|\.)duckduckgo\.com$/.test(ref)) return 'duckduckgo';
    if (/(^|\.)yahoo\.(com|co\.jp)$/.test(ref)) return 'yahoo';
    if (/(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com)$/.test(ref)) return 'ai';
    if (/(^|\.)(linkedin\.com|facebook\.com|x\.com|t\.co|reddit\.com)$/.test(ref)) return 'social';
    return 'referral';
  }
  function optionalAllowed() { return !isInternal() && !isTest() && !privacyOptOut(); }
  function start() {
    if (sent || hosts.indexOf(win.location.hostname) === -1 || win.MST_VISITS_DISABLED || isInternal() || privacyOptOut()) return;
    if (win.document.visibilityState !== 'visible' || win.document.prerendering) return;
    var path = publicPath(win.location.pathname);
    if (!path || typeof win.fetch !== 'function' || !win.crypto || typeof win.crypto.randomUUID !== 'function') return;
    var payload = { v: 1, event_id: win.crypto.randomUUID(), path: path, source: source(win.document.referrer || '', win.location.search, win.location.hostname), traffic: isTest() ? 'test' : 'browser' };
    sent = true;
    // Deliberately no retries: reloads are new documents; duplicate UUIDs are also
    // rejected by the server. A failed collector never blocks the public page.
    try {
      win.fetch('/wp-json/mst-visits/v1/page-view', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        referrerPolicy: 'origin', headers: { 'Content-Type': 'application/json', 'X-MST-Visits': '1' }, body: JSON.stringify(payload)
      }).then(function (response) { return response.arrayBuffer(); }).catch(function () {});
    } catch (_) { /* Best-effort measurement, no application dependency. */ }
  }
  win.MSTSiteVisits = { version: 1, start: start, source: source, publicPath: publicPath, isInternal: isInternal, isTest: isTest, optionalAllowed: optionalAllowed };
  win.document.addEventListener('visibilitychange', start);
  win.document.addEventListener('prerenderingchange', start);
  start();
})(typeof window === 'undefined' ? null : window);
