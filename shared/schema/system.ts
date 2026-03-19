import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgSequence } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

// Sequence owned by rpt_refresh_log (excluded table) — declared to prevent drizzle-kit from dropping it
export const rptRefreshLogIdSeq = pgSequence("rpt_refresh_log_id_seq", { startWith: 1, increment: 1 });

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings);
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true, readAt: true });
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
