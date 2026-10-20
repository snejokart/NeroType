import { env } from "cloudflare:workers";
import { buildProfile } from "./profile";
import type { RunResult } from "./game";
export type User = {
    id: string;
    name: string;
    email: string | null;
    password: string | null;
    salt: string | null;
};
export function db() { if (!env.DB)
    throw new Error("База данных недоступна"); return env.DB; }
export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function hex(bytes: ArrayBuffer | Uint8Array) { return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join(""); }
export async function hash(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
export async function passwordHash(password: string, salt: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256));
}
export function sameHash(a: string, b: string) { let diff = a.length ^ b.length; for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return diff === 0; }
export function tokenFrom(request: Request) { return (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)hero_session=([^;]+)/)?.[1]; }
export async function getUser(request: Request): Promise<User | null> {
    const token = tokenFrom(request);
    if (!token)
        return null;
    return db().prepare("SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires_at>?").bind(await hash(token), Date.now()).first<User>();
}
export async function requireUser(request: Request) { const u = await getUser(request); if (!u)
    throw new ApiError(401, "Сессия истекла. Обнови страницу и войди снова."); return u; }
export async function createSession(userId: string, request: Request) {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db().prepare("INSERT INTO auth_sessions(token,user_id,expires_at) VALUES(?,?,?)").bind(await hash(token), userId, Date.now() + 30 * 86400000).run();
    return `hero_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function profile(user: User, tz: number) {
    const rows = await db().prepare("SELECT id, mode, language, duration, correct, errors, max_combo AS maxCombo, score, xp, wpm, cpm, accuracy, trial, characters, created_at AS createdAt FROM results WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all<RunResult & {
        characters: string;
    }>();
    return buildProfile({ id: user.id, name: user.name, email: user.email }, rows.results, tz);
}
export async function limitAuth(request: Request, email: string) {
    const key = await hash(`${request.headers.get("cf-connecting-ip") ?? "local"}:${email}`);
    const now = Date.now();
    await db().prepare("INSERT INTO auth_limits(key,count,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<? THEN ? ELSE resets_at END").bind(key, now + 900000, now, now, now + 900000).run();
    const row = await db().prepare("SELECT count FROM auth_limits WHERE key=?").bind(key).first<{
        count: number;
    }>();
    if ((row?.count ?? 0) > 12)
        throw new ApiError(429, "Слишком много попыток входа. Попробуй через 15 минут.");
}
