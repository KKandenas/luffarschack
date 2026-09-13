// othello.js — klassisk reversi på 8x8, spelad med samma X/O-symboler
// som resten av appen (X = svart, som alltid börjar; O = vit).
//
// Ett drag måste vända minst en rad motståndarbrickor (annars är det
// olagligt). Om spelaren i tur saknar lagliga drag hoppas turen
// automatiskt över — hela den logiken ligger i applyAction så att den
// alltid löses inom samma atomära skrivning som själva draget, utan
// någon separat "auto-advance"-mekanism.

import { otherSymbolOf } from "./shared.js?v=55";

export const meta = {
    id: "othello",
    label: "Othello",
    description: "Vänd motståndarens brickor — flest brickor när ingen kan dra mer vinner.",
    rows: 8,
    cols: 8,
    boardClass: "board--othello",
    showGlyph: false,
    supportsAi: true,
    rules: [
        "Lägg en bricka så att den fångar in en eller flera av motståndarens brickor i en rak linje (vågrätt, lodrätt eller diagonalt) mellan din nya bricka och en annan av dina egna brickor.",
        "De infångade brickorna vänds till din färg.",
        "Du måste göra ett drag som fångar minst en bricka om det går. Saknar du lagliga drag hoppar turen automatiskt över till motståndaren.",
        "Ronden slutar när ingen av spelarna kan dra mer. Den med flest brickor på brädet vinner (oavgjort vid lika antal).",
    ],
};

const SIZE = 8;
const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

function idx(row, col) { return row * SIZE + col; }
function inBounds(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }

// Rutorna som skulle vändas om `symbol` la en bricka på `cell` — tom
// lista om draget är olagligt (t.ex. ruta upptagen, eller ingen rad
// fångas in i någon riktning).
export function flipsFor(board, cell, symbol) {
    if (board?.[cell]) return [];
    const other = otherSymbolOf(symbol);
    const row0 = Math.floor(cell / SIZE);
    const col0 = cell % SIZE;
    const flips = [];

    for (const [dr, dc] of DIRECTIONS) {
        let r = row0 + dr;
        let c = col0 + dc;
        const line = [];
        while (inBounds(r, c) && board?.[idx(r, c)] === other) {
            line.push(idx(r, c));
            r += dr;
            c += dc;
        }
        if (line.length > 0 && inBounds(r, c) && board?.[idx(r, c)] === symbol) {
            flips.push(...line);
        }
    }
    return flips;
}

export function legalMoves(board, symbol) {
    const moves = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (!board?.[i] && flipsFor(board, i, symbol).length > 0) moves.push(i);
    }
    return moves;
}

export function countDiscs(board) {
    let X = 0;
    let O = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (board?.[i] === "X") X++;
        else if (board?.[i] === "O") O++;
    }
    return { X, O };
}

export function createBoard() {
    const board = {};
    board[idx(3, 3)] = "O";
    board[idx(3, 4)] = "X";
    board[idx(4, 3)] = "X";
    board[idx(4, 4)] = "O";
    return board;
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

// Avgör vems tur det blir näst (eller om ronden är slut) efter att
// `moverSymbol` precis gjort ett drag. Hoppar över en spelare som
// saknar lagliga drag; om ingen av spelarna kan dra alls avgörs ronden
// direkt av vem som har flest brickor (oavgjort vid lika antal).
function resolveTurn(board, moverId, moverSymbol, otherId, otherSymbol) {
    if (legalMoves(board, otherSymbol).length > 0) {
        return { turn: otherId, winner: null, winLine: null };
    }
    if (legalMoves(board, moverSymbol).length > 0) {
        return { turn: moverId, winner: null, winLine: null }; // motståndaren passar
    }
    const counts = countDiscs(board);
    let winner;
    if (counts[moverSymbol] > counts[otherSymbol]) winner = moverSymbol;
    else if (counts[otherSymbol] > counts[moverSymbol]) winner = otherSymbol;
    else winner = "draw";
    return { turn: moverId, winner, winLine: null };
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;
    if (!action || action.type !== "place") return round;

    const flips = flipsFor(round.board, action.cell, mySymbol);
    if (flips.length === 0) return round; // olagligt drag (vänder ingenting)

    const board = { ...round.board, [action.cell]: mySymbol };
    for (const flippedCell of flips) board[flippedCell] = mySymbol;

    const otherSymbol = otherSymbolOf(mySymbol);
    return {
        ...round,
        board,
        lastMove: { cells: [action.cell] },
        ...resolveTurn(board, playerId, mySymbol, otherPlayerId, otherSymbol),
    };
}

export function cellInteractable({ board, cellIndex, mySymbol, myTurn }) {
    if (!myTurn) return false;
    if (board?.[cellIndex]) return false;
    return flipsFor(board, cellIndex, mySymbol).length > 0;
}

export function onCellClick({ board, mySymbol, cellIndex, sendAction }) {
    if (board?.[cellIndex]) return;
    if (flipsFor(board, cellIndex, mySymbol).length === 0) return;
    sendAction({ type: "place", cell: cellIndex });
}

// ============================================================
// AI-motstånd — samma mönster som checkers.js/kvarn.js: återanvänder
// applyAction via en "scratch"-rond (turn = symbolen själv) istället för
// att duplicera regellogiken. resolveTurn:s automatiska "hoppa över"
// (round.turn förblir samma spelare om motståndaren saknar lagliga drag)
// hanteras helt gratis av det här upplägget — minimax bryr sig bara om
// vems tur round.turn faktiskt pekar på i varje läge.
// ============================================================

function shuffled(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function listLegalActions(round, symbol) {
    return legalMoves(round.board, symbol).map((cell) => ({ type: "place", cell }));
}

function simulateAction(round, action, symbol) {
    return applyAction(round, action, symbol, symbol, otherSymbolOf(symbol));
}

const CORNERS = [0, 7, 56, 63];
// Rutan diagonalt intill varje hörn ("X-ruta") — farlig att lägga sig på
// medan hörnet fortfarande är ledigt, för då kan motståndaren ofta ta
// hörnet direkt härnäst.
const X_SQUARE_OF_CORNER = { 0: 9, 7: 14, 56: 49, 63: 54 };

function evaluatePosition(round, aiSymbol) {
    const board = round.board;
    const oppSymbol = otherSymbolOf(aiSymbol);
    const counts = countDiscs(board);
    const emptyCount = SIZE * SIZE - counts.X - counts.O;

    let score = 0;
    for (const corner of CORNERS) {
        if (board[corner] === aiSymbol) score += 30;
        else if (board[corner] === oppSymbol) score -= 30;
    }
    for (const [cornerStr, xSquare] of Object.entries(X_SQUARE_OF_CORNER)) {
        if (board[Number(cornerStr)]) continue; // hörnet är redan taget, ingen fara längre
        if (board[xSquare] === aiSymbol) score -= 12;
        else if (board[xSquare] === oppSymbol) score += 12;
    }

    const myMoves = legalMoves(board, aiSymbol).length;
    const oppMoves = legalMoves(board, oppSymbol).length;
    score += (myMoves - oppMoves) * 2;

    // Antal brickor spelar nästan ingen roll förrän slutspelet — då
    // väger det tungt (sista raderna avgör ofta hela utgången).
    const materialWeight = emptyCount < 12 ? 1.5 : 0.1;
    score += (counts[aiSymbol] - counts[oppSymbol]) * materialWeight;

    return score;
}

// Minimax med alpha-beta-beskärning. Ett djup är EN placering — ett
// "hopp över"-läge (resolveTurn låter samma spelare fortsätta) räknas
// därför som ett extra djup för samma sida, precis som i motorn.
function minimax(round, aiSymbol, depth, alpha, beta, deadline) {
    if (round.winner) {
        if (round.winner === aiSymbol) return 500 + depth;
        if (round.winner === "draw") return 0;
        return -500 - depth;
    }
    if (depth <= 0 || Date.now() > deadline) {
        return evaluatePosition(round, aiSymbol);
    }

    const toMove = round.turn;
    const maximizing = toMove === aiSymbol;
    const actions = shuffled(listLegalActions(round, toMove));
    if (actions.length === 0) return evaluatePosition(round, aiSymbol);

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

// Returnerar en handling ({ type: "place", cell }) åt AI:n, eller `null`
// om den (mot förmodan) saknar lagliga drag.
export function getAiMove(round, aiSymbol, difficulty) {
    const scratchRound = { board: round.board, turn: aiSymbol, winner: null };
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

export function statusText({ board, myTurn, mySymbol }) {
    const counts = countDiscs(board);
    const scoreText = `${counts.X} – ${counts.O}`;
    if (!myTurn) return `Motståndarens tur (${scoreText})`;
    const oppSymbol = otherSymbolOf(mySymbol);
    if (legalMoves(board, mySymbol).length === 0 && legalMoves(board, oppSymbol).length > 0) {
        // Hamnar hit endast för ett kort ögonblick innan draget som
        // precis gjorde att man hoppade över hinner synkas.
        return `Inga lagliga drag — hoppar över… (${scoreText})`;
    }
    return `Din tur (${scoreText})`;
}
