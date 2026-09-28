# vendor/ — libs embarquées (aucun CDN : le jeu tourne hors ligne)

| Fichier       | Lib                                      | Licence | Source |
|---------------|------------------------------------------|---------|--------|
| litecanvas.min.js | [Litecanvas](https://litecanvas.js.org) v0.302.0 | MIT | npm litecanvas |
| qrcode.js     | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 | MIT | npm qrcode-generator (min. jsDelivr) |
| jsQR.js       | [jsQR](https://github.com/cozmo/jsQR) 1.4.0 | Apache-2.0 | npm jsqr (min. jsDelivr) |

- `qrcode.js` : script simple qui définit le global `qrcode` (génération de la
  matrice QR — panneau de mort, canvas du jeu).
- `jsQR.js` : UMD, global `jsQR` (lecture QR depuis les pixels d'un canvas —
  scanner de `decode.html`).
