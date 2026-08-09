// ═══════════════════════════════════════════════════ GAME FACADE
class Game{
  constructor(){
    const startArea='Solomon Sea';
    this.state=createState(startArea);
    const bootEngine=new SimEngine(this.state,new CommandBus());
    bootEngine.ensureHistoricalCampaignProfile?.(true);
    this.state.world.contacts=bootEngine.makeConvoy(PATROL_AREAS[startArea],{areaKey:startArea,startDate:this.state.campaign.startDate,historicalProfile:this.state.campaign.historicalProfile});
    this.bus=new CommandBus();
    this.engine=new SimEngine(this.state,this.bus);
    this.engine.ensureHistoricalCampaignProfile?.();
    this.engine.ensureTrafficDirector?.(true);
  }
  dispatch(cmd){this.bus.dispatch(cmd);}
  update(dt){this.engine.update(dt);}
  getSnapshot(){return this.state;}
}

