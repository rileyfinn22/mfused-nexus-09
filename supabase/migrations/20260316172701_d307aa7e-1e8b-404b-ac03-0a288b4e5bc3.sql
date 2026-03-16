-- Fix order_items shipped_quantity back to single shipment values
UPDATE order_items SET shipped_quantity = 8200 WHERE id = '49f65c60-27a7-402e-a30e-b7a52884d036';
UPDATE order_items SET shipped_quantity = 8500 WHERE id = '4de9dd9b-bbae-4ad8-b057-f8d2e9e80d11';

-- Fix blanket invoice total to match the single active child shipment
UPDATE invoices 
SET subtotal = 3022.70, total = 3022.70
WHERE id = '8a061165-bcfc-4bcf-8ee8-b6f6ef3ec61d';
