-- M3 Track B — community moderation (reports + author profiles + publish audit)
-- Recipes table already has visibility + partial public index (schema migration).

-- ---------------------------------------------------------------------------
-- Recipe reports (user-flagged content)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recipe_reports (
  id            text PRIMARY KEY,
  recipe_id     text NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  reporter_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason        text NOT NULL
                  CHECK (reason IN (
                    'spam',
                    'copyright',
                    'unsafe',
                    'offensive',
                    'misinformation',
                    'other'
                  )),
  details       text,
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewer_id   uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS recipe_reports_recipe_idx
  ON public.recipe_reports (recipe_id);

CREATE INDEX IF NOT EXISTS recipe_reports_status_idx
  ON public.recipe_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS recipe_reports_reporter_idx
  ON public.recipe_reports (reporter_id, created_at DESC);

-- One open report per user per recipe
CREATE UNIQUE INDEX IF NOT EXISTS recipe_reports_open_unique
  ON public.recipe_reports (recipe_id, reporter_id)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Author profiles (public display for community)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_profiles (
  user_id       uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  bio           text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Publish events (rate-limit audit trail; client also throttles)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recipe_publish_events (
  id            text PRIMARY KEY,
  recipe_id     text NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('publish', 'unpublish')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_publish_events_author_idx
  ON public.recipe_publish_events (author_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.recipe_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_publish_events ENABLE ROW LEVEL SECURITY;

-- Reports: anyone authenticated can insert their own; read own reports.
-- Moderators (service role) read all via bypass.

DROP POLICY IF EXISTS recipe_reports_select ON public.recipe_reports;
CREATE POLICY recipe_reports_select ON public.recipe_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS recipe_reports_insert ON public.recipe_reports;
CREATE POLICY recipe_reports_insert ON public.recipe_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Author profiles: public read; owner write.

DROP POLICY IF EXISTS author_profiles_select ON public.author_profiles;
CREATE POLICY author_profiles_select ON public.author_profiles
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS author_profiles_insert ON public.author_profiles;
CREATE POLICY author_profiles_insert ON public.author_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS author_profiles_update ON public.author_profiles;
CREATE POLICY author_profiles_update ON public.author_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Publish events: author reads own; insert own.

DROP POLICY IF EXISTS recipe_publish_events_select ON public.recipe_publish_events;
CREATE POLICY recipe_publish_events_select ON public.recipe_publish_events
  FOR SELECT TO authenticated
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS recipe_publish_events_insert ON public.recipe_publish_events;
CREATE POLICY recipe_publish_events_insert ON public.recipe_publish_events
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
