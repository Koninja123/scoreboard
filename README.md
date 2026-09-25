# Hockey Scoreboard

Scorebord en wedstrijdklok voor hockeyscheidsrechters. Draait als Android-app
(APK) en als web-app (PWA) voor iPhone en andere browsers. Alles is gratis:
geen Play Store en geen Apple-account nodig.

## Functies
- **Score** voor blauw en rood: **vasthouden (~0,6 s) = +1**, `−1` ook vasthouden, *Ongedaan* na elke wijziging
- **Klok** met helften/kwarten, 15/30/35 min of vrije tijd. **Tik = start**, **vasthouden = pauze**
- **Alarm** aan het einde van elke periode, met grote *Stop alarm*-knop
- **Piep bij 1 minuut** resterend (aan/uit in de instellingen)
- **Bescherming tegen tikken in je broekzak**
  - alleen vasthouden telt, schuiven of twee contactpunten tegelijk breken af
  - automatisch vergrendelen na 10 s zonder actie terwijl de klok loopt (uit te zetten); ontgrendelen = slot 1,5 s vasthouden
  - Android: *zakmodus*, het scherm gaat uit zodra de nabijheidssensor bedekt is (zoals tijdens bellen)
  - resetten, speeltijd wijzigen en nieuwe wedstrijd vragen om bevestiging
  - geen scoreknoppen in de melding op het vergrendelscherm
- **Uitslagen**: na de laatste periode of bij *Nieuwe wedstrijd* wordt de eindstand automatisch bewaard.
  Onder ⚙ → *Uitslagen* staan ze per dag. Je kunt ze corrigeren, een notitie toevoegen (veld/poule), verwijderen en
  **per dag delen** via WhatsApp of mail
- Eerder gebruikte teamnamen worden voorgesteld bij het invullen
- De klok loopt door als de app wordt afgesloten of de telefoon herstart; bij heropenen gaat alles verder waar het was

## Android vs. iPhone

| | Android-app | iPhone / browser (PWA) |
|---|---|---|
| Alarm met scherm uit / op slot | ✅ via alarmkanaal, max volume, herhaalt tot Stop | ❌ app moet open blijven met scherm aan |
| Stille modus / Niet Storen | ✅ alarm klinkt (zoals een wekker) | ✅ stil-schakelaar dempt niet (iOS 17+) |
| Zakmodus (nabijheidssensor) | ✅ | ❌ (wel auto-vergrendeling) |
| Klok + stand op vergrendelscherm & widget | ✅ | ❌ |

## Android-app installeren
1. Download de APK via de release **android-latest** (Releases op GitHub).
2. Sta installeren uit onbekende bron toe en installeer.
3. Bij de eerste start van de klok: **meldingen toestaan**.
4. Tik in ⚙ op **Batterijbeperking uitzetten** als die knop er staat. Anders kan vooral Samsung/Xiaomi de app afsluiten.

De APK wordt automatisch gebouwd door GitHub Actions bij elke push naar `main`
(en ter controle op `claude/**`-branches). Zonder signing-secrets wordt een debug-APK gebouwd.

## Test-checklist vóór het eerste toernooi (Android)
Zet de speeltijd op **2 minuten** en controleer:
- [ ] ⚙ → *Alarm testen* en *Piep testen* zijn goed hoorbaar
- [ ] Telefoon op **stil/trillen**: piep bij 1:00 en eindalarm klinken
- [ ] **Niet Storen** aan: eindalarm klinkt (alarmen staan in Niet Storen standaard toe)
- [ ] Klok starten, **scherm op slot** met de aan/uit-knop: alarm klinkt en *Stop alarm* staat in de melding
- [ ] Klok starten, **app wegvegen** uit recente apps: alarm klinkt toch
- [ ] Telefoon met lopende klok **in je broekzak**, even lopen: score en klok ongewijzigd
- [ ] Wedstrijd uitspelen → ⚙ → *Uitslagen* toont de eindstand → *Delen* opent WhatsApp

## iPhone (PWA)
Open de app-URL in Safari → *Deel* → *Zet op beginscherm*. Laat de app open
staan tijdens de wedstrijd: het scherm blijft vanzelf aan. Druk je de telefoon
op slot, dan hoor je het alarm pas als je hem weer ontgrendelt.

## Ontwikkelen
```bash
npm install
npm test                     # unit-tests (opslag, uitslagen)
python -m http.server 8000   # web-app lokaal op http://localhost:8000
```

Opbouw:
- `index.html`, `styles/`, `js/`: de app (één codebase voor web en Android)
  - `js/app.js`: scherm en logica · `js/store.js`: status en opslag · `js/history.js`: uitslagen
  - `js/hold.js`: vasthouden-om-te-bevestigen · `js/timer.js`: klok · `js/audio.js`: web-geluid
  - `js/native.js`: brug naar Android
- `android/app/src/main/java/com/koninja/scoreboard/`: native Android
  - `ScoreboardService.kt`: voorgrondservice (klok, piep, eindalarm, vangnet-alarm)
  - `AlarmPlayer.kt`: geluid op de alarm-stream · `ScoreboardPlugin.kt`: brug naar de web-app
  - `ScoreboardWidget.kt`: widget · `AlarmReceiver.kt`: vangnet en *Stop alarm*
- `tools/`: iconen, geluiden (`make-alarm-sound.mjs`, `make-warn-sound.mjs`), keystore, `copy-web.mjs`
