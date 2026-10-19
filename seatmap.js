/* =====================================================================
   seatmap.js — the drawn room (tables, chairs, stage…), zoom/pan,
   drag-and-drop of guests, and the Seating Map screen.
   ===================================================================== */
window.BQ = window.BQ || {};

const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------------------------------------------------------------------
   Drawing helpers
   --------------------------------------------------------------------- */
BQ.OBJ_TYPES = {
  stage:  { label: 'Stage', fill: '#1F3A5F', text: '#fff', w: 400, h: 180 },
  podium: { label: 'Podium', fill: '#455A64', text: '#fff', w: 40, h: 30 },
  screen: { label: 'Screen', fill: '#263238', text: '#fff', w: 160, h: 16 },
  av:     { label: 'AV / Tech', fill: '#6B7280', text: '#fff', w: 180, h: 80 },
  exit:   { label: 'EXIT', fill: '#2E7D32', text: '#fff', w: 70, h: 22 },
  dance:  { label: 'Dance floor', fill: '#EDE7F6', text: '#4527A0', w: 240, h: 240 },
  bar:    { label: 'Bar', fill: '#8D6E63', text: '#fff', w: 140, h: 40 },
  check:  { label: 'Check-in', fill: '#00838F', text: '#fff', w: 140, h: 40 },
  other:  { label: 'Awards table', fill: '#CFD8DC', text: '#263238', w: 90, h: 34 },
  label:  { label: 'Label', fill: 'none', text: '#455A64', w: 220, h: 40 }
};

BQ.tableRadius = t => 30 + Math.max(0, (Number(t.s) || 12) - 12) * 2;

BQ.tableSize = function (t) {
  const s = Number(t.s) || 0;
  if (t.sh === 'rect') return { w: Math.max(70, Math.ceil(s / 2) * 24), h: 34 };
  if (t.sh === 'head') return { w: Math.max(70, s * 24), h: 30 };
  const r = BQ.tableRadius(t);
  return { w: r * 2, h: r * 2 };
};

function chairSvg(color, pid, name) {
  const fill = color || '#FFFFFF';
  const stroke = color ? 'rgba(0,0,0,.35)' : '#A9B4C2';
  return '<g class="chair' + (pid ? ' taken' : '') + '"' + (pid ? ' data-pid="' + pid + '"' : '') + '>' +
    (name ? '<title>' + BQ.esc(name) + '</title>' : '') +
    '<rect x="-7" y="-6" width="14" height="11" rx="3" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>' +
    '<rect x="-7" y="-10" width="14" height="4" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/></g>';
}

BQ.tableSvg = function (t, o) {
  o = o || {};
  const n = String(t.n);
  const chairs = o.chairs || [];
  const s = Number(t.s) || 0;
  let parts = '';
  const status = o.status || 'empty';
  const ring = o.ring || null;

  if (o.zoneColor) {
    const sz = BQ.tableSize(t);
    const zr = Math.max(sz.w, sz.h) / 2 + 22;
    parts += '<circle r="' + zr + '" fill="' + o.zoneColor + '" opacity=".22"/>';
  }
  // chairs
  if (t.sh === 'rect' || t.sh === 'head') {
    const sz = BQ.tableSize(t);
    const top = t.sh === 'head' ? s : Math.ceil(s / 2);
    const bottom = s - top;
    for (let i = 0; i < top; i++) {
      const x = -sz.w / 2 + (sz.w / top) * (i + 0.5);
      const c = chairs[i];
      parts += '<g transform="translate(' + x.toFixed(1) + ',' + (-sz.h / 2 - 10) + ')">' + chairSvg(c && c.color, c && c.pid, c && c.name) + '</g>';
    }
    for (let i = 0; i < bottom; i++) {
      const x = -sz.w / 2 + (sz.w / bottom) * (i + 0.5);
      const c = chairs[top + i];
      parts += '<g transform="translate(' + x.toFixed(1) + ',' + (sz.h / 2 + 10) + ') rotate(180)">' + chairSvg(c && c.color, c && c.pid, c && c.name) + '</g>';
    }
  } else {
    const r = BQ.tableRadius(t);
    for (let i = 0; i < s; i++) {
      const a = (360 / s) * i;
      const c = chairs[i];
      parts += '<g transform="rotate(' + a.toFixed(1) + ') translate(0,' + (-(r + 11)) + ')">' + chairSvg(c && c.color, c && c.pid, c && c.name) + '</g>';
    }
  }
  // table top
  const fills = { full: '#E4F3E1', open: '#FDE8E8', empty: '#FFFFFF', hold: 'url(#bqHold)', reserved: '#FFF4D0' };
  const strokes = { full: '#2E7D32', open: '#C62828', empty: '#9AA5B4', hold: '#E08600', reserved: '#A87900' };
  const fill = o.fill || fills[status];
  const stroke = ring || strokes[status];
  const sw = status === 'empty' && !ring ? 1.5 : 3;
  if (t.sh === 'rect' || t.sh === 'head') {
    const sz = BQ.tableSize(t);
    parts += '<rect class="top" x="' + (-sz.w / 2) + '" y="' + (-sz.h / 2) + '" width="' + sz.w + '" height="' + sz.h + '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
  } else {
    parts += '<circle class="top" r="' + BQ.tableRadius(t) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
  }
  // labels
  const flip = t.rot ? ' transform="rotate(' + (-t.rot) + ')"' : '';
  parts += '<g' + flip + '>';
  parts += '<text class="tnum" y="' + (o.sub ? 1 : 7) + '" text-anchor="middle">' + BQ.esc(n) + '</text>';
  if (o.sub) parts += '<text class="tsub" y="15" text-anchor="middle">' + BQ.esc(o.sub) + '</text>';
  if (o.below) {
    const sz = BQ.tableSize(t);
    parts += '<text class="tbelow" y="' + (sz.h / 2 + 32) + '" text-anchor="middle">' + BQ.esc(o.below) + '</text>';
  }
  if (o.over) parts += '<g transform="translate(24,-24)"><circle r="11" fill="#C62828"/><text class="tbadge" y="4" text-anchor="middle">+' + o.over + '</text></g>';
  if (o.award) parts += '<g transform="translate(-26,-26)"><circle r="10" fill="#C9A227" stroke="#fff" stroke-width="1.5"/><text class="tbadge" y="4" text-anchor="middle">★</text></g>';
  parts += '</g>';
  const cls = 'tbl st-' + status + (o.selected ? ' sel' : '') + (o.hl ? ' hl' : '') + (o.dim ? ' dim' : '') + (o.suggest ? ' sug' : '');
  const tr = 'translate(' + t.x + ',' + t.y + ')' + (t.rot ? ' rotate(' + t.rot + ')' : '');
  return '<g class="' + cls + '" data-tn="' + BQ.esc(n) + '" transform="' + tr + '">' +
    (o.suggest ? '<circle class="sugring" r="' + (Math.max(BQ.tableSize(t).w, BQ.tableSize(t).h) / 2 + 20) + '"/>' : '') +
    (o.selected || o.hl ? '<circle class="selring" r="' + (Math.max(BQ.tableSize(t).w, BQ.tableSize(t).h) / 2 + 17) + '"/>' : '') +
    parts + '</g>';
};

BQ.objSvg = function (ob, selected) {
  const d = BQ.OBJ_TYPES[ob.t] || BQ.OBJ_TYPES.other;
  const label = ob.label != null && ob.label !== '' ? ob.label : d.label;
  const fs = ob.t === 'label' ? 24 : Math.max(10, Math.min(22, Math.min(ob.w / (label.length * 0.62 + 1), ob.h * 0.5)));
  let body = '';
  if (ob.t !== 'label') {
    const fill = ob.t === 'dance' ? 'url(#bqDance)' : d.fill;
    body += '<rect width="' + ob.w + '" height="' + ob.h + '" rx="' + (ob.t === 'exit' ? 4 : 6) + '" fill="' + fill + '" stroke="' + (selected ? '#F5B301' : 'rgba(0,0,0,.25)') + '" stroke-width="' + (selected ? 4 : 1) + '"/>';
  } else if (selected) {
    body += '<rect width="' + ob.w + '" height="' + ob.h + '" fill="none" stroke="#F5B301" stroke-width="3" stroke-dasharray="6 4"/>';
  }
  const vertical = ob.h > ob.w * 1.6 && ob.t !== 'label';
  body += '<text x="' + ob.w / 2 + '" y="' + ob.h / 2 + '" dy=".35em" text-anchor="middle" fill="' + d.text + '" font-size="' + (vertical ? Math.min(18, ob.w * 0.5) : fs).toFixed(1) + '" font-weight="700"' +
    (vertical ? ' transform="rotate(-90 ' + ob.w / 2 + ' ' + ob.h / 2 + ')"' : '') + '>' + BQ.esc(label) + '</text>';
  return '<g class="obj obj-' + ob.t + '" data-oid="' + ob.id + '" transform="translate(' + ob.x + ',' + ob.y + ')">' + body + '</g>';
};

BQ.svgDefs = function () {
  return '<defs>' +
    '<style>' +
    '.tnum{font:700 20px "Segoe UI",Arial,sans-serif;fill:#14213D}' +
    '.tsub{font:600 10.5px "Segoe UI",Arial,sans-serif;fill:#4A5568}' +
    '.tbelow{font:700 13px "Segoe UI",Arial,sans-serif;fill:#8A5300}' +
    '.tbadge{font:800 11px "Segoe UI",Arial,sans-serif;fill:#fff}' +
    '.obj text{font-family:"Segoe UI",Arial,sans-serif}' +
    '.room{fill:#FBFAF7;stroke:#B9C2CF;stroke-width:3}' +
    '.selring{fill:none;stroke:#1F3A5F;stroke-width:3;stroke-dasharray:7 5}' +
    '.hl .selring{stroke:#F5B301;stroke-width:5;stroke-dasharray:none}' +
    '.sugring{fill:#F5B301;opacity:.28}' +
    '.dim{opacity:.3}' +
    '</style>' +
    '<pattern id="bqHold" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#FFF3D6"/><rect width="4" height="10" fill="#FFD27A"/></pattern>' +
    '<pattern id="bqDance" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#EDE7F6"/><rect width="15" height="15" fill="#D1C4E9"/><rect x="15" y="15" width="15" height="15" fill="#D1C4E9"/></pattern>' +
    '<pattern id="bqGrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#E3E7EE" stroke-width="1"/></pattern>' +
    '</defs>';
};

/* Per-table display options for a given color mode */
BQ.tableLook = function (t, opts) {
  opts = opts || {};
  const u = BQ.tableUse(t);
  const status = BQ.tableStatus(t);
  const look = { status, chairs: BQ.chairPlan(t), over: u.over };
  look.sub = status === 'hold' ? 'HOLD' : (u.used + '/' + u.cap);
  if (status === 'reserved') {
    // every chair shows as taken by the block (not draggable: there's no guest record behind it)
    look.sub = 'RESERVED';
    const taken = look.chairs.length;
    for (let i = taken; i < u.cap; i++) look.chairs.push({ color: '#D9A520', pid: null, name: t.res || 'Reserved' });
  }
  if (t.res) look.below = t.res;
  else if (status === 'hold' && t.note) look.below = t.note;
  const zone = t.zone && (BQ.settings().zones || []).find(z => z.name === t.zone);
  if (zone && (opts.colorBy === 'zone' || opts.showZones)) look.zoneColor = zone.color;
  const mode = opts.colorBy || 'status';
  if (mode === 'pay' && u.parties.length) {
    const cls = u.parties.map(p => BQ.payClass(p.pay));
    look.ring = cls.includes('bad') ? '#C62828' : cls.includes('warn') ? '#E0A100' : cls.includes('none') ? '#9AA5B4' : '#2E7D32';
    look.fill = '#fff';
  }
  if (mode === 'checkin' && u.parties.length) {
    const arrived = u.parties.reduce((s, p) => s + Math.min(p.checkedIn || 0, p.seats || 0), 0);
    look.ring = arrived === 0 ? '#9AA5B4' : arrived >= u.used ? '#2E7D32' : '#E0A100';
    look.fill = arrived >= u.used ? '#E4F3E1' : '#fff';
    look.sub = arrived + '/' + u.used + ' here';
  }
  if (mode === 'needs' && u.parties.length) {
    const st = u.parties.map(BQ.partyIssueState);
    look.ring = st.includes('bad') ? '#C62828' : st.includes('warn') ? '#E0A100' : '#2E7D32';
    look.fill = '#fff';
  }
  if (mode === 'zone') { look.fill = '#fff'; if (zone) look.ring = zone.color; }
  if (mode === 'vip' && u.parties.length) {
    const n = u.parties.reduce((s, p) => s + BQ.vipCount(p), 0);
    look.ring = n ? '#C9A227' : '#9AA5B4'; look.fill = n ? '#FFF6D8' : '#fff';
    if (n) look.sub = '⭐' + n + ' VIP';
  }
  if (opts.awardTables && opts.awardTables.has(String(t.n))) look.award = true;
  return look;
};

/* ---------------------------------------------------------------------
   Map component (used by Seating, Room Layout, Check-in, Awards, print)
   --------------------------------------------------------------------- */
BQ.Map = function (host, opts) {
  this.host = host;
  this.opts = opts || {};
  this.vb = null;
  this.selected = new Set();
  this.selectedObj = null;
  this.hl = new Set();
  this.suggest = new Set();
  host.classList.add('map-host');
  host.innerHTML = '';
  this.svg = document.createElementNS(SVGNS, 'svg');
  this.svg.setAttribute('class', 'seatmap' + (this.opts.mode === 'edit' ? ' editing' : ''));
  this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  host.appendChild(this.svg);
  if (this.opts.mode !== 'static') this.bind();
};

BQ.Map.prototype.layout = function () { return this.opts.layout ? this.opts.layout() : (BQ.state.event && BQ.state.event.layout) || { w: 1200, h: 800, tables: [], objs: [] }; };

BQ.Map.prototype.fit = function () {
  const L = this.layout();
  this.vb = { x: -30, y: -30, w: (L.w || 1200) + 60, h: (L.h || 800) + 60 };
  this.applyVB();
};
BQ.Map.prototype.applyVB = function () {
  const v = this.vb;
  this.svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
};
BQ.Map.prototype.zoom = function (f, cx, cy) {
  const v = this.vb;
  if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
  const L = this.layout();
  const maxW = ((L.w || 1200) + 60) * 2.2, minW = 160;
  const nw = Math.max(minW, Math.min(maxW, v.w * f));
  const k = nw / v.w;
  this.vb = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: v.w * k, h: v.h * k };
  this.applyVB();
};
BQ.Map.prototype.focusTable = function (n) {
  const t = BQ.tableByNum(n) || (this.layout().tables || []).find(x => String(x.n) === String(n));
  if (!t) return;
  const w = Math.min(this.vb.w, 700), h = this.vb.h * (w / this.vb.w);
  this.vb = { x: t.x - w / 2, y: t.y - h / 2, w, h };
  this.applyVB();
};

BQ.Map.prototype.render = function () {
  const L = this.layout();
  if (!this.vb) this.fit();
  const o = this.opts;
  const look = o.look || (t => BQ.tableLook(t, { colorBy: o.colorBy ? o.colorBy() : 'status', showZones: true, awardTables: o.awardTables ? o.awardTables() : null }));
  let s = BQ.svgDefs();
  s += '<rect class="room" x="0" y="0" width="' + (L.w || 1200) + '" height="' + (L.h || 800) + '" rx="18"/>';
  if (o.mode === 'edit') s += '<rect x="0" y="0" width="' + (L.w || 1200) + '" height="' + (L.h || 800) + '" fill="url(#bqGrid)" pointer-events="none"/>';
  (L.objs || []).forEach(ob => { s += BQ.objSvg(ob, this.selectedObj === ob.id); });
  (L.tables || []).forEach(t => {
    const lk = o.mode === 'edit' ? { status: 'empty', chairs: [], sub: (t.s || 0) + ' chairs' } : look(t);
    lk.selected = this.selected.has(String(t.n));
    lk.hl = this.hl.has(String(t.n));
    lk.suggest = this.suggest.has(String(t.n));
    lk.dim = this.hl.size > 0 && !lk.hl && !lk.selected && !lk.suggest && o.dimOthers;
    s += BQ.tableSvg(t, lk);
  });
  this.svg.innerHTML = s;
};

BQ.Map.prototype.toSvgPoint = function (cx, cy) {
  const pt = this.svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const m = this.svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
};

BQ.Map.prototype.bind = function () {
  const svg = this.svg, self = this;
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const p = self.toSvgPoint(ev.clientX, ev.clientY);
    self.zoom(ev.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
  }, { passive: false });

  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const chairEl = ev.target.closest('[data-pid]');
    const tEl = ev.target.closest('[data-tn]');
    const oEl = ev.target.closest('[data-oid]');
    const start = { x: ev.clientX, y: ev.clientY, vb: Object.assign({}, self.vb) };
    let moved = false, mode = null;
    const editing = self.opts.mode === 'edit';
    let item = null, itemStart = null, el = null;
    if (editing && (tEl || oEl)) {
      const L = self.layout();
      if (tEl) { item = L.tables.find(t => String(t.n) === tEl.dataset.tn); el = tEl; }
      else { item = L.objs.find(x => String(x.id) === oEl.dataset.oid); el = oEl; }
      if (item) itemStart = { x: item.x, y: item.y };
    }
    const onMove = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        moved = true;
        if (!editing && chairEl && self.opts.onDragParty) {
          mode = 'party';
          cleanup();
          self.opts.onDragParty(Number(chairEl.dataset.pid), e);
          return;
        }
        mode = item ? 'move' : 'pan';
        svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
        svg.classList.add(mode === 'pan' ? 'panning' : 'moving');
      }
      const m = svg.getScreenCTM();
      const k = m ? 1 / m.a : 1;
      if (mode === 'pan') {
        self.vb.x = start.vb.x - dx * k;
        self.vb.y = start.vb.y - dy * k;
        self.applyVB();
      } else if (mode === 'move') {
        const snap = e.altKey ? 1 : 5;
        item.x = Math.round((itemStart.x + dx * k) / snap) * snap;
        item.y = Math.round((itemStart.y + dy * k) / snap) * snap;
        if (tEl) el.setAttribute('transform', 'translate(' + item.x + ',' + item.y + ')' + (item.rot ? ' rotate(' + item.rot + ')' : ''));
        else el.setAttribute('transform', 'translate(' + item.x + ',' + item.y + ')');
      }
    };
    const onUp = e => {
      cleanup();
      svg.classList.remove('panning', 'moving');
      if (mode === 'party') return;
      if (mode === 'move') { self.opts.onMoved && self.opts.onMoved(item, itemStart); return; }
      if (moved) return;
      // a click
      if (tEl && self.opts.onTableClick) self.opts.onTableClick(tEl.dataset.tn, e);
      else if (oEl && self.opts.onObjClick) self.opts.onObjClick(oEl.dataset.oid, e);
      else if (self.opts.onBackgroundClick) self.opts.onBackgroundClick(e);
    };
    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
};

/* ---------------------------------------------------------------------
   Drag-and-drop of guests (lists ⇄ map ⇄ panels). Pointer based, so it
   works the same with a mouse, touchpad, or touch screen.
   --------------------------------------------------------------------- */
BQ.drag = {
  // Call from a pointerdown handler on anything draggable.
  arm(ev, pid, onClick) {
    if (ev.button !== 0) return;
    const sx = ev.clientX, sy = ev.clientY;
    const move = e => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) { off(); BQ.drag.begin(pid, e); }
    };
    const up = () => { off(); onClick && onClick(); };
    const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  begin(pid, ev) {
    const p = BQ.partyById(pid);
    if (!p) return;
    if (p.pinned) { BQ.ui.toast('📌 ' + p.name + ' is pinned to Table ' + p.table + '. Unpin them first (open the guest).'); return; }
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = '<b>' + BQ.esc(p.name) + '</b> <span class="pill">' + p.seats + '</span><div class="drag-hint">Drop on a table</div>';
    document.body.appendChild(ghost);
    document.body.classList.add('dragging');
    let last = null;
    const place = e => { ghost.style.left = (e.clientX + 14) + 'px'; ghost.style.top = (e.clientY + 10) + 'px'; };
    const hit = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return null;
      const t = el.closest('svg.seatmap [data-tn]');
      if (t) return { type: 'table', n: t.dataset.tn, el: t };
      const d = el.closest('[data-drop]');
      if (d) return { type: d.dataset.drop, n: d.dataset.tn, el: d };
      return null;
    };
    const move = e => {
      place(e);
      const h = hit(e);
      if (last && (!h || h.el !== last.el)) last.el.classList.remove('drop-over');
      if (h) {
        h.el.classList.add('drop-over');
        let hint = 'Drop on a table';
        if (h.type === 'table') {
          const t = BQ.tableByNum(h.n);
          if (t) {
            const u = BQ.tableUse(t, p.id);
            hint = 'Table ' + t.n + ': ' + u.open + ' open' + (u.open < p.seats ? ' — not enough room' : ' ✓');
          }
        } else if (h.type === 'waiting') hint = 'Remove from table';
        ghost.querySelector('.drag-hint').textContent = hint;
      }
      last = h;
    };
    const up = e => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      ghost.remove();
      if (last) last.el.classList.remove('drop-over');
      const h = hit(e);
      if (!h) return;
      if (h.type === 'table') BQ.seatFlow(p.id, h.n);
      else if (h.type === 'waiting' && p.table) BQ.seatParty(p.id, '');
    };
    place(ev);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
};

/* Seat with friendly checks (hold tables, not enough room → offer split) */
BQ.seatFlow = async function (pid, n) {
  const p = BQ.partyById(pid), t = BQ.tableByNum(n);
  if (!p || !t) return;
  if (String(p.table) === String(n)) return;
  if (p.pinned) { BQ.ui.toast('📌 ' + p.name + ' is pinned. Unpin them first.'); return; }
  if (t.st === 'reserved') {
    const ok = await BQ.ui.confirm('Table ' + n + ' is reserved for ' + (t.res || 'a block') + '. Seat ' + p.name + ' here anyway?', 'Seat here anyway');
    if (ok) await BQ.seatParty(p.id, n);
    return;
  }
  if (t.st === 'hold') {
    const ok = await BQ.ui.confirm('Table ' + n + ' is on hold' + (t.note ? ' (“' + t.note + '”)' : '') + '. Seat ' + p.name + ' here anyway?', 'Seat here anyway');
    if (!ok) return;
  }
  const u = BQ.tableUse(t, p.id);
  if (u.open < p.seats) {
    const opts = [];
    if (u.open > 0) opts.push({ label: 'Split: ' + u.open + ' here, ' + (p.seats - u.open) + ' wait for another table', value: 'split', cls: 'primary' });
    opts.push({ label: 'Seat all ' + p.seats + ' here anyway (' + (u.used + p.seats) + ' at a ' + u.cap + '-chair table)', value: 'over' });
    opts.push({ label: 'Add chairs: make this a ' + (u.used + p.seats) + '-chair table', value: 'chairs' });
    opts.push({ label: 'Cancel', value: null });
    const choice = await BQ.ui.choose('Not enough room at Table ' + n,
      BQ.esc(p.name) + ' has <b>' + p.seats + '</b> seats, but Table ' + n + ' only has <b>' + u.open + '</b> open.', opts);
    if (!choice) return;
    if (choice === 'split') {
      // keep the original record at the new table with what fits; the rest waits
      const rest = p.seats - u.open;
      const group = p.group || ('g' + BQ.uid());
      const keep = BQ.partyChange(p, a => { a.seats = u.open; a.table = String(n); a.group = group; });
      const part = BQ.clone(p);
      delete part.id;
      Object.assign(part, { seats: rest, table: '', group, guests: [], checkedIn: 0, pinned: false });
      await BQ.commit('Split ' + p.name + ': ' + u.open + ' at Table ' + n + ', ' + rest + ' waiting', [keep, { kind: 'party', before: null, after: part }]);
      return;
    }
    if (choice === 'chairs') {
      const need = u.used + p.seats;
      await BQ.commit('Table ' + n + ' set to ' + need + ' chairs; seated ' + p.name, [
        BQ.eventChange(e => { const tt = e.layout.tables.find(x => String(x.n) === String(n)); tt.s = need; }),
        BQ.partyChange(p, a => { a.table = String(n); })
      ]);
      return;
    }
  }
  await BQ.seatParty(p.id, n);
};

/* ---------------------------------------------------------------------
   SEATING MAP SCREEN
   --------------------------------------------------------------------- */
BQ.seatView = { colorBy: 'status', showAwards: true, filter: '', panel: null, map: null };

BQ.screens = BQ.screens || {};
BQ.screens.seat = {
  title: 'Seating Map',
  render(main) {
    const V = BQ.seatView;
    main.innerHTML =
      '<div class="seat-screen">' +
      '<aside class="waitlist" data-drop="waiting">' +
      '  <div class="wl-head"><h2>Waiting for a seat</h2><div class="wl-sum" id="wlSum"></div></div>' +
      '  <div class="wl-tools"><input id="wlSearch" type="search" placeholder="Search waiting list…" value="' + BQ.esc(V.filter) + '"/>' +
      '  <button class="btn primary block" id="wlAdd">＋ Add guest or group</button></div>' +
      '  <div class="wl-list" id="wlList"></div>' +
      '  <div class="wl-drop">Drag a guest here to take them off a table</div>' +
      '</aside>' +
      '<section class="map-pane">' +
      '  <div class="map-toolbar">' +
      '    <input id="mapFind" type="search" placeholder="Find a guest or table #" list="findList"/><datalist id="findList"></datalist>' +
      '    <label class="sel">Color tables by <select id="colorBy">' +
      '      <option value="status">Seats filled</option><option value="zone">Areas / zones</option><option value="needs">Special requests</option>' +
      (BQ.config.trackPayment ? '      <option value="pay">Payment</option>' : '') + '<option value="checkin">Check-in</option><option value="vip">VIP reception</option></select></label>' +
      '    <label class="chk"><input type="checkbox" id="showAwards"' + (V.showAwards ? ' checked' : '') + '/> ★ Award recipients</label>' +
      '    <span class="grow"></span>' +
      '    <button class="btn" id="btnAuto" title="Suggest seats for everyone waiting">✨ Auto-seat…</button>' +
      '    <button class="btn" id="btnPrintMap" title="Print or save the map as PDF">🖨 Print map</button>' +
      '    <button class="btn" id="btnReserve" title="Block whole tables for a group such as FDP Sponsors">🔒 Reserve tables…</button>' +
      '    <button class="btn" id="btnGlance" title="Room totals and seating tips">ℹ️ Summary</button>' +
      '  </div>' +
      '  <div class="map-area"><div id="mapHost"></div>' +
      '    <div class="zoom-ctl"><button id="zIn" title="Zoom in">＋</button><button id="zOut" title="Zoom out">－</button><button id="zFit" title="Show whole room">⤢</button></div>' +
      '    <div class="map-legend" id="mapLegend"></div>' +
      '  </div>' +
      '</section>' +
      '<aside class="side-panel" id="sidePanel"></aside>' +
      '</div>';

    const map = new BQ.Map(document.getElementById('mapHost'), {
      mode: 'seat',
      colorBy: () => V.colorBy,
      awardTables: () => V.showAwards ? BQ.awardTableSet() : null,
      dimOthers: false,
      onTableClick: (n, e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (map.selected.has(n)) map.selected.delete(n); else map.selected.add(n);
          V.panel = map.selected.size ? { type: 'tables' } : null;
        } else {
          map.selected = new Set([n]);
          V.panel = { type: 'table', n };
        }
        map.suggest.clear(); map.hl.clear();
        this.refresh();
      },
      onBackgroundClick: () => { map.selected.clear(); map.suggest.clear(); map.hl.clear(); V.panel = null; this.refresh(); },
      onDragParty: (pid, e) => BQ.drag.begin(pid, e)
    });
    V.map = map;
    map.fit();

    const $ = id => document.getElementById(id);
    $('colorBy').value = V.colorBy;
    $('colorBy').onchange = e => { V.colorBy = e.target.value; this.refresh(); };
    $('showAwards').onchange = e => { V.showAwards = e.target.checked; this.refresh(); };
    $('wlSearch').oninput = e => { V.filter = e.target.value; this.renderWaiting(); };
    $('wlAdd').onclick = () => BQ.ui.openParty(null);
    $('zIn').onclick = () => map.zoom(1 / 1.3);
    $('zOut').onclick = () => map.zoom(1.3);
    $('zFit').onclick = () => map.fit();
    $('btnAuto').onclick = () => BQ.autoSeatDialog();
    $('btnPrintMap').onclick = () => BQ.exports.printMap();
    $('btnReserve').onclick = () => BQ.reserveDialog();
    $('btnGlance').onclick = () => { V.panel = V.panel && V.panel.type === 'overview' ? null : { type: 'overview' }; this.refresh(); };
    $('mapFind').addEventListener('change', e => this.find(e.target.value));
    $('mapFind').addEventListener('keydown', e => { if (e.key === 'Enter') this.find(e.target.value); });
    this.refresh();
  },

  find(q) {
    q = String(q || '').trim();
    if (!q) return;
    // Enter and "change" both fire for one search; run it once
    const now = Date.now();
    if (this._lastFind && this._lastFind.q === q && now - this._lastFind.t < 600) return;
    this._lastFind = { q, t: now };
    const V = BQ.seatView, map = V.map;
    const m = q.match(/^(?:table\s*)?(\S+)$/i);
    if (m && BQ.tableByNum(m[1])) {
      map.selected = new Set([String(m[1])]); V.panel = { type: 'table', n: String(m[1]) };
      map.focusTable(m[1]); this.refresh(); return;
    }
    const ql = q.toLowerCase().replace(/\s+\(table.*$/, '');
    const block = BQ.reservations().find(r => r.label.toLowerCase().indexOf(ql) >= 0);
    if (block) { map.hl = new Set(block.tables); V.panel = null; this.refresh(); BQ.ui.toast(block.label + ': Tables ' + block.tables.join(', ')); return; }
    const hit = BQ.people().find(x => x.name.toLowerCase() === ql) || BQ.people().find(x => x.name.toLowerCase().indexOf(ql) >= 0);
    if (!hit) { BQ.ui.toast('No guest or table matches “' + q + '”'); return; }
    if (hit.party.table) {
      map.selected = new Set([String(hit.party.table)]); V.panel = { type: 'table', n: String(hit.party.table), focus: hit.party.id };
      map.focusTable(hit.party.table);
    } else {
      V.panel = { type: 'party', id: hit.party.id };
    }
    this.refresh();
  },

  refresh() {
    const V = BQ.seatView;
    if (!V.map || !document.getElementById('mapHost')) return;
    // drop selections that no longer exist
    if (V.panel && V.panel.type === 'party' && !BQ.partyById(V.panel.id)) V.panel = null;
    if (V.panel && V.panel.type === 'party') {
      const p = BQ.partyById(V.panel.id);
      V.map.suggest = new Set(BQ.suggest(p, null, 5).map(s => String(s.table.n)));
    } else V.map.suggest.clear();
    V.map.render();
    this.renderWaiting();
    this.renderPanel();
    this.renderLegend();
    const dl = document.getElementById('findList');
    if (dl) dl.innerHTML = BQ.people().map(x => '<option value="' + BQ.esc(x.name) + '">' + (x.party.table ? 'Table ' + BQ.esc(x.party.table) : 'Not seated') + '</option>').join('');
  },

  renderLegend() {
    const V = BQ.seatView, el = document.getElementById('mapLegend');
    if (!el) return;
    let items = [];
    if (V.colorBy === 'status') items = [['#2E7D32', 'Full'], ['#C62828', 'Open seats'], ['#9AA5B4', 'Empty'], ['#E08600', 'On hold'], ['#A87900', 'Reserved']];
    if (V.colorBy === 'pay') items = [['#2E7D32', 'All paid/comp'], ['#E0A100', 'Pending/invoice'], ['#C62828', 'Not paid'], ['#9AA5B4', 'Not set']];
    if (V.colorBy === 'checkin') items = [['#2E7D32', 'All here'], ['#E0A100', 'Some here'], ['#9AA5B4', 'None yet']];
    if (V.colorBy === 'needs') items = [['#2E7D32', 'Requests met'], ['#E0A100', 'Reminder/waiting'], ['#C62828', 'Request not met']];
    if (V.colorBy === 'zone') items = (BQ.settings().zones || []).map(z => [z.color, z.name]);
    if (V.colorBy === 'vip') items = [['#C9A227', 'Has VIP reception guests'], ['#9AA5B4', 'None']];
    const chairs = '<span class="lg"><i class="chairdot" style="background:#1E88E5"></i>Units/orgs</span><span class="lg"><i class="chairdot" style="background:#F2B35B"></i>Guests</span><span class="lg"><i class="chairdot" style="background:#7B1FA2"></i>Host</span><span class="lg"><i class="chairdot" style="background:#00897B"></i>Volunteers</span>';
    el.innerHTML = items.map(i => '<span class="lg"><i style="border-color:' + i[0] + '"></i>' + BQ.esc(i[1]) + '</span>').join('') +
      (V.colorBy === 'zone' && !items.length ? '<span class="lg muted">No areas yet — select tables and give them an area</span>' : '') +
      '<span class="lg-sep"></span>' + chairs;
  },

  renderWaiting() {
    const V = BQ.seatView;
    const list = document.getElementById('wlList');
    if (!list) return;
    const q = V.filter.toLowerCase();
    const w = BQ.unseated().filter(p => !q || (p.name + ' ' + p.aff + ' ' + (p.guests || []).join(' ')).toLowerCase().indexOf(q) >= 0)
      .sort((a, b) => BQ.sortKey(a.name, BQ.isOrg(a)).localeCompare(BQ.sortKey(b.name, BQ.isOrg(b))));
    const all = BQ.unseated();
    document.getElementById('wlSum').textContent = all.length ? BQ.plural(all.length, 'party') .replace('partys', 'parties') + ' · ' + BQ.plural(all.reduce((s, p) => s + p.seats, 0), 'seat') : 'Everyone has a seat 🎉';
    list.innerHTML = w.map(p => BQ.partyCardHtml(p, { selected: V.panel && V.panel.type === 'party' && V.panel.id === p.id })).join('') ||
      (all.length ? '<p class="muted pad">No matches.</p>' : '<p class="muted pad">Add guests with the button above. Everyone you add starts here, then you drag them onto a table.</p>');
    list.querySelectorAll('.pcard').forEach(card => {
      const pid = Number(card.dataset.pid);
      card.addEventListener('pointerdown', ev => {
        if (ev.target.closest('button')) return;
        BQ.drag.arm(ev, pid, () => { V.panel = { type: 'party', id: pid }; V.map.selected.clear(); this.refresh(); });
      });
      const eb = card.querySelector('.edit');
      if (eb) eb.onclick = () => BQ.ui.openParty(BQ.partyById(pid));
    });
  },

  renderPanel() {
    const V = BQ.seatView, el = document.getElementById('sidePanel');
    if (!el) return;
    const P = V.panel;
    // the side panel only opens when something is selected, so the map gets the room
    el.closest('.seat-screen').classList.toggle('no-panel', !P);
    if (!P) { el.innerHTML = ''; return; }
    if (P && P.type === 'table' && BQ.tableByNum(P.n)) return BQ.tablePanel(el, BQ.tableByNum(P.n), this);
    if (P && P.type === 'tables') return BQ.multiTablePanel(el, Array.from(V.map.selected).map(BQ.tableByNum).filter(Boolean), this);
    if (P && P.type === 'party') return BQ.suggestPanel(el, BQ.partyById(P.id), this);
    const screen = this;
    // overview
    const s = BQ.stats();
    el.innerHTML = '<div class="sp-head"><h2>Room at a glance</h2><button class="x" id="spX" title="Close">✕</button></div>' +
      '<div class="glance"><div><b>' + s.seated + '</b><span>seated</span></div><div><b>' + s.waiting + '</b><span>waiting</span></div>' +
      '<div><b>' + s.open + '</b><span>open seats</span></div><div><b>' + s.full + '/' + (s.tables - s.hold) + '</b><span>tables full</span></div></div>' +
      '<div class="tips"><h3>How to seat people</h3><ol>' +
      '<li><b>Drag</b> a name from the left onto a table.</li>' +
      '<li>Or <b>click a name</b> to see the best tables for them (they glow gold).</li>' +
      '<li><b>Click a table</b> to see who is there, change chairs, or put it on hold.</li>' +
      '<li>Drag a colored chair to move that group to another table.</li>' +
      '<li><b>Shift-click</b> several tables to set an area for all of them.</li>' +
      '<li>Made a mistake? Press <b>Undo</b> at the top.</li></ol></div>';
    el.querySelector('#spX').onclick = () => { V.panel = null; screen.refresh(); };
  }
};

BQ.awardTableSet = function () {
  const set = new Set();
  BQ.state.awards.forEach(a => (a.recipients || []).forEach(r => {
    const p = r.pid && BQ.partyById(r.pid);
    if (p && p.table) set.add(String(p.table));
  }));
  return set;
};

BQ.partyCardHtml = function (p, o) {
  o = o || {};
  const ti = BQ.typeInfo(p.type);
  const needs = (p.needs || []).map(n => {
    const r = BQ.checkNeed(p, n);
    return '<span class="need n-' + r.state + '" title="' + BQ.esc(BQ.needText(n) + ' — ' + r.msg) + '">' + (BQ.NEEDS[n.type] || {}).icon + '</span>';
  }).join('');
  const pay = BQ.config.trackPayment && p.pay ? '<span class="paychip p-' + BQ.payClass(p.pay) + '">' + BQ.esc(p.pay.replace(' (no charge)', '')) + '</span>' : '';
  const group = (p.group ? '<span class="muted small" title="Part of a split party">⛓</span>' : '') + (p.vip ? ' <span class="vipchip" title="VIP reception">⭐</span>' : '');
  return '<div class="pcard' + (o.selected ? ' selected' : '') + (BQ.isOrg(p) ? ' org' : '') + '" data-pid="' + p.id + '"' + (o.color ? ' style="--pc:' + o.color + '"' : '') + '>' +
    '<div class="pc-main"><span class="pc-icon" title="' + BQ.esc(ti.label) + '">' + ti.icon + '</span>' +
    '<span class="pc-name">' + BQ.esc(p.name) + group + (p.pinned ? ' 📌' : '') + '</span>' +
    '<span class="pc-seats" title="Seats">' + p.seats + '</span></div>' +
    '<div class="pc-sub">' + (p.aff ? '<span class="muted">' + BQ.esc(p.aff) + '</span>' : '') + needs + pay +
    (o.actions ? o.actions : '<button class="edit linkbtn" title="Edit details">Edit</button>') + '</div></div>';
};

/* Right panel: one table */
BQ.tablePanel = function (el, t, screen) {
  const u = BQ.tableUse(t), st = BQ.tableStatus(t), g = BQ.state.geo;
  const zones = BQ.settings().zones || [];
  const chairs = BQ.chairPlan(t);
  const colorOf = {};
  chairs.forEach(c => { colorOf[c.pid] = c.color; });
  const statusText = { full: 'Full', open: u.open + ' open seat' + (u.open === 1 ? '' : 's'), empty: 'Empty', hold: 'On hold', reserved: 'Reserved' + (t.res ? ': ' + t.res : '') }[st];
  const where = 'Row ' + (g.rowOf[String(t.n)] || '?') + ' from the stage' + (g.edge[String(t.n)] ? ' · edge/aisle' : '') + (g.exitDist[String(t.n)] <= BQ.settings().exitSpacing ? ' · near exit' : '');
  const pct = u.cap ? Math.min(100, Math.round(u.used / u.cap * 100)) : 0;
  el.innerHTML =
    '<div class="tp-head" data-drop="table" data-tn="' + BQ.esc(t.n) + '"><h2>Table ' + BQ.esc(t.n) + '</h2><span class="stpill s-' + st + '">' + statusText + '</span></div>' +
    '<div class="muted small">' + where + (t.zone ? ' · Area: <b>' + BQ.esc(t.zone) + '</b>' : '') + '</div>' +
    '<div class="meter"><div style="width:' + pct + '%" class="' + (u.over ? 'over' : '') + '"></div></div>' +
    '<div class="meter-txt"><b>' + u.used + '</b> of <b>' + u.cap + '</b> seats filled' + (u.over ? ' — <span class="bad">' + u.over + ' too many</span>' : '') + '</div>' +
    '<div class="tp-parties">' + (u.parties.length ? u.parties.map(p => BQ.partyCardHtml(p, {
      color: colorOf[p.id], selected: BQ.seatView.panel && BQ.seatView.panel.focus === p.id,
      actions: '<button class="linkbtn edit">Edit</button><button class="linkbtn move">Move…</button><button class="linkbtn unseat">Take off table</button>'
    })).join('') : '<p class="muted">Nobody here yet.</p>') + '</div>' +
    (st !== 'hold' && st !== 'reserved' ? '<button class="btn primary block" id="tpSeat">＋ Seat someone here' + (u.open ? ' (' + u.open + ' open)' : '') + '</button>' : '') +
    '<details class="tp-settings"' + (BQ.seatView.tpOpen ? ' open' : '') + '><summary>Table settings</summary>' +
    '<div class="field"><label>Chairs at this table</label><div class="stepper"><button id="chMinus">－</button><b id="chN">' + t.s + '</b><button id="chPlus">＋</button></div></div>' +
    '<div class="field"><label>Status</label><div class="seg" id="tpSt">' +
    [['open', 'Open'], ['closed', 'Mark full'], ['hold', 'On hold'], ['reserved', 'Reserved']].map(o => '<button data-v="' + o[0] + '" class="' + ((t.st || 'open') === o[0] ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>' +
    '<div class="muted small">“Mark full” stops new seating even if chairs are empty. “On hold” saves the table (e.g. leave empty).</div></div>' +
    '<div class="field"><label>Reserved for / note (shows under the table)</label><input id="tpRes" value="' + BQ.esc(t.res || t.note || '') + '" placeholder="e.g. Volunteers, Leave empty"/></div>' +
    '<div class="field"><label>Area</label><select id="tpZone"><option value="">— none —</option>' + zones.map(z => '<option' + (t.zone === z.name ? ' selected' : '') + '>' + BQ.esc(z.name) + '</option>').join('') + '<option value="__new">＋ New area…</option></select></div>' +
    '</details>';

  el.querySelector('.tp-settings').addEventListener('toggle', e => { BQ.seatView.tpOpen = e.target.open; });
  el.querySelectorAll('.pcard').forEach(card => {
    const pid = Number(card.dataset.pid);
    card.addEventListener('pointerdown', ev => { if (!ev.target.closest('button')) BQ.drag.arm(ev, pid); });
    card.querySelector('.edit').onclick = () => BQ.ui.openParty(BQ.partyById(pid));
    card.querySelector('.unseat').onclick = () => BQ.seatParty(pid, '');
    card.querySelector('.move').onclick = () => { BQ.seatView.panel = { type: 'party', id: pid }; screen.refresh(); };
  });
  const seatBtn = el.querySelector('#tpSeat');
  if (seatBtn) seatBtn.onclick = () => BQ.pickForTable(t);
  const setT = (label, fn) => BQ.commit(label, [BQ.eventChange(e => { fn(e.layout.tables.find(x => String(x.n) === String(t.n))); })]);
  el.querySelector('#chMinus').onclick = () => { if (t.s > 1) setT('Table ' + t.n + ': ' + (t.s - 1) + ' chairs', x => { x.s = t.s - 1; }); };
  el.querySelector('#chPlus').onclick = () => setT('Table ' + t.n + ': ' + (t.s + 1) + ' chairs', x => { x.s = t.s + 1; });
  el.querySelectorAll('#tpSt button').forEach(b => b.onclick = async () => {
    if (b.dataset.v === 'reserved') {
      const label = await BQ.askReserveLabel(t.res);
      if (!label) return;
      return setT('Table ' + t.n + ' reserved for ' + label, x => { x.st = 'reserved'; x.res = label; delete x.note; });
    }
    setT('Table ' + t.n + ' set to ' + b.textContent, x => { x.st = b.dataset.v === 'open' ? '' : b.dataset.v; });
  });
  el.querySelector('#tpRes').onchange = e => setT('Table ' + t.n + ' note: ' + (e.target.value || '(cleared)'), x => { x.res = e.target.value.trim(); delete x.note; });
  el.querySelector('#tpZone').onchange = async e => {
    let v = e.target.value;
    if (v === '__new') { v = await BQ.newZone(); if (!v) { screen.refresh(); return; } }
    setT('Table ' + t.n + ' area: ' + (v || 'none'), x => { x.zone = v; });
  };
};

/* Right panel: several tables (shift-click) */
BQ.multiTablePanel = function (el, ts, screen) {
  const zones = BQ.settings().zones || [];
  const nums = ts.map(t => t.n).sort(BQ.numSort);
  el.innerHTML = '<h2>' + ts.length + ' tables selected</h2><p class="muted">Tables ' + nums.join(', ') + '</p>' +
    '<div class="field"><label>Put these tables in an area</label><select id="mtZone"><option value="">Choose…</option>' +
    zones.map(z => '<option>' + BQ.esc(z.name) + '</option>').join('') + '<option value="__none">Remove from area</option><option value="__new">＋ New area…</option></select></div>' +
    '<div class="field"><label>Status</label><div class="seg" id="mtSt"><button data-v="">Open</button><button data-v="closed">Mark full</button><button data-v="hold">On hold</button><button data-v="reserved">Reserved…</button></div></div>' +
    '<div class="field"><label>Chairs at each table</label><div class="stepper"><input id="mtChairs" type="number" min="1" max="30" placeholder="12"/><button class="btn" id="mtChairsGo">Apply</button></div></div>' +
    '<button class="btn block" id="mtClear">Clear selection</button>';
  const apply = (label, fn) => BQ.commit(label, [BQ.eventChange(e => { e.layout.tables.forEach(x => { if (nums.includes(x.n)) fn(x); }); })]);
  el.querySelector('#mtZone').onchange = async e => {
    let v = e.target.value;
    if (!v) return;
    if (v === '__new') { v = await BQ.newZone(); if (!v) return; }
    if (v === '__none') v = '';
    apply('Area “' + (v || 'none') + '” for tables ' + nums.join(', '), x => { x.zone = v; });
  };
  el.querySelectorAll('#mtSt button').forEach(b => b.onclick = async () => {
    if (b.dataset.v === 'reserved') {
      const label = await BQ.askReserveLabel();
      if (!label) return;
      return apply('Reserved tables ' + nums.join(', ') + ' for ' + label, x => { x.st = 'reserved'; x.res = label; delete x.note; });
    }
    apply(b.textContent + ': tables ' + nums.join(', '), x => { x.st = b.dataset.v; if (x.st !== 'reserved' && b.dataset.v === '') { /* keep any note */ } });
  });
  el.querySelector('#mtChairsGo').onclick = () => {
    const n = parseInt(el.querySelector('#mtChairs').value, 10);
    if (n > 0) apply(n + ' chairs at tables ' + nums.join(', '), x => { x.s = n; });
  };
  el.querySelector('#mtClear').onclick = () => { BQ.seatView.map.selected.clear(); BQ.seatView.panel = null; screen.refresh(); };
};

BQ.newZone = async function () {
  const name = await BQ.ui.prompt('Name the new area', 'e.g. Front section, Command staff, Volunteers corner');
  if (!name) return null;
  const zones = BQ.settings().zones || [];
  if (zones.some(z => z.name.toLowerCase() === name.toLowerCase())) return zones.find(z => z.name.toLowerCase() === name.toLowerCase()).name;
  const color = BQ.ZONE_COLORS[zones.length % BQ.ZONE_COLORS.length];
  await BQ.commit('New area “' + name + '”', [BQ.eventChange(e => { e.settings = Object.assign({}, e.settings); e.settings.zones = zones.concat([{ name, color }]); })]);
  return name;
};

/* Right panel: best tables for one guest */
BQ.suggestPanel = function (el, p, screen) {
  if (!p) { el.innerHTML = ''; return; }
  const sug = BQ.suggest(p, null, 6);
  el.innerHTML = '<div class="sp-head"><h2>' + BQ.esc(p.name) + '</h2><span class="pc-seats">' + p.seats + '</span></div>' +
    '<div class="muted small">' + BQ.esc(BQ.typeInfo(p.type).label) + (p.aff ? ' · ' + BQ.esc(p.aff) : '') + (p.table ? ' · now at <b>Table ' + BQ.esc(p.table) + '</b>' : ' · waiting for a seat') + '</div>' +
    ((p.needs || []).length ? '<ul class="needlist">' + p.needs.map(n => { const r = BQ.checkNeed(p, n); return '<li class="n-' + r.state + '">' + BQ.esc(BQ.needText(n)) + '</li>'; }).join('') + '</ul>' : '') +
    '<h3>Best tables' + (p.table ? ' to move to' : '') + '</h3>' +
    (sug.length ? sug.map(s => '<div class="sug" data-tn="' + BQ.esc(s.table.n) + '"><div class="sug-top"><b>Table ' + BQ.esc(s.table.n) + '</b><span class="muted">' + s.open + ' open</span>' +
      '<button class="btn primary sm">Seat here</button></div>' +
      (s.reasons.length || s.problems.length ? '<div class="small">' + s.reasons.map(r => '<div class="ok">' + BQ.esc(r) + '</div>').join('') + s.problems.map(r => '<div class="bad">' + BQ.esc(r) + '</div>').join('') + '</div>' : '') +
      '</div>').join('') : '<p class="muted">No table has ' + p.seats + ' open seats together. You can split this party: drag them to a table with some room and choose “Split”.</p>') +
    '<div class="row gap"><button class="btn" id="spEdit">Edit details</button>' + (p.table ? '<button class="btn" id="spUnseat">Take off table</button>' : '') + '<button class="btn" id="spClose">Close</button></div>';
  el.querySelectorAll('.sug').forEach(d => {
    d.querySelector('button').onclick = () => { BQ.seatView.panel = { type: 'table', n: d.dataset.tn }; BQ.seatView.map.selected = new Set([d.dataset.tn]); BQ.seatFlow(p.id, d.dataset.tn); };
    d.onmouseenter = () => { BQ.seatView.map.hl = new Set([d.dataset.tn]); BQ.seatView.map.render(); };
    d.onmouseleave = () => { BQ.seatView.map.hl.clear(); BQ.seatView.map.render(); };
  });
  el.querySelector('#spEdit').onclick = () => BQ.ui.openParty(p);
  el.querySelector('#spClose').onclick = () => { BQ.seatView.panel = null; screen.refresh(); };
  const un = el.querySelector('#spUnseat');
  if (un) un.onclick = () => BQ.seatParty(p.id, '');
};

/* "Seat someone here" picker */
BQ.pickForTable = function (t) {
  const u = BQ.tableUse(t);
  const waiting = BQ.unseated().slice().sort((a, b) => {
    const fa = a.seats <= u.open ? 0 : 1, fb = b.seats <= u.open ? 0 : 1;
    return fa - fb || Math.abs(u.open - a.seats) - Math.abs(u.open - b.seats) || a.name.localeCompare(b.name);
  });
  const body = '<input id="pkSearch" type="search" placeholder="Type a name…" class="block"/>' +
    '<div class="muted small" style="margin:6px 0">Table ' + BQ.esc(t.n) + ' has <b>' + u.open + '</b> open seat' + (u.open === 1 ? '' : 's') + '. Best fits are listed first.</div>' +
    '<div class="pick-list" id="pkList"></div>';
  const m = BQ.ui.modal({ title: 'Seat someone at Table ' + t.n, body, buttons: [{ label: 'Close' }], wide: false });
  const draw = q => {
    q = (q || '').toLowerCase();
    m.el.querySelector('#pkList').innerHTML = waiting.filter(p => !q || (p.name + ' ' + p.aff).toLowerCase().indexOf(q) >= 0).map(p =>
      '<button class="pick' + (p.seats > u.open ? ' toobig' : '') + '" data-pid="' + p.id + '"><span>' + BQ.typeInfo(p.type).icon + ' ' + BQ.esc(p.name) +
      (p.aff ? ' <span class="muted">· ' + BQ.esc(p.aff) + '</span>' : '') + '</span><b>' + p.seats + '</b></button>').join('') || '<p class="muted">Nobody is waiting.</p>';
    m.el.querySelectorAll('.pick').forEach(b => b.onclick = () => { m.close(); BQ.seatFlow(Number(b.dataset.pid), t.n); });
  };
  m.el.querySelector('#pkSearch').oninput = e => draw(e.target.value);
  draw('');
  setTimeout(() => m.el.querySelector('#pkSearch').focus(), 50);
};

/* Auto-seat preview → apply */
BQ.autoSeatDialog = function () {
  const { plan, stuck } = BQ.planAutoSeat();
  if (!plan.length && !stuck.length) { BQ.ui.toast('Everyone already has a seat.'); return; }
  const rows = plan.map((x, i) => '<tr><td><input type="checkbox" data-i="' + i + '" checked/></td><td>' + BQ.esc(x.party.name) + '</td><td class="c">' + x.party.seats + '</td><td class="c"><b>' + BQ.esc(x.table) + '</b></td><td class="small">' +
    x.reasons.map(r => '<span class="ok">' + BQ.esc(r) + '</span>').join('<br>') + (x.problems.length ? '<br>' + x.problems.map(r => '<span class="bad">' + BQ.esc(r) + '</span>').join('<br>') : '') + '</td></tr>').join('');
  const body = '<p>Here is a suggestion for the <b>' + plan.length + '</b> waiting part' + (plan.length === 1 ? 'y' : 'ies') + '. Nothing changes until you press <b>Seat them</b>, and you can Undo afterwards.</p>' +
    (stuck.length ? '<p class="bad">Couldn’t find room for: ' + stuck.map(p => BQ.esc(p.name) + ' (' + p.seats + ')').join(', ') + '. Try splitting them or adding chairs.</p>' : '') +
    '<div class="scroll-box"><table class="grid"><thead><tr><th></th><th>Guest / group</th><th>Seats</th><th>Table</th><th>Why</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  const m = BQ.ui.modal({
    title: '✨ Auto-seat suggestion', body, wide: true,
    buttons: [{ label: 'Cancel' }, {
      label: 'Seat them', cls: 'primary', onClick: async () => {
        const picks = Array.from(m.el.querySelectorAll('input[data-i]:checked')).map(c => plan[Number(c.dataset.i)]);
        if (!picks.length) return;
        await BQ.commit('Auto-seated ' + picks.length + ' parties', picks.map(x => BQ.partyChange(x.party, a => { a.table = x.table; })));
        BQ.ui.toast('Seated ' + picks.length + ' parties. Press Undo to reverse.', 'ok');
      }
    }]
  });
};

/* ---------------------------------------------------------------------
   Reserve whole tables for a block (e.g. FDP Sponsors)
   --------------------------------------------------------------------- */
BQ.askReserveLabel = function (current) {
  return new Promise(res => {
    const labels = Array.from(new Set(BQ.reservations().map(r => r.label).concat(['FDP Sponsors'])));
    let done = false;
    const m = BQ.ui.modal({
      title: 'Reserved for…',
      body: '<input id="rlName" class="block" list="rlList" value="' + BQ.esc(current || labels[0]) + '"/><datalist id="rlList">' + labels.map(l => '<option value="' + BQ.esc(l) + '">').join('') + '</datalist>' +
        '<p class="muted small">The whole table is blocked and every chair counts as taken.</p>',
      buttons: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: 'Reserve', cls: 'primary', onClick: () => { done = true; res(m.el.querySelector('#rlName').value.trim() || null); } }],
      onClose: () => { if (!done) res(null); }
    });
    setTimeout(() => m.el.querySelector('#rlName').select(), 30);
  });
};

BQ.reserveDialog = function () {
  const blocks = BQ.reservations();
  const labels = Array.from(new Set(blocks.map(r => r.label).concat(['FDP Sponsors'])));
  const body =
    '<p>Block whole tables for a group, like <b>FDP Sponsors</b>. Reserved tables can’t be seated by accident, every chair counts as taken, and they print with the group’s name.</p>' +
    '<div class="field"><label>Reserved for</label><input id="rvLabel" list="rvList" value="' + BQ.esc(labels[0]) + '"/><datalist id="rvList">' + labels.map(l => '<option value="' + BQ.esc(l) + '">').join('') + '</datalist></div>' +
    '<div class="field"><label>Table numbers <span class="muted">(commas and ranges work: 3, 5, 9-12, 40)</span></label><input id="rvTables" placeholder="e.g. 3, 5, 9-12"/></div>' +
    '<div id="rvPrev" class="small"></div>' +
    (blocks.length ? '<h3>Reserved now</h3>' + blocks.map(b => '<div class="resrow"><b>' + BQ.esc(b.label) + '</b><span>Tables ' + b.tables.join(', ') + ' · ' + b.tables.length + ' tables, ' + b.seats + ' seats</span>' +
      '<button class="btn sm" data-release="' + BQ.esc(b.label) + '">Release all</button></div>').join('') : '');
  const m = BQ.ui.modal({
    title: '🔒 Reserve tables', body, wide: true,
    buttons: [{ label: 'Close' }, {
      label: 'Reserve these tables', cls: 'primary', onClick: async () => {
        const label = m.el.querySelector('#rvLabel').value.trim();
        const nums = BQ.parseTableList(m.el.querySelector('#rvTables').value).filter(n => BQ.tableByNum(n));
        if (!label) { BQ.ui.toast('Type who the tables are reserved for.', 'bad'); return false; }
        if (!nums.length) { BQ.ui.toast('Type at least one table number that’s in the room.', 'bad'); return false; }
        const ok = await BQ.commit('Reserved ' + BQ.plural(nums.length, 'table') + ' for ' + label + ' (' + nums.join(', ') + ')',
          [BQ.eventChange(e => e.layout.tables.forEach(t => { if (nums.includes(String(t.n))) { t.st = 'reserved'; t.res = label; delete t.note; } }))]);
        if (ok) BQ.ui.toast('Reserved ' + BQ.plural(nums.length, 'table') + ' for ' + label + ' ✓', 'ok');
      }
    }]
  });
  const prev = () => {
    const raw = BQ.parseTableList(m.el.querySelector('#rvTables').value);
    const ok = raw.filter(n => BQ.tableByNum(n)), bad = raw.filter(n => !BQ.tableByNum(n));
    const withGuests = ok.filter(n => BQ.partiesAt(n).length);
    const other = ok.filter(n => { const t = BQ.tableByNum(n); return t.st === 'reserved' && t.res !== m.el.querySelector('#rvLabel').value.trim(); });
    m.el.querySelector('#rvPrev').innerHTML = !raw.length ? '' :
      '<p>' + (ok.length ? '<b>' + ok.length + '</b> table' + (ok.length === 1 ? '' : 's') + ': ' + ok.join(', ') + ' (' + ok.reduce((s, n) => s + (Number(BQ.tableByNum(n).s) || 0), 0) + ' seats)' : '') + '</p>' +
      (bad.length ? '<p class="bad">Not in this room: ' + bad.map(BQ.esc).join(', ') + '</p>' : '') +
      (withGuests.length ? '<p class="warn">Guests are already seated at ' + withGuests.join(', ') + '. They’ll stay there and show as a problem until you move them.</p>' : '') +
      (other.length ? '<p class="warn">Already reserved for another group (will switch): ' + other.join(', ') + '</p>' : '');
  };
  m.el.querySelector('#rvTables').oninput = prev;
  m.el.querySelector('#rvLabel').oninput = prev;
  m.el.querySelectorAll('[data-release]').forEach(b => b.onclick = async () => {
    const label = b.dataset.release;
    if (!(await BQ.ui.confirm('Release all tables reserved for ' + label + '? They become open tables again.', 'Release'))) return;
    m.close();
    BQ.commit('Released tables reserved for ' + label, [BQ.eventChange(e => e.layout.tables.forEach(t => { if (t.st === 'reserved' && (t.res || 'Reserved') === label) { t.st = ''; t.res = ''; } }))]);
  });
  setTimeout(() => m.el.querySelector('#rvTables').focus(), 40);
};
