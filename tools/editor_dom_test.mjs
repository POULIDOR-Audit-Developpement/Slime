// Test DOM Node : exécute editor.js avec un mini-DOM et vérifie l'onglet PHYS
// (vue pleine page, sliders rendus, application au layout/Phys, reset), le
// redimensionnement du panneau propriétés (poignée + persistance) et l'onglet
// COULEURS (création/suppression de paliers, application au stockage).
// Usage : node tools/editor_dom_test.mjs
import { readFileSync } from 'fs'
const root = new URL('../', import.meta.url).pathname
const src = ['js/physics.js','js/slime-colors.js','js/sprites.js','js/patterns-defaults.js','js/patterns.js','js/editor.js']
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
    querySelector(sel) { return makeEl(sel) },
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
  documentElement: {},
  getComputedStyle: () => ({ fontSize: '13px' })
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
  check('reset -> slimeR défaut 11', Patterns.getLayout().phys.slimeR === 11)
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
  check('slider cooldown -> brouillon, layout inchangé', Patterns.getLayout().powers.doubleJump.cooldown === 0.5)
  check('bouton Appliquer POWER dirty', els.btnApplyPow.classList.contains('dirty'))
  // slider échelle slow-mo (cumulé au brouillon)
  els['pw_slowmo_scale'].value = '0.25'
  els['pw_slowmo_scale'].handlers.input()
  check('slider échelle slow-mo -> brouillon', Patterns.getLayout().powers.slowmo.scale === 0.05)
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
  // slow-mo durée 2 s : hors de l'ancienne plage de slider (0.2-1), dedans
  // depuis l'élargissement — valeur par défaut, doit passer sans écrêtage.
  els['pw_slowmo_duration'].value = '2'
  els['pw_slowmo_duration'].handlers.input()
  els.btnApplyPow.handlers.click()
  check('slow-mo durée 2 s appliquée (slider élargi)', Patterns.getLayout().powers.slowmo.duration === 2)
  // cooldown 0 est une valeur valide (pas de fallback défaut)
  els['pw_doubleJump_cooldown'].value = '0'
  els['pw_doubleJump_cooldown'].handlers.input()
  els.btnApplyPow.handlers.click()
  check('cooldown 0 appliqué tel quel', Patterns.getLayout().powers.doubleJump.cooldown === 0)
  els.btnResetPow.handlers.click()
  check('reset pouvoirs : cooldown défaut 0.5', Patterns.getLayout().powers.doubleJump.cooldown === 0.5)
  check('reset pouvoirs : réactivé', Patterns.getLayout().powers.doubleJump.enabled === true)
  check('reset pouvoirs : slow-mo échelle défaut', Patterns.getLayout().powers.slowmo.scale === 0.05)
  Ed.setMode('patterns')
  check('retour patterns : classe power retirée', !main.classList.contains('power'))

  // --- redimensionnement du panneau propriétés (poignée, largeur en rem) ---
  // Stub : 1rem = 13px -> la largeur de départ (272px) vaut 272/13 ≈ 20.92rem.
  check('panneau : largeur par défaut 272px, pas de style inline', els.props.getBoundingClientRect().width === 272 && !els.props.style.width)
  els.propsResize.handlers.pointerdown({ clientX: 700, preventDefault() {} })
  check('poignée active pendant le glisser', els.propsResize.classList.contains('on'))
  win.fire('pointermove', { clientX: 600 })
  check('glisser à gauche élargit -> 28.62rem (≈372px)', els.props.style.width === '28.62rem')
  win.fire('pointermove', { clientX: 60 })
  check('borne max 43.08rem (≈560px)', els.props.style.width === '43.08rem')
  win.fire('pointermove', { clientX: 1200 })
  check('borne min 15.38rem (≈200px)', els.props.style.width === '15.38rem')
  win.fire('pointerup', {})
  check('poignée relâchée', !els.propsResize.classList.contains('on'))
  check('largeur persistée en localStorage (rem)', localStorage.getItem('slime_props_w_rem') === '15.38')
  Ed.setMode('phys')
  check('mode PHYS : largeur inline effacée (pleine page)', els.props.style.width === '')
  Ed.setMode('patterns')
  check('retour patterns : largeur restaurée depuis le save', els.props.style.width === '15.38rem')

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
  // vérification des sauts : optionnelle (non infaillible), l'admin décide
  check('case vérif des sauts présente', lh.includes('vChkJumps'))
  els.vChkJumps.checked = false
  els.vChkJumps.handlers.change({ target: els.vChkJumps })
  check('case décochée -> layout.checkJumps false', Patterns.getLayout().checkJumps === false)
  els.vChkJumps.checked = true
  els.vChkJumps.handlers.change({ target: els.vChkJumps })
  check('case cochée -> layout.checkJumps true', Patterns.getLayout().checkJumps === true)
  // reset murs : préserve physique et plateformes, remets les murs par défaut
  const L0 = Patterns.getLayout()
  L0.walls.left = 40; L0.phys.grav = 777
  Patterns.setLayout(L0)
  els.btnResetL.handlers.click()
  check('reset murs : gauche défaut 4, pas de plafond', Patterns.getLayout().walls.left === 4 && Patterns.getLayout().walls.ceil === undefined)
  check('reset murs : phys préservée (grav 777)', Patterns.getLayout().phys.grav === 777)
  check('reset murs : plat préservée', Patterns.getLayout().plat.crumbleT === 0.8)
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

  // --- onglet COULEURS : création/suppression de paliers + application ---
  // Régression : « + Ajouter » mutait le brouillon PUIS relançait un rendu
  // qui relisait le stockage -> la mutation était perdue (palier jamais créé).
  Ed.setMode('colors')
  check('classe colors sur <main>', main.classList.contains('colors'))
  const ch = els.props.innerHTML
  check('vue pleine page COULEURS : titre + boutons', ch.includes('Couleurs du slime') && ch.includes('btnAddTier') && ch.includes('btnApplyColors') && ch.includes('btnResetColors'))
  check('6 paliers par défaut rendus', (ch.match(/tierRow/g) || []).length === 6)
  check('palier 0 verrouillé (inputs disabled)', ch.includes('id="tc_hex_0"') && /id="tc_min_0"[^>]*disabled/.test(ch))
  check('les autres paliers sont éditables', !/id="tc_min_1"[^>]*disabled/.test(ch))
  // AJOUT : le 7e palier doit apparaître immédiatement
  els.btnAddTier.handlers.click()
  const ch1 = els.props.innerHTML
  check('+ Ajouter : 7e palier rendu', (ch1.match(/tierRow/g) || []).length === 7)
  check('+ Ajouter : input du 7e palier présent', ch1.includes('id="tc_min_6"') && ch1.includes('id="tc_del_6"'))
  // édition du seuil : brouillon dirty, stockage intact
  els['tc_min_6'].value = '1000'
  els['tc_min_6'].handlers.input()
  check('seuil édité -> bouton dirty', els.btnApplyColors.classList.contains('dirty'))
  check('seuil édité -> stockage inchangé', localStorage.getItem('slime_tiers') === null)
  // APPLIQUER -> 7 paliers persistés
  els.btnApplyColors.handlers.click()
  const saved7 = JSON.parse(localStorage.getItem('slime_tiers') || '[]')
  check('appliquer -> 7 paliers en stockage', saved7.length === 7)
  check('appliquer -> seuil 1000 persisté', saved7.some(t => t.min === 1000))
  check('appliquer -> bouton plus dirty', !els.btnApplyColors.classList.contains('dirty'))
  check('appliquer -> message succès', els.status.textContent === 'Couleurs appliquées au jeu')
  // re-rendu depuis le stockage : les 7 paliers sont bien là
  Ed.setMode('colors')
  check('re-rendu : 7 paliers depuis le stockage', (els.props.innerHTML.match(/tierRow/g) || []).length === 7)
  // SUPPRESSION du 7e palier puis application
  els['tc_del_6'].handlers.click()
  check('suppression : 6 paliers rendus', (els.props.innerHTML.match(/tierRow/g) || []).length === 6)
  els.btnApplyColors.handlers.click()
  check('suppression appliquée : 6 paliers en stockage', JSON.parse(localStorage.getItem('slime_tiers') || '[]').length === 6)
  // RESET -> défauts, clé retirée du stockage
  els.btnResetColors.handlers.click()
  check('reset : clé slime_tiers retirée', localStorage.getItem('slime_tiers') === null)
  check('reset : 6 paliers par défaut', (els.props.innerHTML.match(/tierRow/g) || []).length === 6)
  check('reset : message', els.status.textContent === 'Couleurs réinitialisées')

  // --- COULEURS : effets spéciaux (type, N couleurs, vitesse) ---
  els.btnAddTier.handlers.click()
  els['tc_type_6'].value = 'gradient'
  els['tc_type_6'].handlers.change()
  check('type dégradé : 2 pickers + boutons +/-', els.props.innerHTML.includes('id="tc_h_6_0"') && els.props.innerHTML.includes('id="tc_h_6_1"') && els.props.innerHTML.includes('id="tc_add_6"') && els.props.innerHTML.includes('id="tc_rm_6"'))
  check('dégradé : bouton − désactivé à 2 couleurs', /id="tc_rm_6"[^>]*disabled/.test(els.props.innerHTML))
  els['tc_add_6'].handlers.click()
  check('dégradé : 3e couleur ajoutée', els.props.innerHTML.includes('id="tc_h_6_2"') && !/id="tc_rm_6"[^>]*disabled/.test(els.props.innerHTML))
  els['tc_h_6_2'].value = '#00ff00'
  els['tc_h_6_2'].handlers.input()
  check('3e couleur éditée -> bouton dirty', els.btnApplyColors.classList.contains('dirty'))
  els['tc_min_6'].value = '1000'
  els['tc_min_6'].handlers.input()
  els.btnApplyColors.handlers.click()
  const sg = JSON.parse(localStorage.getItem('slime_tiers') || '[]')
  check('dégradé persisté (3 stops)', sg.some(t => t.type === 'gradient' && t.hexes.length === 3 && t.hexes[2] === '#00ff00'))
  els['tc_type_6'].value = 'rainbow'
  els['tc_type_6'].handlers.change()
  check('type rainbow : slider de vitesse', els.props.innerHTML.includes('id="tc_spd_6"') && els.props.innerHTML.includes('id="tc_spd_6V"'))
  els['tc_spd_6'].value = '0.3'
  els['tc_spd_6'].handlers.input()
  check('vitesse affichée à jour', els['tc_spd_6V'].textContent === '×0.30')
  els.btnApplyColors.handlers.click()
  check('rainbow persisté (speed 0.3)', JSON.parse(localStorage.getItem('slime_tiers') || '[]').some(t => t.type === 'rainbow' && t.speed === 0.3))
  els['tc_del_6'].handlers.click()
  els.btnApplyColors.handlers.click()
  check('nettoyage : 6 paliers en stockage', JSON.parse(localStorage.getItem('slime_tiers') || '[]').length === 6)

  Ed.setMode('patterns')
  check('retour patterns : classe colors retirée', !main.classList.contains('colors'))

  // --- T8 : 9 types (touches 1-9), retrait du contrôle dynLife ---
  // Toolbar : le select tType est rendu depuis Patterns.TYPES (source unique)
  // libellé par TYPE_LABEL — 9 options, aucun « undefined ». (Le mini-DOM ne
  // parse pas l'innerHTML : on épingle le markup rendu de la toolbar.)
  const mSel = /<select id="tType">([\\s\\S]*?)<\\/select>/.exec(els.toolbar.innerHTML)
  const opts = mSel ? mSel[1] : ''
  check('tType : 9 options', (opts.match(/<option/g) || []).length === 9)
  check('tType : aucun libellé undefined', opts.length > 0 && !opts.includes('undefined'))
  check('tType : Phasante/Turbo/Dorée/Bascule', opts.includes('>Phasante<') && opts.includes('>Turbo<') && opts.includes('>Dorée<') && opts.includes('>Bascule<'))
  // Touches 1-9 : onKey resynchronise le select avec platType (observable).
  kd('7')
  check('touche 7 -> turbo', els.tType.value === 'turbo')
  kd('9')
  check('touche 9 -> seesaw', els.tType.value === 'seesaw')
  kd('1')
  check('touche 1 -> basic', els.tType.value === 'basic')
  // La pose consomme bien platType : 7 puis 9 posent turbo puis seesaw.
  els.btnNew.handlers.click()
  const pat2 = Patterns.getPatterns()[Patterns.getPatterns().length - 1]
  kd('7')
  els.cv.handlers.pointerdown({ clientX: sxOf(700), clientY: syOf(rowY(0) + 5), button: 0 })
  win.fire('pointerup', {})
  check('pose après touche 7 : plateforme turbo', pat2.platforms.some(p => p.type === 'turbo' && p.x === 704))
  kd('9')
  els.cv.handlers.pointerdown({ clientX: sxOf(700 + 4 * CELL), clientY: syOf(rowY(4) + 5), button: 0 })
  win.fire('pointerup', {})
  check('pose après touche 9 : plateforme seesaw', pat2.platforms.some(p => p.type === 'seesaw'))
  // Sélection de la seesaw : propriétés rendues sans erreur, type présent.
  els.cv.handlers.pointerdown({ clientX: sxOf(700 + 4 * CELL + 16), clientY: syOf(rowY(4) + 8), button: 0 })
  win.fire('pointerup', {})
  const pvSeesaw = els.props.innerHTML
  check('propriétés seesaw : oType avec les 9 types', pvSeesaw.includes('id="oType"') && pvSeesaw.includes('value="seesaw"') && pvSeesaw.includes('value="turbo"') && pvSeesaw.includes('value="gold"') && pvSeesaw.includes('value="phase"'))
  // Une dynamique n'expose plus le réglage « vie après » (dynLife supprimé).
  kd('3')
  els.cv.handlers.pointerdown({ clientX: sxOf(700 + 8 * CELL), clientY: syOf(rowY(1) + 5), button: 0 })
  win.fire('pointerup', {})
  els.cv.handlers.pointerdown({ clientX: sxOf(700 + 8 * CELL + 16), clientY: syOf(rowY(1) + 8), button: 0 })
  win.fire('pointerup', {})
  const pvDyn = els.props.innerHTML
  check('propriétés dynamique : plus de « Vie après »', pvDyn.includes('id="oType"') && !pvDyn.includes('Vie après') && !pvDyn.includes('oDl'))
  // Panneau VUE : plus aucun contrôle dynLife, cassable/spdMul conservés.
  Ed.setMode('layout')
  const lv = els.props.innerHTML
  check('VUE : plus de slider Dyn. vie', !lv.includes('pDynLife') && !lv.includes('Dyn. vie'))
  check('VUE : cassable et vitesse dynamique conservés', lv.includes('pCrumb') && lv.includes('pSpdMul'))
  // VUE : les 3 nouvelles tuiles sont posables en décor.
  check('VUE : tuiles turbo/gold/seesaw en décor', lv.includes('tileTurbo') && lv.includes('tileGold') && lv.includes('tileSeesaw'))
  Ed.setMode('patterns')
})()
`)
const store = {}
const done = fn(documentStub, windowStub, { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v) }, removeItem: k => { delete ls[k] } }, () => false, class { set src(v) {} }, () => 0, els, check, windowStub)
if (done && typeof done.then === 'function') await done

// --- Régression fix review : transform scopé dans la preview bascule ---
// Le mini-DOM n'exécute jamais drawPlatEditor (pas de boucle rAF) : on épingle
// statiquement le scope de la branche seesaw — c.save() AVANT le
// translate/rotate, c.restore() en fin de branche, une seule fois chacun —
// sinon piques et rect de sélection seraient dessinés dans le repère tourné.
{
  const mSw = /p\.type === 'seesaw'\) \{([\s\S]*?)\n    \} else \{/.exec(src)
  const body = mSw ? mSw[1] : ''
  const nSave = (body.match(/c\.save\(\)/g) || []).length
  const nRestore = (body.match(/c\.restore\(\)/g) || []).length
  const okSw = !!mSw && /c\.save\(\)\s*c\.translate/.test(body) && /c\.restore\(\)\s*$/.test(body) && nSave === 1 && nRestore === 1
  if (okSw) console.log('ok   preview seesaw : transform scopé (save/restore interne)')
  else { failed++; console.log('FAIL preview seesaw : transform scopé (save/restore interne)') }
}

if (failed) { console.error(failed + ' ÉCHEC(S)'); process.exit(1) }
console.log('\nDOM OK — panneaux PHYS et COULEURS fonctionnels')
