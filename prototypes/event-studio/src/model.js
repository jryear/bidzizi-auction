// Pure data layer for the Event Studio prototype: no DOM, no storage.
// Everything here is fictional and browser-local. Money is integer cents (USD) as in prototype A (assumption S5).

export const ORG = { id: 'org-northline', name: 'Northline Business Exchange' };
export const NOW = '2026-10-05T09:00'; // fixed prototype clock so statuses are repeatable
export const NOW_LABEL = 'Mon Oct 5, 9:00 AM';
export const TZ = 'Pacific';
export const LINK_HOST = 'https://bidzizi.example/e/'; // .example never resolves: the link is fictional

export const PHOTOS = [
  { id: 'cabin', label: 'Cabin in the pines', alt: 'A timber cabin tucked into a quiet evergreen forest' },
  { id: 'coffee', label: 'Coffee and beans', alt: 'Freshly brewed coffee and roasted beans on a café table' },
  { id: 'dinner', label: 'Set restaurant table', alt: 'An elegantly set restaurant table under warm light' },
  { id: 'ceramics', label: 'Studio ceramics', alt: 'Handmade ceramic vessels in soft earthy glazes' },
  { id: 'bicycle', label: 'City bicycle', alt: 'A classic city bicycle ready for a leisurely ride' },
  { id: 'flowers', label: 'Seasonal flowers', alt: 'A loose arrangement of pink and white seasonal flowers' },
];
export const photo = (id) => PHOTOS.find((p) => p.id === id) || null;
export const photoSrc = (id) => `assets/lots/${id}.jpg`;

export const uid = (p = 'x') => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
export const eventLink = (ev) => `${LINK_HOST}${slug(ev.name)}-${ev.id.replace(/^ev-?/, '').slice(0, 4)}`;

// ---- formatting ---------------------------------------------------------------------------
const utc = (d) => new Date(`${d}T00:00:00Z`);
export const fmtDate = (d) => (d ? utc(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtDateShort = (d) => (d ? utc(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.slice(0, 4) === NOW.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC' }) : '');
export const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
export const fmtDT = (dt) => (dt ? `${utc(dt.slice(0, 10)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: dt.slice(0, 4) === NOW.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC' })} · ${fmtTime(dt.slice(11, 16))}` : '');
export const dollars = (cents) => { const d = cents / 100; return '$' + (Number.isInteger(d) ? d.toLocaleString('en-US') : d.toFixed(2)); };
export const toCents = (str) => { const s = String(str).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN; return Math.round(parseFloat(s) * 100); };
export const lotNo = (n) => String(n).padStart(2, '0');
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---- factories ----------------------------------------------------------------------------
export const defaultDisplay = () => ({ welcome: true, lots: true, sponsors: true, seconds: 10, theme: 'ink', qr: true });
export const defaultSms = () => ({
  senderRegistered: false, tested: false, log: [],
  templates: {
    code: { label: 'Verification code', text: 'Your BidZizi code is {code}. Reply STOP to opt out.', confirmed: false },
    outbid: { label: 'Outbid alert', text: '{event}: you were outbid on Lot {lot}. Next bid is {amount}. Reply STOP to opt out.', confirmed: false },
  },
});

export function newEvent(name, { date = '' } = {}) {
  return {
    id: uid('ev'), name: name.trim(), createdAt: NOW,
    details: { heroImage: null, welcomeTitle: '', welcomeBody: '', date, start: '', end: '', venue: '' },
    categories: [], windows: [], lots: [], sponsors: [],
    increment: { amount: 2500, confirmed: false },
    donations: { mode: 'undecided', label: 'Support our community fund', url: '' },
    access: { shared: false },
    displays: { draft: defaultDisplay(), applied: null, appliedAt: null },
    sms: defaultSms(),
    review: { previewed: false, reviewedAt: null, fingerprint: null },
    ui: { clock: 'before', screen: 'welcome', slide: 'welcome' },
  };
}

export function newLot(ev, patch = {}) {
  const number = ev.lots.reduce((m, l) => Math.max(m, l.number), 0) + 1;
  return { id: uid('lot'), number, title: '', short: '', description: '', categoryId: null, windowId: null, opening: 10000, image: null, sponsorId: null, ...patch };
}

// ---- seeds --------------------------------------------------------------------------------
function holiday() {
  const ev = newEvent('Holiday Trade Show Auction', { date: '2026-12-12' });
  ev.id = 'ev-holiday';
  Object.assign(ev.details, { heroImage: 'dinner', start: '16:00', end: '21:00', venue: 'Northline Hall, 400 Harbor Street (fictional)', welcomeTitle: 'Welcome to the Holiday Trade Show', welcomeBody: 'Thank you for joining us. Browse the lots on your phone, bid for your business, and watch the room fill with good things. Every lot was donated by a member of the exchange.' });
  const cat = { gt: { id: 'cat-getaways', name: 'Getaways' }, team: { id: 'cat-team', name: 'For the team' }, food: { id: 'cat-food', name: 'Food & drink' }, good: { id: 'cat-good', name: 'Good things' } };
  ev.categories = Object.values(cat);
  ev.sponsors = [['sp-cedar', 'Cedar & Pine Retreats'], ['sp-common', 'Common Ground Coffee'], ['sp-table', 'The Long Table'], ['sp-earth', 'Soft Earth Studio'], ['sp-spoke', 'Spoke & Co.'], ['sp-field', 'Fieldwork Floral']].map(([id, name]) => ({ id, name }));
  ev.windows = [{ id: 'win-early', name: 'Early bidding', opens: '2026-12-12T16:30', closes: '2026-12-12T18:00' }];
  const L = (n, title, short, description, categoryId, image, sponsorId, opening, windowId) => ({ id: `lot-${n}`, number: n, title, short, description, categoryId, windowId, opening, image, sponsorId });
  ev.lots = [
    L(1, 'A little cabin. A whole weekend away.', 'Two nights at Cedar & Pine', 'Trade the inbox for the evergreens. A private woodland cabin for two nights, with a wood-burning stove and a breakfast basket.', cat.gt.id, 'cabin', 'sp-cedar', 15000, 'win-early'),
    L(2, 'Better mornings for the whole office', 'Six months of small-batch coffee', 'A rotating selection of freshly roasted coffee, delivered to your workplace each month, plus a guided tasting for your team.', cat.team.id, 'coffee', 'sp-common', 10000, 'win-early'),
    L(3, 'An evening at the chef’s table, for six', 'Five courses, very good company', 'Chef Elena builds a five-course seasonal menu around the best of the region, with a little story behind every plate.', cat.food.id, 'dinner', 'sp-table', 20000, 'win-early'),
    L(4, 'Made by hand, made for your everyday', 'A collection of six studio ceramics', 'Six wonderfully imperfect pieces for the rituals that make a day.', null, 'ceramics', 'sp-earth', 5000, null),
    L(5, 'The scenic route starts here', 'A city bicycle, fitted just for you', 'A comfortable city bicycle with a personalized fitting, a helmet, and a first service.', cat.good.id, 'bicycle', 'sp-spoke', 15000, null),
    L(6, 'Fresh flowers, every month for a year', 'A little seasonality for your space', 'Twelve seasonal arrangements for your front desk, meeting room, or favorite corner.', cat.team.id, null, 'sp-field', 10000, null),
    L(7, 'Two seasons of front-row seats to the regional symphony, plus a pre-concert dinner for four on the evenings you choose', 'Front-row seats and dinner for four', 'Eight concerts across two seasons from the best seats in the hall, each paired with a relaxed dinner for four.', null, null, null, 10000, null),
  ];
  return ev;
}

function spring() {
  const ev = newEvent('Spring Harvest Gala', { date: '2027-04-17' });
  ev.id = 'ev-spring';
  Object.assign(ev.details, { heroImage: 'flowers', start: '18:00', end: '22:00', venue: 'Terrace Hill Winery, Valley Road (fictional)', welcomeTitle: 'An evening in the vines', welcomeBody: 'Welcome to the Harvest Gala. Two rounds of bidding run through the evening, so you can come and go between courses. Proceeds support the valley scholarship fund.' });
  ev.categories = [{ id: 'cat-wine', name: 'Wine & dine' }, { id: 'cat-home', name: 'Home & garden' }];
  ev.sponsors = [{ id: 'sp-terrace', name: 'Terrace Hill Winery' }, { id: 'sp-bloom', name: 'Bloom & Bough' }];
  ev.windows = [{ id: 'win-silent', name: 'Silent round', opens: '2027-04-17T18:30', closes: '2027-04-17T20:00' }, { id: 'win-final', name: 'Final round', opens: '2027-04-17T20:00', closes: '2027-04-17T21:30' }];
  const L = (n, title, short, description, categoryId, image, sponsorId, opening, windowId) => ({ id: `lot-s${n}`, number: n, title, short, description, categoryId, windowId, opening, image, sponsorId });
  ev.lots = [
    L(1, 'A vineyard tasting for twelve', 'Private cellar tasting', 'Twelve guests, a long table between the barrels, and the winemaker pouring.', 'cat-wine', 'dinner', 'sp-terrace', 20000, 'win-silent'),
    L(2, 'A year of pastry Fridays', 'Fresh pastry for the office', 'A box of seasonal pastry delivered every Friday morning for a year.', 'cat-wine', 'coffee', null, 6000, 'win-silent'),
    L(3, 'Window-box herb garden, installed', 'Planted and tended once', 'Bloom & Bough plants and sets up a window-box herb garden at your door.', 'cat-home', 'flowers', 'sp-bloom', 8000, 'win-final'),
    L(4, 'Hand-thrown serving set', 'Platter, bowls and spoons', 'A serving set thrown and glazed by hand, for long tables.', 'cat-home', 'ceramics', null, 7000, 'win-final'),
    L(5, 'A weekend e-bike loan', 'Friday evening to Monday', 'Borrow a city e-bike for a long weekend, with a helmet and a map of the valley.', 'cat-home', 'bicycle', null, 5000, 'win-final'),
  ];
  ev.increment = { amount: 1000, confirmed: true };
  ev.donations = { mode: 'link', label: 'Valley scholarship fund', url: 'https://example.org/valley-scholarship' };
  ev.access.shared = true;
  ev.displays.applied = { ...defaultDisplay(), seconds: 12, theme: 'paper' };
  ev.displays.draft = { ...ev.displays.applied };
  ev.displays.appliedAt = '2026-10-04T15:20';
  ev.ui.clock = 'win-silent';
  return ev;
}

export function seedState() {
  const events = { 'ev-holiday': holiday(), 'ev-spring': spring() };
  return { v: 1, org: ORG, order: ['ev-holiday', 'ev-spring'], events, ui: { preview: false, rule: 'first', play: false, notes: false } };
}

// ---- validation ---------------------------------------------------------------------------
export function validateLot(l) {
  const e = {};
  if (!l.title.trim()) e.title = 'Give the lot a title.';
  else if (l.title.length > 140) e.title = 'Keep the title under 140 characters.';
  if (!(l.opening >= 100)) e.opening = 'Enter an opening bid of at least $1.';
  else if (l.opening > 100000000) e.opening = 'That opening bid is too large.';
  if (l.short.length > 80) e.short = 'Keep the short line under 80 characters.';
  if (l.description.length > 1200) e.description = 'Keep the description under 1,200 characters.';
  return e;
}
export function validateWindow(w) {
  const e = {};
  if (!w.name.trim()) e.name = 'Name the window, for example “Silent round”.';
  if (!w.opens) e.opens = 'Choose when bidding opens.';
  if (!w.closes) e.closes = 'Choose when bidding closes.';
  if (w.opens && w.closes && w.closes <= w.opens) e.closes = 'Bidding must close after it opens.';
  return e;
}
export function validateEventName(name, events, exceptId) {
  const n = name.trim();
  if (!n) return 'Name the event.';
  if (n.length > 80) return 'Keep the name under 80 characters.';
  if (events.some((e) => e.id !== exceptId && e.name.trim().toLowerCase() === n.toLowerCase())) return 'Another event already has this name.';
  return '';
}
export const validUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !!x.hostname.includes('.'); } catch { return false; } };

// ---- bidding windows ----------------------------------------------------------------------
export const windowOf = (ev, lot) => ev.windows.find((w) => w.id === lot.windowId) || null;
export const windowState = (w, now = NOW) => (now < w.opens ? 'scheduled' : now < w.closes ? 'open' : 'closed');
export const validWindows = (ev) => ev.windows.filter((w) => !Object.keys(validateWindow(w)).length);
export const unassigned = (ev) => ev.lots.filter((l) => !windowOf(ev, l));
export const overlaps = (ev) => { const out = []; const ws = ev.windows.filter((w) => !Object.keys(validateWindow(w)).length); for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (ws[i].opens < ws[j].closes && ws[j].opens < ws[i].closes) out.push([ws[i], ws[j]]); return out; };

/** The next eligible bid given the current top bid (null = no bids yet). Prototype rule S4. */
export const nextEligible = (opening, top, inc) => (top == null ? opening : top + inc);
export const ladder = (opening, inc, n = 5) => Array.from({ length: n }, (_, i) => opening + i * inc);

// ---- checklist and readiness --------------------------------------------------------------
/** sev: blocker (stops opening) or advice. wrong: the thing is broken, not just missing: only these are red. */
const issue = (sev, text, fix, wrong = false) => ({ sev, text, fix, wrong });
const nav = (label, section, q = '') => ({ label, section, q });

const SHORT = { basics: 'Set date and time', welcome: 'Write the welcome', lots: 'Add lots', categories: 'Add categories', windows: 'Create windows', assign: 'Assign lots', increment: 'Confirm increment', preview: 'Open the preview', sms: 'Check SMS', sponsors: 'Add sponsors', donations: 'Donations', access: 'Print the QR', displays: 'Set up displays' };
/** Every step of setup, with status, issues, and a route to fix them. Order is a suggestion, not a gate. */
export function analyze(ev) {
  const d = ev.details, L = ev.lots, W = ev.windows, steps = [];
  const un = unassigned(ev), badLots = L.filter((l) => Object.keys(validateLot(l)).length), badWins = W.filter((w) => Object.keys(validateWindow(w)).length);
  const step = (id, tier, section, title, why, done, started, issues, extra = {}) => {
    const blockers = issues.filter((i) => i.sev === 'blocker'), advice = issues.filter((i) => i.sev === 'advice');
    const isDone = done && !blockers.length, broken = blockers.some((b) => b.wrong);
    steps.push({ id, tier, section, title, short: SHORT[id], why, issues, blockers, advice, done: isDone, status: isDone ? 'done' : broken ? 'attention' : started ? 'progress' : 'todo', ...extra });
  };

  const bs = [];
  if (!d.date) bs.push(issue('blocker', 'Set the event date.', nav('Set the date', 'details', '#when')));
  if (!d.start) bs.push(issue('blocker', 'Set the start time.', nav('Set the time', 'details', '#when')));
  if (d.start && d.end && d.end <= d.start) bs.push(issue('blocker', 'The end time must be after the start time.', nav('Fix the time', 'details', '#when'), true));
  if (d.date && d.date < NOW.slice(0, 10)) bs.push(issue('advice', 'The event date is in the past.', nav('Check the date', 'details', '#when')));
  step('basics', 'required', 'details', 'Set the event date and time', 'When people physically gather. Separate from when bidding runs.', !!(d.date && d.start), !!(d.date || d.start || d.end || d.venue), bs);

  const ws = [];
  if (!d.welcomeTitle.trim()) ws.push(issue('blocker', 'Add a welcome heading.', nav('Write it', 'details', '#welcome')));
  if (!d.welcomeBody.trim()) ws.push(issue('blocker', 'Write a short welcome message.', nav('Write it', 'details', '#welcome')));
  if (!d.heroImage) ws.push(issue('advice', 'Choose a heading image. Without one the welcome page has a plain header.', nav('Choose an image', 'details', '#heading')));
  step('welcome', 'required', 'details', 'Write the welcome page', 'The first thing attendees see after scanning the QR code.', !!(d.welcomeTitle.trim() && d.welcomeBody.trim()), !!(d.welcomeTitle || d.welcomeBody || d.heroImage), ws);

  const ls = [];
  if (!L.length) ls.push(issue('blocker', 'Add your first lot.', nav('Add a lot', 'lots', '?sheet=lot:new')));
  if (badLots.length) ls.push(issue('blocker', `${plural(badLots.length, 'lot')} need${badLots.length === 1 ? 's' : ''} a title or a valid opening bid.`, nav('Open lots', 'lots'), true));
  const noPhoto = L.filter((l) => !l.image);
  if (noPhoto.length) ls.push(issue('advice', `${plural(noPhoto.length, 'lot')} ${noPhoto.length === 1 ? 'has' : 'have'} no photo.`, nav('Show them', 'lots', '?f=nophoto')));
  step('lots', 'required', 'lots', 'Add lots', 'Everything bidders can bid on. Duplicate a lot to save typing.', L.length > 0, L.length > 0, ls);

  const cs = [], uncat = L.filter((l) => !ev.categories.some((c) => c.id === l.categoryId));
  if (L.length && !ev.categories.length) cs.push(issue('advice', 'Add categories so bidders can filter the catalog.', nav('Manage categories', 'lots', '?sheet=categories')));
  else if (uncat.length) cs.push(issue('advice', `${plural(uncat.length, 'lot')} ${uncat.length === 1 ? 'has' : 'have'} no category.`, nav('Show them', 'lots', '?f=nocat')));
  step('categories', 'recommended', 'lots', 'Organize lots into categories', 'Categories help bidders browse. They are separate from bidding windows.', ev.categories.length > 0 && L.length > 0 && !uncat.length, ev.categories.length > 0 || L.some((l) => l.categoryId), cs);

  const wn = [];
  if (!W.length) wn.push(issue('blocker', 'Create at least one bidding window.', nav('Create a window', 'windows', '?sheet=window:new')));
  badWins.forEach((w) => wn.push(issue('blocker', `“${w.name || 'Untitled window'}” needs a name and a closing time after its opening time.`, nav('Fix window', 'windows', `?sheet=window:${w.id}`), true)));
  const ov = overlaps(ev);
  if (ov.length) wn.push(issue('advice', `${ov.map(([a, b]) => `“${a.name}” and “${b.name}”`).join('; ')} overlap. That is allowed, but check it is intended.`, nav('Review windows', 'windows')));
  step('windows', 'required', 'windows', 'Create bidding windows', 'When bidding is open. Each window has its own open and close time.', W.length > 0, W.length > 0, wn);

  const as = [];
  if (!L.length || !W.length) as.push(issue('blocker', `Waiting on ${[!L.length && 'lots', !W.length && 'a bidding window'].filter(Boolean).join(' and ')}.`, nav(!L.length ? 'Add lots' : 'Create a window', !L.length ? 'lots' : 'windows')));
  else if (un.length) as.push(issue('blocker', `${plural(un.length, 'lot')} ${un.length === 1 ? 'is' : 'are'} not in any bidding window. Bidders can’t bid on ${un.length === 1 ? 'it' : 'them'}.`, { ...nav('Show unassigned lots', 'lots', '?f=unassigned'), quick: 'assign' }, true));
  W.filter((w) => !L.some((l) => l.windowId === w.id) && !Object.keys(validateWindow(w)).length).forEach((w) => as.push(issue('advice', `“${w.name}” has no lots.`, nav('Assign lots', 'windows', `?sheet=assign:${w.id}`))));
  step('assign', 'required', 'windows', 'Assign every lot to a window', 'A lot belongs to one window (provisional, S1). Unassigned lots can’t be bid on.', L.length > 0 && W.length > 0 && !un.length, L.some((l) => windowOf(ev, l)), as);

  const inc = ev.increment, is = [];
  if (!(inc.amount >= 100)) is.push(issue('blocker', 'Set an increment of at least $1.', nav('Set increment', 'increments'), true));
  else if (!inc.confirmed) is.push(issue('blocker', `Confirm the ${dollars(inc.amount)} bid increment, or change it.`, { ...nav('Review increment', 'increments'), quick: 'confirm-increment' }));
  const off = L.filter((l) => inc.amount >= 100 && l.opening % inc.amount);
  if (off.length) is.push(issue('advice', `${plural(off.length, 'lot')} ${off.length === 1 ? 'has an opening bid that isn’t' : 'have opening bids that aren’t'} a multiple of ${dollars(inc.amount)}. Bids will still work, but the amounts won’t line up neatly.`, nav('Show them', 'increments')));
  step('increment', 'required', 'increments', 'Confirm the bid increment', 'How much each new bid must beat the last one by.', inc.confirmed && inc.amount >= 100, inc.confirmed, is);

  step('preview', 'recommended', 'preview', 'Look at the bidder preview', 'See the phone experience attendees will have, using your draft.', ev.review.previewed, ev.review.previewed, ev.review.previewed ? [] : [issue('advice', 'Open the bidder preview and look through the lots.', { label: 'Open preview', section: 'preview', q: '' })]);

  const sm = smsChecks(ev), smOk = sm.every((c) => c.ok);
  step('sms', 'recommended', 'notifications', 'Check SMS readiness (simulated)', 'Whether text messages could be sent. Nothing is ever sent from this prototype.', smOk, sm.some((c) => c.ok), smOk ? [] : [issue('advice', `${sm.filter((c) => !c.ok).length} of ${sm.length} SMS readiness checks still open.`, nav('Open notifications', 'notifications'))]);

  step('sponsors', 'optional', 'details', 'Add event sponsors', 'Optional. Sponsors appear in the event presentation.', ev.sponsors.length > 0, ev.sponsors.length > 0, [], { fixRoute: nav('Add sponsors', 'details', '#sponsors') });
  step('donations', 'optional', 'donations', 'Decide on donations', 'Optional. Where giving would live. No money moves through BidZizi.', ev.donations.mode !== 'undecided', ev.donations.mode !== 'undecided', ev.donations.mode === 'link' && !validUrl(ev.donations.url) ? [issue('blocker', 'The donation link must be a full https:// address.', nav('Fix link', 'donations'), true)] : []);
  step('access', 'optional', 'access', 'Print or present the event QR', 'Optional. One shared link and QR code for everyone. Ticks off when you open the print sign or present it; the prototype can’t know if it was actually printed.', ev.access.shared, ev.access.shared, []);
  step('displays', 'optional', 'displays', 'Set up the TV and projector displays', 'Optional. Draft the screens, then apply them.', !!ev.displays.applied, !!ev.displays.applied || JSON.stringify(ev.displays.draft) !== JSON.stringify(defaultDisplay()), []);

  const required = steps.filter((s) => s.tier === 'required'), doneReq = required.filter((s) => s.done).length;
  const blockers = steps.flatMap((s) => (s.tier === 'optional' && !s.started ? [] : s.blockers.map((b) => ({ ...b, step: s }))));
  const advice = steps.flatMap((s) => s.advice.map((a) => ({ ...a, step: s })));
  const next = required.find((s) => !s.done) || steps.find((s) => s.tier === 'recommended' && !s.done) || null;
  const ready = doneReq === required.length && !blockers.length;
  return { steps, required, doneReq, blockers, wrong: blockers.filter((b) => b.wrong), advice, next, ready, byId: Object.fromEntries(steps.map((s) => [s.id, s])) };
}

export function smsChecks(ev) {
  const t = Object.values(ev.sms.templates);
  return [
    { id: 'sender', label: 'Sender number registered with carriers', ok: ev.sms.senderRegistered, hint: 'Carriers need business texting registered before messages are delivered. Simulated here with a switch.' },
    { id: 'optout', label: 'Every message tells people how to opt out', ok: t.every((x) => /\bSTOP\b/.test(x.text)), hint: 'Each template must include the word STOP.' },
    { id: 'reviewed', label: 'Message wording reviewed', ok: t.every((x) => x.confirmed), hint: 'Confirm each template after reading it.' },
    { id: 'tested', label: 'A test message was rehearsed', ok: ev.sms.tested, hint: 'Simulate a test message to see exactly what would be sent.' },
  ];
}

/** Which section nav item gets which status dot. */
export function sectionStatus(a, section) {
  const ss = a.steps.filter((s) => s.section === section);
  if (!ss.length) return null;
  const req = ss.filter((s) => s.tier === 'required');
  if (req.length) { if (req.some((s) => s.status === 'attention')) return 'attention'; if (req.every((s) => s.done)) return ss.some((s) => s.tier === 'optional' && s.status === 'attention') ? 'attention' : 'done'; return 'todo'; }
  if (ss.some((s) => s.status === 'attention')) return 'attention';
  return ss.every((s) => s.done) ? 'done' : ss.some((s) => s.status === 'progress') ? 'todo' : ss.some((s) => s.tier === 'recommended') ? 'todo' : 'optional';
}

/** A stable fingerprint of everything a reviewer would have looked at. Edits after review change it. */
export function fingerprint(ev) {
  const s = JSON.stringify([ev.name, ev.details, ev.categories, ev.windows, ev.lots, ev.sponsors, ev.increment, ev.donations]);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ---- display drafts -----------------------------------------------------------------------
const DLABEL = { welcome: 'Welcome and QR slide', lots: 'Featured lots slide', sponsors: 'Sponsors slide', seconds: 'Seconds per slide', theme: 'Theme', qr: 'QR code on every slide' };
const DVAL = (k, v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : k === 'seconds' ? `${v} s` : k === 'theme' ? (v === 'ink' ? 'Ink' : 'Paper') : v);
export function displayChanges(disp) {
  const a = disp.applied, dr = disp.draft;
  if (!a) return Object.keys(DLABEL).map((k) => ({ key: k, label: DLABEL[k], from: 'nothing applied', to: DVAL(k, dr[k]) }));
  return Object.keys(DLABEL).filter((k) => a[k] !== dr[k]).map((k) => ({ key: k, label: DLABEL[k], from: DVAL(k, a[k]), to: DVAL(k, dr[k]) }));
}
export const displaySlides = (ev, cfg) => [cfg.welcome && 'welcome', cfg.lots && ev.lots.some((l) => windowOf(ev, l)) && 'lots', cfg.sponsors && ev.sponsors.length && 'sponsors'].filter(Boolean);

// ---- bidder preview model -----------------------------------------------------------------
export const clockOptions = (ev) => {
  const ws = ev.windows.filter((w) => !Object.keys(validateWindow(w)).length).sort((a, b) => a.opens.localeCompare(b.opens));
  return [{ id: 'before', label: 'Before any window opens' }, ...ws.map((w) => ({ id: w.id, label: `While “${w.name}” is open` })), ...(ws.length ? [{ id: 'after', label: 'After every window has closed' }] : [])];
};
function clockTime(ev, clock) {
  const ws = ev.windows.filter((w) => !Object.keys(validateWindow(w)).length).sort((a, b) => a.opens.localeCompare(b.opens));
  if (!ws.length) return NOW;
  const shift = (dt, min) => { const t = new Date(`${dt}:00Z`).getTime() + min * 60000; return new Date(t).toISOString().slice(0, 16); };
  if (clock === 'after') return shift(ws.reduce((m, w) => (w.closes > m ? w.closes : m), ws[0].closes), 1);
  const w = ws.find((x) => x.id === clock);
  if (w) return shift(w.opens, 1);
  return shift(ws[0].opens, -1);
}
/** What the phone sees. Visibility with several windows is undecided (S2): rule 'first' | 'each'. */
export function previewData(ev, rule) {
  const clock = clockOptions(ev).some((c) => c.id === ev.ui.clock) ? ev.ui.clock : 'before', t = clockTime(ev, clock);
  const assigned = ev.lots.filter((l) => windowOf(ev, l) && !Object.keys(validateWindow(windowOf(ev, l))).length);
  const firstOpen = assigned.length ? assigned.map((l) => windowOf(ev, l).opens).sort()[0] : null;
  const catalogOpen = firstOpen != null && t >= firstOpen;
  const lots = !catalogOpen ? [] : assigned.filter((l) => rule === 'each' ? t >= windowOf(ev, l).opens : true).map((l) => {
    const w = windowOf(ev, l), st = windowState(w, t), cat = ev.categories.find((c) => c.id === l.categoryId), sp = ev.sponsors.find((s) => s.id === l.sponsorId);
    return { id: l.id, number: lotNo(l.number), title: l.title || 'Untitled lot', short: l.short, description: l.description, category: cat ? cat.name : '', sponsor: sp ? sp.name : '', image: l.image, opening: l.opening, next: l.opening, state: st, opens: fmtDT(w.opens), closes: fmtDT(w.closes), windowName: w.name };
  }).sort((a, b) => a.number.localeCompare(b.number));
  const cats = ev.categories.filter((c) => lots.some((l) => l.category === c.name)).map((c) => c.name);
  const first = ev.windows.filter((w) => !Object.keys(validateWindow(w)).length).sort((a, b) => a.opens.localeCompare(b.opens))[0];
  return {
    name: ev.name, host: ORG.name, details: ev.details, date: fmtDate(ev.details.date), start: fmtTime(ev.details.start), end: fmtTime(ev.details.end), tz: TZ,
    firstOpens: first ? fmtDT(first.opens) : '', lots, cats, hiddenCount: ev.lots.length - assigned.length, totalAssigned: assigned.length,
    sponsors: ev.sponsors.map((s) => s.name), increment: ev.increment.amount, donations: ev.donations, catalogOpen, clock, rule,
    windows: ev.windows.filter((w) => !Object.keys(validateWindow(w)).length).map((w) => ({ name: w.name, opens: fmtDT(w.opens), closes: fmtDT(w.closes) })),
  };
}
