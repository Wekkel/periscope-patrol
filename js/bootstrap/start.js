Picker.enhanceAll(['tBtnTime','mTimeSel','timeSelect','mTorpSel','mDudSel',
                   'torpTypeSelect','dudSelect','missionTypeSelect','campaignProfileSelect']);

const helmGauges=new HelmGauges(game,touchCtrl);
helmGauges.start();

new GameLoop(game,canvasView,domView,touchCtrl,new HudDriver(game,touchCtrl,domView,tutorial)).start();
