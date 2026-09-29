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
      codehint: 'Scanne le QR ou copie le code',
      time: 'TEMPS',
      // modal contact (js/contact.js) : Instagram/email pour le giveaway
      contactTitle: 'TON CONTACT',
      contactAsk: 'Instagram ou email, pour te contacter si tu gagnes ?',
      contactPlaceholder: '@instagram ou email',
      contactSave: 'ENREGISTRER',
      contactSkip: 'Continuer sans',
      contactAdd: 'AJOUTER UN CONTACT',
      rotate: 'Paysage !',
      addhome: "Ajoute a l'ecran d'accueil",
      speed: 'VITESSE',
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
      platsTitle: '9 plateformes',
      platsSub: 'Certaines aident, d\'autres trahissent.',
      pBase: 'Base', pBaseS: 'toujours la',
      pSticky: 'Collante', pStickyS: 'accroche',
      pDyn: 'Dynamique', pDynS: 'oscille',
      pCrumble: 'Friable', pCrumbleS: 's\'effrite',
      pPhase: 'Phasante', pPhaseS: 'traverse',
      pBouncy: 'Rebond', pBouncyS: 'catapulte',
      pTurbo: 'Turbo', pTurboS: 'booste',
      pGold: 'Doree', pGoldS: '50 pts',
      pSeesaw: 'Bascule', pSeesawS: 'equilibre',
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
      foot: 'SLIME — endless runner pixel-art.'
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
      codehint: 'Scan the QR or copy the code',
      time: 'TIME',
      // contact modal (js/contact.js): Instagram/email for the giveaway
      contactTitle: 'YOUR CONTACT',
      contactAsk: 'Instagram or email, so we can reach you if you win?',
      contactPlaceholder: '@instagram or email',
      contactSave: 'SAVE',
      contactSkip: 'Continue without',
      contactAdd: 'ADD A CONTACT',
      rotate: 'Landscape!',
      addhome: 'Add to Home Screen',
      speed: 'SPEED',
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
      platsTitle: '9 platforms',
      platsSub: 'Some help, some betray.',
      pBase: 'Basic', pBaseS: 'always there',
      pSticky: 'Sticky', pStickyS: 'grips',
      pDyn: 'Dynamic', pDynS: 'swings',
      pCrumble: 'Crumble', pCrumbleS: 'falls apart',
      pPhase: 'Phasing', pPhaseS: 'phases through',
      pBouncy: 'Bounce', pBouncyS: 'catapults',
      pTurbo: 'Turbo', pTurboS: 'speed boost',
      pGold: 'Gold', pGoldS: '50 pts',
      pSeesaw: 'Seesaw', pSeesawS: 'tips and launches',
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
      foot: 'SLIME — pixel-art endless runner.'
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
