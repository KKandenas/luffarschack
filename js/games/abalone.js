// abalone.js — Abalone, klassiska reglerna. Sexkantigt bräde (sidlängd 5,
// 61 rutor: rader om 5-6-7-8-9-8-7-6-5), 14 kulor per spelare, spelat med
// samma X/O-symboler som resten av appen (X = svart, börjar alltid;
// O = vit).
//
// Regler: flytta 1, 2 eller 3 av dina EGNA kulor i en rak, sammanhängande
// rad åt gången, i en av de 6 sexkants-riktningarna:
// - Sidledes (broadside) — riktningen är VINKELRÄT mot radens egen axel.
//   Alla destinationsrutor måste vara helt lediga (aldrig någon putt).
// - Längs linjens egen axel (in-line) — rutan direkt framför den främsta
//   kulan avgör:
//     - Ledig: enkel förflyttning, hela raden skjuts ett steg framåt.
//     - Egen kula: olagligt (kan inte putta sina egna).
//     - Motståndarkulor: "sumito" — tillåtet ENDAST om din grupp är
//       STÖRRE än motståndarens sammanhängande grupp i den riktningen
//       (2 mot 1, 3 mot 1, 3 mot 2 — ALDRIG lika stora eller mindre), och
//       rutan direkt bortom motståndargruppen måste vara ledig ELLER
//       utanför brädet. En kula som puttas av brädets kant är permanent
//       borta (räknas som fångad).
// Vinst: motståndaren har förlorat 6 kulor (dvs. har högst 14-6=8 kvar
// på brädet).
//
// Koordinatsystem: axiala hex-koordinater (q, r) — samma matematik som
// hex.js (spetsig-topp-sexkantsrutnät), men här avgränsat till en RIKTIG
// sexkant (|q|,|r|,|q+r| <= 4, "radie" 4) istället för hex.js:s romb.
// Kulorna är EGNA runda element OVANPÅ sexkantsrutorna (spelpjäser i
// celler, med en radiell gradient för glansig "kula"-känsla och tillräcklig
// kontrast mot det mörka brädet) — inte punkter på linjeskärningar
// (Go/Kvarn) och inte bara en engångsplacering i en tom ruta (Hex). Se
// rendering-sektionen längst ner för själva pixel-omvandlingen.

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "abalone",
    label: "Abalone",
    description: "Putta 6 av motståndarens kulor av det sexkantiga brädets kant för att vinna.",
    boardClass: "board--abalone",
    rules: [
        "Varje spelare har 14 kulor på ett sexkantigt bräde. Flytta 1, 2 eller 3 av dina egna kulor i en rak, sammanhängande rad åt gången.",
        "Sidledes (vinkelrätt mot radens egen linje): alla rutor du flyttar till måste vara helt lediga.",
        "Längs radens egen linje: rutan framför måste antingen vara ledig, eller innehålla FÄRRE motståndarkulor i rad än din egen grupp (t.ex. 2 mot 1, 3 mot 1, 3 mot 2 — aldrig lika stora eller fler) — då puttar du dem framåt. Rutan direkt bortom motståndargruppen måste vara ledig eller utanför brädet.",
        "En kula som puttas av brädets kant är permanent borta.",
        "Du vinner när motståndaren har förlorat 6 kulor.",
    ],
};

const RADIUS = 4; // sidlängd 5 => radie 4, 61 rutor totalt
const MARBLES_PER_PLAYER = 14;
const MARBLES_TO_WIN = 6;

// --- Axiala hex-koordinater: enumerera alla 61 giltiga (q, r) en gång
// vid modulladdning och ge varje en FAST, sekventiell numerisk id (för
// samma Firebase-vänliga platta lagring som resten av appens spel). ---
function rowRForQ(q) {
    const rMin = Math.max(-RADIUS, -RADIUS - q);
    const rMax = Math.min(RADIUS, RADIUS - q);
    const rs = [];
    for (let r = rMin; r <= rMax; r++) rs.push(r);
    return rs;
}

function key(q, r) { return `${q},${r}`; }

const CELLS = [];
const ID_BY_KEY = new Map();
for (let q = -RADIUS; q <= RADIUS; q++) {
    for (const r of rowRForQ(q)) {
        ID_BY_KEY.set(key(q, r), CELLS.length);
        CELLS.push({ q, r });
    }
}
const CELL_COUNT = CELLS.length; // 61

function cellId(q, r) {
    return ID_BY_KEY.get(key(q, r));
}

// De 6 sexkants-grannriktningarna i axiala koordinater — tre axlar, två
// motsatta riktningar var (index i <-> index OPPOSITE_INDEX[i]).
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const OPPOSITE_INDEX = [1, 0, 3, 2, 5, 4];

function oppositeDir(dir) {
    const i = DIRECTIONS.findIndex((d) => d[0] === dir[0] && d[1] === dir[1]);
    return DIRECTIONS[OPPOSITE_INDEX[i]];
}

function sameDir(a, b) { return a[0] === b[0] && a[1] === b[1]; }

function neighborId(id, dir) {
    const { q, r } = CELLS[id];
    return cellId(q + dir[0], r + dir[1]);
}

// Mittersta 3 av en radlängd (7 rutor) — det klassiska Abalone-
// startuppställningens tredje, delvis fyllda rad.
function middleThree(rs) {
    const mid = Math.floor(rs.length / 2);
    return [rs[mid - 1], rs[mid], rs[mid + 1]];
}

export function createBoard() {
    const marbles = {};
    for (const r of rowRForQ(-RADIUS)) marbles[cellId(-RADIUS, r)] = "X";
    for (const r of rowRForQ(-RADIUS + 1)) marbles[cellId(-RADIUS + 1, r)] = "X";
    for (const r of middleThree(rowRForQ(-RADIUS + 2))) marbles[cellId(-RADIUS + 2, r)] = "X";
    for (const r of rowRForQ(RADIUS)) marbles[cellId(RADIUS, r)] = "O";
    for (const r of rowRForQ(RADIUS - 1)) marbles[cellId(RADIUS - 1, r)] = "O";
    for (const r of middleThree(rowRForQ(RADIUS - 2))) marbles[cellId(RADIUS - 2, r)] = "O";
    return { marbles };
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

function onBoardCount(marbles, symbol) {
    let n = 0;
    for (const key2 in marbles) if (marbles[key2] === symbol) n++;
    return n;
}

// Avgör om 2-3 celler bildar en rak, sammanhängande rad längs EN av de 3
// hex-axlarna — oberoende av vilken ordning de skickas in i. Returnerar
// en representativ riktningsvektor för axeln (den ena av de två motsatta
// riktningarna, spelar ingen roll vilken — jämförs alltid via sameDir
// mot BÅDA dir och oppositeDir(dir) där den används), eller `null` om
// cellerna inte bildar en giltig linje.
function lineDirectionOf(cells) {
    if (cells.length < 2) return null; // en enda cell har ingen axel att tala om
    if (cells.length === 2) {
        for (const dir of DIRECTIONS) {
            if (neighborId(cells[0], dir) === cells[1]) return dir;
        }
        return null;
    }
    // längd 3: pröva varje riktning och varje cell som tänkt "start".
    for (const dir of DIRECTIONS) {
        for (const start of cells) {
            const mid = neighborId(start, dir);
            const end = mid !== undefined ? neighborId(mid, dir) : undefined;
            if (mid === undefined || end === undefined) continue;
            const set = new Set([start, mid, end]);
            if (set.size === 3 && cells.every((c) => set.has(c))) return dir;
        }
    }
    return null;
}

// Sorterar en giltig linjes celler så att INDEX 0 är den BAKRE änden och
// SISTA index den FRÄMRE änden, relativt den faktiska rörelseriktningen
// `dir` (som kan vara endera hållet längs linjens axel — "bakre"/"främre"
// beror alltså på VILKET håll man faktiskt flyttar, inte på cellernas
// ursprungliga inbördes ordning).
function orderAlong(cells, dir) {
    const set = new Set(cells);
    const back = cells.find((c) => !set.has(neighborId(c, oppositeDir(dir))));
    const ordered = [back];
    let cur = back;
    while (ordered.length < cells.length) {
        cur = neighborId(cur, dir);
        ordered.push(cur);
    }
    return ordered;
}

// Kärnan i spelmotorn: försöker göra draget (UTAN sidoeffekter på
// `marbles`) — returnerar det NYA marbles-objektet vid ett lagligt drag,
// annars `null`. Delas mellan applyAction (det RIKTIGA draget) och UI:ts
// beräkning av vilka av de 6 riktningarna som är lagliga just nu för en
// given markering (samma logik, aldrig risk att de hamnar ur synk).
function tryMove(marbles, cells, dir, mySymbol) {
    if (!Array.isArray(cells) || cells.length < 1 || cells.length > 3) return null;
    const seen = new Set();
    for (const c of cells) {
        if (!CELLS[c] || marbles[c] !== mySymbol) return null;
        if (seen.has(c)) return null;
        seen.add(c);
    }

    const axis = cells.length > 1 ? lineDirectionOf(cells) : null;
    if (cells.length > 1 && axis === null) return null; // inte en rak, sammanhängande rad
    const isInline = axis !== null && (sameDir(dir, axis) || sameDir(dir, oppositeDir(axis)));

    if (!isInline) {
        // Enkel kula, ELLER sidledes (broadside) — alla destinationer MÅSTE
        // vara helt lediga (aldrig någon putt vid ett sidledes-drag).
        // `targets`: ALLA destinationsrutorna (inte bara en) — annars kan
        // en spelare som klickar på "sin egen" kulas naturliga destination
        // (istället för den ENDA ruta som råkade väljas som indikator)
        // uppleva att klicket inte gör något alls.
        const destinations = cells.map((c) => neighborId(c, dir));
        if (destinations.some((d) => d === undefined || marbles[d])) return null;
        const next = { ...marbles };
        for (const c of cells) delete next[c];
        for (const d of destinations) next[d] = mySymbol;
        return { marbles: next, targets: destinations };
    }

    const ordered = orderAlong(cells, dir);
    const front = ordered[ordered.length - 1];
    const firstBeyond = neighborId(front, dir);
    if (firstBeyond === undefined) return null; // brädets kant — inget att flytta in i

    if (!marbles[firstBeyond]) {
        const next = { ...marbles };
        for (const c of ordered) delete next[c];
        for (const c of ordered) next[neighborId(c, dir)] = mySymbol;
        return { marbles: next, targets: [firstBeyond] };
    }
    if (marbles[firstBeyond] === mySymbol) return null; // blockerad av egen kula

    // Sumito: räkna motståndarens SAMMANHÄNGANDE kulor i samma riktning.
    const otherSymbol = otherSymbolOf(mySymbol);
    const pushed = [];
    let cursor = firstBeyond;
    while (cursor !== undefined && marbles[cursor] === otherSymbol) {
        pushed.push(cursor);
        cursor = neighborId(cursor, dir);
    }
    if (pushed.length >= cells.length) return null; // måste vara STRIKT färre än min grupp
    if (cursor !== undefined && marbles[cursor]) return null; // blockerad bortom motståndargruppen

    const next = { ...marbles };
    for (const c of ordered) delete next[c];
    for (const c of pushed) delete next[c];
    for (const c of ordered) next[neighborId(c, dir)] = mySymbol;
    for (const c of pushed) {
        const dest = neighborId(c, dir);
        if (dest !== undefined) next[dest] = otherSymbol; // fortfarande på brädet
        // annars: puttad AV brädet — permanent borta (fångad).
    }
    // `targets` = [rutan framför gruppen] (firstBeyond) — INTE nödvändigtvis
    // en av `cells` grannar rakt av (för en flerkulsgrupp landar t.ex.
    // neighborId(cells[0], dir) ofta MITT I den egna gruppen om cells[0]
    // råkar vara den BAKRE kulan) — det här var precis den bugg som
    // gjorde att UI:t först pekade ut fel ruta som klickbar indikator för
    // flerkuls-drag längs linjens egen axel.
    return { marbles: next, targets: [firstBeyond] };
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;
    if (!action || action.type !== "move") return round;

    const marbles = round.board?.marbles || {};
    const dir = DIRECTIONS.find((d) => action.direction && d[0] === action.direction[0] && d[1] === action.direction[1]);
    if (!dir) return round;

    const result = tryMove(marbles, action.cells, dir, mySymbol);
    if (!result) return round;
    const nextMarbles = result.marbles;

    const board = { marbles: nextMarbles };
    const otherSymbol = otherSymbolOf(mySymbol);
    const otherCount = onBoardCount(nextMarbles, otherSymbol);
    // Cellerna som NU innehåller min symbol men INTE gjorde det innan
    // draget — robust mot push/broadside/ordning (ingen risk att räkna
    // fel jämfört med att härleda destinationer manuellt igen här).
    const lastMove = {
        cells: Object.keys(nextMarbles)
            .map(Number)
            .filter((c) => nextMarbles[c] === mySymbol && marbles[c] !== mySymbol),
    };

    if (otherCount <= MARBLES_PER_PLAYER - MARBLES_TO_WIN) {
        return { ...round, board, winner: mySymbol, winLine: null, lastMove };
    }
    return { ...round, board, turn: otherPlayerId, lastMove };
}

export function statusText({ round, myTurn, mySymbol }) {
    if (!myTurn) return "Motståndarens tur…";
    const marbles = round.board?.marbles || {};
    const captured = MARBLES_PER_PLAYER - onBoardCount(marbles, otherSymbolOf(mySymbol));
    return captured > 0
        ? `Din tur — välj 1-3 kulor i rad och en riktning (motståndaren har förlorat ${captured}/${MARBLES_TO_WIN})`
        : "Din tur — välj 1-3 kulor i rad och en riktning";
}

// ============================================================
// Rendering — sexkantsrutor (INTE punkter som Go/Kvarn, INTE en romb som
// hex.js) fyllda med kulans färg när de är upptagna. Samma pixel-
// omvandling som hex.js (axialt sexkantsrutnät, spetsig topp) men
// avgränsad till en RIKTIG sexkant (61 rutor) istället för en romb, och
// utan hex.js:s ramfält (Abalone har inga "kanter man bygger till", bara
// SJÄLVA kanten man kan putta av — det syns redan av att kulor försvinner
// när de puttas dit, ingen extra visuell ram behövs).
// ============================================================

const HEX_R = 1;
const COL_SPACING = Math.sqrt(3) * HEX_R;
const ROW_SHIFT = COL_SPACING / 2;
const ROW_SPACING = 1.5 * HEX_R;
const HALF_W = COL_SPACING / 2;
const HALF_H = HEX_R;

// OBS: här är det `r` (inte `q` som i hex.js) som styr den vertikala
// positionen/radförskjutningen — helt symmetriskt val, men värt att
// notera eftersom hex.js gjorde tvärtom.
function cellCenter(q, r) {
    return { x: q * COL_SPACING + r * ROW_SHIFT, y: r * ROW_SPACING };
}

const CENTERS = CELLS.map(({ q, r }) => cellCenter(q, r));
const VIEW_MIN_X = Math.min(...CENTERS.map((c) => c.x)) - HALF_W;
const VIEW_MAX_X = Math.max(...CENTERS.map((c) => c.x)) + HALF_W;
const VIEW_MIN_Y = Math.min(...CENTERS.map((c) => c.y)) - HALF_H;
const VIEW_MAX_Y = Math.max(...CENTERS.map((c) => c.y)) + HALF_H;
const VIEW_W = VIEW_MAX_X - VIEW_MIN_X;
const VIEW_H = VIEW_MAX_Y - VIEW_MIN_Y;

const HEX_ANGLES = [-90, -30, 30, 90, 150, 210].map((deg) => (deg * Math.PI) / 180);
function hexPoints(cx, cy, r) {
    return HEX_ANGLES.map((a) => `${(cx + r * Math.cos(a)).toFixed(4)},${(cy + r * Math.sin(a)).toFixed(4)}`).join(" ");
}

// Försöker utöka en pågående markering (`current`, 0-2 egna kulor sedan
// tidigare) med `cell` — returnerar den nya markeringen om resultatet
// fortfarande är en giltig, sammanhängande rad om högst 3, annars `null`
// (renderBoard tolkar `null` som "börja om markeringen med bara den här
// kulan" snarare än ett fel, se handleMarbleClick).
function tryExtendSelection(marbles, mySymbol, current, cell) {
    if (current.length >= 3 || marbles[cell] !== mySymbol || current.includes(cell)) return null;
    const candidate = [...current, cell];
    return lineDirectionOf(candidate) !== null ? candidate : null;
}

export function renderBoard(container, ctx) {
    const { round, mySymbol, myTurn, selectedCell, setSelectedCell, sendAction } = ctx;
    const marbles = round.board?.marbles || {};
    const canAct = myTurn && !round.winner;
    const selected = Array.isArray(selectedCell) ? selectedCell : [];
    const lastMoveSet = new Set(round.lastMove?.cells || []);

    // Vilka av de 6 riktningarna är lagliga för DEN NUVARANDE markeringen
    // just nu, och vilken ruta som representerar den riktningen — samma
    // tryMove som den riktiga servervalideringen, bara ett "torrkört"
    // anrop per riktning. tryMove rapporterar SJÄLV rätt indikator-rutor
    // (`targets`) istället för att UI:t gissar dem efteråt — annars pekade
    // en flerkulsgrupps indikator lätt in i sin EGEN grupp istället för
    // den faktiska rutan draget påverkar (se kommentaren i tryMove). Ett
    // sidledes-drag (broadside) ger FLERA klickbara mål-rutor för samma
    // riktning (alla kulorna flyttar samtidigt, ingen naturlig "främre"
    // ruta) — annars kändes det trasigt att klicka på "sin egen" kulas
    // destination inte gjorde något om den råkade vara EN av flera möjliga.
    const hintTargets = new Map(); // cell -> { type: "threat" | "move", dir }
    if (canAct && selected.length > 0) {
        for (const dir of DIRECTIONS) {
            const result = tryMove(marbles, selected, dir, mySymbol);
            if (!result) continue;
            for (const target of result.targets) {
                hintTargets.set(target, { type: marbles[target] ? "threat" : "move", dir });
            }
        }
    }

    function handleMarbleClick(cell) {
        if (!canAct) return;
        if (selected.length === 1 && selected[0] === cell) { setSelectedCell([]); return; }
        const extended = tryExtendSelection(marbles, mySymbol, selected, cell);
        setSelectedCell(extended || [cell]);
    }

    function handleTargetClick(cell) {
        if (!canAct) return;
        const info = hintTargets.get(cell);
        if (!info) return;
        sendAction({ type: "move", cells: selected, direction: info.dir });
        setSelectedCell([]);
    }

    const wrap = document.createElement("div");
    wrap.className = "ab-wrap";

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", `${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "ab-board");
    svg.style.aspectRatio = `${VIEW_W} / ${VIEW_H}`;

    // Radiella gradienter för glansiga, RUNDA kulor (istället för att bara
    // fylla hela sexkantsrutan med kulans platta färg) — en ljus highlight
    // uppe till vänster som tonar ut mot kanten. Löser samtidigt kontrast-
    // problemet för svarta kulor mot det mörka brädet: en ren nästan-svart
    // yta (samma #0c0d10 som Go/Dam/Backgammon använder mot SINA ljusa
    // träbräden) syns knappt mot Abalones egna mörka rutor, men en
    // gradient med en tydlig ljusgrå highlight gör det.
    const defs = document.createElementNS(svgNs, "defs");
    defs.innerHTML = `
        <radialGradient id="ab-grad-x" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#4a4a54"/>
            <stop offset="100%" stop-color="#0c0d10"/>
        </radialGradient>
        <radialGradient id="ab-grad-o" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#dcdcd6"/>
        </radialGradient>
    `;
    svg.appendChild(defs);

    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const { x, y } = CENTERS[cell];
        const poly = document.createElementNS(svgNs, "polygon");
        poly.setAttribute("points", hexPoints(x, y, HEX_R * 0.94));
        poly.dataset.cell = String(cell);

        const symbol = marbles[cell];
        const hint = hintTargets.get(cell);
        const classes = ["ab-cell"];
        if (selected.includes(cell)) classes.push("selected");
        if (lastMoveSet.has(cell)) classes.push("last-move");
        if (hint) classes.push("hint");
        if (hint?.type === "threat") classes.push("threat");
        poly.setAttribute("class", classes.join(" "));

        if (hint) {
            poly.addEventListener("click", () => handleTargetClick(cell));
        } else if (canAct && symbol === mySymbol) {
            poly.addEventListener("click", () => handleMarbleClick(cell));
        }
        svg.appendChild(poly);

        // Kulan är ett EGET, runt element OVANPÅ rutan (inte rutans egen
        // fyllnadsfärg) — pointer-events:none så att klick alltid går
        // igenom till sexkanten under (samma teknik som t.ex. battleship.js
        // skeppsbilder/markörer ovanpå sina egna celler).
        if (symbol) {
            const marble = document.createElementNS(svgNs, "circle");
            marble.setAttribute("cx", x.toFixed(4));
            marble.setAttribute("cy", y.toFixed(4));
            marble.setAttribute("r", String(HEX_R * 0.78));
            marble.setAttribute("class", `ab-marble ${symbol === "X" ? "mark-x" : "mark-o"}`);
            svg.appendChild(marble);
        }
    }

    wrap.appendChild(svg);

    const info = document.createElement("p");
    info.className = "ab-info status-text";
    const capturedX = MARBLES_PER_PLAYER - onBoardCount(marbles, "X");
    const capturedO = MARBLES_PER_PLAYER - onBoardCount(marbles, "O");
    info.textContent = `Puttade av — Svart: ${capturedX}/${MARBLES_TO_WIN} · Vitt: ${capturedO}/${MARBLES_TO_WIN}`;
    wrap.appendChild(info);

    container.innerHTML = "";
    container.appendChild(wrap);
}
