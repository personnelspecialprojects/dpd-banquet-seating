/* =====================================================================
   data.js — app state, room geometry, request/rule checking,
   "find a seat" suggestions, auto-seat, saving with Undo, and helpers.
   ===================================================================== */
window.BQ = window.BQ || {};

BQ.state = { store: null, events: [], event: null, parties: [], awards: [], geo: null };

/* ---------------------------------------------------------------------
   Vocabulary
   --------------------------------------------------------------------- */
BQ.PARTY_TYPES = [
  { k: 'Guest', label: 'Person / family', icon: '👤', group: false },
  { k: 'Unit', label: 'Unit / division', icon: '🚓', group: true },
  { k: 'Organization', label: 'Organization', icon: '🏢', group: true },
  { k: 'Host', label: 'Host organization', icon: '⭐', group: true },
  { k: 'VIP', label: 'VIP / command staff', icon: '🎖️', group: false },
  { k: 'Volunteers', label: 'Volunteers', icon: '🙋', group: true },
  { k: 'Performers', label: 'Performers', icon: '🎵', group: true },
  { k: 'Hold', label: 'Seats on hold', icon: '⏸️', group: true }
];
BQ.typeInfo = k => BQ.PARTY_TYPES.find(t => t.k === k) || BQ.PARTY_TYPES[0];
BQ.isOrg = p => !!BQ.typeInfo(p.type).group;

BQ.NEEDS = {
  front:  { label: 'Near the front / stage', short: 'Front', icon: '🔊', hint: 'Hard of hearing, award recipient, VIP' },
  back:   { label: 'Toward the back', short: 'Back', icon: '⬇️', hint: 'Leaving early, small children' },
  exit:   { label: 'Near an exit or door', short: 'Exit', icon: '🚪', hint: 'Needs to step out' },
  access: { label: 'Wheelchair / walker access', short: 'Access', icon: '♿', hint: 'Edge or aisle table near a door' },
  aisle:  { label: 'On an aisle or edge', short: 'Aisle', icon: '↔️', hint: 'Easy in and out' },
  near:   { label: 'Near another guest or unit', short: 'Near', icon: '🤝', target: 'party', hint: 'Same table or the table next to it' },
  same:   { label: 'Same table as…', short: 'Same table', icon: '👥', target: 'party' },
  away:   { label: 'Keep away from…', short: 'Away', icon: '🚫', target: 'party' },
  table:  { label: 'A specific table', short: 'Table', icon: '📍', target: 'table' },
  zone:   { label: 'In a certain area', short: 'Area', icon: '🗺️', target: 'zone' },
  note:   { label: 'Other request (reminder)', short: 'Note', icon: '📝', target: 'text' }
};

BQ.PAY = ['Paid', 'Comp (no charge)', 'Pending', 'Invoice sent', 'Not paid'];
BQ.payClass = v => !v ? 'none' : (v === 'Paid' || v.indexOf('Comp') === 0) ? 'ok' : v === 'Not paid' ? 'bad' : 'warn';

BQ.DEFAULT_SETTINGS = {
  exportTitle: 'Table seating for FDP AWARDS BANQUET',
  frontRows: 2,
  backRows: 2,
  nearSpacing: 1.6,      // "near" = within this many table-widths (adjacent incl. diagonal)
  exitSpacing: 2.2,      // "near an exit" = within this many table-widths of an exit marker
  zones: [],             // [{name, color}]
  recipientsFront: false,
  sortBy: 'last'
};
BQ.settings = () => Object.assign({}, BQ.DEFAULT_SETTINGS, (BQ.state.event && BQ.state.event.settings) || {});

BQ.ZONE_COLORS = ['#7E57C2', '#26A69A', '#EF6C00', '#5C6BC0', '#C2185B', '#2E7D32', '#8D6E63', '#00838F'];
BQ.CHAIR_GUEST = ['#F2B35B', '#8BC34A', '#EF8A80', '#BA8CD3', '#4DB6AC', '#FFD54F', '#BCAAA4', '#F48FB1', '#AED581', '#FFAB91'];
BQ.CHAIR_ORG = ['#1E88E5', '#64B5F6', '#1565C0', '#90CAF9', '#0D47A1'];
BQ.CHAIR_TYPE = { Host: '#7B1FA2', Volunteers: '#00897B', Performers: '#D81B60', Hold: '#FFB300', VIP: '#C9A227' };

/* ---------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------- */
BQ.uid = () => Math.random().toString(36).slice(2, 9);
BQ.clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
BQ.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
BQ.numSort = (a, b) => {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};
BQ.plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v|phd|md|esq\.?)$/i;
BQ.splitName = function (raw) {
  const s = BQ.cleanPerson(raw).name.replace(/(^|\s)[\/\\|*.,-]+(?=\S)/g, '$1').replace(/\s+/g, ' ').trim();
  if (!s) return { first: '', last: '' };
  if (s.indexOf(',') > 0) {
    const [l, f] = s.split(',');
    return { first: (f || '').trim(), last: l.trim() };
  }
  const parts = s.split(' ');
  let suffix = '';
  if (parts.length > 2 && SUFFIX.test(parts[parts.length - 1])) suffix = ' ' + parts.pop();
  if (parts.length === 1) return { first: '', last: parts[0] + suffix };
  const last = parts.pop();
  return { first: parts.join(' '), last: last + suffix };
};
BQ.sortKey = function (name, isOrg) {
  const clean = s => s.toLowerCase().replace(/^[^a-z0-9]+/, '').trim();
  if (isOrg || BQ.settings().sortBy === 'first') return clean(String(name));
  const n = BQ.splitName(name);
  return clean(n.last + ' ' + n.first);
};

/* ---------------------------------------------------------------------
   Table + seat accounting
   --------------------------------------------------------------------- */
BQ.tables = () => (BQ.state.event && BQ.state.event.layout && BQ.state.event.layout.tables) || [];
BQ.tableByNum = n => BQ.tables().find(t => String(t.n) === String(n));
BQ.partiesAt = n => BQ.state.parties.filter(p => p.table && String(p.table) === String(n));
BQ.partyById = id => BQ.state.parties.find(p => p.id === id);
BQ.unseated = () => BQ.state.parties.filter(p => !p.table);

BQ.tableUse = function (t, ignorePartyId) {
  const ps = BQ.partiesAt(t.n).filter(p => p.id !== ignorePartyId);
  const used = ps.reduce((s, p) => s + (Number(p.seats) || 0), 0);
  const cap = Number(t.s) || 0;
  const closed = t.st === 'closed' || t.st === 'reserved';
  return { parties: ps, used, cap, open: closed ? 0 : Math.max(0, cap - used), over: Math.max(0, used - cap), closed, hold: t.st === 'hold', reserved: t.st === 'reserved' };
};

/* status used for colors & the classic export: full | open | empty | hold | reserved
   "reserved" = the whole table belongs to a block such as "FDP Sponsors" (every chair counts as taken) */
BQ.tableStatus = function (t) {
  const u = BQ.tableUse(t);
  if (u.hold) return 'hold';
  if (u.reserved) return 'reserved';
  if (u.used === 0) return u.closed ? 'full' : 'empty';
  if (u.closed || u.used >= u.cap) return 'full';
  return 'open';
};

BQ.stats = function () {
  const ps = BQ.state.parties, ts = BQ.tables();
  const requested = ps.reduce((s, p) => s + (Number(p.seats) || 0), 0);
  const seated = ps.filter(p => p.table).reduce((s, p) => s + (Number(p.seats) || 0), 0);
  let cap = 0, open = 0, full = 0, hold = 0, used = 0, resTables = 0, resSeats = 0;
  ts.forEach(t => {
    const u = BQ.tableUse(t), st = BQ.tableStatus(t);
    if (st === 'hold') { hold++; return; }
    if (st === 'reserved') { resTables++; resSeats += u.cap; return; }
    cap += u.cap; open += u.open; used += u.used;
    if (st === 'full') full++;
  });
  const arrived = ps.reduce((s, p) => s + Math.min(Number(p.checkedIn) || 0, Number(p.seats) || 0), 0);
  const unpaid = BQ.config.trackPayment ? ps.filter(p => BQ.payClass(p.pay) === 'bad' || BQ.payClass(p.pay) === 'warn').length : 0;
  const vipInvited = ps.reduce((s, p) => s + BQ.vipCount(p), 0);
  const vipArrived = ps.reduce((s, p) => s + Math.min(Number(p.vipIn) || 0, BQ.vipCount(p)), 0);
  return { parties: ps.length, requested, seated, waiting: requested - seated, waitingParties: BQ.unseated().length,
    cap, open, full, hold, resTables, resSeats, tables: ts.length, arrived, unpaid, vipInvited, vipArrived, vipParties: ps.filter(p => p.vip).length };
};

/* ---------------------------------------------------------------------
   Room geometry: rows from the stage, distances, edges, exits
   --------------------------------------------------------------------- */
BQ.computeGeo = function (layout) {
  const tables = (layout && layout.tables) || [];
  const objs = (layout && layout.objs) || [];
  const g = { spacing: 110, rowOf: {}, routeKey: {}, edge: {}, exitDist: {}, maxRow: 1, dir: [0, 1], byNum: {} };
  if (!tables.length) return g;
  tables.forEach(t => { g.byNum[String(t.n)] = t; });

  // typical distance between neighbouring tables
  const nn = tables.map(a => {
    let best = Infinity;
    tables.forEach(b => { if (a !== b) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y)); });
    return best;
  }).filter(isFinite).sort((a, b) => a - b);
  if (nn.length) g.spacing = Math.max(40, nn[Math.floor(nn.length / 2)]);

  // which way does the room face? (stage -> tables, snapped to an axis)
  const cx = tables.reduce((s, t) => s + t.x, 0) / tables.length;
  const cy = tables.reduce((s, t) => s + t.y, 0) / tables.length;
  const stage = objs.find(o => o.t === 'stage');
  let dir = [0, 1];
  if (stage) {
    const sx = stage.x + stage.w / 2, sy = stage.y + stage.h / 2;
    const dx = cx - sx, dy = cy - sy;
    dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
  }
  g.dir = dir;
  g.stageSide = dir[1] === 1 ? 'top' : dir[1] === -1 ? 'bottom' : dir[0] === 1 ? 'left' : 'right';

  // rows = clusters of distance from the stage
  const proj = tables.map(t => ({ t, d: t.x * dir[0] + t.y * dir[1], p: dir[1] !== 0 ? t.x : t.y }));
  proj.sort((a, b) => a.d - b.d);
  let row = 1, prev = null;
  const tol = g.spacing * 0.45;
  proj.forEach(o => {
    if (prev !== null && o.d - prev > tol) row++;
    prev = o.d;
    g.rowOf[String(o.t.n)] = row;
  });
  g.maxRow = row;

  // walking route order (row by row, snaking) — used for award pickup lists
  const rows = {};
  proj.forEach(o => { const r = g.rowOf[String(o.t.n)]; (rows[r] = rows[r] || []).push(o); });
  Object.keys(rows).forEach(r => {
    rows[r].sort((a, b) => a.p - b.p);
    if (r % 2 === 0) rows[r].reverse();
    rows[r].forEach((o, i) => { g.routeKey[String(o.t.n)] = Number(r) * 1000 + i; });
  });

  // edge/aisle tables: fewer than 4 close neighbours
  tables.forEach(a => {
    let c = 0;
    tables.forEach(b => {
      if (a === b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < g.spacing * 1.25) c++;
    });
    g.edge[String(a.n)] = c < 4;
  });

  const exits = objs.filter(o => o.t === 'exit');
  tables.forEach(t => {
    let best = Infinity;
    exits.forEach(e => {
      const ex = Math.max(e.x, Math.min(t.x, e.x + e.w)), ey = Math.max(e.y, Math.min(t.y, e.y + e.h));
      best = Math.min(best, Math.hypot(t.x - ex, t.y - ey));
    });
    g.exitDist[String(t.n)] = best / g.spacing;
  });
  return g;
};
BQ.refreshGeo = () => { BQ.state.geo = BQ.computeGeo(BQ.state.event && BQ.state.event.layout); };

BQ.tableDist = function (n1, n2) {
  const g = BQ.state.geo, a = g.byNum[String(n1)], b = g.byNum[String(n2)];
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y) / g.spacing;
};
BQ.rowOf = n => (BQ.state.geo && BQ.state.geo.rowOf[String(n)]) || 0;

/* ---------------------------------------------------------------------
   Requests ("needs") — checking each one
   --------------------------------------------------------------------- */
// A "near/same/away" target is either a party id (number) or "aff:Some Unit"
BQ.targetParties = function (target, selfId) {
  if (target == null || target === '') return [];
  if (typeof target === 'string' && target.indexOf('award:') === 0) {
    const a = BQ.state.awards.find(x => String(x.id) === target.slice(6));
    if (!a) return [];
    const ids = new Set((a.recipients || []).map(r => r.pid).filter(Boolean));
    return BQ.state.parties.filter(p => ids.has(p.id) && p.id !== selfId);
  }
  if (typeof target === 'string' && target.indexOf('aff:') === 0) {
    const a = target.slice(4).toLowerCase().trim();
    return BQ.state.parties.filter(p => p.id !== selfId &&
      ((p.aff || '').toLowerCase().trim() === a || (p.name || '').toLowerCase().trim() === a));
  }
  const p = BQ.partyById(Number(target));
  return p ? [p] : [];
};
BQ.targetLabel = function (need) {
  const d = BQ.NEEDS[need.type] || {};
  if (d.target === 'party') {
    if (typeof need.target === 'string' && need.target.indexOf('aff:') === 0) return need.target.slice(4);
    if (typeof need.target === 'string' && need.target.indexOf('award:') === 0) {
      const a = BQ.state.awards.find(x => String(x.id) === need.target.slice(6));
      return a ? 'the other ' + (a.logNo || a.name) + ' recipients' : '(removed award)';
    }
    const p = BQ.partyById(Number(need.target));
    return p ? p.name : '(removed guest)';
  }
  if (d.target === 'table') return 'Table ' + need.target;
  if (d.target === 'zone') return need.target || '';
  if (d.target === 'text') return need.text || need.target || '';
  return '';
};
BQ.needText = function (need) {
  const d = BQ.NEEDS[need.type] || { label: need.type, icon: '•' };
  const t = BQ.targetLabel(need);
  if (need.type === 'note') return d.icon + ' ' + (t || 'Note');
  if (need.type === 'near' && typeof need.target === 'string' && need.target.indexOf('award:') === 0) return d.icon + ' Near ' + t;
  return d.icon + ' ' + d.label.replace('…', '') + (t ? ' ' + t : '');
};

// returns {state: ok | bad | wait | info, msg}
BQ.checkNeed = function (p, need) {
  const s = BQ.settings(), g = BQ.state.geo;
  if (need.type === 'note') return need.done ? { state: 'ok', msg: 'Marked as handled' } : { state: 'info', msg: 'Reminder — mark as handled when done' };
  if (!p.table) return { state: 'wait', msg: 'Not seated yet' };
  const n = String(p.table), row = BQ.rowOf(n);
  switch (need.type) {
    case 'front':
      return row && row <= s.frontRows ? { state: 'ok', msg: 'Row ' + row + ' from the stage' }
        : { state: 'bad', msg: 'Table ' + n + ' is row ' + row + ' (front = rows 1–' + s.frontRows + ')' };
    case 'back':
      return row && row > g.maxRow - s.backRows ? { state: 'ok', msg: 'Row ' + row + ' of ' + g.maxRow }
        : { state: 'bad', msg: 'Table ' + n + ' is row ' + row + ' of ' + g.maxRow };
    case 'exit': {
      const d = g.exitDist[n];
      if (!isFinite(d)) return { state: 'bad', msg: 'No exits are marked on the room layout' };
      return d <= s.exitSpacing ? { state: 'ok', msg: 'Close to an exit' } : { state: 'bad', msg: 'Table ' + n + ' is not close to an exit' };
    }
    case 'access': {
      const d = g.exitDist[n];
      const ok = g.edge[n] || (isFinite(d) && d <= s.exitSpacing);
      return ok ? { state: 'ok', msg: g.edge[n] ? 'Edge/aisle table' : 'Close to an exit' }
        : { state: 'bad', msg: 'Table ' + n + ' is boxed in by other tables' };
    }
    case 'aisle':
      return g.edge[n] ? { state: 'ok', msg: 'Edge/aisle table' } : { state: 'bad', msg: 'Table ' + n + ' is in the middle of the room' };
    case 'near': case 'same': case 'away': {
      const ts = BQ.targetParties(need.target, p.id);
      if (!ts.length) return { state: 'bad', msg: 'Can’t find “' + BQ.targetLabel(need) + '”' };
      const seated = ts.filter(t => t.table);
      if (need.type === 'away') {
        const close = seated.filter(t => BQ.tableDist(t.table, n) <= s.nearSpacing);
        return close.length ? { state: 'bad', msg: 'Too close to ' + close[0].name + ' (Table ' + close[0].table + ')' }
          : { state: 'ok', msg: 'Not near ' + BQ.targetLabel(need) };
      }
      if (!seated.length) return { state: 'wait', msg: BQ.targetLabel(need) + ' isn’t seated yet' };
      if (need.type === 'same') {
        const hit = seated.find(t => String(t.table) === n);
        return hit ? { state: 'ok', msg: 'Same table as ' + hit.name } : { state: 'bad', msg: BQ.targetLabel(need) + ' is at Table ' + seated[0].table };
      }
      const close = seated.filter(t => BQ.tableDist(t.table, n) <= s.nearSpacing + 0.001);
      // for a whole award group, "near" means near most of the group, not just one person
      const isGroup = typeof need.target === 'string' && need.target.indexOf('award:') === 0;
      const ok = isGroup ? close.length >= Math.ceil(seated.length / 2) : close.length > 0;
      if (ok) return { state: 'ok', msg: isGroup ? 'Near ' + close.length + ' of ' + seated.length + ' in the group' : 'Near ' + close[0].name + ' (Table ' + close[0].table + ')' };
      const tbls = Array.from(new Set(seated.map(t => t.table))).sort(BQ.numSort);
      return { state: 'bad', msg: isGroup ? 'Only near ' + close.length + ' of ' + seated.length + '; the group is at Tables ' + tbls.join(', ') : BQ.targetLabel(need) + ' is at Table ' + tbls.join(', ') };
    }
    case 'table':
      return String(need.target) === n ? { state: 'ok', msg: 'At Table ' + n } : { state: 'bad', msg: 'Asked for Table ' + need.target + ', now at ' + n };
    case 'zone': {
      const t = BQ.tableByNum(n);
      return t && t.zone === need.target ? { state: 'ok', msg: 'In ' + need.target } : { state: 'bad', msg: 'Table ' + n + ' isn’t in “' + need.target + '”' };
    }
  }
  return { state: 'info', msg: '' };
};

// Everything that needs attention, for the Requests screen and Home
BQ.allIssues = function () {
  const out = [];
  const s = BQ.settings();
  BQ.state.parties.forEach(p => {
    (p.needs || []).forEach((need, i) => {
      const r = BQ.checkNeed(p, need);
      out.push({ kind: 'need', party: p, need, idx: i, state: r.state, msg: r.msg });
    });
  });
  BQ.tables().forEach(t => {
    const u = BQ.tableUse(t);
    if (u.over > 0) out.push({ kind: 'over', table: t, state: 'bad', msg: 'Table ' + t.n + ' has ' + u.used + ' people for ' + u.cap + ' chairs' });
    if (u.hold && u.used > 0) out.push({ kind: 'hold', table: t, state: 'bad', msg: 'Table ' + t.n + ' is on hold but has guests seated' });
    if (u.reserved && u.used > 0) out.push({ kind: 'hold', table: t, state: 'bad', msg: 'Table ' + t.n + ' is reserved for ' + (t.res || 'a block') + ' but has guests seated' });
  });
  BQ.state.parties.forEach(p => {
    if (p.table && !BQ.tableByNum(p.table)) out.push({ kind: 'missing', party: p, state: 'bad', msg: p.name + ' is assigned to Table ' + p.table + ', which isn’t in the room layout' });
  });
  if (s.recipientsFront) {
    BQ.state.awards.forEach(a => (a.recipients || []).forEach(r => {
      const p = r.pid && BQ.partyById(r.pid);
      if (p && p.table && BQ.rowOf(p.table) > s.frontRows) out.push({ kind: 'award', party: p, state: 'bad', msg: r.name + ' (award: ' + a.name + ') is at Table ' + p.table + ', not near the front' });
    }));
  }
  return out;
};
BQ.partyIssueState = function (p) {
  let worst = 'ok';
  (p.needs || []).forEach(n => {
    const s = BQ.checkNeed(p, n).state;
    if (s === 'bad') worst = 'bad';
    else if ((s === 'info' || s === 'wait') && worst !== 'bad') worst = 'warn';
  });
  return worst;
};

/* ---------------------------------------------------------------------
   Find a seat — ranked table suggestions with plain-English reasons
   occupancy: optional {tableNum: usedSeats} override (used by auto-seat)
   --------------------------------------------------------------------- */
BQ.suggest = function (p, occupancy, limit) {
  const results = [];
  const seats = Number(p.seats) || 1;
  BQ.tables().forEach(t => {
    if (t.st === 'hold' || t.st === 'closed' || t.st === 'reserved') return;
    const u = BQ.tableUse(t, p.id);
    const used = occupancy && occupancy[t.n] != null ? occupancy[t.n] : u.used;
    const open = (Number(t.s) || 0) - used;
    if (open < seats) return;
    let score = 0;
    const reasons = [], problems = [];
    const fake = Object.assign({}, p, { table: String(t.n) });
    (p.needs || []).forEach(need => {
      if (need.type === 'note') return;
      const r = BQ.checkNeed(fake, need);
      if (r.state === 'ok') { score += 25; reasons.push((BQ.NEEDS[need.type] || {}).icon + ' ' + r.msg); }
      else if (r.state === 'bad') { score -= 40; problems.push((BQ.NEEDS[need.type] || {}).icon + ' ' + r.msg); }
    });
    // don't put someone next to the people they asked to avoid
    BQ.state.parties.forEach(o => {
      if (o.id === p.id || !o.table) return;
      (o.needs || []).forEach(need => {
        if (need.type !== 'away') return;
        if (BQ.targetParties(need.target, o.id).some(x => x.id === p.id) && BQ.tableDist(o.table, t.n) <= BQ.settings().nearSpacing) {
          score -= 40; problems.push('🚫 ' + o.name + ' asked to be away from this guest');
        }
      });
    });
    // sitting at the very same table as the people they asked to be near/with is best of all
    (p.needs || []).forEach(need => {
      if (need.type !== 'near' && need.type !== 'same') return;
      const mates = BQ.targetParties(need.target, p.id).filter(o => String(o.table) === String(t.n));
      if (mates.length) { score += 6 + mates.length * 3; if (need.type === 'near') reasons.push('👥 Same table as ' + mates.length + ' of them'); }
    });
    const left = open - seats;
    if (left === 0) { score += 12; reasons.push('✔ Fills the table exactly'); }
    else score -= Math.min(left, 8) * 0.6;
    if (used > 0) { score += 4; }
    if (p.aff) {
      const mates = BQ.partiesAt(t.n).filter(o => o.id !== p.id && o.aff && o.aff.toLowerCase() === p.aff.toLowerCase());
      if (mates.length) { score += 10; reasons.push('🤝 Sits with ' + p.aff); }
    }
    if (t.res) {
      const r = t.res.toLowerCase();
      if ((p.name + ' ' + p.aff + ' ' + p.type).toLowerCase().indexOf(r) >= 0 || r.indexOf((p.aff || '#').toLowerCase()) >= 0) { score += 15; reasons.push('🏷 Reserved for ' + t.res); }
      else { score -= 15; problems.push('🏷 Reserved for ' + t.res); }
    }
    if (!(p.needs || []).some(n => n.type === 'front') && BQ.rowOf(t.n) <= BQ.settings().frontRows && p.type === 'Guest') score -= 1;
    results.push({ table: t, open, left, score, reasons, problems });
  });
  results.sort((a, b) => b.score - a.score || BQ.numSort(a.table.n, b.table.n));
  return results.slice(0, limit || 6);
};

// Plan seats for everyone who's waiting (nothing is saved until applied)
BQ.planAutoSeat = function () {
  const occ = {};
  BQ.tables().forEach(t => { occ[t.n] = BQ.tableUse(t).used; });
  // people who want to sit near/with someone go after the people they're following
  const follows = p => (p.needs || []).some(n => (n.type === 'near' || n.type === 'same') && BQ.targetParties(n.target, p.id).some(t => !t.table)) ? 1 : 0;
  const waiting = BQ.unseated().slice().sort((a, b) =>
    (follows(a) - follows(b)) ||
    ((b.needs || []).filter(n => n.type !== 'note').length - (a.needs || []).filter(n => n.type !== 'note').length) ||
    (Number(b.seats) - Number(a.seats)) || a.name.localeCompare(b.name));
  const plan = [], stuck = [];
  // place parties one at a time so later suggestions see earlier choices
  const placed = {};
  waiting.forEach(p => {
    const orig = BQ.state.parties;
    // temporarily treat planned parties as seated for near/same checks
    BQ.state.parties = orig.map(o => placed[o.id] ? Object.assign({}, o, { table: placed[o.id] }) : o);
    const best = BQ.suggest(p, occ, 1)[0];
    BQ.state.parties = orig;
    if (best && best.score > -20) {
      occ[best.table.n] += Number(p.seats) || 0;
      placed[p.id] = String(best.table.n);
      plan.push({ party: p, table: String(best.table.n), reasons: best.reasons, problems: best.problems });
    } else stuck.push(p);
  });
  return { plan, stuck };
};

/* ---------------------------------------------------------------------
   Saving — every change goes through BQ.commit so it can be undone,
   logged, and shown in the "Saving… / Saved" indicator.
   change = { kind: 'party'|'award'|'event', before, after }
   --------------------------------------------------------------------- */
BQ.history = [];
BQ.pending = 0;

BQ.applyChange = async function (c, idMap) {
  const st = BQ.state, store = st.store;
  if (c.kind === 'event') {
    const e = Object.assign({}, st.event, c.after);
    await store.saveEvent(e);
    st.event = e;
    const i = st.events.findIndex(x => x.id === e.id);
    if (i >= 0) st.events[i] = e;
    BQ.refreshGeo();
    return;
  }
  const coll = c.kind === 'party' ? 'parties' : 'awards';
  const save = c.kind === 'party' ? 'saveParty' : 'saveAward';
  const del = c.kind === 'party' ? 'deleteParty' : 'deleteAward';
  if (c.after) {
    const obj = BQ.clone(c.after);
    obj.eventId = st.event.id;
    const hadId = obj.id && st[coll].some(x => x.id === obj.id);
    if (!hadId && obj.id) { const old = obj.id; delete obj.id; obj.id = await store[save](obj); if (idMap) idMap[old] = obj.id; }
    else obj.id = await store[save](obj);
    c.after.id = obj.id;
    const i = st[coll].findIndex(x => x.id === obj.id);
    if (i >= 0) st[coll][i] = obj; else st[coll].push(obj);
  } else if (c.before) {
    await store[del](c.before.id);
    st[coll] = st[coll].filter(x => x.id !== c.before.id);
  }
};

BQ.commit = async function (label, changes, opts) {
  opts = opts || {};
  changes = changes.filter(Boolean);
  if (!changes.length) return true;
  BQ.pending++; BQ.ui && BQ.ui.saveState('saving');
  try {
    const idMap = {};
    // limited parallelism keeps SharePoint happy on big batches
    const queue = changes.slice();
    const workers = [];
    for (let w = 0; w < (changes.length > 3 ? 4 : 1); w++) {
      workers.push((async () => { while (queue.length) await BQ.applyChange(queue.shift(), idMap); })());
    }
    await Promise.all(workers);
    if (Object.keys(idMap).length) await BQ.remapIds(idMap);
    if (!opts.noUndo) {
      BQ.history.push({ label, changes: changes.map(c => ({ kind: c.kind, before: BQ.clone(c.before), after: BQ.clone(c.after) })) });
      if (BQ.history.length > 60) BQ.history.shift();
    }
    BQ.pending--;
    BQ.ui && BQ.ui.saveState(BQ.pending ? 'saving' : 'saved');
    BQ.logAction(label, opts.details || BQ.describeChanges(changes));
    BQ.ui && BQ.ui.changed();
    return true;
  } catch (e) {
    BQ.pending--;
    console.error(e);
    BQ.ui && BQ.ui.saveState('error', e.message);
    BQ.ui && BQ.ui.toast('Couldn’t save: ' + e.message, 'bad');
    BQ.ui && BQ.ui.changed();
    return false;
  }
};

// After undoing a delete, the re-created record gets a new id — fix references to it.
BQ.remapIds = async function (idMap) {
  const fixes = [];
  BQ.state.parties.forEach(p => {
    let touched = false;
    const before = BQ.clone(p);
    (p.needs || []).forEach(n => { if (idMap[n.target]) { n.target = idMap[n.target]; touched = true; } });
    if (touched) fixes.push({ kind: 'party', before, after: BQ.clone(p) });
  });
  BQ.state.awards.forEach(a => {
    let touched = false;
    const before = BQ.clone(a);
    (a.recipients || []).forEach(r => { if (idMap[r.pid]) { r.pid = idMap[r.pid]; touched = true; } });
    if (touched) fixes.push({ kind: 'award', before, after: BQ.clone(a) });
  });
  for (const f of fixes) await BQ.applyChange(f);
  // keep the undo history pointing at the new ids
  BQ.history.forEach(h => h.changes.forEach(c => {
    [c.before, c.after].forEach(o => { if (o && idMap[o.id]) o.id = idMap[o.id]; });
  }));
};

// Combine several saves into one Undo step (everything saved since history length `since`)
BQ.mergeHistory = function (since, label) {
  if (BQ.history.length - since < 2) { if (BQ.history.length > since) BQ.history[BQ.history.length - 1].label = label; return; }
  const parts = BQ.history.splice(since);
  BQ.history.push({ label, changes: [].concat.apply([], parts.map(h => h.changes)) });
  BQ.ui && BQ.ui.updateChrome();
};

BQ.undo = async function () {
  const h = BQ.history.pop();
  if (!h) { BQ.ui.toast('Nothing to undo'); return; }
  const inverse = h.changes.slice().reverse().map(c => ({ kind: c.kind, before: c.after, after: c.before }));
  const ok = await BQ.commit('Undo: ' + h.label, inverse, { noUndo: true });
  if (ok) BQ.ui.toast('Undid: ' + h.label);
  else BQ.history.push(h);
};

BQ.describeChanges = function (changes) {
  return changes.slice(0, 12).map(c => {
    const o = c.after || c.before || {};
    if (c.kind === 'event') return 'Room/settings updated';
    const verb = !c.before ? 'added' : !c.after ? 'removed' : 'updated';
    if (c.kind === 'party') return (o.name || 'Guest') + ' ' + verb + (c.after && c.after.table ? ' (Table ' + c.after.table + ')' : '');
    return 'Award ' + (o.name || '') + ' ' + verb;
  }).join('; ') + (changes.length > 12 ? '; +' + (changes.length - 12) + ' more' : '');
};

BQ.logAction = function (action, details) {
  const st = BQ.state;
  if (!st.store || !st.event) return;
  st.store.log(st.event.id, action, details).catch(e => {
    console.error('Activity log write failed', e);
    BQ.ui && BQ.ui.logFailed(e.message);
  });
};

/* Convenience change builders */
BQ.partyChange = (before, mutate) => {
  const after = BQ.clone(before);
  mutate(after);
  return { kind: 'party', before: BQ.clone(before), after };
};
BQ.eventChange = (mutate) => {
  const e = BQ.state.event;
  const before = { layout: BQ.clone(e.layout), settings: BQ.clone(e.settings), title: e.title, date: e.date, venue: e.venue, status: e.status };
  const after = BQ.clone(before);
  mutate(after);
  return { kind: 'event', before, after };
};

/* Seat a party (or unseat with table = '') */
BQ.seatParty = async function (pid, tableNum, opts) {
  const p = BQ.partyById(pid);
  if (!p) return false;
  const label = tableNum ? 'Seated ' + p.name + ' at Table ' + tableNum : 'Unseated ' + p.name;
  return BQ.commit(label, [BQ.partyChange(p, a => { a.table = tableNum ? String(tableNum) : ''; })], opts);
};

/* Split a party: move `count` seats into a new linked party */
BQ.splitParty = async function (pid, count, tableNum) {
  const p = BQ.partyById(pid);
  if (!p || count <= 0 || count >= p.seats) return false;
  const group = p.group || ('g' + BQ.uid());
  const keep = BQ.partyChange(p, a => { a.seats = p.seats - count; a.group = group; });
  const part = BQ.clone(p);
  delete part.id;
  Object.assign(part, { seats: count, group, table: tableNum ? String(tableNum) : '', guests: [], checkedIn: 0, pinned: false, needs: BQ.clone(p.needs || []) });
  return BQ.commit('Split ' + p.name + ' (' + count + ' seat' + (count > 1 ? 's' : '') + ' moved)', [keep, { kind: 'party', before: null, after: part }]);
};

/* Every person name we know (party leaders + named guests) — for alphabetical lists, award recipient lookup, etc. */
BQ.people = function () {
  const out = [];
  BQ.state.parties.forEach(p => {
    const org = BQ.isOrg(p);
    out.push({ name: p.name, party: p, leader: true, org });
    (p.guests || []).forEach(gname => { if (gname && gname.toLowerCase() !== p.name.toLowerCase()) out.push({ name: gname, party: p, leader: false, org: false }); });
  });
  return out;
};
// Find the guest record for a person's name (and badge, when known).
// Returns null when there's no match OR when it's ambiguous (two different people with that name).
BQ.findPartyForName = function (name, badge) {
  const key = BQ.personKey(name);
  if (!key) return null;
  badge = String(badge || BQ.cleanPerson(name).badge || '').trim();
  let hits = BQ.people().filter(x => BQ.personKey(x.name) === key);
  if (badge) {
    const exact = hits.filter(x => x.leader && x.party.badge === badge);
    if (exact.length) return exact[0].party;
    hits = hits.filter(x => !(x.leader && x.party.badge && x.party.badge !== badge));   // a different badge = a different person
  }
  const parties = Array.from(new Set(hits.map(x => x.party)));
  return parties.length === 1 ? parties[0] : null;
};

/* Chair colors for one table: [{color, pid}] for each chair */
BQ.chairPlan = function (t) {
  const u = BQ.tableUse(t);
  const chairs = [];
  let gi = 0, oi = 0;
  u.parties.slice().sort((a, b) => (a.id || 0) - (b.id || 0)).forEach(p => {
    let color = BQ.CHAIR_TYPE[p.type];
    if (!color) color = BQ.isOrg(p) ? BQ.CHAIR_ORG[oi++ % BQ.CHAIR_ORG.length] : BQ.CHAIR_GUEST[gi++ % BQ.CHAIR_GUEST.length];
    for (let i = 0; i < (Number(p.seats) || 0); i++) chairs.push({ color, pid: p.id, name: p.name });
  });
  return chairs;
};

/* ---------------------------------------------------------------------
   VIP reception (before the banquet — no seating, just who may attend)
   --------------------------------------------------------------------- */
BQ.vipCount = p => p && p.vip ? Math.max(1, Number(p.vipCount) || Number(p.seats) || 1) : 0;

/* ---------------------------------------------------------------------
   Awards: titles, ranks, recipient names
   --------------------------------------------------------------------- */
BQ.awardTitle = a => (a.logNo ? a.logNo + ' · ' : '') + (a.name || 'Award');
BQ.RANKS = [
  [/^asst\.?\s*chief|assistant chief/i, 'Asst. Chief'], [/^deputy chief/i, 'Deputy Chief'], [/^chief/i, 'Chief'],
  [/^major/i, 'Maj.'], [/^lieutenant|^lt\b/i, 'Lt.'], [/^serge?a?nt|^sgt/i, 'Sgt.'],
  [/^(senior|sr)\.?\s*corporal|^sr\.?\s*cpl/i, 'Sr. Cpl.'], [/^corporal|^cpl/i, 'Cpl.'],
  [/^police officer|^p\.?o\.?$/i, 'P.O.'], [/^officer/i, 'Officer'], [/^detective|^det\b/i, 'Det.'],
  [/^professional staff|^civilian/i, '']
];
BQ.rankShort = function (rank) {
  const r = String(rank || '').trim();
  if (!r) return '';
  for (const [re, v] of BQ.RANKS) if (re.test(r)) return v;
  return r.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};
BQ.recipLabel = function (r, o) {
  o = o || {};
  const rk = BQ.rankShort(r.rank);
  return (rk && !o.noRank ? rk + ' ' : '') + (r.name || '') + (r.badge && !o.noBadge ? ' #' + r.badge : '') + (r.unit && !o.noUnit ? ' · ' + r.unit : '');
};
// "John_Smith_1234" → {name: "John Smith", badge: "1234"};  "Mary_Ann_Lee" → {name: "Mary Ann Lee"}
// Also accepts a rank on the end ("John_Smith_SGT", "John_Smith_1234_Sr Cpl") and returns it as rankTag.
BQ.RANK_TOKEN = /^(p\.?\s?o\.?|police officer|officer|ofc\.?|sr\.?\s*cpl\.?|senior\.?\s*corporal|sr\.?\s*corporal|cpl\.?|corporal|sgt\.?|serge?a?nt|lt\.?|lieutenant|capt?\.?|captain|maj\.?|major|det\.?|detective|d\.?c\.?|deputy chief|a\.?c\.?|asst\.?\s*chief|assistant chief|chief|prof(essional)?\s*staff|civ(ilian)?)$/i;
BQ.parseAwardName = function (raw) {
  const s = String(raw || '').trim();
  if (!s) return { name: '', badge: '', rankTag: '' };
  const parts = s.split(/_+/).map(x => x.trim()).filter(Boolean);
  let badge = '', rankTag = '';
  for (let k = 0; k < 2 && parts.length > 1; k++) {
    const last = parts[parts.length - 1];
    if (!badge && /^#?\d{2,7}$/.test(last)) badge = parts.pop().replace('#', '');
    else if (!rankTag && parts.length > 2 && BQ.RANK_TOKEN.test(last)) rankTag = parts.pop();
    else break;
  }
  const c = BQ.cleanPerson(parts.join(' '));   // also catches "CARLOS GOMEZ #12963" written with spaces
  return { name: c.name, badge: badge || c.badge, rankTag };
};

/* ---------------------------------------------------------------------
   Reserved table blocks (e.g. "FDP Sponsors": whole tables, names unknown)
   --------------------------------------------------------------------- */
BQ.reservations = function () {
  const by = {};
  BQ.tables().filter(t => t.st === 'reserved').forEach(t => {
    const k = t.res || 'Reserved';
    (by[k] = by[k] || { label: k, tables: [], seats: 0 }).tables.push(String(t.n));
    by[k].seats += Number(t.s) || 0;
  });
  return Object.keys(by).sort().map(k => { by[k].tables.sort(BQ.numSort); return by[k]; });
};
// "3, 5, 9-12, 40" → ['3','5','9','10','11','12','40']
BQ.parseTableList = function (txt) {
  const out = [];
  String(txt || '').split(/[,;\s]+/).filter(Boolean).forEach(tok => {
    const m = tok.replace(/^table/i, '').match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 500; i++) out.push(String(i)); }
    else out.push(tok.replace(/^table/i, '').replace(/\*$/, ''));
  });
  return Array.from(new Set(out.filter(Boolean)));
};

/* ---------------------------------------------------------------------
   Names & badges: "CARLOS GOMEZ #12963" → name "Carlos Gomez", badge "12963"
   --------------------------------------------------------------------- */
BQ.isAllCaps = s => /[A-Z]/.test(s) && s === s.toUpperCase() && s.replace(/[^A-Za-z]/g, '').length > 2;
BQ.titleCaseName = function (s) {
  return String(s || '').toLowerCase()
    .replace(/(^|[\s\-'’(])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bMc([a-z])/g, (m, a) => 'Mc' + a.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi)\b/g, m => m.toUpperCase());
};
BQ.cleanPerson = function (raw, o) {
  o = o || {};
  let s = String(raw || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  let badge = '', m;
  if ((m = s.match(/#\s*(\d{2,7})\b/))) badge = m[1];
  else if ((m = s.match(/\(\s*(?:badge\s*)?#?\s*(\d{3,7})\s*\)/i))) badge = m[1];
  else if ((m = s.match(/\bbadge\s*:?\s*(\d{3,7})\b/i))) badge = m[1];
  else if ((m = s.match(/(?:^|[\s,\-–])(\d{3,7})\s*$/))) badge = m[1];
  else if ((m = s.match(/^(\d{3,7})[\s,\-–]+(?=\D)/))) badge = m[1];
  if (m) s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length));
  s = s.replace(/\s+/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
  if (o.titleCase && BQ.isAllCaps(s)) s = BQ.titleCaseName(s);
  return { name: s, badge };
};
BQ.RANK_WORDS = /^(asst\.?\s+chief|assistant\s+chief|deputy\s+chief|chief|major|maj\.|captain|capt\.|lieutenant|lt\.|sergeant|sgt\.|senior\s+corporal|sr\.?\s*corporal|sr\.?\s*cpl\.?|corporal|cpl\.|detective|det\.|police\s+officer|p\.\s?o\.|officer|ofc\.|mr\.|mrs\.|ms\.|dr\.)\s+(?=\S+\s+\S)/i;
// Comparison key: ignores case, badge numbers, rank words and punctuation
BQ.personKey = function (name) {
  return BQ.cleanPerson(name).name.replace(BQ.RANK_WORDS, '').toLowerCase().replace(/[.,'’]/g, '').replace(/\s+/g, ' ').trim();
};

/* ---------------------------------------------------------------------
   Possible duplicates: same name on more than one guest record
   --------------------------------------------------------------------- */
BQ.pairKey = (a, b) => [a, b].sort((x, y) => x - y).join('|');
BQ.findDuplicates = function () {
  const notDup = new Set(BQ.settings().notDup || []);
  const groups = {};
  BQ.state.parties.forEach(p => { const k = BQ.personKey(p.name); if (k) (groups[k] = groups[k] || []).push(p); });
  const out = [];
  Object.keys(groups).forEach(k => {
    const ents = [];
    groups[k].forEach(p => { if (!(p.group && ents.some(e => e.group === p.group))) ents.push(p); });   // split parts of one party aren't duplicates
    if (ents.length < 2) return;
    let open = false;
    const differ = (x, y) => x.badge && y.badge && x.badge !== y.badge;   // different badge numbers = different people
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) if (!notDup.has(BQ.pairKey(ents[i].id, ents[j].id)) && !differ(ents[i], ents[j])) open = true;
    if (!open) return;
    const badges = new Set(ents.map(p => p.badge).filter(Boolean));
    out.push({ key: k, parties: ents, differentBadges: badges.size > 1 });
  });
  return out;
};
BQ.awardLinksTo = pid => BQ.state.awards.filter(a => (a.recipients || []).some(r => r.pid === pid));

/* Merge several guest records into one (awards and requests follow the kept record) */
BQ.mergeParties = async function (keepId, dropIds, seats) {
  const keep = BQ.partyById(keepId);
  const drops = dropIds.map(BQ.partyById).filter(Boolean);
  if (!keep || !drops.length) return false;
  const after = BQ.clone(keep);
  const lc = s => String(s || '').toLowerCase().trim();
  drops.forEach(d => {
    after.guests = (after.guests || []).concat((d.guests || []).filter(g => lc(g) !== lc(after.name) && !(after.guests || []).some(x => lc(x) === lc(g))));
    (d.needs || []).forEach(n => { if (!after.needs.some(x => x.type === n.type && String(x.target || '') === String(n.target || '') && (x.text || '') === (n.text || ''))) after.needs.push(BQ.clone(n)); });
    if (!after.badge && d.badge) after.badge = d.badge;
    if (!after.aff && d.aff) after.aff = d.aff;
    if (!after.table && d.table) after.table = d.table;
    if (!after.phone && d.phone) after.phone = d.phone;
    if (!after.email && d.email) after.email = d.email;
    if (d.notes && after.notes.indexOf(d.notes) < 0) after.notes = [after.notes, d.notes].filter(Boolean).join(' | ');
    if (d.vip) { after.vip = true; after.vipCount = Math.max(BQ.vipCount(after), BQ.vipCount(d)); }
    after.checkedIn = Math.max(after.checkedIn || 0, d.checkedIn || 0);
    after.vipIn = Math.max(after.vipIn || 0, d.vipIn || 0);
    after.pinned = after.pinned || d.pinned;
  });
  after.seats = Math.max(1, Number(seats) || after.seats);
  const dropSet = new Set(drops.map(d => d.id));
  after.needs = (after.needs || []).filter(n => !(dropSet.has(Number(n.target)) || Number(n.target) === keep.id));
  const changes = [{ kind: 'party', before: BQ.clone(keep), after }];
  // awards: point every recipient at the kept record (and drop a duplicate line within the same award)
  BQ.state.awards.forEach(a => {
    if (!(a.recipients || []).some(r => dropSet.has(r.pid))) return;
    const na = BQ.clone(a);
    const seen = new Set();
    na.recipients = na.recipients.map(r => dropSet.has(r.pid) ? Object.assign(r, { pid: keep.id, badge: r.badge || after.badge || '' }) : r)
      .filter(r => { const k = r.pid ? 'p' + r.pid : 'n' + lc(r.name); if (r.pid === keep.id && seen.has(k)) return false; seen.add(k); return true; });
    changes.push({ kind: 'award', before: BQ.clone(a), after: na });
  });
  // other guests' requests that pointed at a removed record
  BQ.state.parties.forEach(p => {
    if (p.id === keep.id || dropSet.has(p.id)) return;
    if ((p.needs || []).some(n => dropSet.has(Number(n.target)))) changes.push(BQ.partyChange(p, x => x.needs.forEach(n => { if (dropSet.has(Number(n.target))) n.target = keep.id; })));
  });
  drops.forEach(d => changes.push({ kind: 'party', before: BQ.clone(d), after: null }));
  return BQ.commit('Merged ' + drops.length + ' duplicate' + (drops.length > 1 ? 's' : '') + ' into ' + after.name, changes);
};

/* Award recipients that aren't linked (or point to a deleted guest) but match exactly one guest */
BQ.relinkableRecipients = function () {
  const out = [];
  BQ.state.awards.forEach(a => (a.recipients || []).forEach((r, i) => {
    if (!r.name || r.pid === -1 || (r.pid && BQ.partyById(r.pid))) return;   // -1 = unlinked on purpose
    const p = BQ.findPartyForName(r.name, r.badge);
    if (p) out.push({ a, i, r, p });
  }));
  return out;
};
BQ.relinkRecipients = function () {
  const items = BQ.relinkableRecipients();
  const byAward = new Map();
  items.forEach(it => { const na = byAward.get(it.a.id) || BQ.clone(it.a); na.recipients[it.i].pid = it.p.id; byAward.set(it.a.id, na); });
  const changes = Array.from(byAward.entries()).map(([id, after]) => ({ kind: 'award', before: BQ.clone(BQ.state.awards.find(x => x.id === id)), after }));
  return changes.length ? BQ.commit('Linked ' + BQ.plural(items.length, 'award recipient') + ' to their guest records', changes) : Promise.resolve(true);
};

/* One-time clean-up: badges stuck in names (and optionally ALL-CAPS names) */
BQ.scanNameFixes = function (titleCase) {
  const fixes = [];
  BQ.state.parties.forEach(p => {
    if (BQ.isOrg(p)) return;
    const c = BQ.cleanPerson(p.name, { titleCase });
    const guests = (p.guests || []).map(g => BQ.cleanPerson(g, { titleCase }));
    const gChanged = guests.some((g, i) => g.name !== p.guests[i]);
    if (c.name !== p.name || (c.badge && !p.badge) || gChanged) {
      fixes.push({ kind: 'party', label: p.name + (gChanged ? ' (+ guest names)' : ''), to: c.name + (c.badge || p.badge ? ' #' + (p.badge || c.badge) : ''),
        change: BQ.partyChange(p, a => { a.name = c.name || a.name; if (c.badge && !a.badge) a.badge = c.badge; a.guests = guests.map(g => g.name); }) });
    }
  });
  BQ.state.awards.forEach(a => {
    const na = BQ.clone(a);
    let changed = false;
    (na.recipients || []).forEach(r => {
      if (r.count > 1 && !r.badge && !/#\d/.test(r.name)) return;   // group lines like "Robbery Unit ×6"
      const c = BQ.cleanPerson(r.name, { titleCase });
      if (c.name !== r.name || (c.badge && !r.badge)) {
        fixes.push({ kind: 'award', label: r.name + ' (award ' + BQ.awardTitle(a) + ')', to: c.name + (c.badge || r.badge ? ' #' + (r.badge || c.badge) : '') });
        r.name = c.name || r.name; if (c.badge && !r.badge) r.badge = c.badge; changed = true;
      }
    });
    if (changed) fixes.push({ kind: 'awardChange', change: { kind: 'award', before: BQ.clone(a), after: na } });
  });
  return fixes;
};

/* Other guest records with the same person's name (a different badge number means a different person) */
BQ.sameNameParties = function (name, badge, excludeId) {
  const key = BQ.personKey(name);
  if (!key) return [];
  badge = String(badge || BQ.cleanPerson(name).badge || '');
  const notDup = new Set(BQ.settings().notDup || []);
  return BQ.state.parties.filter(x => x.id !== excludeId && !BQ.isOrg(x) && BQ.personKey(x.name) === key &&
    !(badge && x.badge && x.badge !== badge) && !(excludeId && notDup.has(BQ.pairKey(x.id, excludeId))));
};
/* Remember that these records are different people (stops the duplicate alert) */
BQ.markNotDuplicates = function (ids, opts) {
  ids = ids.filter(Boolean);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(BQ.pairKey(ids[i], ids[j]));
  const live = new Set(BQ.state.parties.map(p => p.id));
  return BQ.commit((opts && opts.label) || 'Marked as different people', [BQ.eventChange(e => {
    e.settings = e.settings || {};
    const keep = (e.settings.notDup || []).filter(k => k.split('|').every(id => live.has(Number(id))));   // forget deleted records
    e.settings.notDup = Array.from(new Set(keep.concat(pairs)));
  })], { noUndo: !(opts && opts.undo) });
};
