/* ═══════════════════════════════════════════════════ IN-APP DROP-DOWN
   Wraps a native <select> so the list is drawn by us instead of by the
   operating system. The select keeps the value and keeps firing 'change',
   so nothing that listened to it needs to know this happened. */
const Picker={
  menu:null, veil:null, open:null,

  ensure(){
    if(this.menu) return;
    this.veil=document.createElement('div'); this.veil.id='pkVeil';
    this.menu=document.createElement('div'); this.menu.id='pkMenu';
    document.body.appendChild(this.veil); document.body.appendChild(this.menu);
    this.veil.addEventListener('pointerdown',()=>this.close(),{passive:true});
    window.addEventListener('resize',()=>this.close(),{passive:true});
  },

  enhance(sel){
    // a select that is not in the document yet (or at all) is left alone
    if(!sel||sel._pk||!sel.parentNode||!document.body) return;
    sel._pk=true;
    const wrap=document.createElement('span');
    wrap.className='pk';
    sel.parentNode.insertBefore(wrap,sel);
    wrap.appendChild(sel);
    const btn=document.createElement('button');
    btn.type='button'; btn.className='pk-btn';
    wrap.appendChild(btn);
    const label=()=>{
      const o=sel.options[sel.selectedIndex];
      btn.textContent=o?o.textContent:'';
    };
    label();
    sel.addEventListener('change',label);
    // some code sets .value directly; catch that too
    sel._pkLabel=label;
    btn.addEventListener('click',e=>{ e.preventDefault(); this.show(sel,btn); },{passive:false});
    return btn;
  },

  show(sel,btn){
    this.ensure();
    if(this.open===sel){ this.close(); return; }
    this.close();
    this.open=sel; btn.classList.add('open');
    this.menu.innerHTML='';
    [...sel.options].forEach((o,i)=>{
      // a rule before the first "skip" entry: those are actions, not scales
      if(/^skip/.test(o.value)&&!/^skip/.test(sel.options[i-1]?.value||''))
        this.menu.appendChild(document.createElement('hr'));
      const b=document.createElement('button');
      b.type='button'; b.textContent=o.textContent;
      if(i===sel.selectedIndex) b.className='sel';
      b.addEventListener('click',()=>{
        sel.value=o.value;
        sel.dispatchEvent(new Event('change',{bubbles:true}));
        sel._pkLabel&&sel._pkLabel();
        buzz(8); this.close();
      },{passive:true});
      this.menu.appendChild(b);
    });
    this.menu.classList.add('on'); this.veil.classList.add('on');
    // place it against the button, then nudge it back on screen
    const r=btn.getBoundingClientRect();
    const vw=innerWidth, vh=innerHeight;
    this.menu.style.left='0px'; this.menu.style.top='0px';
    const m=this.menu.getBoundingClientRect();
    let x=Math.min(Math.max(6,r.left),vw-m.width-6);
    let y=r.bottom+4;
    if(y+m.height>vh-6) y=Math.max(6,r.top-m.height-4);
    this.menu.style.left=x+'px'; this.menu.style.top=y+'px';
  },

  close(){
    if(!this.menu) return;
    this.menu.classList.remove('on'); this.veil.classList.remove('on');
    document.querySelectorAll('.pk-btn.open').forEach(b=>b.classList.remove('open'));
    this.open=null;
  },

  enhanceAll(ids){ for(const id of ids) this.enhance(document.getElementById(id)); }
};

