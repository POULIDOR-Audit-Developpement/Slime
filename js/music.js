const Music = (() => {
  const BASS_Z = [0.15, 0, 55, 0.01, 0.1, 0.9, 1, 1.6]
  const LEAD_Z = [0.08, 0, 220, 0.005, 0.05, 0.4, 1, 3]

  const bar = r => [r, 0, r, 0, r, 0, r, 0, r, 0, r, 0, r, 0, r + 12, 0]
  const up = a => a.map(f => f ? f * 2 : 0)

  const L1 = [220, 0, 262, 0, 294, 0, 330, 0, 294, 0, 262, 0, 220, 0, 0, 0]
  const L2 = [262, 0, 349, 0, 330, 0, 262, 0, 220, 0, 262, 0, 294, 0, 0, 0]
  const L3 = [330, 0, 392, 0, 523, 0, 392, 0, 330, 0, 294, 0, 262, 0, 0, 0]
  const L4 = [392, 0, 294, 0, 247, 0, 294, 0, 392, 0, 494, 0, 440, 0, 0, 0]

  const BASS = [
    ...bar(55), ...bar(43.65), ...bar(65.41), ...bar(49),
    ...bar(55), ...bar(43.65), ...bar(65.41), ...bar(49)
  ]
  const LEAD = [
    ...L1, ...L2, ...L3, ...L4,
    ...up(L1), ...up(L2), ...up(L3), ...up(L4)
  ]

  let step = 0
  let t = 0
  let muted = false

  function tick(dt, tempoRatio) {
    t -= dt
    if (t < -0.5) t = 0
    const bpm = lerp(112, 150, tempoRatio)
    while (t <= 0) {
      step = (step + 1) % BASS.length
      if (BASS[step]) { const a = BASS_Z.slice(); a[2] = BASS[step]; sfx(a) }
      if (LEAD[step]) { const a = LEAD_Z.slice(); a[2] = LEAD[step]; sfx(a) }
      t += 60 / bpm / 4
    }
  }

  function toggle() {
    muted = !muted
    try { localStorage.setItem('slime_muted', muted ? '1' : '0') } catch (e) {}
    volume(muted ? 0 : 0.5)
  }

  function restore() {
    try { muted = localStorage.getItem('slime_muted') === '1' } catch (e) {}
    volume(muted ? 0 : 0.5)
  }

  return {
    tick,
    toggle,
    restore,
    get muted() { return muted }
  }
})()
