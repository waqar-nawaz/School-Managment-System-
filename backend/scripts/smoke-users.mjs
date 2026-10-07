// Users / identity smoke test against a RUNNING API on a FRESH database.
//   npm run dev   ->   npm run smoke:users      (API_BASE overrides http://localhost:3000/api)
const B=process.env.API_BASE||'http://localhost:3000/api';
let pass=0,fail=0;const fails=[];
const ok=(c,m)=>{ if(c){pass++;console.log('  ok  ',m)}else{fail++;fails.push(m);console.log('  FAIL',m)} };
const call=async(m,p,t,b)=>{const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json().catch(()=>null)}};
const get=async(p,t)=>(await call('GET',p,t)).j?.data;
const msg=r=>r.j?.message||'';
const login=async(i,p)=>(await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})}).then(r=>r.json())).data;
const L=await login('superadmin','Admin@123'); const A=L.accessToken; const BR=L.user.branchId;
const mk=(o)=>call('POST','/users',A,{branchId:BR,password:'Passw0rd!x',...o});

console.log('# identity rules');
let r=await mk({username:'Bob.Smith',email:'bob@school.test',firstName:'Bob',lastName:'Smith',role:'accountant'}); ok(r.s===201,'user created '+r.s+' '+msg(r)); const bob=r.j?.data;
r=await mk({username:'bob.smith',email:'other@school.test',firstName:'B',lastName:'S',role:'accountant'}); ok(r.s===409,'username is case-insensitive unique: '+r.s+' '+msg(r));
r=await mk({username:'bob2',email:'BOB@school.test',firstName:'B',lastName:'S',role:'accountant'}); ok(r.s===409,'email is case-insensitive unique: '+r.s+' '+msg(r));
r=await mk({username:'x y',email:'sp@school.test',firstName:'B',lastName:'S',role:'accountant'}); ok(r.s===400||r.s===422,'username with spaces rejected '+r.s);
const lgs=await Promise.all(['BOB@school.test','bob@school.test','bob.smith','Bob.Smith'].map(i=>login(i,'Passw0rd!x'))); ok(lgs.every(x=>!!x?.accessToken),'4 simultaneous logins of one user (email any case / username any case) all succeed');
const rf=await fetch(B+'/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:lgs[0].refreshToken})}); ok(rf.status===200,'refresh right after login works '+rf.status);

console.log('# who can create what');
r=await mk({username:'adm1',email:'adm1@school.test',firstName:'Ad',lastName:'Min',role:'admin'}); ok(r.s===201,'super_admin creates an admin');
const ADM=(await login('adm1','Passw0rd!x')).accessToken;
r=await call('POST','/users',ADM,{username:'sa2',email:'sa2@school.test',firstName:'S',lastName:'A',role:'super_admin',branchId:BR,password:'Passw0rd!x'}); ok(r.s===403,'admin cannot create a super_admin: '+r.s+' '+msg(r));
r=await call('PUT','/users/'+bob.id,ADM,{role:'super_admin'}); ok(r.s===403,'admin cannot promote someone to super_admin: '+r.s+' '+msg(r));
const su=(await get('/users?q=superadmin',A))[0];
r=await call('PUT','/users/'+su.id,ADM,{firstName:'Hacked'}); ok(r.s===403,'admin cannot edit the superadmin account '+r.s);
r=await call('PATCH','/users/'+su.id+'/status',ADM,{isActive:false}); ok(r.s===403,'admin cannot deactivate the superadmin '+r.s);
r=await call('DELETE','/users/'+su.id,A); ok(r.s===403,'nobody can delete the superadmin '+r.s);
r=await call('DELETE','/users/'+L.user.id,A); ok(r.s>=400,'cannot delete yourself '+r.s);
const bobAcc=(await login('bob.smith','Passw0rd!x')).accessToken; r=await call('POST','/users',bobAcc,{username:'zz1',email:'zz1@school.test',firstName:'Z',lastName:'Z',role:'teacher',branchId:BR,password:'Passw0rd!x'}); ok(r.s===403,'accountant cannot create users '+r.s);
r=await call('POST','/users',ADM,{username:'zz2',email:'zz2@school.test',firstName:'Z',lastName:'Z',role:'teacher',branchId:99999,password:'Passw0rd!x'}); ok(r.s===201&&String(r.j.data.branchId)===String(BR),'a branch admin cannot place users in another branch: it is forced to their own ('+r.j?.data?.branchId+')');

console.log('# roles that need a real record');
r=await mk({username:'stud1',email:'stud1@school.test',firstName:'Ghost',lastName:'Student',role:'student'}); ok(r.s===400,'student logins are made by admitting a student, not from Users: '+r.s+' '+msg(r));
r=await mk({username:'par1',email:'par1@school.test',firstName:'Pat',lastName:'Parent',role:'parent'}); ok(r.s===201,'parent login ok');
const parents=await get('/parents?limit=50',A); ok(parents.some(p=>p.email==='par1@school.test'),'...and its Parent profile exists');
const par=(await get('/users?q=par1',A))[0];
r=await call('PUT','/users/'+par.id,A,{role:'student'}); ok(r.s===400,'cannot turn a login into a student by editing the role: '+r.s+' '+msg(r));

console.log('# deleting a user');
r=await call('POST','/employees',A,{firstName:'Wanda',lastName:'Warden',role:'hostel_warden',email:'wanda@school.test',basicSalary:30000}); const wanda=r.j.data;
const wStaff=(await get('/staff?limit=100',A)).find(s=>s.email==='wanda@school.test');
const del=await call('DELETE','/users/'+wStaff.userId,A); ok(del.s===200,'user deleted '+del.s+' '+msg(del));
const wAfter=(await get('/staff?limit=100',A)).find(s=>s.email==='wanda@school.test'); ok(wAfter&&wAfter.isActive===false,'the profile of a deleted login is deactivated (no more payroll)'+' ['+wAfter?.isActive+']');
const gen=await call('POST','/payroll/generate',A,{month:new Date().toISOString().slice(0,7)}); ok(!(gen.j.data.people||[]).some(p=>p.name.startsWith('Wanda')),'...and she is not on payroll');

console.log('# warden post follows the employee');
const w2=(await call('POST','/employees',A,{firstName:'Waqas',lastName:'Warden',role:'hostel_warden',email:'waqas@school.test'})).j.data;
const w2s=(await get('/staff?limit=100',A)).find(s=>s.email==='waqas@school.test');
const acc2=(await call('POST','/employees',A,{firstName:'Aqib',lastName:'Acc',role:'accountant',email:'aqib@school.test'})).j.data; const accS=(await get('/staff?limit=100',A)).find(s=>s.email==='aqib@school.test');
r=await call('POST','/hostels',A,{name:'Warden Block',gender:'boys',wardenId:accS.id}); ok(r.s===400,'an accountant cannot be made warden: '+msg(r));
r=await call('POST','/hostels',A,{name:'Warden Block',gender:'boys',wardenId:w2s.id}); ok(r.s===201,'hostel with a hostel_warden employee '+r.s+' '+msg(r)); const wh=r.j?.data;
let hl=(await get('/hostels?limit=50',A)).find(h=>String(h.id)===String(wh.id)); ok(hl.wardenName==='Waqas Warden','hostel shows the warden name');
await call('PUT','/users/'+w2s.userId,A,{role:'librarian'}); hl=(await get('/hostels?limit=50',A)).find(h=>String(h.id)===String(wh.id)); ok(hl.wardenId===null,'changing the warden\'s job clears the hostel\'s warden');
await call('PUT','/users/'+w2s.userId,A,{role:'hostel_warden'}); await call('PUT','/hostels/'+wh.id,A,{name:'Warden Block',gender:'boys',wardenId:w2s.id});
await call('PATCH','/users/'+w2s.userId+'/status',A,{isActive:false}); hl=(await get('/hostels?limit=50',A)).find(h=>String(h.id)===String(wh.id)); ok(hl.wardenId===null,'deactivating the warden clears the hostel\'s warden');

console.log(`\n${pass} passed, ${fail} failed`); if(fail) console.log('FAILED:\n - '+fails.join('\n - '));
