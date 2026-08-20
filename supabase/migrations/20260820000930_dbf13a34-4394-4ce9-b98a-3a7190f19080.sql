UPDATE public.products p
SET state = upper(substring(p.name from '^([A-Za-z]{2}) '))
WHERE p.name ~ '^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY) '
  AND (p.state IS NULL OR upper(p.state) <> upper(substring(p.name from '^([A-Za-z]{2}) ')));

INSERT INTO public.product_states (product_id, state)
SELECT p.id, p.state
FROM public.products p
WHERE p.state IS NOT NULL
  AND p.name ~ '^(AZ|CA|CO|MA|MD|MI|MO|NJ|NM|NV|NY|OH|OR|PA|WA|WV) '
  AND NOT EXISTS (
    SELECT 1 FROM public.product_states ps WHERE ps.product_id = p.id AND ps.state = p.state
  );