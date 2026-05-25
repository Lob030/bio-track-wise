ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_theme TEXT DEFAULT 'dark-slate';

ALTER TABLE public.profiles
ADD CONSTRAINT valid_theme_check 
CHECK (preferred_theme IN ('dark-slate', 'light', 'cyberpunk', 'forest', 'ocean', 'sunset', 'nord'));
