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
const TOAST_RED   = /depth charge|DEPTH CHARGE|ATTACKING|attack run|is turning in|AIR ALARM|bomb|strafing|coming back with her guns|Men down|torpedo in the water|STAR SHELL|GROUNDING|hull impact|CANNOT DIVE|DIVE IS HELD|WILL NOT ANSWER|SHE IS ON THE BOTTOM|BOAT IS LOST|ALL STOP|Keel contact|pinging|active sonar|has sighted the boat/i;
const TOAST_GREEN = /ULTRA|AMPLIFYING|HIT \+|PATROL COMPLETE|OBJECTIVE COMPLETE|Alongside|SPLASH ONE|drove her away|sheering off|turns for home|turning away|lost you|lost the contact|lost contact|Off the bottom|clear to dive|Transit complete|Rearmed/i;

const Toast = {
  auto(msg, fallback){
    if (TOAST_RED.test(msg))   return this.bad(msg);
    if (TOAST_GREEN.test(msg)) return this.ok(msg);
    if (fallback === 'ok')     return this.ok(msg);
    return this.warn(msg);
  },
  show(msg, type='ok', duration=2300, replace=false) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    if(replace) c.replaceChildren();
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    // CSS owns the fade, JS owns the duration. Previously every toast faded
    // after 2 s even when bad() asked for 3.5 s, so the critical last line was
    // already invisible while its DOM node was still alive.
    div.style.setProperty('--toast-hold',Math.max(0.35,(duration-300)/1000)+'s');
    c.appendChild(div);
    setTimeout(() => div.remove(), duration + 60);
    return div;
  },
  clear(){ document.getElementById('toastContainer')?.replaceChildren(); },
  stop(msg,type='bad'){
    // The reason compressed time stopped gets the whole toast lane to itself,
    // but four seconds is enough to read it without turning it into a HUD panel.
    this.show(msg,type,3900,true);
  },
  ok(msg)   { this.show(msg,'ok'); },
  warn(msg) { this.show(msg,'warn'); },
  bad(msg)  { this.show(msg,'bad',3500); }
};

function transitStopToastKind(why){
  if(/waypoint reached|friendly port approach|shoaling water — take the conn/i.test(why)) return 'warn';
  if(/ULTRA|new orders|new contact|battery|fuel|air is going bad/i.test(why)) return 'warn';
  return 'bad';
}

