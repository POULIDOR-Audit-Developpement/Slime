// Test du module Player (js/player.js) en Node : sanitize + stockage du pseudo.
// Harnais `new Function` (style music_test.mjs) : localStorage factice, document
// factice MINIMAL (Player ne touche le DOM qu'au chargement via window guard —
// ensureModal n'est PAS exécuté ici, cf. rapport T5 : la modal est testée au
// navigateur, pas en Node).
// Run : node tools/player_test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (label, ok) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label) }

// ---- harnais : charge js/player.js avec des globals factices ----
function loadPlayer() {
  const src = readFileSync(new URL('../js/player.js', import.meta.url), 'utf8')
  const store = {}
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] }
  }
  const sandbox = new Function('localStorage', 'document', 'window', 'I18N', 'return (() => {' + src + '; return Player })()')
  const Player = sandbox(ls, undefined, undefined, undefined)
  return { Player, store }
}

// ---- 1. sanitize : mêmes règles que Scores.normalizeName (server.mjs),
//      divergence assumée : le client TRONQUE à 12 au lieu de rejeter ----
{
  const { Player } = loadPlayer()
  check('Émile : accents ok, casse préservée', Player.sanitize('Émile') === 'Émile')
  check('balise HTML -> vide (charset interdit)', Player.sanitize('  <img src=x>  ') === '')
  check('insulte -> Slime', Player.sanitize('connard') === 'Slime')
  check('insulte MAJ + espaces -> Slime', Player.sanitize('  SALOPE  ') === 'Slime')
  check('insulte en milieu de nom (tronquée à 12)', Player.sanitize('super connard 2') === 'super Slime')
  check('13 caractères tronqués à 12', Player.sanitize('abcdefghijklm') === 'abcdefghijkl')
  check('espaces doubles réduits', Player.sanitize('a  b') === 'a b')
  check('non-string -> vide', Player.sanitize(null) === '' && Player.sanitize(42) === '')
  check('charset interdit -> vide', Player.sanitize('a;b') === '')
  check('ponctuation autorisée (_ . \'-)', Player.sanitize("O'Neil-2_X") === "O'Neil-2_X")
  check('vide/espaces -> vide', Player.sanitize('   ') === '')
}

// ---- 2. set/get round-trip (localStorage 'slime_player_name') ----
{
  const { Player, store } = loadPlayer()
  check('get initial : null', Player.get() === null)
  const v = Player.set('  Émile  ')
  check('set retourne la valeur nettoyée', v === 'Émile')
  check('get round-trip', Player.get() === 'Émile')
  check('stocké sous slime_player_name', store.slime_player_name === 'Émile')
  Player.set('abcdefghij')
  check('réécriture écrase l\'ancienne valeur', Player.get() === 'abcdefghij')
  const empty = Player.set('   ')
  check("set('   ') -> null", empty === null)
  check("set vide supprime la clef", !('slime_player_name' in store) && Player.get() === null)
  check('set insulte -> Slime stocké', Player.set('connard') === 'Slime' && Player.get() === 'Slime')
  check('set 13 car -> tronqué stocké', Player.set('abcdefghijklm') === 'abcdefghijkl' && store.slime_player_name === 'abcdefghijkl')
}

// ---- 3. get résiste à un stockage corrompu/manuel ----
{
  const { Player, store } = loadPlayer()
  store.slime_player_name = '<img src=x>'
  check('get : valeur invalide en stockage -> null', Player.get() === null)
  store.slime_player_name = ''
  check('get : chaîne vide -> null', Player.get() === null)
}

// ---- 4. hors navigateur : le module se charge sans exception (no-op DOM) ----
{
  let threw = false
  try { loadPlayer() } catch (e) { threw = true; console.log('   ', e.message) }
  check('chargement sans document/window/I18N : ok', !threw)
}

console.log(fail === 0 ? '\nPLAYER OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
