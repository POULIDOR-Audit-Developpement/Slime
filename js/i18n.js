// SLIME — i18n minimal : EN (défaut) / FR, très peu de mots.
// Partagé par le jeu (canvas) et la page de présentation ([data-i18n]).
// La langue est persistée dans localStorage('slime_lang').

const I18N = (() => {
  const KEY = 'slime_lang'
  const D = {
    fr: {
      // jeu
      aim: 'Glisse pour viser, relache pour sauter',
      anywhere: 'Pose le doigt n importe ou',
      start: 'Touche pour jouer',
      over: 'PERDU !',
      record: 'RECORD !',
      replay: 'REJOUER',
      copy: 'CODE',
      copied: 'COPIE !',
      code: 'CODE DE SCORE',
      codehint: 'Montre ce code pour valider',
      time: 'TEMPS',
      rotate: 'Paysage !',
      addhome: "Ajoute a l'ecran d'accueil",
      speed: 'VITESSE',
      // T6 — bouton écran de fin -> atelier.html
      atelier: 'ATELIER',
      // T7 — atelier.html : bouton retour
      back: 'RETOUR',
      // T8 — atelier.html : livre hors ligne
      offline: "L'atelier se remplit en ligne",
      // page de présentation
      tagline: 'La camera accelere sans pitie. Vise, saute, accroche-toi.',
      play: 'JOUER',
      editor: 'EDITEUR',
      src: 'CODE SOURCE',
      fAim: 'Visee',
      fAimP: 'Loin = fort. Relache pour sauter.',
      fDj: 'Double saut',
      fDjP: 'Bullet time en l\'air.',
      fLedge: 'Ledge catch',
      fLedgeP: 'Agrippe in-extremis.',
      fBonus: 'Billes & bonus',
      fBonusP: 'Doree = 50 pts. Bonus = vie.',
      fDeath: 'Mort animee',
      fDeathP: 'Splat en 4 frames.',
      fDiff: 'Couleur = score',
      fDiffP: 'Paliers, degrades, arc-en-ciel, brillant, etoile.',
      platsTitle: '6 plateformes',
      platsSub: 'Certaines aident, d\'autres trahissent.',
      pBase: 'Base', pBaseS: 'toujours la',
      pSticky: 'Collante', pStickyS: 'accroche',
      pDyn: 'Dynamique', pDynS: 'oscille',
      pCrumble: 'Friable', pCrumbleS: 's\'effrite',
      pGhost: 'Fantome', pGhostS: 'traverse',
      pBouncy: 'Rebond', pBouncyS: 'catapulte',
      speedTitle: 'La jauge ne ment pas',
      speedSub: 'Vert, orange, rouge. Jamais en descente.',
      editTitle: 'Fabrique ton enfer',
      editSub: 'L\'editeur remplace le contenu du jeu.',
      ePat: 'PATTERNS',
      ePatP: 'Sauts valides en direct.',
      eVue: 'REGLAGES',
      eVueP: 'Physique et pouvoirs en sliders.',
      eLan: 'SYNC LAN',
      eLanP: 'Edite sur PC, joue sur telephone.',
      editCta: 'OUVRIR L\'EDITEUR',
      galTitle: 'Tout un slime d\'etats',
      galSub: 'Vert, orange, rouge selon ta vie.',
      foot: 'SLIME — endless runner pixel-art.',
      // pseudo joueur (js/player.js)
      nameTitle: 'TON NOM',
      nameAsk: 'Quel est ton nom ?',
      nameSkip: 'Jouer sans nom',
      yourName: 'TON NOM'
    },
    en: {
      aim: 'Drag to aim, release to jump',
      anywhere: 'Touch anywhere',
      start: 'Tap to play',
      over: 'GAME OVER',
      record: 'NEW BEST!',
      replay: 'RETRY',
      copy: 'CODE',
      copied: 'COPIED!',
      code: 'SCORE CODE',
      codehint: 'Show this code to claim',
      time: 'TIME',
      rotate: 'Landscape!',
      addhome: 'Add to Home Screen',
      speed: 'SPEED',
      // T6 — end-screen button -> atelier.html
      atelier: 'ATELIER',
      // T7 — atelier.html : back button
      back: 'BACK',
      // T8 — atelier.html : offline book message
      offline: 'The workshop fills up online',
      tagline: 'The camera never slows down. Aim, jump, hang on.',
      play: 'PLAY',
      editor: 'EDITOR',
      src: 'SOURCE CODE',
      fAim: 'Aim',
      fAimP: 'Far = strong. Release to jump.',
      fDj: 'Double jump',
      fDjP: 'Bullet time mid-air.',
      fLedge: 'Ledge catch',
      fLedgeP: 'Grabbed at the last pixel.',
      fBonus: 'Balls & bonus',
      fBonusP: 'Gold = 50 pts. Bonus = life.',
      fDeath: 'Animated death',
      fDeathP: 'Splat in 4 frames.',
      fDiff: 'Color = score',
      fDiffP: 'Tiers: gradient, multicolor, rainbow, shiny, starry.',
      platsTitle: '6 platforms',
      platsSub: 'Some help, some betray.',
      pBase: 'Basic', pBaseS: 'always there',
      pSticky: 'Sticky', pStickyS: 'grips',
      pDyn: 'Dynamic', pDynS: 'swings',
      pCrumble: 'Crumble', pCrumbleS: 'falls apart',
      pGhost: 'Ghost', pGhostS: 'phases through',
      pBouncy: 'Bounce', pBouncyS: 'catapults',
      speedTitle: 'The gauge never lies',
      speedSub: 'Green, orange, red. Never down.',
      editTitle: 'Build your own hell',
      editSub: 'The editor replaces the game content.',
      ePat: 'PATTERNS',
      ePatP: 'Jumps validated live.',
      eVue: 'SETTINGS',
      eVueP: 'Physics & powers as sliders.',
      eLan: 'LAN SYNC',
      eLanP: 'Edit on PC, play on phone.',
      editCta: 'OPEN EDITOR',
      galTitle: 'A whole range of slime',
      galSub: 'Green, orange, red — your life.',
      foot: 'SLIME — pixel-art endless runner.',
      // player name (js/player.js)
      nameTitle: 'YOUR NAME',
      nameAsk: 'What is your name?',
      nameSkip: 'Play without a name',
      yourName: 'YOUR NAME'
    }
  }
  const listeners = []
  let lang = 'en'
  try { lang = localStorage.getItem(KEY) || 'en' } catch (e) {}
  if (!D[lang]) lang = 'en'

  function t(k) { return (D[lang] && D[lang][k]) || D.fr[k] || k }
  function get() { return lang }
  function langs() { return Object.keys(D) }
  function label(l) { return l.toUpperCase() }
  function apply() {
    // Remplace le texte des éléments [data-i18n] (page de présentation).
    try {
      if (typeof document === 'undefined' || !document.querySelectorAll) return
      const els = document.querySelectorAll('[data-i18n]')
      for (let i = 0; i < els.length; i++) {
        const v = t(els[i].getAttribute('data-i18n'))
        if (v != null) els[i].textContent = v
      }
    } catch (e) {}
    for (const f of listeners) { try { f(lang) } catch (e) {} }
  }
  function set(l) {
    if (!D[l] || l === lang) { apply(); return }
    lang = l
    try { localStorage.setItem(KEY, l) } catch (e) {}
    apply()
  }
  function onChange(f) { listeners.push(f) }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply)
    else apply()
  }

  return { t, get, set, langs, label, onChange, apply }
})()

if (typeof window !== 'undefined') window.I18N = I18N
