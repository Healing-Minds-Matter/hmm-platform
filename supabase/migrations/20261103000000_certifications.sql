-- Certifications (Epic 10, Phase 1: database).
--
-- Replaces the single QPR certification date with:
--   certification_types               the certifications HMM recognises (QPR is an ordinary type)
--   certification_type_retirements    retire / reactivate history per type
--   certification_designs             digital certificate designs, one row per saved version
--   certificates                      official certificates held by Champions and Gatekeepers
--   certificate_events                edits, removals and restores, for the certification journey
--   self_reported_certificates        certifications people add themselves
--   notifications                     in-app notifications (portal bell, mobile Alerts)
--
-- Rules live here, not only in the app: permissions are checked with cert_can() (the Epic 9
-- permission engine, plus a hard rule that Super-Admin-only keys never apply to anyone else),
-- Champions are limited to Gatekeepers in their own club by cert_in_scope(), and every
-- change is written to audit_logs and, where the stories say so, notified.
--
-- The live app still reads and writes profiles.qpr_certification_date / qpr_expiry_date.
-- Until it no longer does (Story 10.17 Scenario 04) they stay in sync both ways:
--   * a certificate change updates the old fields to match the person's current QPR certificate;
--   * an old-form change to the date creates, corrects or removes their QPR certificate.
--
-- "Today" is Sri Lanka's date (sl_today()), matching the rest of the app.

-- ── Types ───────────────────────────────────────────────────────────────────
CREATE TYPE public.certificate_format AS ENUM ('physical', 'digital', 'both');
CREATE TYPE public.validity_unit      AS ENUM ('months', 'years');
CREATE TYPE public.retirement_option  AS ENUM ('keep', 'stop');
CREATE TYPE public.self_cert_state    AS ENUM ('unverified', 'verified', 'removed', 'withdrawn');

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sl_today()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Colombo')::date $$;

-- Service-role calls (the app's admin client) and migrations have no signed-in user.
CREATE OR REPLACE FUNCTION public.cert_is_system()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL
$$;

-- True while the old QPR date fields are being written from a certificate change (prevents loops).
CREATE OR REPLACE FUNCTION public.cert_syncing() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('hmm.cert_sync', true), '') = 'on'
$$;
-- True while an old-form date change is being copied into certificates (skips app-only rules).
CREATE OR REPLACE FUNCTION public.cert_legacy() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('hmm.cert_legacy', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION public.cert_expiry(p_achieved date, p_value int, p_unit public.validity_unit)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN p_unit = 'years' THEN (p_achieved + make_interval(years => p_value))::date
    ELSE (p_achieved + make_interval(months => p_value))::date
  END
$$;

-- The Epic 9 resolution order (individual exception > group, deny wins > role default) for any user.
-- Same rules as effective_permission(), without its caller check, so a delegate's borrowed access
-- can be resolved; internal only (no EXECUTE for users).
CREATE OR REPLACE FUNCTION public.cert_effective_unchecked(p_user uuid, p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT is_enabled INTO v_ok FROM public.role_overrides WHERE user_id = p_user AND permission = p_permission;
  IF FOUND THEN RETURN v_ok; END IF;
  IF EXISTS (SELECT 1 FROM public.group_permissions gp JOIN public.group_members gm ON gm.group_id = gp.group_id
             WHERE gm.user_id = p_user AND gp.permission = p_permission AND NOT gp.is_enabled) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.group_permissions gp JOIN public.group_members gm ON gm.group_id = gp.group_id
             WHERE gm.user_id = p_user AND gp.permission = p_permission AND gp.is_enabled) THEN RETURN true; END IF;
  SELECT p.is_enabled INTO v_ok FROM public.permissions p JOIN public.profiles u ON u.role = p.role
  WHERE u.id = p_user AND p.permission = p_permission;
  RETURN coalesce(v_ok, false);
END;
$$;

-- Can the signed-in user use this certification permission?
-- Super Admins: everything except holding self-reported certifications.
-- Anyone else: never a Super-Admin-only key; otherwise their own resolved permission,
-- or a permission borrowed through an active delegation (Story 9.4).
CREATE OR REPLACE FUNCTION public.cert_can(p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  v_restricted text;
BEGIN
  IF public.cert_is_system() THEN RETURN true; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'super_admin' THEN RETURN p_permission <> 'certifications.self.manage'; END IF;
  SELECT restricted_to INTO v_restricted FROM public.permission_catalog WHERE key = p_permission;
  IF v_restricted = 'super_admin' THEN RETURN false; END IF;
  IF public.cert_effective_unchecked(auth.uid(), p_permission) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.v_active_role_delegations rd
                 WHERE rd.delegate_id = auth.uid() AND public.cert_effective_unchecked(rd.delegator_id, p_permission));
END;
$$;

-- Is this person someone the signed-in user may act on?
-- Super Admins: any Champion or Gatekeeper. Champions: Gatekeepers in their own club, never themselves.
CREATE OR REPLACE FUNCTION public.cert_in_scope(p_holder uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me public.profiles;
  v_holder public.profiles;
BEGIN
  IF public.cert_is_system() THEN RETURN true; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid() AND is_active;
  SELECT * INTO v_holder FROM public.profiles WHERE id = p_holder;
  IF v_me.id IS NULL OR v_holder.id IS NULL THEN RETURN false; END IF;
  IF v_me.role = 'super_admin' THEN RETURN v_holder.role IN ('champion', 'gatekeeper'); END IF;
  IF v_me.role = 'champion' THEN
    RETURN v_holder.role = 'gatekeeper' AND v_holder.club_id = v_me.club_id AND v_holder.id <> v_me.id;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_actor_label()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT full_name || ' (' || CASE role WHEN 'super_admin' THEN 'Super Admin' WHEN 'champion' THEN 'Champion' ELSE 'Gatekeeper' END || ')'
       FROM public.profiles WHERE id = auth.uid()),
    'System')
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE public.certification_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  code                  text NOT NULL CHECK (code ~ '^[A-Z0-9-]{1,12}$'),
  description           text,
  issuing_body          text,
  validity_value        int CHECK (validity_value BETWEEN 1 AND 120),   -- NULL = lifetime
  validity_unit         public.validity_unit,
  offered_from          date NOT NULL,
  created_from_existing boolean NOT NULL DEFAULT false,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((validity_value IS NULL) = (validity_unit IS NULL))
);
CREATE UNIQUE INDEX certification_types_name_key ON public.certification_types (lower(btrim(name)));
CREATE UNIQUE INDEX certification_types_code_key ON public.certification_types (code);

-- One row per retirement. In effect on a day d when retire_on <= d and (not reactivated, or d < reactivated_on).
-- "Offered until" in the app is the open retirement's retire_on.
CREATE TABLE public.certification_type_retirements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id        uuid NOT NULL REFERENCES public.certification_types(id),
  retire_on      date NOT NULL,
  option         public.retirement_option NOT NULL,
  chosen_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  chosen_at      timestamptz NOT NULL DEFAULT now(),
  reactivated_on date,
  reactivated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reactivated_at timestamptz
);
CREATE UNIQUE INDEX certification_type_retirements_one_open ON public.certification_type_retirements (type_id) WHERE reactivated_on IS NULL;

CREATE TABLE public.certification_designs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id    uuid NOT NULL REFERENCES public.certification_types(id),
  version    int NOT NULL,
  design     jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type_id, version)
);

CREATE TABLE public.certificates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_id                 uuid NOT NULL REFERENCES public.certification_types(id),
  achieved_on             date NOT NULL,
  expires_on              date,                                  -- NULL = lifetime
  validity_value          int,                                   -- the type's validity when awarded
  validity_unit           public.validity_unit,
  format                  public.certificate_format NOT NULL DEFAULT 'physical',
  attachment_path         text,
  certificate_number      text UNIQUE CHECK (certificate_number ~ '^HMM-[A-Z0-9-]+-[0-9]{4}-[0-9]{6}$'),
  design_version          int,
  pdf_path                text,
  reissued_at             timestamptz,
  migrated                boolean NOT NULL DEFAULT false,
  added_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  removed_at              timestamptz,
  removed_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_reason_category text CHECK (removed_reason_category IN ('Added by mistake', 'Added to the wrong person', 'Training was not completed', 'Certificate could not be verified', 'Duplicate record', 'Other')),
  removed_reason          text,
  CHECK (removed_at IS NULL OR (removed_reason_category IS NOT NULL AND length(btrim(coalesce(removed_reason, ''))) >= 10))
);
CREATE INDEX certificates_holder_type ON public.certificates (holder_id, type_id, achieved_on DESC);
CREATE INDEX certificates_type ON public.certificates (type_id);

CREATE TABLE public.certificate_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('edited', 'removed', 'restored')),
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_label    text NOT NULL,
  reason         text,
  changes        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certificate_events_certificate ON public.certificate_events (certificate_id, created_at);

-- Numbers are HMM-{CODE}-{YEAR}-{000001}, counted per type per year.
CREATE TABLE public.certificate_number_counters (
  type_id     uuid NOT NULL REFERENCES public.certification_types(id),
  year        int NOT NULL,
  last_number int NOT NULL,
  PRIMARY KEY (type_id, year)
);

CREATE TABLE public.self_reported_certificates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                    text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  organisation            text NOT NULL CHECK (length(btrim(organisation)) BETWEEN 1 AND 160),
  achieved_on             date NOT NULL,
  expires_on              date,                                  -- NULL = no expiry
  attachment_path         text,
  state                   public.self_cert_state NOT NULL DEFAULT 'unverified',
  reviewed_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  removed_reason_category text CHECK (removed_reason_category IN ('Attachment doesn’t show a completed certificate', 'Details don’t match the attachment', 'Not a recognised certification', 'Already recorded as an official certification', 'Other')),
  removed_reason          text,
  withdrawn_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR expires_on >= achieved_on),
  CHECK (state <> 'removed' OR (removed_reason_category IS NOT NULL AND length(btrim(coalesce(removed_reason, ''))) >= 10))
);
CREATE INDEX self_reported_holder ON public.self_reported_certificates (holder_id);
CREATE INDEX self_reported_state ON public.self_reported_certificates (state);

CREATE TABLE public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  body         text NOT NULL,
  link         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX notifications_recipient ON public.notifications (recipient_id, created_at DESC);

-- ── Status (Story 10.0) — one place for every screen ───────────────────────
-- A type is retired on a day when any of its retirements is in effect that day.
CREATE OR REPLACE FUNCTION public.cert_type_retired(p_type uuid, p_on date DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.certification_type_retirements r
    WHERE r.type_id = p_type
      AND r.retire_on <= coalesce(p_on, public.sl_today())
      AND (r.reactivated_on IS NULL OR coalesce(p_on, public.sl_today()) < r.reactivated_on)
  )
$$;

-- A certificate is stopped if a "stop" retirement took effect after it was achieved
-- (including retirements later undone by reactivating the type).
CREATE OR REPLACE FUNCTION public.cert_stopped_on(p_type uuid, p_achieved date)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT min(r.retire_on) FROM public.certification_type_retirements r
  WHERE r.type_id = p_type AND r.option = 'stop'
    AND r.retire_on <= public.sl_today() AND p_achieved < r.retire_on
    AND (r.reactivated_on IS NULL OR r.reactivated_on > r.retire_on)
$$;

CREATE VIEW public.certification_type_statuses WITH (security_invoker = true) AS
SELECT t.*,
  CASE
    WHEN public.cert_type_retired(t.id) THEN 'retired'
    WHEN open.retire_on IS NOT NULL THEN 'retiring'
    ELSE 'active'
  END AS status,
  open.id         AS open_retirement_id,
  open.retire_on  AS offered_until,
  open.option     AS retirement_option,
  (SELECT max(r.reactivated_on) FROM public.certification_type_retirements r
     WHERE r.type_id = t.id AND r.reactivated_on > public.sl_today()) AS returns_on
FROM public.certification_types t
LEFT JOIN public.certification_type_retirements open ON open.type_id = t.id AND open.reactivated_on IS NULL;

CREATE VIEW public.certificate_statuses WITH (security_invoker = true) AS
SELECT c.*, cur.is_current,
  public.cert_stopped_on(c.type_id, c.achieved_on) AS stopped_on,
  CASE
    WHEN c.removed_at IS NOT NULL THEN 'removed'
    WHEN NOT cur.is_current THEN 'renewed'
    WHEN public.cert_stopped_on(c.type_id, c.achieved_on) IS NOT NULL THEN 'stopped'
    WHEN c.expires_on IS NOT NULL AND c.expires_on < public.sl_today() THEN 'expired'
    WHEN c.expires_on IS NOT NULL AND c.expires_on <= public.sl_today() + 90 THEN 'expiring_soon'
    ELSE 'valid'
  END AS status
FROM public.certificates c
CROSS JOIN LATERAL (
  SELECT c.removed_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.certificates o
    WHERE o.holder_id = c.holder_id AND o.type_id = c.type_id AND o.removed_at IS NULL AND o.id <> c.id
      AND (o.achieved_on > c.achieved_on OR (o.achieved_on = c.achieved_on AND o.created_at > c.created_at))
  ) AS is_current
) cur;

-- ── Notifications and audit helpers ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_notify(p_to uuid, p_kind text, p_body text, p_link jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (recipient_id, kind, body, link) VALUES (p_to, p_kind, p_body, p_link)
$$;

-- Active Champions of a Gatekeeper's club, except whoever is acting.
CREATE OR REPLACE FUNCTION public.cert_club_champions(p_holder uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ch.id FROM public.profiles g
  JOIN public.profiles ch ON ch.club_id = g.club_id AND ch.role = 'champion' AND ch.is_active
  WHERE g.id = p_holder AND g.role = 'gatekeeper' AND ch.id IS DISTINCT FROM auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.cert_audit(p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'certification.' || p_action, p_entity_type, p_entity_id, p_details || jsonb_build_object('actor', public.cert_actor_label()))
$$;

-- Keep profiles.qpr_* matching the person's current QPR certificate.
CREATE OR REPLACE FUNCTION public.cert_sync_legacy_qpr(p_holder uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT c.achieved_on, c.expires_on INTO v
  FROM public.certificates c JOIN public.certification_types t ON t.id = c.type_id AND t.code = 'QPR'
  WHERE c.holder_id = p_holder AND c.removed_at IS NULL
  ORDER BY c.achieved_on DESC, c.created_at DESC LIMIT 1;
  PERFORM set_config('hmm.cert_sync', 'on', true);
  UPDATE public.profiles SET qpr_certification_date = v.achieved_on, qpr_expiry_date = v.expires_on
  WHERE id = p_holder
    AND (qpr_certification_date IS DISTINCT FROM v.achieved_on OR qpr_expiry_date IS DISTINCT FROM v.expires_on);
  PERFORM set_config('hmm.cert_sync', 'off', true);
END;
$$;

-- ── Triggers: certification types ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_types_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  NEW.name := btrim(NEW.name);
  IF TG_OP = 'INSERT' THEN
    IF NOT public.cert_is_system() THEN NEW.created_by := auth.uid(); NEW.created_from_existing := false; END IF;
  ELSE
    IF NEW.code <> OLD.code AND EXISTS (SELECT 1 FROM public.certificates WHERE type_id = OLD.id) THEN
      RAISE EXCEPTION 'The code can’t be changed: this type has already been awarded.' USING ERRCODE = '23514';
    END IF;
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at; NEW.created_from_existing := OLD.created_from_existing;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_types_before BEFORE INSERT OR UPDATE ON public.certification_types
  FOR EACH ROW EXECUTE FUNCTION public.cert_types_before();

CREATE OR REPLACE FUNCTION public.cert_types_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.cert_is_system() AND NEW.created_from_existing THEN RETURN NEW; END IF;
  PERFORM public.cert_audit(CASE TG_OP WHEN 'INSERT' THEN 'type_created' ELSE 'type_edited' END, 'certification_type', NEW.id,
    jsonb_build_object('subject', NEW.name, 'code', NEW.code,
      'validity', CASE WHEN NEW.validity_value IS NULL THEN 'lifetime' ELSE NEW.validity_value || ' ' || NEW.validity_unit END,
      'offered_from', NEW.offered_from));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_types_after AFTER INSERT OR UPDATE ON public.certification_types
  FOR EACH ROW EXECUTE FUNCTION public.cert_types_after();

-- ── Triggers: retirements ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_retirements_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.cert_is_system() AND NEW.retire_on < public.sl_today() THEN
      RAISE EXCEPTION 'The retirement date must be today or later.' USING ERRCODE = '23514';
    END IF;
    NEW.chosen_by := CASE WHEN public.cert_is_system() THEN NEW.chosen_by ELSE auth.uid() END;
    NEW.chosen_at := now(); NEW.reactivated_on := NULL; NEW.reactivated_by := NULL; NEW.reactivated_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.type_id <> OLD.type_id THEN RAISE EXCEPTION 'A retirement can’t move to another type.'; END IF;
  IF OLD.reactivated_on IS NOT NULL THEN RAISE EXCEPTION 'This retirement has already been undone.'; END IF;
  -- Move a scheduled date (not one already in effect).
  IF NOT public.cert_is_system() AND NEW.retire_on <> OLD.retire_on AND (OLD.retire_on <= public.sl_today() OR NEW.retire_on < public.sl_today()) THEN
    RAISE EXCEPTION 'Only a future retirement date can be changed, and only to today or later.' USING ERRCODE = '23514';
  END IF;
  IF NEW.option <> OLD.option OR NEW.retire_on <> OLD.retire_on THEN
    NEW.chosen_by := CASE WHEN public.cert_is_system() THEN OLD.chosen_by ELSE auth.uid() END; NEW.chosen_at := now();
  END IF;
  -- Reactivate (or cancel a scheduled retirement).
  IF NEW.reactivated_on IS NOT NULL THEN
    IF NOT public.cert_is_system() AND NEW.reactivated_on < public.sl_today() THEN
      RAISE EXCEPTION 'Choose today or a later date.' USING ERRCODE = '23514';
    END IF;
    NEW.reactivated_by := CASE WHEN public.cert_is_system() THEN NEW.reactivated_by ELSE auth.uid() END;
    NEW.reactivated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_retirements_before BEFORE INSERT OR UPDATE ON public.certification_type_retirements
  FOR EACH ROW EXECUTE FUNCTION public.cert_retirements_before();

CREATE OR REPLACE FUNCTION public.cert_retirements_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := (SELECT name FROM public.certification_types WHERE id = NEW.type_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.cert_audit('type_retired', 'certification_type', NEW.type_id,
      jsonb_build_object('subject', v_name, 'retire_on', NEW.retire_on, 'option', NEW.option));
  ELSIF NEW.reactivated_on IS NOT NULL AND OLD.reactivated_on IS NULL THEN
    PERFORM public.cert_audit(CASE WHEN NEW.reactivated_on < NEW.retire_on THEN 'retirement_cancelled' ELSE 'type_reactivated' END,
      'certification_type', NEW.type_id, jsonb_build_object('subject', v_name, 'offered_again_from', NEW.reactivated_on, 'retired_on', NEW.retire_on));
  ELSE
    PERFORM public.cert_audit('retirement_changed', 'certification_type', NEW.type_id,
      jsonb_build_object('subject', v_name, 'retire_on', NEW.retire_on, 'option', NEW.option, 'previous_option', OLD.option));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_retirements_after AFTER INSERT OR UPDATE ON public.certification_type_retirements
  FOR EACH ROW EXECUTE FUNCTION public.cert_retirements_after();

-- ── Triggers: designs (new versions only; never while the type is retired) ─
CREATE OR REPLACE FUNCTION public.cert_designs_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Saved design versions can’t be changed; save a new version instead.'; END IF;
  IF public.cert_type_retired(NEW.type_id) THEN
    RAISE EXCEPTION 'This certification type is retired; its design can’t be created or edited until it is reactivated.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.certification_types WHERE id = NEW.type_id FOR UPDATE;
  NEW.version := coalesce((SELECT max(version) FROM public.certification_designs WHERE type_id = NEW.type_id), 0) + 1;
  NEW.created_by := CASE WHEN public.cert_is_system() THEN NEW.created_by ELSE auth.uid() END;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_designs_before BEFORE INSERT OR UPDATE ON public.certification_designs
  FOR EACH ROW EXECUTE FUNCTION public.cert_designs_before();

CREATE OR REPLACE FUNCTION public.cert_designs_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cert_audit('design_saved', 'certification_type', NEW.type_id,
    jsonb_build_object('subject', (SELECT name FROM public.certification_types WHERE id = NEW.type_id), 'version', NEW.version));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cert_designs_after AFTER INSERT ON public.certification_designs
  FOR EACH ROW EXECUTE FUNCTION public.cert_designs_after();

-- ── Triggers: certificates ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_certificate_number(p_type uuid, p_year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_code text;
BEGIN
  INSERT INTO public.certificate_number_counters AS k (type_id, year, last_number) VALUES (p_type, p_year, 1)
  ON CONFLICT (type_id, year) DO UPDATE SET last_number = k.last_number + 1
  RETURNING last_number INTO v_n;
  SELECT code INTO v_code FROM public.certification_types WHERE id = p_type;
  RETURN 'HMM-' || v_code || '-' || p_year || '-' || lpad(v_n::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_certificate_number(uuid, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cert_check_date(p_type public.certification_types, p_achieved date)
RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_achieved > public.sl_today() THEN
    RAISE EXCEPTION 'The date achieved can’t be in the future.' USING ERRCODE = '23514';
  END IF;
  IF p_achieved < p_type.offered_from THEN
    RAISE EXCEPTION '% was only offered from %.', p_type.name, to_char(p_type.offered_from, 'FMDD Mon YYYY') USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.certificates_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type public.certification_types;
  v_system boolean := public.cert_is_system();
  v_legacy boolean := public.cert_legacy();
  v_reason text := nullif(btrim(coalesce(current_setting('hmm.edit_reason', true), '')), '');
  v_removing boolean; v_restoring boolean; v_edit boolean; v_digital boolean;
BEGIN
  SELECT * INTO v_type FROM public.certification_types WHERE id = NEW.type_id;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_legacy AND NOT (v_system AND NEW.migrated) THEN
      IF public.cert_type_retired(NEW.type_id) THEN
        RAISE EXCEPTION '% is retired and can’t be awarded.', v_type.name USING ERRCODE = '23514';
      END IF;
      PERFORM public.cert_check_date(v_type, NEW.achieved_on);
    END IF;
    NEW.validity_value := v_type.validity_value;
    NEW.validity_unit  := v_type.validity_unit;
    NEW.expires_on     := public.cert_expiry(NEW.achieved_on, NEW.validity_value, NEW.validity_unit);
    IF NOT v_system THEN
      NEW.added_by := auth.uid(); NEW.migrated := false; NEW.certificate_number := NULL; NEW.pdf_path := NULL; NEW.reissued_at := NULL;
    END IF;
    NEW.removed_at := NULL; NEW.removed_by := NULL; NEW.removed_reason_category := NULL; NEW.removed_reason := NULL;
    NEW.created_at := now(); NEW.updated_at := now();
    IF NEW.design_version IS NOT NULL THEN
      IF NOT (v_system OR public.cert_can('certifications.digital.generate')) THEN
        RAISE EXCEPTION 'You don’t have permission to generate digital certificates.' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.certification_designs WHERE type_id = NEW.type_id AND version = NEW.design_version) THEN
        RAISE EXCEPTION 'That certificate design version doesn’t exist.' USING ERRCODE = '23514';
      END IF;
      NEW.certificate_number := public.next_certificate_number(NEW.type_id, extract(year FROM NEW.achieved_on)::int);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.holder_id <> OLD.holder_id OR NEW.type_id <> OLD.type_id OR NEW.migrated <> OLD.migrated
     OR NEW.added_by IS DISTINCT FROM OLD.added_by OR NEW.created_at <> OLD.created_at
     OR NEW.validity_value IS DISTINCT FROM OLD.validity_value OR NEW.validity_unit IS DISTINCT FROM OLD.validity_unit THEN
    RAISE EXCEPTION 'The person, certification type and validity of a certificate can’t be changed.' USING ERRCODE = '23514';
  END IF;
  IF NEW.certificate_number IS DISTINCT FROM OLD.certificate_number AND OLD.certificate_number IS NOT NULL THEN
    RAISE EXCEPTION 'A certificate number never changes.' USING ERRCODE = '23514';
  END IF;

  v_removing  := OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL;
  v_restoring := OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL;
  v_digital   := NEW.design_version IS DISTINCT FROM OLD.design_version OR NEW.pdf_path IS DISTINCT FROM OLD.pdf_path OR NEW.reissued_at IS DISTINCT FROM OLD.reissued_at;
  v_edit      := NEW.achieved_on <> OLD.achieved_on OR NEW.format <> OLD.format
                 OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path OR v_digital;

  IF v_removing THEN
    IF v_edit THEN RAISE EXCEPTION 'Remove a certificate on its own, without other changes.'; END IF;
    IF NOT (v_legacy OR public.cert_can('certifications.official.remove')) THEN
      RAISE EXCEPTION 'You don’t have permission to remove certificates.' USING ERRCODE = '42501';
    END IF;
    NEW.removed_at := now();
    NEW.removed_by := CASE WHEN v_system THEN NEW.removed_by ELSE auth.uid() END;
  ELSIF v_restoring THEN
    IF v_edit THEN RAISE EXCEPTION 'Undo a removal on its own, without other changes.'; END IF;
    IF NOT (v_system OR public.current_user_role() = 'super_admin') THEN
      RAISE EXCEPTION 'Only a Super Admin can undo a removal.' USING ERRCODE = '42501';
    END IF;
    NEW.removed_by := NULL; NEW.removed_reason_category := NULL; NEW.removed_reason := NULL;
  ELSIF OLD.removed_at IS NOT NULL THEN
    IF v_edit OR NEW.removed_reason IS DISTINCT FROM OLD.removed_reason OR NEW.removed_reason_category IS DISTINCT FROM OLD.removed_reason_category THEN
      RAISE EXCEPTION 'A removed certificate can’t be changed.' USING ERRCODE = '23514';
    END IF;
  ELSIF v_edit THEN
    IF NOT v_legacy THEN
      IF NOT public.cert_can('certifications.official.edit') THEN
        RAISE EXCEPTION 'You don’t have permission to edit certificates.' USING ERRCODE = '42501';
      END IF;
      IF v_digital AND NOT public.cert_can('certifications.digital.generate') THEN
        RAISE EXCEPTION 'You don’t have permission to generate digital certificates.' USING ERRCODE = '42501';
      END IF;
      IF v_reason IS NULL AND NOT v_system THEN
        RAISE EXCEPTION 'Give a reason for the change.' USING ERRCODE = '23514';
      END IF;
      IF NEW.achieved_on <> OLD.achieved_on THEN PERFORM public.cert_check_date(v_type, NEW.achieved_on); END IF;
    END IF;
    IF NEW.achieved_on <> OLD.achieved_on THEN
      NEW.expires_on := public.cert_expiry(NEW.achieved_on, NEW.validity_value, NEW.validity_unit);
    END IF;
    IF NEW.design_version IS NOT NULL AND NEW.design_version IS DISTINCT FROM OLD.design_version THEN
      IF NOT EXISTS (SELECT 1 FROM public.certification_designs WHERE type_id = NEW.type_id AND version = NEW.design_version) THEN
        RAISE EXCEPTION 'That certificate design version doesn’t exist.' USING ERRCODE = '23514';
      END IF;
      IF NEW.certificate_number IS NULL THEN
        NEW.certificate_number := public.next_certificate_number(NEW.type_id, extract(year FROM NEW.achieved_on)::int);
      END IF;
    END IF;
  ELSIF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Nothing has changed.' USING ERRCODE = '23514';
  ELSE
    -- No meaningful change; keep the removal fields as they were.
    NEW.removed_reason := OLD.removed_reason; NEW.removed_reason_category := OLD.removed_reason_category;
  END IF;
  NEW.expires_on := CASE WHEN NEW.achieved_on <> OLD.achieved_on THEN NEW.expires_on ELSE OLD.expires_on END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_certificates_before BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.certificates_before();

CREATE OR REPLACE FUNCTION public.certificates_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type public.certification_types;
  v_holder public.profiles;
  v_actor text := public.cert_actor_label();
  v_legacy boolean := public.cert_legacy();
  v_reason text := nullif(btrim(coalesce(current_setting('hmm.edit_reason', true), '')), '');
  v_link jsonb := jsonb_build_object('type', 'certificate', 'id', NEW.id);
  v_changes jsonb := '{}'::jsonb;
  v_text text;
  v_renewal boolean;
  v_champion uuid;
BEGIN
  SELECT * INTO v_type FROM public.certification_types WHERE id = NEW.type_id;
  SELECT * INTO v_holder FROM public.profiles WHERE id = NEW.holder_id;

  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.migrated THEN
      v_renewal := EXISTS (SELECT 1 FROM public.certificates o WHERE o.holder_id = NEW.holder_id AND o.type_id = NEW.type_id
                             AND o.id <> NEW.id AND o.removed_at IS NULL AND o.achieved_on < NEW.achieved_on)
               AND NOT EXISTS (SELECT 1 FROM public.certificates o WHERE o.holder_id = NEW.holder_id AND o.type_id = NEW.type_id
                             AND o.id <> NEW.id AND o.removed_at IS NULL AND o.achieved_on >= NEW.achieved_on);
      PERFORM public.cert_audit(CASE WHEN v_renewal THEN 'certificate_renewed' ELSE 'certificate_added' END, 'certificate', NEW.id,
        jsonb_build_object('subject', v_holder.full_name, 'holder_id', NEW.holder_id, 'type', v_type.name,
          'achieved_on', NEW.achieved_on, 'certificate_number', NEW.certificate_number, 'from_old_form', v_legacy));
      IF v_renewal AND NOT v_legacy THEN
        PERFORM public.cert_notify(NEW.holder_id, 'certificate_renewed',
          v_actor || ' renewed your ' || v_type.name || ' certificate. Valid until '
            || coalesce(to_char(NEW.expires_on, 'FMDD Mon YYYY'), 'lifetime') || '.', v_link);
      END IF;
    END IF;
  ELSE
    IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
      INSERT INTO public.certificate_events (certificate_id, kind, actor_id, actor_label, reason)
      VALUES (NEW.id, 'removed', auth.uid(), v_actor, NEW.removed_reason_category || ': ' || NEW.removed_reason);
      PERFORM public.cert_audit('certificate_removed', 'certificate', NEW.id,
        jsonb_build_object('subject', v_holder.full_name, 'holder_id', NEW.holder_id, 'type', v_type.name,
          'reason', NEW.removed_reason_category || ': ' || NEW.removed_reason, 'from_old_form', v_legacy));
      IF NOT v_legacy THEN
        PERFORM public.cert_notify(NEW.holder_id, 'certificate_removed',
          v_actor || ' removed your ''' || v_type.name || ''' certificate. Reason: ' || NEW.removed_reason_category || ': ' || NEW.removed_reason
            || '. It no longer counts as valid. If you think this is a mistake, contact your Club Champion.', v_link);
        FOR v_champion IN SELECT public.cert_club_champions(NEW.holder_id) LOOP
          PERFORM public.cert_notify(v_champion, 'certificate_removed',
            v_actor || ' removed ''' || v_type.name || ''' from ' || v_holder.full_name || '''s profile. Reason: '
              || NEW.removed_reason_category || ': ' || NEW.removed_reason, v_link);
        END LOOP;
      END IF;
    ELSIF OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
      INSERT INTO public.certificate_events (certificate_id, kind, actor_id, actor_label, reason, changes)
      VALUES (NEW.id, 'restored', auth.uid(), v_actor, 'Undid the removal of ' || to_char(OLD.removed_at AT TIME ZONE 'Asia/Colombo', 'FMDD Mon YYYY'),
        jsonb_build_object('was_removed_for', OLD.removed_reason_category || ': ' || OLD.removed_reason));
      PERFORM public.cert_audit('removal_undone', 'certificate', NEW.id,
        jsonb_build_object('subject', v_holder.full_name, 'holder_id', NEW.holder_id, 'type', v_type.name,
          'was_removed_for', OLD.removed_reason_category || ': ' || OLD.removed_reason));
      PERFORM public.cert_notify(NEW.holder_id, 'certificate_restored', v_actor || ' restored your ' || v_type.name || ' certificate.', v_link);
      FOR v_champion IN SELECT public.cert_club_champions(NEW.holder_id) LOOP
        PERFORM public.cert_notify(v_champion, 'certificate_restored',
          v_actor || ' restored ' || v_type.name || ' on ' || v_holder.full_name || '''s profile.', v_link);
      END LOOP;
    ELSE
      IF NEW.achieved_on <> OLD.achieved_on THEN v_changes := v_changes || jsonb_build_object('achieved_on', jsonb_build_array(OLD.achieved_on, NEW.achieved_on)); END IF;
      IF NEW.format <> OLD.format THEN v_changes := v_changes || jsonb_build_object('format', jsonb_build_array(OLD.format, NEW.format)); END IF;
      IF NEW.attachment_path IS DISTINCT FROM OLD.attachment_path THEN v_changes := v_changes || jsonb_build_object('attachment', true); END IF;
      IF NEW.certificate_number IS DISTINCT FROM OLD.certificate_number THEN v_changes := v_changes || jsonb_build_object('certificate_generated', NEW.certificate_number); END IF;
      IF NEW.reissued_at IS DISTINCT FROM OLD.reissued_at OR (NEW.design_version IS DISTINCT FROM OLD.design_version AND OLD.certificate_number IS NOT NULL) THEN
        v_changes := v_changes || jsonb_build_object('reissued_with_design', NEW.design_version);
      END IF;
      IF v_changes <> '{}'::jsonb THEN
        INSERT INTO public.certificate_events (certificate_id, kind, actor_id, actor_label, reason, changes)
        VALUES (NEW.id, 'edited', auth.uid(), v_actor, coalesce(v_reason, CASE WHEN v_legacy THEN 'Changed in the Gatekeeper form' END), v_changes);
        PERFORM public.cert_audit('certificate_edited', 'certificate', NEW.id,
          jsonb_build_object('subject', v_holder.full_name, 'holder_id', NEW.holder_id, 'type', v_type.name,
            'changes', v_changes, 'reason', v_reason, 'from_old_form', v_legacy));
        IF NOT v_legacy THEN
          v_text := concat_ws('; ',
            CASE WHEN v_changes ? 'achieved_on' THEN 'date achieved ' || to_char(OLD.achieved_on, 'FMDD Mon YYYY') || ' → ' || to_char(NEW.achieved_on, 'FMDD Mon YYYY') END,
            CASE WHEN v_changes ? 'format' THEN 'format ' || initcap(OLD.format::text) || ' → ' || initcap(NEW.format::text) END,
            CASE WHEN v_changes ? 'attachment' THEN 'attachment replaced' END,
            CASE WHEN v_changes ? 'certificate_generated' THEN 'digital certificate ' || NEW.certificate_number || ' generated' END,
            CASE WHEN v_changes ? 'reissued_with_design' AND NOT v_changes ? 'certificate_generated' THEN 'PDF re-issued' END);
          PERFORM public.cert_notify(NEW.holder_id, 'certificate_edited',
            v_actor || ' updated your ' || v_type.name || ' certificate: ' || v_text || '.' || coalesce(' Reason: ' || v_reason, ''), v_link);
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_type.code = 'QPR' THEN PERFORM public.cert_sync_legacy_qpr(NEW.holder_id); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_certificates_after AFTER INSERT OR UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.certificates_after();

-- ── Triggers: self-reported certificates ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.self_reported_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_system boolean := public.cert_is_system();
  v_holder boolean := NEW.holder_id = auth.uid();
BEGIN
  NEW.name := btrim(NEW.name); NEW.organisation := btrim(NEW.organisation);
  IF TG_OP = 'INSERT' THEN
    IF NOT v_system AND NOT v_holder THEN RAISE EXCEPTION 'You can only add certifications to your own profile.' USING ERRCODE = '42501'; END IF;
    IF NEW.achieved_on > public.sl_today() THEN RAISE EXCEPTION 'The date achieved can’t be in the future.' USING ERRCODE = '23514'; END IF;
    IF NOT v_system THEN
      NEW.state := 'unverified'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
      NEW.removed_reason_category := NULL; NEW.removed_reason := NULL; NEW.withdrawn_at := NULL;
    END IF;
    NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.holder_id <> OLD.holder_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'The holder of a certification can’t be changed.' USING ERRCODE = '23514';
  END IF;
  IF v_system THEN NEW.updated_at := now(); RETURN NEW; END IF;

  IF v_holder THEN
    IF OLD.state <> 'unverified' THEN RAISE EXCEPTION 'Only certifications waiting for review can be changed.' USING ERRCODE = '23514'; END IF;
    IF NEW.state = 'withdrawn' THEN
      NEW.withdrawn_at := now();
    ELSIF NEW.state <> 'unverified' THEN
      RAISE EXCEPTION 'You can’t review your own certifications.' USING ERRCODE = '42501';
    ELSIF NEW.achieved_on > public.sl_today() THEN
      RAISE EXCEPTION 'The date achieved can’t be in the future.' USING ERRCODE = '23514';
    END IF;
    NEW.reviewed_by := OLD.reviewed_by; NEW.reviewed_at := OLD.reviewed_at;
    NEW.removed_reason_category := OLD.removed_reason_category; NEW.removed_reason := OLD.removed_reason;
  ELSE
    -- A reviewer can only change the state, from waiting or verified to verified or removed.
    IF NEW.name <> OLD.name OR NEW.organisation <> OLD.organisation OR NEW.achieved_on <> OLD.achieved_on
       OR NEW.expires_on IS DISTINCT FROM OLD.expires_on OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path THEN
      RAISE EXCEPTION 'Reviewers can’t change the details of a certification.' USING ERRCODE = '42501';
    END IF;
    IF NEW.state = 'verified' AND OLD.state = 'unverified' THEN
      IF NOT public.cert_can('certifications.review.verify') THEN RAISE EXCEPTION 'You don’t have permission to verify certifications.' USING ERRCODE = '42501'; END IF;
    ELSIF NEW.state = 'removed' AND OLD.state IN ('unverified', 'verified') THEN
      IF NOT public.cert_can('certifications.review.remove') THEN RAISE EXCEPTION 'You don’t have permission to remove certifications.' USING ERRCODE = '42501'; END IF;
    ELSE
      RAISE EXCEPTION 'That change isn’t allowed.' USING ERRCODE = '23514';
    END IF;
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now(); NEW.withdrawn_at := OLD.withdrawn_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_self_reported_before BEFORE INSERT OR UPDATE ON public.self_reported_certificates
  FOR EACH ROW EXECUTE FUNCTION public.self_reported_before();

CREATE OR REPLACE FUNCTION public.self_reported_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holder text := (SELECT full_name FROM public.profiles WHERE id = NEW.holder_id);
  v_actor text := public.cert_actor_label();
  v_link jsonb := jsonb_build_object('type', 'self_reported', 'id', NEW.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.cert_audit('self_reported_added', 'self_reported_certificate', NEW.id,
      jsonb_build_object('subject', v_holder, 'holder_id', NEW.holder_id, 'name', NEW.name, 'organisation', NEW.organisation));
  ELSIF NEW.state <> OLD.state THEN
    PERFORM public.cert_audit('self_reported_' || NEW.state, 'self_reported_certificate', NEW.id,
      jsonb_build_object('subject', v_holder, 'holder_id', NEW.holder_id, 'name', NEW.name,
        'reason', CASE WHEN NEW.state = 'removed' THEN NEW.removed_reason_category || ': ' || NEW.removed_reason END));
    IF NEW.state = 'verified' THEN
      PERFORM public.cert_notify(NEW.holder_id, 'self_reported_verified', v_actor || ' verified "' || NEW.name || '" on your profile.', v_link);
    ELSIF NEW.state = 'removed' THEN
      PERFORM public.cert_notify(NEW.holder_id, 'self_reported_removed',
        v_actor || ' removed ''' || NEW.name || ''' (added by you) from your profile. Reason: ' || NEW.removed_reason_category || ': '
          || NEW.removed_reason || '. You can add it again, for example with a clearer attachment.', v_link);
    END IF;
  ELSIF NEW.state = 'unverified' THEN
    PERFORM public.cert_audit('self_reported_edited', 'self_reported_certificate', NEW.id,
      jsonb_build_object('subject', v_holder, 'holder_id', NEW.holder_id, 'name', NEW.name));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_self_reported_after AFTER INSERT OR UPDATE ON public.self_reported_certificates
  FOR EACH ROW EXECUTE FUNCTION public.self_reported_after();

-- ── Triggers: notifications (recipients may only mark them read) ────────────
CREATE OR REPLACE FUNCTION public.notifications_before_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.cert_is_system() THEN
    IF NEW.recipient_id <> OLD.recipient_id OR NEW.kind <> OLD.kind OR NEW.body <> OLD.body
       OR NEW.link IS DISTINCT FROM OLD.link OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Only the read state of a notification can be changed.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notifications_before_update BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_before_update();

-- ── Old QPR fields → certificates (while the old forms are still in use) ────
-- The old Add/Edit Gatekeeper forms write profiles.qpr_certification_date; its expiry was
-- always date + 3 years. Skip that recalculation when a certificate is the source.
CREATE OR REPLACE FUNCTION public.set_qpr_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.cert_syncing() THEN RETURN NEW; END IF;
  IF NEW.qpr_certification_date IS NOT NULL THEN
    NEW.qpr_expiry_date = NEW.qpr_certification_date + INTERVAL '3 years';
  ELSE
    NEW.qpr_expiry_date = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_qpr_to_certificates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type uuid := (SELECT id FROM public.certification_types WHERE code = 'QPR');
  v_cur public.certificates;
BEGIN
  IF public.cert_syncing() OR v_type IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.qpr_certification_date IS NOT DISTINCT FROM OLD.qpr_certification_date THEN RETURN NEW; END IF;
  SELECT * INTO v_cur FROM public.certificates
  WHERE holder_id = NEW.id AND type_id = v_type AND removed_at IS NULL
  ORDER BY achieved_on DESC, created_at DESC LIMIT 1;

  PERFORM set_config('hmm.cert_legacy', 'on', true);
  IF NEW.qpr_certification_date IS NOT NULL THEN
    IF v_cur.id IS NULL THEN
      INSERT INTO public.certificates (holder_id, type_id, achieved_on, format) VALUES (NEW.id, v_type, NEW.qpr_certification_date, 'physical');
    ELSIF v_cur.achieved_on <> NEW.qpr_certification_date THEN
      UPDATE public.certificates SET achieved_on = NEW.qpr_certification_date WHERE id = v_cur.id;
    END IF;
  ELSIF v_cur.id IS NOT NULL THEN
    UPDATE public.certificates SET removed_at = now(), removed_reason_category = 'Other',
      removed_reason = 'The certification date was cleared in the Gatekeeper form.'
    WHERE id = v_cur.id;
  END IF;
  PERFORM set_config('hmm.cert_legacy', 'off', true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_profiles_qpr_to_certificates AFTER INSERT OR UPDATE OF qpr_certification_date ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_qpr_to_certificates();

-- ── Super-Admin-only permissions can't be given to anyone else (Story 10.15 Sc02) ─
CREATE OR REPLACE FUNCTION public.refuse_super_admin_only_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_enabled AND EXISTS (SELECT 1 FROM public.permission_catalog WHERE key = NEW.permission AND restricted_to = 'super_admin') THEN
    RAISE EXCEPTION '"%" is for Super Admins only and can’t be given to anyone else.', NEW.permission USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_permissions_super_admin_only BEFORE INSERT OR UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_super_admin_only_permission();
CREATE TRIGGER trg_role_overrides_super_admin_only BEFORE INSERT OR UPDATE ON public.role_overrides
  FOR EACH ROW EXECUTE FUNCTION public.refuse_super_admin_only_permission();
CREATE TRIGGER trg_group_permissions_super_admin_only BEFORE INSERT OR UPDATE ON public.group_permissions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_super_admin_only_permission();
-- Delegation can't pass them on either: cert_can() returns false for these keys for anyone but a Super Admin.

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.certification_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_type_retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_designs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_number_counters    ENABLE ROW LEVEL SECURITY;   -- no policies: only the numbering function uses it
ALTER TABLE public.self_reported_certificates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                  ENABLE ROW LEVEL SECURITY;

-- Types, retirements and designs: everyone signed in can read (people need the names of what they hold).
CREATE POLICY "certification_types: read" ON public.certification_types FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "certification_types: manage insert" ON public.certification_types FOR INSERT TO authenticated
  WITH CHECK (public.cert_can('certifications.types.manage'));
CREATE POLICY "certification_types: manage update" ON public.certification_types FOR UPDATE TO authenticated
  USING (public.cert_can('certifications.types.manage')) WITH CHECK (public.cert_can('certifications.types.manage'));

CREATE POLICY "certification_type_retirements: read" ON public.certification_type_retirements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "certification_type_retirements: retire insert" ON public.certification_type_retirements FOR INSERT TO authenticated
  WITH CHECK (public.cert_can('certifications.types.retire'));
CREATE POLICY "certification_type_retirements: retire update" ON public.certification_type_retirements FOR UPDATE TO authenticated
  USING (public.cert_can('certifications.types.retire')) WITH CHECK (public.cert_can('certifications.types.retire'));

CREATE POLICY "certification_designs: read" ON public.certification_designs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "certification_designs: manage insert" ON public.certification_designs FOR INSERT TO authenticated
  WITH CHECK (public.cert_can('certifications.design.manage'));

-- Certificates: your own; Super Admins all; Champions their own club's Gatekeepers.
CREATE POLICY "certificates: read" ON public.certificates FOR SELECT TO authenticated
  USING (holder_id = auth.uid() OR public.current_user_role() = 'super_admin'
         OR (public.cert_in_scope(holder_id) AND public.cert_can('certifications.journey.view')));
CREATE POLICY "certificates: award" ON public.certificates FOR INSERT TO authenticated
  WITH CHECK (public.cert_in_scope(holder_id) AND public.cert_can('certifications.award'));
CREATE POLICY "certificates: edit or remove" ON public.certificates FOR UPDATE TO authenticated
  USING (public.cert_in_scope(holder_id) AND (public.cert_can('certifications.official.edit') OR public.cert_can('certifications.official.remove')))
  WITH CHECK (public.cert_in_scope(holder_id));

CREATE POLICY "certificate_events: read with the certificate" ON public.certificate_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.certificates c WHERE c.id = certificate_id));

-- Self-reported: the holder always; reviewers in scope, except withdrawn items.
CREATE POLICY "self_reported: read" ON public.self_reported_certificates FOR SELECT TO authenticated
  USING (holder_id = auth.uid()
         OR (state <> 'withdrawn' AND (public.current_user_role() = 'super_admin'
             OR (public.cert_in_scope(holder_id) AND public.cert_can('certifications.review.view')))));
CREATE POLICY "self_reported: add own" ON public.self_reported_certificates FOR INSERT TO authenticated
  WITH CHECK (holder_id = auth.uid() AND public.cert_can('certifications.self.manage'));
CREATE POLICY "self_reported: holder or reviewer update" ON public.self_reported_certificates FOR UPDATE TO authenticated
  USING ((holder_id = auth.uid() AND public.cert_can('certifications.self.manage'))
         OR (public.cert_in_scope(holder_id) AND (public.cert_can('certifications.review.verify') OR public.cert_can('certifications.review.remove'))))
  WITH CHECK (holder_id = auth.uid() OR public.cert_in_scope(holder_id));

CREATE POLICY "notifications: read own" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "notifications: mark own read" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

GRANT SELECT ON public.certification_type_statuses, public.certificate_statuses TO authenticated;
GRANT EXECUTE ON FUNCTION public.cert_can(text), public.cert_in_scope(uuid), public.sl_today(),
  public.cert_type_retired(uuid, date), public.cert_stopped_on(uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.cert_notify(uuid, text, text, jsonb), public.cert_audit(text, text, uuid, jsonb),
  public.cert_sync_legacy_qpr(uuid), public.cert_effective_unchecked(uuid, text), public.cert_club_champions(uuid)
  FROM PUBLIC, anon, authenticated;

-- ── Actions that need a reason (the app calls these) ────────────────────────
-- SECURITY INVOKER: the caller's own permissions and policies apply.
CREATE OR REPLACE FUNCTION public.edit_certificate(
  p_id uuid, p_achieved_on date, p_format public.certificate_format, p_attachment_path text,
  p_reissue boolean, p_design_version int, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'Give a reason for the change.' USING ERRCODE = '23514'; END IF;
  PERFORM set_config('hmm.edit_reason', btrim(p_reason), true);
  UPDATE public.certificates SET
    achieved_on     = coalesce(p_achieved_on, achieved_on),
    format          = coalesce(p_format, format),
    attachment_path = coalesce(p_attachment_path, attachment_path),
    design_version  = CASE WHEN p_reissue THEN coalesce(p_design_version, design_version) ELSE design_version END,
    reissued_at     = CASE WHEN p_reissue AND certificate_number IS NOT NULL THEN now() ELSE reissued_at END
  WHERE id = p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('hmm.edit_reason', '', true);
  IF v_rows = 0 THEN RAISE EXCEPTION 'Certificate not found, or you don’t have permission to edit it.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_certificate(p_id uuid, p_category text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  IF p_category IS NULL THEN RAISE EXCEPTION 'Choose a reason.' USING ERRCODE = '23514'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Explain the reason in a sentence (at least 10 characters).' USING ERRCODE = '23514';
  END IF;
  UPDATE public.certificates SET removed_at = now(), removed_reason_category = p_category, removed_reason = btrim(p_reason)
  WHERE id = p_id AND removed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Certificate not found, already removed, or you don’t have permission to remove it.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_certificate(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  UPDATE public.certificates SET removed_at = NULL WHERE id = p_id AND removed_at IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Certificate not found, not removed, or you don’t have permission.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_self_reported(p_id uuid, p_verify boolean, p_category text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  IF p_verify THEN
    UPDATE public.self_reported_certificates SET state = 'verified' WHERE id = p_id AND state = 'unverified';
  ELSE
    IF p_category IS NULL THEN RAISE EXCEPTION 'Choose a reason.' USING ERRCODE = '23514'; END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'Explain the reason in a sentence (at least 10 characters).' USING ERRCODE = '23514';
    END IF;
    UPDATE public.self_reported_certificates SET state = 'removed', removed_reason_category = p_category, removed_reason = btrim(p_reason)
    WHERE id = p_id AND state IN ('unverified', 'verified');
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Certification not found, already reviewed, or you don’t have permission.' USING ERRCODE = '42501'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_certificate(uuid, date, public.certificate_format, text, boolean, int, text),
  public.remove_certificate(uuid, text, text), public.restore_certificate(uuid),
  public.review_self_reported(uuid, boolean, text, text) TO authenticated;

-- ── Permission keys (Story 10.15) ───────────────────────────────────────────
INSERT INTO public.permission_catalog (key, label, description, category, display_order, restricted_to) VALUES
  ('certifications.types.view',          'View certification types',          'See the list of certification types.',                         'Certifications', 101, NULL),
  ('certifications.types.manage',        'Manage certification types',        'Create and edit certification types and their codes.',         'Certifications', 102, 'super_admin'),
  ('certifications.types.retire',        'Retire certification types',        'Retire and reactivate types, and choose what happens to holders.', 'Certifications', 103, 'super_admin'),
  ('certifications.design.manage',       'Design digital certificates',       'Create and edit digital certificate designs.',                 'Certifications', 104, 'super_admin'),
  ('certifications.award',               'Add official certificates',         'Add and renew official certificates.',                         'Certifications', 105, NULL),
  ('certifications.official.edit',       'Edit official certificates',        'Correct official certificates, with a reason.',                'Certifications', 106, NULL),
  ('certifications.official.remove',     'Remove official certificates',      'Remove official certificates, with a reason.',                 'Certifications', 107, NULL),
  ('certifications.attachments.manage',  'Manage certificate attachments',    'Upload or replace certificate attachments.',                   'Certifications', 108, NULL),
  ('certifications.digital.generate',    'Generate digital certificates',     'Generate and re-issue digital certificate PDFs.',              'Certifications', 109, NULL),
  ('certifications.self.manage',         'Add own certifications',            'Add and edit their own self-reported certifications.',         'Certifications', 110, NULL),
  ('certifications.review.view',         'See the review queue',              'See self-reported certifications waiting for review.',         'Certifications', 111, NULL),
  ('certifications.review.verify',       'Verify self-reported certifications', 'Mark self-reported certifications as verified.',            'Certifications', 112, NULL),
  ('certifications.review.remove',       'Remove self-reported certifications', 'Remove self-reported certifications, with a reason.',       'Certifications', 113, NULL),
  ('certifications.journey.view',        'View certification journeys',       'See a person’s full certification history.',                   'Certifications', 114, NULL)
ON CONFLICT (key) DO NOTHING;

-- Role defaults. Champions act only on Gatekeepers in their own club (cert_in_scope).
-- Gatekeepers always see their own journey, so they need no journey key.
INSERT INTO public.permissions (role, permission, is_enabled)
SELECT r.role::public.user_role, k.key, k.key = ANY (r.enabled)
FROM (VALUES
  ('champion', ARRAY['certifications.types.view', 'certifications.award', 'certifications.official.edit', 'certifications.official.remove',
                     'certifications.attachments.manage', 'certifications.digital.generate', 'certifications.self.manage',
                     'certifications.review.view', 'certifications.review.verify', 'certifications.review.remove', 'certifications.journey.view']),
  ('gatekeeper', ARRAY['certifications.self.manage'])
) AS r(role, enabled)
CROSS JOIN public.permission_catalog k
WHERE k.category = 'Certifications'
  AND NOT (k.restricted_to = 'super_admin' AND k.key = ANY (r.enabled))
ON CONFLICT (role, permission) DO NOTHING;

-- ── Move the existing QPR dates (Story 10.17) ──────────────────────────────
INSERT INTO public.certification_types (name, code, description, issuing_body, validity_value, validity_unit, offered_from, created_from_existing)
VALUES ('QPR', 'QPR', 'Question, Persuade, Refer — suicide prevention gatekeeper training.', 'QPR Institute', 3, 'years',
        coalesce((SELECT min(qpr_certification_date) FROM public.profiles), public.sl_today()), true);

INSERT INTO public.certificates (holder_id, type_id, achieved_on, format, migrated)
SELECT p.id, t.id, p.qpr_certification_date, 'physical', true
FROM public.profiles p CROSS JOIN public.certification_types t
WHERE t.code = 'QPR' AND p.qpr_certification_date IS NOT NULL;

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
SELECT NULL, 'certification.migrated', 'certification_type', t.id,
  jsonb_build_object('subject', 'QPR', 'actor', 'System (migration)', 'certificates', (SELECT count(*) FROM public.certificates WHERE type_id = t.id),
    'note', 'Created from the existing QPR certification dates')
FROM public.certification_types t WHERE t.code = 'QPR';
