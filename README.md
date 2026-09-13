# Boardgame

Bräddspel för mobilen — två spelare, varsin telefon, i realtid, med
flera spel att välja mellan. Webbaserat, byggt i vanilla
HTML/CSS/JavaScript (ES-moduler) med Firebase Realtime Database som
backend. Inga byggverktyg krävs.

## Spel

- **Luffarschack** — tre i rad, klassisk variant med flyttfas: varje
  spelare har bara 3 brickor. Så länge man har färre än 3 ute placerar
  man en ny bricka på valfri tom ruta. När alla 3 är utplacerade byter
  man istället till att FLYTTA en av sina brickor till valfri tom ruta
  varje tur (tryck på en egen bricka för att välja den, sedan på en
  tom ruta för att flytta dit) — brädet blir aldrig fullt, så partiet
  fortsätter tills någon får tre i rad.
- **Othello** (Reversi) — klassiska 8x8-reglerna. Lägg en bricka så att
  den fångar in en eller flera av motståndarens brickor i en rak linje
  (vågrätt, lodrätt eller diagonalt); de fångade brickorna vänds till
  din färg. Saknar man lagliga drag hoppar turen automatiskt över.
  Ronden slutar när ingen av spelarna kan dra mer — flest brickor
  vinner (oavgjort vid lika antal).
- **Backgammon** — fullständiga reglerna inklusive dubbleringstärning
  och gammon/backgammon-poäng (`round.pointValue`, visas som "(2/3
  poäng)" i statusraden). En medveten förenkling: appen kräver inte att
  man spelar tärningarna i den ordning som maximerar hur många som går
  att använda när läget är delvis blockerat — se kommentaren högst upp
  i `js/games/backgammon.js` för detaljer.
- **Sänka skepp** — klassiska reglerna på ett 10x10-hav med fem skepp
  (Hangarfartyg 5, Slagskepp 4, Kryssare 3, Ubåt 3, Jagare 2), renderade
  som riktiga skeppsbilder (`assets/ships/*.png`) istället för gråa
  rutor — en bild per skeppstyp, spänd över de rutor skeppet upptar via
  CSS grid-column/-row-span och roterad 90° för lodrät placering (se
  `renderShipOverlays` i `js/games/battleship.js`). Placera flottan i
  hemlighet (manuellt eller med "Slumpa"), skjut sedan omväxlande mot
  motståndarens hav — turen går alltid vidare efter ett skott oavsett
  träff eller miss. Motståndarens skepp förblir osynliga tills de är
  helt sänkta, då avslöjas just DEN bilden (annars fortfarande bara
  träff/miss-markörer). Den som sänker hela motståndarflottan först
  vinner ronden. Se "Kända begränsningar" nedan angående flottans
  synlighet i databasen (skiljt från UI-döljandet — appen visar aldrig
  motståndarens oskadade skepp, men Firebase-datan är inte låst ner).
- **4 i rad** — klassiskt 7x6-bräde. Man klickar var som helst i en
  kolumn (inte en specifik ruta) — brickan "faller" till den lägsta
  lediga raden i den kolumnen. Först med 4 i rad vågrätt, lodrätt eller
  diagonalt vinner; oavgjort om brädet blir fullt utan att någon vunnit.
- **Dam** — enkel 8x8-variant ("amerikanska" regler): damer flyttar/
  slår ett steg diagonalt åt valfritt håll (ingen flygande dam).
  Slagtvång (måste slå om möjligt) och flerslag (samma bricka måste
  fortsätta slå om den kan, UTOM om den precis krönts till dam — då
  stannar den). Motståndaren förlorar om denne helt saknar lagliga drag
  (inga brickor kvar ELLER blockerad) — inget forcerat oavgjort. Se
  kommentaren högst upp i `js/games/checkers.js` för detaljer. Går även
  att spela mot AI (tre svårighetsgrader, se "Spela mot AI" nedan).
- **Go** (Baduk/Weiqi) — 9x9-bräde ("enkel" storlek), spelat på
  linjeskärningspunkter istället för i rutor (renderas därför helt av
  `js/games/go.js`, inte det generiska rutnätssystemet — en SVG för
  linjenätet plus absolut positionerade klickpunkter). Placera stenar
  växelvis; en sammanhängande grupp fångas och tas bort när den saknar
  friheter (lediga punkter direkt intill). Enkel ko-regel (kan inte
  omedelbart återta en nyss slagen ENSTAKA sten). Passar båda spelarna i
  följd tar ronden slut direkt och räknas med area-poängräkning (egna
  stenar + omringat territorium), plus 6,5 poäng i komi till Vit för att
  Svart alltid börjar. Medvetna förenklingar (ingen manuell
  "döda stenar"-förhandling, ingen fullständig positional superko) —
  se kommentaren högst upp i `js/games/go.js` för detaljer.
- **Kvarn** (Nine Men's Morris/Mühle) — 24 punkter i tre hopkopplade
  fyrkanter, spelat på punkter precis som Go (egen SVG + absolut
  positionerade klickpunkter i `js/games/kvarn.js`, inte det generiska
  rutnätssystemet). Varje spelare har 9 brickor: placeringsfas (en
  bricka per tur på valfri ledig punkt) övergår i flyttfas (en bricka
  längs en linje till en ledig angränsande punkt) när alla 9 är
  utplacerade. Ner till 3 brickor kvar ger flygfas (valfri ledig punkt,
  inte bara angränsande). Tre egna brickor i rad ("kvarn") ger rätt att
  direkt ta bort en av motståndarens brickor — inte en som ingår i
  dennes egen kvarn, om denne har någon bricka som inte gör det.
  Vinner gör den vars motståndare har färre än 3 brickor kvar eller är
  helt blockerad. Medvetna förenklingar (svängande kvarn tillåts
  obegränsat, en dubbel-kvarn i samma drag ger ändå bara EN borttagen
  bricka) — se kommentaren högst upp i `js/games/kvarn.js` för detaljer.
  Går även att spela mot AI (tre svårighetsgrader, se "Spela mot AI"
  nedan).
- **Hex** — 11x11-romb av hopkopplade sexkanter (klassisk tävlingsstorlek).
  Egen rendering i `js/games/hex.js`: hela brädet är EN SVG med
  matematiskt exakt placerade sexkants-`<polygon>`-element, inte
  procentuell CSS-positionering som Go/Kvarn. Svart bygger en obruten
  kedja mellan brädets övre och nedre kant, Vitt mellan vänster och höger
  kant — ren placering, ingen fångst eller flytt, sexkantigt (6-vägs)
  grannskap. Fyra färgade ramfält runt sexkantsrutnätet (samma standardlook
  som referens-Hexbräden) i respektive spelares färg (samma turkos/rosa
  som poängraden), plus koordinatetiketter (bokstäver/siffror) på alla
  fyra kanter, gör det tydligt både vad som är själva spelplanen och åt
  vilket håll var och en bygger. Svap-regeln ("pie rule"): eftersom Svart annars har ett stort
  övertag får Vitt, en gång, som svar på Svarts första drag, "byta sida"
  — transponera den ursprungliga stenen (byt rad/kolumn) och ta över den
  som sin egen, en position som är exakt lika stark som draget var för
  Svart. Oavgjort kan matematiskt aldrig uppstå i Hex.
- **Abalone** — riktig sexkant (61 rutor, rader om 5-6-7-8-9-8-7-6-5),
  14 kulor per spelare i den klassiska startuppställningen. Egen rendering
  i `js/games/abalone.js`: samma matematik som Hex (axiala hex-koordinater)
  men avgränsat till en RIKTIG sexkant istället för en romb. Kulorna är
  egna runda element (radiella gradienter för en glansig "kula"-känsla,
  och tillräcklig kontrast för svarta kulor mot brädets mörka rutor) ovanpå
  sexkantsrutorna, inte rutornas egen fyllnadsfärg. Flytta 1-3 egna kulor
  i en rak rad —
  sidledes kräver att alla destinationsrutor är lediga, längs radens egen
  axel kan man putta en MINDRE motståndargrupp (2 mot 1, 3 mot 1, 3 mot 2)
  om rutan bortom den är ledig eller utanför brädet. En kula som puttas av
  kanten är permanent borta. Vinner gör den som puttar av 6 av
  motståndarens kulor. Spelmotorns kärnfunktion (`tryMove`) delas mellan
  den riktiga servervalideringen och UI:ts beräkning av vilka riktningar
  som är lagliga just nu — se kommentaren högst upp i
  `js/games/abalone.js` för detaljer.

Fler spel läggs till i `js/games/` — se "Lägga till ett nytt spel"
nedan.

## Så funkar det

1. Första gången appen öppnas väljer man sin **profil** — ett namn utan
   lösenord/PIN (se "Kända begränsningar"). Profilen är global (delas
   mellan alla rum) och används både som visningsnamn och som identitet
   i statistiken. Sparas i `localStorage` så man slipper välja om den
   vid varje besök — "byt profil" på hemskärmen för att välja en annan.
2. Spelare 1 väljer direkt ett spel på hemskärmen — inget "skapa
   rum"-mellansteg, inget "bäst av"-val. Rummet skapas direkt och man
   hamnar i en väntelobby med rumskoden synlig. För spel med AI-stöd
   (se nedan) visas istället ett litet lägesval: mot en vän (som
   vanligt) eller mot AI:n direkt.
3. Spelare 2 ser DIREKT på sin egen hemskärm att t.ex. "Kristian
   startade Luffarschack", i en live-uppdaterad lista över öppna spel —
   och kan trycka **Gå med** där. Fungerar även utan att ha fått någon
   länk, så länge båda är på samma app samtidigt. Att skicka en inbjudan
   går fortfarande bra (dela-knappen i lobbyn) — mottagaren behöver bara
   öppna appens startsida, ingen kod krävs (fast en delad länk kan även
   förifylla koden i reservformuläret "Har du en rumskod?", ifall
   spelet av någon anledning inte hunnit synas i listan än).
4. När båda är anslutna startar första ronden med det valda spelets
   regler. Varje drag syncas i realtid till motståndarens telefon.
   Rondar spelas kontinuerligt utan något matchmål: när en rond får en
   vinnare loggas resultatet direkt till statistiken, men en NY rond
   startar först när BÅDA spelarna tryckt **Spela igen** — vem som
   helst kan istället lämna rummet när som helst.

## Spela mot AI

Vissa spel (hittills **Dam** och **Kvarn**) kan spelas mot en inbyggd
AI-motståndare istället för mot en vän — inget rum, ingen Firebase
inblandad alls: hela partiet körs lokalt i webbläsaren (se
`startLocalGame`/`applyLocalAction`/`scheduleAiTurn` i `js/main.js`).
AI:n exponeras av spelmodulen själv via en valfri `getAiMove(round,
aiSymbol, difficulty)`-export (se `js/games/checkers.js`/
`js/games/kvarn.js`) och markeras med `meta.supportsAi = true` — det är
det enda som krävs för att ett spel ska få lägesvalet "vän eller AI" på
hemskärmen.

Tre svårighetsgrader (`easy`/`medium`/`hard`):

- **Lätt** — helt slumpmässigt bland lagliga drag (slagtvång gäller
  fortfarande, det är en spelregel — men VILKET drag/slag är
  slumpmässigt).
- **Medel**/**Svår** — minimax med alpha-beta-beskärning och tidsbudget
  (iterative deepening: djupet ökas tills en tidsgräns nås, ~250 ms
  respektive ~700 ms per drag), så svarstiden är förutsägbar oavsett hur
  komplex ställningen är. Återanvänder spelets EGNA `applyAction`/
  legalitetsfunktioner för att simulera drag under sökningen istället för
  att duplicera regellogiken — AI:n kan alltså aldrig råka "hitta på" ett
  drag den riktiga motorn skulle underkänt.

AI-partier loggas INTE till statistiken (den är till för matcher mellan
riktiga profiler).

## Statistik/leaderboard

Alla profiler kan se allas statistik (öppen leaderboard, inget privat
läge). Från hemskärmen → **Statistik**:

- **Topplista** (standardvy) — rankad efter flest vinster inom valt
  filter, med förluster/oavgjorda/vinstprocent.
- **Head-to-head** — välj en specifik motståndare i "Motståndare"-
  filtret för att istället se din egen historik mot just den profilen
  (vinster/förluster/oavgjort + senaste matcherna).
- Filtrera på **spel** (per spel eller alla samlat) och **tidsperiod**
  (idag/senaste veckan/månaden/året/totalt).

All aggregering sker client-side i `js/stats.js` (rena funktioner, inga
DOM-/Firebase-anrop) genom att läsa hela `luffarschack/statsLog` — ett
enkelt, litet dataset för en app som den här, så ingen databas-frågelogik
behövs.

## Regler

Varje spelmodul exporterar `meta.rules` (en array med spelarvänliga
textrader — inte samma sak som de mer implementationsinriktade
kommentarerna högst upp i respektive fil). Regelskärmen (`#screen-rules`)
kan nås på två sätt:

- **Regler**-knappen på hemskärmen — spelväljare med alla spel, minns
  senast valda spelet mellan öppningar.
- **?**-knappen i spelskärmens topbar — öppnar direkt till det pågående
  partiets regler (spelväljaren finns kvar om man vill kika på ett annat
  spels regler också).

"Tillbaka" (✕) går dit man kom ifrån (hemskärmen respektive spelet), inte
alltid till hemskärmen.

## Köra spelet

Spelet **måste** köras via en webbserver (http:// eller https://) — inte
öppnas direkt som fil (file://), eftersom ES-moduler (import/export)
blockeras av webbläsaren annars.

### Snabbast: GitHub Pages
1. Gå till repots Settings → Pages.
2. Under "Build and deployment" → Source: välj "Deploy from a branch",
   branch `main`, mapp `/(root)`.
3. Spara. Efter någon minut är spelet live på
   `https://kkandenas.github.io/Boardgame/`

### Lokalt under utveckling
Valfri enkel statisk server, t.ex.:

    npx serve .

eller Pythons inbyggda server:

    python3 -m http.server 8080

Öppna sedan http://localhost:8080 (eller den port servern anger).

## Filstruktur

    index.html          Markup för samtliga skärmar (profil/hem/lobby/spel/statistik)
    style.css            All styling, mobilanpassad (touch-vänlig, safe-area)
    manifest.json         PWA-manifest ("Lägg till på hemskärmen")
    assets/
      bg-dogs.jpg           Bakgrundsbild på startsidorna (profil/hem/statistik) — se style.css .bg-start
    js/
      firebase.js         Firebase-init + generiska, transaktionssäkra DB-helpers (inkl. dbPush)
      profiles.js          Globala spelarprofiler (skapa/lista/spara i localStorage) + hämta statsLog
      rooms.js             Rum: skapa/gå med, öppna-rum-index (hemskärmens live-lista),
                            spelaridentitet, drag- och rondövergångar, rondslut + ömsesidig
                            "spela igen"-bekräftelse, statistikloggning — helt agnostisk om
                            VILKET spel som spelas
      stats.js              Ren aggregeringslogik för statistik/leaderboard (inga DOM-/Firebase-anrop)
      ui.js                All DOM-rendering, bygger brädet dynamiskt utifrån aktivt spel
      main.js              Skärmväxling, formulär, händelsebindning, Firebase-lyssnare
      games/
        registry.js          Register över alla spel (id → modul) — hit läggs nya spel
        shared.js            Hjälpfunktioner gemensamma för alla spel
        tictactoe.js         Luffarschack: regler + UI-hooks (rutnätsbräde)
        othello.js           Othello: regler + UI-hooks (rutnätsbräde)
        backgammon.js         Backgammon: regler + eget bräde (renderBoard)
        battleship.js          Sänka skepp: regler + eget bräde (placering + strid, renderBoard)
        connectfour.js         4 i rad: regler + UI-hooks (rutnätsbräde, klick i kolumn -> droppar)
        checkers.js             Dam: regler + eget bräde (renderBoard) + AI
        go.js                    Go: regler + eget bräde (linjeskärningspunkter, renderBoard)
        kvarn.js                  Kvarn: regler + eget bräde (linjeskärningspunkter, renderBoard) + AI
        hex.js                     Hex: regler + eget bräde (sexkants-SVG, renderBoard)
        abalone.js                  Abalone: regler + eget bräde (sexkants-SVG, renderBoard)

## Lägga till ett nytt spel

Varje fil i `js/games/` (utom `shared.js`/`registry.js`) exporterar
minst:

    meta              { id, label, description, boardClass }
    createBoard()      initial bräda för en ny runda
    applyAction(round, action, playerId, mySymbol, otherPlayerId)
                       ren funktion, returnerar en NY runda (eller
                       samma referens om handlingen var ogiltig).
                       Ansvarar själv för tur-/vinstlogik — inklusive ev.
                       automatiska passningar (othello.js) och ev.
                       round.pointValue för poängbaserade spel
                       (backgammon.js).
    symbolLabel(symbol)?     visningsnamn för X/O (t.ex. "Svart"/"Vitt")
    initialRoundState()?     extra fält på runde-nivå utöver standard
                             (backgammon: tärningar, dubbleringstärning)
    statusText(ctx)          statustext när det inte är vinst/väntan

Sedan väljer spelet EN av två sätt att rendera brädet:

1. **Rutnät** (tictactoe.js/othello.js) — sätt `meta.rows`/`cols`/
   `showGlyph` och exportera `cellInteractable(ctx)` +
   `onCellClick(ctx)`. ui.js bygger och sköter hela rutnätet automatiskt.
2. **Eget bräde** (backgammon.js) — exportera `renderBoard(container, ctx)`
   som bygger HELA sin DOM och binder sina egna klickhanterare direkt
   (`ctx.sendAction`/`ctx.setSelectedCell`). Använd när spelet inte är
   ett enkelt rutnät (annan form, extra kontroller som tärningar/kub).

Lägg sedan till modulen i `js/games/registry.js` och ett spelkort i
`index.html` (`#start-game-picker` på hemskärmen, `data-game-id`
matchar `meta.id`). Resten av appen (rum, matchning, poängräkning) är
redan generiskt.

Vill spelet även gå att spela mot AI (se "Spela mot AI" ovan): sätt
`meta.supportsAi = true` och exportera `getAiMove(round, aiSymbol,
difficulty)` (`difficulty` är `"easy"`/`"medium"`/`"hard"`) som
returnerar en handling i samma format som `applyAction` förväntar sig.
Allt annat (lägesvalsskärmen, det lokala AI-partiet i `js/main.js`)
fungerar automatiskt för alla spel som exponerar den funktionen.

## Teknik i korthet

- Delar Firebase-projekt med det andra spelet i denna organisation
  (samma klientkonfiguration — den är inte hemlig, säkerheten sitter i
  Realtime Database-reglerna). All data för det här spelet ligger
  isolerat under toppnoden `luffarschack/` i databasen: `rooms/` (rum),
  `profiles/` (spelarprofiler), `statsLog/` (append-only-logg över
  avslutade ronder, en post per `dbPush`) och `openRooms/` (lättviktigt
  index — bara {gameId, hostName, hostProfileId, createdAt} per rum i
  väntestatus, det hemskärmens live-lista lyssnar på istället för att
  behöva läsa/filtrera hela `rooms/`-trädet).
- Rumskoder och spelutgång (drag, poängräkning, rondövergångar) skrivs
  via Firebase-transaktioner på hela rum-noden. Det gör operationerna
  idempotenta: båda spelarnas klienter kan räkna ut och skriva samma
  resultat oberoende av varandra utan att krocka — ingen av klienterna
  behöver vara "auktoritativ värd". Rondslut (`finishRound`) och
  statistikloggning fungerar likadant: transaktionen garanterar att bara
  EN av de två klienterna faktiskt loggar en given rond, så ingen
  dubbelloggning kan ske även om båda klienterna märker rondslutet
  samtidigt.
- Spelarprofil sparas i `localStorage` (delas mellan alla rum på samma
  enhet), och rumsspecifik spelaridentitet (playerId) sparas separat per
  rumskod — en omladdning av sidan tappar alltså aldrig bort vare sig
  vem man är eller vilket parti man är mitt i.
- Frånkoppling hanteras med Firebase `onDisconnect` — lämnar spelaren
  (stängd flik, tappad uppkoppling) markeras de som frånkopplade och en
  banner visas för motståndaren.
- Alla interna filer laddas med ett `?v=N`-suffix som bumpas vid varje
  push, så att GitHub Pages/webbläsarens cache aldrig kan servera en
  äldre version av en enskild fil.

## Firebase Security Rules

`database.rules.json` i repo-roten är den PUBLICERADE (inte bara
lokalt sparade) uppsättningen regler — Firebase Console → Realtime
Database → Rules → klistra in hela filens innehåll → Publish. Filen
här i repot är alltså bara dokumentation/källa tills någon faktiskt
klistrar in den i konsolen; att committa den ändrar INGENTING i
databasen automatiskt.

Vad reglerna faktiskt gör:
- `luffarschack/rooms/` — läsbart/skrivbart av alla, ingen
  formvalidering. Rummets `round`/`board`-struktur skiljer sig helt åt
  per spel (och ändras vid nästan varje drag), så att lägga till en
  träffsäker `.validate` där vore både skört och riskerar att av
  misstag blockera legitima drag — bedömdes inte vara värt risken.
- `luffarschack/profiles/`, `luffarschack/statsLog/`,
  `luffarschack/openRooms/` — läsbart av alla, men skrivbart bara EN
  gång per nyckel (`!data.exists()`) plus en lätt formvalidering
  (rätt fält finns, rimlig maxlängd på namn) — de här formen är
  stabila och skrivs alltid som en komplett post i ett enda anrop, så
  validering här är både enkel och riskfri.
- Allt UTANFÖR `luffarschack/` (delas med ett annat spel i samma
  Firebase-projekt) lämnas precis lika öppet som i Test Mode — den här
  sessionen har ingen insyn i det andra spelets kod/databehov, så att
  gissa oss till striktare regler där hade kunnat sabotera det appen.
- Ingen rot-nivå-`.read` sätts längre (Test Mode hade `.read: true` på
  hela databasen) — själva appen läser aldrig roten, så det här stänger
  bara igen ett hål (dumpa HELA databasen, inklusive det andra spelet,
  i en enda begäran) utan att påverka något som faktiskt används.

**Det här är EXPLICIT, PERMANENT publicering av (i stort) samma öppna
åtkomst Test Mode redan gav** — det löser Firebase-varningen om att
Test Mode-reglerna slutar fungera efter 30 dagar, men lägger INTE till
riktig åtkomstkontroll (ingen autentisering finns, se nedan). Reglerna
behöver uppdateras om ett nytt toppnivå-fält läggs till under
`luffarschack/` i framtiden, eller om formen på `profiles`/`statsLog`/
`openRooms` ändras (nya obligatoriska fält) — annars nekas den
skrivningen tyst.

## Kända begränsningar (medvetet inte åtgärdade ännu)

- **Ingen autentisering finns** (matchar appens "inga konton"-
  filosofi) — Firebase Security Rules kan begränsa VAR och i vilken
  GROVA FORM data får skrivas, men kan aldrig verifiera VEM som
  skriver utan någon form av inloggning (t.ex. Firebase Anonymous
  Auth). All `luffarschack/`-data är alltså i praktiken fortfarande
  läsbar/skrivbar av vem som helst med databas-URL:en — precis som
  innan, fast nu permanent istället för att sluta fungera efter 30
  dagar. Detta är extra relevant för **Sänka skepp**: appen döljer
  bara motståndarens flotta i UI:t, den gömmer den inte på riktigt —
  en spelare som tittar i webbläsarens nätverksflik kan i teorin se
  var motståndarens skepp ligger.
- **Profiler har varken lösenord eller PIN** — ett medvetet val (matchar
  appens "inga konton"-filosofi) men det betyder att vem som helst med
  tillgång till appen kan välja en befintlig profil (t.ex. "Kristian")
  och spela/logga statistik i dess namn. Fungerar bra bland betrodda
  spelare, men lita inte på leaderboarden som bevis mot någon som vill
  fuska.
- Öppna rum är **globalt synliga för alla profiler** — precis som
  leaderboarden är detta ett medvetet val (ingen "vänner"-koppling
  finns), men det betyder att vem som helst med appen öppen kan se och
  gå med i vilket väntande rum som helst, inte bara de man själv blivit
  inbjuden till.
- Rum som blir övergivna UTAN att värden trycker "Avbryt" (t.ex. stängd
  flik/app) städas inte bort — varken själva rummet eller dess post i
  `openRooms/`, så de kan fortsätta synas som "väntar" i listan trots
  att ingen längre är där. `statsLog` växer också obegränsat (litet
  dataset för en hobbyapp, men inget städas bort automatiskt).
- Att gå med i ett rum är EN läsning + EN skrivning, ingen transaktion
  (se kommentaren i `rooms.js` joinRoom) — om två spelare skulle trycka
  "Gå med" på exakt samma rum i exakt samma millisekund kan den sista
  skrivningen skriva över den första. Mer sannolikt nu än tidigare
  eftersom öppna rum är synliga för fler samtidigt, men fortfarande ett
  medvetet accepterat, försumbart edge-case för en hobbyapp.
- Ingen chatt eller emote-funktion mellan spelarna ännu.
