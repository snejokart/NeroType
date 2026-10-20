"use client";
import { useState } from "react";
import { Hand, ChevronDown } from "lucide-react";
import type { Language } from "@/lib/game";
const EN = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
const RU = ["ё1234567890-=", "йцукенгшщзхъ\\", "фывапролджэ", "ячсмитьбю."];
const fingers = [[0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7]];
const fingerNames = ["Левый мизинец", "Левый безымянный", "Левый средний", "Левый указательный", "Правый указательный", "Правый средний", "Правый безымянный", "Правый мизинец", "Большой палец"];
const colors = ["#b5a2a8", "#b7a58f", "#b4b09a", "#a9b3a1", "#9eafb1", "#a2aabc", "#b0a6be", "#bda4b5", "#b3b0b9"];
export function keyHint(character: string | undefined, language: Language) {
    const rows = language === "ru" ? RU : EN;
    if (!character)
        return { key: "", finger: 8, shift: false, label: "Начни печатать" };
    if (character === " ")
        return { key: "Space", finger: 8, shift: false, label: "Пробел" };
    if (character === "\n")
        return { key: "Enter", finger: 7, shift: false, label: "Enter" };
    if (character === "\t")
        return { key: "Tab", finger: 0, shift: false, label: "Tab" };
    const shifted = language === "ru" ? { '!': '1', '"': '2', '№': '3', ';': '4', '%': '5', ':': '6', '?': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', ',': '.', '/': '\\' } : { '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' };
    const key = (shifted as Record<string, string | undefined>)[character] ?? character.toLowerCase();
    const shift = character !== character.toLowerCase() || Object.hasOwn(shifted, character);
    for (let r = 0; r < rows.length; r++) {
        const index = rows[r].indexOf(key);
        if (index >= 0)
            return { key, finger: fingers[r][index], shift, label: character.toUpperCase() };
    }
    return { key: character, finger: 8, shift: false, label: character };
}
export function TypingKeyboard({ next, language, enabled }: {
    next?: string;
    language: Language;
    enabled: boolean;
}) {
    const [open, setOpen] = useState(true);
    const hint = keyHint(next, language);
    const rows = language === "ru" ? RU : EN;
    const renderKey = (key: string, finger = 8, wide = false, label?: string) => <div key={key} className={`keyboard-key ${wide ? "wide" : ""} ${(enabled && (hint.key === key || (key === (hint.finger <= 3 ? "RightShift" : "Shift") && hint.shift))) ? "next" : ""} ${["а", "о", "f", "j"].includes(key) ? "home" : ""}`} style={{ "--finger": colors[finger] } as React.CSSProperties}>{label ?? key.toUpperCase()}</div>;
    return <section className="keyboard-panel">
    <button className="keyboard-caption" onClick={() => setOpen(!open)} aria-expanded={open}><span><Hand size={15}/> Клавиатурная подсказка</span><span className="muted">{language === "ru" ? "ЙЦУКЕН" : "QWERTY"}<ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }}/></span></button>
    {open && <><div className="keyboard" aria-label="Клавиатура с подсказками по пальцам">
      <div className="key-row">{[...rows[0]].map((k, i) => renderKey(k, fingers[0][i]))}{renderKey("Backspace", 7, true, "⌫")}</div>
      <div className="key-row">{renderKey("Tab", 0, true, "tab")}{[...rows[1]].map((k, i) => renderKey(k, fingers[1][i]))}</div>
      <div className="key-row">{renderKey("Caps", 0, true, "caps")}{[...rows[2]].map((k, i) => renderKey(k, fingers[2][i]))}{renderKey("Enter", 7, true, "enter ↵")}</div>
      <div className="key-row">{renderKey("Shift", 0, true, "shift")}{[...rows[3]].map((k, i) => renderKey(k, fingers[3][i]))}{renderKey("RightShift", 7, true, "shift")}</div>
      <div className="key-row bottom-row">{renderKey("Ctrl", 8, true, "ctrl")}{renderKey("Alt", 8, true, "alt")}{renderKey("Space", 8, true, "пробел")}{renderKey("AltR", 8, true, "alt")}{renderKey("CtrlR", 8, true, "ctrl")}</div>
    </div><div className="finger-legend"><div className="finger-dots">{colors.slice(0, 8).map((c, i) => <span key={c} title={fingerNames[i]} style={{ background: c }}/>)}</div><span>{enabled ? <><b style={{ color: colors[hint.finger] }}>{hint.shift ? "Shift + " : ""}{hint.label}</b><span className="legend-separator">/</span>{fingerNames[hint.finger]}</> : "У каждого пальца — своя зона"}</span></div></>}
  </section>;
}
