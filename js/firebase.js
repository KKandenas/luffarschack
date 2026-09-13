// firebase.js
// Firebase-init + generiska DB-helpers. Ingen spellogik här.
//
// Delar Firebase-projekt med Noir Syndicate (samma klientkonfiguration —
// den är inte hemlig, säkerheten sitter i Realtime Database-reglerna).
// All data för det här spelet ligger isolerat under toppnoden
// "luffarschack/" så det aldrig krockar med det andra spelets "rooms/".

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getDatabase, ref, set, get, update, remove, onValue, off,
    runTransaction, onDisconnect, push
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJMAUFQYCpvbXl3T1fyEb1dZRFqXbPFQ8",
    authDomain: "noir-syndicate-digital.firebaseapp.com",
    databaseURL: "https://noir-syndicate-digital-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "noir-syndicate-digital",
    storageBucket: "noir-syndicate-digital.firebasestorage.app",
    messagingSenderId: "211341530009",
    appId: "1:211341530009:web:31366f14989e8f4b737908"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// --- Sökvägshjälpare ---
export const paths = {
    room: (code) => `luffarschack/rooms/${code}`,
    players: (code) => `luffarschack/rooms/${code}/players`,
    player: (code, playerId) => `luffarschack/rooms/${code}/players/${playerId}`,
    score: (code) => `luffarschack/rooms/${code}/score`,
    round: (code) => `luffarschack/rooms/${code}/round`,
    status: (code) => `luffarschack/rooms/${code}/status`,
    profiles: () => `luffarschack/profiles`,
    profile: (id) => `luffarschack/profiles/${id}`,
    statsLog: () => `luffarschack/statsLog`,
    openRooms: () => `luffarschack/openRooms`,
    openRoom: (code) => `luffarschack/openRooms/${code}`,
};

// --- Generiska wrappers ---
export async function dbSet(path, value) { return set(ref(db, path), value); }

export async function dbGet(path) {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : null;
}

export async function dbUpdateAt(path, value) { return update(ref(db, path), value); }

// Lägger till EN post under `path` med en Firebase-genererad, kronologiskt
// sorterbar nyckel — används för append-only-loggen över spelade ronder
// (statsLog). Ingen transaktion behövs: varje push() är sin egen unika
// nyckel, så två klienter som pushar samtidigt krockar aldrig.
export async function dbPush(path, value) {
    const r = push(ref(db, path));
    await set(r, value);
    return r.key;
}

export async function dbRemove(path) { return remove(ref(db, path)); }

export function dbListen(path, callback) {
    const r = ref(db, path);
    onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
    return () => off(r);
}

// Transaction på ett godtyckligt sökväg. updateFn(current) -> nytt värde,
// eller returnera `undefined` för att avbryta (ingen skrivning sker).
// Firebase kör om funktionen med färsk data om något ändrats under tiden —
// det är detta som gör att två spelares klienter kan göra samma
// "räkna poäng / starta nästa runda"-beräkning utan att krocka.
export async function dbTransact(path, updateFn) {
    const r = ref(db, path);
    const result = await runTransaction(r, updateFn);
    return { committed: result.committed, value: result.snapshot.val() };
}

// Sätter presence: markeras automatiskt som frånkopplad av
// FIREBASE-SERVERN om anslutningen bryts (stängd flik, tappad uppkoppling,
// appen bakgrundad). Fungerar även om klientens egen JS aldrig hinner
// köra någon "lämna"-logik.
export function registerPresence(code, playerId) {
    const playerRef = ref(db, paths.player(code, playerId));
    onDisconnect(playerRef).update({ connected: false });
}

// Städar bort rummets post i den öppna listan automatiskt om VÄRDEN
// försvinner (stängd flik/app) INNAN någon hunnit gå med — annars blir
// den kvar för evigt och visas som "väntar" åt alla, trots att ingen
// längre är där (se createRoom i rooms.js). Ofarligt att registrera
// villkorslöst: joinRoom/cancelWaitingRoom tar redan bort samma post så
// fort rummet blir fullt eller avbryts, så en EFTERFÖLJANDE frånkoppling
// (t.ex. värden lämnar mitt i ett pågående parti) bara försöker ta bort
// en post som redan är borta — ett ofarligt no-op.
export function registerOpenRoomCleanup(code) {
    const openRoomRef = ref(db, paths.openRoom(code));
    onDisconnect(openRoomRef).remove();
}
