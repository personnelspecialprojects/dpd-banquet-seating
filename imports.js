/* =====================================================================
   imports.js — bringing data in:
     • Classic “Table seating” workbook (any tab, any of the 4 column blocks)
     • Paste a list from Excel / email
     • Restore a Full backup made by this app
   Plus fictional sample data for practice mode.
   Everything is read in the browser — files never leave the computer.
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.imports = {};
const IM = BQ.imports;

/* ---------------------------------------------------------------------
   Guessing a guest type from a name like “Robbery Unit” or “Volunteers”
   --------------------------------------------------------------------- */
IM.guessType = function (name) {
  const n = String(name || '');
  if (/volunteer/i.test(n)) return 'Volunteers';
  if (/choir|bag ?pipe|honor guard|band\b|drum/i.test(n)) return 'Performers';
  if (/\bfdp\b|friends of|\bhost\b/i.test(n)) return 'Host';
  if (/^(hold|reserved|on hold)\b/i.test(n)) return 'Hold';
  if (/\b(unit|division|services|relations|oversight|deployment|squad|section|bureau|team|crt|vcpu|fto|academy|patrol)\b/i.test(n)) return 'Unit';
  if (/\b(org\.?|organization|association|assoc\.?|dpa|outreach|foundation|council|league|society|club|table)\b/i.test(n)) return 'Organization';
  return 'Guest';
};

/* ---------------------------------------------------------------------
   Shared: default seats / VIP tickets for imported guests
   --------------------------------------------------------------------- */
IM.vipFieldHtml = (id, label) => '<div class="field"><label>⭐ ' + (label || 'VIP reception tickets for each') + '</label><div class="row gap"><select id="' + id + 'Mode">' +
  '<option value="none">None</option><option value="same">Same as their seats</option><option value="n">This many:</option></select>' +
  '<input id="' + id + 'N" type="number" min="1" value="1" style="width:80px" hidden/></div></div>';
IM.wireVip = (root, id) => { const s = root.querySelector('#' + id + 'Mode'); if (s) s.onchange = () => { root.querySelector('#' + id + 'N').hidden = s.value !== 'n'; }; };
IM.readVip = (root, id) => { const s = root.querySelector('#' + id + 'Mode'); return s ? { mode: s.value, n: Math.max(1, parseInt(root.querySelector('#' + id + 'N').value, 10) || 1) } : null; };
IM.applyVip = (after, v) => {
  if (!v || v.mode === 'none') return after;
  after.vip = true;
  after.vipCount = v.mode === 'same' ? Number(after.seats) || 1 : v.n;
  return after;
};
IM.afterNote = '<p class="muted small">Afterwards, <b>Review &amp; change these</b> opens just these guests so you can change seats or VIP tickets for all of them at once.</p>';

/* ---------------------------------------------------------------------
   CLASSIC WORKBOOK PARSER
   grid: array of rows, each an array of cell strings (0-based columns)
   returns { tables: {num: {status, note, closed, sum}}, parties: [...], warnings: [] }
   --------------------------------------------------------------------- */
IM.TABLE_RE = /^\s*table\s*#?\s*([A-Za-z0-9-]+)\s*\*?\s*$/i;

IM.parseClassicGrid = function (grid) {
  const out = { tables: {}, parties: [], warnings: [] };
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  // columns that contain "TABLE n" labels
  const tableCols = [];
  for (let c = 0; c < width; c++) {
    let hits = 0;
    grid.forEach(r => { if (IM.TABLE_RE.test(String(r[c] || ''))) hits++; });
    if (hits >= 1) tableCols.push(c);
  }
  tableCols.forEach(c => {
    let cur = null;
    grid.forEach((r, ri) => {
      const a = String(r[c] == null ? '' : r[c]).trim();
      const name = String(r[c + 1] == null ? '' : r[c + 1]).replace(/\s+/g, ' ').trim();
      const seatsRaw = String(r[c + 2] == null ? '' : r[c + 2]).trim();
      const status = String(r[c + 3] == null ? '' : r[c + 3]).trim();
      if (/^table number$/i.test(a)) { cur = null; return; }
      const m = a.match(IM.TABLE_RE);
      if (m) {
        cur = m[1];
        out.tables[cur] = out.tables[cur] || { status: '', note: '', sum: 0, hold: false };
        if (status) out.tables[cur].status = status;
      }
      if (!cur || !name) return;
      const T = out.tables[cur];
      if (/^hold$/i.test(seatsRaw) || /^leave empty$/i.test(name)) {
        T.hold = true; T.note = name;
        return;
      }
      let seats = parseInt(seatsRaw, 10);
      let note = '';
      if (isNaN(seats)) {
        if (seatsRaw) note = 'Seats were listed as “' + seatsRaw + '”';
        seats = 0;
      } else if (!/^\d+$/.test(seatsRaw)) note = 'Seats were listed as “' + seatsRaw + '”';
      out.parties.push({ name, seats, table: cur, note, row: ri + 1, statusText: status });
    });
  });
  // parties with no seat count: if they're alone at a "Full" table, they get the whole table
  out.parties.forEach(p => {
    if (p.seats > 0) return;
    const mates = out.parties.filter(x => x.table === p.table);
    const T = out.tables[p.table];
    if (mates.length === 1 && /full/i.test(T.status)) { p.seats = 12; p.note = (p.note ? p.note + '. ' : '') + 'No seat count. Set to a full table (12)'; }
    else { p.seats = 1; p.note = (p.note ? p.note + '. ' : '') + 'No seat count. Set to 1'; }
    out.warnings.push(p.name + ' (Table ' + p.table + '): ' + p.note);
  });
  Object.keys(out.tables).forEach(n => {
    const T = out.tables[n];
    T.sum = out.parties.filter(p => p.table === n).reduce((s, p) => s + p.seats, 0);
    // "Full-11" with 11 seated → she treated it as full
    T.closed = /full/i.test(T.status) && T.sum > 0;
  });
  return out;
};

IM.sheetGrid = function (ws) {
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const arr = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      let v = cell.value;
      if (v && typeof v === 'object') v = v.result != null ? v.result : v.richText ? v.richText.map(t => t.text).join('') : v.text != null ? v.text : '';
      arr[c - 1] = v == null ? '' : v;
    });
    grid[r - 1] = arr;
  });
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  return grid;
};

IM.readFile = function (accept) {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept || '.xlsx';
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
};

IM.classicDialog = async function () {
  if (!BQ.exports.needExcel()) return;
  const file = await IM.readFile('.xlsx,.xlsm');
  if (!file) return;
  let wb;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) { BQ.ui.toast('Couldn’t read that file. Is it an .xlsx Excel workbook? (' + e.message + ')', 'bad'); return; }
  const sheets = wb.worksheets.map(ws => ({ name: ws.name, res: IM.parseClassicGrid(IM.sheetGrid(ws)) })).filter(s => s.res.parties.length || Object.keys(s.res.tables).length);
  if (!sheets.length) { BQ.ui.toast('No “TABLE …” rows were found in that workbook.', 'bad'); return; }
  sheets.sort((a, b) => b.res.parties.length - a.res.parties.length || (b.name === 'printable version') - (a.name === 'printable version'));
  IM.classicPreview(file.name, sheets, 0);
};

IM.classicPreview = function (fname, sheets, idx) {
  const res = sheets[idx].res;
  const known = new Set(BQ.tables().map(t => String(t.n)));
  const missing = Array.from(new Set(res.parties.map(p => p.table).filter(n => !known.has(String(n)))));
  const existing = new Set(BQ.state.parties.map(p => p.name.toLowerCase() + '|' + p.table));
  const dups = res.parties.filter(p => existing.has(p.name.toLowerCase() + '|' + p.table));
  const seats = res.parties.reduce((s, p) => s + p.seats, 0);
  const holds = Object.keys(res.tables).filter(n => res.tables[n].hold);
  const body = '<p>From <b>' + BQ.esc(fname) + '</b>' + (sheets.length > 1 ? ', tab <select id="icSheet">' + sheets.map((s, i) => '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>' + BQ.esc(s.name) + ' (' + s.res.parties.length + ' rows)</option>').join('') + '</select>' : ', tab “' + BQ.esc(sheets[idx].name) + '”') + '</p>' +
    '<div class="glance"><div><b>' + res.parties.length + '</b><span>guests / groups</span></div><div><b>' + seats + '</b><span>seats</span></div><div><b>' + Object.keys(res.tables).length + '</b><span>tables</span></div><div><b>' + holds.length + '</b><span>on hold</span></div></div>' +
    (missing.length ? '<p class="bad">Tables ' + missing.join(', ') + ' aren’t in this event’s room. Those guests will go to the waiting list.</p>' : '') +
    (dups.length ? '<p class="warn">' + dups.length + ' already exist here (same name and table). They will be skipped.</p>' : '') +
    (res.warnings.length ? '<details><summary>' + res.warnings.length + ' things to double-check</summary><ul class="small">' + res.warnings.map(w => '<li>' + BQ.esc(w) + '</li>').join('') + '</ul></details>' : '') +
    IM.vipFieldHtml('icVip') + IM.afterNote +
    '<label class="chk"><input type="checkbox" id="icHolds" checked/> Also bring over “hold” and “full” table markings</label>' +
    '<div class="scroll-box"><table class="grid"><thead><tr><th>Table</th><th>Name</th><th>Seats</th><th>Type (guessed)</th><th>Note</th></tr></thead><tbody>' +
    res.parties.map(p => '<tr' + (dups.includes(p) ? ' class="muted"' : '') + '><td class="c">' + BQ.esc(p.table) + '</td><td>' + BQ.esc(p.name) + '</td><td class="c">' + p.seats + '</td><td>' + BQ.typeInfo(IM.guessType(p.name)).icon + ' ' + BQ.esc(BQ.typeInfo(IM.guessType(p.name)).label) + '</td><td class="small">' + BQ.esc(p.note) + '</td></tr>').join('') +
    '</tbody></table></div><p class="muted small">You can fix types and seat counts afterwards in the Guest List. The whole import can be undone with one Undo.</p>';
  const m = BQ.ui.modal({
    title: 'Import from your old spreadsheet', body, wide: true,
    buttons: [{ label: 'Cancel' }, {
      label: 'Import ' + (res.parties.length - dups.length) + ' guests', cls: 'primary', onClick: async () => {
        const keepHolds = m.el.querySelector('#icHolds').checked;
        const changes = res.parties.filter(p => !dups.includes(p)).map(p => ({
          kind: 'party', before: null, after: {
            name: IM.guessType(p.name) === 'Guest' ? (BQ.cleanPerson(p.name).name || p.name) : (BQ.stripStatus(p.name).name || p.name), badge: IM.guessType(p.name) === 'Guest' ? BQ.cleanPerson(p.name).badge : '', notAttending: BQ.stripStatus(p.name).na, noResponse: BQ.stripStatus(p.name).nr, type: IM.guessType(p.name), aff: '', seats: p.seats, table: known.has(String(p.table)) ? String(p.table) : '',
            guests: [], needs: [], pay: '', payNote: '', phone: '', email: '', notes: [p.note, known.has(String(p.table)) ? '' : 'Was at Table ' + p.table + ' in the imported sheet'].filter(Boolean).join('. '),
            checkedIn: 0, pinned: false, group: ''
          }
        }));
        // link split parties (same name at several tables)
        const byName = {};
        changes.forEach(c => { const k = c.after.name.toLowerCase(); (byName[k] = byName[k] || []).push(c.after); });
        Object.keys(byName).forEach(k => { if (byName[k].length > 1) { const g = 'g' + BQ.uid(); byName[k].forEach(a => { a.group = g; }); } });
        if (keepHolds) {
          changes.unshift(BQ.eventChange(e => {
            e.layout.tables.forEach(t => {
              const T = res.tables[String(t.n)];
              if (!T) return;
              if (T.hold) { t.st = 'hold'; t.note = T.note || 'Leave empty'; }
              else if (T.closed && T.sum < t.s) t.st = 'closed';
            });
          }));
        }
        const vipDef = IM.readVip(m.el, 'icVip');
        changes.forEach(c => { if (c.kind === 'party') IM.applyVip(c.after, vipDef); });
        BQ.ui.toast('Importing ' + changes.length + ' items… this can take a minute.');
        const ok = await BQ.commit('Imported ' + res.parties.length + ' guests from ' + fname, changes);
        if (ok) BQ.noteImport(changes.filter(c => c.kind === 'party').map(c => c.after.id), 'Imported ' + res.parties.length + ' guests');
      }
    }]
  });
  IM.wireVip(m.el, 'icVip');
  const sel = m.el.querySelector('#icSheet');
  if (sel) sel.onchange = () => { m.close(); IM.classicPreview(fname, sheets, Number(sel.value)); };
};

/* ---------------------------------------------------------------------
   AWARD FILE (the awards spreadsheet)
   Layout: header row RANK | Officer/Emp Name | MEMO | Log Number | (notes)
   Category rows have only a title in the name column (e.g. LIFE SAVING AWARDS).
   Names are First_Last_Badge, or First_Last for professional staff.
   Rows with the same Log Number in a category are one award presented together.
   --------------------------------------------------------------------- */
IM.titleCase = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s\-\/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());

IM.parseAwardGrid = function (grid) {
  const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  let hr = grid.findIndex(r => (r || []).some(v => /^rank$/i.test(txt(v))) && (r || []).some(v => /name/i.test(txt(v))));
  let col = { rank: 0, name: 1, memo: 2, log: 3, notes: 4 };
  if (hr >= 0) {
    const h = grid[hr].map(v => txt(v).toLowerCase());
    const idx = (re, d) => { const i = h.findIndex(x => re.test(x)); return i >= 0 ? i : d; };
    col = { rank: idx(/^rank/, 0), name: idx(/name/, 1), memo: idx(/memo/, 2), log: idx(/log/, 3) };
    col.notes = idx(/note|comment|remark/, Math.max(col.rank, col.name, col.memo, col.log) + 1);
  }
  const out = { awards: [], skipped: [], noName: 0, segments: [] };
  let seg = '';
  const byKey = {};
  for (let i = hr + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const rank = txt(r[col.rank]), raw = txt(r[col.name]), memo = txt(r[col.memo]), log = txt(r[col.log]), note = txt(r[col.notes]);
    if (!rank && !raw && !memo && !log && !note) continue;
    if (!rank && !log && !memo && raw) {           // category header
      seg = IM.titleCase(raw);
      if (out.segments.indexOf(seg) < 0) out.segments.push(seg);
      continue;
    }
    if (!rank && !raw && !log) continue;            // stray marks like "…."
    const nm = BQ.parseAwardName(raw);
    if (/removed/i.test(log) || /^removed/i.test(note)) { out.skipped.push({ row: i + 1, rank, name: nm.name, log, note, seg }); continue; }
    if (!nm.name) { out.noName++; continue; }
    const key = seg + '|' + (log ? log.toUpperCase() : 'row' + i);
    let a = byKey[key];
    if (!a) {
      a = byKey[key] = { segment: seg, name: seg.replace(/\s+awards?$/i, '') ? seg.replace(/awards$/i, 'Award') : 'Award', logNo: log, recipients: [], notes: [] };
      out.awards.push(a);
    }
    a.recipients.push(Object.assign({ rank: rank || nm.rankTag, name: nm.name, badge: nm.badge, memo, note, count: 1 }, nm.na || /not\s+attending/i.test(note) ? { na: true } : nm.nr || /no\s+(response|reply|rsvp)/i.test(note) ? { nr: true } : {}));
    if (note) a.notes.push(nm.name + ': ' + note);
  }
  out.awards.forEach(a => { a.kind = a.recipients.length > 1 ? 'Group' : 'Individual'; a.notes = a.notes.join('; '); });
  return out;
};

IM.awardsDialog = async function () {
  if (!BQ.exports.needExcel()) return;
  const file = await IM.readFile('.xlsx,.xlsm');
  if (!file) return;
  let res;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const parsed = wb.worksheets.map(ws => IM.parseAwardGrid(IM.sheetGrid(ws))).sort((x, y) => y.awards.length - x.awards.length);
    res = parsed[0];
  } catch (e) { BQ.ui.toast('Couldn’t read that file: ' + e.message, 'bad'); return; }
  if (!res || !res.awards.length) {
    BQ.ui.toast(res && res.noName ? 'Found ' + res.noName + ' award rows, but the names are blank.' : 'No award rows were found (expected Rank / Name / Memo / Log Number).', 'bad');
    return;
  }
  const people = res.awards.reduce((n, a) => n + a.recipients.length, 0);
  let matched = 0;
  res.awards.forEach(a => a.recipients.forEach(r => { const p = BQ.findPartyForName(r.name, r.badge); r.pid = p ? p.id : null; if (p) matched++; }));
  const existing = BQ.state.awards.length;
  const segRows = res.segments.map(sg => {
    const list = res.awards.filter(a => a.segment === sg);
    return '<tr><td>' + BQ.esc(sg || '(no category)') + '</td><td class="c">' + list.length + '</td><td class="c">' + list.reduce((n, a) => n + a.recipients.length, 0) + '</td></tr>';
  }).join('');
  const body = '<p>From <b>' + BQ.esc(file.name) + '</b>:</p>' +
    '<div class="glance"><div><b>' + res.segments.length + '</b><span>categories</span></div><div><b>' + res.awards.length + '</b><span>awards (Log Numbers)</span></div><div><b>' + people + '</b><span>recipients</span></div><div><b>' + matched + '</b><span>already on guest list</span></div></div>' +
    '<table class="grid"><thead><tr><th>Category (becomes a program segment)</th><th>Awards</th><th>People</th></tr></thead><tbody>' + segRows + '</tbody></table>' +
    (res.skipped.length ? '<details><summary>' + res.skipped.length + ' rows skipped (marked REMOVED)</summary><ul class="small">' + res.skipped.map(x => '<li>' + BQ.esc((x.rank ? x.rank + ' ' : '') + (x.name || '(no name)') + ', ' + x.seg + ': ' + x.log + (x.note ? ' (' + x.note + ')' : '')) + '</li>').join('') + '</ul></details>' : '') +
    (res.noName ? '<p class="warn">' + res.noName + ' rows have no name and were left out.</p>' : '') +
    (existing ? '<div class="field"><label>This event already has ' + existing + ' awards</label><div class="seg" id="aiMode"><button data-v="replace" class="on">Replace them</button><button data-v="add">Keep them and add these</button></div></div>' : '') +
    (people - matched ? '<div class="card soft"><label class="chk"><input type="checkbox" id="aiAdd" checked/> <b>Add the ' + (people - matched) + ' recipients who aren’t on the guest list</b> to the waiting list so they get seats</label>' +
      '<div class="field" style="margin:8px 0 6px"><label>Seats for each</label><div class="seg" id="aiSeats">' + [1, 2, 3, 4].map(n => '<button data-v="' + n + '" class="' + (n === 2 ? 'on' : '') + '">' + (n === 1 ? 'Just them' : 'Them + ' + (n - 1)) + '</button>').join('') + '</div></div>' +
      IM.vipFieldHtml('aiVip') +
      '<label class="chk"><input type="checkbox" id="aiTogether" checked/> Keep people with the same Log Number near each other</label><br>' +
      '<label class="chk"><input type="checkbox" id="aiFront"' + (BQ.settings().recipientsFront ? ' checked' : '') + '/> Ask for seats near the front</label></div>' : '') +
    '<p class="muted small">One Undo reverses the whole import.</p>';
  const m = BQ.ui.modal({
    title: 'Import award file', body, wide: true, onOpen: el => IM.wireVip(el, 'aiVip'),
    buttons: [{ label: 'Cancel' }, {
      label: 'Import ' + res.awards.length + ' awards', cls: 'primary', onClick: async () => {
        const replace = !existing || m.el.querySelector('#aiMode .on').dataset.v === 'replace';
        const addEl = m.el.querySelector('#aiAdd');
        const opts = addEl && addEl.checked ? { seats: Number(m.el.querySelector('#aiSeats .on').dataset.v), vip: IM.readVip(m.el, 'aiVip'), together: m.el.querySelector('#aiTogether').checked, front: m.el.querySelector('#aiFront').checked } : null;
        const since = BQ.history.length;
        let order = replace ? 0 : BQ.state.awards.reduce((mx, a) => Math.max(mx, a.order || 0), 0);
        const changes = (replace ? BQ.state.awards.map(a => ({ kind: 'award', before: BQ.clone(a), after: null })) : [])
          .concat(res.awards.map(a => ({ kind: 'award', before: null, after: { name: a.name, logNo: a.logNo, segment: a.segment, cat: '', kind: a.kind, order: ++order, presenter: '', notes: a.notes, status: '', recipients: a.recipients } })));
        BQ.ui.toast('Importing awards…');
        const ok = await BQ.commit('Imported ' + res.awards.length + ' awards from ' + file.name, changes);
        if (!ok) return;
        if (opts) {
          const newIds = new Set(changes.filter(c => c.after).map(c => c.after.id));
          const items = [];
          BQ.state.awards.filter(a => newIds.has(a.id)).forEach(a => (a.recipients || []).forEach(r => { if (!r.na && !(r.pid && BQ.partyById(r.pid))) items.push({ a, r }); }));
          const ppl = [];
          items.forEach(it => {
            const key = BQ.recipKey(it.r);
            let p = ppl.find(x => x.key === key);
            if (!p) { p = { key, r: it.r, awards: [] }; ppl.push(p); }
            p.awards.push(it.a);
          });
          if (ppl.length) await BQ.addRecipientsAsGuests(ppl, opts);
        }
        BQ.mergeHistory(since, 'Imported award file ' + file.name);
        BQ.ui.toast('Imported ' + res.awards.length + ' awards ✓', 'ok');
      }
    }]
  });
  BQ.ui.segs(m.el);
};

/* ---------------------------------------------------------------------
   HIGHEST HONORS LIST (Word document)
   Layout: an award heading (e.g. "Officer of the Year"), then lines like
     Sergeant John Smith - Robbery Unit
   Reads the .docx in the browser (JSZip), or text pasted from Word.
   --------------------------------------------------------------------- */
IM.RANK_PREFIX = /^(asst\.?\s+chief(\s+of\s+police)?|assistant\s+chief(\s+of\s+police)?|deputy\s+chief(\s+of\s+police)?|chief\s+of\s+police|chief|major|maj\.|captain|capt\.|lieutenant|lt\.|sergeant|sgt\.|senior\s+corporal|sr\.?\s*corporal|sr\.?\s*cpl\.?|corporal|cpl\.|detective|det\.|police\s+officer|p\.\s?o\.|officer|ofc\.|professional\s+staff|mr\.|mrs\.|ms\.|miss|dr\.)\s+/i;
IM.HONOR_SEP = /\s+[-–—]\s+|\s*[–—]\s*/;

// Word .docx → [{text, heading, bold, list}]
IM.docxLines = async function (buf) {
  if (typeof JSZip === 'undefined') throw new Error('The Word reader didn’t load (check the internet connection). You can paste the text instead.');
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('This doesn’t look like a Word (.docx) file.');
  const xml = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const out = [];
  const para = p => {
    const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
    let text = '', boldChars = 0, chars = 0;
    runs.forEach(r => {
      const t = Array.from(r.childNodes).map(n => n.localName === 't' ? n.textContent : n.localName === 'tab' ? '\t' : n.localName === 'br' ? ' ' : '').join('');
      if (!t) return;
      text += t; chars += t.trim().length;
      const rp = r.getElementsByTagNameNS(W, 'rPr')[0];
      const b = rp && rp.getElementsByTagNameNS(W, 'b')[0];
      if (b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false') boldChars += t.trim().length;
    });
    const ps = p.getElementsByTagNameNS(W, 'pStyle')[0];
    const style = ps ? (ps.getAttributeNS(W, 'val') || '') : '';
    return { text: text.replace(/\s+/g, ' ').trim(), heading: /heading|title/i.test(style), bold: chars > 0 && boldChars >= chars * 0.8, list: !!p.getElementsByTagNameNS(W, 'numPr')[0] || /list/i.test(style) };
  };
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  Array.from(body.childNodes).forEach(n => {
    if (n.localName === 'p') { const l = para(n); if (l.text) out.push(l); }
    if (n.localName === 'tbl') {
      Array.from(n.getElementsByTagNameNS(W, 'tr')).forEach(tr => {
        const cells = Array.from(tr.getElementsByTagNameNS(W, 'tc')).map(tc => Array.from(tc.getElementsByTagNameNS(W, 'p')).map(p => para(p).text).join(' ').trim()).filter(Boolean);
        if (!cells.length) return;
        const first = Array.from(tr.getElementsByTagNameNS(W, 'p'))[0];
        const pl = first ? para(first) : { heading: false, bold: false };
        out.push({ text: cells.length === 1 ? cells[0] : cells[0] + ' - ' + cells.slice(1).join(', '), heading: pl.heading, bold: pl.bold && cells.length === 1, list: false });
      });
    }
  });
  return out;
};

IM.textLines = text => String(text || '').split(/\r?\n/).map(t => ({ text: t.replace(/\s+/g, ' ').trim(), heading: false, bold: false, list: /^\s*([•·\-*▪●]|\d+[.)])\s+/.test(t) })).filter(l => l.text);

IM.parseHonorRecipient = function (line) {
  const na = BQ.stripStatus(line.replace(/^([•·*▪●]|\d+[.)])\s+/, '').trim());
  let t = na.name;
  let unit = '';
  const m = t.split(IM.HONOR_SEP);
  if (m.length > 1) { unit = m.slice(1).join(' - ').trim(); t = m[0].trim(); }
  let rank = '';
  const rm = t.match(IM.RANK_PREFIX);
  if (rm) { rank = rm[0].trim(); t = t.slice(rm[0].length).trim(); }
  const c = BQ.cleanPerson(t.replace(/,$/, ''));
  return Object.assign({ rank, name: c.name, badge: c.badge, unit, count: 1 }, na.na || c.na ? { na: true } : na.nr || c.nr ? { nr: true } : {});
};

IM.parseHonors = function (lines) {
  const awards = [], unparsed = [];
  let cur = null;
  lines.forEach(l => {
    const t = l.text;
    const hasSep = IM.HONOR_SEP.test(t);
    const awardWords = /\b(award|year|medal|honou?r|citation|excellence|valor|distinguished|service|achievement|recognition|of the)\b/i.test(t);
    const personish = IM.RANK_PREFIX.test(t) && !awardWords;   // e.g. "Sergeant John Smith" with no unit
    const looksLikeHeading = l.heading || (l.bold && !hasSep) || (!hasSep && !l.list && !personish);
    if (looksLikeHeading || (!cur && !hasSep && !l.list)) {
      cur = { name: t.replace(/[:：]\s*$/, ''), recipients: [] };
      awards.push(cur);
      return;
    }
    if (!cur) { unparsed.push(t); return; }
    const r = IM.parseHonorRecipient(t);
    if (r.name) cur.recipients.push(r); else unparsed.push(t);
  });
  return { awards: awards.filter(a => a.recipients.length || a.name), unparsed };
};

IM.honorsDialog = function () {
  const body = '<p>Choose the Word document with the highest honors. Each award heading should be followed by lines like <b>Sergeant John Smith - Robbery Unit</b>.</p>' +
    '<button class="btn primary" id="hdFile">📄 Choose the Word file (.docx)…</button>' +
    '<p class="muted small" style="margin-top:14px">Or copy everything in the Word document (Ctrl+A, Ctrl+C) and paste it here:</p>' +
    '<textarea id="hdText" rows="8" class="block" placeholder="Officer of the Year\nSergeant John Smith - Robbery Unit\n\nDetective of the Year\nDetective Jane Doe - Homicide Unit"></textarea>';
  const m = BQ.ui.modal({
    title: 'Import highest honors (Word)', body, wide: true,
    buttons: [{ label: 'Cancel' }, {
      label: 'Preview pasted text', cls: 'primary', onClick: () => {
        const txt = m.el.querySelector('#hdText').value;
        if (!txt.trim()) { BQ.ui.toast('Paste the list first, or choose the Word file.'); return false; }
        setTimeout(() => IM.honorsPreview(IM.parseHonors(IM.textLines(txt)), 'pasted text'));
      }
    }]
  });
  m.el.querySelector('#hdFile').onclick = async () => {
    const file = await IM.readFile('.docx');
    if (!file) return;
    if (/\.doc$/i.test(file.name)) { BQ.ui.toast('That’s an older .doc file. In Word, use File → Save As → Word Document (.docx), or paste the text instead.', 'bad'); return; }
    try {
      const lines = await IM.docxLines(await file.arrayBuffer());
      m.close();
      IM.honorsPreview(IM.parseHonors(lines), file.name);
    } catch (e) { BQ.ui.toast('Couldn’t read that file: ' + e.message, 'bad'); }
  };
};

IM.honorsPreview = function (res, source) {
  const awards = res.awards.filter(a => a.recipients.length);
  if (!awards.length) { BQ.ui.toast('No award headings with names under them were found.', 'bad'); return; }
  let matched = 0, people = 0;
  awards.forEach(a => a.recipients.forEach(r => { people++; const p = BQ.findPartyForName(r.name, r.badge); r.pid = p ? p.id : null; if (p) matched++; }));
  const segDefault = 'Highest Honors';
  const existing = BQ.state.awards.filter(a => (a.segment || '').toLowerCase() === segDefault.toLowerCase());
  const empty = res.awards.filter(a => !a.recipients.length);
  const body = '<p>From <b>' + BQ.esc(source) + '</b>:</p>' +
    '<div class="glance"><div><b>' + awards.length + '</b><span>awards</span></div><div><b>' + people + '</b><span>recipients</span></div><div><b>' + matched + '</b><span>already on guest list</span></div></div>' +
    '<div class="scroll-box"><table class="grid"><thead><tr><th>Award</th><th>Recipient</th><th>Unit</th><th>Guest list</th></tr></thead><tbody>' +
    awards.map(a => a.recipients.map((r, i) => '<tr><td>' + (i === 0 ? '<b>' + BQ.esc(a.name) + '</b>' : '') + '</td><td>' + BQ.esc(BQ.recipLabel(r, { noUnit: true })) + '</td><td>' + BQ.esc(r.unit) + '</td><td>' +
      (r.pid ? '<span class="ok">✓ ' + BQ.esc(BQ.recipientSeat(r).text) + '</span>' : '<span class="muted">not on list</span>') + '</td></tr>').join('')).join('') +
    '</tbody></table></div>' +
    (empty.length ? '<p class="warn small">Headings with no names under them (left out): ' + empty.map(a => BQ.esc(a.name)).join(', ') + '</p>' : '') +
    (res.unparsed.length ? '<p class="warn small">Lines before the first award heading (left out): ' + res.unparsed.map(BQ.esc).join(' · ') + '</p>' : '') +
    '<div class="field two"><div><label>Program segment for these awards</label><input id="hpSeg" value="' + segDefault + '"/></div>' +
    '<div><label>Where in the program</label><div class="seg" id="hpPos"><button data-v="end" class="on">At the end</button><button data-v="start">At the beginning</button></div></div></div>' +
    (existing.length ? '<label class="chk"><input type="checkbox" id="hpReplace" checked/> Replace the ' + existing.length + ' awards already in “' + segDefault + '” (for re-importing an updated list)</label>' : '') +
    (people - matched ? '<div class="card soft"><label class="chk"><input type="checkbox" id="hpAdd" checked/> <b>Add the ' + (people - matched) + ' recipients who aren’t on the guest list</b> to the waiting list</label>' +
      '<div class="field" style="margin:8px 0 6px"><label>Seats for each</label><div class="seg" id="hpSeats">' + [1, 2, 3, 4].map(n => '<button data-v="' + n + '" class="' + (n === 2 ? 'on' : '') + '">' + (n === 1 ? 'Just them' : 'Them + ' + (n - 1)) + '</button>').join('') + '</div></div>' +
      IM.vipFieldHtml('hpVip') +
      '<label class="chk"><input type="checkbox" id="hpUnit" checked/> Seat them near their unit (when the unit has seats)</label><br>' +
      '<label class="chk"><input type="checkbox" id="hpFront" checked/> Ask for seats near the front</label></div>' : '') +
    '<p class="muted small">One Undo reverses the whole import. The Excel awards are not touched.</p>';
  const m = BQ.ui.modal({
    title: 'Import highest honors', body, wide: true, onOpen: el => IM.wireVip(el, 'hpVip'),
    buttons: [{ label: 'Cancel' }, {
      label: 'Import ' + awards.length + ' awards', cls: 'primary', onClick: async () => {
        const seg = m.el.querySelector('#hpSeg').value.trim() || segDefault;
        const atStart = m.el.querySelector('#hpPos .on').dataset.v === 'start';
        const rep = m.el.querySelector('#hpReplace');
        const replaceThese = rep && rep.checked ? BQ.state.awards.filter(a => (a.segment || '').toLowerCase() === seg.toLowerCase()) : [];
        const keep = BQ.awardsSorted().filter(a => !replaceThese.includes(a));
        const addEl = m.el.querySelector('#hpAdd');
        const opts = addEl && addEl.checked ? { seats: Number(m.el.querySelector('#hpSeats .on').dataset.v), vip: IM.readVip(m.el, 'hpVip'), nearUnit: m.el.querySelector('#hpUnit').checked, front: m.el.querySelector('#hpFront').checked, together: false } : null;
        const since = BQ.history.length;
        const changes = replaceThese.map(a => ({ kind: 'award', before: BQ.clone(a), after: null }));
        // keep the Segments panel order in step (only matters once an order has been set there)
        const segOrder = BQ.segmentOrder();
        if (segOrder.length && !segOrder.includes(seg)) changes.push(BQ.eventChange(e => { e.settings = Object.assign({}, BQ.DEFAULT_SETTINGS, e.settings, { segments: atStart ? [seg].concat(segOrder) : segOrder.concat([seg]) }); }));
        let order = 0;
        const newOnes = awards.map(a => ({ name: a.name, logNo: '', segment: seg, cat: '', kind: a.recipients.length > 1 ? 'Group' : 'Individual', presenter: '', notes: '', status: '', recipients: a.recipients }));
        const sequence = atStart ? newOnes.concat(keep) : keep.concat(newOnes);
        sequence.forEach(x => {
          order++;
          if (newOnes.includes(x)) changes.push({ kind: 'award', before: null, after: Object.assign(x, { order }) });
          else if ((x.order || 0) !== order) changes.push({ kind: 'award', before: BQ.clone(x), after: Object.assign(BQ.clone(x), { order }) });
        });
        BQ.ui.toast('Importing…');
        const ok = await BQ.commit('Imported ' + awards.length + ' highest honors from ' + source, changes);
        if (!ok) return;
        if (opts) {
          const ids = new Set(changes.filter(c => c.after && !c.before).map(c => c.after.id));
          const ppl = [];
          BQ.state.awards.filter(a => ids.has(a.id)).forEach(a => (a.recipients || []).forEach(r => {
            if (r.na || (r.pid && BQ.partyById(r.pid))) return;
            const key = BQ.recipKey(r);
            let p = ppl.find(x => x.key === key);
            if (!p) { p = { key, r, awards: [] }; ppl.push(p); }
            p.awards.push(a);
          }));
          if (ppl.length) await BQ.addRecipientsAsGuests(ppl, opts);
        }
        BQ.mergeHistory(since, 'Imported highest honors from ' + source);
        BQ.ui.toast('Imported ' + awards.length + ' highest honors ✓', 'ok');
      }
    }]
  });
  BQ.ui.segs(m.el);
};

/* ---------------------------------------------------------------------
   PASTE A LIST
   --------------------------------------------------------------------- */
IM.parsePaste = function (text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  if (!lines.length) return [];
  let rows = lines.map(l => l.indexOf('\t') >= 0 ? l.split('\t').map(s => s.trim()) : null);
  const tabbed = rows.every(r => r);
  if (!tabbed) {
    // "Laura Dodd - 4", "Laura Dodd, 4", "Laura Dodd 4", "Laura Dodd (4)"
    rows = lines.map(l => {
      const m = l.trim().match(/^(.*?)[\s,\-–:(]+(\d{1,2})\)?\s*$/);
      return m ? [m[1].trim(), m[2]] : [l.trim(), ''];
    });
  }
  // header row?
  let map = { name: 0, seats: 1, table: 2, aff: 3 };
  const h = rows[0].map(x => String(x).toLowerCase());
  if (h.some(x => /name/.test(x)) && h.some(x => /seat|#|count|qty|number of/.test(x) || /table/.test(x))) {
    map = {};
    h.forEach((x, i) => {
      if (map.badge == null && /badge|employee\s*(id|#|no)/.test(x)) map.badge = i;
      else if (map.rank == null && /^(rank|title)$/.test(x.trim())) map.rank = i;
      else if (map.company == null && /company|employer|business|sponsor|organi[sz]ation/.test(x)) map.company = i;
      else if (map.name == null && /name|attend|guest/.test(x)) map.name = i;
      else if (map.seats == null && /seat|#|count|qty/.test(x)) map.seats = i;
      else if (map.table == null && /table/.test(x)) map.table = i;
      else if (map.aff == null && /unit|org|affil|division|agency|bureau/.test(x)) map.aff = i;
      else if (map.type == null && /type|kind/.test(x)) map.type = i;
      else if (map.pay == null && /pay|paid/.test(x)) map.pay = i;
      else if (map.guests == null && /guests|names/.test(x)) map.guests = i;
      else if (map.notes == null && /note|request|comment/.test(x)) map.notes = i;
      else if (map.phone == null && /phone/.test(x)) map.phone = i;
      else if (map.email == null && /mail/.test(x)) map.email = i;
      else if (map.vip == null && /vip|reception/.test(x)) map.vip = i;
    });
    if (map.name == null) map.name = 0;
    rows = rows.slice(1);
  }
  const get = (r, k) => map[k] == null ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim();
  return rows.map(r => {
    let name = get(r, 'name').replace(/\s+/g, ' ');
    if (!name && !get(r, 'company')) return null;
    let badge = get(r, 'badge').replace(/[^0-9A-Za-z]/g, '');
    const na = BQ.stripStatus(name);
    if ((na.na || na.nr) && na.name) name = na.name;
    let rank = get(r, 'rank'), company = get(r, 'company'), aff = get(r, 'aff');
    if (IM.guessType(name) === 'Guest') {
      const c = BQ.cleanPerson(name); if (c.name) { name = c.name; badge = badge || c.badge; }
      const co = !company && BQ.splitCompany(name);
      if (co && !(co.unit && aff)) { name = co.person; if (co.unit) aff = co.org; else company = co.org; }
      const rk = !rank && BQ.splitRank(name);
      if (rk && rk.rank) { name = rk.name; rank = rk.rank; }
    }
    if (!name && company) name = company;
    const t = get(r, 'table').replace(/^table\s*/i, '').replace(/\*$/, '');
    const typeTxt = get(r, 'type').toLowerCase();
    const type = (BQ.PARTY_TYPES.find(x => typeTxt && (x.k.toLowerCase() === typeTxt || x.label.toLowerCase().indexOf(typeTxt) >= 0)) || {}).k || IM.guessType(name);
    const payTxt = get(r, 'pay');
    const pay = BQ.PAY.find(v => payTxt && v.toLowerCase().indexOf(payTxt.toLowerCase()) === 0) || (/^(y|yes|paid|x)$/i.test(payTxt) ? 'Paid' : '');
    const vipTxt = get(r, 'vip');
    const vip = /^(y|yes|x|true|vip|✓|★|⭐|\d+)$/i.test(vipTxt);
    return {
      vip, vipCount: vip && /^\d+$/.test(vipTxt) ? Number(vipTxt) : 0,
      seatsGiven: parseInt(get(r, 'seats'), 10) > 0, vipGiven: map.vip != null && vipTxt !== '',
      name, badge, rank, company, notAttending: na.na && !!na.name, noResponse: na.nr && !!na.name, seats: Math.max(1, parseInt(get(r, 'seats'), 10) || 1), table: t, aff, type, pay,
      guests: get(r, 'guests').split(/[;\n]/).map(s => s.trim()).filter(Boolean), notes: get(r, 'notes'), phone: get(r, 'phone'), email: get(r, 'email')
    };
  }).filter(Boolean);
};

IM.pasteDialog = function () {
  const body = '<p>Copy rows from Excel (or type one per line) and paste them below. Columns in this order work best:</p>' +
    '<p class="muted small"><b>Name</b> · <b>Seats</b> · Table (optional) · Unit/org (optional). A header row with words like “Name”, “Seats”, “Table”, “Unit”, “VIP” is also understood. Lines like “Laura Dodd - 4” work too.</p>' +
    '<textarea id="ppText" rows="8" class="block" placeholder="Laura Dodd\t4\nRobbery Unit\t12\t55"></textarea>' +
    '<div class="field two" style="margin-top:12px"><div><label>Seats for each, when the list doesn’t say</label><input id="ppSeats" type="number" min="1" value="1"/></div>' +
    '<div>' + IM.vipFieldHtml('ppVip', 'VIP tickets for each, when the list doesn’t say') + '</div></div>' + IM.afterNote +
    '<div id="ppPrev"></div>';
  let rows = [];
  const m = BQ.ui.modal({
    title: 'Paste a list', body, wide: true,
    buttons: [{ label: 'Cancel' }, {
      label: 'Add these guests', cls: 'primary', onClick: async () => {
        if (!rows.length) { BQ.ui.toast('Nothing to add yet.'); return false; }
        const known = new Set(BQ.tables().map(t => String(t.n)));
        const defSeats = Math.max(1, parseInt(m.el.querySelector('#ppSeats').value, 10) || 1);
        const vipDef = IM.readVip(m.el, 'ppVip');
        const changes = rows.map(r => ({
          kind: 'party', before: null, after: {
            name: r.name, badge: r.badge || '', rank: r.rank || '', company: r.company || '', notAttending: !!r.notAttending, noResponse: !!r.noResponse, type: r.type, aff: r.aff, seats: r.seatsGiven ? r.seats : defSeats, table: known.has(r.table) ? r.table : '', guests: r.guests, needs: [], pay: r.pay, payNote: '',
            phone: r.phone, email: r.email, notes: [r.notes, r.table && !known.has(r.table) && !r.notAttending ? 'Asked for Table ' + r.table + ' (not in the room)' : ''].filter(Boolean).join('. '), checkedIn: 0, pinned: false, group: '',
            vip: r.vip, vipCount: r.vipCount, vipIn: 0
          }
        }));
        changes.forEach((c, i) => { if (!rows[i].vipGiven) IM.applyVip(c.after, vipDef); });
        const ok = await BQ.commit('Added ' + rows.length + ' guests from a pasted list', changes);
        if (ok) BQ.noteImport(changes.map(c => c.after.id), 'Added ' + rows.length + ' guests');
      }
    }]
  });
  IM.wireVip(m.el, 'ppVip');
  const ta = m.el.querySelector('#ppText');
  ta.oninput = () => {
    rows = IM.parsePaste(ta.value);
    const already = rows.filter(r => r.type === 'Guest' && BQ.sameNameParties(r.name, r.badge, null).length);
    m.el.querySelector('#ppPrev').innerHTML = rows.length ? '<p><b>' + rows.length + '</b> guests, <b>' + rows.reduce((s, r) => s + r.seats, 0) + '</b> seats:</p>' +
      (already.length ? '<p class="warn small">👥 ' + BQ.plural(already.length, 'name') + ' already on the guest list (' + already.slice(0, 5).map(r => BQ.esc(r.name)).join(', ') + (already.length > 5 ? '…' : '') + '). After adding, use <b>Review duplicates</b> on the Guest List to merge the same person or keep two different people.</p>' : '') + '<div class="scroll-box"><table class="grid"><thead><tr><th>Name</th><th>Seats</th><th>Table</th><th>Unit / org</th><th>Type</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + BQ.esc(BQ.displayName(r)) + (r.badge ? ' <span class="badgechip">#' + BQ.esc(r.badge) + '</span>' : '') + (r.notAttending ? ' <span class="nachip">🚫 Not attending</span>' : r.noResponse ? ' <span class="nrchip">❔ No response</span>' : '') + '</td><td class="c">' + r.seats + '</td><td class="c">' + BQ.esc(r.table) + '</td><td>' + BQ.esc(r.aff) + '</td><td>' + BQ.typeInfo(r.type).icon + ' ' + BQ.esc(BQ.typeInfo(r.type).label) + '</td></tr>').join('') + '</tbody></table></div>' : '';
  };
  setTimeout(() => ta.focus(), 40);
};

/* ---------------------------------------------------------------------
   RESTORE A FULL BACKUP → new event
   --------------------------------------------------------------------- */
IM.restoreDialog = async function () {
  if (!BQ.exports.needExcel()) return;
  const file = await IM.readFile('.xlsx');
  if (!file) return;
  let data;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet('_app_data');
    if (!ws) throw new Error('This isn’t a Full backup made by this app.');
    let json = '';
    for (let r = 1; r <= ws.rowCount; r++) json += String(ws.getCell(r, 1).value || '');
    data = JSON.parse(json);
  } catch (e) { BQ.ui.toast('Couldn’t read the backup: ' + e.message, 'bad'); return; }
  const ok = await BQ.ui.confirm('Restore “' + data.event.title + '” (' + data.parties.length + ' guests, ' + data.awards.length + ' awards) as a NEW event? Your current event is not changed.', 'Restore');
  if (!ok) return;
  BQ.ui.toast('Restoring… this can take a minute.');
  try { await IM.restoreData(data, ' (restored ' + X_today() + ')'); } catch (e) { BQ.ui.toast('Restore stopped: ' + e.message, 'bad'); }
};
function X_today() { return BQ.exports.today(); }

IM.restoreData = async function (data, suffix) {
  const store = BQ.state.store;
  const ev = { title: data.event.title + (suffix || ''), date: data.event.date, venue: data.event.venue, layout: data.event.layout, settings: data.event.settings, status: 'Active' };
  ev.id = await store.saveEvent(ev);
  const idMap = {};
  for (const p of data.parties) {
    const c = BQ.clone(p);
    const old = c.id; delete c.id;
    c.eventId = ev.id;
    c.needs = [];
    idMap[old] = await store.saveParty(c);
  }
  for (const p of data.parties) {
    if (!(p.needs || []).length) continue;
    const c = BQ.clone(p);
    c.id = idMap[p.id]; c.eventId = ev.id;
    c.needs.forEach(n => { if (idMap[n.target]) n.target = idMap[n.target]; });
    await store.saveParty(c);
  }
  for (const a of data.awards) {
    const c = BQ.clone(a);
    delete c.id; c.eventId = ev.id;
    (c.recipients || []).forEach(r => { if (idMap[r.pid]) r.pid = idMap[r.pid]; });
    await store.saveAward(c);
  }
  BQ.state.events.push(ev);
  await store.log(ev.id, 'Restored from backup', data.parties.length + ' guests, ' + data.awards.length + ' awards');
  await BQ.openEvent(ev.id);
  return ev;
};

/* ---------------------------------------------------------------------
   SAMPLE DATA (fictional people) for practice mode
   --------------------------------------------------------------------- */
BQ.sample = {
  rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; },
  async load() {
    const r = this.rng(7);
    const pick = a => a[Math.floor(r() * a.length)];
    const F = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Angela', 'Carlos', 'Denise', 'Anthony', 'Rachel', 'Marcus', 'Teresa', 'Kevin', 'Monica', 'Brian', 'Yolanda', 'Eric', 'Sandra', 'Jorge', 'Tamika', 'Steven', 'Erin', 'Luis', 'Kimberly', 'Darnell', 'Hannah', 'Victor', 'Gloria', 'Trent', 'Alicia', 'Omar', 'Brenda', 'Grant', 'Leticia'];
    const L = ['Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Castillo', 'Hargrove', 'Nguyen', 'Pruitt', 'Salazar', 'McAllister', 'Ferris', 'Ybarra', 'Kensington', 'Lowell', 'Abernathy', 'Quintero', 'Thibodeaux', 'Ashby', 'Rinaldi', 'Calloway', 'Duvall', 'Espinoza', 'Garrity', 'Holloway', 'Iverson', 'Jaramillo', 'Kowalski', 'Lindqvist', 'Mbeki', 'Northcutt', 'Oyelaran', 'Pennington', 'Rosales', 'Stanfield', 'Truong', 'Vasquez', 'Wexler', 'Zamora'];
    const units = ['Robbery Unit', 'Narcotics Division', 'Northeast Patrol', 'Mounted Unit', 'SWAT', 'Homicide Unit', 'K-9 Unit', 'Community Affairs', 'Personnel Division', 'Traffic Unit', 'Training Academy', 'Southwest Patrol'];
    const used = new Set();
    const person = () => { let n; do { n = pick(F) + ' ' + pick(L); } while (used.has(n)); used.add(n); return n; };
    const parties = [];
    const add = o => { const p = Object.assign({ type: 'Guest', aff: '', seats: 1, table: '', guests: [], needs: [], pay: '', payNote: '', phone: '', email: '', notes: '', checkedIn: 0, pinned: false, group: '' }, o); parties.push(p); return p; };
    add({ name: BQ.config.demo ? 'Host Foundation' : 'Friends of the Dallas Police', type: 'Host', seats: 7, table: '8', pinned: true, pay: BQ.config.trackPayment ? 'Comp (no charge)' : '', notes: 'Host organization seats' });
    add({ name: 'Event Volunteers', type: 'Volunteers', seats: 10, table: '66', pay: BQ.config.trackPayment ? 'Comp (no charge)' : '' });
    add({ name: 'Bagpipe & Drum Corps', type: 'Performers', seats: 10, pay: BQ.config.trackPayment ? 'Comp (no charge)' : '' });
    add({ name: 'DPD Choir', type: 'Performers', seats: 2, pay: BQ.config.trackPayment ? 'Comp (no charge)' : '' });
    add({ name: 'Chief’s Command Staff', type: 'VIP', seats: 10, pay: BQ.config.trackPayment ? 'Comp (no charge)' : '', needs: [{ type: 'front', target: '' }], vip: true, vipCount: 10 });
    units.forEach(u => add({ name: u, type: 'Unit', aff: u, seats: 4 + Math.floor(r() * 9), pay: BQ.config.trackPayment ? pick(['Paid', 'Paid', 'Pending', 'Invoice sent']) : '' }));
    for (let i = 0; i < 62; i++) {
      const n = person();
      const seats = pick([1, 2, 2, 2, 2, 3, 4, 4, 4, 6]);
      const aff = r() < 0.45 ? pick(units) : '';
      const guests = r() < 0.4 ? Array.from({ length: Math.min(seats - 1, 2) }, () => person()) : [];
      const pay = pick(['Paid', 'Paid', 'Paid', 'Pending', 'Not paid', '']);
      add({ name: n, seats, aff, guests, pay: BQ.config.trackPayment ? pay : '' });
    }
    // a few special requests
    const G = parties.filter(p => p.type === 'Guest');
    G[0].needs = [{ type: 'front', target: '' }]; G[0].notes = 'Hard of hearing';
    G[1].needs = [{ type: 'front', target: '' }];
    G[2].needs = [{ type: 'access', target: '' }]; G[2].notes = 'Uses a wheelchair; remove one chair';
    G[3].needs = [{ type: 'exit', target: '' }];
    G[4].needs = [{ type: 'near', target: 'aff:Robbery Unit' }];
    G[5].needs = [{ type: 'near', target: 'aff:SWAT' }];
    G[6].needs = [{ type: 'note', text: 'Wants a vegetarian meal: tell the hotel', target: '' }];
    G[7].needs = [{ type: 'back', target: '' }]; G[7].notes = 'Leaving early (babysitter)';
    [0, 9, 14, 21, 30].forEach(i => { G[i].vip = true; G[i].vipCount = Math.min(2, G[i].seats); });
    parties[0].vip = true; parties[0].vipCount = 7;
    // save guests, seat about 75% of them, then add awards
    const st = BQ.state;
    await BQ.commit('Loaded sample guests', parties.map(p => ({ kind: 'party', before: null, after: p })), { noUndo: true });
    await BQ.commit('Sample table rules', [BQ.eventChange(e => {
      e.layout.tables.forEach(t => {
        if (t.n === '72') { t.st = 'hold'; t.note = 'Leave empty'; }
        if (t.n === '66') t.res = 'Volunteers';
        if (['7', '8', '9', '10'].includes(t.n)) t.zone = 'Head of house';
      });
      e.settings = Object.assign({}, e.settings, { zones: [{ name: 'Head of house', color: '#7E57C2' }] });
    })], { noUndo: true });
    const plan = BQ.planAutoSeat().plan.filter((x, i) => i % 4 !== 3);
    await BQ.commit('Sample seating', plan.map(x => BQ.partyChange(x.party, a => { a.table = x.table; })), { noUndo: true });
    const byName = n => st.parties.find(p => p.name === n);
    const seatedGuests = st.parties.filter(p => p.type === 'Guest' && p.table);
    const awards = [
      ['Medal of Valor', 'Valor', 'Individual', 'Part 1', [seatedGuests[3]]],
      ['Medal of Valor', 'Valor', 'Individual', 'Part 1', [seatedGuests[9]]],
      ['Life Saving Award', 'Service', 'Group', 'Part 1', [seatedGuests[12], seatedGuests[15]]],
      ['Unit Citation', 'Unit', 'Group', 'Part 1', [byName('Robbery Unit')]],
      ['Officer of the Year', 'Honors', 'Individual', 'Part 2', [seatedGuests[20]]],
      ['Detective of the Year', 'Honors', 'Individual', 'Part 2', [seatedGuests[24]]],
      ['Civilian Employee of the Year', 'Honors', 'Individual', 'Part 2', [seatedGuests[30]]],
      ['Unit Citation', 'Unit', 'Group', 'Part 2', [byName('SWAT')]],
      ['Community Service Award', 'Service', 'Individual', 'Part 3', [seatedGuests[33]]],
      ['Chief’s Award', 'Honors', 'Individual', 'Part 3', [seatedGuests[36]]]
    ];
    await BQ.commit('Sample awards', awards.map((a, i) => ({
      kind: 'award', before: null, after: {
        name: a[0], cat: a[1], kind: a[2], segment: a[3], order: i + 1, presenter: '', notes: '', status: '',
        recipients: a[4].filter(Boolean).map(p => ({ name: p.name, pid: p.id, count: BQ.isOrg(p) ? Math.min(p.seats, 6) : 1 }))
      }
    })), { noUndo: true });
    BQ.history = [];
    BQ.ui.changed();
    BQ.ui.toast('Sample data loaded. These are made-up people.', 'ok');
  }
};
