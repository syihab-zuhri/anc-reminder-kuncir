"use strict";

/**
 * Durable, hashed throttling for staff password logins.
 *
 * The previous per-account lock (staff_users.locked_until) let anyone who knew a login
 * identifier lock that operator out from anywhere. Failures are now counted per
 * (account, source address), per account, and per source address in a sliding window.
 * Only domain-separated HMACs are stored; raw identifiers and addresses never are.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE staff_login_rate_limit_scope AS ENUM ('ACCOUNT_IP', 'ACCOUNT', 'IP');

    CREATE TABLE staff_login_rate_limits (
      bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
      scope staff_login_rate_limit_scope NOT NULL,
      failure_count integer NOT NULL CHECK (failure_count > 0),
      window_started_at timestamptz NOT NULL,
      blocked_until timestamptz,
      updated_at timestamptz NOT NULL,
      CONSTRAINT staff_login_rate_limits_block_state CHECK (
        blocked_until IS NULL OR blocked_until > window_started_at
      )
    );

    CREATE INDEX staff_login_rate_limits_blocked_idx
      ON staff_login_rate_limits (blocked_until)
      WHERE blocked_until IS NOT NULL;
    CREATE INDEX staff_login_rate_limits_updated_idx
      ON staff_login_rate_limits (updated_at);

    COMMENT ON COLUMN staff_login_rate_limits.bucket_hash IS
      'Domain-separated keyed HMAC; raw login identifiers and source addresses are not persisted.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS staff_login_rate_limits_updated_idx;
    DROP INDEX IF EXISTS staff_login_rate_limits_blocked_idx;
    DROP TABLE IF EXISTS staff_login_rate_limits;
    DROP TYPE IF EXISTS staff_login_rate_limit_scope;
  `);
};
