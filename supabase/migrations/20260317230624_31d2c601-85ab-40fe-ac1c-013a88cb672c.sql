
-- Move 12 2G artwork files from MO Sleeves 1G products to MO Sleeves 2G products
-- by updating artwork_files.sku from 1G item_ids to 2G item_ids

-- Acapulco Gold 2G: VB-40075 → VB-49336
UPDATE artwork_files SET sku = 'VB-49336' WHERE id = '651de8da-f71b-4b57-9d18-385def94aed4';

-- Notorious THC 2G: VB-13733 → VB-63427
UPDATE artwork_files SET sku = 'VB-63427' WHERE id = '2bd1fc40-066b-4982-8a56-f2223ef757a3';

-- Stoopid Gas 2G: VB-67071 → VB-55740
UPDATE artwork_files SET sku = 'VB-55740' WHERE id = 'dbeb07f0-c977-41bf-a2ca-7ec180d75605';

-- Baja Blazed 2G: VB-67534 → VB-82697
UPDATE artwork_files SET sku = 'VB-82697' WHERE id = '98296468-ac39-4f97-87fe-2fb8dca2fe79';

-- Galactic Grape 2G: VB-52815 → VB-22915
UPDATE artwork_files SET sku = 'VB-22915' WHERE id = '13bec29d-1bff-4c66-a1bd-716835bb9479';

-- Lemon Loopz 2G: VB-62756 → VB-70020
UPDATE artwork_files SET sku = 'VB-70020' WHERE id = '481fcecd-df77-415f-bd82-b02dac9e185a';

-- Rainbow Cloud 2G: VB-69748 → VB-42167
UPDATE artwork_files SET sku = 'VB-42167' WHERE id = '25de35a5-5290-42ad-95f2-51856d980e42';

-- Swirly Temple 2G: VB-85307 → VB-57624
UPDATE artwork_files SET sku = 'VB-57624' WHERE id = 'a2d13a46-e364-4ccd-9ef7-2ad2645cbe51';

-- Wild Watermelon 2G: VB-98227 → VB-78936
UPDATE artwork_files SET sku = 'VB-78936' WHERE id = 'a82a9d5c-9ad9-4680-973d-f89a2db2be28';

-- Maui Pineapple 2G: VB-19463 → VB-62397
UPDATE artwork_files SET sku = 'VB-62397' WHERE id = '79479ca7-8f5b-4270-9643-a267559a2e84';

-- Blue Dream 2G: VB-36664 → VB-16130
UPDATE artwork_files SET sku = 'VB-16130' WHERE id = 'd2959664-c125-457a-ae9c-7f93b27fa36a';

-- Granddaddy Purple 2G: VB-60083 → VB-85481
UPDATE artwork_files SET sku = 'VB-85481' WHERE id = '4a3e9565-f3f2-44a1-aff5-caa5f684c94e';
