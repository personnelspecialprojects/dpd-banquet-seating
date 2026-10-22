/* =====================================================================
   store.js — where data lives.
   Two interchangeable stores with the same methods:
     • BQ.SPStore       — SharePoint lists (the real thing)
     • BQ.PracticeStore — this browser only (practice / demo mode)
   Also: the SharePoint schema + one-click list/column creation + health check.
   ===================================================================== */
window.BQ = window.BQ || {};

/* ---------------------------------------------------------------------
   SCHEMA — every column the app reads or writes. Internal name = display
   name, created by the app itself, so there is never a name mismatch.
   --------------------------------------------------------------------- */
BQ.schema = {
  Banquet_Events: [
    ['BanquetDate', 'DateTime'], ['Venue', 'Text'], ['LayoutJson', 'Note'],
    ['SettingsJson', 'Note'], ['EventStatus', 'Text']
  ],
  Banquet_Parties: [
    ['EventId', 'Number'], ['PartyType', 'Text'], ['Affiliation', 'Text'], ['Seats', 'Number'],
    ['TableNo', 'Text'], ['GroupKey', 'Text'], ['ContactPhone', 'Text'], ['ContactEmail', 'Text'],
    ['PaymentStatus', 'Text', 'pay'], ['PaymentNote', 'Text', 'pay'], ['NeedsJson', 'Note'], ['PartyNotes', 'Note'],
    ['GuestNames', 'Note'], ['CheckedIn', 'Number'], ['CheckInTime', 'DateTime'], ['Pinned', 'Boolean'],
    ['VipReception', 'Boolean'], ['VipCount', 'Number'], ['VipCheckedIn', 'Number'],
    ['Badge', 'Text', 'opt'],        // optional: without it the badge rides at the end of the name ("… #12963")
    ['NotAttending', 'Boolean', 'opt'], // optional: without it the name carries " - NOT ATTENDING"
    ['NoResponse', 'Boolean', 'opt'],  // optional: without it the name carries " - NO RESPONSE"
    ['TicketPickup', 'Text', 'opt'],   // optional: {"at","by"} when tickets were picked up; without it this rides inside NeedsJson
    ['Organization', 'Text', 'opt'],   // optional: company / organization (e.g. a sponsor); without it this rides inside NeedsJson
    ['Rank', 'Text', 'opt']            // optional: rank or title shown before the name; without it this rides inside NeedsJson
  ],
  Banquet_Awards: [
    ['EventId', 'Number'], ['AwardCategory', 'Text'], ['AwardKind', 'Text'], ['ProgramOrder', 'Number'],
    ['Segment', 'Text'], ['Presenter', 'Text'], ['RecipientsJson', 'Note'], ['AwardNotes', 'Note'],
    ['AwardStatus', 'Text'], ['LogNumber', 'Text']
  ],
  Banquet_Log: [
    ['EventId', 'Number'], ['LogDetails', 'Note'], ['ActorName', 'Text'], ['ActorEmail', 'Text'], ['LogTime', 'DateTime']
  ]
};

// columns tagged 'pay' only exist when payment tracking is turned on
Object.keys(BQ.schema).forEach(l => { BQ.schema[l] = BQ.schema[l].filter(f => f[2] !== 'pay' || BQ.config.trackPayment); });

// Is this (optional) column available? Practice mode: always. SharePoint: only if the health check saw it.
BQ.fieldOk = function (list, name) {
  if (!BQ.state || !BQ.state.store || BQ.state.store.kind !== 'sharepoint') return true;
  const have = BQ.SPStore._have[list];
  return !!(have && have.has(name));
};

BQ.fieldXml = function (name, type) {
  const base = 'DisplayName="' + name + '" Name="' + name + '" StaticName="' + name + '"';
  switch (type) {
    case 'Note': return '<Field Type="Note" ' + base + ' NumLines="6" RichText="FALSE" RichTextMode="Compatible" UnlimitedLengthInDocumentLibrary="TRUE" AppendOnly="FALSE" />';
    case 'Number': return '<Field Type="Number" ' + base + ' />';
    case 'DateTime': return '<Field Type="DateTime" ' + base + ' Format="DateTime" />';
    case 'Boolean': return '<Field Type="Boolean" ' + base + '><Default>0</Default></Field>';
    default: return '<Field Type="Text" ' + base + ' MaxLength="255" />';
  }
};

/* ---------------------------------------------------------------------
   Converting between app objects and list items
   --------------------------------------------------------------------- */
function jparse(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}
function lines(s) { return String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); }

BQ.map_ = {
  eventFrom(it) {
    return {
      id: it.Id, title: it.Title || '', date: it.BanquetDate || '', venue: it.Venue || '',
      layout: jparse(it.LayoutJson, null), settings: jparse(it.SettingsJson, {}), status: it.EventStatus || 'Active'
    };
  },
  eventTo(e) {
    return {
      Title: e.title || 'Awards Banquet', BanquetDate: e.date || null, Venue: e.venue || '',
      LayoutJson: JSON.stringify(e.layout || null), SettingsJson: JSON.stringify(e.settings || {}),
      EventStatus: e.status || 'Active'
    };
  },
  partyFrom(it) {
    return {
      id: it.Id, eventId: it.EventId, name: it.Title || '', type: it.PartyType || 'Guest',
      aff: it.Affiliation || '', seats: Number(it.Seats) || 0, table: it.TableNo || '',
      group: it.GroupKey || '', phone: it.ContactPhone || '', email: it.ContactEmail || '',
      pay: it.PaymentStatus || '', payNote: it.PaymentNote || '', needs: jparse(it.NeedsJson, []),
      notes: it.PartyNotes || '', guests: lines(it.GuestNames), checkedIn: Number(it.CheckedIn) || 0,
      checkInTime: it.CheckInTime || '', pinned: !!it.Pinned,
      vip: !!it.VipReception, vipCount: Number(it.VipCount) || 0, vipIn: Number(it.VipCheckedIn) || 0,
      badge: it.Badge || '', notAttending: !!it.NotAttending, noResponse: !!it.NoResponse,
      pickup: jparse(it.TicketPickup, null), company: it.Organization || '', rank: it.Rank || ''
    };
  },
  // Without a Badge column the badge rides along at the end of the name ("Carlos Gomez #12963")
  partyFromFixed(it) {
    const p = BQ.map_.partyFrom(it);
    // ticket pick-up kept inside NeedsJson when the TicketPickup column isn't there
    const pk = (p.needs || []).find(n => n && n.type === '_pickup');
    if (pk) { if (!p.pickup) p.pickup = { at: pk.at || '', by: pk.by || '' }; p.needs = p.needs.filter(n => n.type !== '_pickup'); }
    const meta = (p.needs || []).find(n => n && n.type === '_meta');   // company / rank kept here when those columns aren't there
    if (meta) { p.company = p.company || meta.company || ''; p.rank = p.rank || meta.rank || ''; p.needs = p.needs.filter(n => n.type !== '_meta'); }
    const noNA = !BQ.fieldOk('Banquet_Parties', 'NotAttending'), noNR = !BQ.fieldOk('Banquet_Parties', 'NoResponse');
    if (noNA || noNR) {
      const n = BQ.stripStatus(p.name);
      if ((n.na && noNA) || (n.nr && noNR)) { p.name = n.name; if (n.na) p.notAttending = true; if (n.nr) p.noResponse = true; }
    }
    if (!BQ.fieldOk('Banquet_Parties', 'Badge')) { const m = p.name.match(/^(.*\S)\s+#([0-9A-Za-z]{1,10})$/); if (m) { p.name = m[1]; p.badge = p.badge || m[2]; } }
    return p;
  },
  partyTo(p) {
    return Object.assign({
      Title: (p.name || '(no name)') + (p.badge && !BQ.fieldOk('Banquet_Parties', 'Badge') ? ' #' + p.badge : '') + (p.notAttending && !BQ.fieldOk('Banquet_Parties', 'NotAttending') ? ' - NOT ATTENDING' : '') + (p.noResponse && !p.notAttending && !BQ.fieldOk('Banquet_Parties', 'NoResponse') ? ' - NO RESPONSE' : ''), EventId: p.eventId, PartyType: p.type || 'Guest', Affiliation: p.aff || '',
      Seats: Number(p.seats) || 0, TableNo: p.table ? String(p.table) : '', GroupKey: p.group || '',
      ContactPhone: p.phone || '', ContactEmail: p.email || '', NeedsJson: JSON.stringify((p.needs || []).concat(p.pickup && !BQ.fieldOk('Banquet_Parties', 'TicketPickup') ? [{ type: '_pickup', at: p.pickup.at || '', by: p.pickup.by || '' }] : [],
        (p.company && !BQ.fieldOk('Banquet_Parties', 'Organization')) || (p.rank && !BQ.fieldOk('Banquet_Parties', 'Rank'))
          ? [{ type: '_meta', company: BQ.fieldOk('Banquet_Parties', 'Organization') ? '' : p.company || '', rank: BQ.fieldOk('Banquet_Parties', 'Rank') ? '' : p.rank || '' }] : [])), PartyNotes: p.notes || '',
      GuestNames: (p.guests || []).join('\n'), CheckedIn: Number(p.checkedIn) || 0,
      CheckInTime: p.checkInTime || null, Pinned: !!p.pinned,
      VipReception: !!p.vip, VipCount: Number(p.vipCount) || 0, VipCheckedIn: Number(p.vipIn) || 0
    }, BQ.config.trackPayment ? { PaymentStatus: p.pay || '', PaymentNote: p.payNote || '' } : {},
    BQ.fieldOk('Banquet_Parties', 'Badge') ? { Badge: p.badge || '' } : {},
    BQ.fieldOk('Banquet_Parties', 'NotAttending') ? { NotAttending: !!p.notAttending } : {},
    BQ.fieldOk('Banquet_Parties', 'NoResponse') ? { NoResponse: !!p.noResponse } : {},
    BQ.fieldOk('Banquet_Parties', 'TicketPickup') ? { TicketPickup: p.pickup ? JSON.stringify(p.pickup).slice(0, 255) : '' } : {},
    BQ.fieldOk('Banquet_Parties', 'Organization') ? { Organization: p.company || '' } : {},
    BQ.fieldOk('Banquet_Parties', 'Rank') ? { Rank: p.rank || '' } : {});
  },
  awardFrom(it) {
    return {
      id: it.Id, eventId: it.EventId, name: it.Title || '', cat: it.AwardCategory || '',
      kind: it.AwardKind || 'Individual', order: Number(it.ProgramOrder) || 0, segment: it.Segment || '',
      presenter: it.Presenter || '', recipients: jparse(it.RecipientsJson, []), notes: it.AwardNotes || '',
      status: it.AwardStatus || '', logNo: it.LogNumber || ''
    };
  },
  awardTo(a) {
    return {
      Title: a.name || '(award)', EventId: a.eventId, AwardCategory: a.cat || '', AwardKind: a.kind || 'Individual',
      ProgramOrder: Number(a.order) || 0, Segment: a.segment || '', Presenter: a.presenter || '',
      RecipientsJson: JSON.stringify(a.recipients || []), AwardNotes: a.notes || '', AwardStatus: a.status || '',
      LogNumber: a.logNo || ''
    };
  }
};

/* ---------------------------------------------------------------------
   SHAREPOINT STORE
   --------------------------------------------------------------------- */
BQ.SPStore = {
  kind: 'sharepoint',
  _have: {},
  _types: {},

  L(name) { return "/_api/web/lists/getbytitle('" + name + "')"; },

  async entityType(list) {
    if (!this._types[list]) {
      const j = await BQ.sp.req(this.L(list) + '?$select=ListItemEntityTypeFullName');
      this._types[list] = j.ListItemEntityTypeFullName;
    }
    return this._types[list];
  },

  async create(list, fields) {
    const type = await this.entityType(list);
    const body = Object.assign({ __metadata: { type } }, fields);
    const j = await BQ.sp.req(this.L(list) + '/items', { method: 'POST', body });
    return j.Id || j.ID;
  },
  async update(list, id, fields) {
    const type = await this.entityType(list);
    const body = Object.assign({ __metadata: { type } }, fields);
    await BQ.sp.req(this.L(list) + '/items(' + id + ')', {
      method: 'POST', body, headers: { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' }
    });
    return id;
  },
  async remove(list, id) {
    await BQ.sp.req(this.L(list) + '/items(' + id + ')', {
      method: 'POST', headers: { 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' }
    });
  },
  items(list, filter) {
    return BQ.sp.getAll(this.L(list) + '/items?$top=4999' + (filter ? '&$filter=' + encodeURIComponent(filter) : ''));
  },

  async listEvents() { return (await this.items('Banquet_Events')).map(BQ.map_.eventFrom); },
  async saveEvent(e) {
    const f = BQ.map_.eventTo(e);
    if (e.id) { await this.update('Banquet_Events', e.id, f); return e.id; }
    return this.create('Banquet_Events', f);
  },
  async listParties(eventId) { return (await this.items('Banquet_Parties', 'EventId eq ' + Number(eventId))).map(BQ.map_.partyFromFixed); },
  async saveParty(p) {
    const f = BQ.map_.partyTo(p);
    if (p.id) { await this.update('Banquet_Parties', p.id, f); return p.id; }
    return this.create('Banquet_Parties', f);
  },
  deleteParty(id) { return this.remove('Banquet_Parties', id); },
  // fresh copy of one guest (used by check-in so two phones don't overwrite each other)
  async getParty(id) { return BQ.map_.partyFromFixed(await BQ.sp.req(this.L('Banquet_Parties') + '/items(' + Number(id) + ')')); },
  async listAwards(eventId) { return (await this.items('Banquet_Awards', 'EventId eq ' + Number(eventId))).map(BQ.map_.awardFrom); },
  async saveAward(a) {
    const f = BQ.map_.awardTo(a);
    if (a.id) { await this.update('Banquet_Awards', a.id, f); return a.id; }
    return this.create('Banquet_Awards', f);
  },
  deleteAward(id) { return this.remove('Banquet_Awards', id); },

  async log(eventId, action, details) {
    await this.create('Banquet_Log', {
      Title: String(action).slice(0, 255), EventId: eventId || 0, LogDetails: details || '',
      ActorName: BQ.auth.user.name || '', ActorEmail: BQ.auth.user.email || '', LogTime: new Date().toISOString()
    });
  },
  async listLog(eventId) {
    const j = await BQ.sp.req(this.L('Banquet_Log') + '/items?$top=300&$orderby=Id desc&$filter=' +
      encodeURIComponent('EventId eq ' + Number(eventId)));
    return (j.value || []).map(it => ({ action: it.Title, details: it.LogDetails, who: it.ActorName, when: it.LogTime }));
  },

  /* ---- Setup: health check + create missing lists/columns ---- */
  async health() {
    const out = [];
    for (const list of Object.keys(BQ.schema)) {
      const row = { list, exists: false, missing: [] };
      try {
        const fields = await BQ.sp.getAll(this.L(list) + '/fields?$select=InternalName');
        row.exists = true;
        const have = new Set(fields.map(f => f.InternalName));
        this._have[list] = have;
        row.missing = BQ.schema[list].filter(f => f[2] !== 'opt' && !have.has(f[0])).map(f => f[0]);
        row.optMissing = BQ.schema[list].filter(f => f[2] === 'opt' && !have.has(f[0])).map(f => f[0]);
      } catch (e) {
        if (e.status === 404) { row.exists = false; row.missing = BQ.schema[list].filter(f => f[2] !== 'opt').map(f => f[0]); row.optMissing = BQ.schema[list].filter(f => f[2] === 'opt').map(f => f[0]); }
        else { row.error = e.message; }
      }
      out.push(row);
    }
    return out;
  },

  async provision(progress) {
    progress = progress || function () {};
    const report = await this.health();
    for (const row of report) {
      if (row.error) throw new Error(row.list + ': ' + row.error);
      if (!row.exists) {
        progress('Creating list ' + row.list + '…');
        await BQ.sp.req('/_api/web/lists', {
          method: 'POST', manage: true,
          body: { __metadata: { type: 'SP.List' }, BaseTemplate: 100, Title: row.list, Description: 'Banquet Seating app data — do not rename' }
        });
      }
      for (const name of row.missing.concat(row.optMissing || [])) {
        const type = BQ.schema[row.list].find(f => f[0] === name)[1];
        progress('Adding column ' + row.list + ' → ' + name + '…');
        await BQ.sp.req(this.L(row.list) + '/fields/createfieldasxml', {
          method: 'POST', manage: true,
          body: { parameters: { __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' }, SchemaXml: BQ.fieldXml(name, type), Options: 8 | 16 } }
        });
      }
    }
    progress('Checking…');
    return this.health();
  }
};

/* ---------------------------------------------------------------------
   PRACTICE STORE — same methods, saved in this browser only.
   --------------------------------------------------------------------- */
BQ.PracticeStore = {
  kind: 'practice',
  KEY: 'bq_practice_v1',
  mem: null,

  db() {
    if (this.mem) return this.mem;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
    this.mem = d || { next: 1, events: [], parties: [], awards: [], log: [] };
    return this.mem;
  },
  flush() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.mem)); } catch (e) { /* storage unavailable — memory only */ }
  },
  reset() { this.mem = { next: 1, events: [], parties: [], awards: [], log: [] }; this.flush(); },
  clone(o) { return JSON.parse(JSON.stringify(o)); },
  upsert(coll, obj) {
    const d = this.db();
    const o = this.clone(obj);
    if (!o.id) o.id = d.next++;
    const i = d[coll].findIndex(x => x.id === o.id);
    if (i >= 0) d[coll][i] = o; else d[coll].push(o);
    this.flush();
    return o.id;
  },
  del(coll, id) { const d = this.db(); d[coll] = d[coll].filter(x => x.id !== id); this.flush(); },

  async listEvents() { return this.clone(this.db().events); },
  async saveEvent(e) { return this.upsert('events', e); },
  async listParties(eid) { return this.clone(this.db().parties.filter(p => p.eventId === eid)); },
  async saveParty(p) { return this.upsert('parties', p); },
  async deleteParty(id) { this.del('parties', id); },
  async getParty(id) { const p = this.db().parties.find(x => x.id === id); return p ? this.clone(p) : null; },
  async listAwards(eid) { return this.clone(this.db().awards.filter(a => a.eventId === eid)); },
  async saveAward(a) { return this.upsert('awards', a); },
  async deleteAward(id) { this.del('awards', id); },
  async log(eventId, action, details) {
    const d = this.db();
    d.log.unshift({ eventId, action, details, who: 'Practice user', when: new Date().toISOString() });
    d.log = d.log.slice(0, 300);
    this.flush();
  },
  async listLog(eid) { return this.db().log.filter(l => l.eventId === eid); },
  async health() { return Object.keys(BQ.schema).map(list => ({ list, exists: true, missing: [] })); },
  async provision() { return this.health(); }
};
