/* Central device/layout policy. Keep viewport classification here so renderers
   and controllers consume one snapshot instead of reading DOM state themselves. */
const LayoutService=(()=>{
  const PP_BREAKPOINTS=Object.freeze({phoneMax:600,tabletMax:1024});
  const listeners=new Set();let current=null,timer=0,viewportHeight=0;
  const storageKey=()=>globalThis.PP_BUILD?.storageKey?.('ss_ui')||'pp_ss_ui';
  const safeArea=()=>{const s=getComputedStyle(document.documentElement);const px=n=>Math.max(0,parseFloat(s.getPropertyValue(n))||0);return{top:px('env(safe-area-inset-top)'),right:px('env(safe-area-inset-right)'),bottom:px('env(safe-area-inset-bottom)'),left:px('env(safe-area-inset-left)')};};
  function forcedShell(){const q=new URLSearchParams(location.search).get('ui'),saved=localStorage.getItem(storageKey());return q==='touch'||q==='desk'?q:saved==='touch'||saved==='desk'?saved:null;}
  function measure(){const width=Math.max(0,Math.round(window.innerWidth||document.documentElement.clientWidth||0)),height=Math.max(0,Math.round(viewportHeight||window.innerHeight||document.documentElement.clientHeight||0));const fine=!!window.matchMedia?.('(pointer:fine)').matches;const device=width<=PP_BREAKPOINTS.phoneMax?'phone':width<=PP_BREAKPOINTS.tabletMax?'tablet':'desktop';const shell=forcedShell()||(device==='desktop'&&fine?'desk':'touch');const orientation=width>height?'landscape':'portrait';const uiScale=Math.max(.78,Math.min(2,Math.min(width,height)/430));return{device,pointer:fine?'fine':'coarse',orientation,shell,width,height,safeArea:safeArea(),uiScale};}
  const equal=(a,b)=>a&&b&&['device','pointer','orientation','shell','width','height','uiScale'].every(k=>a[k]===b[k])&&Object.keys(a.safeArea).every(k=>a.safeArea[k]===b.safeArea[k]);
  function notify(){const next=measure();if(equal(current,next))return;current=next;apply();listeners.forEach(fn=>{try{fn({...current,safeArea:{...current.safeArea}});}catch(e){console.error('[LAYOUT]',e);}});}
  function schedule(){clearTimeout(timer);timer=setTimeout(notify,120);}
  function get(){if(!current)current=measure();return{...current,safeArea:{...current.safeArea}};}
  function apply(){const l=get(),root=document.documentElement;root.dataset.lay=l.shell;root.dataset.dev=l.device;root.dataset.orient=l.orientation;}
  function setViewportHeight(h){const n=Math.round(Number(h)||0);if(n>200&&n!==viewportHeight){viewportHeight=n;document.documentElement.style.setProperty('--appH',n+'px');schedule();}}
  function subscribe(fn){listeners.add(fn);fn(get());return()=>listeners.delete(fn);}
  ['resize','orientationchange'].forEach(e=>window.addEventListener(e,schedule,{passive:true}));
  if(window.visualViewport){visualViewport.addEventListener('resize',schedule,{passive:true});visualViewport.addEventListener('scroll',schedule,{passive:true});}
  apply();
  return{PP_BREAKPOINTS,get,subscribe,apply,setViewportHeight};
})();
