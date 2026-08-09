// ═══════════════════════════════════════════════════ GAME FACADE
class Game{
  constructor(){
    const startArea='Solomon Sea';
    this.state=createState(startArea);
    this.state.world.contacts=new SimEngine(this.state,new CommandBus()).makeConvoy(PATROL_AREAS[startArea]);
    this.bus=new CommandBus();
    this.engine=new SimEngine(this.state,this.bus);
    this.engine.ensureTrafficDirector?.(true);
  }
  dispatch(cmd){this.bus.dispatch(cmd);}
  update(dt){this.engine.update(dt);}
  getSnapshot(){return this.state;}
}

