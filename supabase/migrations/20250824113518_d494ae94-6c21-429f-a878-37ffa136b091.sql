-- SECURITY FIX: Donations table policies (preventing financial data theft)

-- Drop existing conflicting donations policies
DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;
DROP POLICY IF EXISTS "Public donations viewable anonymously" ON public.donations;
DROP POLICY IF EXISTS "System can create donations" ON public.donations;

-- Create consolidated, secure donations policies
CREATE POLICY "donations_owner_access" ON public.donations
  FOR SELECT USING (
    auth.uid() = user_id OR 
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "donations_admin_audited_access" ON public.donations
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND public.audit_admin_data_access(auth.uid(), user_id, 'financial_data', 'donation_review')
  );

CREATE POLICY "donations_system_insert" ON public.donations
  FOR INSERT WITH CHECK (true);