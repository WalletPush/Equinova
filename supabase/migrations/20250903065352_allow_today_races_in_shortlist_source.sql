-- Migration: allow 'today_races' in public.shortlist.source while preserving existing allowed values

DO $$
DECLARE
  def text;
  vals text[];
  newvals text[];
  cname text := 'shortlist_source_check';
BEGIN
  -- Get current constraint definition, if any
  SELECT pg_get_constraintdef(oid)
    INTO def
  FROM pg_constraint
  WHERE conname = cname
    AND conrelid = 'public.shortlist'::regclass;

  -- Drop old constraint (if present)
  EXECUTE 'ALTER TABLE public.shortlist DROP CONSTRAINT IF EXISTS ' || quote_ident(cname);

  IF def IS NULL THEN
    -- No previous constraint: create new with minimal allowed set + today_races
    EXECUTE $sql$
      ALTER TABLE public.shortlist
      ADD CONSTRAINT shortlist_source_check
      CHECK (source IN ('today_races'))
    $sql$;
  ELSE
    -- Extract quoted values from existing CHECK (...) using regex and preserve them
    -- Works for definitions like: CHECK ((source IN ('ai_insider','manual'))) or ANY(ARRAY['...'])
    SELECT ARRAY(
      SELECT DISTINCT (regexp_matches(def, '''([^'']+)''', 'g'))[1]
    ) INTO vals;

    -- Ensure 'today_races' is included
    newvals := ARRAY(
      SELECT DISTINCT unnest(vals || ARRAY['today_races'])
    );

    -- Recreate constraint with union of existing values + 'today_races'
    EXECUTE 'ALTER TABLE public.shortlist ADD CONSTRAINT ' || quote_ident(cname) ||
            ' CHECK (source IN (' ||
            (SELECT string_agg(quote_literal(v), ',')
               FROM (SELECT unnest(newvals) AS v ORDER BY v) s) ||
            '))';
  END IF;
END $$;
