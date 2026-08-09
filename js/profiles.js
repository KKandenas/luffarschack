// profiles.js
// Globala, namngivna spelarprofiler — inga lösenord/PIN (medvetet val,
// se README: matchar appens "inga konton"-filosofi, samma tillit som
// resten av databasen redan bygger på). En profil är EN global identitet
// (t.ex. "Kristian") som statistik/leaderboard räknas mot över alla rum
// och all tid.
//
// Skiljer sig från rooms.js "playerId": playerId är en kortlivad
// session-identitet knuten till ETT rum (för drag/tur/presence), medan
// profileId är den varaktiga identiteten en spelare väljer EN gång och
// sedan återanvänder i alla rum den skapar/går med i.

import { paths, dbGet, dbSet } from "./firebase.js?v=48";

const STORAGE_KEY = "luffarschack:profile";

function generateProfileId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `pr-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Hämtar alla profiler som en sorterad array [{id, name, createdAt}, ...],
// sorterad alfabetiskt (oberoende av versaler/gemener) — enkel lista att
// visa som knappar i profilväljaren.
export async function listProfiles() {
    const raw = await dbGet(paths.profiles());
    if (!raw) return [];
    return Object.entries(raw)
        .map(([id, p]) => ({ id, name: p.name, createdAt: p.createdAt }))
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

function findByName(profiles, name) {
    const needle = name.trim().toLowerCase();
    return profiles.find((p) => p.name.trim().toLowerCase() === needle) || null;
}

// Skapar en ny profil, MEN om en profil med exakt samma namn (oavsett
// skiftläge) redan finns återanvänds den istället — annars skulle två
// spelare som båda skriver "Kristian" av misstag splittra statistiken på
// två olika profiler.
export async function getOrCreateProfileByName(name) {
    const trimmed = (name || "").trim().slice(0, 20);
    if (!trimmed) throw new Error("Ange ett namn.");

    const existing = findByName(await listProfiles(), trimmed);
    if (existing) return { id: existing.id, name: existing.name };

    const id = generateProfileId();
    await dbSet(paths.profile(id), { name: trimmed, createdAt: Date.now() });
    return { id, name: trimmed };
}

export function getStoredProfile() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function storeProfile(profile) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* privat läge, strunta i det */ }
}

export function clearStoredProfile() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}

// Hämtar HELA statistikloggen som en array — litet dataset (en hobbyapp
// för ett par spelare), så all filtrering/aggregering sker client-side
// (se stats.js) istället för att bygga databas-frågor för det.
export async function fetchStatsLog() {
    const raw = await dbGet(paths.statsLog());
    return raw ? Object.values(raw) : [];
}
