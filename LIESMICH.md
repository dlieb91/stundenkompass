# StundenKompass

Arbeitszeiterfassung. Sie beantwortet drei Fragen: **Wie viele Über- oder Minusstunden
habe ich?** **Wie viel Urlaub ist noch übrig?** **Was habe ich diesen Monat
gearbeitet?** Im Team kommt für die Verwaltung eine vierte hinzu: **Wie steht das ganze
Team?**

Derselbe Code läuft auf zwei Arten:

| | **Team** | **Einzelplatz** |
|---|---|---|
| Wo | ein Rechner im Büro als Server, alle anderen im Browser | **https://dlieb91.github.io/stundenkompass/** – von überall |
| Wer | mehrere Mitarbeiter mit Konten, Rollen, Verwaltung | eine Person, keine Anmeldung |
| Daten | `daten/` auf dem Server-Rechner | Ordner, Dropbox oder Speicher des Geräts |
| Start | `Start-Server.bat` | Adresse öffnen |
| Offline | nein | ja, nach dem ersten Besuch |

Welche Art gerade läuft, erkennt die App selbst: Nur der Team-Server beantwortet
`/api/sitzung`. Unten links steht es noch einmal, z. B. *v2.1 · Einzelplatz · Schema 5*.

Der Einzelplatz ist unten unter [Einzelplatz – von überall](#einzelplatz--von-überall)
beschrieben. Alles bis dahin gilt dem Team-Betrieb.

## Rollen

| | Mitarbeiter | Verwaltung (Admin) |
|---|---|---|
| Eigene Zeiten erfassen | ✔ | ✔ |
| Eigenes Dashboard, Urlaub, Erfassung | ✔ | ✔ |
| Wochenplan, Erfassungsbeginn, Anfangsbestand, Urlaubsanspruch, Bundesland | nur lesen | ✔ für jeden |
| Daten anderer Mitarbeiter einsehen | – | ✔ alle |
| Zeiten anderer Mitarbeiter korrigieren | – | ✔, wird protokolliert |
| Team-Übersicht und CSV-Export | – | ✔ |
| Konten anlegen, deaktivieren, Benutzername/Passwort ändern | – | ✔ |
| Kunden und Projekte pflegen | – | ✔ |
| Zeiten auf ein Projekt buchen | ✔ eigene | ✔ eigene und fremde |
| Projektauswertung | – | ✔ |
| Eigenes Passwort ändern | ✔ | ✔ |

Die Werte, die im Arbeitsvertrag stehen – Wochenplan, Erfassungsbeginn, Anfangsbestand,
Urlaubsanspruch, Bundesland – pflegt die Verwaltung für jeden Mitarbeiter. Ein
Mitarbeiter sieht sie, kann sie aber nicht selbst ändern; unter *Vorgaben* stehen sie
deshalb sichtbar, aber ausgegraut, mit dem Hinweis „Wird von der Verwaltung gepflegt.“

## Einrichten (einmalig, auf dem Server-Rechner)

1. **`Einrichten.bat`** doppelklicken. Fragt nach dem Namen des Betriebs und legt das
   erste Konto an – die Verwaltung. Liegt bereits eine `stunden.json` aus einem früheren
   Einzelplatzbetrieb im üblichen Ordner, wird angeboten, sie als Datensatz dieses
   Kontos zu übernehmen.
2. **`Start-Server.bat`** doppelklicken. Startet den Server auf `http://localhost:8870/`
   und zeigt die Adresse, unter der ihn andere Rechner im selben Netz erreichen, z. B.
   `http://192.168.2.124:8870/`. Dieses Fenster muss offen bleiben, solange das Team die
   App nutzt.
3. Als Verwaltung anmelden, unter **Konten** die Mitarbeiter anlegen und ihnen die
   Server-Adresse mitteilen.

**Beim Anlegen gleich die Vorgaben mitgeben** – Erfassungsbeginn, Anfangsbestand und
Urlaubsanspruch stehen direkt im Formular. Ohne Erfassungsbeginn rechnet das Konto
nichts, und der Mitarbeiter kann ihn nicht selbst nachtragen: die Vorgaben pflegt allein
die Verwaltung. Konten, bei denen er fehlt, führt die **Team**-Übersicht mit einem
gelben Hinweis und einem Knopf *Einrichten* auf.

Node.js wird für den Server-Rechner gebraucht (wie zuvor); die anderen Rechner
brauchen nur einen Browser.

## Starten (für alle anderen Rechner)

Die vom Server-Rechner mitgeteilte Adresse in **Chrome, Edge, Firefox oder Safari**
öffnen und sich anmelden. Zugangsdaten gibt es von der Verwaltung. Ohne Ordnerwahl,
ohne Installation – ein zweiter Browser-Tab reicht.

**Einen Speichern-Knopf gibt es nicht.** Gespeichert wird, sobald ein Feld verlassen
wird. Oben rechts steht, wann das zuletzt geschehen ist.

Meldet der Server einen **Konflikt** – weil die Verwaltung inzwischen etwas an
denselben Daten geändert hat – übernimmt die App automatisch deren Stand und zeigt
einen Hinweis. Die eigene letzte, noch nicht gespeicherte Eingabe geht dabei verloren,
die Korrektur der Verwaltung nicht.

## Am Handy

Unter 700 px Breite, also beim Handy hochkant, ordnet sich die App anders an. Am iPad
hochkant (820 px), quer und am PC bleibt alles wie unten beschrieben. Dreht man das
Handy, wechselt die Ansicht mit.

- **Leiste unten statt Seitenleiste:** **Heute** (Stempeluhr, Stundenkonto, Monat,
  Resturlaub), **Erfassung**, **Kalender** (nur Tagessicht, seitlich wischen blättert),
  **Übersicht** (das Dashboard) und **Mehr** (Vorgaben,
  Auswertung, Kunden & Projekte, Einstellungen, im Team auch Team und Konten,
  Hell/Dunkel). Das Abzeichen an *Erfassung* zählt die Arbeitstage ohne Eintrag.
- **Erfassung als Tagesliste:** eine Zeile pro Tag mit Zeiten, Pause, Projekt, Ist und
  Saldo. Lücken sind rot, heute ist hervorgehoben. Ein Tipp auf einen Tag öffnet von
  unten ein **Blatt** mit großen Feldern: Tagesart, Abschnitte, zusätzliche Pause, Notiz,
  *Vorgabe übernehmen*. Ist und Pause rechnen beim Tippen mit. *Fertig* schließt das Blatt;
  gespeichert wird wie überall sofort.
- **Tabellen werden zu Karten**, jeder Wert mit seiner Bezeichnung davor. Leere Werte
  („–") entfallen in der Karte.
- **Hinweistexte** sind auf zwei Zeilen gekürzt, ein Tipp klappt sie auf.

## Aufbau

**Team** *(nur Verwaltung)* – alle Mitarbeiter nebeneinander: Stundenkonto, Saldo des
laufenden Monats, Resturlaub, nicht erfasste Tage. Ein Klick auf eine Zeile öffnet
deren Daten. Dazu ein CSV-Export für die Lohnbuchhaltung.

**Dashboard** – die Zusammenfassung: Stundenkonto, Saldo des laufenden Monats,
Resturlaub, nicht erfasste Tage. Darunter das Urlaubskonto und die Jahresübersicht mit
allen zwölf Monaten und dem aufgelaufenen Saldo.

**Erfassung** – ein Monat, jeder Tag eine Zeile. Hier trägst du deine Zeiten ein.

**Vorgaben** – Regelarbeitszeit, Erfassungsbeginn, Anfangsbestand, Urlaub je Jahr,
Bundesland für die Feiertage. Für Mitarbeiter nur lesbar.

**Auswertung** *(nur Verwaltung)* – gebuchte Stunden für einen wählbaren Zeitraum, nach
Projekt, nach Kunde und – innerhalb eines Projekts – nach Mitarbeiter. Dazu ein
CSV-Export. Erscheint erst, sobald mindestens ein Projekt angelegt ist.

**Kunden & Projekte** *(nur Verwaltung)* – Kunden und Projekte anlegen und archivieren,
dazu der Schalter für die Projektpflicht. Siehe [Kunden und Projekte](#kunden-und-projekte)
unten.

**Konten** *(nur Verwaltung)* – Mitarbeiter anlegen (samt Erfassungsbeginn, Anfangsbestand
und Urlaubsanspruch), deaktivieren, Benutzername und
Passwort ändern. Ein deaktiviertes Konto kann sich nicht mehr anmelden; seine Zeiten
bleiben erhalten. Beim Anlegen schlägt die App aus dem Namen einen Benutzernamen vor
(Nachname, Umlaute umgeschrieben); von Hand eingetragen wird er, sobald das Feld
angefasst wird.

**Einstellungen** – eigenes Konto und Passwort, Server, Sicherungen (Verwaltung),
Änderungsprotokoll.

Die Verwaltung schaltet über den **Umschalter in der Kopfzeile** zwischen den
Mitarbeitern um und sieht dabei stets, wessen Daten gerade offen sind.

## Einrichten der Vorgaben (Verwaltung, je Mitarbeiter)

### 1. Regelarbeitszeit

Wie viele Stunden an welchem Wochentag zu leisten sind. Tage mit **null Stunden** sind
frei und erzeugen nie Minusstunden. Dazu gehören die Vorgabezeiten – Beginn, Ende, Pause –,
die der Knopf *Vorgabe übernehmen* in der Erfassung einsetzt.

### 2. Beginn und Anfangsbestand

Vor dem Erfassungsbeginn rechnet die App nichts. Was davor liegt, steckt als eine einzige
Zahl im **Anfangsbestand**.

> Beispiel: Ein Mitarbeiter fängt am 1. September an zu erfassen, hat aber schon 50
> Überstunden. Erfassungsbeginn `01.09.`, Anfangsbestand `50`. Das Konto startet bei 50
> Stunden und rechnet ab September Tag für Tag weiter. Januar bis August bleiben leer
> und erzeugen keine Minusstunden.

### 3. Urlaub je Jahr

Je Jahr drei Zahlen:

| Feld | Bedeutung |
|---|---|
| **Anspruch** | was dem Jahr zusteht |
| **Übertrag** | Rest aus dem Vorjahr. Leer = Rest des Vorjahres übernehmen; der Platzhalter zeigt, welcher Wert das wäre |
| **vorher genommen** | Urlaub, der in diesem Jahr schon **vor dem Erfassungsbeginn** verbraucht wurde |

> Beispiel: Ein Mitarbeiter steigt im September ein und hat noch 2 Tage übrig.
> Anspruch `30`, Übertrag `0`, vorher genommen `28`. Es bleiben 2 Tage – und es ist
> sichtbar, wohin die anderen 28 gegangen sind, statt nur einen nackten Rest
> vorzufinden.

Der vorher genommene Urlaub wird überall **eigens ausgewiesen** – als Spalte in den
Vorgaben, als eigener Abschnitt im Balken des Dashboards und als eigene Zeile in der
Aufstellung darunter. Er verschwindet nicht stillschweigend im Übertrag.

## Kunden und Projekte (Verwaltung)

Unter *Kunden & Projekte* legt die Verwaltung an, worauf Mitarbeiter ihre Zeiten buchen
können.

Ein **Projektcode** (z. B. `P-2026-014`) ist ein eigenes, jederzeit änderbares Feld –
nicht die Identität des Projekts. Wird ein Code später umbenannt, bleiben alle bisher
darauf gebuchten Zeiten gültig; sie hängen an einer unsichtbaren, festen Kennung im
Hintergrund, nicht am Text des Codes.

Ausgeschiedene Kunden und beendete Projekte werden **archiviert, nicht gelöscht** – ihre
Zeiten bleiben erhalten und zählen weiter in der Auswertung vergangener Monate. Ein
Kunde mit noch aktiven Projekten lässt sich nicht archivieren; die Meldung nennt die
betroffenen Projekte.

Der Schalter **„Projekt bei jedem Arbeitsabschnitt verlangen"** entscheidet, ob es die
Projektfunktion überhaupt zu sehen gibt:

- **Ausgeschaltet** (Grundeinstellung): keine Projektspalte in der Erfassung, keine
  Beanstandung. Ein Betrieb ohne Projekte merkt von alldem nichts.
- **Eingeschaltet**: jeder Zeitabschnitt bekommt eine Projektauswahl; fehlt sie, meldet
  die Erfassung das rote Zeichen am Zeilenende – wie eine zu kurze Pause. Gebucht wird
  trotzdem, nichts wird blockiert.

## Zeiten erfassen

Eine Zeile je Tag. In jede Zeile gehören **Von**, **Bis** und die **Pause** in Minuten.

**Mehrere Abschnitte am Tag** hängst du mit `+` an. Wichtig: Die Lücke zwischen zwei
Abschnitten **ist** bereits die Pause – das Pausenfeld bleibt dann leer.

| Eingabe | Ist |
|---|---|
| 08:00–17:00, Pause 60 | 8:00 h |
| 08:00–12:00 · 12:45–17:00, Pause leer | 8:15 h |
| 08:00–12:00 · 12:45–17:00, Pause 45 | 7:30 h – die Pause zählt doppelt |

Ein Abschnitt über Mitternacht ist erlaubt: 22:00–06:00 sind acht Stunden.

### Stempeluhr

Oben im **Dashboard** steht die Stempeluhr, auf PC, iPad und Handy dieselbe:
**Kommen**, **Pause**, **Gehen**, **Weiter arbeiten**. Ein Tipp trägt die aktuelle Uhrzeit
als Abschnitt in den heutigen Tag ein. Daneben stehen die heute gearbeitete Zeit (der
laufende Abschnitt zählt mit) und die Uhrzeit, zu der das Tagessoll ohne weitere Pause
erreicht ist.

- **Pause** und **Gehen** beenden beide den laufenden Abschnitt. Die Lücke bis zum
  nächsten *Weiter arbeiten* ist die Pause und zählt für die gesetzliche Mindestpause mit,
  sofern sie mindestens 15 Minuten dauert (ArbZG § 4).
- **Projekte:** Gibt es Projekte, steht über den Knöpfen eine Auswahl. Ein Wechsel während
  der Arbeit beendet den Abschnitt und beginnt ohne Lücke einen neuen auf dem anderen
  Projekt.
- **Geräteübergreifend:** Die Stempeluhr hat keinen eigenen Speicher. Eingestempelt ist,
  wer einen Abschnitt mit Beginn und ohne Ende hat. Am Handy kommen und am PC gehen
  funktioniert deshalb, mit Dropbox oder im Team über den Server.
- **Über Mitternacht:** Wer um 22:00 kommt und um 02:00 geht, bekommt einen Abschnitt
  22:00–02:00 am Vortag.
- **Vergessen auszustempeln?** Läuft ein Abschnitt länger als 14 Stunden, weist die Karte
  darauf hin. Korrigiert wird in der Erfassung.
- **Feiertag, Wochenende, Urlaub:** Die Tagesart bleibt, wie sie ist. Die gestempelte Zeit
  kommt zur Gutschrift dazu, ein gestempelter Feiertag läuft also nicht ins Minus.
- Ein laufender Abschnitt von heute oder gestern gilt nicht als „halb ausgefüllt".
- **Im Team** stempelt jeder nur für sich. Wer als Verwaltung einen Mitarbeiter
  betrachtet, sieht die Stempeluhr nicht.
- Es zählt die Uhr des Geräts. Geht sie falsch, sind die Zeiten falsch.

### Monatsbericht als PDF

In der **Erfassung** öffnet *Monatsbericht (PDF)* den Druckdialog für den gerade
gezeigten Monat. Dort *Als PDF speichern* wählen, oder direkt drucken. Am iPhone
über *Teilen → Drucken* und im Druckvorschaubild erneut *Teilen*. Der Dateiname ist
z. B. `Monatsbericht 2026-10 Max Mustermann`.

Auf einer A4-Seite stehen:
- jeder Tag des Monats mit Art, Abschnitten, Pause, Ist, Soll, Saldo, Projekt und Notiz,
  darunter die Monatssumme
- **Stundenkonto:** Stand Ende Vormonat (bzw. Anfangsbestand), Saldo des Monats, Stand
  Monatsende
- **Urlaub** des Jahres: Anspruch, genommen bis Monatsende, danach geplant, verbleibend
- Urlaubs-, Krankheits- und nicht erfasste Tage
- **Hinweise** zu Tagen mit Beanstandung, etwa zu kurzer Pause
- zwei Unterschriftszeilen (Mitarbeiter/in, Arbeitgeber)

Läuft der Monat noch, rechnet der Bericht bis heute und sagt das oben ausdrücklich.
Gedruckt wird ein eigener Bogen, nicht die Bildschirmansicht: Am Bildschirm ist er
unsichtbar, nach dem Druck verschwindet er wieder. Im Team druckt die Verwaltung so
auch den Bericht eines Mitarbeiters, den sie gerade betrachtet.

### Kalender

Eigener Reiter **Kalender**: wann gearbeitet wurde, als Zeitachse wie in einem
Terminkalender. Am PC und iPad wahlweise **Woche** (Mo–So) oder **Tag**, am Handy nur
der Tag. Ein Klick auf das Datum im Wochenkopf zeigt den Tag allein, ein Klick in eine
Tagesspalte öffnet das Bearbeiten-Blatt. So lässt sich auch aus dem Kalender nachtragen.

| Farbe | Bedeutung |
|---|---|
| blau | **Arbeit**, jeder erfasste Abschnitt so, wie er eingetragen ist. Lücken zwischen Abschnitten bleiben frei. Mit Projekt steht das Projekt als Titel da. |
| lachsrot | **Krank** |
| gelb | **Urlaub**, beim halben Urlaubstag die halbe Sollzeit vor oder nach der Arbeit |
| gestreift | **Pause** zwischen den Vorgabezeiten |

Krank und Urlaub ohne eigene Zeiten erscheinen mit den **Vorgabezeiten** des geltenden
Zeitmodells (z. B. 08:00–17:00), dazu der Hinweis „Vorgabezeit". Die Vorgabepause steht
als eigener Block ab 12:00, wenn sie dort hineinpasst, sonst in der Mitte. Die Vorgabe
kennt nur die Dauer der Pause, nicht ihre Lage. An Tagen ohne Arbeitspflicht (Wochenende,
Feiertag) steht Urlaub oder Krank nur oben in der Ganztagszeile. Dort stehen auch
Feiertage, freie Tage, Freizeitausgleich und Arbeitstage ohne Eintrag („nicht erfasst").

Ein laufender Abschnitt (eingestempelt) reicht bis jetzt, die rote Linie markiert die
aktuelle Uhrzeit. Ein Abschnitt über Mitternacht wird am Folgetag fortgesetzt. Der
Kalender zeigt nur an und rechnet nichts Eigenes: Stunden und Saldo kommen wie überall
aus dem Stundenkonto.

### Tagesarten

| Art | Wirkung aufs Stundenkonto | Urlaub |
|---|---|---|
| **Arbeit** | Ist gegen Soll | – |
| **Urlaub** | Soll wird gutgeschrieben, Konto unverändert | 1 Tag |
| **Halber Urlaubstag** | halbe Gutschrift, halber Tag Arbeit | 0,5 Tage |
| **Krank** | Soll wird gutgeschrieben, Konto unverändert | – |
| **Feiertag** | Soll wird gutgeschrieben | – |
| **Frei** | Soll wird gutgeschrieben | – |
| **Freizeitausgleich** | Soll bleibt stehen → Konto sinkt | – |

**Freizeitausgleich** ist der Weg, Überstunden gezielt abzubauen.

Urlaub an einem Wochenende oder Feiertag kostet **keinen** Urlaubstag – ein Feiertag
mitten in der Urlaubswoche wird nicht abgezogen.

### Urlaub planen

*Urlaub planen …* trägt einen Zeitraum in einem Zug ein und lässt Wochenenden und
Feiertage aus. Geplante Tage in der Zukunft belasten sofort das Urlaubsbudget, erzeugen
aber keine Minusstunden.

### Nicht erfasste Tage

Ein **vergangener Arbeitstag ohne Eintrag** gilt als Tag ohne Arbeit und geht mit seinem
vollen Soll ins Minus. Solche Tage werden als *Lücken* gezählt – im Dashboard, in der
Seitenleiste und in der Monatssumme. Der Knopf *Lücken mit Vorgabe füllen* trägt bei allen
davon betroffenen Tagen die Vorgabezeiten ein.

### Projekt buchen

Ist die Projektpflicht eingeschaltet, bekommt jeder Abschnitt eine eigene
Projektauswahl – genau wie Von und Bis. Wer an einem Tag auf zwei Projekte bucht, hängt
wie gewohnt mit `+` einen zweiten Abschnitt an und wählt dort das andere Projekt.
Angezeigt werden alle nicht archivierten Projekte, die zuletzt selbst genutzten zuerst.

### Wechsel der Arbeitszeit

Ändert sich die Arbeitszeit, legt die Verwaltung unter *Vorgaben → Wechsel der
Arbeitszeit* ein zweites Zeitmodell mit **Stichtag** an. Ab diesem Tag gilt das neue
Soll, alles davor bleibt unverändert. In der Erfassung markiert eine Trennzeile die
Stelle, an der das Soll springt. Beliebig viele Wechsel sind möglich.

## Wie das Konto gerechnet wird

```
Soll        Stunden aus dem Wochenplan, der an diesem Tag galt
Ist         Summe der Abschnitte abzüglich Pause
Gutschrift  bei Urlaub, Krankheit, Feiertag: das Soll
Tagessaldo  Ist + Gutschrift − Soll

Konto = Anfangsbestand + alle Tagessalden ab Erfassungsbeginn bis heute
```

Tage **in der Zukunft zählen nicht** ins Stundenkonto. Ein im November eingeplanter Urlaub
darf das heutige Saldo nicht verändern.

## Beanstandungen

Ein rotes Zeichen am Zeilenende meldet:

- Pause kürzer als gesetzlich vorgeschrieben (ArbZG §4: über 6 h → 30 min, über 9 h → 45 min)
- mehr als 10 Stunden Arbeitszeit (ArbZG §3)
- überschneidende Abschnitte
- ein nur halb ausgefüllter Abschnitt
- kein Projekt gewählt (nur wenn die Verwaltung die Projektpflicht eingeschaltet hat)

**Zu kurze Pausen werden gemeldet, aber nie stillschweigend abgezogen.** Gerechnet wird,
was dasteht – alles andere erzeugte Zahlen, die sich in der eigenen Eingabe nicht
wiederfinden.

## Einzelplatz – von überall

Für eine Person, ohne Server, ohne Anmeldung. Die App liegt auf GitHub Pages:

> **https://dlieb91.github.io/stundenkompass/**

Die Adresse in Chrome, Edge oder Safari öffnen und eine Ablage wählen. Alles Fachliche –
Erfassung, Vorgaben, Dashboard, Kunden und Projekte, Auswertung – ist dasselbe wie im
Team. Es fehlen nur Team-Übersicht, Konten und Rollen; die Vorgaben pflegt man selbst.

### Wo die Daten liegen

Drei Ablagen mit demselben Aufbau:

```
stunden.json   alle Zeiten, Vorgaben, Kunden und Projekte (lesbares JSON)
backups/       tägliche Sicherung, die letzten 20
```

**Ordner auf diesem Rechner** – nur Chrome und Edge. Die Dateien sind sichtbar und
lassen sich außerhalb der App sichern. Der Ordner darf in OneDrive oder Dropbox liegen.
Wer den Ordner der allerersten Einzelplatz-Fassung wählt (`Dokumente\StundenKompass`),
findet seine `stunden.json` dort wieder.

**Dropbox** – wenn Rechner, iPhone und iPad denselben Stand zeigen sollen. Die App
arbeitet dabei immer zuerst im Speicher des Geräts und gleicht daneben ab; ohne Netz
geht die Arbeit normal weiter, und alles wird nachgeholt.

**Nur auf diesem Gerät** – im Browserspeicher (IndexedDB). Der gehört **diesem Browser
auf diesem Gerät**; ein anderes Profil oder ein privates Fenster sieht ihn nicht. **Auf
iPhone und iPad löscht Safari ihn nach sieben Tagen ohne Besuch** – ausgenommen sind
nur Web-Apps auf dem Home-Bildschirm.

### Auf iPhone und iPad

Adresse in Safari öffnen, *Teilen → Zum Home-Bildschirm*. Erst damit ist der Speicher
dauerhaft und die App startet im Vollbild. Safari kann nicht auf Ordner zugreifen;
auf diesen Geräten heißt die Wahl also Dropbox oder Gerätespeicher – und für mehr als
ein Gerät Dropbox.

### Abgleich mit Dropbox – einmal einrichten

1. Auf **dropbox.com/developers/apps** eine App anlegen: *Scoped access*,
   *App folder*, Name z. B. `StundenKompass`. Die App bekommt dadurch einen eigenen Ordner
   (`Apps/StundenKompass`) und sieht nichts sonst in deiner Dropbox.
2. Reiter *Permissions*: `files.content.read` und `files.content.write` ankreuzen und
   mit *Submit* speichern – **vor** dem nächsten Schritt; nachträglich gesetzte Rechte
   greifen erst nach einer neuen Anmeldung.
3. Reiter *Settings*: den **App key** kopieren und unter *Redirect URIs* genau diese
   Adresse eintragen (auf das Zeichen genau, mit Schrägstrich am Ende):

   ```
   https://dlieb91.github.io/stundenkompass/
   ```

   Die App zeigt dieselbe Adresse im Einrichtungsdialog zum Kopieren an.
4. In der App *Mit Dropbox verbinden*, App key einfügen, bei Dropbox anmelden.

Eine eigene Dropbox-App statt der von ImmoPortfolio hält die Ordner sauber getrennt.
Technisch ginge auch die vorhandene – dann mit dieser zweiten Redirect-URI, und
`stunden.json` läge neben `portfolio.json`.

Der App key ist nicht geheim – er benennt nur die App. Die Anmeldung läuft über PKCE,
es gibt kein App-Geheimnis im Code. Der dauerhafte Zugang liegt nur auf dem Gerät.
**Jedes Gerät meldet sich einmal selbst an**, und die Web-App auf dem Home-Bildschirm
zählt dabei als eigenes Gerät, auch wenn Safari schon angemeldet ist.

### Wann abgeglichen wird, und was bei Widerspruch passiert

Beim Start, bei der Rückkehr zur App, wenn das Netz wiederkommt und rund acht Sekunden
nach der letzten Änderung. Der Zustand steht oben rechts in der Kopfzeile; ein Klick
darauf gleicht sofort ab.

Haben **beide Seiten** seit dem letzten Abgleich etwas geändert – etwa am Rechner und
offline am iPhone –, führt die App die Stände **nicht** zusammen. Ein Dialog zeigt beide
Fassungen (Änderungsdatum, Gerät, erfasste Tage) und du entscheidest. Die unterlegene
Fassung bleibt als Sicherung erhalten und ist unter *Einstellungen → Sicherungen*
wiederherstellbar.

Technisch stützt sich das auf einen Zähler in der Datei (`meta.stand`), der mit jeder
Änderung steigt, und auf Dropbox' eigene Kennung des Dateistands (`rev`). Hochgeladen
wird nur, wenn die Datei drüben noch die erwartete `rev` hat – sonst meldet Dropbox
einen Konflikt, statt den fremden Stand zu überschreiben. Uhrzeiten werden bewusst nicht
verglichen.

### Vom Team-Server in den Einzelplatz umziehen

1. Im Team anmelden, *Einstellungen → Als Datei exportieren*. Die Datei enthält die
   eigenen Zeiten **und** die Kunden und Projekte des Betriebs, damit gebuchte Stunden
   ihr Projekt wiederfinden.
2. Den Einzelplatz öffnen, Ablage wählen. Ist sie leer, im Dialog *Neu anfangen* unter
   „Oder vorhandene Zeiten übernehmen" die Datei wählen.
   Ist schon etwas da: *Einstellungen → Aus Datei übernehmen*. Der bisherige Stand wird
   dabei als Sicherung abgelegt.

Derselbe Weg führt von einer Ablage in eine andere (z. B. vom Gerätespeicher in
Dropbox): exportieren, *Andere Ablage wählen*, übernehmen.

### Grenzen des Einzelplatzes

- **Kein Mehrbenutzerbetrieb.** Ein Dropbox-Konto, eine Person, mehrere Geräte
  nacheinander. Zwei Leute, die gleichzeitig dieselbe Datei bearbeiten, erzeugen nur
  Konflikte. Für ein Team ist der Team-Server da.
- **Deine Daten liegen bei Dropbox**, wenn du Dropbox wählst. Das ist der Preis für den
  Zugriff von überall ohne eigenen Server.
- **Auf dem iPhone noch nicht erprobt:** Ob die Dropbox-Anmeldung aus einer Web-App auf
  dem Home-Bildschirm sauber zurückspringt, hängt an iOS. Das ist der erste Punkt, den
  du auf dem Gerät selbst testen solltest.
- **Am Telefon ist die Erfassungstabelle breit.** Sie scrollt waagerecht; einen Monat
  Tag für Tag auf 390 px Breite nebeneinander zu lesen geht nur so.

### Eine neue Fassung veröffentlichen

```
git add -A
git commit -m "Was sich geändert hat"
git push
```

GitHub Pages baut danach selbsttätig, meist binnen einer Minute. Die App holt sich die
neuen Dateien beim nächsten Start – der Service Worker fragt immer zuerst das Netz.

**Was nicht ins Repository gehört** und durch `.gitignore` gesperrt ist: `daten/` des
Team-Servers (Konten mit Passwort-Hashes, alle Datensätze), jede `stunden.json`,
Sicherungen und die lokalen Claude-Einstellungen. Das Repository ist öffentlich; der
Code enthält keine Geheimnisse.

## Grenzen der Rechnung

Die App ist ein Stundenkonto, keine Lohnabrechnung. Sie rechnet bewusst nicht:

- **Keine Zuschläge** für Nacht-, Sonn- oder Feiertagsarbeit, keine Löhne, keine
  Schichtmodelle. Eine Stunde ist eine Stunde.
- **Kein revisionssicherer Nachweis** nach ArbZG §16. Die Daten liegen als gewöhnliches
  JSON auf dem Server-Rechner und sind dort jederzeit von Hand änderbar; das
  Änderungsprotokoll zeigt, was geändert wurde, sichert es aber nicht gegen Zugriff auf
  den Server-Rechner selbst ab.
- **Ein Arbeitszeitwechsel wirkt ab seinem Stichtag** und rechnet die Vergangenheit nicht
  um. Ändert sich damit auch der Urlaubsanspruch – etwa bei weniger Arbeitstagen je Woche –,
  trägt die Verwaltung den neuen Anspruch selbst ein. Die App leitet ihn nicht aus dem
  Wochenplan ab.
- **Kein Verfall von Urlaub.** Die Frist zum 31. März (§7 BUrlG) und der anteilige
  Anspruch bei unterjährigem Eintritt (§5 BUrlG) werden nicht gerechnet; beides trägt
  die Verwaltung über den Übertrag von Hand ein.
- **Feiertage** kommen aus einer eingebauten Berechnung je Bundesland. Gemeindeweise
  Sonderfälle – Fronleichnam in Sachsen und Thüringen, Mariä Himmelfahrt in Bayern –
  fehlen. Einzelne Tage lassen sich in der Erfassung jederzeit überschreiben.
- **Kein Gleitzeitrahmen, keine Kappungsgrenze.** Das Konto läuft unbegrenzt weiter, auch
  wenn ein Arbeitsvertrag den Aufbau begrenzen würde.
- **Team: nur fürs interne Netz.** Die Verbindung zwischen Browser und Server läuft
  unverschlüsselt (HTTP). Das ist für ein vertrauenswürdiges Firmennetz gedacht – nicht
  für offenes WLAN und nicht dafür, den Server-Rechner ins Internet durchzureichen. Wer
  von unterwegs erfassen will, nimmt den Einzelplatz.
- **Team: läuft der Server-Rechner nicht, arbeitet niemand.** Es gibt im Team keinen
  Offline-Betrieb und keine Zwischenspeicherung im Browser der Mitarbeiter.
- **Team: wer den Server-Rechner selbst bedient, kann alle Daten lesen.** Der
  Rollenschutz gilt für den Weg über die App, nicht für die Dateien auf der Festplatte.
- **Team und Einzelplatz sind getrennte Welten.** Zeiten, die im Einzelplatz erfasst
  werden, kommen nicht von selbst beim Team-Server an, und umgekehrt. Hinüber geht es
  nur über *Als Datei exportieren* und *Aus Datei übernehmen* – und das ersetzt den
  Stand am Ziel vollständig, es führt nichts zusammen.
- **Die Projektauswertung zählt Stunden, sie rechnet keine Abrechnung.** Keine
  Stundensätze, keine Rechnungen, keine Budgetüberwachung, kein Soll-Ist-Vergleich je
  Projekt. Sie beantwortet „wie viele Stunden", nicht „was hat es gekostet".

## Die Tabellenfassung

Neben der App liegt `StundenKompass-2026.xlsx` – dieselbe Rechnung als Mappe für **Excel
und Google Sheets**, ohne Installation und ohne Makros. Sie eignet sich zum Weitergeben
und für unterwegs, für einen einzelnen Mitarbeiter statt fürs ganze Team.

Aufbau: **Übersicht** (Einrichtung und Farblegende) · **Dashboard** (Stundenkonto,
Urlaubskonto, Jahresübersicht) · **Vorgaben** (Regelarbeitszeit mit Stichtagen, Urlaub,
Bundesland) · **01 Januar** bis **12 Dezember** für die Erfassung.

Ihre Zahlen sind gegen die App gegengerechnet: dieselben Eingaben ergeben in beiden
dieselben Monatssummen, dasselbe Konto und denselben Resturlaub.

Was die Mappe **nicht** kann: nur drei Arbeitsabschnitte je Tag statt beliebig vielen, nur
sechs Zeitmodelle, und ein Jahr je Datei – Anfangsbestand und Resturlaub trägt man beim
Jahreswechsel einmal von Hand ein. Alles Weitere steht auf ihrem Blatt „Übersicht".

Erzeugt wird sie vom Skill `zahlenkompass-tabelle`; eine Mappe für ein anderes Jahr
entsteht mit `--jahr 2027`.

## Daten und Sicherungen

**Team:** Alles steht im Ordner `daten/` auf dem **Server-Rechner** – je Mitarbeiter eine
eigene, lesbare JSON-Datei unter `daten/mitarbeiter/`, dazu `daten/team.json` mit den
Konten (Passwörter nur als Hash, nie im Klartext). Der Server legt einmal täglich eine
Sicherung an, die letzten 20 Tage bleiben erhalten; die Verwaltung sieht und stellt sie
unter *Einstellungen → Sicherungen* wieder her.

Der Server liefert nur die Programmdateien aus (`index.html`, `css/`, `js/`, `bilder/`,
Manifest, Service Worker). Bis zur Fassung 2.1 lieferte er **jede** Datei im Ordner aus,
also auch `daten/team.json` – jeder im Netz hätte die Passwort-Hashes ohne Anmeldung
abrufen können. Wer den Team-Server vorher in einem Netz mit fremden Geräten betrieben
hat, sollte die Passwörter neu vergeben.

**Einzelplatz:** siehe [Wo die Daten liegen](#wo-die-daten-liegen).

Nur Tage, an denen etwas vom Kalender abweicht, stehen in der Datei eines Mitarbeiters.
Ein gewöhnliches Wochenende taucht dort nicht auf.

## Aufbau des Codes

```
server.js           Node-Server: liefert die App aus, leitet /api/-Anfragen weiter
server/ablage.js    Lesen/Schreiben der Konten, Datensätze und Stammdaten, Sicherungen
server/konten.js    Passwort-Hashing (PBKDF2), Anmeldung, Kontenverwaltung, Benutzernamen
server/sitzungen.js Sitzungs-Token im Arbeitsspeicher des Servers
server/stammdaten.js Kunden und Projekte: anlegen, ändern, archivieren
server/api.js       Routen und Rechteprüfung – hier wird jede Rolle durchgesetzt
einrichten.js        Ersteinrichtung: legt daten/team.json und das erste Konto an

index.html           Grundgerüst
manifest.webmanifest Web-App-Hülle für „Zum Home-Bildschirm"
sw.js                Service Worker (nur Einzelplatz): Programmdateien für offline

js/betrieb.js        Team oder Einzelplatz? Erkennt es an /api/sitzung
js/main.js           Start: Anmeldung (Team) oder Ablagewahl (Einzelplatz), Router
js/storage.js        Autosave – schreibt an den Server oder in die gewählte Ablage
js/speicher/ordner.js      Ablage im Ordner (File System Access API)
js/speicher/lokal.js       Ablage auf dem Gerät (IndexedDB)
js/speicher/dropbox.js     Ablage Dropbox: lokal zuerst, Abgleich daneben
js/speicher/dropboxApi.js  Dropbox-Anmeldung (PKCE) und REST-Aufrufe
js/speicher/dateiablage.js IndexedDB-Dateiablage, Grundlage von lokal und dropbox
js/db.js             IndexedDB: gemerkte Ablage, Dropbox-Zugang, Gerätespeicher
js/abgleich.js       wann abgeglichen wird, Konfliktdialog, Dropbox-Einrichtung
js/uebernahme.js     Zeiten aus einer Datei übernehmen (prüft und migriert)
js/api.js           Hülle um fetch() für die /api/-Routen (nur Team)
js/sitzung.js        Angemeldetes Konto, betrachtetes Konto, Admin-Umschalter
js/stammdaten.js     Kunden und Projekte: Team vom Server, Einzelplatz aus der eigenen Datei
js/zeit.js           Uhrzeiten, Abschnitte, Pausen, gesetzliche Grenzen
js/stempeluhr.js     Kommen, Pause, Gehen, Projektwechsel (rein, ohne Oberfläche)
js/monatsbericht.js  Inhalt des Monatsberichts: Tage, Konto, Urlaub (rein, ohne Oberfläche)
js/views/berichtDruck.js  setzt den Bericht als Druckbogen und öffnet den Druckdialog
js/kalenderTermine.js  Blöcke eines Tages für den Kalender: Arbeit, Krank/Urlaub mit Vorgabezeiten (rein)
js/views/kalender.js     Kalender: Woche oder Tag als Zeitachse
js/kalender.js       Datumsrechnung, Kalenderwochen, Feiertage je Bundesland
js/saldo.js          Stunden- und Urlaubskonto
js/projekte.js       Aggregation gebuchter Stunden nach Projekt, Kunde, Mitarbeiter
js/store.js          Datenmodell, Änderungsverwaltung, Migration
js/ansicht.js         gewählter Monat und gewähltes Jahr (im Browser, nicht in der Datei)
js/views/stempelkarte.js  die Stempeluhr oben im Dashboard
js/views/heute.js        Handy: Startansicht mit Stempeluhr und Kontostand
js/views/mehr.js         Handy: alles, was nicht in der Leiste unten steht
js/views/erfassungHandy.js  Handy: Tagesliste und Bearbeiten-Blatt
js/views/tagzugriff.js   Schreiben in einen Tag – gemeinsam für Tabelle und Blatt
js/views/            Team, Dashboard, Erfassung, Vorgaben, Auswertung, Stammdaten,
                     Konten, Einstellungen
```

`zeit.js`, `kalender.js`, `saldo.js` und `projekte.js` rechnen ohne jeden Bezug zur
Oberfläche oder zum Server und lassen sich deshalb direkt in Node prüfen – daran hat der
Umbau auf Team-Betrieb nichts geändert: sie bekommen weiterhin einfach den Datensatz
übergeben, gleich wessen Datensatz das gerade ist.
