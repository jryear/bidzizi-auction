import { store, rush } from "./store.js";
import { mountGuest } from "./guest.js";
import { mountStudio } from "./studio.js";

const pref = { view: "both", g: "a", s: "a" };
try { Object.assign(pref, JSON.parse(localStorage.getItem("bsg-pref") || "{}")); } catch { /* storage unavailable */ }
const q = new URLSearchParams(location.search);
for (const k of ["view", "g", "s"]) if (q.get(k)) pref[k] = q.get(k);

const guest = mountGuest(document.getElementById("guest"), () => pref.g);
const studio = mountStudio(document.getElementById("studio"), () => pref.s);

function paint() {
  document.body.dataset.view = pref.view;
  for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", b.dataset.view === pref.view);
  for (const b of document.querySelectorAll("[data-g]")) b.setAttribute("aria-pressed", b.dataset.g === pref.g);
  for (const b of document.querySelectorAll("[data-s]")) b.setAttribute("aria-pressed", b.dataset.s === pref.s);
  const st = store.get();
  const w = document.querySelector('[data-sim="window"]'); w.textContent = st.windowOpen ? "Close" : "Reopen";
  const f = document.querySelector('[data-sim="fault"]'); f.setAttribute("aria-pressed", st.fault === "lose-response");
  document.getElementById("phone-cap").textContent = `Guest · ${pref.g === "a" ? "A Inherit" : "B Transform"} · signed in as Jo Park (Park & Co)`;
  try { localStorage.setItem("bsg-pref", JSON.stringify(pref)); } catch { /* storage unavailable */ }
}
function all() { paint(); guest.render(); studio.render(); }
store.subscribe(all);

document.getElementById("study").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.view) pref.view = b.dataset.view;
  if (b.dataset.g) pref.g = b.dataset.g;
  if (b.dataset.s) pref.s = b.dataset.s;
  const sim = b.dataset.sim;
  if (sim === "rush") rush();
  if (sim === "window") store.set({ windowOpen: !store.get().windowOpen });
  if (sim === "fault") store.set({ fault: store.get().fault ? null : "lose-response" });
  if (sim === "reset") { store.reset(); location.hash = ""; }
  all();
});
// Countdowns tick; re-render only what shows time, without stealing focus from inputs.
setInterval(() => { if (!document.activeElement?.matches?.("input, textarea")) { guest.render(); if (store.get().windowOpen) studio.render(); } }, 30_000);
all();
