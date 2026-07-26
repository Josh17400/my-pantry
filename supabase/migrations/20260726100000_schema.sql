-- =============================================================================
-- The Good Pantry — M1 schema
-- Mirrors apps/web/src/db/schema.ts (local SQLite) for sync parity.
-- Forward-only plain SQL. Idempotent via IF NOT EXISTS where safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Households (server-only; local uses DEFAULT_HOUSEHOLD_ID until auth)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.households (
  id          text PRIMARY KEY,
  name        text NOT NULL DEFAULT 'My household',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id  text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'member')),
  display_name  text,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS household_members_user_idx
  ON public.household_members (user_id);

-- Invite codes / optional email targeting — multi-user from M1
CREATE TABLE IF NOT EXISTS public.household_invites (
  id            text PRIMARY KEY,
  household_id  text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  code          text NOT NULL,
  email         text,
  created_by    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  max_uses      integer NOT NULL DEFAULT 10 CHECK (max_uses > 0),
  use_count     integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_invites_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS household_invites_household_idx
  ON public.household_invites (household_id);

CREATE INDEX IF NOT EXISTS household_invites_code_idx
  ON public.household_invites (code)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Locations (user-defined, nestable)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.locations (
  id            text PRIMARY KEY,
  household_id  text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name          text NOT NULL,
  icon          text NOT NULL,
  tint          text NOT NULL,
  parent_id     text REFERENCES public.locations (id) ON DELETE SET NULL,
  sort_order    integer NOT NULL
);

CREATE INDEX IF NOT EXISTS locations_household_idx
  ON public.locations (household_id);

CREATE INDEX IF NOT EXISTS locations_parent_idx
  ON public.locations (household_id, parent_id);

-- ---------------------------------------------------------------------------
-- Canonical ingredient catalog (seeded; public read, no client write)
-- Local stores allergens as JSON text; server uses jsonb (same wire shape).
-- is_staple: boolean (local uses integer 0/1).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingredients (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  category         text NOT NULL,
  allergens        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_staple        boolean NOT NULL DEFAULT false,
  default_form_id  text NOT NULL
);

CREATE INDEX IF NOT EXISTS ingredients_name_idx
  ON public.ingredients (name);

CREATE TABLE IF NOT EXISTS public.ingredient_forms (
  id                text PRIMARY KEY,
  ingredient_id     text NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  form              text NOT NULL,
  dim               text NOT NULL CHECK (dim IN ('mass', 'volume', 'count')),
  density_g_per_ml  double precision,
  grams_per_count   double precision,
  uncertainty_pct   double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS ingredient_forms_ingredient_idx
  ON public.ingredient_forms (ingredient_id);

CREATE TABLE IF NOT EXISTS public.conversion_edges (
  from_form_id     text NOT NULL REFERENCES public.ingredient_forms (id) ON DELETE CASCADE,
  to_form_id       text NOT NULL REFERENCES public.ingredient_forms (id) ON DELETE CASCADE,
  factor           double precision NOT NULL,
  uncertainty_pct  double precision NOT NULL,
  source           text NOT NULL,
  one_way          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (from_form_id, to_form_id)
);

CREATE INDEX IF NOT EXISTS conversion_edges_to_idx
  ON public.conversion_edges (to_form_id);

CREATE TABLE IF NOT EXISTS public.package_specs (
  form_id    text NOT NULL REFERENCES public.ingredient_forms (id) ON DELETE CASCADE,
  label      text NOT NULL,
  net_g      double precision NOT NULL,
  drained_g  double precision,
  PRIMARY KEY (form_id, label)
);

CREATE INDEX IF NOT EXISTS package_specs_form_idx
  ON public.package_specs (form_id);

-- ---------------------------------------------------------------------------
-- Pantry projection (cache — ledger is source of truth)
-- Metadata (par, location, thresholds) is LWW on updated_at; qty is fold cache.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pantry_items (
  household_id           text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  ingredient_id          text NOT NULL,
  form_id                text NOT NULL,
  location_id            text,
  qty_base               double precision NOT NULL,
  dim                    text NOT NULL,
  par_level_base         double precision NOT NULL,
  low_threshold_pct      double precision NOT NULL,
  last_verified_at       timestamptz,
  unverified_cook_count  integer NOT NULL DEFAULT 0,
  opened_at              timestamptz,
  expires_at             timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  watermark_cursor       text,
  last_absolute_cursor   text,
  is_negative            boolean NOT NULL DEFAULT false,
  conflict               boolean NOT NULL DEFAULT false,
  PRIMARY KEY (household_id, ingredient_id, form_id)
);

CREATE INDEX IF NOT EXISTS pantry_items_location_idx
  ON public.pantry_items (household_id, location_id);

CREATE INDEX IF NOT EXISTS pantry_items_ingredient_idx
  ON public.pantry_items (household_id, ingredient_id);

CREATE INDEX IF NOT EXISTS pantry_items_updated_idx
  ON public.pantry_items (household_id, updated_at);

-- ---------------------------------------------------------------------------
-- Append-only ledger (pantry_txns) — the important table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pantry_txns (
  id              text PRIMARY KEY,
  client_txn_id   text NOT NULL,
  household_id    text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  ingredient_id   text NOT NULL,
  form_id         text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('relative', 'absolute')),
  -- relative
  delta_base      double precision,
  -- absolute
  target_base     double precision,
  basis_cursor    text,
  reason          text NOT NULL,
  ref_id          text,
  unit_price      double precision,
  -- client clock (fold total-order uses this)
  occurred_at     timestamptz NOT NULL,
  -- server clock — pull cursor; LWW acceptance time
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  device_id       text NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users (id),
  CONSTRAINT pantry_txns_kind_payload CHECK (
    (kind = 'relative' AND delta_base IS NOT NULL)
    OR
    (kind = 'absolute' AND target_base IS NOT NULL)
  )
);

-- SPEC: UNIQUE (household_id, client_txn_id) — replay idempotency
CREATE UNIQUE INDEX IF NOT EXISTS pantry_txn_household_client_uidx
  ON public.pantry_txns (household_id, client_txn_id);

-- SPEC: (household_id, ingredient_id, occurred_at)
CREATE INDEX IF NOT EXISTS pantry_txn_household_ingredient_occurred_idx
  ON public.pantry_txns (household_id, ingredient_id, occurred_at);

-- SPEC: (household_id, accepted_at) — pull cursor
CREATE INDEX IF NOT EXISTS pantry_txn_household_accepted_idx
  ON public.pantry_txns (household_id, accepted_at);

-- Append-only guard: corrections are compensating rows, never edits
CREATE OR REPLACE FUNCTION public.deny_pantry_txn_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pantry_txns is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS pantry_txns_no_update ON public.pantry_txns;
CREATE TRIGGER pantry_txns_no_update
  BEFORE UPDATE ON public.pantry_txns
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_pantry_txn_mutation();

DROP TRIGGER IF EXISTS pantry_txns_no_delete ON public.pantry_txns;
CREATE TRIGGER pantry_txns_no_delete
  BEFORE DELETE ON public.pantry_txns
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_pantry_txn_mutation();

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recipes (
  id            text PRIMARY KEY,
  household_id  text REFERENCES public.households (id) ON DELETE SET NULL,
  title         text NOT NULL,
  servings      double precision NOT NULL,
  yield_note    text,
  prep_min      integer,
  cook_min      integer,
  author_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  visibility    text NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('private', 'household', 'public')),
  forked_from   text,
  tags          jsonb,
  image_url     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipes_household_idx
  ON public.recipes (household_id);

CREATE INDEX IF NOT EXISTS recipes_title_idx
  ON public.recipes (title);

CREATE INDEX IF NOT EXISTS recipes_author_idx
  ON public.recipes (author_id);

CREATE INDEX IF NOT EXISTS recipes_visibility_public_idx
  ON public.recipes (visibility)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS recipes_updated_idx
  ON public.recipes (household_id, updated_at);

CREATE TABLE IF NOT EXISTS public.recipe_lines (
  id                 text PRIMARY KEY,
  recipe_id          text NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  sort_order         integer NOT NULL,
  ingredient_id      text,
  form_id            text,
  raw_text           text NOT NULL,
  qty                double precision,
  unit               text,
  optional           boolean NOT NULL DEFAULT false,
  group_id           text,
  substitutes        jsonb,
  unknown_allergens  boolean NOT NULL DEFAULT false,
  non_quantified     boolean NOT NULL DEFAULT false,
  qty_high           double precision,
  qty_low            double precision,
  is_range           boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS recipe_lines_recipe_idx
  ON public.recipe_lines (recipe_id, sort_order);

CREATE TABLE IF NOT EXISTS public.recipe_steps (
  id            text PRIMARY KEY,
  recipe_id     text NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  sort_order    integer NOT NULL,
  text          text NOT NULL,
  duration_sec  integer,
  timer_label   text
);

CREATE INDEX IF NOT EXISTS recipe_steps_recipe_idx
  ON public.recipe_steps (recipe_id, sort_order);

-- ---------------------------------------------------------------------------
-- Grocery lists
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_lists (
  id                 text PRIMARY KEY,
  household_id       text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  shopping_trip_id   text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_lists_household_idx
  ON public.grocery_lists (household_id);

CREATE INDEX IF NOT EXISTS grocery_lists_trip_idx
  ON public.grocery_lists (shopping_trip_id);

CREATE INDEX IF NOT EXISTS grocery_lists_updated_idx
  ON public.grocery_lists (household_id, updated_at);

CREATE TABLE IF NOT EXISTS public.grocery_list_items (
  id                 text PRIMARY KEY,
  list_id            text NOT NULL REFERENCES public.grocery_lists (id) ON DELETE CASCADE,
  shopping_trip_id   text NOT NULL,
  ingredient_id      text,
  form_id            text,
  name               text NOT NULL,
  category           text NOT NULL,
  qty_base           double precision,
  dim                text,
  display_qty        text NOT NULL,
  sources            jsonb,
  recipe_ids         jsonb,
  checked            boolean NOT NULL DEFAULT false,
  sort_order         integer NOT NULL DEFAULT 0,
  notes              text
);

CREATE INDEX IF NOT EXISTS grocery_list_items_list_idx
  ON public.grocery_list_items (list_id, sort_order);

CREATE INDEX IF NOT EXISTS grocery_list_items_trip_idx
  ON public.grocery_list_items (shopping_trip_id);

-- ---------------------------------------------------------------------------
-- Learned ingredient aliases (household-scoped)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_aliases (
  id             text PRIMARY KEY,
  household_id   text NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  alias          text NOT NULL,
  ingredient_id  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_aliases_household_alias_uidx
  ON public.user_aliases (household_id, alias);

CREATE INDEX IF NOT EXISTS user_aliases_ingredient_idx
  ON public.user_aliases (ingredient_id);

