// Raumnutzung — Anträge auf Raumnutzung für Veranstaltungen (Landkreis Eichsfeld).
// Gateway-App nach dem Muster von materialbedarf: Login über die Tools-Übersicht,
// eine JSON-Datei in der Vereins-Nextcloud, kein Build-Step.

let appData = { antraege: [] };
let currentUser = null;
let currentAntragId = null;
let currentFilter = "alle";
// Zweiter Filter für das Archiv und der Merker, welche der beiden Listen offen
// ist — daran hängt, was der Sammelexport packt.
let archivFilter = "alle";
let aktiveListe = "uebersicht"; // "uebersicht" | "archiv"
// Läuft gerade ein Sammelexport? Solange das steht, gehört die Beschriftung des
// Export-Knopfes dem Fortschritt und darf nicht vom Neurendern der Liste
// überschrieben werden.
let exportLaeuft = false;

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

// Meldet seit 1.8 zurück, OB gespeichert wurde (true/false). Bestehende Aufrufer
// ignorieren den Wert; gebraucht wird er von speichereSofort(), weil eine
// Push-Meldung nur raus darf, wenn der Vorgang wirklich in der Datei steht.
async function doSave() {
  if (saveInFlight) { savePending = true; return false; }
  saveInFlight = true;
  try {
    await lagereUnterschriftenAus();
    await gatewaySave(appData);
    setSaveHint("Gespeichert " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    // Der Auslager-Versuch von eben kann fehlgeschlagen sein, ohne dass der Save
    // scheitert — dann steht es jetzt am Unterschriftsfeld.
    const offen = findeAntrag(currentAntragId);
    if (offen) setUnterschriftStatus(offen);
    return true;
  } catch (e) {
    if (e instanceof NotLoggedInError) {
      showConnectScreen(e.message);
    } else if (e instanceof ConflictError) {
      setSaveHint("Konflikt — bitte neu laden", true);
      alert("Die Daten wurden zwischenzeitlich von einem anderen Gerät geändert. "
        + "Die Seite wird neu geladen, damit nichts überschrieben wird.");
      location.reload();
      return false;
    } else {
      setSaveHint("Nicht gespeichert: " + e.message, true);
    }
    return false;
  } finally {
    saveInFlight = false;
    if (savePending) { savePending = false; doSave(); }
  }
}

// Speichert JETZT statt in 900 ms und meldet, ob es geklappt hat.
//
// ⚠️ Nötig überall dort, wo der Worker gleich danach den Datensatz lesen soll:
// `vorgang-push` sucht den Antrag in der Nextcloud-Datei. Ginge die Meldung vor
// dem Speichern raus, fände er ihn nicht (404) oder läse einen alten Stand — und
// niemand bekäme etwas mit, weil der Push-Fehler bewusst geschluckt wird.
async function speichereSofort() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  // Auf einen bereits laufenden Save warten: doSave() setzt sonst nur
  // savePending und käme sofort mit false zurück, obwohl gleich gespeichert wird.
  for (let i = 0; i < 100 && (saveInFlight || savePending); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return doSave();
}

// ---------------------------------------------------------------------------
// Benachrichtigung (seit 2026-08-03)
// ---------------------------------------------------------------------------
// Der Empfänger wird SERVERSEITIG bestimmt: bei "neu" die Einreichenden, bei
// "entschieden" der Urheber des Antrags. Diese App schickt bewusst keinen
// Nutzernamen mit — sonst könnte ein Bearbeiter beliebige Leute benachrichtigen
// lassen, und ein Tippfehler liefe unbemerkt ins Leere.
async function pushVorgang(art, id) {
  try {
    await gatewayVorgangPush(art, id);
  } catch (e) {
    // Best-effort: der Antrag ist gespeichert, eine misslungene Benachrichtigung
    // darf ihn nicht als Fehler erscheinen lassen.
    console.warn("Benachrichtigung fehlgeschlagen", e);
  }
}

// Welcher Statuswechsel wen erreicht. Die Rückstufung auf "entwurf" meldet sich
// bewusst nicht — sie nimmt etwas zurück, statt jemandem Arbeit zu geben.
function pushArtFuerStatus(status) {
  if (status === "fertig") return "neu";              // an die Einreichenden
  if (status === "eingereicht" || status === "genehmigt" || status === "abgelehnt") {
    return "entschieden";                             // an den Urheber
  }
  return null;
}

// ⚠️ Gemeinsamer Weg für BEIDE Wege in denselben Status: den Knopf „Fertig zum
// Einreichen" UND das Status-Auswahlfeld daneben. Ohne das meldete sich der eine
// und der andere nicht — derselbe Vorgang mit zwei verschiedenen Verhalten, und
// wer die Auswahl benutzt, käme nie auf die Idee, dass etwas fehlt.
async function statusGewechselt(a) {
  const art = pushArtFuerStatus(a.status);
  if (!art) { scheduleSave(); return true; }
  const ok = await speichereSofort();
  if (ok) await pushVorgang(art, a.id);
  return ok;
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

// Dritte Rechte-Stufe („Administrieren“, adminGroupIds im Sichtbarkeits-Panel).
// Der Gateway liefert das Feld seit 2026-07-24 additiv in me/dav-load mit; fehlt
// es (alter Worker), gilt es als nicht erteilt — die Admin-Funktion ist dann
// einfach nicht da, statt versehentlich für alle offen zu stehen.
function canAdmin() {
  return !!(currentUser && currentUser.canAdmin);
}

// Klarname der eingeloggten Person, leer wenn der Gateway keinen liefert.
function aktuellerKlarname() {
  if (!currentUser) return "";
  return [currentUser.vorname, currentUser.nachname].filter(Boolean).join(" ");
}

// Anzeigename des Erstellers. Der Klarname wird seit dem 2026-07-23 beim
// Anlegen mitgespeichert; ältere Anträge kennen nur den Login-Namen. Stammt so
// einer von der gerade eingeloggten Person, lässt sich der Klarname aus der
// Session ableiten — für fremde Altanträge bleibt es beim Login-Namen.
function erstellerAnzeige(a) {
  if (a.erstelltVonName) return a.erstelltVonName;
  if (currentUser && a.erstelltVon && a.erstelltVon === currentUser.username) {
    const name = aktuellerKlarname();
    if (name) return name;
  }
  return a.erstelltVon || "";
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

// Id für eine ausgelagerte Datei (Unterschrift). Der Worker prüft sie gegen
// FILE_ID_RE und akzeptiert AUSSCHLIESSLICH das UUID-Format — neueId() taugt
// hier also nicht. crypto.randomUUID() gibt es aber erst ab Safari 15.4; auf
// älterem iOS warf die Zeile bisher einen TypeError, der den kompletten Save
// abbrach (die Unterschrift blieb inline, jeder weitere Save lief in denselben
// Fehler). crypto.getRandomValues gibt es dort seit jeher, daraus bauen wir das
// Format selbst zusammen: 16 Zufallsbytes, Version 4 und Variante gesetzt.
function neueDateiId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) +
         "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

// Vorbelegung für „Ort, Datum“. Zweistellig mit führender Null — toLocale-
// DateString("de-DE") liefert „22.7.2026“, und so schreibt man kein Datum auf
// ein Amtsformular.
function kurzDatum(wert) {
  const d = wert ? new Date(wert) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function heuteOrtDatum() {
  return "Heilbad Heiligenstadt, " + kurzDatum();
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
  return Object.assign(b, ANTRAG_VORBELEGUNG.buehneTexte);
}

function leererAntrag() {
  return {
    id: neueId(),
    erstelltVon: currentUser ? currentUser.username : "",
    erstelltVonName: aktuellerKlarname(),
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
    zahlen: Object.assign({}, ANTRAG_VORBELEGUNG.zahlen),
    eintrittsgeld: ANTRAG_VORBELEGUNG.eintrittsgeld,
    technPersonal: ANTRAG_VORBELEGUNG.technPersonal,
    unterstuetzung: Object.assign({}, ANTRAG_VORBELEGUNG.unterstuetzung),
    unterstuetzungAufgaben: ANTRAG_VORBELEGUNG.unterstuetzungAufgaben,
    sonstigesText: "",
    beheizung: ANTRAG_VORBELEGUNG.beheizung,
    heizBemerkungen: "",
    speisen: ANTRAG_VORBELEGUNG.speisen,
    speisenText: ANTRAG_VORBELEGUNG.speisenText,
    buehne: buehneVorbelegung(),
    // Vorbelegt statt nur als Platzhalter angedeutet: ein grauer Platzhalter
    // sieht aus wie ein Wert, wird deshalb übersehen — und das Feld blieb im
    // fertigen Antrag leer.
    ortDatum: heuteOrtDatum(),
    // Unterschrift der Veranstaltungsleitung. Frisch gezeichnet liegt sie als
    // PNG-DataURL in `unterschrift`; beim Speichern wandert sie in eine eigene
    // Gateway-Datei und nur noch die Id bleibt im Datensatz.
    unterschrift: "",
    unterschriftFileId: "",
    unterschriebenAm: ""
  };
}

// Ergänzt fehlende Zweige, damit später kein Zugriff auf undefined läuft.
// Altdaten aus einer früheren Fassung sollen weiter funktionieren, ohne dass
// jedes Lesen eine Fallback-Kette braucht.
function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  if (!data.einstellungen || typeof data.einstellungen !== "object") data.einstellungen = {};
  // Verteiler für die Meldung „Antrag fertig“. LEER heißt bewusst „alle
  // Einreichenden“ (bisheriges Verhalten), nicht „niemand“ — ein still
  // ausbleibendes Push würde niemandem auffallen. Der Worker legt die Liste nur
  // als Filter über die Berechtigten, sie kann den Kreis also nie erweitern.
  if (!Array.isArray(data.einstellungen.pushEmpfaenger)) data.einstellungen.pushEmpfaenger = [];
  const liste = Array.isArray(data.antraege) ? data.antraege : [];
  const vorlage = leererAntrag();
  data.antraege = liste.map((a) => {
    const n = Object.assign({}, vorlage, a);
    n.id = a.id || neueId();
    // Wer den Antrag angelegt hat, darf NIE aus der Vorlage kommen — die trägt
    // die gerade eingeloggte Person, und ein Altantrag ohne diese Felder würde
    // ihr dadurch stillschweigend zugeschrieben.
    n.erstelltVon = typeof a.erstelltVon === "string" ? a.erstelltVon : "";
    n.erstelltVonName = typeof a.erstelltVonName === "string" ? a.erstelltVonName : "";
    n.leiter = Object.assign({ name: "", anschrift: ["", "", ""], telefon: "", email: "" }, a.leiter);
    n.vertreter = Object.assign({ name: "", anschrift: ["", "", ""], telefon: "", email: "" }, a.vertreter);
    n.leiter.anschrift = Array.isArray(n.leiter.anschrift) ? n.leiter.anschrift.slice(0, 3) : ["", "", ""];
    n.vertreter.anschrift = Array.isArray(n.vertreter.anschrift) ? n.vertreter.anschrift.slice(0, 3) : ["", "", ""];
    while (n.leiter.anschrift.length < 3) n.leiter.anschrift.push("");
    while (n.vertreter.anschrift.length < 3) n.vertreter.anschrift.push("");
    n.veranstaltung = Object.assign({ datum: "", einlass: "", beginn: "", ende: "" }, a.veranstaltung);
    n.aufbau = Object.assign({ datum: "", beginn: "", ende: "" }, a.aufbau);
    n.abbau = Object.assign({ datum: "", beginn: "", ende: "" }, a.abbau);
    n.zahlen = Object.assign({}, ANTRAG_VORBELEGUNG.zahlen, a.zahlen);
    // Vorbelegung zuerst, bereits gesetzte Häkchen gewinnen: ein nie
    // angefasster Abschnitt bekommt den Standard, eine bewusste Abwahl bleibt.
    n.unterstuetzung = Object.assign({}, ANTRAG_VORBELEGUNG.unterstuetzung, a.unterstuetzung);
    // Bühne: Vorbelegung zuerst, damit nie beantwortete Fragen den Standard
    // „Nein“ bekommen und nicht als „keine Angabe“ im Antrag ans Amt gehen.
    // Bereits gesetzte Antworten überschreiben sie.
    n.buehne = Object.assign(buehneVorbelegung(), a.buehne);
    // Einmalige Angleichung an den Standard „Nein“: Anträge aus der ersten
    // Fassung tragen hier ein explizites null, das damals der Vorgabewert war
    // und keine bewusste Antwort ist.
    // Nie beantwortete Fragen bekommen den aktuellen Standard aus der Vorlage —
    // nicht hart „Nein“, sonst hinge hier für immer der Stand der ersten
    // Fassung fest, während neue Anträge längst anders vorbelegt werden.
    ["eintrittsgeld", "technPersonal", "beheizung", "speisen"].forEach((k) => {
      if (n[k] === null || n[k] === undefined) n[k] = vorlage[k];
    });
    // Ort/Datum war in der ersten Fassung nur ein grauer Platzhalter und blieb
    // dadurch im fertigen Antrag leer — leere Altwerte deshalb vorbelegen.
    if (!n.ortDatum) {
      n.ortDatum = heuteOrtDatum();
    }
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

// Abgeschlossen = vom Landkreis entschieden. Diese beiden wandern ins Archiv
// (Michel-Vorgabe 2026-08-03), damit die Arbeitsliste nur zeigt, was noch etwas
// von jemandem will.
const ARCHIV_STATUS = ["genehmigt", "abgelehnt"];
function istArchiviert(a) { return ARCHIV_STATUS.indexOf(a.status) !== -1; }

// Die Anträge, die die gerade offene Liste zeigt. Eigene Funktion, weil der
// Sammelexport genau dieselbe Auswahl packen muss wie die Ansicht — zwei
// getrennte Filter-Ausdrücke wären früher oder später auseinandergelaufen und
// der Export hätte still etwas anderes geliefert als das, was man vor sich hat.
// Seit der Aufteilung entscheidet zusätzlich der offene Reiter, welche der
// beiden Listen gemeint ist.
function sichtbareAntraege() {
  return aktiveListe === "archiv" ? archivAntraege() : offeneAntraege();
}

function offeneAntraege() {
  return sortierteAntraege().filter((a) => !istArchiviert(a))
    .filter((a) => currentFilter === "alle" || a.status === currentFilter);
}

function archivAntraege() {
  return sortierteAntraege().filter(istArchiviert)
    .filter((a) => archivFilter === "alle" || a.status === archivFilter);
}

// ⚠️ IMMER beide Listen zeichnen. Ein Statuswechsel lässt einen Antrag von der
// einen in die andere wandern — wer nur die gerade sichtbare neu rendert, lässt
// ihn entweder in der alten Liste stehen oder in der neuen fehlen, je nachdem wo
// man gerade steht. Alle früheren renderUebersicht()-Aufrufe gehen deshalb hier
// durch.
function renderListen() {
  renderUebersicht();
  renderArchiv();
}

function renderUebersicht() {
  const rows = el("uebersicht-rows");
  const leer = el("uebersicht-empty");
  const liste = offeneAntraege();
  const offeneGesamt = appData.antraege.filter((a) => !istArchiviert(a)).length;
  leer.style.display = liste.length ? "none" : "";
  leer.textContent = offeneGesamt
    ? "Keine Anträge mit diesem Status."
    : (appData.antraege.length
        ? "Nichts offen — alles Abgeschlossene steht im Archiv."
        : "Noch keine Anträge erfasst.");
  rows.innerHTML = liste.map(antragRowHtml).join("");
  aktualisiereExportKnopf("btn-alle-pdfs", liste.length);
}

function renderArchiv() {
  const rows = el("archiv-rows");
  const leer = el("archiv-empty");
  if (!rows || !leer) return;
  const liste = archivAntraege();
  const archivGesamt = appData.antraege.filter(istArchiviert).length;
  leer.style.display = liste.length ? "none" : "";
  leer.textContent = archivGesamt
    ? "Nichts mit diesem Status im Archiv."
    : "Noch nichts abgeschlossen.";
  rows.innerHTML = liste.map(antragRowHtml).join("");
  aktualisiereExportKnopf("btn-alle-pdfs-archiv", liste.length);
  // Zahl am Reiter: sonst ist nicht zu sehen, dass dort überhaupt etwas liegt.
  const nav = el("nav-archiv");
  if (nav) nav.textContent = archivGesamt ? `Archiv (${archivGesamt})` : "Archiv";
}

// Der Knopf trägt die Anzahl, die er exportieren würde — sonst ist bei gesetztem
// Status-Filter nicht zu sehen, dass „alle“ hier nur die angezeigten meint.
function aktualisiereExportKnopf(id, anzahl) {
  const btn = el(id);
  if (!btn || exportLaeuft) return;
  btn.textContent = `Alle als PDF-ZIP (${anzahl})`;
  btn.disabled = !anzahl;
}

function antragRowHtml(a) {
  const datum = datumAnzeige(a.veranstaltung && a.veranstaltung.datum);
  const titel = a.bezeichnung || "(ohne Bezeichnung)";
  const ort = [a.veranstaltungsort, a.raeume].filter(Boolean).join(" · ");
  // In der Liste zählt die Veranstaltungsleitung (fürs Amt relevant), nicht wer
  // den Datensatz angelegt hat (Michel 2026-07-24) — wer angelegt hat, steht
  // weiter im Kopf des geöffneten Antrags. Ohne Leitung entfällt die Angabe,
  // bewusst KEIN Rückfall auf den Ersteller.
  const leitung = ((a.leiter && a.leiter.name) || "").trim();
  return `
    <div class="antrag-row" data-id="${escapeHtml(a.id)}">
      <div class="antrag-row-main">
        <div class="antrag-row-titel">${escapeHtml(titel)}</div>
        <div class="antrag-row-meta">
          ${datum ? "📅 " + escapeHtml(datum) : '<span class="muted">ohne Datum</span>'}
          ${ort ? " · " + escapeHtml(ort) : ""}
          ${leitung ? " · 👤 " + escapeHtml(leitung) : ""}
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
  const ersteller = erstellerAnzeige(a);
  el("antrag-meta").textContent =
    "Angelegt am " + kurzDatum(a.erstelltAm)
    + (ersteller ? " von " + ersteller : "");

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

  zeigeUnterschrift(a);
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
  ["btn-loeschen", "btn-kopieren", "btn-sig-clear"].forEach((id) => {
    const b = el(id); if (b) b.style.display = gesperrt ? "none" : "";
  });
  const canvas = el("sig-canvas");
  if (canvas) canvas.classList.toggle("gesperrt", gesperrt);
  const neu = el("btn-neuer-antrag");
  if (neu) neu.style.display = gesperrt ? "none" : "";
  // ALLE drei Ausgabewege — Einzel-PDF, Mailversand ans Amt und Sammelexport —
  // hängen an der dritten Stufe (Administrieren), nicht an Bearbeiten
  // (Michel-Vorgabe 2026-07-27, verschärft gegenüber 1.6). Jeder von ihnen gibt
  // das vollständige Amtsformular mit den privaten Anschriften, Handynummern und
  // E-Mail-Adressen von Veranstaltungsleitung und Vertretung heraus — dieselben
  // Daten, wegen derer die App überhaupt eingeschränkt sichtbar ist. Die
  // Arbeitsteilung dahinter: Trainer füllen die Anträge aus (Bearbeiten),
  // eingereicht wird von der Geschäftsstelle (adminGroupIds), die im Mailtext
  // auch unterschreibt.
  // Alle drei stehen im Markup auf display:none, damit sie beim Laden nicht kurz
  // aufblitzen, bevor die Rechte da sind. Beim Mailversand sitzt die echte
  // Schranke im Worker (resolveAdminPermission in handleRaumnutzungMailAntrag);
  // PDF-Erzeugung und ZIP laufen vollständig im Browser über pdf-lib, dort IST
  // dieses Gate die Schranke — die Grenze davor ist die Tool-Sichtbarkeit.
  const darfAusgeben = canAdmin();
  ["btn-pdf", "btn-mail", "btn-alle-pdfs", "btn-alle-pdfs-archiv"].forEach((id) => {
    const b = el(id); if (b) b.style.display = darfAusgeben ? "" : "none";
  });
  // Einstellungen (Verteiler der Benachrichtigung) hängen an der dritten Stufe,
  // wie der Reiter in allen Geschwister-Apps.
  const navE = el("nav-einstellungen");
  if (navE) navE.style.display = darfAusgeben ? "" : "none";

  // ⚠️ Den Status bewegt NUR die Geschäftsstelle (Michel-Vorgabe 2026-08-03) —
  // deshalb nach der Sammelzeile oben noch einmal gesondert gesperrt. Trainer
  // haben genau einen Weg aus dem Entwurf heraus: den Knopf „Fertig zum
  // Einreichen“. Sonst könnte ein Antrag auf „eingereicht“ stehen, ohne dass ihn
  // je jemand beim Amt eingereicht hat — und das merkt niemand, denn nach außen
  // sieht die Liste dann erledigt aus.
  // Das Feld bleibt SICHTBAR, nur gesperrt: der Status ist die Information, wo
  // der Antrag gerade steht, und die geht auch den Ausfüllenden etwas an.
  const statusFeld = el("f-status");
  if (statusFeld) statusFeld.disabled = gesperrt || !darfAusgeben;
  const statusHinweis = el("status-nur-lesen-hinweis");
  if (statusHinweis) statusHinweis.style.display = (!gesperrt && !darfAusgeben) ? "block" : "none";

  zeigeFertigKnopf(findeAntrag(currentAntragId));
  if (gesperrt) setSaveHint("Nur Lesezugriff — Änderungen brauchen das Bearbeiten-Recht für dieses Tool.");
}

// Der Knopf steht nur, solange es etwas zu melden gibt: im Entwurf und mit
// Bearbeiten-Recht. Ab „fertig“ ist die Meldung raus und die Geschäftsstelle am
// Zug — ein Knopf, der dann noch dastünde, lüde zum zweiten Klingeln ein.
function zeigeFertigKnopf(a) {
  const b = el("btn-fertig");
  if (!b) return;
  b.style.display = (a && a.status === "entwurf" && canEdit()) ? "" : "none";
}

async function meldeFertig() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit() || a.status !== "entwurf") return;
  const b = el("btn-fertig");
  const vorher = a.status;
  const beschriftung = b.textContent;
  b.disabled = true;
  b.textContent = "Wird gemeldet…";
  try {
    a.status = "fertig";
    a.geaendertAm = new Date().toISOString();
    const ok = await statusGewechselt(a);
    // Konnte nicht gespeichert werden, ist nichts Bleibendes passiert — Status
    // zurück. Der Fehlerhinweis steht bereits am Speicherhinweis; ein „fertig“,
    // das nur im Browser existiert, wäre schlimmer als gar keins.
    if (!ok) a.status = vorher;
    fuelleFormular(a);
    renderListen();
  } finally {
    b.disabled = false;
    b.textContent = beschriftung;
  }
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
    // ⚠️ Zweiter Riegel neben dem `disabled` aus setzeSchreibschutz(), und er
    // muss VOR uebernehmeFeld() stehen: das schreibt den Wert sofort in den
    // Datensatz. Stünde die Prüfung dahinter, wäre der Status lokal schon
    // verfälscht — nicht gespeichert und nicht gemeldet, aber der nächste
    // beliebige Feld-Edit nähme ihn per Autosave mit.
    // (Direkt am Element, nicht über setV — das ist eine LOKALE Konstante in
    // fuelleFormular und hier nicht im Scope.)
    if (ev.target.id === "f-status" && !canAdmin()) { ev.target.value = a.status; return; }
    if (!uebernehmeFeld(a, ev.target)) return;
    a.geaendertAm = new Date().toISOString();
    if (ev.target.id === "f-status") {
      const pill = el("antrag-status-pill");
      pill.textContent = STATUS_LABELS[a.status] || a.status;
      pill.className = "status-pill status-" + a.status;
      zeigeFertigKnopf(a);
      // ⚠️ Genau hier wandert ein Antrag zwischen Arbeitsliste und Archiv. Ohne
      // das Neuzeichnen stünde er nach „genehmigt“ weiter unter den offenen und
      // fehlte im Archiv, bis jemand die Seite neu lädt.
      renderListen();
      // statusGewechselt() speichert selbst (sofort statt debounced) und meldet
      // danach — deshalb hier KEIN zusätzliches scheduleSave().
      statusGewechselt(a);
      return;
    }
    scheduleSave();
    const nameTreffer = ev.target.id && ev.target.id.match(/^f-(leiter|vertreter)-name$/);
    if (nameTreffer) kontaktAutofill(a, nameTreffer[1]);
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

// Trägt nach dem Eintippen eines bekannten Trainer-Namens dessen Kontaktdaten
// aus den Trainerdaten in die noch LEEREN Felder der Rolle ein (Straße,
// PLZ/Ort, Telefon, E-Mail) — bereits Ausgefülltes wird nie überschrieben,
// abweichende Angaben je Veranstaltung bleiben also möglich. Reines
// Bequemlichkeits-Prefill: kein Treffer, kein Netz oder ein Worker ohne die
// Aktion heißt still "nichts tun". Serverseitig liefert
// raumnutzung-kontakt-lookup nur diese Kontaktfelder und nur an
// Raumnutzung-Bearbeiter, nie den vollen Trainerdaten-Datensatz.
async function kontaktAutofill(a, rolle) {
  const p = a[rolle];
  const name = (p.name || "").trim();
  // Ohne zwei Namensteile kann der Server nichts abgleichen; und sind alle
  // Zielfelder schon gefüllt (z.B. beim bloßen Korrigieren des Namens), gibt
  // es nichts zu tun — beides spart den Request.
  if (!name || !/[\s,]/.test(name)) return;
  const zieleLeer = !(p.anschrift[0] || "").trim() || !(p.anschrift[1] || "").trim()
    || !(p.telefon || "").trim() || !(p.email || "").trim();
  if (!zieleLeer) return;

  const antragId = a.id;
  let res;
  try {
    res = await gatewayRequest({ action: "raumnutzung-kontakt-lookup", name });
  } catch (_) { return; }
  const t = res && res.treffer;
  if (!t) return;
  // Nach dem await kann die Person längst den Antrag gewechselt haben (gleiche
  // Falle wie bei zeigeUnterschrift) — dann nichts mehr anfassen.
  if (currentAntragId !== antragId || !canEdit()) return;

  const zeile2 = [t.plz, t.ort].filter(Boolean).join(" ");
  let geaendert = false;
  if (!(p.anschrift[0] || "").trim() && t.strasse) { p.anschrift[0] = t.strasse; geaendert = true; }
  if (!(p.anschrift[1] || "").trim() && zeile2) { p.anschrift[1] = zeile2; geaendert = true; }
  if (!(p.telefon || "").trim() && t.telefon) { p.telefon = t.telefon; geaendert = true; }
  if (!(p.email || "").trim() && t.email) { p.email = t.email; geaendert = true; }
  if (!geaendert) return;

  const setV = (id, v) => { const e = el(id); if (e) e.value = v; };
  setV(`f-${rolle}-anschrift-0`, p.anschrift[0]);
  setV(`f-${rolle}-anschrift-1`, p.anschrift[1]);
  setV(`f-${rolle}-telefon`, p.telefon);
  setV(`f-${rolle}-email`, p.email);
  a.geaendertAm = new Date().toISOString();
  scheduleSave();
  setSaveHint("Kontaktdaten aus den Trainerdaten übernommen — wird gespeichert…");
}

// ---------------------------------------------------------------------------
// Unterschrift
// ---------------------------------------------------------------------------
let sigZeichnet = false;
let sigCtx = null;
// Ein Upload der Unterschrift ist beim letzten Speichern gescheitert (siehe
// lagereUnterschriftenAus). Steuert nur den Hinweistext, die Daten selbst
// liegen dann inline in der JSON.
let unterschriftUploadOffen = false;

function initUnterschrift() {
  const canvas = el("sig-canvas");
  sigCtx = canvas.getContext("2d");
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  sigCtx.strokeStyle = "#12233f";

  // Bildschirm- in Bitmap-Koordinaten: die Fläche wird per CSS skaliert (auf dem
  // Handy schmaler als 600 px), die Bitmap bleibt fest 600x180.
  const punkt = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (canvas.width / r.width),
      y: (clientY - r.top) * (canvas.height / r.height)
    };
  };

  // Die eigentliche Zeichenlogik, unabhängig von der Event-Quelle — darunter
  // liegen zwei Sätze Handler (siehe unten).
  const beginne = (clientX, clientY) => {
    if (!canEdit()) return;
    sigZeichnet = true;
    const p = punkt(clientX, clientY);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
    el("sig-hint").style.display = "none";
  };

  const ziehe = (clientX, clientY) => {
    if (!sigZeichnet) return;
    const p = punkt(clientX, clientY);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
  };

  const beenden = () => {
    if (!sigZeichnet) return;
    sigZeichnet = false;
    uebernehmeUnterschrift();
  };

  if (window.PointerEvent) {
    // Der Normalfall: Pointer-Events decken Maus, Finger und Stift in einem Satz
    // Handler ab.
    canvas.addEventListener("pointerdown", (ev) => {
      if (!canEdit()) return;
      // Capture hält den Strich am Canvas, auch wenn der Finger über den Rand
      // hinauswandert. Ältere WebKit-Versionen werfen hier — dann eben ohne
      // Capture, gezeichnet wird trotzdem. Vorher riss ein Wurf an dieser Stelle
      // den ganzen Handler ab und es kam überhaupt kein Strich zustande.
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
      beginne(ev.clientX, ev.clientY);
      ev.preventDefault();
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!sigZeichnet) return;
      ziehe(ev.clientX, ev.clientY);
      ev.preventDefault();
    });
    canvas.addEventListener("pointerup", beenden);
    canvas.addEventListener("pointercancel", beenden);
    canvas.addEventListener("pointerleave", beenden);
  } else {
    // iOS bis einschließlich 12 kennt keine Pointer-Events (die kamen mit
    // Safari 13). Die App selbst läuft dort — sie benutzt weder ?. noch ?? —,
    // die Unterschriftsfläche wäre ohne diesen Zweig aber vollständig tot: Seite
    // öffnet, Formular ausfüllbar, nur unterschreiben geht nicht.
    // passive:false, weil preventDefault sonst wirkungslos ist und Safari die
    // Geste als Scrollen wegnimmt.
    canvas.addEventListener("touchstart", (ev) => {
      const t = ev.changedTouches[0];
      if (!t) return;
      beginne(t.clientX, t.clientY);
      if (sigZeichnet) ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchmove", (ev) => {
      const t = ev.changedTouches[0];
      if (!t || !sigZeichnet) return;
      ziehe(t.clientX, t.clientY);
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchend", beenden);
    canvas.addEventListener("touchcancel", beenden);
    // Dazu die Maus, für alte Desktop-Browser ohne Pointer-Events.
    canvas.addEventListener("mousedown", (ev) => { beginne(ev.clientX, ev.clientY); });
    canvas.addEventListener("mousemove", (ev) => { ziehe(ev.clientX, ev.clientY); });
    window.addEventListener("mouseup", beenden);
  }

  el("btn-sig-clear").addEventListener("click", loescheUnterschrift);
}

// Schreibt den aktuellen Canvas-Inhalt in den Datensatz. Die Auslagerung in eine
// eigene Datei passiert erst beim Speichern (siehe lagereUnterschriftAus).
function uebernehmeUnterschrift() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  const png = zugeschnittenesPng();
  if (!png) return;
  a.unterschrift = png;
  a.unterschriebenAm = new Date().toISOString();
  a.geaendertAm = a.unterschriebenAm;
  setUnterschriftStatus(a);
  scheduleSave();
}

// Schneidet die Zeichenfläche auf den tatsächlich beschriebenen Bereich zu.
// Ohne das wandert die ganze 600x180-Fläche ins PDF und die Unterschrift wird
// beim Einpassen in die Formularzeile winzig — der weiße Rand bestimmt sonst
// die Skalierung. Liefert null, wenn nichts gezeichnet wurde.
function zugeschnittenesPng() {
  const canvas = el("sig-canvas");
  const w = canvas.width;
  const h = canvas.height;
  const daten = sigCtx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (daten[(y * w + x) * 4 + 3] > 10) { // Alpha-Kanal: gezeichnet?
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // leer

  const rand = 6;
  minX = Math.max(0, minX - rand); minY = Math.max(0, minY - rand);
  maxX = Math.min(w - 1, maxX + rand); maxY = Math.min(h - 1, maxY + rand);

  const aus = document.createElement("canvas");
  aus.width = maxX - minX + 1;
  aus.height = maxY - minY + 1;
  aus.getContext("2d").drawImage(canvas, minX, minY, aus.width, aus.height,
                                 0, 0, aus.width, aus.height);
  return aus.toDataURL("image/png");
}

function loescheUnterschrift() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  leereCanvas();
  const alteId = a.unterschriftFileId;
  a.unterschrift = "";
  a.unterschriftFileId = "";
  a.unterschriebenAm = "";
  a.geaendertAm = new Date().toISOString();
  setUnterschriftStatus(a);
  // Die ausgelagerte Datei mitnehmen — sonst bleiben Bild-Leichen in der Cloud.
  // Scheitert das, ist nur eine verwaiste Datei die Folge, kein Datenverlust.
  if (alteId) gatewayFileDelete(alteId).catch(() => {});
  scheduleSave();
}

function leereCanvas() {
  const canvas = el("sig-canvas");
  if (sigCtx) sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  const hint = el("sig-hint");
  if (hint) hint.style.display = "";
}

function setUnterschriftStatus(a) {
  const s = el("sig-status");
  if (!s) return;
  s.className = "save-hint";
  // Ohne Bearbeiten-Recht ist die Fläche gesperrt. Den Grund direkt daneben
  // schreiben: der allgemeine „Nur Lesezugriff“-Hinweis steht ganz woanders auf
  // der Seite, auf dem Handy sieht man an der grauen Fläche sonst nur, DASS es
  // nicht geht, und nicht warum.
  if (!canEdit()) {
    s.textContent = "Unterschreiben ist nur mit Bearbeiten-Recht möglich.";
    return;
  }
  if (a.unterschrift || a.unterschriftFileId) {
    s.textContent = a.unterschriebenAm
      ? "Unterschrieben am " + kurzDatum(a.unterschriebenAm)
      : "Unterschrift vorhanden";
    // Inline + gescheiterter Upload: die Unterschrift ist in der JSON gesichert,
    // aber noch nicht als Datei in der Cloud. Sichtbar machen statt schweigen.
    if (unterschriftUploadOffen && a.unterschrift) {
      s.textContent += " — Bild noch nicht hochgeladen, wird erneut versucht";
      s.className = "save-hint error";
    }
  } else {
    s.textContent = "Noch nicht unterschrieben";
  }
}

// Zeichnet eine gespeicherte Unterschrift zurück auf die Fläche.
async function zeigeUnterschrift(a) {
  leereCanvas();
  setUnterschriftStatus(a);
  let dataUrl = a.unterschrift;
  if (!dataUrl && a.unterschriftFileId) {
    dataUrl = await gatewayFileGetDataUrl(a.unterschriftFileId).catch(() => "");
  }
  if (!dataUrl) return;
  // Der Antrag kann inzwischen gewechselt haben — sonst landet die Unterschrift
  // des einen Antrags auf der Fläche eines anderen.
  if (currentAntragId !== a.id) return;
  const canvas = el("sig-canvas");
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Der Wechsel-Check von oben noch einmal: zwischen dem Setzen von
      // img.src und diesem onload liegt ein Task — wechselt der Antrag genau
      // dann, landete die Unterschrift des alten auf der (frisch geleerten)
      // Fläche des neuen und würde beim nächsten Strich dort mitgespeichert.
      if (currentAntragId !== a.id) { resolve(); return; }
      // Das gespeicherte Bild ist zugeschnitten und hat ein anderes
      // Seitenverhältnis als die Fläche — proportional einpassen statt
      // strecken, sonst sieht die eigene Unterschrift beim Wiederöffnen
      // verzerrt aus.
      const skala = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
      sigCtx.drawImage(img, 8, 8, img.width * skala, img.height * skala);
      el("sig-hint").style.display = "none";
      resolve();
    };
    img.onerror = resolve;
    img.src = dataUrl;
  });
}

// Lagert eine frisch gezeichnete Unterschrift in eine eigene Gateway-Datei aus,
// bevor die JSON gespeichert wird. Schlägt der Upload fehl, bleibt sie inline
// in der JSON — alter Zustand, kein Datenverlust, nächster Versuch beim
// nächsten Speichern.
async function lagereUnterschriftenAus() {
  unterschriftUploadOffen = false;
  for (const a of appData.antraege) {
    if (!a.unterschrift || !/^data:image\/png;base64,/.test(a.unterschrift)) continue;
    // ALLES in den try: nicht nur der Upload kann scheitern, auch das Erzeugen
    // der Id. Fliegt hier etwas heraus, bricht der ganze doSave() ab und der
    // Antrag wird überhaupt nicht mehr gespeichert — die Unterschrift bleibt ja
    // inline und der nächste Versuch läuft in denselben Fehler.
    try {
      // Stabile Id je Antrag: überschreiben statt bei jedem Strich eine neue Datei.
      const fileId = a.unterschriftFileId || neueDateiId();
      const base64 = a.unterschrift.split(",")[1] || "";
      await gatewayFilePut(fileId, "unterschrift.png", base64);
      a.unterschriftFileId = fileId;
      a.unterschrift = "";
    } catch (_) {
      // Bleibt inline in der JSON — kein Datenverlust, nächster Versuch beim
      // nächsten Speichern. Früher schluckte dieser catch den Fehler spurlos:
      // die App meldete „Gespeichert“, während die Unterschrift nie in der
      // Cloud ankam. Bei einer Rückfrage aus der Ferne sah man dann nichts.
      unterschriftUploadOffen = true;
    }
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
  renderListen();
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
  kopie.erstelltVonName = aktuellerKlarname();
  kopie.bezeichnung = (a.bezeichnung || "Antrag") + " (Kopie)";
  // Termine bewusst leeren: eine Kopie ist eine neue Veranstaltung, und ein
  // versehentlich übernommenes Datum wäre im Antrag ans Amt schwer zu bemerken.
  kopie.veranstaltung = { datum: "", einlass: "", beginn: "", ende: "" };
  kopie.aufbau = { datum: "", beginn: "", ende: "" };
  kopie.abbau = { datum: "", beginn: "", ende: "" };
  kopie.ortDatum = heuteOrtDatum();
  // Die Unterschrift wird NIE mitkopiert: Sie bestätigt die Richtigkeit genau
  // dieser Angaben. Auf einer Kopie mit anderem Termin wäre sie eine Fälschung.
  kopie.unterschrift = "";
  kopie.unterschriftFileId = "";
  kopie.unterschriebenAm = "";
  appData.antraege.push(kopie);
  renderListen();
  oeffneAntrag(kopie.id);
  scheduleSave();
}

function loescheAntrag() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  const name = a.bezeichnung || "diesen Antrag";
  if (!confirm(`„${name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
  // Ausgelagerte Unterschrift mitnehmen, sonst bleibt sie als verwaiste Datei
  // in der Cloud liegen.
  if (a.unterschriftFileId) gatewayFileDelete(a.unterschriftFileId).catch(() => {});
  appData.antraege = appData.antraege.filter((x) => x.id !== a.id);
  currentAntragId = null;
  el("nav-antrag").style.display = "none";
  renderListen();
  switchTab(aktiveListe);
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
    // Die Unterschrift kann bereits ausgelagert sein — dann liegt im Datensatz
    // nur die Datei-Id und das Bild muss fürs PDF erst geholt werden.
    let unterschrift = a.unterschrift;
    if (!unterschrift && a.unterschriftFileId) {
      unterschrift = await gatewayFileGetDataUrl(a.unterschriftFileId).catch(() => "");
    }
    const { blob, fehler } = await erzeugeAntragsPdf(a, unterschrift);
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

// ---------------------------------------------------------------------------
// Sammelexport: jeder angezeigte Antrag als eigenes PDF, alle in einem ZIP
// ---------------------------------------------------------------------------
// JSZip steht bewusst NICHT fest im <head>: gebraucht wird es nur hier, und den
// Weg geht ohnehin nur die Handvoll Leute mit Administrieren-Recht. Erster
// Bedarf lädt nach, jeder weitere Aufruf bekommt dieselbe Promise (gleiches
// Muster wie fotoauftraege und digitaler-stempel).
let jsZipLadevorgang = null;
function ladeJsZip() {
  if (jsZipLadevorgang) return jsZipLadevorgang;
  jsZipLadevorgang = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    s.onload = () => resolve();
    s.onerror = () => {
      jsZipLadevorgang = null; // nächster Versuch darf es erneut probieren
      reject(new Error("ZIP-Bibliothek konnte nicht geladen werden (Internetverbindung nötig)."));
    };
    document.head.appendChild(s);
  });
  return jsZipLadevorgang;
}

// Zwei Anträge mit gleicher Bezeichnung UND gleichem Datum ergeben denselben
// Dateinamen — im ZIP würde der zweite den ersten überschreiben und im Archiv
// fehlte ein Antrag, ohne dass es auffiele.
function eindeutigerDateiname(name, vergeben) {
  if (!vergeben.has(name)) { vergeben.add(name); return name; }
  const basis = name.replace(/\.pdf$/i, "");
  let i = 2;
  while (vergeben.has(`${basis}_${i}.pdf`)) i++;
  const neu = `${basis}_${i}.pdf`;
  vergeben.add(neu);
  return neu;
}

async function exportiereAllePdfs() {
  // Anzeige-Seite eines serverseitig nicht erzwingbaren Rechts: Die Daten sind
  // beim Klick längst im Browser. Das Gate hält die Funktion aus der Oberfläche
  // heraus, es ersetzt nicht die Sichtbarkeitsschranke des Gateways.
  if (!canAdmin() || exportLaeuft) return;
  const liste = sichtbareAntraege();
  if (!liste.length) return;

  // Seit der Aufteilung in Arbeitsliste und Archiv packt der Knopf immer nur die
  // Liste, in der er steht. Beides muss im Hinweis stehen: der gesetzte Filter
  // UND die andere Liste — sonst hält man das ZIP für „alles“.
  const imArchiv = aktiveListe === "archiv";
  const filter = imArchiv ? archivFilter : currentFilter;
  const andereListe = imArchiv
    ? appData.antraege.filter((a) => !istArchiviert(a)).length
    : appData.antraege.filter(istArchiviert).length;
  const filterHinweis = filter === "alle"
    ? ""
    : `\n\nDer Status-Filter steht auf „${STATUS_LABELS[filter] || filter}“ — `
      + "andere Anträge dieser Liste sind nicht dabei.";
  const listenHinweis = andereListe
    ? `\n\n${andereListe} ${andereListe === 1 ? "Antrag" : "Anträge"} `
      + (imArchiv ? "aus der Arbeitsliste" : "im Archiv") + " sind nicht dabei."
    : "";
  if (!confirm(`${liste.length} ${liste.length === 1 ? "Antrag" : "Anträge"} als einzelne PDFs `
    + `in ein ZIP-Archiv packen?${filterHinweis}${listenHinweis}\n\n`
    + "Die Dateien enthalten Anschriften und Telefonnummern der Veranstaltungsleitung.")) return;

  const btn = el(imArchiv ? "btn-alle-pdfs-archiv" : "btn-alle-pdfs");
  const originalText = btn.textContent;
  exportLaeuft = true;
  btn.disabled = true;
  const probleme = [];
  try {
    btn.textContent = "ZIP-Bibliothek wird geladen…";
    await ladeJsZip();
    flushSave();

    const zip = new JSZip();
    const vergeben = new Set();
    for (let i = 0; i < liste.length; i++) {
      const a = liste[i];
      btn.textContent = `PDF ${i + 1} von ${liste.length}…`;
      const titel = a.bezeichnung || "(ohne Bezeichnung)";
      try {
        // Wie beim Einzelexport: ist die Unterschrift schon ausgelagert, steht
        // im Datensatz nur die Datei-Id und das Bild muss erst geholt werden.
        let unterschrift = a.unterschrift;
        if (!unterschrift && a.unterschriftFileId) {
          unterschrift = await gatewayFileGetDataUrl(a.unterschriftFileId).catch(() => "");
        }
        const { blob, fehler } = await erzeugeAntragsPdf(a, unterschrift);
        zip.file(eindeutigerDateiname(pdfDateiname(a), vergeben), blob);
        fehler.forEach((f) => probleme.push(`${titel}: ${f}`));
      } catch (e) {
        // Ein einzelner Antrag darf den Stapel nicht kippen — dieselbe Haltung
        // wie bei setzeText/setzeHaken innerhalb eines PDFs.
        probleme.push(`${titel}: konnte nicht erzeugt werden (${e.message})`);
      }
    }

    if (!vergeben.size) {
      alert("Es konnte kein einziges PDF erzeugt werden:\n\n• " + probleme.join("\n• "));
      return;
    }
    btn.textContent = "Archiv wird gepackt…";
    const zipBlob = await zip.generateAsync({ type: "blob" });
    ladeHerunter(zipBlob, zipDateiname(vergeben.size));
    if (probleme.length) {
      alert(`Das Archiv enthält ${vergeben.size} von ${liste.length} Anträgen. `
        + "Dabei sind Hinweise aufgetreten:\n\n• " + probleme.join("\n• "));
    }
  } catch (e) {
    alert("Der Sammelexport ist fehlgeschlagen: " + e.message);
  } finally {
    exportLaeuft = false;
    btn.disabled = false;
    btn.textContent = originalText;
    // Der Filter kann sich während des Laufs geändert haben, dann stimmt die
    // Zahl in originalText nicht mehr.
    aktualisiereExportKnopf(imArchiv ? "btn-alle-pdfs-archiv" : "btn-alle-pdfs", sichtbareAntraege().length);
  }
}

function zipDateiname(anzahl) {
  const heute = new Date();
  const iso = [
    heute.getFullYear(),
    String(heute.getMonth() + 1).padStart(2, "0"),
    String(heute.getDate()).padStart(2, "0")
  ].join("-");
  return `Raumnutzung_Antraege_${anzahl}_${iso}.zip`;
}

// Erzeugt dasselbe PDF wie erzeugePdf() und schickt es über den Gateway ans Amt.
// Empfänger, CC, Betreff und Mailtext stehen bewusst NUR im Worker
// (RAUMNUTZUNG_MAIL_*, siehe handleRaumnutzungMailAntrag): Käme die Zieladresse
// von hier, wäre die offene Worker-URL für jeden Bearbeiter ein Versandweg an
// beliebige Empfänger — abgeschickt unter dem Absender des Vereins.
async function sendePerMail() {
  const a = findeAntrag(currentAntragId);
  if (!a || !canEdit()) return;
  const bezeichnung = (a.bezeichnung || "").trim() || "ohne Bezeichnung";
  if (!confirm("Den Antrag „" + bezeichnung + "“ jetzt als PDF an das Schulverwaltungsamt senden?\n\n"
    + "Eine Kopie geht an die Geschäftsstelle.")) return;

  const btn = el("btn-mail");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Wird gesendet…";
  try {
    flushSave();
    // Wie in erzeugePdf: die Unterschrift kann bereits ausgelagert sein und muss
    // fürs PDF erst geholt werden.
    let unterschrift = a.unterschrift;
    if (!unterschrift && a.unterschriftFileId) {
      unterschrift = await gatewayFileGetDataUrl(a.unterschriftFileId).catch(() => "");
    }
    const { blob, fehler } = await erzeugeAntragsPdf(a, unterschrift);
    const res = await gatewayRequest({
      action: "raumnutzung-mail-antrag",
      pdfBase64: await blobZuBase64(blob),
      dateiname: pdfDateiname(a)
    });
    let text = "Der Antrag wurde an " + ((res && res.to) || "das Amt") + " gesendet";
    text += (res && res.cc) ? ",\nin Kopie an " + res.cc + "." : ".";
    if (fehler.length) {
      text += "\n\nBeim Erzeugen des PDFs gab es Hinweise:\n• " + fehler.join("\n• ");
    }
    alert(text);
    setSaveHint("Antrag per E-Mail versendet.");
  } catch (e) {
    alert("Der Antrag konnte nicht versendet werden: " + e.message
      + "\n\nDas PDF lässt sich weiterhin über „Amtliches PDF erzeugen“ herunterladen"
      + " und von Hand verschicken.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Blob -> reines base64 ohne den data:-Präfix, so wie der Worker den Anhang
// erwartet. Über FileReader statt btoa(String.fromCharCode(...bytes)): Der
// Spread-Weg reicht bei einem mehrere hundert Kilobyte großen PDF
// Hunderttausende Argumente an fromCharCode und sprengt den Aufruf-Stack.
function blobZuBase64(blob) {
  return new Promise((resolve, reject) => {
    const leser = new FileReader();
    leser.onload = () => {
      const s = String(leser.result || "");
      const komma = s.indexOf(",");
      if (komma < 0) { reject(new Error("PDF konnte nicht kodiert werden")); return; }
      resolve(s.slice(komma + 1));
    };
    leser.onerror = () => reject(new Error("PDF konnte nicht gelesen werden"));
    leser.readAsDataURL(blob);
  });
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
  // Der offene Reiter bestimmt, welche Liste der Sammelexport packt.
  if (name === "uebersicht" || name === "archiv") aktiveListe = name;
  if (name === "uebersicht") renderUebersicht();
  if (name === "archiv") renderArchiv();
  if (name === "einstellungen") renderEinstellungen();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Einstellungen: wer wird über fertige Anträge benachrichtigt
// ---------------------------------------------------------------------------
// Lazy geladen und für die Sitzung gemerkt — nur mit Administrieren-Recht kommt
// man überhaupt in den Reiter, der Aufruf lohnt sich beim App-Start nicht.
let entscheiderDirectory = null;

// Gewählter Verteiler. Leer = alle Berechtigten (die Entscheidung dazu fällt im
// Worker, hier steht nur der Wert).
function pushEmpfaengerListe(data) {
  const v = data && data.einstellungen ? data.einstellungen.pushEmpfaenger : null;
  return Array.isArray(v) ? v : [];
}

async function ensureEntscheiderDirectory() {
  if (entscheiderDirectory) return entscheiderDirectory;
  try {
    const res = await fetchToolEditors();
    const users = Array.isArray(res.users) ? res.users : [];
    entscheiderDirectory = users.slice().sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username, "de"));
  } catch (e) {
    entscheiderDirectory = [];
  }
  return entscheiderDirectory;
}

function pushEmpfaengerRowHtml(user) {
  const gewaehlt = pushEmpfaengerListe(appData).indexOf(user.username) !== -1;
  return `
    <div class="tz-row" data-username="${escapeHtml(user.username)}">
      <label class="pe-checkbox"><input type="checkbox" class="push-empf" ${gewaehlt ? "checked" : ""} /> ${escapeHtml(user.displayName || user.username)}</label>
    </div>`;
}

async function renderEinstellungen() {
  const ziel = el("push-empfaenger-list");
  if (!ziel) return;
  ziel.innerHTML = `<p class="muted">Lade Liste…</p>`;
  const users = await ensureEntscheiderDirectory();
  ziel.innerHTML = users.length
    ? users.map(pushEmpfaengerRowHtml).join("")
    : `<p class="muted">Es ist niemand hinterlegt, der Anträge einreichen darf. Die Gruppen dafür werden in der Tools-Übersicht vergeben.</p>`;
  renderPushEmpfaengerHinweis();
}

// Sagt an, was der Häkchenstand bedeutet — vor allem den Fall „nichts angehakt“,
// der eben NICHT „niemand“ heißt. Ohne den Satz liest sich eine leere Liste wie
// ein abgeschalteter Versand.
function renderPushEmpfaengerHinweis() {
  const elH = el("push-empfaenger-hinweis");
  if (!elH) return;
  const gesamt = document.querySelectorAll("#push-empfaenger-list .tz-row").length;
  const gewaehlt = document.querySelectorAll("#push-empfaenger-list .push-empf:checked").length;
  if (!gesamt) { elH.style.display = "none"; return; }
  // Gespeicherte Namen, die niemand mehr einreichen darf, stehen nicht mehr in
  // der Liste und verschwänden hier lautlos. Der Totalausfall ist im Worker
  // abgefangen (bleibt niemand übrig, gehen die Meldungen wieder an alle) —
  // sichtbar muss es trotzdem sein, sonst schrumpft der Verteiler unbemerkt.
  const bekannt = (entscheiderDirectory || []).map((u) => u.username);
  const verwaist = pushEmpfaengerListe(appData).filter((n) => bekannt.indexOf(n) === -1);
  elH.style.display = "block";
  let text = gewaehlt
    ? `Es werden ${gewaehlt} von ${gesamt} benachrichtigt.`
    : `Nichts angehakt — es werden alle ${gesamt} benachrichtigt.`;
  if (verwaist.length) {
    text += ` Achtung: ${verwaist.join(", ")} war ausgewählt, darf aber keine Anträge mehr einreichen und bekommt nichts mehr. Beim nächsten Speichern fällt der Eintrag weg.`;
  }
  elH.textContent = text;
}

function showEinstellungenStatus(msg, isError) {
  const s = el("einstellungen-status");
  if (!s) return;
  s.style.display = msg ? "block" : "none";
  s.textContent = msg || "";
  s.style.color = isError ? "var(--red)" : "var(--green)";
}

async function saveEinstellungen() {
  if (!canAdmin()) return;
  showEinstellungenStatus("");
  const rows = Array.from(document.querySelectorAll("#push-empfaenger-list .tz-row"));
  // Keine Zeilen ⇒ Liste war nicht geladen ⇒ nichts überschreiben, statt den
  // gespeicherten Verteiler versehentlich zu leeren.
  if (!rows.length) { showEinstellungenStatus("Die Liste ist noch nicht geladen.", true); return; }
  const gewaehlt = rows
    .filter((r) => r.querySelector(".push-empf").checked)
    .map((r) => r.dataset.username);
  const btn = el("btn-save-einstellungen");
  btn.disabled = true;
  try {
    appData.einstellungen.pushEmpfaenger = gewaehlt;
    const ok = await speichereSofort();
    showEinstellungenStatus(ok ? "Gespeichert ✓" : "Nicht gespeichert — siehe Hinweis oben.", !ok);
    if (ok) renderPushEmpfaengerHinweis();
  } finally {
    btn.disabled = false;
  }
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
  [el("version-badge-2")].forEach((b) => {
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
  initUnterschrift();
  el("orte-liste").innerHTML = ORTE.map((o) => `<option value="${escapeHtml(o)}"></option>`).join("");

  try {
    // Erst laden, dann fetchMe(): dav-load liefert das "me" gratis mit, der
    // zweite Aufruf kommt damit ohne eigenen Request aus. Andersherum waeren es
    // zwei Roundtrips.
    appData = normalizeData(await gatewayLoad());
    currentUser = await fetchMe();
  } catch (e) {
    showConnectScreen(e instanceof NotLoggedInError ? null : e.message);
    return;
  }

  el("connect-screen").style.display = "none";
  el("app-shell").style.display = "";
  el("header-user").textContent = aktuellerKlarname() || currentUser.username || "";

  renderListen();
  setzeSchreibschutz();

  // --- Ereignisse ---
  document.querySelectorAll("nav button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });
  el("btn-neuer-antrag").addEventListener("click", neuerAntrag);
  el("btn-alle-pdfs").addEventListener("click", exportiereAllePdfs);
  // Zurück dorthin, wo der Antrag herkam: wer ihn im Archiv angeklickt hat, will
  // nicht in der Arbeitsliste landen. aktiveListe bleibt beim Öffnen stehen,
  // weil switchTab("antrag") sie nicht anfasst.
  el("btn-zurueck").addEventListener("click", () => switchTab(aktiveListe));
  el("btn-pdf").addEventListener("click", erzeugePdf);
  el("btn-mail").addEventListener("click", sendePerMail);
  el("btn-fertig").addEventListener("click", meldeFertig);
  el("btn-kopieren").addEventListener("click", kopiereAntrag);
  el("btn-loeschen").addEventListener("click", loescheAntrag);
  el("btn-save-einstellungen").addEventListener("click", saveEinstellungen);
  el("push-empfaenger-list").addEventListener("change", (ev) => {
    if (ev.target.closest(".push-empf")) renderPushEmpfaengerHinweis();
  });
  el("uebersicht-status-filter").addEventListener("change", (ev) => {
    currentFilter = ev.target.value;
    renderUebersicht();
  });
  el("archiv-status-filter").addEventListener("change", (ev) => {
    archivFilter = ev.target.value;
    renderArchiv();
  });
  el("archiv-rows").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (btn) oeffneAntrag(btn.dataset.open);
  });
  el("btn-alle-pdfs-archiv").addEventListener("click", exportiereAllePdfs);
  el("uebersicht-rows").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (btn) oeffneAntrag(btn.dataset.open);
  });
  bindeFormular();

  // Letzten Autosave beim Schließen/Wegschalten noch loswerden.
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}

boot();
