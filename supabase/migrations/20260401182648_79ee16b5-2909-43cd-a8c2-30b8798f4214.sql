
-- RLS: Forwarders can read orders in their company
CREATE POLICY "Forwarders can view company orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
        AND user_roles.company_id = orders.company_id
    )
  );

-- RLS: Forwarders can read order_items for orders in their company
CREATE POLICY "Forwarders can view company order items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.user_roles ur ON ur.company_id = o.company_id
      WHERE o.id = order_items.order_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'forwarder'
    )
  );

-- RLS: Forwarders can read shipment_legs for orders in their company
CREATE POLICY "Forwarders can view company shipment legs"
  ON public.shipment_legs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
        AND user_roles.company_id = shipment_legs.company_id
    )
  );

-- RLS: Forwarders can insert shipment_legs
CREATE POLICY "Forwarders can create shipment legs"
  ON public.shipment_legs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
        AND user_roles.company_id = shipment_legs.company_id
    )
  );

-- RLS: Forwarders can update shipment_legs
CREATE POLICY "Forwarders can update shipment legs"
  ON public.shipment_legs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
        AND user_roles.company_id = shipment_legs.company_id
    )
  );

-- RLS: Forwarders can delete shipment_legs
CREATE POLICY "Forwarders can delete shipment legs"
  ON public.shipment_legs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
        AND user_roles.company_id = shipment_legs.company_id
    )
  );

-- RLS: Forwarders can read financed_invoices (to show finance invoice #)
CREATE POLICY "Forwarders can view financed invoices"
  ON public.financed_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
    )
  );

-- RLS: Forwarders can read invoices for their company
CREATE POLICY "Forwarders can view company invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'forwarder'
        AND ur.company_id = invoices.company_id
    )
  );

-- Storage: Forwarders can upload packing lists
CREATE POLICY "Forwarders can upload packing lists"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'packing-lists'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
    )
  );

-- Storage: Forwarders can read packing lists
CREATE POLICY "Forwarders can read packing lists"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'packing-lists'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'forwarder'
    )
  );
