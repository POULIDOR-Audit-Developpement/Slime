// SLIME — pseudo joueur : sanitize, stockage localStorage, modal DOM.
// Chargé par play.html ET index.html ; la modal ne s'ouvre jamais toute seule :
// uniquement via Player.ensureModal (câblage : game.js en T6, ligne « TON NOM »
// de index.html).
// sanitize reprend les règles de Scores.normalizeName (server.mjs) avec UNE
// divergence assumée : le client TRONQUE à 12 caractères, le serveur REJETTE.

const Player = (() => {
  const KEY = 'slime_player_name'
  const MAX = 12

  // Filtre insultes best-effort (petite liste FR/EN en dur) : le mot est
  // remplacé par 'Slime'. Frontières = pas de lettre (a-z, accents latin
  // de à à ÿ) ni chiffre autour, pluriel en 's' toléré.
  const BAD = ['connard', 'connasse', 'enculé', 'salaud', 'salope', 'putain',
    'merde', 'fuck', 'shit', 'bitch', 'asshole', 'cunt']
  const BAD_RE = BAD.map(w => new RegExp('(^|[^a-zà-ÿ0-9])' + w + 's?(?=$|[^a-zà-ÿ0-9])', 'gi'))

  function filterInsults(s) {
    for (const re of BAD_RE) s = s.replace(re, '$1Slime')
    return s
  }

  // trim + NFC + espaces réduits + filtre insultes ; charset lettres (accents
  // compris) / chiffres / espaces / -_. ' ; casse PRÉSERVÉE ; tronqué à 12
  // (re-trim : jamais d'espace en fin) ; '' si invalide.
  function sanitize(raw) {
    if (typeof raw !== 'string') return ''
    let s = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
    if (!s) return ''
    s = filterInsults(s).replace(/\s+/g, ' ').trim()
    if (!s || !/^[\p{L}\p{N} _.'-]+$/u.test(s)) return ''
    return s.slice(0, MAX).trim()
  }

  function get() {
    try {
      const v = localStorage.getItem(KEY)
      if (!v) return null
      return sanitize(v) || null
    } catch (e) { return null }
  }

  // set(raw) -> sanitize ; null si vide (et clef supprimée).
  function set(raw) {
    const v = sanitize(raw)
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
    } catch (e) {}
    return v || null
  }

  // Modal DOM : champ + JOUER (set + onDone(nom)) + « jouer sans nom »
  // (onDone(null), ne touche PAS au stockage). Une seule modal à la fois.
  function ensureModal(opts) {
    const onDone = opts && typeof opts.onDone === 'function' ? opts.onDone : () => {}
    if (typeof document === 'undefined' || !document.createElement) { onDone(null); return }
    const prev = document.querySelector ? document.querySelector('.slime-modal') : null
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev)

    const ov = document.createElement('div')
    ov.className = 'slime-modal'
    const box = document.createElement('div')
    box.className = 'slime-modal-box'
    const title = document.createElement('div')
    title.className = 'slime-modal-title'
    title.textContent = I18N.t('nameTitle')
    const ask = document.createElement('p')
    ask.className = 'slime-modal-ask'
    ask.textContent = I18N.t('nameAsk')
    const inp = document.createElement('input')
    inp.className = 'slime-modal-input'
    inp.maxLength = MAX
    inp.value = get() || ''
    const play = document.createElement('button')
    play.className = 'slime-modal-btn'
    play.textContent = I18N.t('play')
    const skip = document.createElement('button')
    skip.className = 'slime-modal-skip'
    skip.textContent = I18N.t('nameSkip')

    function close(v) {
      if (ov.parentNode) ov.parentNode.removeChild(ov)
      onDone(v)
    }
    play.addEventListener('click', () => close(set(inp.value)))
    inp.addEventListener('keydown', e => { if (e && e.key === 'Enter') close(set(inp.value)) })
    skip.addEventListener('click', () => close(null))

    box.appendChild(title); box.appendChild(ask); box.appendChild(inp)
    box.appendChild(play); box.appendChild(skip)
    ov.appendChild(box)
    ;(document.body || document.documentElement).appendChild(ov)
    if (inp.focus) inp.focus()
  }

  return { sanitize, get, set, ensureModal }
})()

if (typeof window !== 'undefined') window.Player = Player
