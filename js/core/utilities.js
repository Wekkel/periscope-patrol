// ═══════════════════════════════════════════════════ UTILITIES
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const degToRad=d=>d*Math.PI/180;
const radToDeg=r=>r*180/Math.PI;
const normDeg=d=>((d%360)+360)%360;
const lerpAngle=(f,t,x)=>normDeg(f+shortDelta(f,t)*x);
const shortDelta=(f,t)=>{const d=normDeg(t-f+180)-180;return d===-180?180:d;};
const fmtDeg=v=>`${Math.round(normDeg(v)).toString().padStart(3,'0')}°`;
const knotsNmSec=k=>k/3600;
const bearingBetween=(a,b)=>normDeg(radToDeg(Math.atan2(b.xNm-a.xNm,-(b.yNm-a.yNm))));
const distNm=(a,b)=>Math.hypot(a.xNm-b.xNm,a.yNm-b.yNm);
const fmtTime=s=>{const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;};


/* ═══════════════════════════════════════════════════ BUILD CHANNEL
   Production and Atlantic DEV are served below the same GitHub Pages origin.
   Web Storage is origin-scoped, so a /dev/ build MUST NOT reuse production
   keys or an experimental patrol could overwrite the player's real career.

   Do not turn this into device fingerprinting or a security gate. The URL path
   is only a deployment channel selector. Production deliberately keeps every
   legacy key byte-for-byte unchanged; DEV prefixes its keys so an experimental
   patrol cannot overwrite production during the Android dual-install test.

   This does NOT make same-origin PWAs fully isolated: uninstall/site-data and
   permissions remain origin-level concerns. Dual install therefore has a device
   acceptance gate and production profiles must be backed up first. */
const PP_BUILD=(()=>{
  const path=(typeof location!=='undefined'&&location.pathname)||'';
  const isDev=/(?:^|\/)dev(?:\/|$)/i.test(path);
  const storagePrefix=isDev?'ppdev_':'';
  const api={channel:isDev?'atlantic-dev':'production',isDev,storagePrefix,
    storageKey:key=>storagePrefix+String(key)};
  return Object.freeze(api);
})();
globalThis.PP_BUILD=PP_BUILD;
if(typeof document!=='undefined'){
  document.documentElement.dataset.build=PP_BUILD.isDev?'dev':'prod';
  if(PP_BUILD.isDev){
    document.title='Periscope Patrol DEV';
    const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(apple)apple.setAttribute('content','Periscope DEV');
  }
}

// Surface-engine hysteresis. These are deliberately a little forgiving: the boat
// has no snorkel, but a depth controller hovering at 2–5 ft must not strand her.
const DIESEL_CUTOFF_FT=12;
const DIESEL_RESTART_FT=8;

