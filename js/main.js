// main.js
// Startpunkt: kopplar ihop skärmar, formulär och Firebase-lyssnaren.
// Håller det lilla state:t appen behöver (vilket rum/spelare/profil jag är).

import {
    createRoom, joinRoom, makeMove, finishRound, markReadyForNext,
    cancelWaitingRoom, listenToOpenRooms,
    forgetRoom, listenToRoom, normalizeCode,
} from "./rooms.js?v=48";
import {
    showScreen, renderLobby, renderGame, setError,
    renderProfileList, filterProfiles, setCurrentProfileLabel, populateStatsFilters, renderStatsResults, renderOpenRooms,
    populateRulesGamePicker, renderRulesContent,
} from "./ui.js?v=48";
import { getGame, DEFAULT_GAME_ID } from "./games/registry.js?v=48";
import {
    listProfiles, getOrCreateProfileByName, getStoredProfile, storeProfile, clearStoredProfile, fetchStatsLog,
} from "./profiles.js?v=48";
import { filterEntries, buildLeaderboard, buildHeadToHead } from "./stats.js?v=48";

// Bumpas manuellt vid varje push så det syns i appen (längst ner) vilken
// version en telefon faktiskt kör — bra för att felsöka cache-problem.
// OBS: samma ?v=-suffix måste bumpas på ALLA interna import-satser
// (main.js, rooms.js, ui.js, profiler/stats) och på script/link-taggarna
// i index.html, annars riskerar olika filer att cachas separat och hamna
// i otakt — vilket var precis orsaken till att "rummet hittades inte"
// kvarstod trots att fixen redan var pushad.
export const APP_VERSION = "build 48 · 2026-08-08";

let currentCode = null;
let myPlayerId = null;
let myProfile = null;
let pendingJoinCode = null; // ?code=-länk som väntar på att en profil väljs
let unsubscribe = null;
let latestOpenRooms = [];
let rulesReturnScreen = "home";
let lastRulesGameId = DEFAULT_GAME_ID;

// Vilken rond (roundNumber) den här klienten redan försökt avsluta
// (finishRound) — förhindrar att varje ny rendering av samma avslutade
// rond spammar en ny transaktion.
let finishedRoundKey = null;

// Flyttfasens val av "vilken egen bricka ska flyttas" är ren lokal
// UI-state — motståndaren behöver aldrig se den, bara det färdiga draget.
let lastRoom = null;
let selectedCell = null;
let lastTurnKey = null;

// Delas med spel som renderar sitt eget bräde (game.renderBoard) — de
// bygger och binder klickhanterare direkt vid rendering istället för att
// gå via den delegerade #board-lyssnaren längre ner.
function setSelectedCell(cell) {
    selectedCell = cell;
    renderGame(lastRoom, myPlayerId, selectedCell, gameCallbacks);
}

function sendAction(action) {
    if (!currentCode || !myPlayerId) return;
    makeMove(currentCode, action, myPlayerId).catch(() => { /* ogiltig handling, ignorera */ });
}

const gameCallbacks = { setSelectedCell, sendAction };

function leaveRoomState() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    finishedRoundKey = null;
    lastRoom = null;
    selectedCell = null;
    lastTurnKey = null;
    if (currentCode) forgetRoom(currentCode);
    currentCode = null;
    myPlayerId = null;
}

function subscribe(code) {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenToRoom(code, (room) => onRoomUpdate(room));
}

function onRoomUpdate(room) {
    if (!room || room.claiming) return; // rum borttaget eller mitt i skapandet

    if (room.status === "waiting") {
        showScreen("lobby");
        renderLobby(room, currentCode);
        return;
    }

    if (room.status === "playing") {
        const round = room.round;
        // Ett nytt drag (turen bytte spelare, eller ny runda) gör alltid
        // ett eventuellt lokalt brickval inaktuellt.
        const turnKey = round ? `${round.roundNumber}:${round.turn}:${Object.keys(round.board || {}).length}` : null;
        if (turnKey !== lastTurnKey) {
            selectedCell = null;
            lastTurnKey = turnKey;
        }
        lastRoom = room;

        showScreen("game");
        renderGame(room, myPlayerId, selectedCell, gameCallbacks);

        // Ingen "bäst av N"/matchslut längre: så fort en rond får en
        // vinnare avslutas den direkt (poäng räknas, resultatet loggas
        // till statistiken) — men nästa rond startar inte förrän BÅDA
        // spelarna tryckt "Spela igen" (se btn-play-again nedan).
        if (round?.winner && !round.scored && finishedRoundKey !== round.roundNumber) {
            finishedRoundKey = round.roundNumber;
            finishRound(currentCode).catch(() => { /* motparten hann redan lösa det */ });
        }
    }
}

function buildShareUrl(code) {
    const url = new URL(location.href);
    url.search = `?code=${code}`;
    return url.toString();
}

// --- Profilväljare ---
// Sökfältet visas bara när listan är tillräckligt lång för att bli rörig
// att skanna igenom för hand.
const PROFILE_SEARCH_THRESHOLD = 7;
let allProfiles = [];

function renderFilteredProfileList() {
    const list = document.getElementById("profile-list");
    const query = document.getElementById("profile-search").value;
    const visible = filterProfiles(allProfiles, query);
    const emptyMessage = query.trim() ? "Ingen profil matchar sökningen." : undefined;
    renderProfileList(list, visible, onProfilePicked, emptyMessage);
}

async function refreshProfileList() {
    const searchInput = document.getElementById("profile-search");
    try {
        allProfiles = await listProfiles();
        searchInput.classList.toggle("hidden", allProfiles.length <= PROFILE_SEARCH_THRESHOLD);
        searchInput.value = "";
        renderFilteredProfileList();
    } catch {
        setError("profile", "Kunde inte hämta profiler. Försök igen.");
    }
}

document.getElementById("profile-search").addEventListener("input", renderFilteredProfileList);

function onProfilePicked(profile) {
    myProfile = profile;
    storeProfile(profile);
    setCurrentProfileLabel(profile.name);
    setError("profile", "");
    showScreen("home");
    if (pendingJoinCode) {
        const code = pendingJoinCode;
        pendingJoinCode = null;
        document.getElementById("join-code").value = code;
        document.getElementById("form-join").classList.remove("hidden");
    }
    // Uppdatera listan direkt så mitt eget ev. öppna rum (om jag bytte
    // TILL en profil som råkar vara värd för ett) inte visas för mig själv.
    renderOpenRooms(latestOpenRooms, myProfile.id, onJoinOpenRoom);
}

document.getElementById("form-profile-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("profile", "");
    const name = document.getElementById("profile-new-name").value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
        const profile = await getOrCreateProfileByName(name);
        document.getElementById("profile-new-name").value = "";
        onProfilePicked(profile);
    } catch (err) {
        setError("profile", err.message || "Kunde inte skapa profilen. Försök igen.");
    } finally {
        submitBtn.disabled = false;
    }
});

document.getElementById("btn-switch-profile").addEventListener("click", () => {
    clearStoredProfile();
    myProfile = null;
    setError("profile", "");
    showScreen("profile");
    refreshProfileList();
});

// --- Öppna spel på hemskärmen ---
function subscribeOpenRooms() {
    listenToOpenRooms((raw) => {
        latestOpenRooms = raw
            ? Object.entries(raw).map(([code, r]) => ({ code, ...r })).sort((a, b) => b.createdAt - a.createdAt)
            : [];
        renderOpenRooms(latestOpenRooms, myProfile?.id, onJoinOpenRoom);
    });
}

async function onJoinOpenRoom(code) {
    await performJoin(code);
}

// --- Starta ett spel direkt (inget "skapa rum"-mellansteg) ---
document.querySelectorAll('#start-game-picker button[data-game-id]').forEach((btn) => {
    btn.addEventListener("click", async () => {
        setError("home", "");
        btn.disabled = true;
        try {
            const { code, playerId } = await createRoom(btn.dataset.gameId, myProfile);
            currentCode = code;
            myPlayerId = playerId;
            subscribe(code);
            showScreen("lobby");
            setupLobbyLinks(code);
        } catch (err) {
            setError("home", err.message || "Kunde inte skapa rummet. Försök igen.");
        } finally {
            btn.disabled = false;
        }
    });
});

// --- Gå med i rum (reserv: manuell kod, eller klick i öppna-listan) ---
async function performJoin(codeInput) {
    setError("join", "");
    try {
        const result = await joinRoom(codeInput, myProfile);
        currentCode = result.code;
        myPlayerId = result.playerId;
        subscribe(result.code);
        showScreen("lobby");
        setupLobbyLinks(result.code);
    } catch (err) {
        setError("join", err.message || "Kunde inte gå med i rummet.");
    }
}

document.getElementById("btn-toggle-join-code").addEventListener("click", () => {
    document.getElementById("form-join").classList.toggle("hidden");
});

document.getElementById("form-join").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("join-code").value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    await performJoin(code);
    submitBtn.disabled = false;
});

document.getElementById("join-code").addEventListener("input", (e) => {
    e.target.value = normalizeCode(e.target.value);
});

// --- Lobby ---
function setupLobbyLinks(code) {
    const url = buildShareUrl(code);
    const shareBtn = document.getElementById("btn-share-link");
    if (navigator.share) {
        shareBtn.classList.remove("hidden");
        shareBtn.onclick = () => {
            navigator.share({ title: "Boardgame", text: `Spela mot mig! Rumskod: ${code}`, url }).catch(() => {});
        };
    } else {
        shareBtn.classList.add("hidden");
    }
    document.getElementById("btn-copy-link").onclick = async () => {
        try {
            await navigator.clipboard.writeText(url);
            const btn = document.getElementById("btn-copy-link");
            const original = btn.textContent;
            btn.textContent = "Kopierad!";
            setTimeout(() => { btn.textContent = original; }, 1500);
        } catch {
            window.prompt("Kopiera länken:", url);
        }
    };
}

document.getElementById("btn-lobby-cancel").addEventListener("click", () => {
    const code = currentCode;
    leaveRoomState();
    showScreen("home");
    // Tar bort rummet + dess post i öppna-listan (fire-and-forget: om en
    // motståndare hann gå med i exakt samma ögonblick avbryts detta tyst
    // av transaktionen i cancelWaitingRoom, ingen skada skedd).
    if (code) cancelWaitingRoom(code).catch(() => {});
});

// --- Spelbrädet ---
// Cellerna byggs dynamiskt av ui.js (olika spel har olika bräddimension),
// så klicken fångas med EN delegerad lyssnare på #board istället för en
// per cell. Själva klicklogiken (direkt drag, tvåstegs val+flytt, etc.)
// avgörs helt av den aktuella spelmodulens onCellClick — main.js vet
// inget om enskilda spelregler.
//
// Spel med eget bräde (game.renderBoard, t.ex. backgammon — inte ett
// enkelt rutnät) binder sina egna klickhanterare direkt vid rendering
// (se gameCallbacks ovan) och hanteras INTE av den här delegeringen.
document.getElementById("board").addEventListener("click", (e) => {
    if (!currentCode || !myPlayerId || !lastRoom?.round) return;
    const game = getGame(lastRoom.gameId);
    if (typeof game.renderBoard === "function") return;

    const cellEl = e.target.closest(".cell");
    if (!cellEl) return;
    const cellIndex = Number(cellEl.id.slice("cell-".length));

    const round = lastRoom.round;
    const me = lastRoom.players?.[myPlayerId];
    if (!me || round.winner || round.turn !== myPlayerId) return;

    game.onCellClick({
        round,
        board: round.board,
        myPlayerId,
        mySymbol: me.symbol,
        cellIndex,
        selectedCell,
        setSelectedCell,
        sendAction,
    });
});

document.getElementById("btn-leave-game").addEventListener("click", () => {
    if (!window.confirm("Lämna spelet?")) return;
    leaveRoomState();
    showScreen("home");
});

// Ny rond kräver att BÅDA spelarna trycker "Spela igen" efter en
// avslutad rond (se rooms.js markReadyForNext + ui.js renderGame).
document.getElementById("btn-play-again").addEventListener("click", (e) => {
    if (!currentCode || !myPlayerId) return;
    e.target.disabled = true;
    markReadyForNext(currentCode, myPlayerId).catch(() => {
        e.target.disabled = false;
    });
});

// --- Statistik ---
let statsCache = null; // { entries, profiles } — hämtas en gång per öppning

async function openStats() {
    showScreen("stats");
    const results = document.getElementById("stats-results");
    results.innerHTML = "";
    try {
        const [entries, profiles] = await Promise.all([fetchStatsLog(), listProfiles()]);
        statsCache = { entries, profiles };
        populateStatsFilters(profiles, myProfile?.id);
        renderStatsView();
    } catch {
        statsCache = { entries: [], profiles: [] };
        renderStatsView();
    }
}

function renderStatsView() {
    if (!statsCache) return;
    const gameId = document.getElementById("stats-game").value || "all";
    const timeframe = document.getElementById("stats-timeframe").value || "all";
    const opponentId = document.getElementById("stats-opponent").value || "all";
    const filtered = filterEntries(statsCache.entries, { gameId, timeframe });

    if (opponentId === "all" || !myProfile) {
        const rows = buildLeaderboard(filtered);
        renderStatsResults(document.getElementById("stats-results"), { mode: "leaderboard", rows });
        return;
    }

    const opponent = statsCache.profiles.find((p) => p.id === opponentId);
    const headToHead = buildHeadToHead(filtered, myProfile.id, opponentId);
    renderStatsResults(document.getElementById("stats-results"), {
        mode: "head2head",
        headToHead,
        myName: myProfile.name,
        opponentName: opponent ? opponent.name : "okänd",
        myProfileId: myProfile.id,
    });
}

document.getElementById("btn-show-stats").addEventListener("click", openStats);
document.getElementById("btn-stats-back").addEventListener("click", () => showScreen("home"));
document.getElementById("stats-game").addEventListener("change", renderStatsView);
document.getElementById("stats-timeframe").addEventListener("change", renderStatsView);
document.getElementById("stats-opponent").addEventListener("change", renderStatsView);

// --- Regler --- Kan öppnas från hemskärmen (utan spelkontext — visar
// senast tittade/förvalda spelet) eller direkt från ett pågående parti
// (visar det spelet). "Tillbaka" går dit man kom ifrån i båda fallen.
function openRules(gameId, returnScreen) {
    rulesReturnScreen = returnScreen;
    populateRulesGamePicker();
    lastRulesGameId = gameId;
    renderRulesContent(gameId);
    showScreen("rules");
}

document.getElementById("btn-show-rules").addEventListener("click", () => openRules(lastRulesGameId, "home"));
document.getElementById("btn-show-game-rules").addEventListener("click", () => {
    if (!lastRoom) return;
    openRules(lastRoom.gameId, "game");
});
document.getElementById("btn-rules-back").addEventListener("click", () => showScreen(rulesReturnScreen));
document.getElementById("rules-game").addEventListener("change", (e) => {
    lastRulesGameId = e.target.value;
    renderRulesContent(lastRulesGameId);
});

// --- Start: läs ev. ?code= i länken, hoppa till profilval om ingen
// profil är vald ännu, annars rakt till hemskärmen (nu med den öppna
// listan) — en delad länk räcker att öppna för att se värdens spel i
// listan, ?code= behövs bara för att förifylla kod-reservformuläret ---
(async function init() {
    document.getElementById("app-version").textContent = APP_VERSION;
    const params = new URLSearchParams(location.search);
    const codeFromLink = normalizeCode(params.get("code") || "");

    const stored = getStoredProfile();
    if (stored) {
        myProfile = stored;
        setCurrentProfileLabel(stored.name);
        showScreen("home");
        if (codeFromLink) {
            document.getElementById("join-code").value = codeFromLink;
            document.getElementById("form-join").classList.remove("hidden");
        }
    } else {
        pendingJoinCode = codeFromLink || null;
        showScreen("profile");
        refreshProfileList();
    }
    subscribeOpenRooms();
})();
