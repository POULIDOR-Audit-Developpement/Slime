// Test DOM Node : exécute editor.js avec un mini-DOM et vérifie l'onglet PHYS
// (vue pleine page, sliders rendus, application au layout/Phys, reset) et le
// redimensionnement du panneau propriétés (poignée + persistance).
// Usage : node tools/editor_dom_test.mjs
import { readFileSync } from 'fs'
const root = new URL('../', import.meta.url).pathname
const src = ['js/physics.js','js/sprites.js','js/patterns-defaults.js','js/patterns.js','js/editor.js']
  .map(f => readFileSync(root + f, 'utf8')).join('\n')

// --- mini DOM ---
const els = {}
function makeEl(id) {
  const el = {
    id, handlers: {}, children: [],
    style: {}, dataset: {},
    classList: { _s: new Set(['tab']), toggle(c, f) { f ? this._s.add(c) : this._s.delete(c) }, add(c) { this._s.add(c) }, remove(c) { this._s.delete(c) }, contains(c) { return this._s.has(c) } },
    innerHTML: '', textContent: '', value: '', checked: false,
    clientWidth: 800, clientHeight: 450, width: 0, height: 0,
    addEventListener(ev, fn) { this.handlers[ev] = fn },
    getContext: () => new Proxy({}, { get: (t, k) => (t[k] ||= () => undefined), set: () => true }),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 272, height: 450 }),
    appendChild() {}
  }
  return el
}
const ids = ['cv','list','props','propsResize','toolbar','coords','status','storeInfo','fileImport','tbHint','tType','tCellsV','tZoomV','tWallV','tabPatterns','tabLayout','tabPhys','tabPower']
for (const i of ids) els[i] = makeEl(i)
const mainEl = makeEl('main')
const documentStub = {
  readyState: 'complete',
  addEventListener() {},
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelector: sel => sel === 'main' ? mainEl : makeEl(sel),
  createElement: tag => makeEl(tag),
  documentElement: {}
}
const ls = {}
const winHandlers = {}
const windowStub = {
  devicePixelRatio: 1,
  addEventListener(ev, fn) { (winHandlers[ev] ||= []).push(fn) },
  removeEventListener(ev, fn) { winHandlers[ev] = (winHandlers[ev] || []).filter(f => f !== fn) },
  fire(ev, evObj) { for (const fn of winHandlers[ev] || []) fn(evObj) },
  requestAnimationFrame: () => 0,
  location: { search: '', origin: 'http://test' }
}

let failed = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { failed++; console.log('FAIL', name) } }

const fn = new Function('document', 'window', 'localStorage', 'confirm', 'Image', 'requestAnimationFrame', 'els', 'check', 'win', src + `
;(() => {
  // init a déjà tourné (readyState complete) — passe en mode PHYS
  Ed.setMode('phys')
  const main = document.querySelector('main')
  check('classe phys sur <main>', main.classList.contains('phys'))
  const html = els.props.innerHTML
  check('vue pleine page : physGrid + physHead', html.includes('physGrid') && html.includes('physHead') && html.includes('physCard'))
  check('6 cartes de groupe', (html.match(/physCard/g) || []).length === 6)
  check('17 sliders rendus', (html.match(/type="range"/g) || []).length === 17)
  check('bouton réinitialiser présent', html.includes('btnResetPhys'))
  // bouge le slider gravité -> brouillon uniquement (rien d'appliqué)
  els['ph_grav'].value = '800'
  els['ph_grav'].handlers.input()
  check('slider grav -> brouillon, layout inchangé', Patterns.getLayout().phys.grav === 620 && Phys.phys().grav === 620)
  check('label du brouillard mis à jour', String(els['ph_gravV'].textContent) === '800')
  check('bouton Appliquer en état dirty', els.btnApplyPhys.classList.contains('dirty'))
  check('note « non appliquées » visible', els.physDirtyNote.style.display === '')
  // clic Appliquer -> layout + Phys mis à jour
  els.btnApplyPhys.handlers.click()
  check('appliquer -> layout.phys', Patterns.getLayout().phys.grav === 800)
  check('appliquer -> Phys.setPhys', Phys.phys().grav === 800)
  check('appliquer -> bouton plus dirty', !els.btnApplyPhys.classList.contains('dirty'))
  check('appliquer -> localStorage persisté', (localStorage.getItem('slime_patterns_v1') || '').includes('"grav":800'))
  // reset
  els.btnResetPhys.handlers.click()
  check('reset -> grav défaut 620', Patterns.getLayout().phys.grav === 620 && Phys.phys().grav === 620)
  check('reset -> slimeR défaut 14', Patterns.getLayout().phys.slimeR === 14)
  // retour PATTERNS : classe retirée
  Ed.setMode('patterns')
  check('retour patterns : classe phys retirée', !main.classList.contains('phys'))

  // --- onglet POWER : brouillon + bouton Appliquer (double saut + slow-mo) ---
  Ed.setMode('power')
  check('classe power sur <main>', main.classList.contains('power'))
  const ph2 = els.props.innerHTML
  check('vue pleine page POWER : physGrid + boutons', ph2.includes('physGrid') && ph2.includes('btnApplyPow') && ph2.includes('btnResetPow'))
  check('cartes double saut + slow-mo', ph2.includes('Double saut') && ph2.includes('Slow-mo'))
  check('cases activation présentes', ph2.includes('pw_doubleJump_enabled') && ph2.includes('pw_slowmo_enabled'))
  // slider cooldown -> brouillon uniquement
  els['pw_doubleJump_cooldown'].value = '7.5'
  els['pw_doubleJump_cooldown'].handlers.input()
  check('slider cooldown -> brouillon, layout inchangé', Patterns.getLayout().powers.doubleJump.cooldown === 4)
  check('bouton Appliquer POWER dirty', els.btnApplyPow.classList.contains('dirty'))
  // slider échelle slow-mo (cumulé au brouillon)
  els['pw_slowmo_scale'].value = '0.25'
  els['pw_slowmo_scale'].handlers.input()
  check('slider échelle slow-mo -> brouillon', Patterns.getLayout().powers.slowmo.scale === 0.35)
  // désactivation dans le brouillon
  els['pw_doubleJump_enabled'].checked = false
  els['pw_doubleJump_enabled'].handlers.change()
  check('case activation -> brouillon', Patterns.getLayout().powers.doubleJump.enabled === true)
  // Appliquer -> tout le brouillon est validé
  els.btnApplyPow.handlers.click()
  check('appliquer -> cooldown 7.5', Patterns.getLayout().powers.doubleJump.cooldown === 7.5)
  check('appliquer -> échelle slow-mo 0.25', Patterns.getLayout().powers.slowmo.scale === 0.25)
  check('appliquer -> pouvoir désactivé', Patterns.getLayout().powers.doubleJump.enabled === false)
  check('appliquer POWER -> bouton plus dirty', !els.btnApplyPow.classList.contains('dirty'))
  // cooldown 0 est une valeur valide (pas de fallback défaut)
  els['pw_doubleJump_cooldown'].value = '0'
  els['pw_doubleJump_cooldown'].handlers.input()
  els.btnApplyPow.handlers.click()
  check('cooldown 0 appliqué tel quel', Patterns.getLayout().powers.doubleJump.cooldown === 0)
  els.btnResetPow.handlers.click()
  check('reset pouvoirs : cooldown défaut 4', Patterns.getLayout().powers.doubleJump.cooldown === 4)
  check('reset pouvoirs : réactivé', Patterns.getLayout().powers.doubleJump.enabled === true)
  check('reset pouvoirs : slow-mo échelle défaut', Patterns.getLayout().powers.slowmo.scale === 0.35)
  Ed.setMode('patterns')
  check('retour patterns : classe power retirée', !main.classList.contains('power'))

  // --- redimensionnement du panneau propriétés (poignée) ---
  check('panneau : largeur par défaut 272px, pas de style inline', els.props.getBoundingClientRect().width === 272 && !els.props.style.width)
  els.propsResize.handlers.pointerdown({ clientX: 700, preventDefault() {} })
  check('poignée active pendant le glisser', els.propsResize.classList.contains('on'))
  win.fire('pointermove', { clientX: 600 })
  check('glisser à gauche élargit -> 372px', els.props.style.width === '372px')
  win.fire('pointermove', { clientX: 60 })
  check('borne max 560px', els.props.style.width === '560px')
  win.fire('pointermove', { clientX: 1200 })
  check('borne min 200px', els.props.style.width === '200px')
  win.fire('pointerup', {})
  check('poignée relâchée', !els.propsResize.classList.contains('on'))
  check('largeur persistée en localStorage', localStorage.getItem('slime_props_w') === '200')
  Ed.setMode('phys')
  check('mode PHYS : largeur inline effacée (pleine page)', els.props.style.width === '')
  Ed.setMode('patterns')
  check('retour patterns : largeur restaurée depuis le save', els.props.style.width === '200px')

  // --- zoom patterns : mini 10 % (paliers 10 % sous 50 %, 25 % au-dessus) ---
  check('zoom initial affiché 100 %', els.tZoomV.textContent === '100%' || els.tZoomV.textContent === '')
  els.tZoomM.handlers.click()
  check('zoom − : 100 -> 75 %', els.tZoomV.textContent === '75%')
  els.tZoomM.handlers.click()
  check('zoom − : 75 -> 50 %', els.tZoomV.textContent === '50%')
  els.tZoomM.handlers.click()
  check('zoom − : 50 -> 40 %', els.tZoomV.textContent === '40%')
  els.tZoomM.handlers.click(); els.tZoomM.handlers.click(); els.tZoomM.handlers.click()
  check("zoom − : jusqu'à 10 %", els.tZoomV.textContent === '10%')
  els.tZoomM.handlers.click()
  check('zoom borné à 10 %', els.tZoomV.textContent === '10%')
  els.tZoomP.handlers.click()
  check('zoom + : 10 -> 20 %', els.tZoomV.textContent === '20%')
  els.tZoomP.handlers.click(); els.tZoomP.handlers.click(); els.tZoomP.handlers.click(); els.tZoomP.handlers.click()
  check('zoom + : 20 -> 30/40/50 puis 75 %', els.tZoomV.textContent === '75%')
  els.tZoomP.handlers.click()
  check('zoom + : 75 -> 100 % (zoom restauré pour les tests suivants)', els.tZoomV.textContent === '100%')

  // --- mode VUE : plein cadre + contrôles décor dans le panneau ---
  Ed.setMode('layout')
  check('classe layout sur <main>', main.classList.contains('layout'))
  check('pas de classe phys en mode VUE', !main.classList.contains('phys'))
  const lh = els.props.innerHTML
  check('contrôles décor dans le panneau (asset + 3 outils)', lh.includes('lDSprite') && lh.includes('lToolSelect') && lh.includes('lToolDecor') && lh.includes('lToolErase'))
  check('contrôles vue du jeu (zoom + toggles)', lh.includes('vZoom') && lh.includes('vTraj') && lh.includes('vShake'))
  // slider zoom -> layout.view mis à jour
  els.vZoom.value = '25'
  els.vZoom.handlers.input()
  check('slider zoom -> layout.view.zoom', Patterns.getLayout().view.zoom === 2.5)
  els.btnResetL.handlers.click()
  check('reset vue : zoom défaut ×1', Patterns.getLayout().view.zoom === 1)
  // reset murs : préserve physique et plateformes, remets les murs par défaut
  const L0 = Patterns.getLayout()
  L0.walls.left = 40; L0.phys.grav = 777
  Patterns.setLayout(L0)
  els.btnResetL.handlers.click()
  check('reset murs : gauche défaut 11, pas de plafond', Patterns.getLayout().walls.left === 11 && Patterns.getLayout().walls.ceil === undefined)
  check('reset murs : phys préservée (grav 777)', Patterns.getLayout().phys.grav === 777)
  check('reset murs : plat préservée', Patterns.getLayout().plat.crumbleT === 0.5)
  Phys.setPhys(Patterns.getLayout().phys)
  check('outil Déplacer actif par défaut', els.lToolSelect.classList.contains('on'))
  els.lToolDecor.handlers.click()
  check('outil Poser activable', els.lToolDecor.classList.contains('on') && !els.lToolSelect.classList.contains('on'))
  const nDecor = Patterns.getLayout().decor.length
  els.cv.handlers.pointerdown({ clientX: 400, clientY: 225, button: 0 })
  check('clic sur la vue pose un décor', Patterns.getLayout().decor.length === nDecor + 1)
  // fitLayout est identité dans le stub (drawLayout jamais appelé sans rAF)
  check('décor posé à la position cliquée', Patterns.getLayout().decor[nDecor].x === 400 && Patterns.getLayout().decor[nDecor].y === 225)
  els.lToolErase.handlers.click()
  els.cv.handlers.pointerdown({ clientX: 400, clientY: 225, button: 0 })
  check('gomme supprime le décor', Patterns.getLayout().decor.length === nDecor)
  Ed.setMode('patterns')

  // --- PATTERNS : multi-sélection (Ctrl+clic, rectangle) + copier/coller ---
  // Repères stub : scale = (450/270) * zoom courant, camX = -6*CELL = -192.
  const Z = (parseFloat(els.tZoomV.textContent) || 100) / 100
  const S = (450 / 270) * Z
  const sxOf = wx => (wx + 192) * S
  const syOf = wy => wy * S
  const kd = (key, ctrl) => win.fire('keydown', { key, ctrlKey: !!ctrl, target: { tagName: 'DIV' }, preventDefault() {} })
  els.btnNew.handlers.click()
  const pat0 = Patterns.getPatterns()[0]
  check('pattern créé (1 plateforme par défaut)', pat0 && pat0.platforms.length === 1)
  pat0.platforms.push({ x: 10 * CELL, row: 1, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null })
  pat0.balls.push({ x: 200, row: 2, yOff: -30, gold: true })
  pat0.balls.push({ x: 448, row: 0, yOff: 0, gold: false })
  // Ctrl+clic : plateforme 0 puis bille 0 -> 2 sélectionnés
  els.cv.handlers.pointerdown({ clientX: sxOf(100), clientY: syOf(rowY(2) + 5), button: 0, ctrlKey: true })
  win.fire('pointerup', {})
  els.cv.handlers.pointerdown({ clientX: sxOf(200), clientY: syOf(rowY(2) - 30), button: 0, ctrlKey: true })
  win.fire('pointerup', {})
  check('Ctrl+clic : 2 objets sélectionnés', els.props.innerHTML.includes('2 objets sélectionnés'))
  kd('c', true)
  check('Ctrl+C : message « 2 éléments copiés »', els.status.textContent === '2 éléments copiés')
  // Ctrl+V, souris en (400, 200) : le bloc est ancré sous le curseur
  win.fire('pointermove', { clientX: sxOf(400), clientY: syOf(200) })
  kd('v', true)
  check('Ctrl+V : plateformes (3)', pat0.platforms.length === 3)
  check('Ctrl+V : billes (3)', pat0.balls.length === 3)
  check('Ctrl+V : plateforme ancrée sous la souris', pat0.platforms[2].x === 416 && pat0.platforms[2].row === 4)
  check('Ctrl+V : bille ancrée sous la souris', pat0.balls[2].x === 520 && pat0.balls[2].yOff === -32)
  check('Ctrl+V : 2 objets sélectionnés (collage)', els.props.innerHTML.includes('2 objets sélectionnés'))
  // rectangle de sélection (Ctrl+glisser sur le vide) : P1 + B1
  kd('Escape')
  win.fire('pointermove', { clientX: sxOf(300), clientY: syOf(60) })
  els.cv.handlers.pointerdown({ clientX: sxOf(300), clientY: syOf(60), button: 0, ctrlKey: true })
  win.fire('pointermove', { clientX: sxOf(470), clientY: syOf(150) })
  win.fire('pointerup', {})
  check('rectangle : 2 objets sélectionnés', els.props.innerHTML.includes('2 objets sélectionnés'))
  // union rectangle + Ctrl+clic -> 3, puis Suppr groupée
  els.cv.handlers.pointerdown({ clientX: sxOf(100), clientY: syOf(rowY(2) + 5), button: 0, ctrlKey: true })
  win.fire('pointerup', {})
  check('union rectangle + Ctrl+clic : 3 objets', els.props.innerHTML.includes('3 objets sélectionnés'))
  kd('Delete')
  check('Suppr : plateformes restantes (1)', pat0.platforms.length === 1)
  check('Suppr : billes restantes (2)', pat0.balls.length === 2)
  // collage dans un AUTRE pattern (clip : P0+B0 ; souris en (470,150))
  win.fire('pointermove', { clientX: sxOf(470), clientY: syOf(150) })
  els.btnNew.handlers.click()
  const pat1 = Patterns.getPatterns()[1]
  kd('v', true)
  check('collage inter-pattern : plateformes (2)', pat1.platforms.length === 2)
  check('collage inter-pattern : billes (1)', pat1.balls.length === 1)
  check('collage inter-pattern : positions', pat1.platforms[1].x === 480 && pat1.platforms[1].row === 3 && pat1.balls[0].x === 584)
  kd('a', true)
  check('Ctrl+A : 3 objets sélectionnés', els.props.innerHTML.includes('3 objets sélectionnés'))
  // Ctrl+X sur la bille seule puis recollage
  els.cv.handlers.pointerdown({ clientX: sxOf(pat1.balls[0].x), clientY: syOf(rowY(pat1.balls[0].row) + pat1.balls[0].yOff), button: 0 })
  win.fire('pointerup', {})
  kd('x', true)
  check('Ctrl+X : bille coupée', pat1.balls.length === 0)
  kd('v', true)
  check('Ctrl+V : bille recollée', pat1.balls.length === 1)
  // glisser d'une plateforme sélectionnée : déplacement snappé d'une case
  const before = pat1.platforms[1].x
  els.cv.handlers.pointerdown({ clientX: sxOf(before + 20), clientY: syOf(rowY(pat1.platforms[1].row) + 8), button: 0 })
  win.fire('pointermove', { clientX: sxOf(before + 20 + CELL), clientY: syOf(rowY(pat1.platforms[1].row) + 8) })
  win.fire('pointerup', {})
  check("glisser : plateforme décalée d'une case exactement", pat1.platforms[1].x === before + CELL)
  // pose (outil Plateforme) + glisser immédiat
  kd('a')
  els.cv.handlers.pointerdown({ clientX: sxOf(700), clientY: syOf(rowY(0) + 5), button: 0 })
  win.fire('pointermove', { clientX: sxOf(700 + CELL), clientY: syOf(rowY(0) + 5) })
  win.fire('pointerup', {})
  kd('s')
  check('pose + glisser : plateforme placée puis décalée', pat1.platforms[2].x === 704 + CELL && pat1.platforms[2].row === 0)
  // Shift+clic : même multi-sélection que Ctrl ; puis glisser du groupe SANS modificateur
  kd('Escape')
  els.cv.handlers.pointerdown({ clientX: sxOf(530), clientY: syOf(210), button: 0, shiftKey: true })
  win.fire('pointerup', {})
  els.cv.handlers.pointerdown({ clientX: sxOf(488), clientY: syOf(158), button: 0, shiftKey: true })
  win.fire('pointerup', {})
  check('Shift+clic : 2 objets sélectionnés', els.props.innerHTML.includes('2 objets sélectionnés'))
  els.cv.handlers.pointerdown({ clientX: sxOf(530), clientY: syOf(210), button: 0 })
  win.fire('pointermove', { clientX: sxOf(530 + CELL), clientY: syOf(210) })
  win.fire('pointerup', {})
  check('glisser groupe : plateforme et bille déplacées ensemble', pat1.platforms[1].x === 512 + CELL && pat1.balls[0].x === 488 + CELL)
  // clic simple sans glisser sur un élément du groupe : sélection réduite à lui seul
  els.cv.handlers.pointerdown({ clientX: sxOf(530 + CELL), clientY: syOf(210), button: 0 })
  win.fire('pointerup', {})
  check("clic simple : sélection réduite à l'élément cliqué", !els.props.innerHTML.includes('objets sélectionnés') && els.props.innerHTML.includes('oType'))
  kd('Escape')
  check('Échap : sélection vidée', els.props.innerHTML.includes('Aucun objet sélectionné'))

  // re-entre en PHYS : les sliders reflètent le layout (grav 777 préservée
  // par le reset murs ci-dessus — preuve end-to-end de la conservation)
  Ed.setMode('phys')
  check('re-rendu PHYS avec valeur courante', els.props.innerHTML.includes('value="777"'))
  check('localStorage persiste layout.phys', (localStorage.getItem('slime_patterns_v1') || '').includes('"phys"'))
  check('note de stockage (origine) dans le footer', els.storeInfo.textContent.includes('stockage :'))
})()
`)
const store = {}
fn(documentStub, windowStub, { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v) }, removeItem: k => { delete ls[k] } }, () => false, class { set src(v) {} }, () => 0, els, check, windowStub)

if (failed) { console.error(failed + ' ÉCHEC(S)'); process.exit(1) }
console.log('\nDOM OK — panneau PHYS pleine page fonctionnel')
