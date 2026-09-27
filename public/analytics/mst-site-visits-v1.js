/* MST visit baseline v1. Shared verbatim by both overseas sites and tools.
 * No persistent visitor IDs, third-party transport, query/referrer strings or tool inputs.
 */
(function (win) {
  'use strict';
  if (!win || win.MSTSiteVisits) return;
  var sent = false, redirecting = false, landingSource = null;
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
    if (/^(github|github\.com)$/.test(campaign)) return 'github';
    if (/^(email|newsletter)$/.test(campaign)) return 'email';
    if (campaign) return 'campaign';
    var ref;
    try { ref = new URL(referrer).hostname.toLowerCase(); } catch (_) { return 'direct'; }
    if (ref.replace(/^www\./, '') === host.replace(/^www\./, '')) return 'internal';
    if (/(^|\.)bing\.(com|cn)$/.test(ref)) return 'bing';
    if (/(^|\.)google\.(com|co\.uk|com\.sg|com\.au|co\.jp|de|fr|ca|co\.in|es|it|nl|com\.hk|com\.tw)$/.test(ref)) return 'google';
    if (/(^|\.)github\.com$/.test(ref)) return 'github';
    if (/(^|\.)baidu\.com$/.test(ref)) return 'baidu';
    if (/(^|\.)duckduckgo\.com$/.test(ref)) return 'duckduckgo';
    if (/(^|\.)yahoo\.(com|co\.jp)$/.test(ref)) return 'yahoo';
    if (/(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com)$/.test(ref)) return 'ai';
    if (/(^|\.)(linkedin\.com|facebook\.com|x\.com|t\.co|reddit\.com)$/.test(ref)) return 'social';
    return 'referral';
  }
  var redirectKey = 'mst_locale_visit_source_v1';
  var sourceBuckets = ['direct','internal','bing','google','baidu','duckduckgo','yahoo','ai','social','email','campaign','github','referral'];
  function prepareLanguageRedirect(nextPath) {
    if (win.location.hostname.replace(/^www\./, '') !== 'mst-sg.com' || !publicPath(nextPath)
        || !publicPath(win.location.pathname) || /^\/(en|zh|es|ar|ja)(?:\/|$)/.test(win.location.pathname)
        || !/^\/(zh|es|ar|ja)\//.test(nextPath) || nextPath.replace(/^\/(zh|es|ar|ja)/, '') !== win.location.pathname) return;
    redirecting = true;
    if (isInternal() || privacyOptOut()) return;
    isTest(); // Preserve an explicit/local-preview QA marker before referrer changes.
    remember('sessionStorage', redirectKey, JSON.stringify({ path: nextPath, source: source(win.document.referrer, win.location.search, win.location.hostname), expires: Date.now() + 30000 }));
  }
  function pageSource() {
    var current = source(win.document.referrer || '', win.location.search, win.location.hostname);
    var raw = read('sessionStorage', redirectKey);
    if (!raw) return current;
    remember('sessionStorage', redirectKey, null);
    try {
      var handoff = JSON.parse(raw), ref = new URL(win.document.referrer), now = Date.now();
      if (win.location.hostname.replace(/^www\./, '') === 'mst-sg.com' && current === 'internal'
          && Object.keys(handoff).sort().join(',') === 'expires,path,source'
          && handoff.path === win.location.pathname && /^\/(zh|es|ar|ja)\//.test(handoff.path)
          && ref.origin === win.location.origin && handoff.path.replace(/^\/(zh|es|ar|ja)/, '') === ref.pathname
          && typeof handoff.expires === 'number' && handoff.expires >= now && handoff.expires <= now + 30000
          && sourceBuckets.indexOf(handoff.source) !== -1) return handoff.source;
    } catch (_) { /* Invalid or expired handoff is discarded. */ }
    return current;
  }
  function optionalAllowed() { return !redirecting && !isInternal() && !isTest() && !privacyOptOut(); }
  function start() {
    if (sent || redirecting || win.document.readyState === 'loading' || hosts.indexOf(win.location.hostname) === -1 || win.MST_VISITS_DISABLED || isInternal() || privacyOptOut()) return;
    if (landingSource === null) landingSource = pageSource();
    if (win.document.visibilityState !== 'visible' || win.document.prerendering) return;
    var path = publicPath(win.location.pathname);
    if (!path || typeof win.fetch !== 'function' || !win.crypto || typeof win.crypto.randomUUID !== 'function') return;
    var payload = { v: 1, event_id: win.crypto.randomUUID(), path: path, source: landingSource, traffic: isTest() ? 'test' : 'browser' };
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
  // Per-attempt random IDs live only in memory, never cookies or storage.
  var toolNames = ["drawing-to-bom", "bom-compare", "bom-check", "title-block-reader", "pid-tag-check", "drawing-register-compare", "gds-handoff-manifest", "pid-bom-checker", "uhp-gas-stick-checklist", "pid-tag-parser", "mpw-node-selection-advisor", "mpw-alternative-route-finder", "report-revision-check", "ai-pid-feasibility-checker", "pdk-checklist", "mpw-shuttle-finder", "mpw-readiness-checker", "pid-assembly-intake", "obsolete-parts-rfq-cleaner", "mpw-planner", "package-selector", "mpw-procurement-timeline", "mpw-estimator", "mpw-rfq-pack", "bom-rfq-normalizer", "mpw-gds"], usageSent = 0;
  function currentTool() {
    var match = win.location.pathname.match(/^\/(?:zh\/|es\/|ar\/|ja\/)?tools\/([a-z0-9-]+)\/(?:index\.html)?$/);
    return match && toolNames.indexOf(match[1]) !== -1 ? match[1] : null;
  }
  function usage(action, mode, runId, tool) {
    try {
      if (usageSent >= 100 || redirecting || hosts.indexOf(win.location.hostname) === -1 || win.MST_VISITS_DISABLED
          || isInternal() || privacyOptOut() || (win.document.visibilityState !== 'visible' && (action === 'tool_start' || action === 'resource_download')) || win.document.prerendering
          || typeof win.fetch !== 'function' || !win.crypto || !win.crypto.randomUUID || !publicPath(win.location.pathname)) return;
      if (['tool_start','tool_complete','tool_export','resource_download'].indexOf(action) === -1
          || ['sample','provided','default'].indexOf(mode) === -1 || !tool
          || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId)) return;
      if (landingSource === null) landingSource = pageSource();
      var payload = {v:2,event_id:win.crypto.randomUUID(),path:publicPath(win.location.pathname),source:landingSource,
        traffic:isTest()?'test':'browser',action:action,mode:mode,run_id:runId,tool:tool};
      usageSent++;
      win.fetch('/wp-json/mst-visits/v1/tool-event', {method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,
        referrerPolicy:'origin',headers:{'Content-Type':'application/json','X-MST-Visits':'1'},body:JSON.stringify(payload)})
        .then(function(response){return response.arrayBuffer();}).catch(function(){});
      return true;
    } catch (_) { /* Measurement must never interrupt a tool. */ }
  }
  function begin(mode) {
    var id = '', tool = currentTool(), completed = false, exported = false;
    try { id = win.crypto.randomUUID(); } catch (_) { /* Unsupported browser. */ }
    var started = usage('tool_start',mode,id,tool) === true;
    return {
      complete:function(){if(started&&!completed)completed=usage('tool_complete',mode,id,tool)===true;},
      export:function(){if(completed&&!exported)exported=usage('tool_export',mode,id,tool)===true;}
    };
  }
  // A static resource click is a download request, not proof of saving a file.
  win.document.addEventListener('click',function(event){
    try {
      if (!event.isTrusted || event.defaultPrevented || event.button !== 0) return;
      var a=event.target.closest('a[href]'); if(!a) return;
      var url=new URL(a.href,win.location.href);
      var handbook = a.hasAttribute('download') && ['/tools/handbook/index.html','/tools/mpw-handoff-handbook/index.html','/tools/samples/mpw-handoff-lab/handbook.html'].indexOf(url.pathname) !== -1;
      var resource = /\.(pdf|csv|zip)$/i.test(url.pathname) && /^\/(?:tools\/(?:labs|samples)\/|wp-content\/themes\/[^/]+\/assets\/downloads\/)/.test(url.pathname);
      if(url.origin!==win.location.origin || (!handbook && !resource)) return;
      usage('resource_download', /^\/tools\/(labs|samples)\//.test(url.pathname)?'sample':'default',win.crypto.randomUUID(),'resource');
    } catch (_) { /* No raw link, file name or query is transmitted. */ }
  });
  win.MSTSiteVisits = { version: 2, begin: begin, start: start, source: source, prepareLanguageRedirect: prepareLanguageRedirect, publicPath: publicPath, isInternal: isInternal, isTest: isTest, optionalAllowed: optionalAllowed };
  win.document.addEventListener('DOMContentLoaded', start);
  win.document.addEventListener('visibilitychange', start);
  win.document.addEventListener('prerenderingchange', start);
  start();
})(typeof window === 'undefined' ? null : window);
