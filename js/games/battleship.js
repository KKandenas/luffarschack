// battleship.js — Sänka skepp, klassiska regler. 10x10-bräde, 5 skepp
// (5,4,3,2,3 rutor), ett skott per tur oavsett träff/miss.
//
// KÄND BEGRÄNSNING (samma kategori som redan står i README): Firebase
// Security Rules är inte konfigurerade, så BÅDA spelarnas flottor ligger
// tekniskt läsbara för båda klienterna i databasen — appen döljer bara
// motståndarens skepp i UI:t, den gömmer dem inte på riktigt. En spelare
// som tittar i webbläsarens nätverksflik kan i teorin se var
// motståndarens skepp ligger.
//
// Ren spellogik (inga sidoeffekter, inget DOM/Firebase) + renderBoard
// (eget bräde — två hav, inte det generiska rutnätet).

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "battleship",
    label: "Sänka skepp",
    description: "Placera din flotta i hemlighet, sänk motståndarens skepp först.",
    boardClass: "board--battleship",
    rules: [
        "Placera din flotta i hemlighet på ditt eget hav: Hangarfartyg (5 rutor), Slagskepp (4), Kryssare (3), Ubåt (3) och Jagare (2). Placera manuellt eller tryck \"Slumpa\".",
        "När båda spelarna är klara skjuter ni omväxlande mot varandras hav.",
        "Turen går vidare efter varje skott, oavsett om du träffar eller missar.",
        "Ett skepp är sänkt när alla dess rutor är träffade. Den som sänker hela motståndarens flotta först vinner ronden.",
    ],
};

const GRID_SIZE = 10;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const SHIP_SPECS = [
    { name: "Hangarfartyg", length: 5, img: "carrier" },
    { name: "Slagskepp", length: 4, img: "battleship" },
    { name: "Kryssare", length: 3, img: "cruiser" },
    { name: "Ubåt", length: 3, img: "submarine" },
    { name: "Jagare", length: 2, img: "destroyer" },
];

export function createBoard() {
    return {
        fleets: {
            X: { ships: null },
            O: { ships: null },
        },
        shots: { X: {}, O: {} },
    };
}

export function initialRoundState() {
    return { phase: "placing" };
}

function isStraightContiguous(cells) {
    if (cells.length === 1) return true;
    const rows = cells.map((c) => Math.floor(c / GRID_SIZE));
    const cols = cells.map((c) => c % GRID_SIZE);
    const sameRow = rows.every((r) => r === rows[0]);
    const sameCol = cols.every((c) => c === cols[0]);
    if (sameRow) {
        const sorted = [...cols].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return false;
        return true;
    }
    if (sameCol) {
        const sorted = [...rows].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return false;
        return true;
    }
    return false;
}

// Kontrollerar att en flotta har rätt antal skepp av rätt längder, alla
// inom brädet, inga överlapp, och att varje skepp är en rak sammanhängande
// linje. Skepp får ligga an mot varandra (klassiska regler kräver inget
// mellanrum).
export function validateFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== SHIP_SPECS.length) return false;
    const gotLengths = ships.map((s) => (Array.isArray(s?.cells) ? s.cells.length : -1)).sort((a, b) => a - b);
    const wantLengths = SHIP_SPECS.map((s) => s.length).sort((a, b) => a - b);
    if (gotLengths.some((l, i) => l !== wantLengths[i])) return false;

    const seen = new Set();
    for (const ship of ships) {
        const cells = ship.cells;
        for (const c of cells) {
            if (!Number.isInteger(c) || c < 0 || c >= CELL_COUNT) return false;
            if (seen.has(c)) return false;
            seen.add(c);
        }
        if (!isStraightContiguous(cells)) return false;
    }
    return true;
}

function shipsWithHits(ships) {
    return ships.map((s, i) => ({ id: i, cells: s.cells.slice(), hits: s.cells.map(() => false) }));
}

// Riktiga Firebase Realtime Database lagrar ALDRIG ett tomt objekt heller
// — precis som en explicit `null` tas noden bort helt, och det kaskaderar:
// `{ships: null}` blir `{}` när `ships` strippas, och det TOMMA objektet
// försvinner i sin tur. Så `round.board.fleets`/`round.board.shots` (och
// till och med `round.board` självt, innan någon flotta placerats) kan bli
// `undefined` efter en tur-och-retur genom databasen, trots att de aldrig
// explicit sattes till null. Samma bugklass som tidigare bet i backgammon —
// därför läses ALLT härifrån via valfri kedjning (`?.`) med falsy-fallback,
// aldrig direkt indexering.
function fleetOf(board, symbol) {
    return board?.fleets?.[symbol] || null;
}

function shotsOf(board, symbol) {
    return board?.shots?.[symbol] || {};
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (!action) return round;

    if (action.type === "place-fleet") {
        if (round.phase !== "placing") return round;
        if (fleetOf(round.board, mySymbol)?.ships) return round; // redan inskickad
        if (!validateFleet(action.ships)) return round;

        const fleets = { ...round.board?.fleets, [mySymbol]: { ships: shipsWithHits(action.ships) } };
        const board = { ...round.board, fleets };
        const bothReady = !!(fleets.X?.ships && fleets.O?.ships);
        return { ...round, board, phase: bothReady ? "battle" : "placing" };
    }

    if (action.type === "fire") {
        if (round.phase !== "battle" || round.turn !== playerId) return round;
        const cell = action.cell;
        if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return round;
        const myShotsExisting = shotsOf(round.board, mySymbol);
        if (myShotsExisting[cell] !== undefined) return round; // redan skjutit hit

        const otherSymbol = otherSymbolOf(mySymbol);
        const targetShips = fleetOf(round.board, otherSymbol)?.ships || [];
        let hitShipIndex = -1;
        let hitCellIndex = -1;
        targetShips.forEach((ship, si) => {
            const ci = ship.cells.indexOf(cell);
            if (ci !== -1) { hitShipIndex = si; hitCellIndex = ci; }
        });
        const isHit = hitShipIndex !== -1;

        const shots = { ...round.board?.shots, [mySymbol]: { ...myShotsExisting, [cell]: isHit ? "hit" : "miss" } };
        const newShips = isHit
            ? targetShips.map((ship, si) => {
                if (si !== hitShipIndex) return ship;
                const hits = ship.hits.slice();
                hits[hitCellIndex] = true;
                return { ...ship, hits };
            })
            : targetShips;
        const fleets = { ...round.board?.fleets, [otherSymbol]: { ships: newShips } };
        const board = { ...round.board, shots, fleets };

        const allSunk = newShips.every((s) => s.hits.every(Boolean));
        // `symbol` behövs i renderingen för att avgöra VILKET av de två
        // haven skottet ska markeras på (den som sköt ser det på sitt eget
        // "motståndarens hav", den som blev träffad ser det på sitt "mitt
        // hav") — samma cellindex existerar annars på båda haven.
        const lastMove = { cell, symbol: mySymbol };
        if (allSunk) {
            return { ...round, board, winner: mySymbol, winLine: null, lastMove };
        }
        return { ...round, board, turn: otherPlayerId, lastMove };
    }

    return round;
}

export function statusText({ round, myTurn, mySymbol }) {
    if (round.phase === "placing") {
        const mine = fleetOf(round.board, mySymbol)?.ships;
        return mine ? "Väntar på att motståndaren ska placera sin flotta…" : "Placera din flotta";
    }
    return myTurn ? "Din tur — skjut mot motståndarens hav" : "Motståndarens tur…";
}

// ============================================================
// Rendering — sänka skepp har ett eget bräde (två hav, olika
// interaktivitet i placerings- vs stridsfas), inte det generiska
// rutnätet ui.js annars bygger. Placeringens utkast (vilka rutor varje
// skepp preliminärt ligger på INNAN "Redo" trycks) är ren lokal
// UI-state som aldrig syncas — bara den slutgiltiga flottan skickas.
// ============================================================

let draft = { roundNumber: null, orientation: "h", ships: SHIP_SPECS.map(() => null), selected: 0 };

function resetDraft(roundNumber) {
    draft = { roundNumber, orientation: "h", ships: SHIP_SPECS.map(() => null), selected: 0 };
}

function firstUnplacedIndex(ships) {
    const idx = ships.findIndex((s) => !s);
    return idx === -1 ? ships.length - 1 : idx;
}

function computeCells(startCell, length, orientation) {
    const row = Math.floor(startCell / GRID_SIZE);
    const col = startCell % GRID_SIZE;
    const cells = [];
    for (let i = 0; i < length; i++) {
        const r = orientation === "v" ? row + i : row;
        const c = orientation === "h" ? col + i : col;
        if (r >= GRID_SIZE || c >= GRID_SIZE) return null; // utanför brädet
        cells.push(r * GRID_SIZE + c);
    }
    return cells;
}

function canPlace(ships, shipIndex, cells) {
    if (!cells) return false;
    const occupied = new Set();
    ships.forEach((s, i) => { if (s && i !== shipIndex) s.cells.forEach((c) => occupied.add(c)); });
    return cells.every((c) => !occupied.has(c));
}

function randomFleet() {
    for (let attempt = 0; attempt < 300; attempt++) {
        const occupied = new Set();
        const ships = [];
        let ok = true;
        for (const spec of SHIP_SPECS) {
            let placed = false;
            for (let tries = 0; tries < 200 && !placed; tries++) {
                const horizontal = Math.random() < 0.5;
                const row = Math.floor(Math.random() * GRID_SIZE);
                const col = Math.floor(Math.random() * GRID_SIZE);
                const cells = computeCells(row * GRID_SIZE + col, spec.length, horizontal ? "h" : "v");
                if (!cells || cells.some((c) => occupied.has(c))) continue;
                cells.forEach((c) => occupied.add(c));
                ships.push({ cells });
                placed = true;
            }
            if (!placed) { ok = false; break; }
        }
        if (ok) return ships;
    }
    return null; // ska i praktiken aldrig hända på ett 10x10-bräde med denna flotta
}

function buildGrid(container, extraClass) {
    const grid = document.createElement("div");
    grid.className = `ss-grid ${extraClass}`;
    return grid;
}

// Ger en cell EXPLICIT grid-column/-row istället för att förlita sig på
// CSS Grids auto-placering — annars "reserverar" skeppsöverlagren (som
// alltid är explicit placerade, se renderShipOverlays) sina rutor INNAN
// auto-placeringen hunnit lägga cellknapparna där, vilket tvingar undan
// precis lika många celler till en HELT NY, extra rad längst ner (brädet
// slutar inte längre se ut som 10x10). Genom att själva ge alla 100
// celler samma explicita placering som skeppsöverlagren finns det
// aldrig någon auto-placerad cell som kan bli undanträngd.
function setCellGridPosition(el, cellIndex) {
    const row = Math.floor(cellIndex / GRID_SIZE);
    const col = cellIndex % GRID_SIZE;
    el.style.gridColumn = String(col + 1);
    el.style.gridRow = String(row + 1);
}

function shipOrientation(cells) {
    const rows = cells.map((c) => Math.floor(c / GRID_SIZE));
    return rows.every((r) => r === rows[0]) ? "h" : "v";
}

// Lägger skeppsbilder OVANPÅ rutnätet, positionerade via CSS grid-column/
// -row-span (samma teknik som backgammons bar/hem-bärning) istället för
// att höra till en enskild ruta — annars går det inte att visa EN
// sammanhängande bild över flera rutor. `ships[i]` måste motsvara
// SHIP_SPECS[i] (samma ordning hela vägen från draft/place-fleet).
// `onlySunk`: används för MOTSTÅNDARENS hav — ett oskadat skepp får
// aldrig avslöjas, men ett sänkt skepp är redan känt (alla dess rutor
// är träffade) så det är rättvist att visa bilden där.
function renderShipOverlays(grid, ships, { onlySunk = false } = {}) {
    ships.forEach((ship, i) => {
        if (!ship || !Array.isArray(ship.cells)) return;
        if (onlySunk && !(ship.hits && ship.hits.every(Boolean))) return;
        const spec = SHIP_SPECS[i];
        if (!spec) return;

        const cells = ship.cells;
        const orientation = shipOrientation(cells);
        const minRow = Math.min(...cells.map((c) => Math.floor(c / GRID_SIZE)));
        const minCol = Math.min(...cells.map((c) => c % GRID_SIZE));

        const wrap = document.createElement("div");
        wrap.className = "ss-ship-overlay";
        if (orientation === "h") {
            wrap.style.gridColumn = `${minCol + 1} / span ${spec.length}`;
            wrap.style.gridRow = `${minRow + 1} / span 1`;
        } else {
            wrap.style.gridColumn = `${minCol + 1} / span 1`;
            wrap.style.gridRow = `${minRow + 1} / span ${spec.length}`;
        }

        const img = document.createElement("img");
        img.className = "ss-ship-img";
        img.src = `assets/ships/${spec.img}.png`;
        img.alt = spec.name;
        img.draggable = false;
        wrap.appendChild(img);
        grid.appendChild(wrap);

        if (orientation === "v") {
            // CSS kan inte uttrycka "min bredd = förälderns höjd" (procent
            // löser sig alltid mot samma axel) — bilden är i grunden
            // vågrät (samma fil som för ett liggande skepp), så för att
            // rotera den 90° och fylla den nu höga, smala rutans FULLA
            // längd måste bredden sättas om till ett PIXELVÄRDE från
            // brädets faktiska renderade höjd, uppmätt precis efter att
            // wrappern satts in (tvingar fram en synkron layout-läsning,
            // men det är bara 5 skepp per bräde så kostnaden är obetydlig).
            // Höjden lämnas till CSS:ens height:auto (samma proportionella
            // "fyll alltid längden fullt, låt tjockleken följa bildens
            // egna proportioner"-princip som vågräta skepp använder).
            const rect = wrap.getBoundingClientRect();
            img.style.width = `${rect.height}px`;
            img.classList.add("vertical");
        }
    });
}

// Ett eget, litet lager OVANPÅ skeppsbilderna för träff/miss-markörer —
// annars skulle en fullstor skeppsbild dölja markören helt för alla
// rutor inom sin egen sträcka (en bild som redan täcker HELA sin ruta
// kan inte "synas igenom" av en bakgrundsfärg på cellen under den,
// oavsett z-index på cellen själv: en pseudo-elements stapling begränsas
// alltid av sin FÖRÄLDERS stapling relativt syskon, den kan aldrig
// "hoppa över" ett syskon med högre z-index). Genom att lägga markören
// som ett helt eget, senare element i samma rutnät (högre z-index, egen
// grid-position) hamnar den garanterat överst oavsett vad som ligger
// under den.
function renderShotMarker(grid, cellIndex, status, sunk) {
    const marker = document.createElement("div");
    marker.className = `ss-shot-marker ${status}`;
    marker.classList.toggle("sunk", !!sunk);
    const row = Math.floor(cellIndex / GRID_SIZE);
    const col = cellIndex % GRID_SIZE;
    marker.style.gridColumn = String(col + 1);
    marker.style.gridRow = String(row + 1);
    grid.appendChild(marker);
}

// Ring runt senaste avfyrade rutan — eget lager OVANPÅ träff/miss-markören
// (som redan finns permanent), samma teknik/motivering som renderShotMarker.
function renderLastMoveMarker(grid, cellIndex) {
    const marker = document.createElement("div");
    marker.className = "ss-last-move";
    const row = Math.floor(cellIndex / GRID_SIZE);
    const col = cellIndex % GRID_SIZE;
    marker.style.gridColumn = String(col + 1);
    marker.style.gridRow = String(row + 1);
    grid.appendChild(marker);
}

function renderPlacementUI(container, ctx) {
    const { sendAction } = ctx;
    const wrap = document.createElement("div");
    wrap.className = "ss-placement";

    const shipList = document.createElement("div");
    shipList.className = "ss-ship-list";
    SHIP_SPECS.forEach((spec, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ss-ship-item";
        item.classList.toggle("placed", !!draft.ships[i]);
        item.classList.toggle("selected", draft.selected === i);
        item.textContent = `${spec.name} (${spec.length})`;
        item.addEventListener("click", () => {
            draft.ships[i] = null; // plocka upp för omplacering om den redan låg någonstans
            draft.selected = i;
            renderPlacementUI(container, ctx);
        });
        shipList.appendChild(item);
    });
    wrap.appendChild(shipList);

    const controls = document.createElement("div");
    controls.className = "ss-controls";

    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "btn btn-secondary bg-action-btn";
    rotateBtn.textContent = draft.orientation === "h" ? "Riktning: Vågrät" : "Riktning: Lodrät";
    rotateBtn.addEventListener("click", () => {
        draft.orientation = draft.orientation === "h" ? "v" : "h";
        renderPlacementUI(container, ctx);
    });
    controls.appendChild(rotateBtn);

    const randomBtn = document.createElement("button");
    randomBtn.type = "button";
    randomBtn.className = "btn btn-secondary bg-action-btn";
    randomBtn.textContent = "Slumpa";
    randomBtn.addEventListener("click", () => {
        const random = randomFleet();
        if (random) {
            draft.ships = random.map((s) => ({ cells: s.cells }));
            draft.selected = draft.ships.length - 1;
            renderPlacementUI(container, ctx);
        }
    });
    controls.appendChild(randomBtn);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-ghost bg-action-btn";
    clearBtn.textContent = "Rensa";
    clearBtn.addEventListener("click", () => {
        draft.ships = SHIP_SPECS.map(() => null);
        draft.selected = 0;
        renderPlacementUI(container, ctx);
    });
    controls.appendChild(clearBtn);
    wrap.appendChild(controls);

    const allPlaced = draft.ships.every(Boolean);
    if (allPlaced) {
        const readyBtn = document.createElement("button");
        readyBtn.type = "button";
        readyBtn.className = "btn btn-primary ss-ready-btn";
        readyBtn.textContent = "Redo!";
        readyBtn.addEventListener("click", () => {
            sendAction({ type: "place-fleet", ships: draft.ships.map((s) => ({ cells: s.cells })) });
        });
        wrap.appendChild(readyBtn);
    } else {
        const hint = document.createElement("p");
        hint.className = "ss-hint-text";
        hint.textContent = "Välj en ruta på brädet för att placera det markerade skeppet.";
        wrap.appendChild(hint);
    }

    const grid = buildGrid(container, "ss-grid-own ss-grid-primary");

    for (let i = 0; i < CELL_COUNT; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ss-cell";
        setCellGridPosition(btn, i);
        btn.addEventListener("click", () => {
            const shipIndex = draft.selected;
            if (draft.ships[shipIndex]) return; // redan placerad — välj den i listan för att flytta den
            const spec = SHIP_SPECS[shipIndex];
            const cells = computeCells(i, spec.length, draft.orientation);
            if (!canPlace(draft.ships, shipIndex, cells)) return;
            draft.ships[shipIndex] = { cells };
            draft.selected = firstUnplacedIndex(draft.ships);
            renderPlacementUI(container, ctx);
        });
        grid.appendChild(btn);
    }
    wrap.appendChild(grid);

    container.innerHTML = "";
    container.appendChild(wrap);
    // Måste ske EFTER att grid sitter i det LEVANDE dokumentet — annars
    // ger getBoundingClientRect() (för lodräta skepp, se renderShipOverlays)
    // bara nollor, eftersom ett frånkopplat element aldrig får en layout.
    renderShipOverlays(grid, draft.ships);
}

function renderWaitingBoard(container, ships) {
    const wrap = document.createElement("div");
    wrap.className = "ss-placement";

    const label = document.createElement("p");
    label.className = "ss-hint-text";
    label.textContent = "Din flotta är placerad. Väntar på motståndaren…";
    wrap.appendChild(label);

    const grid = buildGrid(container, "ss-grid-own ss-grid-primary");
    for (let i = 0; i < CELL_COUNT; i++) {
        const cell = document.createElement("div");
        cell.className = "ss-cell";
        setCellGridPosition(cell, i);
        grid.appendChild(cell);
    }
    wrap.appendChild(grid);

    container.innerHTML = "";
    container.appendChild(wrap);
    renderShipOverlays(grid, ships);
}

function renderBattleBoards(container, ctx) {
    const { round, mySymbol, myTurn, sendAction } = ctx;
    const otherSymbol = otherSymbolOf(mySymbol);
    const myShips = fleetOf(round.board, mySymbol)?.ships || [];
    const otherShips = fleetOf(round.board, otherSymbol)?.ships || [];
    const myShots = shotsOf(round.board, mySymbol);
    const otherShots = shotsOf(round.board, otherSymbol);

    const wrap = document.createElement("div");
    wrap.className = "ss-boards";

    const ownLabel = document.createElement("div");
    ownLabel.className = "ss-board-label";
    ownLabel.textContent = "Mitt hav";
    wrap.appendChild(ownLabel);

    const ownGrid = buildGrid(container, "ss-grid-own");
    const myShipCells = {};
    myShips.forEach((s, i) => s.cells.forEach((c) => { myShipCells[c] = i; }));
    for (let i = 0; i < CELL_COUNT; i++) {
        const cell = document.createElement("div");
        cell.className = "ss-cell";
        setCellGridPosition(cell, i);
        ownGrid.appendChild(cell);
    }
    wrap.appendChild(ownGrid);

    const targetLabel = document.createElement("div");
    targetLabel.className = "ss-board-label";
    targetLabel.textContent = "Motståndarens hav";
    wrap.appendChild(targetLabel);

    const targetGrid = buildGrid(container, "ss-grid-target ss-grid-primary");
    for (let i = 0; i < CELL_COUNT; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ss-cell";
        setCellGridPosition(btn, i);
        const shot = myShots[i];
        const canFire = myTurn && shot === undefined && !round.winner;
        btn.disabled = !canFire;
        if (canFire) btn.addEventListener("click", () => sendAction({ type: "fire", cell: i }));
        targetGrid.appendChild(btn);
    }
    wrap.appendChild(targetGrid);

    container.innerHTML = "";
    container.appendChild(wrap);

    // Skeppsbilder + träff/miss-markörer läggs EFTER att rutnäten sitter i
    // det levande dokumentet (se motsvarande kommentar i renderPlacementUI)
    // — egna havet visar ALLTID egna skepp, motståndarens hav visar bilder
    // BARA för redan sänkta skepp (se renderShipOverlays).
    renderShipOverlays(ownGrid, myShips);
    renderShipOverlays(targetGrid, otherShips, { onlySunk: true });

    for (let i = 0; i < CELL_COUNT; i++) {
        const shot = otherShots[i];
        if (shot === "hit") {
            const ship = myShips[myShipCells[i]];
            renderShotMarker(ownGrid, i, "hit", ship && ship.hits.every(Boolean));
        } else if (shot === "miss") {
            renderShotMarker(ownGrid, i, "miss", false);
        }
    }
    for (let i = 0; i < CELL_COUNT; i++) {
        const shot = myShots[i];
        if (shot === "hit") {
            const ship = otherShips.find((s) => s.cells.includes(i));
            renderShotMarker(targetGrid, i, "hit", ship && ship.hits.every(Boolean));
        } else if (shot === "miss") {
            renderShotMarker(targetGrid, i, "miss", false);
        }
    }

    // Senaste skottet: den som sköt ser det på sitt EGET "motståndarens
    // hav" (targetGrid, byggt av myShots); den som blev träffad ser det på
    // sitt EGET "mitt hav" (ownGrid) — samma cellindex finns på båda haven,
    // så vi måste veta VEM som sköt (round.lastMove.symbol) för att välja
    // rätt rutnät, annars hamnar ringen på fel spelares hav.
    if (round.lastMove) {
        const grid = round.lastMove.symbol === mySymbol ? targetGrid : ownGrid;
        renderLastMoveMarker(grid, round.lastMove.cell);
    }
}

export function renderBoard(container, ctx) {
    const { round, mySymbol } = ctx;
    if (draft.roundNumber !== round.roundNumber) resetDraft(round.roundNumber);

    const myShips = fleetOf(round.board, mySymbol)?.ships;

    if (round.phase === "placing" && !myShips) {
        renderPlacementUI(container, ctx);
        return;
    }
    if (round.phase === "placing" && myShips) {
        renderWaitingBoard(container, myShips);
        return;
    }
    renderBattleBoards(container, ctx);
}
