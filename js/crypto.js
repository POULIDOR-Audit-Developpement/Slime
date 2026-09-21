const Crypto = (() => {
  const SECRET = 'S1!m3~Vault#K7-2026'

  function sha256Digest(msg) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
    const rrot = (v, n) => (v >>> n) | (v << (32 - n))
    const l = msg.length
    const words = []
    for (let i = 0; i < l; i++) words[i >> 2] = (words[i >> 2] || 0) | (msg.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8)
    words[l >> 2] = (words[l >> 2] || 0) | (0x80 << (24 - (l % 4) * 8))
    const nBlocks = Math.ceil((l + 9) / 64)
    words[nBlocks * 16 - 1] = (words[nBlocks * 16 - 1] || 0) | (l * 8)
    for (let b = 0; b < nBlocks; b++) {
      const w = []
      for (let j = 0; j < 16; j++) w[j] = words[b * 16 + j] || 0
      for (let j = 16; j < 64; j++) {
        const s0 = rrot(w[j - 15], 7) ^ rrot(w[j - 15], 18) ^ (w[j - 15] >>> 3)
        const s1 = rrot(w[j - 2], 17) ^ rrot(w[j - 2], 19) ^ (w[j - 2] >>> 10)
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0
      }
      let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
      for (let j = 0; j < 64; j++) {
        const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)
        const ch = (e & f) ^ (~e & g)
        const t1 = (h + S1 + ch + K[j] + w[j]) | 0
        const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)
        const maj = (a & bb) ^ (a & c) ^ (bb & c)
        const t2 = (S0 + maj) | 0
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0
    }
    return H
  }

  function toHex(words) {
    let hex = ''
    for (let i = 0; i < words.length; i++) hex += ((words[i] >>> 0).toString(16)).padStart(8, '0')
    return hex
  }

  function sha256Hex(msg) {
    return toHex(sha256Digest(msg))
  }

  function hmacHex(key, msg) {
    let o = '', i = ''
    for (let n = 0; n < 64; n++) {
      const c = n < key.length ? key.charCodeAt(n) & 0xff : 0
      o += String.fromCharCode(c ^ 0x5c)
      i += String.fromCharCode(c ^ 0x36)
    }
    const inner = sha256Digest(i + msg)
    let innerStr = ''
    for (let n = 0; n < inner.length; n++) {
      innerStr += String.fromCharCode((inner[n] >>> 24) & 0xff, (inner[n] >>> 16) & 0xff, (inner[n] >>> 8) & 0xff, inner[n] & 0xff)
    }
    return sha256Hex(o + innerStr)
  }

  function b64url(s) {
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function makeCode(score, elapsed) {
    const t = Math.max(0, Math.floor(elapsed || 0))
    const body = b64url(score + '.' + t + '.' + Date.now())
    return body + '.' + hmacHex(SECRET, body).slice(0, 32)
  }

  function verifyCode(code, secret) {
    const idx = code.lastIndexOf('.')
    if (idx < 1) return null
    const body = code.slice(0, idx)
    const sig = code.slice(idx + 1)
    if (hmacHex(secret || SECRET, body).slice(0, 32) !== sig.trim()) return null
    try {
      const payload = atob(body.replace(/-/g, '+').replace(/_/g, '/'))
      const parts = payload.split('.')
      if (parts.length < 2) return null
      const out = { score: parseInt(parts[0], 10), date: new Date(parseInt(parts[parts.length - 1], 10)) }
      if (parts.length >= 3) out.elapsed = parseInt(parts[1], 10)
      return out
    } catch (e) {
      return null
    }
  }

  return { SECRET, makeCode, verifyCode }
})()
