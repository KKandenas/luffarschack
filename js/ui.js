// ui.js
// All DOM-rendering samlad här. Tar emot state (room-objektet från
// Firebase + vem jag är) och uppdaterar DOM:en. Inga Firebase-anrop i den
// här filen. Vet ingenting om enskilda spels regler — allt sådant kommer
// från den aktuella spelmodulen (js/games/registry.js) via room.gameId.

import { boardToCells } from "./games/shared.js?v=48";
import { getGame, GAME_LIST } from "./games/registry.js?v=48";

const screens = {
    profile: document.getElementById("screen-profile"),
    home: document.getElementById("screen-home"),
    lobby: document.getElementById("screen-lobby"),
    game: document.getElementById("screen-game"),
    stats: document.getElementById("screen-stats"),
    rules: document.getElementById("screen-rules"),
};

// Bakgrundsbilden (hundarna) visas bara på "startsidorna" — där man
// väljer profil, spel eller tittar på statistik — inte i lobbyn eller
// mitt i ett parti där uppmärksamheten ska vara på spelet.
const START_SCREENS = new Set(["profile", "home", "stats"]);

export function showScreen(name) {
    for (const key in screens) {
        screens[key].classList.toggle("active", key === name);
    }
    document.body.classList.toggle("bg-start", START_SCREENS.has(name));
}

function playerLabel(player, fallback) {
    if (!player) return fallback;
    return player.name || fallback;
}

export function getOpponentId(room, myPlayerId) {
    const ids = Object.keys(room.players || {});
    return ids.find((id) => id !== myPlayerId) || null;
}

export function renderLobby(room, code) {
    document.getElementById("lobby-code").textContent = code;
    const playerCount = Object.keys(room.players || {}).length;
    const statusEl = document.getElementById("lobby-status");
    statusEl.textContent = playerCount >= 2
        ? "Motståndare hittad! Startar…"
        : "Väntar på motståndare…";
}

// Rutnätsbrädet byggs om i DOM:en bara när spelet (och därmed
// dimensionerna) faktiskt ändras. Spel med eget bräde (game.renderBoard,
// t.ex. backgammon) hanterar sin egen DOM helt själva varje rendering —
// då nollställs den här nyckeln så att ett EFTERFÖLJANDE rutnätsspel
// tvingas bygga om från grunden.
let builtBoardKey = null;

function ensureBoardGrid(game) {
    const key = `${game.meta.id}:${game.meta.rows}x${game.meta.cols}`;
    if (builtBoardKey === key) return;
    builtBoardKey = key;

    const boardEl = document.getElementById("board");
    boardEl.className = `board ${game.meta.boardClass}`;
    boardEl.style.gridTemplateColumns = `repeat(${game.meta.cols}, 1fr)`;
    boardEl.innerHTML = "";

    const count = game.meta.rows * game.meta.cols;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.id = `cell-${i}`;
        frag.appendChild(btn);
    }
    boardEl.appendChild(frag);
}

// `callbacks` (setSelectedCell/sendAction) behövs bara av spel med eget
// bräde (game.renderBoard) — de bygger och binder sina klickhanterare
// direkt själva istället för att gå via main.js generiska cell-delegering.
export function renderGame(room, myPlayerId, selectedCell = null, callbacks = {}) {
    const me = room.players?.[myPlayerId];
    const oppId = getOpponentId(room, myPlayerId);
    const opp = oppId ? room.players[oppId] : null;
    const round = room.round;
    if (!me || !round) return;

    const game = getGame(room.gameId);
    const myTurn = !round.winner && round.turn === myPlayerId && !!oppId;

    const meChip = document.getElementById("chip-me");
    const oppChip = document.getElementById("chip-opp");
    const meSymbolEl = document.getElementById("chip-me-symbol");
    const oppSymbolEl = document.getElementById("chip-opp-symbol");
    const symbolLabel = game.symbolLabel || ((s) => s);
    document.getElementById("chip-me-name").textContent = playerLabel(me, "Du");
    meSymbolEl.textContent = symbolLabel(me.symbol);
    document.getElementById("chip-me-score").textContent = room.score?.[myPlayerId] ?? 0;
    document.getElementById("chip-opp-name").textContent = opp ? playerLabel(opp, "Motståndare") : "Väntar…";
    oppSymbolEl.textContent = opp ? symbolLabel(opp.symbol) : "?";
    document.getElementById("chip-opp-score").textContent = oppId ? (room.score?.[oppId] ?? 0) : 0;

    // Chippens färg följer den FAKTISKA symbolen (X/O) istället för att
    // "mitt chip" alltid var tejpat till X:s färg — annars visade chippet
    // fel färg för den som gick med som spelare 2 (symbol O). Samma
    // mark-x/mark-o-klasser och (via .game-ID-scopet nedan) samma
    // per-spel-färger som själva brädet använder, t.ex. röd/gul i 4 i rad.
    meSymbolEl.classList.toggle("mark-x", me.symbol === "X");
    meSymbolEl.classList.toggle("mark-o", me.symbol === "O");
    oppSymbolEl.classList.toggle("mark-x", !!opp && opp.symbol === "X");
    oppSymbolEl.classList.toggle("mark-o", !!opp && opp.symbol === "O");
    document.getElementById("scorebar").className = `scorebar game-${game.meta.id}`;

    meChip.classList.toggle("active-turn", !round.winner && round.turn === myPlayerId);
    oppChip.classList.toggle("active-turn", !round.winner && !!oppId && round.turn === oppId);

    document.getElementById("round-indicator").textContent = `${game.meta.label} · Runda ${round.roundNumber}`;

    if (typeof game.renderBoard === "function") {
        const boardEl = document.getElementById("board");
        boardEl.className = `board ${game.meta.boardClass || ""}`;
        game.renderBoard(boardEl, {
            round, room, myPlayerId, mySymbol: me.symbol, oppId, opp, myTurn, selectedCell,
            setSelectedCell: callbacks.setSelectedCell,
            sendAction: callbacks.sendAction,
        });
        builtBoardKey = null;
    } else {
        ensureBoardGrid(game);
        const cellCount = game.meta.rows * game.meta.cols;
        const cells = boardToCells(round.board, cellCount);
        const winSet = new Set(round.winLine || []);
        const lastMoveSet = new Set(round.lastMove?.cells || []);
        for (let i = 0; i < cellCount; i++) {
            const cellEl = document.getElementById(`cell-${i}`);
            cellEl.textContent = game.meta.showGlyph ? (cells[i] || "") : "";
            cellEl.classList.toggle("mark-x", cells[i] === "X");
            cellEl.classList.toggle("mark-o", cells[i] === "O");
            cellEl.classList.toggle("win", winSet.has(i));
            cellEl.classList.toggle("last-move", lastMoveSet.has(i));
            cellEl.classList.toggle("selected", selectedCell === i);

            const canInteract = game.cellInteractable({
                round, board: round.board, cellIndex: i, mySymbol: me.symbol, myTurn, selectedCell,
            });
            cellEl.classList.toggle("hint", canInteract && !cells[i]);
            cellEl.disabled = !canInteract;
        }
    }

    const statusEl = document.getElementById("game-status");
    const banner = document.getElementById("connection-banner");
    if (!oppId) {
        statusEl.textContent = "Väntar på motståndare…";
        banner.classList.add("hidden");
    } else if (opp && opp.connected === false) {
        banner.textContent = "Motståndaren har tappat anslutningen…";
        banner.classList.remove("hidden");
    } else {
        banner.classList.add("hidden");
    }

    const pointsSuffix = round.pointValue > 1 ? ` (${round.pointValue} poäng)` : "";
    if (round.winner === "draw") {
        statusEl.textContent = "Oavgjort!";
    } else if (round.winner === me.symbol) {
        statusEl.textContent = `Du vann ronden!${pointsSuffix} 🎉`;
    } else if (round.winner) {
        statusEl.textContent = `Motståndaren vann ronden.${pointsSuffix}`;
    } else if (!oppId) {
        // hanteras redan ovan (väntar på motståndare)
    } else {
        statusEl.textContent = game.statusText({
            round, board: round.board, myTurn, mySymbol: me.symbol, selectedCell,
        });
    }

    // Ingen "bäst av N" längre — efter en avslutad rond väntar vi på att
    // BÅDA spelarna trycker "Spela igen" (round.readyForNext) innan nästa
    // rond startar (se rooms.js markReadyForNext).
    const playAgainBtn = document.getElementById("btn-play-again");
    if (round.winner) {
        const iAmReady = !!round.readyForNext?.[myPlayerId];
        playAgainBtn.classList.remove("hidden");
        playAgainBtn.disabled = iAmReady;
        playAgainBtn.textContent = iAmReady ? "Väntar på motståndaren…" : "Spela igen";
    } else {
        playAgainBtn.classList.add("hidden");
        playAgainBtn.disabled = false;
        playAgainBtn.textContent = "Spela igen";
    }
}

export function setError(screenName, message) {
    const el = document.getElementById(`${screenName}-error`);
    if (el) el.textContent = message || "";
}

// --- Profilväljare ---
// Deterministisk avatarfärg per profil (samma namn -> samma färg varje
// gång, utan att behöva spara något extra i databasen) — gör det lättare
// att känna igen sin egen profil i en lång lista på nytt.
const AVATAR_HUES = [4, 24, 44, 84, 152, 172, 200, 224, 262, 300, 330];

function avatarHue(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

export function renderProfileList(container, profiles, onSelect, emptyMessage) {
    container.innerHTML = "";
    if (profiles.length === 0) {
        const empty = document.createElement("p");
        empty.className = "status-text";
        empty.textContent = emptyMessage || "Inga profiler ännu — skapa den första nedan.";
        container.appendChild(empty);
        return;
    }
    for (const profile of profiles) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "profile-row";

        const avatar = document.createElement("span");
        avatar.className = "profile-avatar";
        avatar.style.background = `hsl(${avatarHue(profile.name)} 55% 42%)`;
        avatar.textContent = profile.name.trim().slice(0, 1).toUpperCase();
        avatar.setAttribute("aria-hidden", "true");

        const name = document.createElement("span");
        name.className = "profile-row-name";
        name.textContent = profile.name;

        btn.append(avatar, name);
        btn.addEventListener("click", () => onSelect(profile));
        container.appendChild(btn);
    }
}

// Filtrerar en profillista på fritext (namnsök, skiftlägesokänsligt) —
// använd tillsammans med sökfältet som bara visas när listan är lång.
export function filterProfiles(profiles, query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(needle));
}

export function setCurrentProfileLabel(name) {
    document.getElementById("home-profile-name").textContent = name;
}

// --- Öppna rum på hemskärmen ---
// `rooms` är en array [{code, gameId, hostName, hostProfileId, createdAt}, ...],
// redan sorterad (senaste först) och rensad från nulls av anroparen.
// Rummet man själv är värd för visas inte i listan — man är redan i sin
// egen lobby och behöver inte gå med i sitt eget rum.
export function renderOpenRooms(rooms, myProfileId, onJoin) {
    const section = document.getElementById("open-rooms-section");
    const list = document.getElementById("open-rooms-list");
    const visible = rooms.filter((r) => r.hostProfileId !== myProfileId);

    if (visible.length === 0) {
        section.classList.add("hidden");
        list.innerHTML = "";
        return;
    }
    section.classList.remove("hidden");
    list.innerHTML = "";
    for (const room of visible) {
        const game = getGame(room.gameId);
        const row = document.createElement("div");
        row.className = "open-room-row";

        const label = document.createElement("span");
        label.textContent = `${room.hostName} startade ${game.meta.label}`;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-secondary open-room-join-btn";
        btn.textContent = "Gå med";
        btn.addEventListener("click", () => onJoin(room.code));

        row.append(label, btn);
        list.appendChild(row);
    }
}

// --- Statistik/leaderboard ---
// Fyller spel- och motståndar-väljarna. Anropas en gång när statistik-
// skärmen öppnas (motståndarlistan beror på vilka profiler som finns just
// nu, så den byggs om varje gång skärmen visas, inte en gång vid start).
export function populateStatsFilters(profiles, myProfileId) {
    const gameSelect = document.getElementById("stats-game");
    gameSelect.innerHTML = "";
    const allGamesOpt = document.createElement("option");
    allGamesOpt.value = "all";
    allGamesOpt.textContent = "Alla spel";
    gameSelect.appendChild(allGamesOpt);
    for (const game of GAME_LIST) {
        const opt = document.createElement("option");
        opt.value = game.meta.id;
        opt.textContent = game.meta.label;
        gameSelect.appendChild(opt);
    }

    const oppSelect = document.getElementById("stats-opponent");
    oppSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Alla (topplista)";
    oppSelect.appendChild(allOpt);
    for (const profile of profiles) {
        if (profile.id === myProfileId) continue;
        const opt = document.createElement("option");
        opt.value = profile.id;
        opt.textContent = profile.name;
        oppSelect.appendChild(opt);
    }
}

// --- Regler ---
// Väljaren fylls en gång (samma spellista oavsett var skärmen öppnades
// från) — vilket spel som visas väljs separat via renderRulesContent.
export function populateRulesGamePicker() {
    const select = document.getElementById("rules-game");
    select.innerHTML = "";
    for (const game of GAME_LIST) {
        const opt = document.createElement("option");
        opt.value = game.meta.id;
        opt.textContent = game.meta.label;
        select.appendChild(opt);
    }
}

export function renderRulesContent(gameId) {
    const game = getGame(gameId);
    document.getElementById("rules-game").value = game.meta.id;
    const container = document.getElementById("rules-content");
    container.innerHTML = "";
    for (const line of game.meta.rules || []) {
        const p = document.createElement("p");
        p.textContent = line;
        container.appendChild(p);
    }
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

// `view` är antingen { mode: "leaderboard", rows } eller
// { mode: "head2head", headToHead, myName, opponentName, myProfileId }.
export function renderStatsResults(container, view) {
    container.innerHTML = "";

    if (view.mode === "leaderboard") {
        if (view.rows.length === 0) {
            const empty = document.createElement("p");
            empty.className = "status-text";
            empty.textContent = "Ingen statistik för det här filtret ännu.";
            container.appendChild(empty);
            return;
        }
        view.rows.forEach((row, i) => {
            const el = document.createElement("div");
            el.className = "leaderboard-row";

            const rank = document.createElement("span");
            rank.className = "lb-rank";
            rank.textContent = String(i + 1);

            const name = document.createElement("span");
            name.className = "lb-name";
            name.textContent = row.name;

            const record = document.createElement("span");
            record.className = "lb-record";
            record.textContent = `${row.wins}v ${row.losses}f ${row.draws}o · ${row.played} spelade`;

            const rate = document.createElement("span");
            rate.className = "lb-rate";
            rate.textContent = `${Math.round(row.winRate * 100)}%`;

            el.append(rank, name, record, rate);
            container.appendChild(el);
        });
        return;
    }

    const { headToHead, myName, opponentName, myProfileId } = view;
    const summary = document.createElement("div");
    summary.className = "h2h-summary";

    const score = document.createElement("div");
    score.className = "h2h-score";
    score.textContent = `${headToHead.wins} – ${headToHead.losses}`;

    const label = document.createElement("p");
    label.className = "status-text";
    label.textContent = `${myName} mot ${opponentName}` + (headToHead.draws ? ` (${headToHead.draws} oavgjort)` : "");

    summary.append(score, label);
    container.appendChild(summary);

    if (headToHead.matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "status-text";
        empty.textContent = "Ni har inte mötts inom det här filtret ännu.";
        container.appendChild(empty);
        return;
    }

    const list = document.createElement("div");
    list.className = "h2h-list";
    for (const entry of headToHead.matches) {
        const game = getGame(entry.gameId);
        const symbols = Object.keys(entry.players || {});
        const mySym = symbols.find((s) => entry.players[s]?.profileId === myProfileId);
        const outcome = entry.winnerSymbol === "draw" ? "draw" : (entry.winnerSymbol === mySym ? "win" : "loss");
        const resultText = { win: "Vinst", loss: "Förlust", draw: "Oavgjort" }[outcome];

        const row = document.createElement("div");
        row.className = `h2h-match h2h-${outcome}`;

        const gameLabel = document.createElement("span");
        gameLabel.textContent = game.meta.label;
        const result = document.createElement("span");
        result.textContent = resultText;
        const date = document.createElement("span");
        date.textContent = formatDate(entry.timestamp);

        row.append(gameLabel, result, date);
        list.appendChild(row);
    }
    container.appendChild(list);
}
