// checkers.js — Dam, enkel 8x8-variant ("amerikanska" regler): damer
// flyttar/slår ett steg diagonalt åt valfritt håll (ingen "flygande
// dam"), spelat med samma X/O-symboler som resten av appen (X = svart,
// börjar alltid; O = vit).
//
// Regler:
// - Vanlig bricka flyttar diagonalt EN ruta framåt till en tom ruta.
// - Slag (obligatoriskt om möjligt, se nedan) hoppar över en angränsande
//   fientlig bricka till en tom ruta precis bortom den — tillåtet åt
//   ALLA fyra diagonala håll även för en vanlig bricka (den vanliga
//   amerikanska regeln: man får slå bakåt även om man inte får FLYTTA
//   bakåt utan att slå).
// - Slagtvång: om någon av spelarens brickor kan slå MÅSTE ett slag
//   göras (valfritt vilken bricka/vilket slag — ingen "störst
//   slagserie"-regel i den här enkla varianten).
// - Flerslag: slår en bricka och kan slå igen från sin nya ruta med
//   SAMMA bricka måste den fortsätta (turen går inte över) — UTOM om
//   den precis blev krönt till dam i samma drag (se nedan).
// - Krönt till dam när den når motståndarens bortersta rad. En bricka
//   som blir dam mitt i en slagsvit stannar där — traditionell regel,
//   den nykrönta damen får inte fortsätta slå förrän nästa tur.
// - Vinst: motståndaren saknar lagliga drag (inga brickor kvar ELLER
//   helt blockerad — "kan inte flytta" är förlust, inte oavgjort).
// - Medveten förenkling (ingen sådan regel i den här enkla varianten):
//   ingen "flygande dam" och inget forcerat oavgjort vid upprepning/
//   för många drag utan slag.

import { otherSymbolOf } from "./shared.js?v=49";

export const meta = {
    id: "checkers",
    label: "Dam",
    description: "Klassisk 8x8-dam — slagtvång och flerslag, damer flyttar ett steg åt valfritt håll.",
    boardClass: "board--checkers",
    supportsAi: true,
    rules: [
        "Vanliga brickor flyttar ett steg diagonalt framåt till en tom ruta.",
        "Kan du slå (hoppa över) en av motståndarens brickor MÅSTE du göra det. En vanlig bricka får slå åt alla fyra håll, även bakåt — det är bara vanlig flyttning utan slag som måste vara framåt.",
        "Slår du en bricka och kan slå igen med samma bricka från din nya ruta måste du fortsätta slå.",
        "En bricka som når motståndarens bortersta rad blir dam och kan därefter flytta och slå åt alla håll. En bricka som blir dam mitt i en slagsvit stannar där — den fortsätter inte slå förrän nästa tur.",
        "Du vinner när motståndaren saknar lagliga drag — antingen för att alla dennes brickor är slagna, eller för att denne är helt blockerad.",
    ],
};

const SIZE = 8;
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function idx(row, col) { return row * SIZE + col; }
function inBounds(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }
function isDark(row, col) { return (row + col) % 2 === 1; }
function forwardDirs(symbol) { return symbol === "X" ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]; }
function isKingRow(symbol, row) { return symbol === "X" ? row === SIZE - 1 : row === 0; }

export function createBoard() {
    const board = {};
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            if (!isDark(row, col)) continue;
            if (row <= 2) board[idx(row, col)] = { symbol: "X", king: false };
            else if (row >= 5) board[idx(row, col)] = { symbol: "O", king: false };
        }
    }
    return board;
}

export function initialRoundState() {
    return { mustContinueFrom: null };
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

export function legalSimpleMovesForPiece(board, index) {
    const piece = board[index];
    if (!piece) return [];
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const dirs = piece.king ? DIAGONALS : forwardDirs(piece.symbol);
    const moves = [];
    for (const [dr, dc] of dirs) {
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        if (!board[idx(r, c)]) moves.push(idx(r, c));
    }
    return moves;
}

// Slag tillåts åt alla fyra diagonala håll oavsett om brickan är dam
// eller inte (se filkommentaren) — bara EN ruta bort (ingen flygande dam).
export function legalCapturesForPiece(board, index) {
    const piece = board[index];
    if (!piece) return [];
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const captures = [];
    for (const [dr, dc] of DIAGONALS) {
        const midR = row + dr;
        const midC = col + dc;
        const landR = row + 2 * dr;
        const landC = col + 2 * dc;
        if (!inBounds(landR, landC)) continue;
        const midPiece = board[idx(midR, midC)];
        if (!midPiece || midPiece.symbol === piece.symbol) continue;
        if (board[idx(landR, landC)]) continue;
        captures.push({ to: idx(landR, landC), captured: idx(midR, midC) });
    }
    return captures;
}

export function anyCaptureAvailable(board, symbol) {
    for (const key in board) {
        if (board[key].symbol === symbol && legalCapturesForPiece(board, Number(key)).length > 0) return true;
    }
    return false;
}

export function hasAnyLegalMove(board, symbol) {
    for (const key in board) {
        if (board[key].symbol !== symbol) continue;
        const i = Number(key);
        if (legalCapturesForPiece(board, i).length > 0) return true;
        if (legalSimpleMovesForPiece(board, i).length > 0) return true;
    }
    return false;
}

function cloneBoard(board) {
    const next = {};
    for (const key in board) next[key] = { ...board[key] };
    return next;
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;
    if (!action || action.type !== "move") return round;
    const { from, to } = action;
    const board = round.board;
    const piece = board[from];
    if (!piece || piece.symbol !== mySymbol) return round;

    // OBS: Firebase lagrar aldrig ett explicit `null` (nyckeln försvinner
    // och kommer tillbaka som `undefined`) — `!= null` fångar båda utan
    // att råka matcha en legitim ruta med index 0.
    const lockedFrom = round.mustContinueFrom != null ? round.mustContinueFrom : null;
    if (lockedFrom !== null && from !== lockedFrom) return round;

    const captures = legalCapturesForPiece(board, from);
    const captureMove = captures.find((c) => c.to === to);
    const mandatory = lockedFrom !== null || anyCaptureAvailable(board, mySymbol);

    let nextBoard;
    let didCapture = false;

    if (captureMove) {
        nextBoard = cloneBoard(board);
        delete nextBoard[from];
        delete nextBoard[captureMove.captured];
        nextBoard[to] = { ...piece };
        didCapture = true;
    } else {
        if (mandatory) return round; // slagtvång — kan inte göra ett vanligt drag
        if (!legalSimpleMovesForPiece(board, from).includes(to)) return round;
        nextBoard = cloneBoard(board);
        delete nextBoard[from];
        nextBoard[to] = { ...piece };
    }

    const toRow = Math.floor(to / SIZE);
    let becameKing = false;
    if (!nextBoard[to].king && isKingRow(mySymbol, toRow)) {
        nextBoard[to] = { ...nextBoard[to], king: true };
        becameKing = true;
    }

    let nextTurn = otherPlayerId;
    let mustContinueFrom = null;
    if (didCapture && !becameKing && legalCapturesForPiece(nextBoard, to).length > 0) {
        nextTurn = playerId; // samma spelare måste fortsätta slå med samma bricka
        mustContinueFrom = to;
    }

    const otherSymbol = otherSymbolOf(mySymbol);
    const otherHasPieces = Object.values(nextBoard).some((p) => p.symbol === otherSymbol);
    let winner = null;
    if (!otherHasPieces) {
        winner = mySymbol;
    } else if (nextTurn === otherPlayerId && !hasAnyLegalMove(nextBoard, otherSymbol)) {
        winner = mySymbol; // motståndaren är helt blockerad — förlust, inte oavgjort
    }

    return {
        ...round,
        board: nextBoard,
        turn: nextTurn,
        mustContinueFrom,
        winner,
        winLine: null,
        lastMove: { cells: [from, to] },
    };
}

// ============================================================
// AI-motstånd — tre svårighetsgrader.
// Återanvänder samma applyAction/legalitetsfunktioner som den riktiga
// spelmotorn (via en "scratch"-rond där turn/playerId/symbol är samma
// sträng) istället för att duplicera regellogiken — så AI:n kan aldrig
// råka spela ett drag den riktiga motorn skulle underkänt.
// ============================================================

function shuffled(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Alla lagliga drag för `symbol` i den aktuella ställningen — samma
// slagtvångs-/fortsätt-slå-logik som applyAction, men bara för att LISTA
// dragen istället för att utföra ett.
function listLegalActions(round, symbol) {
    const board = round.board;
    const lockedFrom = round.mustContinueFrom != null ? round.mustContinueFrom : null;
    const mandatory = lockedFrom !== null || anyCaptureAvailable(board, symbol);
    const pieceIndices = lockedFrom !== null
        ? [lockedFrom]
        : Object.keys(board).filter((k) => board[k].symbol === symbol).map(Number);

    const actions = [];
    for (const from of pieceIndices) {
        const captures = legalCapturesForPiece(board, from);
        if (captures.length > 0) {
            for (const c of captures) actions.push({ type: "move", from, to: c.to });
        } else if (!mandatory) {
            for (const to of legalSimpleMovesForPiece(board, from)) actions.push({ type: "move", from, to });
        }
    }
    return actions;
}

// Simulerar ett drag med `applyAction` genom att låta symbolen själv vara
// "playerId" — applyAction bryr sig bara om att playerId matchar
// round.turn och används som nästa spelares identitet, så det fungerar
// utmärkt även utanför den riktiga rum-kontexten.
function simulateAction(round, action, symbol) {
    return applyAction(round, action, symbol, symbol, otherSymbolOf(symbol));
}

function evaluateBoard(board, aiSymbol) {
    let score = 0;
    for (const key in board) {
        const piece = board[key];
        const row = Math.floor(Number(key) / SIZE);
        const col = Number(key) % SIZE;
        let value = piece.king ? 1.75 : 1;
        if (!piece.king) {
            const advancement = piece.symbol === "X" ? row : (SIZE - 1 - row);
            value += advancement * 0.03;
        }
        value += (3.5 - Math.abs(col - 3.5)) * 0.01;
        score += piece.symbol === aiSymbol ? value : -value;
    }
    return score;
}

// Minimax med alpha-beta-beskärning. Ett "djup" är en enskild handling
// (move), inte ett helt drag mellan spelarbyten — en tvingad slagsvit
// (mustContinueFrom) räknas alltså som flera djup i rad för samma sida,
// precis som i den riktiga spelmotorn.
function minimax(round, aiSymbol, depth, alpha, beta, deadline) {
    if (round.winner) {
        if (round.winner === aiSymbol) return 500 + depth;
        return -500 - depth;
    }
    if (depth <= 0 || Date.now() > deadline) {
        return evaluateBoard(round.board, aiSymbol);
    }

    const toMove = round.turn;
    const maximizing = toMove === aiSymbol;
    const actions = shuffled(listLegalActions(round, toMove));
    if (actions.length === 0) return maximizing ? -500 - depth : 500 + depth;

    let best = maximizing ? -Infinity : Infinity;
    for (const action of actions) {
        const nextRound = simulateAction(round, action, toMove);
        const score = minimax(nextRound, aiSymbol, depth - 1, alpha, beta, deadline);
        if (maximizing) {
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
        } else {
            best = Math.min(best, score);
            beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
        if (Date.now() > deadline) break;
    }
    return best;
}

const AI_BUDGET_MS = { medium: 250, hard: 700 };
const AI_MAX_DEPTH = { medium: 6, hard: 10 };

// Returnerar en handling ({ type: "move", from, to }) åt AI:n, eller
// `null` om den (mot förmodan — motorn ska redan ha satt round.winner då)
// saknar lagliga drag.
export function getAiMove(round, aiSymbol, difficulty) {
    const scratchRound = {
        board: round.board,
        turn: aiSymbol,
        mustContinueFrom: round.mustContinueFrom,
        winner: null,
    };
    const actions = shuffled(listLegalActions(scratchRound, aiSymbol));
    if (actions.length === 0) return null;
    if (difficulty === "easy") return actions[0];

    const deadline = Date.now() + (AI_BUDGET_MS[difficulty] || AI_BUDGET_MS.medium);
    const maxDepth = AI_MAX_DEPTH[difficulty] || AI_MAX_DEPTH.medium;

    let best = actions[0];
    for (let depth = 2; depth <= maxDepth; depth++) {
        if (Date.now() > deadline) break;
        let alpha = -Infinity;
        let roundBest = null;
        let roundBestScore = -Infinity;
        for (const action of actions) {
            const nextRound = simulateAction(scratchRound, action, aiSymbol);
            const score = minimax(nextRound, aiSymbol, depth - 1, alpha, Infinity, deadline);
            if (score > roundBestScore) {
                roundBestScore = score;
                roundBest = action;
            }
            alpha = Math.max(alpha, roundBestScore);
        }
        if (roundBest && Date.now() <= deadline) {
            best = roundBest;
        }
    }
    return best;
}

export function statusText({ round, myTurn, mySymbol }) {
    if (!myTurn) return "Motståndarens tur…";
    if (round.mustContinueFrom != null) return "Du slog — fortsätt slå med samma bricka!";
    if (anyCaptureAvailable(round.board, mySymbol)) return "Din tur — du måste slå";
    return "Din tur — flytta eller slå";
}

// ============================================================
// Rendering — eget 8x8-bräde med bara de mörka rutorna spelbara.
// Precis som backgammon.js/battleship.js äger renderBoard HELA sin DOM
// och binder sina egna klickhanterare (main.js generiska cell-
// delegering hoppar uttryckligen över spel som definierar renderBoard).
// ============================================================

export function renderBoard(container, ctx) {
    const { round, mySymbol, myTurn, selectedCell, setSelectedCell, sendAction } = ctx;
    const board = round.board;
    const canAct = myTurn;
    const lockedFrom = round.mustContinueFrom != null ? round.mustContinueFrom : null;
    const mandatoryCapture = canAct && anyCaptureAvailable(board, mySymbol);

    let hintMoves = [];
    if (canAct && selectedCell !== null) {
        const captures = legalCapturesForPiece(board, selectedCell);
        hintMoves = (captures.length > 0 || lockedFrom !== null)
            ? captures.map((c) => c.to)
            : legalSimpleMovesForPiece(board, selectedCell);
    }
    const hintSet = new Set(hintMoves);
    const lastMoveSet = new Set(round.lastMove?.cells || []);

    function canSelect(index) {
        const piece = board[index];
        if (!piece || piece.symbol !== mySymbol) return false;
        if (lockedFrom !== null) return index === lockedFrom;
        if (mandatoryCapture) return legalCapturesForPiece(board, index).length > 0;
        return legalSimpleMovesForPiece(board, index).length > 0 || legalCapturesForPiece(board, index).length > 0;
    }

    function handleClick(index) {
        if (!canAct) return;
        if (selectedCell !== null && hintSet.has(index)) {
            sendAction({ type: "move", from: selectedCell, to: index });
            setSelectedCell(null);
            return;
        }
        if (selectedCell === index) { setSelectedCell(null); return; }
        if (canSelect(index)) setSelectedCell(index);
    }

    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "ck-grid";

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const i = idx(row, col);
            const dark = isDark(row, col);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `ck-cell ${dark ? "dark" : "light"}`;
            if (!dark) {
                btn.disabled = true;
                grid.appendChild(btn);
                continue;
            }

            const piece = board[i];
            if (piece) {
                const p = document.createElement("div");
                p.className = `ck-piece ${piece.symbol === "X" ? "mark-x" : "mark-o"}`;
                if (piece.king) {
                    p.classList.add("king");
                    p.textContent = "♛";
                }
                btn.appendChild(p);
            }

            btn.classList.toggle("selected", selectedCell === i);
            btn.classList.toggle("hint", hintSet.has(i));
            btn.classList.toggle("last-move", lastMoveSet.has(i));
            btn.disabled = !canAct || !(hintSet.has(i) || canSelect(i));
            btn.addEventListener("click", () => handleClick(i));
            grid.appendChild(btn);
        }
    }
    container.appendChild(grid);
}
