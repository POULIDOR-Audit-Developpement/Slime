// Smoke test Node : charge physics + patterns et simule une partie complète.
import { readFileSync } from 'fs'

const src = [
  'js/physics.js',
  'js/patterns-defaults.js',
  'js/patterns.js'
].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

const storeStub = {}
global.localStorage = {
  getItem: k => storeStub[k] ?? null,
  setItem: (k, v) => { storeStub[k] = String(v) },
  removeItem: k => { delete storeStub[k] }
}
global.window = { location: { search: '' } }

const api = new Function(src + '\nreturn { Patterns, Phys, rowY, CELL }')()
const { Patterns, Phys, rowY, CELL } = api

let fails = 0
const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } }

Patterns.load()

// 1. Pool par défaut présent et valide
const defs = Patterns.defaults()
check('pool par défaut >= 20 sections', defs.length >= 20)
check('default pool valide', defs.every(p => Patterns.validatePattern(p).length === 0))
check('chaînage interne valide', defs.every(p => Patterns.validatePatternJumps(p).ok))

// 2. Simulation de partie : 400 sections sur 0 -> 200 s
let last = { x: 16, row: 2, y: rowY(2), w: 5 * CELL }
let elapsed = 0, nSec = 0, safetyCount = 0
const t0 = Date.now()
for (let i = 0; i < 400; i++) {
  elapsed = i * 0.5
  const sec = Patterns.spawnSection(last, elapsed)
  for (const p of sec.platforms) {
    check('plateforme dans l\'écran vertical', p.y >= 0 && p.y <= 270)
    if (p.safety) safetyCount++
    last = p
  }
  nSec++
}
check('400 sections générées', nSec === 400)
check('aucune plateforme de sécurité (pool sain)', safetyCount === 0)
console.log('   temps sim :', Date.now() - t0, 'ms')

// 3. Import/export roundtrip
const code = Patterns.exportCode()
const res = Patterns.importData(code)
check('export/import code roundtrip', res.ok && res.data.patterns.length === 0)
const patCode = Patterns.patternToCode(defs[0])
const res2 = Patterns.importData(patCode)
check('export/import pattern unique', res2.ok && res2.data.patterns.length === 1 && res2.data.patterns[0].id === defs[0].id)

// 3b. Import/export DÉDIÉ AUX PATTERNS : jamais de layout dans les échanges,
// jamais de réglage écrasé par un import.
Patterns.setPatternsRaw([JSON.parse(JSON.stringify(defs[0]))])
const parsed = JSON.parse(Patterns.exportPatterns())
check('export .json sans layout', parsed.format === Patterns.FORMAT && parsed.patterns.length === 1 && parsed.layout === undefined)
const fullCode = Patterns.exportCode()
const payload = JSON.parse(Buffer.from(fullCode.slice('SLIME1.'.length), 'base64').toString('utf8'))
check('export code sans layout', payload.patterns.length === 1 && payload.layout === undefined)

// Ancien export complet (avec layout) : accepté, mais le layout est ignoré
Patterns.setLayout({ phys: { grav: 777 } })
const oldExport = JSON.stringify({
  format: Patterns.FORMAT,
  patterns: [JSON.parse(JSON.stringify(defs[1]))],
  layout: { phys: { grav: 999 }, walls: { left: 60, right: 60 } }
})
const resOld = Patterns.importData(oldExport)
check('ancien export accepté, layout strippé', resOld.ok && resOld.data.patterns.length === 1 && resOld.data.layout === undefined)
check('applyImport replace : pool remplacé', Patterns.applyImport(resOld, 'replace') === 1 && Patterns.getPatterns()[0].id === defs[1].id)
check('réglages intacts après import (grav 777, murs défaut)', Patterns.getLayout().phys.grav === 777 && Patterns.getLayout().walls.left === 11 && Patterns.getLayout().walls.right === 14)
check('applyImport merge : pattern ajouté', Patterns.applyImport(Patterns.importData(Patterns.patternToCode(defs[2])), 'merge') === 1)
check('installDefaults remplace par les 20 défauts', Patterns.installDefaults() === defs.length && Patterns.getPatterns().length === defs.length && Patterns.getPatterns()[0].id === defs[0].id)
Patterns.setLayout(null)
Patterns.setPatternsRaw([]) // retour à l'état initial (pool vide -> défauts)

// 4. Import corrompu rejeté
check('code corrompu rejeté', Patterns.importData('SLIME1.!!!').ok === false)
check('json invalide rejeté', Patterns.importData('{oops').ok === false)
check('format inconnu rejeté', Patterns.importData('{"format":"x","patterns":[]}').ok === false)

// 5. Pattern invalide rejeté (row hors grille)
const bad = JSON.parse(JSON.stringify(defs[0])); bad.platforms[0].row = 9
check('pattern invalide détecté', Patterns.validatePattern(bad).length > 0)

// 6. Layout par défaut + applyLayout via Phys
check('layout par défaut (murs latéraux, pas de plafond)', Patterns.getLayout().walls.left === 11 && Patterns.getLayout().walls.right === 14 && Patterns.getLayout().walls.ceil === undefined)

// 6b. Physique réglable : défauts, setPhys, bornes, garde vmax >= vmin + 50
const phDef = Phys.phys()
check('phys défauts (slime 14, grav 620)', phDef.slimeR === 14 && phDef.grav === 620 && phDef.vmax === 360)
check('layout.phys normalisé par défaut', Patterns.getLayout().phys.slimeR === 14 && Patterns.getLayout().phys.aimMin === 24 && Patterns.getLayout().phys.aimMax === 140)

// 6b''. Caméra : nouvelle base ×2 (80/240), migration de l'ancienne base (40/120)
check('caméra : nouvelle base par défaut (80/240)', phDef.camBase === 80 && phDef.camMax === 240)
Phys.setPhys({ camBase: 40, camMax: 120 })
check('caméra : ancienne base migrée vers la nouvelle', Phys.phys().camBase === 80 && Phys.phys().camMax === 240)
Phys.setPhys({ camBase: 200, camMax: 400 })
check('caméra : bornes hautes accessibles (200/400)', Phys.phys().camBase === 200 && Phys.phys().camMax === 400)
Phys.setPhys({ camBase: 300, camMax: 900 })
check('caméra : hors bornes écrêté (200/400)', Phys.phys().camBase === 200 && Phys.phys().camMax === 400)
Phys.setPhys(null)
check('caméra : retour à la nouvelle base', Phys.phys().camBase === 80 && Phys.phys().camMax === 240)

Phys.setPhys({ grav: 800, slimeR: 10 })
check('setPhys appliqué', Phys.phys().grav === 800 && Phys.phys().slimeR === 10 && Phys.phys().vmin === 210)
Phys.setPhys({ vmin: 400, vmax: 200, grav: 99999 })
check('bornes + garde vmax', Phys.phys().grav === 1000 && Phys.phys().vmin === 400 && Phys.phys().vmax >= 450)
Phys.setPhys(null)
check('setPhys(null) -> défauts', Phys.phys().grav === 620 && Phys.phys().slimeR === 14)

// 6b'. Pouvoirs : cooldown 0 est une valeur valide (pas de fallback défaut)
Patterns.setLayout({ powers: { doubleJump: { cooldown: 0 } } })
check('cooldown 0 normalisé tel quel', Patterns.getLayout().powers.doubleJump.cooldown === 0)
check('défauts pouvoirs sinon', Patterns.getLayout().powers.slowmo.scale === 0.35 && Patterns.getLayout().view.zoom === 1)
Patterns.setLayout(null)

// 6c. Résilience du stockage : backup (_bak) + récupération au chargement
const storeKey = 'slime_patterns_v1', bakKey = 'slime_patterns_v1_bak'
check('statut initial : vide', Patterns.loadStatus() === 'vide')
Patterns.setLayout({ phys: { grav: 777 } })
Patterns.setPatternsRaw([JSON.parse(JSON.stringify(defs[0]))])
check('backup écrit à chaque sauvegarde', !!storeStub[bakKey])
storeStub[storeKey] = '{oops pas du JSON'
check('load : statut recupere', Patterns.load() && Patterns.loadStatus() === 'recupere')
check('layout récupéré depuis le backup', Patterns.getLayout().phys.grav === 777)
check('pool récupéré (backup = sauvegarde précédente)', Patterns.getPatterns().length === 0)
check('clé principale auto-réparée', (() => { try { return JSON.parse(storeStub[storeKey]).format === 'slime-patterns@1' } catch (e) { return false } })())
storeStub[storeKey] = 'garbage'
storeStub[bakKey] = 'garbage'
Patterns.load()
check('tout illisible : défauts + statut corrompu', Patterns.loadStatus() === 'corrompu' && Patterns.getLayout().phys.grav === 620)
Patterns.setLayout(null)
Patterns.load()
check('store sain : statut ok', Patterns.loadStatus() === 'ok')
// Un layout persisté avec phys applique bien la config à la simu
Patterns.setLayout({ phys: { slimeR: 16, grav: 700 } })
check('layout.phys persisté', Patterns.getLayout().phys.slimeR === 16 && Patterns.getLayout().phys.grav === 700)
Phys.setPhys(Patterns.getLayout().phys)
check('simu utilise le layout', Phys.phys().slimeR === 16 && Phys.phys().grav === 700)
Patterns.setLayout(null)
check('layout par défaut restauré', Patterns.getLayout().phys.slimeR === 14)

// 6d. Ancien save éditeur (layout persisté avec l'ancienne base caméra 40/120)
// -> migré vers la nouvelle base au chargement : c'est le scénario « les saves
// de l'éditeur appliquent l'ancienne vitesse » qui doit disparaître.
storeStub[storeKey] = JSON.stringify({ format: Patterns.FORMAT, patterns: [], layout: { phys: { camBase: 40, camMax: 120 } } })
Patterns.load()
check('ancien save éditeur : caméra migrée (80/240)', Patterns.getLayout().phys.camBase === 80 && Patterns.getLayout().phys.camMax === 240)
Patterns.setLayout(null)

// 7. Pin mode test
Patterns.pin(defs[3])
const sec = Patterns.spawnSection(last, 0)
check('pin : section instanciée', sec.platforms.length > 0)
Patterns.pin(null)

// 8. Murs verticaux
// 8a. colonne dont le sommet est un palier légitime -> chaîne valide
const murTop = {
  id: 't-mur-top', name: 'mur top', difficulty: 3, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 384, row: 1, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 288, cells: 1, row: 1, kind: 'ground', spiked: true }],
  balls: [], decor: []
}
check('mur-top : schéma valide', Patterns.validatePattern(murTop).length === 0)
const vt = Patterns.validatePatternJumps(murTop)
check('mur-top : chaîne valide (saut sur le sommet)', vt.ok)
check('mur-top : 3 nœuds (2 plat + sommet)', vt.jumps.length === 3)

// 8b. mur infranchissable -> chaîne invalide
const murBloque = {
  id: 't-mur-ko', name: 'mur bloquant', difficulty: 4, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 384, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 224, cells: 2, row: 0, kind: 'ground', spiked: true }],
  balls: [], decor: []
}
check('mur-bloquant : détecté impossible', Patterns.validatePatternJumps(murBloque).ok === false)

// 8b'. Vérification des sauts OPTIONNELLE : l'admin décide (layout.checkJumps).
// Le simulateur n'est pas infaillible — coupé, un pattern "impossible" est
// joué tel quel ; actif (défaut), il est remplacé par la plateforme de repli.
const anchorKo = { x: -128, row: 2, y: rowY(2), baseY: rowY(2), w: 128, type: 'basic', amp: 0, spd: 0, ph: 0 }
Patterns.pin(murBloque)
Patterns.setLayout({ checkJumps: true })
check('vérif active (défaut) : repli sécurité', Patterns.spawnSection(anchorKo, 120).platforms.some(p => p.safety))
Patterns.setLayout({ checkJumps: false })
const secKo = Patterns.spawnSection(anchorKo, 120)
check('vérif coupée : pattern injoignable joué tel quel',
  secKo.platforms.length === Patterns.instantiate(murBloque, anchorKo).platforms.length &&
  !secKo.platforms.some(p => p.safety))
check('vérif coupée : réglage persisté', JSON.parse(localStorage.getItem('slime_patterns_v1')).layout.checkJumps === false)
Patterns.setLayout(null)
check('vérif : défaut réactivé après reset', Patterns.getLayout().checkJumps === true)
Patterns.pin(null)

// 8c. stalactite bloquant un passage bas -> invalide
const murCeil = {
  id: 't-mur-ceil', name: 'stalactite bloquante', difficulty: 4, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 320, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 224, cells: 1, row: 2, kind: 'ceil', spiked: false }],
  balls: [], decor: []
}
check('stalactite : détectée impossible', Patterns.validatePatternJumps(murCeil).ok === false)

// 8d. instanciation : le sommet devient une plateforme wallTop, les murs sortent
{
  const anchor = { x: -128, row: 2, y: rowY(2), baseY: rowY(2), w: 128, type: 'basic', amp: 0, spd: 0, ph: 0 }
  const inst = Patterns.instantiate(murTop, anchor)
  check('instantiate : murs géolocalisés', inst.walls.length === 1 && inst.walls[0].y1 === rowY(1) && inst.walls[0].y2 === 270)
  const top = inst.platforms.find(p => p.wallTop)
  check('instantiate : sommet wallTop présent', !!top && top.y === rowY(1) && top.w === 32)
}

// 8e. rétro-compatibilité : pattern sans champ walls
const sansMurs = JSON.parse(JSON.stringify(defs[0]))
check('rétro-compat sans walls', Patterns.validatePattern(sansMurs).length === 0)

// 9. Validation étendue : double saut, rattrape de bord (ledge), budget DJ
const plat = (x, row, type) => ({ x, row, cells: 3, type: type || 'basic', yOff: 0, amp: 0, spd: 0, spike: null })

// 9a. gap lointain : impossible en simple (portée max ~209 px à hauteur
// égale), OK via le double saut (bande 210 -> 413)
const djGap = {
  id: 't-dj-gap', name: 'gap double saut', difficulty: 5, entry: { row: 2 },
  platforms: [plat(330, 2)], balls: [], decor: []
}
const vDj = Patterns.validatePatternJumps(djGap)
check('gap lointain : OK via double saut', vDj.ok === true && vDj.okSimple === false && vDj.jumps[0].via === 'double')
Patterns.setLayout({ powers: { doubleJump: { enabled: false } } })
check('gap lointain : KO sans double saut', Patterns.validatePatternJumps(djGap).ok === false)
Patterns.setLayout(null)

// 9b. budget : UN seul double saut par chaîne — deux gaps consécutifs
// nécessitant le DJ sont infaisables (cooldown 4 s > durée d'un pattern)
const djDeux = {
  id: 't-dj-deux', name: 'deux gaps DJ', difficulty: 5, entry: { row: 2 },
  platforms: [plat(330, 2), plat(716, 2)], balls: [], decor: []
}
const vDeux = Patterns.validatePatternJumps(djDeux)
check('budget DJ : 2e gap KO après consommation', vDeux.ok === false && vDeux.jumps[0].via === 'double' && vDeux.jumps[1].ok === false)

// 9c. rattrape de bord : une plateforme à peine trop loin passe via ledge
// (recherche de x : atterrissage simple échoue, la fenêtre d'accroche suffit)
let ledgePat = null
for (let x = 150; x <= 260 && !ledgePat; x += 2) {
  const p = { id: 't-ledge', name: 'ledge', difficulty: 5, entry: { row: 2 }, platforms: [plat(x, 2, 'basic')], balls: [], decor: [] }
  const v = Patterns.validatePatternJumps(p)
  if (v.ok && !v.okSimple && v.jumps[0].via === 'ledge') ledgePat = p
}
check('rattrape de bord détectée (via ledge)', !!ledgePat)
if (ledgePat) {
  // coupe ledge ET double saut : la rattrape était la seule issue
  Patterns.setLayout({ powers: { doubleJump: { enabled: false }, ledge: { enabled: false } } })
  check('rattrape : KO quand ledge désactivé', Patterns.validatePatternJumps(ledgePat).ok === false)
  Patterns.setLayout(null)
}

// 9d. collante + double saut : 1ère jambe affaiblie (x0.8), 2e à pleine puissance
let stickyPat = null
for (let x = 380; x <= 620 && !stickyPat; x += 2) {
  const p = { id: 't-sticky-dj', name: 'sticky dj', difficulty: 5, entry: { row: 2 }, platforms: [plat(160, 2, 'sticky'), plat(x, 2, 'basic')], balls: [], decor: [] }
  const v = Patterns.validatePatternJumps(p)
  if (v.ok && v.jumps[0].via === 'jump' && v.jumps[1].via === 'double') stickyPat = p
}
check('sticky -> DJ : 1ère jambe simple, 2e via double saut', !!stickyPat)

// 9e. rebondissante + double saut : correction en plein arc
let bouncePat = null
for (let x = 300; x <= 620 && !bouncePat; x += 4) {
  for (const row of [0, 1]) {
    const p = { id: 't-bounce-dj', name: 'bounce dj', difficulty: 5, entry: { row: 2 }, platforms: [plat(160, 2, 'bouncy'), plat(x, row, 'basic')], balls: [], decor: [] }
    const v = Patterns.validatePatternJumps(p)
    if (v.ok && v.jumps[1].via === 'bounce+dj') { bouncePat = p; break }
  }
}
check('rebond + DJ : correction mid-arc détectée', !!bouncePat)

// 9f. désactiver TOUS les pouvoirs : le gap DJ redevient impossible
Patterns.setLayout({ powers: { doubleJump: { enabled: false }, ledge: { enabled: false } } })
check('pouvoirs coupés : gap lointain KO', Patterns.validatePatternJumps(djGap).ok === false)
check('pouvoirs coupés : gap lointain non-simple', Patterns.validatePatternJumps(djGap).okSimple === false)
Patterns.setLayout(null)

console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`)
process.exit(fails === 0 ? 0 : 1)
