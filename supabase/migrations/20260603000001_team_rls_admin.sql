-- Allow admins to read all user_roles rows
-- (needed for the Team page to list all members)
CREATE POLICY "admin can read all roles"
  ON public.user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = auth.uid()
        AND ur2.role = 'admin'
    )
    OR auth.uid() = user_id  -- keep existing self-read
  );

-- Allow admins to read all profiles (needed to show member names)
CREATE POLICY "admin can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Allow admins to delete any user_role (for revoking access)
CREATE POLICY "admin can delete any role"
  ON public.user_roles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );
