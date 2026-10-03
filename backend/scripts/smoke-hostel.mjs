// Hostel flow smoke test against a RUNNING API on a FRESH database (creates students/hostels).
//   npm run dev   ->   npm run smoke:hostel      (API_BASE overrides http://localhost:3000/api)
const B=process.env.API_BASE||'http://localhost:3000/api';
let pass=0,fail=0;const fails=[];
const ok=(c,m)=>{ if(c){pass++;console.log('  ok  ',m)}else{fail++;fails.push(m);console.log('  FAIL',m)} };
const call=async(m,p,t,b)=>{const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json().catch(()=>null),d:null}};
const get=async(p,t)=>{const r=await call('GET',p,t);return r.j?.data};
const msg=r=>r.j?.message||'';
const login=async(i,p)=>(await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})}).then(r=>r.json())).data;
const L=await login('superadmin','Admin@123'); const A=L.accessToken; const BR=L.user.branchId;
const cls=(await get('/classes?limit=5',A))[0];
const mk=async(fn,g)=>(await call('POST','/students',A,{firstName:fn,lastName:'Hostel',gender:g,dateOfBirth:'2012-01-01',currentClassId:cls.id})).j.data;
const boy=await mk('Bilal','male'), girl=await mk('Sana','female'), boy2=await mk('Omar','male'), boy3=await mk('Zain','male');

console.log('# setup: hostels, rooms, beds');
const hb=(await call('POST','/hostels',A,{name:'Boys Block',gender:'boys'})).j.data;
const hg=(await call('POST','/hostels',A,{name:'Girls Block',gender:'girls'})).j.data;
const dupH=await call('POST','/hostels',A,{name:'boys block',gender:'boys'}); ok(dupH.s===409,'duplicate hostel name blocked '+dupH.s);
const r1=(await call('POST','/rooms',A,{hostelId:hb.id,roomNo:'101',capacity:2})).j.data;
ok((await get('/rooms/'+r1.id,A)).status==='available','empty room is "available" (was "full")');
const b1=(await call('POST','/beds',A,{roomId:r1.id,bedNo:'B1'})).j.data;
const b2=(await call('POST','/beds',A,{roomId:r1.id,bedNo:'B2'})).j.data;
const over=await call('POST','/beds',A,{roomId:r1.id,bedNo:'B3'}); ok(over.s===400,'bed beyond room capacity blocked '+over.s);
const rg=(await call('POST','/rooms',A,{hostelId:hg.id,roomNo:'G1',capacity:1})).j.data; const gb=(await call('POST','/beds',A,{roomId:rg.id,bedNo:'G-B1'})).j.data;
const occTamper=await call('POST','/beds',A,{roomId:r1.id,bedNo:'X',status:'occupied'}); ok(occTamper.s===400,'cannot create a bed as occupied '+occTamper.s);

console.log('# allocate (UI payload: hostelId + roomId + bedId, string ids)');
const a1=await call('POST','/hostel-allocations',A,{studentId:boy.id,hostelId:hb.id,roomId:r1.id,bedId:b1.id,checkIn:'2026-10-01',monthlyFee:1500});
ok(a1.s===201,'allocate boy -> boys hostel '+a1.s+' '+msg(a1)); const al1=a1.j?.data;
ok((await get('/beds/'+b1.id,A)).status==='occupied','bed became occupied');
const wrongRoom=await call('POST','/hostel-allocations',A,{studentId:boy2.id,hostelId:hb.id,roomId:rg.id,bedId:b2.id}); ok(wrongRoom.s===400,'room/bed mismatch rejected '+wrongRoom.s);
const gIn=await call('POST','/hostel-allocations',A,{studentId:girl.id,bedId:b2.id}); ok(gIn.s===400,'girl into boys hostel rejected: '+msg(gIn));
const bIn=await call('POST','/hostel-allocations',A,{studentId:boy.id,bedId:b2.id}); ok(bIn.s===400,'student with active bed cannot take a 2nd: '+msg(bIn));
const taken=await call('POST','/hostel-allocations',A,{studentId:boy2.id,bedId:b1.id}); ok(taken.s===400,'occupied bed rejected: '+msg(taken));
const gOk=await call('POST','/hostel-allocations',A,{studentId:girl.id,bedId:gb.id}); ok(gOk.s===201,'girl -> girls hostel '+gOk.s+' '+msg(gOk));
ok(Number(gOk.j?.data?.monthlyFee)>=0,'monthlyFee defaulted');
ok((await get('/rooms/'+rg.id,A)).status==='full','single-bed room became full');

console.log('# race: two parallel allocations to the same free bed');
const race=await Promise.all([call('POST','/hostel-allocations',A,{studentId:boy2.id,bedId:b2.id}),call('POST','/hostel-allocations',A,{studentId:boy3.id,bedId:b2.id})]);
ok(race.filter(r=>r.s===201).length===1,'exactly one wins the race: '+race.map(r=>r.s).join(','));
const winner=race.find(r=>r.s===201)?.j.data; const loserStudent=race.find(r=>r.s!==201); ok(loserStudent&&loserStudent.s>=400&&loserStudent.s<500,'loser gets a clean 4xx: '+msg(loserStudent||{}));
ok((await get('/rooms/'+r1.id,A)).status==='full','room full after both beds taken');

console.log('# tampering with derived state');
const free=await call('PUT','/beds/'+b1.id,A,{roomId:r1.id,bedNo:'B1',status:'available'}); ok(free.s===400,'cannot free an occupied bed by editing it '+free.s);
const maint=await call('PUT','/rooms/'+r1.id,A,{hostelId:hb.id,roomNo:'101',capacity:2,status:'maintenance'}); ok(maint.s===400,'room with students cannot go to maintenance '+maint.s);
const deact=await call('PUT','/hostels/'+hb.id,A,{name:'Boys Block',gender:'boys',isActive:false}); ok(deact.s===400,'hostel with students cannot be deactivated '+deact.s);
const delBed=await call('DELETE','/beds/'+b1.id,A); ok(delBed.s===400,'occupied bed cannot be deleted '+delBed.s);
const putBed=await call('PUT','/hostel-allocations/'+al1.id,A,{bedId:b2.id}); ok(putBed.s===400,'PUT cannot change the bed (use transfer): '+msg(putBed));
const putCo=await call('PUT','/hostel-allocations/'+al1.id,A,{checkOut:'2026-10-05'}); ok(putCo.s===400,'PUT cannot close an active allocation: '+msg(putCo));
const fee=await call('PUT','/hostel-allocations/'+al1.id,A,{monthlyFee:1800}); ok(fee.s===200&&Number(fee.j.data.monthlyFee)===1800,'fee can be edited');

console.log('# check-out');
const fut=await call('POST','/hostel-allocations/'+al1.id+'/checkout',A,{checkOut:'2030-01-01'}); ok(fut.s===400,'future check-out date rejected: '+msg(fut));
const early=await call('POST','/hostel-allocations/'+al1.id+'/checkout',A,{checkOut:'2026-09-01'}); ok(early.s===400,'check-out before check-in rejected');
const co=await call('POST','/hostel-allocations/'+al1.id+'/checkout',A,{checkOut:'2026-10-02'}); ok(co.s===200&&co.j.data.status==='checked_out'&&co.j.data.checkOut,'checkout sets status + date');
ok((await get('/beds/'+b1.id,A)).status==='available','bed released');
ok((await get('/rooms/'+r1.id,A)).status==='available','room back to available');
const co2=await call('POST','/hostel-allocations/'+al1.id+'/checkout',A,{}); ok(co2.s===400,'double check-out rejected');

console.log('# delete history must not free another student\'s bed');
const n=await call('POST','/hostel-allocations',A,{studentId:boy.id,bedId:b1.id,checkIn:'2026-10-01'}); ok(n.s===201,'bed re-allocated to another stay');
const delOld=await call('DELETE','/hostel-allocations/'+al1.id,A); ok(delOld.s===200,'old history row deleted');
ok((await get('/beds/'+b1.id,A)).status==='occupied','bed STILL occupied after deleting old history');

console.log('# transfer');
const al2=n.j.data;
const tr0=await call('POST','/hostel-allocations/'+al2.id+'/transfer',A,{bedId:gb.id}); ok(tr0.s===400,'transfer boy into girls bed rejected: '+msg(tr0));
const trSame=await call('POST','/hostel-allocations/'+al2.id+'/transfer',A,{bedId:b1.id}); ok(trSame.s===400,'transfer to same bed rejected');
// free b2 by checking out the race winner, then transfer into it
await call('POST','/hostel-allocations/'+winner.id+'/checkout',A,{});
const tr=await call('POST','/hostel-allocations/'+al2.id+'/transfer',A,{bedId:b2.id,transferDate:'2026-10-02'}); ok(tr.s===200&&tr.j.data.status==='active'&&Number(tr.j.data.bedId)===Number(b2.id),'transfer ok '+tr.s+' '+msg(tr));
const oldRow=await get('/hostel-allocations/'+al2.id,A); ok(oldRow.status==='transferred'&&oldRow.checkOut,'old row kept as "transferred" with end date');
ok((await get('/beds/'+b1.id,A)).status==='available'&&(await get('/beds/'+b2.id,A)).status==='occupied','old bed freed, new bed occupied');

console.log('# maintenance');
await call('POST','/hostel-allocations/'+tr.j.data.id+'/checkout',A,{});
const mb=await call('PUT','/beds/'+b1.id,A,{roomId:r1.id,bedNo:'B1',status:'maintenance'}); ok(mb.s===200,'free bed -> maintenance '+mb.s+' '+msg(mb));
const opt1=(await call('GET','/hostel-allocations/options',A)).j.data; ok(!opt1.beds.some(b=>String(b.id)===String(b1.id)),'options endpoint hides maintenance bed'); ok(opt1.beds.every(b=>b.hostelName&&b.roomNo),'options carry hostel/room names');
const onM=await call('POST','/hostel-allocations',A,{studentId:boy2.id,bedId:b1.id}); ok(onM.s===400,'cannot allocate a maintenance bed: '+msg(onM));
const mr=await call('PUT','/rooms/'+r1.id,A,{hostelId:hb.id,roomNo:'101',capacity:2,status:'maintenance'}); ok(mr.s===200&&(await get('/rooms/'+r1.id,A)).status==='maintenance','empty room -> maintenance is kept');
await call('PUT','/beds/'+b2.id,A,{roomId:r1.id,bedNo:'B2'});
ok((await get('/rooms/'+r1.id,A)).status==='maintenance','editing a bed does not reset room maintenance');
const opt2=(await call('GET','/hostel-allocations/options',A)).j.data; ok(!opt2.beds.some(b=>String(b.id)===String(b2.id)),'options hides beds of a room under maintenance');
const onMR=await call('POST','/hostel-allocations',A,{studentId:boy2.id,bedId:b2.id}); ok(onMR.s===400,'cannot allocate in a room under maintenance: '+msg(onMR));
await call('PUT','/rooms/'+r1.id,A,{hostelId:hb.id,roomNo:'101',capacity:2,status:'available'}); await call('PUT','/beds/'+b1.id,A,{roomId:r1.id,bedNo:'B1',status:'available'});

const big=await call('GET','/beds?limit=500',A); ok(big.s===200,'limit=500 accepted (dropdown size) '+big.s);
console.log('# deletes with history, hostel stats, search, export, scope');
const delH=await call('DELETE','/beds/'+b2.id,A); ok(delH.s===400,'bed with history cannot be deleted: '+msg(delH));
const hl=(await get('/hostels?limit=10',A)).find(x=>String(x.id)===String(hb.id)); ok(hl&&hl.totalBeds===2&&hl.occupiedBeds===0&&hl.occupancy==='0 / 2','hostel stats '+JSON.stringify([hl?.totalBeds,hl?.occupiedBeds,hl?.occupancy]));
const sr=await get('/hostel-allocations?q=Bilal&limit=20',A); ok(Array.isArray(sr)&&sr.length>=1&&sr.every(x=>x.studentName.includes('Bilal')),'search by student name '+sr?.length);
const ex=await fetch(B+'/hostel-allocations/export',{headers:{Authorization:'Bearer '+A}}); ok(ex.status===200,'allocations export '+ex.status);
await call('POST','/users',A,{username:'warden1',email:'warden1@s.local',firstName:'War',lastName:'Den',role:'hostel_warden',branchId:BR,password:'Passw0rd!x'});
const W=(await login('warden1','Passw0rd!x')).accessToken;
const wl=await call('GET','/hostel-allocations?limit=5',W); ok(wl.s===200,'warden can list allocations');
const wd=await call('DELETE','/hostel-allocations/'+oldRow.id,W); ok(wd.s===403,'warden cannot delete allocations '+wd.s);
const wa=await call('POST','/hostel-allocations',W,{studentId:boy3.id,bedId:b1.id}); ok(wa.s===201,'warden can allocate '+wa.s+' '+msg(wa));
// parent sees only own child's allocation
const kid=await get('/students/'+boy3.id+'/guardians',A);
console.log(`\n${pass} passed, ${fail} failed`); if(fail) console.log('FAILED:\n - '+fails.join('\n - '));
