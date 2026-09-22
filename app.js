import { FIREBASE_CONFIG } from './firebase-config.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORAGE_KEY = 'gcb-attendance-state-v3';
const pad = n => String(n).padStart(2,'0');
const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const monthKey = iso => iso.slice(0,7);
const esc = v => String(v??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deepClone = o => JSON.parse(JSON.stringify(o));

const seed = {
  version: 3,
  groups: [
    {id:'g_kuristiku',name:'KURISTIKU'},
    {id:'g_mustakivi',name:'MUSTAKIVI'},
    {id:'g_all',name:'ALL GCB'}
  ],
  students: [
    {id:'s1',name:'Angelina Pavlova',groupId:'g_kuristiku',phone:'+372 5555 1234',notes:'Очень старается, хорошая динамика!'},
    {id:'s2',name:'Eva Minina',groupId:'g_kuristiku',phone:'+372 5566 2345',notes:''},
    {id:'s3',name:'Mihhail Belev',groupId:'g_kuristiku',phone:'+372 5555 9876',notes:'Хорошо прогрессирует'},
    {id:'s4',name:'Michael Zovmer',groupId:'g_kuristiku',phone:'+372 5666 1122',notes:''},
    {id:'s5',name:'Georgiy Ivanov',groupId:'g_kuristiku',phone:'+372 5555 6677',notes:'Иногда опаздывает'},
    {id:'s6',name:'Polina Sokolova',groupId:'g_kuristiku',phone:'+372 5444 8899',notes:''},
    {id:'s7',name:'Lea Jermak',groupId:'g_mustakivi',phone:'',notes:''},
    {id:'s8',name:'Ilya Feduljev',groupId:'g_mustakivi',phone:'',notes:''}
  ],
  attendance: {},
  settings: { lastGroupId:'g_kuristiku' }
};

function loadState(){
  try { const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const parsed=JSON.parse(raw); if(parsed?.groups&&parsed?.students&&parsed?.attendance) return parsed; } } catch{}
  const s=deepClone(seed);
  const mk=monthKey(todayISO());
  const days=[1,3,8,10,15,17,22,24];
  for(const n of days){ const iso=`${mk}-${pad(n)}`; s.attendance[iso]={}; for(const st of s.students.filter(x=>x.groupId==='g_kuristiku')) s.attendance[iso][st.id]=(st.id.charCodeAt(1)+n)%4===0?'absent':'present'; }
  localStorage.setItem(STORAGE_KEY,JSON.stringify(s)); return s;
}

let state=loadState();
let page='attendance';
let selectedDate=todayISO();
let selectedGroup=state.settings?.lastGroupId || state.groups[0]?.id || '';
let currentGroup=null, currentStudent=null;
let cloud={enabled:false,user:null,auth:null,db:null,fire:null,unsubscribe:null,localOnly:false,saving:false};

const els={view:$('#view'),modal:$('#modal'),syncBadge:$('#syncBadge'),authOverlay:$('#authOverlay'),authMsg:$('#authMsg'),toast:$('#toast')};

function toast(msg){ els.toast.textContent=msg; els.toast.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.add('hidden'),1800); }
function setSync(kind,text){ els.syncBadge.className=`sync-badge ${kind}`; els.syncBadge.innerHTML=`<span class="sync-dot"></span><span>${esc(text)}</span>`; }

async function persist({cloudWrite=true}={}){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  render();
  if(cloud.enabled&&cloud.user&&cloudWrite){
    try{ cloud.saving=true; setSync('syncing','Сохранение…'); await cloud.fire.setDoc(cloud.fire.doc(cloud.db,'users',cloud.user.uid,'app','main'),state,{merge:false}); cloud.saving=false; setSync('online','Синхронизировано'); }
    catch(e){ cloud.saving=false; console.error(e); setSync('error','Ошибка синхронизации'); }
  }
}

function groupName(id){ return state.groups.find(g=>g.id===id)?.name || 'Без группы'; }
function groupCount(id){ return state.students.filter(s=> id==='g_all' ? true : s.groupId===id).length; }
function attendanceFor(sid,iso){ return state.attendance?.[iso]?.[sid] || null; }
function groupStudents(id){ return state.students.filter(s=> id==='g_all' ? true : s.groupId===id); }
function monthStats(sid,mk){
  const rows=Object.entries(state.attendance).filter(([d])=>d.startsWith(mk)); let total=0,present=0;
  for(const [,m] of rows){ if(m[sid]){total++; if(m[sid]==='present')present++;} }
  return {total,present,pct:total?Math.round(present/total*100):0};
}
function dateObj(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); }
function dateISO(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function formatMonth(iso){ return new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(dateObj(iso)); }
function formatDate(iso){ return new Intl.DateTimeFormat('ru-RU',{weekday:'short',day:'numeric',month:'long'}).format(dateObj(iso)); }

function render(){
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));
  if(page==='attendance') renderAttendance();
  else if(page==='groups'&&currentGroup) renderGroupDetail(currentGroup);
  else if(page==='groups') renderGroups();
  else if(page==='children'&&currentStudent) renderStudentProfile(currentStudent);
  else if(page==='children') renderChildren();
  else renderMore();
}

function renderAttendance(){
  if(!state.groups.find(g=>g.id===selectedGroup)) selectedGroup=state.groups[0]?.id||'';
  const students=groupStudents(selectedGroup);
  const statuses=students.map(s=>attendanceFor(s.id,selectedDate)).filter(Boolean);
  const marked=statuses.length, pct=students.length?Math.round(marked/students.length*100):0;
  els.view.innerHTML=`
    <div class="title-row"><h1>Посещаемость</h1></div>
    <div class="toolbar">
      <div class="field"><label>Месяц</label><input id="monthPicker" type="month" value="${monthKey(selectedDate)}"></div>
      <div class="field"><label>Группа</label><select id="groupPicker">${state.groups.map(g=>`<option value="${g.id}" ${g.id===selectedGroup?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
    </div>
    <div class="card summary-card"><div class="ring" style="--p:${pct}"></div><div class="summary-text"><strong>${formatDate(selectedDate)}: ${marked} из ${students.length} отмечены</strong><span>${pct}% · выбрана группа ${esc(groupName(selectedGroup))}</span></div><div class="chev">›</div></div>
    ${calendarHTML(selectedDate)}
    <div class="card student-table">
      <div class="table-head"><div>#</div><div>Имя</div><div>Группа</div><div>Посещаемость</div><div>Статус</div></div>
      ${students.length?students.map((s,i)=>studentAttendanceRow(s,i)).join(''):'<div class="empty">В этой группе пока нет учеников.</div>'}
    </div>
    <div class="cloud-card" style="margin-top:15px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled&&cloud.user?'Облачная база данных сохранена':'Данные сохранены на устройстве'}</b><div class="subtitle">${cloud.enabled&&cloud.user?'Изменения автоматически появляются на телефоне и компьютере.':'Для синхронизации подключите Firebase в разделе «Ещё».'}</div></div></div>`;
  $('#monthPicker').onchange=e=>{ const [y,m]=e.target.value.split('-'); const d=Math.min(dateObj(selectedDate).getDate(),new Date(+y,+m,0).getDate()); selectedDate=`${y}-${m}-${pad(d)}`; render(); };
  $('#groupPicker').onchange=e=>{selectedGroup=e.target.value; state.settings={...(state.settings||{}),lastGroupId:selectedGroup}; persist();};
  $$('.day[data-date]',els.view).forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;render();});
  $('#prevMonth').onclick=()=>shiftMonth(-1); $('#nextMonth').onclick=()=>shiftMonth(1);
  $$('[data-student-row]',els.view).forEach(row=>{ const sid=row.dataset.studentRow; $('.name',row).onclick=()=>openStudent(sid); $$('.round',row).forEach(btn=>btn.onclick=()=>setAttendance(sid,btn.dataset.status)); });
}

function calendarHTML(iso){
  const d=dateObj(iso), y=d.getFullYear(), m=d.getMonth();
  const first=new Date(y,m,1), offset=(first.getDay()+6)%7, count=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<offset;i++)cells.push('<div></div>');
  for(let day=1;day<=count;day++){ const di=`${y}-${pad(m+1)}-${pad(day)}`; const has=state.attendance[di]&&Object.keys(state.attendance[di]).length; cells.push(`<button class="day ${di===iso?'selected':''}" data-date="${di}">${day}${has?'<span class="dot"></span>':''}</button>`); }
  return `<div class="card calendar-card"><div class="cal-head"><button id="prevMonth" aria-label="Предыдущий месяц">‹</button><strong>${esc(formatMonth(iso))}</strong><button id="nextMonth" aria-label="Следующий месяц">›</button></div><div class="cal-grid">${['пн','вт','ср','чт','пт','сб','вс'].map(x=>`<div class="dow">${x}</div>`).join('')}${cells.join('')}</div></div>`;
}
function shiftMonth(delta){ const d=dateObj(selectedDate); const target=new Date(d.getFullYear(),d.getMonth()+delta,1); const max=new Date(target.getFullYear(),target.getMonth()+1,0).getDate(); target.setDate(Math.min(d.getDate(),max)); selectedDate=dateISO(target); render(); }
function studentAttendanceRow(s,i){ const st=attendanceFor(s.id,selectedDate); const ms=monthStats(s.id,monthKey(selectedDate)); return `<div class="student-row" data-student-row="${s.id}"><div>${i+1}</div><div class="name">${esc(s.name)}</div><div class="group-cell"><span class="pill">${esc(groupName(s.groupId))}</span></div><div class="attendance-stat">${ms.present}/${ms.total} · ${ms.pct}%</div><div class="status-actions"><button class="round ${st==='present'?'yes':'off'}" data-status="present" aria-label="Присутствовал">✓</button><button class="round ${st==='absent'?'no':'off'}" data-status="absent" aria-label="Отсутствовал">×</button></div></div>`; }
function setAttendance(sid,status){ state.attendance[selectedDate]??={}; if(state.attendance[selectedDate][sid]===status) delete state.attendance[selectedDate][sid]; else state.attendance[selectedDate][sid]=status; if(!Object.keys(state.attendance[selectedDate]).length) delete state.attendance[selectedDate]; persist(); }

function renderGroups(){
  els.view.innerHTML=`<div class="title-row"><h1>Группы</h1></div><form id="groupForm" class="group-form"><input id="newGroupName" placeholder="Например: Дети 6–8" required><button class="btn primary">Добавить группу</button></form><div class="group-list">${state.groups.map(g=>`<div class="card group-card" data-group="${g.id}"><div class="meta"><strong>${esc(g.name)}</strong><span>${groupCount(g.id)} чел.</span></div><div class="actions"><button type="button" class="link-btn rename">Переименовать</button><button type="button" class="link-btn danger-link delete">Удалить</button></div><div class="chev">›</div></div>`).join('')}</div><div class="cloud-card" style="margin-top:16px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled&&cloud.user?'Синхронизировано':'Локальный режим'}</b><div class="subtitle">${cloud.enabled&&cloud.user?'Изменения видны на телефоне и компьютере.':'Все функции работают; облако можно включить в «Ещё».'}</div></div></div>`;
  $('#groupForm').onsubmit=e=>{e.preventDefault(); const name=$('#newGroupName').value.trim(); if(!name)return; state.groups.push({id:uid('g'),name:name.toUpperCase()}); $('#newGroupName').value=''; persist();};
  $$('[data-group]',els.view).forEach(card=>{ const id=card.dataset.group; card.onclick=e=>{ if(e.target.closest('button'))return; currentGroup=id; render(); }; $('.rename',card).onclick=()=>renameGroup(id); $('.delete',card).onclick=()=>deleteGroup(id); });
}
function renameGroup(id){ const g=state.groups.find(x=>x.id===id); if(!g)return; openModal(`<h2>Переименовать группу</h2><label>Название</label><input id="renameGroupInput" value="${esc(g.name)}"><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="renameGroupSave">Сохранить</button></div>`); $('#renameGroupSave').onclick=()=>{ const v=$('#renameGroupInput').value.trim(); if(!v)return; g.name=v.toUpperCase(); els.modal.close(); persist(); }; }
function deleteGroup(id){ const g=state.groups.find(x=>x.id===id); if(!g)return; const count=groupCount(id); if(count&&id!=='g_all'){toast('Сначала переведите или удалите учеников из этой группы.');return;} if(confirm(`Удалить группу «${g.name}»?`)){ state.groups=state.groups.filter(x=>x.id!==id); if(selectedGroup===id)selectedGroup=state.groups[0]?.id||''; persist(); } }

function renderGroupDetail(id){ const g=state.groups.find(x=>x.id===id); if(!g){currentGroup=null;render();return;} const students=groupStudents(id); els.view.innerHTML=`<div class="title-row"><div><button class="link-btn" id="backGroups">‹ Группы</button><h1 style="margin-top:16px">${esc(g.name)}</h1><div class="subtitle">${students.length} учеников</div></div><button class="btn secondary" id="addStudentTop">+ Ученик</button></div><div class="student-list">${students.length?students.map((s,i)=>`<div class="card student-card" data-student="${s.id}"><div>${i+1}</div><div><div class="name">${esc(s.name)}</div><div class="small">☎ ${esc(s.phone||'—')}${s.notes?`<br>${esc(s.notes)}`:''}</div></div><button class="link-btn move">⇄ Перевести</button><button class="icon-danger del" title="Удалить">🗑</button></div>`).join(''):'<div class="card empty">В группе пока нет учеников.</div>'}</div><button class="btn secondary full" id="addStudentBottom" style="margin-top:14px">+ Добавить ученика</button>`;
  $('#backGroups').onclick=()=>{currentGroup=null;render();}; $('#addStudentTop').onclick=()=>studentForm(null,id); $('#addStudentBottom').onclick=()=>studentForm(null,id);
  $$('[data-student]',els.view).forEach(c=>{const sid=c.dataset.student; $('.move',c).onclick=()=>moveStudent(sid); $('.del',c).onclick=()=>removeStudent(sid); $('.name',c).onclick=()=>openStudent(sid);});
}

function renderChildren(){ els.view.innerHTML=`<div class="title-row"><h1>Дети</h1><button class="btn primary" id="addChild">+ Добавить ребёнка</button></div><div class="student-list">${state.students.length?state.students.map((s,i)=>`<div class="card student-card" data-student="${s.id}"><div>${i+1}</div><div><div class="name">${esc(s.name)}</div><div class="small">${esc(groupName(s.groupId))} · ${esc(s.phone||'телефон не указан')}</div></div><button class="link-btn openProfile">Профиль</button><button class="icon-danger del">🗑</button></div>`).join(''):'<div class="card empty">Пока нет учеников.</div>'}</div>`; $('#addChild').onclick=()=>studentForm(); $$('[data-student]',els.view).forEach(c=>{const sid=c.dataset.student; $('.openProfile',c).onclick=()=>openStudent(sid); $('.del',c).onclick=()=>removeStudent(sid); $('.name',c).onclick=()=>openStudent(sid);}); }
function studentForm(student=null,groupId=null){ openModal(`<h2>${student?'Редактировать':'Добавить'} ученика</h2><label>Имя и фамилия</label><input id="stName" value="${esc(student?.name||'')}"><label>Группа</label><select id="stGroup">${state.groups.filter(g=>g.id!=='g_all').map(g=>`<option value="${g.id}" ${(groupId||student?.groupId)===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><label>Телефон родителя</label><input id="stPhone" value="${esc(student?.phone||'')}"><label>Заметки</label><textarea id="stNotes">${esc(student?.notes||'')}</textarea><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="saveStudent">Сохранить</button></div>`); $('#saveStudent').onclick=()=>{ const name=$('#stName').value.trim(); if(!name){toast('Введите имя ученика.');return;} const data={name,groupId:$('#stGroup').value,phone:$('#stPhone').value.trim(),notes:$('#stNotes').value.trim()}; if(student)Object.assign(student,data); else state.students.push({id:uid('s'),...data}); els.modal.close(); persist(); }; }
function moveStudent(sid){ const s=state.students.find(x=>x.id===sid); if(!s)return; openModal(`<h2>Перевести ученика</h2><p><b>${esc(s.name)}</b></p><label>Новая группа</label><select id="moveGroup">${state.groups.filter(g=>g.id!=='g_all').map(g=>`<option value="${g.id}" ${g.id===s.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}</select><div class="modal-actions"><button class="btn secondary" data-close>Отмена</button><button class="btn primary" id="doMove">Перевести</button></div>`); $('#doMove').onclick=()=>{s.groupId=$('#moveGroup').value; els.modal.close(); persist();}; }
function removeStudent(sid){ const s=state.students.find(x=>x.id===sid); if(!s)return; if(confirm(`Удалить ученика «${s.name}»? История посещений этого ученика тоже будет удалена.`)){ state.students=state.students.filter(x=>x.id!==sid); for(const d of Object.keys(state.attendance)){ delete state.attendance[d][sid]; if(!Object.keys(state.attendance[d]).length) delete state.attendance[d]; } if(currentStudent===sid)currentStudent=null; persist(); } }
function openStudent(sid){ currentStudent=sid; page='children'; render(); }
function renderStudentProfile(sid){ const s=state.students.find(x=>x.id===sid); if(!s){currentStudent=null;render();return;} const mk=monthKey(selectedDate); const st=monthStats(sid,mk); const history=Object.keys(state.attendance).filter(d=>attendanceFor(sid,d)).sort().reverse().slice(0,12); els.view.innerHTML=`<div class="title-row"><button class="link-btn" id="backChildren">‹ К списку</button><button class="btn secondary" id="editStudent">Редактировать</button></div><div class="card profile-head"><div class="avatar">${esc(s.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</div><div><div class="profile-name">${esc(s.name)}</div><span class="pill">${esc(groupName(s.groupId))}</span><div class="subtitle" style="margin-top:9px">☎ ${esc(s.phone||'—')}<br>📝 ${esc(s.notes||'Нет заметок')}</div></div></div><div class="profile-grid"><div class="card"><div class="stats"><div class="ring" style="--p:${st.pct}"></div><div><div class="subtitle">Посещаемость · ${st.present}/${st.total} тренировок</div><div class="bigpct">${st.pct}%</div></div></div><div class="statline"><div><small>Присутствовал</small><b class="green">${st.present}</b></div><div><small>Отсутствовал</small><b class="red">${st.total-st.present}</b></div><div><small>Всего</small><b>${st.total}</b></div></div></div><div class="card"><h3 style="margin-top:0">История посещений</h3><div class="history">${history.length?history.map(d=>`<div class="history-row"><span>${esc(formatDate(d))}</span><b class="${attendanceFor(sid,d)==='present'?'green':'red'}">${attendanceFor(sid,d)==='present'?'✓ Присутствовал':'× Отсутствовал'}</b></div>`).join(''):'<div class="empty">Истории пока нет.</div>'}</div></div></div><button class="btn danger full" id="deleteStudent" style="margin-top:15px">🗑 Удалить ученика</button><div class="cloud-card" style="margin-top:15px"><div class="cloud-icon">☁︎</div><div><b>${cloud.enabled&&cloud.user?'Синхронизировано на всех устройствах':'Сохранено локально'}</b><div class="subtitle">${cloud.enabled&&cloud.user?'Облачная база данных сохранена. Изменения видны на телефоне и компьютере.':'Подключите Firebase, чтобы включить синхронизацию.'}</div></div></div>`; $('#backChildren').onclick=()=>{currentStudent=null;render();}; $('#editStudent').onclick=()=>studentForm(s); $('#deleteStudent').onclick=()=>removeStudent(sid); }

function renderMore(){ els.view.innerHTML=`<div class="title-row"><h1>Ещё</h1></div><div class="more-grid"><div class="card setting-row"><div><b>Хранение данных</b><div class="subtitle">${cloud.enabled&&cloud.user?'Firebase Cloud + синхронизация в реальном времени':'Локально в этом браузере'}</div></div><span class="pill">${cloud.enabled&&cloud.user?'ONLINE':'LOCAL'}</span></div><div class="card"><h3>Синхронизация телефон ↔ компьютер</h3><p class="subtitle">После подключения Firebase открывайте один и тот же GitHub Pages‑линк на iPhone и MacBook и входите в один аккаунт. Любое изменение автоматически сохраняется в Firestore и появляется на другом устройстве.</p><div class="codebox">1. Создайте бесплатный Firebase project\n2. Authentication → Email/Password → Enable\n3. Firestore Database → Create database\n4. Project settings → Web App → скопируйте firebaseConfig\n5. Вставьте его в firebase-config.js и поставьте enabled: true\n6. Firestore Rules → вставьте правила из FIRESTORE_RULES.txt\n7. Загрузите файлы в GitHub Pages</div></div><div class="card setting-row"><div><b>Экспорт резервной копии</b><div class="subtitle">Скачать JSON с группами, детьми и посещаемостью.</div></div><button class="btn secondary" id="exportBtn">Экспорт</button></div><div class="card setting-row"><div><b>Импорт резервной копии</b><div class="subtitle">Восстановить базу данных из JSON.</div></div><input type="file" id="importFile" accept="application/json"></div><div class="card setting-row"><div><b>Демо-данные</b><div class="subtitle">Вернуть стартовый пример интерфейса.</div></div><button class="btn danger" id="resetBtn">Сбросить</button></div>${cloud.user?`<div class="card setting-row"><div><b>Аккаунт</b><div class="subtitle">${esc(cloud.user.email||cloud.user.uid)}</div></div><button class="btn danger" id="signOutBtn">Выйти</button></div>`:''}</div>`; $('#exportBtn').onclick=exportData; $('#importFile').onchange=importData; $('#resetBtn').onclick=()=>{if(confirm('Вернуть демо-данные? Текущие данные будут заменены.')){state=deepClone(seed); selectedGroup=state.groups[0].id; selectedDate=todayISO(); persist();}}; if(cloud.user)$('#signOutBtn').onclick=()=>cloud.fire.signOut(cloud.auth); }
function exportData(){ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`gcb-attendance-backup-${todayISO()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function importData(e){ const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{const d=JSON.parse(r.result); if(!d.groups||!d.students||!d.attendance)throw new Error(); state=d; selectedGroup=state.groups[0]?.id||''; persist(); toast('Резервная копия восстановлена.');}catch{toast('Неверный файл резервной копии.');}}; r.readAsText(f); }

function openModal(inner){ els.modal.innerHTML=`<div class="modal-body">${inner}</div>`; els.modal.showModal(); $$('[data-close]',els.modal).forEach(b=>b.onclick=()=>els.modal.close()); }
els.modal.addEventListener('click',e=>{if(e.target===els.modal)els.modal.close();});
$$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{page=btn.dataset.nav; currentGroup=null; currentStudent=null; render();}));

async function initCloud(){
  if(!FIREBASE_CONFIG?.enabled){setSync('local','Локально');return;}
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const app=appMod.initializeApp(FIREBASE_CONFIG); const auth=authMod.getAuth(app); const db=fsMod.getFirestore(app);
    cloud={...cloud,enabled:true,auth,db,fire:{...authMod,...fsMod}}; setSync('syncing','Подключение…');
    authMod.onAuthStateChanged(auth, async user=>{
      cloud.user=user||null;
      if(!user){ if(cloud.unsubscribe)cloud.unsubscribe(); cloud.unsubscribe=null; if(!cloud.localOnly)els.authOverlay.classList.remove('hidden'); setSync('local','Нужен вход'); render(); return; }
      cloud.localOnly=false; els.authOverlay.classList.add('hidden'); setSync('syncing','Синхронизация…');
      const ref=fsMod.doc(db,'users',user.uid,'app','main');
      const snap=await fsMod.getDoc(ref);
      if(!snap.exists()) await fsMod.setDoc(ref,state);
      if(cloud.unsubscribe)cloud.unsubscribe();
      cloud.unsubscribe=fsMod.onSnapshot(ref,s=>{ if(!s.exists()||cloud.saving)return; const remote=s.data(); if(remote?.groups&&remote?.students&&remote?.attendance){state=remote; localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); if(!state.groups.find(g=>g.id===selectedGroup))selectedGroup=state.groups[0]?.id||''; setSync('online','Синхронизировано'); render();} });
    });
  }catch(e){console.error(e); setSync('error','Firebase не подключён');}
}

$('#signInBtn').onclick=async()=>{els.authMsg.textContent='';try{await cloud.fire.signInWithEmailAndPassword(cloud.auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch{els.authMsg.textContent='Не удалось войти. Проверьте email и пароль.';}};
$('#signUpBtn').onclick=async()=>{els.authMsg.textContent='';try{await cloud.fire.createUserWithEmailAndPassword(cloud.auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch{els.authMsg.textContent='Не удалось создать аккаунт. Пароль должен быть не короче 6 символов.';}};
$('#continueLocalBtn').onclick=()=>{cloud.localOnly=true;els.authOverlay.classList.add('hidden');setSync('local','Локально');};

if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
render(); initCloud();
