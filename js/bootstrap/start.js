Picker.enhanceAll(['tBtnTime','mTimeSel','timeSelect','mTorpSel','mDudSel',
                   'torpTypeSelect','dudSelect','missionTypeSelect']);

const helmGauges=new HelmGauges(game,touchCtrl);
helmGauges.start();

new GameLoop(game,canvasView,domView,touchCtrl).start();
