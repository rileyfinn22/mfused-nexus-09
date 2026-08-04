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
$MARK = 'ZZDEP'

$before = One "select (select count(*) from orders) o, (select count(*) from order_items) oi, (select count(*) from invoices) i, (select count(*) from inventory_allocations) a, (select count(*) from payments) p"
"BASELINE orders=$($before.o) items=$($before.oi) invoices=$($before.i) allocs=$($before.a) payments=$($before.p)"
$company = (One "select id from companies order by name limit 1").id

function New-Order($name, $ordered, $price) {
  $oid = [guid]::NewGuid().ToString(); $iid = [guid]::NewGuid().ToString()
  Q "insert into orders (id, order_number, company_id, customer_name, shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip, status, subtotal, tax, shipping_cost, total) values ('$oid','$MARK-$name','$company','Dep Test','D','1 St','T','CA','90001','draft',0,0,0,0)" | Out-Null
  Q "insert into order_items (order_id, sku, name, quantity, unit_price, total, shipped_quantity, line_number) values ('$oid','$MARK-SKU','widget',$ordered,$price,$($ordered*$price),null,1)" | Out-Null
  Q "insert into invoices (id, company_id, order_id, invoice_number, invoice_type, status, subtotal, tax, shipping_cost, total, total_paid, shipment_number) values ('$iid','$company','$oid','$MARK-$name','full','open',$($ordered*$price),0,0,$($ordered*$price),0,1)" | Out-Null
  return [pscustomobject]@{ order = $oid; blanket = $iid; name = $name }
}
function Pay($s, $amt) {
  Q "insert into payments (company_id, invoice_id, amount, payment_method) values ('$company','$($s.blanket)',$amt,'check')" | Out-Null
}
function Ship($s, $qty) { Q "update order_items set shipped_quantity=$qty where order_id='$($s.order)'" | Out-Null }
function Show($s, $label) {
  $b = One "select subtotal, total, total_paid, billed_percentage, blanket_closed_at from invoices where id='$($s.blanket)'"
  $bal = [math]::Round([decimal]$b.total - [decimal]$b.total_paid, 2)
  $fin = if ($b.blanket_closed_at) { ' [FINAL]' } else { '' }
  "  {0,-32} blanket total {1,8}  deposit paid {2,8}  BALANCE DUE {3,8}{4}" -f $label, [math]::Round([decimal]$b.total,2), [math]::Round([decimal]$b.total_paid,2), $bal, $fin
}

try {
  Write-Host "`n=== DEPOSIT ON A BLANKET, THEN QUANTITIES UPDATED ON THAT SAME BLANKET (no children) ===" -ForegroundColor Cyan
  foreach ($c in @(@{n='exact'; ship=100}, @{n='overs'; ship=110}, @{n='unders'; ship=80})) {
    $s = New-Order "$($c.n)" 100 1
    Write-Host " $($c.n): ordered 100 @ `$1 = `$100, 30% deposit"
    Show $s "at creation"
    Pay $s 30
    Show $s "after 30 deposit paid"
    Ship $s $c.ship
    Show $s "after Quick Ship $($c.ship)"
    Q "update invoices set blanket_closed_at=now(), status='closed' where id='$($s.blanket)'" | Out-Null
    Show $s "after Finalise"
    $f = One "select total, total_paid from invoices where id='$($s.blanket)'"
    $owed = [math]::Round([decimal]$f.total - [decimal]$f.total_paid, 2)
    $goods = $c.ship
    $ok = [math]::Abs($owed + 30 - $goods) -lt 0.02
    "     -> customer pays 30 deposit + $owed = $([math]::Round($owed + 30,2))  for $goods of goods   {0}" -f $(if ($ok) { 'BALANCES' } else { '*** MISMATCH ***' })
  }
}
finally {
  Write-Host "`n=== TEARDOWN ===" -ForegroundColor Yellow
  Q "delete from payments where invoice_id in (select id from invoices where invoice_number like '$MARK%')" | Out-Null
  Q "delete from inventory_allocations where invoice_id in (select id from invoices where invoice_number like '$MARK%')" | Out-Null
  Q "delete from invoices where parent_invoice_id in (select id from invoices where invoice_number like '$MARK%')" | Out-Null
  Q "delete from invoices where invoice_number like '$MARK%'" | Out-Null
  Q "delete from order_items where order_id in (select id from orders where order_number like '$MARK%')" | Out-Null
  Q "delete from orders where order_number like '$MARK%'" | Out-Null
  $after = One "select (select count(*) from orders) o, (select count(*) from order_items) oi, (select count(*) from invoices) i, (select count(*) from inventory_allocations) a, (select count(*) from payments) p"
  "AFTER    orders=$($after.o) items=$($after.oi) invoices=$($after.i) allocs=$($after.a) payments=$($after.p)"
  if (($after.o -eq $before.o) -and ($after.oi -eq $before.oi) -and ($after.i -eq $before.i) -and ($after.a -eq $before.a) -and ($after.p -eq $before.p)) {
    Write-Host "CLEAN: back to baseline" -ForegroundColor Green
  } else { Write-Host "!!! COUNTS DIFFER - INVESTIGATE" -ForegroundColor Red }
}
