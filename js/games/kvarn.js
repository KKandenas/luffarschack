// kvarn.js — Kvarn (Nine Men's Morris/Mühle), klassiska reglerna. 24
// punkter i tre hopkopplade fyrkanter, 9 brickor per spelare, spelat med
// samma X/O-symboler som resten av appen (X = svart, börjar alltid;
// O = vit).
//
// Faser (samma bräde och regelverk hela vägen, ingen separat "match"):
// - Placeringsfas: spelarna turas om att placera EN bricka på en ledig
//   punkt tills alla 9 per spelare är utplacerade (18 placeringar totalt).
// - Flyttfas: därefter flyttar man istället en av sina brickor längs en
//   linje till en ledig ANGRÄNSANDE punkt (round.placed[symbol] === 9).
// - Flygfas: en spelare som är nere på exakt 3 brickor kvar på brädet får
//   flytta valfri bricka till VILKEN ledig punkt som helst (inte bara
//   angränsande) — standardregel, gör slutspelet spelbart för den som
//   ligger under istället för att bara vara dömd att förlora långsamt.
//
// Kvarn: tre av egna brickor i rad längs en linje (16 möjliga linjer,
// se MILLS) — ger rätt att direkt ta bort en av motståndarens brickor.
// Får INTE ta bort en bricka som ingår i motståndarens egen kvarn, OM
// denne har minst en bricka som inte ingår i någon kvarn.
//
// Medvetna förenklingar (dokumenterade avvägningar, samma anda som
// backgammons/dams/Go:s motsvarande kommentarer):
// - "Svängande kvarn" (flytta en bricka ut ur och tillbaka in i samma
//   kvarn, om och om igen, för upprepade fångster) är INTE spärrad —
//   det är standardregeln i Kvarn (till skillnad från Go:s ko-regel),
//   ingen särskild spärrkod behövs.
// - Bildar ett enda drag TVÅ kvarnar samtidigt (möjligt på vissa
//   korsningspunkter) får man ändå bara ta bort EN bricka, inte två —
//   den vanligaste tävlingsregeln.
//
// Vinst: motståndaren har färre än 3 brickor kvar på brädet (bara
// relevant efter att denne placerat klart, se isFinishedPlacing), eller
// är helt blockerad (inget lagligt drag) i flytt-/flygfasen.

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "kvarn",
    label: "Kvarn",
    description: "Bilda kvarnar (tre i rad) för att ta motståndarens brickor — färre än 3 kvar eller helt blockerad förlorar.",
    boardClass: "board--kvarn",
    rules: [
        "Varje spelare har 9 brickor. Placera en bricka i taget på en ledig punkt tills alla dina 9 är utplacerade.",
        "När alla brickor är placerade flyttar du istället en av dina brickor längs en linje till en ledig punkt som är direkt förbunden med den.",
        "Får du ner till bara 3 brickor kvar på brädet får du \"flyga\" — flytta en bricka till VILKEN ledig punkt som helst, inte bara en angränsande.",
        "Bildar du en kvarn — tre av dina brickor i rad längs en linje — får du direkt ta bort en av motståndarens brickor från brädet.",
        "Du får inte ta bort en bricka som ingår i motståndarens egen kvarn, om denne har någon bricka som INTE ingår i en kvarn.",
        "Du vinner när motståndaren har färre än 3 brickor kvar på brädet, eller är helt blockerad (kan inte göra något lagligt drag).",
    ],
};

const POINT_COUNT = 24;
const PIECES_PER_PLAYER = 9;

// Punkternas (col, row) i ett 0-6-rutnät (tre hopkopplade fyrkanter) —
// index i arrayen MOTSVARAR punktnumret (0-23) rakt av, samma numrering
// som Wikipedias standarddiagram för Nine Men's Morris.
const COORDS = [
    [0, 0], [3, 0], [6, 0],
    [1, 1], [3, 1], [5, 1],
    [2, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4],
    [1, 5], [3, 5], [5, 5],
    [0, 6], [3, 6], [6, 6],
];

// Vilka punkter som är direkt förbundna med en linje — avgör lagliga
// (icke-flygande) flyttar. Varannan yttre/mellersta/inre fyrkants
// hörnpunkt har grad 2, "ekerpunkterna" (mitt på varje sida) grad 3-4.
const ADJACENCY = [
    [1, 9], [0, 2, 4], [1, 14],
    [4, 10], [1, 3, 5, 7], [4, 13],
    [7, 11], [4, 6, 8], [7, 12],
    [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
    [11, 16], [15, 17, 19], [12, 16],
    [10, 19], [16, 18, 20, 22], [13, 19],
    [9, 22], [19, 21, 23], [14, 22],
];

// De 16 möjliga kvarnarna (tre-i-rad-linjerna): 8 "sido"-linjer (en per
// fyrkantssida) + 8 "eker"-linjer (mellan fyrkanterna).
const MILLS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

// Varje punkt ingår i EXAKT 2 kvarnar (24 punkter × 2 / 3 punkter per
// linje = 16 linjer, stämmer med MILLS.length) — förräknat en gång så
// formsMill slipper filtrera hela MILLS-listan på varje anrop.
const MILLS_BY_POINT = Array.from({ length: POINT_COUNT }, (_, i) => MILLS.filter((m) => m.includes(i)));

// Kantlistan (unika linjesegment) för brädrenderingen, härledd direkt
// från ADJACENCY så den aldrig kan hamna ur synk med de faktiska lagliga
// flyttarna — `n > i` filtrerar bort varje kant dubbelt (en gång per ände).
const EDGES = [];
for (let i = 0; i < POINT_COUNT; i++) {
    for (const n of ADJACENCY[i]) if (n > i) EDGES.push([i, n]);
}

export function createBoard() {
    return { points: {} };
}

export function initialRoundState() {
    return { placed: { X: 0, O: 0 }, pendingRemoval: null, pendingMoveCells: null };
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

function onBoardCount(points, symbol) {
    let n = 0;
    for (const key in points) if (points[key] === symbol) n++;
    return n;
}

function isPlacingPhase(round, symbol) {
    return (round.placed?.[symbol] || 0) < PIECES_PER_PLAYER;
}

function isFlying(points, symbol, placedForSymbol) {
    return placedForSymbol >= PIECES_PER_PLAYER && onBoardCount(points, symbol) === 3;
}

function formsMill(points, cell, symbol) {
    return MILLS_BY_POINT[cell].some((mill) => mill.every((p) => points[p] === symbol));
}

// Motståndarens bricka på `cell` är ett lagligt mål att ta bort om den
// INTE ingår i en kvarn — eller, om ALLA motståndarens brickor på
// brädet råkar ingå i kvarnar, då är varje bricka ett lagligt mål (annars
// skulle en spelare som lyckats packa alla sina brickor i kvarnar bli
// helt oanfallbar).
function canRemoveTarget(points, cell, otherSymbol) {
    if (points[cell] !== otherSymbol) return false;
    if (!formsMill(points, cell, otherSymbol)) return true;
    return Object.keys(points).every((key) => {
        const c = Number(key);
        return points[c] !== otherSymbol || formsMill(points, c, otherSymbol);
    });
}

function hasAnyLegalMove(points, symbol, placedForSymbol) {
    if (isFlying(points, symbol, placedForSymbol)) return true; // alltid en ledig punkt att flyga till (max 18 av 24 upptagna)
    for (const key in points) {
        if (points[key] !== symbol) continue;
        if (ADJACENCY[Number(key)].some((n) => !points[n])) return true;
    }
    return false;
}

// Avslutar en tur (efter en placering/flytt UTAN kvarn, eller efter att
// en påtvingad borttagning är klar): kollar om motståndaren nu förlorar
// (färre än 3 brickor kvar, eller helt blockerad — bara relevant om denne
// redan placerat klart, se README-kommentaren högst upp), annars går
// turen vidare.
function finishTurn(round, board, placed, mySymbol, otherSymbol, otherPlayerId, lastMove) {
    const next = { ...round, board, placed, pendingRemoval: null, pendingMoveCells: null, lastMove };
    const otherFinishedPlacing = (placed[otherSymbol] || 0) >= PIECES_PER_PLAYER;
    if (otherFinishedPlacing) {
        const otherAlive = onBoardCount(board.points, otherSymbol);
        const otherBlocked = !hasAnyLegalMove(board.points, otherSymbol, placed[otherSymbol]);
        if (otherAlive < 3 || otherBlocked) {
            return { ...next, winner: mySymbol, winLine: null };
        }
    }
    return { ...next, turn: otherPlayerId };
}

function applyPlace(round, action, mySymbol, otherPlayerId) {
    const cell = action.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell >= POINT_COUNT) return round;
    if (!isPlacingPhase(round, mySymbol)) return round; // redan klar med placeringen — ska flytta, inte placera
    const points = round.board?.points || {};
    if (points[cell]) return round; // upptagen punkt

    const newPoints = { ...points, [cell]: mySymbol };
    const placed = { ...round.placed, [mySymbol]: (round.placed?.[mySymbol] || 0) + 1 };
    const board = { points: newPoints };

    if (formsMill(newPoints, cell, mySymbol)) {
        return { ...round, board, placed, pendingRemoval: mySymbol, pendingMoveCells: [cell], lastMove: { cells: [cell], removed: null } };
    }
    return finishTurn(round, board, placed, mySymbol, otherSymbolOf(mySymbol), otherPlayerId, { cells: [cell], removed: null });
}

function applyMove(round, action, mySymbol, otherPlayerId) {
    if (isPlacingPhase(round, mySymbol)) return round; // fortfarande i placeringsfasen — ska placera, inte flytta
    const { from, to } = action;
    const points = round.board?.points || {};
    if (points[from] !== mySymbol) return round;
    if (points[to]) return round; // upptagen destination
    const flying = isFlying(points, mySymbol, round.placed?.[mySymbol] || 0);
    if (!flying && !ADJACENCY[from]?.includes(to)) return round;

    const newPoints = { ...points };
    delete newPoints[from];
    newPoints[to] = mySymbol;
    const board = { points: newPoints };

    if (formsMill(newPoints, to, mySymbol)) {
        return { ...round, board, pendingRemoval: mySymbol, pendingMoveCells: [from, to], lastMove: { cells: [from, to], removed: null } };
    }
    return finishTurn(round, board, round.placed, mySymbol, otherSymbolOf(mySymbol), otherPlayerId, { cells: [from, to], removed: null });
}

function applyRemove(round, action, mySymbol, otherPlayerId) {
    const cell = action.cell;
    const otherSymbol = otherSymbolOf(mySymbol);
    const points = round.board?.points || {};
    if (!canRemoveTarget(points, cell, otherSymbol)) return round;

    const newPoints = { ...points };
    delete newPoints[cell];
    const board = { points: newPoints };
    const lastMove = { cells: round.pendingMoveCells || [], removed: cell };
    return finishTurn(round, board, round.placed, mySymbol, otherSymbol, otherPlayerId, lastMove);
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;
    if (!action) return round;

    if (round.pendingRemoval) {
        if (action.type !== "remove") return round;
        return applyRemove(round, action, mySymbol, otherPlayerId);
    }
    if (action.type === "place") return applyPlace(round, action, mySymbol, otherPlayerId);
    if (action.type === "move") return applyMove(round, action, mySymbol, otherPlayerId);
    return round;
}

export function statusText({ round, myTurn, mySymbol }) {
    const oppSymbol = otherSymbolOf(mySymbol);
    if (!myTurn) {
        if (round.pendingRemoval) return "Motståndaren bildade en kvarn — väljer en bricka att ta bort…";
        return isPlacingPhase(round, oppSymbol) ? "Motståndarens tur — placerar…" : "Motståndarens tur — flyttar…";
    }
    if (round.pendingRemoval === mySymbol) return "Kvarn! Välj en av motståndarens brickor att ta bort.";
    if (isPlacingPhase(round, mySymbol)) return "Din tur — placera en bricka";
    const points = round.board?.points || {};
    if (isFlying(points, mySymbol, round.placed?.[mySymbol] || 0)) {
        return "Din tur — bara 3 brickor kvar, flyg till valfri ledig punkt";
    }
    return "Din tur — flytta en bricka till en angränsande ledig punkt";
}

// ============================================================
// Rendering — precis som Go spelas Kvarn på PUNKTER (linjeskärningar),
// inte i rutor, och brädet är dessutom INGEN regelbunden grid (bara vissa
// punkter är förbundna) — samma anledning som go.js till att bygga en
// egen SVG för linjenätet + absolutpositionerade klickpunkter istället
// för det generiska rutnätssystemet.
// ============================================================

export function renderBoard(container, ctx) {
    const { round, mySymbol, myTurn, selectedCell, setSelectedCell, sendAction } = ctx;
    const points = round.board?.points || {};
    const otherSymbol = otherSymbolOf(mySymbol);
    const canAct = myTurn && !round.winner;

    const removing = canAct && round.pendingRemoval === mySymbol;
    const placing = canAct && !removing && isPlacingPhase(round, mySymbol);
    const moving = canAct && !removing && !placing;
    const flying = moving && isFlying(points, mySymbol, round.placed?.[mySymbol] || 0);

    // Giltiga destinationer för en redan vald bricka i flyttfasen.
    const moveHints = new Set();
    if (moving && selectedCell !== null) {
        if (flying) {
            for (let i = 0; i < POINT_COUNT; i++) if (!points[i]) moveHints.add(i);
        } else {
            for (const n of ADJACENCY[selectedCell]) if (!points[n]) moveHints.add(n);
        }
    }

    const lastMoveSet = new Set(round.lastMove?.cells || []);
    const lastRemoved = round.lastMove?.removed ?? null;

    function handlePointClick(cell) {
        if (removing) {
            if (canRemoveTarget(points, cell, otherSymbol)) sendAction({ type: "remove", cell });
            return;
        }
        if (placing) {
            if (!points[cell]) sendAction({ type: "place", cell });
            return;
        }
        if (moving) {
            if (selectedCell !== null && moveHints.has(cell)) {
                sendAction({ type: "move", from: selectedCell, to: cell });
                setSelectedCell(null);
                return;
            }
            if (points[cell] === mySymbol) setSelectedCell(selectedCell === cell ? null : cell);
        }
    }

    const wrap = document.createElement("div");
    wrap.className = "km-wrap";

    const boardEl = document.createElement("div");
    boardEl.className = "km-board";

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 6 6");
    svg.setAttribute("class", "km-lines");
    svg.setAttribute("preserveAspectRatio", "none");
    for (const [a, b] of EDGES) {
        const line = document.createElementNS(svgNs, "line");
        line.setAttribute("x1", String(COORDS[a][0]));
        line.setAttribute("y1", String(COORDS[a][1]));
        line.setAttribute("x2", String(COORDS[b][0]));
        line.setAttribute("y2", String(COORDS[b][1]));
        line.setAttribute("class", "km-line");
        svg.appendChild(line);
    }
    boardEl.appendChild(svg);

    for (let cell = 0; cell < POINT_COUNT; cell++) {
        const [col, row] = COORDS[cell];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "km-point";
        btn.dataset.cell = String(cell);
        btn.style.left = `${(col / 6) * 100}%`;
        btn.style.top = `${(row / 6) * 100}%`;

        const symbol = points[cell];
        if (symbol) {
            const piece = document.createElement("div");
            piece.className = `km-piece ${symbol === "X" ? "mark-x" : "mark-o"}`;
            piece.classList.toggle("last-move", lastMoveSet.has(cell));
            piece.classList.toggle("removable", removing && canRemoveTarget(points, cell, otherSymbol));
            btn.appendChild(piece);

            const clickable = (removing && canRemoveTarget(points, cell, otherSymbol)) || (moving && symbol === mySymbol);
            btn.classList.toggle("selected", moving && selectedCell === cell);
            btn.disabled = !clickable;
            if (clickable) btn.addEventListener("click", () => handlePointClick(cell));
        } else {
            const legal = placing || (moving && selectedCell !== null && moveHints.has(cell));
            btn.classList.toggle("hint", legal);
            btn.classList.toggle("last-removed", lastRemoved === cell);
            btn.disabled = !legal;
            if (legal) btn.addEventListener("click", () => handlePointClick(cell));
        }
        boardEl.appendChild(btn);
    }

    wrap.appendChild(boardEl);

    const info = document.createElement("p");
    info.className = "km-info status-text";
    const stillPlacing = isPlacingPhase(round, "X") || isPlacingPhase(round, "O");
    info.textContent = stillPlacing
        ? `Att placera — Svart: ${PIECES_PER_PLAYER - (round.placed?.X || 0)} · Vitt: ${PIECES_PER_PLAYER - (round.placed?.O || 0)}`
        : `Brickor kvar — Svart: ${onBoardCount(points, "X")} · Vitt: ${onBoardCount(points, "O")}`;
    wrap.appendChild(info);

    container.innerHTML = "";
    container.appendChild(wrap);
}
