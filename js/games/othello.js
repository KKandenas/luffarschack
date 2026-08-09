// othello.js — klassisk reversi på 8x8, spelad med samma X/O-symboler
// som resten av appen (X = svart, som alltid börjar; O = vit).
//
// Ett drag måste vända minst en rad motståndarbrickor (annars är det
// olagligt). Om spelaren i tur saknar lagliga drag hoppas turen
// automatiskt över — hela den logiken ligger i applyAction så att den
// alltid löses inom samma atomära skrivning som själva draget, utan
// någon separat "auto-advance"-mekanism.

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "othello",
    label: "Othello",
    description: "Vänd motståndarens brickor — flest brickor när ingen kan dra mer vinner.",
    rows: 8,
    cols: 8,
    boardClass: "board--othello",
    showGlyph: false,
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
