import { generateText } from "@/lib/corpus";
import { MODE_INFO, levelInfo, replay, type Config, type KeyEvent } from "@/lib/game";
import { ApiError, createSession, db, getUser, hash, hex, limitAuth, passwordHash, profile, requireUser, sameHash, tokenFrom, type User } from "@/lib/server";
export const dynamic = "force-dynamic";
function json(data: unknown, status = 200, cookie?: string) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(cookie ? { "Set-Cookie": cookie } : {}) } }); }
function timezone(url: URL) { const value = Number(url.searchParams.get("tz") ?? 0); return Number.isFinite(value) ? Math.max(-720, Math.min(840, value)) : 0; }
async function handler(request: Request) {
    try {
        const url = new URL(request.url);
        const path = url.pathname.replace(/^\/api\//, "");
        const tz = timezone(url);
        if (request.method === "GET") {
            if (path === "health") {
                await db().prepare("SELECT id FROM users LIMIT 1").first();
                return json({ status: "ok", database: "connected" });
            }
            if (path === "bootstrap") {
                let user = await getUser(request);
                let cookie: string | undefined;
                if (!user) {
                    user = { id: crypto.randomUUID(), name: "Новый герой", email: null, password: null, salt: null };
                    await db().prepare("INSERT INTO users(id,name,created_at) VALUES(?,?,?)").bind(user.id, user.name, Date.now()).run();
                    cookie = await createSession(user.id, request);
                }
                return json(await profile(user, tz), 200, cookie);
            }
            if (path === "leaderboard") {
                const period = url.searchParams.get("period") ?? "week";
                const metric = url.searchParams.get("metric") ?? "wpm";
                if (!["today", "week", "all"].includes(period) || !["wpm", "accuracy", "xp"].includes(metric))
                    throw new ApiError(400, "Неизвестный фильтр рейтинга");
                const now = Date.now();
                const today = Math.floor((now + tz * 60000) / 86400000) * 86400000 - tz * 60000;
                const from = period === "today" ? today : period === "week" ? now - 7 * 86400000 : 0;
                const order = metric === "accuracy" ? "accuracy DESC, wpm DESC" : `${metric} DESC, accuracy DESC`;
                const data = await db().prepare(`SELECT u.id,u.name,MAX(r.wpm) AS wpm,MAX(r.cpm) AS cpm,ROUND(SUM(r.correct)*100.0/SUM(r.correct+r.errors),1) AS accuracy,SUM(r.xp) AS xp,COUNT(*) AS sessions FROM results r JOIN users u ON u.id=r.user_id WHERE u.email IS NOT NULL AND r.trial=0 AND r.created_at>=? AND r.duration>=14000 AND r.correct>=10 GROUP BY u.id ORDER BY ${order} LIMIT 50`).bind(from).all();
                return json({ rows: data.results, period, metric });
            }
            throw new ApiError(404, "Адрес не найден");
        }
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin)
            throw new ApiError(403, "Запрос с другого сайта отклонён");
        if (!(request.headers.get("content-type") ?? "").includes("application/json"))
            throw new ApiError(415, "Ожидается JSON");
        const raw = await request.text();
        if (raw.length > 300000)
            throw new ApiError(413, "Запрос слишком большой");
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(raw);
        }
        catch {
            throw new ApiError(400, "Некорректный JSON");
        }
        if (!body || Array.isArray(body) || typeof body !== "object")
            throw new ApiError(400, "Некорректный запрос");
        if (path === "register" || path === "login") {
            const email = String(body.email ?? "").trim().toLowerCase();
            const password = String(body.password ?? "");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
                throw new ApiError(400, "Укажи корректный email");
            if (password.length < 8 || password.length > 128)
                throw new ApiError(400, "Пароль должен содержать от 8 до 128 символов");
            await limitAuth(request, email);
            let user = await db().prepare("SELECT * FROM users WHERE email=?").bind(email).first<User>();
            if (path === "register") {
                if (user)
                    throw new ApiError(409, "Этот email уже зарегистрирован. Выбери «Войти».");
                const current = await getUser(request);
                const name = String(body.name ?? "").trim();
                if (name.length < 2 || name.length > 24)
                    throw new ApiError(400, "Имя должно содержать от 2 до 24 символов");
                const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
                const passwordValue = await passwordHash(password, salt);
                const id = current && !current.email ? current.id : crypto.randomUUID();
                if (current && !current.email)
                    await db().prepare("UPDATE users SET name=?,email=?,password=?,salt=? WHERE id=?").bind(name, email, passwordValue, salt, id).run();
                else
                    await db().prepare("INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)").bind(id, name, email, passwordValue, salt, Date.now()).run();
                user = { id, name, email, password: passwordValue, salt };
            }
            else {
                const attempt = await passwordHash(password, user?.salt ?? "nonexistent-user-salt");
                if (!user?.password || !sameHash(attempt, user.password))
                    throw new ApiError(401, "Неверный email или пароль");
            }
            const old = tokenFrom(request);
            if (old)
                await db().prepare("DELETE FROM auth_sessions WHERE token=?").bind(await hash(old)).run();
            return json(await profile(user!, tz), 200, await createSession(user!.id, request));
        }
        const user = await requireUser(request);
        if (path === "logout") {
            const token = tokenFrom(request);
            if (token)
                await db().prepare("DELETE FROM auth_sessions WHERE token=?").bind(await hash(token)).run();
            return json({ ok: true }, 200, "hero_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        }
        if (path === "exercise") {
            const config = body as unknown as Config;
            if (!Object.hasOwn(MODE_INFO, config.mode) || !["ru", "en"].includes(config.language) || ![15, 30, 60, 120].includes(config.duration) || !["easy", "normal", "hard"].includes(config.difficulty) || !["python", "javascript", "html"].includes(config.codeLanguage))
                throw new ApiError(400, "Некорректные настройки тренировки");
            if (config.focus && (typeof config.focus !== "string" || (config.focus.length < 1 || config.focus.length > 2)))
                throw new ApiError(400, "Некорректный символ");
            const p = await profile(user, tz);
            const trial = p.level < MODE_INFO[config.mode].level || (config.difficulty === "hard" && p.level < 3);
            const content = generateText(config);
            const id = crypto.randomUUID();
            const bonusAt = 30 + Math.floor(Math.random() * 31);
            await db().prepare("INSERT INTO exercises(id,user_id,config,content,bonus_at,created_at) VALUES(?,?,?,?,?,?)").bind(id, user.id, JSON.stringify({ ...config, trial }), content, bonusAt, Date.now()).run();
            return json({ id, content, bonusAt, trial });
        }
        const exercisePath = path.match(/^exercise\/([^/]+)\/(start|finish)$/);
        if (exercisePath) {
            const run = await db().prepare("SELECT * FROM exercises WHERE id=? AND user_id=?").bind(exercisePath[1], user.id).first<{
                id: string;
                content: string;
                config: string;
                started_at: number | null;
                bonus_at: number;
                created_at: number;
            }>();
            if (!run)
                throw new ApiError(404, "Тренировка не найдена");
            if (Date.now() - run.created_at > 86400000)
                throw new ApiError(410, "Тренировка устарела. Начни новую.");
            const config: Config & {
                trial: boolean;
            } = JSON.parse(run.config);
            if (exercisePath[2] === "start") {
                await db().prepare("UPDATE exercises SET started_at=COALESCE(started_at,?) WHERE id=?").bind(Date.now(), run.id).run();
                return json({ ok: true });
            }
            const saved = await db().prepare("SELECT id FROM results WHERE id=?").bind(run.id).first();
            if (saved)
                return json({ profile: await profile(user, tz), duplicate: true });
            if (!run.started_at)
                throw new ApiError(400, "Тренировка ещё не началась");
            const duration = Number(body.elapsed);
            const wall = Date.now() - run.started_at;
            if (!Number.isFinite(duration) || duration < 1000 || duration > config.duration * 1000 + 250 || duration > wall + 1500)
                throw new ApiError(400, "Некорректная длительность тренировки");
            if (!Array.isArray(body.events) || body.events.length > 10000)
                throw new ApiError(400, "Некорректный журнал нажатий");
            let value;
            try {
                value = replay(run.content, body.events as KeyEvent[], duration, run.bonus_at);
            }
            catch {
                throw new ApiError(400, "Некорректный журнал нажатий");
            }
            if (!value.correct)
                throw new ApiError(400, "Напечатай хотя бы один верный символ");
            if (duration < config.duration * 1000 - 250 && value.position < run.content.length)
                throw new ApiError(400, "Тренировка ещё не завершена");
            if (value.cpm > 2500)
                throw new ApiError(400, "Скорость превышает лимит рейтинга");
            const before = await profile(user, tz);
            const xp = config.trial ? 0 : value.xp;
            const timestamp = Date.now();
            await db().prepare("INSERT OR IGNORE INTO results(id,user_id,mode,language,duration,correct,errors,max_combo,score,xp,wpm,cpm,accuracy,trial,characters,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(run.id, user.id, config.mode, config.language, Math.round(duration), value.correct, value.errors, value.maxCombo, value.score, xp, value.wpm, value.cpm, value.accuracy, Number(config.trial), JSON.stringify(value.characters), timestamp).run();
            const after = await profile(user, tz);
            return json({ result: after.recent.find(r => r.id === run.id), profile: after, newAchievements: after.achievements.filter(a => a.earned && !before.achievements.find(b => b.id === a.id)?.earned), leveledUp: levelInfo(after.xp).level > before.level });
        }
        throw new ApiError(404, "Адрес не найден");
    }
    catch (error) {
        if (error instanceof ApiError)
            return json({ error: error.message }, error.status);
        console.error("API failure", error instanceof Error ? error.message : "unknown");
        return json({ error: "Не удалось выполнить запрос. Проверь соединение и попробуй ещё раз." }, 500);
    }
}
export const GET = handler;
export const POST = handler;
