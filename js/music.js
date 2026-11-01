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
// - setVolume(v) : volume continu (slider HUD), 0 = muet, persisté slime_vol.
// - setRate(ts, target) : vitesse de lecture collée à l'échelle de temps du
//   jeu (slow-mo du double saut). Chromium : courbe adoucie rate =
//   1−(1−ts)×0.55, bornée [0.5 ; 1] (sous 0.5× les navigateurs coupent le
//   son), quantifiée par pas de 0.05 ; pitch NON préservé (preservesPitch =
//   false) — effet vinyle. Firefox : « temps suspendu » — tout changement
//   de vitesse gèle le sink audio de Gecko, la musique se met donc EN PAUSE
//   pendant le ralenti et reprend à la libération (synchro musique/temps de
//   jeu préservée). Idempotent : coût par frame = une comparaison.
// - setPaused(p) : pause jeu (bouton, Espace, plein écran perdu, onglet
//   masqué) — gèle la BGM sans seek, reprise à l'endroit exact au dégel ;
//   empêche aussi la reprise par visibilitychange pendant le gel.
// - Fichier absent/illisible : silence (console.info), jamais bloquant.
// - Hors navigateur (simulations Node tools/*.mjs) : no-op complet.
const Music = (() => {
  const TRACKS = ['ASSETS/music/bgm1.mp3', 'ASSETS/music/bgm2.mp3', 'ASSETS/music/bgm3.mp3']
  const VOL = 0.5
  // Adoucissement slow-mo : à ts=0.05 la musique est à 0.5× (plancher), à
  // ts=0.35 elle est à 0.64× — le monde s'arrête, la musique ralentit net
  // sans devenir un drone inaudible ni se faire couper par le navigateur.
  const SLOW_K = 0.55
  const RATE_MIN = 0.5 // sous ce seuil : son coupé (Gecko, Chrome) — interdit
  // Quantification : CHAQUE écriture de playbackRate reconfigure le pipeline
  // média du navigateur (resampler/horloge) — les changer à chaque tick de
  // sim (240 Hz) pendant la transition s'entend : glitch/freeze au retour.
  // On ne franchit donc un palier que par pas de 5 % de tempo (inaudible) :
  // ~10 écritures par transition au lieu de ~270, paliers stables que le
  // navigateur enchaîne proprement.
  const RATE_STEP = 0.05
  // Firefox (Gecko) : « temps suspendu ». Tout changement de vitesse d'un
  // élément média gèle le sink audio de Gecko (~1 s, MESURÉ joueur — même
  // via pause->vitesse->play) ; mais laisser la musique jouer à 1× pendant
  // le ralenti la fait dériver EN AVANCE sur le temps de jeu. Sur Firefox,
  // la musique se met donc EN PAUSE à l'engagement du slow-mo et reprend à
  // la libération, à l'endroit exact : synchro musique/temps de jeu
  // préservée, zéro playbackRate touché, zéro gel. Chromium, mesuré propre
  // (?audio=1 : 0 stall sur 22 cycles), garde le vinyle ralenti.
  const SPARSE = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)
  let lastTarget = 1 // dernière cible vue (Firefox : détecte engagement/libération)
  let heldForSlowmo = false // musique suspendue par nous pendant un slow-mo
  let vol = VOL // volume continu (slider HUD) — persisté 'slime_vol'
  let audio = null // éléments Audio créés au boot ; null hors navigateur
  let idx = 0
  let startIdx = 0 // piste de départ d'une run (setStart — « Tester niveau » éditeur)
  let started = false // run en cours (start() sans stop() depuis)
  let muted = false
  let rate = 1 // vitesse de lecture courante (1 = normale)
  let gamePaused = false // pause jeu (bouton/Espace/plein écran perdu/onglet)

  function init() {
    if (audio || typeof Audio === 'undefined') return
    audio = TRACKS.map((src, i) => {
      const a = new Audio(src)
      a.preload = 'auto'
      a.volume = vol
      // Pitch NON préservé : ralentie par le slow-mo, la piste descend aussi
      // (vinyle) — prefixed fallbacks vieux navigateurs, no-op sinon.
      a.preservesPitch = false
      a.webkitPreservesPitch = false
      a.mozPreservesPitch = false
      if (i === TRACKS.length - 1) a.loop = true
      if (probeHook) { // sonde ?audio=1 : événements du pipeline média
        a.addEventListener('ratechange', () => probeHook.ev('rc'))
        a.addEventListener('waiting', () => probeHook.ev('wait'))
        a.addEventListener('stalled', () => probeHook.ev('stallEv'))
      }
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
    gamePaused = false // nouvelle run : le gel éventuel de la précédente est oublié
    init() // paresseux : premier saut seulement, dans le geste utilisateur —
    // rien de média au chargement de la page (burst 3×4 Mo = saccades mobiles)
    idx = startIdx // nouvelle partie : la piste de DÉPART (?niveau=N), pas bgm1
    if (!audio || muted) return
    playCur(true) // nouvelle partie : la piste démarre du début
  }

  function stop() {
    started = false
    idx = startIdx
    // La partie suivante repart à vitesse normale — même logique que la
    // remise à zéro de l'index et des positions. (No-op sur Firefox :
    // rate n'y quitte jamais 1.)
    if (rate !== 1) {
      rate = 1
      lastTarget = 1 // transition interrompue : le prochain engagement réécrira
      if (audio) for (const a of audio) a.playbackRate = 1
    }
    heldForSlowmo = false // (no-op Firefox : rien à annuler, mais restons cohérents)
    if (!audio) return
    pauseAll()
    for (const a of audio) { try { a.currentTime = 0 } catch (e) {} }
  }

  // Vitesse de lecture collée à l'échelle de temps du jeu (slow-mo).
  // Chromium : courbe adoucie + quantifiée (RATE_STEP), lissée par le
  // glissement de ts. Firefox : « temps suspendu » (voir SPARSE) — la
  // musique se pause pendant le ralenti et reprend à la libération.
  // Appelée chaque frame par le jeu : idempotent.
  function setRate(r, target) {
    const tgt = isFinite(target) ? Math.min(1, Math.max(0, target)) : 1
    if (SPARSE) {
      const entered = tgt < 1 && lastTarget >= 1
      const exited = tgt >= 1 && lastTarget < 1
      lastTarget = tgt
      if (entered) {
        heldForSlowmo = started && !muted && !gamePaused
        if (heldForSlowmo) pauseAll() // temps suspendu : la musique attend
      } else if (exited) {
        if (heldForSlowmo && started && !muted && !gamePaused) playCur(false)
        heldForSlowmo = false
      }
      return
    }
    if (!isFinite(r)) r = 1
    const t = Math.min(1, Math.max(0, r))
    const exact = Math.min(1, Math.max(RATE_MIN, 1 - (1 - t) * SLOW_K))
    const next = exact >= 1 || exact <= RATE_MIN ? exact : Math.min(1, Math.round(exact / RATE_STEP) * RATE_STEP)
    if (next === rate) return
    rate = next
    if (probeHook) probeHook.write()
    if (!audio) return
    for (const a of audio) a.playbackRate = rate
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
  function setZzfxVol() { if (typeof volume === 'function') volume(muted ? 0 : vol) }

  // Pause jeu (bouton, Espace, plein écran perdu, onglet masqué) : gèle la
  // BGM sans seek — la reprise se fait à l'endroit exact. Sans effet hors
  // run ou muet (rien ne joue). gamePaused garde aussi le handler
  // visibilitychange de reprendre la musique pendant que le jeu est gelé.
  function setPaused(p) {
    p = !!p
    if (p === gamePaused) return
    gamePaused = p
    if (p) heldForSlowmo = false // pause externe : elle supplante la suspension slow-mo
    if (!audio || !started || muted) return
    if (p) pauseAll()
    else playCur(false)
  }

  // Volume continu (slider HUD) : 0 = muet, persisté 'slime_vol'. Applique aux
  // pistes + SFX zzfx ; reprise/pause de la lecture comme toggle().
  function setVolume(v) {
    vol = Math.min(1, Math.max(0, Number(v) || 0))
    muted = vol <= 0.001
    try { localStorage.setItem('slime_vol', String(Math.round(vol * 100) / 100)) } catch (e) {}
    setZzfxVol()
    if (muted) heldForSlowmo = false // mute externe : supplante la suspension slow-mo
    if (!audio) return
    for (const a of audio) a.volume = vol
    if (muted) pauseAll()
    else if (started) playCur(false)
  }

  function toggle() {
    muted = !muted
    if (!muted && vol <= 0.001) vol = VOL // démué après un slider à 0 : revenir audible
    try { localStorage.setItem('slime_muted', muted ? '1' : '0') } catch (e) {}
    setZzfxVol()
    if (muted) heldForSlowmo = false // mute externe : supplante la suspension slow-mo
    if (!audio) return
    if (muted) pauseAll()
    else if (started) playCur(false) // reprise à l'endroit mis en pause
  }

  function restore() {
    // PAS d'init() ici : la création des <audio> (et leur chargement) attend le
    // premier saut — sur mobile, le burst de 13 Mo au boot coûte des FPS.
    probeSetup()
    try { muted = localStorage.getItem('slime_muted') === '1' } catch (e) {}
    try { vol = Math.min(1, Math.max(0, parseFloat(localStorage.getItem('slime_vol')) || VOL)) } catch (e) {}
    setZzfxVol()
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !document.__slimeVisBound) {
      document.__slimeVisBound = true
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAll()
        else if (started && !muted && !gamePaused) playCur(false)
      })
    }
  }

  // ---- Sonde ?audio=1 : mesure des stalls de la BGM (diagnostic) ----
  // Un « stall » = la piste courante, censée jouer, avance < 20 % de la
  // vitesse murale pendant >= 40 ms (le pipeline média décroche —
  // typiquement autour d'un changement de playbackRate). L'overlay affiche
  // n / dernier / max : si max grimpe de cycle en cycle, le navigateur
  // accumule (buffer qui ne récupère pas entre les cycles) ; sinon le coût
  // est constant par écriture. No-op sans ?audio=1 ni hors navigateur.
  let probeHook = null
  function probeSetup() {
    if (typeof document === 'undefined' || typeof location === 'undefined') return
    let on = false
    try { on = new URLSearchParams(location.search).get('audio') === '1' } catch (e) {}
    if (!on || !document.body || typeof setInterval !== 'function') return
    const div = document.createElement('div')
    div.style.cssText = 'position:fixed;top:2px;left:2px;z-index:99999;background:rgba(0,0,0,.7);color:#0f0;font:10px/1.35 monospace;padding:4px 6px;white-space:pre;pointer-events:none'
    document.body.appendChild(div)
    const stalls = [] // { ms, rate, age } — âge = s depuis le dernier write
    let stat = null // stall en cours
    let lastT = performance.now(), lastPos = -1, lastIdx = -1
    let writes = 0, rc = 0, wait = 0, stallEv = 0, lastWriteAt = performance.now()
    probeHook = {
      write() { writes++; lastWriteAt = performance.now() },
      ev(k) { if (k === 'rc') rc++; else if (k === 'wait') wait++; else stallEv++ }
    }
    setInterval(() => {
      const now = performance.now()
      const dt = now - lastT
      lastT = now
      const a = audio && audio[idx]
      if (idx !== lastIdx) { lastIdx = idx; lastPos = -1 } // changement de piste
      if (a && !a.paused) {
        const pos = a.currentTime
        if (lastPos >= 0 && pos >= lastPos) {
          const spd = (pos - lastPos) * 1000 / dt
          if (spd < 0.2) {
            if (!stat) stat = { ms: 0, rate, age: (now - lastWriteAt) / 1000 }
            stat.ms += dt
          } else if (stat) {
            if (stat.ms >= 40) stalls.push(stat)
            if (stalls.length > 400) stalls.shift()
            stat = null
          }
        }
        lastPos = pos
      } else { lastPos = -1; if (stat) { if (stat.ms >= 40) stalls.push(stat); stat = null } }
      let txt = ''
      try {
        const n = stalls.length
        const last = n ? stalls[n - 1].ms : 0
        const max = n ? Math.max(...stalls.map(s => s.ms)) : 0
        const sum = n ? stalls.reduce((u, s) => u + s.ms, 0) : 0
        txt = 'SLOW-MO AUDIO PROBE\n' +
          'stalls n=' + n + ' last=' + Math.round(last) + 'ms max=' + Math.round(max) + 'ms moy=' + Math.round(n ? sum / n : 0) + 'ms\n' +
          'writes=' + writes + ' ratechange=' + rc + ' waiting=' + wait + ' stalled=' + stallEv + '\n' +
          't=' + Math.round(now / 1000) + 's rate=' + rate.toFixed(2) + ' idx=' + idx + (stat ? ' STALL EN COURS ' + Math.round(stat.ms) + 'ms' : '')
      } catch (e) {}
      div.textContent = txt
    }, 20)
  }

  return {
    start,
    stop,
    toggle,
    restore,
    setStart,
    setVolume,
    setRate,
    setPaused,
    // Piste courante (0, 1 ou 2) : le jeu la lit chaque frame (lecture
    // gratuite) pour swapper le fond au passage bgm1 -> bgm2 -> bgm3.
    get track() { return idx },
    get muted() { return muted },
    get vol() { return vol },
    // Vitesse de lecture courante (0.5..1) : suit l'échelle de temps du jeu.
    get rate() { return rate }
  }
})()
