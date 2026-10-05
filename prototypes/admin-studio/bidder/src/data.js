// Content layer. The six shared lots come verbatim from fixtures.shared.js (copied from the
// holiday-social kit so every prototype judges the same material). Lot 07 is an ADDITION of this
// prototype: it exists to stress long titles, a missing image and a lot with no bids.
import { event as sharedEvent, lots as sharedLots } from './fixtures.shared.js';

export const event = { ...sharedEvent, lotCount: sharedLots.length + 1 };
export let CLOSE_MIN = 18 * 60; // 6:00 PM
export let CLOCK0_MIN = 14 * 60 + 42; // prototype "now" starts at 2:42 PM

const extra = {
  id: 'symphony', number: '07', extra: true,
  title: 'Two seasons of front-row seats to the regional symphony, plus a pre-concert dinner for four on the evenings you choose',
  short: 'Front-row seats and dinner for four', category: 'Good things',
  sponsor: 'Harbor City Symphony Association', logo: 'harbor', image: null, alt: '',
  current: 0, opening: 10000, count: 0, leader: null, person: null,
  description: 'Settle in close enough to watch the conductor breathe. Eight concerts across two seasons from the best seats in the hall, each paired with a relaxed dinner for four at a nearby restaurant before the lights go down.',
  includes: ['Four front-row seats to eight concerts', 'Pre-concert dinner for four, up to eight evenings', 'Programme notes and a reserved coat check'],
  fine: 'Fictional package: concerts subject to the published season; dinner dates arranged with the Association. Lot added by this prototype to test a long title, a missing image, and a lot with no bids.',
  history: [],
};

export const lots = [
  ...sharedLots.map((l) => ({ ...l, image: `assets/lots/${l.image}.jpg` })),
  extra,
];
export const lotById = (id) => lots.find((l) => l.id === id);
export const categories = ['All', ...new Set(lots.map((l) => l.category))];

export const sponsors = [...new Map(lots.map((l) => [l.logo, { logo: l.logo, name: l.sponsor }])).values()];

// Other bidders who can act in the simulation. Names/businesses come from the shared fixtures.
export const rivals = [
  { business: 'Copper Kettle Café', person: 'Avery Brooks' },
  { business: 'Hearth & Home Design', person: 'Morgan Ellis' },
  { business: 'Westward Print & Packaging', person: 'Sam Rivera' },
  { business: 'Goodform Architecture', person: 'Riley Park' },
];

// Every rule the product has not decided. A marker with this id sits next to the thing it affects.
export const assumptions = {
  A1: ['Public browsing', 'Anyone with the link can browse lots and bids without signing in. Proposed in the README, not decided.'],
  A2: ['How identity is proven', 'Phone code versus invitation is undecided. The sheet simulates a phone code: any 6 digits pass, nothing is sent.'],
  A3: ['Business and person', 'Whether a person may bid for a business, who grants that, and whether standing belongs to the business or the person are all undecided. Here the bidder simply declares both, and "you" means the same person and business. No roles or permissions are modelled.'],
  A4: ['What a bid commits you to', 'Whether a bid is binding, and anything about payment, donation, or pickup, is undecided. This screen only states what the system will do: record a bid. Nothing is charged or promised.'],
  A5: ['Money rules', 'USD, whole-dollar $25 steps, and an opening bid per lot are fixtures. Amounts are integer cents internally. Real currency, increments and openings are undecided.'],
  A6: ['Closing', 'One event-wide close at 6:00 PM, no extension on late bids, no per-lot closing. The time-left line is informational only.'],
  A7: ['Competing bids', 'When two bids race for the same amount, the one the server confirms first stands and the other is "not placed". The real ordering rule is undecided.'],
  A8: ['After close', 'Winner notification, payment and collection are not designed. Closed screens say only what the server recorded.'],
  A9: ['Raising your own bid', 'Whether the current leader may raise their own bid is undecided. Auto-bid and maximum bids are excluded.'],
  A10: ['Retries', 'A retry re-sends the same request key, so a repeat cannot place a second bid. While a bid is sending or unconfirmed, another bid on that lot is blocked. The real retry semantics are undecided.'],
  A11: ['Who sees names', 'Every bidder sees business and person names on every bid. Privacy for bidders is undecided.'],
  A12: ['Returning later', 'Identity and standing persist in this browser only. Real session recovery (new device, cleared storage) is undecided.'],
  A13: ['Member ID', 'Format, who issues it, what it proves, and what besides it authorizes acting for a business are all undecided. Here it is optional, typed by the bidder, never checked, and never shown to other bidders. A Member ID alone gives no access to any business: business and name are still required.'],
  A14: ['Saturn Barter network context', 'How the network appears to bidders, and whether it changes any bidding rule, is undecided. The prototype only labels the identity step and the account with it. It changes no rule and makes no claim about this event.'],
  A15: ['Phone verification', 'The provider, code expiry, resend limits and failure handling are undecided. Verification here is simulated: nothing is sent and any 6 digits pass.'],
  A16: ['Watching', 'Whether watching belongs to a person or a business, whether others can see it, and what it notifies are undecided. Here it is a list on this device only. It places no bid, is seen by no one, and sends no notifications.'],
  A17: ['Additional users', 'Roles, permissions, whether an added person can bid, and whether standing is shared across a business are undecided. Here it is only a list kept on this device. Nothing is sent to anyone and added people cannot do anything.'],
  A18: ['Appearance settings', 'Which options exist and where they persist (device or person) are undecided. Here: text size, lot layout and reduced motion, kept on this device only.'],
  A19: ['Nonprofit donation', 'What a donation is, who receives it, whether money moves through this app, and any receipt are all undecided and must not be invented. The prototype shows where access would live and takes no amount and no payment.'],
  A20: ['Auto-bid (private maximum)', 'How a maximum is confirmed and stored, increments, tie order, and who can see it are undecided. This is a labeled simulation: after an explicit confirmation the maximum is saved by the simulated server and shown only to you. It places no bids and does not change who is leading. It must be at least the next minimum bid, in $25 steps.'],
  A21: ['Sponsor welcome and event information', 'The wording, who may write it, and what event information belongs here are undecided. The text on these screens is placeholder, built only from the fixtures.'],
  A22: ['Search scope', 'Searches lot number, title, short description, sponsor and category. Not the long description or bidders. The real scope is undecided. The query is kept with the filters.'],
  A23: ['Navigation and header', 'Four sections in a pill bar (Lots, Watching, My bids, Event). The bar is hidden on a lot page so the bid bar stays reachable; there a BidZizi header with the business chip stays on screen. How that header relates to the pass bar is undecided. Prototype B could not be inspected, so these follow the written request, not B.'],
};

// Saturn Barter network context. A label only: it changes no rule here (A14).
export const network = { name: 'Saturn Barter' };

// Distinct visual marks for sponsors (squares). Drawn for this prototype; fictional.
export const LOGOS = {
  cedar: { bg: '#2F5D46', g: '<path d="M20 7l7 10h-4l6 9H11l6-9h-4z" fill="#F5F0E6"/><rect x="18.4" y="26" width="3.2" height="7" fill="#F5F0E6"/>' },
  coffee: { bg: '#5B3A29', g: '<ellipse cx="20" cy="20" rx="8.5" ry="12" transform="rotate(35 20 20)" fill="#F5F0E6"/><path d="M14.5 27c4-3 7-10 11-14" stroke="#5B3A29" stroke-width="2.4" fill="none" stroke-linecap="round"/>' },
  table: { bg: '#7A2E3F', g: '<circle cx="20" cy="20" r="10.5" fill="none" stroke="#F5F0E6" stroke-width="2.6"/><circle cx="20" cy="20" r="3.8" fill="#F5F0E6"/>' },
  earth: { bg: '#B4573A', g: '<path d="M13 10h14c.8 6 3 8 3 13a10 8 0 01-20 0c0-5 2.2-7 3-13z" fill="#F5F0E6"/>' },
  spoke: { bg: '#1F6B74', g: '<circle cx="20" cy="20" r="11" fill="none" stroke="#F5F0E6" stroke-width="2.4"/><path d="M20 9v22M9 20h22M12.2 12.2l15.6 15.6M27.8 12.2L12.2 27.8" stroke="#F5F0E6" stroke-width="1.5"/>' },
  floral: { bg: '#B8456F', g: '<g fill="#F5F0E6"><circle cx="20" cy="11.5" r="5"/><circle cx="28.5" cy="20" r="5"/><circle cx="20" cy="28.5" r="5"/><circle cx="11.5" cy="20" r="5"/></g><circle cx="20" cy="20" r="3.8" fill="#B8456F"/>' },
  harbor: { bg: '#26335F', g: '<path d="M8 17c3-4 5-4 8 0s5 4 8 0 5-4 8 0M8 24c3-4 5-4 8 0s5 4 8 0 5-4 8 0" stroke="#F5F0E6" stroke-width="2.4" fill="none" stroke-linecap="round"/>' },
};

// Bounded adapter for the isolated admin prototype. No application imports or services.
export let previewPhase = 'scheduled';
LOGOS.saturn = { bg:'#1A1814', g:'<ellipse cx="20" cy="20" rx="16" ry="6" transform="rotate(-25 20 20)" fill="none" stroke="#F2B632" stroke-width="2.2"/><circle cx="20" cy="20" r="8" fill="#F2B632"/>' };
export function applyAdminDraft(payload) {
  const e=payload.event;
  Object.assign(event,e,{ host:payload.org.name, date:new Date(e.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'}), closes:labelTime(e.end), opens:labelTime(e.start), timezone:zoneLabel(e), increment:Number.isSafeInteger(e.increment)&&e.increment>0?e.increment:2500 });
  lots.splice(0,lots.length,...payload.lots.map(l=>({...structuredClone(l),sponsor:l.provider||payload.org.name,logo:'saturn',opening:Number.isSafeInteger(l.opening)?l.opening:0})));
  categories.splice(0,categories.length,'All',...new Set(lots.map(l=>l.category)));
  sponsors.splice(0,sponsors.length,...(e.sponsorsEnabled?e.sponsors.filter(s=>s.name.trim()):[]));
  event.lotCount=lots.length;
  const [h,m]=e.end.split(':').map(Number);CLOSE_MIN=h*60+m;
  try { const parts=new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(payload.now);CLOCK0_MIN=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value); } catch { CLOCK0_MIN=18*60; }
  previewPhase=payload.phase;network.name=payload.org.name;
}
function zoneLabel(e) { try{return new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,timeZoneName:'short'}).formatToParts(new Date(e.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;}catch{return e.timezone;} }
function labelTime(t) { if(!/^\d{2}:\d{2}$/.test(t))return 'Not set'; const [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
