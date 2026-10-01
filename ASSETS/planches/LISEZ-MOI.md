# Planches d'assets (sources brutes)

Chaque planche Gemini est découpée par un outil `tools/extract_vN.py` vers
`ASSETS/sprites/vN/`, puis assemblée en sprites de jeu par
`tools/make_vN_sprites.py` (ou intégrée directement). Les sprites finaux
chargés par le jeu vivent dans `ASSETS/sprites/game/` (cf. `js/sprites.js`).

| Planche | Contenu | Découpe | Sortie |
|---|---|---|---|
| `v1-persos.jpeg` | Feuille personnage complet (idle, marche, saut, chute, collage, mort, bonus) | `tools/extract_sprites.py` | `ASSETS/sprites/sprite_*.png` |
| `v2-atouts.jpeg` | Atouts manquants (tuiles, HUD, sticky, dynamique, zone danger, décor d'arrière-plan) | `tools/extract_v2.py` | `ASSETS/sprites/v2/a_*.png` → `tools/make_v2_sprites.py` |
| `v3-actions.png` | Actions & jauges (double saut pump, bullet time, jauges HUD, poses ledge v3) | `tools/extract_v3.py` | `ASSETS/sprites/v3/*.png` → `tools/make_v3_sprites.py` |
| `v4-ledge-catch.png` | Ledge catch « remontée » 3 frames + cadrans de vitesse caméra | `tools/extract_v4.py` | `ASSETS/sprites/v4/*.png` → `tools/make_v4_sprites.py` |
| `v5-niveau1-plaines.jpg` | NIVEAU 1 : Plaines paisibles (fond + décors + plateformes herbe) | `tools/extract_v5.py` | `ASSETS/sprites/v5/*.png` |
| `v6-niveau2-magma.jpg` | NIVEAU 2 : Usine de magma (fond + roche volcanique + grilles métalliques) | `tools/extract_v5.py` | `ASSETS/sprites/v5/*.png` |
| `v7-niveau3-manoir.jpg` | NIVEAU 3 : Manoir hanté (fond + pierre de manoir + décors) | `tools/extract_v5.py` | `ASSETS/sprites/v5/*.png` |
| `v8-ledge-catch.png` | NOUVELLE animation ledge catch 3 frames (slime sur blocs verts) | `tools/extract_v6.py` | `ASSETS/sprites/v6/*.png` → `tools/make_v6_sprites.py` |
| `apercu-jeu.png` | Mockup de présentation du jeu (non découpé, référence DA) | — | — |

## Niveaux = musiques

Le jeu enchaîne 3 pistes BGM (`ASSETS/music/bgm1..3.mp3`, ~3 min chacune) ;
chaque piste est un niveau avec son habillage (`js/game.js`, `TRACK_PALETTES`,
fond `bg_level1..3`, tuiles « basic » par niveau) :

1. Niveau 1 — Plaines paisibles (herbe, ciel bleu)
2. Niveau 2 — Usine de magma (roche volcanique, braise)
3. Niveau 3 — Manoir hanté (pierre fissurée, violet)

Pour tester un niveau sans attendre la bascule audio : `play.html?track=N`
(1 = plaine, 2 = magma, 3 = manoir).
