-- 1. Lock down profiles privilege escalation (tier, AI usage, renewal timestamps)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.tier_renewed_at IS DISTINCT FROM OLD.tier_renewed_at
       OR NEW.ai_prompts_used_this_month IS DISTINCT FROM OLD.ai_prompts_used_this_month
       OR NEW.ai_month_reset_at IS DISTINCT FROM OLD.ai_month_reset_at THEN
      RAISE EXCEPTION 'Cannot modify subscription tier or AI usage fields from client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. FIFO functions: switch to SECURITY INVOKER and validate ownership; lots RLS enforces access.
CREATE OR REPLACE FUNCTION public.fifo_consume_insects(_owner uuid, _species uuid, _size text, _grams numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  _remaining NUMERIC := _grams;
  _lot RECORD;
  _alloc JSONB := '[]'::jsonb;
  _take NUMERIC;
BEGIN
  IF _owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: _owner must match authenticated user';
  END IF;
  FOR _lot IN
    SELECT * FROM public.lots
    WHERE owner_id = _owner AND kind='insect' AND status='active'
      AND species_id = _species AND mass_grams > 0
    ORDER BY mass_grams ASC
  LOOP
    _take := LEAST(_remaining, _lot.mass_grams);
    UPDATE public.lots SET
      mass_grams = mass_grams - _take,
      status = CASE WHEN _take >= _lot.mass_grams THEN 'finalizado'::lot_status ELSE status END,
      finalized_at = CASE WHEN _take >= _lot.mass_grams THEN now() ELSE finalized_at END
    WHERE id = _lot.id;
    _alloc := _alloc || jsonb_build_object('lot_id', _lot.id, 'qty', _take, 'finalized', _take >= _lot.mass_grams);
    _remaining := _remaining - _take;
    EXIT WHEN _remaining <= 0;
  END LOOP;
  RETURN jsonb_build_object('allocations', _alloc, 'unfulfilled', _remaining);
END; $function$;

CREATE OR REPLACE FUNCTION public.fifo_consume_rodents(_owner uuid, _species uuid, _size text, _qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  _remaining INT := _qty;
  _lot RECORD;
  _alloc JSONB := '[]'::jsonb;
  _take INT;
  _pop INT;
  _rule JSONB;
BEGIN
  IF _owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: _owner must match authenticated user';
  END IF;
  FOR _lot IN
    SELECT l.*, (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) AS pop,
           (CURRENT_DATE - l.started_at) AS age_days
    FROM public.lots l
    WHERE l.owner_id = _owner AND l.kind='rodent' AND l.status='active'
      AND l.species_id = _species
      AND (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) > 0
    ORDER BY (COALESCE(l.males,0)+COALESCE(l.females,0)+COALESCE(l.unsexed,0)) ASC
  LOOP
    SELECT size_rules INTO _rule FROM public.species WHERE id = _species;
    IF _rule IS NULL THEN EXIT; END IF;
    PERFORM 1 FROM jsonb_array_elements(_rule) r
      WHERE r->>'label' = _size
        AND (r->>'min_days')::INT <= _lot.age_days
        AND (r->>'max_days')::INT >= _lot.age_days;
    IF NOT FOUND THEN CONTINUE; END IF;

    _pop := _lot.pop;
    _take := LEAST(_remaining, _pop);

    UPDATE public.lots SET
      unsexed = GREATEST(0, COALESCE(unsexed,0) - LEAST(COALESCE(unsexed,0), _take)),
      males   = GREATEST(0, COALESCE(males,0)   - GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take))),
      females = COALESCE(females,0) - GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take) - LEAST(COALESCE(males,0), GREATEST(0, _take - LEAST(COALESCE(unsexed,0), _take)))),
      status = CASE WHEN _take >= _pop THEN 'finalizado'::lot_status ELSE status END,
      finalized_at = CASE WHEN _take >= _pop THEN now() ELSE finalized_at END
    WHERE id = _lot.id;

    _alloc := _alloc || jsonb_build_object('lot_id', _lot.id, 'qty', _take, 'finalized', _take >= _pop);
    _remaining := _remaining - _take;
    EXIT WHEN _remaining <= 0;
  END LOOP;
  RETURN jsonb_build_object('allocations', _alloc, 'unfulfilled', _remaining);
END; $function$;

-- 3. Fix mutable search_path on tier_rank
ALTER FUNCTION public.tier_rank(public.subscription_tier) SET search_path = public;

-- 4. Revoke EXECUTE on SECURITY DEFINER helper functions from anon/public; keep authenticated where needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_lot_tier_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_client_tier_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_rodents(uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fifo_consume_insects(uuid, uuid, text, numeric) FROM PUBLIC, anon;