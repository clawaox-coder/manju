import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const scripts = pgTable('scripts', {
  projectId: uuid('project_id').primaryKey(),
  content: text('content').notNull().default(''),
  format: varchar('format', { length: 20 }).notNull().default('markdown'),
  wordCount: integer('word_count').notNull().default(0),
  sceneCount: smallint('scene_count').notNull().default(0),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  versionNo: integer('version_no').notNull().default(1),
});

export type Script = typeof scripts.$inferSelect;

export const shots = pgTable('shots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  num: varchar('num', { length: 10 }),
  title: varchar('title', { length: 200 }),
  shotType: varchar('shot_type', { length: 50 }),
  durationMs: integer('duration_ms').notNull().default(5000),
  dialog: text('dialog'),
  imageUrl: text('image_url'),
  bgStyle: varchar('bg_style', { length: 50 }),
  voiceId: uuid('voice_id'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
