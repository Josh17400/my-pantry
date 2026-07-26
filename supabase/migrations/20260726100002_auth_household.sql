-- =============================================================================
-- Auth + household bootstrap + invite path
-- A new signup always gets a household + membership (never orphaned).
-- Second device / partner joins via invite code or email-targeted invite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Default locations seeded with a new household (mirrors local seed defaults)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_locations(p_household_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fridge   text := p_household_id || '-loc-fridge';
  v_pantry   text := p_household_id || '-loc-pantry';
  v_around   text := p_household_id || '-loc-around';
BEGIN
  INSERT INTO public.locations (id, household_id, name, icon, tint, parent_id, sort_order)
  VALUES
    (v_fridge, p_household_id, 'Fridge',            'fridge',  'sky',    NULL,    0),
    (v_pantry, p_household_id, 'Pantry',            'pantry',  'amber',  NULL,    1),
    (v_around, p_household_id, 'Around the House',  'home',    'stone',  NULL,    2),
    (p_household_id || '-loc-spices',  p_household_id, 'Spices',       'spice',  'rose',   v_around, 0),
    (p_household_id || '-loc-tea',     p_household_id, 'Tea & Coffee', 'mug',    'brown',  v_around, 1),
    (p_household_id || '-loc-baking',  p_household_id, 'Baking',       'oven',   'cream',  v_around, 2),
    (p_household_id || '-loc-hh',      p_household_id, 'Household',    'spray',  'slate',  v_around, 3)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_locations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_locations(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Create household + owner membership for a user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_household_for_user(
  p_user_id uuid,
  p_name text DEFAULT 'My household'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id text;
  v_display      text;
BEGIN
  v_household_id := gen_random_uuid()::text;

  SELECT COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'Owner'
  )
  INTO v_display
  FROM auth.users u
  WHERE u.id = p_user_id;

  INSERT INTO public.households (id, name, created_at, updated_at)
  VALUES (v_household_id, COALESCE(NULLIF(trim(p_name), ''), 'My household'), now(), now());

  INSERT INTO public.household_members (household_id, user_id, role, display_name, joined_at)
  VALUES (v_household_id, p_user_id, 'owner', v_display, now());

  PERFORM public.seed_default_locations(v_household_id);

  RETURN v_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household_for_user(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger: every new auth.users row gets a household + membership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_household_for_user(NEW.id, 'My household');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Invite: create a short code (or email-targeted invite)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_household_invite(
  p_household_id text,
  p_email text DEFAULT NULL,
  p_expires_in interval DEFAULT interval '7 days',
  p_max_uses integer DEFAULT 10
)
RETURNS public.household_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.household_invites;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'not a member of household';
  END IF;

  -- 8-char uppercase alphanumeric code (no ambiguous 0/O/1/I)
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.household_invites (
    id, household_id, code, email, created_by, expires_at, max_uses, use_count, created_at
  )
  VALUES (
    gen_random_uuid()::text,
    p_household_id,
    v_code,
    NULLIF(lower(trim(p_email)), ''),
    auth.uid(),
    now() + COALESCE(p_expires_in, interval '7 days'),
    GREATEST(COALESCE(p_max_uses, 10), 1),
    0,
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household_invite(text, text, interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household_invite(text, text, interval, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Invite: redeem code → join household as member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_household_with_code(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite   public.household_invites;
  v_user_email text;
  v_display  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.household_invites
  WHERE code = upper(trim(p_code))
    AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  IF v_invite.use_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'invite has no remaining uses';
  END IF;

  -- Optional email lock: if set, redeeming user must match
  IF v_invite.email IS NOT NULL THEN
    SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = auth.uid();
    IF v_user_email IS DISTINCT FROM lower(v_invite.email) THEN
      RAISE EXCEPTION 'invite is restricted to a different email';
    END IF;
  END IF;

  -- Already a member → idempotent success
  IF public.is_household_member(v_invite.household_id) THEN
    RETURN v_invite.household_id;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'Member'
  )
  INTO v_display
  FROM auth.users u
  WHERE u.id = auth.uid();

  INSERT INTO public.household_members (household_id, user_id, role, display_name, joined_at)
  VALUES (v_invite.household_id, auth.uid(), 'member', v_display, now())
  ON CONFLICT (household_id, user_id) DO NOTHING;

  UPDATE public.household_invites
  SET use_count = use_count + 1
  WHERE id = v_invite.id;

  RETURN v_invite.household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_household_with_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_household_with_code(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Convenience: list my household ids (for client active-household picker)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_household_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_household_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_household_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- Ensure existing auth users (if any at migrate time) get a household.
-- Safe no-op when none exist yet.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.household_members m WHERE m.user_id = u.id
    )
  LOOP
    PERFORM public.create_household_for_user(r.id, 'My household');
  END LOOP;
END;
$$;
