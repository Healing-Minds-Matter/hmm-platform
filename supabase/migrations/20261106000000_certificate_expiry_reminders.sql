-- Certificate expiry reminders (Epic 10, Story 10.14 Sc04).
--
-- When an official certificate is 90 days from expiry, and again at 30 days, the
-- holder gets an in-app reminder, and for a Gatekeeper so do their club's Champions.
-- Each reminder is sent once per certificate and expiry date (an edited date that
-- moves the expiry gets fresh reminders). If the first check finds a certificate
-- already inside 30 days, only the 30-day reminder is sent.
--
-- Not sent for: removed, renewed (not current), stopped or expired certificates;
-- inactive holders; types that are retired (they can't be renewed).
--
-- This migration only adds the function and its log; nothing runs on its own.
-- The daily schedule is in 20261106000001_schedule_expiry_reminders.sql, to be run
-- when the feature is released (the database is shared with the live site).

CREATE TABLE public.certificate_reminders (
  certificate_id uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  days           int  NOT NULL CHECK (days IN (90, 30)),
  expires_on     date NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (certificate_id, days, expires_on)
);
ALTER TABLE public.certificate_reminders ENABLE ROW LEVEL SECURITY;
-- Written only by the reminder function (SECURITY DEFINER); Super Admins may read the log.
CREATE POLICY "certificate_reminders: super admin read" ON public.certificate_reminders FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

-- p_holder: limit to one person (for testing). Returns the number of reminders sent.
CREATE OR REPLACE FUNCTION public.cert_send_expiry_reminders(p_holder uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_days int;
  v_bucket int;
  v_sent int := 0;
  v_when text;
  v_link jsonb;
  v_champion uuid;
BEGIN
  FOR r IN
    SELECT c.id, c.holder_id, c.expires_on, t.name AS type_name, p.full_name, p.role
    FROM public.certificate_statuses c
    JOIN public.certification_types t ON t.id = c.type_id
    JOIN public.profiles p ON p.id = c.holder_id
    WHERE c.is_current AND c.removed_at IS NULL
      AND c.status IN ('valid', 'expiring_soon')
      AND c.expires_on IS NOT NULL
      AND c.expires_on - public.sl_today() BETWEEN 0 AND 90
      AND p.is_active
      AND NOT public.cert_type_retired(c.type_id)
      AND (p_holder IS NULL OR c.holder_id = p_holder)
  LOOP
    v_days := r.expires_on - public.sl_today();
    v_bucket := CASE WHEN v_days <= 30 THEN 30 ELSE 90 END;
    -- Already sent this one (or, for the 90-day one, the later 30-day one).
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.certificate_reminders cr
                          WHERE cr.certificate_id = r.id AND cr.expires_on = r.expires_on AND cr.days <= v_bucket);
    INSERT INTO public.certificate_reminders (certificate_id, days, expires_on) VALUES (r.id, v_bucket, r.expires_on);

    v_when := to_char(r.expires_on, 'FMDD Mon YYYY') || CASE WHEN v_days = 0 THEN ' (today)' WHEN v_days = 1 THEN ' (tomorrow)' ELSE ' (in ' || v_days || ' days)' END;
    v_link := jsonb_build_object('type', 'certificate', 'id', r.id);
    PERFORM public.cert_notify(r.holder_id, 'certificate_expiring',
      'Your ' || r.type_name || ' certificate expires on ' || v_when || '. '
        || CASE WHEN r.role = 'gatekeeper' THEN 'After the renewal training, your Club Champion records the renewal.'
                ELSE 'After the renewal training, a Super Admin records the renewal.' END,
      v_link);
    v_sent := v_sent + 1;
    IF r.role = 'gatekeeper' THEN
      FOR v_champion IN SELECT public.cert_club_champions(r.holder_id) LOOP
        PERFORM public.cert_notify(v_champion, 'certificate_expiring',
          r.full_name || '''s ' || r.type_name || ' certificate expires on ' || v_when || '.', v_link);
        v_sent := v_sent + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_send_expiry_reminders(uuid) FROM PUBLIC, anon, authenticated;
