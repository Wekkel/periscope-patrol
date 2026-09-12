// ═══════════════════════════════════════════════════ SHIP RECOGNITION MANUAL
/* Phase 5.1 Foundation: Historical vessel recognition database, composite
   mast/funnel taxonomy (ONI-208 / Merchant Identification / Werft-Erkennungsdienst),
   masthead stadimeter rangefinding and identification verification.

   Design constraints:
   - Data-driven and immutable; zero runtime heap allocations per frame.
   - Preserves singleScript and JS budgets by keeping this separated from game-catalog.js.
   - Vector silhouettes rendered through compact SVG paths. */

const PP_RECOGNITION_VERSION = 1;

/**
 * Standard WW2 Naval Composite Codes (Masts, Funnels, Islands):
 * - 'M-F'       : Single mast forward, single funnel (Corvettes, Patrol craft, Coasters)
 * - 'F-M'       : Funnel forward of main working mast (Trawlers, small colliers)
 * - 'M-F-M'     : Mast, Funnel, Mast (Standard Freighters, Tramps, Destroyer Escorts)
 * - 'M-F-F-M'   : Mast, 2 Funnels, Mast (Fleet Destroyers, Cruisers, Cargo Liners)
 * - 'FLUSH-4F'  : Flush deck, 4 Funnels in line (Town-class / Great War Destroyers)
 * - 'ISLAND-AFT': Machinery and bridge structure aft, pipe/cargo deck forward (Tankers)
 * - 'FLIGHT-DECK': Flat unobstructed flight deck with starboard island (Carriers)
 */

const SHIP_RECOGNITION_CATALOG = Object.freeze({
  // ─── WARSHIPS & ESCORTS ──────────────────────────────────────────
  'flower-corvette': Object.freeze({
    id: 'flower-corvette',
    name: 'Flower-class Corvette',
    navy: 'RN / RCN',
    category: 'ESCORT',
    compositeCode: 'M-F',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 205, beamFt: 33, draftFt: 14.2, mastheadHeightFt: 62 }),
    tonnage: 940,
    speedMaxKnots: 16.0,
    armament: '1×4-in BL Mk IX, 2×20mm Oerlikon, Hedgehog, depth charges',
    modelKey: 'FLOWER_CORVETTE_1941',
    silhouetteSvg: 'M 10 32 L 20 28 L 52 28 L 56 31 L 110 31 L 115 32 L 112 36 L 14 36 Z M 40 28 L 40 22 L 52 22 L 52 28 Z M 44 22 L 44 10 M 46 22 L 48 18 L 50 28 M 58 28 L 59 17 L 65 17 L 64 28 Z M 26 28 L 26 25 L 32 25 L 32 28 Z',
    recognitionNotes: 'Short whaler hull with pronounced sheer forward. Single raked funnel immediately abaft tall pole mast. 4-inch gun on raised bandstand.'
  }),

  'town-destroyer': Object.freeze({
    id: 'town-destroyer',
    name: 'Town-class Destroyer',
    navy: 'RN / USN',
    category: 'ESCORT',
    compositeCode: 'FLUSH-4F',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 314, beamFt: 31, draftFt: 10.5, mastheadHeightFt: 72 }),
    tonnage: 1190,
    speedMaxKnots: 35.0,
    armament: '4×4-in QF, 1×3-in AA, 12×21-in torpedo tubes (4×3), depth charges',
    modelKey: 'TOWN_DESTROYER_1941',
    silhouetteSvg: 'M 8 32 L 20 29 L 118 29 L 122 32 L 120 35 L 10 35 Z M 32 29 L 32 23 L 42 23 L 42 29 Z M 36 23 L 36 8 M 46 29 L 46 20 L 50 20 L 50 29 Z M 54 29 L 54 20 L 58 20 L 58 29 Z M 62 29 L 62 20 L 66 20 L 66 29 Z M 70 29 L 70 20 L 74 20 L 74 29 Z M 98 29 L 98 15 M 24 29 L 24 26 L 28 26 L 28 29 Z',
    recognitionNotes: 'Four tall, slender, upright funnels in continuous line. Flush deck from stem to stern with straight sheer. Narrow Great War hull profile.'
  }),

  'black-swan-sloop': Object.freeze({
    id: 'black-swan-sloop',
    name: 'Black Swan-class Sloop',
    navy: 'RN',
    category: 'ESCORT',
    compositeCode: 'M-F-F-M',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 299, beamFt: 38.5, draftFt: 11.5, mastheadHeightFt: 75 }),
    tonnage: 1350,
    speedMaxKnots: 20.0,
    armament: '6×4-in QF Mk XVI (3×2), 4×2-pdr pom-pom, depth charges',
    modelKey: 'BLACK_SWAN_SLOOP',
    silhouetteSvg: 'M 10 33 L 22 28 L 75 28 L 78 30 L 118 30 L 120 33 L 116 36 L 12 36 Z M 38 28 L 38 21 L 50 21 L 50 28 Z M 42 21 L 42 8 M 53 28 L 54 18 L 58 18 L 57 28 Z M 63 28 L 64 19 L 68 19 L 67 28 Z M 92 30 L 92 16 M 25 28 L 25 24 L 32 24 L 32 28 Z',
    recognitionNotes: 'Extended high forecastle covering over half ship length. Two compact, slightly raked funnels. Twin enclosed 4-inch gun turrets forward and aft.'
  }),

  'river-frigate': Object.freeze({
    id: 'river-frigate',
    name: 'River-class Frigate',
    navy: 'RN / RCN',
    category: 'ESCORT',
    compositeCode: 'M-F-M',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 301, beamFt: 36.5, draftFt: 13.0, mastheadHeightFt: 74 }),
    tonnage: 1400,
    speedMaxKnots: 20.0,
    armament: '2×4-in QF Mk XVI (2×1), 10×20mm AA, Hedgehog, depth charges',
    modelKey: 'RIVER_FRIGATE_1942',
    silhouetteSvg: 'M 10 33 L 24 28 L 72 28 L 76 31 L 118 31 L 120 33 L 116 36 L 12 36 Z M 40 28 L 40 22 L 52 22 L 52 28 Z M 44 22 L 44 8 M 58 28 L 59 18 L 64 18 L 63 28 Z M 96 31 L 96 17 M 26 28 L 26 25 L 32 25 L 32 28 Z',
    recognitionNotes: 'Long forecastle stepping down aft of midships. Single squat, raked funnel flanked by boat davits. Two widely spaced single gun mounts.'
  }),

  'armed-trawler': Object.freeze({
    id: 'armed-trawler',
    name: 'Isles-class Armed Trawler',
    navy: 'RN',
    category: 'ESCORT',
    compositeCode: 'F-M',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 150, beamFt: 27, draftFt: 12.0, mastheadHeightFt: 52 }),
    tonnage: 540,
    speedMaxKnots: 12.0,
    armament: '1×12-pdr AA, 3×20mm AA, depth charges',
    modelKey: 'ARMED_TRAWLER',
    silhouetteSvg: 'M 14 33 L 26 29 L 68 29 L 72 31 L 102 31 L 104 33 L 100 36 L 16 36 Z M 48 29 L 48 22 L 58 22 L 58 29 Z M 52 22 L 52 11 M 61 29 L 62 20 L 66 20 L 65 29 Z M 32 29 L 32 26 L 36 26 L 36 29 Z',
    recognitionNotes: 'High commercial fishing bow with low working aft deck. Wheelhouse amidships with small funnel closely behind. 12-pounder gun forward.'
  }),

  'fletcher-destroyer': Object.freeze({
    id: 'fletcher-destroyer',
    name: 'Fletcher-class Destroyer',
    navy: 'USN',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 376, beamFt: 39.5, draftFt: 13.5, mastheadHeightFt: 82 }),
    tonnage: 2100,
    speedMaxKnots: 36.5,
    armament: '5×5-in/38 Mk 12 (5×1), 10×21-in TT, 40mm Bofors, depth charges',
    modelKey: 'US_FLETCHER_DESTROYER',
    silhouetteSvg: 'M 6 32 L 20 28 L 124 28 L 128 32 L 124 35 L 8 35 Z M 34 28 L 34 20 L 46 20 L 46 28 Z M 38 20 L 38 5 M 50 28 L 51 17 L 55 17 L 54 28 Z M 64 28 L 65 17 L 69 17 L 68 28 Z M 92 28 L 92 14 M 22 28 L 22 24 L 28 24 L 28 28 Z M 104 28 L 104 24 L 110 24 L 110 28 Z',
    recognitionNotes: 'Graceful flush deck with rounded bridge. Two flat-sided, raked funnels. Five enclosed single 5-inch gun turrets along centerline.'
  }),

  'us-destroyer-escort': Object.freeze({
    id: 'us-destroyer-escort',
    name: 'Buckley-class Destroyer Escort',
    navy: 'USN',
    category: 'ESCORT',
    compositeCode: 'M-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 306, beamFt: 36.5, draftFt: 11.5, mastheadHeightFt: 72 }),
    tonnage: 1400,
    speedMaxKnots: 24.0,
    armament: '3×3-in/50 Mk 22, 3×21-in TT, Hedgehog, depth charges',
    modelKey: 'US_DESTROYER_ESCORT',
    silhouetteSvg: 'M 8 33 L 22 29 L 116 29 L 120 33 L 116 36 L 10 36 Z M 36 29 L 36 22 L 48 22 L 48 29 Z M 40 22 L 40 7 M 56 29 L 57 19 L 62 19 L 61 29 Z M 88 29 L 88 17 M 24 29 L 24 25 L 30 25 L 30 29 Z',
    recognitionNotes: 'Flush deck with open bridge structure. Single thick, raked funnel with cap. Three open-shield 3-inch gun mounts.'
  }),

  'german-torpedo-boat': Object.freeze({
    id: 'german-torpedo-boat',
    name: 'Typ 1935 Torpedoboot',
    navy: 'KMS',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 361, beamFt: 33.5, draftFt: 11.0, mastheadHeightFt: 75 }),
    tonnage: 1090,
    speedMaxKnots: 35.0,
    armament: '1×10.5cm SK C/32, 1×3.7cm Flak, 6×53.3cm TT, mines',
    modelKey: 'GERMAN_TORPEDO_BOAT',
    silhouetteSvg: 'M 8 32 L 20 28 L 122 28 L 126 32 L 122 35 L 10 35 Z M 36 28 L 36 21 L 46 21 L 46 28 Z M 40 21 L 40 6 M 52 28 L 54 18 L 58 18 L 56 28 Z M 64 28 L 66 18 L 70 18 L 68 28 Z M 96 28 L 96 14',
    recognitionNotes: 'Low German silhouette with heavy funnel rake and trunked cowls. Prominent enclosed bridge house with pole mast step.'
  }),

  'german-minesweeper': Object.freeze({
    id: 'german-minesweeper',
    name: 'M-Boot Typ 1935',
    navy: 'KMS',
    category: 'ESCORT',
    compositeCode: 'M-F',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 226, beamFt: 29.5, draftFt: 8.5, mastheadHeightFt: 62 }),
    tonnage: 874,
    speedMaxKnots: 18.2,
    armament: '2×10.5cm SK C/32, 2×3.7cm Flak, mines, paravanes',
    modelKey: 'GERMAN_MINESWEEPER',
    silhouetteSvg: 'M 10 33 L 22 29 L 108 29 L 112 33 L 108 36 L 12 36 Z M 36 29 L 36 22 L 46 22 L 46 29 Z M 40 22 L 40 9 M 54 29 L 55 19 L 59 19 L 58 29 Z M 84 29 L 84 17',
    recognitionNotes: 'Sturdy flush-deck minesweeper. Single broad funnel slightly abaft compact bridge. Pronounced sweep gear on stern.'
  }),

  'soldati-destroyer': Object.freeze({
    id: 'soldati-destroyer',
    name: 'Soldati-class Destroyer',
    navy: 'RM',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 348, beamFt: 33.5, draftFt: 10.5, mastheadHeightFt: 82 }),
    tonnage: 1850,
    speedMaxKnots: 38.0,
    armament: '4×120mm/50 (2×2), 6×533mm TT, depth charges',
    modelKey: 'ITALIAN_SOLDATI_DESTROYER',
    silhouetteSvg: 'M 8 32 L 22 27 L 120 27 L 124 32 L 120 35 L 10 35 Z M 38 27 L 38 19 L 48 19 L 48 27 Z M 42 19 L 42 5 M 54 27 L 56 16 L 60 16 L 58 27 Z M 66 27 L 68 17 L 72 17 L 70 27 Z M 96 27 L 96 13 M 26 27 L 26 23 L 32 23 L 32 27 Z',
    recognitionNotes: 'Streamlined Italian profile with sweeping clipper bow. Two raked funnels with caps. Twin 120mm gun turrets on forecastle and shelter deck.'
  }),

  'gabbiano-corvette': Object.freeze({
    id: 'gabbiano-corvette',
    name: 'Gabbiano-class Corvette',
    navy: 'RM',
    category: 'ESCORT',
    compositeCode: 'M-F',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 210, beamFt: 28.5, draftFt: 9.5, mastheadHeightFt: 62 }),
    tonnage: 670,
    speedMaxKnots: 18.0,
    armament: '1×100mm/47 OTO, 7×20mm Breda, 2×450mm TT, depth charges',
    modelKey: 'ITALIAN_GABBIANO_CORVETTE',
    silhouetteSvg: 'M 10 33 L 22 28 L 74 28 L 78 31 L 110 31 L 112 33 L 108 36 L 12 36 Z M 38 28 L 38 21 L 48 21 L 48 28 Z M 42 21 L 42 9 M 56 28 L 57 18 L 61 18 L 60 28 Z M 88 31 L 88 18 M 26 28 L 26 25 L 30 25 L 30 28 Z',
    recognitionNotes: 'Long forecastle with curved bridge shield. Single raked funnel. Shielded 100mm gun forward and light torpedo tubes along waist.'
  }),

  'gnevny-destroyer': Object.freeze({
    id: 'gnevny-destroyer',
    name: 'Project 7 Gnevny Destroyer',
    navy: 'VMF',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 367, beamFt: 34.5, draftFt: 13.0, mastheadHeightFt: 79 }),
    tonnage: 1850,
    speedMaxKnots: 37.0,
    armament: '4×130mm/50 B-13 (4×1), 6×533mm TT, depth charges',
    modelKey: 'SOVIET_GNEVNY_DESTROYER',
    silhouetteSvg: 'M 8 32 L 20 28 L 122 28 L 126 32 L 122 35 L 10 35 Z M 36 28 L 36 20 L 48 20 L 48 28 Z M 40 20 L 40 6 M 52 28 L 54 18 L 58 18 L 56 28 Z M 66 28 L 68 18 L 72 18 L 70 28 Z M 98 28 L 98 14 M 24 28 L 24 24 L 30 24 L 30 28 Z',
    recognitionNotes: 'Soviet fleet destroyer based on Italian design. Two tall, narrow funnels with slight rake. Four shielded 130mm guns in single mounts.'
  }),

  'soviet-patrol-escort': Object.freeze({
    id: 'soviet-patrol-escort',
    name: 'Project 2 Uragan Guard Ship',
    navy: 'VMF',
    category: 'ESCORT',
    compositeCode: 'M-F',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 190, beamFt: 27.0, draftFt: 8.0, mastheadHeightFt: 56 }),
    tonnage: 450,
    speedMaxKnots: 23.0,
    armament: '2×102mm/45, 3×45mm, 3×450mm TT, depth charges',
    modelKey: 'SOVIET_PATROL_ESCORT',
    silhouetteSvg: 'M 10 33 L 22 29 L 104 29 L 108 33 L 104 36 L 12 36 Z M 38 29 L 38 23 L 48 23 L 48 29 Z M 42 23 L 42 11 M 54 29 L 55 20 L 59 20 L 58 29 Z M 82 29 L 82 18',
    recognitionNotes: 'Compact flush-deck guard ship (Storozhevoy Korabl). Single low funnel and short bridge. 102mm gun mounts on bow and stern.'
  }),

  'ijn-fubuki-destroyer': Object.freeze({
    id: 'ijn-fubuki-destroyer',
    name: 'Fubuki-class Destroyer',
    navy: 'IJN',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'FLUSH_DECK',
    dimensions: Object.freeze({ lengthFt: 388, beamFt: 34.0, draftFt: 10.5, mastheadHeightFt: 79 }),
    tonnage: 1750,
    speedMaxKnots: 38.0,
    armament: '6×127mm/50 Type 3 (3×2), 9×610mm Type 93 Long Lance TT',
    modelKey: 'DESTROYER',
    silhouetteSvg: 'M 6 32 L 22 27 L 124 27 L 128 32 L 124 35 L 8 35 Z M 38 27 L 38 18 L 50 18 L 50 27 Z M 42 18 L 42 5 M 56 27 L 58 16 L 62 16 L 60 27 Z M 68 27 L 70 17 L 74 17 L 72 27 Z M 96 27 L 96 14 M 26 27 L 26 23 L 32 23 L 32 27 Z',
    recognitionNotes: 'Formidable Special Type destroyer with high curved bow sheer. Enclosed dual-gun turrets forward and aft. Two funnels with flared cowl caps.'
  }),

  'ijn-kaibokan': Object.freeze({
    id: 'ijn-kaibokan',
    name: 'Type C/D Kaibokan Escort',
    navy: 'IJN',
    category: 'ESCORT',
    compositeCode: 'M-F',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 256, beamFt: 29.8, draftFt: 10.0, mastheadHeightFt: 62 }),
    tonnage: 870,
    speedMaxKnots: 16.5,
    armament: '2×120mm Type 10, 6×25mm AA, depth charge throwers',
    modelKey: 'KAIBOKAN',
    silhouetteSvg: 'M 10 33 L 24 28 L 78 28 L 82 31 L 114 31 L 116 33 L 112 36 L 12 36 Z M 42 28 L 42 21 L 52 21 L 52 28 Z M 46 21 L 46 9 M 60 28 L 61 19 L 66 19 L 65 28 Z M 94 31 L 94 18 M 28 28 L 28 25 L 34 25 L 34 28 Z',
    recognitionNotes: 'Simplified wartime escort construction with flat-plate sheer. Shielded 120mm gun forward and single thick funnel amidships.'
  }),

  'ijn-heavy-cruiser': Object.freeze({
    id: 'ijn-heavy-cruiser',
    name: 'Takao-class Heavy Cruiser',
    navy: 'IJN',
    category: 'WARSHIP',
    compositeCode: 'M-F-F-M',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 662, beamFt: 67.0, draftFt: 20.5, mastheadHeightFt: 105 }),
    tonnage: 13400,
    speedMaxKnots: 35.5,
    armament: '10×203mm/50 Type 3 (5×2), 8×127mm DP, 16×610mm TT',
    modelKey: 'HEAVY_CRUISER',
    silhouetteSvg: 'M 4 32 L 20 26 L 86 26 L 90 29 L 132 29 L 136 32 L 130 35 L 6 35 Z M 44 26 L 44 14 L 62 14 L 62 26 Z M 50 14 L 50 2 M 66 26 L 70 12 L 76 12 L 72 26 Z M 82 29 L 84 15 L 88 15 L 86 29 Z M 110 29 L 110 12 M 22 26 L 22 21 L 30 21 L 30 26 Z M 32 26 L 32 22 L 40 22 L 40 26 Z',
    recognitionNotes: 'Massive castle-like forward bridge structure resembling a battleship pagoda. Raked twin funnels with curved trunking. Five twin 8-inch turrets.'
  }),

  'ijn-fleet-carrier': Object.freeze({
    id: 'ijn-fleet-carrier',
    name: 'Shokaku-class Fleet Carrier',
    navy: 'IJN',
    category: 'CARRIER',
    compositeCode: 'FLIGHT-DECK',
    deckProfile: 'FLIGHT_DECK',
    dimensions: Object.freeze({ lengthFt: 820, beamFt: 98.0, draftFt: 28.0, mastheadHeightFt: 98 }),
    tonnage: 29800,
    speedMaxKnots: 34.2,
    armament: '16×127mm Type 89 DP (8×2), 42×25mm AA, 72 operational aircraft',
    modelKey: 'CARRIER',
    silhouetteSvg: 'M 4 33 L 14 26 L 134 26 L 138 27 L 136 33 L 132 35 L 6 35 Z M 12 26 L 136 26 L 136 24 L 12 24 Z M 80 24 L 80 16 L 92 16 L 92 24 Z M 84 16 L 84 6 M 96 24 L 98 18 L 102 18 L 100 24 Z',
    recognitionNotes: 'Enclosed bow integrated into continuous wooden flight deck. Compact starboard island structure. Downward-curving funnels exhausting over sea on starboard side.'
  }),

  // ─── MERCHANTS & TANKERS ─────────────────────────────────────────
  'atlantic-freighter': Object.freeze({
    id: 'atlantic-freighter',
    name: 'Empire / Liberty Freighter',
    navy: 'ALLIED_MERCHANT',
    category: 'MERCHANT',
    compositeCode: 'M-F-M',
    deckProfile: 'THREE_ISLAND',
    dimensions: Object.freeze({ lengthFt: 410, beamFt: 56.0, draftFt: 27.5, mastheadHeightFt: 105 }),
    tonnage: 7100,
    speedMaxKnots: 11.5,
    armament: '1×4-in or 12-pdr gun on stern, light AA on bridge wings',
    modelKey: 'ATLANTIC_FREIGHTER',
    silhouetteSvg: 'M 8 33 L 18 28 L 36 28 L 38 30 L 52 30 L 54 27 L 82 27 L 84 30 L 108 30 L 110 28 L 122 28 L 124 33 L 120 36 L 10 36 Z M 60 27 L 60 19 L 76 19 L 76 27 Z M 64 19 L 64 6 M 70 19 L 70 10 L 74 10 L 74 19 Z M 32 30 L 32 8 M 96 30 L 96 8',
    recognitionNotes: 'Classic three-island cargo profile with raised forecastle, midships bridge castle, and poop deck. Two tall cargo kingpost masts with cargo derricks.'
  }),

  'atlantic-tramp': Object.freeze({
    id: 'atlantic-tramp',
    name: 'Standard Tramp Steamer',
    navy: 'ALLIED_MERCHANT',
    category: 'MERCHANT',
    compositeCode: 'M-F-M',
    deckProfile: 'RAISED_FORECASTLE',
    dimensions: Object.freeze({ lengthFt: 350, beamFt: 50.0, draftFt: 22.0, mastheadHeightFt: 92 }),
    tonnage: 4300,
    speedMaxKnots: 9.5,
    armament: '1×12-pdr stern mount or unarmed',
    modelKey: 'ATLANTIC_TRAMP',
    silhouetteSvg: 'M 10 33 L 20 29 L 46 29 L 48 31 L 86 31 L 88 28 L 116 28 L 118 33 L 114 36 L 12 36 Z M 64 31 L 64 21 L 76 21 L 76 31 Z M 68 21 L 68 8 M 72 21 L 72 13 L 75 13 L 75 21 Z M 36 31 L 36 9 M 102 31 L 102 9',
    recognitionNotes: 'Small midships superstructure with upright black funnel. Low cargo wells with forward and after cargo masts. Moderate sheer forward.'
  }),

  'atlantic-cargo-liner': Object.freeze({
    id: 'atlantic-cargo-liner',
    name: 'Fast Cargo Liner',
    navy: 'ALLIED_MERCHANT',
    category: 'MERCHANT',
    compositeCode: 'M-F-F-M',
    deckProfile: 'THREE_ISLAND',
    dimensions: Object.freeze({ lengthFt: 455, beamFt: 61.0, draftFt: 28.0, mastheadHeightFt: 98 }),
    tonnage: 8900,
    speedMaxKnots: 16.5,
    armament: '1×4.7-in stern gun, Oerlikon AA',
    modelKey: 'ATLANTIC_CARGO_LINER',
    silhouetteSvg: 'M 6 33 L 18 27 L 44 27 L 46 29 L 58 29 L 60 25 L 86 25 L 88 29 L 114 29 L 116 27 L 126 27 L 128 33 L 124 36 L 8 36 Z M 66 25 L 66 17 L 80 17 L 80 25 Z M 70 17 L 70 4 M 73 25 L 74 13 L 77 13 L 76 25 Z M 80 25 L 81 14 L 84 14 L 83 25 Z M 38 29 L 38 7 M 104 29 L 104 7',
    recognitionNotes: 'Long elegant hull with high cruiser stern. Two paired funnels amidships and passenger promenade deck below bridge. Superior sea speed.'
  }),

  'atlantic-coaster': Object.freeze({
    id: 'atlantic-coaster',
    name: 'Coastal Collier / Coaster',
    navy: 'ALLIED_MERCHANT',
    category: 'MERCHANT',
    compositeCode: 'F-M',
    deckProfile: 'ISLAND_AFT',
    dimensions: Object.freeze({ lengthFt: 260, beamFt: 41.0, draftFt: 17.0, mastheadHeightFt: 72 }),
    tonnage: 1950,
    speedMaxKnots: 9.5,
    armament: 'Light AA machine guns',
    modelKey: 'ATLANTIC_COASTER',
    silhouetteSvg: 'M 12 33 L 22 29 L 78 29 L 80 26 L 112 26 L 114 33 L 110 36 L 14 36 Z M 86 26 L 86 19 L 98 19 L 98 26 Z M 90 19 L 90 8 M 94 26 L 94 15 L 97 15 L 97 26 Z M 48 29 L 48 10',
    recognitionNotes: 'Machinery and accommodations placed entirely aft. Single tall hold forward with single central mast. Short, beamy hull with low freeboard.'
  }),

  'atlantic-tanker': Object.freeze({
    id: 'atlantic-tanker',
    name: 'T2 Ocean Tanker',
    navy: 'ALLIED_MERCHANT',
    category: 'TANKER',
    compositeCode: 'ISLAND-AFT',
    deckProfile: 'ISLAND_AFT',
    dimensions: Object.freeze({ lengthFt: 485, beamFt: 63.0, draftFt: 30.0, mastheadHeightFt: 79 }),
    tonnage: 10200,
    speedMaxKnots: 14.5,
    armament: '1×5-in/38 on poop, 1×3-in/50 on forecastle',
    modelKey: 'ATLANTIC_TANKER',
    silhouetteSvg: 'M 6 33 L 18 29 L 42 29 L 44 32 L 88 32 L 90 27 L 122 27 L 124 33 L 120 36 L 8 36 Z M 52 32 L 52 24 L 62 24 L 62 32 Z M 56 24 L 56 12 M 98 27 L 98 18 L 110 18 L 110 27 Z M 102 18 L 102 7 M 106 27 L 106 14 L 110 14 L 110 27 Z M 28 32 L 28 14',
    recognitionNotes: 'Low hull with flying gangway connecting raised forecastle, small navigating bridge amidships, and tall machinery island aft. Funnel aft.'
  }),

  'troop-transport': Object.freeze({
    id: 'troop-transport',
    name: 'Converted Troop Transport',
    navy: 'ALLIED_MERCHANT',
    category: 'MERCHANT',
    compositeCode: 'M-F-F-M',
    deckProfile: 'THREE_ISLAND',
    dimensions: Object.freeze({ lengthFt: 480, beamFt: 64.0, draftFt: 26.0, mastheadHeightFt: 102 }),
    tonnage: 11500,
    speedMaxKnots: 18.0,
    armament: '2×4-in guns, multiple 20mm AA mounts, extensive life rafts',
    modelKey: 'TROOP',
    silhouetteSvg: 'M 6 33 L 18 26 L 38 26 L 40 28 L 54 28 L 56 24 L 88 24 L 90 28 L 114 28 L 116 26 L 126 26 L 128 33 L 124 36 L 8 36 Z M 64 24 L 64 16 L 82 16 L 82 24 Z M 68 16 L 68 4 M 72 24 L 73 13 L 76 13 L 75 24 Z M 78 24 L 79 14 L 82 14 L 81 24 Z M 34 28 L 34 7 M 104 28 L 104 7',
    recognitionNotes: 'Large multi-deck liner silhouette with lifeboats in davits along entire midships block. Two thick funnels with rake. Fast convoy flagship.'
  })
});

// ─── QUERY & IDENTIFICATION HELPERS ───────────────────────────────

function getShipRecognitionClass(id) {
  return SHIP_RECOGNITION_CATALOG[id] || null;
}

function getAllRecognitionClasses(category = null) {
  const list = Object.values(SHIP_RECOGNITION_CATALOG);
  if (!category || category === 'ALL') return list;
  return list.filter(c => c.category === category);
}

/**
 * Infer the ground-truth recognition class for an active simulation contact.
 */
function inferShipClassFromContact(contact) {
  if (!contact) return null;
  const t = String(contact.type || '').toUpperCase();
  const dt = String(contact.displayType || '').toUpperCase();
  const pid = String(contact.vesselProfileId || '').toLowerCase();
  const mkey = String(contact.modelKey || '').toUpperCase();

  // Explicit profile matches
  if (pid.includes('flower') || mkey === 'FLOWER_CORVETTE_1941') return SHIP_RECOGNITION_CATALOG['flower-corvette'];
  if (pid.includes('town') || mkey === 'TOWN_DESTROYER_1941') return SHIP_RECOGNITION_CATALOG['town-destroyer'];
  if (pid.includes('black-swan') || mkey === 'BLACK_SWAN_SLOOP') return SHIP_RECOGNITION_CATALOG['black-swan-sloop'];
  if (pid.includes('river') || mkey === 'RIVER_FRIGATE_1942') return SHIP_RECOGNITION_CATALOG['river-frigate'];
  if (pid.includes('trawler') || mkey === 'ARMED_TRAWLER') return SHIP_RECOGNITION_CATALOG['armed-trawler'];
  if (pid.includes('fletcher') || mkey === 'US_FLETCHER_DESTROYER') return SHIP_RECOGNITION_CATALOG['fletcher-destroyer'];
  if (pid.includes('destroyer-escort') || mkey === 'US_DESTROYER_ESCORT') return SHIP_RECOGNITION_CATALOG['us-destroyer-escort'];
  if (pid.includes('torpedo-boat') || mkey === 'GERMAN_TORPEDO_BOAT') return SHIP_RECOGNITION_CATALOG['german-torpedo-boat'];
  if (pid.includes('minesweeper') || mkey === 'GERMAN_MINESWEEPER') return SHIP_RECOGNITION_CATALOG['german-minesweeper'];
  if (pid.includes('soldati') || mkey === 'ITALIAN_SOLDATI_DESTROYER') return SHIP_RECOGNITION_CATALOG['soldati-destroyer'];
  if (pid.includes('gabbiano') || mkey === 'ITALIAN_GABBIANO_CORVETTE') return SHIP_RECOGNITION_CATALOG['gabbiano-corvette'];
  if (pid.includes('gnevny') || mkey === 'SOVIET_GNEVNY_DESTROYER') return SHIP_RECOGNITION_CATALOG['gnevny-destroyer'];
  if (pid.includes('patrol-escort') || mkey === 'SOVIET_PATROL_ESCORT') return SHIP_RECOGNITION_CATALOG['soviet-patrol-escort'];
  if (pid.includes('carrier') || t === 'CARRIER' || dt.includes('CARRIER')) return SHIP_RECOGNITION_CATALOG['ijn-fleet-carrier'];
  if (pid.includes('cruiser') || t === 'HEAVY_CRUISER' || dt.includes('CRUISER')) return SHIP_RECOGNITION_CATALOG['ijn-heavy-cruiser'];
  if (pid.includes('kaibokan') || t === 'KAIBOKAN' || dt.includes('KAIBOKAN')) return SHIP_RECOGNITION_CATALOG['ijn-kaibokan'];
  if (t === 'DESTROYER' || dt.includes('DESTROYER')) return SHIP_RECOGNITION_CATALOG['ijn-fubuki-destroyer'];
  if (pid.includes('tanker') || t === 'TANKER' || dt.includes('TANKER')) return SHIP_RECOGNITION_CATALOG['atlantic-tanker'];
  if (pid.includes('cargo-liner') || mkey === 'ATLANTIC_CARGO_LINER') return SHIP_RECOGNITION_CATALOG['atlantic-cargo-liner'];
  if (pid.includes('coaster') || mkey === 'ATLANTIC_COASTER') return SHIP_RECOGNITION_CATALOG['atlantic-coaster'];
  if (pid.includes('tramp') || mkey === 'ATLANTIC_TRAMP') return SHIP_RECOGNITION_CATALOG['atlantic-tramp'];
  if (t === 'TROOP' || dt.includes('TROOP')) return SHIP_RECOGNITION_CATALOG['troop-transport'];
  if (t === 'MERCHANT' || dt.includes('MERCHANT') || dt.includes('FREIGHTER')) return SHIP_RECOGNITION_CATALOG['atlantic-freighter'];

  return SHIP_RECOGNITION_CATALOG['atlantic-freighter'];
}

/**
 * Optical Stadimeter Rangefinding Mathematics:
 * Calculates physical distance based on observed elevation angle of the masthead.
 * @param {number} mastheadHeightFt - Height from waterline to truck of the tallest mast in feet.
 * @param {number} elevationAngleDeg - Observed subtended angle between waterline and truck in degrees.
 * @returns {number} Distance in Nautical Miles (NM).
 */
function stadimeterRangeNm(mastheadHeightFt, elevationAngleDeg) {
  const hFt = Math.max(10, Number(mastheadHeightFt) || 60);
  const angDeg = Math.max(0.02, Number(elevationAngleDeg) || 0.5);
  const rad = angDeg * (Math.PI / 180);
  // 1 NM = 6076.1155 feet
  const rangeFt = hFt / Math.tan(rad);
  return Math.max(0.05, rangeFt / 6076.1155);
}

/**
 * Recommended Torpedo Running Depth based on Target Draft.
 * @param {number} draftFt - Ship draft in feet.
 * @param {boolean} magneticPistol - Whether running magnetic under-the-keel detonation.
 * @returns {number} Recommended torpedo run depth in feet (rounded to 5 ft increments).
 */
function recommendedTorpedoDepthFt(draftFt, magneticPistol = false) {
  const d = Math.max(8, Number(draftFt) || 20);
  if (magneticPistol) {
    // Under-the-keel blast: 2 ft below keel line, clamped 10-40 ft
    const target = d + 2;
    return Math.round(target / 5) * 5;
  }
  // Impact detonation: midships belt, ~50% to 65% of draft
  const target = Math.max(5, d * 0.55);
  return Math.max(5, Math.round(target / 5) * 5);
}

// Global export for node/browser
globalThis.SHIP_RECOGNITION_CATALOG = SHIP_RECOGNITION_CATALOG;
globalThis.getShipRecognitionClass = getShipRecognitionClass;
globalThis.getAllRecognitionClasses = getAllRecognitionClasses;
globalThis.inferShipClassFromContact = inferShipClassFromContact;
globalThis.stadimeterRangeNm = stadimeterRangeNm;
globalThis.recommendedTorpedoDepthFt = recommendedTorpedoDepthFt;
