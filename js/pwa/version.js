/* ═══════════════════════════════════════════════════ PWA / VERSION
   The build number lives in exactly one place: the VERSION line at the top
   of sw.js. Everything here only reads it. Three ways of asking, in order of
   reliability, so the chip is never blank:
     1. ask the running service worker over a MessagePort
     2. if there is no worker yet (first load, or a plain http server),
        fetch sw.js and read the line
     3. give up gracefully and say "dev"
   Tap the chip to copy the full build string — the first thing worth having
   when somebody reports a bug. */
const AppVersion = {
  value:null,
  show(v,updating){
    this.value=v;
    for(const id of ['appVerTouch','appVerDesk']){
      const el=document.getElementById(id);
      if(!el) continue;
      const dev=!!globalThis.PP_BUILD?.isDev;
      const patch=dev?Number(globalThis.PP_BUILD?.devPatch)||null:null;
      // The Pages workflow appends the AD commit hash to the DEV worker's
      // VERSION so every experimental deploy refreshes its offline shell. Keep
      // that SHA in title/copy diagnostics, while the narrow chip shows the
      // human patch number that testers and patch ZIPs use.
      const display=dev?String(v).replace(/-ad-[0-9a-f]+$/i,''):v;
      el.textContent='v'+display+(dev?` · AD${patch?` P${patch}`:''}`:'');
      el.classList.toggle('upd',!!updating);el.classList.toggle('dev',dev);
      el.title=`Periscope Patrol${dev?' DEV':''}${patch?` patch ${patch}`:''} · build ${v}`+(updating?' — an update is waiting':'');
    }
  },
  async fromWorker(reg){
    // may be called with no registration at all — off a file:// URL, in a
    // browser without service workers, or from a test harness
    const sw=(typeof navigator!=='undefined'&&navigator.serviceWorker)||null;
    // On the first /dev/ visit the page can still be controlled by the broader
    // production worker while the nested DEV worker is installing. Do not ask
    // that wrong-scope controller for its version or the AD chip briefly reports
    // the production build. Falling back to ./sw.js is both cheap and correct.
    let controller=(sw&&sw.controller)||null;
    if(controller&&reg?.scope&&controller.scriptURL){
      try{
        const scopePath=new URL(reg.scope).pathname;
        const scriptPath=new URL(controller.scriptURL).pathname;
        if(!scriptPath.startsWith(scopePath))controller=null;
      }catch(_){ controller=null; }
    }
    const w=(reg&&(reg.active||reg.waiting))||controller||null;
    if(!w||typeof MessageChannel==='undefined') return null;
    return new Promise(res=>{
      const ch=new MessageChannel();
      const t=setTimeout(()=>res(null),1500);
      ch.port1.onmessage=e=>{clearTimeout(t);res(e.data&&e.data.version||null);};
      try{ w.postMessage({type:'GET_VERSION'},[ch.port2]); }catch(e){clearTimeout(t);res(null);}
    });
  },
  async fromFile(){
    try{
      const r=await fetch('./sw.js',{cache:'no-store'});
      if(!r.ok) return null;
      const m=/VERSION\s*=\s*['"]([^'"]+)['"]/.exec(await r.text());
      return m?m[1]:null;
    }catch(e){ return null; }
  },
  async resolve(reg){
    let v=await this.fromWorker(reg);
    if(!v) v=await this.fromFile();
    this.show(v||'dev');
  }
};

(function initPWA(){
  AppVersion.show('…');
  if(!('serviceWorker' in navigator)||location.protocol==='file:'){
    // opened straight off the disk: no worker possible, read the file if we can
    AppVersion.resolve(null);
    return;
  }
  const bar=document.getElementById('updBar');
  const openBar=reg=>{
    if(!bar) return;
    bar.classList.add('on');
    AppVersion.show(AppVersion.value||'…',true);
    document.getElementById('updLater').onclick=()=>bar.classList.remove('on');
    document.getElementById('updNow').onclick=()=>{
      const w=reg.waiting||reg.installing;
      if(w){
        // the worker steps aside, then we come back up on the new build
        navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
        w.postMessage({type:'SKIP_WAITING'});
        setTimeout(()=>location.reload(),1200);      // belt and braces
      } else location.reload();
    };
  };
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    AppVersion.resolve(reg);
    if(reg.waiting&&navigator.serviceWorker.controller) openBar(reg);
    reg.addEventListener('updatefound',()=>{
      const nw=reg.installing;
      if(!nw) return;
      nw.addEventListener('statechange',()=>{
        // "installed" with a controller already running means: this is an
        // update, not a first install. Never swap under a patrol in progress.
        if(nw.state==='installed'&&navigator.serviceWorker.controller) openBar(reg);
      });
    });
    // check for a new build when the game comes back to the foreground
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden) reg.update().catch(()=>{});
    });
  }).catch(()=>AppVersion.resolve(null));
})();

// tap the chip to copy the build string
for(const id of ['appVerTouch','appVerDesk']){
  document.getElementById(id)?.addEventListener('click',()=>{
    const patch=globalThis.PP_BUILD?.isDev?(Number(globalThis.PP_BUILD?.devPatch)||null):null;
    const contract=globalThis.PP_BUILD?.touchUiContract?.()||'unavailable';
    const s=`Periscope Patrol${globalThis.PP_BUILD?.isDev?' AD DEV':''}${patch?` patch ${patch}`:''} v${AppVersion.value||'?'} · touch-ui ${contract} · ${navigator.userAgent}`;
    navigator.clipboard?.writeText(s).then(()=>Toast.ok('Build details copied'),
                                          ()=>Toast.warn('v'+(AppVersion.value||'?')));
  });
}
