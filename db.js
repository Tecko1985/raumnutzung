// Persistenz über das zentrale ToolsUebersicht-Login-Gateway.
// Adaptiert aus E:\materialbedarf\db.js (gleiches Gateway-Muster).
const GATEWAY_URL = "https://landingpage.michel-brunner.workers.dev";
const TOKEN_STORAGE_KEY = "tu_session_token";
const GATEWAY_APP_ID = "raumnutzung";

class NotLoggedInError extends Error {
  constructor(message) {
    super(message || "Nicht angemeldet");
    this.name = "NotLoggedInError";
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message || "Daten wurden zwischenzeitlich von einem anderen Gerät geändert");
    this.name = "ConflictError";
  }
}

// ETag des zuletzt geladenen/geschriebenen Stands. Wird bei dav-save mitgeschickt,
// damit der Worker Konflikte (anderes Gerät hat inzwischen gespeichert) erkennt.
let gatewayRev = null;

function getSessionToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch (_) { return null; }
}

async function gatewayRequest(payload) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload)
  });
  if (resp.status === 401) throw new NotLoggedInError("Sitzung abgelaufen");
  if (resp.status === 403) throw new Error("Kein Zugriff auf dieses Tool.");
  if (resp.status === 409) throw new ConflictError();
  if (!resp.ok) throw new Error(`Gateway-Fehler (HTTP ${resp.status})`);
  return resp.json();
}

// Das "me" aus der letzten dav-load-Antwort. Der Worker legt es bei, weil er
// nutzer.json und die Rechte-Datei fuer diesen Request ohnehin gelesen hat --
// der erste fetchMe() nach dem Laden kommt damit ohne eigenen Roundtrip aus.
let gatewayMe = null;

async function gatewayLoad() {
  const body = await gatewayRequest({ action: "dav-load", app: GATEWAY_APP_ID });
  gatewayRev = typeof body.rev === "string" ? body.rev : null;
  gatewayMe = (body.me && typeof body.me === "object") ? body.me : null;
  return body.data; // Objekt oder null (Datei noch nicht vorhanden)
}

async function gatewaySave(dataObj) {
  const payload = { action: "dav-save", app: GATEWAY_APP_ID, data: dataObj };
  if (gatewayRev) payload.rev = gatewayRev;
  const body = await gatewayRequest(payload);
  gatewayRev = typeof body.rev === "string" ? body.rev : null;
}

// Liefert {username, isAdmin, groupIds, vorname, nachname, mannschaften, canEdit} der eingeloggten Person.
async function fetchMe() {
  // Genau EINMAL aus dem letzten dav-load bedienen, danach wieder echt fragen:
  // ein spaeterer Aufruf will den aktuellen Stand (etwa nach einem Rechte-
  // wechsel), nicht eine beliebig alte Kopie. Faellt von selbst auf den Request
  // zurueck, wenn der Worker das Feld noch nicht mitschickt.
  if (gatewayMe) { const me = gatewayMe; gatewayMe = null; return me; }
  return gatewayRequest({ action: "me", app: GATEWAY_APP_ID });
}

// Unterschriften liegen als eigene PNG-Dateien im dateien/-Ordner der App statt
// als base64-DataURL inline in der JSON. Sonst wüchse die Gesamtdatei mit jedem
// Antrag um mehrere Zehn-KB und jedes Speichern übertrüge alle Unterschriften
// erneut (gleiches Muster wie TrainerCheckliste und Trainerdaten).
async function gatewayFilePut(id, name, dataBase64) {
  return gatewayRequest({
    action: "dav-file-put", app: GATEWAY_APP_ID, id, name,
    contentType: "image/png", dataBase64
  });
}

async function gatewayFileDelete(id) {
  return gatewayRequest({ action: "dav-file-delete", app: GATEWAY_APP_ID, id });
}

// Holt eine ausgelagerte Unterschrift und liefert sie als PNG-DataURL ("" bei 404/Fehler).
async function gatewayFileGetDataUrl(id) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  let resp;
  try {
    resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ action: "dav-file-get", app: GATEWAY_APP_ID, id })
    });
  } catch (_) { return ""; }
  if (!resp.ok) return "";
  const blob = await resp.blob();
  if (!blob.size) return "";
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => resolve("");
    fr.readAsDataURL(blob);
  });
}
