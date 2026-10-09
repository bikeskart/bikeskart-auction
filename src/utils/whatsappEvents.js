const {whatsAppPhone}=require('./winnerMessages');
const {readSale}=require('./bikeSale');
const {financial}=require('./adminOperations');
const rupees=cents=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(cents/100);
function time(value){return new Date(typeof value==='string'&&!value.includes('T')?value.replace(' ','T')+'Z':value).getTime();}
function event(kind,row,params,suffix=''){
  const recipient=whatsAppPhone(row.phone);
  if(!recipient||recipient!==row.consent_phone)return null;
  return {event_key:`${kind}:${row.auction_id}:${row.user_id}${suffix}`,kind,auction_id:row.auction_id,user_id:row.user_id,recipient,params};
}
function auctionEvents(row,now=Date.now()){
  if(!row.auctions_enabled||row.status!=='open'||time(row.ends_at)<=now)return [];
  const name=`${row.brand} ${row.model}`,link=`https://auction.bikeskart.com/?auction=${row.auction_id}`;
  const upcoming=time(row.starts_at)>now;
  const kind=upcoming?'new_auction':'auction_live';
  const occurred=upcoming?row.created_at:row.starts_at;
  if(time(occurred)<time(row.auction_opted_at))return [];
  const params=upcoming?[name,String(row.auction_id),new Date(time(row.starts_at)).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST',link]:[name,String(row.auction_id),link];
  return [event(kind,row,params)].filter(Boolean);
}
function saleEvents(row){
  if(!row.transactions_enabled||row.status!=='closed'||row.result!=='sold'||String(row.winner_id)!==String(row.user_id)||!row.confirmed_at)return [];
  const sale=readSale(row.sale_profile),f=financial(sale,row.highest_bid);
  // A substituted buyer must not receive the winning dealer's financial records.
  if(sale.buyerPhone&&whatsAppPhone(sale.buyerPhone)!==whatsAppPhone(row.phone))return [];
  const name=row.full_name||'Dealer',bike=`${row.brand} ${row.model}`,registration=row.registration_number||'Not recorded',lot=String(row.auction_id),events=[];
  const add=(kind,params,suffix='')=>{const value=event(kind,row,params,suffix);if(value)events.push(value);return value;};
  if(time(row.confirmed_at)>=time(row.transaction_opted_at))add('winner',[name,lot,bike,registration,rupees(Number(row.highest_bid)*100),'9900935354']);
  if(time(row.bike_updated_at)<time(row.transaction_opted_at)||!sale.paymentConfirmed||f.price===null||f.price<=0||f.balance>0)return events;
  add('payment',[name,lot,bike,rupees(f.received),sale.paymentReference||'Not recorded']);
  const invoice=(sale.documents||[]).filter(d=>d.kind==='saleInvoice'&&d.filename.endsWith('.pdf')).at(-1);
  if(invoice){const item=add('invoice',[name,lot,bike],':'+invoice.filename);if(item)item.document_filename=invoice.filename;}
  if(sale.pickupReady&&sale.pickupLocation&&!sale.deliveryReleased)add('pickup',[name,lot,bike,sale.pickupLocation,sale.pickupMapUrl||'Contact BikesKart for directions',sale.pickupContact||'9900935354',sale.pickupInstructions||'Please call before arrival']);
  if(sale.deliveryReleased)add('delivered',[name,lot,bike,sale.deliveryDate||'Not recorded',sale.collectedBy||'Not recorded']);
  return events;
}
module.exports={auctionEvents,saleEvents,time};
