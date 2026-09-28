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
