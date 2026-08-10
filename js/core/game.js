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
  dispatch(cmd){
    /* Station changes are UI/navigation state, not physics orders.  Keeping
       them behind the simulation command queue meant a fault in any simulation
       subsystem could leave the visible station frozen even though the user
       had tapped another tab. Apply these synchronously so TAC/MAP/BRG/SND/
       SCOPE/GUN navigation is independent of the next simulation tick. */
    if(cmd?.type==='SET_ACTIVE_STATION'){
      this.engine.ensureTacticalExtensions?.();
      this.engine.ensureWorldExtensions?.();
      this.engine.applyCmd(cmd);
      return this.state.tactical.activeStation;
    }
    this.bus.dispatch(cmd);
    return null;
  }
  update(dt){this.engine.update(dt);}
  getSnapshot(){return this.state;}
}

