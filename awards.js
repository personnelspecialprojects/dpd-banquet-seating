/* =====================================================================
   awards.js — awards program: categories (segments) → awards (one per
   Log Number, e.g. LS-19) → recipients (rank, name, badge), each linked
   to the guest list so you always know their table. Lineup and escort
   pickup route. Import/export of the award file lives in imports.js /
   exports.js.
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.screens = BQ.screens || {};

BQ.awardsSorted = () => BQ.state.awards.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id);

BQ.segments = function () {
  const segs = [];
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
  if (!p) return { state: 'missing', text: 'Not on guest list' };
  if (!p.table) return { state: 'wait', text: 'No table yet', party: p };
  return { state: 'ok', text: 'Table ' + p.table, table: p.table, party: p };
};

/* Recipients that aren't linked to anyone on the guest list */
BQ.unlinkedRecipients = function () {
  const out = [];
  BQ.state.awards.forEach(a => (a.recipients || []).forEach(r => { if (r.name && !(r.pid && BQ.partyById(r.pid))) out.push({ a, r }); }));
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
      '<button class="btn" id="awImport">📥 Import award file…</button>' +
      '<button class="btn" id="awMap">★ Recipients on map</button>' +
      '<button class="btn" id="awPrint">🖨 Print lineup</button>' +
      '<button class="btn primary" id="awAdd">＋ Add award</button></div>' +
      '<div id="awAlert"></div>' +
      '<div class="toolbar"><input id="awQ" type="search" placeholder="Find a recipient, badge, or Log Number…" value="' + BQ.esc(BQ.awardView.q) + '"/></div>' +
      '<div class="aw-cols"><div class="aw-prog" id="awProg"></div><div class="aw-route card" id="awRoute"></div></div></div>';
    main.querySelector('#awAdd').onclick = () => BQ.awardDialog(null);
    main.querySelector('#awImport').onclick = () => BQ.imports.awardsDialog();
    main.querySelector('#awPrint').onclick = () => BQ.exports.printLineup();
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
    alert.innerHTML = missing.length ? '<div class="card warnbox"><b>' + BQ.plural(missing.length, 'recipient') + ' not on the guest list.</b> They won’t have a table until they’re added or linked. ' +
      '<button class="btn sm primary" id="awAddMissing">Add them to the waiting list…</button></div>' : '';
    const am = document.getElementById('awAddMissing');
    if (am) am.onclick = () => BQ.addRecipientsDialog(missing);
    if (!all.length) {
      box.innerHTML = '<div class="card"><p>No awards yet.</p><p class="muted">Click <b>📥 Import award file</b> to bring in the awards spreadsheet (category rows, then Rank / Name / Memo / Log Number), or <b>＋ Add award</b> to type one in.</p></div>';
      document.getElementById('awRoute').innerHTML = '';
      return;
    }
    const q = BQ.awardView.q.toLowerCase().trim();
    const match = a => !q || (BQ.awardTitle(a) + ' ' + a.segment + ' ' + (a.recipients || []).map(r => r.name + ' ' + (r.badge || '')).join(' ')).toLowerCase().indexOf(q) >= 0;
    box.innerHTML = BQ.segments().map(sg => {
      const list = sg.awards.filter(match);
      if (!list.length) return '';
      return '<div class="aw-seg"><h2>' + BQ.esc(sg.name || 'Program') + ' <span class="count">' + sg.awards.length + '</span></h2>' +
        list.map(a => {
          const num = all.indexOf(a) + 1;
          const recs = (a.recipients || []).map(r => {
            const s = BQ.recipientSeat(r);
            return '<span class="rec r-' + s.state + '" title="' + BQ.esc(s.party ? 'Seated with: ' + s.party.name : 'Not matched to anyone on the guest list') + '">' + BQ.esc(BQ.recipLabel(r)) +
              (r.count > 1 ? ' ×' + r.count : '') + ' <b>' + BQ.esc(s.table ? 'T' + s.table : s.state === 'wait' ? 'no table' : '⚠') + '</b></span>';
          }).join('');
          const st = a.status || '';
          return '<div class="award st-' + (st || 'none').replace(/\s/g, '') + '" data-aid="' + a.id + '"><div class="a-num">' + num + '</div><div class="a-main">' +
            '<div class="a-top">' + (a.logNo ? '<span class="logno">' + BQ.esc(a.logNo) + '</span> ' : '') + '<b>' + BQ.esc(a.name) + '</b>' + (a.cat ? '<span class="muted"> · ' + BQ.esc(a.cat) + '</span>' : '') +
            '<span class="kind">' + (a.kind === 'Group' ? '👥 ' + (a.recipients || []).length + ' people' : '👤 Individual') + '</span></div>' +
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
      el.querySelector('[data-up]').onclick = () => this.move(a, -1);
      el.querySelector('[data-down]').onclick = () => this.move(a, 1);
    });
    this.drawRoute();
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
      BQ.segments().map(sg => {
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
BQ.addRecipientsDialog = function (items) {
  // one guest per person even if they receive several awards
  const people = [];
  items.forEach(it => {
    const key = (it.r.name + '|' + (it.r.badge || '')).toLowerCase();
    let p = people.find(x => x.key === key);
    if (!p) { p = { key, r: it.r, awards: [] }; people.push(p); }
    p.awards.push(it.a);
  });
  const body = '<p><b>' + people.length + '</b> recipient' + (people.length === 1 ? '' : 's') + ' will be added to the waiting list so you can seat them.</p>' +
    '<div class="field"><label>Seats for each recipient</label><div class="seg" id="arSeats">' + [1, 2, 3, 4].map(n => '<button data-v="' + n + '" class="' + (n === 2 ? 'on' : '') + '">' + (n === 1 ? 'Just them' : n === 2 ? 'Them + 1 guest' : 'Them + ' + (n - 1) + ' guests') + '</button>').join('') + '</div>' +
    '<div class="muted small">You can change any one later in their details.</div></div>' +
    '<label class="chk"><input type="checkbox" id="arTogether" checked/> Keep recipients of the same award (same Log Number) near each other</label><br>' +
    '<label class="chk"><input type="checkbox" id="arFront"' + (BQ.settings().recipientsFront ? ' checked' : '') + '/> Ask for seats near the front</label>' +
    '<div class="scroll-box"><table class="grid"><thead><tr><th>Recipient</th><th>Award(s)</th></tr></thead><tbody>' +
    people.map(p => '<tr><td>' + BQ.esc(BQ.recipLabel(p.r)) + '</td><td class="small">' + p.awards.map(a => BQ.esc(BQ.awardTitle(a))).join(', ') + '</td></tr>').join('') + '</tbody></table></div>';
  const m = BQ.ui.modal({
    title: 'Add award recipients to the guest list', body, wide: true,
    buttons: [{ label: 'Cancel' }, {
      label: 'Add ' + people.length, cls: 'primary', onClick: async () => {
        const seats = Number(m.el.querySelector('#arSeats .on').dataset.v);
        const together = m.el.querySelector('#arTogether').checked;
        const front = m.el.querySelector('#arFront').checked;
        await BQ.addRecipientsAsGuests(people, { seats, together, front });
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
    return {
      kind: 'party', before: null, after: {
        name: p.r.name, type: 'Guest', aff: '', seats: o.seats, table: '', guests: [], needs, pay: '', payNote: '', phone: '', email: '',
        notes: 'Award recipient: ' + p.awards.map(BQ.awardTitle).join(', ') + (p.r.badge ? ' · Badge ' + p.r.badge : '') + (p.r.rank ? ' · ' + p.r.rank : ''),
        checkedIn: 0, pinned: false, group: '', vip: false, vipCount: 0, vipIn: 0
      }, _p: p
    };
  });
  const since = BQ.history.length;
  const ok = await BQ.commit('Added ' + creates.length + ' award recipients to the guest list', creates);
  if (!ok) return false;
  // link the recipients to their new guest records
  const links = [];
  const touched = new Map();
  creates.forEach(c => {
    c._p.awards.forEach(a => {
      const cur = touched.get(a.id) || BQ.clone(BQ.state.awards.find(x => x.id === a.id));
      cur.recipients.forEach(r => { if ((r.name + '|' + (r.badge || '')).toLowerCase() === c._p.key && !(r.pid && BQ.partyById(r.pid))) r.pid = c.after.id; });
      touched.set(a.id, cur);
    });
  });
  touched.forEach((after, id) => links.push({ kind: 'award', before: BQ.clone(BQ.state.awards.find(x => x.id === id)), after }));
  await BQ.commit('Linked recipients to their seats', links);
  BQ.mergeHistory(since, 'Added ' + creates.length + ' award recipients to the guest list');
  BQ.ui.toast('Added ' + creates.length + ' recipients. They’re on the Seating Map’s waiting list.', 'ok');
  return true;
};

/* Add / edit an award */
BQ.awardDialog = function (a) {
  const isNew = !a;
  const all = BQ.awardsSorted();
  const d = isNew ? { name: '', cat: '', kind: 'Individual', logNo: '', segment: (all[all.length - 1] || {}).segment || '', presenter: '', recipients: [], notes: '', status: '', order: all.length ? Math.max.apply(null, all.map(x => x.order || 0)) + 1 : 1 } : BQ.clone(a);
  const cats = Array.from(new Set(BQ.state.awards.map(x => x.cat).filter(Boolean)));
  const segs = Array.from(new Set(BQ.state.awards.map(x => x.segment).filter(Boolean)));
  const names = BQ.people();
  const partyOpts = '<option value="">— seated with… —</option>' + BQ.state.parties.slice().sort((x, y) => x.name.localeCompare(y.name)).map(p => '<option value="' + p.id + '">' + BQ.esc(p.name) + (p.table ? ' (T' + BQ.esc(p.table) + ')' : '') + '</option>').join('');
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
      if (!r.pid && r.name) { const p = BQ.findPartyForName(r.name); if (p) r.pid = p.id; }
      const s = BQ.recipientSeat(r);
      return '<div class="recrow"><input class="rank" data-rk="' + i + '" value="' + BQ.esc(r.rank || '') + '" placeholder="Rank"/>' +
        '<input list="adPeople" data-i="' + i + '" value="' + BQ.esc(r.name) + '" placeholder="Name"/>' +
        '<input class="badge" data-bd="' + i + '" value="' + BQ.esc(r.badge || '') + '" placeholder="Badge"/>' +
        '<input type="number" min="1" class="cnt" data-c="' + i + '" value="' + (r.count || 1) + '" title="How many people walk up for this name"/>' +
        '<span class="rs r-' + s.state + '">' + BQ.esc(s.party ? s.text + ' · with ' + s.party.name : s.text) + '</span>' +
        (s.state === 'missing' ? '<select class="sm" data-link="' + i + '">' + partyOpts + '</select>' : '<button class="linkbtn" data-unlink="' + i + '">unlink</button>') +
        '<button class="x" data-rm="' + i + '">✕</button></div>';
    }).join('') || '<div class="muted small">No recipients yet.</div>';
    const R = $('#adRecs');
    R.querySelectorAll('[data-i]').forEach(inp => inp.onchange = () => { const r = d.recipients[Number(inp.dataset.i)]; r.name = inp.value.trim(); r.pid = null; draw(); });
    R.querySelectorAll('[data-rk]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.rk)].rank = inp.value.trim(); });
    R.querySelectorAll('[data-bd]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.bd)].badge = inp.value.trim(); });
    R.querySelectorAll('[data-c]').forEach(inp => inp.onchange = () => { d.recipients[Number(inp.dataset.c)].count = Math.max(1, parseInt(inp.value, 10) || 1); });
    R.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.recipients.splice(Number(b.dataset.rm), 1); draw(); });
    R.querySelectorAll('[data-link]').forEach(sel => sel.onchange = () => { d.recipients[Number(sel.dataset.link)].pid = Number(sel.value) || null; draw(); });
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
