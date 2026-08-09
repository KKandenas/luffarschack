// go.js — Go (Baduk/Weiqi) på ett 9x9-bräde ("enkel" storlek, betydligt
// mer hanterbart på mobil och för ett vardagsparti än fullstora 19x19),
// spelat med samma X/O-symboler som resten av appen (X = svart, börjar
// alltid; O = vit).
//
// Medvetna förenklingar (dokumenterade avvägningar, samma anda som
// backgammons/dams motsvarande kommentarer):
// - Area-poängräkning (kinesisk stil): slutpoängen = egna stenar på
//   brädet + omringat territorium. INGEN manuell "vilka stenar är döda"-
//   förhandling mellan spelarna (det klassiska, svåra att implementera
//   korrekt automatiskt) — spelarna förväntas fånga eller fylla igen
//   tvetydiga stenar/rutor SJÄLVA innan de båda passar, annars räknas
//   brädet precis som det ligger.
// - Komi (kompensationspoäng till Vit för att Svart alltid börjar) satt
//   till 6,5 — ett halvt poäng gör att oavgjort aldrig kan uppstå.
// - Enkel ko-regel (positional superko, den fulla varianten som kräver
//   att jämföra mot ALLA tidigare bräd-lägen, implementeras INTE): bara
//   det klassiska "kan inte omedelbart återta en nyss slagen ENSTAKA
//   sten"-fallet blockeras (round.board.koPoint, giltigt bara nästa
//   drag). Mer sällsynta, längre ko-cykler (t.ex. "trippel ko") stoppas
//   inte, men är extremt ovanligt i vardagsspel.

import { otherSymbolOf } from "./shared.js?v=48";

const SIZE = 9;
const CELL_COUNT = SIZE * SIZE;
const KOMI = 6.5;
const HOSHI = [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];

export const meta = {
    id: "go",
    label: "Go (9x9)",
    description: "Omringningsspel — flest poäng (stenar + omringat territorium, plus komi till Vit) vinner.",
    boardClass: "board--go",
    rules: [
        "Placera stenar växelvis på lediga skärningspunkter (inte i rutor). Målet är att omringa mer territorium och fånga fler av motståndarens stenar än denne fångar av dina.",
        "En sammanhängande grupp av egna stenar fångas och tas bort så fort den saknar \"friheter\" (lediga skärningspunkter direkt intill gruppen).",
        "Du får inte göra ett drag som gör att din EGEN grupp direkt skulle sakna friheter (självmord) — om inte det draget samtidigt fångar en motståndargrupp och därmed skapar en frihet.",
        "Ko-regeln: du får inte omedelbart återta en enstaka sten som motståndaren precis slog — vänta minst ett drag.",
        "Passa om du inte vill (eller kan) göra ett bra drag. Passar båda spelarna i följd tar ronden slut direkt.",
        "Slutpoäng räknas som egna stenar på brädet plus omringat territorium (tomma rutor som bara gränsar till din färg) — Vit får dessutom 6,5 poäng i kompensation (komi) för att Svart alltid börjar. Högst poäng vinner.",
    ],
};

function idx(row, col) { return row * SIZE + col; }

function neighborsOf(cell) {
    const row = Math.floor(cell / SIZE);
    const col = cell % SIZE;
    const result = [];
    if (row > 0) result.push(idx(row - 1, col));
    if (row < SIZE - 1) result.push(idx(row + 1, col));
    if (col > 0) result.push(idx(row, col - 1));
    if (col < SIZE - 1) result.push(idx(row, col + 1));
    return result;
}

// Flood-fill över en sammanhängande grupp likfärgade stenar (4-vägs
// grannskap — Go använder aldrig diagonal anslutning).
function groupOf(stones, cell) {
    const symbol = stones[cell];
    const seen = new Set([cell]);
    const stack = [cell];
    while (stack.length) {
        const c = stack.pop();
        for (const n of neighborsOf(c)) {
            if (stones[n] === symbol && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
    }
    return [...seen];
}

function libertiesOf(stones, group) {
    const libs = new Set();
    for (const c of group) {
        for (const n of neighborsOf(c)) {
            if (!stones[n]) libs.add(n);
        }
    }
    return libs;
}

export function createBoard() {
    return { stones: {}, koPoint: null };
}

export function initialRoundState() {
    return { passes: 0 };
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

// Simulerar (UTAN sidoeffekter på `board`) att lägga en sten på `cell` —
// returnerar { stones, koPoint } vid ett lagligt drag, annars `null`.
// Delas mellan applyAction (det RIKTIGA draget) och UI:ts
// legalitetskontroll för hint-markeringar (samma logik, ingen risk att
// de kommer ur synk med varandra).
function simulatePlacement(board, cell, symbol) {
    // OBS: Firebase lagrar aldrig ett tomt objekt (kaskaderar precis som
    // battleship.js:s fleets/shots) — `board` eller `board.stones` kan bli
    // `undefined` efter en tur-och-retur genom databasen även om de aldrig
    // explicit sattes till null. Därför `?.` + falsy-fallback överallt.
    const existingStones = board?.stones || {};
    if (existingStones[cell]) return null; // upptagen ruta
    if (board?.koPoint != null && cell === board.koPoint) return null; // ko-förbjudet

    const other = otherSymbolOf(symbol);
    const stones = { ...existingStones, [cell]: symbol };

    let captured = [];
    for (const n of neighborsOf(cell)) {
        if (stones[n] === other) {
            const group = groupOf(stones, n);
            if (libertiesOf(stones, group).size === 0) captured.push(...group);
        }
    }
    const uniqueCaptured = [...new Set(captured)];
    for (const c of uniqueCaptured) delete stones[c];

    const myGroup = groupOf(stones, cell);
    if (libertiesOf(stones, myGroup).size === 0) return null; // självmord — olagligt

    let koPoint = null;
    if (uniqueCaptured.length === 1 && myGroup.length === 1) {
        const lib = libertiesOf(stones, myGroup);
        if (lib.size === 1 && lib.has(uniqueCaptured[0])) koPoint = uniqueCaptured[0];
    }

    return { stones, koPoint };
}

export function isLegalMove(board, cell, symbol) {
    return simulatePlacement(board, cell, symbol) !== null;
}

// Area-poängräkning: egna stenar + tomma områden som BARA gränsar till
// en färg (flood-fill över tomma punkter). Ett område som gränsar till
// båda färgerna — eller inte gränsar till någon sten alls — räknas
// inte ("dame", neutralt).
export function computeScore(board) {
    const stones = board?.stones || {};
    const score = { X: 0, O: 0 };
    for (const key in stones) score[stones[key]] += 1;

    const visited = new Set();
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        if (stones[cell] || visited.has(cell)) continue;
        const region = [cell];
        const borderColors = new Set();
        const stack = [cell];
        visited.add(cell);
        while (stack.length) {
            const c = stack.pop();
            for (const n of neighborsOf(c)) {
                if (stones[n]) { borderColors.add(stones[n]); continue; }
                if (!visited.has(n)) { visited.add(n); stack.push(n); region.push(n); }
            }
        }
        if (borderColors.size === 1) {
            const owner = [...borderColors][0];
            score[owner] += region.length;
        }
    }
    return { X: score.X, O: score.O + KOMI };
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;
    if (!action) return round;

    if (action.type === "pass") {
        const passes = (round.passes || 0) + 1;
        if (passes >= 2) {
            const score = computeScore(round.board);
            const winner = score.X > score.O ? "X" : "O";
            return { ...round, passes, winner, winLine: null, finalScore: score, turn: otherPlayerId };
        }
        return { ...round, passes, turn: otherPlayerId };
    }

    if (action.type === "place") {
        const cell = action.cell;
        if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return round;
        const result = simulatePlacement(round.board, cell, mySymbol);
        if (!result) return round; // ogiltigt drag (upptaget/ko/självmord)
        // En passning rör round.lastMove INTE alls (se action "pass" ovan)
        // — den ärver bara oförändrad via spreadet, vilket är avsiktligt:
        // ingen sten flyttades, så den tidigare markeringen ska stå kvar.
        return { ...round, board: result, passes: 0, turn: otherPlayerId, lastMove: { cells: [cell] } };
    }

    return round;
}

export function statusText({ round, myTurn }) {
    if (!myTurn) {
        return round.passes === 1 ? "Motståndaren passade — din tur…" : "Motståndarens tur…";
    }
    return round.passes === 1 ? "Motståndaren passade — passa igen för att avsluta ronden" : "Din tur — placera en sten eller passa";
}

// ============================================================
// Rendering — Go spelas på LINJESKÄRNINGAR, inte i rutor, så det
// generiska kvadrat-rutnätet ui.js annars bygger passar inte. Egen SVG
// för linjenätet (positionerad en gång, rör sig aldrig) + klickbara
// punkter positionerade med exakta procentuella koordinater (INTE CSS
// Grid — ett grid med N kolumner delar upp ytan i N lika STORA rutor
// vars CENTRUM hamnar på (i+0.5)/N, medan N linjeskärningar ska sitta
// på i/(N-1) — två helt olika talföljder. Absolut positionering med
// exakt uträknade procentsatser är den enda robusta lösningen).
// ============================================================

function renderResultPanel(wrap, round) {
    if (!round.winner || !round.finalScore) return;
    const p = document.createElement("p");
    p.className = "go-result";
    const { X, O } = round.finalScore;
    p.textContent = `Slutpoäng: Svart ${X} – Vitt ${O} (komi ${KOMI} inräknad)`;
    wrap.appendChild(p);
}

// Löpande ställning UNDER pågående rond (samma computeScore som
// slutpoängen, bara omräknad live på varje rendering) — ersätts av den
// riktiga slutresultatpanelen ovan så fort ronden får en vinnare, så de
// två visas aldrig samtidigt. Tidigt i partiet räknas det mesta av
// brädet som neutralt ("dame", se computeScore) eftersom en tom ruta
// bara räknas som territorium när den uteslutande gränsar till EN färg
// — ställningen fylls alltså på allteftersom gränserna blir tydliga,
// det är förväntat (inte en bugg som gör att den ser "för låg" ut).
function renderScorePanel(wrap, round) {
    if (round.winner) return;
    const { X, O } = computeScore(round.board);
    const p = document.createElement("p");
    p.className = "go-result";
    p.textContent = `Ställning: Svart ${X} – Vitt ${O} (komi inräknad)`;
    wrap.appendChild(p);
}

export function renderBoard(container, ctx) {
    const { round, mySymbol, myTurn, sendAction } = ctx;
    const board = round.board || { stones: {}, koPoint: null };
    const canAct = myTurn && !round.winner;

    const wrap = document.createElement("div");
    wrap.className = "go-wrap";

    renderScorePanel(wrap, round);

    const boardEl = document.createElement("div");
    boardEl.className = "go-board";

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE - 1} ${SIZE - 1}`);
    svg.setAttribute("class", "go-lines");
    svg.setAttribute("preserveAspectRatio", "none");
    for (let i = 0; i < SIZE; i++) {
        const vline = document.createElementNS(svgNs, "line");
        vline.setAttribute("x1", String(i));
        vline.setAttribute("y1", "0");
        vline.setAttribute("x2", String(i));
        vline.setAttribute("y2", String(SIZE - 1));
        vline.setAttribute("class", "go-line");
        svg.appendChild(vline);

        const hline = document.createElementNS(svgNs, "line");
        hline.setAttribute("x1", "0");
        hline.setAttribute("y1", String(i));
        hline.setAttribute("x2", String(SIZE - 1));
        hline.setAttribute("y2", String(i));
        hline.setAttribute("class", "go-line");
        svg.appendChild(hline);
    }
    for (const [r, c] of HOSHI) {
        const dot = document.createElementNS(svgNs, "circle");
        dot.setAttribute("cx", String(c));
        dot.setAttribute("cy", String(r));
        dot.setAttribute("r", "0.07");
        dot.setAttribute("class", "go-hoshi");
        svg.appendChild(dot);
    }
    boardEl.appendChild(svg);

    const lastMoveSet = new Set(round.lastMove?.cells || []);

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const cell = idx(row, col);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "go-point";
            btn.dataset.cell = String(cell);
            btn.style.left = `${(col / (SIZE - 1)) * 100}%`;
            btn.style.top = `${(row / (SIZE - 1)) * 100}%`;

            const stoneSymbol = board.stones?.[cell];
            if (stoneSymbol) {
                const stone = document.createElement("div");
                stone.className = `go-stone ${stoneSymbol === "X" ? "mark-x" : "mark-o"}`;
                stone.classList.toggle("last-move", lastMoveSet.has(cell));
                btn.appendChild(stone);
                btn.disabled = true;
            } else {
                const legal = canAct && isLegalMove(board, cell, mySymbol);
                btn.classList.toggle("hint", legal);
                btn.disabled = !legal;
                if (legal) btn.addEventListener("click", () => sendAction({ type: "place", cell }));
            }
            boardEl.appendChild(btn);
        }
    }

    wrap.appendChild(boardEl);

    const controls = document.createElement("div");
    controls.className = "go-controls";
    const passBtn = document.createElement("button");
    passBtn.type = "button";
    passBtn.className = "btn btn-secondary go-pass-btn";
    passBtn.textContent = "Passa";
    passBtn.disabled = !canAct;
    passBtn.addEventListener("click", () => sendAction({ type: "pass" }));
    controls.appendChild(passBtn);
    wrap.appendChild(controls);

    renderResultPanel(wrap, round);

    container.innerHTML = "";
    container.appendChild(wrap);
}
