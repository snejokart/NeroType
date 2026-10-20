import { ACHIEVEMENTS, levelInfo, type CharacterStat, type RunResult } from "./game";
export type Profile = ReturnType<typeof buildProfile>;
export function dayKey(date: number, tz: number) { return new Date(date + tz * 60000).toISOString().slice(0, 10); }
export function buildProfile(user: {
    id: string;
    name: string;
    email: string | null;
}, rows: (RunResult & {
    characters: string;
})[], tz = 0) {
    const ranked = rows.filter(r => !r.trial);
    const xp = ranked.reduce((s, r) => s + r.xp, 0);
    const correct = rows.reduce((s, r) => s + r.correct, 0);
    const errors = rows.reduce((s, r) => s + r.errors, 0);
    const day = dayKey(Date.now(), tz);
    const today = rows.filter(r => dayKey(r.createdAt, tz) === day);
    const days = new Set(rows.map(r => dayKey(r.createdAt, tz)));
    let streak = 0;
    let cursor = Date.now();
    if (!days.has(day))
        cursor -= 86400000;
    while (days.has(dayKey(cursor, tz))) {
        streak++;
        cursor -= 86400000;
    }
    let bestStreak = 0;
    let consecutive = 0;
    let previousDay = 0;
    for (const key of [...days].sort()) {
        const value = Date.parse(key);
        consecutive = value - previousDay === 86400000 ? consecutive + 1 : 1;
        bestStreak = Math.max(bestStreak, consecutive);
        previousDay = value;
    }
    const characters: Record<string, CharacterStat> = {};
    for (const r of rows) {
        const chars: Record<string, CharacterStat> = JSON.parse(r.characters);
        for (const [key, stat] of Object.entries(chars)) {
            const old = characters[key] ?? { hits: 0, errors: 0 };
            characters[key] = { hits: old.hits + stat.hits, errors: old.errors + stat.errors };
        }
    }
    const weak = Object.entries(characters).filter(([, s]) => s.errors > 0).map(([key, s]) => ({ key, ...s, rate: Math.round(s.errors / (s.hits + s.errors) * 100) })).sort((a, b) => b.errors - a.errors || b.rate - a.rate);
    const weakKeys = weak.filter(k => k.key.length === 1).slice(0, 12);
    const weakPairs = weak.filter(k => k.key.length === 2).slice(0, 5);
    const best = { wpm: Math.max(0, ...rows.map(r => r.wpm)), cpm: Math.max(0, ...rows.map(r => r.cpm)), combo: Math.max(0, ...rows.map(r => r.maxCombo)) };
    const values = { sessions: rows.length, perfect: Number(rows.some(r => r.errors === 0 && r.correct >= 50)), cpm: best.cpm, wpm: best.wpm, combo: best.combo, streak: bestStreak, modes: new Set(rows.map(r => r.mode)).size };
    return {
        user: { ...user, guest: !user.email }, xp, ...levelInfo(xp),
        stats: { sessions: rows.length, duration: rows.reduce((s, r) => s + r.duration, 0), correct, errors, accuracy: correct + errors ? Math.round(correct / (correct + errors) * 1000) / 10 : 100, bestWpm: best.wpm, bestCpm: best.cpm, bestCombo: best.combo, streak, todaySeconds: Math.floor(today.reduce((s, r) => s + r.duration, 0) / 1000) },
        weakKeys, weakPairs, achievements: ACHIEVEMENTS.map(a => ({ ...a, value: values[a.kind], earned: values[a.kind] >= a.target })),
        recent: rows.slice(0, 20).map(({ characters: _characters, ...r }) => r),
        history: Array.from({ length: 14 }, (_, i) => {
            const key = dayKey(Date.now() - (13 - i) * 86400000, tz);
            const items = rows.filter(r => dayKey(r.createdAt, tz) === key);
            const n = items.reduce((s, r) => s + r.correct + r.errors, 0);
            return { date: key, sessions: items.length, wpm: items.length ? Math.round(items.reduce((s, r) => s + r.wpm, 0) / items.length) : null, accuracy: n ? Math.round(items.reduce((s, r) => s + r.correct, 0) / n * 1000) / 10 : null };
        }),
    };
}
