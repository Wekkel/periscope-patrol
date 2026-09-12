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
const TOAST_RED   = /depth charge|DEPTH CHARGE|ATTACKING|attack run|is turning in|AIR ALARM|bomb|strafing|coming back with her guns|Men down|torpedo in the water|STAR SHELL|GROUNDING|hull impact|CANNOT DIVE|DIVE IS HELD|WILL NOT ANSWER|SHE IS ON THE BOTTOM|BOAT IS LOST|ALL STOP|KEEL MARGIN ALERT|Keel contact|has sighted the boat/i;
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
  action(msg,label,fn,duration=6500,type='ok',role=''){
    const c=document.getElementById('toastContainer');if(!c)return null;
    duration=this.durationFor(msg,type,duration);
    const div=document.createElement('div');div.className=`toast ${type} action-toast`;div.dataset.duration=String(duration);
    if(role){c.querySelectorAll(`.toast[data-role="${role}"]`).forEach(x=>x.remove());div.dataset.role=role;}
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
    document.querySelectorAll(`#toastContainer .toast[data-role="${role}"]`).forEach(x=>x.remove());
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

/* A game-native confirmation surface. Native confirm() leaves the naval UI,
   uses browser wording, and is especially oversized on Android. */
const DecisionDialog={
  confirm({title='CONFIRM ORDER',message='',confirmLabel='CONFIRM',cancelLabel='CANCEL',danger=false}={}){
    return new Promise(resolve=>{
      document.querySelector('.decision-overlay')?.remove();
      const overlay=document.createElement('div');overlay.className='decision-overlay';
      overlay.innerHTML=`<section class="decision-box" role="alertdialog" aria-modal="true" aria-labelledby="decisionTitle" aria-describedby="decisionMessage"><div class="decision-kicker">CAPTAIN'S AUTHORIZATION</div><h2 id="decisionTitle"></h2><p id="decisionMessage"></p><div class="decision-actions"><button type="button" data-decision="cancel"></button><button type="button" data-decision="confirm" class="${danger?'danger':'confirm'}"></button></div></section>`;
      overlay.querySelector('#decisionTitle').textContent=title;
      overlay.querySelector('#decisionMessage').textContent=message;
      overlay.querySelector('[data-decision="cancel"]').textContent=cancelLabel;
      overlay.querySelector('[data-decision="confirm"]').textContent=confirmLabel;
      let done=false;const finish=value=>{if(done)return;done=true;document.removeEventListener('keydown',key);overlay.remove();resolve(value);};
      const key=e=>{if(e.key==='Escape')finish(false);};document.addEventListener('keydown',key);
      overlay.addEventListener('click',e=>{const action=e.target.closest?.('[data-decision]')?.dataset.decision;if(action)finish(action==='confirm');else if(e.target===overlay)finish(false);});
      document.body.appendChild(overlay);overlay.querySelector('[data-decision="confirm"]')?.focus();
    });
  }
};

/* Every automatic time-compression stop (8×/16×/32× or a "skip until…") used
   to raise the SAME red "TIME COMPRESSION STOPPED" toast, whatever the reason
   — a waypoint being reached looked exactly as alarming as an aircraft
   diving on the boat. Red is supposed to mean "someone is trying to kill you
   right now" (see the colour rules above); most of these reasons are not
   that, so they should not read as an alarm. This was already the intent —
   this classifier existed — but nothing actually called it, so every stop
   still hard-coded 'bad'. Wired up in stopAutomaticTimeCompression() below. */
function transitStopToastKind(why){
  const w=String(why||'');
  // Something is actively attacking, closing on, or has already hurt the
  // boat — the only tier that should still read as a red alarm.
  if(/aircraft attack|the boat is lost|the boat has taken damage|new escort contact|escort now in sight|escort inside \d|collision risk|dangerously little water|searchlight contact|harbour defenses are stirring/i.test(w)) return 'bad';
  // A caution worth a glance, but nobody is shooting yet.
  if(/second air contact|air contact still active|^aircraft$|escorts are stirring|shoal(?:ing)? water|battery is low|fuel is running low|air is going bad|standing out of the patrol area/i.test(w)) return 'warn';
  // Everything else — a waypoint reached, new orders, a sighted convoy or
  // contact, an intelligence intercept, arriving somewhere friendly, or the
  // captain simply taking the conn back themselves — is neutral-to-good
  // news, not a threat, so it reads green like the rest of that news does.
  return 'ok';
}
