-- Certification types: the programme period (Offered from / Offered until), kept
-- separate from retirement (manual testing fixes, Nov 2026).
--
-- Before: "Offered until" was the open retirement's date (certification_type_statuses
-- worked it out), so setting it scheduled a retirement. Now:
--   • certification_types.offered_until is a real, optional date: the last day of the
--     programme. It only stops NEW awards: a new certificate's date achieved must fall
--     within the period, and none can be added once Offered until has passed. Existing
--     and migrated certificates are never re-checked, stopped or expired by it.
--   • Retiring a type (with its keep/stop choice) stays a separate action; the view
--     now calls the open retirement's date retire_on.
--   • Once any certificate of a type exists (any status, removed included), its code
--     and Offered from can't change, and Offered until can't be earlier than the latest
--     date achieved on one of its certificates.
--   • Every type change is recorded in the audit history with before/after values.
--
-- Safe for the live site: no released screen reads certification types yet. Existing
-- types get offered_until = NULL (no end date); their retirements are unchanged.

-- ── Column ──────────────────────────────────────────────────────────────────
ALTER TABLE public.certification_types ADD COLUMN offered_until date;
ALTER TABLE public.certification_types ADD CONSTRAINT certification_types_programme_period
  CHECK (offered_until IS NULL OR offered_until >= offered_from);

-- ── View: the retirement date is retire_on; offered_until comes from the type ─
DROP VIEW public.certification_type_statuses;
CREATE VIEW public.certification_type_statuses WITH (security_invoker = true) AS
SELECT t.*,
  CASE
    WHEN public.cert_type_retired(t.id) THEN 'retired'
    WHEN open.retire_on IS NOT NULL THEN 'retiring'
    ELSE 'active'
  END AS status,
  open.id         AS open_retirement_id,
  open.retire_on  AS retire_on,
  open.option     AS retirement_option,
  (SELECT max(r.reactivated_on) FROM public.certification_type_retirements r
     WHERE r.type_id = t.id AND r.reactivated_on > public.sl_today()) AS returns_on
FROM public.certification_types t
LEFT JOIN public.certification_type_retirements open ON open.type_id = t.id AND open.reactivated_on IS NULL;
GRANT SELECT ON public.certification_type_statuses TO authenticated;

-- ── Type rules ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_types_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_issued boolean; v_latest date;
BEGIN
  NEW.code := upper(btrim(NEW.code));
  NEW.name := btrim(NEW.name);
  IF NEW.offered_until IS NOT NULL AND NEW.offered_until < NEW.offered_from THEN
    RAISE EXCEPTION 'Offered until must be on or after Offered from.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.cert_is_system() THEN NEW.created_by := auth.uid(); NEW.created_from_existing := false; END IF;
  ELSE
    v_issued := EXISTS (SELECT 1 FROM public.certificates WHERE type_id = OLD.id);
    IF v_issued AND NEW.code <> OLD.code THEN
      RAISE EXCEPTION 'The code can’t be changed because certificates have already been issued. It’s part of every certificate number.' USING ERRCODE = '23514';
    END IF;
    IF v_issued AND NEW.offered_from <> OLD.offered_from THEN
      RAISE EXCEPTION 'Offered from can’t be changed because certificates have already been issued.' USING ERRCODE = '23514';
    END IF;
    IF NEW.offered_until IS NOT NULL AND NEW.offered_until IS DISTINCT FROM OLD.offered_until THEN
      SELECT max(achieved_on) INTO v_latest FROM public.certificates WHERE type_id = OLD.id;
      IF v_latest IS NOT NULL AND NEW.offered_until < v_latest THEN
        RAISE EXCEPTION 'Offered until can’t be earlier than %, the latest date achieved on a certificate of this type.', to_char(v_latest, 'FMDD Mon YYYY') USING ERRCODE = '23514';
      END IF;
    END IF;
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at; NEW.created_from_existing := OLD.created_from_existing;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Audit: what the type is now, plus (on edit) each changed field's before and after.
-- Saving with nothing changed writes no entry.
CREATE OR REPLACE FUNCTION public.cert_validity_text(p_value int, p_unit public.validity_unit)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_value IS NULL THEN 'lifetime' ELSE p_value || ' ' || p_unit END
$$;

CREATE OR REPLACE FUNCTION public.cert_types_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changes jsonb := '{}'::jsonb;
  v_new_validity text := public.cert_validity_text(NEW.validity_value, NEW.validity_unit);
  v_old_validity text;
BEGIN
  IF public.cert_is_system() AND NEW.created_from_existing THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old_validity := public.cert_validity_text(OLD.validity_value, OLD.validity_unit);
    IF NEW.name IS DISTINCT FROM OLD.name THEN v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', OLD.name, 'to', NEW.name)); END IF;
    IF NEW.code IS DISTINCT FROM OLD.code THEN v_changes := v_changes || jsonb_build_object('code', jsonb_build_object('from', OLD.code, 'to', NEW.code)); END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', OLD.description, 'to', NEW.description)); END IF;
    IF NEW.issuing_body IS DISTINCT FROM OLD.issuing_body THEN v_changes := v_changes || jsonb_build_object('issuing_body', jsonb_build_object('from', OLD.issuing_body, 'to', NEW.issuing_body)); END IF;
    IF v_new_validity IS DISTINCT FROM v_old_validity THEN v_changes := v_changes || jsonb_build_object('validity', jsonb_build_object('from', v_old_validity, 'to', v_new_validity)); END IF;
    IF NEW.offered_from IS DISTINCT FROM OLD.offered_from THEN v_changes := v_changes || jsonb_build_object('offered_from', jsonb_build_object('from', OLD.offered_from, 'to', NEW.offered_from)); END IF;
    IF NEW.offered_until IS DISTINCT FROM OLD.offered_until THEN v_changes := v_changes || jsonb_build_object('offered_until', jsonb_build_object('from', OLD.offered_until, 'to', NEW.offered_until)); END IF;
    IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.cert_audit(CASE TG_OP WHEN 'INSERT' THEN 'type_created' ELSE 'type_edited' END, 'certification_type', NEW.id,
    jsonb_build_object('subject', NEW.name, 'code', NEW.code, 'validity', v_new_validity,
      'offered_from', NEW.offered_from, 'offered_until', NEW.offered_until)
    || CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('changes', v_changes) ELSE '{}'::jsonb END);
  RETURN NEW;
END;
$$;

-- ── New awards must fall within the programme period ────────────────────────
-- A separate trigger, named to run after trg_certificates_before (triggers fire in
-- name order), so it sees the row after that trigger has filled it in. Inserts only:
-- edits, migrated certificates and the old QPR form's copies are never re-checked.
CREATE OR REPLACE FUNCTION public.certificates_programme_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type public.certification_types;
BEGIN
  IF public.cert_legacy() OR (public.cert_is_system() AND NEW.migrated) THEN RETURN NEW; END IF;
  SELECT * INTO v_type FROM public.certification_types WHERE id = NEW.type_id;
  IF v_type.offered_until IS NOT NULL THEN
    IF NEW.achieved_on > v_type.offered_until THEN
      RAISE EXCEPTION '% was only offered until %, so the date achieved can’t be after that.', v_type.name, to_char(v_type.offered_until, 'FMDD Mon YYYY') USING ERRCODE = '23514';
    END IF;
    IF public.sl_today() > v_type.offered_until THEN
      RAISE EXCEPTION '% stopped being offered on %, so no new certificates of it can be added.', v_type.name, to_char(v_type.offered_until, 'FMDD Mon YYYY') USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_certificates_programme_period BEFORE INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.certificates_programme_period();
