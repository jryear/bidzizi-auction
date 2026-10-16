-- Staff roles and deactivation.
-- Owners reset colleagues' passwords and remove access; staff manage events. A deactivated account is
-- inactive (so every existing "AND active" check refuses it) and marked, so it isn't shown as a pending invite.
BEGIN;

ALTER TABLE staff ADD COLUMN role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff'));
ALTER TABLE staff ADD COLUMN deactivated_at timestamptz;
ALTER TABLE staff ADD COLUMN deactivated_by uuid REFERENCES staff(id);
ALTER TABLE staff ADD CONSTRAINT staff_deactivated_inactive CHECK (deactivated_at IS NULL OR NOT active);

-- Accounts provisioned directly by the operator (never invited from Studio) are the org's owners.
UPDATE staff s SET role = 'owner'
 WHERE NOT EXISTS (SELECT 1 FROM staff_password_tokens t WHERE t.staff_id = s.id AND t.kind = 'invite');
-- Every org keeps at least one owner: fall back to its earliest active account.
UPDATE staff s SET role = 'owner'
 WHERE s.id IN (SELECT DISTINCT ON (org_id) id FROM staff WHERE active ORDER BY org_id, created_at, id)
   AND NOT EXISTS (SELECT 1 FROM staff o WHERE o.org_id = s.org_id AND o.role = 'owner');

COMMIT;
