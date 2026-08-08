Picker.enhanceAll(['tBtnTime','mTimeSel','timeSelect','mTorpSel','mDudSel',
                   'torpTypeSelect','dudSelect']);

const helmGauges=new HelmGauges(game,touchCtrl);
helmGauges.start();

new GameLoop(game,canvasView,domView,touchCtrl).start();
