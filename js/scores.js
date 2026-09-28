// SLIME — T6 « L'Atelier des bocaux », côté client : suivi des temps
// d'obtention de palier + soumission du score au serveur à la mort.
// Chargé par play.html AVANT game.js (et par tools/tiertime_test.mjs via un
// harnais new Function) : aucune dépendance DOM, tout est optionnel hors nav.

// TierTimes — suivi PUR des paliers : [[tierIdx, sec], …] dans l'ordre croissant
// du palier (même contrat que validTimes côté serveur : tier strictement
// croissant, secondes croissantes, entiers).
const TierTimes = (() => {
  // track(times, tierIdx, elapsed) -> times : ajoute [tierIdx, round(elapsed)]
  // si tierIdx dépasse le dernier palier suivi (-1 si vide : le palier 0 est
  // bien enregistré, à ~0 s). Pur : le tableau donné n'est JAMAIS muté — il est
  // renvoyé tel quel quand rien ne change (pas de copie par tick), copié
  // seulement au franchissement d'un palier (rare, O(n) minuscule).
  function track(times, tierIdx, elapsed) {
    const t = Array.isArray(times) ? times : []
    const last = t.length ? t[t.length - 1][0] : -1
    if (!Number.isInteger(tierIdx) || tierIdx <= last) return t
    const out = t.slice()
    out.push([tierIdx, Math.round(elapsed)])
    return out
  }

  // reset() -> [] : nouvelle partie, nouveau suivi.
  function reset() { return [] }

  return { track, reset }
})()

// Scores — submit() fire-and-forget vers POST /api/scores
// ({v:1,name,score,playtime,times,code} -> 200 {ok,accepted} | 400 | 429).
// La promesse renvoyée ne rejette JAMAIS : timeout, réseau coupé et statuts
// d'erreur sont avalés — la mort du slime ne doit jamais être interrompue.
const Scores = (() => {
  const TIMEOUT_MS = 3000

  function submit(payload, timeoutMs) {
    // timeoutMs ne sert qu'au test (accélère le cas abort) ; défaut 3 s.
    const ms = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : TIMEOUT_MS
    let body
    try { body = JSON.stringify(payload || {}) } catch (e) { return Promise.resolve() }
    if (typeof fetch !== 'function') return Promise.resolve()
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort() } catch (e) {} }, ms) : null
    const clear = () => { if (timer) clearTimeout(timer) }
    return fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl ? ctrl.signal : undefined
    }).then(
      r => { clear(); return r }, // statut ignoré : 200/400/429 terminent proprement
      () => { clear(); return null } // timeout (abort) ou réseau coupé : silencieux
    ).catch(() => {})
  }

  return { submit }
})()

if (typeof window !== 'undefined') {
  window.TierTimes = TierTimes
  window.Scores = Scores
}
