/* =====================================================================
   awards.js — awards program: categories (segments) → awards (one per
   Log Number, e.g. LS-19) → recipients (rank, name, badge), each linked
   to the guest list so you always know their table. Lineup and escort
   pickup route. Import/export of the award file lives in imports.js /
   exports.js.
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.screens = BQ.screens || {};

// Segment order comes from Settings (Segments panel) when set; otherwise from the awards' own order.
BQ.segmentOrder = () => (BQ.settings().segments || []).slice();
BQ.awardsSorted = function () {
  const list = BQ.state.awards.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id);
  const named = BQ.segmentOrder();
  const first = {};
  list.forEach((a, i) => { const s = a.segment || ''; if (!(s in first)) first[s] = i; });
  const rank = s => { const i = named.indexOf(s); return i >= 0 ? i : 10000 + (first[s] || 0); };
  return list.sort((a, b) => rank(a.segment || '') - rank(b.segment || '') || (a.order || 0) - (b.order || 0) || a.id - b.id);
};

BQ.segments = function () {
  const segs = BQ.segmentOrder().map(name => ({ name, awards: [] }));
  BQ.awardsSorted().forEach(a => {
    const s = a.segment || '';
    let g = segs.find(x => x.name === s);
    if (!g) { g = { name: s, awards: [] }; segs.push(g); }
    g.awards.push(a);
  });
  return segs;
};

/* Recipient → seat info */
BQ.recipientSeat = function (r) {
  const p = r.pid && BQ.partyById(r.pid);
  if (BQ.recipNA(r)) return { state: 'na', text: 'Not attending', party: p || null };
  if (!p) return { state: 'missing', text: 'Not on guest list' };
  if (!p.table) return { state: 'wait', text: 'No table yet', party: p };
  return { state: 'ok', text: 'Table ' + p.table, table: p.table, party: p };
};

/* Recipients that aren't linked to anyone on the guest list */
BQ.unlinkedRecipients = function () {
  const out = [];
  BQ.state.awards.forEach(a => (a.recipients || []).forEach(r => { if (r.name && !r.na && !(r.pid && BQ.partyById(r.pid))) out.push({ a, r }); }));
  return out;
};

/* Escort pickup route for a set of awards: recipients ordered by walking route */
BQ.pickupRoute = function (awards) {
  const g = BQ.state.geo;
  const all = BQ.awardsSorted();
  const stops = [];
  awards.forEach(a => {
    const num = all.indexOf(a) + 1;
    (a.recipients || []).forEach(r => {
      const s = BQ.recipientSeat(r);
      if (s.state === 'na') return;   // not coming: nobody to pick up
      stops.push({ award: a, num, r, seat: s, key: s.table ? (g.routeKey[String(s.table)] || 0) : 1e9 });
    });
  });
  stops.sort((x, y) => x.key - y.key || x.num - y.num);
  return stops;
};

BQ.awardView = { q: '' };

BQ.screens.awards = {
  title: 'Awards',
  render(main) {
    main.innerHTML = '<div class="page wide">' +
      '<div class="page-head"><h1>Awards</h1><span class="muted" id="awCount"></span><span class="grow"></span>' +
      '<button class="btn" id="awImport">📥 Import awards…</button>' +
      '<button class="btn" id="awSegs">🗂 Segments…</button>' +
      '<button class="btn" id="awMap">★ Recipients on map</button>' +
      '<button class="btn" id="awPrint">🖨 Print lineup</button>' +
      '<button class="btn primary" id="awAdd">＋ Add award</button></div>' +
      '<div id="awAlert"></div><div id="awSelBar"></div>' +
      '<div class="row gap" style="margin:-4px 0 10px"><button class="btn sm ghost" id="awSelAll">☑ Select all awards</button></div>' +
      '<div class="toolbar"><input id="awQ" type="search" placeholder="Find a recipient, badge, or Log Number…" value="' + BQ.esc(BQ.awardView.q) + '"/></div>' +
      '<div class="aw-cols"><div class="aw-prog" id="awProg"></div><div class="aw-route card" id="awRoute"></div></div></div>';
    main.querySelector('#awAdd').onclick = () => BQ.awardDialog(null);
    main.querySelector('#awImport').onclick = async () => {
      const v = await BQ.ui.choose('Import awards', 'Which file is it?', [
        { label: '📊 Award spreadsheet (Excel): Rank, Name, Memo, Log Number', value: 'xlsx', cls: 'primary' },
        { label: '📄 Highest honors list (Word): award headings with “Title Name - Unit” lines', value: 'docx', cls: 'primary' },
        { label: 'Cancel', value: null }]);
      if (v === 'xlsx') BQ.imports.awardsDialog();
      if (v === 'docx') BQ.imports.honorsDialog();
    };
    main.querySelector('#awPrint').onclick = () => BQ.exports.printLineup();
    main.querySelector('#awSegs').onclick = () => BQ.segmentsDialog();
    main.querySelector('#awSelAll').onclick = () => { BQ.awardView.sel = new Set(BQ.state.awards.map(a => a.id)); this.draw(); };
    main.querySelector('#awMap').onclick = () => { BQ.seatView.showAwards = true; BQ.ui.go('seat'); };
    main.querySelector('#awQ').oninput = e => { BQ.awardView.q = e.target.value; this.draw(); };
    this.draw();
  },
  refresh() { this.draw(); },
  draw() {
    const box = document.getElementById('awProg');
    if (!box) return;
    const all = BQ.awardsSorted();
    const people = all.reduce((n, a) => n + (a.recipients || []).reduce((m, r) => m + (Number(r.count) || 1), 0), 0);
    document.getElementById('awCount').textContent = BQ.plural(all.length, 'award') + ' · ' + BQ.plural(people, 'recipient');
    const missing = BQ.unlinkedRecipients();
    const alert = document.getElementById('awAlert');
    const relink = BQ.relinkableRecipients().length;
    alert.innerHTML = (missing.length ? '<div class="card warnbox"><b>' + BQ.plural(missing.length, 'recipient') + ' not linked to the guest list.</b> They won’t have a table until they’re linked or added. ' +
      (relink ? '<button class="btn sm primary" id="awRelink">🔗 Link ' + relink + ' to matching guests</button> ' : '') +
      (missing.length > relink ? '<button class="btn sm' + (relink ? '' : ' primary') + '" id="awAddMissing">Add ' + (relink ? 'the rest' : 'them') + ' to the waiting list…</button>' : '') + '</div>' : '') +
      BQ.cleanupBannerHtml();
    BQ.wireCleanupBanner(alert);
    const am = document.getElementById('awAddMissing');
    if (am) am.onclick = () => BQ.addRecipientsDialog(missing);
    const rl = document.getElementById('awRelink');
    if (rl) rl.onclick = async () => { if (await BQ.relinkRecipients()) BQ.ui.toast('Linked ' + BQ.plural(relink, 'award recipient') + ' to the guest list', 'ok'); };
    if (!all.length) {
      box.innerHTML = '<div class="card"><p>No awards yet.</p><p class="muted">Click <b>📥 Import award file</b> to bring in the awards spreadsheet (category rows, then Rank / Name / Memo / Log Number), or <b>＋ Add award</b> to type one in.</p></div>';
      document.getElementById('awRoute').innerHTML = '';
      return;
    }
    const q = BQ.awardView.q.toLowerCase().trim();
    const match = a => !q || (BQ.awardTitle(a) + ' ' + a.segment + ' ' + (a.recipients || []).map(r => r.name + ' ' + (r.badge || '')).join(' ')).toLowerCase().indexOf(q) >= 0;
    BQ.awardView.sel = BQ.awardView.sel || new Set();
    box.innerHTML = BQ.segments().map(sg => {
      const list = sg.awards.filter(match);
      if (!sg.awards.length && !q) return '<div class="aw-seg"><h2>' + BQ.esc(sg.name || 'Program') + ' <span class="count">0</span></h2><p class="muted small">Empty segment. Tick awards and use “Move to”, or set this segment in an award’s details.</p></div>';
      if (!list.length) return '';
      return '<div class="aw-seg"><h2>' + BQ.esc(sg.name || 'Program') + ' <span class="count">' + sg.awards.length + '</span></h2>' +
        list.map(a => {
          const num = all.indexOf(a) + 1;
          const recs = (a.recipients || []).map(r => {
            const s = BQ.recipientSeat(r);
            return '<span class="rec r-' + s.state + '" title="' + BQ.esc(s.state === 'na' ? 'Not attending' : s.party ? 'Seated with: ' + s.party.name : 'Not matched to anyone on the guest list') + '">' + BQ.esc(BQ.recipLabel(r)) +
              (r.count > 1 ? ' ×' + r.count : '') + ' <b>' + BQ.esc(s.state === 'na' ? '🚫 not attending' : s.table ? 'T' + s.table : s.state === 'wait' ? 'no table' : '⚠') + '</b></span>';
          }).join('');
          const st = a.status || '';
          return '<div class="award st-' + (st || 'none').replace(/\s/g, '') + (BQ.awardView.sel.has(a.id) ? ' picked' : '') + '" data-aid="' + a.id + '"><input type="checkbox" class="a-sel" data-sel title="Tick to move several awards at once"' + (BQ.awardView.sel.has(a.id) ? ' checked' : '') + '/><div class="a-num">' + num + '</div><div class="a-main">' +
            '<div class="a-top">' + (a.logNo ? '<span class="logno">' + BQ.esc(a.logNo) + '</span> ' : '') + '<b>' + BQ.esc(a.name) + '</b>' + (a.cat ? '<span class="muted"> · ' + BQ.esc(a.cat) + '</span>' : '') +
            '<span class="kind">' + (a.kind === 'Group' ? '👥 ' + ((a.recipients || []).length === 1 ? '1 person' : (a.recipients || []).length + ' people') : '👤 Individual') + '</span></div>' +
            '<div class="recs">' + (recs || '<span class="muted small">No recipients yet</span>') + '</div>' +
            (a.presenter ? '<div class="muted small">Presented by ' + BQ.esc(a.presenter) + '</div>' : '') + (a.notes ? '<div class="muted small">📝 ' + BQ.esc(a.notes) + '</div>' : '') + '</div>' +
            '<div class="a-act"><div class="seg sm">' + ['', 'In line', 'Presented'].map(v => '<button data-st="' + v + '" class="' + (st === v ? 'on' : '') + '">' + (v || 'Not yet') + '</button>').join('') + '</div>' +
            '<div class="row"><button class="btn sm ghost" data-up title="Move earlier">▲</button><button class="btn sm ghost" data-down title="Move later">▼</button><button class="btn sm" data-edit>Edit</button></div></div></div>';
        }).join('') + '</div>';
    }).join('') || '<p class="muted pad">No awards match.</p>';
    box.querySelectorAll('.award').forEach(el => {
      const a = BQ.state.awards.find(x => x.id === Number(el.dataset.aid));
      el.querySelector('[data-edit]').onclick = () => BQ.awardDialog(a);
      el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => BQ.commit(BQ.awardTitle(a) + ': ' + (b.dataset.st || 'Not yet'), [{ kind: 'award', before: BQ.clone(a), after: Object.assign(BQ.clone(a), { status: b.dataset.st }) }]));
      el.querySelector('[data-sel]').onchange = e => { if (e.target.checked) BQ.awardView.sel.add(a.id); else BQ.awardView.sel.delete(a.id); el.classList.toggle('picked', e.target.checked); this.drawSelBar(); };
      el.querySelector('[data-up]').onclick = () => this.move(a, -1);
      el.querySelector('[data-down]').onclick = () => this.move(a, 1);
    });
    this.drawSelBar();
    this.drawRoute();
  },
  drawSelBar() {
    const bar = document.getElementById('awSelBar');
    if (!bar) return;
    const sel = BQ.awardView.sel;
    Array.from(sel).forEach(id => { if (!BQ.state.awards.some(a => a.id === id)) sel.delete(id); });
    if (!sel.size) { bar.innerHTML = ''; return; }
    const names = BQ.segments().map(s => s.name);
    bar.innerHTML = '<div class="selbar"><b>' + sel.size + ' selected</b> → Move to <select id="sbSeg">' + names.map(n => '<option value="' + BQ.esc(n) + '">' + BQ.esc(n || 'Program') + '</option>').join('') +
      '<option value="__new">＋ New segment…</option></select><button class="btn primary sm" id="sbGo">Move</button>' +
      '<span class="sep"></span><button class="btn sm" id="sbVip">⭐ VIP reception for their recipients…</button><button class="btn sm ghost" id="sbClear">Clear</button></div>';
    bar.querySelector('#sbClear').onclick = () => { sel.clear(); this.draw(); };
    bar.querySelector('#sbVip').onclick = () => {
      const ids = new Set(), missing = [];
      BQ.state.awards.filter(a => sel.has(a.id)).forEach(a => (a.recipients || []).forEach(r => { if (r.pid && BQ.partyById(r.pid)) ids.add(r.pid); else missing.push(r.name); }));
      if (!ids.size) { BQ.ui.toast('None of these recipients are on the guest list yet. Add them first (yellow box at the top).', 'bad'); return; }
      sel.clear();
      BQ.bulkEditDialog(Array.from(ids), missing.length ? BQ.plural(missing.length, 'recipient') + ' aren’t on the guest list yet, so they’re not included: ' + missing.slice(0, 6).map(BQ.esc).join(', ') + (missing.length > 6 ? '…' : '') : '');
    };
    bar.querySelector('#sbGo').onclick = async () => {
      let target = bar.querySelector('#sbSeg').value;
      const ch = [];
      if (target === '__new') {
        target = await BQ.ui.prompt('Name the new segment', 'e.g. Part 2 – after dinner');
        if (!target) return;
        const order = BQ.segments().map(s => s.name);
        if (!order.includes(target)) ch.push(BQ.eventChange(e => { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings, { segments: order.concat([target]) }); }));
      }
      let mx = BQ.state.awards.reduce((m, a) => Math.max(m, a.order || 0), 0);
      BQ.awardsSorted().filter(a => sel.has(a.id)).forEach(a => { ch.push({ kind: 'award', before: BQ.clone(a), after: Object.assign(BQ.clone(a), { segment: target, order: ++mx }) }); });
      const n = sel.size;
      sel.clear();
      await BQ.commit('Moved ' + BQ.plural(n, 'award') + ' to ' + (target || 'Program'), ch);
    };
  },
  move(a, dir) {
    const list = BQ.awardsSorted();
    const i = list.indexOf(a), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const nb = list[j];
    // at the edge of a segment, the first move just steps into the next segment
    if ((nb.segment || '') !== (a.segment || '')) {
      BQ.commit('Moved ' + BQ.awardTitle(a) + ' to ' + (nb.segment || 'Program'), [{ kind: 'award', before: BQ.clone(a), after: Object.assign(BQ.clone(a), { segment: nb.segment || '' }) }]);
      return;
    }
    const re = list.slice();
    re.splice(i, 1); re.splice(j, 0, a);
    const changes = [];
    re.forEach((x, k) => { if ((x.order || 0) !== k + 1) changes.push({ kind: 'award', before: BQ.clone(x), after: Object.assign(BQ.clone(x), { order: k + 1 }) }); });
    BQ.commit('Moved ' + BQ.awardTitle(a) + (dir < 0 ? ' earlier' : ' later'), changes);
  },
  drawRoute() {
    const el = document.getElementById('awRoute');
    if (!el) return;
    el.innerHTML = '<h2>Escort pickup route</h2><p class="muted small">Recipients in walking order, row by row from the stage. Print it from <b>🖨 Print lineup</b>.</p>' +
      BQ.segments().filter(sg => sg.awards.length).map(sg => {
        const stops = BQ.pickupRoute(sg.awards);
        return '<h3>' + BQ.esc(sg.name || 'Program') + '</h3><ol class="route">' + stops.map(s =>
          '<li class="r-' + s.seat.state + '"><b>' + BQ.esc(s.seat.table ? 'Table ' + s.seat.table : s.seat.text) + '</b> · ' + BQ.esc(BQ.recipLabel(s.r)) + (s.r.count > 1 ? ' ×' + s.r.count : '') +
          ' <span class="muted">→ #' + s.num + (s.award.logNo ? ' ' + BQ.esc(s.award.logNo) : '') + '</span></li>').join('') + '</ol>';
      }).join('');
  }
};

/* ---------------------------------------------------------------------
   Add unlinked recipients to the guest list (waiting for a table)
   items: [{a: award, r: recipient}]
   --------------------------------------------------------------------- */
BQ.recipKey = r => BQ.personKey(r.name) + '|' + (r.badge || BQ.cleanPerson(r.name).badge || '');
BQ.addRecipientsDialog = function (items) {
  // anyone who already matches exactly one guest gets linked, not added twice
  const linkable = items.filter(it => BQ.findPartyForName(it.r.name, it.r.badge));
  items = items.filter(it => linkable.indexOf(it) < 0);
  if (!items.length && linkable.length) {
    const n = BQ.relinkableRecipients().length;
    BQ.relinkRecipients().then(ok => ok && BQ.ui.toast('Linked ' + BQ.plural(n, 'award recipient') + ' to people already on the guest list', 'ok'));
    return;
  }
  // one guest per person even if they receive several awards
  const people = [];
  items.forEach(it => {
    const key = BQ.recipKey(it.r);
    let p = people.find(x => x.key === key);
    if (!p) { p = { key, r: it.r, awards: [] }; people.push(p); }
    p.awards.push(it.a);
  });
  const body = '<p><b>' + people.length + '</b> recipient' + (people.length === 1 ? '' : 's') + ' will be added to the waiting list so you can seat them.</p>' +
    (linkable.length ? '<p class="small ok">✓ ' + BQ.plural(linkable.length, 'other recipient') + ' already on the guest list will just be linked, not added again.</p>' : '') +
    '<div class="field"><label>Seats for each recipient</label><div class="seg" id="arSeats">' + [1, 2, 3, 4].map(n => '<button data-v="' + n + '" class="' + (n === 2 ? 'on' : '') + '">' + (n === 1 ? 'Just them' : n === 2 ? 'Them + 1 guest' : 'Them + ' + (n - 1) + ' guests') + '</button>').join('') + '</div>' +
    '<div class="muted small">You can change any one later in their details.</div></div>' +
    BQ.imports.vipFieldHtml('arVip') +
    '<label class="chk"><input type="checkbox" id="arTogether" checked/> Keep recipients of the same award (same Log Number) near each other</label><br>' +
    '<label class="chk"><input type="checkbox" id="arFront"' + (BQ.settings().recipientsFront ? ' checked' : '') + '/> Ask for seats near the front</label>' +
    '<div class="scroll-box"><table class="grid"><thead><tr><th>Recipient</th><th>Award(s)</th></tr></thead><tbody>' +
    people.map(p => '<tr><td>' + BQ.esc(BQ.recipLabel(p.r)) + '</td><td class="small">' + p.awards.map(a => BQ.esc(BQ.awardTitle(a))).join(', ') + '</td></tr>').join('') + '</tbody></table></div>';
  const m = BQ.ui.modal({
    title: 'Add award recipients to the guest list', body, wide: true, onOpen: el => BQ.imports.wireVip(el, 'arVip'),
    buttons: [{ label: 'Cancel' }, {
      label: 'Add ' + people.length, cls: 'primary', onClick: async () => {
        const seats = Number(m.el.querySelector('#arSeats .on').dataset.v);
        const together = m.el.querySelector('#arTogether').checked;
        const front = m.el.querySelector('#arFront').checked;
        const since = BQ.history.length;
        if (linkable.length) await BQ.relinkRecipients();
        await BQ.addRecipientsAsGuests(people, { seats, together, front, vip: BQ.imports.readVip(m.el, 'arVip') });
        BQ.mergeHistory(since, 'Added ' + people.length + ' award recipients to the guest list');
      }
    }]
  });
  BQ.ui.segs(m.el);
};

BQ.addRecipientsAsGuests = async function (people, o) {
  const creates = people.map(p => {
    const needs = [];
    if (o.front) needs.push({ type: 'front', target: '' });
    if (o.together) p.awards.filter(a => (a.recipients || []).length > 1).slice(0, 1).forEach(a => needs.push({ type: 'near', target: 'award:' + a.id }));
    if (o.nearUnit && p.r.unit) needs.push({ type: 'near', target: 'aff:' + p.r.unit });
    const c = BQ.cleanPerson(p.r.name);
    return {
      kind: 'party', before: null, after: {
        name: c.name || p.r.name, badge: p.r.badge || c.badge || '', type: 'Guest', aff: p.r.unit || '', seats: o.seats, table: '', guests: [], needs, pay: '', payNote: '', phone: '', email: '',
        notes: 'Award recipient: ' + p.awards.map(BQ.awardTitle).join(', ') + (p.r.rank ? ' · ' + p.r.rank : ''),
        checkedIn: 0, pinned: false, group: '', vip: false, vipCount: 0, vipIn: 0
      }, _p: p
    };
  });
  if (o.vip) creates.forEach(c => BQ.imports.applyVip(c.after, o.vip));
  const since = BQ.history.length;
  const ok = await BQ.commit('Added ' + creates.length + ' award recipients to the guest list', creates);
  if (!ok) return false;
  // link the recipients to their new guest records
  const links = [];
  const touched = new Map();
  creates.forEach(c => {
    c._p.awards.forEach(a => {
      const cur = touched.get(a.id) || BQ.clone(BQ.state.awards.find(x => x.id === a.id));
      cur.recipients.forEach(r => { if (BQ.recipKey(r) === c._p.key && !(r.pid && BQ.partyById(r.pid))) r.pid = c.after.id; });
      touched.set(a.id, cur);
    });
  });
  touched.forEach((after, id) => links.push({ kind: 'award', before: BQ.clone(BQ.state.awards.find(x => x.id === id)), after }));
  await BQ.commit('Linked recipients to their seats', links);
  BQ.mergeHistory(since, 'Added ' + creates.length + ' award recipients to the guest list');
  BQ.noteImport(creates.map(c => c.after.id), 'Added ' + creates.length + ' award recipients to the waiting list');
  return true;
};

/* Add / edit an award */
BQ.awardDialog = function (a) {
  const isNew = !a;
  const all = BQ.awardsSorted();
  const d = isNew ? { name: '', cat: '', kind: 'Individual', logNo: '', segment: (all[all.length - 1] || {}).segment || '', presenter: '', recipients: [], notes: '', status: '', order: all.length ? Math.max.apply(null, all.map(x => x.order || 0)) + 1 : 1 } : BQ.clone(a);
  const cats = Array.from(new Set(BQ.state.awards.map(x => x.cat).filter(Boolean)));
  const segs = Array.from(new Set(BQ.segmentOrder().concat(BQ.state.awards.map(x => x.segment)).filter(Boolean)));
  const names = BQ.people();
  const partyOpts = '<option value="">— link to a guest… —</option>' + BQ.state.parties.slice().sort((x, y) => x.name.localeCompare(y.name)).map(p => '<option value="' + p.id + '">' + BQ.esc(p.name) + (p.badge ? ' #' + BQ.esc(p.badge) : '') + (p.table ? ' (T' + BQ.esc(p.table) + ')' : '') + '</option>').join('');
  const body =
    '<div class="field two"><div><label>Award name</label><input id="adName" class="big" value="' + BQ.esc(d.name) + '" placeholder="e.g. Life Saving Award"/></div>' +
    '<div><label>Log Number <span class="muted">(optional)</span></label><input id="adLog" value="' + BQ.esc(d.logNo || '') + '" placeholder="e.g. LS-19"/></div></div>' +
    '<div class="field two"><div><label>Segment / category of the program</label><input id="adSeg" list="adSegs" value="' + BQ.esc(d.segment) + '" placeholder="e.g. Life Saving Awards"/><datalist id="adSegs">' + segs.map(c => '<option value="' + BQ.esc(c) + '">').join('') + '</datalist></div>' +
    '<div><label>Sub-category <span class="muted">(optional)</span></label><input id="adCat" list="adCats" value="' + BQ.esc(d.cat) + '"/><datalist id="adCats">' + cats.map(c => '<option value="' + BQ.esc(c) + '">').join('') + '</datalist></div></div>' +
    '<div class="field"><label>Type</label><div class="seg" id="adKind"><button data-v="Individual" class="' + (d.kind !== 'Group' ? 'on' : '') + '">👤 One person</button><button data-v="Group" class="' + (d.kind === 'Group' ? 'on' : '') + '">👥 Group / several people</button></div></div>' +
    '<div class="field"><label>Recipient(s): rank, name, badge</label><div id="adRecs"></div>' +
    '<div class="row gap"><button class="btn sm" id="adAddRec">＋ Add a person</button><select id="adAddParty" class="sm"><option value="">＋ Add everyone named in a party…</option>' +
    BQ.state.parties.slice().sort((x, y) => x.name.localeCompare(y.name)).map(p => '<option value="' + p.id + '">' + BQ.esc(p.name) + ' (' + p.seats + ')</option>').join('') + '</select></div>' +
    '<datalist id="adPeople">' + names.map(x => '<option value="' + BQ.esc(x.name) + '">' + (x.party.table ? 'Table ' + BQ.esc(x.party.table) : 'not seated') + '</option>').join('') + '</datalist></div>' +
    '<div class="field"><label>Presented by <span class="muted">(optional)</span></label><input id="adPres" value="' + BQ.esc(d.presenter) + '"/></div>' +
    '<div class="field"><label>Notes</label><textarea id="adNotes" rows="2">' + BQ.esc(d.notes) + '</textarea></div>';
  const m = BQ.ui.modal({
    title: isNew ? 'Add an award' : 'Edit award', body, wide: true,
    left: isNew ? '' : '<button class="btn danger" id="adDel">Delete</button>',
    buttons: [{ label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: () => save() }]
  });
  BQ.ui.segs(m.el);
  const $ = s => m.el.querySelector(s);
  const draw = () => {
    $('#adRecs').innerHTML = d.recipients.map((r, i) => {
      if (r.pid !== -1 && !(r.pid && BQ.partyById(r.pid)) && r.name) { const p = BQ.findPartyForName(r.name, r.badge); r.pid = p ? p.id : null; }
      const s = BQ.recipientSeat(r);
      return '<div class="recrow"><input class="rank" data-rk="' + i + '" value="' + BQ.esc(r.rank || '') + '" placeholder="Rank"/>' +
        '<input list="adPeople" data-i="' + i + '" value="' + BQ.esc(r.name) + '" placeholder="Name"/>' +
        '<input class="badge" data-bd="' + i + '" value="' + BQ.esc(r.badge || '') + '" placeholder="Badge"/>' +
        '<input class="unit" data-un="' + i + '" value="' + BQ.esc(r.unit || '') + '" placeholder="Unit"/>' +
        '<input type="number" min="1" class="cnt" data-c="' + i + '" value="' + (r.count || 1) + '" title="How many people walk up for this name"/>' +
        '<span class="rs r-' + s.state + '">' + BQ.esc(s.party ? s.text + ' · with ' + s.party.name : s.text) + '</span>' +
        (!s.party ? '<select class="sm" data-link="' + i + '">' + partyOpts + '</select><label class="chk small" title="Not on the guest list and not coming"><input type="checkbox" data-na="' + i + '"' + (r.na ? ' checked' : '') + '/> 🚫 not attending</label>' : '<button class="linkbtn" data-unlink="' + i + '">unlink</button>') +
        '<button class="x" data-rm="' + i + '">✕</button></div>';
    }).join('') || '<div class="muted small">No recipients yet.</div>';
    const R = $('#adRecs');
    R.querySelectorAll('[data-i]').forEach(inp => inp.onchange = () => {
      const r = d.recipients[Number(inp.dataset.i)];
      const c = BQ.cleanPerson(inp.value);
      r.name = c.name; if (c.badge && !r.badge) r.badge = c.badge; if (c.na) r.na = true; r.pid = null; draw();
    });
    R.querySelectorAll('[data-rk]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.rk)].rank = inp.value.trim(); });
    R.querySelectorAll('[data-bd]').forEach(inp => inp.onchange = () => { const r = d.recipients[Number(inp.dataset.bd)]; r.badge = inp.value.replace(/[^0-9A-Za-z]/g, ''); if (r.pid !== -1 && !BQ.partyById(r.pid)) { r.pid = null; draw(); } });
    R.querySelectorAll('[data-un]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.un)].unit = inp.value.trim(); });
    R.querySelectorAll('[data-c]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.c)].count = Math.max(1, parseInt(inp.value, 10) || 1); });
    R.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.recipients.splice(Number(b.dataset.rm), 1); draw(); });
    R.querySelectorAll('[data-link]').forEach(sel => sel.onchange = () => { d.recipients[Number(sel.dataset.link)].pid = Number(sel.value) || null; draw(); });
    R.querySelectorAll('[data-na]').forEach(c => c.onchange = () => { d.recipients[Number(c.dataset.na)].na = c.checked; draw(); });
    R.querySelectorAll('[data-unlink]').forEach(b => b.onclick = () => { d.recipients[Number(b.dataset.unlink)].pid = -1; draw(); });
  };
  draw();
  $('#adAddRec').onclick = () => { d.recipients.push({ name: '', pid: null, count: 1, rank: '', badge: '' }); draw(); const ins = $('#adRecs').querySelectorAll('[data-i]'); ins[ins.length - 1].focus(); };
  $('#adAddParty').onchange = e => {
    const p = BQ.partyById(Number(e.target.value));
    e.target.value = '';
    if (!p) return;
    if (BQ.isOrg(p) && !(p.guests || []).length) d.recipients.push({ name: p.name, pid: p.id, count: p.seats });
    else [p.name].concat(p.guests || []).forEach(nm => { if (!d.recipients.some(r => r.name.toLowerCase() === nm.toLowerCase())) d.recipients.push({ name: nm, pid: p.id, count: 1 }); });
    if (d.recipients.length > 1) m.el.querySelectorAll('#adKind button').forEach(b => b.classList.toggle('on', b.dataset.v === 'Group'));
    draw();
  };
  async function save() {
    const out = Object.assign({}, d, {
      name: $('#adName').value.trim(), logNo: $('#adLog').value.trim(), cat: $('#adCat').value.trim(), segment: $('#adSeg').value.trim(),
      kind: m.el.querySelector('#adKind .on').dataset.v, presenter: $('#adPres').value.trim(), notes: $('#adNotes').value.trim(),
      recipients: d.recipients.filter(r => r.name).map(r => Object.assign({}, r, { pid: r.pid > 0 ? r.pid : null }))
    });
    if (!out.name && !out.logNo) { BQ.ui.toast('Please enter the award name or Log Number.', 'bad'); return false; }
    return BQ.commit((isNew ? 'Added award ' : 'Updated award ') + BQ.awardTitle(out), [{ kind: 'award', before: isNew ? null : BQ.clone(a), after: out }]);
  }
  if (!isNew) $('#adDel').onclick = async () => {
    if (!(await BQ.ui.confirm('Delete the award “' + BQ.awardTitle(a) + '”?', 'Delete'))) return;
    m.close();
    BQ.commit('Deleted award ' + BQ.awardTitle(a), [{ kind: 'award', before: BQ.clone(a), after: null }]);
  };
  setTimeout(() => $('#adName').focus(), 40);
};

/* ---------------------------------------------------------------------
   Segments panel: add, rename, reorder, delete program segments
   --------------------------------------------------------------------- */
BQ.segmentsDialog = function () {
  const m = BQ.ui.modal({ title: '🗂 Program segments', wide: true, body: '<div id="sgBody"></div>', buttons: [{ label: 'Done', cls: 'primary' }] });
  const setOrder = (order, label, extra) => BQ.commit(label, [BQ.eventChange(e => { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings, { segments: order }); })].concat(extra || []));
  const draw = () => {
    const segs = BQ.segments();
    const order = segs.map(s => s.name);
    m.el.querySelector('#sgBody').innerHTML =
      '<p class="muted small">Segments are the parts of the program (e.g. “Life Saving Awards”, “Highest Honors”). Their order here is the order of the lineup.</p>' +
      segs.map((s, i) => '<div class="segrow" data-i="' + i + '"><div class="row"><button class="btn sm ghost" data-up' + (i === 0 ? ' disabled' : '') + ' title="Earlier">▲</button><button class="btn sm ghost" data-down' + (i === segs.length - 1 ? ' disabled' : '') + ' title="Later">▼</button></div>' +
        '<input data-name value="' + BQ.esc(s.name) + '" placeholder="Program (no segment)"/><span class="muted small">' + BQ.plural(s.awards.length, 'award') + '</span>' +
        '<button class="x" data-del title="Delete segment">✕</button></div>').join('') +
      '<div class="row gap" style="margin-top:10px"><input id="sgNew" placeholder="New segment name, e.g. Part 2 – after dinner"/><button class="btn" id="sgAdd">＋ Add segment</button></div>';
    m.el.querySelectorAll('.segrow').forEach(row => {
      const i = Number(row.dataset.i), s = segs[i];
      row.querySelector('[data-up]').onclick = async () => { const o = order.slice(); [o[i - 1], o[i]] = [o[i], o[i - 1]]; await setOrder(o, 'Moved segment ' + (s.name || 'Program') + ' earlier'); draw(); };
      row.querySelector('[data-down]').onclick = async () => { const o = order.slice(); [o[i + 1], o[i]] = [o[i], o[i + 1]]; await setOrder(o, 'Moved segment ' + (s.name || 'Program') + ' later'); draw(); };
      row.querySelector('[data-name]').onchange = async e => {
        const nv = e.target.value.trim();
        if (nv === s.name) return;
        if (order.includes(nv)) { BQ.ui.toast('There is already a segment called “' + nv + '”. To combine them, delete one and move its awards into the other.', 'bad'); draw(); return; }
        const o = order.slice(); o[i] = nv;
        await setOrder(o, 'Renamed segment ' + (s.name || 'Program') + ' → ' + (nv || 'Program'),
          s.awards.map(a => ({ kind: 'award', before: BQ.clone(a), after: Object.assign(BQ.clone(a), { segment: nv }) })));
        draw();
      };
      row.querySelector('[data-del]').onclick = async () => {
        const o = order.filter((x, k) => k !== i);
        if (!s.awards.length) { await setOrder(o, 'Deleted segment ' + (s.name || 'Program')); draw(); return; }
        const target = await BQ.ui.choose('Delete “' + (s.name || 'Program') + '”', 'It has ' + BQ.plural(s.awards.length, 'award') + '. Move them to:',
          o.map(n => ({ label: n || 'Program (no segment)', value: '§' + n })).concat([{ label: 'Cancel', value: null }]));
        if (target == null) return;
        const t = target.slice(1);
        let mx = BQ.state.awards.filter(a => (a.segment || '') === t).reduce((mm, a) => Math.max(mm, a.order || 0), 0);
        await setOrder(o, 'Deleted segment ' + (s.name || 'Program') + ' (awards moved to ' + (t || 'Program') + ')',
          s.awards.map(a => ({ kind: 'award', before: BQ.clone(a), after: Object.assign(BQ.clone(a), { segment: t, order: mx + (a.order || 0) }) })));
        draw();
      };
    });
    m.el.querySelector('#sgAdd').onclick = async () => {
      const nv = m.el.querySelector('#sgNew').value.trim();
      if (!nv) return;
      if (order.includes(nv)) { BQ.ui.toast('That segment already exists.'); return; }
      await setOrder(order.concat([nv]), 'Added segment ' + nv);
      draw();
    };
  };
  draw();
};
