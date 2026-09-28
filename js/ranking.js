// SLIME — classement local du créateur (decode.html) : chaque scan vérifié
// alimente la liste, meilleur score PAR JOUEUR (contact insensible à la casse).
// Les codes sans contact (v1) sont dédoublonnés par leur code. Persisté en
// localStorage, exportable/importable en JSON. Module PUR : le stockage est
// injecté (localStorage en navigateur, stub en test).

const Ranking = (() => {
  const KEY = 'slime_ranking_v1'

  // Clé de dédoublonnage : contact minuscule, sinon le code lui-même (v1).
  function keyOf(x) {
    return (x.contact ? x.contact : '').toLowerCase() || 'code:' + (x.code || '')
  }

  // Entrée valide ? Champs tolérants (les scans viennent de verifyCode).
  function valid(x) {
    return !!x && typeof x === 'object' &&
      Number.isFinite(+x.score) && +x.score > 0 &&
      typeof x.code === 'string' && x.code.length > 0
  }

  // add(list, entry) -> { list, accepted, replaced } — ne mute PAS list.
  // Remplace l'entrée du même joueur seulement si score STRICTEMENT supérieur.
  function add(list, entry) {
    if (!valid(entry)) return { list, accepted: false, replaced: false }
    const k = keyOf(entry)
    const i = list.findIndex(x => keyOf(x) === k)
    if (i >= 0 && !(+entry.score > +list[i].score)) {
      return { list, accepted: false, replaced: false }
    }
    const out = list.slice()
    if (i >= 0) out.splice(i, 1)
    out.push({ contact: entry.contact || '', score: +entry.score, date: +entry.date || 0, code: entry.code, elapsed: Math.max(0, Math.floor(+entry.elapsed || 0)) })
    return { list: out, accepted: true, replaced: i >= 0 }
  }

  // Tri affichage : score décroissant, égalité -> plus ancien d'abord.
  function sort(list) {
    return list.slice().sort((a, b) => b.score - a.score || a.date - b.date)
  }

  // Union de deux listes (import) : meilleure entrée par clé, sans doublon.
  function merge(cur, imp) {
    let out = cur.slice()
    for (const x of (Array.isArray(imp) ? imp : [])) out = add(out, x).list
    return sort(out)
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
      return Array.isArray(raw) ? raw.filter(valid) : []
    } catch (e) { return [] }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : [])) } catch (e) {}
  }

  return { add, sort, merge, load, save }
})()

if (typeof window !== 'undefined') window.Ranking = Ranking
