# Raumnutzung

Anträge auf Raumnutzung für Veranstaltungen digital erfassen — und daraus das
ausgefüllte Original-Formular des Landkreises Eichsfeld als PDF erzeugen.

## Was die App macht

Wer eine Halle oder Außenanlage des Landkreises für eine Veranstaltung nutzen
will, füllt das Formular „Raumnutzung für Veranstaltungen“ des
Liegenschaftsamtes aus — neun Abschnitte von der Bezeichnung der Veranstaltung
über die erwarteten Teilnehmerzahlen bis zu den Bühnenflächen.

Diese App nimmt die Angaben in einer normalen Weboberfläche auf, rechnet die
Teilnehmer-Summe selbst aus und schreibt am Ende alles in das **echte
Formular-PDF des Landkreises**. Herauskommt genau das Blatt, das das Amt
erwartet — zum Ausdrucken, Unterschreiben und Einreichen.

## Bedienung

1. In der [Tools-Übersicht](https://tecko1985.github.io/ToolsUebersicht/)
   anmelden, dann die Kachel **Raumnutzung** öffnen.
2. **+ Neuer Antrag** — die Angaben werden laufend automatisch gespeichert.
3. **📄 Amtliches PDF erzeugen** — das ausgefüllte Formular wird
   heruntergeladen und in einem neuen Tab geöffnet.
4. Ausdrucken, von der Veranstaltungsleitung unterschreiben lassen, einreichen.

Ein bestehender Antrag lässt sich über **Als Vorlage kopieren** wiederverwenden;
die Termine werden dabei bewusst geleert, damit kein altes Datum unbemerkt
mitwandert.

## Hinweise

- Die Unterschriftsfelder bleiben im PDF leer — sie werden auf dem Ausdruck
  geleistet, so verlangt es das Formular.
- Das erzeugte PDF bleibt ausfüllbar. Fragt das Amt nach, lässt sich eine
  Kleinigkeit direkt im PDF-Programm ändern.
- Die Anträge enthalten private Anschriften und Telefonnummern. Die App ist
  deshalb nur für einen begrenzten Kreis sichtbar; wer sie sehen und bearbeiten
  darf, steuert die Tools-Übersicht über die normalen Gruppen.

## Technik

Vanilla JS ohne Build-Step. Anmeldung und Speicherung laufen über das zentrale
Gateway der Tools-Übersicht, die Daten liegen in der Vereins-Nextcloud. Das PDF
wird im Browser mit [pdf-lib](https://pdf-lib.js.org/) erzeugt.

Entwicklungsserver: Port 8802.

Details zu Architektur, Datenschema und den Fallstricken des Formulars stehen in
`CLAUDE.md` (nicht Teil des öffentlichen Repos).
