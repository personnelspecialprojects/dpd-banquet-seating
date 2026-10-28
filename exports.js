/* =====================================================================
   exports.js — Excel exports (ExcelJS) and print/PDF views, plus the
   Print & Export screen.
     • Classic format: same layout/colors as the original
       "Table seating for FDP AWARDS BANQUET" workbook (both tabs)
     • Alphabetical, Table rosters, Check-in, Payment, Awards lineup,
       Full backup
     • Print: map, A–Z board, rosters, check-in, lineup, table tents,
       escort cards, map picture (PNG)
   ===================================================================== */
window.BQ = window.BQ || {};
BQ.exports = {};
BQ.screens = BQ.screens || {};

const X = BQ.exports;

/* ---------------------------------------------------------------------
   Shared helpers
   --------------------------------------------------------------------- */
X.fileBase = function () {
  const e = BQ.state.event;
  return String(e.title || 'Banquet').replace(/[\\/:*?"<>|]+/g, '').trim();
};
X.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
X.download = function (blob, name) {
  if (BQ.config.demo) { BQ.ui.toast('This preview can’t download files. In the real app this saves “' + name + '”.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
};
X.needExcel = function () {
  if (typeof ExcelJS === 'undefined') { BQ.ui.toast('The Excel tool didn’t load (check your internet connection), so this export can’t run.', 'bad'); return false; }
  return true;
};
X.save = async function (wb, label) {
  const buf = await wb.xlsx.writeBuffer();
  X.download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), X.fileBase() + ' - ' + label + ' ' + X.today() + '.xlsx');
  BQ.logAction('Exported ' + label, '');
};
X.fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
X.thin = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
X.sortedTables = () => BQ.tables().slice().sort((a, b) => BQ.numSort(a.n, b.n));
X.needsText = p => (p.needs || []).map(n => {
  const d = BQ.NEEDS[n.type] || { label: n.type };
  const t = BQ.targetLabel(n);
  return n.type === 'note' ? 'Note: ' + t + (n.done ? ' (handled)' : '') : d.label.replace('…', '') + (t ? ' ' + t : '');
}).join('; ');
X.tableLabel = n => 'TABLE ' + n;
X.newBook = function () {
  const wb = new ExcelJS.Workbook();
  wb.creator = BQ.config.appName;
  wb.created = new Date();
  return wb;
};
// standard header row helper for the modern exports
X.header = function (ws, row, values, opts) {
  opts = opts || {};
  const r = ws.getRow(row);
  r.values = values;
  r.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: opts.size || 12 };
  r.height = 22;
  values.forEach((v, i) => { const c = r.getCell(i + 1); c.fill = X.fill('FF1F3A5F'); c.border = X.thin; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
};
X.title = function (ws, text, sub, cols) {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = text; c.font = { bold: true, size: 18, color: { argb: 'FF1F3A5F' } }; c.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;
  if (sub) {
    ws.mergeCells(2, 1, 2, cols);
    const s = ws.getCell(2, 1);
    s.value = sub; s.font = { italic: true, size: 11, color: { argb: 'FF555555' } }; s.alignment = { horizontal: 'center' };
  }
};
X.printSetup = function (ws, orientation, titleRows) {
  ws.pageSetup = Object.assign(ws.pageSetup || {}, {
    paperSize: 1, orientation: orientation || 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, horizontalCentered: true
  });
  if (titleRows) ws.pageSetup.printTitlesRow = titleRows;
  ws.headerFooter = { oddFooter: '&L' + BQ.state.event.title.replace(/&/g, '&&') + '&RPage &P of &N' };
};

/* ---------------------------------------------------------------------
   1. CLASSIC FORMAT (matches the original workbook)
   --------------------------------------------------------------------- */
X.CLASSIC = { FULL: 'FF92D050', FULL_DARK: 'FF70AD47', VACANT: 'FFC00000', HOLD: 'FFFFC000', UNITS: 'FF00B0F0', GRAY: 'FFA6A6A6' };

// Rows describing one table block in the classic layout
X.classicBlock = function (t) {
  const u = BQ.tableUse(t), st = BQ.tableStatus(t);
  const rows = [];
  const status = st === 'hold' ? '' : st === 'reserved' ? 'Full-' + Math.max(u.used, u.cap) : (st === 'full' ? 'Full-' + u.used : (u.used === 0 ? '' : u.open + ' ava'));
  const statusFill = st === 'hold' ? X.CLASSIC.HOLD : (st === 'full' || st === 'reserved') ? X.CLASSIC.FULL : X.CLASSIC.VACANT;
  const ps = u.parties.slice().sort((a, b) => (a.id || 0) - (b.id || 0));
  if (st === 'reserved' && !ps.length) {
    // a reserved block prints like a unit row: name in blue, all chairs counted
    rows.push({ a: X.tableLabel(t.n), b: t.res || 'Reserved', c: u.cap, d: status, fillA: statusFill, fillB: X.CLASSIC.UNITS, fillD: statusFill });
  } else if (st === 'hold' && !ps.length) {
    rows.push({ a: X.tableLabel(t.n), b: t.note || t.res || 'Leave empty', c: 'hold', d: '', fillA: X.CLASSIC.HOLD, fillB: X.CLASSIC.HOLD, fillC: X.CLASSIC.HOLD, fillD: X.CLASSIC.HOLD });
  } else if (!ps.length) {
    rows.push({ a: X.tableLabel(t.n), b: t.res || '', c: '', d: '', fillA: X.CLASSIC.VACANT, fillD: X.CLASSIC.VACANT, boldD: true });
  } else {
    ps.forEach((p, i) => {
      rows.push({
        a: i === 0 ? X.tableLabel(t.n) : '', b: BQ.displayName(p), c: p.seats, d: i === 0 ? status : '',
        fillA: i === 0 ? statusFill : X.CLASSIC.GRAY, fillD: i === 0 ? statusFill : X.CLASSIC.GRAY,
        fillB: BQ.isOrg(p) && p.type !== 'Hold' ? X.CLASSIC.UNITS : (p.type === 'Hold' ? X.CLASSIC.HOLD : null),
        boldD: i === 0 && st === 'open', whiteD: i === 0 && st === 'open'
      });
    });
  }
  rows.push({ sep: true });
  return rows;
};

X.classicHead = function (ws, col, title) {
  const C = X.CLASSIC;
  ws.mergeCells(1, col, 1, col + 3);
  const t = ws.getCell(1, col);
  t.value = '      ' + title;
  t.font = { name: 'Calibri', size: 20, bold: true };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let i = 0; i < 4; i++) ws.getCell(1, col + i).border = X.thin;
  [['Full', C.FULL_DARK], ['Vacant', C.VACANT], ['On hold', C.HOLD], ['Units', C.UNITS]].forEach((v, i) => {
    const c = ws.getCell(2, col + i);
    c.value = v[0]; c.fill = X.fill(v[1]); c.font = { name: 'Calibri', size: 12 }; c.alignment = { horizontal: 'center' }; c.border = X.thin;
  });
  ['Table Number', 'Name of attend', '# of seats', 'Full/Vacant'].forEach((v, i) => {
    const c = ws.getCell(3, col + i);
    c.value = v; c.font = { name: 'Calibri', size: 14, bold: true, underline: i > 0 }; c.alignment = { horizontal: 'center' }; c.border = X.thin;
  });
};

X.classicWrite = function (ws, startRow, col, rows) {
  let r = startRow;
  rows.forEach(row => {
    const cells = [0, 1, 2, 3].map(i => ws.getCell(r, col + i));
    cells.forEach(c => { c.font = { name: 'Calibri', size: 16 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = X.thin; });
    if (row.sep) {
      cells.forEach(c => { c.fill = X.fill(X.CLASSIC.GRAY); });
    } else {
      cells[0].value = row.a; cells[1].value = row.b; cells[2].value = row.c === '' ? null : row.c; cells[3].value = row.d || null;
      if (row.fillA) cells[0].fill = X.fill(row.fillA);
      if (row.fillB) cells[1].fill = X.fill(row.fillB);
      if (row.fillC) cells[2].fill = X.fill(row.fillC);
      if (row.fillD) cells[3].fill = X.fill(row.fillD);
      if (row.a) cells[0].font = { name: 'Calibri', size: 16, bold: false };
      if (row.boldD) cells[3].font = { name: 'Calibri', size: 16, bold: true, color: { argb: row.whiteD ? 'FFFFFFFF' : 'FF000000' } };
    }
    r++;
  });
  return r;
};

X.classicXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const title = BQ.settings().exportTitle || 'Table seating for FDP AWARDS BANQUET';
  const tables = X.sortedTables();

  // Tab 1: "Sheet1" — every table, four columns across (like the original)
  const ws1 = wb.addWorksheet('Sheet1');
  const widths = [21.29, 30.29, 18.43, 17.86, 9.14, 21.71, 28.0, 14.29, 17.43, 9.14, 21.86, 28.14, 15.14, 18.57, 9.14, 21.71, 32.86, 14.0, 31.14];
  ws1.columns = widths.map(w => ({ width: w }));
  const blocks = tables.map(t => X.classicBlock(t));
  const total = blocks.reduce((s, b) => s + b.length, 0);
  const per = Math.ceil(total / 4);
  const groups = [[], [], [], []];
  let gi = 0, count = 0;
  blocks.forEach(b => {
    if (count >= per && gi < 3) { gi++; count = 0; }
    groups[gi].push(b); count += b.length;
  });
  [1, 6, 11, 16].forEach((col, i) => {
    X.classicHead(ws1, col, title);
    let r = 4;
    groups[i].forEach(b => { r = X.classicWrite(ws1, r, col, b); });
  });
  ws1.pageSetup = { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // Tab 2: "printable version" — tables in use, one column
  const ws2 = wb.addWorksheet('printable version');
  ws2.columns = [{ width: 19.86 }, { width: 41.14 }, { width: 16.71 }, { width: 18.43 }];
  X.classicHead(ws2, 1, title);
  let r = 4;
  tables.forEach(t => {
    const st = BQ.tableStatus(t);
    if (st === 'empty') return;
    r = X.classicWrite(ws2, r, 1, X.classicBlock(t));
  });
  ws2.pageSetup = { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3' };
  wb.views = [{ activeTab: 1 }];
  await X.save(wb, 'Classic seating');
};

/* ---------------------------------------------------------------------
   2. ALPHABETICAL
   --------------------------------------------------------------------- */
X.alphaRows = function () {
  const rows = BQ.people().filter(x => !x.party.notAttending).map(x => {
    const p = x.party;
    const org = x.org || (x.leader && BQ.orgOnly(p));   // a company with no person name lists as the company
    const n = org ? { first: '', last: x.name } : BQ.splitName(x.name);
    const company = org || !p.company ? '' : p.company;
    const rank = x.leader && !org ? BQ.rankShort(p.rank) : '';
    let party = '';
    if (x.org) party = BQ.typeInfo(p.type).label + ' (' + p.seats + ' seats)';
    else if (x.leader) party = p.seats > 1 ? 'Party of ' + p.seats : '';
    else party = 'Guest of ' + BQ.displayName(p);
    if (company) party = company + (party ? ' · ' + party : '');
    return { key: BQ.sortKey(x.name, org), first: n.first, last: n.last, rank, company, badge: org ? '' : x.leader ? (p.badge || BQ.cleanPerson(x.name).badge) : BQ.cleanPerson(x.name).badge, name: x.name, table: p.table || '', party, seats: x.leader ? p.seats : '', p, leader: x.leader, org };
  });
  // reserved blocks (e.g. FDP Sponsors) get one line listing their tables
  BQ.reservations().forEach(b => rows.push({ key: BQ.sortKey(b.label, true), first: '', last: b.label, name: b.label, table: b.tables.join(', '),
    party: 'Reserved: ' + BQ.plural(b.tables.length, 'table'), seats: b.seats, p: { vip: false, pay: '', seats: b.seats }, leader: false, org: true, block: true }));
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
};
// "Sgt. Nielsen, Jared (Quik Trip)" — or just the name for units, organizations and reserved blocks
X.lf = x => x.org ? x.name : (x.rank ? x.rank + ' ' : '') + x.last + (x.first ? ', ' + x.first : '') + (x.company ? ' (' + x.company + ')' : '');

X.alphaXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Alphabetical', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 10 }, { width: 24 }, { width: 22 }, { width: 10 }, { width: 10 }, { width: 40 }, { width: 10 }, { width: 10 }];
  X.title(ws, BQ.state.event.title + ' — Alphabetical List', 'Printed ' + new Date().toLocaleString(), 8);
  X.header(ws, 3, ['Rank', 'Last Name', 'First Name', 'Badge', 'Table', 'Party / Group', 'Seats', 'VIP tickets']);
  let r = 4, letter = '';
  X.alphaRows().forEach(x => {
    const L = (x.key[0] || '#').toUpperCase();
    if (L !== letter) {
      letter = L;
      ws.mergeCells(r, 1, r, 8);
      const c = ws.getCell(r, 1);
      c.value = L; c.font = { bold: true, size: 13, color: { argb: 'FF1F3A5F' } }; c.fill = X.fill('FFDCE6F2');
      r++;
    }
    const row = ws.getRow(r);
    row.values = [x.rank || '', x.last, x.first, x.badge || '', x.table || 'Not seated', x.party, x.seats, x.p.vip && (x.leader || x.block) ? BQ.vipCount(x.p) : (x.p.vip ? '★' : '')];
    row.getCell(8).alignment = { horizontal: 'center' };
    row.font = { size: 12 };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).font = { size: 14, bold: true, color: { argb: x.table ? 'FF000000' : 'FFC00000' } };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(i => { row.getCell(i).border = { bottom: { style: 'hair', color: { argb: 'FFBBBBBB' } } }; });
    r++;
  });
  X.printSetup(ws, 'portrait', '3:3');
  await X.save(wb, 'Alphabetical');
};

/* ---------------------------------------------------------------------
   3. TABLE ROSTERS
   --------------------------------------------------------------------- */
X.rostersXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Table Rosters');
  ws.columns = [{ width: 32 }, { width: 10 }, { width: 11 }, { width: 22 }, { width: 42 }, { width: 36 }];
  X.title(ws, BQ.state.event.title + ' — Table Rosters', 'Printed ' + new Date().toLocaleString(), 6);
  // rows 3–4: totals; row 5: spacer; tables start at row 6
  let r = 6;
  const first = r;
  let seated = 0, reserved = 0;
  const fills = { full: 'FFC6E7C1', open: 'FFF8CBCB', empty: 'FFEFEFEF', hold: 'FFFFE3A3', reserved: 'FFFFF1C2' };
  X.sortedTables().forEach(t => {
    const u = BQ.tableUse(t), st = BQ.tableStatus(t), rs = BQ.reservedSeats(t);
    ws.mergeCells(r, 1, r, 6);
    const h = ws.getCell(r, 1);
    h.value = 'TABLE ' + t.n + '   —   ' + (st === 'hold' ? 'ON HOLD' : st === 'reserved' ? 'RESERVED' + (t.res ? ' for ' + t.res : '') + ' (' + u.cap + ' chairs)' : u.used + ' of ' + u.cap + ' seats' + (u.open ? ' (' + u.open + ' open)' : ' (full)')) +
      (t.note && st !== 'reserved' ? '   —   ' + t.note : '') + (t.res && st !== 'reserved' ? '   —   ' + t.res : '') + (t.zone ? '   —   Area: ' + t.zone : '');
    h.font = { bold: true, size: 13 }; h.fill = X.fill(fills[st]); h.border = X.thin;
    ws.getRow(r).height = 20;
    r++;
    if (u.parties.length || rs) {
      const hr = ws.getRow(r);
      hr.values = ['Guest / group', 'Seated guests', 'Reserved seats', 'Unit', 'Guest names', 'Requests & notes'];
      hr.font = { bold: true, size: 10, color: { argb: 'FF555555' } };
      hr.alignment = { wrapText: true, vertical: 'bottom' };
      r++;
      u.parties.forEach(p => {
        const row = ws.getRow(r);
        row.values = [BQ.displayName(p), Number(p.seats) || 0, null, p.aff, (p.guests || []).join(', '), [X.needsText(p), p.notes].filter(Boolean).join(' | ')];
        seated += Number(p.seats) || 0;
        row.alignment = { wrapText: true, vertical: 'top' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'top' };
        r++;
      });
      if (rs) {
        const row = ws.getRow(r);
        row.values = ['🔒 Reserved: ' + (t.res || 'reserved block'), null, rs, '', '', 'Whole table held for this block; names not on the guest list'];
        reserved += rs;
        row.font = { italic: true, color: { argb: 'FF7A5A00' } };
        row.getCell(3).alignment = { horizontal: 'center' };
        for (let c = 1; c <= 6; c++) row.getCell(c).fill = X.fill('FFFFF6D8');
        r++;
      }
    }
    r++;
  });
  // TOTALS at the top and bottom: live SUMs of the Seated guests (B) and Reserved seats (C) columns, so they can be checked
  const last = r - 1;
  const totals = (row) => {
    const hd = ws.getRow(row), v = ws.getRow(row + 1);
    hd.values = ['TOTALS', 'Seated guests', 'Reserved seats', 'All seats'];
    v.values = ['Sums of column B and column C', { formula: 'SUM(B' + first + ':B' + last + ')', result: seated }, { formula: 'SUM(C' + first + ':C' + last + ')', result: reserved },
      { formula: 'B' + (row + 1) + '+C' + (row + 1), result: seated + reserved }];
    ws.mergeCells(row, 5, row + 1, 6);
    ws.getCell(row, 5).value = 'Seated guests = everyone on the guest list with a table. Reserved seats = chairs held at reserved tables (e.g. sponsors) whose names aren’t on the list. All seats = both together.';
    ws.getCell(row, 5).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
    ws.getCell(row, 5).alignment = { wrapText: true, vertical: 'middle' };
    hd.font = { bold: true, size: 10, color: { argb: 'FF1F3A5F' } };
    v.font = { bold: true, size: 14 };
    v.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
    for (let c = 1; c <= 4; c++) {
      hd.getCell(c).fill = X.fill('FFDCE6F2'); v.getCell(c).fill = X.fill(c === 3 ? 'FFFFF1C2' : c === 4 ? 'FFC6E7C1' : 'FFDCE6F2');
      hd.getCell(c).border = { top: { style: 'medium' } }; v.getCell(c).border = { bottom: { style: 'medium' } };
      if (c > 1) { hd.getCell(c).alignment = { horizontal: 'center', wrapText: true }; v.getCell(c).alignment = { horizontal: 'center' }; }
    }
    v.height = 22;
  };
  totals(3);
  totals(r + 1);
  X.printSetup(ws, 'landscape');

  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  sum.columns = [{ width: 10 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 30 }, { width: 8 }];
  X.header(sum, 1, ['Table', 'Chairs', 'Seated guests', 'Reserved seats', 'Open', 'Status', 'Area', 'Reserved / note', 'Row']);
  X.sortedTables().forEach((t, i) => {
    const u = BQ.tableUse(t), st = BQ.tableStatus(t);
    sum.getRow(i + 2).values = [isNaN(Number(t.n)) ? t.n : Number(t.n), u.cap, u.used, BQ.reservedSeats(t) || null, st === 'hold' ? 0 : u.open, { full: 'Full', open: 'Open seats', empty: 'Empty', hold: 'On hold', reserved: 'Reserved' }[st], t.zone || '', t.res || t.note || '', BQ.rowOf(t.n)];
  });
  const nT = X.sortedTables().length, tr = sum.getRow(nT + 2);
  const col = k => X.sortedTables().reduce((n, t) => n + (k === 'open' && BQ.tableStatus(t) === 'hold' ? 0 : BQ.tableUse(t)[k]), 0);
  const resAll = X.sortedTables().reduce((n, t) => n + BQ.reservedSeats(t), 0);
  const f = (L, v) => ({ formula: 'SUM(' + L + '2:' + L + (nT + 1) + ')', result: v });
  tr.values = ['TOTAL', f('B', col('cap')), f('C', col('used')), f('D', resAll), f('E', col('open'))];
  tr.font = { bold: true };
  for (let c = 1; c <= 9; c++) { tr.getCell(c).fill = X.fill('FFDCE6F2'); tr.getCell(c).border = { top: { style: 'medium' } }; }
  sum.autoFilter = { from: 'A1', to: 'I1' };
  await X.save(wb, 'Table rosters');
};

/* ---------------------------------------------------------------------
   4. CHECK-IN SHEET  /  5. PAYMENT REPORT
   --------------------------------------------------------------------- */
X.checkinXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Check-In', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 7 }, { width: 30 }, { width: 9 }, { width: 30 }, { width: 8 }, { width: 16 }, { width: 8 }];
  X.title(ws, BQ.state.event.title + ' — Check-In', 'Tick the box as each guest arrives · VIP tickets = how many may attend the VIP reception (★ = guest in a VIP party)', 7);
  const P = BQ.config.trackPayment;
  X.header(ws, 3, P ? ['Here', 'Name', 'Table', 'Party / Group', 'Seats', 'Payment', 'VIP tickets'] : ['Here', 'Name', 'Table', 'Party / Group', 'Seats', 'VIP tickets']);
  let r = 4;
  X.alphaRows().forEach(x => {
    const row = ws.getRow(r);
    const vals = ['☐', X.lf(x), x.table || '—', x.party, x.seats];
    if (P) vals.push(x.leader ? (x.p.pay || '') : '');
    vals.push(x.p.vip ? (x.leader ? BQ.vipCount(x.p) : '★') : '');
    row.values = vals;
    row.getCell(vals.length).alignment = { horizontal: 'center' };
    row.font = { size: 13 };
    row.getCell(1).font = { size: 16 }; row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).font = { size: 14, bold: true }; row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    if (P && x.leader && BQ.payClass(x.p.pay) === 'bad') row.getCell(6).font = { size: 12, bold: true, color: { argb: 'FFC00000' } };
    for (let i = 1; i <= vals.length; i++) row.getCell(i).border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    r++;
  });
  X.printSetup(ws, 'portrait', '3:3');
  await X.save(wb, 'Check-in sheet');
};

X.paymentXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 28 }, { width: 18 }, { width: 22 }, { width: 8 }, { width: 8 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 28 }];
  const order = { bad: 0, warn: 1, none: 2, ok: 3 };
  const ps = BQ.state.parties.slice().sort((a, b) => order[BQ.payClass(a.pay)] - order[BQ.payClass(b.pay)] || a.name.localeCompare(b.name));
  const counts = {};
  ps.forEach(p => { const k = p.pay || 'Not set'; counts[k] = (counts[k] || 0) + p.seats; });
  X.title(ws, BQ.state.event.title + ' — Payment Status', Object.keys(counts).map(k => k + ': ' + counts[k] + ' seats').join('   ·   '), 9);
  X.header(ws, 3, ['Name', 'Type', 'Unit / org', 'Seats', 'Table', 'Payment', 'Payment note', 'Phone', 'Email']);
  const colors = { bad: 'FFF8CBCB', warn: 'FFFFF2CC', none: 'FFF2F2F2', ok: 'FFE2F0D9' };
  ps.forEach((p, i) => {
    const row = ws.getRow(i + 4);
    row.values = [p.name, BQ.typeInfo(p.type).label, p.aff, p.seats, p.table || '', p.pay || 'Not set', p.payNote, p.phone, p.email];
    row.getCell(6).fill = X.fill(colors[BQ.payClass(p.pay)]);
  });
  ws.autoFilter = { from: 'A3', to: 'I3' };
  X.printSetup(ws, 'landscape', '3:3');
  await X.save(wb, 'Payment report');
};

/* ---------------------------------------------------------------------
   6. AWARDS LINEUP
   --------------------------------------------------------------------- */
X.lineupXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Program', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 5 }, { width: 22 }, { width: 9 }, { width: 26 }, { width: 10 }, { width: 26 }, { width: 9 }, { width: 7 }, { width: 8 }, { width: 22 }, { width: 18 }, { width: 11 }];
  X.title(ws, BQ.state.event.title + ' — Awards Program & Lineup', 'In presentation order', 12);
  X.header(ws, 3, ['#', 'Segment', 'Log #', 'Award', 'Rank', 'Recipient', 'Badge', 'People', 'Table', 'Seated with', 'Presenter', 'Status']);
  let r = 4;
  BQ.awardsSorted().forEach((a, i) => {
    const recs = (a.recipients || []).length ? a.recipients : [{ name: '' }];
    recs.forEach((rec, k) => {
      const s = rec.name ? BQ.recipientSeat(rec) : {};
      const row = ws.getRow(r);
      row.values = [k === 0 ? i + 1 : '', k === 0 ? a.segment : '', k === 0 ? (a.logNo || '') : '', k === 0 ? a.name : '', BQ.rankShort(rec.rank), rec.name, rec.badge || '', rec.name ? (rec.count || 1) : '',
        s.table || (rec.name ? s.text : ''), s.party ? s.party.name : '', k === 0 ? a.presenter : '', k === 0 ? (a.status || '') : ''];
      row.getCell(9).font = { bold: true, size: 12, color: { argb: s.table ? 'FF000000' : 'FFC00000' } };
      row.getCell(9).alignment = { horizontal: 'center' };
      if (k === 0) { row.getCell(4).font = { bold: true }; row.getCell(3).font = { bold: true }; }
      for (let c = 1; c <= 12; c++) row.getCell(c).border = k === recs.length - 1 ? { bottom: { style: 'thin' } } : {};
      r++;
    });
  });
  X.printSetup(ws, 'landscape', '3:3');

  const rt = wb.addWorksheet('Pickup route');
  rt.columns = [{ width: 20 }, { width: 6 }, { width: 10 }, { width: 34 }, { width: 7 }, { width: 8 }, { width: 10 }, { width: 26 }];
  X.title(rt, 'Escort Pickup Route', 'Walking order, row by row from the stage', 8);
  X.header(rt, 3, ['Segment', 'Stop', 'Table', 'Recipient', 'People', 'Award #', 'Log #', 'Award']);
  r = 4;
  BQ.segments().filter(sg => sg.awards.length).forEach(sg => {
    BQ.pickupRoute(sg.awards).forEach((s, i) => {
      rt.getRow(r).values = [sg.name || 'Program', i + 1, s.seat.table || s.seat.text, BQ.recipLabel(s.r), s.r.count || 1, s.num, s.award.logNo || '', s.award.name];
      rt.getRow(r).getCell(3).font = { bold: true, size: 12 };
      r++;
    });
    r++;
  });
  X.printSetup(rt, 'portrait', '3:3');
  await X.save(wb, 'Awards lineup');
};

/* Award file — same layout as the awards spreadsheet, with the table added */
X.awardFileXlsx = async function () {
  if (!X.needExcel()) return;
  const all = BQ.awardsSorted();
  if (!all.length) { BQ.ui.toast('There are no awards yet.'); return; }
  const wb = X.newBook();
  const ws = wb.addWorksheet('Sheet1', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ width: 24 }, { width: 34 }, { width: 8 }, { width: 13 }, { width: 30 }, { width: 9 }, { width: 28 }, { width: 11 }];
  const h = ws.getRow(1);
  h.values = ['RANK', 'Officer/Emp Name', 'MEMO', 'Log Number', 'Notes', 'TABLE', 'Seated with', 'Status'];
  h.font = { bold: true };
  [6, 7, 8].forEach(c => { h.getCell(c).fill = X.fill('FFDCE6F2'); });
  let r = 2;
  BQ.segments().filter(sg => sg.awards.length).forEach(sg => {
    const hc = ws.getRow(r);
    hc.getCell(2).value = (sg.name || 'Awards').toUpperCase();
    hc.getCell(2).font = { bold: true };
    r++;
    sg.awards.forEach(a => (a.recipients || []).forEach(rec => {
      const s = BQ.recipientSeat(rec);
      const nm = String(rec.name || '').trim().replace(/\s+/g, '_') + (rec.badge ? '_' + rec.badge : '');
      const row = ws.getRow(r);
      row.values = [rec.rank || '', nm, rec.memo || '', a.logNo || '', rec.note || '', s.table || (s.state === 'na' ? 'Not attending' : s.state === 'wait' ? 'No table' : 'Not on list'), s.party ? s.party.name : '', a.status || ''];
      row.getCell(6).font = { bold: true, color: { argb: s.table ? 'FF000000' : 'FFC00000' } };
      row.getCell(6).alignment = { horizontal: 'center' };
      r++;
    }));
  });
  X.printSetup(ws, 'portrait', '1:1');
  await X.save(wb, 'Award file with tables');
};

/* VIP reception list */
X.vipRows = () => BQ.state.parties.filter(p => p.vip && !p.notAttending).map(p => ({ p, key: BQ.partySortKey(p), n: BQ.vipCount(p) })).sort((a, b) => a.key.localeCompare(b.key));
X.vipXlsx = async function () {
  if (!X.needExcel()) return;
  const rows = X.vipRows();
  if (!rows.length) { BQ.ui.toast('Nobody is marked for the VIP reception yet. Tick “VIP reception” in a guest’s details.'); return; }
  const wb = X.newBook();
  const ws = wb.addWorksheet('VIP Reception', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 7 }, { width: 32 }, { width: 10 }, { width: 40 }, { width: 22 }, { width: 9 }];
  X.title(ws, BQ.state.event.title + ' — VIP Reception', rows.reduce((s, x) => s + x.n, 0) + ' people · ' + rows.length + ' parties', 6);
  X.header(ws, 3, ['Here', 'Name', 'VIP tickets', 'Seats', 'Guest names', 'Unit / org', 'Table']);
  rows.forEach((x, i) => {
    const row = ws.getRow(i + 4);
    const nm = BQ.displayName(x.p, true);
    row.values = ['☐', nm, x.n, x.p.seats, (x.p.guests || []).join(', '), x.p.aff, x.p.table || ''];
    row.font = { size: 13 };
    row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(3).alignment = { horizontal: 'center' }; row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(3).font = { size: 13, bold: true };
    for (let c = 1; c <= 6; c++) row.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });
  X.printSetup(ws, 'portrait', '3:3');
  await X.save(wb, 'VIP reception list');
};
X.printVip = function () {
  const rows = X.vipRows();
  if (!rows.length) { BQ.ui.toast('Nobody is marked for the VIP reception yet.'); return; }
  X.print('<div class="pci">' + X.printHead('VIP Reception', rows.reduce((s, x) => s + x.n, 0) + ' people') + '<table><thead><tr><th>✓</th><th>Name</th><th>VIP tickets</th><th>Seats</th><th>Guests</th><th>Table</th></tr></thead><tbody>' +
    rows.map(x => '<tr><td class="box">☐</td><td>' + BQ.esc(BQ.displayName(x.p, true)) + '</td><td class="t">' + x.n + '</td><td class="c">' + x.p.seats + '</td><td>' + BQ.esc((x.p.guests || []).join(', ')) + '</td><td>' + BQ.esc(x.p.table || '') + '</td></tr>').join('') +
    '</tbody></table></div>', 'portrait', 'VIP reception list');
};

/* ---------------------------------------------------------------------
   TICKET PICK-UP SIGN-OUT SHEET
   Name + badge come from the app; Date, picked up by, and signature are left blank to fill in by hand.
   --------------------------------------------------------------------- */
X.TICKET_WHO = [['all', 'Everyone on the guest list'], ['people', 'People only (leave out units & organizations)'], ['awards', 'Award recipients only'], ['vip', 'VIP reception guests only']];
X.ticketRows = function (who) {
  const recips = BQ.recipientPartyIds();
  return BQ.state.parties.filter(p => p.type !== 'Hold' && (
    who === 'people' ? !BQ.isOrg(p) : who === 'awards' ? recips.has(p.id) : who === 'vip' ? !!p.vip : true))
    .map(p => {
      const org = BQ.nameIsOrg(p);
      return { key: BQ.partySortKey(p), name: BQ.displayName(p, true), badge: org ? '' : (p.badge || BQ.cleanPerson(p.name).badge || ''),
        tickets: p.notAttending ? 0 : Number(p.seats) || 0, vip: p.notAttending ? 0 : BQ.vipCount(p), table: p.notAttending ? '' : (p.table || ''),   // not coming: no tickets to hand out
        na: !!p.notAttending, nr: !!p.noResponse && !p.notAttending, pk: p.pickup || null };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
};
// sections: everyone else A–Z, then (optionally) No response, Not attending, and already picked up at the very end
X.ticketGroups = (rows, o) => {
  const pkOut = o.picked === 'end' || o.picked === 'skip';
  if (o.picked === 'skip') rows = rows.filter(x => !x.pk);
  const isPk = x => pkOut && x.pk, isNa = x => o.na && x.na && !isPk(x), isNr = x => o.nr && x.nr && !isPk(x);
  return [
    { rows: rows.filter(x => !isPk(x) && !isNa(x) && !isNr(x)) },
    { label: 'NO RESPONSE', rows: rows.filter(isNr) },
    { label: 'NOT ATTENDING', rows: rows.filter(isNa) },
    { label: 'TICKETS ALREADY PICKED UP', rows: o.picked === 'end' ? rows.filter(isPk) : [] }
  ].filter(g => g.rows.length);
};
X.ticketDialog = function (format) {
  const all = X.ticketRows('all');
  const opt = (type, name, value, checked, html) => '<label class="tkopt"><input type="' + type + '" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '/><span>' + html + '</span></label>';
  const cnt = n => ' <span class="muted small">(' + n + ')</span>';
  const m = BQ.ui.modal({
    title: 'Ticket pick-up sheet', wide: false,
    body: '<p class="muted small">One line per guest record, A–Z. <b>Name</b>, <b>Badge / Emp #</b>, <b>Tickets</b> (= seats), <b>VIP tickets</b> and <b>Table</b> come from the app. <b>Date</b>, <b>Picked up by</b> and <b>Signature</b> are left blank to fill in by hand (they’re filled in for tickets already marked picked up in the app).</p>' +
      '<div class="field"><label>Who should be on the sheet?</label>' + X.TICKET_WHO.map((w, i) => opt('radio', 'tkWho', w[0], i === 0, BQ.esc(w[1]) + cnt(X.ticketRows(w[0]).length))).join('') + '</div>' +
      '<div class="field"><label>Tickets already picked up' + cnt(all.filter(x => x.pk).length) + '</label>' +
        opt('radio', 'tkPk', 'end', true, 'Put them at the very end') + opt('radio', 'tkPk', 'skip', false, 'Leave them off the sheet') + opt('radio', 'tkPk', 'mix', false, 'Keep them in A–Z order') + '</div>' +
      '<div class="field"><label>Move to the bottom</label>' +
        opt('checkbox', 'tkNA', '1', true, '🚫 Not attending, under their own heading' + cnt(all.filter(x => x.na).length)) +
        opt('checkbox', 'tkNR', '1', false, '❔ No response, under their own heading' + cnt(all.filter(x => x.nr).length)) + '</div>',
    buttons: [{ label: 'Cancel' }, {
      label: format === 'xlsx' ? 'Download Excel' : 'Print', cls: 'primary', onClick: async mm => {
        const who = mm.el.querySelector('[name=tkWho]:checked').value;
        const o = { picked: mm.el.querySelector('[name=tkPk]:checked').value, na: mm.el.querySelector('[name=tkNA]').checked, nr: mm.el.querySelector('[name=tkNR]').checked };
        const groups = X.ticketGroups(X.ticketRows(who), o);
        if (!groups.length) { BQ.ui.toast('Nobody matches that choice.'); return false; }
        const label = who === 'all' ? '' : (X.TICKET_WHO.find(w => w[0] === who) || [])[1];
        if (format === 'xlsx') await X.ticketXlsx(groups, label); else X.printTickets(groups, label);
      }
    }]
  });
  return m;
};
X.TICKET_COLS = ['Date', 'Name', 'Badge / Emp #', 'Tickets', 'VIP tickets', 'Table', 'Picked up by (name & badge / emp #)', 'Signature'];
X.ticketCells = x => [x.pk ? BQ.fmtDate(x.pk.at) : '', x.name, x.badge, x.tickets || '', x.vip || '', x.table, x.pk ? (x.pk.by || 'Self') : '', ''];
X.ticketSub = (groups, sub) => {
  const rows = [].concat.apply([], groups.map(g => g.rows));
  return (sub ? sub + ' · ' : '') + rows.length + ' names · ' + rows.reduce((s, x) => s + x.tickets, 0) + ' tickets · ' + rows.reduce((s, x) => s + x.vip, 0) + ' VIP tickets';
};
X.ticketXlsx = async function (groups, sub) {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const ws = wb.addWorksheet('Ticket Pick-Up', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 11 }, { width: 27 }, { width: 11 }, { width: 8 }, { width: 8 }, { width: 7 }, { width: 34 }, { width: 28 }];
  X.title(ws, BQ.state.event.title + ' — Ticket Pick-Up', X.ticketSub(groups, sub), 8);
  X.header(ws, 3, X.TICKET_COLS);
  ws.getRow(3).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  const line = { style: 'thin', color: { argb: 'FF999999' } };
  let r = 4;
  groups.forEach(g => {
    if (g.label) {
      r++;   // a blank line, then the heading
      ws.mergeCells(r, 1, r, 8);
      const h = ws.getCell(r, 1);
      h.value = g.label + ' (' + g.rows.length + ')';
      const pk = g.label.indexOf('PICKED') >= 0;
      h.font = { bold: true, size: 13, color: { argb: pk ? 'FF1E5E2A' : 'FF8B1A1A' } }; h.fill = X.fill(pk ? 'FFE3F2E5' : 'FFF6E3E3');
      ws.getRow(r).height = 22;
      r++;
    }
    g.rows.forEach(x => {
      const row = ws.getRow(r++);
      row.values = X.ticketCells(x);
      row.height = 30;
      row.font = { size: 12 };
      for (let c = 1; c <= 8; c++) { const cell = row.getCell(c); cell.border = { top: line, bottom: line, left: line, right: line }; cell.alignment = { vertical: 'middle', horizontal: c >= 3 && c <= 6 ? 'center' : 'left' }; }
      row.getCell(3).numFmt = '@'; row.getCell(6).numFmt = '@';
      row.getCell(6).font = { size: 13, bold: true };
      if (x.pk) { row.getCell(1).font = { size: 11, color: { argb: 'FF1E5E2A' } }; row.getCell(7).font = { size: 11, color: { argb: 'FF1E5E2A' } }; }
    });
  });
  X.printSetup(ws, 'landscape', '3:3');
  await X.save(wb, 'Ticket pick-up sheet');
};
X.printTickets = function (groups, sub) {
  X.print('<div class="ptix">' + X.printHead('Ticket Pick-Up', X.ticketSub(groups, sub)) +
    '<table><thead><tr>' + X.TICKET_COLS.map((c, i) => '<th class="c' + i + '">' + BQ.esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    groups.map(g => (g.label ? '<tr class="grp' + (g.label.indexOf('PICKED') >= 0 ? ' pk' : '') + '"><td colspan="8">' + BQ.esc(g.label) + ' (' + g.rows.length + ')</td></tr>' : '') +
      g.rows.map(x => { const v = X.ticketCells(x); return '<tr' + (x.pk ? ' class="done"' : '') + '>' + v.map((c, i) => '<td class="c' + i + '">' + BQ.esc(c) + '</td>').join('') + '</tr>'; }).join('')).join('') +
    '</tbody></table></div>', 'landscape', 'ticket pick-up sheet');
};

/* ---------------------------------------------------------------------
   7. FULL BACKUP (everything; can be restored with Import → Restore)
   --------------------------------------------------------------------- */
X.backupXlsx = async function () {
  if (!X.needExcel()) return;
  const wb = X.newBook();
  const g = wb.addWorksheet('Guests', { views: [{ state: 'frozen', ySplit: 1 }] });
  const PAY = BQ.config.trackPayment;
  const cols = ['Name', 'Type', 'Unit / Org', 'Seats', 'Table', 'Guest Names', 'Requests'].concat(PAY ? ['Payment', 'Payment Note'] : []).concat(['Phone', 'Email', 'Notes', 'Checked In', 'Pinned', 'Split Group', 'VIP Reception', 'Badge', 'Not Attending', 'No Response', 'Rank', 'Organization', 'Tickets Picked Up']);
  g.columns = cols.map(c => ({ width: { Name: 28, 'Guest Names': 40, Requests: 40, Notes: 30, Email: 26, 'Payment Note': 22, 'Unit / Org': 22 }[c] || 12 }));
  X.header(g, 1, cols, { size: 11 });
  BQ.state.parties.slice().sort((a, b) => BQ.numSort(a.table || 'zz', b.table || 'zz') || a.name.localeCompare(b.name)).forEach((p, i) => {
    g.getRow(i + 2).values = [p.name, p.type, p.aff, p.seats, p.table, (p.guests || []).join('; '), X.needsText(p)].concat(PAY ? [p.pay, p.payNote] : []).concat([p.phone, p.email, p.notes, p.checkedIn || 0, p.pinned ? 'Yes' : '', p.group, p.vip ? BQ.vipCount(p) : '', p.badge || '', p.notAttending ? 'Yes' : '', p.noResponse && !p.notAttending ? 'Yes' : '', p.rank || '', p.company || '', BQ.pickupText(p)]);
  });
  g.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const t = wb.addWorksheet('Tables');
  t.columns = [{ width: 8 }, { width: 8 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 28 }, { width: 18 }];
  X.header(t, 1, ['Table', 'Chairs', 'Shape', 'X', 'Y', 'Status', 'Reserved / note', 'Area'], { size: 11 });
  X.sortedTables().forEach((tb, i) => { t.getRow(i + 2).values = [tb.n, tb.s, tb.sh || 'round', tb.x, tb.y, tb.st || 'open', tb.res || tb.note || '', tb.zone || '']; });
  const a = wb.addWorksheet('Awards');
  a.columns = [{ width: 6 }, { width: 30 }, { width: 18 }, { width: 12 }, { width: 16 }, { width: 50 }, { width: 22 }];
  X.header(a, 1, ['#', 'Award', 'Log #', 'Type', 'Segment', 'Recipients', 'Presenter'], { size: 11 });
  BQ.awardsSorted().forEach((aw, i) => { a.getRow(i + 2).values = [i + 1, aw.name, aw.logNo || '', aw.kind, aw.segment, (aw.recipients || []).map(r => BQ.recipLabel(r) + (r.count > 1 ? ' x' + r.count : '')).join('; '), aw.presenter]; });
  // machine-readable copy for Restore
  const raw = wb.addWorksheet('_app_data');
  raw.state = 'veryHidden';
  const e = BQ.state.event;
  const json = JSON.stringify({ v: 1, event: { title: e.title, date: e.date, venue: e.venue, layout: e.layout, settings: e.settings }, parties: BQ.state.parties, awards: BQ.state.awards });
  for (let i = 0, r = 1; i < json.length; i += 30000, r++) raw.getCell(r, 1).value = json.slice(i, i + 30000);
  await X.save(wb, 'Full backup');
};

/* ---------------------------------------------------------------------
   PRINT VIEWS (browser print → printer or “Save as PDF”)
   --------------------------------------------------------------------- */
X.print = function (html, orientation, label) {
  if (BQ.config.demo) { BQ.ui.toast('This preview can’t open the print window. In the real app this prints or saves a PDF.'); return; }
  let root = document.getElementById('printRoot');
  if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
  let st = document.getElementById('printPage');
  if (!st) { st = document.createElement('style'); st.id = 'printPage'; document.head.appendChild(st); }
  st.textContent = '@page { size: letter ' + (orientation || 'portrait') + '; margin: 0.4in; }';
  root.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing') && !window.matchMedia('print').matches) done(); }, 1500); }, 120);
  BQ.logAction('Printed ' + (label || ''), '');
};
X.printHead = (title, sub) => '<div class="ph"><h1>' + BQ.esc(title) + '</h1><div>' + BQ.esc(BQ.state.event.title) + (sub ? ' · ' + BQ.esc(sub) : '') + ' · printed ' + new Date().toLocaleDateString() + '</div></div>';

X.staticMapSvg = function (opts) {
  opts = opts || {};
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1600px;height:1000px';
  document.body.appendChild(host);
  const map = new BQ.Map(host, { mode: 'static', look: opts.look });
  map.fit();
  map.render();
  const L = BQ.state.event.layout;
  const svg = map.svg;
  svg.setAttribute('width', (L.w + 60) * (opts.scale || 1));
  svg.setAttribute('height', (L.h + 60) * (opts.scale || 1));
  const out = svg.outerHTML;
  host.remove();
  return out;
};

X.printMap = function () {
  const s = BQ.stats();
  const legend = '<div class="plegend">' + BQ.mapLegendHtml('status', true) + '<span class="lg"><b>' + s.seated + '</b>&nbsp;seated guests' + (s.resSeats ? ' · <b>' + s.resSeats + '</b>&nbsp;reserved-table seats · <b>' + (s.seated + s.resSeats) + '</b>&nbsp;all seats' : '') + ' · <b>' + s.open + '</b>&nbsp;open seats</span></div>';
  X.print('<div class="pmap">' + X.printHead('Seating Map') + '<div class="pmap-svg">' + X.staticMapSvg({ look: t => BQ.tableLook(t, { colorBy: 'status', awardTables: BQ.awardTableSet() }) }) + '</div>' + legend + '</div>', 'landscape', 'map');
};

X.mapPng = function () {
  const L = BQ.state.event.layout;
  const scale = 2;
  const svgText = X.staticMapSvg({ scale: 1, look: t => BQ.tableLook(t, { colorBy: 'status', awardTables: BQ.awardTableSet() }) })
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    const W = (L.w + 60) * scale, H = (L.h + 60) * scale;
    // measure the legend first, then size the picture to fit it
    const probe = document.createElement('canvas').getContext('2d');
    const legendH = BQ.drawLegendCanvas(probe, 30 * scale, 0, W - 60 * scale, scale);
    c.width = W; c.height = H + 70 * scale + legendH + 30 * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1F3A5F'; ctx.font = 'bold ' + (28 * scale) + 'px Segoe UI, Arial'; ctx.fillText(BQ.state.event.title + ' — Seating Map', 30 * scale, 45 * scale);
    ctx.drawImage(img, 0, 70 * scale, W, H);
    ctx.strokeStyle = '#D5DBE5'; ctx.lineWidth = scale; ctx.beginPath(); ctx.moveTo(30 * scale, 70 * scale + H + 6 * scale); ctx.lineTo(W - 30 * scale, 70 * scale + H + 6 * scale); ctx.stroke();
    BQ.drawLegendCanvas(ctx, 30 * scale, 70 * scale + H + 26 * scale, W - 60 * scale, scale);
    c.toBlob(b => { X.download(b, X.fileBase() + ' - Seating map ' + X.today() + '.png'); BQ.logAction('Exported map picture', ''); }, 'image/png');
  };
  img.onerror = () => BQ.ui.toast('Couldn’t make the picture. Try Print map → Save as PDF instead.', 'bad');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
};

X.printAlpha = function () {
  const rows = X.alphaRows();
  let letter = '', html = '';
  rows.forEach(x => {
    const L = (x.key[0] || '#').toUpperCase();
    if (L !== letter) { letter = L; html += '<div class="pa-letter">' + BQ.esc(L) + '</div>'; }
    html += '<div class="pa-row"><span>' + BQ.esc(X.lf(x)) + '</span><b>' + BQ.esc(x.table || '—') + '</b></div>';
  });
  X.print('<div class="palpha">' + X.printHead('Find Your Table', 'A–Z') + '<div class="pa-cols">' + html + '</div></div>', 'portrait', 'A–Z list');
};

X.printRosters = function () {
  const cards = X.sortedTables().filter(t => BQ.tableStatus(t) !== 'empty').map(t => {
    const u = BQ.tableUse(t), st = BQ.tableStatus(t);
    return '<div class="pr-card s-' + st + '"><div class="pr-h"><b>Table ' + BQ.esc(t.n) + '</b><span>' + (st === 'hold' ? 'On hold' : st === 'reserved' ? '🔒 Reserved · ' + BQ.reservedSeats(t) + ' seats' : u.used + '/' + u.cap) + '</span></div>' +
      (t.res || t.note ? '<div class="pr-res">' + BQ.esc(t.res || t.note) + '</div>' : '') +
      '<ul>' + u.parties.map(p => '<li><span>' + BQ.esc(BQ.displayName(p)) + ((p.guests || []).length ? '<small>' + BQ.esc(p.guests.join(', ')) + '</small>' : '') + '</span><b>' + p.seats + '</b></li>').join('') + '</ul></div>';
  }).join('');
  const seated = X.sortedTables().reduce((n, t) => n + BQ.tableUse(t).used, 0);
  const reserved = X.sortedTables().reduce((n, t) => n + BQ.reservedSeats(t), 0);
  const line = 'Seated guests: ' + seated + (reserved ? '   ·   Reserved-table seats: ' + reserved + '   ·   All seats: ' + (seated + reserved) : '');
  X.print('<div class="prost">' + X.printHead('Table Rosters', line) + '<div class="pr-grid">' + cards + '</div><div class="pr-total"><b>' + line + '</b></div></div>', 'portrait', 'rosters');
};

X.printCheckin = function () {
  const rows = X.alphaRows();
  X.print('<div class="pci">' + X.printHead('Check-In List') + '<table><thead><tr><th>✓</th><th>Name</th><th>Table</th><th>Party</th><th>Seats</th><th>VIP tickets</th>' + (BQ.config.trackPayment ? '<th>Payment</th>' : '') + '</tr></thead><tbody>' +
    rows.map(x => '<tr><td class="box">☐</td><td>' + BQ.esc(X.lf(x)) + '</td><td class="t">' + BQ.esc(x.table || '—') + '</td><td>' + BQ.esc(x.party) + '</td><td class="c">' + (x.seats || '') + '</td><td class="c">' + (x.p.vip ? (x.leader ? '⭐ ' + BQ.vipCount(x.p) : '★') : '') + '</td>' +
      (BQ.config.trackPayment ? '<td>' + (x.leader && x.p.pay && BQ.payClass(x.p.pay) !== 'ok' ? '<b>' + BQ.esc(x.p.pay) + '</b>' : '') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>', 'portrait', 'check-in');
};

X.printLineup = function () {
  const all = BQ.awardsSorted();
  if (!all.length) { BQ.ui.toast('Add awards first.'); return; }
  let html = '<div class="plineup">' + X.printHead('Awards Lineup');
  BQ.segments().filter(sg => sg.awards.length).forEach(sg => {
    html += '<h2>' + BQ.esc(sg.name || 'Program') + '</h2><table><thead><tr><th>#</th><th>Award</th><th>Recipient(s)</th><th>Table</th><th>In line</th></tr></thead><tbody>';
    sg.awards.forEach(a => {
      const recs = a.recipients || [];
      html += '<tr><td class="n">' + (all.indexOf(a) + 1) + '</td><td><b>' + BQ.esc(a.logNo ? a.logNo : '') + '</b> ' + BQ.esc(a.name) + (a.presenter ? '<br><small>Presenter: ' + BQ.esc(a.presenter) + '</small>' : '') + '</td><td>' +
        recs.map(r => BQ.esc(BQ.recipLabel(r)) + (r.count > 1 ? ' ×' + r.count : '')).join('<br>') + '</td><td class="t">' + recs.map(r => { const x = BQ.recipientSeat(r); return BQ.esc(x.table || (x.state === 'na' ? 'Not attending' : '—')); }).join('<br>') + '</td><td class="box">☐</td></tr>';
    });
    html += '</tbody></table><h3>Escort pickup route — ' + BQ.esc(sg.name || 'Program') + '</h3><ol class="proute">' +
      BQ.pickupRoute(sg.awards).map(s => '<li><b>' + BQ.esc(s.seat.table ? 'Table ' + s.seat.table : s.seat.text) + '</b> — ' + BQ.esc(BQ.recipLabel(s.r)) + (s.r.count > 1 ? ' ×' + s.r.count : '') + ' <small>(#' + s.num + (s.award.logNo ? ' ' + BQ.esc(s.award.logNo) : '') + ')</small></li>').join('') + '</ol>';
  });
  X.print(html + '</div>', 'portrait', 'awards lineup');
};

X.printTents = async function () {
  const which = await BQ.ui.choose('Table tents', 'One page per table: fold it in half so the number shows on both sides.', [
    { label: 'Tables with guests or a reservation', value: 'used', cls: 'primary' }, { label: 'Every table in the room', value: 'all' }, { label: 'Cancel', value: null }]);
  if (!which) return;
  const ts = X.sortedTables().filter(t => which === 'all' || BQ.tableUse(t).used > 0 || t.res);
  const half = t => '<div class="tent-half"><div class="tent-ev">' + BQ.esc(BQ.state.event.title) + '</div><div class="tent-n">' + BQ.esc(t.n) + '</div>' + (t.res ? '<div class="tent-res">' + BQ.esc(t.res) + '</div>' : '') + '</div>';
  X.print(ts.map(t => '<div class="tent"><div class="flip">' + half(t) + '</div><div class="fold"></div>' + half(t) + '</div>').join(''), 'landscape', 'table tents');
};

/* A sign for the check-in table: big QR code that opens phone check-in */
X.printQrSign = function () {
  const qr = BQ.checkinQrSvg();
  if (!qr) { BQ.ui.toast('The QR code tool didn’t load (check the internet connection).', 'bad'); return; }
  X.print('<div class="qrsign"><div class="qs-ev">' + BQ.esc(BQ.state.event.title) + '</div><h1>Staff check-in</h1>' +
    '<div class="qs-code">' + qr + '</div>' +
    '<ol><li>Open the phone’s camera and point it at the code.</li><li>Tap the link and sign in with your City account.</li><li>Search a name and tap <b>✓ Here</b>. Switch to <b>⭐ VIP reception</b> at the top for the reception door.</li></ol>' +
    '<div class="qs-url">' + BQ.esc(BQ.checkinUrl()) + '</div></div>', 'portrait', 'QR sign');
};

X.printEscort = function () {
  const rows = X.alphaRows().filter(x => x.table && !x.block);
  if (!rows.length) { BQ.ui.toast('Nobody is seated yet.'); return; }
  X.print('<div class="escort">' + rows.map(x => '<div class="ec"><div class="ec-ev">' + BQ.esc(BQ.state.event.title) + '</div><div class="ec-name">' + BQ.esc(x.name) + '</div>' +
    '<div class="ec-t"><small>TABLE</small>' + BQ.esc(x.table) + '</div></div>').join('') + '</div>', 'portrait', 'escort cards');
};

/* ---------------------------------------------------------------------
   PRINT & EXPORT SCREEN
   --------------------------------------------------------------------- */
BQ.screens.exports = {
  title: 'Print & Export',
  render(main) {
    const tile = (id, icon, title, desc) => '<button class="tile" data-x="' + id + '"><span class="ti">' + icon + '</span><b>' + title + '</b><small>' + desc + '</small></button>';
    main.innerHTML = '<div class="page">' +
      '<div class="page-head"><h1>Print &amp; Export</h1></div>' +
      '<h2 class="sec">Excel spreadsheets</h2><div class="tiles">' +
      tile('classic', '🗂️', 'Classic format', 'Your original “Table seating” workbook: same tabs, columns and colors. Use this if you ever go back to Excel.') +
      tile('alpha', '🔤', 'Alphabetical list', 'Everyone A–Z by last name with their table number.') +
      tile('rosters', '🍽️', 'Table rosters', 'Each table with its guests, names, and requests, plus a summary tab.') +
      tile('checkin', '🚪', 'Check-in sheet', 'A–Z with a box to tick at the door.') +
      (BQ.config.trackPayment ? tile('payment', '💲', 'Payment report', 'Who has paid, who hasn’t, with contact info.') : '') +
      tile('lineup', '🏆', 'Awards lineup', 'Program order with recipient tables and the escort pickup route.') +
      tile('awardfile', '🎖️', 'Award file + tables', 'The awards spreadsheet in its usual layout (Rank, Name, Memo, Log Number), with each person’s table added.') +
      tile('vip', '⭐', 'VIP reception list', 'Everyone invited to the VIP reception, A–Z, with VIP tickets and seats.') +
      tile('tickets', '🎟️', 'Ticket pick-up sheet', 'A–Z sign-out sheet with tickets, VIP tickets and table; lines for date, who picked up, and signature.') +
      tile('backup', '💾', 'Full backup', 'Everything in one file. Can be restored later.') +
      '</div>' +
      '<h2 class="sec">Print or save as PDF</h2><div class="tiles">' +
      tile('pmap', '🗺️', 'Seating map', 'The whole room on one landscape page.') +
      tile('png', '🖼️', 'Map picture', 'A PNG image of the map to email or put on a screen.') +
      tile('palpha', '📜', '“Find your table” board', 'Big A–Z list in columns to post at the entrance.') +
      tile('prost', '🍽️', 'Table rosters', 'Cards for every table in use.') +
      tile('pcheck', '🚪', 'Check-in list', 'Printed A–Z list with check boxes.') +
      tile('pline', '🏆', 'Awards lineup', 'Program with tables, plus escort pickup route per segment.') +
      tile('pvip', '⭐', 'VIP reception list', 'Printed list with check boxes for the reception door.') +
      tile('ptickets', '🎟️', 'Ticket pick-up sheet', 'Sign-out sheet with lines to write the date, who picked up, and a signature.') +
      tile('tents', '🪧', 'Table number tents', 'One per page. Fold in half.') +
      tile('escort', '🎫', 'Escort cards', 'Name + table cards, 10 per page, A–Z.') +
      tile('qrsign', '📱', 'Phone check-in QR sign', 'A page with the QR code staff scan to check people in from their phones.') +
      '</div>' +
      '<h2 class="sec">Bring data in</h2><div class="tiles">' +
      tile('impClassic', '📥', 'From your old spreadsheet', 'Read a “Table seating” workbook (like last year’s) and add those guests and tables.') +
      tile('impPaste', '📋', 'Paste a list', 'Copy rows from Excel or an email: name, seats, and optionally table and unit.') +
      tile('impAwards', '🎖️', 'Award file', 'Read the awards spreadsheet (categories, Rank, Name_Badge, Log Number) into the Awards program.') +
      tile('impHonors', '📄', 'Highest honors (Word)', 'Read the Word list of top awards: award headings with “Title Name - Unit” lines.') +
      tile('impBackup', '♻️', 'Restore a full backup', 'Bring back a backup file made by this app as a new event.') +
      '</div>' +
      '<p class="muted small">Tip: in the print window, choose your printer or <b>Save as PDF</b>.</p></div>';
    const go = {
      classic: X.classicXlsx, alpha: X.alphaXlsx, rosters: X.rostersXlsx, checkin: X.checkinXlsx, payment: X.paymentXlsx, lineup: X.lineupXlsx, backup: X.backupXlsx,
      tickets: () => X.ticketDialog('xlsx'), ptickets: () => X.ticketDialog('print'), awardfile: X.awardFileXlsx, qrsign: X.printQrSign, vip: X.vipXlsx, pvip: X.printVip, impAwards: () => BQ.imports.awardsDialog(), impHonors: () => BQ.imports.honorsDialog(),
      pmap: X.printMap, png: X.mapPng, palpha: X.printAlpha, prost: X.printRosters, pcheck: X.printCheckin, pline: X.printLineup, tents: X.printTents, escort: X.printEscort,
      impClassic: () => BQ.imports.classicDialog(), impPaste: () => BQ.imports.pasteDialog(), impBackup: () => BQ.imports.restoreDialog()
    };
    main.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await go[b.dataset.x](); } catch (e) { console.error(e); BQ.ui.toast('Something went wrong: ' + e.message, 'bad'); }
      b.disabled = false;
    });
  }
};
