import {readFile} from 'node:fs/promises';

/* Reproducible 9a inventory.  The two presenter paths are measured separately
   from input/geometry helpers, which are intentionally outside the viewmodel. */
const specs=[['DomView','js/ui/dom-view.js','_renderLegacy'],['TouchCtrl','js/controllers/touch-controller.js','_updateTouchLegacy']];
const display=/\bMath\.|\.toFixed\s*\(|\.toLocaleString\s*\(|\bNumber\s*\(|\b(?:clamp|fmtDeg|fmtTime|bridgeMagnification|bridgeZoomAmount|torpedoRangeInfo|weatherAtPosition|historicalTorpedoDudChance)\s*\(/g;
function body(src,name){const start=src.indexOf(`  ${name}(`),open=src.indexOf('{',start);if(start<0||open<0)return '';let depth=0;for(let i=open;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&!--depth)return src.slice(open,i+1);}return '';}
const interaction=/rpmInput|depthMax|orderedHeading|orderedRpm|orderedDepth|timeSelect|dudSel|torpSel|scopeZoom|chipWidth|tactSafe|dragging|oGunElev|mHeadingNumberInput|mRpm|mDpt|mHdg|Number\.parseInt/;
const result=[];for(const [presenter,file,method] of specs){const src=await readFile(file,'utf8'),text=body(src,method).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,''),matches=[...text.matchAll(display)];const excluded=matches.filter(m=>interaction.test(text.slice(Math.max(0,m.index-120),m.index+120)));const remaining=matches.filter(m=>!excluded.includes(m));result.push({presenter,file,method,rawCalculations:matches.length,interactionCalculations:excluded.length,displayCalculations:remaining.length,displayLines:remaining.map(m=>text.slice(0,m.index).split('\n').length),interactionReason:'control synchronization or responsive input geometry; excluded explicitly'});}
console.log(JSON.stringify({scope:'presenter display paths only; input and geometry helpers excluded',result},null,2));
if(result.some(item=>item.displayCalculations!==0))process.exit(1);
