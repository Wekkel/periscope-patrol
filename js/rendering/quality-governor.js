/* Adaptive canvas quality. */
class QualityGovernor{constructor(view){this.view=view;this.frameMs=16;}sample(ms){this.frameMs=this.frameMs*.92+ms*.08;if(this.frameMs>24)this.view.quality=Math.max(.25,this.view.quality-.03);else if(this.frameMs<14)this.view.quality=Math.min(1,this.view.quality+.01);return this.frameMs;}}
