$ErrorActionPreference = 'Stop'
$token = (Get-Content "C:\Users\Riley\.claude\admin_token.txt" -Raw).Trim()
$h = @{ "x-admin-token" = $token; "Content-Type" = "application/json" }
$u = "https://spxdyqdygsmzyngrqxni.supabase.co/functions/v1/claude-admin"

function Q($sql) {
  $body = @{ action = "sql"; query = $sql } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri $u -Headers $h -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
  if ($r.body.error) { throw "SQL error: $($r.body.error)" }
  return $r.body.rows
}
function One($sql) { return @(Q $sql)[0] }

$MARK = 'ZZE2E'

Write-Host "=== BASELINE ROW COUNTS ===" -ForegroundColor Cyan
$before = One "select (select count(*) from orders) o, (select count(*) from order_items) oi, (select count(*) from invoices) i, (select count(*) from inventory_allocations) a, (select count(*) from vendor_pos) vp, (select count(*) from vendor_po_items) vpi"
"orders=$($before.o) order_items=$($before.oi) invoices=$($before.i) allocations=$($before.a) vendor_pos=$($before.vp) vendor_po_items=$($before.vpi)"

$company = (One "select id from companies order by name limit 1").id
$vendor  = (One "select id from vendors order by name limit 1").id
if (-not $company -or -not $vendor) { throw "could not resolve company/vendor ids" }
"using company $company / vendor $vendor"

# ---------------------------------------------------------------- scenario builder
# Every scenario: an order for 100 units @ `$1 (=`$100), a vendor PO at `$0.40/unit,
# a blanket invoice, then shipments.
function New-Scenario($name, $ordered, $unitPrice, $vendorCost) {
  # The admin proxy only returns rows for SELECT, so INSERT ... RETURNING gives nothing back.
  # Generate the ids here instead.
  $orderId = [guid]::NewGuid().ToString()
  $poId    = [guid]::NewGuid().ToString()
  $invId   = [guid]::NewGuid().ToString()
  Q @"
insert into orders (id, order_number, company_id, customer_name, shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip, status, subtotal, tax, shipping_cost, total)
values ('$orderId', '$MARK-$name', '$company', 'E2E Test Co', 'E2E', '1 Test St', 'Testville', 'CA', '90001', 'draft', 0, 0, 0, 0)
"@ | Out-Null
  Q @"
insert into order_items (order_id, sku, name, quantity, unit_price, total, shipped_quantity, line_number)
values ('$orderId', '$MARK-SKU', 'E2E widget', $ordered, $unitPrice, $($ordered * $unitPrice), null, 1)
"@ | Out-Null
  Q @"
insert into vendor_pos (id, company_id, order_id, vendor_id, po_number, status, total, shipping_cost)
values ('$poId', '$company', '$orderId', '$vendor', '$MARK-$name', 'draft', 0, 0)
"@ | Out-Null
  Q @"
insert into vendor_po_items (vendor_po_id, sku, name, quantity, unit_cost, total, shipped_quantity)
values ('$poId', '$MARK-SKU', 'E2E widget', $ordered, $vendorCost, $($ordered * $vendorCost), null)
"@ | Out-Null
  Q @"
insert into invoices (id, company_id, order_id, invoice_number, invoice_type, status, subtotal, tax, shipping_cost, total, total_paid, shipment_number)
values ('$invId', '$company', '$orderId', '$MARK-$name', 'full', 'open', $($ordered * $unitPrice), 0, 0, $($ordered * $unitPrice), 0, 1)
"@ | Out-Null
  return [pscustomobject]@{ order = $orderId; po = $poId; blanket = $invId; name = $name }
}

function Ship($s, $qty) {
  Q "update order_items set shipped_quantity = $qty where order_id = '$($s.order)'" | Out-Null
  Q "update vendor_po_items set shipped_quantity = $qty where vendor_po_id = '$($s.po)'" | Out-Null
}

function AddChild($s, $num, $qty, $unitPrice, $shipCost = 0) {
  $itemId = (One "select id from order_items where order_id='$($s.order)' limit 1").id
  $sub = $qty * $unitPrice
  $childId = [guid]::NewGuid().ToString()
  Q @"
insert into invoices (id, company_id, order_id, parent_invoice_id, invoice_number, invoice_type, status, subtotal, tax, shipping_cost, total, total_paid, shipment_number)
values ('$childId', '$company', '$($s.order)', '$($s.blanket)', '$MARK-$($s.name)-0$num', 'partial', 'open', $sub, 0, $shipCost, $($sub + $shipCost), 0, $num)
"@ | Out-Null
  Q "insert into inventory_allocations (order_item_id, invoice_id, quantity_allocated) values ('$itemId', '$childId', $qty)" | Out-Null
  return $childId
}

function Report($s, $label) {
  $b = One "select subtotal, shipping_cost, total, blanket_closed_at from invoices where id='$($s.blanket)'"
  $p = One "select total, final_total from vendor_pos where id='$($s.po)'"
  $kids = @(Q "select invoice_number, total from invoices where parent_invoice_id='$($s.blanket)' and deleted_at is null order by shipment_number")
  $kidsum = ($kids | Measure-Object -Property total -Sum).Sum
  $ks = if ($kids.Count) { " | children " + (($kids | ForEach-Object { "$([math]::Round([decimal]$_.total,2))" }) -join '+') + " = $([math]::Round([decimal]$kidsum,2))" } else { "" }
  $closed = if ($b.blanket_closed_at) { " [FINAL]" } else { "" }
  "  {0,-34} blanket {1,9} (sub {2} ship {3}){4}  PO total {5} final {6}{7}" -f $label, [math]::Round([decimal]$b.total,2), [math]::Round([decimal]$b.subtotal,2), [math]::Round([decimal]$b.shipping_cost,2), $closed, [math]::Round([decimal]$p.total,2), $(if ($null -eq $p.final_total) { 'null' } else { [math]::Round([decimal]$p.final_total,2) }), $ks
}

$scenarios = @()
try {
  Write-Host "`n=== A. BLANKET ONLY (no children) ===" -ForegroundColor Cyan
  foreach ($case in @(@{n='A1-exact'; ship=100}, @{n='A2-overs'; ship=110}, @{n='A3-unders'; ship=80})) {
    $s = New-Scenario $case.n 100 1 0.40; $scenarios += $s
    Write-Host " $($case.n): ordered 100 @ `$1, vendor `$0.40"
    Report $s "at creation"
    Ship $s $case.ship
    Report $s "after shipping $($case.ship)"
    Q "update invoices set blanket_closed_at=now(), status='closed' where id='$($s.blanket)'" | Out-Null
    Report $s "after Finalise"
  }

  Write-Host "`n=== B. WITH CHILD SHIPMENTS ===" -ForegroundColor Cyan
  foreach ($case in @(
      @{n='B1-exact';  ships=@(50,50); freight=@(0,0)},
      @{n='B2-overs';  ships=@(50,60); freight=@(0,0)},
      @{n='B3-unders'; ships=@(50,30); freight=@(0,0)},
      @{n='B4-freight';ships=@(50,50); freight=@(25,15)})) {
    $s = New-Scenario $case.n 100 1 0.40; $scenarios += $s
    Write-Host " $($case.n): ordered 100 @ `$1"
    $cum = 0
    for ($k = 0; $k -lt $case.ships.Count; $k++) {
      $cum += $case.ships[$k]
      Ship $s $cum
      AddChild $s ($k + 2) $case.ships[$k] 1 $case.freight[$k] | Out-Null
      Report $s "after shipment $($k+1) (cum $cum)"
    }
    Q "update invoices set blanket_closed_at=now(), status='closed' where id='$($s.blanket)'" | Out-Null
    Report $s "after Finalise"
  }
}
finally {
  Write-Host "`n=== TEARDOWN ===" -ForegroundColor Yellow
  Q "delete from inventory_allocations where invoice_id in (select id from invoices where invoice_number like '$MARK%')" | Out-Null
  Q "delete from invoices where parent_invoice_id in (select id from invoices where invoice_number like '$MARK%')" | Out-Null
  Q "delete from invoices where invoice_number like '$MARK%'" | Out-Null
  Q "delete from vendor_po_items where vendor_po_id in (select id from vendor_pos where po_number like '$MARK%')" | Out-Null
  Q "delete from vendor_pos where po_number like '$MARK%'" | Out-Null
  Q "delete from order_items where order_id in (select id from orders where order_number like '$MARK%')" | Out-Null
  Q "delete from orders where order_number like '$MARK%'" | Out-Null

  $after = One "select (select count(*) from orders) o, (select count(*) from order_items) oi, (select count(*) from invoices) i, (select count(*) from inventory_allocations) a, (select count(*) from vendor_pos) vp, (select count(*) from vendor_po_items) vpi"
  "orders=$($after.o) order_items=$($after.oi) invoices=$($after.i) allocations=$($after.a) vendor_pos=$($after.vp) vendor_po_items=$($after.vpi)"
  $clean = ($after.o -eq $before.o) -and ($after.oi -eq $before.oi) -and ($after.i -eq $before.i) -and ($after.a -eq $before.a) -and ($after.vp -eq $before.vp) -and ($after.vpi -eq $before.vpi)
  if ($clean) { Write-Host "CLEAN: every count back to baseline" -ForegroundColor Green }
  else { Write-Host "!!! COUNTS DO NOT MATCH BASELINE - INVESTIGATE" -ForegroundColor Red }
}
