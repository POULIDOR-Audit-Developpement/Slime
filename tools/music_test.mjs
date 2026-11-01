// Test du module Music (js/music.js) en Node : logic de lecture sans vrai audio.
// Un stub Audio enregistre play/pause/seek pour vérifier :
//   1. start() est idempotent : les sauts suivants ne rembobinent pas la piste
//      (bug historique : chaque saut faisait currentTime = 0 + re-buffer)
//   2. stop() -> start() : nouvelle partie, piste 1 rembobinée et rejouée
//   3. toggle() : pause/reprise à l'endroit exact, sans seek
//   4. fin de piste 1 -> enchaînement piste 2 (pas de piste 3 -> boucle)
// Run : node tools/music_test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (label, ok) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label) }

// ---- harnais : charge js/music.js avec des globals factices ----
function loadMusic() {
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const calls = { seeks: 0, plays: 0, pauses: 0, volumes: [] }
  class FakeAudio {
    constructor(srcV) { this.src = srcV; this.loop = false; this.preload = ''; this.volume = 0.5; this.currentTime = 0; this.paused = true; this.handlers = {} }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v; calls.seeks++ }
    get currentTime() { return this._t }
    play() { this.paused = false; calls.plays++; return Promise.resolve() }
    pause() { if (!this.paused) calls.pauses++; this.paused = true }
    fire(ev) { for (const fn of this.handlers[ev] || []) fn() }
  }
  const store = {}
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const Music = sandbox(FakeAudio, {
    getItem: k => k in store ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v) }
  }, v => calls.volumes.push(v), undefined, console)
  return { Music, calls, audio: sandbox._audio }
}

// ---- 1. idempotence de start() ----
{
  const { Music, calls } = loadMusic()
  Music.restore()
  Music.start() // 1er saut
  const seeks1 = calls.seeks, plays1 = calls.plays
  Music.start() // 2e saut
  Music.start() // 3e saut
  check('start() idempotent : 1 seul seek/plays pour 3 appels', calls.seeks === seeks1 && calls.plays === plays1)
  Music.stop()
  const s2 = calls.seeks
  Music.start() // nouvelle partie
  check('stop() -> start() : la piste repart du début', calls.seeks === s2 + 1)
}

// ---- 2. mute : pause sans seek, reprise à l'endroit exact ----
{
  const { Music, calls } = loadMusic()
  Music.restore()
  Music.start()
  calls.seeks = 0
  Music.toggle() // mute
  check('mute : paused + SFX coupés (volume 0)', calls.pauses >= 1 && calls.volumes[calls.volumes.length - 1] === 0)
  Music.toggle() // unmute
  check('unmute : reprise sans seek', calls.seeks === 0 && calls.volumes[calls.volumes.length - 1] === 0.5)
}

// ---- 3. enchaînement des pistes ----
{
  const { Music, calls } = loadMusic()
  Music.restore()
  Music.start()
  // simule la fin de bgm1 : le handler 'ended' doit passer à la piste 2.
  // On passe par le 2e élément créé (bgm2) pour déclencher sur bgm1 : le
  // harnais expose les instances via la closure — on utilise une astuce :
  // replay des handlers nécessite l'instance, donc on vérifie plutôt que
  // start() joue bien la 1re piste et que loop est actif sur la 3e via
  // une seconde sandbox qui capture le constructeur.
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  class FakeAudio2 {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v }
    get currentTime() { return this._t }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
    fire(ev) { for (const fn of this.handlers[ev] || []) fn() }
  }
  const sandbox2 = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const M2 = sandbox2(FakeAudio2, { getItem: () => null, setItem: () => {} }, () => {}, undefined, console)
  M2.restore()
  M2.start()
  check('3 pistes créées aux bons chemins', created.length === 3 && created.every(a => /ASSETS\/music\/bgm[123]\.mp3$/.test(a.src)))
  check('piste 3 en boucle (survie > 9 min)', created[2].loop === true && !created[0].loop && !created[1].loop)
  created[0].fire('ended') // fin de bgm1
  check('fin de bgm1 -> bgm2 joue', created[1].paused === false && created[0].paused === true)
  check('fin de bgm1 -> Music.track === 1', M2.track === 1)
  created[1].fire('ended') // fin de bgm2
  check('fin de bgm2 -> bgm3 joue', created[2].paused === false)
  check('fin de bgm2 -> Music.track === 2', M2.track === 2)
  created[2].fire('ended') // fin de bgm3 : loop=true, ne doit pas casser
  check('fin de bgm3 : reste sur bgm3 (loop)', created[2].paused === false)
  check('fin de bgm3 : Music.track reste 2', M2.track === 2)
  M2.stop()
  check('stop() : Music.track remis à 0', M2.track === 0)
}

// ---- 4. Node pur (pas de Audio) : no-op complet ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const sandbox3 = new Function('Audio', 'localStorage', 'volume', 'document', 'return (() => {' + src + '; return Music })()')
  let threw = false
  try {
    const M3 = sandbox3(undefined, undefined, undefined, undefined)
    M3.restore(); M3.start(); M3.stop(); M3.toggle()
    M3.setStart(2) // ?niveau=N : API no-op hors navigateur
    M3.setRate(0.05); M3.setRate(1) // slow-mo : API no-op hors navigateur
    if (M3.track !== 0) throw new Error('track hors navigateur')
  } catch (e) { threw = true }
  check('hors navigateur : no-op sans exception (track 0)', !threw)
}

// ---- 5. chargement paresseux : RIEN de média au boot ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  class FakeAudio3 {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v }
    get currentTime() { return this._t }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  const sandbox4 = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const M4 = sandbox4(FakeAudio3, { getItem: () => null, setItem: () => {} }, () => {}, undefined, console)
  M4.restore()
  check('boot (restore) : aucun élément Audio créé', created.length === 0)
  M4.toggle() // mute avant le 1er saut : ne doit pas créer non plus
  check('toggle avant 1er saut : toujours aucun élément', created.length === 0)
  M4.toggle() // unmute
  M4.start() // 1er saut : c'est ICI que les éléments sont créés (dans le geste)
  check('1er saut : les 3 pistes sont créées et bgm1 joue', created.length === 3 && created[0].paused === false)
}

// ---- 6. piste de départ forcée : Music.setStart(n) (?niveau=N, éditeur) ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  class FakeAudioN {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v }
    get currentTime() { return this._t }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
    fire(ev) { for (const fn of this.handlers[ev] || []) fn() }
  }
  const sandboxN = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const MN = sandboxN(FakeAudioN, { getItem: () => null, setItem: () => {} }, () => {}, undefined, console)
  MN.restore()
  MN.setStart(2) // « Tester niveau 3 » : la run démarre sur bgm3 (manoir)
  MN.start()
  check('setStart(2) : bgm3 joue au 1er saut (ni bgm1 ni bgm2)', created.length === 3 && created[2].paused === false && created[0].paused && created[1].paused)
  check('setStart(2) : Music.track === 2', MN.track === 2)
  created[2].fire('ended') // bgm3 en loop : reste sur elle-même
  check('depuis bgm3 : boucle sur elle-même (pas de débordement)', MN.track === 2 && created[2].paused === false)
  MN.stop()
  check('stop() : retour à la piste de DÉPART (2, pas 0)', MN.track === 2)
  MN.start()
  check('rejouer : bgm3 repart du début', created[2].paused === false && MN.track === 2)
  MN.setStart(99)
  check('setStart borné 0..2', MN.track === 2)
  MN.stop()
  MN.setStart(0)
  check('setStart(0) : la run suivante repart sur bgm1', MN.track === 0)
  MN.start()
  check('rejouer après setStart(0) : bgm1 joue', created[0].paused === false && created[2].paused === true)
}

// ---- 6. setVolume : volume continu persisté, 0 = muet ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  const vols = []
  const store = {}
  class FakeAudio4 {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.volume = 0.5; this.currentTime = 0; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v }
    get currentTime() { return this._t }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const M = sandbox(FakeAudio4, { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v) } }, v => vols.push(v), undefined, console)
  check('setVolume existe (API slider)', typeof M.setVolume === 'function')
  M.restore()
  M.start() // crée les 3 pistes
  M.setVolume(0.3)
  check('setVolume(0.3) : appliqué aux pistes', created.every(a => Math.abs(a.volume - 0.3) < 0.001))
  check('setVolume(0.3) : persisté (slime_vol)', store['slime_vol'] === '0.3')
  check('setVolume(0.3) : SFX zzfx suivent', vols[vols.length - 1] === 0.3)
  check('setVolume(0.3) : pas muet', M.muted === false)
  M.setVolume(0)
  check('setVolume(0) : muet', M.muted === true)
  M.setVolume(0.7)
  check('setVolume(0.7) : démué + appliqué + persisté',
    M.muted === false && Math.abs(created[0].volume - 0.7) < 0.001 && store['slime_vol'] === '0.7')
  // restauration du volume persisté
  const store2 = { slime_vol: '0.25' }
  const M2 = sandbox(FakeAudio4, { getItem: k => k in store2 ? store2[k] : null, setItem: (k, v) => { store2[k] = String(v) } }, () => {}, undefined, console)
  M2.restore()
  check('restore : slime_vol lu (Music.vol 0.25)', M2.vol === 0.25)
}

// ---- 8. setRate : la musique suit le slow-mo (échelle de temps ts) ----
// Courbe adoucie (design 2026-11-01) : rate = 1 − (1−ts)×0.55, borné [0.5 ; 1]
// — sous 0.5× les navigateurs coupent le son du <audio>. Pitch NON préservé
// (preservesPitch = false) : effet vinyle/bullet-time.
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  const rateSets = [] // chaque assignation playbackRate (idempotence attendue)
  class FakeAudioR {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; this._rate = 1; this.preservesPitch = true; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v }
    get currentTime() { return this._t }
    set playbackRate(v) { this._rate = v; rateSets.push(v) }
    get playbackRate() { return this._rate }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const M = sandbox(FakeAudioR, { getItem: () => null, setItem: () => {} }, () => {}, undefined, console)
  if (typeof M.setRate !== 'function') {
    check('setRate existe (API slow-mo)', false)
  } else {
    M.restore()
    M.start() // crée les 3 pistes
    check('création : playbackRate 1 et preservesPitch false (effet vinyle)',
      created.length === 3 && created.every(a => a.playbackRate === 1 && a.preservesPitch === false))
    check('création : aucune assignation playbackRate superflue', rateSets.length === 0)
    M.setRate(0.35) // slow-mo éditeur ×0.35
    check('setRate(0.35) : courbe adoucie 0.6425 quantifiée -> 0.65 sur les 3 pistes',
      created.every(a => Math.abs(a.playbackRate - 0.65) < 0.0001) && Math.abs(M.rate - 0.65) < 0.0001)
    const n = rateSets.length
    M.setRate(0.35)
    M.setRate(0.35)
    check('setRate idempotent : pas de réassignation à valeur égale', rateSets.length === n)
    M.setRate(0.05) // défaut bullet-time : la courbe (0.4775) touche le plancher
    check('setRate(0.05) : planché à 0.5 (jamais sous — son garanti partout)', M.rate === 0.5 && created[0].playbackRate === 0.5)
    M.setRate(0.7)
    check('setRate(0.7) : courbe 0.835 quantifiée -> 0.85', Math.abs(M.rate - 0.85) < 0.0001)
    M.setRate(1)
    check('setRate(1) : vitesse normale', M.rate === 1 && created.every(a => a.playbackRate === 1))
    M.setRate(5)
    check('setRate(5) : clampé à 1 (jamais accéléré)', M.rate === 1)
    M.setRate(NaN)
    check('setRate(NaN) : rate 1 (entrée invalide)', M.rate === 1)
    // Régression « petit freeze au retour » : le lerp de game.js (ts 0.05 -> 1,
    // lerp ×12/s, snap 1 %) change à chaque tick de sim (240 Hz) — si setRate
    // réassignait playbackRate à chaque tick (~267 écritures/transition), le
    // pipeline média des navigateurs s'accroche (glitch audible). La vitesse
    // est quantifiée (pas 0.05) : le même retour complet ne doit produire
    // qu'une poignée d'écritures, paliers stables que le navigateur ramp
    // proprement.
    M.setRate(0.05) // slow-mo actif : rate au plancher 0.5
    const avant = rateSets.length
    let ts = 0.05
    const dt = 1 / 240
    for (let t = 0; t < 1; t += dt) { // sortie de slow-mo, boucle exacte de game.js
      ts += (1 - ts) * Math.min(1, dt * 12)
      if (Math.abs(ts - 1) < 0.01) ts = 1
      M.setRate(ts)
    }
    const nWrites = rateSets.length - avant
    const paliers = new Set(rateSets.slice(avant)).size
    check(`retour complet 0.5->1 : écritures limitées (${nWrites} totales, ${paliers} paliers <= 13)`,
      paliers <= 13 && nWrites <= paliers * 3)
    check('retour : rate finit exactement à 1 (recalage au settle)', M.rate === 1 && created[0].playbackRate === 1)
    check('retour : toutes les valeurs dans [0.5 ; 1]', rateSets.slice(avant).every(v => v >= 0.5 - 1e-9 && v <= 1 + 1e-9))
    M.setRate(0.35)
    M.stop()
    check('stop() : rate remis à 1 partout (partie suivante normale)',
      M.rate === 1 && created.every(a => a.playbackRate === 1))
    M.start()
    check('rejouer : rate reste 1 après stop()/start()', M.rate === 1 && created[0].playbackRate === 1)
  }
}

// ---- 9. setPaused : la pause jeu gèle la BGM (reprise à l'endroit exact) ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  const calls = { seeks: 0, plays: 0, pauses: 0 }
  const docHandlers = {}
  class FakeAudioP {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v; calls.seeks++ }
    get currentTime() { return this._t }
    play() { this.paused = false; calls.plays++; return Promise.resolve() }
    pause() { if (!this.paused) calls.pauses++; this.paused = true }
  }
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'return (() => {' + src + '; return Music })()')
  const doc = { addEventListener: (ev, fn) => { docHandlers[ev] = fn } }
  const M = sandbox(FakeAudioP, { getItem: () => null, setItem: () => {} }, () => {}, doc, console)
  if (typeof M.setPaused !== 'function') {
    check('setPaused existe (API pause jeu)', false)
  } else {
    M.restore()
    check('hors run : setPaused no-op (rien ne joue)', (M.setPaused(true), M.setPaused(false), created.length === 0))
    M.start() // 1er saut : 3 pistes, bgm1 joue
    calls.pauses = 0
    M.setPaused(true)
    check('pause jeu : toutes les pistes en pause', created.every(a => a.paused))
    const seeksAtPause = calls.seeks
    M.setPaused(false)
    check('reprise : bgm1 rejoue SANS seek (à l\'endroit exact)', created[0].paused === false && created[1].paused && created[2].paused && calls.seeks === seeksAtPause)
    // muet : la reprise ne doit pas sonner
    M.setVolume(0)
    M.setPaused(true)
    M.setPaused(false)
    check('muet : setPaused(false) ne joue pas', created[0].paused === true)
    M.setVolume(0.5)
    // onglet redevient visible pendant le gel : PAS de reprise musicale
    M.setPaused(true)
    docHandlers.visibilitychange()
    check('onglet visible mais jeu gelé : la musique reste en pause', created[0].paused === true)
    M.setPaused(false)
    check('dégel : la musique reprend', created[0].paused === false)
  }
}

// ---- 10. Node pur : setPaused no-op ----
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'return (() => {' + src + '; return Music })()')
  let threw = false
  try {
    const M = sandbox(undefined, undefined, undefined, undefined)
    M.restore(); M.start(); M.setPaused(true); M.setPaused(false); M.stop()
  } catch (e) { threw = true }
  check('hors navigateur : setPaused no-op sans exception', !threw)
}

// ---- 11. Firefox (Gecko) : « temps suspendu » — pause pendant le slow-mo ----
// Tout changement de vitesse d'un élément média gèle le sink de Gecko
// (~1 s, MESURÉ joueur — même via pause->vitesse->play). Mais laisser la
// musique jouer à 1× pendant le ralenti la fait dériver EN AVANCE sur le
// temps de jeu (le monde est quasi figé). Sur Firefox : la musique se met
// en pause à l'engagement du slow-mo et reprend à la libération, à
// l'endroit exact — synchro musique/temps de jeu préservée, zéro
// playbackRate touché, zéro gel. Chromium garde le vinyle ralenti.
{
  const src = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8')
  const created = []
  const rateSets = []
  const calls = { plays: 0, pauses: 0, seeks: 0 }
  class FakeAudioF {
    constructor(s) { this.src = s; this.loop = false; this.paused = true; this.handlers = {}; this.currentTime = 0; this._rate = 1; created.push(this) }
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
    set currentTime(v) { this._t = v; calls.seeks++ }
    get currentTime() { return this._t }
    set playbackRate(v) { this._rate = v; rateSets.push(v) }
    get playbackRate() { return this._rate }
    play() { this.paused = false; calls.plays++; return Promise.resolve() }
    pause() { if (!this.paused) calls.pauses++; this.paused = true }
  }
  const sandbox = new Function('Audio', 'localStorage', 'volume', 'document', 'console', 'navigator', 'return (() => {' + src + '; return Music })()')
  const M = sandbox(FakeAudioF, { getItem: () => null, setItem: () => {} }, () => {}, undefined, console, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' })
  if (typeof M.setRate !== 'function') {
    check('Firefox : setRate existe', false)
  } else {
    M.restore()
    M.start() // bgm1 joue
    calls.plays = 0; calls.pauses = 0; calls.seeks = 0
    // engagement : la musique se SUSPEND (pause, zéro playbackRate)
    M.setRate(0.97, 0.05)
    check('Firefox engagement : musique en pause, 0 write, 0 seek',
      rateSets.length === 0 && M.rate === 1 && calls.plays === 0 && calls.seeks === 0 &&
      created[0].paused === true && created[1].paused && created[2].paused)
    M.setRate(0.8, 0.05) // ralenti en cours…
    M.setRate(0.6, 0.05)
    check('Firefox : ralenti en cours, la musique reste suspendue', rateSets.length === 0 && calls.plays === 0 && created[0].paused === true)
    // libération : reprise à l'endroit exact (play, pas de seek)
    M.setRate(0.9, 1)
    check('Firefox libération : reprise sans seek, rate toujours 1',
      rateSets.length === 0 && M.rate === 1 && calls.plays === 1 && calls.seeks === 0 && created[0].paused === false)
    // muet pendant le slow-mo : la libération ne doit pas faire sonner
    M.setRate(0.97, 0.05) // re-suspension…
    M.setVolume(0) // mute : tout en pause, préférence enregistrée
    M.setRate(0.9, 1) // libération pendant mute
    check('Firefox : libération pendant mute -> pas de son', created[0].paused === true && M.rate === 1)
    M.setVolume(0.5) // dé-muet : la musique peut revenir (comportement unmute standard)
    // pause jeu pendant le slow-mo : pas de reprise musicale au dégel du slow-mo
    M.setRate(0.97, 0.05) // re-suspension…
    M.setPaused(true)
    M.setRate(0.9, 1) // libération pendant gel jeu
    check('Firefox : libération pendant pause jeu -> pas de reprise', created[0].paused === true)
    M.setPaused(false) // dégel : la musique reprend (comportement pause standard)
    check('Firefox : dégel jeu -> musique revient sans seek', created[0].paused === false && calls.seeks === 0)
    // jamais aucun playbackRate ni rate ≠ 1 sur tout le cycle de vie
    check('Firefox : zéro playbackRate touché, rate constant 1',
      rateSets.length === 0 && M.rate === 1)
  }
}

console.log(fail === 0 ? '\nMUSIC OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
