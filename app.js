const DATA = window.HARPY_DATA;
const STORAGE_KEY = "harpy-notes-v1";
const FACTIONS = { civilian: "平民", sheriff: "警長", neutral: "中立", killer: "殺手", other: "其他", modifier: "修飾符" };
const STATUSES = { suspect: "懷疑", confirm: "確定", exclude: "排除" };
// overlay / mobile 是 Twitch 擴充功能版面：詳情與筆記留在同一欄，不用全螢幕彈窗
const EMBED = document.body.dataset.embed || "";
const ABOUT = "本擴充功能為玩家自製的非官方圖鑑。職業、物品等說明文字與圖示的著作權皆屬於《StarRailExpress》模組原作者（Catmoon Train Team）及 Mojang 等各權利人，本人不擁有這些內容，僅負責整理。若權利人有任何疑慮，請與我聯繫，我會立即下架。";
const ABOUT_CONTACT = "聯絡方式：twitch.tv/sakuro_moonlit";

const roles = DATA.roles.filter((r) => !r.special);
const special = DATA.roles.filter((r) => r.special);
const TABS = [
  { key: "roles", label: "職業", list: roles, type: "role", factions: ["civilian", "sheriff", "neutral", "killer"] },
  { key: "special", label: "特殊模式", list: special, type: "role", factions: ["civilian", "sheriff", "neutral", "killer", "other"] },
  { key: "modifiers", label: "修飾符", list: DATA.modifiers, type: "modifier" },
  { key: "items", label: "物品", list: DATA.items, type: "item" },
  { key: "effects", label: "狀態效果", list: DATA.effects, type: "effect" },
];
const lookup = { role: new Map(DATA.roles.map((x) => [x.id, x])), modifier: new Map(DATA.modifiers.map((x) => [x.id, x])), item: new Map(DATA.items.map((x) => [x.id, x])), effect: new Map(DATA.effects.map((x) => [x.id, x])) };
for (const tab of TABS) for (const entry of tab.list) entry.haystack = (entry.name + entry.lines.join("") + (entry.goal || "")).toLowerCase();

const state = { tab: "roles", query: "", faction: null, trail: [] };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pinnable = (type) => type === "role" || type === "modifier";
const band = (type, entry) => (type === "role" || type === "modifier" ? `band-${entry.faction}` : "band-plain");
const openPanel = (dialog) => { if (!dialog.open) { if (EMBED) dialog.show(); else dialog.showModal(); } };

let notes = loadNotes();
function loadNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveNotes() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch { /* 無痕模式下只保留到關閉頁面 */ }
  $("notesCount").textContent = notes.length;
}
const noteOf = (type, id) => notes.find((n) => n.type === type && n.id === id);
function togglePin(type, id) {
  if (noteOf(type, id)) notes = notes.filter((n) => !(n.type === type && n.id === id));
  else notes.push({ type, id, status: "suspect", player: "" });
  saveNotes();
}

function matches(entry, tab) {
  if (state.query && !entry.haystack.includes(state.query)) return false;
  return !(tab.factions && state.faction && entry.faction !== state.faction);
}
function iconHtml(item) {
  return item.icon ? `<img class="pixel" src="icons/${esc(item.icon)}" alt="" loading="lazy">` : `<span class="icon-blank" aria-hidden="true">${esc(item.name[0])}</span>`;
}

function renderTrain() {
  $("train").innerHTML = TABS.map((tab) => {
    const count = tab.list.filter((e) => !state.query || e.haystack.includes(state.query)).length;
    return `<button class="car" type="button" data-tab="${tab.key}" aria-current="${tab.key === state.tab}"><b>${tab.label}</b><small>${count}</small></button>`;
  }).join("");
}
function renderFactions() {
  const tab = TABS.find((t) => t.key === state.tab);
  const box = $("factions");
  box.hidden = !tab.factions;
  if (!tab.factions) return;
  const options = [[null, "全部"], ...tab.factions.map((f) => [f, FACTIONS[f]])];
  box.innerHTML = options.map(([f, label]) => `<button type="button" data-faction="${f || ""}" aria-pressed="${state.faction === f}">${label}</button>`).join("");
}
function ticketHtml(entry, tab) {
  const note = pinnable(tab.type) ? noteOf(tab.type, entry.id) : null;
  const stubInner = tab.type === "item" ? iconHtml(entry) : esc(tab.type === "effect" ? "效果" : FACTIONS[entry.faction]);
  const stamp = note ? `<span class="stamp st-${note.status}">${STATUSES[note.status]}</span>` : "";
  const player = note && note.player ? `<span class="player">${esc(note.player)}</span>` : "";
  const pin = pinnable(tab.type) ? `<button class="punch" type="button" data-pin="${tab.type}|${esc(entry.id)}" aria-pressed="${!!note}" aria-label="${note ? "取消釘選" : "釘選"} ${esc(entry.name)}"><i></i></button>` : "";
  return `<article class="ticket ${band(tab.type, entry)}${note && note.status === "exclude" ? " is-excluded" : ""}">
    <div class="stub">${stubInner}</div>
    <button class="ticket-open" type="button" data-open="${tab.type}|${esc(entry.id)}"><h2>${esc(entry.name)}</h2>${player}<p>${esc(entry.goal || entry.lines[0] || "")}</p></button>
    ${pin}${stamp}
  </article>`;
}
function renderTickets() {
  const tab = TABS.find((t) => t.key === state.tab);
  let shown = tab.list.filter((e) => matches(e, tab));
  if (pinnable(tab.type)) {
    const pinned = shown.filter((e) => noteOf(tab.type, e.id));
    shown = pinned.concat(shown.filter((e) => !noteOf(tab.type, e.id)));
  }
  $("tickets").innerHTML = shown.map((e) => ticketHtml(e, tab)).join("");
  $("empty").hidden = shown.length > 0;
  $("resultCount").textContent = shown.length ? `共 ${shown.length} 筆` : "";
}
function render() {
  renderTrain();
  renderFactions();
  renderTickets();
}

function noteControls(type, id) {
  const note = noteOf(type, id);
  if (!note) return `<button class="pin-action" type="button" data-pin="${type}|${esc(id)}">釘選到推理筆記</button>`;
  return statusControls(note) + `<button class="unpin" type="button" data-pin="${type}|${esc(id)}">取消釘選</button>`;
}
function statusControls(note) {
  const buttons = Object.entries(STATUSES).map(([k, label]) => `<button type="button" data-status="${k}" data-note="${note.type}|${esc(note.id)}" aria-pressed="${note.status === k}">${label}</button>`).join("");
  return `<div class="status-row" role="group" aria-label="判斷">${buttons}</div><input class="player-input" type="text" maxlength="24" placeholder="可能是哪位玩家？" aria-label="玩家名稱" data-player="${note.type}|${esc(note.id)}" value="${esc(note.player)}">`;
}
function renderDetail() {
  const { type, id } = state.trail[state.trail.length - 1];
  const entry = lookup[type].get(id);
  const subtitle = type === "role" ? entry.team : type === "modifier" ? "修飾符" : type === "item" ? "物品" : "狀態效果";
  const head = type === "item" ? iconHtml(entry) : "";
  const back = state.trail.length > 1 ? `<button class="head-btn" type="button" data-back>返回</button>` : "";
  const goal = entry.goal ? `<p class="goal">${esc(entry.goal)}</p>` : "";
  const body = entry.lines.map((l) => `<p>${esc(l)}</p>`).join("");
  const linkedItems = (entry.items || []).map((i) => lookup.item.get(i));
  const itemsBlock = linkedItems.length ? `<h3>相關物品</h3><div class="chips">${linkedItems.map((i) => `<button class="chip" type="button" data-open="item|${esc(i.id)}">${iconHtml(i)}${esc(i.name)}</button>`).join("")}</div>` : "";
  const linkedRoles = (entry.roles || []).map((r) => lookup.role.get(r));
  const rolesBlock = linkedRoles.length ? `<h3>相關職業</h3><div class="chips">${linkedRoles.map((r) => `<button class="chip plain" type="button" data-open="role|${esc(r.id)}">${esc(r.name)}</button>`).join("")}</div>` : "";
  const noteBlock = pinnable(type) ? `<h3>推理筆記</h3>${noteControls(type, id)}` : "";
  const dialog = $("detail");
  dialog.className = `detail ${band(type, entry)}`;
  dialog.innerHTML = `<div class="detail-head">${back}${head}<div class="grow"><h2 id="detailName">${esc(entry.name)}</h2><p>${esc(subtitle)}</p></div><button class="head-btn" type="button" data-close="detail">關閉</button></div>
    <div class="detail-body">${goal}${body}${itemsBlock}${rolesBlock}${noteBlock}</div>`;
  openPanel(dialog);
}

function renderAbout() {
  state.trail = [];
  const dialog = $("detail");
  dialog.className = "detail band-plain";
  dialog.innerHTML = `<div class="detail-head"><div class="grow"><h2 id="detailName">關於這份圖鑑</h2><p>非官方</p></div><button class="head-btn" type="button" data-close="detail">關閉</button></div>
    <div class="detail-body"><p>${esc(ABOUT)}</p><p>${esc(ABOUT_CONTACT)}</p><p>資料版本 ${esc(DATA.version)}</p></div>`;
  openPanel(dialog);
}

function renderNotes() {
  const list = notes.map((note) => {
    const entry = lookup[note.type].get(note.id);
    if (!entry) return "";
    return `<section class="note band-${entry.faction}">
      <div class="note-name"><button type="button" data-open="${note.type}|${esc(note.id)}">${esc(entry.name)}</button><button class="note-remove" type="button" data-pin="${note.type}|${esc(note.id)}" aria-label="移除 ${esc(entry.name)}">✕</button></div>
      ${statusControls(note)}
    </section>`;
  }).join("");
  const dialog = $("notes");
  dialog.innerHTML = `<div class="notes-head"><h2 id="notesTitle">推理筆記</h2><button class="text-btn" type="button" data-close="notes">關閉</button></div>
    <div class="notes-list">${list || `<p class="notes-empty">還沒有釘選。按職業車票右上角的圓孔，就能記下你懷疑的職業。</p>`}</div>
    ${notes.length ? `<div class="notes-foot"><button class="text-btn" type="button" id="clearNotes">清除全部筆記</button></div>` : ""}`;
  openPanel(dialog);
}
function refreshOpenPanels() {
  if ($("detail").open && state.trail.length) renderDetail();
  if ($("notes").open) renderNotes();
  renderTickets();
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("button");
  if (!EMBED && event.target instanceof HTMLDialogElement) event.target.close();
  if (!el) return;
  const d = el.dataset;
  if (d.tab) { state.tab = d.tab; state.faction = null; render(); window.scrollTo(0, 0); $("panel").scrollTop = 0; }
  else if ("faction" in d) { state.faction = d.faction || null; renderFactions(); renderTickets(); }
  else if (d.pin) { const [type, id] = d.pin.split("|"); togglePin(type, id); refreshOpenPanels(); }
  else if (d.open) {
    const [type, id] = d.open.split("|");
    if ($("notes").open) $("notes").close();
    state.trail = $("detail").open ? [...state.trail, { type, id }] : [{ type, id }];
    renderDetail();
    $("detail").scrollTop = 0;
  }
  else if ("back" in d) { state.trail.pop(); renderDetail(); $("detail").scrollTop = 0; }
  else if (d.close) { $(d.close).close(); }
  else if (d.status) { const [type, id] = d.note.split("|"); noteOf(type, id).status = d.status; saveNotes(); refreshOpenPanels(); }
  else if (el.id === "clearNotes") {
    if (el.classList.contains("armed")) { notes = []; saveNotes(); refreshOpenPanels(); }
    else { el.classList.add("armed"); el.textContent = "再按一次確認清除"; }
  }
});
document.addEventListener("input", (event) => {
  const d = event.target.dataset;
  if (!d.player) return;
  const [type, id] = d.player.split("|");
  noteOf(type, id).player = event.target.value;
  saveNotes();
  renderTickets();
});
$("search").addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderTrain();
  renderTickets();
});
$("clearFilters").addEventListener("click", () => {
  state.query = "";
  state.faction = null;
  $("search").value = "";
  render();
});
$("notesOpen").addEventListener("click", renderNotes);
$("about").addEventListener("click", renderAbout);
if (EMBED === "overlay") {
  const toggle = $("wikiToggle");
  const setOpen = (open) => {
    $("panel").hidden = !open;
    document.body.classList.toggle("is-open", open);
    toggle.textContent = open ? "收起" : "圖鑑";
    toggle.setAttribute("aria-expanded", open);
  };
  toggle.hidden = false;
  toggle.addEventListener("click", () => setOpen($("panel").hidden));
  setOpen(false);
}

saveNotes();
render();
