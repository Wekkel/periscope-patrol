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

// Surface-engine hysteresis. These are deliberately a little forgiving: the boat
// has no snorkel, but a depth controller hovering at 2–5 ft must not strand her.
const DIESEL_CUTOFF_FT=12;
const DIESEL_RESTART_FT=8;

