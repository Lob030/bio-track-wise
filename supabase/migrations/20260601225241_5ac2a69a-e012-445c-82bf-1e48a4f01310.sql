DROP FUNCTION IF EXISTS public.consume_ai_prompt();

CREATE OR REPLACE FUNCTION public.consume_ai_prompt(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.subscription_tier;
  _used int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'TIER_FORBIDDEN: not authenticated';
  END IF;

  SELECT tier, ai_prompts_used_this_month
    INTO _tier, _used
  FROM public.profiles
  WHERE id = _uid;

  IF _tier IS NULL OR _tier IN ('bronze','silver') THEN
    RAISE EXCEPTION 'TIER_FORBIDDEN: AI assistant requires Gold tier or higher';
  END IF;

  IF _tier = 'gold' AND COALESCE(_used,0) >= 20 THEN
    RAISE EXCEPTION 'AI_LIMIT_REACHED: monthly AI prompt limit reached';
  END IF;

  UPDATE public.profiles
    SET ai_prompts_used_this_month = COALESCE(ai_prompts_used_this_month,0) + 1
  WHERE id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_prompt(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_ai_prompt(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_ai_prompt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_prompt(uuid) TO service_role;