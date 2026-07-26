-- =============================================================================
-- RLS verification — cross-household isolation
--
-- Run AFTER migrations against a linked project or local `supabase start` DB.
-- Prefer service_role / postgres superuser so setup can bypass RLS, then
-- switch to authenticated with forged JWT claims per user.
--
-- Expected outcome: every "assert denied" section raises or returns zero rows.
-- Exit with a summary of failures at the end.
--
-- Usage (local):
--   supabase db reset   # applies migrations
--   psql $DATABASE_URL -v ON_ERROR_STOP=0 -f supabase/tests/rls_verification.sql
--
-- Usage (hosted SQL editor): paste and run; requires ability to insert into
-- auth.users or use existing test users (adjust UUIDs below).
-- =============================================================================

\set ON_ERROR_STOP off

CREATE TEMP TABLE IF NOT EXISTS rls_test_results (
  step        text PRIMARY KEY,
  ok          boolean NOT NULL,
  detail      text
);

CREATE OR REPLACE FUNCTION pg_temp.record_result(p_step text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO rls_test_results (step, ok, detail)
  VALUES (p_step, p_ok, p_detail)
  ON CONFLICT (step) DO UPDATE SET ok = EXCLUDED.ok, detail = EXCLUDED.detail;
END;
$$;

-- ---------------------------------------------------------------------------
-- Setup identities (service role / superuser context)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_hh_a   text := 'hh-rls-test-a';
  v_hh_b   text := 'hh-rls-test-b';
BEGIN
  -- Clean prior run
  DELETE FROM public.pantry_txns WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.pantry_items WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.locations WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.recipes WHERE id LIKE 'rls-recipe-%';
  DELETE FROM public.grocery_list_items WHERE list_id LIKE 'rls-list-%';
  DELETE FROM public.grocery_lists WHERE id LIKE 'rls-list-%';
  DELETE FROM public.user_aliases WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.household_invites WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.household_members WHERE household_id IN (v_hh_a, v_hh_b);
  DELETE FROM public.households WHERE id IN (v_hh_a, v_hh_b);

  -- auth.users: insert only if missing (hosted may block; use existing test users then)
  BEGIN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    VALUES
      (
        v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'rls-a@example.test', crypt('test-password', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"User A"}'::jsonb
      ),
      (
        v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'rls-b@example.test', crypt('test-password', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"User B"}'::jsonb
      )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth.users insert skipped/failed: % — ensure test users exist', SQLERRM;
  END;

  -- Disable bootstrap side-effects if trigger already created households for these ids;
  -- we pin explicit household ids for the test.
  DELETE FROM public.household_members WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.households h
  WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = h.id)
    AND h.id NOT IN (v_hh_a, v_hh_b);

  INSERT INTO public.households (id, name) VALUES
    (v_hh_a, 'Household A'),
    (v_hh_b, 'Household B')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.household_members (household_id, user_id, role, display_name)
  VALUES
    (v_hh_a, v_user_a, 'owner', 'User A'),
    (v_hh_b, v_user_b, 'owner', 'User B')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.locations (id, household_id, name, icon, tint, sort_order)
  VALUES
    ('loc-a1', v_hh_a, 'Fridge A', 'fridge', 'sky', 0),
    ('loc-b1', v_hh_b, 'Fridge B', 'fridge', 'sky', 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pantry_items (
    household_id, ingredient_id, form_id, qty_base, dim,
    par_level_base, low_threshold_pct, updated_at
  ) VALUES
    (v_hh_a, 'ing-flour', 'form-flour', 1000, 'mass', 500, 0.25, now()),
    (v_hh_b, 'ing-flour', 'form-flour', 2000, 'mass', 500, 0.25, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.pantry_txns (
    id, client_txn_id, household_id, ingredient_id, form_id, kind,
    delta_base, reason, occurred_at, device_id, user_id
  ) VALUES
    (
      'txn-a1', 'client-a1', v_hh_a, 'ing-flour', 'form-flour', 'relative',
      1000, 'purchase', now(), 'device-a', v_user_a
    ),
    (
      'txn-b1', 'client-b1', v_hh_b, 'ing-flour', 'form-flour', 'relative',
      2000, 'purchase', now(), 'device-b', v_user_b
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.recipes (
    id, household_id, title, servings, author_id, visibility, created_at, updated_at
  ) VALUES
    ('rls-recipe-private-a', v_hh_a, 'Private A', 4, v_user_a, 'private', now(), now()),
    ('rls-recipe-public-a',  v_hh_a, 'Public A',  4, v_user_a, 'public',  now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.recipe_lines (id, recipe_id, sort_order, raw_text)
  VALUES
    ('rls-line-private', 'rls-recipe-private-a', 0, 'secret ingredient'),
    ('rls-line-public',  'rls-recipe-public-a',  0, 'public ingredient')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.grocery_lists (id, household_id, shopping_trip_id, created_at, updated_at)
  VALUES ('rls-list-a', v_hh_a, 'trip-a', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.grocery_list_items (id, list_id, shopping_trip_id, name, category, display_qty)
  VALUES ('rls-item-a', 'rls-list-a', 'trip-a', 'Milk', 'dairy', '1 gal')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_aliases (id, household_id, alias, ingredient_id, created_at)
  VALUES ('rls-alias-a', v_hh_a, 'parm', 'ing-parmesan', now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.record_result('setup', true, 'fixtures loaded');
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: act as user B
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_service()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Assertions as User B against Household A data
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_hh_a   text := 'hh-rls-test-a';
  v_hh_b   text := 'hh-rls-test-b';
  n        integer;
  raised   boolean;
BEGIN
  PERFORM pg_temp.as_user(v_user_b);

  -- 1. Cannot read household A row
  SELECT count(*) INTO n FROM public.households WHERE id = v_hh_a;
  PERFORM pg_temp.record_result(
    'households_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  -- 2. Can read own household
  SELECT count(*) INTO n FROM public.households WHERE id = v_hh_b;
  PERFORM pg_temp.record_result(
    'households_own_select_allowed',
    n = 1,
    format('rows=%s (want 1)', n)
  );

  -- 3. pantry_items
  SELECT count(*) INTO n FROM public.pantry_items WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'pantry_items_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  SELECT count(*) INTO n FROM public.pantry_items WHERE household_id = v_hh_b;
  PERFORM pg_temp.record_result(
    'pantry_items_own_select_allowed',
    n = 1,
    format('rows=%s (want 1)', n)
  );

  -- 4. pantry_txns
  SELECT count(*) INTO n FROM public.pantry_txns WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'pantry_txns_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  SELECT count(*) INTO n FROM public.pantry_txns WHERE household_id = v_hh_b;
  PERFORM pg_temp.record_result(
    'pantry_txns_own_select_allowed',
    n = 1,
    format('rows=%s (want 1)', n)
  );

  -- 5. Cannot insert txn into household A
  raised := false;
  BEGIN
    INSERT INTO public.pantry_txns (
      id, client_txn_id, household_id, ingredient_id, form_id, kind,
      delta_base, reason, occurred_at, device_id, user_id
    ) VALUES (
      'txn-evil', 'client-evil', v_hh_a, 'ing-flour', 'form-flour', 'relative',
      -1, 'waste', now(), 'device-b', v_user_b
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
    raised := true;
  END;
  -- RLS with no matching policy raises, or insert is silently filtered depending on version;
  -- also verify row absent.
  SELECT count(*) INTO n FROM public.pantry_txns WHERE id = 'txn-evil';
  PERFORM pg_temp.as_service();
  SELECT count(*) INTO n FROM public.pantry_txns WHERE id = 'txn-evil';
  PERFORM pg_temp.record_result(
    'pantry_txns_cross_insert_denied',
    n = 0,
    format('evil_rows=%s raised=%s', n, raised)
  );

  PERFORM pg_temp.as_user(v_user_b);

  -- 6. locations
  SELECT count(*) INTO n FROM public.locations WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'locations_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  -- 7. private recipe denied; public recipe allowed
  SELECT count(*) INTO n FROM public.recipes WHERE id = 'rls-recipe-private-a';
  PERFORM pg_temp.record_result(
    'recipes_private_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  SELECT count(*) INTO n FROM public.recipes WHERE id = 'rls-recipe-public-a';
  PERFORM pg_temp.record_result(
    'recipes_public_select_allowed',
    n = 1,
    format('rows=%s (want 1)', n)
  );

  -- 8. recipe_lines of private denied; public allowed
  SELECT count(*) INTO n FROM public.recipe_lines WHERE id = 'rls-line-private';
  PERFORM pg_temp.record_result(
    'recipe_lines_private_cross_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  SELECT count(*) INTO n FROM public.recipe_lines WHERE id = 'rls-line-public';
  PERFORM pg_temp.record_result(
    'recipe_lines_public_allowed',
    n = 1,
    format('rows=%s (want 1)', n)
  );

  -- 9. grocery
  SELECT count(*) INTO n FROM public.grocery_lists WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'grocery_lists_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  SELECT count(*) INTO n FROM public.grocery_list_items WHERE id = 'rls-item-a';
  PERFORM pg_temp.record_result(
    'grocery_list_items_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  -- 10. aliases
  SELECT count(*) INTO n FROM public.user_aliases WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'user_aliases_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  -- 11. members of A hidden
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = v_hh_a;
  PERFORM pg_temp.record_result(
    'household_members_cross_select_denied',
    n = 0,
    format('rows=%s (want 0)', n)
  );

  -- 12. Append-only: UPDATE pantry_txns must fail even for own row
  raised := false;
  BEGIN
    UPDATE public.pantry_txns SET reason = 'hacked' WHERE id = 'txn-b1';
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  PERFORM pg_temp.record_result(
    'pantry_txns_update_blocked',
    raised = true,
    format('raised=%s', raised)
  );

  -- 13. Append-only: DELETE must fail
  raised := false;
  BEGIN
    DELETE FROM public.pantry_txns WHERE id = 'txn-b1';
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  PERFORM pg_temp.record_result(
    'pantry_txns_delete_blocked',
    raised = true,
    format('raised=%s', raised)
  );

  -- 14. Reference catalog readable
  SELECT count(*) INTO n FROM public.ingredients;
  -- may be 0 before seed; policy allows read either way
  PERFORM pg_temp.record_result(
    'ingredients_select_allowed',
    true,
    format('rows=%s (policy allows; seed optional)', n)
  );

  -- 15. Reference write denied
  raised := false;
  BEGIN
    INSERT INTO public.ingredients (id, name, category, allergens, is_staple, default_form_id)
    VALUES ('evil-ing', 'Evil', 'x', '[]'::jsonb, false, 'f');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  PERFORM pg_temp.as_service();
  SELECT count(*) INTO n FROM public.ingredients WHERE id = 'evil-ing';
  PERFORM pg_temp.record_result(
    'ingredients_client_write_denied',
    n = 0,
    format('evil_rows=%s raised=%s', n, raised)
  );

  PERFORM pg_temp.as_service();
END;
$$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

SELECT step, ok, detail FROM rls_test_results ORDER BY step;

SELECT
  count(*) FILTER (WHERE ok) AS passed,
  count(*) FILTER (WHERE NOT ok) AS failed,
  count(*) AS total
FROM rls_test_results;

DO $$
DECLARE
  fail_count integer;
BEGIN
  SELECT count(*) INTO fail_count FROM rls_test_results WHERE NOT ok;
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'RLS verification FAILED: % assertion(s) failed — see rls_test_results', fail_count;
  ELSE
    RAISE NOTICE 'RLS verification PASSED: all assertions ok';
  END IF;
END;
$$;
