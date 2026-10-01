// Génère le pool de patterns par défaut (validé par la physique) et écrit
// js/patterns-defaults.js — un simple const JS consommé par js/patterns.js.
// Usage : node tools/gen_defaults.mjs [perTier] [seed]
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const physicsSrc = readFileSync(join(root, 'js', 'physics.js'), 'utf8')
const coreSrc = readFileSync(join(root, 'tools', 'gen-core.js'), 'utf8')

// Exécute physics.js + gen-core.js dans un scope commun (scripts classiques).
const factory = new Function(
  physicsSrc + '\n' + coreSrc.replace(/if \(typeof module[^]*$/, '') + '\nreturn generateDefaultPool;'
)
const generateDefaultPool = factory()

const perTier = parseInt(process.argv[2] || '4', 10)
const seed = parseInt(process.argv[3] || '20260921', 10)
const { patterns, rejected } = generateDefaultPool({ perTier, seed })

if (!patterns.length) {
  console.error('Aucun pattern généré !')
  process.exit(1)
}

// Largeur totale et stats par tier
const byTier = {}
for (const p of patterns) {
  byTier[p.difficulty] = byTier[p.difficulty] || { n: 0, plats: 0, balls: 0, gems: 0 }
  byTier[p.difficulty].n++
  byTier[p.difficulty].plats += p.platforms.length
  byTier[p.difficulty].balls += p.balls.length
  byTier[p.difficulty].gems += p.balls.filter(b => b.gem).length
}
for (const t of Object.keys(byTier).sort()) {
  const s = byTier[t]
  console.log(`tier ${t} : ${s.n} sections, ${s.plats} plateformes, ${s.balls} billes (dont ${s.gems} gemmes)`)
}
console.log(`total : ${patterns.length} sections (rejetées : ${rejected})`)

const json = JSON.stringify(patterns)
const out =
  `// SLIME — pool de patterns par défaut. GÉNÉRÉ par tools/gen_defaults.mjs (seed ${seed}, ${perTier}/tier).\n` +
  `// Ne pas éditer à la main : régénérer, ou éditer puis exporter depuis l'éditeur.\n` +
  `const SLIME_DEFAULT_POOL = '${json.replace(/'/g, "\\'")}'\n`
writeFileSync(join(root, 'js', 'patterns-defaults.js'), out)
console.log('écrit : js/patterns-defaults.js (' + Math.round(json.length / 1024) + ' Ko de données)')
