// SLIME — BGM : playlist de fichiers .mp3 à BPM fixe (ASSETS/music/bgm1..3.mp3,
// ~3 min chacun — une piste par tranche de 3 min, montée d'intensité calée sur
// la caméra : vitesse max atteinte à 9 min). Remplace l'ancien chiptune zzfx
// dont le tempo suivait camRatio().
// - start() au 1er saut, stop() à la mort : comme avant, la musique ne sonne
//   qu'en partie (jamais au titre ni sur l'écran de mort).
// - stop() remet l'index et les positions à 0 : « Rejouer » repart piste 1.
// - Après la 3e piste : elle boucle sur elle-même (survie > 9 min).
// - toggle() : coupe/relance (touche 'm' ou coin haut-gauche) — coupe aussi
//   les SFX (volume zzfx), comportement inchangé, persisté dans localStorage.
// - Onglet masqué : pause/reprise (le chiptune, piloté par rAF, s'arrêtait).
// - setStart(n) : piste de départ d'une run (?niveau=N, « Tester niveau » de
//   l'éditeur) — start()/stop() reviennent à bgmN au lieu de bgm1.
// - Fichier absent/illisible : silence (console.info), jamais bloquant.
// - Hors navigateur (simulations Node tools/*.mjs) : no-op complet.
const Music = (() => {
  const TRACKS = ['ASSETS/music/bgm1.mp3', 'ASSETS/music/bgm2.mp3', 'ASSETS/music/bgm3.mp3']
  const VOL = 0.5
  let audio = null // éléments Audio créés au boot ; null hors navigateur
  let idx = 0
  let startIdx = 0 // piste de départ d'une run (setStart — « Tester niveau » éditeur)
  let started = false // run en cours (start() sans stop() depuis)
  let muted = false

  function init() {
    if (audio || typeof Audio === 'undefined') return
    audio = TRACKS.map((src, i) => {
      const a = new Audio(src)
      a.preload = 'auto'
      a.volume = VOL
      if (i === TRACKS.length - 1) a.loop = true
      a.addEventListener('error', () => console.info('[Music] piste indisponible :', src))
      a.addEventListener('ended', () => {
        // la piste 3 boucle (loop) : on n'enchère que depuis une piste intermédiaire
        if (started && !muted && audio && idx < TRACKS.length - 1 && audio[idx] === a) {
          a.pause()
          idx++
          audio[idx].play().catch(() => {})
        }
      })
      return a
    })
  }

  function playCur(fromStart) {
    const a = audio && audio[idx]
    if (!a) return
    if (fromStart) { try { a.currentTime = 0 } catch (e) {} }
    a.play().catch(() => {}) // rejet si aucun geste utilisateur : silence
  }

  function pauseAll() {
    if (!audio) return
    for (const a of audio) a.pause()
  }

  function start() {
    if (started) return // sauts suivants : la lecture continue — PAS de rembobinage
    started = true
    init() // paresseux : premier saut seulement, dans le geste utilisateur —
    // rien de média au chargement de la page (burst 3×4 Mo = saccades mobiles)
    idx = startIdx // nouvelle partie : la piste de DÉPART (?niveau=N), pas bgm1
    if (!audio || muted) return
    playCur(true) // nouvelle partie : la piste démarre du début
  }

  function stop() {
    started = false
    idx = startIdx
    if (!audio) return
    pauseAll()
    for (const a of audio) { try { a.currentTime = 0 } catch (e) {} }
  }

  // Piste de départ d'une run (0..2) : « Tester niveau » (éditeur) démarre la
  // musique sur bgmN. L'index courant suit tout de suite… sauf hors navigateur
  // (audio null : no-op strict, Music.track reste 0) et pendant une run.
  function setStart(n) {
    startIdx = Math.min(TRACKS.length - 1, Math.max(0, n | 0))
    if (!started && audio) idx = startIdx
  }

  // volume() = gain zzfx global (litecanvas) : coupe aussi les SFX. Absent hors
  // navigateur -> garde pour un no-op propre.
  function setZzfxVol() { if (typeof volume === 'function') volume(muted ? 0 : VOL) }

  function toggle() {
    muted = !muted
    try { localStorage.setItem('slime_muted', muted ? '1' : '0') } catch (e) {}
    setZzfxVol()
    if (!audio) return
    if (muted) pauseAll()
    else if (started) playCur(false) // reprise à l'endroit mis en pause
  }

  function restore() {
    // PAS d'init() ici : la création des <audio> (et leur chargement) attend le
    // premier saut — sur mobile, le burst de 13 Mo au boot coûte des FPS.
    try { muted = localStorage.getItem('slime_muted') === '1' } catch (e) {}
    setZzfxVol()
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !document.__slimeVisBound) {
      document.__slimeVisBound = true
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAll()
        else if (started && !muted) playCur(false)
      })
    }
  }

  return {
    start,
    stop,
    toggle,
    restore,
    setStart,
    // Piste courante (0, 1 ou 2) : le jeu la lit chaque frame (lecture
    // gratuite) pour swapper le fond au passage bgm1 -> bgm2 -> bgm3.
    get track() { return idx },
    get muted() { return muted }
  }
})()
