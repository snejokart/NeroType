export type Mode = "words" | "sentences" | "code" | "symbols";
export type Language = "ru" | "en";
export type Config = {
    mode: Mode;
    language: Language;
    duration: number;
    difficulty: "easy" | "normal" | "hard";
    codeLanguage: "python" | "javascript" | "html";
    focus?: string;
};
export type KeyEvent = {
    key: string;
    t: number;
};
export type CharacterStat = {
    hits: number;
    errors: number;
};
export type GameState = {
    position: number;
    correct: number;
    errors: number;
    combo: number;
    maxCombo: number;
    score: number;
    xp: number;
    bonusUntil: number;
    characters: Record<string, CharacterStat>;
};
export type RunResult = {
    id: string;
    mode: Mode;
    language: Language;
    duration: number;
    correct: number;
    errors: number;
    maxCombo: number;
    score: number;
    xp: number;
    wpm: number;
    cpm: number;
    accuracy: number;
    trial: number;
    createdAt: number;
};
export const MODE_INFO = {
    words: { name: "Слова", level: 1, description: "Найди свой ритм" },
    sentences: { name: "Предложения", level: 2, description: "Печатай с выражением" },
    symbols: { name: "Символы", level: 3, description: "Укрощай сложные сочетания" },
    code: { name: "Код", level: 4, description: "Думай как разработчик" },
} as const;
export function levelInfo(xp: number) {
    const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
    const start = (level - 1) ** 2 * 100;
    const next = level ** 2 * 100;
    return { level, start, next, progress: (xp - start) / (next - start) };
}
export function multiplier(combo: number) { return combo >= 50 ? 5 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1; }
export function initialState(): GameState {
    return { position: 0, correct: 0, errors: 0, combo: 0, maxCombo: 0, score: 0, xp: 0, bonusUntil: 0, characters: {} };
}
/** Shared browser reducer and server-side result replay. Wrong keys never advance. */
export function press(state: GameState, content: string, key: string, time: number, bonusAt: number): GameState {
    const expected = content[state.position];
    if (expected === undefined)
        return state;
    const good = key === expected;
    const combo = good ? state.combo + 1 : 0;
    const correct = state.correct + Number(good);
    const stat = state.characters[expected] ?? { hits: 0, errors: 0 };
    const bonusUntil = good && correct === bonusAt ? time + 10000 : state.bonusUntil;
    const characters = { ...state.characters, [expected]: { hits: stat.hits + Number(good), errors: stat.errors + Number(!good) } };
    const pair = state.position > 0 ? content.slice(state.position - 1, state.position + 1) : "";
    if (pair && !/\s/.test(pair)) {
        const previous = characters[pair] ?? { hits: 0, errors: 0 };
        characters[pair] = { hits: previous.hits + Number(good), errors: previous.errors + Number(!good) };
    }
    return {
        position: state.position + Number(good), correct, errors: state.errors + Number(!good), combo,
        maxCombo: Math.max(state.maxCombo, combo), score: state.score + (good ? 5 * multiplier(combo) : 0),
        xp: state.xp + (good ? (time < bonusUntil ? 2 : 1) : 0), bonusUntil,
        characters,
    };
}
export function metrics(state: Pick<GameState, "correct" | "errors">, elapsed: number) {
    const minutes = Math.max(elapsed, 1000) / 60000;
    return { cpm: Math.round(state.correct / minutes), wpm: Math.round(state.correct / 5 / minutes), accuracy: state.correct + state.errors ? Math.round(state.correct / (state.correct + state.errors) * 1000) / 10 : 100 };
}
export function replay(content: string, events: KeyEvent[], duration: number, bonusAt: number) {
    let state = initialState();
    let previous = 0;
    for (const event of events) {
        if (typeof event.key !== "string" || event.key.length !== 1 || !Number.isFinite(event.t) || event.t < previous || event.t > duration + 200)
            throw new Error("Некорректная последовательность нажатий");
        previous = event.t;
        state = press(state, content, event.key, event.t, bonusAt);
    }
    return { ...state, ...metrics(state, duration) };
}
export const ACHIEVEMENTS = [
    { id: "first", name: "Первый шаг", text: "Заверши первую тренировку", icon: "flag", target: 1, kind: "sessions" },
    { id: "precise", name: "Без единой ошибки", text: "100% точности и 50 верных символов", icon: "target", target: 1, kind: "perfect" },
    { id: "fast", name: "Поймать ветер", text: "Разгонись до 200 символов в минуту", icon: "wind", target: 200, kind: "cpm" },
    { id: "combo", name: "В потоке", text: "Напечатай 100 символов подряд", icon: "flame", target: 100, kind: "combo" },
    { id: "steel", name: "Стальной палец", text: "1000 правильных нажатий подряд", icon: "shield", target: 1000, kind: "combo" },
    { id: "genius", name: "Печатный гений", text: "Достигни скорости 300 слов в минуту", icon: "crown", target: 300, kind: "wpm" },
    { id: "daily", name: "Хорошая привычка", text: "Тренируйся 3 дня подряд", icon: "calendar", target: 3, kind: "streak" },
    { id: "ten", name: "Уже герой", text: "Заверши 10 тренировок", icon: "medal", target: 10, kind: "sessions" },
    { id: "all", name: "На все руки", text: "Попробуй все 4 режима", icon: "layers", target: 4, kind: "modes" },
] as const;
export function formatTime(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
