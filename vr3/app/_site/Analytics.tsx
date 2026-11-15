import Script from 'next/script';

/**
 * PostHog (project 642580, US cloud) on the site: page views and clicks on their own. Every event carries
 * product: 'inboxzero' and app: 'site'; the game at /play/ loads the same project with app: 'play'
 * (play/src/analytics.ts). Off on a local address so testing stays out of the numbers; ?ph=1 turns it on there.
 */
const KEY = 'phc_wHmU9xGagja5baLnbfXbBsDSepVnU7h5bBB6Do6DAdGs';
const HOST = 'https://us.i.posthog.com';

// PostHog's own loader (a stub that queues calls until array.js arrives from their CDN), then init.
const SNIPPET = `(function(){
var local=/^(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|\\[::1\\]|.*\\.local$)/.test(location.hostname);
if(local&&new URLSearchParams(location.search).get('ph')!=='1')return;
!function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags on onFeatureFlags onSessionId identify setPersonProperties group resetGroups reset get_distinct_id get_session_id alias set_config startSessionRecording stopSessionRecording captureException opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(KEY)},{api_host:${JSON.stringify(HOST)},defaults:'2025-05-24',person_profiles:'identified_only',loaded:function(ph){ph.register({product:'inboxzero',app:'site'});}});
})();`;

export function Analytics() {
  return <Script id="posthog" strategy="afterInteractive">{SNIPPET}</Script>;
}
