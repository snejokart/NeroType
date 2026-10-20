"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Activity, AlignLeft, ArrowRight, Award, BarChart3, Check, CheckCircle2, ChevronDown, Code2, Crown, Flame, Flag, Focus, Hand, Hash, Keyboard, Layers, LockKeyhole, LogOut, Medal, MousePointer2, RefreshCcw, Rocket, Shield, Sparkles, Target, Trophy, UserRound, Volume2, VolumeX, Wind, X, Zap } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TypingKeyboard } from "@/components/typing-keyboard";
import { ThemeSwitch } from "@/components/theme-switch";
import { ACHIEVEMENTS, MODE_INFO, formatTime, initialState, metrics, multiplier, press, type Config, type GameState, type KeyEvent, type Mode, type RunResult } from "@/lib/game";
import type { Profile } from "@/lib/profile";
import { TypingAudio } from "@/lib/typing-audio";
type View = "train" | "stats" | "achievements" | "leaderboard" | "guide";
type Exercise = {
    id: string;
    content: string;
    bonusAt: number;
    trial: boolean;
};
type BoardRow = {
    id: string;
    name: string;
    wpm: number;
    cpm: number;
    accuracy: number;
    xp: number;
    sessions: number;
};
type FinishResponse = {
    profile: Profile;
    result?: RunResult;
    newAchievements?: Profile["achievements"];
    leveledUp?: boolean;
};
const ICONS = { flag: Flag, target: Target, wind: Wind, flame: Flame, shield: Shield, crown: Crown, calendar: Activity, medal: Medal, layers: Layers };
const NAV = [{ id: "train", name: "Тренировка", icon: Keyboard }, { id: "stats", name: "Мой прогресс", icon: BarChart3 }, { id: "achievements", name: "Достижения", icon: Medal }, { id: "leaderboard", name: "Таблица лидеров", icon: Trophy }] as const;
const MODE_ICONS = { words: AlignLeft, sentences: AlignLeft, code: Code2, symbols: Hash };
const DEFAULT_CONFIG: Config = { mode: "words", language: "ru", duration: 60, difficulty: "normal", codeLanguage: "python" };
async function api<T>(path: string, body?: unknown): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`/api/${path}${separator}tz=${-new Date().getTimezoneOffset()}`, { ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), cache: "no-store" });
    const data = await response.json() as T & {
        error?: string;
    };
    if (!response.ok)
        throw new Error(data.error ?? "Ошибка соединения с сервером");
    return data;
}
function Stat({ label, value, unit, icon: Icon }: {
    label: string;
    value: string | number;
    unit?: string;
    icon: typeof Zap;
}) { return <div className="stat"><span className="stat-label"><Icon size={14}/>{label}</span><div><strong>{value}</strong>{unit && <span className="stat-unit">{unit}</span>}</div></div>; }
function AchievementIcon({ id, size = 23 }: {
    id: string;
    size?: number;
}) { const Icon = ICONS[id as keyof typeof ICONS] ?? Award; return <Icon size={size}/>; }
export default function Home() {
    const [view, setView] = useState<View>("train");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [fatal, setFatal] = useState("");
    const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [game, setGame] = useState<GameState>(initialState());
    const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
    const [elapsed, setElapsed] = useState(0);
    const [focused, setFocused] = useState(false);
    const [errorFlash, setErrorFlash] = useState(false);
    const [toast, setToast] = useState("");
    const [sound, setSound] = useState(true);
    const [keyboard, setKeyboard] = useState(true);
    const [focusMode, setFocusMode] = useState(false);
    const [auth, setAuth] = useState<"login" | "register" | null>(null);
    const [authError, setAuthError] = useState("");
    const [authBusy, setAuthBusy] = useState(false);
    const [result, setResult] = useState<FinishResponse | null>(null);
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);
    const [board, setBoard] = useState<BoardRow[]>([]);
    const [boardBusy, setBoardBusy] = useState(false);
    const [boardError, setBoardError] = useState("");
    const [period, setPeriod] = useState("week");
    const [metric, setMetric] = useState("wpm");
    const [chartPeriod, setChartPeriod] = useState(7);
    const input = useRef<HTMLTextAreaElement>(null);
    const cursor = useRef<HTMLSpanElement>(null);
    const copy = useRef<HTMLDivElement>(null);
    const [textOffset, setTextOffset] = useState(0);
    const run = useRef<{
        exercise: Exercise | null;
        config: Config;
        game: GameState;
        phase: string;
        events: KeyEvent[];
        start: number;
        starting: Promise<unknown> | null;
        finished: boolean;
    }>({ exercise: null, config: DEFAULT_CONFIG, game: initialState(), phase: "ready", events: [], start: 0, starting: null, finished: false });
    const sequence = useRef(0);
    const audio = useRef<TypingAudio | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current)
        clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 4500); }, []);
    const load = useCallback(async () => { setFatal(""); setLoading(true); try {
        const p = await api<Profile>("bootstrap");
        setProfile(p);
    }
    catch (e) {
        setFatal((e as Error).message);
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { void load(); try {
        const stored = JSON.parse(localStorage.getItem("hero_settings") ?? "null");
        if (stored) {
            setSound(stored.soundVersion === 2 ? !!stored.sound : true);
            setKeyboard(stored.keyboard !== false);
        }
    }
    catch { } return () => { if (toastTimer.current)
        clearTimeout(toastTimer.current); if (flashTimer.current)
        clearTimeout(flashTimer.current); }; }, [load]);
    useEffect(() => { localStorage.setItem("hero_settings", JSON.stringify({ sound, keyboard, soundVersion: 2 })); }, [sound, keyboard]);
    useEffect(() => {
        const player = new TypingAudio("/audio/key-press.mp3", () => notify("Не удалось загрузить звук клавиш. Попробуй обновить страницу."));
        audio.current = player;
        void player.preload();
        return () => { player.dispose(); audio.current = null; };
    }, [notify]);
    useEffect(() => { audio.current?.setEnabled(sound); }, [sound]);
    const prepare = useCallback(async (next: Config) => {
        const id = ++sequence.current;
        run.current.phase = "ready";
        run.current.finished = true;
        setPhase("ready");
        setPreparing(true);
        setExercise(null);
        setGame(initialState());
        setElapsed(0);
        setTextOffset(0);
        setResult(null);
        setSaveError("");
        try {
            const e = await api<Exercise>("exercise", next);
            if (id !== sequence.current)
                return;
            setExercise(e);
            run.current = { exercise: e, config: next, game: initialState(), phase: "ready", events: [], start: 0, starting: null, finished: false };
        }
        catch (e) {
            if (id === sequence.current)
                notify((e as Error).message);
        }
        finally {
            if (id === sequence.current)
                setPreparing(false);
        }
    }, [notify]);
    useEffect(() => { if (profile?.user.id)
        void prepare(config); }, [config, profile?.user.id, prepare]);
    useLayoutEffect(() => { if (cursor.current && copy.current) {
        const top = cursor.current.offsetTop;
        setTextOffset(Math.max(0, top - 48));
    } }, [game.position, exercise]);
    const persist = useCallback(async (payload: {
        id: string;
        events: KeyEvent[];
        elapsed: number;
        userId?: string;
    }) => {
        setSaving(true);
        setSaveError("");
        try {
            const response = await api<FinishResponse>(`exercise/${payload.id}/finish`, { events: payload.events, elapsed: payload.elapsed });
            setResult(response);
            setProfile(response.profile);
            localStorage.removeItem("hero_pending");
            if (response.leveledUp)
                notify(`Новый уровень: ${response.profile.level}! Открылись новые возможности.`);
            else if (response.newAchievements?.length)
                notify(`Достижение: ${response.newAchievements[0].name}`);
        }
        catch (e) {
            setSaveError((e as Error).message);
        }
        finally {
            setSaving(false);
        }
    }, [notify]);
    const finish = useCallback(async () => {
        const current = run.current;
        if (current.finished || !current.exercise)
            return;
        current.finished = true;
        current.phase = "done";
        setPhase("done");
        const duration = Math.min(current.config.duration * 1000, Math.round(performance.now() - current.start));
        setElapsed(duration);
        if (!current.game.correct) {
            setSaveError("В этой тренировке нет верных символов. Начни ещё раз.");
            return;
        }
        const payload = { id: current.exercise.id, events: current.events, elapsed: duration, userId: profile?.user.id };
        localStorage.setItem("hero_pending", JSON.stringify(payload));
        try {
            await current.starting;
            await persist(payload);
        }
        catch (e) {
            setSaveError((e as Error).message);
        }
    }, [persist, profile?.user.id]);
    useEffect(() => { if (phase !== "running")
        return; const timer = setInterval(() => { const t = Math.min(config.duration * 1000, performance.now() - run.current.start); setElapsed(t); if (t >= config.duration * 1000)
        void finish(); }, 80); return () => clearInterval(timer); }, [phase, config.duration, finish]);
    useEffect(() => { if (!profile)
        return; try {
        const raw = localStorage.getItem("hero_pending");
        if (raw) {
            const p = JSON.parse(raw);
            if (p.userId === profile.user.id)
                void persist(p);
        }
    }
    catch { } }, [profile?.user.id, persist]);
    useEffect(() => { if (view !== "leaderboard")
        return; let cancelled = false; setBoardBusy(true); setBoardError(""); api<{
        rows: BoardRow[];
    }>(`leaderboard?period=${period}&metric=${metric}`).then(r => { if (!cancelled)
        setBoard(r.rows); }).catch(e => { if (!cancelled)
        setBoardError(e.message); }).finally(() => { if (!cancelled)
        setBoardBusy(false); }); return () => { cancelled = true; }; }, [view, period, metric, profile?.xp]);
    useEffect(() => {
        if (!auth && phase !== "done") return;
        const modal = document.querySelector<HTMLElement>('[role="dialog"]');
        const previous = document.activeElement as HTMLElement | null;
        const focusable = () => [...(modal?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? [])];
        if (!modal?.contains(document.activeElement)) focusable()[0]?.focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key === "Escape" && auth && !authBusy) { event.preventDefault(); setAuth(null); }
            if (event.key !== "Tab") return;
            const items = focusable(); const first = items[0]; const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener("keydown", trap);
        return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
    }, [auth, phase, authBusy]);
    function enterKey(key: string) {
        const current = run.current;
        if (!current.exercise || current.finished || current.phase === "done")
            return;
        if (current.phase === "ready") {
            current.start = performance.now();
            current.phase = "running";
            setPhase("running");
            current.starting = api(`exercise/${current.exercise.id}/start`, {});
            void current.starting.catch(() => { });
        }
        const t = Math.round(performance.now() - current.start);
        if (t >= current.config.duration * 1000) {
            void finish();
            return;
        }
        const good = key === current.exercise.content[current.game.position];
        current.events.push({ key, t });
        const value = press(current.game, current.exercise.content, key, t, current.exercise.bonusAt);
        current.game = value;
        setGame(value);
        setElapsed(t);
        audio.current?.play();
        if (!good) {
            setErrorFlash(true);
            if (flashTimer.current)
                clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setErrorFlash(false), 240);
        }
        if (value.position === current.exercise.content.length)
            void finish();
    }
    function keyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
        if (e.nativeEvent.isComposing || e.ctrlKey || e.altKey || e.metaKey)
            return;
        if (e.key === "Escape") {
            e.preventDefault();
            void prepare(config);
            notify("Тренировка начата заново");
            return;
        }
        if (e.key === "Backspace") {
            e.preventDefault();
            audio.current?.play();
            return;
        }
        if (e.key === "Tab" && run.current.exercise?.content[run.current.game.position] !== "\t")
            return;
        const key = e.key === "Enter" ? "\n" : e.key === "Tab" ? "\t" : e.key;
        if (key.length === 1) {
            e.preventDefault();
            enterKey(key);
        }
    }
    function navigate(next: View) { if (phase === "running") {
        notify("Сначала заверши тренировку или нажми Esc для сброса.");
        input.current?.focus();
        return;
    } setView(next); setFocusMode(false); window.scrollTo({top:0,behavior:"smooth"}); }
    async function submitAuth(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setAuthBusy(true); setAuthError(""); const form = new FormData(e.currentTarget); try {
        const p = await api<Profile>(auth!, Object.fromEntries(form));
        setProfile(p);
        setAuth(null);
        notify(auth === "register" ? "Аккаунт создан. Гостевой прогресс сохранён." : "С возвращением! Прогресс восстановлен.");
    }
    catch (error) {
        setAuthError((error as Error).message);
    }
    finally {
        setAuthBusy(false);
    } }
    async function logout() { try {
        await api("logout", {});
        await load();
        notify("Вы вышли из аккаунта");
    }
    catch (e) {
        notify((e as Error).message);
    } }
    const live = metrics(game, elapsed);
    const remaining = Math.max(0, config.duration * 1000 - elapsed);
    const bonus = Math.max(0, game.bonusUntil - elapsed);
    const stats = profile?.stats;
    const unlocked = profile?.achievements.filter(a => a.earned).length ?? 0;
    const nextAchievement = profile?.achievements.find(a => !a.earned);
    const totalSeconds = Math.floor((stats?.duration ?? 0) / 1000);
    if (fatal)
        return <main className="boot-screen"><div className="brand-mark"><Keyboard /></div><h1>Не удалось подключиться</h1><p>{fatal}</p><button className="primary" onClick={() => void load()}><RefreshCcw size={16}/>Попробовать снова</button></main>;
    if (loading && !profile)
        return <main className="boot-screen"><div className="brand-mark pulse"><Keyboard /></div><h1>Печать героя</h1><p>Готовим твоё место за клавиатурой…</p></main>;
    return <div className={`app ${focusMode ? "focus-mode" : ""}`}>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Печать героя — главная"><span className="brand-symbol" aria-hidden="true"><i/><i/><i/></span><span>печать героя<span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Основная навигация">{NAV.map(n => <button key={n.id} aria-label={n.name} aria-current={view === n.id ? "page" : undefined} className={view === n.id ? "active" : ""} onClick={() => navigate(n.id)}><n.icon size={18}/><span>{n.id === "stats" ? "Прогресс" : n.id === "leaderboard" ? "Рейтинг" : n.name}</span></button>)}</nav>
      <div className="header-account"><ThemeSwitch/><span className="streak" title="Дней подряд"><Flame size={15}/>{stats?.streak ?? 0}</span>{profile?.user.guest ? <button className="account-button" aria-label="Войти" title="Войти" onClick={() => { setAuthError(""); setAuth("login"); }}><UserRound size={15}/><span>Войти</span></button> : <><span className="avatar">{profile?.user.name.slice(0,1).toUpperCase()}</span><span className="username">{profile?.user.name}</span><button className="icon-button" onClick={() => void logout()} title="Выйти из аккаунта"><LogOut size={16}/></button></>}</div>
    </header>
    <div className="workspace">
    <main className="main-content">
      <div className="page-heading"><h1>{view === "train" ? <>Просто <em>печатай.</em></> : view === "stats" ? <>Всё <em>получается.</em></> : view === "achievements" ? <>Маленькие <em>победы.</em></> : view === "leaderboard" ? <>В общем <em>ритме.</em></> : <>Начни с <em>основ.</em></>}</h1><p>{view === "train" ? "Смотри на текст. Доверься пальцам." : view === "stats" ? "Твой прогресс, одна тренировка за другой." : view === "achievements" ? "Каждый новый навык начинается с первого шага." : view === "leaderboard" ? "Вдохновляйся другими. Соревнуйся с собой." : "Удобная посадка, верные пальцы и немного практики."}</p></div>
      {view === "train" && <div className="training-layout"><div className="training-main">
        <section className={`training-card ${errorFlash ? "error-flash" : ""}`}><div className="training-card-header"><div className="section-title"><Keyboard size={17}/><h2>Практика</h2></div><div className="card-tools"><button className={`icon-button ${sound ? "selected" : ""}`} onClick={() => setSound(!sound)} aria-pressed={sound} title={sound ? "Выключить звук" : "Включить звук"}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button className={`icon-button ${focusMode ? "selected" : ""}`} onClick={() => setFocusMode(!focusMode)} title="Режим фокуса"><Focus size={17}/></button><button className="icon-button" onClick={() => void prepare(config)} title="Начать заново" disabled={preparing || saving}><RefreshCcw size={16}/></button></div></div>
        <div className="exercise-options"><div className="mode-tabs" aria-label="Режим печати">{(Object.keys(MODE_INFO) as Mode[]).map(m => { const Icon = MODE_ICONS[m]; return <button key={m} disabled={phase === "running"} className={config.mode === m ? "selected" : ""} onClick={() => setConfig(c => ({ ...c, mode: m, focus: undefined }))}><Icon size={15}/>{MODE_INFO[m].name}{(profile?.level ?? 1) < MODE_INFO[m].level && <LockKeyhole size={11}/>}</button>; })}</div><div className="secondary-options"><label className="language-select"><span aria-hidden="true">◎</span><select aria-label="Язык тренировки" value={config.language} disabled={phase === "running"} onChange={e => setConfig(c => ({ ...c, language: e.target.value as Config["language"], focus: undefined }))}><option value="ru">Русский</option><option value="en">English</option></select><ChevronDown size={12}/></label><span className="options-divider"/><div className="duration-options" aria-label="Длительность тренировки">{[15, 30, 60, 120].map(s => <button key={s} disabled={phase === "running"} className={config.duration === s ? "selected" : ""} onClick={() => setConfig(c => ({ ...c, duration: s }))}>{s}<small>с</small></button>)}</div><span className="options-divider"/><select className="difficulty-select" aria-label="Сложность" value={config.difficulty} disabled={phase === "running"} onChange={e => setConfig(c => ({ ...c, difficulty: e.target.value as Config["difficulty"] }))}><option value="easy">Лёгкий</option><option value="normal">Обычный</option><option value="hard">Сложный{(profile?.level ?? 1) < 3 ? " · ур. 3" : ""}</option></select>{config.mode === "code" && <select className="difficulty-select" aria-label="Язык кода" value={config.codeLanguage} disabled={phase === "running"} onChange={e => setConfig(c => ({ ...c, codeLanguage: e.target.value as Config["codeLanguage"] }))}><option value="python">Python</option><option value="javascript">JavaScript</option><option value="html">HTML / CSS</option></select>}</div></div>
        <div className="session-stats"><Stat label="Скорость" value={phase === "ready" ? "—" : live.wpm} unit="WPM" icon={Zap}/><Stat label="Точность" value={phase === "ready" ? "—" : live.accuracy} unit="%" icon={Target}/><Stat label="Ошибки" value={game.errors} icon={MousePointer2}/><div className={`timer ${phase === "running" ? "running" : ""}`}><span>ОСТАЛОСЬ</span><strong>{formatTime(remaining)}</strong></div></div>
        {exercise?.trial && <div className="trial-notice"><LockKeyhole size={13}/> Ознакомительная тренировка · опыт и рейтинг откроются на {Math.max(MODE_INFO[config.mode].level, config.difficulty === "hard" ? 3 : 1)} уровне</div>}
        {config.focus && <div className="trial-notice"><Target size={13}/> Тренируем сложную клавишу «{config.focus}»<button onClick={() => setConfig(c => ({ ...c, focus: undefined }))}><X size={13}/></button></div>}
        <div className={`typing-zone ${focused ? "focused" : ""} ${phase === "running" ? "typing" : ""}`} onClick={() => input.current?.focus()}>
          <div className="text-window" aria-hidden="true"><div ref={copy} className={`typing-copy ${config.mode === "code" ? "code-copy" : ""}`} style={{ transform: `translateY(-${textOffset}px)` }}>{exercise?.content.split("").map((char, index) => <span key={index} ref={index === game.position ? cursor : undefined} className={`${index < game.position ? "typed" : index === game.position ? `current ${errorFlash ? "wrong" : ""}` : "upcoming"} ${char === "\n" ? "newline" : ""}`}>{char === "\n" ? <>↵<br /></> : char === "\t" ? <span className="tab-char">⇥ </span> : char}</span>) ?? <span className="preparing-text">{preparing ? "Подбираем слова для тебя…" : "Не удалось загрузить упражнение"}</span>}</div></div>
          <textarea ref={input} aria-label="Поле тренировки. Печатайте показанный текст" className="typing-input" value="" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="text" disabled={!exercise || phase === "done" || preparing} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={keyDown} onPaste={e => { e.preventDefault(); notify("Печатай по одному символу — так формируется навык."); }} onChange={e => { if ((e.nativeEvent as InputEvent).isComposing)
            return; const value = e.target.value; if (value.length === 1)
            enterKey(value);
        else if (value)
            notify("Вводи по одному символу. Вставка и автозамена отключены."); e.target.value = ""; }} onCompositionEnd={e => { if (e.data.length === 1)
            enterKey(e.data); e.currentTarget.value = ""; }}/>
          <div className={`typing-prompt ${phase === "running" ? "quiet" : ""}`}><span className="small-key">{phase === "running" ? "esc" : "↵"}</span>{phase === "running" ? focused ? "Ты в потоке. Продолжай в своём темпе." : "Нажми на текст, чтобы вернуть фокус. Таймер идёт." : phase === "done" ? "Тренировка завершена" : focused ? "Печатай первый символ — время начнётся автоматически" : "Нажми сюда и начни печатать"}</div>
        </div>
        <div className="training-status"><span className={`combo ${game.combo >= 10 ? "hot" : ""}`}><Flame size={16}/><strong>{game.combo}</strong> комбо {multiplier(game.combo) > 1 && <b className="combo-badge">×{multiplier(game.combo)}</b>}</span><span className="score"><Sparkles size={14}/>{game.score.toLocaleString("ru")} очков</span>{bonus > 0 && phase === "running" ? <span className="bonus-badge"><Zap size={13}/> Опыт ×2 · {Math.ceil(bonus / 1000)} с</span> : <span className="session-cpm">{phase === "running" ? `${live.cpm} симв/мин` : ""}</span>}</div><div className="session-progress"><div style={{ width: `${elapsed / (config.duration * 1000) * 100}%` }}/></div>
        </section>
        <div className="below-training"><button className="subtle-button" onClick={() => setKeyboard(!keyboard)}><Keyboard size={14}/>{keyboard ? "Скрыть клавиатуру" : "Показать клавиатуру"}</button><span><span className="small-key">esc</span> начать заново</span></div>
        {keyboard && <TypingKeyboard next={exercise?.content[game.position]} language={config.mode === "code" ? "en" : config.language} enabled={!!exercise && phase !== "done"}/>}
        <div className="training-tip"><span className="tip-icon"><Hand size={20}/></span><div><strong>Пальцы знают дорогу</strong><p>Поставь указательные пальцы на {config.language === "ru" && config.mode !== "code" ? "А и О" : "F и J"} — на этих клавишах есть небольшие выступы. Возвращайся к ним после каждого нажатия.</p></div><button className="icon-button" onClick={() => navigate("guide")} title="Подробнее о постановке рук"><ArrowRight size={19}/></button></div>
      </div><aside className="right-rail" aria-label="Прогресс обучения">
        <section className="level-card"><div className="module-top"><span>Твой уровень</span><Zap size={15}/></div><div className="module-value"><strong>{profile?.level}</strong><span>{(profile?.level ?? 1) < 3 ? "Хорошее начало" : (profile?.level ?? 1) < 5 ? "Уверенный ритм" : "Мастер клавиш"}</span></div><div className="progress-bar"><div style={{width:`${(profile?.progress ?? 0)*100}%`}}/></div><div className="module-foot"><span>{profile?.xp.toLocaleString("ru")} XP</span><span>до {profile?.next.toLocaleString("ru")} XP</span></div></section>
        <section className="goal-card"><div className="module-top"><span>Практика сегодня</span><Target size={15}/></div><div className="module-value"><strong>{formatTime((stats?.todaySeconds ?? 0)*1000)}</strong><span>/ 5 минут</span></div><div className="progress-bar"><div style={{width:`${Math.min(100,(stats?.todaySeconds ?? 0)/300*100)}%`}}/></div><div className="module-foot"><span>{(stats?.todaySeconds ?? 0)>=300 ? "Цель на сегодня выполнена" : "Немного, но каждый день"}</span>{(stats?.todaySeconds ?? 0)>=300&&<Check size={13}/>}</div></section>
        <section className="next-achievement"><div className="module-top"><span>Следующее достижение</span><Medal size={15}/></div><div className="achievement-preview"><span className="achievement-medal"><AchievementIcon id={nextAchievement?.icon ?? "crown"} size={21}/></span><div><h3>{nextAchievement?.name ?? "Все награды твои"}</h3><p>{nextAchievement?.text ?? "Самое время для нового рекорда."}</p></div></div><button className="text-link" onClick={() => navigate("achievements")}>Все достижения<ArrowRight size={13}/></button></section>
        {profile?.user.guest&&<section className="save-card"><Shield size={16}/><p>Продолжай с любого устройства.</p><button onClick={() => {setAuthError("");setAuth("register");}}>Сохранить прогресс<ArrowRight size={14}/></button></section>}
      </aside></div>}
      {view === "stats" && <><div className="overview-stats"><Stat label="Всего тренировок" value={stats?.sessions ?? 0} icon={Keyboard}/><Stat label="Лучший результат" value={stats?.bestWpm ?? 0} unit="WPM" icon={Zap}/><Stat label="Общая точность" value={stats?.accuracy ?? 100} unit="%" icon={Target}/><Stat label="Время практики" value={totalSeconds < 60 ? `${totalSeconds} с` : `${Math.floor(totalSeconds / 60)} мин`} icon={Activity}/></div><section className="panel chart-panel"><div className="panel-header"><div><h2>Ты становишься быстрее</h2><p>Средние результаты тренировок по дням</p></div><div className="segmented">{[7, 14].map(d => <button key={d} className={chartPeriod === d ? "selected" : ""} onClick={() => setChartPeriod(d)}>{d} дней</button>)}</div></div>{stats?.sessions ? <><div className="chart-legend"><span><i />Скорость, WPM</span><span><i />Точность, %</span></div><div className="chart"><ResponsiveContainer width="100%" height={260}><LineChart data={profile?.history.slice(-chartPeriod)} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false}/><XAxis dataKey="date" tickFormatter={v => new Date(v + "T12:00:00").toLocaleDateString("ru", { day: "numeric", month: "short" })} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis yAxisId="speed" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={35}/><YAxis yAxisId="accuracy" orientation="right" domain={[0, 100]} hide/><Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} labelFormatter={v => new Date(String(v) + "T12:00:00").toLocaleDateString("ru")} formatter={(value, name) => [`${value}${name === "Точность" ? "%" : " WPM"}`, name]}/><Line yAxisId="speed" type="monotone" dataKey="wpm" name="Скорость" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: "var(--accent)" }} activeDot={{ r: 6 }} connectNulls={false}/><Line yAxisId="accuracy" type="monotone" dataKey="accuracy" name="Точность" stroke="var(--chart-accuracy)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false}/></LineChart></ResponsiveContainer></div></> : <div className="empty-state"><BarChart3 size={33}/><h3>Здесь появится твоя история</h3><p>Заверши первую тренировку, чтобы увидеть график скорости и точности.</p><button className="primary" onClick={() => navigate("train")}>Начать тренировку<ArrowRight size={15}/></button></div>}</section><div className="stats-bottom-grid"><section className="panel"><div className="panel-header"><div><h2>Клавиши, которым нужно внимание</h2><p>Ошибки на ожидаемом символе. Нажми на букву для практики.</p></div><Target size={20}/></div>{profile?.weakKeys.length ? <div className="weak-keys">{profile.weakKeys.map(k => <button key={k.key} onClick={() => { setConfig(c => ({ ...c, mode: /^[a-zа-яё]+$/i.test(k.key) || /\s/.test(k.key) ? "words" : "symbols", language: /[а-яё]/i.test(k.key) ? "ru" : "en", focus: k.key })); navigate("train"); }}><kbd>{k.key === " " ? "␣" : k.key === "\n" ? "↵" : k.key === "\t" ? "⇥" : k.key}</kbd><span>{k.errors} ошибок</span><div className="weak-bar"><i style={{ width: `${k.rate}%` }}/></div><small>{k.rate}% нажатий</small></button>)}</div> : <div className="small-empty"><CheckCircle2 size={22}/><p>{stats?.sessions ? "Отличная точность! Пока нет ошибок для разбора." : "После практики здесь появятся сложные клавиши."}</p></div>}{!!profile?.weakPairs.length && <div className="weak-pairs"><span>Сложные сочетания</span>{profile.weakPairs.map(k => <button key={k.key} onClick={() => { setConfig(c => ({ ...c, mode: /^[a-zа-яё]+$/i.test(k.key) || /\s/.test(k.key) ? "words" : "symbols", language: /[а-яё]/i.test(k.key) ? "ru" : "en", focus: k.key })); navigate("train"); }}><kbd>{k.key}</kbd>{k.errors} ошибок</button>)}</div>}</section><section className="panel"><div className="panel-header"><div><h2>Последние тренировки</h2><p>Каждая попытка приближает к цели</p></div><Activity size={19}/></div>{profile?.recent.length ? <div className="recent-list">{profile.recent.slice(0, 7).map(r => <div className="recent-row" key={r.id}><span className="recent-mode">{r.mode === "code" ? <Code2 size={17}/> : <Keyboard size={17}/>}</span><div><strong>{MODE_INFO[r.mode].name}{!!r.trial && <small> · пробная</small>}</strong><span>{new Date(r.createdAt).toLocaleDateString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {formatTime(r.duration)}</span></div><div className="recent-value"><strong>{r.wpm}<small> WPM</small></strong><span>{r.accuracy}% точность</span></div></div>)}</div> : <div className="small-empty"><Keyboard size={22}/><p>Первая тренировка уже ждёт тебя.</p></div>}</section></div></>}
      {view === "achievements" && <><div className="achievement-summary"><div className="achievement-summary-icon"><Trophy size={30}/></div><div><h2>{unlocked} <span>из {ACHIEVEMENTS.length} достижений</span></h2><p>Собирай историю своего мастерства.</p></div><div className="progress-bar"><div style={{ width: `${unlocked / ACHIEVEMENTS.length * 100}%` }}/></div></div><div className="achievement-grid">{profile?.achievements.map(a => <article className={`achievement-card ${a.earned ? "earned" : ""}`} key={a.id}><div className="achievement-card-top"><span className="achievement-medal"><AchievementIcon id={a.icon} size={29}/></span>{a.earned ? <span className="earned-tag"><Check size={12}/>Получено</span> : <LockKeyhole size={15} className="muted"/>}</div><h2>{a.name}</h2><p>{a.text}</p><div className="progress-bar"><div style={{ width: `${Math.min(100, a.value / a.target * 100)}%` }}/></div><span className="achievement-count">{Math.min(a.value, a.target)} / {a.target}</span></article>)}</div></>}
      {view === "leaderboard" && <section className="panel leaderboard-panel"><div className="panel-header"><div><h2><Trophy size={20}/> Таблица героев</h2><p>Зарегистрированные участники · тренировки от 15 секунд · без ознакомительных режимов</p></div><div className="segmented">{[["today", "Сегодня"], ["week", "Неделя"], ["all", "Всё время"]].map(([id, label]) => <button key={id} className={period === id ? "selected" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div></div><div className="ranking-tabs">{[["wpm", "Скорость"], ["accuracy", "Точность"], ["xp", "Опыт"]].map(([id, label]) => <button key={id} className={metric === id ? "selected" : ""} onClick={() => setMetric(id)}>{label}</button>)}</div>{boardBusy ? <div className="small-empty">Загружаем результаты…</div> : boardError ? <div className="small-empty"><p>{boardError}</p></div> : board.length ? <div className="table-scroll"><table><thead><tr><th>МЕСТО</th><th>ГЕРОЙ</th><th>СКОРОСТЬ</th><th>ТОЧНОСТЬ</th><th>ОПЫТ</th></tr></thead><tbody>{board.map((r, i) => <tr key={r.id} className={r.id === profile?.user.id ? "my-row" : ""}><td><span className={`rank rank-${i}`}>{i === 0 ? <Crown size={19}/> : String(i + 1).padStart(2, "0")}</span></td><td><span className="table-user"><span className="avatar">{r.name.slice(0, 1).toUpperCase()}</span><span>{r.name}{r.id === profile?.user.id && <small>это ты</small>}</span></span></td><td><strong>{r.wpm}</strong><small> WPM</small><span className="cell-secondary">{r.cpm} симв/мин</span></td><td>{r.accuracy}%</td><td className="lime">{r.xp.toLocaleString("ru")} XP</td></tr>)}</tbody></table></div> : <div className="empty-state"><Trophy size={38}/><h3>Первое место пока свободно</h3><p>Создай аккаунт и заверши тренировку, чтобы первым появиться в рейтинге.</p><button className="primary" onClick={() => profile?.user.guest ? setAuth("register") : navigate("train")}>{profile?.user.guest ? "Создать аккаунт" : "К тренировке"}<ArrowRight size={15}/></button></div>}<div className="leaderboard-note"><Shield size={15}/>Скорость: лучший результат за период. Точность: доля верных нажатий. Опыт: сумма XP за период. Минимум 10 верных символов.</div></section>}
      {view === "guide" && <div className="guide-grid">{[{ icon: Hand, title: "Начни с домашнего ряда", text: "Левая рука: Ф Ы В А, правая: О Л Д Ж. В английской раскладке — A S D F и J K L ;. Большие пальцы отвечают за пробел. На А и О (F и J) есть выступы: находи их на ощупь." }, { icon: Focus, title: "Смотри на экран", text: "Держи спину прямо, плечи свободно, локти под прямым углом. Не опирайся запястьями на край стола. Подсказка под текстом показывает следующую клавишу и нужный палец." }, { icon: Target, title: "Сначала точность", text: "Ошибочный символ не продвигает текст. Просто нажми правильную клавишу и продолжай. Backspace ничего не стирает. В коде Enter вводит новую строку, Tab — отступ. Вставка текста и автозамена отключены." }, { icon: Flame, title: "Поймай комбо", text: "Каждая верная клавиша даёт 5 очков и 1 XP. Серии из 10, 25 и 50 нажатий повышают множитель очков до ×2, ×3 и ×5. Ошибка сбрасывает комбо. Случайный бонус удваивает XP на 10 секунд." }, { icon: Rocket, title: "Открывай возможности", text: "Слова доступны с начала. На 2 уровне открываются предложения, на 3 — символы и сложные упражнения, на 4 — код. Попробовать любой режим можно сразу: ознакомительные тренировки сохраняют статистику без начисления XP и участия в рейтинге." }, { icon: Shield, title: "Сохрани свой путь", text: "Гостевой прогресс хранится на сервере и доступен по cookie этого браузера 30 дней. При регистрации он прикрепляется к аккаунту. Войди по email и паролю с другого устройства, чтобы продолжить. Для рейтинга нужна регистрация." }].map((item, i) => <article className="panel guide-card" key={item.title}><div className="guide-number">0{i + 1}<item.icon size={23}/></div><h2>{item.title}</h2><p>{item.text}</p></article>)}<section className="panel guide-formulas"><h2>Как считаются результаты</h2><p>CPM = верные символы / минуты. WPM = CPM / 5 — стандартная длина условного слова. Точность = верные нажатия / все нажатия × 100%. Пробелы и знаки препинания тоже считаются. XP и результаты проверяются сервером по журналу нажатий.</p><button className="primary" onClick={() => navigate("train")}>Попробовать на практике<ArrowRight size={15}/></button></section></div>}
      <footer className="main-footer"><span>Печать героя<span className="brand-dot">.</span></span><button onClick={() => navigate("guide")}>Как это работает<ArrowRight size={13}/></button></footer>
    </main></div>
    {toast && <div className="toast" role="status"><Sparkles size={17}/>{toast}<button onClick={() => setToast("")} aria-label="Закрыть уведомление"><X size={14}/></button></div>}
    {auth && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !authBusy)
        setAuth(null); }}><section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={() => setAuth(null)} aria-label="Закрыть" disabled={authBusy}><X size={20}/></button><span className="modal-symbol"><UserRound size={27}/></span><div className="eyebrow">ТВОЯ ИСТОРИЯ ПРОДОЛЖАЕТСЯ</div><h2 id="auth-title">{auth === "login" ? "С возвращением." : "Начни свою легенду."}</h2><p>{auth === "login" ? "Войди, чтобы продолжить с того же места." : "Сохраним твой прогресс и маленькие победы."}</p><form onSubmit={submitAuth}>{auth === "register" && <label>Как тебя зовут?<input name="name" autoFocus required minLength={2} maxLength={24} autoComplete="nickname" placeholder="Имя героя"/></label>}<label>Email<input name="email" type="email" autoFocus={auth === "login"} required maxLength={254} autoComplete="email" placeholder="hero@example.com"/></label><label>Пароль<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={auth === "login" ? "current-password" : "new-password"} placeholder="Не менее 8 символов"/></label>{authError && <div className="form-error" role="alert">{authError}</div>}<button className="primary" type="submit" disabled={authBusy}>{authBusy ? "Секунду…" : auth === "login" ? "Войти в аккаунт" : "Создать аккаунт"}<ArrowRight size={16}/></button></form><div className="auth-switch">{auth === "login" ? "Впервые здесь?" : "Уже есть аккаунт?"}<button onClick={() => { setAuth(auth === "login" ? "register" : "login"); setAuthError(""); }}>{auth === "login" ? "Создать аккаунт" : "Войти"}</button></div><div className="auth-foot"><Shield size={12}/>Гостевой прогресс сохраняется при регистрации</div></section></div>}
    {phase === "done" && <div className="modal-overlay"><section className="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><span className="modal-symbol"><Flag size={30}/></span><div className="eyebrow">ЕЩЁ ОДИН ШАГ ВПЕРЁД</div><h2 id="result-title">Отличный ритм.</h2><p>{exercise?.trial ? "Ознакомительная тренировка завершена." : "Пальцы запомнили чуть больше. Продолжай!"}</p><div className="result-stats"><div><strong>{result?.result?.wpm ?? live.wpm}</strong><span>слов / мин</span></div><div><strong>{result?.result?.accuracy ?? live.accuracy}<small>%</small></strong><span>точность</span></div><div><strong>{game.maxCombo}</strong><span>лучшее комбо</span></div></div><div className="result-details"><span>{game.correct} верных символов</span><span>{game.errors} ошибок</span><span>{game.score} очков</span></div><div className="result-xp"><Sparkles size={18}/>{exercise?.trial ? "Пробный режим · без XP" : `+${result?.result?.xp ?? game.xp} XP в твою историю`}</div>{result?.leveledUp && <div className="result-unlock"><Rocket size={17}/>Теперь ты на {profile?.level} уровне!</div>}{result?.newAchievements?.map(a => <div className="result-unlock" key={a.id}><AchievementIcon id={a.icon} size={17}/>{a.name}</div>)}{saving && <p className="save-status">Сохраняем результат…</p>}{saveError && <div className="form-error" role="alert">{saveError}<button className="text-link" onClick={() => { const raw = localStorage.getItem("hero_pending"); if (raw)
        void persist(JSON.parse(raw)); }}>Повторить сохранение<RefreshCcw size={13}/></button></div>}<button className="primary" disabled={saving} onClick={() => { void prepare(config); setTimeout(() => input.current?.focus(), 150); }}>Ещё одну тренировку<RefreshCcw size={16}/></button><button className="subtle-button result-secondary" disabled={saving} onClick={() => { setPhase("ready"); setResult(null); setView("stats"); window.scrollTo({top:0,behavior:"smooth"}); void prepare(config); }}>Посмотреть мой прогресс<ArrowRight size={14}/></button></section></div>}
  </div>;
}
