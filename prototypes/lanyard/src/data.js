// Content layer. The six shared lots come verbatim from fixtures.shared.js (copied from the
// holiday-social kit so every prototype judges the same material). Lot 07 is an ADDITION of this
// prototype: it exists to stress long titles, a missing image and a lot with no bids.
import { event as sharedEvent, lots as sharedLots } from './fixtures.shared.js';

export const event = { ...sharedEvent, lotCount: sharedLots.length + 1 };
export const CLOSE_MIN = 18 * 60; // 6:00 PM
export const CLOCK0_MIN = 14 * 60 + 42; // prototype "now" starts at 2:42 PM

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
};

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
