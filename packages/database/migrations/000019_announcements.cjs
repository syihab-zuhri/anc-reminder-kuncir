"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE announcement_delivery_status AS ENUM ('SUCCESS', 'FAILED');

    CREATE TABLE announcements (
      id uuid PRIMARY KEY,
      staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
      body text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at timestamptz
    );

    CREATE INDEX announcements_created_at_idx ON announcements (created_at DESC);
    CREATE INDEX announcements_staff_idx ON announcements (staff_user_id, created_at DESC);

    CREATE TABLE announcement_deliveries (
      id uuid PRIMARY KEY,
      announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
      device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
      status announcement_delivery_status NOT NULL,
      provider_message_id text,
      error_code text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT announcement_deliveries_device_once UNIQUE (announcement_id, device_id),
      CONSTRAINT announcement_deliveries_provider_not_blank
        CHECK (provider_message_id IS NULL OR btrim(provider_message_id) <> ''),
      CONSTRAINT announcement_deliveries_error_not_blank
        CHECK (error_code IS NULL OR btrim(error_code) <> '')
    );

    CREATE INDEX announcement_deliveries_announcement_idx
      ON announcement_deliveries (announcement_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS announcement_deliveries;
    DROP TABLE IF EXISTS announcements;
    DROP TYPE IF EXISTS announcement_delivery_status;
  `);
};
