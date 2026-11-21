CREATE TABLE IF NOT EXISTS family_passkey (
  credential text PRIMARY KEY, owner text UNIQUE NOT NULL, public_key bytea NOT NULL, counter bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS family_challenge (
  nonce text PRIMARY KEY, kind text NOT NULL, owner text NOT NULL, challenge text NOT NULL, expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS family_session (
  token_hash text PRIMARY KEY, owner text NOT NULL REFERENCES family_passkey(owner), expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS family_budget (
  bucket text PRIMARY KEY, used integer NOT NULL, expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS family_batch (
  id text PRIMARY KEY, owner text NOT NULL, draft text NOT NULL, revision integer NOT NULL,
  snapshot jsonb NOT NULL, pending_until timestamptz
);
CREATE INDEX IF NOT EXISTS family_batch_owner_pending ON family_batch(owner, pending_until);
CREATE TABLE IF NOT EXISTS family_asset (
  batch text REFERENCES family_batch(id) ON DELETE CASCADE, part text NOT NULL, body bytea NOT NULL,
  PRIMARY KEY (batch, part)
);
CREATE TABLE IF NOT EXISTS family_link (
  id text PRIMARY KEY, owner text NOT NULL, revision integer NOT NULL, token_hash text UNIQUE,
  expires timestamptz, batch text REFERENCES family_batch(id)
);
CREATE INDEX IF NOT EXISTS family_link_owner ON family_link(owner);
CREATE INDEX IF NOT EXISTS family_link_expiry ON family_link(expires) WHERE batch IS NOT NULL;
