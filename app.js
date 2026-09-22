import { firebaseConfig } from './firebase-config.js';

const DEFAULT_STATE = {
  groups:[
    {id:'kuristiku',name:'KURISTIKU'},
    {id:'mustakivi',name:'MUSTAKIVI'},
    {id:'all-gcb',name:'ALL GCB'}
  ],
  students:[
    {id:'s1',name:'Angelina Pavlova',groupId:'kuristiku',phone:'+372 5555 1234',notes:'Очень старается, хорошая динамика!'},
    {id:'s2',name:'Eva Minina',groupId:'kuristiku',phone:'+372 5566 2345',notes:''},
    {id:'s3',name:'Mihhail Belev',groupId:'kuristiku',phone:'+372 5555 9876',notes:'Хорошо прогрессирует'},
    {id:'s4',name:'Michael Zovmer',groupId:'kuristiku',phone:'+372 5666 1122',notes:''},
    {id:'s5',name:'Georgiy Ivanov',groupId:'kuristiku',phone:'+372 5555 6677',notes:'Иногда опаздывает'},
    {id:'s6',name:'Polina Sokolova',groupId:'kuristiku',phone:'+372 5444 8899',notes:''}
  ],
  attendance:{},
  settings:{selectedGroup:'kuristiku'}
};

const els={view:document.querySelector('#view'),modal:document.querySelector('#modal'),sync:document.querySelector('#syncBadge'),auth:document.querySelector('#authOverlay'),authMsg:document.querySelector('#authMsg')};
let state=loadLocal();
let page='attendance';
let selectedDate=todayISO();
let monthCursor=new Date(); monthCursor.setDate(1);
let currentGroup=null,currentStudent=null;
let cloud={enabled:false,auth:null,db:null,user:null,unsub:null,fire:null,saving:false};

function loadLocal(){try{return JSON.parse(localStorage.getItem('gcbAttendanceState'))||structuredClone(DEFAULT_STATE)}catch{return structuredClone(DEFAULT_STATE)}}
function saveLocal(){localStorage.setItem('gcbAttendanceState',JSON.stringify(state))}
function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]))}
function groupName(id){return state.groups.find(g=>g.id===id)?.name||'Без группы'}
function studentsForGroup(id){if(id==='all-gcb')return state.students;return state.students.filter(s=>s.groupId===id)}
function monthKey(dateStr){return dateStr.slice(0,7)}
function attendanceFor(studentId,date){return state.attendance?.[date]?.[studentId]||null}
function monthStats(studentId,mk){const dates=Object.keys(state.attendance).filter(d=>d.startsWith(mk));let total=0,present=0;for(const d of dates){const v=attendanceFor(studentId,d);if(v){total++;if(v==='present')present++;}}return{total,present,pct:total?Math.round(present/total*100):0}}
function anyAttendanceOn(date){return !!(state.attendance[date]&&Object.keys(state.attendance[date]).length)}
function setSync(text,mode='local'){els.sync.className=`sync-badge ${mode}`;els.sync.textContent=text}

async function initCloud(){
  if(!firebaseConfig?.apiKey||!firebaseConfig?.projectId){setSync('● Локально','local');render();return}
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const app=appMod.initializeApp(firebaseConfig);
    cloud.auth=authMod.getAuth(app); cloud.db=fsMod.getFirestore(app); cloud.fire={...authMod,...fsMod}; cloud.enabled=true;
    authMod.onAuthStateChanged(cloud.auth, async user=>{
      cloud.user=user||null;
      if(user){els.auth.classList.add('hidden');await subscribeCloud();setSync('● Синхронизировано','online');}
      else{els.auth.classList.remove('hidden');setSync('● Требуется вход','local');}
    });
  }catch(e){console.error(e);setSync('● Ошибка облака','error');render();}
}

async function subscribeCloud(){
  if(cloud.unsub)cloud.unsub();
  const {doc,onSnapshot,setDoc}=cloud.fire;
  const ref=doc(cloud.db,'users',cloud.user.uid,'app','main');
  cloud.unsub=onSnapshot(ref,async snap=>{
    if(snap.exists()){
      const incoming=snap.data();
      if(incoming?.groups&&incoming?.students){state=incoming;saveLocal();render();}
    }else{await setDoc(ref,state);}
  },err=>{console.error(err);setSync('● Ошибка синхронизации','error')});
}
async function persist(){saveLocal();render();if(cloud.enabled&&cloud.user){try{cloud.saving=true;setSync('● Сохраняю…','online');const {doc,setDoc}=cloud.fire;await setDoc(doc(cloud.db,'users',cloud.user.uid,'app','main'),state);setSync('● Синхронизировано','online')}catch(e){console.error(e);setSync('● Ошибка сохранения','error')}finally{cloud.saving=false}}}

function render(){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));if(page==='attendance')renderAttendance();if(page==='groups')renderGroups();if(page==='children')renderChildren();if(page==='more')renderMore();}

function renderAttendance(){
  const gid=state.settings.selectedGroup||state.groups[0]?.id||'all-gcb';
  const list=studentsForGroup(gid); const marked=list.filter(s=>attendanceFor(s.id,selectedDate)).length; const pct=list.length?Math.round(marked/list.length*100):0;
  const mk=monthKey(selectedDate);
  els.view.innerHTML=`<div class="title-row"><h1>Посещаемость</h1></div>
  <div class="toolbar">
    <div class="field"><label>Месяц</label><input id="monthPick" type="month" value="${mk}"></div>
    <div class="field"><label>Группа</label><select id="groupPick">${state.groups.map(g=>`<option value="${g.id}" ${g.id===gid?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
  </div>
  <div class="card summary-card"><div class="ring" style="--p:${pct}"></div><div class="summary-text"><strong>Сегодня: ${marked} из ${list.length} отмечены</strong><span>${pct}% · выбранная дата ${formatDate(selectedDate)}</span></div><div class="chev">›</div></div>
  <div class="card calendar-card">${calendarHTML()}</div>
  <div class="card student-table">
    <div class="table-head"><div>#</div><div>Имя</div><div>Группа</div><div>Посещаемость</div><div>Статус</div></div>
    ${list.length?list.map((s,i)=>{const st=monthStats(s.id,mk);const a=attendanceFor(s.id,selectedDate);return `<div class="student-row" data-student="${s.id}"><div>${i+1}</div><div class="name">${esc(s.name)}</div><div><span class="pill">${esc(groupName(s.groupId))}</span></div><div>${st.present}/${st.total} · ${st.pct}%</div><div class="status-actions"><button class="round yes ${a==='present'?'':'off'}" data-att="present">✓</button><button class="round no ${a==='absent'?'':'off'}" data-att="absent">×</button></div></div>`}).join(''):`<div class="empty">В этой группе пока нет учеников.</div>`}
  </div>
  <div class="cloud-card" style="margin-top:16px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled?'Облачная база данных включена':'Локальное сохранение включено'}</b><div class="subtitle">${cloud.enabled?'Изменения синхронизируются между устройствами.':'После настройки Firebase данные будут синхронизироваться.'}</div></div></div>`;
  document.querySelector('#groupPick').addEventListener('change',e=>{state.settings.selectedGroup=e.target.value;persist()});
  document.querySelector('#monthPick').addEventListener('change',e=>{const [y,m]=e.target.value.split('-').map(Number);monthCursor=new Date(y,m-1,1);selectedDate=`${e.target.value}-01`;render()});
  els.view.querySelectorAll('[data-att]').forEach(btn=>btn.addEventListener('click',()=>{const row=btn.closest('[data-student]');const sid=row.dataset.student;state.attendance[selectedDate]??={};const next=btn.dataset.att;state.attendance[selectedDate][sid]=attendanceFor(sid,selectedDate)===next?null:next;if(state.attendance[selectedDate][sid]===null)delete state.attendance[selectedDate][sid];if(Object.keys(state.attendance[selectedDate]).length===0)delete state.attendance[selectedDate];persist()}));
  bindCalendar();
}

function calendarHTML(){
  const y=monthCursor.getFullYear(),m=monthCursor.getMonth();const first=new Date(y,m,1);const start=(first.getDay()+6)%7;const days=new Date(y,m+1,0).getDate();const title=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(first);
  let cells=['пн','вт','ср','чт','пт','сб','вс'].map(d=>`<div class="dow">${d}</div>`).join('');for(let i=0;i<start;i++)cells+='<div></div>';
  for(let d=1;d<=days;d++){const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;cells+=`<button class="day ${iso===selectedDate?'selected':''}" data-date="${iso}">${d}${anyAttendanceOn(iso)?'<span class="dot"></span>':''}</button>`}
  return `<div class="cal-head"><button id="prevMonth">‹</button><strong>${esc(title)}</strong><button id="nextMonth">›</button></div><div class="cal-grid">${cells}</div>`
}
function bindCalendar(){document.querySelector('#prevMonth').onclick=()=>{monthCursor.setMonth(monthCursor.getMonth()-1);render()};document.querySelector('#nextMonth').onclick=()=>{monthCursor.setMonth(monthCursor.getMonth()+1);render()};els.view.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;render()})}
function formatDate(iso){return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00`))}

function renderGroups(){
  els.view.innerHTML=`<div class="title-row"><h1>Группы</h1></div>
  <form id="groupForm" class="group-form"><input id="newGroup" placeholder="Например: Дети 6–8" required><button class="btn primary">Добавить группу</button></form>
  <div class="group-list">${state.groups.map(g=>`<div class="card group-card" data-group="${g.id}"><div class="meta"><strong>${esc(g.name)}</strong><span>${studentsForGroup(g.id).length} чел.</span></div><div class="actions"><button class="link-btn rename">Переименовать</button><button class="link-btn danger-link delete">Удалить</button></div><button class="chev open" aria-label="Открыть группу">›</button></div>`).join('')}</div>
  <div class="cloud-card" style="margin-top:18px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled?'Синхронизировано':'Локальный режим'}</b><div class="subtitle">${cloud.enabled?'Изменения видны на телефоне и компьютере.':'Можно подключить Firebase в разделе «Ещё».'}</div></div></div>`;
  document.querySelector('#groupForm').onsubmit=e=>{e.preventDefault();const name=document.querySelector('#newGroup').value.trim();if(!name)return;state.groups.push({id:uid('g'),name});persist()};
  els.view.querySelectorAll('[data-group]').forEach(card=>{const id=card.dataset.group;card.querySelector('.open').onclick=()=>openGroup(id);card.querySelector('.rename').onclick=()=>renameGroup(id);card.querySelector('.delete').onclick=()=>deleteGroup(id)});
}
function renameGroup(id){const g=state.groups.find(x=>x.id===id);if(!g)return;openModal(`<h2>Переименовать группу</h2><label>Название</label><input id="renameGroupInput" value="${esc(g.name)}"><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="saveGroupName">Сохранить</button></div>`);document.querySelector('#saveGroupName').onclick=()=>{const v=document.querySelector('#renameGroupInput').value.trim();if(v){g.name=v;els.modal.close();persist()}}}
function deleteGroup(id){const g=state.groups.find(x=>x.id===id);if(!g)return;if(studentsForGroup(id).length){alert('Сначала переведите или удалите учеников из этой группы.');return}if(confirm(`Удалить группу «${g.name}»?`)){state.groups=state.groups.filter(x=>x.id!==id);persist()}}
function openGroup(id){currentGroup=id;els.view.innerHTML=groupDetailHTML(id);bindGroupDetail(id)}
function groupDetailHTML(id){const g=state.groups.find(x=>x.id===id);const list=studentsForGroup(id);return `<div class="title-row"><div><button class="link-btn" id="backGroups">‹ Группы</button><h1 style="margin-top:16px">${esc(g?.name||'Группа')}</h1><div class="subtitle">${list.length} учеников</div></div><button class="btn secondary" id="addStudentTop">+ Добавить ученика</button></div><div class="student-list">${list.map((s,i)=>`<div class="card student-card" data-student="${s.id}"><div>${i+1}</div><div><div class="name">${esc(s.name)}</div><div class="small">☎ ${esc(s.phone||'')} ${s.notes?`<br>${esc(s.notes)}`:''}</div></div><button class="link-btn move">⇄ Перевести</button><button class="icon-danger del" title="Удалить">🗑</button></div>`).join('')||'<div class="card empty">В группе пока нет учеников.</div>'}</div><button class="btn secondary full" id="addStudentBottom" style="margin-top:14px">+ Добавить ученика</button>`}
function bindGroupDetail(id){document.querySelector('#backGroups').onclick=()=>{page='groups';render()};document.querySelector('#addStudentTop').onclick=()=>studentForm(null,id);document.querySelector('#addStudentBottom').onclick=()=>studentForm(null,id);els.view.querySelectorAll('[data-student]').forEach(c=>{const sid=c.dataset.student;c.querySelector('.move').onclick=()=>moveStudent(sid);c.querySelector('.del').onclick=()=>removeStudent(sid);c.querySelector('.name').onclick=()=>openStudent(sid)})}

function renderChildren(){els.view.innerHTML=`<div class="title-row"><h1>Дети</h1><button class="btn primary" id="addChild">+ Добавить ребёнка</button></div><div class="student-list">${state.students.map((s,i)=>`<div class="card student-card" data-student="${s.id}"><div>${i+1}</div><div><div class="name">${esc(s.name)}</div><div class="small">${esc(groupName(s.groupId))} · ${esc(s.phone||'')}</div></div><button class="link-btn openProfile">Профиль</button><button class="icon-danger del">🗑</button></div>`).join('')||'<div class="card empty">Пока нет учеников.</div>'}</div>`;document.querySelector('#addChild').onclick=()=>studentForm();els.view.querySelectorAll('[data-student]').forEach(c=>{const sid=c.dataset.student;c.querySelector('.openProfile').onclick=()=>openStudent(sid);c.querySelector('.del').onclick=()=>removeStudent(sid)})}
function studentForm(student=null,groupId=null){openModal(`<h2>${student?'Редактировать':'Добавить'} ученика</h2><label>Имя и фамилия</label><input id="stName" value="${esc(student?.name||'')}"><label>Группа</label><select id="stGroup">${state.groups.map(g=>`<option value="${g.id}" ${(groupId||student?.groupId)===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><label>Телефон родителя</label><input id="stPhone" value="${esc(student?.phone||'')}"><label>Заметки</label><textarea id="stNotes">${esc(student?.notes||'')}</textarea><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="saveStudent">Сохранить</button></div>`);document.querySelector('#saveStudent').onclick=()=>{const name=document.querySelector('#stName').value.trim();if(!name)return;const data={name,groupId:document.querySelector('#stGroup').value,phone:document.querySelector('#stPhone').value.trim(),notes:document.querySelector('#stNotes').value.trim()};if(student)Object.assign(student,data);else state.students.push({id:uid('s'),...data});els.modal.close();persist();if(currentGroup&&page==='groups')openGroup(currentGroup)}}
function moveStudent(sid){const s=state.students.find(x=>x.id===sid);if(!s)return;openModal(`<h2>Перевести ученика</h2><p>${esc(s.name)}</p><label>Новая группа</label><select id="moveGroup">${state.groups.map(g=>`<option value="${g.id}" ${g.id===s.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}</select><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="doMove">Перевести</button></div>`);document.querySelector('#doMove').onclick=()=>{s.groupId=document.querySelector('#moveGroup').value;els.modal.close();persist();if(currentGroup)openGroup(currentGroup)}}
function removeStudent(sid){const s=state.students.find(x=>x.id===sid);if(!s)return;if(confirm(`Удалить ученика «${s.name}»? Его история посещений тоже будет удалена.`)){state.students=state.students.filter(x=>x.id!==sid);for(const d of Object.keys(state.attendance)){delete state.attendance[d][sid];if(!Object.keys(state.attendance[d]).length)delete state.attendance[d]}persist();if(currentGroup&&page==='groups')openGroup(currentGroup)}}

function openStudent(sid){currentStudent=sid;const s=state.students.find(x=>x.id===sid);if(!s)return;const mk=monthKey(selectedDate);const st=monthStats(sid,mk);const history=Object.keys(state.attendance).filter(d=>attendanceFor(sid,d)).sort().reverse().slice(0,12);els.view.innerHTML=`<div class="title-row"><button class="link-btn" id="backChildren">‹ К списку</button><button class="btn secondary" id="editStudent">Редактировать</button></div><div class="card profile-head"><div class="avatar">${esc(s.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</div><div><div class="profile-name">${esc(s.name)}</div><span class="pill">${esc(groupName(s.groupId))}</span><div class="subtitle" style="margin-top:10px">☎ ${esc(s.phone||'—')}<br>📝 ${esc(s.notes||'Нет заметок')}</div></div></div><div class="profile-grid"><div class="card"><div class="stats"><div class="ring" style="--p:${st.pct}"></div><div><div class="subtitle">Посещаемость · ${st.present}/${st.total} тренировок</div><div class="bigpct">${st.pct}%</div></div></div><div class="statline"><div><small>Присутствовал</small><b class="green">${st.present}</b></div><div><small>Отсутствовал</small><b class="red">${st.total-st.present}</b></div><div><small>Всего</small><b>${st.total}</b></div></div></div><div class="card"><h3 style="margin-top:0">История посещений</h3><div class="history">${history.length?history.map(d=>`<div class="history-row"><span>${formatDate(d)}</span><b class="${attendanceFor(sid,d)==='present'?'green':'red'}">${attendanceFor(sid,d)==='present'?'✓ Присутствовал':'× Отсутствовал'}</b></div>`).join(''):'<div class="empty">Истории пока нет.</div>'}</div></div></div><button class="btn danger full" id="deleteStudent" style="margin-top:16px">🗑 Удалить ученика</button><div class="cloud-card" style="margin-top:16px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled?'Синхронизировано на всех устройствах':'Сохранено на этом устройстве'}</b><div class="subtitle">${cloud.enabled?'Изменения видны на телефоне и компьютере.':'Подключите Firebase для облачной синхронизации.'}</div></div></div>`;document.querySelector('#backChildren').onclick=()=>{page='children';render()};document.querySelector('#editStudent').onclick=()=>studentForm(s);document.querySelector('#deleteStudent').onclick=()=>{removeStudent(sid);page='children';render()}}

function renderMore(){els.view.innerHTML=`<div class="title-row"><h1>Ещё</h1></div><div class="more-grid"><div class="card setting-row"><div><b>Режим хранения</b><div class="subtitle">${cloud.enabled?'Firebase Cloud + синхронизация':'Локально в браузере'}</div></div><span class="pill">${cloud.enabled?'ONLINE':'LOCAL'}</span></div><div class="card"><h3>Облачная синхронизация</h3><p class="subtitle">Чтобы один и тот же GitHub Pages‑линк показывал одинаковую базу на iPhone и MacBook, подключите Firebase. После этого входите под одним email/паролем на обоих устройствах.</p><div class="codebox">1. Firebase Console → Create project\n2. Authentication → Email/Password → Enable\n3. Firestore Database → Create database\n4. Project settings → Web App → скопировать firebaseConfig\n5. Вставить значения в firebase-config.js\n6. Firestore Rules — взять из FIRESTORE_RULES.txt\n7. Загрузить файлы в GitHub Pages</div></div><div class="card setting-row"><div><b>Экспорт резервной копии</b><div class="subtitle">Скачать JSON с группами, детьми и посещаемостью.</div></div><button class="btn secondary" id="exportBtn">Экспорт</button></div><div class="card setting-row"><div><b>Импорт резервной копии</b><div class="subtitle">Восстановить данные из JSON.</div></div><input type="file" id="importFile" accept="application/json" style="max-width:210px"></div>${cloud.user?`<div class="card setting-row"><div><b>Аккаунт</b><div class="subtitle">${esc(cloud.user.email||cloud.user.uid)}</div></div><button class="btn danger" id="signOutBtn">Выйти</button></div>`:''}</div>`;document.querySelector('#exportBtn').onclick=exportData;document.querySelector('#importFile').onchange=importData;if(cloud.user)document.querySelector('#signOutBtn').onclick=()=>cloud.fire.signOut(cloud.auth)}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`gcb-attendance-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importData(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.groups||!d.students||!d.attendance)throw new Error();state=d;persist();alert('Резервная копия восстановлена.')}catch{alert('Неверный файл резервной копии.')}};r.readAsText(f)}

function openModal(inner){els.modal.innerHTML=`<div class="modal-body">${inner}</div>`;els.modal.showModal();els.modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>els.modal.close())}
els.modal.addEventListener('click',e=>{if(e.target===els.modal)els.modal.close()});

document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{page=btn.dataset.nav;currentGroup=null;currentStudent=null;render()}));
document.querySelector('#signInBtn').onclick=async()=>{els.authMsg.textContent='';try{await cloud.fire.signInWithEmailAndPassword(cloud.auth,document.querySelector('#authEmail').value.trim(),document.querySelector('#authPassword').value)}catch(e){els.authMsg.textContent='Не удалось войти. Проверьте email и пароль.'}};
document.querySelector('#signUpBtn').onclick=async()=>{els.authMsg.textContent='';try{await cloud.fire.createUserWithEmailAndPassword(cloud.auth,document.querySelector('#authEmail').value.trim(),document.querySelector('#authPassword').value)}catch(e){els.authMsg.textContent='Не удалось создать аккаунт. Пароль должен быть не короче 6 символов.'}};

if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
render();initCloud();
