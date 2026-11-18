-- Review Finding 9: permission changes are audited by the database — in the
-- same transaction as the change, only when something actually changed, and
-- with the real caller (auth.uid()) as the actor.
--
-- Before, the server actions wrote the audit entry themselves after their
-- write, without checking that anything had changed: a delete or update that
-- the access rules silently matched to zero rows (anyone who wasn't a Super
-- Admin), or a re-save of the same value, still produced an entry. A trigger
-- only fires for rows that really changed, so that can't happen any more.
--
-- Action names and details are unchanged, so the Permissions → Audit History
-- page keeps working. The actions no longer write these entries themselves.
-- Not covered here (written elsewhere, unchanged): delegations ended because
-- the delegator was deactivated ('role_delegation.ended_delegator_deactivated').

CREATE OR REPLACE FUNCTION public.audit_permission_write(p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_details)
$$;
REVOKE ALL ON FUNCTION public.audit_permission_write(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Role defaults (Story 9.1).
CREATE OR REPLACE FUNCTION public.audit_role_default_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_enabled IS NOT DISTINCT FROM OLD.is_enabled THEN RETURN NULL; END IF;
  PERFORM public.audit_permission_write('permission.role_default_updated', 'permission', NEW.id,
    jsonb_build_object('role', NEW.role, 'permission', NEW.permission,
                       'prior_value', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.is_enabled) ELSE 'null'::jsonb END,
                       'new_value', NEW.is_enabled));
  RETURN NULL;
END;
$$;

-- Individual exceptions (Story 9.2).
CREATE OR REPLACE FUNCTION public.audit_role_override_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.audit_permission_write('permission.individual_exception_revoked', 'role_override', OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'permission', OLD.permission));
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_enabled IS NOT DISTINCT FROM OLD.is_enabled THEN RETURN NULL; END IF;
  PERFORM public.audit_permission_write('permission.individual_exception_granted', 'role_override', NEW.id,
    jsonb_build_object('user_id', NEW.user_id, 'permission', NEW.permission, 'is_enabled', NEW.is_enabled));
  RETURN NULL;
END;
$$;

-- Groups (Story 9.3).
CREATE OR REPLACE FUNCTION public.audit_permission_group_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_permission_write('permission_group.created', 'permission_group', NEW.id, jsonb_build_object('name', NEW.name));
  ELSIF OLD.is_active AND NOT NEW.is_active THEN
    PERFORM public.audit_permission_write('permission_group.archived', 'permission_group', NEW.id, NULL);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_group_member_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_permission_write('permission_group.member_added', 'permission_group', NEW.group_id, jsonb_build_object('user_id', NEW.user_id));
  ELSE
    PERFORM public.audit_permission_write('permission_group.member_removed', 'permission_group', OLD.group_id, jsonb_build_object('user_id', OLD.user_id));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_group_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.group_permissions := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_enabled IS NOT DISTINCT FROM OLD.is_enabled THEN RETURN NULL; END IF;
  PERFORM public.audit_permission_write('permission_group.permission_updated', 'permission_group', v_row.group_id,
    jsonb_build_object('permission', v_row.permission,
                       'prior_value', CASE WHEN TG_OP = 'INSERT' THEN 'null'::jsonb ELSE to_jsonb(OLD.is_enabled) END,
                       'new_setting', CASE WHEN TG_OP = 'DELETE' THEN 'unset' WHEN NEW.is_enabled THEN 'allow' ELSE 'deny' END));
  RETURN NULL;
END;
$$;

-- Delegations (Story 9.4): created, and ended early by a Super Admin.
CREATE OR REPLACE FUNCTION public.audit_role_delegation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_details jsonb := jsonb_build_object('delegator_id', NEW.delegator_id, 'delegate_id', NEW.delegate_id,
                                        'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_permission_write('role_delegation.created', 'role_delegation', NEW.id, v_details);
  ELSIF OLD.ended_early_at IS NULL AND NEW.ended_early_at IS NOT NULL AND NEW.ended_reason = 'manual' THEN
    PERFORM public.audit_permission_write('role_delegation.ended_manually', 'role_delegation', NEW.id, v_details);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_role_default_change(), public.audit_role_override_change(),
  public.audit_permission_group_change(), public.audit_group_member_change(),
  public.audit_group_permission_change(), public.audit_role_delegation_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_permissions_audit ON public.permissions;
CREATE TRIGGER trg_permissions_audit AFTER INSERT OR UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_default_change();
DROP TRIGGER IF EXISTS trg_role_overrides_audit ON public.role_overrides;
CREATE TRIGGER trg_role_overrides_audit AFTER INSERT OR UPDATE OR DELETE ON public.role_overrides
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_override_change();
DROP TRIGGER IF EXISTS trg_permission_groups_audit ON public.permission_groups;
CREATE TRIGGER trg_permission_groups_audit AFTER INSERT OR UPDATE OF is_active ON public.permission_groups
  FOR EACH ROW EXECUTE FUNCTION public.audit_permission_group_change();
DROP TRIGGER IF EXISTS trg_group_members_audit ON public.group_members;
CREATE TRIGGER trg_group_members_audit AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_group_member_change();
DROP TRIGGER IF EXISTS trg_group_permissions_audit ON public.group_permissions;
CREATE TRIGGER trg_group_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON public.group_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_group_permission_change();
DROP TRIGGER IF EXISTS trg_role_delegations_audit ON public.role_delegations;
CREATE TRIGGER trg_role_delegations_audit AFTER INSERT OR UPDATE OF ended_early_at ON public.role_delegations
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_delegation_change();
