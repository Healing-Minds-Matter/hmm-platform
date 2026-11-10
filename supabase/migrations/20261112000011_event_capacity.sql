-- Follow-up to Security Finding 4 (your decision): when an event has a
-- maximum number of participants, registrations stop once it is full.
-- Registration still closes when the event starts.
--
-- event_registration_refusal() gains the capacity check (used by the
-- registration policy and the trigger), and the trigger locks the event row
-- first, so two people taking the last place at the same moment are handled
-- one after the other and the limit can't be overshot.

CREATE OR REPLACE FUNCTION public.event_registration_refusal(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events;
  v_taken int;
BEGIN
  IF NOT public.is_active_user() OR public.current_user_role() IS DISTINCT FROM 'gatekeeper' THEN
    RETURN 'Only Gatekeepers can register for events.';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL OR NOT public.user_can_see_event(p_event_id) THEN
    RETURN 'This event isn’t open to your club.';
  END IF;
  IF v_event.is_cancelled THEN
    RETURN 'This event has been cancelled.';
  END IF;
  IF v_event.starts_at <= now() THEN
    RETURN 'Registration has closed: this event has already started.';
  END IF;
  IF v_event.max_participants IS NOT NULL THEN
    SELECT count(*) INTO v_taken FROM public.event_registrations WHERE event_id = p_event_id;
    IF v_taken >= v_event.max_participants THEN
      RETURN 'This event is full.';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_event_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal text;
BEGIN
  IF public.cert_is_system() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.gatekeeper_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You can only register yourself.' USING ERRCODE = '42501';
    END IF;
    -- One registration at a time per event, so the capacity check is exact.
    PERFORM 1 FROM public.events WHERE id = NEW.event_id FOR UPDATE;
    v_refusal := public.event_registration_refusal(NEW.event_id);
    IF v_refusal IS NOT NULL THEN
      RAISE EXCEPTION '%', v_refusal USING ERRCODE = '42501';
    END IF;
    NEW.attended := NULL;          -- attendance is never self-reported
    NEW.registered_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE: only attendance, only by a Super Admin or the Gatekeeper's Champion (policies).
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.gatekeeper_id IS DISTINCT FROM OLD.gatekeeper_id OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'Only attendance can be changed on a registration.' USING ERRCODE = '42501';
  END IF;
  IF public.current_user_role() IS DISTINCT FROM 'super_admin' AND public.current_user_role() IS DISTINCT FROM 'champion' THEN
    RAISE EXCEPTION 'Only a Champion or Super Admin can mark attendance.' USING ERRCODE = '42501';
  END IF;
  IF NEW.attended IS DISTINCT FROM OLD.attended THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'event.attendance_marked', 'event', NEW.event_id,
            jsonb_build_object('registration_id', NEW.id, 'gatekeeper_id', NEW.gatekeeper_id, 'from', OLD.attended, 'to', NEW.attended));
  END IF;
  RETURN NEW;
END;
$$;
