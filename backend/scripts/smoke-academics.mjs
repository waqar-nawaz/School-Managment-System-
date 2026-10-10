// Academics smoke test: Admissions -> Students -> Enrolments -> Class subjects -> Exams -> Results ->
// Gradebook -> Report cards -> Timetable/Periods -> Attendance -> Assignments -> Syllabus/Lesson plans.
// Runs against a RUNNING API on a FRESH database (it creates data).
//   npm run dev   ->   npm run smoke:academics      (API_BASE overrides http://localhost:3000/api)
const B = process.env.API_BASE || 'http://localhost:3000/api';
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; fails.push(m); console.log('  FAIL', m); } };
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const get = async (p, t) => { const r = await call('GET', p, t); if (r.s !== 200 || r.j?.data == null) { console.log('  (GET ' + p + ' -> ' + r.s + ' ' + (r.j?.message || '') + ')'); return []; } return r.j.data; };
const msg = (r) => r.j?.message || '';
const login = async (i, p) => (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: i, password: p }) }).then((r) => r.json())).data;
const L = await login('superadmin', 'Admin@123'); const A = L.accessToken;
const iso = (d) => new Date(d).toISOString().slice(0, 10);

const classes = await get('/classes?limit=50', A); const g1 = classes.find((c) => c.name === 'Grade 1'); const g2 = classes.find((c) => c.name === 'Grade 2');
const secs = await get('/sections?limit=200', A); const s1A = secs.find((s) => s.classId === g1.id && s.name === 'A'); const s1B = secs.find((s) => s.classId === g1.id && s.name === 'B'); const s2A = secs.find((s) => s.classId === g2.id && s.name === 'A');
const subjects = await get('/subjects?limit=50', A); const math = subjects.find((s) => s.name === 'Mathematics'); const eng = subjects.find((s) => s.name === 'English'); const art = subjects.find((s) => s.name === 'Art');
const year = (await get('/academic-years?limit=20', A)).find((y) => y.isCurrent); const terms = await get('/terms?limit=20', A); const t1 = terms.find((t) => t.name === 'Term 1');
const yStart = iso(year.startDate), yEnd = iso(year.endDate);

console.log('# structure validation');
let r = await call('POST', '/terms', A, { academicYearId: year.id, name: 'Term 2', startDate: yStart, endDate: yEnd });
ok(r.s === 400, 'duplicate term name in a year is rejected even when it is not the first term: ' + r.s + ' ' + msg(r));
r = await call('POST', '/academic-years', A, { name: year.name, startDate: '2040-07-01', endDate: '2041-06-30' }); ok(r.s === 400 || r.s === 409, 'duplicate academic year name rejected: ' + r.s + ' ' + msg(r));
r = await call('POST', '/academic-years', A, { name: 'A'.repeat(40), startDate: '2040-07-01', endDate: '2041-06-30' }); ok(r.s === 400 && /30/.test(msg(r)), 'academic year name length explained: ' + msg(r));
r = await call('POST', '/classes', A, { name: 'Lvl Test', level: 'L'.repeat(30), capacity: 10 }); ok(r.s === 400 && /20/.test(msg(r)), 'class level length explained: ' + msg(r));
r = await call('POST', '/grade-scales', A, { name: 'N'.repeat(80), grade: 'Z', minPercentage: 200, maxPercentage: 300 }); ok(r.s === 400, 'grade scale name > 50 chars / bad range rejected');
const branch = (await get('/branches?limit=5', A))[0]; r = await call('PUT', '/branches/' + branch.id, A, { email: 'campus@school.test' }); ok(r.s === 200, 'branch with a valid email can be saved: ' + r.s + ' ' + msg(r));
r = await call('POST', '/terms', A, { academicYearId: year.id, name: 'Term 9', startDate: yStart, endDate: yEnd, isCurrent: true }); ok(r.s === 400, 'only one current term: ' + r.s + ' ' + msg(r));
r = await call('POST', '/terms', A, { academicYearId: year.id, name: 'Term 8', startDate: yStart, endDate: yEnd, isCurrent: false }); ok(r.s === 201 && r.j.data.isCurrent === false, 'term can be created as not current');
await call('DELETE', '/terms/' + r.j?.data?.id, A);

console.log('# class subjects (which subject belongs to which class)');
for (const s of [math, eng]) { r = await call('POST', '/class-subjects', A, { classId: g1.id, subjectId: s.id }); ok(r.s === 201, 'assign ' + s.name + ' to Grade 1'); }
r = await call('POST', '/class-subjects', A, { classId: g1.id, subjectId: math.id }); ok(r.s === 400, 'assigning twice rejected');
const csList = await get('/class-subjects?limit=50&filter[classId]=' + g1.id, A); ok(csList.length === 2 && csList.every((c) => c.subjectName), 'class-subjects rows carry subjectName for dropdowns: ' + JSON.stringify(csList[0]));

console.log('# a teacher and two families');
r = await call('POST', '/employees', A, { firstName: 'Rabia', lastName: 'Khan', role: 'teacher', email: 'rabia@school.test', phone: '0300 5551111', gender: 'female', hireDate: '2025-04-01', basicSalary: 60000 });
ok(r.s === 201, 'teacher hired ' + r.s + ' ' + msg(r)); const tCred = r.j.data.credentials[0]; const T = (await login(tCred.username, tCred.password)).accessToken;
const rabia = (await get('/teachers?limit=50', A)).find((t) => t.email === 'rabia@school.test');
r = await call('POST', '/employees', A, { firstName: 'Omar', lastName: 'Sheikh', role: 'teacher', email: 'omar@school.test', phone: '0300 5552222', gender: 'male', hireDate: '2025-04-01', basicSalary: 50000 });
const omar = (await get('/teachers?limit=50', A)).find((t) => t.email === 'omar@school.test');
const fam = async (first, phone, section) => (await call('POST', '/students', A, { firstName: first, lastName: 'Fam', gender: 'male', dateOfBirth: '2015-02-02', currentClassId: g1.id, currentSectionId: section, guardians: [{ fullName: first + ' Parent', relation: 'father', phone }] })).j.data;
const kidA = await fam('Aamir', '0300 1110001', s1A.id); const kidB = await fam('Bilal', '0300 1110002', s1A.id);
const PA = (await login(kidA.credentials.find((c) => c.role === 'parent').username, kidA.credentials.find((c) => c.role === 'parent').password)).accessToken;
const SA = (await login(kidA.credentials.find((c) => c.role === 'student').username, kidA.credentials.find((c) => c.role === 'student').password)).accessToken;
const SB = (await login(kidB.credentials.find((c) => c.role === 'student').username, kidB.credentials.find((c) => c.role === 'student').password)).accessToken;

console.log('# enrolments stay connected to the student record');
const loose = (await call('POST', '/students', A, { firstName: 'Loose', lastName: 'End', gender: 'female', dateOfBirth: '2015-03-03' })).j.data;
r = await call('POST', '/enrolments', A, { studentId: loose.id, academicYearId: year.id, classId: g1.id, sectionId: s1B.id, rollNo: '1' }); ok(r.s === 201, 'enrol a student with no class yet: ' + r.s + ' ' + msg(r));
let st = await get('/students/' + loose.id, A); ok(String(st.currentClassId) === String(g1.id) && String(st.currentSectionId) === String(s1B.id), 'student record now shows Grade 1-B (was ' + st.currentClassId + '/' + st.currentSectionId + ')');
const looseEnrol = r.j?.data;
r = await call('POST', '/enrolments', A, { studentId: kidB.id, academicYearId: year.id, classId: g1.id, sectionId: s1A.id, rollNo: '1', status: 'withdrawn' }); ok(r.s === 400 && /already/i.test(msg(r)), 'second enrolment for the same student + year gets a clear message (not a DB error): ' + r.s + ' ' + msg(r));
r = await call('POST', '/enrolments', A, { studentId: loose.id, academicYearId: year.id, classId: g1.id, sectionId: s1B.id, rollNo: 'R'.repeat(60) }); ok(r.s === 400, 'enrolment roll number length checked');
const kidC = (await call('POST', '/students', A, { firstName: 'Cara', lastName: 'Roll', gender: 'female', dateOfBirth: '2015-03-03' })).j.data;
r = await call('POST', '/enrolments', A, { studentId: kidC.id, academicYearId: year.id, classId: g1.id, sectionId: s1B.id, rollNo: '1' }); ok(r.s === 409 || r.s === 400, 'duplicate roll number in a section rejected: ' + r.s + ' ' + msg(r));
r = await call('PUT', '/enrolments/' + looseEnrol.id, A, { classId: g2.id, sectionId: s2A.id, studentId: loose.id, academicYearId: year.id }); ok(r.s === 200, 'move enrolment to Grade 2-A: ' + msg(r));
st = await get('/students/' + loose.id, A); ok(String(st.currentClassId) === String(g2.id), 'student follows the enrolment move (Grade 2)');
await call('PUT', '/enrolments/' + looseEnrol.id, A, { classId: g1.id, sectionId: s1B.id, studentId: loose.id, academicYearId: year.id });
const enrolList = await get('/enrolments?limit=100&q=Aamir', A); ok(enrolList.length >= 1 && enrolList[0].studentName, 'enrolments can be searched by student name and show it: ' + JSON.stringify(enrolList[0] || {}).slice(0, 160));

console.log('# exams, schedule, results -> grades');
r = await call('POST', '/exams', A, { name: 'Midterm', examType: 'midterm', academicYearId: year.id, termId: t1.id, startDate: yStart, endDate: yEnd, maxMarks: 100, status: 'published' }); ok(r.s === 201, 'exam created ' + msg(r)); const exam = r.j.data;
r = await call('POST', '/exams', A, { name: 'X'.repeat(130), academicYearId: year.id, startDate: yStart, endDate: yEnd }); ok(r.s === 400 && /120/.test(msg(r)), 'exam name length explained: ' + msg(r));
r = await call('POST', '/exam-schedules', A, { examId: exam.id, classId: g1.id, subjectId: math.id, date: yStart, startTime: '9:00', endTime: '10:30', room: 'R1' }); ok(r.s === 201, 'schedule Math ' + msg(r));
r = await call('POST', '/exam-schedules', A, { examId: exam.id, classId: g1.id, subjectId: eng.id, date: yStart, startTime: '10:00', endTime: '11:00', room: 'R2' }); ok(r.s === 400, 'two papers for the same class overlapping in time rejected: ' + r.s + ' ' + msg(r));
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidA.id, subjectId: art.id, marksObtained: 50, maxMarks: 100 }); ok(r.s === 400, 'result for a subject not assigned to the class rejected');
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidA.id, subjectId: math.id, marksObtained: 85.5, maxMarks: 100 }); ok(r.s === 201, 'Aamir Math 85.5/100 ' + msg(r));
ok(r.j?.data?.grade === 'A', 'grade is worked out from the grade scale (got ' + r.j?.data?.grade + ')'); ok(String(r.j?.data?.enteredBy) === String(L.user.id), 'enteredBy is the logged-in user (got ' + r.j?.data?.enteredBy + ')');
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidA.id, subjectId: eng.id, marksObtained: 70, maxMarks: 100 }); ok(r.s === 201 && r.j.data.grade === 'B+', 'Aamir English 70 -> B+ (got ' + r.j?.data?.grade + ')');
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidB.id, subjectId: math.id, marksObtained: 40, maxMarks: 100 }); ok(r.s === 201 && r.j.data.grade === 'D', 'Bilal Math 40 -> D');
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidB.id, subjectId: eng.id, marksObtained: 30, maxMarks: 100 }); ok(r.s === 201 && r.j.data.grade === 'F', 'Bilal English 30 -> F');
r = await call('POST', '/exam-results', A, { examId: exam.id, studentId: kidA.id, subjectId: math.id, marksObtained: 10, maxMarks: 100 }); ok(r.s === 400, 'duplicate result rejected');
const resA = (await get('/exam-results?limit=50&filter[studentId]=' + kidA.id, A)).find((x) => String(x.subjectId) === String(math.id)); r = await call('PUT', '/exam-results/' + resA.id, A, { marksObtained: 95 }); ok(r.s === 200 && r.j.data.grade === 'A+', 'editing marks re-grades (got ' + r.j?.data?.grade + ')');
await call('PUT', '/exam-results/' + resA.id, A, { marksObtained: 85.5 });

console.log('# gradebook');
r = await call('POST', '/gradebook', A, { studentId: kidA.id, termId: t1.id, subjectId: math.id, continuousAvg: 80, examScore: 90 }); ok(r.s === 201, 'gradebook entry ' + msg(r));
ok(Number(r.j?.data?.total) === 85 && r.j?.data?.grade === 'A', 'total and grade are filled in (total ' + r.j?.data?.total + ', grade ' + r.j?.data?.grade + ')');

console.log('# report cards pull everything together');
const enrA = (await get('/enrolments?limit=100&filter[studentId]=' + kidA.id, A))[0]; const enrB = (await get('/enrolments?limit=100&filter[studentId]=' + kidB.id, A))[0];
r = await call('POST', '/report-cards', A, { enrolmentId: enrA.id, termId: t1.id, teacherRemarks: 'Good', isPublished: false }); ok(r.s === 201, 'report card A ' + msg(r)); const rcA = r.j.data;
ok(Number(rcA.obtainedMarks) === 155.5 && Number(rcA.totalMarks) === 200 && Math.abs(Number(rcA.percentage) - 77.75) < 0.01, 'totals computed: ' + rcA.obtainedMarks + '/' + rcA.totalMarks + ' = ' + rcA.percentage);
ok(rcA.grade === 'B+' && Number(rcA.rankInClass) === 1, 'grade B+ and rank 1 (got ' + rcA.grade + ', rank ' + rcA.rankInClass + ')'); ok(rcA.subjectWise && JSON.stringify(rcA.subjectWise).includes('Mathematics'), 'subject-wise breakdown stored');
r = await call('POST', '/report-cards', A, { enrolmentId: enrB.id, termId: t1.id }); const rcB = r.j?.data; ok(r.s === 201 && Number(rcB.rankInClass) === 2, 'Bilal ranks 2nd (got ' + rcB?.rankInClass + ')');
r = await call('POST', '/report-cards', A, { enrolmentId: enrB.id, termId: t1.id }); ok(r.s === 400, 'one report card per enrolment + term');

console.log('# parents and students only see their own academic records');
let list = await get('/exam-results?limit=100', PA); ok(list.length === 2 && list.every((x) => String(x.studentId) === String(kidA.id)), 'parent sees only own child results (' + list?.length + ' rows)');
list = await get('/exam-results?limit=100', SB); ok(list.every((x) => String(x.studentId) === String(kidB.id)) && list.length === 2, 'student sees only own results');
list = await get('/report-cards?limit=100', PA); ok(list.length === 0, 'unpublished report cards are hidden from the family (' + list?.length + ')');
await call('PUT', '/report-cards/' + rcA.id, A, { isPublished: true });
list = await get('/report-cards?limit=100', PA); ok(list.length === 1 && String(list[0].studentId) === String(kidA.id), 'published report card visible to own parent only');
list = await get('/gradebook?limit=100', SB); ok(list.length === 0, 'student cannot read a classmate gradebook');
list = await get('/enrolments?limit=100', PA); ok(list.every((x) => String(x.studentId) === String(kidA.id)), 'parent sees only own enrolments');
list = await get('/exam-results?limit=100', A); ok(list.length >= 4, 'admin still sees every result');

console.log('# assignments and submissions');
const due = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
r = await call('POST', '/assignments', A, { title: 'T'.repeat(170), classId: g1.id, subjectId: math.id, maxMarks: 10 }); ok(r.s === 400 && /160/.test(msg(r)), 'assignment title length explained: ' + msg(r));
r = await call('POST', '/assignments', T, { title: 'Fractions', classId: g1.id, subjectId: math.id, maxMarks: 10, dueDate: due }); ok(r.s === 201, 'teacher creates assignment ' + msg(r)); const asg = r.j?.data;
ok(String(asg?.createdBy) === String(rabia.id), 'assignment is attributed to the teacher who created it (got ' + asg?.createdBy + ')');
list = await get('/assignments?limit=50', SA); ok(list.length === 1, 'student sees assignments of own class');
r = await call('POST', '/submissions', SA, { assignmentId: asg.id, studentId: kidB.id, content: 'cheat' }); ok(r.s === 403 || r.s === 400, 'student cannot submit as somebody else: ' + r.s);
r = await call('POST', '/submissions', SA, { assignmentId: asg.id, content: 'my work' }); ok(r.s === 201, 'student submits own work ' + msg(r)); const sub = r.j?.data;
ok(!!sub?.submittedAt && sub?.status === 'late', 'submission time is recorded and marked late after the due date (status ' + sub?.status + ')');
r = await call('PUT', '/submissions/' + sub.id, T, { marksAwarded: 8 }); ok(r.s === 200 && r.j.data.status === 'graded', 'giving marks marks it graded (got ' + r.j?.data?.status + ')');
r = await call('PUT', '/submissions/' + sub.id, T, { marksAwarded: 80 }); ok(r.s === 400, 'marks above assignment max rejected');

console.log('# periods and timetable');
r = await call('POST', '/timetable', A, { name: 'Grade 1-A 2026', classId: g1.id, sectionId: s1A.id }); ok(r.s === 201, 'timetable created ' + msg(r)); const tt = r.j.data;
r = await call('POST', '/periods', A, { classId: g1.id, sectionId: s1A.id, dayOfWeek: 'MON', startTime: '8:00', endTime: '8:45', subjectId: math.id, teacherId: rabia.id, room: 'R1' }); ok(r.s === 201, 'period 1 ' + msg(r)); const p1 = r.j.data;
ok(p1?.startTime === '08:00', 'times are stored zero-padded (got ' + p1?.startTime + ')');
r = await call('POST', '/periods', A, { classId: g1.id, sectionId: s1A.id, dayOfWeek: 'MON', startTime: '08:30', endTime: '09:15', subjectId: eng.id, teacherId: omar.id }); ok(r.s === 400, 'overlapping period for the same class/section rejected: ' + r.s + ' ' + msg(r));
r = await call('POST', '/periods', A, { classId: g1.id, sectionId: s1B.id, dayOfWeek: 'MON', startTime: '08:15', endTime: '09:00', subjectId: eng.id, teacherId: rabia.id }); ok(r.s === 400, 'teacher cannot be in two places at once: ' + r.s + ' ' + msg(r));
r = await call('POST', '/periods', A, { classId: g1.id, sectionId: s1A.id, dayOfWeek: 'MON', startTime: '08:45', endTime: '09:30', subjectId: eng.id, teacherId: omar.id }); ok(r.s === 201, 'back-to-back period is fine ' + msg(r));
const grid = (await get('/timetable/' + tt.id, A))?.weeklyGrid; ok(grid && Array.isArray(grid.MON) && grid.MON.length === 2, 'timetable weeklyGrid is built from its periods: ' + JSON.stringify(grid)?.slice(0, 120));
const tList = await get('/teachers?limit=50', A); ok(tList.length >= 2, 'teachers listed');

console.log('# attendance');
r = await call('POST', '/attendance/bulk', T, { classId: g1.id, sectionId: s1A.id, date: yStart, entries: [{ studentId: kidA.id, status: 'present', lateMinutes: 15, reason: 'bus' }, { studentId: kidB.id, status: 'late', lateMinutes: 10, reason: 'traffic' }] }); ok(r.s === 200, 'assigned teacher marks attendance ' + msg(r));
r = await call('POST', '/attendance/bulk', A, { classId: g1.id, sectionId: s1A.id, date: '2999-01-01', entries: [{ studentId: kidA.id, status: 'present' }] }); ok(r.s === 400, 'attendance for a future date rejected: ' + r.s + ' ' + msg(r));
const reg = (await get('/attendance/register?classId=' + g1.id + '&sectionId=' + s1A.id + '&date=' + yStart, A)).register; const ra = reg.find((x) => String(x.studentId) === String(kidA.id));
ok(ra.status === 'present' && ra.lateMinutes === 0 && !ra.reason, 'late minutes / reason are cleared when the status is not late/absent (got ' + ra.lateMinutes + '/' + ra.reason + ')');
ok(reg.some((x) => String(x.studentId) === String(loose.id)) === false, 'register for 1-A does not list a 1-B student');
const monthly = await get('/attendance/student/' + kidA.id + '?month=' + yStart.slice(0, 7), PA); ok(Array.isArray(monthly) && monthly.length === 1, 'parent can read own child monthly attendance');
r = await call('GET', '/attendance/student/' + kidB.id, PA); ok(r.s === 403, 'parent cannot read another child');

console.log('# syllabus and lesson plans');
r = await call('POST', '/syllabus', A, { title: 'Term 1 Maths', classId: g1.id, subjectId: math.id, __lessonPlan: true, teacherId: 999999 }); ok(r.s === 201, 'client cannot flip the validator with __lessonPlan: ' + r.s + ' ' + msg(r));
ok(!!r.j?.data?.publishedAt, 'published syllabus gets a publish date (got ' + r.j?.data?.publishedAt + ')');
r = await call('POST', '/syllabus', A, { title: 'Art', classId: g1.id, subjectId: art.id }); ok(r.s === 400, 'syllabus subject must belong to the class');
r = await call('POST', '/lesson-plans', T, { title: 'Fractions intro', classId: g1.id, subjectId: math.id, plannedDate: yStart }); ok(r.s === 201, 'teacher creates lesson plan ' + msg(r));
ok(String(r.j?.data?.teacherId) === String(rabia.id), 'lesson plan teacher defaults to the logged-in teacher (got ' + r.j?.data?.teacherId + ')');
r = await call('POST', '/lesson-plans', A, { title: 'No class' }); ok(r.s === 400, 'lesson plan needs a class');

console.log('# admissions edge cases');
r = await call('POST', '/admissions', A, { studentName: 'Zara Noor', appliedClass: 'Grade 1', dateOfBirth: '2016-01-01', email: 'zara@fam.test', gender: 'female', phone: '0300 9998887' }); ok(r.s === 201, 'application created'); const app = r.j.data;
r = await call('PUT', '/admissions/' + app.id, A, { studentName: 'Zara Noor', appliedClass: 'Grade 1', dateOfBirth: null, email: null, gender: null }); ok(r.s === 200 && r.j.data.dateOfBirth === null && r.j.data.email === null && r.j.data.gender === null, 'date of birth, email and gender can be cleared: ' + JSON.stringify({ d: r.j?.data?.dateOfBirth, e: r.j?.data?.email, g: r.j?.data?.gender }));
const today = new Date(); r = await call('POST', '/admissions', A, { studentName: 'Late Night', appliedClass: 'Grade 1', dateApplied: new Date(today.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) }); ok(r.s === 201, "today's date in a timezone ahead of UTC is accepted: " + r.s + ' ' + msg(r));

console.log('# deleting things that are in use');
r = await call('DELETE', '/classes/' + g1.id, A); ok(r.s === 400 || r.s === 409, 'class with sections/students cannot be deleted: ' + r.s + ' ' + msg(r)); ok(/in use|used|has|cannot/i.test(msg(r)), 'with a readable reason: ' + msg(r));
r = await call('DELETE', '/subjects/' + math.id, A); ok((r.s === 400 || r.s === 409) && /in use|used|has|cannot/i.test(msg(r)), 'subject used by a class cannot be deleted: ' + r.s + ' ' + msg(r));
r = await call('DELETE', '/academic-years/' + year.id, A); ok((r.s === 400 || r.s === 409) && /in use|used|has|cannot/i.test(msg(r)), 'academic year with enrolments cannot be deleted: ' + r.s + ' ' + msg(r));
r = await call('DELETE', '/exams/' + exam.id, A); ok((r.s === 400 || r.s === 409) && /in use|used|has|cannot/i.test(msg(r)), 'exam with results cannot be deleted: ' + r.s + ' ' + msg(r));
r = await call('DELETE', '/assignments/' + asg.id, A); ok((r.s === 400 || r.s === 409) && /submission|in use|has|cannot/i.test(msg(r)), 'assignment with submissions cannot be deleted: ' + r.s + ' ' + msg(r));
const spare = await call('POST', '/subjects', A, { name: 'Spare Subject', maxMarks: 100, passMarks: 35 }); r = await call('DELETE', '/subjects/' + spare.j.data.id, A); ok(r.s === 200, 'an unused subject can still be deleted');

console.log('\n' + pass + ' passed, ' + fail + ' failed'); if (fail) { console.log('FAILED:'); fails.forEach((f) => console.log(' - ' + f)); process.exit(1); }
