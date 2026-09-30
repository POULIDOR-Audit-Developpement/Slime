// Test — js/ranking.js : classement local du créateur alimenté par les scans
// de decode.html (aucun serveur : meilleur score par joueur, persisté en
// localStorage, import/export JSON).
//   1. add : 1re entrée acceptée, meilleur score par contact (clé insensible
//      à la casse), remplacement seulement si STRICTEMENT supérieur
//   2. sans contact (codes v1) : dédoublonnage par code, chaque code distinct
//      reste dans la liste
//   3. sort : score décroissant, égalité -> plus ancien d'abord
//   4. merge/import : union sans doublon (même code), meilleur par contact
//   5. load/save : round-trip localStorage + stockage corrompu -> liste vide
// Run : node tools/ranking_test.mjs
import { readFileSync } from 'fs'

let fail = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { fail++; console.log('FAIL', name) } }

function loadRanking(store) {
  const src = readFileSync(new URL('../js/ranking.js', import.meta.url), 'utf8')
  const ls = store || {}
  const storage = {
    getItem: k => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v) },
    removeItem: k => { delete ls[k] }
  }
  const R = new Function('localStorage', src + '; return Ranking')(storage)
  return { R, ls }
}

const e = (contact, score, date, code, elapsed) =>
  ({ contact: contact || '', score, date: date || 0, code: code || 'C-' + contact + '-' + score, elapsed: elapsed || 0 })

// 1) meilleur par contact
{
  const { R } = loadRanking()
  let r = R.add([], e('alice', 100, 10))
  check('1re entrée acceptée', r.accepted && r.list.length === 1)
  r = R.add(r.list, e('ALICE', 90, 11))
  check('score inférieur (même joueur, casse ≠) : ignoré', !r.accepted && r.list.length === 1 && r.list[0].score === 100)
  r = R.add(r.list, e('Alice', 200, 12))
  check('score supérieur : remplace', r.accepted && r.replaced && r.list.length === 1 && r.list[0].score === 200 && r.list[0].contact === 'Alice')
  r = R.add(r.list, e('bob', 50, 13))
  check('autre joueur : ajouté', r.accepted && r.list.length === 2)
}

// 2) sans contact (v1) : dédoublonnage par code
{
  const { R } = loadRanking()
  let r = R.add([], e('', 100, 1, 'CODE-A'))
  r = R.add(r.list, e('', 100, 1, 'CODE-A'))
  check('même code rescanné : une seule entrée', r.list.length === 1)
  r = R.add(r.list, e('', 80, 2, 'CODE-B'))
  check('code anonyme distinct : conservé', r.accepted && r.list.length === 2)
}

// 3) tri
{
  const { R } = loadRanking()
  const l = R.sort([e('a', 100, 20), e('b', 300, 5), e('c', 100, 10)])
  check('tri score décroissant', l[0].contact === 'b' && l[1].contact === 'c' && l[2].contact === 'a')
}

// 4) merge/import
{
  const { R } = loadRanking()
  const cur = R.add(R.add([], e('alice', 100, 1)).list, e('bob', 50, 2)).list
  const imp = [e('alice', 500, 3), e('carl', 70, 4), e('', 90, 5, 'CODE-A')]
  const m = R.merge(cur, imp)
  check('merge : 4 entrées (alice fusionnée, autres ajoutées)', m.length === 4)
  check('merge : alice prend le meilleur score', m.find(x => x.contact.toLowerCase() === 'alice').score === 500)
  const m2 = R.merge(m, imp)
  check('merge : idempotent', m2.length === 4)
}

// 5) load/save
{
  const store = {}
  const { R } = loadRanking(store)
  check('load sans stockage : liste vide', R.load().length === 0)
  R.save(R.add([], e('alice', 100, 1)).list)
  check('save puis load : round-trip', R.load().length === 1 && R.load()[0].contact === 'alice')
  store['slime_ranking_v1'] = '{corrompu'
  check('stockage corrompu : liste vide (pas de crash)', R.load().length === 0)
}

// 6) stats anti-triche optionnelles (v3 : theo/patterns)
{
  const { R } = loadRanking()
  const withStats = Object.assign(e('dave', 300, 6), { theo: 900, patterns: 31 })
  let r = R.add([], withStats)
  check('entrée avec stats : acceptée', r.accepted)
  check('entrée avec stats : theo + patterns stockés', r.list[0].theo === 900 && r.list[0].patterns === 31)
  // meilleur score suivant sans stats : les champs repartent à zéro, pas de crash
  r = R.add(r.list, Object.assign(e('dave', 400, 7), { theo: 1100, patterns: 40 }))
  check('remplacement : nouvelles stats prises', r.list[0].theo === 1100 && r.list[0].patterns === 40)
  const plain = R.add(R.add([], e('erin', 50, 8)).list, e('erin', 60, 9)).list
  check('entrée sans stats : champs manquants tolérés (pas de crash)', plain.length === 1 && plain[0].score === 60)
  // merge/import : les stats survivent à l'union
  const m = R.merge(plain, [withStats])
  const dm = m.find(x => x.contact === 'dave')
  check('merge : stats conservées', !!dm && dm.theo === 900 && dm.patterns === 31)
  // entrée valide sans stats -> champs normalisés à 0 (affichage « — » côté decode)
  const norm = R.add([], e('fred', 70, 10)).list[0]
  check('normalisation : theo/patterns à 0 si absents', norm.theo === 0 && norm.patterns === 0)
}

if (fail === 0) console.log('\nRANKING OK — tous les checks passent')
else { console.error(`\n${fail} CHECK(S) EN ÉCHEC`); process.exit(1) }
