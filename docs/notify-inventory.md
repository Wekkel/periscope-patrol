# Canonical notify inventory

This reviewed inventory is the source classification for notify().

# Notify-inventarisatie — Stap 1 herziening 3

De oorzaak volgt nu het moment waarop de melding ontstaat: direct op commando = RESPONS; later gevolg = GEBEURTENIS. RUIS is beperkt tot responsmeldingen waarvan de UI de reden al toont of die betekenisloos frequent zijn.

| Bestand | Regel | Oorzaak | Belang | Melding / expressie |
|---|---:|---|---|---|
| `js/simulation/battle-atmosphere.js` | 60 | GEBEURTENIS | KRITIEK | `'SEARCHLIGHT CONTACT — the beam has you. Dive, turn hard or run out of it before the batteries correct.','bad');` |
| `js/simulation/battle-atmosphere.js` | 82 | GEBEURTENIS | KRITIEK | ``COASTAL BATTERY HIT — ${ev.damage.toFixed(0)}% damage. The battery has the range; get below or spoil the solution.`,'bad');` |
| `js/simulation/collision/vessel-collision.js` | 108 | GEBEURTENIS | NUTTIG | ``TIME COMPRESSION STOPPED — ${text}. Take the conn.`,'bad');` |
| `js/simulation/collision/vessel-collision.js` | 147 | GEBEURTENIS | KRITIEK | `msg,'bad');PresentationBridge.audio(this.state).playHit?.();this.shake(clamp(impact.damage/5,1,8));` |
| `js/simulation/damage-control.js` | 116 | GEBEURTENIS | KRITIEK | `'PROPULSION CASUALTY — one drive bank is offline until the motor/electrical plant is repaired.','bad');` |
| `js/simulation/damage-control.js` | 130 | RESPONS | NUTTIG | ``Damage control priority: ${repairPriorityLabel(priority)}. Other casualties receive stabilization only.`,'warn');` |
| `js/simulation/damage-control.js` | 164 | GEBEURTENIS | KRITIEK | `'PUMP CASUALTY — damaged dewatering pump tripped under load. Repair it before restarting.','bad');` |
| `js/simulation/damage-control.js` | 191 | GEBEURTENIS | KRITIEK | `'PROPULSION — damaged drive bank restored to service.','ok');` |
| `js/simulation/damage-control.js` | 194 | GEBEURTENIS | NUTTIG | `'DEWATERING PUMP RESET — available again; pumps remain stopped until ordered on.','ok');` |
| `js/simulation/engine-core.js` | 180 | RESPONS | NUTTIG | `msg,'bad');PresentationBridge.toast(this.state).warn(msg);` |
| `js/simulation/engine-core.js` | 201 | RESPONS | NUTTIG | `'Deck gun unavailable while the automatic AA crew is engaged. Clear the air threat or dive.','warn');return false;}` |
| `js/simulation/engine-core.js` | 202 | RESPONS | NUTTIG | ``Deck gun unavailable at ${sub.depthFeet.toFixed(0)} ft — surface first.`,'warn');return false;}` |
| `js/simulation/engine-core.js` | 203 | RESPONS | NUTTIG | `'Green water is sweeping the foredeck — the deck gun cannot be worked in this sea.','warn');return false;}` |
| `js/simulation/engine-core.js` | 204 | RESPONS | RUIS | `'Deck gun magazine is empty.','warn');return false;}` |
| `js/simulation/engine-core.js` | 206 | RESPONS | NUTTIG | ``Deck gun crew topside automatically — ${G.ammo} rounds ready. Any dive order will clear the deck first.`,'warn');` |
| `js/simulation/engine-core.js` | 233 | RESPONS | RUIS | `'Bridge watch unavailable — the boat is below the surface.','warn');return null;}` |
| `js/simulation/engine-core.js` | 235 | RESPONS | RUIS | `'Bridge watch: no visual contact on the centre bearing.','warn');return null;}` |
| `js/simulation/engine-core.js` | 271 | RESPONS | KRITIEK | `'THE BOAT IS LOST. There is nobody left to pass the order to — start a new patrol from the menu.','bad');` |
| `js/simulation/engine-core.js` | 318 | RESPONS | NUTTIG | `R?.airWarningAvailable?`${managed} is crew-managed automatically whenever it can be used.`:`No ${status} is fitted on this patrol date.`,R?.airWarningAvailable?'ok':'warn');break;}` |
| `js/simulation/engine-core.js` | 322 | RESPONS | NUTTIG | `'Blue water — there is no bottom here to lie on.','warn');break;}` |
| `js/simulation/engine-core.js` | 323 | RESPONS | NUTTIG | ``${sea.toFixed(0)} ft of water — too deep to bottom her with any margin.`,'warn');break;}` |
| `js/simulation/engine-core.js` | 324 | RESPONS | NUTTIG | ``Bottom here is ${kind.toLowerCase()} — she cannot be laid on that without opening her tanks.`,'warn');break;}` |
| `js/simulation/engine-core.js` | 325 | RESPONS | NUTTIG | `'Take the way off her first — you do not put a boat on the bottom at speed.','warn');break;}` |
| `js/simulation/engine-core.js` | 327 | RESPONS | NUTTIG | ``BOTTOMING ORDERED — ${sea.toFixed(0)} ft, ${kind.toLowerCase()}. All stop; easing her down to settle.`,'ok');` |
| `js/simulation/engine-core.js` | 330 | RESPONS | NUTTIG | `'AA is automatic now — the 20 mm crew man the gun only when an air attack gets close, and clear the deck automatically for any dive order.','ok');` |
| `js/simulation/engine-core.js` | 354 | RESPONS | NUTTIG | `'RADIO ROOM — no contact report is ready for transmission.','warn');break;}` |
| `js/simulation/engine-core.js` | 355 | RESPONS | NUTTIG | `'CONTACT REPORT AUTHORIZED — remain at antenna depth until transmission is complete.','ok');PresentationBridge.audio(this.state).playRadioMessage?.();break;}` |
| `js/simulation/engine-core.js` | 361 | RESPONS | NUTTIG | ``Damage control parties are automatic. Choose one repair priority instead — currently ${repairPriorityLabel(sub.damage.repairPriority)}.`,'ok'); break;` |
| `js/simulation/engine-core.js` | 365 | RESPONS | NUTTIG | `'Dewatering pump is tripped and cannot be restarted until damage control repairs it.','bad');break;}` |
| `js/simulation/engine-core.js` | 372 | RESPONS | NUTTIG | `'TRANSIT ALREADY RUNNING — stop the current run before choosing another.','warn');` |
| `js/simulation/engine-core.js` | 376 | RESPONS | NUTTIG | `'Transit unavailable — aircraft attack in progress.','bad');break;}` |
| `js/simulation/engine-core.js` | 409 | RESPONS | RUIS | ``Bridge unavailable at ${sub.depthFeet.toFixed(0)} ft — surface or come awash first.`,'warn');break;}` |
| `js/simulation/engine-core.js` | 434 | RESPONS | NUTTIG | ``${radarUi.statusLabel\|\|radarUi.label\|\|'Surface-search radar'} is not fitted on this patrol date.`,'warn');break;}` |
| `js/simulation/engine-core.js` | 471 | RESPONS | NUTTIG | ``${spec.name} is not available on this patrol date. Refit availability follows the war calendar.`,'warn');break;` |
| `js/simulation/engine-core.js` | 504 | RESPONS | NUTTIG | `'WAYPOINT REFUSED — land or unsafe shoal. Tap navigable water.','warn');break;}` |
| `js/simulation/engine-core.js` | 506 | RESPONS | NUTTIG | `'WAYPOINT REFUSED — no safe water route can be plotted.','warn');break;}` |
| `js/simulation/engine-core.js` | 530 | RESPONS | NUTTIG | `'No usable shipping intercept is held. Copy radio traffic or develop a contact.','warn');break;}` |
| `js/simulation/engine-core.js` | 532 | RESPONS | NUTTIG | `'Intercept estimate falls outside safely navigable water. Helm unchanged.','warn');break;}` |
| `js/simulation/engine-core.js` | 534 | RESPONS | NUTTIG | ``Intercept advice plotted ${fmtDeg(plan.courseDeg)} — helm unchanged.`,'ok');` |
| `js/simulation/engine-core.js` | 538 | RESPONS | NUTTIG | `this.state.map.weatherOverlay?'Weather overlay shown — shaded cells are moving squalls; local visibility is shown on the chart.':'Weather overlay hidden.','ok');break;` |
| `js/simulation/engine-core.js` | 647 | GEBEURTENIS | NUTTIG | ``ALL STOP — only ${Math.max(0,clr).toFixed(0)} ft under the keel. Clock back to real time; con her clear by hand.`,'bad');` |
| `js/simulation/engine-core.js` | 652 | GEBEURTENIS | KRITIEK | ``SHOALING WATER — ${Math.max(0,clr).toFixed(0)} ft under the keel. Clock back to real time; you still have way on the boat.`,'warn');` |
| `js/simulation/engine-core.js` | 674 | GEBEURTENIS | NUTTIG | ``Fathometer: bottom at ${sea.toFixed(0)} ft — depth restricted to ${Math.round(safe)} ft.`,'warn');` |
| `js/simulation/engine-core.js` | 682 | GEBEURTENIS | NUTTIG | `'BOTTOMING CANCELLED — conditions or orders changed; holding safe depth.','warn');` |
| `js/simulation/engine-core.js` | 705 | GEBEURTENIS | KRITIEK | ``SHE IS ON THE BOTTOM — ${sub.bottomType.toLowerCase()} at ${sea.toFixed(0)} ft, ${spd.toFixed(1)} kn. Hull damage ${dmg.toFixed(0)}%. Every escort in the sea heard that.`,'bad');` |
| `js/simulation/engine-core.js` | 733 | GEBEURTENIS | NUTTIG | ``ON THE BOTTOM — ${sea.toFixed(0)} ft, ${kind.toLowerCase()}. All stop, everything shut down. She is part of the sea floor now.`,'ok');` |
| `js/simulation/engine-core.js` | 747 | GEBEURTENIS | NUTTIG | `'She is settling into the mud. Breaking free now will take a blow — and a blow can be heard.','warn');` |
| `js/simulation/engine-core.js` | 760 | GEBEURTENIS | NUTTIG | `'Blowing her off the bottom — she comes free with a rush of air. That was heard.','bad');` |
| `js/simulation/engine-core.js` | 764 | GEBEURTENIS | NUTTIG | `'Off the bottom, quietly. Planes and screws answering again.','ok');` |
| `js/simulation/engine-core.js` | 920 | RESPONS | NUTTIG | ``${port.name}: no safe-water rendezvous could be charted. Take the conn and approach manually.`,'bad');` |
| `js/simulation/engine-core.js` | 947 | RESPONS | NUTTIG | ``Course set for ${r.port.name} rendezvous — ${r.rngNm.toFixed(1)} nm on ${fmtDeg(r.brg)}. The marker is in safe water; compressed time will hand the conn back near the approach.`,'warn');` |
| `js/simulation/engine-core.js` | 978 | RESPONS | NUTTIG | ``${String(portName\|\|'FRIENDLY PORT').toUpperCase()} — SERVICE COMPLETE. Fuel and battery 100%; torpedoes, gun ammunition and AA replenished; battle damage repaired.`,'ok');` |
| `js/simulation/engine-core.js` | 1003 | GEBEURTENIS | NUTTIG | ``${r.port.name.toUpperCase()} FRIENDLY RV — ${r.rngNm.toFixed(1)} nm. Rearm, refuel, charge batteries and repair are available inside the green ring.`,'ok');` |
| `js/simulation/engine-core.js` | 1011 | GEBEURTENIS | NUTTIG | `returning` |
| `js/simulation/engine-core.js` | 1028 | GEBEURTENIS | NUTTIG | `returning` |
| `js/simulation/engine-core.js` | 1064 | GEBEURTENIS | NUTTIG | ``PATROL COMPLETE at ${portName} — bonus +${bonus} points for fuel, hull and torpedoes remaining. Patrol score ${patrolScore}, career ${camp.totalScore}.`,'ok');` |
| `js/simulation/harbor.js` | 173 | GEBEURTENIS | KRITIEK | ``OPTIONAL OBJECTIVE — Penetrate ${H.name} through the swept approach and identify the reported heavy unit. Visual sightings from outside the torpedo net do not complete the intelligence objective. No penalty if you decli` |
| `js/simulation/harbor.js` | 174 | GEBEURTENIS | KRITIEK | `'CHART UPDATED — Reported mine belt and swept approach plotted. Keep near the centerline; the passage is charted deep enough for submerged approach. The intelligence objective requires entry inside the torpedo net. Gate ` |
| `js/simulation/harbor.js` | 181 | GEBEURTENIS | KRITIEK | ``MAP UPDATED — torpedo net identified at the ${H.shortName} entrance${source==='CONTACT'?' by close contact':''}. The observed gate is now marked separately from the swept mine approach.`,'warn');` |
| `js/simulation/harbor.js` | 221 | GEBEURTENIS | NUTTIG | ``CHART REFINED — swept approach observed. Follow the MAP best-estimate centerline toward ${H.name}; corridor limits remain approximate${I.net.known?', and the net gate is marked separately':'. Net/gate still requires vis` |
| `js/simulation/harbor.js` | 237 | GEBEURTENIS | NUTTIG | ``${events.visualBanner\|\|'VISUAL IDENTIFICATION'} — ${label.toUpperCase()} at anchor.`,'ok');` |
| `js/simulation/harbor.js` | 243 | GEBEURTENIS | KRITIEK | `'VISUAL IDENTIFICATION MADE — but the intelligence objective still requires penetration inside the torpedo net through the swept approach.','warn');` |
| `js/simulation/harbor.js` | 268 | GEBEURTENIS | KRITIEK | `'TORPEDO-NET GATE PASSED — inside the defended anchorage. Intelligence objective now requires a firm visual identification of the reported heavy unit.','ok');` |
| `js/simulation/harbor.js` | 275 | GEBEURTENIS | KRITIEK | ``INTELLIGENCE OBJECTIVE COMPLETE — ${this.harborIdentityLabel(I.heavyUnit.identity).toUpperCase()} positively identified inside ${H.name}.`,'ok');` |
| `js/simulation/harbor.js` | 309 | GEBEURTENIS | NUTTIG | `I&&(I.minefield.level!=='NONE'\|\|I.channel.level!=='NONE')` |
| `js/simulation/harbor.js` | 316 | GEBEURTENIS | NUTTIG | ``INSIDE ${H.name.toUpperCase()} — silhouettes at anchor. High-value targets are close${I?.net?.known?', and the observed net opening is still your way out':'; your exit remains only as good as your reconnaissance'}.`,'ok` |
| `js/simulation/harbor.js` | 333 | GEBEURTENIS | KRITIEK | ``${H.name}: harbour hydrophones have a possible contact. Searchlights and batteries are standing by.`,'warn');` |
| `js/simulation/harbor.js` | 337 | GEBEURTENIS | KRITIEK | ``HARBOR ALARM — ${H.name} has your approximate position. Searchlights sweeping; coastal batteries ready.`,'bad');` |
| `js/simulation/harbor.js` | 350 | GEBEURTENIS | KRITIEK | `'SEARCHLIGHTS SWEEPING THE HARBOUR ENTRANCE — stay below periscope depth or clear the defended approach.','warn');}` |
| `js/simulation/harbor.js` | 370 | GEBEURTENIS | KRITIEK | ``COASTAL BATTERY HIT — ${dmg.toFixed(0)}% damage. Get below the searchlights!`,'bad');` |
| `js/simulation/harbor.js` | 373 | GEBEURTENIS | KRITIEK | `'Coastal battery firing — shell splashes close aboard.','bad');` |
| `js/simulation/harbor.js` | 390 | GEBEURTENIS | KRITIEK | ``MINE! Underwater explosion — ${dmg.toFixed(0)}% damage. You are in mined water; get clear of the field.`,'bad');` |
| `js/simulation/harbor.js` | 406 | GEBEURTENIS | KRITIEK | `'TORPEDO NET — screws fouled and way off the boat. Back clear and find the gate in the swept channel.','bad');` |
| `js/simulation/mission-framework.js` | 49 | GEBEURTENIS | NUTTIG | `text,'warn');};` |
| `js/simulation/mission-framework.js` | 173 | GEBEURTENIS | KRITIEK | `cfg.observedNotice\|\|'DISTANT TORPEDO HIT — another U-boat has attacked the convoy.','warn');engine.captainLog?.('WOLFPACK_ATTACK',`Another U-boat struck ${target.name}; part of the escort screen detached.`,{targetId:ta` |
| `js/simulation/mission-framework.js` | 239 | GEBEURTENIS | NUTTIG | ``RADIO INTELLIGENCE — ${m.targetLabel\|\|'target'} reported within ±${unc.toFixed(1)} nm.`, 'warn');}` |
| `js/simulation/mission-framework.js` | 375 | GEBEURTENIS | KRITIEK | ``${m.title} — ${success?'PRIMARY OBJECTIVE COMPLETE':'MISSION FAILED'}${success&&m.reward?` · +${m.reward} pts`:''}. Return to base.`,success?'ok':'bad');PresentationBridge.audio(this.state).event?.(success?'PRIMARY_OBJE` |
| `js/simulation/mission-framework.js` | 379 | GEBEURTENIS | KRITIEK | `content.airmanDownNotice,'warn');this._missionStopTransit('airman down in lifeguard sector');` |
| `js/simulation/mission-framework.js` | 395 | GEBEURTENIS | KRITIEK | `_missionContent(s,'lifeguard')?.locatedNotice\|\|'LIFE RAFT LOCATED. Close surfaced and slow for recovery.','ok');}if(raft&&m.survivorSeen){const close=distNm(sub.position,raft.position)<=.08&&sub.depthFeet<8&&sub.propul` |
| `js/simulation/mission-framework.js` | 397 | GEBEURTENIS | NUTTIG | ``${m.title} — ${m.operationLabel}. Clear the enemy coast.`, 'ok');}}if(m.responseAt!=null&&now>=m.responseAt&&!m.departed&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level\|\|.5)+.45,0,1.5);W` |
| `js/simulation/mission-framework.js` | 399 | GEBEURTENIS | KRITIEK | `'MINE LAYING — pattern started. Maintain 2–5 kn, 35–90 ft and assigned heading.','warn');}}else m.layClock=Math.max(0,m.layClock-dt*.25);if(m.minesLaid>=m.mineCount){_missionSetDone(c,'lay');this.captainLog?.('MINEFIELD_` |
| `js/simulation/mission-framework.js` | 401 | GEBEURTENIS | KRITIEK | `'RECONNAISSANCE COMPROMISED — weapons fire has alerted the anchorage. Complete identification and withdraw.','bad');}` |
| `js/simulation/mission-framework.js` | 411 | GEBEURTENIS | NUTTIG | `content.developedNotice,'ok');}}` |
| `js/simulation/mission-framework.js` | 412 | GEBEURTENIS | KRITIEK | `content.reportReadyNotice,'warn');this._missionStopTransit('contact report ready');}}` |
| `js/simulation/mission-framework.js` | 413 | GEBEURTENIS | NUTTIG | `exposure.warning\|\|'ENEMY D/F MAY HAVE OBTAINED A ROUGH BEARING.','warn');this.alertEscorts?.(exposure.reason\|\|'RADIO_BEARING',{...sub.position},Number(exposure.confidence)\|\|.28);}this.captainLog?.('CONTACT_REPORT_S` |
| `js/simulation/mission-framework.js` | 415 | GEBEURTENIS | KRITIEK | `content.attackOrderCopiedNotice\|\|'ATTACK ORDER COPIED','ok');this._missionStopTransit('B.d.U. attack order copied');}}` |
| `js/simulation/mission-framework.js` | 416 | GEBEURTENIS | KRITIEK | `content.nightApproachNotice\|\|'NIGHT ATTACK POSITION — attack at discretion.','ok');this._missionStopTransit('night attack position');}}` |
| `js/simulation/mission-framework.js` | 417 | GEBEURTENIS | KRITIEK | `content.attackNotice\|\|'TORPEDO ATTACK UNDERWAY — clear the convoy screen.','warn');this._missionStopTransit('torpedo attack underway');}}` |
| `js/simulation/mission-framework.js` | 419 | GEBEURTENIS | KRITIEK | `content.escortReactionNotice\|\|'CONVOY ALARM — break firm contact.','bad');this._missionStopTransit('escort reaction');}` |
| `js/simulation/mission-framework.js` | 426 | GEBEURTENIS | NUTTIG | `content.evasionNotice\|\|'FIRM CONTACT BROKEN — keep opening the range.','ok');}` |
| `js/simulation/mission-framework.js` | 428 | GEBEURTENIS | KRITIEK | `content.withdrawalNotice\|\|'ATTACK COMPLETE — clear of the convoy screen. Return to base.','ok');this._missionFinish(true);}}` |
| `js/simulation/mission-framework.js` | 447 | GEBEURTENIS | NUTTIG | ``${content?.stationPrefix\|\|'Lifeguard station — on station. Air operation expected in about '}${Math.ceil((m.stationWaitSec\|\|240)/60)}${content?.stationSuffix\|\|' minutes.'}`,'ok');}}return true;` |
| `js/simulation/physics-navigation.js` | 141 | GEBEURTENIS | NUTTIG | `r` |
| `js/simulation/radio-intel.js` | 36 | RESPONS | NUTTIG | `'RADIO ROOM — no signal is currently being copied.','warn');return false;}` |
| `js/simulation/radio-intel.js` | 37 | RESPONS | NUTTIG | `'RADIO ROOM — too few groups copied for a useful partial message.','warn');return false;}` |
| `js/simulation/ship-damage.js` | 230 | GEBEURTENIS | KRITIEK | ``${side==='FRIENDLY'?'FRIENDLY SHIP':'NEUTRAL CRAFT'} LOST — ${c.name} sunk by enemy surface gunfire.`,'warn');` |
| `js/simulation/ship-damage.js` | 236 | GEBEURTENIS | KRITIEK | ``${side==='FRIENDLY'?'FRIENDLY SHIP':'NEUTRAL CRAFT'} LOST — ${c.name}. ${pts.toLocaleString()} pts.`,'bad');` |
| `js/simulation/ship-damage.js` | 247 | GEBEURTENIS | KRITIEK | ``${D.lastWeapon==='DECK_GUN'?'DECK GUN':'TORPEDO DAMAGE'} — ${c.name} is going down. +${pts} pts.`,'ok');` |
| `js/simulation/sound-radar.js` | 180 | RESPONS | NUTTIG | `'SOUND — no bearing sharp enough to mark. Train through the strongest screws first.','warn');return null;}` |
| `js/simulation/sound-radar.js` | 205 | RESPONS | NUTTIG | `'No active echo-ranging set is fitted to this submarine.','warn');return null;}` |
| `js/simulation/sound-radar.js` | 207 | RESPONS | RUIS | ``${echoName} recharging — ${Math.ceil(SOUND_ROOM.activeEchoCooldownSec-(now-S.activeEchoLastAt))} seconds.`,'warn');return null;}` |
| `js/simulation/sound-radar.js` | 215 | RESPONS | NUTTIG | ``${echoName} — NO USEFUL ECHO. Every hydrophone in the area heard that transmission.`,'bad');return null;}` |
| `js/simulation/sound-radar.js` | 222 | RESPONS | NUTTIG | ``${echoName} — ECHO RANGE ${rangeNm.toFixed(2)} nm on ${fmtDeg(bearing)}. Transmission heard by the enemy.`,'bad');return tr;` |
| `js/simulation/system-context.js` | 17 | GEBEURTENIS | NUTTIG | `...args);` |
| `js/simulation/weapons/aa-gun.js` | 5 | RESPONS | NUTTIG | `why,'warn');` |
| `js/simulation/weapons/aa-gun.js` | 25 | GEBEURTENIS | KRITIEK | `'Air attack close — AA crew manning the 20 mm automatically. A dive ordered now will pause briefly while they clear the hatch.','warn');` |
| `js/simulation/weapons/aa-gun.js` | 33 | GEBEURTENIS | KRITIEK | ``${what} Men down on the cigarette deck — gun abandoned, wounded passed below.`,'bad');` |
| `js/simulation/weapons/deck-gun.js` | 56 | RESPONS | RUIS | `'Deck gun is not manned.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 57 | RESPONS | NUTTIG | `'No selected surface target for the gun. Tap a visible ship first.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 60 | RESPONS | NUTTIG | ``Target ${c.id} at ${r0.toFixed(1)} nm — beyond ${gun.shortLabel} maximum range (${maxRange.toFixed(1)} nm).`,'warn');return;` |
| `js/simulation/weapons/deck-gun.js` | 63 | RESPONS | NUTTIG | `'Target is beyond useful visual gun range.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 75 | RESPONS | NUTTIG | ``Target bears ${fmtDeg(br)} — outside the deck gun's training arc. Turn the boat.`,'warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 79 | RESPONS | NUTTIG | `'No practical deck-gun elevation solution at this range.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 81 | RESPONS | NUTTIG | ``Gun laid on ${c.id}: bearing ${fmtDeg(br)}, range ${r0.toFixed(1)} nm. Fire and watch the fall of shot.`,'ok');` |
| `js/simulation/weapons/deck-gun.js` | 86 | RESPONS | RUIS | `'Deck gun is not manned.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 87 | RESPONS | RUIS | `'Simulation is paused — resume time before firing.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 88 | RESPONS | NUTTIG | `'Deck awash — gun crew driven below.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 89 | RESPONS | RUIS | `'Deck gun magazine empty.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 91 | RESPONS | RUIS | `'Gun crew still loading.','warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 95 | RESPONS | NUTTIG | ``Target ${tgt.id} at ${r.toFixed(1)} nm — beyond ${gun.shortLabel} maximum range (${gun.maxRangeNm.toFixed(1)} nm).`,'warn');return;}` |
| `js/simulation/weapons/deck-gun.js` | 184 | GEBEURTENIS | NUTTIG | `sub.depthFeet>10?'Deck going under — deck gun crew below.':'Deck gun secured — conditions no longer permit firing.','warn');` |
| `js/simulation/weapons/torpedoes.js` | 28 | RESPONS | NUTTIG | ``Tube ${id} is not ready — flood a loaded tube or wait for reload.`,'warn');return;}` |
| `js/simulation/weapons/torpedoes.js` | 29 | RESPONS | NUTTIG | ``TDC solution ${Math.round((tdc.solutionQuality\|\|0)*100)}% — obtain a bearing/range plot and build at least 25% before firing.`,'warn');return;}` |
| `js/simulation/weapons/torpedoes.js` | 30 | RESPONS | NUTTIG | ``Too deep to fire at ${Math.round(sub.depthFeet)} ft — come above 160 ft.`,'warn');return;}` |
| `js/simulation/weapons/torpedoes.js` | 41 | RESPONS | NUTTIG | ``Tube ${id}: intercept run ${runNm.toFixed(1)} nm; ${spec.name} max ${spec.maxRangeNm.toFixed(1)} nm — long by ${longBy.toFixed(1)} nm (${Math.round(longBy*2025)} yd). Close the range.`,'warn');` |
| `js/simulation/weapons/torpedoes.js` | 44 | RESPONS | NUTTIG | ``Long shot — intercept run ${runNm.toFixed(1)} nm of ${spec.maxRangeNm.toFixed(1)} nm max. Little margin if she zigs.`,'warn');` |
| `js/simulation/weapons/torpedoes.js` | 55 | RESPONS | NUTTIG | ``TDC launch solution is for ${tdc.launchBank} tubes — use that bank or swing the boat for a new solution.`,'warn');` |
| `js/simulation/weapons/torpedoes.js` | 60 | RESPONS | NUTTIG | ``Tube ${id}: gyro ${turn.toFixed(0)}° exceeds the setting limit — swing the boat toward the target and rebuild the solution.`,'warn');return;}` |
| `js/simulation/weapons/torpedoes.js` | 112 | RESPONS | NUTTIG | ``No ready ${pos} tubes — flood a loaded ${pos} tube or wait for reload.`,'warn');return;}` |
| `js/simulation/weapons/torpedoes.js` | 134 | GEBEURTENIS | NUTTIG | ``MISS — ${t.id} ran past ${c.name}, ${yards} yards ${side}, passing ${where}.`+` |
| `js/simulation/weapons/torpedoes.js` | 227 | GEBEURTENIS | KRITIEK | ``${t.id} caught in the harbour torpedo net — warhead spent against the boom.`,'warn');` |
| `js/simulation/weapons/torpedoes.js` | 328 | GEBEURTENIS | KRITIEK | ``TORPEDO HIT — ${c.name}: ${condition}${speedCap>0?` · estimated max ${speedCap.toFixed(1)} kn`:''}.`,'bad');` |


