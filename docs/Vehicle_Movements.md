# Vehicle movement records

The main admin uses the separate Vehicle Movements tab. Each custody record and history entry is linked to an inventory bike ID. It is independent of auction status: a sold bike may remain physically parked in the warehouse.

1. Complete the purchase and inspection review, then forward the bike to inventory. In the purchase record enter purchase price, full seller payment, payment date, method and reference.
2. In Vehicle Movements, enter that inventory bike ID and select the executive. Confirm payment and assign pickup. The API verifies the purchase payment before assigning and again at pickup.
3. The assigned executive sees Vehicle Movements beneath their inspection assignments. Record pickup with actual date/time, location, handover person and a vehicle/handover photo. Then record warehouse handover with the same evidence requirements.
4. The main admin confirms warehouse receipt with receiving person's name, warehouse and parking bay, time and photo. Executive handover alone does not confirm warehouse receipt.
5. Record service dispatch with workshop, date/time, person and required work. Service return requires completed-work notes and a service bill. Service cost is saved as historical evidence; it does not automatically post an accounting expense. Enter actual repair expenses in existing accounts.
6. Once buyer name and sale price are recorded in inventory, mark the bike Sold — parked in warehouse. A sold bike returned from servicing retains this parked status.
7. Before final physical delivery, complete the existing inventory delivery release workflow, including full buyer payment confirmation, signed receipt, collector, delivery date and evidence. Vehicle Movements cannot bypass those checks. Record the final location, receiving person, time and photo.

Only the main admin can authorize pickup or confirm warehouse, service, sold-parking and delivery records. Executives can record pickup/handover only for their currently assigned vehicles. Disabled accounts lose access immediately. Executives cannot read service charges or bill files. Dealers and other admins cannot access this page or its API.

History entries are append-only; row locks and record versions reject stale or duplicate transition requests. This page records physical custody rather than replacing purchase or sale accounts. Existing inventory bikes must be linked to a purchase record before seller-paid pickup can be authorized; there is no legacy payment override.

The application creates bike_custody and bike_movements tables on first use. Private images/bills use the persistent uploads/movements folder and authenticated file endpoints. Existing admin backups include these tables and files. No auction or customer notification is sent automatically.
