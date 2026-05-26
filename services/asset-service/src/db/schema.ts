import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const assetTypeEnum = pgEnum('asset_type', [
  'character',
  'scene',
  'prop',
  'music',
  'sfx',
  'voice',
]);

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id'),
  type: assetTypeEnum('type').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
  fileUrl: text('file_url'),
  thumbnailUrl: text('thumbnail_url'),
  bgStyle: varchar('bg_style', { length: 50 }),
  avatar: varchar('avatar', { length: 10 }),
  durationMs: integer('duration_ms'),
  usesCount: integer('uses_count').notNull().default(0),
  createdBy: uuid('created_by'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
