// ═══════════════════════════════════════════════════ TOAST SYSTEM
/* ── WHAT COLOUR IS THIS MESSAGE? ─────────────────────────────────────
   The three colours mean three different things to a player mid-attack,
   so they are decided by WHAT the message says, not by which call site
   happened to raise it:
     RED    someone is trying to kill you right now
     GREEN  intelligence, or something going your way
     AMBER  everything else worth a glance but not a reaction
   Order matters: red is tested first, so "she has lost you" reads green
   but "ATTACKING" stays red even in the same sentence.                */
const TOAST_RED   = /depth charge|DEPTH CHARGE|ATTACKING|attack run|is turning in|AIR ALARM|bomb|strafing|coming back with her guns|Men down|torpedo in the water|STAR SHELL|GROUNDING|hull impact|CANNOT DIVE|DIVE IS HELD|WILL NOT ANSWER|SHE IS ON THE BOTTOM|BOAT IS LOST|ALL STOP|Keel contact|has sighted the boat/i;
const TOAST_GREEN = /ULTRA|AMPLIFYING|HIT \+|PATROL COMPLETE|OBJECTIVE COMPLETE|Alongside|SPLASH ONE|drove her away|sheering off|turns for home|turning away|lost you|lost the contact|lost contact|Off the bottom|clear to dive|Transit complete|Rearmed/i;

const Toast = {
  /* Reading time, not message category, now owns the lifetime.  The old
     fixed 2.3 s made a 25-word refusal disappear just as the player reached
     its second line.  220-ish wpm is deliberately conservative for a game:
     the player is also steering, looking through an optic and reacting to
     alarms.  Explicit durations remain MINIMUMS, never shorten long text. */
  durationFor(msg,type='ok',requested=0){
    const text=String(msg??'').trim();
    const words=(text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)||[]).length;
    const chars=text.length;
    const readMs=850+words*275+Math.max(0,chars-80)*7;
    const floor=type==='bad'?4200:type==='warn'?3200:2800;
    const cap=type==='bad'?10500:9500;
    return Math.round(clamp(Math.max(floor,Number(requested)||0,readMs),floor,cap));
  },
  auto(msg, fallback){
    if (TOAST_RED.test(msg))   return this.bad(msg);
    if (TOAST_GREEN.test(msg)) return this.ok(msg);
    if (fallback === 'ok')     return this.ok(msg);
    return this.warn(msg);
  },
  show(msg, type='ok', duration=0, replace=false) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    duration=this.durationFor(msg,type,duration);
    if(replace) c.querySelectorAll('.toast:not(.sticky-toast)').forEach(x=>x.remove());
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    div.dataset.duration=String(duration);
    // CSS owns the fade; JS owns removal. Keep the final 300 ms for fade-out.
    div.style.setProperty('--toast-hold',Math.max(0.35,(duration-300)/1000)+'s');
    c.appendChild(div);
    setTimeout(() => div.remove(), duration + 60);
    return div;
  },
  action(msg,label,fn,duration=6500,type='ok'){
    const c=document.getElementById('toastContainer');if(!c)return null;
    duration=this.durationFor(msg,type,duration);
    const div=document.createElement('div');div.className=`toast ${type} action-toast`;div.dataset.duration=String(duration);
    const txt=document.createElement('span');txt.textContent=msg;div.appendChild(txt);
    const b=document.createElement('button');b.type='button';b.className='toast-action-btn';b.textContent=label;
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();try{fn?.();}finally{div.remove();}});
    div.appendChild(b);div.style.setProperty('--toast-hold',Math.max(.35,(duration-300)/1000)+'s');c.appendChild(div);
    setTimeout(()=>div.remove(),duration+60);return div;
  },
  stickyAction(msg,label,fn,type='ok',role=''){
    const c=document.getElementById('toastContainer');if(!c)return null;
    if(role)c.querySelectorAll(`.sticky-toast[data-role="${role}"]`).forEach(x=>x.remove());
    const div=document.createElement('div');div.className=`toast ${type} action-toast sticky-toast`;
    if(role)div.dataset.role=role;
    const txt=document.createElement('span');txt.textContent=msg;div.appendChild(txt);
    const b=document.createElement('button');b.type='button';b.className='toast-action-btn';b.textContent=label;
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();try{fn?.();}finally{div.remove();}});
    div.appendChild(b);c.appendChild(div);return div;
  },
  dismissRole(role){
    if(!role)return;
    document.querySelectorAll(`#toastContainer .sticky-toast[data-role="${role}"]`).forEach(x=>x.remove());
  },
  impactAction(msg,fn){
    const c=document.getElementById('toastContainer');if(!c)return null;
    c.querySelector?.('.impact-action-toast')?.remove?.();
    const div=this.action(msg,'VIEW IMPACT',fn,18000,'ok');
    if(div){div.classList.add('impact-action-toast');div.dataset.role='impact-action';}
    return div;
  },
  clear(){ document.getElementById('toastContainer')?.replaceChildren(); },
  stop(msg,type='bad'){
    // Stop reasons own the toast lane, but long reasons are allowed the time
    // their actual text needs rather than being cut off at four seconds.
    return this.show(msg,type,3900,true);
  },
  ok(msg)   { return this.show(msg,'ok'); },
  warn(msg) { return this.show(msg,'warn'); },
  bad(msg)  { return this.show(msg,'bad',3500); }
};

function transitStopToastKind(why){
  if(/waypoint reached|friendly port approach|shoaling water — take the conn/i.test(why)) return 'warn';
  if(/ULTRA|new orders|new contact|battery|fuel|air is going bad/i.test(why)) return 'warn';
  return 'bad';
}
