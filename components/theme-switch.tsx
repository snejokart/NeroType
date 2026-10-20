"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const STORAGE_KEY = "hero_theme";
const validTheme = (value: string | null | undefined): Theme => value === "light" ? "light" : "dark";

export function ThemeSwitch() {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        setTheme(validTheme(document.documentElement.dataset.theme));
        const sync = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY) return;
            const next = validTheme(event.newValue);
            document.documentElement.dataset.theme = next;
            setTheme(next);
        };
        window.addEventListener("storage", sync);
        return () => window.removeEventListener("storage", sync);
    }, []);

    function choose(next: Theme) {
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Theme still works when browser storage is unavailable. */ }
    }

    return <div className="theme-switch" role="group" aria-label="Выбор темы">
        <button type="button" className="theme-choice" aria-label="Светлая тема" title="Светлая тема" aria-pressed={theme === "light"} onMouseDown={event => event.preventDefault()} onClick={() => choose("light")}><Sun size={15}/></button>
        <button type="button" className="theme-choice" aria-label="Тёмная тема" title="Тёмная тема" aria-pressed={theme === "dark"} onMouseDown={event => event.preventDefault()} onClick={() => choose("dark")}><Moon size={15}/></button>
    </div>;
}
