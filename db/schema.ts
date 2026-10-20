import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
    id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").unique(),
    password: text("password"), salt: text("salt"), createdAt: integer("created_at").notNull(),
});
export const authSessions = sqliteTable("auth_sessions", {
    token: text("token").primaryKey(), userId: text("user_id").notNull().references(() => users.id), expiresAt: integer("expires_at").notNull(),
}, (t) => [index("auth_expiry_idx").on(t.expiresAt)]);
export const exercises = sqliteTable("exercises", {
    id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id), config: text("config").notNull(),
    content: text("content").notNull(), bonusAt: integer("bonus_at").notNull(), startedAt: integer("started_at"), createdAt: integer("created_at").notNull(),
});
export const results = sqliteTable("results", {
    id: text("id").primaryKey().references(() => exercises.id), userId: text("user_id").notNull().references(() => users.id),
    mode: text("mode").notNull(), language: text("language").notNull(), duration: integer("duration").notNull(),
    correct: integer("correct").notNull(), errors: integer("errors").notNull(), maxCombo: integer("max_combo").notNull(),
    score: integer("score").notNull(), xp: integer("xp").notNull(), wpm: real("wpm").notNull(), cpm: real("cpm").notNull(),
    accuracy: real("accuracy").notNull(), trial: integer("trial").notNull().default(0), characters: text("characters").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [index("results_user_date_idx").on(t.userId, t.createdAt), index("results_date_idx").on(t.createdAt)]);
export const authLimits = sqliteTable("auth_limits", {
    key: text("key").primaryKey(), count: integer("count").notNull(), resetsAt: integer("resets_at").notNull(),
});
