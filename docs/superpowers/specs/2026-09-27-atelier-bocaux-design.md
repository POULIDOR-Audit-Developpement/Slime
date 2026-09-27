# L'Atelier des bocaux — Document de design (spec)

**Date :** 2026-09-27
**Statut :** Validé (implémentation en cours)
**Version :** 1.1
**Contexte :** giveaway pour les followers (chaîne de nœuds brodés main). Les enfants jouent ;
ce sont les parents qui « grindent » pour décrocher le 1er prix. Jeu hébergé en ligne,
compétition asynchrone sur plusieurs jours.

---

## 1. Vision

Remplacer le leaderboard chiffré par une **scène visuelle** : un atelier avec une étagère
par palier de couleur du slime et **un bocal par palier**, rempli des **slimes recolorés**
des joueurs ayant atteint ce palier. Posé sur le meuble, **un grand livre** retrace les
runs : **une double page par palier** et une **double page dorée** pour le top 10 — dont
le 1er est le **grand gagnant** du giveaway. On zoome pour lire les noms, on dézoome pour
voir l'atelier entier — et les **étagères du haut, encore vides, montrent tout ce qui
reste à atteindre**.

Règle d'or (cohérente avec le jeu) : **aucun chiffre de score nulle part** — ni affiché
dans l'atelier, ni présent dans les payloads publics. La couleur parle ; **pas de noms de
rangs** — les couleurs seules suffisent.

Le **temps d'obtention** d'un palier est la durée entre le **début du run** et l'instant
où la couleur est obtenue ; c'est le seul temps affiché (format `m:ss`).

## 2. Décisions validées en session

| Décision | Choix |
|---|---|
| Chiffres | **Aucun chiffre de score nulle part** — ni affiché, ni dans les payloads publics (le score transmis au serveur §4 reste interne) |
| Regroupement | 1 étagère par palier, **un bocal par palier**, rempli des slimes (recolorés) des joueurs ayant atteint ce palier |
| Débordement (bocaux) | **Top 8 par temps d'obtention croissant** + étiquette « +N » |
| Livre — pages de palier | **Une double page par palier** : 10 joueurs max, tri **temps d'obtention croissant**, pseudo + temps (`m:ss`) |
| Livre — page dorée | **Une double page dorée** : top 10 **par score**, **pseudo seul** (aucun chiffre) — le **grand gagnant = 1er de la page dorée** |
| Rangs | **Pas de noms de rangs** — couleurs seules |
| Modération | **Seul le 1er d'un palier attend la validation admin** ; ensuite affichage direct ; suppression a posteriori possible |
| Pseudo | Demandé à la 1re visite, mémorisé localement, modifiable à l'écran titre |
| Unicité | **Un seul score par nom exact** — le meilleur remplace l'ancien |
| Art | **Assets réels fournis** — `ASSETS/atbg.jpeg` (fond) et `ASSETS/atsprite.jpeg` (planche à découper) → PNG dans `ASSETS/atelier/` ; **fallback procédural** si une découpe est inexploitable |

## 3. Le pseudo (`js/player.js`, nouveau module)

- Stockage : `localStorage['slime_player_name']`.
- Validation : 1–12 caractères après trim ; caractères autorisés : lettres (accents ok),
  chiffres, espaces, `- _ . '`. Espaces multiples réduits à un seul.
- Filtre anti-insultes : petite liste FR/EN intégrée → remplacement par `Slime`.
- **Première visite** : modal au lancement de `play.html` — champ pseudo + bouton JOUER.
  Skippable (« Jouer sans nom ») : dans ce cas aucune soumission n'aura lieu tant que le
  joueur n'a pas de nom.
- **Filet de sécurité** : à la mort, si le score est > 0 et qu'aucun nom n'est posé, la
  modal réapparaît par-dessus l'écran de fin (avec « continuer sans nom » = pas de
  soumission, le code copiable reste disponible).
- **Écran titre** : ligne « TON NOM : X ✏️ » pour relire/modifier.
- Textes dans `js/i18n.js` (EN/FR).

## 4. Soumission d'un score

À la mort (après génération du code HMAC existant), le jeu envoie en fire-and-forget
(timeout court, échec silencieux hors ligne — le jeu reste 100 % fonctionnel sans serveur) :

```json
{ "v": 1, "name": "PapaOurson", "score": 412, "tier": 3, "playtime": 517,
  "tierTimes": [12, 47, 131], "code": "SLIME1.…" }
```

`tierTimes` = instant d'obtention de chaque palier, en secondes depuis le **début du run**
(croissants, dernier ≤ `playtime`) — c'est ce qui alimente le temps `m:ss` du livre.

Le module client (`js/scores.js`, nouveau) ne fait que POSTer ; **le serveur est
autoritaire** : il recalcule lui-même le palier depuis le score (le `tier` envoyé n'est
qu'indicatif) et revalide la signature HMAC.

- Garde-fous supplémentaires : `tierTimes` croissant et ≤ `playtime` (valeur absente =
  temps non affiché dans le livre pour ce run).
- Le `score` n'est utilisé **que côté serveur** (recalcul du palier, classement de la
  page dorée, garde-fous de plausibilité) : il n'apparaît **jamais** dans les payloads
  publics (§7).

Garde-fous serveur (`POST /api/scores`) :
- `name` valide (règles §3), `score` entier 0 ≤ s ≤ 100 000, `playtime` ≥ 1 s.
- **Plausibilité** : `score ≤ playtime × RATE_MAX + MARGE` (constantes serveur, défaut
  ~45 pts/s — calibré sur vitesse caméra max + billes dorées ; à ajuster après mesure).
- HMAC du `code` valide (même secret que `js/crypto.js`).
- **Rate limit** : 1 soumission / 30 s par IP (fenêtre glissante, constante réglable).
- **Meilleur-par-nom** : si le nom existe déjà (validé ou en attente), seule la meilleure
  score est conservée.

## 5. Modération — paliers fermés / ouverts

- Un palier est **ouvert** dès qu'au moins une entrée **validée** l'atteint (recalculé
  depuis les scores validés : palier le plus haut atteint par une entrée existante).
- Soumission pour un palier **fermé** → statut `pending` : stockée mais **invisible** pour
  les joueurs (le bocal reste vide).
- Quand l'admin valide une entrée d'un palier fermé → le palier s'ouvre → **toutes** les
  entrées en attente dont le palier reconnu devient ≤ au palier ouvert passent en validé.
- Suppression admin d'une entrée : si c'était la seule validée de son palier → le palier
  **se referme** (les pendings de ce palier redeviennent invisibles).
- L'ordre des étagères est celui de la config des paliers ; les paliers non atteints
  montrent leurs bocaux **vides**.

## 6. Conf des paliers partagée

- L'état synchronisé par `/api/state` (pool + layout, concurrence optimiste existante) est
  étendu d'un champ `tiers` (rétrocompatible : absent = `DEFAULTS` de `js/slime-colors.js`).
- L'éditeur (onglet COULEURS) pousse les paliers avec le reste ; le serveur les utilise
  pour recalculer les paliers des soumissions et les servir à l'atelier — étagères et jeu
  sont toujours d'accord.

## 7. API serveur (`server.mjs`, reste zéro dépendance)

| Endpoint | Auth | Rôle |
|---|---|---|
| `POST /api/scores` | — (rate limit IP) | Soumission (règles §4) |
| `GET /api/scores` | — | État public : paliers ouverts, entrées validées **sans aucun chiffre** (pseudo, palier, temps d'obtention `m:ss` ; pages de palier triées par temps croissant), top 10 doré **pseudo seul** déjà trié par le serveur, compteurs +N ; **jamais** les pendings, **jamais** de score |
| `GET /api/admin/pending` | `X-Slime-Key` | Entrées en attente, groupées par palier, tri score déc. |
| `POST /api/admin/validate` | `X-Slime-Key` | `{id}` → valide (ouverture de palier §5) |
| `POST /api/admin/delete` | `X-Slime-Key` | `{id}` → supprime (re-fermeture éventuelle §5) |

Stockage : `data/scores.json` (ignoré git, comme `pool.json`). Polling côté clients ~2 s
(même mécanisme que l'éditeur) : **un slime apparaît en direct dans son bocal**.

## 8. La scène de l'atelier (`atelier.html` + `js/atelier.js`)

- **Assets réels fournis par la créatrice** :
  - `ASSETS/atbg.jpeg` — la scène d'atelier **complète** (meuble + livre) : utilisée
    **directement comme fond** (`ASSETS/atelier/bg.png` ou `bg.jpg`, sans découpe).
  - `ASSETS/atsprite.jpeg` — planche à découper par `tools/extract_atelier.py`
    (convention des `tools/extract_v*.py` : régions repérées sur la planche, détourage du
    fond, **PNG transparents**) → bocaux, étagère, livre dans `ASSETS/atelier/`.
  - Fichiers attendus (détail : `ASSETS/atelier/README.md`) :
    - `bg.png` (ou `bg.jpg`) — fond atelier complet (source `atbg.jpeg`) ;
    - `jar_full.png` — bocal en verre (verre transparent, contour visible) ;
    - `jar_empty.png` — même bocal **vide et neutre, sans couleur** pour les paliers
      fermés — ne doit pas trahir la couleur à venir ;
    - `plate.png` — plaque d'étiquette sous chaque slime (**optionnel**).
  - **Fallback procédural** : si un PNG manque ou qu'une découpe est inexploitable, le
    code dessine l'élément (pattern des sprites du jeu : canvas vectoriel, recoloration
    runtime via `js/sprites.js`). L'atelier reste présentable sans aucun asset.
- **Layout** : position des étagères (et du livre) lue depuis marqueurs normalisés ou
  constantes de `js/atelier.js` ; l'art garde son ratio, seul l'agencement est calculé.
  Par bocal : **8 slots de slime** (~24 px, sprite recoloré) = **top 8 par temps
  d'obtention** du palier, + plaque pseudo tronquée à 12 car. + étiquette **« +N »** si
  plus de 8.
- **Bocaux = paliers** : **un bocal par palier**, rempli des slimes (recolorés) des
  joueurs ayant atteint ce palier. **Palier fermé** : `jar_empty`, étagère neutre — **ni
  couleur, ni seuil visible**. Palier ouvert : slimes colorés, liseré de l'étagère à la
  couleur du palier.
- **Le livre** : posé sur le meuble (visible dans le fond) ; un clic l'ouvre en grand.
  **Feuilletage** — une **double page par palier** (ordre de la config des paliers), puis
  la **double page dorée** en fin de livre. Page de palier : jusqu'à **10 joueurs**
  (pseudo + temps d'obtention `m:ss`, tri **croissant**). Page dorée : **top 10 par
  score, pseudo seul**, mise en valeur dorée — le **1er de la page dorée est le grand
  gagnant** (aucun chiffre).
- **Navigation** : molette/pince = zoom (0,5×–6×), glisser = pan, double-clic = vue
  entière, clic sur le livre = feuilleter. Zoom centré sur le pointeur, échantillonnage
  pixelisé (`image-rendering`).
- **Ton slime pulse** doucement (opacité 0,85→1, ~1 Hz) pour te retrouver — seule
  animation continue, un sprite, conforme aux règles perf (AGENTS.md).
- **Perf** : scène événementielle — slimes recolorés **une fois** en canvases offscreen au
  chargement/poll ; redessin complet uniquement sur zoom/pan/feuilletage/données
  nouvelles. Pas de recoloration en boucle (règles sprites/animation de AGENTS.md).
- **Entrées** : bouton « L'ATELIER » à l'écran titre (`index.html`) + « VOIR L'ATELIER »
  à l'écran de fin (`js/game.js`). Le bouton « COPIER LE CODE » de l'écran de fin est
  conservé (vérification hors ligne).
- **Hors ligne** : la scène s'affiche bocaux vides, livre fermé + message « L'atelier se
  remplit en ligne » (i18n).

## 9. Onglet admin ATELIER (`editor.html`)

- Nouvel onglet dans l'éditeur (déjà derrière le mot de passe / `X-Slime-Key`) :
  - liste des **en attente** groupées par palier → boutons ✅ valider / 🗑 supprimer ;
  - liste par palier ouvert avec suppression (tricheur) ;
  - sans serveur : note « atelier disponible en ligne ».

## 10. Fichiers touchés

```
server.mjs                  ← API scores + champ tiers dans /api/state
js/player.js                ← NOUVEAU : pseudo (stockage, validation, filtre, modals)
js/scores.js                ← NOUVEAU : soumission fire-and-forget
js/atelier.js               ← NOUVEAU : scène, layout, zoom/pan, polling
atelier.html                ← NOUVEAU : page hôte de l'atelier
js/game.js                  ← bouton VOIR L'ATELIER + prompt nom à la mort
index.html                  ← bouton L'ATELIER + édition du nom
editor.html / js/editor.js  ← onglet admin ATELIER
js/i18n.js                  ← nouvelles chaînes EN/FR
css/style.css               ← styles (modals, boutons, page atelier)
index.html / play.html /
editor.html / atelier.html ← bump des ?v= des scripts modifiés (cache-busting) — règle AGENTS.md
ASSETS/atelier/*.png        ← art de la créatrice (§8)
tools/extract_atelier.py    ← NOUVEAU : découpe d'ASSETS/atsprite.jpeg (convention extract_v*.py)
tools/scores_test.mjs       ← NOUVEAU : règles serveur
tools/atelier_test.mjs      ← NOUVEAU : layout de la scène
```

## 11. Sécurité — limites assumées

- Le secret HMAC vit côté client (`js/crypto.js`) : un joueur motivé peut forger un code.
  Défenses de cette itération : plausibilité score/temps, rate limit, **validation du 1er
  slime par palier par l'admin**, suppression a posteriori. Le déplacement du secret côté
  serveur est **hors périmètre** (casserait l'autonomie hors ligne du jeu).
- Noms non uniques : deux « Papa » se partagent la case du meilleur score de ce nom exact.
  Accepté pour le giveaway.

## 12. Tests (culture du repo — README « Tests de régression »)

- `tools/scores_test.mjs` : validation des soumissions (nom, plausibilité, HMAC, rate
  limit, meilleur-par-nom), ouverture/fermeture de palier, flux admin valider/supprimer,
  GET public sans pendings.
- `tools/atelier_test.mjs` : layout (slots par bocal, « +N », troncature des noms, état
  vide d'un palier fermé, recentrage zoom, feuilletage du livre : tri temps d'obtention,
  page dorée pseudo seul).
- Tests existants intacts et relancés (`smoke_test`, `game_sim`, `editor_dom_test`,
  `music_test`, `sprites_test`).

## 13. Hors périmètre (paquets futures)

**Phase 2 :** replays des runs (nécessite un RNG seedé — `js/patterns.js` utilise
`Math.random()`), ghost du record, seed du jour / streaks. Plus loin : combo billes,
near-miss, menace caméra, secret serveur, comptes/joueurs uniques.
