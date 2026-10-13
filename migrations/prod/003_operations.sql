-- Real V1 staff operations. Keep bid sequence independent from active standing count.
BEGIN;

ALTER TABLE bids ADD COLUMN voided_at timestamptz;
ALTER TABLE bids ADD COLUMN voided_by uuid REFERENCES staff(id);
ALTER TABLE bids ADD COLUMN void_reason text NOT NULL DEFAULT '' CHECK (length(void_reason) <= 500);
ALTER TABLE standings ADD COLUMN next_sequence integer NOT NULL DEFAULT 1 CHECK (next_sequence > 0);
UPDATE standings s SET next_sequence = coalesce((SELECT max(b.sequence) + 1 FROM bids b WHERE b.item_id = s.item_id), 1);
ALTER TABLE items ADD COLUMN withdrawn_at timestamptz;
ALTER TABLE items ADD COLUMN withdrawal_message text NOT NULL DEFAULT '' CHECK (length(withdrawal_message) <= 1000);
ALTER TABLE events ADD COLUMN is_practice boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN archived_at timestamptz;

CREATE TABLE staff_password_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  staff_id uuid NOT NULL REFERENCES staff(id),
  kind text NOT NULL CHECK (kind IN ('invite', 'reset')),
  issued_by uuid NOT NULL REFERENCES staff(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_password_tokens_staff_idx ON staff_password_tokens (staff_id, created_at DESC);

COMMIT;
