-- Compatibility: what devices guests and staff use, and what goes wrong on them. No personal data beyond the participant
-- (when the device has joined) or the signed-in staff member. Kept for 30 days (pruned by the server on write).
BEGIN;

CREATE TABLE client_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES staff(id),
  source text NOT NULL CHECK (source IN ('guest', 'staff')),
  kind text NOT NULL CHECK (kind IN ('device', 'error', 'health')),
  -- A random per-device id from the browser, hashed: counts devices without identifying anyone.
  device_hash text NOT NULL CHECK (device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  browser text NOT NULL DEFAULT '' CHECK (length(browser) <= 40),
  browser_version text NOT NULL DEFAULT '' CHECK (length(browser_version) <= 20),
  os text NOT NULL DEFAULT '' CHECK (length(os) <= 20),
  os_version text NOT NULL DEFAULT '' CHECK (length(os_version) <= 20),
  device_class text NOT NULL DEFAULT '' CHECK (device_class IN ('', 'phone', 'tablet', 'desktop')),
  in_app text NOT NULL DEFAULT '' CHECK (length(in_app) <= 20),
  viewport text NOT NULL DEFAULT '' CHECK (length(viewport) <= 20),
  route text NOT NULL DEFAULT '' CHECK (length(route) <= 200),
  check_code text NOT NULL DEFAULT '' CHECK (length(check_code) <= 60),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 500),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  at timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'guest' OR event_id IS NOT NULL)
);
CREATE INDEX client_reports_event_idx ON client_reports (event_id, at DESC);
CREATE INDEX client_reports_org_idx ON client_reports (org_id, at DESC);
CREATE INDEX client_reports_ip_idx ON client_reports (ip_hash, at);
CREATE INDEX client_reports_device_idx ON client_reports (device_hash, at);
CREATE INDEX client_reports_at_idx ON client_reports (at);

COMMIT;
