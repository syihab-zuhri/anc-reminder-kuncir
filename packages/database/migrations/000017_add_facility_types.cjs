"use strict";

exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TYPE facility_type ADD VALUE IF NOT EXISTS 'PUSTU';
  `);
  pgm.sql(String.raw`
    ALTER TYPE facility_type ADD VALUE IF NOT EXISTS 'POLINDES';
  `);
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum.
  // This down migration is intentionally a no-op.
};
