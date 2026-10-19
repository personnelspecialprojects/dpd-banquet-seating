/* =====================================================================
   theme.js — Look & Feel: color tones, built-in backgrounds, your own
   photo, and larger text. Saved per computer (this browser).
   ===================================================================== */
window.BQ = window.BQ || {};

BQ.TONES = [
  { k: 'navy', label: 'Gala Navy', accent: '#24406B', accent2: '#355C94', glow: '#C9A227', tint: '#EEF2F8' },
  { k: 'champagne', label: 'Champagne', accent: '#8A6A2F', accent2: '#A9843F', glow: '#E7C77E', tint: '#F8F3EA' },
  { k: 'sage', label: 'Sage', accent: '#4F7562', accent2: '#628B76', glow: '#C7A86B', tint: '#EEF4F0' },
  { k: 'blush', label: 'Blush', accent: '#A4506B', accent2: '#BD6884', glow: '#E8B9A8', tint: '#FBF0F2' },
  { k: 'lavender', label: 'Lavender', accent: '#5E4E9C', accent2: '#7563B5', glow: '#C9B6E8', tint: '#F2F0FA' },
  { k: 'ocean', label: 'Ocean', accent: '#16697A', accent2: '#21879C', glow: '#7FC8C4', tint: '#EAF5F6' },
  { k: 'evening', label: 'Evening (dark)', accent: '#C9A227', accent2: '#E0BB45', glow: '#C9A227', tint: '#121822', dark: true, ink: '#1A1405' }
];

BQ.BACKGROUNDS = [
  { k: 'plain', label: 'Plain' },
  { k: 'soft', label: 'Soft glow' },
  { k: 'watercolor', label: 'Watercolor' },
  { k: 'stars', label: 'Starlight' },
  { k: 'deco', label: 'Art deco' },
  { k: 'linen', label: 'Linen' },
  { k: 'photo', label: 'My photo' }
];

BQ.look = {
  KEY: 'bq_look_v1',
  state: { tone: 'navy', bg: 'soft', big: false, photo: '' },

  load() {
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) { /* storage unavailable */ }
    this.apply();
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); }
    catch (e) { BQ.ui && BQ.ui.toast('Couldn’t save this look on this computer (the photo may be too large).', 'bad'); }
  },
  set(patch) { Object.assign(this.state, patch); this.save(); this.apply(); },

  svgUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; },
  hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  },

  background(t, bg) {
    const A = c => this.hexA(t.accent, c), G = c => this.hexA(t.glow, c);
    const base = t.tint;
    switch (bg) {
      case 'plain': return { image: 'none', color: base };
      case 'soft': return {
        color: base,
        image: 'radial-gradient(1200px 700px at 8% -10%, ' + A(t.dark ? .35 : .16) + ', transparent 60%),' +
          'radial-gradient(900px 600px at 105% 10%, ' + G(t.dark ? .18 : .22) + ', transparent 60%),' +
          'radial-gradient(1000px 800px at 50% 120%, ' + A(t.dark ? .25 : .10) + ', transparent 60%)'
      };
      case 'watercolor': return {
        color: base,
        image: 'radial-gradient(520px 380px at 12% 18%, ' + A(.18) + ', transparent 70%),' +
          'radial-gradient(640px 420px at 82% 12%, ' + G(.28) + ', transparent 70%),' +
          'radial-gradient(560px 460px at 70% 78%, ' + A(.14) + ', transparent 70%),' +
          'radial-gradient(480px 360px at 18% 85%, ' + G(.22) + ', transparent 70%),' +
          'radial-gradient(420px 300px at 45% 45%, ' + this.hexA('#ffffff', t.dark ? .02 : .5) + ', transparent 70%)'
      };
      case 'stars': {
        const dots = [[12, 18, 1.4], [64, 9, 1], [101, 42, 1.8], [35, 66, 1.1], [150, 22, 1.2], [176, 88, 1.6], [128, 120, 1], [22, 140, 1.7], [80, 104, 1.2], [188, 160, 1.1], [58, 182, 1.5], [140, 176, 1.3]];
        const star = (x, y) => '<path d="M' + x + ' ' + (y - 6) + 'L' + (x + 1.3) + ' ' + (y - 1.3) + 'L' + (x + 6) + ' ' + y + 'L' + (x + 1.3) + ' ' + (y + 1.3) + 'L' + x + ' ' + (y + 6) + 'L' + (x - 1.3) + ' ' + (y + 1.3) + 'L' + (x - 6) + ' ' + y + 'L' + (x - 1.3) + ' ' + (y - 1.3) + 'Z" fill="' + t.glow + '" opacity=".55"/>';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' + dots.map(d => '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="' + d[2] + '" fill="' + t.glow + '" opacity=".5"/>').join('') + star(118, 70) + star(40, 110) + '</svg>';
        return {
          color: base,
          image: this.svgUrl(svg) + ', radial-gradient(1100px 700px at 50% -20%, ' + A(t.dark ? .45 : .2) + ', transparent 65%), linear-gradient(180deg, ' + A(t.dark ? .2 : .08) + ', transparent)'
        };
      }
      case 'deco': {
        const c = t.dark ? t.glow : t.accent;
        const op = t.dark ? .14 : .09;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><g fill="none" stroke="' + c + '" stroke-width="1.2" opacity="' + op * 6 + '">' +
          '<path d="M0 40a40 40 0 0 1 80 0"/><path d="M8 40a32 32 0 0 1 64 0"/><path d="M16 40a24 24 0 0 1 48 0"/><path d="M24 40a16 16 0 0 1 32 0"/>' +
          '<path d="M-40 20a40 40 0 0 1 80 0"/><path d="M40 20a40 40 0 0 1 80 0"/></g></svg>';
        return { color: base, image: this.svgUrl(svg) + ', linear-gradient(180deg, ' + G(.12) + ', transparent 40%)' };
      }
      case 'linen': {
        const c = t.dark ? '#ffffff' : t.accent;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6"><path d="M0 6L6 0M-1 1L1 -1M5 7L7 5" stroke="' + c + '" stroke-width=".6" opacity="' + (t.dark ? .06 : .08) + '"/></svg>';
        return { color: base, image: this.svgUrl(svg) + ', radial-gradient(900px 600px at 0% 0%, ' + G(.15) + ', transparent 60%)' };
      }
      case 'photo':
        if (this.state.photo) return { color: base, image: 'linear-gradient(' + (t.dark ? 'rgba(10,14,22,.55), rgba(10,14,22,.55)' : 'rgba(255,255,255,.35), rgba(255,255,255,.35)') + '), url("' + this.state.photo + '")', size: 'cover' };
        return this.background(t, 'soft');
    }
    return { image: 'none', color: base };
  },

  apply() {
    const s = this.state;
    const t = BQ.TONES.find(x => x.k === s.tone) || BQ.TONES[0];
    const root = document.documentElement;
    root.setAttribute('data-theme', t.dark ? 'dark' : 'light');
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-2', t.accent2);
    root.style.setProperty('--accent-ink', t.ink || '#ffffff');
    root.style.setProperty('--glow', t.glow);
    root.style.setProperty('--bg', t.tint);
    root.style.setProperty('--accent-soft', this.hexA(t.accent, t.dark ? .22 : .10));
    const b = this.background(t, s.bg);
    const body = document.body;
    if (!body) return;
    body.style.backgroundColor = b.color;
    body.style.backgroundImage = b.image;
    body.style.backgroundSize = b.size || 'auto';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundPosition = 'center';
    body.classList.toggle('big-text', !!s.big);
  },

  async pickPhoto() {
    const file = await BQ.imports.readFile('image/*');
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(url);
      this.set({ photo: data, bg: 'photo' });
      BQ.look.refreshDialog && BQ.look.refreshDialog();
    };
    img.onerror = () => BQ.ui.toast('That picture couldn’t be opened.', 'bad');
    img.src = url;
  },

  swatchBg(k) {
    const t = BQ.TONES.find(x => x.k === this.state.tone) || BQ.TONES[0];
    const b = this.background(t, k);
    return 'background-color:' + b.color + ';background-image:' + b.image.replace(/"/g, "'") + ';background-size:' + (k === 'photo' ? 'cover' : 'auto');
  },

  dialog() {
    const m = BQ.ui.modal({ title: '🎨 Look & Feel', wide: true, body: '<div id="lookBody"></div>', buttons: [{ label: 'Done', cls: 'primary' }], onClose: () => { BQ.look.refreshDialog = null; } });
    const draw = () => {
      const s = this.state;
      m.el.querySelector('#lookBody').innerHTML =
        '<h3>Color tone</h3><div class="swatches">' + BQ.TONES.map(t =>
          '<button class="swatch' + (s.tone === t.k ? ' on' : '') + '" data-tone="' + t.k + '"><span class="sw-dot" style="background:linear-gradient(135deg,' + t.accent + ' 0 55%,' + t.glow + ' 55% 100%)"></span>' + BQ.esc(t.label) + '</button>').join('') + '</div>' +
        '<h3>Background</h3><div class="bgs">' + BQ.BACKGROUNDS.map(b =>
          '<button class="bgpick' + (s.bg === b.k ? ' on' : '') + '" data-bg="' + b.k + '"><span class="bg-prev" style="' + this.swatchBg(b.k) + '">' + (b.k === 'photo' && !s.photo ? '📷' : '') + '</span>' + BQ.esc(b.label) + '</button>').join('') + '</div>' +
        '<div class="row gap" style="margin-top:8px"><button class="btn" id="lookPhoto">📷 ' + (s.photo ? 'Choose a different photo' : 'Use my own photo…') + '</button>' + (s.photo ? '<button class="btn ghost" id="lookNoPhoto">Remove photo</button>' : '') + '</div>' +
        '<h3>Text size</h3><div class="seg" id="lookSize"><button data-v="0" class="' + (!s.big ? 'on' : '') + '">Normal</button><button data-v="1" class="' + (s.big ? 'on' : '') + '">Larger</button></div>' +
        '<p class="muted small" style="margin-top:14px">These choices are saved on this computer only. Printouts and exports aren’t affected.</p>';
      m.el.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => { this.set({ tone: b.dataset.tone }); draw(); });
      m.el.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { if (b.dataset.bg === 'photo' && !this.state.photo) { this.pickPhoto(); return; } this.set({ bg: b.dataset.bg }); draw(); });
      m.el.querySelectorAll('#lookSize button').forEach(b => b.onclick = () => { this.set({ big: b.dataset.v === '1' }); draw(); });
      m.el.querySelector('#lookPhoto').onclick = () => this.pickPhoto();
      const np = m.el.querySelector('#lookNoPhoto');
      if (np) np.onclick = () => { this.set({ photo: '', bg: this.state.bg === 'photo' ? 'soft' : this.state.bg }); draw(); };
    };
    BQ.look.refreshDialog = draw;
    draw();
  }
};

document.addEventListener('DOMContentLoaded', () => BQ.look.load());
