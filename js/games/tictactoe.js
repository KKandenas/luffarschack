// tictactoe.js — Luffarschack: tre i rad med flyttfas.
//
// Varje spelare har bara 3 brickor. Så länge man har färre än 3 ute
// placerar man en ny på valfri tom ruta. När alla 3 är utplacerade
// flyttar man istället en befintlig bricka till valfri tom ruta —
// brädet blir aldrig fullt så ronden pågår tills någon får tre i rad.
//
// Ren spellogik (inga sidoeffekter, inget DOM/Firebase) + de UI-hooks
// (cellInteractable/onCellClick/statusText) som gör att ui.js/main.js
// kan vara generiska över vilket spel som spelas.

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "tictactoe",
    label: "Luffarschack",
    description: "Tre i rad — klassisk variant med flyttfas efter 3 brickor.",
    rows: 3,
    cols: 3,
    boardClass: "board--tictactoe",
    showGlyph: true,
    rules: [
        "Tre i rad vinner — vågrätt, lodrätt eller diagonalt.",
        "Varje spelare har bara 3 brickor. Så länge du har färre än 3 ute placerar du en ny bricka på en tom ruta.",
        "När alla dina 3 brickor är utplacerade flyttar du istället en av dem till en tom ruta varje tur: tryck på din bricka, sedan på rutan du vill flytta till.",
        "Brädet blir aldrig fullt, så partiet fortsätter tills någon får tre i rad.",
    ],
};

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rader
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolumner
    [0, 4, 8], [2, 4, 6],            // diagonaler
];

const MARKERS_PER_PLAYER = 3;

export function countMarks(board, symbol) {
    let count = 0;
    for (let i = 0; i < 9; i++) if (board?.[i] === symbol) count++;
    return count;
}

export function isPlacingPhase(board, symbol) {
    return countMarks(board, symbol) < MARKERS_PER_PLAYER;
}

function isBoardFull(board) {
    for (let i = 0; i < 9; i++) if (!board?.[i]) return false;
    return true;
}

function checkResult(board) {
    for (const line of WIN_LINES) {
        const [a, b, c] = line;
        const va = board?.[a];
        if (va && va === board?.[b] && va === board?.[c]) return { winner: va, line };
    }
    if (isBoardFull(board)) return { winner: "draw", line: null };
    return null;
}

export function createBoard() {
    return {};
}

export function symbolLabel(symbol) {
    return symbol;
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (round.turn !== playerId) return round;

    const placing = isPlacingPhase(round.board, mySymbol);
    let board;

    if (placing) {
        if (!action || action.type !== "place") return round;
        if (round.board?.[action.cell]) return round; // upptagen ruta
        board = { ...round.board, [action.cell]: mySymbol };
    } else {
        if (!action || action.type !== "move") return round;
        if (round.board?.[action.from] !== mySymbol) return round; // inte min bricka
        if (round.board?.[action.to]) return round; // upptagen ruta
        board = { ...round.board };
        delete board[action.from];
        board[action.to] = mySymbol;
    }

    const result = checkResult(board);
    return {
        ...round,
        board,
        winner: result ? result.winner : null,
        winLine: result ? result.line : null,
        turn: result ? round.turn : otherPlayerId,
    };
}

export function cellInteractable({ round, board, cellIndex, mySymbol, myTurn, selectedCell }) {
    if (!myTurn) return false;
    const value = board?.[cellIndex] || null;
    if (isPlacingPhase(board, mySymbol)) return !value;
    return value === mySymbol || (!value && selectedCell !== null);
}

// Klick i placeringsfasen skickar direkt ett drag. Klick i flyttfasen
// är tvåstegs: först väljs en egen bricka (lokal UI-state, aldrig
// synkad förrän flytten är klar), sedan en tom destinationsruta.
export function onCellClick({ round, board, mySymbol, cellIndex, selectedCell, setSelectedCell, sendAction }) {
    const value = board?.[cellIndex] || null;

    if (isPlacingPhase(board, mySymbol)) {
        if (value) return;
        sendAction({ type: "place", cell: cellIndex });
        return;
    }

    if (value === mySymbol) {
        setSelectedCell(selectedCell === cellIndex ? null : cellIndex);
        return;
    }
    if (!value && selectedCell !== null) {
        sendAction({ type: "move", from: selectedCell, to: cellIndex });
        setSelectedCell(null);
    }
}

export function statusText({ round, board, myTurn, mySymbol, selectedCell }) {
    if (!myTurn) {
        const oppSymbol = otherSymbolOf(mySymbol);
        return isPlacingPhase(board, oppSymbol) ? "Motståndarens tur — placerar…" : "Motståndarens tur — flyttar…";
    }
    if (isPlacingPhase(board, mySymbol)) return "Din tur — placera en bricka";
    if (selectedCell !== null) return "Flytta till en tom ruta";
    return "Din tur — välj en bricka att flytta";
}
