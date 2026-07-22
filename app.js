// Raumnutzung — Anträge auf Raumnutzung für Veranstaltungen (Landkreis Eichsfeld).
// Gateway-App nach dem Muster von materialbedarf: Login über die Tools-Übersicht,
// eine JSON-Datei in der Vereins-Nextcloud, kein Build-Step.

let appData = { antraege: [] };
let currentUser = null;
let currentAntragId = null;
let currentFilter = "alle";

// ---------------------------------------------------------------------------
// Speichern: debounced, mit In-Flight-Guard
// ---------------------------------------------------------------------------
// Ohne den Guard startet ein zweiter Save, während der erste noch läuft, mit dem
// alten ETag — der Worker antwortet dann mit 409 und die App meldet „von einem
// anderen Gerät geändert“, obwohl nur eine Person am Werk ist. Läuft schon ein
// Save, wird stattdessen nur gemerkt, dass danach noch einmal gespeichert werden
// muss.
let saveTimer = null;
let saveInFlight = false;
let savePending = false;

function scheduleSave() {
  if (!canEdit()) return;
  if (saveTimer) clearTimeout(saveTimer);
  setSaveHint("Änderungen werden gespeichert…");
  saveTimer = setTimeout(() => { saveTimer = null; doSave(); }, 900);
}

async function doSave() {
  if (saveInFlight) { savePending = true; return; }
  saveInFlight = true;
  try {
    await gatewaySave(appData);
    setSaveHint("Gespeichert " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
  } catch (e) {
    if (e instanceof NotLoggedInError) {
      showConnectScreen(e.message);
    } else if (e instanceof ConflictError) {
      setSaveHint("Konflikt — bitte neu laden", true);
      alert("Die Daten wurden zwischenzeitlich von einem anderen Gerät geändert. "
        + "Die Seite wird neu geladen, damit nichts überschrieben wird.");
      location.reload();
      return;
    } else {
      setSaveHint("Nicht gespeichert: " + e.message, true);
    }
  } finally {
    saveInFlight = false;
    if (savePending) { savePending = false; doSave(); }
  }
}

// Beim Verlassen einer Ansicht den anstehenden Autosave sofort auslösen, sonst
// gehen die zuletzt getippten Zeichen verloren.
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; doSave(); }
}

function setSaveHint(text, isError) {
  const el = document.getElementById("save-hint");
  if (!el) return;
  el.textContent = text || "";
  el.className = "save-hint" + (isError ? " error" : "");
}

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------
function canEdit() {
  return !!(currentUser && currentUser.canEdit);
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function el(id) { return document.getElementById(id); }

function neueId() {
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function datumAnzeige(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

// Ja/Nein/keine Angabe: im Datensatz true/false/null, im Select "ja"/"nein"/"".
function jaNeinAusSelect(v) { return v === "ja" ? true : v === "nein" ? false : null; }
function jaNeinZuSelect(v) { return v === true ? "ja" : v === false ? "nein" : ""; }

function fuelleJaNeinSelects(root) {
  (root || document).querySelectorAll("select.ja-nein").forEach((sel) => {
    if (sel.dataset.gefuellt) return;
    sel.innerHTML = '<option value="">— keine Angabe —</option>'
      + '<option value="ja">Ja</option><option value="nein">Nein</option>';
    sel.dataset.gefuellt = "1";
  });
}

// ---------------------------------------------------------------------------
// Datenschema
// ---------------------------------------------------------------------------
// Alle Ja/Nein-Fragen eines neuen Antrags stehen auf „Nein“, nicht auf „keine
// Angabe“. Das Formular verlangt in jeder Zeile ein Kreuz — ein leeres
// Kästchenpaar sieht beim Amt nach „vergessen“ aus. Der Normalfall einer
// Hallenveranstaltung ist überall Nein; die wenigen Ausnahmen (Beheizung,
// Bewirtung) hakt man einzeln um. „Keine Angabe“ bleibt als Wert möglich, ist
// aber nichts, wo man versehentlich landet.
function buehneVorbelegung() {
  const b = {};
  BUEHNE_FELDER.forEach((f) => { b[f.key] = false; });
  return b;
}

function leererAntrag() {
  return {
    id: neueId(),
    erstelltVon: currentUser ? currentUser.username : "",
    erstelltAm: new Date().toISOString(),
    geaendertAm: new Date().toISOString(),
    status: "entwurf",
    notiz: "",
    veranstaltungsort: "", raeume: "", bezeichnung: "", veranstalter: "",
    leiter: { name: "", anschrift: ["", "", ""], telefon: "", email: "" },
    vertreter: { name: "", anschrift: ["", "", ""], telefon: "", email: "" },
    veranstaltung: { datum: "", einlass: "", beginn: "", ende: "" },
    besucheraufkommen: "",
    aufbau: { datum: "", beginn: "", ende: "" },
    abbau: { datum: "", beginn: "", ende: "" },
    zahlen: {},
    eintrittsgeld: false,
    technPersonal: false,
    unterstuetzung: {},
    unterstuetzungAufgaben: "",
    sonstigesText: "",
    beheizung: false,
    heizBemerkungen: "",
    speisen: false,
    speisenText: "",
    buehne: buehneVorbelegung(),
    ortDatum: ""
  };
}

// Ergänzt fehlende Zweige, damit später kein Zugriff auf undefined läuft.
// Altdaten aus einer früheren Fassung sollen weiter funktionieren, ohne dass
// jedes Lesen eine Fallback-Kette braucht.
function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const liste = Array.isArray(data.antraege) ? data.antraege : [];
  const vorlage = leererAntrag();
  data.antraege = liste.map((a) => {
    const n = Object.assign({}, vorlage, a);
    n.id = a.id || neueId();
    n.leiter = Object.assign({ name: "", anschrift: ["", "", ""], telefon: "", email: "" }, a.leiter);
    n.vertreter = Object.assign({ name: "", anschrift: ["", "", ""], telefon: "", email: "" }, a.vertreter);
    n.leiter.anschrift = Array.isArray(n.leiter.anschrift) ? n.leiter.anschrift.slice(0, 3) : ["", "", ""];
    n.vertreter.anschrift = Array.isArray(n.vertreter.anschrift) ? n.vertreter.anschrift.slice(0, 3) : ["", "", ""];
    while (n.leiter.anschrift.length < 3) n.leiter.anschrift.push("");
    while (n.vertreter.anschrift.length < 3) n.vertreter.anschrift.push("");
    n.veranstaltung = Object.assign({ datum: "", einlass: "", beginn: "", ende: "" }, a.veranstaltung);
    n.aufbau = Object.assign({ datum: "", beginn: "", ende: "" }, a.aufbau);
    n.abbau = Object.assign({ datum: "", beginn: "", ende: "" }, a.abbau);
    n.zahlen = Object.assign({}, a.zahlen);
    n.unterstuetzung = Object.assign({}, a.unterstuetzung);
    // Bühne: Vorbelegung zuerst, damit nie beantwortete Fragen den Standard
    // „Nein“ bekommen und nicht als „keine Angabe“ im Antrag ans Amt gehen.
    // Bereits gesetzte Antworten überschreiben sie.
    n.buehne = Object.assign(buehneVorbelegung(), a.buehne);
    // Einmalige Angleichung an den Standard „Nein“: Anträge aus der ersten
    // Fassung tragen hier ein explizites null, das damals der Vorgabewert war
    // und keine bewusste Antwort ist.
    ["eintrittsgeld", "technPersonal", "beheizung", "speisen"].forEach((k) => {
      if (n[k] === null || n[k] === undefined) n[k] = false;
    });
    if (!STATUS_LABELS[n.status]) n.status = "entwurf";
    return n;
  });
  return data;
}

function findeAntrag(id) {
  return appData.antraege.find((a) => a.id === id) || null;
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------
function sortierteAntraege() {
  const liste = appData.antraege.slice();
  liste.sort((a, b) => {
    const da = (a.veranstaltung && a.veranstaltung.datum) || "";
    const db = (b.veranstaltung && b.veranstaltung.datum) || "";
    if (da && db && da !== db) return db.localeCompare(da);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return String(b.erstelltAm || "").localeCompare(String(a.erstelltAm || ""));
  });
  return liste;
}

function renderUebersicht() {
  const rows = el("uebersicht-rows");
  const leer = el("uebersicht-empty");
  const liste = sortierteAntraege().filter(
    (a) => currentFilter === "alle" || a.status === currentFilter
  );
  leer.style.display = liste.length ? "none" : "";
  leer.textContent = appData.antraege.length
    ? "Keine Anträge mit diesem Status."
    : "Noch keine Anträge erfasst.";
  rows.innerHTML = liste.map(antragRowHtml).join("");
}

function antragRowHtml(a) {
  const datum = datumAnzeige(a.veranstaltung && a.veranstaltung.datum);
  const titel = a.bezeichnung || "(ohne Bezeichnung)";
  const ort = [a.veranstaltungsort, a.raeume].filter(Boolean).join(" · ");
  return `
    <div class="antrag-row" data-id="${escapeHtml(a.id)}">
      <div class="antrag-row-main">
        <div class="antrag-row-titel">${escapeHtml(titel)}</div>
        <div class="antrag-row-meta">
          ${datum ? "📅 " + escapeHtml(datum) : '<span class="muted">ohne Datum</span>'}
          ${ort ? " · " + escapeHtml(ort) : ""}
        </div>
      </div>
      <span class="status-pill status-${escapeHtml(a.status)}">${escapeHtml(STATUS_LABELS[a.status] || a.status)}</span>
      <button type="button" class="btn secondary small" data-open="${escapeHtml(a.id)}">Öffnen</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Antragsformular: dynamische Blöcke
// ---------------------------------------------------------------------------
function renderZahlenGrid() {
  const grid = el("zahlen-grid");
  grid.innerHTML = ZAHLEN_FELDER.map(([key, label, typ]) => `
    <label class="zahl-zeile">
      <span>${escapeHtml(label)}</span>
      <input type="${typ === "zahl" ? "number" : "text"}"
             ${typ === "zahl" ? 'min="0" step="1"' : ""}
             data-zahl="${escapeHtml(key)}" />
    </label>`).join("");
}

function renderUnterstuetzungHaken() {
  el("unterstuetzung-haken").innerHTML = UNTERSTUETZUNG_LABELS.map(([key, label]) => `
    <label class="haken-zeile">
      <input type="checkbox" data-unt="${escapeHtml(key)}" />
      <span>${escapeHtml(label)}</span>
    </label>`).join("");
}

function renderBuehneBlock() {
  el("buehne-block").innerHTML = BUEHNE_FELDER.map((f) => {
    let extra = "";
    (f.text || []).forEach(([key, label]) => {
      extra += `
        <div class="form-field buehne-extra">
          <label>${escapeHtml(label)}</label>
          <input type="text" data-buehne="${escapeHtml(key)}" />
        </div>`;
    });
    if (f.area) {
      extra += `
        <div class="form-field buehne-extra">
          <label>${escapeHtml(f.area[1])}</label>
          <textarea rows="2" data-buehne="${escapeHtml(f.area[0])}"></textarea>
        </div>`;
    }
    return `
      <div class="buehne-zeile">
        <div class="buehne-frage">
          <span>${escapeHtml(f.label)}</span>
          <select class="ja-nein" data-buehne="${escapeHtml(f.key)}"></select>
        </div>
        ${extra}
      </div>`;
  }).join("");
  fuelleJaNeinSelects(el("buehne-block"));
}

// ---------------------------------------------------------------------------
// Antragsformular: laden und binden
// ---------------------------------------------------------------------------
function oeffneAntrag(id) {
  const a = findeAntrag(id);
  if (!a) return;
  currentAntragId = id;
  el("nav-antrag").style.display = "";
  fuelleFormular(a);
  switchTab("antrag");
}

function fuelleFormular(a) {
  el("antrag-titel").textContent = a.bezeichnung || "Neuer Antrag";
  const pill = el("antrag-status-pill");
  pill.textContent = STATUS_LABELS[a.status] || a.status;
  pill.className = "status-pill status-" + a.status;
  el("antrag-meta").textContent =
    "Angelegt am " + new Date(a.erstelltAm).toLocaleDateString("de-DE")
    + (a.erstelltVon ? " von " + a.erstelltVon : "");

  const setV = (id, v) => { const e = el(id); if (e) e.value = v === null || v === undefined ? "" : v; };

  setV("f-veranstaltungsort", a.veranstaltungsort);
  setV("f-raeume", a.raeume);
  setV("f-bezeichnung", a.bezeichnung);
  setV("f-veranstalter", a.veranstalter);

  ["leiter", "vertreter"].forEach((rolle) => {
    const p = a[rolle] || {};
    setV(`f-${rolle}-name`, p.name);
    setV(`f-${rolle}-telefon`, p.telefon);
    setV(`f-${rolle}-email`, p.email);
    for (let i = 0; i < 3; i++) setV(`f-${rolle}-anschrift-${i}`, (p.anschrift || [])[i]);
  });

  setV("f-va-datum", a.veranstaltung.datum);
  setV("f-va-einlass", a.veranstaltung.einlass);
  setV("f-va-beginn", a.veranstaltung.beginn);
  setV("f-va-ende", a.veranstaltung.ende);
  setV("f-aufbau-datum", a.aufbau.datum);
  setV("f-aufbau-beginn", a.aufbau.beginn);
  setV("f-aufbau-ende", a.aufbau.ende);
  setV("f-abbau-datum", a.abbau.datum);
  setV("f-abbau-beginn", a.abbau.beginn);
  setV("f-abbau-ende", a.abbau.ende);
  setV("f-besucheraufkommen", a.besucheraufkommen);

  document.querySelectorAll("[data-zahl]").forEach((inp) => {
    inp.value = a.zahlen[inp.dataset.zahl] || "";
  });
  aktualisiereSumme();

  setV("f-eintrittsgeld", jaNeinZuSelect(a.eintrittsgeld));
  setV("f-techn-personal", jaNeinZuSelect(a.technPersonal));
  document.querySelectorAll("[data-unt]").forEach((cb) => {
    cb.checked = a.unterstuetzung[cb.dataset.unt] === true;
  });
  setV("f-unt-aufgaben", a.unterstuetzungAufgaben);
  setV("f-sonstiges-text", a.sonstigesText);
  setV("f-beheizung", jaNeinZuSelect(a.beheizung));
  setV("f-heiz-bemerkungen", a.heizBemerkungen);
  setV("f-speisen", jaNeinZuSelect(a.speisen));
  setV("f-speisen-text", a.speisenText);

  document.querySelectorAll("[data-buehne]").forEach((inp) => {
    const key = inp.dataset.buehne;
    const wert = a.buehne[key];
    if (inp.tagName === "SELECT") inp.value = jaNeinZuSelect(wert);
    else inp.value = wert === null || wert === undefined ? "" : wert;
  });

  setV("f-ort-datum", a.ortDatum);
  setV("f-status", a.status);
  setV("f-notiz", a.notiz);

  setzeSchreibschutz();
  setSaveHint("");
}

// Sperrt alle Eingaben, wenn die Person kein Bearbeiten-Recht hat. Das ist die
// Anzeige-Seite; durchgesetzt wird das Schreibverbot serverseitig im Worker
// (raumnutzung steht in WRITE_REQUIRES_EDIT_PERMISSION).
function setzeSchreibschutz() {
  const gesperrt = !canEdit();
  document.querySelectorAll("#tab-antrag input, #tab-antrag textarea, #tab-antrag select")
    .forEach((e) => { e.disabled = gesperrt; });
  ["btn-loeschen", "btn-kopieren"].forEach((id) => {
    const b = el(id); if (b) b.style.display = gesperrt ? "none" : "";
  });
  const neu = el("btn-neuer-antrag");
  if (neu) neu.style.display = gesperrt ? "none" : "";
  if (gesperrt) setSaveHint("Nur Lesezugriff — Änderungen sind der Bearbeiter-Gruppe vorbehalten.");
}

function aktualisiereSumme() {
  const a = findeAntrag(currentAntragId);
  const summe = a ? berechneSumme(a.zahlen) : null;
  el("zahlen-summe").textContent = summe === null ? "–" : String(summe);
}

// Liest ein einzelnes Feld aus der Oberfläche in den Datensatz zurück.
function bindeFormular() {
  const tab = el("tab-antrag");

  tab.addEventListener("input", (ev) => {
    const a = findeAntrag(currentAntragId);
    if (!a || !canEdit()) return;
    if (!uebernehmeFeld(a, ev.target)) return;
    a.geaendertAm = new Date().toISOString();
    scheduleSave();
  });

  tab.addEventListener("change", (ev) => {
    const a = findeAntrag(currentAntragId);
    if (!a || !canEdit()) return;
    if (!uebernehmeFeld(a, ev.target)) return;
    a.geaendertAm = new Date().toISOString();
    if (ev.target.id === "f-status") {
      const pill = el("antrag-status-pill");
      pill.textContent = STATUS_LABELS[a.status] || a.status;
      pill.className = "status-pill status-" + a.status;
    }
    scheduleSave();
  });
}

function uebernehmeFeld(a, t) {
  if (!t || !t.id && !t.dataset) return false;
  const v = t.type === "checkbox" ? t.checked : t.value;

  if (t.dataset.zahl) {
    a.zahlen[t.dataset.zahl] = v;
    aktualisiereSumme();
    return true;
  }
  if (t.dataset.unt) { a.unterstuetzung[t.dataset.unt] = v === true; return true; }
  if (t.dataset.buehne) {
    a.buehne[t.dataset.buehne] = t.tagName === "SELECT" ? jaNeinAusSelect(v) : v;
    return true;
  }

  const rollenTreffer = t.id && t.id.match(/^f-(leiter|vertreter)-(name|telefon|email)$/);
  if (rollenTreffer) { a[rollenTreffer[1]][rollenTreffer[2]] = v; return true; }
  const anschriftTreffer = t.id && t.id.match(/^f-(leiter|vertreter)-anschrift-(\d)$/);
  if (anschriftTreffer) { a[anschriftTreffer[1]].anschrift[Number(anschriftTreffer[2])] = v; return true; }
  const planTreffer = t.id && t.id.match(/^f-(va|aufbau|abbau)-(datum|einlass|beginn|ende)$/);
  if (planTreffer) {
    const zweig = planTreffer[1] === "va" ? "veranstaltung" : planTreffer[1];
    a[zweig][planTreffer[2]] = v;
    return true;
  }

  switch (t.id) {
    case "f-veranstaltungsort": a.veranstaltungsort = v; return true;
    case "f-raeume": a.raeume = v; return true;
    case "f-bezeichnung":
      a.bezeichnung = v;
      el("antrag-titel").textContent = v || "Neuer Antrag";
      return true;
    case "f-veranstalter": a.veranstalter = v; return true;
    case "f-besucheraufkommen": a.besucheraufkommen = v; return true;
    case "f-eintrittsgeld": a.eintrittsgeld = jaNeinAusSelect(v); return true;
    case "f-techn-personal": a.technPersonal = jaNeinAusSelect(v); return true;
    case "f-unt-aufgaben": a.unterstuetzungAufgaben = v; return true;
    case "f-sonstiges-text": a.sonstigesText = v; return true;
    case "f-beheizung": a.beheizung = jaNeinAusSelect(v); return true;
    case "f-heiz-bemerkungen": a.heizBemerkungen = v; return true;
    case "f-speisen": a.speisen = jaNeinAusSelect(v); return true;
    case "f-speisen-text": a.speisenText = v; return true;
    case "f-ort-datum": a.ortDatum = v; return true;
    case "f-status": a.status = v; return true;
    case "f-notiz": a.notiz = v; return true;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------
function neuerAntrag() {
  if (!canEdit()) return;
  const a = leererAntrag();
  a.veranstalter = "1. SC 1911 Heiligenstadt e.V.";
  if (currentUser) {
    const name = [currentUser.nachname, currentUser.vorname].filter(Boolean).join(", ");
    if (name) a.leiter.name = name;
  }
  appData.antraege.push(a);
  renderUebersicht();
  oeffneAntrag(a.id);
  scheduleSave();
}

function kopiereAntrag() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  const kopie = JSON.parse(JSON.stringify(a));
  kopie.id = neueId();
  kopie.status = "entwurf";
  kopie.erstelltAm = new Date().toISOString();
  kopie.geaendertAm = kopie.erstelltAm;
  kopie.erstelltVon = currentUser ? currentUser.username : "";
  kopie.bezeichnung = (a.bezeichnung || "Antrag") + " (Kopie)";
  // Termine bewusst leeren: eine Kopie ist eine neue Veranstaltung, und ein
  // versehentlich übernommenes Datum wäre im Antrag ans Amt schwer zu bemerken.
  kopie.veranstaltung = { datum: "", einlass: "", beginn: "", ende: "" };
  kopie.aufbau = { datum: "", beginn: "", ende: "" };
  kopie.abbau = { datum: "", beginn: "", ende: "" };
  kopie.ortDatum = "";
  appData.antraege.push(kopie);
  renderUebersicht();
  oeffneAntrag(kopie.id);
  scheduleSave();
}

function loescheAntrag() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  const name = a.bezeichnung || "diesen Antrag";
  if (!confirm(`„${name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
  appData.antraege = appData.antraege.filter((x) => x.id !== a.id);
  currentAntragId = null;
  el("nav-antrag").style.display = "none";
  renderUebersicht();
  switchTab("uebersicht");
  flushSave();
  doSave();
}

async function erzeugePdf() {
  const a = findeAntrag(currentAntragId);
  if (!a) return;
  const btn = el("btn-pdf");
  const originalText = btn.textContent;
  // Das leere Fenster synchron öffnen: Safari auf iOS blockt window.open()
  // stillschweigend, sobald davor ein await gelaufen ist.
  const tab = _openBlobTab();
  btn.disabled = true;
  btn.textContent = "PDF wird erzeugt…";
  try {
    flushSave();
    const { blob, fehler } = await erzeugeAntragsPdf(a);
    tab.show(blob);
    ladeHerunter(blob, pdfDateiname(a));
    if (fehler.length) {
      alert("Das PDF wurde erzeugt, dabei sind aber Hinweise aufgetreten:\n\n• "
        + fehler.join("\n• "));
    }
  } catch (e) {
    tab.abort();
    alert("PDF konnte nicht erzeugt werden: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Öffnet einen Blob in einem neuen Tab. Das Fenster wird synchron aufgemacht
// und erst danach befüllt (siehe erzeugePdf), gleiche Konvention wie in
// Trainerdaten und personalakte.
function _openBlobTab() {
  const win = window.open("", "_blank");
  return {
    show(blob) {
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    abort() { if (win) win.close(); }
  };
}

function ladeHerunter(blob, dateiname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function switchTab(name) {
  flushSave();
  document.querySelectorAll("nav button[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".tab-section").forEach((s) => {
    s.classList.toggle("active", s.id === "tab-" + name);
  });
  if (name === "uebersicht") renderUebersicht();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Info / Changelog
// ---------------------------------------------------------------------------
function renderChangelog() {
  const ziel = el("changelog-list");
  ziel.innerHTML = APP_CHANGELOG.map((eintrag) => `
    <div class="changelog-entry">
      <div class="cv">Version ${escapeHtml(eintrag.version)}</div>
      ${eintrag.groups.map((g) => `
        <div class="changelog-group">
          <div class="cg-title">${escapeHtml(g.title)}</div>
          <ul class="cg-items">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>`).join("");
}

function setzeVersionsbadges() {
  [el("version-badge"), el("version-badge-2")].forEach((b) => {
    if (b) b.textContent = "v" + APP_VERSION;
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
function showConnectScreen(fehler) {
  el("connect-screen").style.display = "";
  el("app-shell").style.display = "none";
  if (fehler) {
    const e = el("cloud-error");
    e.style.display = "";
    e.textContent = fehler;
  }
}

async function boot() {
  setzeVersionsbadges();
  renderChangelog();
  fuelleJaNeinSelects(document);
  renderZahlenGrid();
  renderUnterstuetzungHaken();
  renderBuehneBlock();
  el("orte-liste").innerHTML = ORTE.map((o) => `<option value="${escapeHtml(o)}"></option>`).join("");

  try {
    currentUser = await fetchMe();
    appData = normalizeData(await gatewayLoad());
  } catch (e) {
    showConnectScreen(e instanceof NotLoggedInError ? null : e.message);
    return;
  }

  el("connect-screen").style.display = "none";
  el("app-shell").style.display = "";
  const name = [currentUser.vorname, currentUser.nachname].filter(Boolean).join(" ");
  el("header-user").textContent = name || currentUser.username || "";

  renderUebersicht();
  setzeSchreibschutz();

  // --- Ereignisse ---
  document.querySelectorAll("nav button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });
  el("btn-neuer-antrag").addEventListener("click", neuerAntrag);
  el("btn-zurueck").addEventListener("click", () => switchTab("uebersicht"));
  el("btn-pdf").addEventListener("click", erzeugePdf);
  el("btn-kopieren").addEventListener("click", kopiereAntrag);
  el("btn-loeschen").addEventListener("click", loescheAntrag);
  el("uebersicht-status-filter").addEventListener("change", (ev) => {
    currentFilter = ev.target.value;
    renderUebersicht();
  });
  el("uebersicht-rows").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (btn) oeffneAntrag(btn.dataset.open);
  });
  bindeFormular();

  const badge = el("version-badge");
  badge.addEventListener("click", () => switchTab("info"));
  badge.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); switchTab("info"); }
  });

  // Letzten Autosave beim Schließen/Wegschalten noch loswerden.
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

boot();
