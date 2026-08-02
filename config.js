const APP_VERSION = "1.0";

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Antrag erfassen",
        items: [
          "Das Formular „Raumnutzung für Veranstaltungen“ des Landkreises Eichsfeld wird vollständig digital erfasst — alle neun Abschnitte vom Veranstaltungsort bis zu den Bühnenflächen.",
          "Teilnehmerzahlen werden von selbst summiert.",
          "Ein neuer Antrag ist bereits so vorbelegt wie das zuletzt eingereichte Formular: Beheizung und Bewirtung auf Ja, Schließdienst, Objekteinweisung, Objektabnahme, Abbau und Reinigung angehakt, alles Übrige auf Nein. Abweichungen hakt man einzeln um.",
          "Auch die wiederkehrenden Texte stehen schon drin — Speisen- und Getränkeangebot, Aufgaben des Hausmeisters und die Banner-Werbung der Sponsoren. Was nicht passt, wird überschrieben.",
          "Bei den Besuchern sind je 125 ortskundige und ortsfremde vorgetragen, der übliche Erfahrungswert.",
          "Anträge lassen sich als Entwurf speichern und später weiterbearbeiten; Eingaben werden laufend gesichert.",
          "Wer bei Veranstaltungsleitung oder Vertretung einen Namen einträgt, der in den Trainerdaten steht, bekommt Anschrift, Telefonnummer und E-Mail automatisch eingesetzt — aber nur in noch leere Felder. Bereits Ausgefülltes bleibt unangetastet, und vertauschte Vor- und Nachnamen werden toleriert."
        ]
      },
      {
        title: "Unterschreiben",
        items: [
          "Die Veranstaltungsleitung unterschreibt direkt in der App — mit Maus, Finger oder Stift.",
          "Die Unterschrift landet zusammen mit Ort und Datum an der richtigen Stelle im PDF.",
          "Der Unterschriftsblock der Schulleitung bleibt bewusst leer — den zeichnet die Schule selbst auf dem Ausdruck.",
          "Lässt sich das Unterschriftsbild nicht hochladen, etwa bei schlechter Verbindung, steht das neben der Fläche. Die Unterschrift geht dabei nicht verloren, sie wird beim nächsten Speichern erneut hochgeladen.",
          "Wer kein Bearbeiten-Recht hat, sieht den Grund direkt an der gesperrten Unterschriftsfläche."
        ]
      },
      {
        title: "Das amtliche Formular",
        items: [
          "Aus jedem Antrag entsteht auf Knopfdruck das ausgefüllte Original-Formular des Landkreises als PDF — genau das Blatt, das das Liegenschaftsamt erwartet.",
          "Das erzeugte PDF lässt sich in jedem PDF-Programm nachbearbeiten, falls das Amt Rückfragen hat.",
          "Mehrzeilige Texte wie die Aufgaben des Hausmeisters kommen mit ihren Zeilenumbrüchen sauber im Formular an."
        ]
      },
      {
        title: "Einreichen per E-Mail",
        items: [
          "„Per E-Mail senden“ erzeugt dasselbe ausgefüllte Original-PDF und schickt es direkt an das Schulverwaltungsamt des Landkreises. Eine Kopie geht an die Geschäftsstelle.",
          "Betreff und Anschreiben sind fest hinterlegt; es muss nichts angehängt oder getippt werden.",
          "Vor dem Versand wird nachgefragt, mit welchem Antrag gesendet wird. Danach steht in der Bestätigung, an welche Adressen die Mail ging.",
          "Lässt sich die Mail nicht zustellen, sagt die App das deutlich. Das PDF kann dann heruntergeladen und von Hand verschickt werden."
        ]
      },
      {
        title: "Sammelexport",
        items: [
          "Über der Antragsliste steht „Alle als PDF-ZIP“: daraus entsteht aus jedem angezeigten Antrag das ausgefüllte Original-PDF, gebündelt in einem Archiv — ein Download statt einer Datei je Antrag.",
          "Exportiert wird genau das, was die Liste gerade zeigt. Steht der Status-Filter auf „Eingereicht“, sind auch nur diese Anträge im Archiv. Der Knopf nennt die Anzahl, und vor dem Start wird nachgefragt.",
          "Lässt sich ein einzelner Antrag nicht erzeugen, laufen die übrigen trotzdem durch; die betroffenen werden am Ende aufgelistet."
        ]
      },
      {
        title: "Übersicht",
        items: [
          "Alle Anträge in einer Liste, sortiert nach Veranstaltungsdatum, mit Status Entwurf, Eingereicht, Genehmigt oder Abgelehnt.",
          "In der Liste steht die eingetragene Veranstaltungsleitung. Wer den Antrag angelegt hat, steht im Kopf des geöffneten Antrags.",
          "Ein bestehender Antrag lässt sich als Vorlage kopieren — wiederkehrende Veranstaltungen müssen nicht neu erfasst werden."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Das Werkzeug ist auf die berechtigte Gruppe beschränkt, weil das Formular private Anschriften und Telefonnummern enthält.",
          "Sehen: die Antragsliste und die Anträge, schreibgeschützt.",
          "Bearbeiten: Anträge anlegen, ausfüllen, kopieren und unterschreiben.",
          "Administrieren: alle drei Ausgabewege — das amtliche PDF erzeugen, per E-Mail einreichen und der Sammelexport.",
          "Die Arbeitsteilung dahinter: einen Antrag ausfüllen darf jeder Bearbeiter. Das fertige Formular ans Amt herausgeben ist Sache der Geschäftsstelle. Beschränkt ist das auch auf dem Server, nicht nur am ausgeblendeten Knopf — sonst ließe sich der Sammelexport umgehen, indem man die Anträge einzeln öffnet.",
          "Der Reiter „Info“ ist für alle sichtbar."
        ]
      },
      {
        title: "Bedienung am Handy",
        items: [
          "Die Reiterleiste bricht am Handy um, statt seitlich aus dem Bild zu laufen — auch die hinteren Reiter sind auf schmalen Bildschirmen erreichbar.",
          "Eingabefelder sind mindestens 16 Pixel groß, damit der iPhone-Browser beim Antippen nicht ungefragt in die Seite hineinzoomt und verschoben stehen bleibt.",
          "Unterschreiben funktioniert auch auf älteren iPhones und iPads. Zuvor reagierte die Fläche dort je nach iOS-Version gar nicht auf den Finger, oder die Unterschrift wurde nie gespeichert — im zweiten Fall speicherte die App danach auch die übrigen Angaben nicht mehr.",
          "Die Auswahl-Lupe von iOS bleibt beim Unterschreiben aus, sodass sie den Strich nicht abreißen lässt."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Gespeichert wird in der Vereins-Nextcloud über die zentrale Anmeldung der Tools-Übersicht — ein eigenes Passwort braucht es nicht."
        ]
      }
    ]
  }
];

// Auswahl für das Feld „Veranstaltungsort“. Freitext bleibt möglich.
const ORTE = [
  "Lorenz-Kellner-Halle",
  "Sporthalle Aegidienstraße",
  "Sportplatz Ernst-Thälmann-Straße",
  "Sonstiger Ort (siehe Eintrag)"
];

// Vorbelegung eines neuen Antrags, übernommen aus dem zuletzt beim
// Liegenschaftsamt eingereichten Formular (Nachwuchs-Fußballturnier in der
// Lorenz-Kellner-Halle). Das ist der Normalfall einer Hallenveranstaltung des
// Vereins — abweichende Punkte hakt man beim Ausfüllen einzeln um.
//
// EINE bewusste Abweichung vom Original: „Unterstützung durch technisches
// Personal“ steht hier auf **Ja**, im eingereichten Formular auf Nein. Dort war
// das ein Widerspruch — fünf angehakte Unterstützungsleistungen bei
// gleichzeitig „Nein“ auf die Frage, ob Unterstützung beantragt wird.
// User-Entscheidung vom 2026-07-22. Der Freitext darunter präzisiert, dass
// dafür kein Personal des Landkreises nötig ist, sondern der Hausmeister
// genügt. Nicht auf „Nein“ zurückdrehen.
const ANTRAG_VORBELEGUNG = {
  eintrittsgeld: false,
  technPersonal: true,
  beheizung: true,
  speisen: true,
  // Erfahrungswert für eine Hallenveranstaltung des Vereins. Die übrigen
  // Zahlen (Mitwirkende, Ordnungskräfte, Sanitätsdienst …) hängen an der
  // konkreten Veranstaltung und bleiben leer. Die Summe rechnet die App.
  zahlen: {
    ortskundige: "125",
    ortsfremde: "125"
  },
  unterstuetzung: {
    aufbauBestuhlung: false,
    schliessdienstVor: true,
    objekteinweisung: true,
    waehrendVeranstaltung: false,
    objektabnahme: true,
    abbauAusraeumen: true,
    reinigung: true,
    sonstiges: false
  },
  // Abschnitt 9 (Bühne) bleibt durchgehend „Nein“, siehe buehneVorbelegung()
  // in app.js — im eingereichten Original ist dort ebenfalls überall Nein.

  // Freitexte, ebenfalls aus dem eingereichten Original. Zwei offensichtliche
  // Tippfehler der Vorlage sind dabei berichtigt („Alkoholfreihe“ -> alkoholfreie,
  // „Cafe“ -> Kaffee) — auf einem Antrag ans Amt sollen sie nicht stehen.
  // Bewusst nur Latin-1-Zeichen: Ein typografischer Gedankenstrich würde von
  // pdfText() zum Bindestrich, der Text stünde dann in der App anders da als im
  // PDF. Was hier steht, landet unverändert im Formular.
  unterstuetzungAufgaben:
    "Unterstützung der internen Technik, falls es technische Ausfälle gibt. "
    + "Kein technisches Personal - nur Hausmeister als Ansprechpartner.",
  speisenText:
    "Belegte Brote / Brötchen, Bockwurst / Wiener Würste, alkoholfreie Getränke, Kaffee",
  // Steht im Original unter „Bühnendekoration: Nein“ — die Banner hängen in
  // Halle und Foyer, nicht auf der Bühne. Bewusst so übernommen.
  buehneTexte: {
    dekorationText: "Banner-Werbung in der Halle und im Foyer über Sponsoren"
  }
};

const STATUS_LABELS = {
  entwurf: "Entwurf",
  eingereicht: "Eingereicht",
  genehmigt: "Genehmigt",
  abgelehnt: "Abgelehnt"
};

// ---------------------------------------------------------------------------
// PDF-Feldmapping
// ---------------------------------------------------------------------------
// ACHTUNG, die wichtigste Eigenheit dieser App: Die AcroForm-Feldnamen im
// Landkreis-Formular sind gegenüber ihrem Inhalt um EINE Beschriftung versetzt.
// Wer das Formular gebaut hat, hat jedes Eingabefeld nach der Zeile benannt,
// die DARUNTER steht, nicht nach der darüber. Beispiel:
//
//   Überschrift „1. Veranstaltungsort“
//   [Eingabefeld]                    <- heißt 'Raum ggf Anz der Räume Außenanlage'
//   Beschriftung „Raum /Außenanlage“
//   [Eingabefeld]                    <- heißt '2 Bezeichnung der Veranstaltung ggf erläutern'
//
// Das Mapping unten ist deshalb NICHT nach Feldnamen geraten, sondern am
// 2026-07-22 über die Widget-Koordinaten (/Rect je Seite) gegen das gerenderte
// Layout verifiziert. Wer hier etwas ändert, muss das genauso tun — sonst
// gehen verschobene Anträge ans Amt.
const PDF_FELDER = {
  // --- 1 bis 3 (Seite 1) ---
  veranstaltungsort: "Raum ggf Anz der Räume Außenanlage",
  raeume:            "2 Bezeichnung der Veranstaltung ggf erläutern",
  bezeichnung:       "3 Veranstalterin oder Verein",
  veranstalter:      "Veranstaltungsleiterin",

  // --- Veranstaltungsleiter (links) / Vertreter (rechts) ---
  leiterName:        "Name Vorname",
  leiterAnschrift:   ["Anschrift privat", "1", "2"],
  leiterTelefon:     "Tel mobil",
  leiterEmail:       "EMail",
  vertreterName:      "Name Vorname_2",
  vertreterAnschrift: ["Anschrift privat_2", "1_2", "2_2"],
  vertreterTelefon:   "Tel mobil_2",
  vertreterEmail:     "EMail_2",

  // --- 4 Ablaufplan ---
  vaDatum:   "Datum",
  vaEinlass: "Einlass",
  vaBeginn:  "Beginn",
  vaEnde:    "Ende",
  aufbauDatum:  "Datum_2",
  aufbauBeginn: "Beginn_2",
  aufbauEnde:   "Ende_2",
  abbauDatum:  "Datum_3",
  abbauBeginn: "Beginn_3",
  abbauEnde:   "Ende_3",

  // --- 5 Teilnehmerzahlen (Seite 2, rechte Spalte) ---
  zMitwirkende:     "1_3",
  zOrtskundige:     "2_3",
  zOrtsfremde:      "3",
  zZielgruppe:      "4",
  zOrdnungskraefte: "1_4",
  zSanitaet:        "2_4",
  zBrandwache:      "3_2",
  zTechnik:         "4_2",
  zBewirtung:       "5",
  zSumme:           "6",
  zSchutzbeduerftig: "Nein",

  // --- 6 Unterstützung durch technisches Personal ---
  untAufgaben:  ["werden 1", "werden 2"],
  untSonstiges: ["Sonstiges bspw Räumund Streudienst 1", "Sonstiges bspw Räumund Streudienst 2"],

  // --- 7 Beheizung ---
  heizBemerkungen: [
    "Bemerkungen Heizzeit Abweichung von Standardtemperatur usw 1",
    "Bemerkungen Heizzeit Abweichung von Standardtemperatur usw 2"
  ],

  // --- 8 Speisen und Getränke (Seite 3) ---
  speisenText: [
    "Wenn ja welche Speisen und Getränke werden verkauft bzw ausgegeben 1",
    "Wenn ja welche Speisen und Getränke werden verkauft bzw ausgegeben 2",
    "Wenn ja welche Speisen und Getränke werden verkauft bzw ausgegeben 3"
  ],

  // --- 9 Bühnen- und Besucherflächen (Seite 4) ---
  // Auch hier greift der Namensversatz: 'Einsatz externer Scheinwerfer' ist in
  // Wahrheit das Feld „Grundfläche“, 'Bühnendekoration' das Feld „Anzahl“.
  bGrundflaeche:        "Einsatz externer Scheinwerfer",
  bHoehe:               "Höhe",
  bScheinwerferAnzahl:  "Bühnendekoration",
  bDekorationText: [
    "Beschreibung der Bühnendekoration falls erforderlich weitere Blätter hinzufügen 1",
    "Beschreibung der Bühnendekoration falls erforderlich weitere Blätter hinzufügen 2",
    "Beschreibung der Bühnendekoration falls erforderlich weitere Blätter hinzufügen 3"
  ],
  bTontechnikArt:       ["Art", "Saaldekoration"],
  bSaaldekorationText:  ["Welche", "sonstige Einrichtungen undoder Aufbauten"],
  bSonstigeAufbautenText: [
    "Welche_2",
    "Diese Checkliste darf nur vom Veranstaltungsleiter ausgefüllt und unterschrieben werden"
  ],

  // --- Unterschriftenblock ---
  ortDatum: "Ort Datum"
  // 'Ort Datum_2' bleibt leer: das ist die Zeile der Schulleitung, die
  // unterschreibt auf dem ausgedruckten Blatt selbst.
};

// Ja/Nein-Paare: [Feldname für Ja, Feldname für Nein].
// true -> Ja ankreuzen, false -> Nein ankreuzen, null -> beide leer lassen.
const PDF_JA_NEIN = {
  eintrittsgeld:  ["Kontrollkästchen01", "Kontrollkästchen02"],
  technPersonal:  ["Kontrollkästchen03", "Kontrollkästchen04"],
  beheizung:      ["Kontrollkästchen13", "Kontrollkästchen14"],
  speisen:        ["Kontrollkästchen15", "Kontrollkästchen16"],
  bGenutzt:       ["Kontrollkästchen17", "Kontrollkästchen18"],
  bEigene:        ["Kontrollkästchen19", "Kontrollkästchen20"],
  bUmgestaltung:  ["Kontrollkästchen21", "Kontrollkästchen22"],
  bPodesterie:    ["Kontrollkästchen23", "Kontrollkästchen24"],
  bZusatzelemente: ["Kontrollkästchen25", "Kontrollkästchen26"],
  bScheinwerfer:  ["Kontrollkästchen27", "Kontrollkästchen28"],
  bDekoration:    ["Kontrollkästchen29", "Kontrollkästchen30"],
  bTontechnik:    ["Kontrollkästchen31", "Kontrollkästchen32"],
  bSaaldekoration: ["Kontrollkästchen33", "Kontrollkästchen34"],
  bSonstigeAufbauten: ["Kontrollkästchen35", "Kontrollkästchen36"]
};

// Einfache Ankreuz-Kästchen ohne Gegenstück (Abschnitt 6).
const PDF_HAKEN = {
  aufbauBestuhlung:     "Kontrollkästchen05",
  schliessdienstVor:    "Kontrollkästchen06",
  objekteinweisung:     "Kontrollkästchen07",
  waehrendVeranstaltung: "Kontrollkästchen08",
  objektabnahme:        "Kontrollkästchen09",
  abbauAusraeumen:      "Kontrollkästchen10",
  reinigung:            "Kontrollkästchen11",
  sonstiges:            "Kontrollkästchen12"
};

// Abschnitt 5, in der Reihenfolge des Formulars. „zahl“ wird summiert und als
// Zahlenfeld angezeigt, „text“ nicht — „Zielgruppe/Alter“ ist eine Beschreibung
// („Kinder 8–14“), keine Anzahl.
const ZAHLEN_FELDER = [
  ["mitwirkende", "Anzahl der Mitwirkenden (Darsteller, Chor, Sportler usw.)", "zahl"],
  ["ortskundige", "Ortskundige Besucher", "zahl"],
  ["ortsfremde", "Ortsfremde Besucher", "zahl"],
  ["zielgruppe", "Zielgruppe/Alter", "text"],
  ["ordnungskraefte", "Ordnungskräfte", "zahl"],
  ["sanitaet", "Sanitäts- und Rettungsdienste", "zahl"],
  ["brandwache", "Brandsicherheitswache", "zahl"],
  ["technik", "Technisches Personal", "zahl"],
  ["bewirtung", "Personal zur Bewirtung", "zahl"],
  ["schutzbeduerftig", "davon besonders schutzbedürftige Personen", "text"]
];

// Abschnitt 9. `text` sind einzeilige Zusatzfelder, `area` ein mehrzeiliges —
// beide gehören im Formular unter die jeweilige Ja/Nein-Frage.
const BUEHNE_FELDER = [
  { key: "genutzt", label: "Wird die Szenefläche/Bühne genutzt?" },
  { key: "eigene", label: "Nutzung der eigenen Bühne" },
  { key: "umgestaltung", label: "Umfangreiche Umgestaltung der Bühne/Szenefläche" },
  { key: "podesterie", label: "Podesterie" },
  { key: "zusatzelemente", label: "Einsatz zusätzlicher Bühnenelemente",
    text: [["grundflaeche", "Grundfläche"], ["hoehe", "Höhe"]] },
  { key: "scheinwerfer", label: "Einsatz externer Scheinwerfer",
    text: [["scheinwerferAnzahl", "Anzahl"]] },
  { key: "dekoration", label: "Bühnendekoration",
    area: ["dekorationText", "Beschreibung der Bühnendekoration"] },
  { key: "tontechnik", label: "Einsatz externer Tontechnik",
    area: ["tontechnikArt", "Art"] },
  { key: "saaldekoration", label: "Saaldekoration",
    area: ["saaldekorationText", "Welche?"] },
  { key: "sonstigeAufbauten", label: "Sonstige Einrichtungen und/oder Aufbauten",
    area: ["sonstigeAufbautenText", "Welche?"] }
];

// Beschriftungen der Unterstützungs-Kästchen für die Oberfläche, in der
// Reihenfolge, in der sie auch im Formular stehen.
const UNTERSTUETZUNG_LABELS = [
  ["aufbauBestuhlung", "Aufbau/Bestuhlung"],
  ["schliessdienstVor", "Schließdienst vor Veranstaltungsbeginn"],
  ["objekteinweisung", "Objekteinweisung"],
  ["waehrendVeranstaltung", "Unterstützung während der Veranstaltung"],
  ["objektabnahme", "Objektabnahme & Schließdienst nach der Veranstaltung"],
  ["abbauAusraeumen", "Abbau/Ausräumen"],
  ["reinigung", "Reinigung"],
  ["sonstiges", "Sonstiges (bspw. Räum- und Streudienst)"]
];

// Das Feld „Bemerkung Besucheraufkommen“ hat im Original-PDF KEIN
// Eingabefeld — die Zeile ist nur bedruckt. Der Text wird deshalb an diese
// Stelle gezeichnet (Seite 1, Ursprung unten-links, Punkte).
const PDF_BESUCHER_TEXT = { seite: 0, x: 240, y: 318, groesse: 8, maxZeichen: 60 };

// Unterschrift des Veranstaltungsleiters (Seite 4). Die Unterschriftslinien sind
// im Formular keine Formularfelder, sondern gezeichnete Rechtecke von 0,5 pt
// Höhe. Am 2026-07-22 aus dem Content-Stream der Seite ausgelesen:
//
//   Veranstaltungsleiter: Ort/Datum x=65.4  y=270.8  b=196.8
//                         Unterschrift x=276.4 y=270.8 b=249.7   <- hier
//   Schulleitung:         Ort/Datum x=65.4  y=172.9  b=196.8
//                         Unterschrift x=276.4 y=172.9 b=249.7
//
// Die Unterschrift wird knapp ÜBER die Linie gesetzt und unter Beibehaltung des
// Seitenverhältnisses in den Rahmen eingepasst. **Der Block der Schulleitung
// bleibt immer leer** — den unterschreibt die Schule selbst auf dem Ausdruck.
const PDF_UNTERSCHRIFT = { seite: 3, x: 280, y: 274, maxBreite: 242, maxHoehe: 38 };

// Zeichen pro Zeile für die mehrzeiligen Freitextfelder (Feldbreite ~475pt
// bei 10pt Schrift). Wird nur zum Umbrechen genutzt, nicht zum Abschneiden.
const PDF_ZEILENLAENGE = 95;
