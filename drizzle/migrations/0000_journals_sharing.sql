CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Untitled journal',
  cover text NOT NULL DEFAULT 'rust',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journals TO authenticated;
GRANT ALL ON public.journals TO service_role;
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journal_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_id, email)
);
GRANT SELECT, INSERT, DELETE ON public.journal_members TO authenticated;
GRANT ALL ON public.journal_members TO service_role;
ALTER TABLE public.journal_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journal_share_links (
  journal_id uuid PRIMARY KEY REFERENCES public.journals(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.journal_share_links TO authenticated;
GRANT ALL ON public.journal_share_links TO service_role;
ALTER TABLE public.journal_share_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journal_pages (
  id text PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  position double precision NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  paper text NOT NULL DEFAULT 'vintage',
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_pages TO authenticated;
GRANT ALL ON public.journal_pages TO service_role;
ALTER TABLE public.journal_pages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journal_items (
  id text PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  page_id text NOT NULL REFERENCES public.journal_pages(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_items TO authenticated;
GRANT ALL ON public.journal_items TO service_role;
ALTER TABLE public.journal_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX journal_items_journal_idx ON public.journal_items(journal_id);
CREATE INDEX journal_pages_journal_idx ON public.journal_pages(journal_id);

CREATE TABLE public.handwriting_profiles (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  glyphs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at bigint NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handwriting_profiles TO authenticated;
GRANT ALL ON public.handwriting_profiles TO service_role;
ALTER TABLE public.handwriting_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

CREATE OR REPLACE FUNCTION public.is_journal_owner(_j uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM journals WHERE id = _j AND owner_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_journal_access(_j uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM journals WHERE id = _j AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM journal_members WHERE journal_id = _j AND email = public.current_email() AND email <> '')
$$;

CREATE OR REPLACE FUNCTION public.shares_journal_with(_other uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _other = auth.uid() OR EXISTS (
    SELECT 1 FROM journals j
    WHERE public.has_journal_access(j.id)
      AND (j.owner_id = _other OR EXISTS (
        SELECT 1 FROM journal_members m JOIN profiles p ON lower(p.email) = m.email
        WHERE m.journal_id = j.id AND p.id = _other))
  )
$$;

CREATE POLICY "profiles readable by self and collaborators" ON public.profiles FOR SELECT TO authenticated USING (public.shares_journal_with(id));
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "journals readable with access" ON public.journals FOR SELECT TO authenticated USING (public.has_journal_access(id));
CREATE POLICY "journals insert own" ON public.journals FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "journals update own" ON public.journals FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "journals delete own" ON public.journals FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "members readable with access" ON public.journal_members FOR SELECT TO authenticated USING (public.has_journal_access(journal_id));
CREATE POLICY "owner adds members" ON public.journal_members FOR INSERT TO authenticated WITH CHECK (public.is_journal_owner(journal_id));
CREATE POLICY "owner or self removes member" ON public.journal_members FOR DELETE TO authenticated USING (public.is_journal_owner(journal_id) OR email = public.current_email());

CREATE POLICY "owner reads link" ON public.journal_share_links FOR SELECT TO authenticated USING (public.is_journal_owner(journal_id));
CREATE POLICY "owner creates link" ON public.journal_share_links FOR INSERT TO authenticated WITH CHECK (public.is_journal_owner(journal_id));
CREATE POLICY "owner removes link" ON public.journal_share_links FOR DELETE TO authenticated USING (public.is_journal_owner(journal_id));

CREATE POLICY "pages access" ON public.journal_pages FOR ALL TO authenticated USING (public.has_journal_access(journal_id)) WITH CHECK (public.has_journal_access(journal_id));
CREATE POLICY "items access" ON public.journal_items FOR ALL TO authenticated USING (public.has_journal_access(journal_id)) WITH CHECK (public.has_journal_access(journal_id));

CREATE POLICY "handwriting readable by owner and collaborators" ON public.handwriting_profiles FOR SELECT TO authenticated USING (public.shares_journal_with(owner_id));
CREATE POLICY "handwriting insert own" ON public.handwriting_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "handwriting update own" ON public.handwriting_profiles FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "handwriting delete own" ON public.handwriting_profiles FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_shared_journal(_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'title', j.title,
    'cover', j.cover,
    'pages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'paper', p.paper,
        'items', coalesce((SELECT jsonb_agg(i.data || jsonb_build_object('id', i.id)) FROM journal_items i WHERE i.page_id = p.id), '[]'::jsonb)
      ) ORDER BY p.position)
      FROM journal_pages p WHERE p.journal_id = j.id), '[]'::jsonb),
    'profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'glyphs', h.glyphs, 'createdAt', h.created_at))
      FROM handwriting_profiles h
      WHERE h.id IN (SELECT i.data ->> 'profileId' FROM journal_items i WHERE i.journal_id = j.id)), '[]'::jsonb)
  )
  FROM journal_share_links s JOIN journals j ON j.id = s.journal_id
  WHERE s.token = _token
$$;
REVOKE ALL ON FUNCTION public.get_shared_journal(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_shared_journal(text) TO anon, authenticated;

ALTER TABLE public.journal_items REPLICA IDENTITY FULL;
ALTER TABLE public.journal_pages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_pages;