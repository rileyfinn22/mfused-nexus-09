// ib.mjs is supabase/functions/_shared/depositCredit.ts transpiled — the SAME code the app,
// the PDFs and the QuickBooks sync all run.
const { allocateDepositCredits } = await import('./ib.mjs');

const run = (label, { blanketTotal, deposit, kids, closed = false }) => {
  const parent = {
    id: 'p', invoice_number: 'B1', invoice_type: 'full',
    total_paid: deposit, total: blanketTotal,
    blanket_closed_at: closed ? '2026-08-04T00:00:00Z' : null,
  };
  const credits = allocateDepositCredits(parent, kids, { blanketValue: blanketTotal });
  console.log(`\n${label}${closed ? '   [FINALISED]' : ''}`);
  console.log(`  blanket ${blanketTotal}, deposit ${deposit} (${Math.round(deposit / blanketTotal * 100)}%)`);
  let due = 0, goods = 0, credited = 0, alreadyPaid = 0;
  for (const k of kids) {
    const cr = credits[k.id] || 0;
    const d = Math.round((k.total - k.total_paid - cr) * 100) / 100;
    due += d; goods += k.total; credited += cr; alreadyPaid += k.total_paid;
    console.log(`    ship ${k.shipment_number}  bills ${String(k.total).padStart(6)}  credit ${String(Math.round(cr * 100) / 100).padStart(7)}  due ${String(d).padStart(6)}`);
  }
  // Everything the customer parts with: the deposit, whatever they have already paid on
  // shipments, and whatever is still due.
  const collected = Math.round((deposit + alreadyPaid + due) * 100) / 100;
  const held = Math.round((deposit - credited) * 100) / 100;
  // Collected should equal the goods billed, plus any deposit still held back mid-order.
  const ok = Math.abs(collected - goods - held) < 0.02;
  console.log(`  credited ${Math.round(credited * 100) / 100} of ${deposit} deposit${held > 0.005 ? `  (holding ${held})` : ''}`);
  console.log(`  collected ${collected} vs goods ${goods}${held > 0.005 ? ` + held ${held}` : ''}   ${ok ? 'BALANCES' : '*** MISMATCH ***'}`);
};

const k = (n, total, paid = 0) => ({ id: 'c' + n, invoice_number: `B1-0${n}`, total, total_paid: paid, shipment_number: n });

console.log('================ DEPOSIT ACROSS MANY CHILDREN ================');
run('2 children, exact', { blanketTotal: 100, deposit: 30, kids: [k(1, 50), k(2, 50)] });
run('3 children, exact', { blanketTotal: 100, deposit: 30, kids: [k(1, 30), k(2, 30), k(3, 40)] });
run('4 children, uneven', { blanketTotal: 100, deposit: 30, kids: [k(1, 10), k(2, 45), k(3, 20), k(4, 25)] });
run('5 children, small first', { blanketTotal: 1000, deposit: 300, kids: [k(1, 50), k(2, 200), k(3, 350), k(4, 300), k(5, 100)] });
run('4 children, 50% deposit', { blanketTotal: 100, deposit: 50, kids: [k(1, 25), k(2, 25), k(3, 25), k(4, 25)] });
run('4 children, 100% prepaid', { blanketTotal: 100, deposit: 100, kids: [k(1, 25), k(2, 25), k(3, 25), k(4, 25)] });
run('4 children with overs (blanket grew)', { blanketTotal: 120, deposit: 30, kids: [k(1, 30), k(2, 30), k(3, 30), k(4, 30)] });
run('4 children, order ended short', { blanketTotal: 100, deposit: 30, kids: [k(1, 20), k(2, 20), k(3, 20)] });
run('...same, after Finalise', { blanketTotal: 100, deposit: 30, kids: [k(1, 20), k(2, 20), k(3, 20)], closed: true });
run('4 children, first two already paid', { blanketTotal: 100, deposit: 30, kids: [k(1, 25, 17.5), k(2, 25, 17.5), k(3, 25), k(4, 25)] });
