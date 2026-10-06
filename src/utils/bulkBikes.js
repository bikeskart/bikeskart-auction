const Excel=require('exceljs');
const yauzl=require('yauzl');
const {Readable}=require('node:stream');
const {fields,parseProfile}=require('./bikeProfile');
const {fail}=require('./auctionRules');
const columns=['brand','model','year','registrationNumber','kilometersDriven','ownershipCount','fuelType','conditionNotes',...Object.keys(fields)];
const normalize=v=>String(v||'').toUpperCase().replace(/[\s-]/g,'');
function zipEntries(buffer,{maxBytes=50*1024*1024,maxFile=8*1024*1024,maxEntries=1000}={}){
 return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
  if(error)return reject(error);let count=0,total=0,finished=false;const entries=[];
  const stop=e=>{if(finished)return;finished=true;zip.close();reject(e);};
  zip.on('error',stop);zip.on('end',()=>{if(!finished){finished=true;resolve(entries);}});
  zip.on('entry',entry=>{
   const name=entry.fileName;if(++count>maxEntries||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||/^[A-Za-z]:/.test(name)||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)return stop(new Error('Unsafe ZIP path or too many files'));
   if(entry.generalPurposeBitFlag&1)return stop(new Error('Encrypted ZIP files are not supported'));
   if(name.endsWith('/'))return zip.readEntry();
   total+=entry.uncompressedSize;if(entry.uncompressedSize>maxFile||total>maxBytes)return stop(new Error('ZIP expanded size exceeds the upload limit'));
   zip.openReadStream(entry,(err,stream)=>{if(err)return stop(err);const parts=[];let bytes=0;stream.on('error',stop);stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxFile||bytes>entry.uncompressedSize){stream.destroy();stop(new Error('ZIP entry exceeds declared size'));return;}parts.push(chunk);});stream.on('end',()=>{if(finished)return;entries.push({name,buffer:Buffer.concat(parts)});zip.readEntry();});});
  });zip.readEntry();
 }));
}
async function readSheet(file){
 if(!file||file.buffer.length>2*1024*1024)fail('Choose an Excel or CSV file up to 2 MB');
 const workbook=new Excel.Workbook();let sheet;
 if(/\.xlsx$/i.test(file.originalname)){await zipEntries(file.buffer,{maxBytes:20*1024*1024,maxFile:10*1024*1024,maxEntries:300});await workbook.xlsx.load(file.buffer);sheet=workbook.getWorksheet('Bikes')||workbook.worksheets[0];}
 else if(/\.csv$/i.test(file.originalname))sheet=await workbook.csv.read(Readable.from([file.buffer]),{map:value=>value});
 else fail('Use .xlsx or .csv');
 if(!sheet||sheet.rowCount>101||sheet.columnCount>columns.length)fail('Use the template with no more than 100 bikes');
 const headers=sheet.getRow(1).values.slice(1).map(v=>typeof v==='string'?v.trim():'');
 if(headers.length===0||new Set(headers).size!==headers.length||headers.some(h=>!columns.includes(h))||['brand','model','year','registrationNumber'].some(h=>!headers.includes(h)))fail('Keep the template column headings unchanged');
 const rows=[];const seen=new Set();
 for(let i=2;i<=sheet.rowCount;i++){
  const values=sheet.getRow(i).values;if(!values.some(v=>v!==null&&v!==undefined&&v!==''))continue;
  const body={},errors=[];headers.forEach((h,index)=>{const v=values[index+1];if(v!=null&&!['string','number'].includes(typeof v))errors.push(h+': use plain text or a number, not a formula or object');body[h]=v==null?'':typeof v==='string'?v.trim():v;});
  try{
   for(const k of ['brand','model'])if(typeof body[k]!=='string'||!body[k]||body[k].length>150)fail('Brand and model are required (max 150 characters)');
   const year=Number(body.year);if(!Number.isInteger(year)||year<1950||year>new Date().getFullYear()+1)fail('Invalid manufacturing year');
   const reg=normalize(body.registrationNumber);if(!/^[A-Z0-9]{5,20}$/.test(reg))fail('Registration number is required');body.registrationNumber=reg;if(seen.has(reg))fail('Duplicate registration in this file');seen.add(reg);
   for(const [k,min,max] of [['kilometersDriven',0,2147483647],['ownershipCount',1,255]])if(body[k]!==''&&body[k]!=null&&(!Number.isInteger(Number(body[k]))||Number(body[k])<min||Number(body[k])>max))fail('Invalid '+k);
   if(body.fuelType&&!['Petrol','Electric','Other'].includes(body.fuelType))fail('Fuel type must be Petrol, Electric or Other');
   if(typeof body.conditionNotes==='object'||String(body.conditionNotes||'').length>10000)fail('Description is too long');
   body.detailProfile=parseProfile(body);
  }catch(e){errors.push(e.message);}
  rows.push({row:i,body,errors,photos:[]});
 }
 if(!rows.length)fail('The file contains no bike rows');return rows;
}
function photoExtension(buffer){if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return '.jpg';if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')return '.webp';return null;}
async function matchPhotos(file,rows){
 if(!file)return [];if(!/\.zip$/i.test(file.originalname)||file.buffer.length>25*1024*1024)fail('Photo ZIP must be up to 25 MB');const photos=await zipEntries(file.buffer);const errors=[];
 for(const entry of photos){if(entry.name.startsWith('__MACOSX/')||entry.name.endsWith('/.DS_Store'))continue;const parts=entry.name.split('/');if(parts.length!==2){errors.push('Photos must use registration-number folders: '+entry.name);continue;}const reg=normalize(parts[0]),row=rows.find(r=>r.body.registrationNumber===reg),ext=photoExtension(entry.buffer);if(!row){errors.push('No bike row matches photo folder '+parts[0]);continue;}if(!ext||! /\.(jpe?g|png|webp)$/i.test(parts[1])){row.errors.push('Use real JPG, PNG or WEBP photos: '+parts[1]);continue;}if(row.photos.length>=8){row.errors.push('Maximum 8 photos per bike');continue;}row.photos.push({buffer:entry.buffer,ext});
 }return errors;
}
async function template(){const wb=new Excel.Workbook(),sheet=wb.addWorksheet('Bikes');sheet.columns=columns.map(key=>({header:key,key,width:key==='conditionNotes'?45:22}));sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true};const notes=wb.addWorksheet('Instructions');notes.addRows([['One bike per row. Maximum 100 bikes per import. Do not change headings.'],['Required: brand, model, year (manufacturing), registrationNumber. Other values may be blank.'],['Use Yes/No for status fields; Good/Average/Poor for inspection condition.'],['Insurance: Valid/Invalid. Fuel: Petrol/Electric/Other. Rating: 1–5.'],['Photos: optional ZIP, folder per registration, e.g. KA01AB1234/front.jpg.'],['Maximum 8 photos per bike, 8 MB each; ZIP max 25 MB compressed / 50 MB expanded.'],['Existing registrations and duplicate rows are blocked. Imported bikes are drafts.'],['Preview expires after 24 hours. Confirm only after checking the preview.']]);notes.getColumn(1).width=110;return wb.xlsx.writeBuffer();}
module.exports={columns,normalize,zipEntries,readSheet,matchPhotos,template,photoExtension};
