/* =====================================================================
   auth.js — Microsoft sign-in (MSAL) + SharePoint / Graph request helpers
   DPD Awards Banquet Seating
   ===================================================================== */
window.BQ = window.BQ || {};

/* ---------------------------------------------------------------------
   CONFIG — the only values you should ever need to edit in this file.
   --------------------------------------------------------------------- */
BQ.config = {
  appName: 'Banquet Seating',
  clientId: '0d384d2a-9a9e-46f6-a195-ad63f9e94f06',          // PatrolBidPortal registration
  tenantId: '2935709e-c10c-4809-a302-852d369f8700',
  // Every address this app is published at. Sign-in uses the entry that matches the page's folder
  // address (never window.location.href itself). Each one must ALSO be added to the PatrolBidPortal
  // registration → Authentication → Single-page application, spelled exactly, trailing slash included.
  redirectUris: [
    'https://personnelspecialprojects.github.io/dpd-banquet-seating/',
    'https://dpd-banquet-seating.dpd-apps.workers.dev/'   // Cloudflare Workers (city computers block github.io)
  ],
  siteUrl: 'https://dallastxgov.sharepoint.com/sites/AwardsBanquet',
  // Practice mode lets someone try the app with data saved only in their own browser.
  allowPractice: true,
  // Payments are handled by a third-party org, so payment tracking is off.
  // Set to true (and add PaymentStatus + PaymentNote columns) to turn it back on.
  trackPayment: false,
  demo: false          // true only in the hosted preview build
};

/* ---------------------------------------------------------------------
   AUTH — two-token pattern: Graph (User.Read) for identity,
   SharePoint (AllSites.Write) for data. Never requested together.
   --------------------------------------------------------------------- */
BQ.auth = {
  msal: null,
  account: null,
  user: { name: '', email: '' },

  available() { return typeof msal !== 'undefined' && !!msal.PublicClientApplication; },

  // The page's folder address ("https://host/path/"), ignoring index.html, ?query and #hash
  currentBase() { return (location.origin + location.pathname.replace(/[^/]*$/, '')).toLowerCase(); },
  // The configured redirect URI for this address, or null if this address isn't set up for sign-in
  redirectUri() {
    const list = BQ.config.redirectUris || [BQ.config.redirectUri];
    const here = this.currentBase();
    return list.find(u => String(u || '').toLowerCase() === here) || null;
  },
  notSetUpMessage() {
    return 'This address isn’t set up for sign-in yet: ' + this.currentBase() +
      ' — add it to redirectUris in auth.js and to the PatrolBidPortal app registration (Authentication → Single-page application).';
  },

  async init() {
    if (!this.available()) return false;
    const redirectUri = this.redirectUri();
    if (!redirectUri) throw new Error(this.notSetUpMessage());
    this.msal = new msal.PublicClientApplication({
      auth: {
        clientId: BQ.config.clientId,
        authority: 'https://login.microsoftonline.com/' + BQ.config.tenantId,
        redirectUri
      },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
    });
    const resp = await this.msal.handleRedirectPromise();
    if (resp && resp.account) this.account = resp.account;
    else {
      const all = this.msal.getAllAccounts();
      if (all.length) this.account = all[0];
    }
    if (this.account) this.msal.setActiveAccount(this.account);
    return !!this.account;
  },

  login() { return this.msal.loginRedirect({ scopes: ['User.Read'] }); },

  logout() {
    try { sessionStorage.removeItem('bq_mode'); } catch (e) { /* ignore */ }
    return this.msal.logoutRedirect({ account: this.account, postLogoutRedirectUri: this.redirectUri() });
  },

  async token(scopes) {
    try {
      const r = await this.msal.acquireTokenSilent({ scopes, account: this.account });
      return r.accessToken;
    } catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError) {
        await this.msal.acquireTokenRedirect({ scopes, account: this.account });
      }
      throw e;
    }
  },

  graphToken() { return this.token(['User.Read']); },
  spToken() { return this.token([new URL(BQ.config.siteUrl).origin + '/AllSites.Write']); },

  // Higher SharePoint permission, requested ONLY for the one-time "create lists & columns" step.
  // Needs AllSites.Manage (delegated) added to the PatrolBidPortal registration. Uses a popup so
  // the page isn't lost; if it can't be granted, setup shows what to create by hand instead.
  async spManageToken() {
    const scopes = [new URL(BQ.config.siteUrl).origin + '/AllSites.Manage'];
    try {
      return (await this.msal.acquireTokenSilent({ scopes, account: this.account })).accessToken;
    } catch (e) {
      const r = await this.msal.acquireTokenPopup({ scopes, account: this.account });
      return r.accessToken;
    }
  },

  async loadUser() {
    try {
      const t = await this.graphToken();
      const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
        headers: { Authorization: 'Bearer ' + t }
      });
      const j = await r.json();
      this.user = { name: j.displayName || '', email: String(j.mail || j.userPrincipalName || '').toLowerCase() };
    } catch (e) {
      console.error('Could not load user profile', e);
      this.user = { name: (this.account && this.account.name) || 'Unknown user', email: (this.account && this.account.username || '').toLowerCase() };
    }
    return this.user;
  }
};

/* ---------------------------------------------------------------------
   SHAREPOINT REST helper
   Reads use odata=nometadata. Writes use odata=verbose with __metadata.
   --------------------------------------------------------------------- */
BQ.sp = {
  async req(path, opts) {
    opts = opts || {};
    const token = opts.manage ? await BQ.auth.spManageToken() : await BQ.auth.spToken();
    const url = /^https?:/.test(path) ? path : BQ.config.siteUrl + path;
    const headers = Object.assign({
      Authorization: 'Bearer ' + token,
      Accept: 'application/json;odata=nometadata'
    }, opts.headers || {});
    let body;
    if (opts.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json;odata=verbose';
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const r = await fetch(url, { method: opts.method || 'GET', headers, body });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try {
        const j = await r.json();
        const m = (j['odata.error'] && j['odata.error'].message && j['odata.error'].message.value) ||
                  (j.error && j.error.message && (j.error.message.value || j.error.message));
        if (m) msg += ' — ' + m;
      } catch (e) { /* body not JSON */ }
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    if (r.status === 204) return null;
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  },

  // Follows paging links so lists over 100/5000 items come back complete.
  async getAll(path) {
    let out = [];
    let next = path;
    while (next) {
      const j = await this.req(next);
      out = out.concat((j && j.value) || []);
      next = (j && (j['odata.nextLink'] || j['@odata.nextLink'])) || null;
    }
    return out;
  }
};
