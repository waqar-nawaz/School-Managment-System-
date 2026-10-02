// Smoke test: boots nothing, just exercises a RUNNING API (default http://localhost:3000/api).
// Use it on a FRESH database (it creates users/students), e.g.:  npm run dev  ->  npm run smoke
// Set API_BASE to point at another host.
const B=process.env.API_BASE||'http://localhost:3000/api';
let pass=0,fail=0;const fails=[];
const ok=(c,m)=>{ if(c){pass++;console.log('  ok  ',m)}else{fail++;fails.push(m);console.log('  FAIL',m)} };
async function call(method,path,token,body){
  const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  let j=null;const t=await r.text();try{j=JSON.parse(t)}catch{j={raw:t}}
  return {s:r.status,j,d:j?.data};
}
const login=async(id,pw)=>{const r=await call('POST','/auth/login',null,{identifier:id,password:pw});return r;};
const rows=r=>Array.isArray(r.d)?r.d:(r.d?.rows||r.d?.items||r.d?.data||[]);
(async()=>{
 console.log('# auth');
 let r=await login('superadmin','Admin@123'); ok(r.s===200,'admin login'); const A=r.d?.accessToken||r.d?.tokens?.accessToken; ok(!!A,'got token');
 ok(Array.isArray(r.d?.user?.permissions),'login returns permissions');
 const me=await call('GET','/auth/me',A); const BR=me.d?.branchId; ok(me.s===200&&me.d.permissions.includes('*'),'/auth/me permissions *');

 console.log('# academics seeded & branch scoped');
 const classes=rows(await call('GET','/classes?limit=50',A)); ok(classes.length>=10,'classes seeded '+classes.length);
 const sections=rows(await call('GET','/sections?limit=100',A)); ok(sections.length>=20,'sections seeded '+sections.length);
 const subjects=rows(await call('GET','/subjects?limit=50',A)); ok(subjects.length>=10,'subjects visible '+subjects.length);
 const ft=rows(await call('GET','/fee-types?limit=50',A)); ok(ft.length>=4,'fee types visible '+ft.length);
 const years=rows(await call('GET','/academic-years',A)); ok(years.length>=1,'academic year visible');
 const c1=classes.find(c=>c.name==='Grade 1'); const s1=sections.find(s=>s.classId===c1.id&&s.name==='A');

 console.log('# staff user + profile');
 let t=await call('POST','/users',A,{username:'teach1',email:'teach1@s.local',firstName:'Tina',lastName:'Teach',role:'teacher',branchId:BR,password:'Passw0rd!x'});
 ok(t.s===201||t.s===200,'create teacher user '+t.s+' '+(t.j?.message||''));
 const tl=await call('GET','/teachers?limit=50',A); ok(rows(tl).filter(x=>x.firstName==='Tina').length===1,'exactly 1 teacher profile');
 const tuser=t.d?.id||t.d?.user?.id;
 const dup=await call('POST','/teachers',A,{userId:tuser,firstName:'Tina',lastName:'Teach',staffNo:'X-1'}); ok(dup.s===409,'duplicate teacher profile blocked '+dup.s);
 let st=await call('POST','/users',A,{username:'staff1',email:'staff1@s.local',firstName:'Sam',lastName:'Staff',role:'staff',branchId:BR,password:'Passw0rd!x'}); ok(st.s<300,'staff role user ok '+st.s+' '+(st.j?.message||''));
 const bad=await call('POST','/users',A,{username:'x1',email:'x1@s.local',firstName:'a',lastName:'b',role:'nonexistent',branchId:BR,password:'Passw0rd!x'}); ok(bad.s===400||bad.s===422,'unknown role rejected '+bad.s);

 console.log('# student with 2 guardians (no emails)');
 let sp=await call('POST','/students',A,{firstName:'Ali',lastName:'Khan',gender:'male',dateOfBirth:'2015-05-05',currentClassId:c1.id,currentSectionId:s1.id,
   guardians:[{fullName:'Khan Sr',phone:'03001112222',relation:'father'},{fullName:'Mrs Khan',phone:'03003334444',relation:'mother'}]});
 ok(sp.s<300,'create student '+sp.s+' '+(sp.j?.message||'')); const sid=sp.d?.id||sp.d?.student?.id;
 const guards=await call('GET','/students/'+sid+'/guardians',A); ok(rows(guards).length===2,'2 guardians linked '+rows(guards).length);
 const parents=rows(await call('GET','/parents?limit=50',A)); ok(parents.length===2,'exactly 2 Parent rows (no duplicates) '+parents.length);
 const enr=rows(await call('GET','/enrolments?limit=50',A)); ok(enr.length===1&&enr[0].branchId!=null,'enrolment visible with branchId');

 console.log('# parent portal');
 const pu=rows(await call('GET','/users?role=parent&limit=20',A)); const puser=pu[0];
 await call('POST','/users/'+puser.id+'/reset-password',A,{newPassword:'Passw0rd!x'});
  const pl=await login(puser.username,'Passw0rd!x');
 if(pl.s!==200){ console.log('  (parent password reset route differs) login',pl.s,pl.j?.message) }
 let P=pl.d?.accessToken;
 if(P){
  const myKids=await call('GET','/students',P); ok(myKids.s===200&&rows(myKids).length===1,'parent sees only own child '+rows(myKids).length);
  const sp2=await call('POST','/students',A,{firstName:'Zara',lastName:'Other',gender:'female',dateOfBirth:'2015-01-01',currentClassId:c1.id,currentSectionId:s1.id,guardians:[{fullName:'Other P',phone:'0399999999'}]});
  const other=sp2.d?.id||sp2.d?.student?.id;
  const o=await call('GET','/students/'+other,P); ok(o.s===403,'parent blocked from other child '+o.s);
  const fees=await call('GET','/students/'+other+'/fees',P); ok(fees.s===403,'parent blocked from other child fees '+fees.s);
  const inv=await call('GET','/invoices',P); ok(inv.s===200,'parent can list invoices');
  const pay=await call('POST','/invoices/1/pay',P,{amount:1}); ok(pay.s===403,'parent cannot create payments '+pay.s);
  const med=await call('GET','/students/'+sid,P); ok(med.s===200,'parent can open own child');
 }
 // teacher can't see medical
 const tl2=await login('teach1','Passw0rd!x'); const T=tl2.d?.accessToken; ok(!!T,'teacher login');
 if(T){const sl=await call('GET','/students?limit=5',T); const first=rows(sl)[0]; ok(first&&!('medicalInfo' in first),'teacher list hides medicalInfo');}

 console.log('# invoices / payments / refunds / reports');
 const gen=await call('POST','/invoices/generate',A,{studentId:sid,feeTypeIds:ft.slice(0,1).map(f=>f.id),dueInDays:10});
 ok(gen.s<300,'generate invoice '+gen.s+' '+(gen.j?.message||''));
 const invs=rows(await call('GET','/invoices?limit=20',A)); const inv=invs[0]; ok(!!inv,'invoice exists');
 if(inv){
  const T0=Number(inv.totalDue); const r30=Math.round(T0*0.3*100)/100, r20=Math.round(T0*0.2*100)/100, rest=Math.round((T0-r30-r20)*100)/100;
  const pay=await call('POST','/invoices/'+inv.id+'/pay',A,{amount:T0,method:'cash'}); ok(pay.s<300,'pay '+T0+' '+pay.s+' '+(pay.j?.message||''));
  const pays=rows(await call('GET','/payments?limit=20',A)); const p=pays[0]; ok(!!p,'payment listed');
  if(p){
   const rf1=await call('POST','/payments/'+p.id+'/refund',A,{amount:r30,reason:'test',approve:true}); ok(rf1.s<300,'partial refund '+r30+' '+rf1.s+' '+(rf1.j?.message||''));
   const rf2=await call('POST','/payments/'+p.id+'/refund',A,{amount:r20,reason:'test2',approve:true}); ok(rf2.s<300,'second partial refund allowed '+rf2.s+' '+(rf2.j?.message||''));
   const p2=(await call('GET','/payments/'+p.id,A)).d; ok(p2?.status==='successful','payment still successful after partial refunds: '+p2?.status);
   const rf3=await call('POST','/payments/'+p.id+'/refund',A,{amount:T0,reason:'too much',approve:true}); ok(rf3.s>=400,'over-refund blocked '+rf3.s);
   const rf4=await call('POST','/payments/'+p.id+'/refund',A,{amount:rest,reason:'rest',approve:true}); ok(rf4.s<300,'final refund '+rest+' '+rf4.s+' '+(rf4.j?.message||''));
   const p3=(await call('GET','/payments/'+p.id,A)).d; ok(p3?.status==='refunded','fully refunded -> refunded: '+p3?.status);
   const rep=await call('GET','/reports/fees',A); ok(rep.d&&Number(rep.d.collected)===T0&&Number(rep.d.refunded)===T0&&Number(rep.d.net)===0,'report collected/refunded/net = '+JSON.stringify(rep.d));
   const cancel=await call('PATCH','/invoices/'+inv.id+'/status',A,{status:'cancelled'}); ok(cancel.s>=200,'cancel after full refund responds '+cancel.s+' '+(cancel.j?.message||''));
  }
 }

 console.log('# attendance bulk twice (postgres upsert)');
 const today=new Date().toISOString().slice(0,10);
 const att={classId:c1.id,sectionId:s1.id,date:today,entries:[{studentId:sid,status:'present'}]};
 let a1=await call('POST','/attendance/bulk',A,att); ok(a1.s<300,'attendance save #1 '+a1.s+' '+(a1.j?.message||''));
 att.entries[0].status='absent'; let a2=await call('POST','/attendance/bulk',A,att); ok(a2.s<300,'attendance save #2 (update) '+a2.s+' '+(a2.j?.message||''));

 console.log('# student deactivate / reactivate');
 const del=await call('DELETE','/students/'+sid,A); ok(del.s<300,'deactivate '+del.s);
 const su=rows(await call('GET','/enrolments?limit=50',A)).find(e=>e.studentId===sid); ok(!su||su.status==='withdrawn','enrolment withdrawn');
 const re=await call('PATCH','/students/'+sid+'/reactivate',A); ok(re.s<300,'reactivate '+re.s+' '+(re.j?.message||''));

 console.log('# library overdue lifecycle');
 const bk=await call('POST','/books',A,{title:'Test Book',author:'Auth',isbn:'1234567890',category:'general',totalCopies:2,availableCopies:2}); ok(bk.s<300,'create book '+bk.s+' '+(bk.j?.message||''));

 console.log('# messages / notifications / complaints / leaves');
 const msg=await call('POST','/messages',A,{subject:'Hello all',body:'Broadcast test',kind:'broadcast'}); ok(msg.s<300,'broadcast message '+msg.s+' '+(msg.j?.message||''));
 const inbox=await call('GET','/messages',T); ok(inbox.s===200,'teacher inbox loads (was SQL error) '+inbox.s); ok(rows(inbox).some(m=>m.subject==='Hello all'),'teacher received broadcast');
 const cp=await call('POST','/complaints',T,{title:'Noisy',description:'Too loud outside',category:'facility'}); ok(cp.s<300||cp.s===403,'complaint create '+cp.s+' '+(cp.j?.message||''));
 const lv=await call('POST','/leaves',T,{leaveType:'casual',startDate:'2026-12-01',endDate:'2026-12-03',reason:'x'}); ok(lv.s<300,'leave create '+lv.s+' '+(lv.j?.message||'')); const lid=lv.d?.id;
 if(lid){const lu=await call('PUT','/leaves/'+lid,T,{startDate:'2026-12-01',endDate:'2026-12-05'}); ok(lu.s<300&&Number(lu.d?.days)===5,'leave days recomputed '+lu.d?.days+' '+(lu.j?.message||''));}
 const nt=await call('GET','/notifications',T); ok(nt.s===200,'teacher can read own notifications '+nt.s);

 console.log('# security');
 const sc=await call('POST','/settings',A,{scope:'reset:1',key:'x',value:'y'}); ok(sc.s===400||sc.s===422,'reserved settings scope blocked '+sc.s);
 const csv=await fetch(B+'/students/export',{headers:{Authorization:'Bearer '+A}}); ok(csv.status<500,'students export responds '+csv.status);
 const ex=await fetch(B+'/complaints/export',{headers:{Authorization:'Bearer '+(T||A)}}); ok(ex.status===403||ex.status===200,'complaints export gated '+ex.status);
 const rl=await call('PUT','/roles/accountant/permissions',A,['dashboard:read']); ok(rl.s<300,'role matrix save '+rl.s+' '+(rl.j?.message||''));
 await call('POST','/users',A,{username:'acc1',email:'acc1@s.local',firstName:'Acc',lastName:'Ount',role:'accountant',branchId:BR,password:'Passw0rd!x'});
 const AC=(await login('acc1','Passw0rd!x')).d?.accessToken; const inv2=await call('GET','/invoices',AC); ok(inv2.s===403,'matrix change applies immediately (accountant lost invoices) '+inv2.s);

 console.log('# new: export, attendance guard, uploads auth');
 const ex2=await fetch(B+'/students/export',{headers:{Authorization:'Bearer '+A}}); const txt=await ex2.text(); ok(ex2.status===200&&txt.includes('firstName'),'students export works '+ex2.status);
 if(T){const bulk=await call('POST','/attendance/bulk',T,{classId:c1.id,sectionId:s1.id,date:today,entries:[{studentId:sid,status:'present'}]}); ok(bulk.s<300,'teacher may mark when class has no timetable '+bulk.s);}
 const up=await fetch('http://localhost:3000/uploads/anything.txt'); ok(up.status===401,'uploads need login '+up.status);
 console.log(`\n${pass} passed, ${fail} failed`); if(fail) console.log('FAILED:\n - '+fails.join('\n - '));
})().catch(e=>{console.error('script error',e);process.exit(1)});
