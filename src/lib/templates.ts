// Starter templates for "New event". Sample copy is meant to be replaced on the canvas.
export type TemplateItem = { title: string; short: string; openingMinor: number; category: string };
export type Template = {
  id: string; name: string; blurb: string; theme: Theme; durationHours: number;
  welcome: string; winnerInstructions: string; donations: boolean; recipients: string[]; items: TemplateItem[];
};
export type Theme = "classic" | "midnight" | "garden" | "coral";
export const THEMES: { id: Theme; name: string; ink: string; accent: string; paper: string }[] = [
  { id: "classic", name: "Classic", ink: "#1A1814", accent: "#F2B632", paper: "#F5F0E6" },
  { id: "midnight", name: "Midnight", ink: "#141B3A", accent: "#7FD1FF", paper: "#EEF1F8" },
  { id: "garden", name: "Garden", ink: "#14352A", accent: "#E9C46A", paper: "#F1F3EA" },
  { id: "coral", name: "Coral", ink: "#3A1820", accent: "#FF8A6B", paper: "#FBF0EC" },
];

export const TEMPLATES: Template[] = [
  {
    id: "trade-show", name: "Trade show auction", blurb: "Member businesses donate items; bidding runs through the show.", theme: "classic", durationHours: 6,
    welcome: "Welcome! Browse the items and bid from your phone. Every bid supports our member community.",
    winnerInstructions: "Congratulations! Pick up your item at the front desk before the event ends.",
    donations: false, recipients: [],
    items: [
      { title: "Weekend getaway", short: "Two nights for two", openingMinor: 30_000, category: "Travel" },
      { title: "Dinner for four", short: "Chef's tasting menu", openingMinor: 20_000, category: "Dining" },
      { title: "Marketing package", short: "Logo refresh and business cards", openingMinor: 50_000, category: "Services" },
    ],
  },
  {
    id: "gala", name: "Charity gala", blurb: "An evening auction with donations to your causes.", theme: "midnight", durationHours: 4,
    welcome: "Thank you for joining us tonight. Every bid and donation goes to the causes we support.",
    winnerInstructions: "Thank you for your generosity! Our team will contact you about your item.",
    donations: true, recipients: ["Our featured cause"],
    items: [
      { title: "Signed artwork", short: "Original piece from a local artist", openingMinor: 50_000, category: "Art" },
      { title: "Private wine tasting", short: "For eight guests at home", openingMinor: 40_000, category: "Experiences" },
    ],
  },
  {
    id: "quick", name: "Quick 1-hour auction", blurb: "A short, lively round — great for meetups and mixers.", theme: "coral", durationHours: 1,
    welcome: "Bidding is open for one hour. Good luck!", winnerInstructions: "You won! Find a host to collect your item.",
    donations: false, recipients: [],
    items: [{ title: "Mystery prize", short: "Revealed to the winner", openingMinor: 2_500, category: "" }],
  },
  {
    id: "blank", name: "Start from scratch", blurb: "An empty event with sensible defaults.", theme: "classic", durationHours: 3,
    welcome: "", winnerInstructions: "", donations: false, recipients: [], items: [],
  },
];
