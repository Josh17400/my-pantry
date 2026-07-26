-- =============================================================================
-- The Good Pantry — RLS on every public table
-- Threat model: user in household B must never read/write household A's data.
-- Reference catalog: public read, no client write (seed via service role).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still filters rows; without GRANT clients get 42501)
-- Supabase projects usually set default privileges; we restate for safety.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Narrow reference tables are public-read only; revoke write for authenticated
-- so even a policy bug cannot open client writes to the catalog.
REVOKE INSERT, UPDATE, DELETE ON public.ingredients FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ingredient_forms FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.conversion_edges FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.package_specs FROM authenticated, anon;

-- Append-only ledger: no UPDATE/DELETE even if a policy were added later
REVOKE UPDATE, DELETE ON public.pantry_txns FROM authenticated, anon;

-- households: no direct client insert (bootstrap/invite are SECURITY DEFINER)
REVOKE INSERT, DELETE ON public.households FROM authenticated, anon;

-- members: insert only via invite RPC
REVOKE INSERT ON public.household_members FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so policies can read members without
-- recursive RLS; search_path pinned to public)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members m
    WHERE m.household_id = p_household_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_owner(p_household_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members m
    WHERE m.household_id = p_household_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
$$;

-- Recipe access: author, household member, or public visibility
CREATE OR REPLACE FUNCTION public.can_read_recipe(p_recipe_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.id = p_recipe_id
      AND (
        r.visibility = 'public'
        OR r.author_id = auth.uid()
        OR (
          r.household_id IS NOT NULL
          AND public.is_household_member(r.household_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_recipe(p_recipe_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.id = p_recipe_id
      AND (
        r.author_id = auth.uid()
        OR (
          r.household_id IS NOT NULL
          AND public.is_household_member(r.household_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_household_member(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_household_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_recipe(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_recipe(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_household_member(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_household_owner(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_read_recipe(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_write_recipe(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_txns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_aliases ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS households_select ON public.households;
CREATE POLICY households_select ON public.households
  FOR SELECT TO authenticated
  USING (public.is_household_member(id));

DROP POLICY IF EXISTS households_update ON public.households;
CREATE POLICY households_update ON public.households
  FOR UPDATE TO authenticated
  USING (public.is_household_owner(id))
  WITH CHECK (public.is_household_owner(id));

-- Inserts happen via SECURITY DEFINER bootstrap / invite functions only.
-- No direct client INSERT policy on households.

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS household_members_select ON public.household_members;
CREATE POLICY household_members_select ON public.household_members
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

-- Members cannot insert themselves except via invite RPC (security definer).
-- Owners may remove members (not themselves if sole owner — enforced in app/RPC).
DROP POLICY IF EXISTS household_members_delete ON public.household_members;
CREATE POLICY household_members_delete ON public.household_members
  FOR DELETE TO authenticated
  USING (
    public.is_household_owner(household_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS household_members_update ON public.household_members;
CREATE POLICY household_members_update ON public.household_members
  FOR UPDATE TO authenticated
  USING (public.is_household_owner(household_id))
  WITH CHECK (public.is_household_owner(household_id));

-- ---------------------------------------------------------------------------
-- household_invites
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS household_invites_select ON public.household_invites;
CREATE POLICY household_invites_select ON public.household_invites
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS household_invites_insert ON public.household_invites;
CREATE POLICY household_invites_insert ON public.household_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS household_invites_update ON public.household_invites;
CREATE POLICY household_invites_update ON public.household_invites
  FOR UPDATE TO authenticated
  USING (public.is_household_owner(household_id) OR created_by = auth.uid())
  WITH CHECK (public.is_household_owner(household_id) OR created_by = auth.uid());

DROP POLICY IF EXISTS household_invites_delete ON public.household_invites;
CREATE POLICY household_invites_delete ON public.household_invites
  FOR DELETE TO authenticated
  USING (public.is_household_owner(household_id) OR created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- locations — household-scoped
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS locations_insert ON public.locations;
CREATE POLICY locations_insert ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS locations_delete ON public.locations;
CREATE POLICY locations_delete ON public.locations
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Reference catalog — public read, no client write
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ingredients_select ON public.ingredients;
CREATE POLICY ingredients_select ON public.ingredients
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS ingredient_forms_select ON public.ingredient_forms;
CREATE POLICY ingredient_forms_select ON public.ingredient_forms
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS conversion_edges_select ON public.conversion_edges;
CREATE POLICY conversion_edges_select ON public.conversion_edges
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS package_specs_select ON public.package_specs;
CREATE POLICY package_specs_select ON public.package_specs
  FOR SELECT TO authenticated, anon
  USING (true);

-- No INSERT/UPDATE/DELETE policies → client writes denied under RLS.
-- Service role bypasses RLS for seed.

-- ---------------------------------------------------------------------------
-- pantry_items — household-scoped
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pantry_items_select ON public.pantry_items;
CREATE POLICY pantry_items_select ON public.pantry_items
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS pantry_items_insert ON public.pantry_items;
CREATE POLICY pantry_items_insert ON public.pantry_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS pantry_items_update ON public.pantry_items;
CREATE POLICY pantry_items_update ON public.pantry_items
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS pantry_items_delete ON public.pantry_items;
CREATE POLICY pantry_items_delete ON public.pantry_items
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- pantry_txns — household-scoped SELECT + INSERT only (append-only)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pantry_txns_select ON public.pantry_txns;
CREATE POLICY pantry_txns_select ON public.pantry_txns
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS pantry_txns_insert ON public.pantry_txns;
CREATE POLICY pantry_txns_insert ON public.pantry_txns
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id)
    AND user_id = auth.uid()
  );

-- No UPDATE/DELETE policies. Triggers also reject mutations.

-- ---------------------------------------------------------------------------
-- recipes — owner R/W + public read where visibility = 'public'
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS recipes_select ON public.recipes;
CREATE POLICY recipes_select ON public.recipes
  FOR SELECT TO authenticated, anon
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (
      household_id IS NOT NULL
      AND public.is_household_member(household_id)
    )
  );

DROP POLICY IF EXISTS recipes_insert ON public.recipes;
CREATE POLICY recipes_insert ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      household_id IS NULL
      OR public.is_household_member(household_id)
    )
  );

DROP POLICY IF EXISTS recipes_update ON public.recipes;
CREATE POLICY recipes_update ON public.recipes
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR (
      household_id IS NOT NULL
      AND public.is_household_member(household_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    OR (
      household_id IS NOT NULL
      AND public.is_household_member(household_id)
    )
  );

DROP POLICY IF EXISTS recipes_delete ON public.recipes;
CREATE POLICY recipes_delete ON public.recipes
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR (
      household_id IS NOT NULL
      AND public.is_household_member(household_id)
    )
  );

-- ---------------------------------------------------------------------------
-- recipe_lines / recipe_steps — inherit parent recipe access
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS recipe_lines_select ON public.recipe_lines;
CREATE POLICY recipe_lines_select ON public.recipe_lines
  FOR SELECT TO authenticated, anon
  USING (public.can_read_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_lines_insert ON public.recipe_lines;
CREATE POLICY recipe_lines_insert ON public.recipe_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_lines_update ON public.recipe_lines;
CREATE POLICY recipe_lines_update ON public.recipe_lines
  FOR UPDATE TO authenticated
  USING (public.can_write_recipe(recipe_id))
  WITH CHECK (public.can_write_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_lines_delete ON public.recipe_lines;
CREATE POLICY recipe_lines_delete ON public.recipe_lines
  FOR DELETE TO authenticated
  USING (public.can_write_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_steps_select ON public.recipe_steps;
CREATE POLICY recipe_steps_select ON public.recipe_steps
  FOR SELECT TO authenticated, anon
  USING (public.can_read_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_steps_insert ON public.recipe_steps;
CREATE POLICY recipe_steps_insert ON public.recipe_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_steps_update ON public.recipe_steps;
CREATE POLICY recipe_steps_update ON public.recipe_steps
  FOR UPDATE TO authenticated
  USING (public.can_write_recipe(recipe_id))
  WITH CHECK (public.can_write_recipe(recipe_id));

DROP POLICY IF EXISTS recipe_steps_delete ON public.recipe_steps;
CREATE POLICY recipe_steps_delete ON public.recipe_steps
  FOR DELETE TO authenticated
  USING (public.can_write_recipe(recipe_id));

-- ---------------------------------------------------------------------------
-- grocery_lists / grocery_list_items
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS grocery_lists_select ON public.grocery_lists;
CREATE POLICY grocery_lists_select ON public.grocery_lists
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS grocery_lists_insert ON public.grocery_lists;
CREATE POLICY grocery_lists_insert ON public.grocery_lists
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS grocery_lists_update ON public.grocery_lists;
CREATE POLICY grocery_lists_update ON public.grocery_lists
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS grocery_lists_delete ON public.grocery_lists;
CREATE POLICY grocery_lists_delete ON public.grocery_lists
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS grocery_list_items_select ON public.grocery_list_items;
CREATE POLICY grocery_list_items_select ON public.grocery_list_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists g
      WHERE g.id = list_id
        AND public.is_household_member(g.household_id)
    )
  );

DROP POLICY IF EXISTS grocery_list_items_insert ON public.grocery_list_items;
CREATE POLICY grocery_list_items_insert ON public.grocery_list_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grocery_lists g
      WHERE g.id = list_id
        AND public.is_household_member(g.household_id)
    )
  );

DROP POLICY IF EXISTS grocery_list_items_update ON public.grocery_list_items;
CREATE POLICY grocery_list_items_update ON public.grocery_list_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists g
      WHERE g.id = list_id
        AND public.is_household_member(g.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grocery_lists g
      WHERE g.id = list_id
        AND public.is_household_member(g.household_id)
    )
  );

DROP POLICY IF EXISTS grocery_list_items_delete ON public.grocery_list_items;
CREATE POLICY grocery_list_items_delete ON public.grocery_list_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_lists g
      WHERE g.id = list_id
        AND public.is_household_member(g.household_id)
    )
  );

-- ---------------------------------------------------------------------------
-- user_aliases — household-scoped
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS user_aliases_select ON public.user_aliases;
CREATE POLICY user_aliases_select ON public.user_aliases
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS user_aliases_insert ON public.user_aliases;
CREATE POLICY user_aliases_insert ON public.user_aliases
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS user_aliases_update ON public.user_aliases;
CREATE POLICY user_aliases_update ON public.user_aliases
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS user_aliases_delete ON public.user_aliases;
CREATE POLICY user_aliases_delete ON public.user_aliases
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));
