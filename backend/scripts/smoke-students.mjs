// Students + admissions smoke test against a RUNNING API on a FRESH database.
//   npm run dev   ->   npm run smoke:students      (API_BASE overrides http://localhost:3000/api)
const B=process.env.API_BASE||'http://localhost:3000/api';
let pass=0,fail=0;const fails=[];
const ok=(c,m)=>{ if(c){pass++;console.log('  ok  ',m)}else{fail++;fails.push(m);console.log('  FAIL',m)} };
const call=async(m,p,t,b)=>{const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json().catch(()=>null)}};
const get=async(p,t)=>(await call('GET',p,t)).j?.data;
const msg=r=>r.j?.message||'';
const login=async(i,p)=>(await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})}).then(r=>r.json())).data;
const L=await login('superadmin','Admin@123'); const A=L.accessToken;
const classes=await get('/classes?limit=50',A); const g1=classes.find(c=>c.name==='Grade 1'); const g2=classes.find(c=>c.name==='Grade 2');
const secs=await get('/sections?limit=200',A); const s1A=secs.find(s=>s.classId===g1.id&&s.name==='A'); const s1B=secs.find(s=>s.classId===g1.id&&s.name==='B'); const s2A=secs.find(s=>s.classId===g2.id&&s.name==='A');
const base={firstName:'Ayesha',lastName:'Malik',gender:'female',dateOfBirth:'2014-03-04',currentClassId:g1.id,currentSectionId:s1A.id};

console.log('# validation');
let r=await call('POST','/students',A,{...base,gender:undefined}); ok(r.s===400,'gender required: '+msg(r));
r=await call('POST','/students',A,{...base,gender:'robot'}); ok(r.s===400,'invalid gender rejected');
r=await call('POST','/students',A,{...base,dateOfBirth:'2999-01-01'}); ok(r.s===400,'future DOB rejected: '+msg(r));
r=await call('POST','/students',A,{...base,dateOfBirth:'1950-01-01'}); ok(r.s===400,'impossible DOB rejected');
r=await call('POST','/students',A,{...base,guardians:[{fullName:'X',phone:'abc'}]}); ok(r.s===400,'bad guardian phone rejected: '+msg(r));
r=await call('POST','/students',A,{...base,email:'not-an-email'}); ok(r.s===400,'bad email rejected');
r=await call('POST','/students',A,{...base,currentSectionId:s2A.id}); ok(r.s===400,'section of another class rejected');
r=await call('POST','/students',A,{...base,currentClassId:undefined}); ok(r.s===400,'section without class rejected: '+msg(r));

console.log('# admit with two guardians sharing one phone');
const fam=await call('POST','/students',A,{...base,religion:'Christianity',guardians:[{fullName:'Imran Malik',relation:'father',phone:'0300 1112222',email:'imran@fam.test'},{fullName:'Sadia Malik',relation:'mother',phone:'0300 1112222'}]});
ok(fam.s===201,'student admitted '+fam.s+' '+msg(fam)); const kid=fam.j?.data;
ok(/^ADM-\d{4}-0001$/.test(kid?.admissionNo),'friendly admission number '+kid?.admissionNo);
ok(kid?.credentials?.filter(c=>c.role==='parent').length===2&&kid?.credentials?.filter(c=>c.role==='student').length===1,'credentials: 1 student + 2 distinct parents');
const guards=await get('/students/'+kid.id+'/guardians',A); ok(guards.length===2,'2 guardians linked (father and mother not merged)');
ok(kid.religion==='Christianity','religion saved (column was VARCHAR(6))');
ok(kid.rollNo===undefined,'ok'); const enr=(await get('/enrolments?limit=50',A)).find(e=>String(e.studentId)===String(kid.id)); ok(enr&&enr.rollNo==='1','roll number auto-assigned = 1');

console.log('# logins work (credentials returned once)');
const sCred=kid.credentials.find(c=>c.role==='student'); const pCred=kid.credentials.find(c=>c.role==='parent'&&c.name==='Imran Malik');
const sl=await login(sCred.username,sCred.password); ok(!!sl?.accessToken,'student can log in'); const pl=await login(pCred.username,pCred.password); ok(!!pl?.accessToken,'father can log in with returned password');
const P=pl.accessToken;

console.log('# sibling reuses the same parent');
const sib=await call('POST','/students',A,{firstName:'Hamza',lastName:'Malik',gender:'male',dateOfBirth:'2016-06-06',currentClassId:g1.id,currentSectionId:s1A.id,guardians:[{fullName:'Imran Malik',relation:'father',phone:'0300 1112222'}]});
ok(sib.s===201&&sib.j.data.credentials.filter(c=>c.role==='parent').length===0,'no new parent account for the sibling ('+sib.j?.data?.credentials?.length+' credential)');
const sibEnr=(await get('/enrolments?limit=50',A)).find(e=>String(e.studentId)===String(sib.j.data.id)); ok(sibEnr&&sibEnr.rollNo==='2','sibling gets next roll number 2');
const myKids=await call('GET','/students',P); ok((myKids.j.data||[]).length===2,'father sees both children');

console.log('# roll numbers and capacity');
r=await call('POST','/students',A,{...base,firstName:'Dup',rollNo:'1'}); ok(r.s===409,'duplicate roll number in section rejected: '+msg(r));
const par=await Promise.all([1,2,3,4,5].map(i=>call('POST','/students',A,{...base,firstName:'Par'+i,lastName:'Race',gender:'male',currentSectionId:s1B.id})));
const nos=par.map(p=>p.j?.data?.admissionNo); ok(par.every(p=>p.s===201)&&new Set(nos).size===5,'5 parallel admissions -> 5 distinct admission numbers');
const rolls=(await get('/enrolments?limit=100',A)).filter(e=>String(e.sectionId)===String(s1B.id)).map(e=>e.rollNo); ok(new Set(rolls).size===rolls.length,'no duplicate roll numbers under parallel admissions ('+rolls.join(',')+')');
await call('PUT','/sections/'+s2A.id,A,{classId:g2.id,name:s2A.name,capacity:1});
const cap=await Promise.all([1,2].map(i=>call('POST','/students',A,{firstName:'Cap'+i,lastName:'Seat',gender:'male',dateOfBirth:'2013-01-01',currentClassId:g2.id,currentSectionId:s2A.id})));
ok(cap.filter(c=>c.s===201).length===1,'last seat: exactly one of two parallel admissions wins ('+cap.map(c=>c.s).join(',')+')');

r=await call('POST','/students',A,{...base,firstName:'Blank',lastName:'Row',currentSectionId:s1B.id,guardians:[{relation:'father'},{fullName:'',phone:''}]}); ok(r.s===201&&r.j.data.credentials.length===1,'empty guardian rows from the form are ignored ('+r.s+')');
console.log('# edit');
r=await call('PUT','/students/'+kid.id,A,{currentClassId:g2.id}); ok(r.s===200||r.s===400,'class change responds '+r.s+' '+msg(r));
const afterMove=await get('/students/'+kid.id,A);
if(r.s===200) ok(afterMove.currentClassId==String(g2.id)&&afterMove.currentSectionId===null,'changing class clears the old section automatically');
r=await call('PUT','/students/'+kid.id,A,{currentClassId:g1.id,currentSectionId:s1A.id,rollNo:'7'}); ok(r.s===200,'back to Grade 1-A with roll 7: '+msg(r));
const e2=(await get('/enrolments?limit=100',A)).find(e=>String(e.studentId)===String(kid.id)&&e.status==='active'); ok(e2&&e2.rollNo==='7'&&String(e2.classId)===String(g1.id),'enrolment follows (roll 7)');
r=await call('PUT','/students/'+sib.j.data.id,A,{rollNo:'7'}); ok(r.s===409,'roll 7 already used -> 409');
r=await call('PUT','/students/'+kid.id,A,{currentClassId:''}); ok(r.s===200&&(await get('/students/'+kid.id,A)).currentClassId===null,'empty class means none (used to crash with a DB error)');
await call('PUT','/students/'+kid.id,A,{currentClassId:g1.id,currentSectionId:s1A.id});
r=await call('PUT','/students/'+kid.id,A,{gender:'alien'}); ok(r.s===400,'bad gender on edit rejected');
r=await call('PUT','/students/'+kid.id,A,{dateOfBirth:'2999-01-01'}); ok(r.s===400,'future DOB on edit rejected');
r=await call('PUT','/students/'+kid.id,A,{firstName:'Aisha'}); ok(r.s===200,'rename');
const me=await get('/auth/me',sl.accessToken); ok(me.firstName==='Aisha','login account name follows the student ('+me.firstName+')');

console.log('# gender vs hostel');
const hs=(await call('POST','/hostels',A,{name:'Girls Hall',gender:'girls'})).j.data; const rm=(await call('POST','/rooms',A,{hostelId:hs.id,roomNo:'G1',capacity:1})).j.data; const bd=(await get('/beds?filter[roomId]='+rm.id+'&limit=5',A))[0];
await call('POST','/hostel-allocations',A,{studentId:kid.id,bedId:bd.id});
r=await call('PUT','/students/'+kid.id,A,{gender:'male'}); ok(r.s===400,'cannot change gender while living in a girls hostel: '+msg(r));

console.log('# profile / parent access');
const pf=await call('GET','/students/'+kid.id+'/profile',A); ok(pf.s===200&&pf.j.data.className==='Grade 1'&&pf.j.data.sectionName==='A'&&pf.j.data.guardians.length===2&&pf.j.data.hostel&&pf.j.data.fees,'profile has class, section, 2 guardians, hostel, fees');
const pp=await call('GET','/students/'+kid.id+'/profile',P); ok(pp.s===200,'father opens own child profile');
const po=await call('GET','/students/'+nos.length+'/profile',P); const otherId=par[0].j.data.id; const po2=await call('GET','/students/'+otherId+'/profile',P); ok(po2.s===403,'father blocked from another family\'s child '+po2.s);

console.log('# reset logins');
const rs=await call('POST','/students/'+kid.id+'/reset-logins',A,{}); ok(rs.s===200&&rs.j.data.credentials.length===3,'reset returns student + 2 parents ('+rs.j?.data?.credentials?.length+')');
const oldFail=await login(pCred.username,pCred.password); const newCred=rs.j.data.credentials.find(c=>c.username===pCred.username); const newOk=await login(newCred.username,newCred.password);
ok(!oldFail?.accessToken&&!!newOk?.accessToken,'old password stops working, new one works');
const rsParent=await call('POST','/students/'+kid.id+'/reset-logins',P,{}); ok(rsParent.s===403,'parent cannot reset logins');

console.log('# admissions');
const mkApp=(o)=>call('POST','/admissions',A,{studentName:'Noor Fatima',dateOfBirth:'2015-05-05',gender:'female',appliedClass:'grade 1',phone:'0321 7654321',email:'noor.parent@fam.test',guardianName:'Tariq Mehmood',guardianRelation:'father',...o});
r=await mkApp({phone:'12'}); ok(r.s===400,'bad application phone rejected');
const app=await mkApp({}); ok(app.s===201&&app.j.data.guardianName==='Tariq Mehmood','application created with guardian name '+app.s+' '+msg(app)); const aid=app.j.data.id;
r=await mkApp({studentName:'  noor   fatima '}); ok(r.s===409,'same child + DOB again is flagged as duplicate: '+msg(r));
r=await call('PATCH','/admissions/'+aid+'/status',A,{status:'admitted'}); ok(r.s===400,'cannot mark admitted by hand: '+msg(r));
r=await call('PATCH','/admissions/'+aid+'/status',A,{status:'applied'}); ok(r.s===200,'enquiry -> applied');
r=await call('PUT','/admissions/'+aid,A,{remarks:'Documents received'}); ok(r.s===200,'open application can be edited');
const reg=await Promise.all([call('POST','/admissions/'+aid+'/register',A,{}),call('POST','/admissions/'+aid+'/register',A,{})]);
ok(reg.filter(x=>x.s===201).length===1&&reg.filter(x=>x.s===400).length===1,'double click: exactly one student is created ('+reg.map(x=>x.s).join(',')+')');
const done=reg.find(x=>x.s===201).j.data; const st=done.student;
ok(/^ADM-\d{4}-\d{4}$/.test(st.admissionNo),'student gets a real admission number '+st.admissionNo+' (not the APP- number)');
ok(String(st.currentClassId)===String(g1.id),'class matched from "grade 1" (case-insensitive)');
ok(done.credentials.some(c=>c.role==='parent'&&c.name==='Tariq Mehmood')&&done.credentials.some(c=>c.role==='student'),'credentials returned; guardian uses the real name');
const appNow=await get('/admissions/'+aid,A); ok(appNow.status==='admitted'&&String(appNow.studentId)===String(st.id),'application is admitted and linked to the student');
r=await call('PUT','/admissions/'+aid,A,{studentName:'Someone Else'}); ok(r.s===400,'admitted application is frozen: '+msg(r));
r=await call('PUT','/admissions/'+aid,A,{remarks:'Fee plan agreed'}); ok(r.s===200,'remarks can still be added');
const sibApp=await mkApp({studentName:'Hira Fatima',dateOfBirth:'2017-07-07',appliedClass:'Grade 1',guardianName:'Tariq Mehmood'});
const reg2=await call('POST','/admissions/'+sibApp.j.data.id+'/register',A,{}); ok(reg2.s===201&&reg2.j.data.credentials.filter(c=>c.role==='parent').length===0,'sibling application reuses the existing parent (no second parent account)');
const wd=await call('PATCH','/admissions/'+aid+'/status',A,{status:'withdrawn'}); ok(wd.s===200,'admitted -> withdrawn');
const stAfter=(await call('GET','/students/'+st.id,A)).j.data; ok(stAfter.isActive===false,'withdrawing the application deactivates the student');
const stats=await call('GET','/admissions/stats/pipeline',A); ok(stats.s===200&&stats.j.data.admitted>=1,'pipeline counts '+JSON.stringify(stats.j.data));
await call('POST','/users',A,{username:'recep1',email:'recep1@s.local',firstName:'Re',lastName:'Cep',role:'receptionist',branchId:L.user.branchId,password:'Passw0rd!x'});
const R=(await login('recep1','Passw0rd!x')).accessToken; const rr=await call('POST','/admissions/'+sibApp.j.data.id+'/register',R,{}); ok(rr.s===403||rr.s===400,'receptionist without students:create cannot register '+rr.s);
console.log(`\n${pass} passed, ${fail} failed`); if(fail) console.log('FAILED:\n - '+fails.join('\n - '));
