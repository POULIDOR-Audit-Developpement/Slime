// SLIME — i18n minimal : FR / EN / 中文, très peu de mots.
// Partagé par le jeu (canvas) et la page de présentation ([data-i18n]).
// La langue est persistée dans localStorage('slime_lang').

const I18N = (() => {
  const KEY = 'slime_lang'
  const D = {
    fr: {
      // jeu
      aim: 'Glisse pour viser, relache pour sauter',
      anywhere: 'Pose le doigt n importe ou',
      start: 'Touche pour jouer',
      over: 'PERDU !',
      record: 'RECORD !',
      replay: 'REJOUER',
      copy: 'CODE',
      copied: 'COPIE !',
      code: 'CODE DE SCORE',
      codehint: 'Montre ce code pour valider',
      time: 'TEMPS',
      rotate: 'Paysage !',
      addhome: "Ajoute a l'ecran d'accueil",
      speed: 'VITESSE',
      // page de présentation
      tagline: 'La camera accelere sans pitie. Vise, saute, accroche-toi.',
      play: 'JOUER',
      editor: 'EDITEUR',
      src: 'CODE SOURCE',
      fAim: 'Visee',
      fAimP: 'Loin = fort. Relache pour sauter.',
      fDj: 'Double saut',
      fDjP: 'Bullet time en l\'air.',
      fLedge: 'Ledge catch',
      fLedgeP: 'Agrippe in-extremis.',
      fBonus: 'Billes & bonus',
      fBonusP: 'Doree = 50 pts. Bonus = vie.',
      fDeath: 'Mort animee',
      fDeathP: 'Splat en 4 frames.',
      fDiff: 'Vie = couleur',
      fDiffP: 'Vert, orange, rouge... splat.',
      platsTitle: '6 plateformes',
      platsSub: 'Certaines aident, d\'autres trahissent.',
      pBase: 'Base', pBaseS: 'toujours la',
      pSticky: 'Collante', pStickyS: 'accroche',
      pDyn: 'Dynamique', pDynS: 'oscille',
      pCrumble: 'Friable', pCrumbleS: 's\'effrite',
      pGhost: 'Fantome', pGhostS: 'traverse',
      pBouncy: 'Rebond', pBouncyS: 'catapulte',
      speedTitle: 'La jauge ne ment pas',
      speedSub: 'Vert, orange, rouge. Jamais en descente.',
      editTitle: 'Fabrique ton enfer',
      editSub: 'L\'editeur remplace le contenu du jeu.',
      ePat: 'PATTERNS',
      ePatP: 'Sauts valides en direct.',
      eVue: 'REGLAGES',
      eVueP: 'Physique et pouvoirs en sliders.',
      eLan: 'SYNC LAN',
      eLanP: 'Edite sur PC, joue sur telephone.',
      editCta: 'OUVRIR L\'EDITEUR',
      galTitle: 'Tout un slime d\'etats',
      galSub: 'Vert, orange, rouge selon ta vie.',
      foot: 'SLIME — endless runner pixel-art.'
    },
    en: {
      aim: 'Drag to aim, release to jump',
      anywhere: 'Touch anywhere',
      start: 'Tap to play',
      over: 'GAME OVER',
      record: 'NEW BEST!',
      replay: 'RETRY',
      copy: 'CODE',
      copied: 'COPIED!',
      code: 'SCORE CODE',
      codehint: 'Show this code to claim',
      time: 'TIME',
      rotate: 'Landscape!',
      addhome: 'Add to Home Screen',
      speed: 'SPEED',
      tagline: 'The camera never slows down. Aim, jump, hang on.',
      play: 'PLAY',
      editor: 'EDITOR',
      src: 'SOURCE CODE',
      fAim: 'Aim',
      fAimP: 'Far = strong. Release to jump.',
      fDj: 'Double jump',
      fDjP: 'Bullet time mid-air.',
      fLedge: 'Ledge catch',
      fLedgeP: 'Grabbed at the last pixel.',
      fBonus: 'Balls & bonus',
      fBonusP: 'Gold = 50 pts. Bonus = life.',
      fDeath: 'Animated death',
      fDeathP: 'Splat in 4 frames.',
      fDiff: 'Life = color',
      fDiffP: 'Green, orange, red... splat.',
      platsTitle: '6 platforms',
      platsSub: 'Some help, some betray.',
      pBase: 'Basic', pBaseS: 'always there',
      pSticky: 'Sticky', pStickyS: 'grips',
      pDyn: 'Dynamic', pDynS: 'swings',
      pCrumble: 'Crumble', pCrumbleS: 'falls apart',
      pGhost: 'Ghost', pGhostS: 'phases through',
      pBouncy: 'Bounce', pBouncyS: 'catapults',
      speedTitle: 'The gauge never lies',
      speedSub: 'Green, orange, red. Never down.',
      editTitle: 'Build your own hell',
      editSub: 'The editor replaces the game content.',
      ePat: 'PATTERNS',
      ePatP: 'Jumps validated live.',
      eVue: 'SETTINGS',
      eVueP: 'Physics & powers as sliders.',
      eLan: 'LAN SYNC',
      eLanP: 'Edit on PC, play on phone.',
      editCta: 'OPEN EDITOR',
      galTitle: 'A whole range of slime',
      galSub: 'Green, orange, red — your life.',
      foot: 'SLIME — pixel-art endless runner.'
    },
    zh: {
      aim: '拖动瞄准，松手起跳',
      anywhere: '任意位置触摸',
      start: '点击开始',
      over: '游戏结束',
      record: '新纪录！',
      replay: '重玩',
      copy: '代码',
      copied: '已复制！',
      code: '成绩代码',
      codehint: '出示此代码以认证',
      time: '时间',
      rotate: '请横屏！',
      addhome: '添加到主屏幕',
      speed: '速度',
      tagline: '镜头越跑越快。瞄准、跳跃、抓稳。',
      play: '开始游戏',
      editor: '关卡编辑器',
      src: '源代码',
      fAim: '瞄准',
      fAimP: '越远越强，松手起跳。',
      fDj: '二段跳',
      fDjP: '空中子弹时间。',
      fLedge: '绝壁抓附',
      fLedgeP: '最后一刻抓住边缘。',
      fBonus: '金球与奖励',
      fBonusP: '金球50分，奖励加命。',
      fDeath: '搞笑死亡',
      fDeathP: '四帧摔扁动画。',
      fDiff: '生命=颜色',
      fDiffP: '绿、橙、红……啪叽。',
      platsTitle: '六种平台',
      platsSub: '有的帮忙，有的背叛。',
      pBase: '基础', pBaseS: '始终可靠',
      pSticky: '黏性', pStickyS: '粘住你',
      pDyn: '动态', pDynS: '上下摆动',
      pCrumble: '易碎', pCrumbleS: '踩就碎',
      pGhost: '幽灵', pGhostS: '可穿过去',
      pBouncy: '弹跳', pBouncyS: '自动弹飞',
      speedTitle: '速度表不说谎',
      speedSub: '绿、橙、红，只升不降。',
      editTitle: '打造你的地狱',
      editSub: '编辑器可替换游戏内容。',
      ePat: '图案',
      ePatP: '实时验证跳跃。',
      eVue: '设置',
      eVueP: '物理与技能滑块调节。',
      eLan: '局域网同步',
      eLanP: '电脑上编辑，手机上玩。',
      editCta: '打开编辑器',
      galTitle: '史莱姆百态',
      galSub: '绿、橙、红，随生命变化。',
      foot: 'SLIME — 像素风跑酷。'
    }
  }
  const listeners = []
  let lang = 'fr'
  try { lang = localStorage.getItem(KEY) || 'fr' } catch (e) {}
  if (!D[lang]) lang = 'fr'

  function t(k) { return (D[lang] && D[lang][k]) || D.fr[k] || k }
  function get() { return lang }
  function langs() { return Object.keys(D) }
  function label(l) { return l === 'zh' ? '中文' : l.toUpperCase() }
  function apply() {
    // Remplace le texte des éléments [data-i18n] (page de présentation).
    try {
      if (typeof document === 'undefined' || !document.querySelectorAll) return
      const els = document.querySelectorAll('[data-i18n]')
      for (let i = 0; i < els.length; i++) {
        const v = t(els[i].getAttribute('data-i18n'))
        if (v != null) els[i].textContent = v
      }
    } catch (e) {}
    for (const f of listeners) { try { f(lang) } catch (e) {} }
  }
  function set(l) {
    if (!D[l] || l === lang) { apply(); return }
    lang = l
    try { localStorage.setItem(KEY, l) } catch (e) {}
    apply()
  }
  function onChange(f) { listeners.push(f) }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply)
    else apply()
  }

  return { t, get, set, langs, label, onChange, apply }
})()

if (typeof window !== 'undefined') window.I18N = I18N
