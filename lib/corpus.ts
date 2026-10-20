import type { Config } from "./game";
const ru = "мы ты он мир дом лес кот сад сон луч чай мяч река гора рука нога рыба небо море утро вечер ветер книга город время слово земля огонь школа птица весна тепло свет мысль смысл экран герой навык успех радуга звезда улыбка дорога работа музыка мечта остров облако солнце память планета клавиша тишина свобода улыбаться тренажёр клавиатура горизонт движение развитие энергия печатать точность скорость приключение путешествие спокойствие вдохновение мастерство технология щука подъезд площадка объект цапля".split(" ");
const en = "we it on is go sun cat dog map sky sea key home tree star rain fire game code word time wind book bird hand moon light world dream water sound green happy river learn type space story cloud friend planet memory future rhythm garden travel focus hero keyboard journey practice speed accuracy adventure technology zebra quick fox jazz horizon".split(" ");
const sentences = {
    ru: ["Каждая новая попытка делает тебя чуть быстрее.", "За окном медленно проплывают белые облака.", "Начни с точности, а скорость придёт с практикой.", "Маленькие шаги каждый день ведут к большой цели.", "В тихом городе зажигались первые вечерние огни.", "Книга на столе открыта на самой интересной странице.", "Путешествие начинается с желания увидеть что-то новое.", "Клавиши звучали в ритме любимой музыки.", "Мы учимся замечать детали и находить простые решения."],
    en: ["Every small step brings you closer to your goal.", "The morning sun filled the room with golden light.", "Take your time and let the rhythm find you.", "Practice a little every day to build a lasting habit.", "A good story can take you anywhere in the world.", "The quiet garden was full of birds and butterflies.", "Keep your eyes on the screen and trust your fingers.", "Great things start with a single curious question."],
};
const code = {
    python: ["def greet(name):\n\treturn f\"Hello, {name}!\"\n\nprint(greet(\"Hero\"))", "numbers = [1, 2, 3, 4, 5]\nsquares = [n ** 2 for n in numbers]\nprint(sum(squares))", "class Player:\n\tdef __init__(self, name):\n\t\tself.name = name\n\t\tself.level = 1", "for word in words:\n\tif len(word) > 3:\n\t\tprint(word.upper())"],
    javascript: ["const greet = (name) => {\n\treturn `Hello, ${name}!`;\n};\nconsole.log(greet(\"Hero\"));", "const numbers = [1, 2, 3, 4, 5];\nconst total = numbers.reduce((sum, n) => sum + n, 0);", "async function loadData() {\n\tconst response = await fetch('/api/data');\n\treturn response.json();\n}", "const player = {\n\tname: 'Hero',\n\tlevel: 1,\n\tactive: true\n};"],
    html: ["<section class=\"hero\">\n\t<h1>Hello, world!</h1>\n\t<p>Make something wonderful.</p>\n</section>", ".hero {\n\tdisplay: flex;\n\talign-items: center;\n\tgap: 16px;\n\tcolor: #b5ef69;\n}", "<button type=\"button\" class=\"start\">\n\tStart training\n</button>"],
};
function random<T>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)]; }
export function generateText(config: Config) {
    const parts: string[] = [];
    const minimum = Math.max(1200, config.duration * 25);
    if (config.mode === "code") {
        while (parts.join("\n\n").length < minimum)
            parts.push(random(code[config.codeLanguage]));
        return parts.join("\n\n");
    }
    if (config.mode === "sentences") {
        while (parts.join(" ").length < minimum)
            parts.push(random(sentences[config.language]));
        return parts.join(" ");
    }
    if (config.mode === "symbols") {
        const letters = config.language === "ru" ? "абвгдежзиклмнопрстуфхцчшщэюя" : "abcdefghijklmnopqrstuvwxyz";
        const alphabet = letters + "0123456789" + (config.difficulty === "easy" ? "" : (config.language === "ru" ? "!?№%*()_+-=/:;.,\"" : "!@#$%&*()_+-=[]{}:;.,?/"));
        while (parts.join(" ").length < minimum)
            parts.push((config.focus && Math.random() < 0.7 ? config.focus : "") + Array.from({ length: 3 + Math.floor(Math.random() * 6) }, () => random([...alphabet])).join(""));
        return parts.join(" ");
    }
    const dictionary = (config.language === "ru" ? ru : en).filter(w => w.length >= 2 && w.length <= 10 && (config.difficulty !== "easy" || w.length <= 5) && (config.difficulty !== "hard" || w.length >= 6));
    const focus = config.focus?.slice(0, 2).toLowerCase();
    const focused = focus ? dictionary.filter(w => w.includes(focus)) : [];
    while (parts.join(" ").length < minimum)
        parts.push(random(focused.length && Math.random() < 0.7 ? focused : dictionary));
    return parts.join(" ");
}
