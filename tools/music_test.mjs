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

console.log(fail === 0 ? '\nMUSIC OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
