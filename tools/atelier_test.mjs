// Test T7 — L'Atelier des bocaux, logique PURE (js/atelier.js) :
//   fmtTime    : secondes -> 'm:ss' (aucun padding sur les minutes)
//   buildPages : vue publique GET /api/scores -> pages du livre
//                (page dorée en tête, puis UNE page par palier de la config ;
//                palier fermé -> open:false, color:null, lines vides — la
//                couleur d'un palier fermé ne doit JAMAIS être exposée)
//   jarFill    : remplissage des bocaux (8 premiers noms + « +N »),
//                dérivé du MÊME top que les pages
//   shelfPos   : position des étagères (zone meuble = moitié GAUCHE,
//                x constant = W*0.25, i=0 en HAUT dans [H*0.08, H*0.92])
// Harnais `new Function` (style music_test.mjs) : aucune dépendance DOM.
// Run : node tools/atelier_test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (label, ok) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label) }
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---- harnais : charge js/atelier.js et expose le global Atelier ----
function loadAtelier() {
  const src = readFileSync(new URL('../js/atelier.js', import.meta.url), 'utf8')
  const sandbox = new Function('window', 'document', 'return (() => {' + src + '; return Atelier })()')
  return sandbox(undefined, undefined)
}

// ---- 1. fmtTime : cas du brief ----
{
  const A = loadAtelier()
  check("fmtTime(0) -> '0:00'", A.fmtTime(0) === '0:00')
  check("fmtTime(95) -> '1:35'", A.fmtTime(95) === '1:35')
  check("fmtTime(600) -> '10:00' (minutes sans padding)", A.fmtTime(600) === '10:00')
  check("fmtTime(59) -> '0:59' / fmtTime(60) -> '1:00'", A.fmtTime(59) === '0:59' && A.fmtTime(60) === '1:00')
  check('fmtTime : non-entiers/négatifs tolérés (95.9 -> 1:35, -5 -> 0:00)', A.fmtTime(95.9) === '1:35' && A.fmtTime(-5) === '0:00')
}

// ---- 2. buildPages : page dorée en tête + une page par palier ----
{
  const A = loadAtelier()
  // Config paliers (style SlimeColors.DEFAULTS) : 6 paliers.
  const tiers = [
    { min: 0, type: 'flat', hex: '#3ecb3e' },
    { min: 100, type: 'flat', hex: '#35d0c5' },
    { min: 200, type: 'flat', hex: '#4a5ed7' },
    { min: 350, type: 'flat', hex: '#a04fd8' },
    { min: 500, type: 'flat', hex: '#ef5fa7' },
    { min: 750, type: 'flat', hex: '#ffd23f' }
  ]
  // Vue publique (forme EXACTE de GET /api/scores, T4) : 2 dorés,
  // 6 paliers (2 ouverts, 4 fermés) — la vue n'expose AUCUN top si fermé.
  const view = {
    golden: [
      { id: 11, name: 'Ada', tier: 3 },
      { id: 12, name: 'Bo', tier: 1 }
    ],
    tiers: [
      { index: 0, open: true, total: 2, top: [{ id: 1, name: 'Ada', time: 0 }, { id: 2, name: 'Bo', time: 12 }] },
      { index: 1, open: true, total: 1, top: [{ id: 2, name: 'Bo', time: 95 }] },
      { index: 2, open: false, total: 0, top: [] },
      { index: 3, open: false, total: 0, top: [] },
      { index: 4, open: false, total: 0, top: [] },
      { index: 5, open: false, total: 0, top: [] }
    ]
  }
  const snapshot = JSON.stringify(view)
  const pages = A.buildPages(view, tiers)

  check('6 paliers + dorée = 7 pages', pages.length === 7)
  check('page dorée en tête, kind golden', pages[0].kind === 'golden')
  check('page dorée : SEUL le nom (pas de time, pas de score/tier)',
    deepEq(pages[0].lines, [{ name: 'Ada' }, { name: 'Bo' }]) &&
    !('time' in pages[0].lines[0]) && !('score' in pages[0].lines[0]) && !('tier' in pages[0].lines[0]))
  check('chaque page porte kind/open/total/lines', pages.every(p => p.kind && typeof p.open === 'boolean' && Number.isFinite(p.total) && Array.isArray(p.lines)))

  const open1 = pages[2] // index:1
  check("palier ouvert : kind tier + index + color = hex de la config", open1.kind === 'tier' && open1.index === 1 && open1.color === '#35d0c5')
  check('palier ouvert : open:true, total et lignes {name, time}', open1.open === true && open1.total === 1 && deepEq(open1.lines, [{ name: 'Bo', time: 95 }]))
  check('palier 0 : color = vert de la config', pages[1].color === '#3ecb3e' && pages[1].total === 2 && pages[1].lines.length === 2)

  const closed = pages.slice(3) // index 2..5
  check('palier fermé : open:false, lines vides, total 0', closed.every(p => p.open === false && p.lines.length === 0 && p.total === 0))
  check('palier fermé : color null — AUCUNE fuite de couleur', closed.every(p => p.color === null))
  check('vue publique non mutée', JSON.stringify(view) === snapshot)
  // Aucune couleur non demandée : seuls les paliers ouverts portent un hex.
  check('pages dorée sans color/index', !('color' in pages[0]) && !('index' in pages[0]))
}

// ---- 3. jarFill : bocaux dérivés du même top ----
{
  const A = loadAtelier()
  const names = n => Array.from({ length: n }, (_, i) => 'P' + (i + 1))

  // 12 entrées -> shown 8, extra 4
  {
    const r = A.jarFill(names(12), 12)
    check('jarFill 12 entrées -> shown = 8 premiers noms', r.shown.length === 8 && deepEq(r.shown, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']))
    check('jarFill 12 entrées -> extra 4', r.extra === 4)
  }
  // 3 entrées -> shown 3, extra 0
  {
    const r = A.jarFill(names(3), 3)
    check('jarFill 3 entrées -> shown 3, extra 0', r.shown.length === 3 && r.extra === 0)
  }
  // total manquant/indéfini -> total = top.length (défaut sain)
  {
    const r = A.jarFill(names(12))
    check('jarFill total manquant -> total = top.length (12 -> extra 4)', r.shown.length === 8 && r.extra === 4)
  }
  // total > top.length — la FORMULE du ruling fait foi :
  // extra = max(0, total - shown.length). Avec le cap par défaut (8) :
  // top=10, total=25 -> 25-8 = 17. (L'exemple « 15 » du ruling = 25-10
  // contredit sa propre formule ET son cas « 12 -> extra 4 » qui exige
  // total - shown ; noté dans le rapport. Le même appel avec cap=10
  // reproduit bien 15.)
  {
    const r = A.jarFill(names(10), 25)
    check('jarFill top=10, total=25 (cap défaut) -> shown 8, extra 17 (formule total - shown)', r.shown.length === 8 && r.extra === 17)
    const r10 = A.jarFill(names(10), 25, 10)
    check('jarFill top=10, total=25, cap=10 -> shown 10, extra 15', r10.shown.length === 10 && r10.extra === 15)
  }
  // total < shown -> jamais d'extra négatif
  {
    const r = A.jarFill(names(3), 1)
    check('jarFill total < shown -> extra = 0 (jamais négatif)', r.extra === 0)
  }
  // entrées objets {name} (forme réelle du top serveur) acceptées aussi
  {
    const top = [{ id: 1, name: 'A', time: 3 }, { id: 2, name: 'B', time: 9 }]
    const r = A.jarFill(top, 5)
    check('jarFill accepte des entrées {name} et ne mute pas le top', deepEq(r.shown, ['A', 'B']) && r.extra === 3 && top.length === 2)
  }
}

// ---- 4. shelfPos : zone meuble = moitié gauche, i=0 en haut ----
{
  const A = loadAtelier()
  const pts = []
  for (let i = 0; i < 6; i++) pts.push(A.shelfPos(i, 6, 960, 540))
  check('shelfPos : x constant (centre du meuble = W*0.25 = 240)', pts.every(p => p.x === 960 * 0.25))
  check('shelfPos(0..5, 6) : y strictement croissant', pts.every((p, i) => i === 0 || p.y > pts[i - 1].y))
  check('shelfPos : y réparti dans [H*0.08, H*0.92], i=0 en HAUT', Math.abs(pts[0].y - 540 * 0.08) < 1e-9 && Math.abs(pts[5].y - 540 * 0.92) < 1e-9)
  check('shelfPos count=1 : étagère centrée verticalement', Math.abs(A.shelfPos(0, 1, 960, 540).y - 270) < 1e-9)
  check('shelfPos : hors bornes clampé (pas de y hors zone)', A.shelfPos(-1, 6, 960, 540).y >= 540 * 0.08 - 1e-9 && A.shelfPos(9, 6, 960, 540).y <= 540 * 0.92 + 1e-9)
}

// ---- 5. chargement hors navigateur : aucune exception, exports purs ----
{
  let threw = false
  try {
    const A = loadAtelier()
    if (typeof A.fmtTime !== 'function' || typeof A.jarFill !== 'function' || typeof A.buildPages !== 'function' || typeof A.shelfPos !== 'function') threw = true
  } catch (e) { threw = true }
  check('sans window/document : module chargé, 4 fonctions pures exposées', !threw)
}

console.log(fail === 0 ? '\nATELIER OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
