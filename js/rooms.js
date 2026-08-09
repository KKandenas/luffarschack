// rooms.js
// Rumshantering: skapa/gå med, drag, rondövergångar och spelaridentitet.
// All skrivning som avgör spelutgången görs via dbTransact på hela
// rum-noden — det gör operationerna idempotenta så att BÅDA spelarnas
// klienter kan räkna ut och skriva samma resultat utan att krocka. Helt
// agnostisk om VILKET spel som spelas — det avgörs av registret i
// js/games/registry.js (room.gameId pekar ut modulen).
//
// Ingen "bäst av N"/matchslut längre: rondar spelas kontinuerligt.
// När en rond får en vinnare loggas den direkt till den globala
// statistiken (statsLog), och BÅDA spelarna måste trycka "Spela igen"
// innan en ny rond startar (round.readyForNext) — se finishRound/
// markReadyForNext nedan.

import { paths, dbGet, dbSet, dbRemove, dbTransact, dbListen, dbPush, registerPresence } from "./firebase.js?v=48";
import { getGame, DEFAULT_GAME_ID } from "./games/registry.js?v=48";

// Spel kan lägga till egna initiala fält på runde-nivå (t.ex. backgammons
// dubbleringstärning) via en valfri game.initialRoundState()-hook.
function createRound(gameId, roundNumber, startingPlayerId) {
    const game = getGame(gameId);
    const extra = game.initialRoundState ? game.initialRoundState() : {};
    return {
        roundNumber,
        board: game.createBoard(),
        turn: startingPlayerId,
        startingPlayer: startingPlayerId,
        winner: null,
        winLine: null,
        lastMove: null,
        pointValue: 1,
        scored: false,
        readyForNext: null,
        ...extra,
    };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // utan I, O, 0, 1 — lätta att förväxla
const CODE_LENGTH = 4;

function generateCode() {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
}

export function normalizeCode(input) {
    return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

function generatePlayerId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function storageKey(code) { return `luffarschack:${code}`; }

export function getStoredPlayerId(code) {
    try { return localStorage.getItem(storageKey(code)); } catch { return null; }
}

function storePlayerId(code, playerId) {
    try { localStorage.setItem(storageKey(code), playerId); } catch { /* privat läge, strunta i det */ }
}

export function forgetRoom(code) {
    try { localStorage.removeItem(storageKey(code)); } catch { /* no-op */ }
}

async function claimUniqueCode() {
    for (let attempt = 0; attempt < 12; attempt++) {
        const code = generateCode();
        const { committed } = await dbTransact(paths.room(code), (current) => {
            if (current !== null) return undefined; // upptagen kod, avbryt
            return { claiming: true, claimedAt: Date.now() };
        });
        if (committed) return code;
    }
    throw new Error("Kunde inte hitta en ledig rumskod. Försök igen.");
}

export async function createRoom(gameId, profile) {
    const code = await claimUniqueCode();
    const playerId = generatePlayerId();
    const resolvedGameId = gameId || DEFAULT_GAME_ID;
    const room = {
        gameId: resolvedGameId,
        hostId: playerId,
        createdAt: Date.now(),
        status: "waiting",
        players: {
            [playerId]: { symbol: "X", profileId: profile.id, name: profile.name, connected: true, joinedAt: Date.now() },
        },
        score: { [playerId]: 0 },
        round: null,
    };
    await dbSet(paths.room(code), room);
    // Synlig i den öppna listan på hemskärmen tills någon går med (eller
    // värden avbryter) — se listenToOpenRooms/cancelWaitingRoom.
    await dbSet(paths.openRoom(code), {
        gameId: resolvedGameId, hostName: profile.name, hostProfileId: profile.id, createdAt: Date.now(),
    });
    storePlayerId(code, playerId);
    registerPresence(code, playerId);
    return { code, playerId, room };
}

export async function joinRoom(codeInput, profile) {
    const code = normalizeCode(codeInput);
    if (code.length !== CODE_LENGTH) throw new Error("Ange en giltig 4-teckens rumskod.");

    // Medveten avvikelse från mönstret i övriga filen: EN bekräftad läsning
    // + EN vanlig skrivning, INGEN dbTransact. En transaktion på en sökväg
    // klienten aldrig synkat lokalt (första gången den här spelarens enhet
    // någonsin rör vid rummet) kan få sin uppdateringsfunktion anropad med
    // ett GISSAT `null` innan Firebase hunnit fråga servern — och eftersom
    // vår logik då avbryter permanent (utan att någonsin verifiera mot
    // servern på riktigt) gav det felaktigt "Rummet hittades inte" trots
    // att rummet fanns. Samma mönster som redan används i Noir Syndicates
    // joinRoom (players.js), som aldrig haft det här problemet. Risken vi
    // accepterar: om två spelare skulle gå med i exakt samma millisekund
    // kan den sista skrivningen skriva över den första — försumbart för ett
    // rum med plats för bara två spelare.
    let room;
    try {
        room = await dbGet(paths.room(code));
    } catch (err) {
        // Skiljer ut ett riktigt Firebase-fel (t.ex. behörighet nekad) från
        // "rummet finns inte" — annars ser båda likadana ut för spelaren.
        throw new Error(`Kunde inte läsa rummet (${err.code || err.message || "okänt fel"}).`);
    }
    if (!room) throw new Error(`Rummet hittades inte (kod: ${code}). Kontrollera koden.`);

    const storedId = getStoredPlayerId(code);
    const newId = storedId || generatePlayerId();
    const players = room.players || {};

    if (players[newId]) {
        // Spelaren är redan med (t.ex. sidan laddades om) — markera bara ansluten.
        await dbSet(paths.player(code, newId), { ...players[newId], connected: true });
        storePlayerId(code, newId);
        registerPresence(code, newId);
        return { code, playerId: newId, room };
    }

    const ids = Object.keys(players);
    if (ids.length >= 2) throw new Error("Rummet är redan fullt.");

    const symbol = ids.length === 0 ? "X" : (players[ids[0]].symbol === "X" ? "O" : "X");
    const updatedPlayers = {
        ...players,
        [newId]: { symbol, profileId: profile.id, name: profile.name, connected: true, joinedAt: Date.now() },
    };
    const updatedScore = { ...(room.score || {}), [newId]: 0 };
    let updatedRoom = { ...room, players: updatedPlayers, score: updatedScore };

    const becameFull = Object.keys(updatedPlayers).length === 2 && room.status === "waiting";
    if (becameFull) {
        updatedRoom = { ...updatedRoom, status: "playing", round: createRound(room.gameId, 1, room.hostId) };
    }

    await dbSet(paths.room(code), updatedRoom);
    // Rummet är inte längre öppet att gå med i — ta bort det ur den
    // synliga listan på hemskärmen (bara relevant vid FÖRSTA gången
    // rummet blir fullt, inte vid en ombladdning där man redan var med).
    if (becameFull) await dbRemove(paths.openRoom(code)).catch(() => {});
    storePlayerId(code, newId);
    registerPresence(code, newId);
    return { code, playerId: newId, room: updatedRoom };
}

// Öppna rum synliga på hemskärmen — en spelare kan trycka "Gå med"
// direkt istället för att skriva in en kod. Lyssnaren uppdateras live så
// nya/borttagna rum syns direkt hos alla som just då är på hemskärmen.
export function listenToOpenRooms(callback) {
    return dbListen(paths.openRooms(), callback);
}

// Anropas när värden trycker "Avbryt" i lobbyn INNAN någon gått med.
// Tar bort hela rummet (inget att spara — ingen rond har startat) samt
// dess post i den öppna listan. Skyddat av en transaktion: om en
// motståndare hann gå med i exakt samma ögonblick avbryts operationen
// tyst istället för att förstöra ett parti som precis startade.
export async function cancelWaitingRoom(code) {
    const { committed } = await dbTransact(paths.room(code), (current) => {
        if (!current || current.status !== "waiting") return undefined;
        return null; // tar bort hela rum-noden
    });
    if (committed) await dbRemove(paths.openRoom(code)).catch(() => {});
    return committed;
}

// `action`s form beror på spelet (se respektive js/games/*.js) — t.ex.
// { type: "place", cell } eller { type: "move", from, to }.
export async function makeMove(code, action, playerId) {
    const { committed } = await dbTransact(paths.room(code), (current) => {
        if (!current || !current.round) return undefined;
        const players = current.players || {};
        const me = players[playerId];
        if (!me) return undefined;
        const otherId = Object.keys(players).find((id) => id !== playerId);
        const game = getGame(current.gameId);
        const updatedRound = game.applyAction(current.round, action, playerId, me.symbol, otherId);
        if (updatedRound === current.round) return undefined; // ogiltig handling, avbryt tyst
        return { ...current, round: updatedRound };
    });
    return committed;
}

// Bygger en statsLog-post av en färdigscorad rond och pushar den till den
// globala, append-only statistikloggen — källan som leaderboard-skärmen
// läser och aggregerar client-side.
async function logRoundResult(room) {
    const round = room.round;
    const playerIds = Object.keys(room.players || {});
    const entry = { gameId: room.gameId, timestamp: Date.now(), winnerSymbol: round.winner, players: {} };
    for (const id of playerIds) {
        const p = room.players[id];
        entry.players[p.symbol] = { profileId: p.profileId, name: p.name };
    }
    await dbPush(paths.statsLog(), entry);
}

// Anropas av BÅDA klienterna så fort de ser att en runda fått en vinnare
// (inget "bäst av N" längre — varje avslutad rond räknas och loggas för
// sig). Transaktionen garanterar att bara den FÖRSTA klienten som hinner
// fram faktiskt räknar poängen — den andra klientens försök avbryts tyst
// eftersom `round.scored` redan hunnit bli true. Just den vinnande
// klienten (committed === true) är därför också den enda som loggar
// statistikposten, så varje rond loggas exakt en gång.
export async function finishRound(code) {
    const { committed, value } = await dbTransact(paths.room(code), (current) => {
        if (!current || !current.round || !current.round.winner) return undefined;
        if (current.round.scored) return undefined;

        const round = current.round;
        const score = { ...(current.score || {}) };
        const playerIds = Object.keys(current.players || {});
        if (round.winner !== "draw") {
            const winnerId = playerIds.find((id) => current.players[id].symbol === round.winner);
            if (winnerId) score[winnerId] = (score[winnerId] || 0) + (round.pointValue || 1);
        }

        return { ...current, score, round: { ...round, scored: true } };
    });
    if (committed && value) await logRoundResult(value);
    return committed;
}

// Anropas när EN spelare trycker "Spela igen" efter en avslutad rond.
// Ny rond startar (via samma transaktion) så fort BÅDA spelarna markerat
// sig redo — annars sparas bara min egen "redo"-flagga och vi väntar på
// motståndaren.
export async function markReadyForNext(code, playerId) {
    const { committed } = await dbTransact(paths.room(code), (current) => {
        if (!current || !current.round || !current.round.winner) return undefined;
        const round = current.round;
        const playerIds = Object.keys(current.players || {});
        const readyForNext = { ...(round.readyForNext || {}), [playerId]: true };
        const allReady = playerIds.length === 2 && playerIds.every((id) => readyForNext[id]);

        if (!allReady) return { ...current, round: { ...round, readyForNext } };

        const nextStarter = round.startingPlayer === current.hostId
            ? (playerIds.find((id) => id !== current.hostId) ?? current.hostId)
            : current.hostId;
        return { ...current, round: createRound(current.gameId, round.roundNumber + 1, nextStarter) };
    });
    return committed;
}

export async function fetchRoom(code) {
    return dbGet(paths.room(code));
}

export function listenToRoom(code, callback) {
    return dbListen(paths.room(code), callback);
}
