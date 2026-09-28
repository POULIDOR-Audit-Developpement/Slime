// SLIME — contact du joueur (Instagram ou email) : sanitize, stockage
// localStorage, modal DOM. Chargé par play.html AVANT game.js ; la modal ne
// s'ouvre jamais toute seule : uniquement via Contact.ensureModal (game.js,
// à la 1re mort avec un score > 0, pour embarquer le contact dans le code v2).
// Le contact est destiné au créateur (contacter le gagnant du giveaway) : il
// vit DANS le code signé, lisible par quiconque décode le QR — chaque joueur
// n'expose que le sien.

const Contact = (() => {
  const KEY = 'slime_contact'
  const MAX = 60

  // trim + espaces (tous) supprimés + charset restreint ASCII lettres /
  // chiffres / @ . _ + - ; casse PRÉSERVÉE ; tronqué à 60 ; '' si invalide.
  function sanitize(raw) {
    if (typeof raw !== 'string') return ''
    let s = raw.replace(/\s+/g, '')
    if (!s) return ''
    s = s.replace(/[^A-Za-z0-9@._+-]/g, '')
    if (!s) return ''
    return s.slice(0, MAX)
  }

  function get() {
    try {
      const v = localStorage.getItem(KEY)
      return v ? sanitize(v) : ''
    } catch (e) { return '' }
  }

  // set(raw) -> sanitize ; '' si vide (clé supprimée — mais une clé existante
  // puis vidée signifie « question déjà posée, joueur sans contact »).
  function set(raw) {
    const v = sanitize(raw)
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
      // marque la question comme posée même sans contact (skip = choix)
      localStorage.setItem(KEY + '_asked', '1')
    } catch (e) {}
    return v
  }

  // true dès que la question a été posée une fois (réponse contact OU skip).
  function asked() {
    try {
      if (localStorage.getItem(KEY + '_asked')) return true
      return localStorage.getItem(KEY) !== null
    } catch (e) { return false }
  }

  // Modal DOM : champ + ENREGISTRER (set + onDone(contact)) + « continuer
  // sans » (set('') + onDone('')). Une seule modal à la fois. Hors navigateur
  // (harnais Node) : onDone('') immédiat, rien n'est affiché.
  function ensureModal(opts) {
    const onDone = opts && typeof opts.onDone === 'function' ? opts.onDone : () => {}
    if (typeof document === 'undefined' || !document.createElement) { onDone(''); return }
    const prev = document.querySelector ? document.querySelector('.slime-modal') : null
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev)

    const ov = document.createElement('div')
    ov.className = 'slime-modal'
    const box = document.createElement('div')
    box.className = 'slime-modal-box'
    const title = document.createElement('div')
    title.className = 'slime-modal-title'
    title.textContent = I18N.t('contactTitle')
    const ask = document.createElement('p')
    ask.className = 'slime-modal-ask'
    ask.textContent = I18N.t('contactAsk')
    const inp = document.createElement('input')
    inp.className = 'slime-modal-input'
    inp.maxLength = MAX
    inp.value = get()
    inp.placeholder = I18N.t('contactPlaceholder')
    const ok = document.createElement('button')
    ok.className = 'slime-modal-btn'
    ok.textContent = I18N.t('contactSave')
    const skip = document.createElement('button')
    skip.className = 'slime-modal-skip'
    skip.textContent = I18N.t('contactSkip')

    function close(v) {
      if (ov.parentNode) ov.parentNode.removeChild(ov)
      onDone(set(v))
    }
    ok.addEventListener('click', () => close(inp.value))
    inp.addEventListener('keydown', e => { if (e && e.key === 'Enter') close(inp.value) })
    skip.addEventListener('click', () => close(''))

    box.appendChild(title); box.appendChild(ask); box.appendChild(inp)
    box.appendChild(ok); box.appendChild(skip)
    ov.appendChild(box)
    ;(document.body || document.documentElement).appendChild(ov)
    if (inp.focus) inp.focus()
  }

  return { sanitize, get, set, asked, ensureModal }
})()

if (typeof window !== 'undefined') window.Contact = Contact
