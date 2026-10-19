/* =====================================================================
   screens.js — app shell, dialogs, and the everyday screens:
   Home, Guest List, Table Rosters, Requests & Rules, Check-In, Settings.
   Also startup (sign-in / practice mode / first event).
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.screens = BQ.screens || {};

/* ---------------------------------------------------------------------
   UI helpers: dialogs, toasts, save indicator, navigation
   --------------------------------------------------------------------- */
BQ.ui = {
  current: 'home',

  modal(o) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + BQ.esc(o.title || '') + '</h2><button class="x" aria-label="Close">✕</button></div>' +
      '<div class="modal-body">' + (o.body || '') + '</div>' +
      '<div class="modal-foot">' + (o.left || '') + '<span class="grow"></span>' +
      (o.buttons || [{ label: 'OK', cls: 'primary' }]).map((b, i) => '<button class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + BQ.esc(b.label) + '</button>').join('') +
      '</div></div>';
    document.body.appendChild(wrap);
    const m = { el: wrap, close() { wrap.remove(); document.removeEventListener('keydown', key); if (o.onClose) o.onClose(); } };
    const key = e => { if (e.key === 'Escape' && document.body.lastElementChild === wrap) m.close(); };
    document.addEventListener('keydown', key);
    wrap.querySelector('.x').onclick = () => m.close();
    wrap.querySelectorAll('.modal-foot [data-i]').forEach(btn => {
      btn.onclick = async () => {
        const b = (o.buttons || [])[Number(btn.dataset.i)];
        if (b && b.onClick) {
          btn.disabled = true;
          const r = await b.onClick(m);
          btn.disabled = false;
          if (r === false) return;
        }
        m.close();
      };
    });
    return m;
  },

  confirm(msg, okLabel) {
    return new Promise(res => {
      let done = false;
      BQ.ui.modal({
        title: 'Please confirm', body: '<p>' + BQ.esc(msg) + '</p>',
        buttons: [{ label: 'Cancel', onClick: () => { done = true; res(false); } }, { label: okLabel || 'OK', cls: 'primary', onClick: () => { done = true; res(true); } }],
        onClose: () => { if (!done) res(false); }
      });
    });
  },

  choose(title, html, options) {
    return new Promise(res => {
      let done = false;
      const m = BQ.ui.modal({
        title, body: '<p>' + html + '</p><div class="choices">' + options.map((o, i) => '<button class="btn block ' + (o.cls || '') + '" data-c="' + i + '">' + BQ.esc(o.label) + '</button>').join('') + '</div>',
        buttons: [], onClose: () => { if (!done) res(null); }
      });
      m.el.querySelector('.modal-foot').style.display = 'none';
      m.el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { done = true; m.close(); res(options[Number(b.dataset.c)].value); });
    });
  },

  prompt(title, placeholder, value) {
    return new Promise(res => {
      let done = false;
      const m = BQ.ui.modal({
        title, body: '<input id="pr" class="block" placeholder="' + BQ.esc(placeholder || '') + '" value="' + BQ.esc(value || '') + '"/>',
        buttons: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: 'OK', cls: 'primary', onClick: () => { done = true; res(m.el.querySelector('#pr').value.trim() || null); } }],
        onClose: () => { if (!done) res(null); }
      });
      const inp = m.el.querySelector('#pr');
      setTimeout(() => inp.focus(), 30);
      inp.onkeydown = e => { if (e.key === 'Enter') { done = true; res(inp.value.trim() || null); m.close(); } };
    });
  },

  toast(msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), kind === 'bad' ? 7000 : 3500);
    setTimeout(() => t.remove(), kind === 'bad' ? 7600 : 4100);
  },

  segs(root) {
    root.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', e => { e.preventDefault(); seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
    }));
  },

  saveState(s, msg) {
    const el = document.getElementById('saveState');
    if (!el) return;
    el.className = 'savestate ' + s;
    el.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? '⚠ Not saved — check connection' : '✓ All changes saved';
    el.title = msg || '';
  },

  logFailed(msg) {
    const el = document.getElementById('logWarn');
    if (el) { el.hidden = false; el.title = 'The activity log could not be written: ' + msg + '. Your seating changes are still saved. Tell Jared.'; }
  },

  go(screen, opts) {
    if (BQ.ui.timer) { clearInterval(BQ.ui.timer); BQ.ui.timer = null; }
    BQ.ui.current = screen;
    try { sessionStorage.setItem('bq_screen', screen); } catch (e) { /* ignore */ }
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.s === screen));
    const main = document.getElementById('main');
    main.className = 'main scr-' + screen;
    const scr = BQ.screens[screen] || BQ.screens.home;
    document.title = scr.title + ' · ' + BQ.config.appName;
    scr.render(main, opts || {});
    BQ.ui.updateChrome();
    main.scrollTop = 0;
  },

  changed() {
    const scr = BQ.screens[BQ.ui.current];
    const main = document.getElementById('main');
    if (!scr || !main) return;
    if (scr.refresh) scr.refresh(); else scr.render(main, {});
    BQ.ui.updateChrome();
  },

  updateChrome() {
    const u = document.getElementById('btnUndo');
    if (u) {
      const h = BQ.history[BQ.history.length - 1];
      u.disabled = !h;
      u.title = h ? 'Undo: ' + h.label : 'Nothing to undo';
    }
    const w = document.getElementById('navWaiting');
    if (w) { const n = BQ.unseated().length; w.textContent = n; w.hidden = !n; }
    const r = document.getElementById('navIssues');
    if (r) { const n = BQ.allIssues().filter(i => i.state === 'bad').length; r.textContent = n; r.hidden = !n; }
  }
};

/* ---------------------------------------------------------------------
   App shell
   --------------------------------------------------------------------- */
BQ.NAV = [
  ['home', '🏠', 'Home'], ['seat', '🪑', 'Seating Map', 'navWaiting'], ['guests', '📋', 'Guest List'],
  ['tables', '🍽️', 'Table Rosters'], ['requests', '✅', 'Requests & Rules', 'navIssues'], ['awards', '🏆', 'Awards'],
  ['checkin', '🚪', 'Check-In'], ['exports', '🖨️', 'Print & Export'], ['layout', '📐', 'Room Layout'], ['settings', '⚙️', 'Settings']
];

BQ.renderShell = function () {
  const st = BQ.state;
  const practice = st.store.kind === 'practice';
  document.getElementById('app').innerHTML =
    (practice ? '<div class="practice-bar">' + (BQ.config.demo ? 'PREVIEW with made-up sample people. Changes stay in your browser. Downloads and printing are off in this preview.' : 'PRACTICE MODE — changes are saved only in this browser, not in SharePoint. <a href="#" id="leavePractice">Leave practice mode</a>') + '</div>' : '') +
    '<header class="topbar">' +
    '  <div class="brand"><span class="badge-logo">★</span><div><b>' + BQ.esc(BQ.config.appName) + '</b><small>Dallas Police Department</small></div></div>' +
    '  <select id="evSel" class="evsel" title="Switch event">' + st.events.map(e => '<option value="' + e.id + '"' + (st.event && e.id === st.event.id ? ' selected' : '') + '>' + BQ.esc(e.title) + '</option>').join('') + '<option value="__new">＋ New event…</option></select>' +
    '  <span class="grow"></span>' +
    '  <a class="btn ghost kiosk-only" href="?mode=full' + (practice ? '#practice' : '') + '">Full app</a>' +
    '  <span id="logWarn" class="logwarn" hidden>⚠ Activity log</span>' +
    '  <span id="saveState" class="savestate saved">✓ All changes saved</span>' +
    '  <button class="btn" id="btnUndo" disabled>↶ Undo</button>' +
    '  <button class="btn ghost lookbtn" id="btnLook" title="Look & Feel: colors and background">🎨</button>' +
    '  <button class="btn ghost" id="btnRefresh" title="Load the latest changes">⟳</button>' +
    '  <span class="user">' + BQ.esc(practice ? 'Practice' : (BQ.auth.user.name || '')) + '</span>' +
    (practice ? '' : '  <button class="btn ghost" id="btnOut">Sign out</button>') +
    '</header>' +
    '<div class="body"><nav class="nav">' + BQ.NAV.map(n => '<a href="#" data-s="' + n[0] + '"><span class="ic">' + n[1] + '</span><span class="lbl">' + n[2] + '</span>' +
      (n[3] ? '<span class="nbadge" id="' + n[3] + '" hidden></span>' : '') + '</a>').join('') +
    '<div class="nav-foot"><a href="#" id="helpLink">❓ Help</a></div></nav>' +
    '<main id="main" class="main"></main></div>';
  document.querySelectorAll('.nav a[data-s]').forEach(a => a.onclick = e => { e.preventDefault(); BQ.ui.go(a.dataset.s); });
  document.getElementById('btnUndo').onclick = () => BQ.undo();
  document.getElementById('btnLook').onclick = () => BQ.look.dialog();
  document.getElementById('btnRefresh').onclick = () => BQ.reload();
  document.getElementById('helpLink').onclick = e => { e.preventDefault(); BQ.showHelp(); };
  const out = document.getElementById('btnOut');
  if (out) out.onclick = () => BQ.auth.logout();
  const lp = document.getElementById('leavePractice');
  if (lp) lp.onclick = e => { e.preventDefault(); try { sessionStorage.removeItem('bq_mode'); } catch (x) { /* */ } location.hash = ''; location.reload(); };
  document.getElementById('evSel').onchange = async e => {
    if (e.target.value === '__new') { e.target.value = st.event.id; BQ.newEventDialog(); return; }
    await BQ.openEvent(Number(e.target.value));
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('.modal-wrap')) { e.preventDefault(); BQ.undo(); }
  });
};

BQ.showHelp = function () {
  BQ.ui.modal({
    title: 'How this works', wide: true,
    body: '<div class="help">' +
      '<p><b>1. Add guests.</b> Each request is a “party”: one person or family, or a whole unit or organization, with a number of seats. Guest names are optional. Add them when you have them.</p>' +
      '<p><b>2. Note special requests.</b> In a guest’s details, tick boxes like 🔊 <i>Near the front</i>, 🚪 <i>Near an exit</i>, ♿ <i>Wheelchair access</i>, or 🤝 <i>Near another unit</i>. The app checks every request and tells you if a seat doesn’t meet it.</p>' +
      '<p><b>3. Seat them.</b> On the <b>Seating Map</b>, drag names onto tables. Click a name to see the best tables for that guest. Click a table to see who is there, add chairs, or put it on hold.</p>' +
      '<p><b>4. Make your own rules.</b> Put tables on hold (“leave empty”), reserve them (“Volunteers”), or group tables into <b>areas</b> (“Command staff”). Then ask for “In a certain area” on a guest.</p>' +
      '<p><b>5. Print.</b> <b>Print & Export</b> makes your usual spreadsheet in the same format as before, plus an A–Z list, table rosters, check-in sheets, the awards lineup, and table tents.</p>' +
      '<p><b>Mistake?</b> Press <b>↶ Undo</b> at the top (or Ctrl+Z). Everything saves automatically. Watch for “✓ All changes saved”.</p></div>',
    buttons: [{ label: 'Got it', cls: 'primary' }]
  });
};

/* ---------------------------------------------------------------------
   Guest (party) dialog — add / edit
   --------------------------------------------------------------------- */
BQ.ui.openParty = function (p, defaults) {
  const isNew = !p;
  const d = isNew ? Object.assign({ name: '', type: 'Guest', aff: '', seats: 1, table: '', guests: [], needs: [], pay: '', payNote: '', phone: '', email: '', notes: '', pinned: false, checkedIn: 0, vip: false, vipCount: 0, vipIn: 0 }, defaults || {}) : BQ.clone(p);
  d.needs = d.needs || [];
  const affs = Array.from(new Set(BQ.state.parties.map(x => x.aff).filter(Boolean))).sort();
  const tables = BQ.tables().slice().sort((a, b) => BQ.numSort(a.n, b.n));
  const tableOpts = '<option value="">Not seated yet</option>' + tables.map(t => {
    const u = BQ.tableUse(t, d.id);
    return '<option value="' + BQ.esc(t.n) + '"' + (String(d.table) === String(t.n) ? ' selected' : '') + '>Table ' + BQ.esc(t.n) + ' — ' + (t.st === 'hold' ? 'on hold' : u.open + ' open') + '</option>';
  }).join('');

  const body =
    '<div class="pform">' +
    '<div class="field"><label>Name <span class="muted">(person, family, unit, or organization)</span></label><input id="pfName" class="big" value="' + BQ.esc(d.name) + '" placeholder="e.g. Laura Dodd   or   Robbery Unit"/></div>' +
    '<div class="field"><label>What kind of guest?</label><div class="chips" id="pfType">' + BQ.PARTY_TYPES.map(t =>
      '<button data-v="' + t.k + '" class="' + (d.type === t.k ? 'on' : '') + '">' + t.icon + ' ' + BQ.esc(t.label) + '</button>').join('') + '</div></div>' +
    '<div class="field two"><div><label>Unit / organization <span class="muted">(optional)</span></label><input id="pfAff" list="pfAffs" value="' + BQ.esc(d.aff) + '" placeholder="e.g. Robbery Unit"/><datalist id="pfAffs">' + affs.map(a => '<option value="' + BQ.esc(a) + '">').join('') + '</datalist></div>' +
    '<div><label>Number of seats</label><div class="stepper"><button id="pfMinus">－</button><input id="pfSeats" type="number" min="1" value="' + (d.seats || 1) + '"/><button id="pfPlus">＋</button></div></div></div>' +
    '<div class="field two"><div><label>Table</label><select id="pfTable">' + tableOpts + '</select></div>' +
    '<div><label>&nbsp;</label><label class="chk"><input type="checkbox" id="pfPin"' + (d.pinned ? ' checked' : '') + '/> 📌 Pin to this table (no accidental moves)</label></div></div>' +
    '<div class="field vipbox"><label class="chk"><input type="checkbox" id="pfVip"' + (d.vip ? ' checked' : '') + '/> ⭐ <b>Invited to the VIP reception</b> <span class="muted">(before the banquet, no seating)</span></label>' +
    '<span id="pfVipN"' + (d.vip ? '' : ' hidden') + '> · admits <input id="pfVipCount" type="number" min="1" value="' + (d.vipCount || d.seats || 1) + '" style="width:70px"/> <span class="muted">of the party</span></span></div>' +
    '<div class="field"><label>Guest names <span class="muted">(optional, one per line)</span> <span id="pfNamed" class="muted"></span></label><textarea id="pfGuests" rows="3" placeholder="Leave blank if you only know the count">' + BQ.esc((d.guests || []).join('\n')) + '</textarea></div>' +
    '<div class="field"><label>Special requests</label><div id="pfNeeds"></div>' +
    '<div class="needadd">' + Object.keys(BQ.NEEDS).map(k => '<button data-k="' + k + '" title="' + BQ.esc(BQ.NEEDS[k].hint || '') + '">' + BQ.NEEDS[k].icon + ' ' + BQ.esc(BQ.NEEDS[k].label) + '</button>').join('') + '</div></div>' +
    '<div class="field two"' + (BQ.config.trackPayment ? '' : ' hidden') + '><div><label>Payment</label><select id="pfPay"><option value="">Not set</option>' + BQ.PAY.map(v => '<option' + (d.pay === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
    '<div><label>Payment note</label><input id="pfPayNote" value="' + BQ.esc(d.payNote) + '" placeholder="e.g. check #1042, $50/seat"/></div></div>' +
    '<div class="field two"><div><label>Phone</label><input id="pfPhone" value="' + BQ.esc(d.phone) + '"/></div><div><label>Email</label><input id="pfEmail" value="' + BQ.esc(d.email) + '"/></div></div>' +
    '<div class="field"><label>Notes</label><textarea id="pfNotes" rows="2">' + BQ.esc(d.notes) + '</textarea></div>' +
    '</div>';

  const m = BQ.ui.modal({
    title: isNew ? 'Add a guest or group' : 'Edit ' + d.name, wide: true, body,
    left: isNew ? '' : '<button class="btn danger" id="pfDel">Delete</button><button class="btn" id="pfSplit">Split party…</button>',
    buttons: [{ label: 'Cancel' }, { label: isNew ? 'Add' : 'Save', cls: 'primary', onClick: () => save() }]
  });
  const $ = s => m.el.querySelector(s);
  const seatsEl = $('#pfSeats');
  const namedInfo = () => { const n = $('#pfGuests').value.split(/\n/).filter(x => x.trim()).length; $('#pfNamed').textContent = n ? '· ' + n + ' named' : ''; };
  $('#pfGuests').oninput = namedInfo; namedInfo();
  $('#pfMinus').onclick = () => { seatsEl.value = Math.max(1, (parseInt(seatsEl.value, 10) || 1) - 1); };
  $('#pfPlus').onclick = () => { seatsEl.value = (parseInt(seatsEl.value, 10) || 0) + 1; };
  m.el.querySelectorAll('#pfType button').forEach(b => b.onclick = () => {
    m.el.querySelectorAll('#pfType button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (b.dataset.v === 'VIP' && !$('#pfVip').checked) { $('#pfVip').checked = true; $('#pfVipN').hidden = false; }
  });
  $('#pfVip').onchange = () => { $('#pfVipN').hidden = !$('#pfVip').checked; if ($('#pfVip').checked) $('#pfVipCount').value = Math.max(1, parseInt(seatsEl.value, 10) || 1); };

  const partyOptions = sel => {
    const others = BQ.state.parties.filter(x => x.id !== d.id).sort((a, b) => a.name.localeCompare(b.name));
    return '<option value="">Choose…</option>' +
      (affs.length ? '<optgroup label="Anyone from a unit / organization">' + affs.map(a => '<option value="aff:' + BQ.esc(a) + '"' + (sel === 'aff:' + a ? ' selected' : '') + '>' + BQ.esc(a) + ' (whole unit)</option>').join('') + '</optgroup>' : '') +
      '<optgroup label="A specific guest">' + others.map(x => '<option value="' + x.id + '"' + (String(sel) === String(x.id) ? ' selected' : '') + '>' + BQ.esc(x.name) + (x.table ? ' — Table ' + BQ.esc(x.table) : '') + '</option>').join('') + '</optgroup>';
  };
  const drawNeeds = () => {
    const box = $('#pfNeeds');
    if (!d.needs.length) { box.innerHTML = '<div class="muted small">None. Tap a request below to add one.</div>'; return; }
    box.innerHTML = d.needs.map((n, i) => {
      const def = BQ.NEEDS[n.type] || { label: n.type, icon: '•' };
      let ctl = '';
      if (def.target === 'party') ctl = '<select data-i="' + i + '" class="nt">' + partyOptions(n.target) + '</select>';
      if (def.target === 'table') ctl = '<select data-i="' + i + '" class="nt"><option value="">Choose…</option>' + tables.map(t => '<option' + (String(n.target) === String(t.n) ? ' selected' : '') + '>' + BQ.esc(t.n) + '</option>').join('') + '</select>';
      if (def.target === 'zone') ctl = '<select data-i="' + i + '" class="nt"><option value="">Choose…</option>' + (BQ.settings().zones || []).map(z => '<option' + (n.target === z.name ? ' selected' : '') + '>' + BQ.esc(z.name) + '</option>').join('') + '<option value="__new">＋ New area…</option></select>';
      if (def.target === 'text') ctl = '<input data-i="' + i + '" class="nt" value="' + BQ.esc(n.text || '') + '" placeholder="Describe the request"/>' +
        '<label class="chk small"><input type="checkbox" data-done="' + i + '"' + (n.done ? ' checked' : '') + '/> handled</label>';
      let status = '';
      if (!isNew && d.table) { const r = BQ.checkNeed(Object.assign({}, d, { table: $('#pfTable') ? $('#pfTable').value : d.table }), n); status = '<span class="nstat n-' + r.state + '">' + BQ.esc(r.msg) + '</span>'; }
      return '<div class="needrow"><span class="nlabel">' + def.icon + ' ' + BQ.esc(def.label) + '</span>' + ctl + status + '<button class="x" data-rm="' + i + '" title="Remove">✕</button></div>';
    }).join('');
    box.querySelectorAll('.nt').forEach(c => c.onchange = async () => {
      const i = Number(c.dataset.i), n = d.needs[i];
      if (BQ.NEEDS[n.type].target === 'text') n.text = c.value;
      else if (c.value === '__new') { const z = await BQ.newZone(); n.target = z || ''; drawNeeds(); }
      else n.target = BQ.NEEDS[n.type].target === 'party' && /^\d+$/.test(c.value) ? Number(c.value) : c.value;
    });
    box.querySelectorAll('[data-done]').forEach(c => c.onchange = () => { d.needs[Number(c.dataset.done)].done = c.checked; });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.needs.splice(Number(b.dataset.rm), 1); drawNeeds(); });
  };
  drawNeeds();
  m.el.querySelectorAll('.needadd button').forEach(b => b.onclick = e => {
    e.preventDefault();
    const k = b.dataset.k;
    if (!BQ.NEEDS[k].target && d.needs.some(n => n.type === k)) return;
    d.needs.push({ type: k, target: '' });
    drawNeeds();
  });
  $('#pfTable').onchange = drawNeeds;

  const collect = () => {
    const out = Object.assign({}, d, {
      name: $('#pfName').value.replace(/\s+/g, ' ').trim(),
      type: (m.el.querySelector('#pfType .on') || {}).dataset ? m.el.querySelector('#pfType .on').dataset.v : 'Guest',
      aff: $('#pfAff').value.trim(),
      seats: Math.max(1, parseInt(seatsEl.value, 10) || 1),
      table: $('#pfTable').value,
      pinned: $('#pfPin').checked,
      guests: $('#pfGuests').value.split(/\n/).map(x => x.trim()).filter(Boolean),
      pay: $('#pfPay').value, payNote: $('#pfPayNote').value.trim(),
      phone: $('#pfPhone').value.trim(), email: $('#pfEmail').value.trim(), notes: $('#pfNotes').value.trim(),
      vip: $('#pfVip').checked
    });
    out.vipCount = out.vip ? Math.max(1, parseInt($('#pfVipCount').value, 10) || out.seats) : 0;
    if (!out.vip) out.vipIn = 0;
    out.needs = d.needs.filter(n => !BQ.NEEDS[n.type].target || n.target || n.text);
    return out;
  };
  async function save() {
    const out = collect();
    if (!out.name) { BQ.ui.toast('Please type a name.', 'bad'); $('#pfName').focus(); return false; }
    if (out.table) {
      const t = BQ.tableByNum(out.table);
      const u = t && BQ.tableUse(t, out.id);
      if (u && u.open < out.seats && String(out.table) !== String(p && p.table)) {
        if (!(await BQ.ui.confirm('Table ' + out.table + ' only has ' + u.open + ' open seats for ' + out.seats + ' people. Save anyway?', 'Save anyway'))) return false;
      }
    }
    if (isNew) {
      out.checkedIn = 0;
      const ok = await BQ.commit('Added ' + out.name, [{ kind: 'party', before: null, after: out }]);
      if (ok) BQ.ui.toast('Added ' + out.name + (out.table ? ' at Table ' + out.table : ' to the waiting list'), 'ok');
      return ok;
    }
    return BQ.commit('Updated ' + out.name, [{ kind: 'party', before: BQ.clone(p), after: out }]);
  }
  if (!isNew) {
    $('#pfDel').onclick = async () => {
      if (!(await BQ.ui.confirm('Delete ' + p.name + ' (' + p.seats + ' seats)? You can Undo this.', 'Delete'))) return;
      m.close();
      BQ.commit('Deleted ' + p.name, [{ kind: 'party', before: BQ.clone(p), after: null }]);
    };
    $('#pfSplit').onclick = async () => {
      if (p.seats < 2) { BQ.ui.toast('A party of 1 can’t be split.'); return; }
      const v = await BQ.ui.prompt('How many of the ' + p.seats + ' seats should become a separate group? (They’ll wait for their own table.)', 'e.g. 2');
      const n = parseInt(v, 10);
      if (!(n > 0 && n < p.seats)) { if (v) BQ.ui.toast('Enter a number from 1 to ' + (p.seats - 1)); return; }
      m.close();
      BQ.splitParty(p.id, n);
    };
  }
  setTimeout(() => $('#pfName').focus(), 40);
  return m;
};

/* ---------------------------------------------------------------------
   HOME
   --------------------------------------------------------------------- */
BQ.screens.home = {
  title: 'Home',
  render(main) {
    const e = BQ.state.event, s = BQ.stats();
    const days = e.date ? Math.ceil((new Date(e.date) - new Date()) / 86400000) : null;
    const issues = BQ.allIssues();
    const bad = issues.filter(i => i.state === 'bad'), info = issues.filter(i => i.state === 'info');
    const pctSeated = s.requested ? Math.round(s.seated / s.requested * 100) : 0;
    const pctRoom = s.cap ? Math.round((s.cap - s.open) / s.cap * 100) : 0;
    const unlinked = BQ.state.awards.reduce((n, a) => n + (a.recipients || []).filter(r => !r.pid || !BQ.partyById(r.pid)).length, 0);
    const att = [];
    if (s.waitingParties) att.push(['seat', '🪑', BQ.plural(s.waitingParties, 'party').replace('partys', 'parties') + ' (' + s.waiting + ' seats) still waiting for a table']);
    bad.slice(0, 6).forEach(i => att.push(['requests', '⚠️', i.kind === 'need' ? i.party.name + ': ' + BQ.needText(i.need) + ' (' + i.msg + ')' : i.msg]));
    if (bad.length > 6) att.push(['requests', '⚠️', (bad.length - 6) + ' more request problems']);
    if (info.length) att.push(['requests', '📝', BQ.plural(info.length, 'reminder') + ' to check off']);
    if (BQ.config.trackPayment && s.unpaid) att.push(['guests', '💲', BQ.plural(s.unpaid, 'party').replace('partys', 'parties') + ' not marked paid']);
    if (unlinked) att.push(['awards', '🏆', BQ.plural(unlinked, 'award recipient') + ' not found on the guest list']);
    main.innerHTML =
      '<div class="page">' +
      '<div class="hero"><div><h1>' + BQ.esc(e.title) + '</h1><div class="muted">' + (e.date ? new Date(e.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date not set') +
      (e.venue ? ' · ' + BQ.esc(e.venue) : '') + '</div></div>' + (days != null && days >= 0 ? '<div class="countdown"><b>' + days + '</b><span>day' + (days === 1 ? '' : 's') + ' to go</span></div>' : '') + '</div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + s.requested + '</b><span>seats requested</span><small>' + BQ.plural(s.parties, 'party').replace('partys', 'parties') + (s.vipInvited ? ' · ⭐ ' + s.vipInvited + ' at VIP reception' : '') + '</small></div>' +
      '<div class="stat ok"><b>' + s.seated + '</b><span>seated</span><div class="meter"><div style="width:' + pctSeated + '%"></div></div></div>' +
      '<div class="stat ' + (s.waiting ? 'warn' : '') + '"><b>' + s.waiting + '</b><span>waiting for a table</span></div>' +
      '<div class="stat"><b>' + s.open + '</b><span>open seats in the room</span><small>' + pctRoom + '% of ' + s.cap + ' chairs used</small></div>' +
      '<div class="stat"><b>' + s.full + '<em>/' + (s.tables - s.hold) + '</em></b><span>tables full</span><small>' + s.hold + ' on hold</small></div>' +
      '</div>' +
      '<div class="actions">' +
      '<button class="action" data-a="add"><span>＋</span>Add a guest or group</button>' +
      '<button class="action" data-a="seat"><span>🪑</span>Open the seating map</button>' +
      '<button class="action" data-a="exports"><span>🖨️</span>Print &amp; export</button>' +
      '<button class="action" data-a="checkin"><span>🚪</span>Event-day check-in</button>' +
      '</div>' +
      '<div class="card"><h2>Needs attention</h2>' + (att.length ? '<ul class="attn">' + att.map(a => '<li><a href="#" data-go="' + a[0] + '">' + a[1] + ' ' + BQ.esc(a[2]) + '</a></li>').join('') + '</ul>' : '<p class="ok">✓ Nothing needs attention right now.</p>') + '</div>' +
      (!s.parties ? '<div class="card"><h2>Getting started</h2><p>Add guests one at a time with <b>＋ Add a guest or group</b>, paste a list from Excel, or bring in last year’s spreadsheet from <a href="#" data-go="exports">Print &amp; Export → Import</a>.</p></div>' : '') +
      '</div>';
    main.querySelectorAll('[data-a]').forEach(b => b.onclick = () => b.dataset.a === 'add' ? BQ.ui.openParty(null) : BQ.ui.go(b.dataset.a));
    main.querySelectorAll('[data-go]').forEach(a => a.onclick = ev => { ev.preventDefault(); BQ.ui.go(a.dataset.go); });
  }
};

/* ---------------------------------------------------------------------
   GUEST LIST
   --------------------------------------------------------------------- */
BQ.guestView = { q: '', filter: 'all', sort: 'name', dir: 1 };
BQ.screens.guests = {
  title: 'Guest List',
  render(main) {
    const V = BQ.guestView;
    const filters = [['all', 'Everyone'], ['waiting', 'Waiting for a seat'], ['seated', 'Seated'], ['needs', 'Has requests'], ['problems', 'Request not met'], ['unpaid', 'Not paid'], ['orgs', 'Units & orgs'], ['vip', '⭐ VIP reception']]
      .filter(f => f[0] !== 'unpaid' || BQ.config.trackPayment);
    main.innerHTML = '<div class="page wide">' +
      '<div class="page-head"><h1>Guest List</h1><span class="grow"></span>' +
      '<button class="btn" id="glPaste">📋 Paste a list…</button><button class="btn primary" id="glAdd">＋ Add guest or group</button></div>' +
      '<div class="toolbar"><input id="glQ" type="search" placeholder="Search names, units, notes…" value="' + BQ.esc(V.q) + '"/>' +
      '<div class="chips">' + filters.map(f => '<button data-f="' + f[0] + '" class="' + (V.filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>').join('') + '</div></div>' +
      '<div id="glTable"></div></div>';
    main.querySelector('#glAdd').onclick = () => BQ.ui.openParty(null);
    main.querySelector('#glPaste').onclick = () => BQ.imports.pasteDialog();
    main.querySelector('#glQ').oninput = e => { V.q = e.target.value; this.drawTable(); };
    main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { V.filter = b.dataset.f; main.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); this.drawTable(); });
    this.drawTable();
  },
  refresh() { this.drawTable(); },
  drawTable() {
    const V = BQ.guestView, box = document.getElementById('glTable');
    if (!box) return;
    const q = V.q.toLowerCase();
    let rows = BQ.state.parties.filter(p => {
      if (q && (p.name + ' ' + p.aff + ' ' + (p.guests || []).join(' ') + ' ' + p.notes + ' ' + p.payNote).toLowerCase().indexOf(q) < 0) return false;
      switch (V.filter) {
        case 'waiting': return !p.table;
        case 'seated': return !!p.table;
        case 'needs': return (p.needs || []).length > 0;
        case 'problems': return BQ.partyIssueState(p) === 'bad';
        case 'unpaid': return BQ.payClass(p.pay) !== 'ok';
        case 'orgs': return BQ.isOrg(p);
        case 'vip': return !!p.vip;
      }
      return true;
    });
    const key = {
      name: p => BQ.sortKey(p.name, BQ.isOrg(p)), type: p => p.type, aff: p => (p.aff || '~').toLowerCase(), seats: p => p.seats,
      table: p => p.table ? (parseFloat(p.table) || 9999) : 1e9, pay: p => p.pay || '~', checkin: p => p.checkedIn || 0
    }[V.sort];
    rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * V.dir; });
    const seats = rows.reduce((s, p) => s + p.seats, 0);
    const th = (k, l, c) => '<th data-k="' + k + '" class="' + (c || '') + (V.sort === k ? ' sorted' : '') + '">' + l + (V.sort === k ? (V.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
    box.innerHTML = '<div class="muted small">' + rows.length + ' of ' + BQ.state.parties.length + ' parties · ' + seats + ' seats</div>' +
      '<div class="tablewrap"><table class="grid hover"><thead><tr>' + th('name', 'Name') + th('type', 'Type') + th('aff', 'Unit / org') + th('seats', 'Seats', 'c') + th('table', 'Table', 'c') +
      '<th>Requests</th>' + (BQ.config.trackPayment ? th('pay', 'Payment') : '') + th('checkin', 'Here', 'c') + '</tr></thead><tbody>' +
      rows.map(p => {
        const ti = BQ.typeInfo(p.type);
        const needs = (p.needs || []).map(n => { const r = BQ.checkNeed(p, n); return '<span class="need n-' + r.state + '" title="' + BQ.esc(BQ.needText(n) + ' — ' + r.msg) + '">' + (BQ.NEEDS[n.type] || {}).icon + '</span>'; }).join('');
        return '<tr data-pid="' + p.id + '"><td><b>' + BQ.esc(p.name) + '</b>' + (p.vip ? ' <span class="vipchip" title="VIP reception: admits ' + BQ.vipCount(p) + '">⭐ VIP ' + BQ.vipCount(p) + '</span>' : '') + (p.pinned ? ' 📌' : '') + (p.group ? ' <span class="muted" title="Split party">⛓</span>' : '') +
          ((p.guests || []).length ? '<div class="muted small">' + BQ.esc(p.guests.join(', ')) + '</div>' : '') + '</td>' +
          '<td>' + ti.icon + ' ' + BQ.esc(ti.label) + '</td><td>' + BQ.esc(p.aff) + '</td><td class="c">' + p.seats + '</td>' +
          '<td class="c">' + (p.table ? '<b>' + BQ.esc(p.table) + '</b>' : '<button class="btn sm" data-find="' + p.id + '">Find a seat</button>') + '</td>' +
          '<td>' + needs + '</td>' + (!BQ.config.trackPayment ? '' : '<td>' + (p.pay ? '<span class="paychip p-' + BQ.payClass(p.pay) + '">' + BQ.esc(p.pay) + '</span>' : '<span class="muted">—</span>') + '</td>') +
          '<td class="c">' + (p.checkedIn ? Math.min(p.checkedIn, p.seats) + '/' + p.seats : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (rows.length ? '' : '<p class="muted pad">No guests match.</p>');
    box.querySelectorAll('th[data-k]').forEach(h => h.onclick = () => { if (V.sort === h.dataset.k) V.dir *= -1; else { V.sort = h.dataset.k; V.dir = 1; } this.drawTable(); });
    box.querySelectorAll('tr[data-pid]').forEach(tr => tr.onclick = ev => {
      const pid = Number(tr.dataset.pid);
      if (ev.target.dataset.find) { BQ.seatView.panel = { type: 'party', id: pid }; BQ.ui.go('seat'); return; }
      BQ.ui.openParty(BQ.partyById(pid));
    });
  }
};

/* ---------------------------------------------------------------------
   TABLE ROSTERS
   --------------------------------------------------------------------- */
BQ.rosterView = { filter: 'all' };
BQ.screens.tables = {
  title: 'Table Rosters',
  render(main) {
    const V = BQ.rosterView;
    const filters = [['all', 'All tables'], ['open', 'Has open seats'], ['full', 'Full'], ['empty', 'Empty'], ['hold', 'On hold']];
    main.innerHTML = '<div class="page wide"><div class="page-head"><h1>Table Rosters</h1><span class="grow"></span>' +
      '<button class="btn" id="trPrint">🖨 Print rosters</button></div>' +
      '<div class="toolbar"><div class="chips">' + filters.map(f => '<button data-f="' + f[0] + '" class="' + (V.filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>').join('') + '</div></div>' +
      '<div class="rosters" id="trList"></div></div>';
    main.querySelector('#trPrint').onclick = () => BQ.exports.printRosters();
    main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { V.filter = b.dataset.f; this.render(main); });
    this.draw();
  },
  refresh() { this.draw(); },
  draw() {
    const box = document.getElementById('trList');
    if (!box) return;
    const ts = BQ.tables().slice().sort((a, b) => BQ.numSort(a.n, b.n)).filter(t => BQ.rosterView.filter === 'all' || BQ.tableStatus(t) === BQ.rosterView.filter);
    box.innerHTML = ts.map(t => {
      const u = BQ.tableUse(t), st = BQ.tableStatus(t);
      const colors = {};
      BQ.chairPlan(t).forEach(c => { colors[c.pid] = c.color; });
      return '<div class="roster s-' + st + '" data-drop="table" data-tn="' + BQ.esc(t.n) + '">' +
        '<div class="r-head"><b>Table ' + BQ.esc(t.n) + '</b><span>' + (st === 'hold' ? 'On hold' : u.used + ' / ' + u.cap) + '</span></div>' +
        (t.res || t.note ? '<div class="r-res">' + BQ.esc(t.res || t.note) + '</div>' : '') +
        (t.zone ? '<div class="r-zone">Area: ' + BQ.esc(t.zone) + '</div>' : '') +
        '<ul>' + u.parties.map(p => '<li><i class="dot" style="background:' + colors[p.id] + '"></i><span>' + BQ.esc(p.name) +
          ((p.guests || []).length ? '<small>' + BQ.esc(p.guests.join(', ')) + '</small>' : '') + '</span><b>' + p.seats + '</b></li>').join('') +
        (u.open && st !== 'hold' ? '<li class="open"><span>' + u.open + ' open seat' + (u.open === 1 ? '' : 's') + '</span></li>' : '') + '</ul></div>';
    }).join('') || '<p class="muted pad">No tables match.</p>';
    box.querySelectorAll('.roster').forEach(r => r.onclick = () => {
      BQ.seatView.panel = { type: 'table', n: r.dataset.tn };
      BQ.ui.go('seat');
      BQ.seatView.map.selected = new Set([r.dataset.tn]);
      BQ.seatView.map.focusTable(r.dataset.tn);
      BQ.screens.seat.refresh();
    });
  }
};

/* ---------------------------------------------------------------------
   REQUESTS & RULES
   --------------------------------------------------------------------- */
BQ.screens.requests = {
  title: 'Requests & Rules',
  render(main) {
    const s = BQ.settings();
    const issues = BQ.allIssues();
    const groups = [
      ['bad', '⚠️ Not met', 'These requests or rules are broken right now.'],
      ['info', '📝 Reminders', 'Things to handle yourself. Tick “handled” when done.'],
      ['wait', '⏳ Waiting', 'The guest (or the person they want to sit near) isn’t seated yet.'],
      ['ok', '✓ Met', '']
    ];
    const row = i => {
      const who = i.party ? '<b>' + BQ.esc(i.party.name) + '</b>' + (i.party.table ? ' · Table ' + BQ.esc(i.party.table) : ' · not seated') : '';
      const what = i.kind === 'need' ? BQ.esc(BQ.needText(i.need)) : '';
      return '<div class="issue s-' + i.state + '"><div class="i-main">' + (who ? who + '<br>' : '') + (what ? what + ' — ' : '') + '<span class="muted">' + BQ.esc(i.msg) + '</span></div><div class="i-act">' +
        (i.kind === 'need' && i.need.type === 'note' ? '<button class="btn sm" data-done="' + i.party.id + ':' + i.idx + '">' + (i.need.done ? 'Undo handled' : '✓ Handled') + '</button>' : '') +
        (i.party ? '<button class="btn sm" data-sug="' + i.party.id + '">Best tables</button><button class="btn sm" data-edit="' + i.party.id + '">Edit</button>' : '') +
        (i.table ? '<button class="btn sm" data-tbl="' + BQ.esc(i.table.n) + '">Show table</button>' : '') + '</div></div>';
    };
    const zones = s.zones || [];
    const ruled = BQ.tables().filter(t => t.st || t.res || t.note).sort((a, b) => BQ.numSort(a.n, b.n));
    main.innerHTML = '<div class="page">' +
      '<div class="page-head"><h1>Requests &amp; Rules</h1></div>' +
      '<p class="muted">Every special request is checked against where the guest is sitting. Change a guest’s requests in their details (Guest List → click the name).</p>' +
      groups.map(g => {
        const list = issues.filter(i => i.state === g[0]);
        if (!list.length && g[0] !== 'bad') return '';
        return '<details class="card" ' + (g[0] !== 'ok' ? 'open' : '') + '><summary><h2>' + g[1] + ' <span class="count">' + list.length + '</span></h2></summary>' +
          (g[2] ? '<p class="muted small">' + g[2] + '</p>' : '') + (list.length ? list.map(row).join('') : '<p class="ok">Nothing here. Every request is met.</p>') + '</details>';
      }).join('') +
      '<div class="card"><h2>Tables with rules</h2>' + (ruled.length ? '<table class="grid"><thead><tr><th>Table</th><th>Status</th><th>Reserved for / note</th><th>Seated</th></tr></thead><tbody>' +
        ruled.map(t => '<tr><td><a href="#" data-tbl="' + BQ.esc(t.n) + '"><b>' + BQ.esc(t.n) + '</b></a></td><td>' + ({ hold: 'On hold', closed: 'Marked full' }[t.st] || 'Open') + '</td><td>' + BQ.esc(t.res || t.note || '') + '</td><td>' + BQ.tableUse(t).used + '/' + t.s + '</td></tr>').join('') +
        '</tbody></table>' : '<p class="muted">None yet. On the Seating Map, click a table to put it on hold, mark it full, or reserve it.</p>') + '</div>' +
      '<div class="card"><h2>Areas</h2><p class="muted small">Group tables into areas (e.g. “Command staff”, “Volunteers corner”), then use the request “In a certain area”. Assign tables on the Seating Map (shift-click several tables).</p>' +
      (zones.length ? '<div class="zones">' + zones.map((z, i) => '<div class="zone"><input type="color" value="' + z.color + '" data-zc="' + i + '"/><input value="' + BQ.esc(z.name) + '" data-zn="' + i + '"/><span class="muted small">' +
        BQ.tables().filter(t => t.zone === z.name).length + ' tables</span><button class="x" data-zd="' + i + '">✕</button></div>').join('') + '</div>' : '') +
      '<button class="btn" id="rqZone">＋ New area</button></div>' +
      '<div class="card"><h2>How requests are measured</h2>' +
      '<div class="field two"><div><label>“Near the front” means the first … rows from the stage</label><input type="number" min="1" id="rqFront" value="' + s.frontRows + '"/></div>' +
      '<div><label>“Toward the back” means the last … rows</label><input type="number" min="1" id="rqBack" value="' + s.backRows + '"/></div></div>' +
      '<div class="field two"><div><label>“Near” another guest means within … table-widths</label><select id="rqNear">' +
      [[1.05, 'Next table over (side by side only)'], [1.6, 'Next table, including diagonal'], [2.3, 'Within two tables']].map(o => '<option value="' + o[0] + '"' + (Math.abs(s.nearSpacing - o[0]) < 0.01 ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' +
      '<div><label>“Near an exit” means within … table-widths of an exit</label><input type="number" step="0.5" min="0.5" id="rqExit" value="' + s.exitSpacing + '"/></div></div>' +
      '<label class="chk"><input type="checkbox" id="rqAward"' + (s.recipientsFront ? ' checked' : '') + '/> Flag award recipients who aren’t seated near the front</label></div>' +
      '</div>';
    const setS = (label, fn) => BQ.commit(label, [BQ.eventChange(e => { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings); fn(e.settings); })]);
    main.querySelector('#rqFront').onchange = e => setS('Front rows = ' + e.target.value, x => { x.frontRows = Math.max(1, parseInt(e.target.value, 10) || 1); });
    main.querySelector('#rqBack').onchange = e => setS('Back rows = ' + e.target.value, x => { x.backRows = Math.max(1, parseInt(e.target.value, 10) || 1); });
    main.querySelector('#rqNear').onchange = e => setS('“Near” distance changed', x => { x.nearSpacing = Number(e.target.value); });
    main.querySelector('#rqExit').onchange = e => setS('“Near exit” distance changed', x => { x.exitSpacing = Math.max(0.5, Number(e.target.value) || 2); });
    main.querySelector('#rqAward').onchange = e => setS('Award recipients near front: ' + (e.target.checked ? 'on' : 'off'), x => { x.recipientsFront = e.target.checked; });
    main.querySelector('#rqZone').onclick = () => BQ.newZone();
    main.querySelectorAll('[data-zc]').forEach(c => c.onchange = () => setS('Area color', x => { x.zones = BQ.clone(zones); x.zones[Number(c.dataset.zc)].color = c.value; }));
    main.querySelectorAll('[data-zn]').forEach(c => c.onchange = () => {
      const i = Number(c.dataset.zn), old = zones[i].name, nv = c.value.trim();
      if (!nv) return;
      const ch = [BQ.eventChange(e => {
        e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings); e.settings.zones = BQ.clone(zones); e.settings.zones[i].name = nv;
        e.layout.tables.forEach(t => { if (t.zone === old) t.zone = nv; });
      })];
      BQ.state.parties.forEach(p => { if ((p.needs || []).some(n => n.type === 'zone' && n.target === old)) ch.push(BQ.partyChange(p, a => a.needs.forEach(n => { if (n.type === 'zone' && n.target === old) n.target = nv; }))); });
      BQ.commit('Renamed area ' + old + ' → ' + nv, ch);
    });
    main.querySelectorAll('[data-zd]').forEach(b => b.onclick = async () => {
      const z = zones[Number(b.dataset.zd)];
      if (!(await BQ.ui.confirm('Delete the area “' + z.name + '”? Tables keep their guests.', 'Delete area'))) return;
      setS('Deleted area ' + z.name, x => { x.zones = zones.filter(q => q.name !== z.name); });
      BQ.commit('Cleared area from tables', [BQ.eventChange(e => e.layout.tables.forEach(t => { if (t.zone === z.name) t.zone = ''; }))]);
    });
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => BQ.ui.openParty(BQ.partyById(Number(b.dataset.edit))));
    main.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { BQ.seatView.panel = { type: 'party', id: Number(b.dataset.sug) }; BQ.ui.go('seat'); });
    main.querySelectorAll('[data-tbl]').forEach(b => b.onclick = ev => { ev.preventDefault(); BQ.seatView.panel = { type: 'table', n: b.dataset.tbl }; BQ.ui.go('seat'); BQ.seatView.map.selected = new Set([b.dataset.tbl]); BQ.screens.seat.refresh(); });
    main.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
      const [pid, idx] = b.dataset.done.split(':').map(Number);
      const p = BQ.partyById(pid);
      BQ.commit((p.needs[idx].done ? 'Reopened' : 'Handled') + ' note for ' + p.name, [BQ.partyChange(p, a => { a.needs[idx].done = !a.needs[idx].done; })]);
    });
  }
};

/* ---------------------------------------------------------------------
   CHECK-IN (event day) — banquet door or VIP reception door.
   Works on a phone: open the app with ?mode=checkin for a phone-sized
   screen with no menus (QR code under “📱 Use a phone”).
   --------------------------------------------------------------------- */
BQ.checkView = { q: '', notHere: false, mode: 'banquet' };
BQ.screens.checkin = {
  title: 'Check-In',
  render(main) {
    const V = BQ.checkView;
    const kiosk = document.body.classList.contains('kiosk');
    main.innerHTML = '<div class="page ci-page">' +
      '<div class="page-head">' + (kiosk ? '' : '<h1>Check-In</h1>') + '<div class="seg ci-mode" id="ciMode"><button data-v="banquet" class="' + (V.mode === 'banquet' ? 'on' : '') + '">🍽️ Banquet</button><button data-v="vip" class="' + (V.mode === 'vip' ? 'on' : '') + '">⭐ VIP reception</button></div>' +
      '<span class="grow"></span><div id="ciStats" class="ci-stats"></div>' + (kiosk ? '' : '<button class="btn" id="ciPhone">📱 Use a phone</button>') + '</div>' +
      '<input id="ciQ" class="ci-search" type="search" placeholder="Type a last name, first name, or unit…" value="' + BQ.esc(V.q) + '" autocomplete="off" autocapitalize="off" spellcheck="false"/>' +
      '<label class="chk"><input type="checkbox" id="ciNot"' + (V.notHere ? ' checked' : '') + '/> Only show people not here yet</label>' +
      '<div id="ciList" class="ci-list"></div><div class="muted small" id="ciSync"></div></div>';
    const q = main.querySelector('#ciQ');
    q.oninput = () => { V.q = q.value; this.draw(); };
    main.querySelector('#ciNot').onchange = e => { V.notHere = e.target.checked; this.draw(); };
    main.querySelectorAll('#ciMode button').forEach(b => b.onclick = () => { V.mode = b.dataset.v; this.render(main); });
    const ph = main.querySelector('#ciPhone');
    if (ph) ph.onclick = () => BQ.phoneDialog();
    if (!kiosk) setTimeout(() => q.focus(), 30);
    this.draw();
    // other phones/laptops may be checking people in too — pull fresh numbers every 30 seconds
    if (BQ.state.store.kind === 'sharepoint') BQ.ui.timer = setInterval(() => this.sync(), 30000);
  },
  async sync() {
    if (BQ.pending || document.querySelector('.modal-wrap')) return;
    try {
      BQ.state.parties = await BQ.state.store.listParties(BQ.state.event.id);
      const el = document.getElementById('ciSync');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString();
      this.draw();
    } catch (e) { const el = document.getElementById('ciSync'); if (el) el.textContent = '⚠ Couldn’t refresh: ' + e.message; }
  },
  refresh() { this.draw(); },
  draw() {
    const V = BQ.checkView, box = document.getElementById('ciList');
    if (!box) return;
    const vipMode = V.mode === 'vip';
    const s = BQ.stats();
    document.getElementById('ciStats').innerHTML = vipMode ? '<b>' + s.vipArrived + '</b> of ' + s.vipInvited + ' VIP guests here' : '<b>' + s.arrived + '</b> of ' + s.seated + ' seated guests here';
    const q = V.q.toLowerCase().trim();
    const total = p => vipMode ? BQ.vipCount(p) : p.seats;
    const here = p => Math.min(Number(vipMode ? p.vipIn : p.checkedIn) || 0, total(p));
    let people = BQ.people().filter(x => !vipMode || x.party.vip).filter(x => !V.notHere || here(x.party) < total(x.party));
    if (q) people = people.filter(x => x.name.toLowerCase().indexOf(q) >= 0 || (x.party.aff || '').toLowerCase().indexOf(q) >= 0);
    people.sort((a, b) => BQ.sortKey(a.name, a.org).localeCompare(BQ.sortKey(b.name, b.org)));
    const shown = people.slice(0, q ? 60 : 30);
    box.innerHTML = shown.map(x => {
      const p = x.party, h = here(p), t = total(p), done = h >= t;
      const vipNote = !vipMode && p.vip ? ' · <span class="vipchip">⭐ VIP</span>' : '';
      return '<div class="ci' + (done ? ' done' : '') + '"><div class="ci-who"><b>' + BQ.esc(x.name) + '</b>' +
        '<div class="muted small">' + (x.leader ? (BQ.isOrg(p) ? BQ.esc(BQ.typeInfo(p.type).label) : 'Party of ' + p.seats) : 'with ' + BQ.esc(p.name)) + (p.aff ? ' · ' + BQ.esc(p.aff) : '') + vipNote +
        (BQ.config.trackPayment && p.pay && BQ.payClass(p.pay) !== 'ok' ? ' · <span class="paychip p-' + BQ.payClass(p.pay) + '">' + BQ.esc(p.pay) + '</span>' : '') + '</div></div>' +
        '<div class="ci-table">' + (vipMode ? '<small>ADMITS</small><b>' + t + '</b>' : p.table ? '<small>TABLE</small><b>' + BQ.esc(p.table) + '</b>' : '<small>no table</small>') + '</div>' +
        '<div class="ci-count">' + h + ' / ' + t + '<small>here</small></div>' +
        '<div class="ci-btns">' + (done ? '<button class="btn sm" data-reset="' + p.id + '">Undo</button>' :
        '<button class="btn primary" data-all="' + p.id + '">✓ ' + (t - h > 1 ? 'All ' + (t - h) + ' here' : 'Here') + '</button>' +
        (t - h > 1 ? '<button class="btn sm" data-one="' + p.id + '">＋1</button>' : '')) +
        (!vipMode && p.table ? '<button class="btn sm ghost" data-map="' + BQ.esc(p.table) + '">Map</button>' : '') + '</div></div>';
    }).join('') + (people.length > shown.length ? '<p class="muted">' + (people.length - shown.length) + ' more. Keep typing to narrow it down.</p>' : '') +
      (!people.length ? '<p class="muted pad">' + (vipMode && !BQ.state.parties.some(p => p.vip) ? 'Nobody is marked for the VIP reception yet. Tick “VIP reception” in a guest’s details.' : 'No one matches.') + '</p>' : '');
    const field = vipMode ? 'vipIn' : 'checkedIn';
    const tot = a => vipMode ? BQ.vipCount(a) : a.seats;
    const label = vipMode ? 'VIP reception: ' : '';
    box.querySelectorAll('[data-all]').forEach(b => b.onclick = () => BQ.checkinUpdate(Number(b.dataset.all), label + 'Checked in', a => { a[field] = tot(a); }));
    box.querySelectorAll('[data-one]').forEach(b => b.onclick = () => BQ.checkinUpdate(Number(b.dataset.one), label + 'Checked in 1 of', a => { a[field] = Math.min(tot(a), (Number(a[field]) || 0) + 1); }));
    box.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => BQ.checkinUpdate(Number(b.dataset.reset), label + 'Reset check-in for', a => { a[field] = 0; }));
    box.querySelectorAll('[data-map]').forEach(b => b.onclick = () => BQ.showTableOnMap(b.dataset.map));
  }
};

/* Re-read the guest right before saving so two check-in devices don't overwrite each other */
BQ.checkinUpdate = async function (pid, label, fn) {
  const st = BQ.state;
  try {
    if (st.store.getParty) {
      const fresh = await st.store.getParty(pid);
      const i = st.parties.findIndex(x => x.id === pid);
      if (fresh && i >= 0) st.parties[i] = fresh;
    }
  } catch (e) { console.error('fresh read failed', e); }
  const p = BQ.partyById(pid);
  if (!p) return false;
  return BQ.commit(label + ' ' + p.name, [BQ.partyChange(p, a => { fn(a); a.checkInTime = new Date().toISOString(); })]);
};

/* QR code + link for phones */
BQ.checkinUrl = function () {
  const base = BQ.state.store.kind === 'practice' ? location.href.split('?')[0].split('#')[0] : BQ.config.redirectUri;
  return base + '?mode=checkin' + (BQ.state.store.kind === 'practice' ? '#practice' : '');
};
BQ.phoneDialog = function () {
  if (BQ.config.demo) { BQ.ui.toast('In the real app this shows a QR code that opens check-in on a phone.'); return; }
  const url = BQ.checkinUrl();
  let qr = '';
  try {
    if (typeof qrcode !== 'undefined') { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
  } catch (e) { qr = ''; }
  BQ.ui.modal({
    title: 'Check people in from a phone',
    body: '<div class="phone-qr">' + (qr || '<p class="muted">QR code unavailable. Use the link below.</p>') + '</div>' +
      '<p>Scan with the phone’s camera, sign in with the City account, and you’ll get a phone-sized check-in screen. Several phones can check in at once. Each screen refreshes every 30 seconds.</p>' +
      '<p class="small"><a href="' + BQ.esc(url) + '" target="_blank" rel="noopener">' + BQ.esc(url) + '</a></p>' +
      (BQ.state.store.kind === 'practice' ? '<p class="warn small">In practice mode, each phone has its own separate practice data.</p>' : '') +
      '<p class="muted small">This is a first version. Keep the printed check-in sheet handy as a backup.</p>',
    buttons: [{ label: 'Close', cls: 'primary' }]
  });
};

BQ.showTableOnMap = function (n) {
  const m = BQ.ui.modal({ title: 'Table ' + n, wide: true, body: '<div class="mini-map" id="miniMap"></div>', buttons: [{ label: 'Close', cls: 'primary' }] });
  const map = new BQ.Map(m.el.querySelector('#miniMap'), { mode: 'view', dimOthers: true });
  map.hl = new Set([String(n)]);
  map.fit();
  map.render();
};

/* ---------------------------------------------------------------------
   SETTINGS
   --------------------------------------------------------------------- */
BQ.screens.settings = {
  title: 'Settings',
  render(main) {
    const e = BQ.state.event, s = BQ.settings();
    const practice = BQ.state.store.kind === 'practice';
    main.innerHTML = '<div class="page">' +
      '<div class="page-head"><h1>Settings</h1></div>' +
      '<div class="card"><h2>This event</h2>' +
      '<div class="field"><label>Event name</label><input id="stTitle" value="' + BQ.esc(e.title) + '"/></div>' +
      '<div class="field two"><div><label>Date</label><input id="stDate" type="date" value="' + BQ.esc((e.date || '').slice(0, 10)) + '"/></div>' +
      '<div><label>Venue</label><input id="stVenue" value="' + BQ.esc(e.venue || '') + '"/></div></div>' +
      '<div class="field"><label>Title printed on the spreadsheet exports</label><input id="stExp" value="' + BQ.esc(s.exportTitle) + '"/></div>' +
      '<div class="field"><label>Sort people in A–Z lists by</label><div class="seg" id="stSort"><button data-v="last" class="' + (s.sortBy !== 'first' ? 'on' : '') + '">Last name</button><button data-v="first" class="' + (s.sortBy === 'first' ? 'on' : '') + '">First name</button></div></div>' +
      '</div>' +
      '<div class="card"><h2>Look &amp; feel</h2><p class="muted small">Pick a color tone, a background (or your own photo), and text size. Saved on this computer.</p><button class="btn primary" id="stLook">🎨 Change the look…</button></div>' +
      '<div class="card"><h2>Events</h2><p class="muted small">Each year is its own event with its own room, guests and awards. Switch events from the menu at the top.</p>' +
      '<button class="btn" id="stNew">＋ New event…</button></div>' +
      (practice ? '<div class="card"><h2>Practice data</h2><p class="muted small">Practice mode keeps everything in this browser only.</p>' +
        '<div class="row gap"><button class="btn" id="stSample">Load sample guests &amp; awards</button><button class="btn danger" id="stReset">Erase all practice data</button></div></div>' :
        '<div class="card"><h2>SharePoint setup</h2><p class="muted small">Site: ' + BQ.esc(BQ.config.siteUrl) + '</p><div id="stHealth"><button class="btn" id="stCheck">Check lists &amp; columns</button></div></div>') +
      '<div class="card"><h2>Activity log</h2><p class="muted small">Every change is recorded with who made it and when.</p><button class="btn" id="stLog">Show recent activity</button><div id="stLogBox"></div></div>' +
      '</div>';
    const ev = (label, fn) => BQ.commit(label, [BQ.eventChange(fn)]).then(() => BQ.renderShellTitle());
    main.querySelector('#stTitle').onchange = x => ev('Event name', a => { a.title = x.target.value.trim() || a.title; });
    main.querySelector('#stDate').onchange = x => ev('Event date', a => { a.date = x.target.value ? x.target.value + 'T12:00:00' : ''; });
    main.querySelector('#stVenue').onchange = x => ev('Venue', a => { a.venue = x.target.value.trim(); });
    main.querySelector('#stExp').onchange = x => ev('Export title', a => { a.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, a.settings, { exportTitle: x.target.value }); });
    main.querySelectorAll('#stSort button').forEach(b => b.onclick = () => ev('Sort by ' + b.dataset.v + ' name', a => { a.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, a.settings, { sortBy: b.dataset.v }); }));
    main.querySelector('#stNew').onclick = () => BQ.newEventDialog();
    main.querySelector('#stLook').onclick = () => BQ.look.dialog();
    main.querySelector('#stLog').onclick = async () => {
      const box = main.querySelector('#stLogBox');
      box.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const rows = await BQ.state.store.listLog(BQ.state.event.id);
        box.innerHTML = '<div class="tablewrap"><table class="grid"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' +
          rows.slice(0, 200).map(r => '<tr><td class="nowrap">' + (r.when ? new Date(r.when).toLocaleString() : '') + '</td><td>' + BQ.esc(r.who || '') + '</td><td>' + BQ.esc(r.action) + '</td><td class="small">' + BQ.esc(r.details || '') + '</td></tr>').join('') +
          '</tbody></table></div>';
      } catch (x) { box.innerHTML = '<p class="bad">Couldn’t load the log: ' + BQ.esc(x.message) + '</p>'; }
    };
    if (practice) {
      main.querySelector('#stSample').onclick = () => BQ.sample.load();
      main.querySelector('#stReset').onclick = async () => {
        if (!(await BQ.ui.confirm('Erase ALL practice events, guests and awards in this browser?', 'Erase'))) return;
        BQ.PracticeStore.reset(); location.reload();
      };
    } else {
      main.querySelector('#stCheck').onclick = () => BQ.setupPanel(main.querySelector('#stHealth'));
    }
  }
};
BQ.renderShellTitle = function () {
  const sel = document.getElementById('evSel');
  if (!sel) return;
  const o = sel.querySelector('option[value="' + BQ.state.event.id + '"]');
  if (o) o.textContent = BQ.state.event.title;
};

/* SharePoint health check + one-click setup */
/* What to create by hand: only the lists/columns that are missing, with SharePoint column types */
BQ.manualSpec = function (rep) {
  const T = {
    Text: 'Single line of text',
    Note: 'Multiple lines of text, <b>Plain text</b>',
    Number: 'Number',
    DateTime: 'Date and time, <b>Include time: Yes</b>',
    Boolean: 'Yes/No (default No)'
  };
  const rows = (rep || []).filter(r => !r.exists || r.missing.length);
  if (!rows.length) return '<p class="ok">Nothing is missing.</p>';
  return '<div class="manual-spec"><p class="small muted">Type each column name exactly as shown (no spaces, same capitals) when you first create it. Leave every column not required. Keep the built-in Title column.</p>' +
    rows.map(r => '<h4>' + (r.exists ? 'Add to list ' : 'Create list ') + '<code>' + r.list + '</code>' + (r.exists ? '' : ' (blank list)') + '</h4>' +
      '<table class="grid"><thead><tr><th>Column name</th><th>Type</th></tr></thead><tbody>' +
      r.missing.map(n => { const t = (BQ.schema[r.list].find(f => f[0] === n) || [])[1]; return '<tr><td><code>' + n + '</code></td><td>' + (T[t] || t) + '</td></tr>'; }).join('') +
      '</tbody></table>').join('') + '</div>';
};

BQ.setupPanel = async function (box, onReady) {
  box.innerHTML = '<p class="muted">Checking SharePoint…</p>';
  let rep;
  try { rep = await BQ.SPStore.health(); } catch (e) { box.innerHTML = '<p class="bad">Couldn’t reach SharePoint: ' + BQ.esc(e.message) + '</p>'; return false; }
  const ok = rep.every(r => r.exists && !r.missing.length && !r.error);
  box.innerHTML = '<table class="grid"><thead><tr><th>List</th><th>Status</th></tr></thead><tbody>' + rep.map(r => '<tr><td>' + r.list + '</td><td>' +
    (r.error ? '<span class="bad">' + BQ.esc(r.error) + '</span>' : !r.exists ? '<span class="bad">Missing list</span>' : r.missing.length ? '<span class="bad">Missing: ' + r.missing.join(', ') + '</span>' : '<span class="ok">✓ Ready</span>') +
    '</td></tr>').join('') + '</tbody></table>' +
    (ok ? '<p class="ok">✓ Everything is set up.</p>' + (onReady ? '<button class="btn primary" id="spGo">Continue</button>' : '') :
      '<p>The app can create the missing lists and columns for you. You need to be an owner of the SharePoint site.</p><button class="btn primary" id="spFix">Create missing lists &amp; columns</button><div id="spProg" class="muted small"></div>');
  const fix = box.querySelector('#spFix');
  if (fix) fix.onclick = async () => {
    fix.disabled = true;
    try {
      await BQ.SPStore.provision(msg => { box.querySelector('#spProg').textContent = msg; });
      BQ.logAction('SharePoint setup', 'Created missing lists/columns');
      return BQ.setupPanel(box, onReady);
    } catch (e) {
      console.error(e);
      const denied = e.status === 403 || /consent|AADSTS|popup|interaction|access is denied/i.test(String(e.message || e.errorCode || ''));
      box.querySelector('#spProg').innerHTML = denied
        ? '<p class="bad">Your sign-in isn’t allowed to create lists or columns (' + BQ.esc(e.message || e.errorCode || 'access denied') + ').</p>' +
          '<p>Two ways to fix it:</p><ol><li><b>Create them by hand</b> in SharePoint using the list below, then press <b>Check again</b>.</li>' +
          '<li>Or add the <b>SharePoint → Delegated → AllSites.Manage</b> permission to the PatrolBidPortal app registration (it may need admin consent), then press <b>Create missing lists &amp; columns</b> again.</li></ol>' +
          BQ.manualSpec(await BQ.SPStore.health().catch(() => rep)) + '<button class="btn" id="spRecheck">Check again</button>'
        : '<span class="bad">' + BQ.esc(e.message) + '</span>';
      const rc = box.querySelector('#spRecheck');
      if (rc) rc.onclick = () => BQ.setupPanel(box, onReady);
      fix.disabled = false;
    }
  };
  if (!ok) {
    const det = document.createElement('details');
    det.innerHTML = '<summary>Prefer to create them by hand? Show exactly what’s missing</summary>' + BQ.manualSpec(rep) + '<button class="btn" id="spRecheck2">Check again</button>';
    box.appendChild(det);
    det.querySelector('#spRecheck2').onclick = () => BQ.setupPanel(box, onReady);
  }
  const go = box.querySelector('#spGo');
  if (go) go.onclick = onReady;
  return ok;
};

/* ---------------------------------------------------------------------
   Events: create / open / reload
   --------------------------------------------------------------------- */
BQ.newEventDialog = function (first) {
  const prev = BQ.state.events.filter(e => e.layout).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const y = new Date().getFullYear();
  const body = (first ? '<p>Welcome! Let’s set up the banquet. You can change any of this later in Settings.</p>' : '') +
    '<div class="field"><label>Event name</label><input id="neTitle" value="Awards Banquet ' + y + '"/></div>' +
    '<div class="field two"><div><label>Date</label><input id="neDate" type="date"/></div><div><label>Venue</label><input id="neVenue" placeholder="e.g. Hyatt Regency — Landmark Ballroom"/></div></div>' +
    '<div class="field"><label>Room</label><select id="neRoom">' +
    BQ.layouts.presets.map(p => '<option value="p:' + p.k + '">' + BQ.esc(p.label) + '</option>').join('') +
    prev.map(e => '<option value="e:' + e.id + '">Same room as ' + BQ.esc(e.title) + '</option>').join('') + '</select></div>' +
    (prev.length ? '<label class="chk"><input type="checkbox" id="neSettings" checked/> Copy areas and settings from ' + BQ.esc(prev[0].title) + '</label>' : '');
  const m = BQ.ui.modal({
    title: first ? 'Create your first event' : 'New event', body,
    buttons: (first ? [] : [{ label: 'Cancel' }]).concat([{
      label: 'Create event', cls: 'primary', onClick: async () => {
        const v = s => m.el.querySelector(s).value;
        const room = v('#neRoom');
        const layout = room.indexOf('p:') === 0 ? BQ.layouts.presets.find(p => p.k === room.slice(2)).make() : BQ.clone(BQ.state.events.find(e => e.id === Number(room.slice(2))).layout);
        const title = v('#neTitle').trim() || 'Awards Banquet';
        const yr = (v('#neDate') || '').slice(0, 4) || String(y);
        let settings = Object.assign({}, BQ.DEFAULT_SETTINGS, { exportTitle: 'Table seating for FDP AWARDS BANQUET ' + yr });
        const cs = m.el.querySelector('#neSettings');
        if (cs && cs.checked && prev[0]) settings = Object.assign({}, BQ.clone(prev[0].settings), { exportTitle: settings.exportTitle });
        // a new year starts with every table open
        layout.tables.forEach(t => { delete t.st; delete t.res; delete t.note; });
        const ev = { title, date: v('#neDate') ? v('#neDate') + 'T12:00:00' : '', venue: v('#neVenue').trim(), layout, settings, status: 'Active' };
        try {
          ev.id = await BQ.state.store.saveEvent(ev);
        } catch (e) { BQ.ui.toast('Couldn’t create the event: ' + e.message, 'bad'); return false; }
        BQ.state.events.push(ev);
        await BQ.openEvent(ev.id);
        BQ.logAction('Created event', title);
      }
    }])
  });
  if (first) { m.el.querySelector('.x').style.display = 'none'; m.el.querySelector('#neDate').value = ''; }
};

BQ.openEvent = async function (id) {
  const st = BQ.state;
  st.event = st.events.find(e => e.id === id);
  if (!st.event) return;
  st.event.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, st.event.settings || {});
  if (!st.event.layout) st.event.layout = BQ.layouts.landmark();
  try { localStorage.setItem('bq_event', String(id)); } catch (e) { /* ignore */ }
  document.getElementById('main') && (document.getElementById('main').innerHTML = '<div class="page"><p class="muted">Loading guests…</p></div>');
  try {
    const [parties, awards] = await Promise.all([st.store.listParties(id), st.store.listAwards(id)]);
    st.parties = parties; st.awards = awards;
  } catch (e) {
    BQ.ui.toast('Couldn’t load guests: ' + e.message, 'bad');
    st.parties = []; st.awards = [];
  }
  BQ.history = [];
  BQ.refreshGeo();
  BQ.seatView.map = null; BQ.seatView.panel = null;
  BQ.renderShell();
  let scr = 'home';
  try { scr = sessionStorage.getItem('bq_screen') || 'home'; } catch (e) { /* ignore */ }
  if (document.body.classList.contains('kiosk')) scr = 'checkin';
  BQ.ui.go(BQ.screens[scr] ? scr : 'home');
};

BQ.reload = async function () {
  const st = BQ.state;
  try {
    st.events = await st.store.listEvents();
    const e = st.events.find(x => x.id === st.event.id);
    if (e) { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings || {}); st.event = e; }
    const [parties, awards] = await Promise.all([st.store.listParties(st.event.id), st.store.listAwards(st.event.id)]);
    st.parties = parties; st.awards = awards;
    BQ.refreshGeo();
    BQ.ui.changed();
    BQ.ui.toast('Up to date ✓');
  } catch (e) { BQ.ui.toast('Couldn’t refresh: ' + e.message, 'bad'); }
};

/* ---------------------------------------------------------------------
   Startup
   --------------------------------------------------------------------- */
BQ.loginScreen = function (msg) {
  document.getElementById('app').innerHTML = '<div class="login"><div class="login-card">' +
    '<div class="badge-logo big">★</div><h1>' + BQ.esc(BQ.config.appName) + '</h1><p class="muted">Awards banquet seating, awards lineup and check-in</p>' +
    (msg ? '<p class="bad">' + BQ.esc(msg) + '</p>' : '') +
    (BQ.auth.available() ? '<button class="btn primary big block" id="lgIn">Sign in with your City account</button>' : '<p class="muted">Microsoft sign-in isn’t available on this page.</p>') +
    (BQ.config.allowPractice ? '<button class="btn block" id="lgPractice">Try it in practice mode</button><p class="muted small">Practice mode saves only in this browser. Good for learning the app.</p>' : '') +
    '</div></div>';
  const i = document.getElementById('lgIn');
  if (i) i.onclick = () => BQ.auth.login();
  const p = document.getElementById('lgPractice');
  if (p) p.onclick = () => { try { sessionStorage.setItem('bq_mode', 'practice'); } catch (e) { /* */ } BQ.start('practice'); };
};

BQ.start = async function (mode) {
  const st = BQ.state;
  st.store = mode === 'practice' ? BQ.PracticeStore : BQ.SPStore;
  if (mode !== 'practice') {
    document.getElementById('app').innerHTML = '<div class="login"><div class="login-card"><p class="muted">Connecting to SharePoint…</p><div id="setupBox"></div></div></div>';
    await BQ.auth.loadUser();
    const box = document.getElementById('setupBox');
    const ok = await BQ.setupPanel(box, () => BQ.start('sharepoint-ready'));
    if (!ok) return;
  }
  try { st.events = await st.store.listEvents(); } catch (e) { BQ.loginScreen('Couldn’t load events: ' + e.message); return; }
  st.events.forEach(e => { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings || {}); });
  if (!st.events.length && BQ.config.demo) {
    // demo: open straight into a realistic event with made-up sample data
    const ev = { title: 'Awards Banquet 2026', date: '2026-11-05T12:00:00', venue: 'Landmark Ballroom', layout: BQ.layouts.landmark(), settings: Object.assign({}, BQ.DEFAULT_SETTINGS, { exportTitle: 'Table seating for the AWARDS BANQUET 2026' }), status: 'Active' };
    ev.id = await st.store.saveEvent(ev);
    st.events.push(ev);
    await BQ.openEvent(ev.id);
    await BQ.sample.load();
    return;
  }
  if (!st.events.length) {
    document.getElementById('app').innerHTML = '<div class="login"></div>';
    BQ.newEventDialog(true);
    return;
  }
  let id = null;
  try { id = Number(localStorage.getItem('bq_event')); } catch (e) { /* ignore */ }
  if (!st.events.some(e => e.id === id)) id = st.events.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].id;
  await BQ.openEvent(id);
};

BQ.boot = async function () {
  try {
    if (/[?&]mode=checkin/.test(location.search)) sessionStorage.setItem('bq_kiosk', '1');
    if (/[?&]mode=full/.test(location.search)) sessionStorage.removeItem('bq_kiosk');
    if (sessionStorage.getItem('bq_kiosk') === '1') document.body.classList.add('kiosk');
  } catch (e) { if (/[?&]mode=checkin/.test(location.search)) document.body.classList.add('kiosk'); }
  let practice = /practice/.test(location.hash);
  try { practice = practice || sessionStorage.getItem('bq_mode') === 'practice'; } catch (e) { /* ignore */ }
  if (BQ.config.demo || (practice && BQ.config.allowPractice)) return BQ.start('practice');
  if (!BQ.auth.available()) return BQ.loginScreen();
  try {
    const signedIn = await BQ.auth.init();
    if (signedIn) return BQ.start('sharepoint');
  } catch (e) {
    console.error(e);
    return BQ.loginScreen('Sign-in problem: ' + e.message);
  }
  BQ.loginScreen();
};

document.addEventListener('DOMContentLoaded', () => BQ.boot());
