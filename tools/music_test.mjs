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

console.log(fail === 0 ? '\nMUSIC OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
