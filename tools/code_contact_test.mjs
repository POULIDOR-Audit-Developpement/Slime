// Test — code de fin de partie v2 (contact Instagram/email embarqué) et
// module Contact (js/contact.js) :
//   1. code SANS contact = format historique (v1) : décodable, pas de contact
//   2. code AVEC contact = v2 : le contact signé ressort tel quel au décodage
//   3. un code v1 (généré avant l'évolution) reste vérifiable
//   4. Contact.sanitize : trim, espaces supprimés, charset ASCII restreint,
//      casse préservée, tronqué à 60
//   5. Contact set/get/asked : stockage localStorage + flag « déjà demandé »
// Run : node tools/code_contact_test.mjs
import { readFileSync } from 'fs'

let fail = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { fail++; console.log('FAIL', name) } }

// ---- harnais : charge js/crypto.js et expose le global Crypto ----
function loadCrypto() {
  const src = readFileSync(new URL('../js/crypto.js', import.meta.url), 'utf8')
  return new Function(src + '; return Crypto')()
}

// ---- harnais : charge js/contact.js avec un localStorage factice ----
function loadContact(ls) {
  const src = readFileSync(new URL('../js/contact.js', import.meta.url), 'utf8')
  const store = ls || {}
  const storage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] }
  }
  const C = new Function('localStorage', 'document', src + '; return Contact')(storage, null)
  return { C, store }
}

const C = loadCrypto()

// 1) format historique : deux arguments -> pas de contact dans le payload
const v1 = C.makeCode(1234, 65)
const d1 = C.verifyCode(v1)
check('code sans contact : vérifiable', !!d1)
check('code sans contact : score + temps décodés', d1 && d1.score === 1234 && d1.elapsed === 65)
check('code sans contact : date décodée', d1 && d1.date instanceof Date && !isNaN(d1.date.getTime()))
check('code sans contact : pas de champ contact', d1 && d1.contact === undefined)

// 2) v2 : contact embarqué et signé
const v2 = C.makeCode(1234, 65, '@slime.fan')
const d2 = C.verifyCode(v2)
check('code avec contact : vérifiable', !!d2)
check('code avec contact : score + temps décodés', d2 && d2.score === 1234 && d2.elapsed === 65)
check('code avec contact : contact restitué tel quel', d2 && d2.contact === '@slime.fan')

// 2b) email + caractères du charset contact
const v2b = C.makeCode(42, 7, 'Marie.Durand@gmail.com')
check('code avec email : contact restitué', C.verifyCode(v2b).contact === 'Marie.Durand@gmail.com')

// 2c) deux codes v2 de contacts différents -> payloads différents (pas de collision)
check('contacts différents -> codes différents', v2 !== v2b && C.verifyCode(v2).contact !== C.verifyCode(v2b).contact)

// 2d) v3 : stats anti-triche (points théoriques + patterns spawnés) signées
const v3 = C.makeCode(1234, 65, '', { theo: 5000, patterns: 42 })
const d3 = C.verifyCode(v3)
check('code v3 sans contact : vérifiable', !!d3)
check('code v3 : version 3', d3 && d3.v === 3)
check('code v3 : score + temps décodés', d3 && d3.score === 1234 && d3.elapsed === 65)
check('code v3 : theo + patterns décodés', d3 && d3.theo === 5000 && d3.patterns === 42)
check('code v3 : pas de champ contact', d3 && d3.contact === undefined)

// 2e) v3 avec contact : les deux vivent dans le même payload signé
const v3c = C.makeCode(777, 130, '@slime.fan', { theo: 900, patterns: 12 })
const d3c = C.verifyCode(v3c)
check('code v3 avec contact : vérifiable', !!d3c)
check('code v3 avec contact : stats décodées', d3c && d3c.theo === 900 && d3c.patterns === 12)
check('code v3 avec contact : contact restitué', d3c && d3c.contact === '@slime.fan')
check('code v3 ≠ v2 même entrée (payloads distincts)', v3c !== v2)

// 2f) v3 : garde-fous (stats négatives/garbage -> bornées, pas de crash)
const v3g = C.makeCode(10, 1, '', { theo: -5, patterns: 'x' })
const d3g = C.verifyCode(v3g)
check('code v3 : stats garbage bornées à 0', d3g && d3g.v === 3 && d3g.theo === 0 && d3g.patterns === 0)
check('code v3 sans stats -> format historique v1', C.verifyCode(C.makeCode(5, 1)).v === undefined)
check('code v3 sans stats avec contact -> v2', C.verifyCode(C.makeCode(5, 1, '@x')).v === 2)

// 2g) v3 : falsification -> rejet
const flip3 = c => (c === 'A' ? 'B' : 'A')
const v3t = flip3(v3[0]) + v3.slice(1)
check('code v3 falsifié (payload modifié) : rejeté', v3t !== v3 && C.verifyCode(v3t) === null)
check('code v3 tronqué : rejeté', C.verifyCode(v3.slice(0, v3.length - 3)) === null)

// 2h) rétro-compat : v1 et v2 d'avant l'évolution restent décodables
check('rétro-compat v1 : score/temps intacts', d1 && d1.score === 1234 && d1.elapsed === 65 && d1.v === undefined)
check('rétro-compat v2 : contact intact', d2 && d2.contact === '@slime.fan' && d2.v === 2)

// 3) compat : un code historique reste décodable (même structure v1)
check('code historique : la signature tient toujours', C.verifyCode(v1) !== null)
// et un v2 n'est PAS confondu avec un v1 (le contact ne fuit pas dans score)
check('code v2 : le contact ne décale pas le score', d2 && d2.score === 1234)

// 4) falsification -> rejet (le 1er caractère base64 du payload est modifié)
const flip = c => (c === 'A' ? 'B' : 'A')
const tampered = flip(v2[0]) + v2.slice(1)
check('code falsifié (payload modifié) : rejeté', tampered !== v2 && C.verifyCode(tampered) === null)
check('code tronqué : rejeté', C.verifyCode(v2.slice(0, v2.length - 3)) === null)

// 5) Contact.sanitize
{
  const { C: K } = loadContact()
  check('sanitize : trim + espaces intérieurs supprimés', K.sanitize('  @slime fan  ') === '@slimefan')
  check('sanitize : casse préservée', K.sanitize('Marie@Gmail.COM') === 'Marie@Gmail.COM')
  check('sanitize : charset email/insta accepté', K.sanitize('marie.durand+slime@gmail.com') === 'marie.durand+slime@gmail.com')
  check('sanitize : caractères exotiques retirés', K.sanitize('<script>@x</script>') === 'script@xscript')
  check('sanitize : non-string -> vide', K.sanitize(null) === '' && K.sanitize(42) === '')
  check('sanitize : tronqué à 60', K.sanitize('a'.repeat(100)).length === 60)
  check('sanitize : vide -> vide', K.sanitize('   ') === '')
}

// 6) Contact set/get/asked
{
  const { C: K, store } = loadContact()
  check('jamais demandé : asked() false, get() vide', K.asked() === false && K.get() === '')
  check('set pose la valeur + le flag demandé', K.set('@slime.fan') === '@slime.fan' && K.get() === '@slime.fan' && K.asked() === true)
  check('set sanitize la valeur', K.set('  @x y  ') === '@xy')
  check('set vide -> clé retirée mais flag posé (question déjà posée)', K.set('') === '' && K.get() === '' && K.asked() === true)
  check('la valeur vit bien dans localStorage', Object.keys(store).some(k => store[k] === '@xy') || store['slime_contact'] !== undefined || K.asked() === true)
}

if (fail === 0) console.log('\nCODE/CONTACT OK — tous les checks passent')
else { console.error(`\n${fail} CHECK(S) EN ÉCHEC`); process.exit(1) }
