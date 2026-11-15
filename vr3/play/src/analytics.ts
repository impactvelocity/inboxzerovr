/**
 * PostHog (project 642580, US cloud): page views and clicks on their own, plus the game's own events (track()).
 * Every event carries product: 'inboxzero' and app: 'play', so the site's and the game's sit apart in one project.
 * The site at the root loads the same project (app/layout.tsx); same origin, so one visitor is one person across both.
 *
 * Not on a local address (the dev server, the headset over adb reverse), so testing stays out of the numbers:
 * ?ph=1 turns it on there, to check events.
 */
const KEY = 'phc_wHmU9xGagja5baLnbfXbBsDSepVnU7h5bBB6Do6DAdGs';
const HOST = 'https://us.i.posthog.com';

type PostHog = { init(key: string, config: object): void; register(props: object): void; capture(event: string, props?: object): void };
declare global { interface Window { posthog?: PostHog } }

const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|.*\.local$)/.test(location.hostname);
const on = !local || new URLSearchParams(location.search).get('ph') === '1';

if (on) {
  // PostHog's own loader: a stub that queues calls until array.js arrives from their CDN.
  (function(t: any,e: any){var o: any,n: any,p: any,r: any;e.__SV||(window.posthog&&(window.posthog as any).__loaded)||(window.posthog=e,e._i=[],e.init=function(i: any,s: any,a: any){function g(t: any,e: any){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t: any){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags on onFeatureFlags onSessionId identify setPersonProperties group resetGroups reset get_distinct_id get_session_id alias set_config startSessionRecording stopSessionRecording captureException opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)})(document,window.posthog||[]);
  window.posthog!.init(KEY, { api_host: HOST, defaults: '2025-05-24', person_profiles: 'identified_only',
    loaded: (ph: PostHog) => ph.register({ product: 'inboxzero', app: 'play' }) });      // (once it is ready: a register queued before then was lost on the site)
}

/** A game event to PostHog (nothing when it is off). */
export function track(event: string, props?: Record<string, unknown>) {
  try { window.posthog?.capture(event, props); } catch { /* never in the game's way */ }
}
