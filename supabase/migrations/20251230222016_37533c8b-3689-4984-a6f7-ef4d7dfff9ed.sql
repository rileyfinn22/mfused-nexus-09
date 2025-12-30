-- Add policy allowing users to delete their own company's quotes (non-approved)
CREATE POLICY "Users can delete company quotes"
ON public.quotes
FOR DELETE
USING (
  company_id = get_user_company(auth.uid())
  AND status != 'approved'
);

-- Also add policy for deleting quote items when quote is deleted
CREATE POLICY "Users can delete quote items for their company quotes"
ON public.quote_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM quotes
    WHERE quotes.id = quote_items.quote_id
    AND quotes.company_id = get_user_company(auth.uid())
  )
);