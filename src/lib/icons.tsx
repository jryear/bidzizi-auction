// One small, consistent icon set (24px grid, 1.8px strokes, round joins). Decorative by default.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 22, rest: SVGProps<SVGSVGElement>) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...rest,
});

export const IGrid = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>;
export const IList = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M8.5 6h12M8.5 12h12M8.5 18h12" /><circle cx="4" cy="6" r=".9" fill="currentColor" /><circle cx="4" cy="12" r=".9" fill="currentColor" /><circle cx="4" cy="18" r=".9" fill="currentColor" /></svg>;
export const ICards = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3.5" y="3.5" width="17" height="7.5" rx="1.8" /><rect x="3.5" y="13" width="17" height="7.5" rx="1.8" /></svg>;
export const IBookmark = ({ size, filled, ...r }: P & { filled?: boolean }) => <svg {...base(size, r)}><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-4-5.5 4z" fill={filled ? "currentColor" : "none"} /></svg>;
export const ITicket = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v1.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V16a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6.5A1.5 1.5 0 0 0 19.5 5h-15A1.5 1.5 0 0 0 3 6.5z" transform="translate(0 0)" /><path d="M14.5 5.5v13" strokeDasharray="2 2.4" /></svg>;
export const IInfo = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></svg>;
export const IHeart = ({ size, filled, ...r }: P & { filled?: boolean }) => <svg {...base(size, r)}><path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" fill={filled ? "currentColor" : "none"} /></svg>;
export const ISearch = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const IChevL = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="m14.5 5.5-6.5 6.5 6.5 6.5" /></svg>;
export const IChevR = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>;
export const IChevD = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="m6 9.5 6 6 6-6" /></svg>;
export const IClose = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const ICheck = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IPlus = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 5v14M5 12h14" /></svg>;
export const IMinus = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M5 12h14" /></svg>;
export const IClock = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IPin = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
export const ICalendar = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>;
export const ITrophy = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z" /><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z" /></svg>;
export const IBolt = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M13 3 5 13.5h6L10.5 21 19 10h-6z" /></svg>;
export const IWifiOff = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.3-2.6M19 13a10 10 0 0 0-2.2-1.6M2 9.5a15 15 0 0 1 4.5-3M22 9.5A15 15 0 0 0 11 5.6" /><circle cx="12" cy="19.5" r=".8" fill="currentColor" /></svg>;
export const IAlert = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.2" /></svg>;
export const IArrowUp = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
export const ISpark = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>;
export const IUsers = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></svg>;
export const IPhoto = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5" /></svg>;
export const IUpload = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 15.5V4M7 8.5 12 3.5l5 5" /><path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3" /></svg>;
export const IEye = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IEyeOff = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M3 3l18 18M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 7.3A17.6 17.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
export const ITrash = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" /></svg>;
export const IDrag = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="9" cy="6" r="1.1" fill="currentColor" /><circle cx="15" cy="6" r="1.1" fill="currentColor" /><circle cx="9" cy="12" r="1.1" fill="currentColor" /><circle cx="15" cy="12" r="1.1" fill="currentColor" /><circle cx="9" cy="18" r="1.1" fill="currentColor" /><circle cx="15" cy="18" r="1.1" fill="currentColor" /></svg>;
export const IQr = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" /></svg>;
export const IShare = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M8 11H6.5A2 2 0 0 0 4.5 13v6a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H16" /></svg>;
export const IExternal = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M14 4.5h5.5V10M19.5 4.5 11 13M10 6H6.5a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2H16a2 2 0 0 0 2-2V14" /></svg>;
export const IMore = ({ size, ...r }: P) => <svg {...base(size, r)}><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></svg>;
export const IMonitor = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M8 20.5h8M12 16.5v4" /></svg>;
export const IPhone = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>;
export const IPalette = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-1 1.3-2.1-.6-1.2.2-2.4 1.5-2.4h1.9a3.8 3.8 0 0 0 3.8-3.8C20.5 7.2 16.7 3.5 12 3.5z" /><circle cx="7.8" cy="11" r="1" fill="currentColor" /><circle cx="10.5" cy="7.4" r="1" fill="currentColor" /><circle cx="15" cy="7.6" r="1" fill="currentColor" /></svg>;
export const ISliders = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
export const ICopy = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></svg>;
export const IPrint = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M7 8.5V3.5h10v5M7 17H4.5v-6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V17H17" /><rect x="7" y="14" width="10" height="6.5" rx="1" /></svg>;
export const IDownload = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M12 4v11.5M7 10.5l5 5 5-5M4.5 19.5h15" /></svg>;
export const IPlay = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" /></svg>;
export const IExpand = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
export const IGift = ({ size, ...r }: P) => <svg {...base(size, r)}><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5S10.8 4 8.3 4.3C6 4.6 6.7 8.5 12 8.5zM12 8.5s1.2-4.5 3.7-4.2c2.3.3 1.6 4.2-3.7 4.2z" /></svg>;
export const ISignOut = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5" /></svg>;
export const IHistory = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4.5l3 1.8" /></svg>;
export const IStore = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16v0a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0zM5.5 12v8.5h13V12M10 20.5v-5h4v5" /></svg>;
export const ICrop = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M6.5 2.5v13.5a1.5 1.5 0 0 0 1.5 1.5h13.5M2.5 6.5H16a1.5 1.5 0 0 1 1.5 1.5v13.5" /></svg>;
export const IReset = ({ size, ...r }: P) => <svg {...base(size, r)}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9" /></svg>;
