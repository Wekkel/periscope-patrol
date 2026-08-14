/* Simulation-to-UI boundary. Simulation records intent; the UI drains and
   materializes audio, toasts, saves and cinematic actions on its own clock. */
const PresentationBridge=(()=>{
  const MAX=96;
  function emit(state,type,payload={}){const q=state?.runtime?.effects;if(!q)return null;const e={id:(state.runtime.nextEffectId=(state.runtime.nextEffectId||0)+1),type,payload};q.push(e);if(q.length>MAX)q.splice(0,q.length-MAX);return e;}
  function take(state){const q=state?.runtime?.effects;if(!Array.isArray(q)||!q.length)return[];return q.splice(0,q.length);}
  function audioState(state,key,method,...args){if(!state?.runtime)return null;const s=state.runtime.audioState||(state.runtime.audioState={});s[key]={method,args};return s[key];}
  function audio(state){return new Proxy({}, {get:(_,key)=> (...args)=>emit(state,'audio',{method:key,args})});}
  function toast(state){return{show:(...args)=>emit(state,'toast',{method:'show',args}),ok:(...args)=>emit(state,'toast',{method:'ok',args}),warn:(...args)=>emit(state,'toast',{method:'warn',args}),bad:(...args)=>emit(state,'toast',{method:'bad',args}),action:(...args)=>emit(state,'toast',{method:'action',args}),clear:(...args)=>emit(state,'toast',{method:'clear',args})};}
  function save(state,method,...args){return emit(state,'save',{method,args});}
  function aar(state,method,...args){return emit(state,'aar',{method,args});}
  function ui(state,method,...args){return emit(state,'ui',{method,args});}
  function delayedAudio(state,delayMs,method,...args){return emit(state,'audio-delay',{delayMs,method,args});}
  function schedule(state,delayMs,command){return emit(state,'command-delay',{delayMs,command});}
  return{emit,take,audio,audioState,delayedAudio,schedule,toast,save,aar,ui};
})();
