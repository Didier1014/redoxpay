
-- Add api_key column to profiles
ALTER TABLE public.profiles ADD COLUMN api_key TEXT UNIQUE;

-- Generate API keys for existing rows
CREATE OR REPLACE FUNCTION public.gen_api_key() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT 'rdx_live_' || encode(gen_random_bytes(32), 'hex') $$;

UPDATE public.profiles SET api_key = public.gen_api_key() WHERE api_key IS NULL;

-- Make api_key NOT NULL after backfill
ALTER TABLE public.profiles ALTER COLUMN api_key SET NOT NULL;

-- Auto-generate api_key for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name, api_key)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    COALESCE(NEW.raw_user_meta_data->>'business_name',''),
    public.gen_api_key()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
