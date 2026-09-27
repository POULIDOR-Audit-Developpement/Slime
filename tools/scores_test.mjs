// Test du module Scores (server.mjs) — cœur de classement de L'Atelier des bocaux.
// Partie pure : validation des soumissions, meilleur-par-nom insensible à la
// casse (casse PRÉSERVÉE à l'affichage), paliers ouverts DÉRIVÉS des piliers
// approuvés (jamais stockés), vues publiques sans aucun score.
// Fin de fichier : branchement scores.json dans createHandler (chargement/écriture).
// Run : node tools/scores_test.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as server from '../server.mjs'

let pass = 0, fail = 0
const check = (label, ok) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label) }
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Config de test (mêmes seuils que les COULEURS par défaut du jeu).
const TIERS = [{ min: 0 }, { min: 100 }, { min: 200 }, { min: 350 }, { min: 500 }, { min: 750 }]

const Scores = server.Scores
check('Scores exporté depuis server.mjs', !!Scores)
if (!Scores) {
  console.log('\nMODULE ABSENT — implémenter Scores dans server.mjs')
  process.exit(1)
}

// ---- constantes ----
check(
  'constantes : RATE_MAX=45, RATE_MARGE=60, MAX_SCORE=100000, PAGE=10, JAR=8',
  Scores.RATE_MAX === 45 && Scores.RATE_MARGE === 60 && Scores.MAX_SCORE === 100000 && Scores.PAGE === 10 && Scores.JAR === 8
)
check('constantes aussi exportées nommées', server.RATE_MAX === 45 && server.RATE_MARGE === 60 && server.MAX_SCORE === 100000 && server.PAGE === 10 && server.JAR === 8)

// ---- newStore ----
check('newStore() -> {seq:0, entries:[]}', deepEq(Scores.newStore(), { seq: 0, entries: [] }))
check('newStore() : objet neuf à chaque appel (pas de partage)', Scores.newStore() !== Scores.newStore())

// ---- normalizeName : trim, NFC, casse préservée, espaces réduits, 1-12 car, charset ----
check("normalizeName('  Émile  ') -> 'Émile' (trim + NFC, casse préservée)", Scores.normalizeName('  Émile  ') === 'Émile')
check("normalizeName('<b>x</b>') -> '' (charset)", Scores.normalizeName('<b>x</b>') === '')
check("normalizeName('Z'.repeat(13)) -> '' (trop long)", Scores.normalizeName('Z'.repeat(13)) === '')
check("normalizeName('a  b') -> 'a b' (espaces réduits)", Scores.normalizeName('a  b') === 'a b')
check('normalizeName : NFD et NFC donnent le même nom', Scores.normalizeName('Émile'.normalize('NFD')) === Scores.normalizeName('Émile'))
check("normalizeName : charset complet (lettres accents, chiffres, -_. ')", Scores.normalizeName("Ça-và_B.2 '") === "Ça-và_B.2 '")
check('normalizeName : entrées non valides -> ""', Scores.normalizeName('') === '' && Scores.normalizeName(null) === '' && Scores.normalizeName(42) === '' && Scores.normalizeName('   ') === '')

// ---- nameKey : clé de dédoublonnage insensible à la casse ----
check("nameKey('  Émile  ') -> 'émile' (normalizeName + minuscules)", Scores.nameKey('  Émile  ') === 'émile')
check("nameKey('ÉMILE') === nameKey('émile') === nameKey('Émile')", Scores.nameKey('ÉMILE') === 'émile' && Scores.nameKey('émile') === 'émile' && Scores.nameKey('Émile') === 'émile')
check('nameKey : NFD et NFC donnent la même clé', Scores.nameKey('émile'.normalize('NFD')) === Scores.nameKey('Émile'))
check('nameKey : entrée non valide -> ""', Scores.nameKey('') === '' && Scores.nameKey(null) === '' && Scores.nameKey('<b>') === '')

// ---- tierIndex : mêmes sémantiques que SlimeColors.tierIndex ----
check(
  'tierIndex : paliers 0/100/200/350/500/750',
  Scores.tierIndex(TIERS, 0) === 0 && Scores.tierIndex(TIERS, 99) === 0 && Scores.tierIndex(TIERS, 100) === 1 &&
  Scores.tierIndex(TIERS, 200) === 2 && Scores.tierIndex(TIERS, 349) === 2 && Scores.tierIndex(TIERS, 350) === 3 &&
  Scores.tierIndex(TIERS, 500) === 4 && Scores.tierIndex(TIERS, 750) === 5 && Scores.tierIndex(TIERS, 100000) === 5
)

// ---- validateSubmission ----
{
  const r = Scores.validateSubmission({ name: '  Émile ', score: 300, playtime: 10, times: [[0, 1], [2, 9]] }, 1000)
  check('validateSubmission : corps valide -> {ok:true, sub normalisé (casse préservée)}', r.ok === true && deepEq(r.sub, { name: 'Émile', score: 300, playtime: 10, times: [[0, 1], [2, 9]] }))
  check('validateSubmission : score 0 + times [] valides', Scores.validateSubmission({ name: 'a', score: 0, playtime: 1, times: [] }, 0).ok === true)
  check('validateSubmission : score 999999 -> refusé', Scores.validateSubmission({ name: 'a', score: 999999, playtime: 99999, times: [] }, 0).ok === false)
  check('validateSubmission : score non entier -> refusé', Scores.validateSubmission({ name: 'a', score: 12.5, playtime: 9, times: [] }, 0).ok === false)
  check("validateSubmission : score '300' (chaîne) -> refusé", Scores.validateSubmission({ name: 'a', score: '300', playtime: 9, times: [] }, 0).ok === false)
  check('validateSubmission : score négatif -> refusé', Scores.validateSubmission({ name: 'a', score: -1, playtime: 9, times: [] }, 0).ok === false)
  check('validateSubmission : playtime 0 -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 0, times: [] }, 0).ok === false)
  check('validateSubmission : playtime non entier -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 1.5, times: [] }, 0).ok === false)
  check('validateSubmission : nom invalide -> refusé', Scores.validateSubmission({ name: '<b>', score: 10, playtime: 9, times: [] }, 0).ok === false)
  check('validateSubmission : corps non objet -> refusé', Scores.validateSubmission(null, 0).ok === false)
  check('validateSubmission : score 300 en 2 s -> refusé (plausibilité 2x45+60=150)', Scores.validateSubmission({ name: 'a', score: 300, playtime: 2, times: [] }, 0).ok === false)
  check('validateSubmission : limite exacte playtime*45+60 acceptée', Scores.validateSubmission({ name: 'a', score: 330, playtime: 6, times: [] }, 0).ok === true && Scores.validateSubmission({ name: 'a', score: 331, playtime: 6, times: [] }, 0).ok === false)
  check('validateSubmission : times [[1,10],[1,20]] -> refusé (tier non strict)', Scores.validateSubmission({ name: 'a', score: 10, playtime: 30, times: [[1, 10], [1, 20]] }, 0).ok === false)
  check('validateSubmission : times tier décroissant -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 30, times: [[1, 10], [0, 20]] }, 0).ok === false)
  check('validateSubmission : times sec décroissant -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 30, times: [[1, 10], [2, 5]] }, 0).ok === false)
  check('validateSubmission : deux paliers dans la même seconde -> accepté', Scores.validateSubmission({ name: 'a', score: 10, playtime: 30, times: [[1, 10], [2, 10]] }, 0).ok === true)
  check('validateSubmission : sec > playtime -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9, times: [[1, 10]] }, 0).ok === false)
  check('validateSubmission : sec négatif -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9, times: [[0, -1]] }, 0).ok === false)
  check('validateSubmission : tierIdx négatif -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9, times: [[-1, 1]] }, 0).ok === false)
  check('validateSubmission : paire incomplète -> refusée', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9, times: [[1]] }, 0).ok === false)
  check('validateSubmission : sec non entier -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9, times: [[0, 1.5]] }, 0).ok === false)
  check('validateSubmission : times absent -> refusé', Scores.validateSubmission({ name: 'a', score: 10, playtime: 9 }, 0).ok === false)
}

// ---- scénario principal : 1er pending, approbation, ouverture, pendings ----
{
  const st = Scores.newStore()
  // 1er joueur au palier 2 (score 250) : palier fermé -> pending, invisible.
  const a = Scores.ingest(st, { name: 'Alice', score: 250, playtime: 400, times: [[0, 10], [1, 60], [2, 95]] }, 'CODE-A', TIERS, 1000)
  check('ingest 1er tier 2 -> accepted, palier recalculé serveur (tier 2)', a.accepted === true && a.replaced === false && a.entry.tier === 2)
  check('ingest palier fermé -> statut pending', a.entry.status === 'pending')
  let v = Scores.publicView(st, TIERS)
  check('pending invisible : palier 2 fermé, golden vide', v.tiers[2].open === false && v.golden.length === 0)

  // Approbation admin : le palier s'ouvre (dérivé), alice apparaît avec son temps.
  check('approve(id inconnu) -> false', Scores.approve(st, 999, TIERS) === false)
  check('approve(alice) -> true', Scores.approve(st, a.entry.id, TIERS) === true)
  v = Scores.publicView(st, TIERS)
  check('approve -> paliers 0..2 ouverts, 3..5 fermés', v.tiers[0].open === true && v.tiers[1].open === true && v.tiers[2].open === true && v.tiers.slice(3).every(t => t.open === false))
  check('publicView.tiers[2].top[0] = {id, name, time:95} (casse préservée)', deepEq(v.tiers[2].top[0], { id: a.entry.id, name: 'Alice', time: 95 }))
  check('golden = [{id, name, tier}] sans aucun champ score', deepEq(v.golden, [{ id: a.entry.id, name: 'Alice', tier: 2 }]) && deepEq(Object.keys(v.golden[0]), ['id', 'name', 'tier']))
  check('top de palier sans le temps correspondant : alice time 10 au palier 0', v.tiers[0].top.length === 1 && v.tiers[0].top[0].time === 10 && v.tiers[1].top[0].time === 60)

  // 2e joueur au palier 2 pendant l'ouverture : validé d'office (sans pilier).
  const b = Scores.ingest(st, { name: 'Bob', score: 260, playtime: 300, times: [[2, 80]] }, 'CODE-B', TIERS, 2000)
  check('ingest palier ouvert -> statut ok (non pilier)', b.accepted === true && b.entry.status === 'ok' && b.entry.approved === false)
  v = Scores.publicView(st, TIERS)
  check('2e joueur time 80 -> top[0] = lui, total = 2', v.tiers[2].top[0].name === 'Bob' && v.tiers[2].top[1].name === 'Alice' && v.tiers[2].total === 2)
  check("entrée sans temps du palier 0 : compte au total (2) mais pas au top", v.tiers[0].total === 2 && v.tiers[0].top.length === 1)

  // Palier 4 pendant que seul le palier 2 est ouvert : pending, invisible partout.
  const c = Scores.ingest(st, { name: 'Caro', score: 600, playtime: 400, times: [[2, 50], [4, 120]] }, 'CODE-C', TIERS, 3000)
  check('ingest tier 4 (palier encore fermé) -> pending', c.entry.tier === 4 && c.entry.status === 'pending')
  v = Scores.publicView(st, TIERS)
  check('pending tier 4 invisible : palier 4 fermé, pas dans le total du 2', v.tiers[4].open === false && v.tiers[4].total === 0 && v.tiers[2].total === 2 && v.golden.length === 2)

  // Suppression du pilier : le palier se referme, les validés dérivés retombent pending.
  check('remove(id inconnu) -> false', Scores.remove(st, 999, TIERS) === false)
  check('remove(alice) -> true', Scores.remove(st, a.entry.id, TIERS) === true)
  check("retombée : bob (ok dérivé) repasse pending", b.entry.status === 'pending' && c.entry.status === 'pending')
  v = Scores.publicView(st, TIERS)
  check('remove du seul pilier -> tiers[2].open=false, golden vide', v.tiers[2].open === false && v.tiers.every(t => t.open === false) && v.golden.length === 0)
}

// ---- meilleur-par-nom : clé insensible à la casse, remplacement si strictement meilleur ----
{
  const st = Scores.newStore()
  const r1 = Scores.ingest(st, { name: 'Émile', score: 300, playtime: 200, times: [[2, 100]] }, 'C1', TIERS, 1000)
  check("meilleur-par-nom : nom stocké à casse préservée ('Émile')", r1.entry.name === 'Émile')
  const r2 = Scores.ingest(st, { name: 'émile'.normalize('NFD'), score: 280, playtime: 200, times: [[2, 90]] }, 'C2', TIERS, 2000)
  check('même nom (NFD) score inférieur -> ignoré, 1 entrée', r2.accepted === false && r2.replaced === false && st.entries.length === 1 && st.entries[0].score === 300)
  const r3 = Scores.ingest(st, { name: 'émile'.normalize('NFD'), score: 350, playtime: 200, times: [[3, 150]] }, 'C3', TIERS, 3000)
  check('même nom score strictement supérieur -> remplacé, toujours 1 entrée', r3.accepted === true && r3.replaced === true && st.entries.length === 1 && r3.entry.score === 350)
  check('égalité de score -> ignorée (strictement supérieur requis)', Scores.ingest(st, { name: 'Émile', score: 350, playtime: 200, times: [] }, 'C4', TIERS, 4000).accepted === false)
  // Casse différente = même clé : 'ÉMILE' et 'émile' désignent la même entrée.
  check("'ÉMILE' score inférieur -> ignoré, toujours 1 entrée", Scores.ingest(st, { name: 'ÉMILE', score: 200, playtime: 200, times: [] }, 'C5', TIERS, 5000).accepted === false && st.entries.length === 1)
  const r6 = Scores.ingest(st, { name: 'ÉMILE', score: 400, playtime: 200, times: [[3, 140]] }, 'C6', TIERS, 6000)
  check("'ÉMILE' score supérieur -> meilleur-par-nom s'applique (remplacé, 1 entrée, nom affiché 'ÉMILE')", r6.accepted === true && r6.replaced === true && st.entries.length === 1 && r6.entry.name === 'ÉMILE')
}

// ---- remplacement + changement de config : le palier peut redescendre ----
{
  const st = Scores.newStore()
  const TIERS_HAUTS = [{ min: 0 }, { min: 100 }, { min: 200 }, { min: 600 }, { min: 700 }, { min: 800 }]
  const x = Scores.ingest(st, { name: 'kai', score: 400, playtime: 300, times: [[3, 180]] }, 'C', TIERS, 1000)
  Scores.approve(st, x.entry.id, TIERS)
  check('config haute : paliers recalculés à la volée (3..5 refermés)', Scores.publicView(st, TIERS_HAUTS).tiers[2].open === true && Scores.publicView(st, TIERS_HAUTS).tiers[3].open === false)
  // Score amélioré mais seuils montés : la nouvelle entrée (tier 2) remplace le
  // pilier (tier 3) -> plus aucun pilier -> tout referme et repasse pending.
  const y = Scores.ingest(st, { name: 'kai', score: 450, playtime: 300, times: [[2, 160]] }, 'C', TIERS_HAUTS, 2000)
  check('remplacement : tier recalculé (redescendu) = 2', y.accepted === true && y.replaced === true && y.entry.tier === 2 && st.entries.length === 1)
  check('ouvertures recalculées après remplacement : tout fermé, entrée pending', y.entry.status === 'pending' && Scores.publicView(st, TIERS_HAUTS).tiers.every(t => t.open === false))
}

// ---- top plafonné à PAGE=10, tri temps asc puis createdAt asc, golden plafonné ----
{
  const st = Scores.newStore()
  const first = Scores.ingest(st, { name: 'opener', score: 250, playtime: 400, times: [[2, 50]] }, 'C', TIERS, 100).entry
  Scores.approve(st, first.id, TIERS)
  const mk = (name, time, createdAt, score) =>
    Scores.ingest(st, { name, score, playtime: 400, times: [[2, time]] }, 'C', TIERS, createdAt).entry
  for (let i = 0; i < 10; i++) mk('j' + i, 20 + i, 500 + i, 260 + i) // temps distincts 20..29
  mk('tie1', 15, 200, 280) // égalité de temps -> départage createdAt croissant
  mk('tie2', 15, 300, 290)
  check('13 entrées visibles au palier 2', st.entries.length === 13 && st.entries.every(e => e.status === 'ok'))
  const v = Scores.publicView(st, TIERS)
  const top = v.tiers[2].top
  check('top plafonné à PAGE=10, total = 13', top.length === Scores.PAGE && v.tiers[2].total === 13)
  check('tri temps asc puis createdAt asc : tie1 < tie2 < j0 (20) ... j7 (27)', top[0].name === 'tie1' && top[1].name === 'tie2' && top[2].name === 'j0' && top[9].name === 'j7')
  check('golden plafonné à 10, score décroissant', v.golden.length === 10 && v.golden[0].name === 'tie2' && v.golden[1].name === 'tie1' && v.golden[9].name === 'j2')
  check('aucun champ score dans golden ni top', v.golden.every(g => deepEq(Object.keys(g), ['id', 'name', 'tier'])) && top.every(t => deepEq(Object.keys(t), ['id', 'name', 'time'])))
}

// ---- store vide ----
{
  const v = Scores.publicView(Scores.newStore(), TIERS)
  check('newStore vide -> publicView tout fermé, golden []', deepEq(v, { golden: [], tiers: TIERS.map((_, i) => ({ index: i, open: false, total: 0, top: [] })) }))
}

// ---- branchement handler : chargement/sauvegarde de scores.json ----
{
  const dirs = []
  try {
    // Fichier absent -> store vierge + création du fichier (pattern loadPool).
    const d1 = mkdtempSync(path.join(tmpdir(), 'slime-scores-t1-')); dirs.push(d1)
    const h1 = await server.createHandler({ dataDir: d1, writeKey: 'k' })
    check('handler : scores.json absent -> newStore chargé', deepEq(h1.scores, { seq: 0, entries: [] }))
    check('handler : fichier scores.json créé au démarrage', existsSync(path.join(d1, 'scores.json')) && deepEq(JSON.parse(readFileSync(path.join(d1, 'scores.json'), 'utf8')), { seq: 0, entries: [] }))

    // Fichier existant -> entrées chargées, ouverture RECALCULÉE depuis les piliers
    // (le statut stocké, volontairement périmé, doit être ignoré).
    const d2 = mkdtempSync(path.join(tmpdir(), 'slime-scores-t2-')); dirs.push(d2)
    writeFileSync(path.join(d2, 'scores.json'), JSON.stringify({
      seq: 1,
      entries: [{ id: 1, name: 'alice', score: 250, tier: 9, times: [[2, 95]], code: 'C', approved: true, status: 'pending', createdAt: 5 }]
    }))
    const h2 = await server.createHandler({ dataDir: d2, writeKey: 'k' })
    const v2 = Scores.publicView(h2.scores, TIERS)
    check('handler : scores.json chargé (1 entrée)', h2.scores.seq === 1 && h2.scores.entries.length === 1)
    check('redémarrage : palier ouvert recalculé depuis approved (champs stockés ignorés)', v2.tiers[2].open === true && v2.tiers[2].top[0].name === 'alice' && v2.tiers[3].open === false && v2.tiers[2].top[0].time === 95)

    // Fichier corrompu -> store vierge (pas de crash au démarrage).
    const d3 = mkdtempSync(path.join(tmpdir(), 'slime-scores-t3-')); dirs.push(d3)
    writeFileSync(path.join(d3, 'scores.json'), '{pas du json')
    const h3 = await server.createHandler({ dataDir: d3, writeKey: 'k' })
    check('handler : scores.json corrompu -> newStore', deepEq(h3.scores, { seq: 0, entries: [] }))
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
}

console.log(fail === 0 ? '\nSCORES OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
