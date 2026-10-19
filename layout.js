/* =====================================================================
   layout.js — room layouts: the Landmark Ballroom preset, a grid
   generator for any year's setup, rotate (wide ⇄ tall), renumber,
   and the Room Layout editor screen.
   Units: roughly 10 units = 1 foot (a 72" round ≈ 60 units across).
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.layouts = {};

BQ.layouts.newId = (L, prefix) => {
  const used = new Set([].concat(L.tables || [], L.objs || []).map(x => x.id));
  let i = 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
};

/* Grid generator — builds with the stage at the top, then turns the room
   so the stage ends up on whichever side was chosen. */
BQ.layouts.generate = function (o) {
  o = Object.assign({ rows: 5, cols: 16, aisles: [8], stageSide: 'top', numbering: 'snake', seats: 12, start: 1, dx: 110, dy: 105, aisleW: 70 }, o || {});
  const aisles = (o.aisles || []).map(Number).filter(n => n > 0 && n < o.cols);
  const tables = [];
  const x0 = 150, y0 = 380;
  let num = Number(o.start) || 1;
  for (let r = 0; r < o.rows; r++) {
    const order = [];
    for (let c = 0; c < o.cols; c++) order.push(c);
    if (o.numbering === 'snake' && r % 2 === 1) order.reverse();
    order.forEach(c => {
      const extra = aisles.filter(a => c >= a).length * o.aisleW;
      tables.push({ id: 't' + (tables.length + 1), n: String(num++), x: x0 + c * o.dx + extra, y: y0 + r * o.dy, s: Number(o.seats) || 12, sh: 'round' });
    });
  }
  const lastX = x0 + (o.cols - 1) * o.dx + aisles.length * o.aisleW;
  const w = lastX + 150, h = y0 + (o.rows - 1) * o.dy + 230;
  const cx = (x0 + lastX) / 2;
  let L = {
    w, h, tables,
    objs: [
      { id: 'o1', t: 'stage', x: Math.round(cx - 200), y: 130, w: 400, h: 180, label: 'Stage' },
      { id: 'o2', t: 'exit', x: Math.round(cx - 35), y: h - 26, w: 70, h: 22, label: 'EXIT' }
    ]
  };
  const turns = { top: 0, right: 1, bottom: 2, left: 3 }[o.stageSide] || 0;
  for (let i = 0; i < turns; i++) L = BQ.layouts.rotate(L);
  return L;
};

/* This year's room: Hyatt Regency — Landmark Ballroom, (80) 72" rounds of 12 */
BQ.layouts.landmark = function () {
  const L = BQ.layouts.generate({ rows: 5, cols: 16, aisles: [8], stageSide: 'top', numbering: 'snake', seats: 12 });
  // stage centered on the center aisle (between tables 8 and 9)
  const t8 = L.tables.find(t => t.n === '8'), t9 = L.tables.find(t => t.n === '9');
  const cx = (t8.x + t9.x) / 2;
  L.w = 2020; L.h = 1040;
  L.objs = [
    { id: 'o1', t: 'stage', x: Math.round(cx - 200), y: 120, w: 400, h: 180, label: "Stage 18' × 40'" },
    { id: 'o2', t: 'other', x: Math.round(cx - 330), y: 205, w: 90, h: 34, label: 'Awards' },
    { id: 'o3', t: 'av', x: 720, y: 905, w: 180, h: 80, label: 'AV Tech' },
    { id: 'o4', t: 'other', x: 935, y: 925, w: 44, h: 40, label: 'Cam' },
    { id: 'o5', t: 'label', x: Math.round(cx - 260), y: 30, w: 520, h: 40, label: 'Theater seating (behind stage)' },
    { id: 'o6', t: 'exit', x: 360, y: 1012, w: 80, h: 22, label: 'EXIT' },
    { id: 'o7', t: 'exit', x: 1050, y: 1012, w: 80, h: 22, label: 'EXIT' },
    { id: 'o8', t: 'exit', x: 1200, y: 1012, w: 80, h: 22, label: 'EXIT' },
    { id: 'o9', t: 'exit', x: 1560, y: 1012, w: 80, h: 22, label: 'EXIT' },
    { id: 'o10', t: 'exit', x: 6, y: 420, w: 22, h: 80, label: 'EXIT' },
    { id: 'o11', t: 'exit', x: 6, y: 740, w: 22, h: 80, label: 'EXIT' },
    { id: 'o12', t: 'exit', x: 1992, y: 420, w: 22, h: 80, label: 'EXIT' },
    { id: 'o13', t: 'exit', x: 1992, y: 740, w: 22, h: 80, label: 'EXIT' }
  ];
  return L;
};

BQ.layouts.presets = [
  { k: 'landmark', label: 'Hyatt Regency — Landmark Ballroom (80 rounds, stage on the long wall)', make: () => BQ.layouts.landmark() },
  { k: 'tall', label: 'Tall room — stage on the short wall (8 rows × 10)', make: () => BQ.layouts.generate({ rows: 8, cols: 10, aisles: [5], stageSide: 'top', numbering: 'snake', seats: 12 }) },
  { k: 'blank', label: 'Empty room (draw it yourself)', make: () => ({ w: 1600, h: 1000, tables: [], objs: [{ id: 'o1', t: 'stage', x: 600, y: 60, w: 400, h: 160, label: 'Stage' }] }) }
];

/* Rotate the whole room 90° clockwise (wide room ⇄ tall room) */
BQ.layouts.rotate = function (L) {
  const R = BQ.clone(L);
  const H = L.h;
  R.w = L.h; R.h = L.w;
  R.tables = (L.tables || []).map(t => Object.assign({}, t, { x: H - t.y, y: t.x, rot: t.sh && t.sh !== 'round' ? ((t.rot || 0) + 90) % 360 : t.rot }));
  R.objs = (L.objs || []).map(o => {
    const nx = H - (o.y + o.h), ny = o.x;
    const flipLabel = o.t === 'label';
    return Object.assign({}, o, { x: nx, y: ny, w: flipLabel ? o.w : o.h, h: flipLabel ? o.h : o.w });
  });
  return R;
};

/* Renumber tables starting nearest the stage (snake or same-direction) */
BQ.layouts.renumber = function (L, opts) {
  opts = Object.assign({ start: 1, snake: true }, opts || {});
  const g = BQ.computeGeo(L);
  const dir = g.dir;
  const rows = {};
  L.tables.forEach(t => { const r = g.rowOf[String(t.n)]; (rows[r] = rows[r] || []).push(t); });
  // "left to right" as you look at the drawing with the stage at the top of the page
  const perp = t => dir[1] === 1 ? t.x : dir[1] === -1 ? -t.x : dir[0] === 1 ? -t.y : t.y;
  const map = {};
  let n = Number(opts.start) || 1;
  Object.keys(rows).map(Number).sort((a, b) => a - b).forEach((r, i) => {
    const row = rows[r].sort((a, b) => perp(a) - perp(b));
    if (opts.snake && i % 2 === 1) row.reverse();
    row.forEach(t => { map[t.id] = String(n++); });
  });
  return map; // tableId -> new number
};

/* ---------------------------------------------------------------------
   ROOM LAYOUT SCREEN (editor)
   --------------------------------------------------------------------- */
BQ.layoutView = { sel: null, map: null };

BQ.screens = BQ.screens || {};
BQ.screens.layout = {
  title: 'Room Layout',
  render(main) {
    const V = BQ.layoutView;
    main.innerHTML =
      '<div class="layout-screen">' +
      '<section class="map-pane">' +
      '  <div class="map-toolbar">' +
      '    <button class="btn" id="lyAddTable">＋ Table</button>' +
      '    <label class="sel">Add <select id="lyAddObj"><option value="">item…</option>' +
      Object.keys(BQ.OBJ_TYPES).map(k => '<option value="' + k + '">' + BQ.OBJ_TYPES[k].label + '</option>').join('') + '</select></label>' +
      '    <span class="sep"></span>' +
      '    <button class="btn" id="lyRotate" title="Turn the whole room 90°">⟳ Turn room</button>' +
      '    <button class="btn" id="lyGen">▦ Build a grid…</button>' +
      '    <button class="btn" id="lyRenum">#️⃣ Renumber…</button>' +
      '    <button class="btn" id="lyPreset">📐 Start from a saved room…</button>' +
      '  </div>' +
      '  <div class="map-area"><div id="lyHost"></div>' +
      '    <div class="zoom-ctl"><button id="zIn">＋</button><button id="zOut">－</button><button id="zFit">⤢</button></div>' +
      '    <div class="map-legend"><span class="lg muted">Drag tables and items to move them · hold Alt for fine moves · click to edit</span></div>' +
      '  </div>' +
      '</section>' +
      '<aside class="side-panel" id="lyPanel"></aside></div>';
    const map = new BQ.Map(document.getElementById('lyHost'), {
      mode: 'edit',
      onTableClick: n => { const t = BQ.tableByNum(n); V.sel = t ? { kind: 't', id: t.id } : null; this.refresh(); },
      onObjClick: id => { V.sel = { kind: 'o', id }; this.refresh(); },
      onBackgroundClick: () => { V.sel = null; this.refresh(); },
      onMoved: (item, from) => {
        const isT = (BQ.state.event.layout.tables || []).includes(item);
        const to = { x: item.x, y: item.y };
        item.x = from.x; item.y = from.y;  // restore; commit applies it properly (and makes it undoable)
        BQ.commit('Moved ' + (isT ? 'Table ' + item.n : (item.label || item.t)), [BQ.eventChange(e => {
          const coll = isT ? e.layout.tables : e.layout.objs;
          const x = coll.find(z => z.id === item.id);
          x.x = to.x; x.y = to.y;
        })]);
        V.sel = { kind: isT ? 't' : 'o', id: item.id };
      }
    });
    V.map = map;
    map.fit();
    const $ = id => document.getElementById(id);
    $('zIn').onclick = () => map.zoom(1 / 1.3);
    $('zOut').onclick = () => map.zoom(1.3);
    $('zFit').onclick = () => map.fit();
    $('lyAddTable').onclick = () => this.addTable();
    $('lyAddObj').onchange = e => { if (e.target.value) this.addObj(e.target.value); e.target.value = ''; };
    $('lyRotate').onclick = async () => {
      const ok = await BQ.ui.confirm('Turn the whole room a quarter turn clockwise? Table numbers and seating stay the same. (Undo works if you change your mind.)', 'Turn room');
      if (ok) { await BQ.commit('Turned the room 90°', [BQ.eventChange(e => { e.layout = BQ.layouts.rotate(e.layout); })]); map.fit(); this.refresh(); }
    };
    $('lyGen').onclick = () => this.generateDialog();
    $('lyRenum').onclick = () => this.renumberDialog();
    $('lyPreset').onclick = () => this.presetDialog();
    this.refresh();
  },

  refresh() {
    const V = BQ.layoutView;
    if (!V.map || !document.getElementById('lyHost')) return;
    const L = BQ.state.event.layout;
    V.map.selected = new Set(V.sel && V.sel.kind === 't' ? [String((L.tables.find(t => t.id === V.sel.id) || {}).n)] : []);
    V.map.selectedObj = V.sel && V.sel.kind === 'o' ? V.sel.id : null;
    V.map.render();
    this.renderPanel();
  },

  renderPanel() {
    const V = BQ.layoutView, el = document.getElementById('lyPanel');
    const L = BQ.state.event.layout;
    if (V.sel && V.sel.kind === 't') {
      const t = L.tables.find(x => x.id === V.sel.id);
      if (!t) { V.sel = null; return this.renderPanel(); }
      const seated = BQ.partiesAt(t.n);
      el.innerHTML = '<h2>Table ' + BQ.esc(t.n) + '</h2>' +
        '<div class="field"><label>Table number / name</label><input id="ltNum" value="' + BQ.esc(t.n) + '"/></div>' +
        '<div class="field"><label>Chairs</label><input id="ltSeats" type="number" min="1" max="30" value="' + t.s + '"/></div>' +
        '<div class="field"><label>Shape</label><div class="seg" id="ltShape">' +
        [['round', '◯ Round'], ['rect', '▭ Banquet'], ['head', '▬ Head table']].map(o => '<button data-v="' + o[0] + '" class="' + ((t.sh || 'round') === o[0] ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div></div>' +
        (t.sh && t.sh !== 'round' ? '<div class="field"><label>Turn table</label><button class="btn" id="ltRot">⟳ 90°</button></div>' : '') +
        '<p class="muted small">' + (seated.length ? BQ.plural(seated.length, 'party') .replace('partys', 'parties') + ' seated here.' : 'Nobody seated here.') + '</p>' +
        '<div class="row gap"><button class="btn" id="ltDup">Duplicate</button><button class="btn danger" id="ltDel">Delete table</button></div>';
      const upd = (label, fn) => BQ.commit(label, [BQ.eventChange(e => fn(e.layout.tables.find(x => x.id === t.id)))]);
      el.querySelector('#ltNum').onchange = e => this.renameTable(t, e.target.value.trim());
      el.querySelector('#ltSeats').onchange = e => { const v = parseInt(e.target.value, 10); if (v > 0) upd('Table ' + t.n + ': ' + v + ' chairs', x => { x.s = v; }); };
      el.querySelectorAll('#ltShape button').forEach(b => b.onclick = () => upd('Table ' + t.n + ' shape', x => { x.sh = b.dataset.v; if (x.sh === 'round') delete x.rot; }));
      const rb = el.querySelector('#ltRot');
      if (rb) rb.onclick = () => upd('Turned Table ' + t.n, x => { x.rot = ((x.rot || 0) + 90) % 360; });
      el.querySelector('#ltDup').onclick = () => this.addTable(t);
      el.querySelector('#ltDel').onclick = async () => {
        const msg = seated.length ? 'Delete Table ' + t.n + '? The ' + seated.length + ' part' + (seated.length === 1 ? 'y' : 'ies') + ' seated there will go back to the waiting list.' : 'Delete Table ' + t.n + '?';
        if (!(await BQ.ui.confirm(msg, 'Delete'))) return;
        V.sel = null;
        await BQ.commit('Deleted Table ' + t.n, [BQ.eventChange(e => { e.layout.tables = e.layout.tables.filter(x => x.id !== t.id); })]
          .concat(seated.map(p => BQ.partyChange(p, a => { a.table = ''; }))));
      };
      return;
    }
    if (V.sel && V.sel.kind === 'o') {
      const o = L.objs.find(x => x.id === V.sel.id);
      if (!o) { V.sel = null; return this.renderPanel(); }
      el.innerHTML = '<h2>' + BQ.esc(BQ.OBJ_TYPES[o.t] ? BQ.OBJ_TYPES[o.t].label : 'Item') + '</h2>' +
        '<div class="field"><label>Label</label><input id="loLabel" value="' + BQ.esc(o.label || '') + '"/></div>' +
        '<div class="field"><label>Type</label><select id="loType">' + Object.keys(BQ.OBJ_TYPES).map(k => '<option value="' + k + '"' + (o.t === k ? ' selected' : '') + '>' + BQ.OBJ_TYPES[k].label + '</option>').join('') + '</select></div>' +
        '<div class="field two"><div><label>Width</label><input id="loW" type="number" value="' + o.w + '"/></div><div><label>Height</label><input id="loH" type="number" value="' + o.h + '"/></div></div>' +
        '<div class="muted small">' + (o.t === 'stage' ? 'The app measures “front rows” from the stage.' : o.t === 'exit' ? 'Exits are used for “near an exit” and wheelchair requests.' : '') + '</div>' +
        '<div class="row gap"><button class="btn" id="loTurn">⟳ Swap width/height</button><button class="btn danger" id="loDel">Delete</button></div>';
      const upd = (label, fn) => BQ.commit(label, [BQ.eventChange(e => fn(e.layout.objs.find(x => x.id === o.id)))]);
      el.querySelector('#loLabel').onchange = e => upd('Renamed item', x => { x.label = e.target.value; });
      el.querySelector('#loType').onchange = e => upd('Changed item type', x => { x.t = e.target.value; });
      el.querySelector('#loW').onchange = e => upd('Resized item', x => { x.w = Math.max(10, Number(e.target.value) || x.w); });
      el.querySelector('#loH').onchange = e => upd('Resized item', x => { x.h = Math.max(10, Number(e.target.value) || x.h); });
      el.querySelector('#loTurn').onclick = () => upd('Turned item', x => { const w = x.w; x.w = x.h; x.h = w; });
      el.querySelector('#loDel').onclick = () => { V.sel = null; BQ.commit('Deleted ' + (o.label || o.t), [BQ.eventChange(e => { e.layout.objs = e.layout.objs.filter(x => x.id !== o.id); })]); };
      return;
    }
    const total = L.tables.reduce((s, t) => s + (Number(t.s) || 0), 0);
    el.innerHTML = '<h2>This room</h2>' +
      '<div class="glance"><div><b>' + L.tables.length + '</b><span>tables</span></div><div><b>' + total + '</b><span>chairs</span></div></div>' +
      '<div class="field two"><div><label>Room width</label><input id="lrW" type="number" value="' + L.w + '"/></div><div><label>Room height</label><input id="lrH" type="number" value="' + L.h + '"/></div></div>' +
      '<div class="tips"><h3>Tips</h3><ol>' +
      '<li>Each year can have its own room. Use <b>Build a grid</b> for the hotel’s diagram, then drag tables to match.</li>' +
      '<li>Put the <b>stage</b> where it really is. “Near the front” is measured from it.</li>' +
      '<li>Mark the <b>exits</b>. They’re used for “near an exit” and wheelchair requests.</li>' +
      '<li>If the stage is on the short wall this year, use <b>Turn room</b>.</li>' +
      '<li>Changing a table number moves its guests along with it.</li></ol></div>';
    const setSize = () => BQ.commit('Room size', [BQ.eventChange(e => { e.layout.w = Math.max(300, Number(el.querySelector('#lrW').value) || e.layout.w); e.layout.h = Math.max(300, Number(el.querySelector('#lrH').value) || e.layout.h); })]).then(() => BQ.layoutView.map.fit());
    el.querySelector('#lrW').onchange = setSize;
    el.querySelector('#lrH').onchange = setSize;
  },

  async renameTable(t, nv) {
    if (!nv || nv === String(t.n)) return;
    if (BQ.tableByNum(nv)) { BQ.ui.toast('There is already a Table ' + nv + '.', 'bad'); this.refresh(); return; }
    const old = t.n;
    await BQ.commit('Renamed Table ' + old + ' to ' + nv, [BQ.eventChange(e => { e.layout.tables.find(x => x.id === t.id).n = nv; })]
      .concat(this.partyFixes({ [old]: nv })));
  },

  // Seated guests and "specific table" requests follow renamed tables (one change per guest)
  partyFixes(numMap) {
    const out = [];
    BQ.state.parties.forEach(p => {
      const moveTable = p.table && numMap[p.table] != null && numMap[p.table] !== p.table;
      const fixNeed = (p.needs || []).some(n => n.type === 'table' && numMap[n.target] != null && numMap[n.target] !== n.target);
      if (!moveTable && !fixNeed) return;
      out.push(BQ.partyChange(p, a => {
        if (moveTable) a.table = numMap[p.table];
        (a.needs || []).forEach(n => { if (n.type === 'table' && numMap[n.target] != null) n.target = numMap[n.target]; });
      }));
    });
    return out;
  },

  addTable(copyFrom) {
    const L = BQ.state.event.layout;
    const nums = L.tables.map(t => parseInt(t.n, 10)).filter(n => !isNaN(n));
    const n = String((nums.length ? Math.max.apply(null, nums) : 0) + 1);
    const vb = BQ.layoutView.map.vb;
    const base = copyFrom || { s: 12, sh: 'round' };
    const t = { id: BQ.layouts.newId(L, 't'), n, x: Math.round(copyFrom ? copyFrom.x + 40 : vb.x + vb.w / 2), y: Math.round(copyFrom ? copyFrom.y + 40 : vb.y + vb.h / 2), s: base.s, sh: base.sh || 'round' };
    if (base.rot) t.rot = base.rot;
    BQ.layoutView.sel = { kind: 't', id: t.id };
    BQ.commit('Added Table ' + n, [BQ.eventChange(e => { e.layout.tables.push(t); })]);
  },

  addObj(type) {
    const L = BQ.state.event.layout;
    const d = BQ.OBJ_TYPES[type];
    const vb = BQ.layoutView.map.vb;
    const o = { id: BQ.layouts.newId(L, 'o'), t: type, x: Math.round(vb.x + vb.w / 2 - d.w / 2), y: Math.round(vb.y + vb.h / 2 - d.h / 2), w: d.w, h: d.h, label: d.label };
    BQ.layoutView.sel = { kind: 'o', id: o.id };
    BQ.commit('Added ' + d.label, [BQ.eventChange(e => { e.layout.objs = (e.layout.objs || []).concat([o]); })]);
  },

  async replaceLayout(newL, label) {
    const seated = BQ.state.parties.filter(p => p.table);
    const nums = new Set(newL.tables.map(t => String(t.n)));
    const lost = seated.filter(p => !nums.has(String(p.table)));
    let msg = 'Replace the current room with this one?';
    if (seated.length) msg += ' Guests keep their table numbers' + (lost.length ? ', but ' + lost.length + ' part' + (lost.length === 1 ? 'y is' : 'ies are') + ' at tables that won’t exist and will go back to the waiting list.' : '.');
    if (!(await BQ.ui.confirm(msg + ' (Undo works.)', 'Replace room'))) return false;
    BQ.layoutView.sel = null;
    await BQ.commit(label, [BQ.eventChange(e => { e.layout = newL; })].concat(lost.map(p => BQ.partyChange(p, a => { a.table = ''; }))));
    BQ.layoutView.map && BQ.layoutView.map.fit();
    return true;
  },

  presetDialog() {
    const body = '<p>Pick a starting room. You can drag things around afterwards.</p>' + BQ.layouts.presets.map(p =>
      '<button class="pick" data-k="' + p.k + '"><span>' + BQ.esc(p.label) + '</span></button>').join('') +
      (BQ.state.events.length > 1 ? '<h3>Or copy the room from another year</h3>' + BQ.state.events.filter(e => e.id !== BQ.state.event.id && e.layout).map(e =>
        '<button class="pick" data-e="' + e.id + '"><span>' + BQ.esc(e.title) + '</span><span class="muted">' + (e.layout.tables || []).length + ' tables</span></button>').join('') : '');
    const m = BQ.ui.modal({ title: 'Start from a saved room', body, buttons: [{ label: 'Cancel' }] });
    m.el.querySelectorAll('.pick').forEach(b => b.onclick = async () => {
      m.close();
      let L;
      if (b.dataset.k) L = BQ.layouts.presets.find(p => p.k === b.dataset.k).make();
      else L = BQ.clone(BQ.state.events.find(e => e.id === Number(b.dataset.e)).layout);
      await this.replaceLayout(L, 'Room replaced: ' + b.textContent.trim());
    });
  },

  generateDialog() {
    const body =
      '<p>Builds rows of round tables like the hotel’s diagram. This replaces the tables in the current room.</p>' +
      '<div class="field two"><div><label>Rows of tables</label><input id="gR" type="number" value="5" min="1"/></div><div><label>Tables in each row</label><input id="gC" type="number" value="16" min="1"/></div></div>' +
      '<div class="field two"><div><label>Chairs per table</label><input id="gS" type="number" value="12" min="1"/></div><div><label>First table number</label><input id="gN" type="number" value="1"/></div></div>' +
      '<div class="field"><label>Center aisle after table # in each row (blank = none; several: 5, 10)</label><input id="gA" value="8"/></div>' +
      '<div class="field"><label>Stage is on the…</label><div class="seg" id="gSide"><button data-v="top" class="on">Top</button><button data-v="bottom">Bottom</button><button data-v="left">Left</button><button data-v="right">Right</button></div></div>' +
      '<div class="field"><label>Numbering</label><div class="seg" id="gNum"><button data-v="snake" class="on">Back-and-forth (like this year)</button><button data-v="straight">Same direction every row</button></div></div>';
    const m = BQ.ui.modal({
      title: 'Build a grid of tables', body,
      buttons: [{ label: 'Cancel' }, {
        label: 'Build it', cls: 'primary', onClick: async () => {
          const v = id => m.el.querySelector(id).value;
          const segv = id => m.el.querySelector(id + ' .on').dataset.v;
          const L = BQ.layouts.generate({
            rows: Math.max(1, parseInt(v('#gR'), 10) || 1), cols: Math.max(1, parseInt(v('#gC'), 10) || 1),
            seats: parseInt(v('#gS'), 10) || 12, start: parseInt(v('#gN'), 10) || 1,
            aisles: v('#gA').split(/[ ,;]+/).map(Number).filter(Boolean), stageSide: segv('#gSide'), numbering: segv('#gNum')
          });
          await this.replaceLayout(L, 'Built a ' + v('#gR') + '×' + v('#gC') + ' grid');
        }
      }]
    });
    BQ.ui.segs(m.el);
  },

  renumberDialog() {
    const body = '<p>Numbers every table again, starting with the row closest to the stage. Seated guests move with their tables.</p>' +
      '<div class="field"><label>Start at</label><input id="rnStart" type="number" value="1"/></div>' +
      '<div class="field"><label>Numbering</label><div class="seg" id="rnMode"><button data-v="snake" class="on">Back-and-forth</button><button data-v="straight">Same direction every row</button></div></div>';
    const m = BQ.ui.modal({
      title: 'Renumber tables', body,
      buttons: [{ label: 'Cancel' }, {
        label: 'Renumber', cls: 'primary', onClick: async () => {
          const L = BQ.state.event.layout;
          const map = BQ.layouts.renumber(L, { start: m.el.querySelector('#rnStart').value, snake: m.el.querySelector('#rnMode .on').dataset.v === 'snake' });
          const numMap = {};
          L.tables.forEach(t => { numMap[t.n] = map[t.id]; });
          const changes = [BQ.eventChange(e => { e.layout.tables.forEach(t => { t.n = map[t.id]; }); })];
          await BQ.commit('Renumbered tables', changes.concat(this.partyFixes(numMap)));
        }
      }]
    });
    BQ.ui.segs(m.el);
  }
};
