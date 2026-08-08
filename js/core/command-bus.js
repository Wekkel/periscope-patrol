// ═══════════════════════════════════════════════════ COMMAND BUS
class CommandBus{
  constructor(){this.queue=[];}
  dispatch(c){this.queue.push(c);}
  drain(){const q=this.queue;this.queue=[];return q;}
}

