# Periscope Patrol — Master Roadmap & Wensenlijst

Dit document legt de langetermijnvisie, kerninitiatieven, visuele verbeteringspijlers en operationele taken vast voor *Periscope Patrol*.

---

## Werkwijze per Punt
Elk punt uit deze roadmap wordt **stuk voor stuk** opgepakt via de vaste cyclus:
1. **Intake & Probleemanalyse**: Deelvragen en technische randvoorwaarden in kaart brengen.
2. **Implementatieplan**: Ontwerp opstellen inclusief kwaliteitsbewaking en impact op budgets.
3. **Akkoord gebruiker**: Pas na expliciete goedkeuring gaan we over tot actie.
4. **Uitvoering & Testen**: Codeerwerk, geautomatiseerde quality gates (`quality-gates.mjs`, `behaviour.mjs`, etc.) draaien.
5. **Walkthrough & Evaluatie**: Oplevering documenteren en gereedmelden voor het volgende punt.

---

## Deel 1: 10 Kerninitiatieven (Architectuur & Gameplay)

### 1. Vaste browser- en apparaatteststraat
* **Doel**: Geen productrommel, maar een betrouwbaar ontwikkelgereedschap waarmee een volledige missiecyclus reproduceerbaar kan worden doorgelopen:
  $$\text{Briefing} \longrightarrow \text{Aanval} \longrightarrow \text{Schade} \longrightarrow \text{Ontsnapping} \longrightarrow \text{Terugkeer} \longrightarrow \text{AAR}$$
* **Focus**: Headless verificatie, deterministische tijdstappen, mock-sensoren en verificatie van alle UI-transities over desktop- en touch-profielen.
* **Fases**:
  * [x] **Fase 1.1: Multi-Device Teststraat Fundament** (Headless Edge/Chrome runner, HTTP 206 static server, deterministische game loop, shell- en DOM-verificatie over 4 profielen) — **GOEDGEKEURD (Harry: 8.9/10, Henry: 8.95/10)**
  * [x] **Fase 1.2: Volledige Missiecyclus Automatisering** ($\text{Briefing} \to \text{Aanval} \to \text{Schade} \to \text{Ontsnapping} \to \text{Terugkeer} \to \text{AAR}$) — **GOEDGEKEURD (Harry: 9.4/10, Henry: 9.1/10)**
  * [x] **Fase 1.3: Stress-, Lek- & CI-integratie** (Duurtests, geheugenmonitoring, regressiepoorten) — **GOEDGEKEURD (Harry: 9.5/10, Henry: 9.4/10)**

### 2. Hybride audiohuis
* **Doel**: WebAudio-synthese behouden voor dynamische, traploze lagen (motor-RPM, dieptedruk, sonar-doppler, filterresonanties), maar cruciale geluiden verrijken met zorgvuldig geproduceerde, historische samples:
  * Explosies (torpedo-inslag, dieptebommen nabij/ver, kanontreffers)
  * Geschut (dekkanon knal, 20mm Oerlikon snelvuur)
  * Diesels en machines
  * Hydrofooncontacten & cavitatie
  * Zee-ambience (boven water vs onder water)
  * Korte muzikale cues en briefing/after-action stings
* **Fases**:
  * [x] **Fase 2.1: Hybride Audio Pipeline & Asset Architectuur** (WebAudio mixing bus, LRU buffer-evictie, 8MB heap-plafond, bidirectionele Hann-tapering, voice stealing micro-ramps) — **GOEDGEKEURD (Harry: 9.6/10, Henry: 9.3/10)**
  * [x] **Fase 2.2: Gevechts- & Explosiegeluiden** (Torpedo-inslag met cavitatie-rumble, dieptebommen nabij/ver, 4-inch dekkanon, 20mm AA burst) — **GOEDGEKEURD (Harry: 9.6/10, Henry: 9.4/10)**
  * [x] **Fase 2.3: Voortstuwing, Hydrofoon & Omgevingsambience** (Diesels met RPM-pitching, elektromotoren met stille vaart demping, hydrodynamische cavitatiefysica voor eigen boot en aanvallende ASW escortes, submersed vs surfaced zee/weer ambiance, Sound Room hydrofoontracking) — **GOEDGEKEURD (Harry: 9.7/10, Henry: 9.5/10)**
  * [x] **Fase 2.4: Audio Director, Alarms & Dynamische Missie-Cues** (General Alarm met machineducking, crash dive akoestiek met ballastventiel-ontluchting, 10 historische missiestings, dynamische 7-bus mixprofielen over 4 perspectieven en tijdcompressiediscipline) — **GOEDGEKEURD (Harry: 9.7/10, Henry: 9.5/10)**

### 3. Marine-specifiek bedieningskarakter (6 Nationaliteiten)
* **Doel**: Amerikaanse, Duitse, Britse, Japanse, Italiaanse en Sovjetboten krijgen herkenbare instrumentvormen, typografie, kleurgebruik, terminologie en korte commandobevestigingen.
* **Randvoorwaarde**: Zonder zes afzonderlijke parallelle UI-codebases te onderhouden; modulaire datagedreven styling, SVG-instrumentwijzers en gelokaliseerde order-vocabulaires over één gedeelde kern.
* **Fases**:
  * [x] **Fase 3.1: Visuele Thema- & Typografie-Architectuur** (Design Tokens per natie in CSS, complete `palette` specificaties in game data, procedurele fysieke bezels met klinknagels/messing/bakeliet op het Canvas, automatische metrische vs imperiale diepteschaling en tactical depth ladder, harmonisatie met GyroIndicator en SoundStation) — **GOEDGEKEURD (Harry: 9.7/10, Henry: 9.45/10)**
  * [x] **Fase 3.2: Maritieme Terminologie & Meertalige Orders** (Historische scheepsposten, officiersrollen en order-vocabulaire in `STATION_PRESENTATION_PROFILES`, torpedokamer en buizenpresentatie, roer- en machinebevelen over alle 6 vloten, dynamische presets en metrische stappen) — **GOEDGEKEURD (Harry: 9.8/10, Henry: 9.78/10)**
  * [x] **Fase 3.3: Nationale Akoestiek & Bedieningsfeedback** (Land-specifieke telegraafresonanties en belslagen over alle 6 marines, roerorder/helm kliks, hydrofoon bandbreedtefilters per vloot GHG/ASDIC/WIDE/Type93/Idrofono/Mars, debounce-bescherming, zero sample memory overhead) — **GOEDGEKEURD (Harry: 9.7/10, Henry: 9.15/10)**
  * [x] **Fase 3.4: Teststraat Integratie, Cross-Device Verificatie & Evaluatie** (Deterministisch cross-fleet browser-scenario over 6 vloten, WCAG AA contrasttoetsing in behaviour tests, cross-device validatie over desktop/tablet/mobiel, formele eindconsolidatie Initiatief 3) — **GOEDGEKEURD (Harry: 9.8/10, Henry: 9.55/10)**

### 4. Fysiek geloofwaardige havens, fjorden en corridors
* **Doel**: Toegang tot havens en ankerplaatsen moet natuurlijk ontstaan uit kustlijnen, eilanden, ondieptes, mijnenvelden, anti-onderzeebootnetten, patrouillerende zoeklichten en kustbatterijen—niet uit zichtbare kunstmatige rechthoeken of willekeurige verboden zones.
* **Fases**:
  * [x] **Fase 4.1: Havendetectie, Alarm-Escalatie & Daglichtcontrole** (Optische kustwachtdetectie overdag voor surfaced/snelle periscoopvaart onafhankelijk van hydrofoons, directe alarm-escalatie bij torpedotreffers/schade aan ankerdoelen met algemeen alarm en escorte-dispatching, daglicht-gated zoeklichten en 2D/3D onderdrukking) — **GOEDGEKEURD (Harry: 9.75/10, Henry: 9.35/10)**
  * [x] **Fase 4.2: Fysieke Havenarchitectuur & 2.5D Kustkades** (Kades, pieren, pakhuizen met zadeldaken en kadelantaarns, cilindrische brandstoftanks met koepelkappen en directionele gradiëntshading, portaalkranen en dynamische oorlogsverduisteringsdiscipline bij havenalarm) — **GOEDGEKEURD (Harry: 9.78/10, Henry: 9.35/10)**
  * [ ] **Fase 4.3: Verdedigingsnetten, Versperringen & Kustbatterijen** (Gedifferentieerde versperringen, indicatielussen, zoeklichtbundels en getijdewateren in havenmondingen en fjorden)
  * [ ] **Fase 4.4: Special Ops Infiltratiemissies & Haven-AAR Debriefing** (Specifieke penetratiescenario's, verkenning van slagschepen/vliegdekschepen op ankerplaatsen en afhandeling in campagnetactiek)

### 5. Visuele en systemische scheepsherkenning
* **Doel**: Rijkere differentiatie van schepen:
  * Silhouet, dekopbouw, masten en opvallende kenmerken
  * Bewapening en dekkannonnen
  * Schadelocaties (boeg, midscheeps, schroef/roer)
  * Slagzij (list) en trim (voorover/achterover hangen)
  * Snelheidsverlies bij schade
  * Rookkolommen, vlammen en realistisch zinkgedrag

### 6. Gedifferentieerde vijandelijke doctrines
* **Doel**: Escortes en vliegtuigen moeten per nationaliteit, oorlogsjaar, ervaringsniveau (training) en radars/sonarsystemen anders zoeken en jagen.
* **Cruciaal**: Geen telepathische kennis ("omniscience"); jagers moeten werken op basis van peilingen, geschatte datums, akoestische dovenhoeken (baffles), thermoclines en waarnemingsfouten.

### 7. Dynamische bewaking van missiepacing
* **Doel**: Geen geforceerde of automatische overwinningen, maar een pacing waarin routes, contactmomenten, tijdcompressie en terugkeercondities zo zijn uitgebalanceerd dat één primair tactisch hoofddoel doorgaans binnen circa 30 minuten haalbaar en intensief te spelen is.

### 8. AAR (After Action Report) als tactische reconstructie
* **Doel**: De AAR transformeren naar een volwaardige debriefing en reconstructie:
  * Tijdlijn met gevaren route en werkelijke scheepsbewegingen
  * Waargenomen vs werkelijke contacten
  * Cruciale beslismomenten (duikorders, koerswijzigingen)
  * Gelanceerde salvo's en treffers
  * Vijandelijke reacties en tegenaanvallen
  * Pas *achteraf* vrijgegeven inlichtingen (zonder voorkennis tijdens de missie)

### 9. Verdieping van campagnegevolgen
* **Doel**: Rompschade, torpedovoorraad, bemanningsvermoeidheid, opgedane inlichtingen, havenbeschikbaarheid en eerdere successen beïnvloeden de volgende patrouille merkbaar.
* **Balans**: Geen onherroepelijk doodlopende of verpeste campagne door één ongelukkige speelavond; altijd een herstel- of overlevingspad.

### 10. Automatisch footprint- en performancebudget
* **Doel**: Strikt geautomatiseerde bewaking in tests:
  * Downloadomvang (assets, CSS, JS)
  * DOM- en objectaantallen
  * Logomvang en geheugenlekken
  * Audiobuffers en WebAudio-stemmen (polyfoniebegrenzing)
  * Renderkosten en frametimes
  * Langdurig geheugengedrag op lagere hardware (mobiel/tablet)

---

## Deel 2: Vijf Goedkope Manieren voor Meer "3D" & Mooiere UI

1. **Gelaagde 2.5D-wereld**:
   * Afzonderlijke Canvaslagen voor hemel, verre kust/bergen, middelafstand, wateroppervlak, nabije objecten en partikeleffecten.
   * Parallax, atmosferische mist, diepteschaling en kleurverzadiging creëren overtuigende diepte zonder zware 3D-polygonen.
2. **Silhouette-atlassen en impostors**:
   * Per scheepstype een compacte atlas met gezichtshoeken (boeg, kwartier, dwars), schadestadia en afstands-LOD's.
   * De renderer kiest en schaalt deze perspectivisch.
3. **Procedurele belichting over eenvoudige vormen**:
   * Richtingafhankelijke highlights, slagschaduwen, atmosferisch perspectief, golvende waterreflecties en een compacte dag/nacht/schemering/regen-LUT over Canvasvormen.
4. **Begrensde screen-space effecten**:
   * Vaste objectpools voor spray, rook, vuur, vonken, waterfonteinen en schokgolfringen.
   * Geen run-time heap allocaties per frame; dynamisch afschalen op lichtere apparaten.
5. **Marine-specifieke UI-skins**:
   * Cockpit- en instrumentenpaneel gebouwd uit SVG, CSS en compacte overlays: messing wijzerplaten, stalen klinknagels, glasreflecties en achtergrondverlichting passend bij de nationaliteit.

---

## Deel 3: Concrete Operationele Taken ("Andere TODO")

- [x] **Havendetectie**: Detectie in havens alleen via hydrofoon; direct zicht telt nu mee via kustwacht en gezonken/beschadigde schepen op de ankerplaats escaleren de haven direct.
- [ ] **Vliegtuigdetectiefase**: Vliegtuigen vallen momenteel direct aan zonder voorafgaande verkennings- of detectiefase.
- [x] **Zoeklichten overdag**: Zoeklichten worden overdag automatisch gedoofd en niet langer weergegeven (`daylight >= 0.35`).
- [ ] **Havenmissies uitbouwen**: Kades, pakhuizen, havengebouwen, kustbatterijen, schijnwerpers, lichtkogels, corridors en torpedonetten toevoegen (beginnend bij *USN Chokepoint Penetration*).
- [ ] **Interne benchmark**: Gestandaardiseerde benchmark voor 3D-framerate, audioload en CPU-cycli, direct vergelijkbaar tussen apparaten en git-commits.
- [ ] **Automatische veilige routeplanning**: Routering over lange afstanden rond landmassa's automatiseren zonder hinder bij handmatige precisienavigatie.
- [ ] **Kaartlegenda & PRIMARY markering**: Kaartlegenda voor patrouillezones en heldere `PRIMARY`-markering op de doelwitten.
- [ ] **Kielmarge**: Blokkeren van de roer-/diepteorder vervangen door tijdelijk *onderbreken* met een geschaalde veiligheidsdrempel.
- [ ] **Audio polyfonie & kraakbegrenzing**: Stemmenbegrenzing voor druk- en rompkraken (met name op de Helios) en het waypointgeluid op schonere bus/cooldown zetten.
- [ ] **Cinematics duur**: Inkorten en vloeiender maken wanneer meerdere cinematics (zoals torpedo-inslagen of zinkende schepen) direct achter elkaar afspelen.
- [ ] **Topografie in de latere campagne**: Verfijnen en uitwerken van eilanden, dieptes en kustlijnen in latere oorlogsjaren.
