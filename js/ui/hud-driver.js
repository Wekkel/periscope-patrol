class HudDriver{
  constructor(game,tc,dv,tutorial){this.game=game;this.tc=tc;this.dv=dv;this.tutorial=tutorial;this.acc=0;this.interval=1/5;}
  tick(dt){const s=this.game.getSnapshot();this.acc+=dt;if(this.acc<this.interval)return;this.acc=0;const layout=LayoutService.get();if(layout.shell==='touch')this.tc.updateTouch(s,layout);else this.dv.render(s,layout);this.tutorial.update(s,layout);const dn=DayNightCycle.update(s);PresentationBridge.ui(s,'dayNight',dn.daylight,dn.timeStr);const ds=`${s.time.campaignDateTime||''} ${dn.timeStr}`;['hDate','tDate'].forEach(id=>{const el=document.getElementById(id);if(el&&el.textContent!==ds)el.textContent=ds;});
  }
}
