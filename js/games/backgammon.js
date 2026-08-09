// backgammon.js — klassiskt backgammon med dubbleringstärning och
// gammon/backgammon-poäng, spelat med samma X/O-symboler som resten av
// appen (X = svart, som alltid börjar; O = vit).
//
// Bräde: 24 punkter (index 0-23) + bar + hem-bärning ("off") per färg.
// X flyttar från hög mot låg (23 -> 0) och bär av förbi 0. O flyttar
// från låg mot hög (0 -> 23) och bär av förbi 23. X:s hemmaplan är
// punkt 0-5, O:s är punkt 18-23 — vilket också är motpartens
// inbytespunkter från bar.
//
// Känd, medveten förenkling: appen kräver INTE att spelaren använder
// tärningarna i den ordning som maximerar hur många som går att
// använda totalt (den officiella "måste spela båda om möjligt, annars
// den högsta"-regeln vid delvis blockerade lägen). Efter varje enskilt
// drag kontrolleras bara om NÅGON laglig fortsättning finns med
// kvarvarande tärningar — annars går turen automatiskt vidare. I
// sällsynta lägen kan en skicklig spelare därmed av misstag "slösa" en
// tärning som en annan dragordning hade kunnat använda. Allt annat
// (bar, slå ut, hem-bärning exakt/övertal, dubbleringstärning,
// gammon/backgammon) följer de riktiga reglerna.

import { otherSymbolOf } from "./shared.js?v=48";

export const meta = {
    id: "backgammon",
    label: "Backgammon",
    description: "Klassiskt tärningsspel med dubbleringstärning och gammon-poäng.",
    boardClass: "board--backgammon",
    rules: [
        "Flytta dina 15 brickor runt brädet och bär av dem alla först för att vinna.",
        "Slå tärningarna varje tur — du får flytta enligt båda värdena (samma bricka två gånger eller två olika brickor), eller fyra gånger samma värde om du slår par.",
        "En punkt med 2 eller fler av motståndarens brickor är blockerad för dig. En punkt med exakt 1 motståndarbricka kan du slå ut — den hamnar på \"bar\" i mitten och måste komma in i spelet igen innan den brickan kan göra något annat.",
        "Har du en egen bricka på bar måste du sätta in den igen innan du gör några andra drag.",
        "När alla dina brickor är i din hemmaplan (de sista 6 punkterna) kan du börja bära av dem.",
        "Dubbleringstärningen: du kan erbjuda att dubbla insatsen innan du slår tärning. Motståndaren accepterar (spelet fortsätter med dubbla poäng, och äger då kuben) eller ger upp ronden direkt till gamla insatsen.",
        "Gammon ger dubbla poängen om motståndaren inte hunnit bära av en enda bricka när du vinner. Backgammon ger tredubbla poängen om motståndaren dessutom har en bricka kvar på bar eller i din hemmaplan.",
    ],
};

const SIZE = 24;
const CHECKERS_PER_PLAYER = 15;

function direction(symbol) {
    return symbol === "X" ? -1 : 1;
}

function isHomeIndex(symbol, index) {
    return symbol === "X" ? index >= 0 && index <= 5 : index >= 18 && index <= 23;
}

function pipsToBearOff(symbol, point) {
    return symbol === "X" ? point + 1 : SIZE - point;
}

function destinationFor(symbol, from, die) {
    if (from === "bar") return symbol === "X" ? SIZE - die : die - 1;
    return from + direction(symbol) * die;
}

export function createBoard() {
    const board = { points: {}, bar: { X: 0, O: 0 }, off: { X: 0, O: 0 } };
    const set = (i, symbol, count) => { board.points[i] = { symbol, count }; };
    set(23, "X", 2);
    set(12, "X", 5);
    set(7, "X", 3);
    set(5, "X", 5);
    set(0, "O", 2);
    set(11, "O", 5);
    set(16, "O", 3);
    set(18, "O", 5);
    return board;
}

export function initialRoundState() {
    return {
        dice: null,
        cubeValue: 1,
        cubeOwner: null,
        pendingDouble: false,
        doubleOfferedBy: null,
    };
}

export function symbolLabel(symbol) {
    return symbol === "X" ? "Svart" : "Vitt";
}

function pointOwner(board, index) {
    const p = board.points[index];
    return p && p.count > 0 ? p : null;
}

function isBlockedFor(board, symbol, index) {
    const p = pointOwner(board, index);
    return !!(p && p.symbol !== symbol && p.count >= 2);
}

export function allInHome(board, symbol) {
    if (board.bar[symbol] > 0) return false;
    for (const key in board.points) {
        const p = board.points[key];
        if (p.symbol === symbol && p.count > 0 && !isHomeIndex(symbol, Number(key))) return false;
    }
    return true;
}

// Punkten längst bort från hem-bärning bland spelarens EGNA brickor i
// hemmaplan — avgör om ett "övertal"-tärningsvärde får bära av.
function farthestHomePoint(board, symbol) {
    let result = null;
    for (const key in board.points) {
        const idx = Number(key);
        const p = board.points[idx];
        if (p.symbol !== symbol || p.count <= 0 || !isHomeIndex(symbol, idx)) continue;
        if (result === null) result = idx;
        else if (symbol === "X" ? idx > result : idx < result) result = idx;
    }
    return result;
}

// Avgör om `symbol` lagligt kan flytta en bricka från `from` (punktindex
// eller "bar") med tärningsvärde `die`. Returnerar { legal, to, hit }.
export function moveInfo(board, symbol, from, die) {
    if (from === "bar") {
        if (board.bar[symbol] <= 0) return { legal: false };
    } else {
        if (board.bar[symbol] > 0) return { legal: false }; // måste gå in från bar först
        const p = board.points[from];
        if (!p || p.symbol !== symbol || p.count <= 0) return { legal: false };
    }

    const rawTo = destinationFor(symbol, from, die);
    const bearingOff = symbol === "X" ? rawTo < 0 : rawTo > SIZE - 1;

    if (bearingOff) {
        if (from === "bar" || !allInHome(board, symbol)) return { legal: false };
        const pips = pipsToBearOff(symbol, from);
        if (die === pips) return { legal: true, to: "off", hit: false };
        if (die > pips && farthestHomePoint(board, symbol) === from) return { legal: true, to: "off", hit: false };
        return { legal: false };
    }

    if (isBlockedFor(board, symbol, rawTo)) return { legal: false };
    const destOwner = pointOwner(board, rawTo);
    const hit = !!(destOwner && destOwner.symbol !== symbol && destOwner.count === 1);
    return { legal: true, to: rawTo, hit };
}

function movableSources(board, symbol) {
    if (board.bar[symbol] > 0) return ["bar"];
    return Object.keys(board.points)
        .map(Number)
        .filter((i) => board.points[i].symbol === symbol && board.points[i].count > 0);
}

export function hasAnyLegalMove(board, symbol, dicePool) {
    const uniqueDice = [...new Set(dicePool || [])];
    if (uniqueDice.length === 0) return false;
    const sources = movableSources(board, symbol);
    for (const from of sources) {
        for (const d of uniqueDice) {
            if (moveInfo(board, symbol, from, d).legal) return true;
        }
    }
    return false;
}

// Alla lagliga destinationer just nu för en given bricka (`from`), en
// per tärningsvärde som gör draget lagligt — används av UI:t för att
// visa vart en vald bricka får flyttas.
export function legalDestinationsFrom(board, symbol, from, dicePool) {
    const uniqueDice = [...new Set(dicePool || [])];
    const seen = new Set();
    const result = [];
    for (const d of uniqueDice) {
        const info = moveInfo(board, symbol, from, d);
        if (!info.legal) continue;
        const key = info.to === "off" ? "off" : String(info.to);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ to: info.to, die: d, hit: info.hit });
    }
    return result;
}

function findUsableDie(board, symbol, from, to, dicePool) {
    const uniqueDice = [...new Set(dicePool || [])].sort((a, b) => a - b);
    for (const d of uniqueDice) {
        const info = moveInfo(board, symbol, from, d);
        if (info.legal && info.to === to) return d;
    }
    return null;
}

function cloneBoard(board) {
    const points = {};
    for (const key in board.points) points[key] = { ...board.points[key] };
    return { points, bar: { ...board.bar }, off: { ...board.off } };
}

function applyMoveToBoard(board, symbol, from, to) {
    const next = cloneBoard(board);
    if (from === "bar") {
        next.bar[symbol] -= 1;
    } else {
        next.points[from].count -= 1;
        if (next.points[from].count <= 0) delete next.points[from];
    }

    if (to === "off") {
        next.off[symbol] += 1;
        return next;
    }

    const destOwner = next.points[to];
    if (destOwner && destOwner.symbol !== symbol && destOwner.count === 1) {
        next.bar[destOwner.symbol] += 1; // träff — ensam bricka skickas till bar
        next.points[to] = { symbol, count: 1 };
    } else if (destOwner && destOwner.symbol === symbol) {
        next.points[to] = { symbol, count: destOwner.count + 1 };
    } else {
        next.points[to] = { symbol, count: 1 };
    }
    return next;
}

function removeOne(arr, value) {
    const copy = arr.slice();
    const idx = copy.indexOf(value);
    if (idx !== -1) copy.splice(idx, 1);
    return copy;
}

// Gammon/backgammon-multiplikatorn: dubbel poäng om förloraren inte
// burit av någon bricka alls, trippel om förloraren dessutom har en
// bricka kvar på bar eller i vinnarens hemmaplan.
function computeWinPoints(board, winnerSymbol, loserSymbol, cubeValue) {
    if (board.off[loserSymbol] > 0) return cubeValue;
    const loserOnBar = board.bar[loserSymbol] > 0;
    const loserInWinnersHome = Object.keys(board.points).some((key) => {
        const idx = Number(key);
        const p = board.points[idx];
        return p.symbol === loserSymbol && p.count > 0 && isHomeIndex(winnerSymbol, idx);
    });
    return cubeValue * (loserOnBar || loserInWinnersHome ? 3 : 2);
}

export function applyAction(round, action, playerId, mySymbol, otherPlayerId) {
    if (!round || round.winner) return round;
    if (!action) return round;

    // OBS: Firebase Realtime Database lagrar aldrig ett explicit `null`-värde
    // — en skrivning med `null` TAR BORT nyckeln istället. Ett fält som
    // "inte satt än" kommer alltså tillbaka som `undefined`, inte `null`.
    // Därför måste alla kontroller här vara falsy-kontroller (`!round.dice`)
    // snarare än strikta `=== null`-jämförelser, annars matchar de aldrig
    // efter en riktig tur-och-retur genom databasen.
    if (action.type === "double") {
        if (round.turn !== playerId || round.dice || round.pendingDouble) return round;
        if (round.cubeOwner && round.cubeOwner !== playerId) return round;
        return { ...round, pendingDouble: true, doubleOfferedBy: playerId, turn: otherPlayerId };
    }

    if (action.type === "acceptDouble") {
        if (!round.pendingDouble || round.doubleOfferedBy === playerId || round.turn !== playerId) return round;
        return {
            ...round,
            pendingDouble: false,
            doubleOfferedBy: null,
            cubeValue: round.cubeValue * 2,
            cubeOwner: playerId,
            turn: otherPlayerId, // tillbaka till den som dubblade — de slår tärning
        };
    }

    if (action.type === "declineDouble") {
        if (!round.pendingDouble || round.doubleOfferedBy === playerId || round.turn !== playerId) return round;
        return {
            ...round,
            pendingDouble: false,
            doubleOfferedBy: null,
            winner: otherSymbolOf(mySymbol), // den som erbjöd dubblingen vinner
            winLine: null,
            pointValue: round.cubeValue, // avböjd dubbling: gamla insatsen gäller
        };
    }

    if (action.type === "roll") {
        if (round.turn !== playerId || round.dice || round.pendingDouble) return round;
        const d1 = 1 + Math.floor(Math.random() * 6);
        const d2 = 1 + Math.floor(Math.random() * 6);
        const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
        // Ny tur, ny "senaste drag"-markering — nollställs här (INTE vid
        // varje enskild move) så att markeringen kan samla ihop ALLA
        // delflyttar från samma tur (upp till 4 vid par), se action "move".
        if (!hasAnyLegalMove(round.board, mySymbol, dice)) {
            return { ...round, dice: null, turn: otherPlayerId, lastMove: { cells: [] } };
        }
        return { ...round, dice, lastMove: { cells: [] } };
    }

    if (action.type === "move") {
        if (round.turn !== playerId || !round.dice || round.dice.length === 0) return round;
        const { from, to } = action;
        const die = findUsableDie(round.board, mySymbol, from, to, round.dice);
        if (die === null) return round;

        const board = applyMoveToBoard(round.board, mySymbol, from, to);
        const remainingDice = removeOne(round.dice, die);
        // "off" är gemensam för båda färger som punktvärde — måste taggas
        // med symbolen för att renderBoard ska veta VILKEN hem-bärningshög
        // (offX/offO) som ska markeras.
        const marker = to === "off" ? `off-${mySymbol}` : to;
        const lastMove = { cells: [...new Set([...(round.lastMove?.cells || []), marker])] };

        if (board.off[mySymbol] === CHECKERS_PER_PLAYER) {
            const otherSymbol = otherSymbolOf(mySymbol);
            const pointValue = computeWinPoints(board, mySymbol, otherSymbol, round.cubeValue);
            return { ...round, board, dice: [], winner: mySymbol, winLine: null, pointValue, lastMove };
        }

        if (remainingDice.length === 0 || !hasAnyLegalMove(board, mySymbol, remainingDice)) {
            return { ...round, board, dice: null, turn: otherPlayerId, lastMove };
        }
        return { ...round, board, dice: remainingDice, lastMove };
    }

    return round;
}

export function statusText({ round, myTurn }) {
    if (round.pendingDouble) {
        return myTurn ? "Motståndaren dubblar — acceptera eller ge upp?" : "Väntar på svar på dubblingen…";
    }
    if (!myTurn) return round.dice ? "Motståndarens tur — flyttar…" : "Motståndarens tur — slår tärning…";
    if (!round.dice) return "Din tur — slå tärningen";
    return "Din tur — flytta enligt tärningarna";
}

// ============================================================
// Rendering — backgammon har ett eget bräde (24 punkter i en hästsko,
// bar i mitten, hem-bärning i högerkant), inte det generiska rutnätet
// ui.js annars bygger. renderBoard äger HELA sin DOM och binder sina
// egna klickhanterare direkt (main.js generiska cell-delegering hoppar
// uttryckligen över spel som definierar renderBoard).
// ============================================================

const TOP_ROW = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]; // vänster -> höger
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // vänster -> höger
const MAX_STACK = 5;

function gridColumnFor(posInRow) {
    return posInRow < 6 ? posInRow + 1 : posInRow + 2; // hoppar över bar-kolumnen (kolumn 7)
}

function renderCheckerStack(container, symbol, count) {
    container.innerHTML = "";
    if (!symbol || count <= 0) return;
    const visible = Math.min(count, MAX_STACK);
    for (let i = 0; i < visible; i++) {
        const c = document.createElement("div");
        c.className = `bg-checker ${symbol === "X" ? "mark-x" : "mark-o"}`;
        if (i === visible - 1 && count > MAX_STACK) c.textContent = String(count);
        container.appendChild(c);
    }
}

function makePointButton(index, rowClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bg-point ${rowClass} ${index % 2 === 0 ? "shade-a" : "shade-b"}`;
    btn.style.gridColumn = String(gridColumnFor((rowClass === "top" ? TOP_ROW : BOTTOM_ROW).indexOf(index)));
    btn.style.gridRow = rowClass === "top" ? "1" : "2";
    const stack = document.createElement("div");
    stack.className = "bg-stack";
    btn.appendChild(stack);
    return { btn, stack };
}

export function renderBoard(container, ctx) {
    const { round, myPlayerId, mySymbol, myTurn, selectedCell, setSelectedCell, sendAction } = ctx;
    const board = round.board;
    const oppSymbol = otherSymbolOf(mySymbol);
    const canAct = myTurn && !round.pendingDouble && !!round.dice;

    // Giltiga destinationer för en redan vald bricka, för att kunna
    // markera dem — annars tom lista.
    let hintDestinations = [];
    if (canAct && selectedCell !== null) {
        hintDestinations = legalDestinationsFrom(board, mySymbol, selectedCell, round.dice);
    }
    const hintSet = new Set(hintDestinations.map((d) => (d.to === "off" ? "off" : d.to)));
    // Alla punkter (och ev. "off-X"/"off-O") som flyttats TILL under HELA
    // motståndarens senaste tur — inte bara den allra sista delflytten,
    // annars missar man 3 av 4 flyttar vid ett par-slag (se action "roll"/
    // "move" i applyAction).
    const lastMoveSet = new Set(round.lastMove?.cells || []);

    function attemptSelectOrMove(pointRef) {
        if (!canAct) return;
        if (board.bar[mySymbol] > 0 && selectedCell === null) {
            if (pointRef === "bar") setSelectedCell("bar");
            return; // måste gå in från bar innan något annat
        }
        if (selectedCell === null) {
            if (pointRef !== "bar" && pointRef !== "off" && board.points[pointRef]?.symbol === mySymbol) {
                setSelectedCell(pointRef);
            }
            return;
        }
        if (pointRef === selectedCell) { setSelectedCell(null); return; }
        // En markerad destination vinner ALLTID över "byt vald bricka" —
        // annars gick det aldrig att stapla en egen bricka på en punkt man
        // redan har brickor på (fullt lagligt i backgammon), eftersom ett
        // klick där tolkades som "välj den här brickan istället".
        if (hintSet.has(pointRef)) {
            sendAction({ type: "move", from: selectedCell, to: pointRef });
            setSelectedCell(null);
            return;
        }
        if (pointRef !== "bar" && pointRef !== "off" && board.points[pointRef]?.symbol === mySymbol) {
            setSelectedCell(pointRef);
        }
    }

    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "bg-grid";

    const pointEls = {};
    for (const idx of TOP_ROW) {
        const { btn, stack } = makePointButton(idx, "top");
        pointEls[idx] = { btn, stack };
        grid.appendChild(btn);
    }
    for (const idx of BOTTOM_ROW) {
        const { btn, stack } = makePointButton(idx, "bottom");
        pointEls[idx] = { btn, stack };
        grid.appendChild(btn);
    }

    for (const idx of [...TOP_ROW, ...BOTTOM_ROW]) {
        const p = board.points[idx];
        const { btn, stack } = pointEls[idx];
        renderCheckerStack(stack, p?.symbol, p?.count || 0);
        btn.classList.toggle("selected", selectedCell === idx);
        btn.classList.toggle("hint", hintSet.has(idx));
        btn.classList.toggle("last-move", lastMoveSet.has(idx));
        btn.disabled = !canAct;
        btn.addEventListener("click", () => attemptSelectOrMove(idx));
    }

    // Bar (mitten): X:s väntande brickor upptill, O:s nedtill.
    const barX = document.createElement("button");
    barX.type = "button";
    barX.className = "bg-bar bg-bar-top";
    barX.style.gridColumn = "7";
    barX.style.gridRow = "1";
    const barXStack = document.createElement("div");
    barXStack.className = "bg-stack";
    renderCheckerStack(barXStack, "X", board.bar.X);
    barX.appendChild(barXStack);
    barX.classList.toggle("selected", selectedCell === "bar" && mySymbol === "X");
    barX.disabled = !canAct || mySymbol !== "X" || board.bar.X === 0;
    barX.addEventListener("click", () => attemptSelectOrMove("bar"));
    grid.appendChild(barX);

    const barO = document.createElement("button");
    barO.type = "button";
    barO.className = "bg-bar bg-bar-bottom";
    barO.style.gridColumn = "7";
    barO.style.gridRow = "2";
    const barOStack = document.createElement("div");
    barOStack.className = "bg-stack";
    renderCheckerStack(barOStack, "O", board.bar.O);
    barO.appendChild(barOStack);
    barO.classList.toggle("selected", selectedCell === "bar" && mySymbol === "O");
    barO.disabled = !canAct || mySymbol !== "O" || board.bar.O === 0;
    barO.addEventListener("click", () => attemptSelectOrMove("bar"));
    grid.appendChild(barO);

    // Hem-bärning (höger, utanför punktrutnätet): O upptill, X nedtill.
    const offO = document.createElement("button");
    offO.type = "button";
    offO.className = "bg-off bg-off-top";
    offO.style.gridColumn = "14";
    offO.style.gridRow = "1";
    const offOStack = document.createElement("div");
    offOStack.className = "bg-stack";
    renderCheckerStack(offOStack, "O", board.off.O);
    offO.appendChild(offOStack);
    offO.classList.toggle("hint", hintSet.has("off") && mySymbol === "O");
    offO.classList.toggle("last-move", lastMoveSet.has("off-O"));
    offO.disabled = !canAct || mySymbol !== "O" || !hintSet.has("off");
    offO.addEventListener("click", () => attemptSelectOrMove("off"));
    grid.appendChild(offO);

    const offX = document.createElement("button");
    offX.type = "button";
    offX.className = "bg-off bg-off-bottom";
    offX.style.gridColumn = "14";
    offX.style.gridRow = "2";
    const offXStack = document.createElement("div");
    offXStack.className = "bg-stack";
    renderCheckerStack(offXStack, "X", board.off.X);
    offX.appendChild(offXStack);
    offX.classList.toggle("hint", hintSet.has("off") && mySymbol === "X");
    offX.classList.toggle("last-move", lastMoveSet.has("off-X"));
    offX.disabled = !canAct || mySymbol !== "X" || !hintSet.has("off");
    offX.addEventListener("click", () => attemptSelectOrMove("off"));
    grid.appendChild(offX);

    container.appendChild(grid);

    // --- Kontrollpanel: kub, tärningar, slå/dubbla/acceptera/avböj ---
    const panel = document.createElement("div");
    panel.className = "bg-panel";

    const cubeEl = document.createElement("div");
    cubeEl.className = "bg-cube";
    const cubeOwnerLabel = !round.cubeOwner ? "mitten" : round.cubeOwner === myPlayerId ? "du" : "motst.";
    cubeEl.innerHTML = `<strong>${round.cubeValue}×</strong><span class="bg-cube-owner">${cubeOwnerLabel}</span>`;
    cubeEl.title = "Dubbleringstärning";
    panel.appendChild(cubeEl);

    const diceEl = document.createElement("div");
    diceEl.className = "bg-dice";
    if (round.dice && round.dice.length > 0) {
        for (const d of round.dice) {
            const die = document.createElement("span");
            die.className = "bg-die";
            die.textContent = String(d);
            diceEl.appendChild(die);
        }
    }
    panel.appendChild(diceEl);

    const actionsEl = document.createElement("div");
    actionsEl.className = "bg-actions";

    if (round.pendingDouble && myTurn) {
        const acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "btn btn-primary bg-action-btn";
        acceptBtn.textContent = `Acceptera (${round.cubeValue * 2}×)`;
        acceptBtn.addEventListener("click", () => sendAction({ type: "acceptDouble" }));
        actionsEl.appendChild(acceptBtn);

        const declineBtn = document.createElement("button");
        declineBtn.type = "button";
        declineBtn.className = "btn btn-ghost bg-action-btn";
        declineBtn.textContent = `Ge upp (${round.cubeValue}×)`;
        declineBtn.addEventListener("click", () => sendAction({ type: "declineDouble" }));
        actionsEl.appendChild(declineBtn);
    } else if (myTurn && !round.pendingDouble && !round.dice) {
        const canDouble = !round.cubeOwner || round.cubeOwner === myPlayerId;
        if (canDouble) {
            const doubleBtn = document.createElement("button");
            doubleBtn.type = "button";
            doubleBtn.className = "btn btn-secondary bg-action-btn";
            doubleBtn.textContent = `Dubbla till ${round.cubeValue * 2}×`;
            doubleBtn.addEventListener("click", () => sendAction({ type: "double" }));
            actionsEl.appendChild(doubleBtn);
        }
        const rollBtn = document.createElement("button");
        rollBtn.type = "button";
        rollBtn.className = "btn btn-primary bg-action-btn";
        rollBtn.textContent = "Slå tärning";
        rollBtn.addEventListener("click", () => sendAction({ type: "roll" }));
        actionsEl.appendChild(rollBtn);
    }

    panel.appendChild(actionsEl);
    container.appendChild(panel);
}
