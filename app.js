// ─── SUPABASE INIT ───
const SUPABASE_URL = 'https://vuovbkbdxjxsiuflbrdn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1b3Zia2JkeGp4c2l1ZmxicmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTkyMjQsImV4cCI6MjA5NDkzNTIyNH0.z5ta4K_bDHD6xkWQ44AZuQg1JMR0N6Vmpza6ZOCscus';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── AUTH STATE ───
let currentUser = null;
let authMode = 'login';

// ─── LOCAL STATE (loaded from Supabase on boot) ───
const state = {
  goals: [], workouts: [], fitnessHeatmap: {}, fitGoals: {},
  transactions: [], budgets: {}, books: [], readHeatmap: {}, piano: [],
  categories: [], workMeetings: []
};

const todayObj = new Date();
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PIANO_GOAL = 90;
const bookColors = ['var(--green)','var(--blue)','var(--orange)','var(--pink)','var(--purple)'];
// Categories — loaded from state, with sensible defaults. Users can add/delete their own.
const DEFAULT_EXPENSE_CATEGORIES = ['Food & Dining','Transport','Health & Medical','Entertainment','Utilities & Bills','Shopping','Subscriptions','Other'];
const DEFAULT_INCOME_CATEGORIES = ['Salary','Bonus','Refund','Reimbursement','Interest','Dividend'];
const DEFAULT_ASSET_CATEGORIES = ['Saving','ETF','Super'];
const DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES, ...DEFAULT_ASSET_CATEGORIES];
const DEFAULT_CATEGORY_TYPES = Object.fromEntries([
  ...DEFAULT_EXPENSE_CATEGORIES.map(c=>[c,'expense']),
  ...DEFAULT_INCOME_CATEGORIES.map(c=>[c,'income']),
  ...DEFAULT_ASSET_CATEGORIES.map(c=>[c,'asset'])
]);
const CAT_COLOR_PALETTE = ['var(--green)','var(--blue)','var(--orange)','var(--pink)','var(--purple)','#2a9d8f','#e9c46a','var(--muted)','#e76f51','#457b9d','#a8dadc','#6d6875'];
const CATEGORY_TYPE_KEY = 'my-os-category-types';
const REMOVED_CATEGORY_KEY = 'my-os-removed-categories';
let removedCategories = loadRemovedCategories();
let categoryTypes = loadCategoryTypes();
function loadRemovedCategories(){
  try { return JSON.parse(localStorage.getItem(REMOVED_CATEGORY_KEY)||'[]'); }
  catch(e){ return []; }
}
function saveRemovedCategories(){ localStorage.setItem(REMOVED_CATEGORY_KEY, JSON.stringify([...new Set(removedCategories)])); }
function isRemovedCategory(cat){ return removedCategories.includes(cat); }
function restoreCategory(cat){ removedCategories = removedCategories.filter(c=>c!==cat); saveRemovedCategories(); }
function markCategoryRemoved(cat){ if(!removedCategories.includes(cat)) removedCategories.push(cat); saveRemovedCategories(); }

function loadCategoryTypes(){
  try { return {...DEFAULT_CATEGORY_TYPES, ...(JSON.parse(localStorage.getItem(CATEGORY_TYPE_KEY)||'{}'))}; }
  catch(e){ return {...DEFAULT_CATEGORY_TYPES}; }
}
function saveCategoryTypes(){ localStorage.setItem(CATEGORY_TYPE_KEY, JSON.stringify(categoryTypes)); }
function getCategories(){
  const base = [...(state.categories||[]), ...DEFAULT_CATEGORIES, ...Object.keys(state.budgets||{})];
  return [...new Set(base.filter(Boolean))].filter(c=>!isRemovedCategory(c));
}
function getCategoryType(cat){
  if(categoryTypes[cat]) return categoryTypes[cat];
  if((state.transactions||[]).some(t=>t.cat===cat&&t.type==='income')) return 'income';
  return 'expense';
}
function setCategoryType(cat,type){ categoryTypes[cat]=type; saveCategoryTypes(); }
function getCategoriesByType(type){ return getCategories().filter(c=>getCategoryType(c)===type); }
function getCatColor(i){ return CAT_COLOR_PALETTE[i % CAT_COLOR_PALETTE.length]; }
// Legacy aliases
const CATEGORIES = DEFAULT_CATEGORIES;
const CAT_COLORS = CAT_COLOR_PALETTE;
const catColors = {life:{bg:'#1a2a1a',color:'var(--green)'},fitness:{bg:'#1a1e2e',color:'var(--blue)'},finance:{bg:'#2e2a1a',color:'var(--orange)'},growth:{bg:'#2a1a2e',color:'var(--purple)'},career:{bg:'#2e1a1a',color:'var(--pink)'}};
const catLabels = {life:'🌱 Life',fitness:'💪 Fitness',finance:'💰 Finance',growth:'📚 Growth',career:'💼 Career'};


// ─── AUTH HELPERS ───
function showAuthScreen(message='', type=''){
  document.getElementById('loading').style.display='none';
  document.getElementById('app').style.display='none';
  const auth=document.getElementById('authScreen');
  if(auth) auth.style.display='flex';
  setAuthMessage(message,type);
}
function showAppScreen(){
  document.getElementById('loading').style.display='none';
  const auth=document.getElementById('authScreen');
  if(auth) auth.style.display='none';
  document.getElementById('app').style.display='block';
  const pill=document.getElementById('userEmailPill');
  if(pill && currentUser?.email){pill.style.display='inline-block';pill.textContent=currentUser.email;}
}
function setAuthMode(mode){
  authMode=mode;
  document.getElementById('loginTab')?.classList.toggle('active',mode==='login');
  document.getElementById('signupTab')?.classList.toggle('active',mode==='signup');
  const btn=document.getElementById('authSubmitBtn');
  if(btn) btn.textContent=mode==='login'?'Log in':'Create account';
  const pass=document.getElementById('authPassword');
  if(pass) pass.setAttribute('autocomplete', mode==='login'?'current-password':'new-password');
  setAuthMessage('','');
}
function setAuthMessage(message,type=''){
  const el=document.getElementById('authMessage');
  if(!el) return;
  el.textContent=message||'';
  el.className='auth-message '+(type||'');
}
async function submitAuth(){
  const email=document.getElementById('authEmail')?.value.trim();
  const password=document.getElementById('authPassword')?.value;
  const btn=document.getElementById('authSubmitBtn');
  if(!email||!password){setAuthMessage('Enter your email and password.','error');return;}
  if(password.length<6){setAuthMessage('Password needs to be at least 6 characters.','error');return;}
  btn.disabled=true; btn.textContent=authMode==='login'?'Logging in…':'Creating account…';
  try{
    const res=authMode==='login'
      ? await sb.auth.signInWithPassword({email,password})
      : await sb.auth.signUp({email,password});
    if(res.error){setAuthMessage(res.error.message,'error');return;}
    if(authMode==='signup' && !res.data.session){
      setAuthMessage('Account created. Check your email to confirm, then log in.','success');
      setAuthMode('login');
      return;
    }
    currentUser=res.data.user || res.data.session?.user;
    await loadAppData();
  }catch(e){
    console.error(e); setAuthMessage('Something went wrong. Please try again.','error');
  }finally{
    btn.disabled=false; btn.textContent=authMode==='login'?'Log in':'Create account';
  }
}
async function logoutUser(){
  await sb.auth.signOut();
  currentUser=null;
  state.goals=[]; state.workouts=[]; state.fitnessHeatmap={}; state.fitGoals={};
  state.transactions=[]; state.budgets={}; state.books=[]; state.readHeatmap={}; state.piano=[]; state.categories=[]; state.workMeetings=[];
  showAuthScreen('Logged out.','success');
}
sb.auth.onAuthStateChange((event, session)=>{
  if(event==='SIGNED_OUT'){
    currentUser=null;
    showAuthScreen();
  }
});

// ─── SAVE INDICATOR ───
let saveTimer = null;
function showSaved(){
  const p = document.getElementById('savePill');
  p.classList.remove('hidden');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>p.classList.add('hidden'), 1800);
}

// ─── BOOT: CHECK AUTH, THEN LOAD DATA ───
async function boot(){
  const {data:{session},error}=await sb.auth.getSession();
  if(error){console.error('Auth session error:',error);}
  if(!session){showAuthScreen();return;}
  currentUser=session.user;
  await loadAppData();
}

// ─── LOAD ALL DATA ───
async function loadAppData(){
  try {
    const [goals, workouts, fheat, fgoals, txs, budgets, books, rheat, piano, cats] = await Promise.all([
      sb.from('goals').select('*'),
      sb.from('workouts').select('*').order('created_at',{ascending:false}),
      sb.from('fitness_heatmap').select('*'),
      sb.from('fitness_goals').select('*'),
      sb.from('transactions').select('*').order('created_at',{ascending:false}),
      sb.from('budgets').select('*'),
      sb.from('books').select('*').order('created_at',{ascending:true}),
      sb.from('reading_heatmap').select('*'),
      sb.from('piano').select('*').order('created_at',{ascending:false}),
      sb.from('categories').select('*').order('sort_order',{ascending:true}),
    ]);
    state.goals = goals.data || [];
    state.workouts = workouts.data || [];
    state.fitnessHeatmap = Object.fromEntries((fheat.data||[]).map(r=>[r.day_key,true]));
    state.fitGoals = Object.fromEntries((fgoals.data||[]).map(r=>[r.month_key,r.goal]));
    state.transactions = (txs.data||[]).map(t=>({...t, subType: t.sub_type, cat: t.cat, acct: t.acct, monthKey: t.month_key}));
    state.budgets = Object.fromEntries((budgets.data||[]).map(r=>[r.cat,r.amount]));
    state.books = (books.data||[]).map(b=>({...b, startDate: b.start_date, endDate: b.end_date}));
    state.readHeatmap = Object.fromEntries((rheat.data||[]).map(r=>[r.day_key, r.book_ids||[]]));
    state.piano = piano.data || [];
    state.categories = (cats.data||[]).map(c=>c.name);
    if(!state.categories.length) state.categories = [...DEFAULT_CATEGORIES];
    getCategories().forEach(c=>{ if(!categoryTypes[c]) categoryTypes[c]=DEFAULT_CATEGORY_TYPES[c]||'expense'; });
    saveCategoryTypes();
    await loadFreshGrowthGoalsFromSupabase();
    await loadWorkMeetings();
  } catch(e){ console.error('Boot error:', e); }

  showAppScreen();
  document.getElementById('dateDisplay').textContent = todayObj.toLocaleDateString('en-AU',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  renderGoals(); renderWorkouts(); buildCalendar(); updateFitGoalDisplay();
  renderCatSelect(); renderTotalCover(); switchFinTab('yearly');
  renderBooks(); updateReadCalBookSelect(); buildReadCal(); renderReadReports();
  renderPiano(); renderGrowthTrackers(); renderWorkTab(); updateOverview(); renderReports();
}

// ─── TABS ───
function switchTab(name){
  const tabs=['overview','goals','fitness','finance','growth','work'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',tabs[i]===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  if(name==='overview'){ updateOverview(); renderReports(); }
  if(name==='finance'){ renderTotalCover(); switchFinTab(finTab); }
  if(name==='work'){ renderWorkTab(); }
}

// ─── GOALS ───
async function addGoal(){
  const input=document.getElementById('goalInput');
  const text=input.value.trim();
  if(!text) return;
  const id = Date.now();
  const cat = document.getElementById('goalCat').value;
  const {error} = await sb.from('goals').insert({id,text,cat,done:false});
  if(error){console.error(error);return;}
  state.goals.push({id,text,cat,done:false});
  input.value='';
  renderGoals(); updateOverview(); showSaved();
}
async function toggleGoal(id){
  const g=state.goals.find(g=>g.id===id);
  if(!g) return;
  g.done=!g.done;
  await sb.from('goals').update({done:g.done}).eq('id',id);
  renderGoals(); updateOverview(); showSaved();
}
async function deleteGoal(id){
  await sb.from('goals').delete().eq('id',id);
  state.goals=state.goals.filter(g=>g.id!==id);
  renderGoals(); updateOverview(); showSaved();
}
function renderGoals(){
  const list=document.getElementById('goalList');
  if(!state.goals.length){list.innerHTML='<li style="color:var(--muted);font-size:13px;padding:12px 0;">No goals yet. Add something to achieve this week.</li>';return;}
  list.innerHTML=state.goals.map(g=>{
    const c=catColors[g.cat]||catColors.life;
    return `<li class="goal-item">
      <div class="goal-check ${g.done?'done':''}" onclick="toggleGoal(${g.id})"></div>
      <span class="goal-text ${g.done?'done':''}">${g.text}</span>
      <span class="goal-tag" style="background:${c.bg};color:${c.color}">${catLabels[g.cat]||g.cat}</span>
      <button class="goal-del" onclick="deleteGoal(${g.id})">×</button>
    </li>`;
  }).join('');
}

// ─── FITNESS ───
async function setFitGoal(){
  const val=parseInt(document.getElementById('fitGoalInput').value);
  if(!val||val<1) return;
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  await sb.from('fitness_goals').upsert({month_key:mk,goal:val});
  state.fitGoals[mk]=val;
  document.getElementById('fitGoalInput').value='';
  updateFitGoalDisplay(); renderReports(); showSaved();
}
function updateFitGoalDisplay(){
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  const goal=state.fitGoals[mk];
  document.getElementById('fitGoalDisplay').textContent=goal?`Current: ${goal} workouts`:'Not set';
}
async function logWorkout(){
  const input=document.getElementById('workoutInput');
  const text=input.value.trim();
  if(!text) return;
  const now=new Date();
  const id=Date.now();
  const date=now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
  const time=now.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
  await sb.from('workouts').insert({id,text,date,time});
  state.workouts.unshift({id,text,date,time});
  input.value='';
  renderWorkouts(); updateOverview(); showSaved();
}
async function deleteWorkout(id){
  await sb.from('workouts').delete().eq('id',id);
  state.workouts=state.workouts.filter(w=>w.id!==id);
  renderWorkouts(); updateOverview(); showSaved();
}
function renderWorkouts(){
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const prefix=monthKey(y,m)+'-';
  const monthCount=Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
  document.getElementById('fit-count').textContent=monthCount;
  const log=document.getElementById('workoutLog');
  if(!state.workouts.length){log.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No workouts logged yet. Start small — even a walk counts.</div>';return;}
  log.innerHTML=state.workouts.slice(0,8).map(w=>`
    <div class="workout-day">
      <div style="width:10px;height:10px;border-radius:50%;background:var(--blue);flex-shrink:0;"></div>
      <span style="color:var(--muted);font-size:11px;width:90px;flex-shrink:0">${w.date}</span>
      <span style="flex:1">${w.text}</span>
      <span style="color:var(--muted);font-size:11px;margin-right:8px">${w.time}</span>
      <button class="del-btn" onclick="deleteWorkout(${w.id})">×</button>
    </div>`).join('');
}

// FITNESS CALENDAR
const calView={year:todayObj.getFullYear(),month:todayObj.getMonth()};
function buildCalendar(){
  const{year,month}=calView;
  document.getElementById('calMonthLabel').textContent=`${MONTH_NAMES[month]} ${year}`;
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const offset=(firstDay+6)%7;
  let html='';
  for(let i=0;i<offset;i++) html+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const key=dayKey(year,month,d);
    const isActive=!!state.fitnessHeatmap[key];
    const isToday=todayObj.getFullYear()===year&&todayObj.getMonth()===month&&todayObj.getDate()===d;
    html+=`<div class="cal-cell ${isActive?'active':''} ${isToday?'today':''}" onclick="toggleCalDay('${key}')">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}
async function toggleCalDay(key){
  if(state.fitnessHeatmap[key]){
    await sb.from('fitness_heatmap').delete().eq('day_key',key);
    delete state.fitnessHeatmap[key];
  } else {
    await sb.from('fitness_heatmap').insert({day_key:key});
    state.fitnessHeatmap[key]=true;
  }
  buildCalendar(); updateOverview(); renderReports(); showSaved();
}
function calPrev(){calView.month--;if(calView.month<0){calView.month=11;calView.year--;}buildCalendar();}
function calNext(){calView.month++;if(calView.month>11){calView.month=0;calView.year++;}buildCalendar();}

// ─── FINANCE ───

function switchAcct(acct){
  activeAcct=acct;
  document.querySelectorAll('.acct-tab').forEach((t,i)=>t.classList.toggle('active',['personal','joint','budget'][i]===acct));
  const accountsView=document.getElementById('fin-view-accounts');
  const budgetView=document.getElementById('fin-view-budget');
  const subTabs=document.getElementById('fin-personal-subtabs');
  const catsView=document.getElementById('fin-view-categories');
  if(acct==='budget'){accountsView.style.display='none';budgetView.style.display='none';catsView.style.display='none';budgetView.style.display='block';renderBudgetView();}
  else if(acct==='categories'){accountsView.style.display='none';budgetView.style.display='none';catsView.style.display='block';}
  else{accountsView.style.display='block';budgetView.style.display='none';catsView.style.display='none';subTabs.style.display=acct==='personal'?'flex':'none';updateBadge();renderFinance();}
}
function switchSubAcct(sub){
  activeSubAcct=sub;
  document.querySelectorAll('.sub-tab').forEach((t,i)=>t.classList.toggle('active',['credit','debit','income'][i]===sub));
  document.getElementById('txType').value=sub==='income'?'income':'expense';
  updateBadge(); renderFinance();
}
function updateBadge(){
  const badge=document.getElementById('fin-acct-badge');
  if(activeAcct==='personal'){
    const subLabel=activeSubAcct==='credit'?'Credit':activeSubAcct==='debit'?'Debit':'Income';
    badge.textContent=`Personal · ${subLabel}`;badge.style.background='#1a2e1a';badge.style.color='var(--green)';
  }else{badge.textContent='Joint (50/50)';badge.style.background='#1a1e2e';badge.style.color='var(--blue)';}
}
async function addTransaction(){
  const desc=document.getElementById('txDesc').value.trim();
  const amount=parseFloat(document.getElementById('txAmount').value);
  const type=document.getElementById('txType').value;
  const cat=document.getElementById('txCat').value;
  if(!desc||isNaN(amount)||amount<=0) return;
  const now=new Date();
  const id=Date.now();
  const subType=activeAcct==='personal'?activeSubAcct:(type==='income'?'income':'credit');
  const mk=monthKey(viewYear,viewMonth);
  const dd=String(now.getDate()).padStart(2,'0');
  const mm=String(now.getMonth()+1).padStart(2,'0');
  const yy=String(now.getFullYear()).slice(2);
  const date=`${dd}/${mm}/${yy}`;
  const {error} = await sb.from('transactions').insert({id,description:desc,amount,type,sub_type:subType,cat,acct:activeAcct,date,month_key:mk});
  if(error){ console.error('Save error:',error); alert('Could not save transaction. Please try again.'); return; }
  state.transactions.unshift({id,description:desc,text:desc,amount,type,subType,cat,acct:activeAcct,date,monthKey:mk});
  document.getElementById('txDesc').value='';document.getElementById('txAmount').value='';
  renderFinance();renderTotalCover();updateOverview();showSaved();
}
async function deleteTransaction(id){
  await sb.from('transactions').delete().eq('id',id);
  state.transactions=state.transactions.filter(t=>t.id!==id);
  renderFinance();renderTotalCover();updateOverview();showSaved();
}
function effectiveAmount(t){return t.acct==='joint'?t.amount*0.5:t.amount;}

// ── CATEGORY SELECT ──
function renderCatSelect(){
  const sel=document.getElementById('txCat');
  if(!sel) return;
  const cats=getCategories();
  sel.innerHTML=cats.map(c=>`<option>${c}</option>`).join('');
}

// ── CATEGORY MANAGER ──
function renderCatManager(){
  const list=document.getElementById('catManagerList');
  if(!list) return;
  const cats=getCategories();
  list.innerHTML=cats.map((cat,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="width:8px;height:8px;border-radius:50%;background:${getCatColor(i)};flex-shrink:0;"></div>
      <span style="flex:1;font-size:13px;">${cat}</span>
      ${cats.length>1?`<button onclick="deleteCategory('${cat}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;transition:color 0.2s;" onmouseover="this.style.color='var(--pink)'" onmouseout="this.style.color='var(--muted)'">×</button>`:''}
    </div>`).join('');
}

async function addCategory(){
  const input=document.getElementById('newCatInput');
  const name=input.value.trim();
  if(!name) return;
  if(getCategories().includes(name)){alert('Category already exists.');return;}
  state.categories.push(name);
  setCategoryType(name,type);
  await sb.from('categories').insert({name,sort_order:state.categories.length});
  input.value='';
  renderCatManager(); renderCatSelect(); renderBudgetView(); showSaved();
}

async function deleteCategory(cat){
  if(!confirm(`Delete category "${cat}"? Existing transactions will keep their label, and any budget set for this category will be removed.`)) return;
  state.categories=state.categories.filter(c=>c!==cat);
  delete state.budgets[cat];
  delete categoryTypes[cat]; saveCategoryTypes();
  await Promise.all([
    sb.from('categories').delete().eq('name',cat),
    sb.from('budgets').delete().eq('cat',cat)
  ]);
  renderCatManager(); renderCatSelect(); renderBudgetView(); showSaved();
}

// ── CSV UPLOAD & RULE-BASED CATEGORISATION ──

// Category matching rules — description keywords → category
const CAT_RULES = [
  { keywords: ['woolworths','coles','aldi','iga','harris farm','costco','butcher','bakery','seafood','deli','supermarket','grocery'], cat: 'Food & Dining' },
  { keywords: ['uber eats','doordash','menulog','deliveroo','mcdonalds','kfc','subway','hungry jacks','dominos','pizza','burger','sushi','thai','chinese','indian','restaurant','cafe','coffee','starbucks','gloria jeans','dining','lunch','dinner','breakfast','eat'], cat: 'Food & Dining' },
  { keywords: ['uber','ola','didi','taxi','lyft','train','bus','metro','opal','myki','ferry','tram','parking','toll','transport','transit','fuel','petrol','bp','shell','caltex','7-eleven'], cat: 'Transport' },
  { keywords: ['netflix','spotify','apple music','disney','stan','binge','foxtel','youtube premium','amazon prime','adobe','microsoft 365','google one','icloud','dropbox','subscription','membership'], cat: 'Subscriptions' },
  { keywords: ['doctor','gp','hospital','pharmacy','chemist','medibank','bupa','nib','ahm','dental','optometrist','physio','medical','health','clinic','medicare','pathology'], cat: 'Health & Medical' },
  { keywords: ['electricity','gas','water','internet','telstra','optus','vodafone','tpg','aussie broadband','phone','council rates','body corporate','strata','insurance','rent','mortgage','utilities','bill'], cat: 'Utilities & Bills' },
  { keywords: ['cinema','event','ticketek','ticketmaster','entertainment','concert','theatre','museum','gallery','sport','gym','fitness','movie'], cat: 'Entertainment' },
  { keywords: ['amazon','ebay','kmart','target','big w','myer','david jones','zara','uniqlo','cotton on','h&m','glue','asos','the iconic','shopping','clothing','shoes','fashion','electronics','jb hi','harvey norman','apple store','officeworks'], cat: 'Shopping' },
  { keywords: ['salary','payroll','wage','pay from employer'], cat: 'Salary', type: 'income' },
  { keywords: ['bonus','commission','incentive'], cat: 'Bonus', type: 'income' },
  { keywords: ['refund','cashback','rebate'], cat: 'Refund', type: 'income' },
  { keywords: ['reimbursement','reimburse'], cat: 'Reimbursement', type: 'income' },
  { keywords: ['interest earned','interest paid','bank interest'], cat: 'Interest', type: 'income' },
  { keywords: ['dividend','distribution'], cat: 'Dividend', type: 'income' },
  { keywords: ['income','deposit','transfer in'], cat: 'Other', type: 'income' },
];

function guessCategory(description, amount, type){
  const desc = description.toLowerCase();
  const cats=getCategories();
  const fallback = type==='income'
    ? (getCategoriesByType('income')[0] || cats[0] || 'Other')
    : (getCategoriesByType('expense')[0] || cats[0] || 'Other');
  for(const rule of CAT_RULES){
    if(rule.keywords.some(k=>desc.includes(k))){
      return cats.includes(rule.cat) ? rule.cat : fallback;
    }
  }
  return cats.includes('Other') ? 'Other' : fallback;
}

function guessType(description){
  const desc = description.toLowerCase();
  // Only flag as income if very clearly an income transaction
  const incomeKeywords = ['salary','payroll','wage','interest earned','interest paid','dividend','distribution','bonus','commission','refund','cashback','reimbursement from','rebate'];
  if(incomeKeywords.some(k=>desc.includes(k))) return 'income';
  return 'expense'; // default everything to expense
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length < 2) return [];
  
  // Detect delimiter
  const delim = lines[0].includes('	') ? '	' : ',';
  
  const parseRow = (line) => {
    const result = [];
    let cur = '', inQuote = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch==='"') inQuote=!inQuote;
      else if(ch===delim && !inQuote){ result.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,''));
  
  // Find column indices — handle various bank CSV formats
  const findCol = (...names) => {
    for(const n of names){
      const i = headers.findIndex(h=>h.includes(n));
      if(i>=0) return i;
    }
    return -1;
  };

  const dateCol    = findCol('date','transactiondate','txdate');
  const descCol    = findCol('description','details','narrative','merchant','memo','transactiondetails','particulars');
  const amountCol  = findCol('amount','debit','credit','transactionamount');
  const debitCol   = findCol('debit','withdrawal','withdrawals');
  const creditCol  = findCol('credit','deposit','deposits');

  if(dateCol<0 || descCol<0) return null; // can't parse

  const txs = [];
  for(let i=1;i<lines.length;i++){
    const row = parseRow(lines[i]);
    if(row.length < 2) continue;

    const date    = row[dateCol]?.replace(/"/g,'').trim() || '';
    const desc    = row[descCol]?.replace(/"/g,'').trim() || '';
    if(!date || !desc) continue;

    let amount = 0, type = 'expense';

    if(amountCol>=0){
      // Single amount column — negative = debit, positive = credit
      const raw = parseFloat(row[amountCol]?.replace(/[$,"]/g,'') || '0');
      amount = Math.abs(raw);
      type = raw >= 0 ? 'income' : 'expense';
    } else if(debitCol>=0 && creditCol>=0){
      // Separate debit/credit columns
      const debit  = parseFloat(row[debitCol]?.replace(/[$,"]/g,'') || '0');
      const credit = parseFloat(row[creditCol]?.replace(/[$,"]/g,'') || '0');
      if(credit > 0){ amount = credit; type = 'income'; }
      else { amount = debit; type = 'expense'; }
    }

    if(amount <= 0) continue;

    // Override type based on description keywords
    const descType = guessType(desc);
    if(descType === 'income') type = 'income';

    const subType = type==='income'?'income':'credit';

    txs.push({
      date: formatDate(date),
      description: desc,
      amount,
      type,
      subType,
      category: guessCategory(desc, amount, type)
    });
  }
  return txs;
}

function formatDate(raw){
  // Always treat as AU format: D/M/YYYY or DD/MM/YYYY or DD/MM/YY
  // Never use JS Date() parser — it assumes US format for ambiguous dates
  try {
    raw = raw.trim().replace(/"/g,'');

    // D/M/YYYY or DD/MM/YYYY or D/M/YY — AU format (day first)
    const auSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(auSlash){
      const dd = auSlash[1].padStart(2,'0');
      const mm = auSlash[2].padStart(2,'0');
      const yy = auSlash[3].length===4 ? auSlash[3].slice(2) : auSlash[3].padStart(2,'0');
      return `${dd}/${mm}/${yy}`;
    }

    // D-M-YYYY or DD-MM-YYYY — AU format with dashes
    const auDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if(auDash){
      const dd = auDash[1].padStart(2,'0');
      const mm = auDash[2].padStart(2,'0');
      const yy = auDash[3].length===4 ? auDash[3].slice(2) : auDash[3].padStart(2,'0');
      return `${dd}/${mm}/${yy}`;
    }

    // YYYY-MM-DD (ISO format from some banks)
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso){
      return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`;
    }

    // Already formatted or unknown — return as-is
    return raw;
  } catch(e){ return raw; }
}

function handleStatementUpload(event){
  const file=event.target.files[0];
  if(!file) return;
  event.target.value='';

  if(!file.name.toLowerCase().endsWith('.csv')){
    openUploadModal();
    document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Please upload a CSV file. Download your statement as CSV from your bank app.</span>';
    document.getElementById('uploadReviewList').innerHTML='';
    document.getElementById('confirmUploadBtn').style.display='none';
    return;
  }

  openUploadModal();
  document.getElementById('uploadStatus').innerHTML='<span style="color:var(--blue);">📄 Reading your statement…</span>';
  document.getElementById('uploadReviewList').innerHTML='';
  document.getElementById('confirmUploadBtn').style.display='none';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const txs = parseCSV(text);

      if(txs === null){
        document.getElementById("uploadStatus").innerHTML='<span style="color:var(--pink);">⚠️ Could not read this CSV format. Make sure you are uploading a bank statement CSV.</span>';
        return;
      }

      if(!txs.length){
        document.getElementById('uploadStatus').innerHTML='<span style="color:var(--muted);">No transactions found. Check the file has transaction data.</span>';
        return;
      }

      pendingUploadTxs = txs.map((t,i)=>({...t, _id:i, acct:activeAcct, keep:true}));
      renderUploadReview();
      document.getElementById('uploadStatus').innerHTML=`<span style="color:var(--green);">✓ Found <strong>${txs.length} transactions</strong>. Review below — update any categories before saving.</span>`;
      document.getElementById('confirmUploadBtn').style.display='block';

    } catch(err){
      console.error(err);
      document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Something went wrong reading the file. Please try again.</span>';
    }
  };
  reader.onerror = () => {
    document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Could not read the file. Please try again.</span>';
  };
  reader.readAsText(file);
}


function setUploadSearch(value){
  uploadSearchTerm = String(value||'').trim();
  renderUploadReview();
}

function setMonthlyTxSearch(value){
  monthlyTxSearch = String(value||'').trim().toLowerCase();
  monthlyTxExpanded = !!monthlyTxSearch;
  renderMonthly();
}

function highlightSearchText(text, term){
  const safe = escapeHTML(text);
  const q = String(term||'').trim();
  if(!q) return safe;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(new RegExp(escaped, 'gi'), match => `<mark class="search-highlight">${match}</mark>`);
  } catch(e){ return safe; }
}

function renderUploadReview(){
  const cats=getCategories();
  const list=document.getElementById('uploadReviewList');
  list.innerHTML=`
    <div style="display:grid;grid-template-columns:30px 1fr 100px 110px 120px;gap:8px;padding:8px 0;border-bottom:2px solid var(--border);font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">
      <div></div><div>Description</div><div>Amount</div><div>Type</div><div>Category</div>
    </div>
    ${pendingUploadTxs.map(t=>`
    <div style="display:grid;grid-template-columns:30px 1fr 100px 110px 120px;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);align-items:center;font-size:13px;" id="urow_${t._id}">
      <input type="checkbox" ${t.keep?'checked':''} onchange="toggleUploadRow(${t._id},this.checked)" style="width:16px;height:16px;accent-color:var(--blue);">
      <div>
        <div style="font-weight:500;">${t.description}</div>
        <div style="font-size:11px;color:var(--muted);">${t.date}</div>
      </div>
      <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;color:${t.type==='income'?'var(--green)':'var(--pink)'};">${t.type==='income'?'+':'-'}$${parseFloat(t.amount).toFixed(2)}</div>
      <select onchange="updateUploadRow(${t._id},'type',this.value)" style="font-size:11px;padding:4px 6px;">
        <option value="expense" ${t.type==='income'?'':'selected'}>− Expense</option>
        <option value="income" ${t.type==='income'?'selected':''}>+ Income</option>
      </select>
      <select onchange="updateUploadRow(${t._id},'category',this.value)" style="font-size:11px;padding:4px 6px;">
        ${cats.map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>`).join('')}`;
}

function toggleUploadRow(id, checked){
  const t=pendingUploadTxs.find(t=>t._id===id);
  if(t) t.keep=checked;
}

function updateUploadRow(id, field, val){
  const t=pendingUploadTxs.find(t=>t._id===id);
  if(t) t[field]=val;
  // re-colour amount cell
  renderUploadReview();
}


async function quickAddUploadCategory(rowId){
  const raw=prompt('New category name:');
  const name=(raw||'').trim();
  if(!name) return;
  const typeRaw=prompt('Category type: expense, income, or asset', 'expense');
  const type=['expense','income','asset'].includes(String(typeRaw||'').toLowerCase()) ? String(typeRaw).toLowerCase() : 'expense';
  const warning=categorySimilarityWarning(name);
  if(warning && !confirm(warning.replace(/^⚠️\s*/, '')+'\n\nContinue adding this category?')) return;
  restoreCategory(name);
  if(!state.categories.includes(name)) state.categories.push(name);
  setCategoryType(name,type);
  await sb.from('categories').upsert({name,sort_order:state.categories.length});
  const row=pendingUploadTxs.find(t=>t._id===rowId);
  if(row){ row.category=name; row.rememberRule=true; row.ruleApplied=false; }
  renderCatSelect(); renderBudgetView(); renderUploadReview(); showSaved();
}

async function confirmUpload(){
  const btn=document.getElementById('confirmUploadBtn');
  btn.textContent='Saving…'; btn.disabled=true;
  const toSave=pendingUploadTxs.filter(t=>t.keep);
  let saved=0, failed=0;
  for(const t of toSave){
    // Use integer ID — Date.now() with small sequential offset
    const id = Date.now() * 1000 + saved;
    const subType=t.type==='income'?'income':(t.subType||'credit');
    const mk = monthKeyFromDate(t.date);
    const {error} = await sb.from('transactions').insert({
      id,
      description: t.description,
      amount: parseFloat(t.amount),
      type: t.type,
      sub_type: subType,
      cat: t.category,
      acct: t.acct,
      date: t.date,
      month_key: mk
    });
    if(error){
      console.error('Failed to save transaction:', t.description, error);
      failed++;
    } else {
      state.transactions.unshift({
        id,
        description: t.description,
        amount: parseFloat(t.amount),
        type: t.type,
        subType,
        cat: t.category,
        acct: t.acct,
        date: t.date,
        monthKey: mk
      });
      saved++;
    }
    // Small delay to ensure unique IDs
    await new Promise(r=>setTimeout(r,2));
  }
  closeUploadModal();
  if(failed>0){
    alert(`${saved} transactions saved. ${failed} failed — please try uploading again.`);
  }
  renderFinance(); renderTotalCover(); updateOverview(); showSaved();
}

function openUploadModal(){ document.getElementById('uploadModal').style.display='block'; document.body.style.overflow='hidden'; }
function closeUploadModal(){ document.getElementById('uploadModal').style.display='none'; document.body.style.overflow=''; pendingUploadTxs=[]; }
function renderTotalCover(){
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  const allExp=state.transactions.filter(t=>t.type==='expense'&&t.monthKey===mk);
  const personalExp=allExp.filter(t=>t.acct==='personal').reduce((s,t)=>s+t.amount,0);
  const jointShare=allExp.filter(t=>t.acct==='joint').reduce((s,t)=>s+t.amount*0.5,0);
  const total=personalExp+jointShare;
  const totalInc=state.transactions.filter(t=>t.type==='income'&&t.monthKey===mk).reduce((s,t)=>s+effectiveAmount(t),0);
  const net=totalInc-total;
  document.getElementById('fin-total-cover').textContent='$'+total.toFixed(2);
  document.getElementById('fin-cover-breakdown').textContent=`Personal $${personalExp.toFixed(0)} + Joint share $${jointShare.toFixed(0)}`;
  document.getElementById('fin-total-income').textContent='$'+totalInc.toFixed(2);
  const netEl=document.getElementById('fin-total-net');
  netEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  netEl.style.color=net>=0?'var(--green)':'var(--pink)';
}
function finPrevMonth(){ viewMonth--; if(viewMonth<0){viewMonth=11;viewYear--;} renderFinance(); }
function finNextMonth(){
  const now=new Date();
  if(viewYear===now.getFullYear()&&viewMonth===now.getMonth()) return; // can't go past current month
  viewMonth++; if(viewMonth>11){viewMonth=0;viewYear++;} renderFinance();
}

function renderFinance(){
  const isJoint=activeAcct==='joint';
  const mk=monthKey(viewYear,viewMonth);
  const now=new Date();
  const isCurrentMonth=viewYear===now.getFullYear()&&viewMonth===now.getMonth();

  // Update month nav display
  const monthNavEl=document.getElementById('finMonthNav');
  if(monthNavEl){
    monthNavEl.textContent=`${MONTH_NAMES[viewMonth]} ${viewYear}`;
  }
  // Disable next button if current month
  const nextBtn=document.getElementById('finNextBtn');
  if(nextBtn) nextBtn.style.opacity=isCurrentMonth?'0.3':'1';

  let txs;
  if(isJoint) txs=state.transactions.filter(t=>t.acct==='joint'&&t.monthKey===mk);
  else if(activeSubAcct==='income') txs=state.transactions.filter(t=>t.acct==='personal'&&t.type==='income'&&t.monthKey===mk);
  else txs=state.transactions.filter(t=>t.acct==='personal'&&t.subType===activeSubAcct&&t.monthKey===mk);

  // Summary cards show selected month across all accounts
  const allMkTxs=state.transactions.filter(t=>t.monthKey===mk);
  const income=allMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=allMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  document.getElementById('fin-income').textContent='$'+income.toFixed(2);
  document.getElementById('fin-income-sub').textContent=`${MONTH_SHORT[viewMonth]} — all accounts`;
  document.getElementById('fin-expense').textContent='$'+expense.toFixed(2);
  document.getElementById('fin-expense-sub').textContent='personal + 50% joint';
  const netEl=document.getElementById('fin-net');
  netEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  netEl.style.color=net>=0?'var(--green)':'var(--pink)';
  document.getElementById('fin-net-sub').textContent='combined net';
  document.getElementById('fin-cat-month').textContent=MONTH_SHORT[viewMonth];
  const expenses=txs.filter(t=>t.type==='expense');
  const catEl=document.getElementById('fin-cat-breakdown');
  if(!expenses.length){catEl.innerHTML='<div style="color:var(--muted);font-size:13px;">No expenses this month.</div>';}
  else{
    const cats=getCategories();
    const byCat=cats.map((cat,i)=>{const sum=expenses.filter(t=>t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);return{cat,sum,color:getCatColor(i)};}).filter(c=>c.sum>0).sort((a,b)=>b.sum-a.sum);
    const maxCat=byCat[0]?.sum||1;
    catEl.innerHTML=byCat.map(c=>`<div class="cat-row"><div class="cat-dot" style="background:${c.color}"></div><div class="cat-name">${c.cat}</div><div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${Math.round((c.sum/maxCat)*100)}%;background:${c.color}"></div></div><div class="cat-amount" style="color:${c.color}">$${c.sum.toFixed(0)}${isJoint?'<span class="split-note">½</span>':''}</div></div>`).join('');
  }
  const lastDate=new Date(viewYear,viewMonth-1,1);
  const lastKey=monthKey(lastDate.getFullYear(),lastDate.getMonth());
  const mn=MONTH_SHORT[viewMonth],lmn=MONTH_SHORT[lastDate.getMonth()];
  const thisE=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const lastMkTxs=state.transactions.filter(t=>t.monthKey===lastKey&&(isJoint?t.acct==='joint':t.acct==='personal'));
  const lastE=lastMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const diff=thisE-lastE;
  document.getElementById('fin-monthly-review').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <button onclick="finPrevMonth()" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:14px;flex-shrink:0;">‹</button>
      <span style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;flex:1;text-align:center;" id="finMonthNav">${mn} ${viewYear}</span>
      <button id="finNextBtn" onclick="finNextMonth()" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:14px;flex-shrink:0;">›</button>
    </div>
    <div class="stat-row" style="margin-bottom:10px;">
      <div class="stat-box"><div class="stat-box-label">${mn} spend</div><div class="stat-box-val" style="color:var(--pink);font-size:18px;">$${thisE.toFixed(0)}</div></div>
      <div class="stat-box"><div class="stat-box-label">${lmn} spend</div><div class="stat-box-val" style="color:var(--muted);font-size:18px;">$${lastE.toFixed(0)}</div></div>
    </div>
    <div class="insight" style="margin-top:0;">${thisE===0?'<strong>No expenses logged yet for '+mn+'.</strong>':diff>0?'<strong>Up $'+diff.toFixed(0)+' vs '+lmn+'.</strong>':diff<0?'<strong>Down $'+Math.abs(diff).toFixed(0)+' vs '+lmn+'.</strong> Good.':'<strong>Same as '+lmn+'.</strong>'}</div>`;
  const list=document.getElementById('transactionList');
  if(!txs.length){list.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No transactions yet.</div>';return;}
  list.innerHTML=txs.slice(0,50).map(t=>{
    const desc=t.description||t.desc||t.text||'';
    const eff=effectiveAmount(t);
    const cats=getCategories();
    return `<div class="finance-row" id="txrow_${t.id}">
      <div style="flex:1;">
        <div style="font-weight:500;">${desc}${t.acct==='joint'?'<span class="split-note">½</span>':''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${t.cat} · ${t.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="amount ${t.type}">${t.type==='income'?'+':'-'}$${eff.toFixed(2)}</div>
        ${t.acct==='joint'?`<div style="font-size:10px;color:var(--muted);">total $${t.amount.toFixed(2)}</div>`:''}
        <button data-txid="${t.id}" onclick="openEditTx(this.dataset.txid)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;font-size:11px;padding:3px 8px;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">Edit</button>
        <button class="del-btn" onclick="deleteTransaction(${t.id})">×</button>
      </div>
    </div>`;
  }).join('');
}
async function setBudget(cat,val){
  const v=parseFloat(val);
  if(!isNaN(v)&&v>0){await sb.from('budgets').upsert({cat,amount:v});state.budgets[cat]=v;}
  else{await sb.from('budgets').delete().eq('cat',cat);delete state.budgets[cat];}
  renderBudgetView();showSaved();
}
function renderBudgetView(){
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  const mn=MONTH_SHORT[todayObj.getMonth()]+' '+todayObj.getFullYear();
  document.getElementById('budget-month-label').textContent=mn;
  const budgCats=getCategories();
  document.getElementById('budgetSetterRows').innerHTML=budgCats.map((cat,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <div class="cat-dot" style="background:${CAT_COLORS[i]}"></div>
      <div style="font-size:12px;width:140px;flex-shrink:0;">${cat}</div>
      <input type="number" min="0" step="10" style="width:90px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;text-align:right;" placeholder="$0" value="${state.budgets[cat]||''}" onchange="setBudget('${cat}',this.value)">
      <span style="font-size:11px;color:var(--muted);">/ month</span>
    </div>`).join('');
  const allExp=state.transactions.filter(t=>t.type==='expense'&&t.monthKey===mk);
  const hasBudgets=Object.keys(state.budgets).length>0;
  const actRows=document.getElementById('budgetActualRows');
  const budgetIns=document.getElementById('budgetInsight');
  if(!hasBudgets){actRows.innerHTML='<div style="color:var(--muted);font-size:13px;">Set budgets above to see comparisons.</div>';budgetIns.style.display='none';return;}
  let overCount=0,totalBudget=0,totalActual=0;
  actRows.innerHTML=budgCats.map((cat,i)=>{
    const budget=state.budgets[cat]||0;if(!budget) return '';
    const personal=allExp.filter(t=>t.acct==='personal'&&t.cat===cat).reduce((s,t)=>s+t.amount,0);
    const joint=allExp.filter(t=>t.acct==='joint'&&t.cat===cat).reduce((s,t)=>s+t.amount*0.5,0);
    const actual=personal+joint;
    const pct=Math.min(100,Math.round((actual/budget)*100));
    const over=actual>budget;if(over)overCount++;totalBudget+=budget;totalActual+=actual;
    const color=over?'var(--pink)':pct>80?'var(--orange)':getCatColor(i);
    return `<div class="budget-row"><div class="cat-dot" style="background:${CAT_COLORS[i]}"></div><div class="budget-cat">${cat}</div><div class="budget-bars"><div class="budget-bar-track"><div class="budget-bar-actual" style="width:${pct}%;background:${color};"></div></div><div class="budget-nums"><span class="${over?'over':''}">$${actual.toFixed(0)} spent</span><span>$${budget} budget</span></div></div><div class="budget-status" style="color:${color};">${over?'▲ over':pct+'%'}</div></div>`;
  }).filter(Boolean).join('');
  budgetIns.style.display='block';
  const rem=totalBudget-totalActual;
  budgetIns.innerHTML=overCount>0?`<strong>${overCount} categor${overCount>1?'ies':'y'} over budget.</strong> Total $${totalActual.toFixed(0)} vs $${totalBudget.toFixed(0)} budgeted.`:`<strong>On track.</strong> $${totalActual.toFixed(0)} of $${totalBudget.toFixed(0)} used (${Math.round((totalActual/totalBudget)*100)}%). $${rem.toFixed(0)} remaining.`;
}

// ─── BOOKS / READING ───
async function addBook(){
  const title=document.getElementById('bookTitle').value.trim();
  const author=document.getElementById('bookAuthor').value.trim();
  const startDate=document.getElementById('bookStartDate').value;
  const status=document.getElementById('bookStatusInput').value;
  if(!title) return;
  const id=Date.now();
  const color=bookColors[state.books.length%bookColors.length];
  await sb.from('books').insert({id,title,author:author||'Unknown',color,status,start_date:startDate,end_date:status==='finished'?startDate:''});
  state.books.push({id,title,author:author||'Unknown',color,status,startDate,endDate:status==='finished'?startDate:''});
  document.getElementById('bookTitle').value='';document.getElementById('bookAuthor').value='';document.getElementById('bookStartDate').value='';
  renderBooks();updateReadCalBookSelect();buildReadCal();updateOverview();renderReadReports();showSaved();
}
async function deleteBook(id){
  await sb.from('books').delete().eq('id',id);
  await sb.from('reading_heatmap').delete().eq('day_key','placeholder');// handled below
  // remove book from all heatmap entries
  for(const key of Object.keys(state.readHeatmap)){
    state.readHeatmap[key]=state.readHeatmap[key].filter(bid=>bid!==id);
    if(!state.readHeatmap[key].length){delete state.readHeatmap[key];await sb.from('reading_heatmap').delete().eq('day_key',key);}
    else{await sb.from('reading_heatmap').upsert({day_key:key,book_ids:state.readHeatmap[key]});}
  }
  state.books=state.books.filter(b=>b.id!==id);
  renderBooks();updateReadCalBookSelect();buildReadCal();updateOverview();renderReadReports();showSaved();
}
async function setBookStatus(id,status){
  const b=state.books.find(b=>b.id===id);if(!b) return;
  b.status=status;
  if(status==='finished'&&!b.endDate) b.endDate=new Date().toISOString().slice(0,10);
  if(status==='reading') b.endDate='';
  await sb.from('books').update({status,end_date:b.endDate}).eq('id',id);
  renderBooks();updateOverview();renderReadReports();showSaved();
}
function renderBooks(){
  const list=document.getElementById('bookList');
  if(!state.books.length){list.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No books yet. Add one above.</div>';return;}
  const order={reading:0,paused:1,finished:2};
  const sorted=[...state.books].sort((a,b)=>(order[a.status]||0)-(order[b.status]||0));
  list.innerHTML=sorted.map(b=>{
    const daysRead=Object.values(state.readHeatmap).filter(ids=>ids.includes(b.id)).length;
    const startFmt=b.startDate?new Date(b.startDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
    const endFmt=b.endDate?new Date(b.endDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
    return `<div class="book-card" style="flex-wrap:wrap;gap:8px;">
      <div class="book-spine" style="background:${b.color};min-height:40px;"></div>
      <div style="flex:1;min-width:120px;">
        <div class="book-title">${b.title}</div><div class="book-author">${b.author}</div>
        <div class="book-dates">Started: ${startFmt}${b.status==='finished'?` · Finished: ${endFmt}`:''}${daysRead>0?`<span class="book-days"> · ${daysRead} days read</span>`:''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <select onchange="setBookStatus(${b.id},this.value)" style="font-size:11px;padding:3px 8px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text);">
          <option value="reading" ${b.status==='reading'?'selected':''}>📖 Reading</option>
          <option value="paused" ${b.status==='paused'?'selected':''}>⏸ Paused</option>
          <option value="finished" ${b.status==='finished'?'selected':''}>✅ Finished</option>
        </select>
        <button class="del-btn" style="margin:0;" onclick="deleteBook(${b.id})">×</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('read-active-count').textContent=state.books.filter(b=>b.status==='reading').length;
  document.getElementById('read-finished-count').textContent=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(String(todayObj.getFullYear()))).length;
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  document.getElementById('read-days-month').textContent=Object.keys(state.readHeatmap).filter(k=>k.startsWith(mk)&&state.readHeatmap[k]?.length).length;
}

// READING CALENDAR
const readCalView={year:todayObj.getFullYear(),month:todayObj.getMonth()};
let activeReadReport='monthly';
function switchGrowth(tab){
  document.querySelectorAll('#panel-growth .report-tab').forEach((t,i)=>t.classList.toggle('active',['reading','piano'][i]===tab));
  document.getElementById('growth-reading').style.display=tab==='reading'?'block':'none';
  document.getElementById('growth-piano').style.display=tab==='piano'?'block':'none';
}
function switchReadReport(name){
  activeReadReport=name;
  document.getElementById('read-report-monthly').style.display=name==='monthly'?'block':'none';
  document.getElementById('read-report-yearly').style.display=name==='yearly'?'block':'none';
  document.querySelectorAll('#growth-reading .report-tabs:last-of-type .report-tab').forEach((t,i)=>t.classList.toggle('active',['monthly','yearly'][i]===name));
  renderReadReports();
}
function updateReadCalBookSelect(){
  const sel=document.getElementById('readCalBookSelect');
  const current=sel.value;
  sel.innerHTML='<option value="__all__">All books</option>'+state.books.map(b=>`<option value="${b.id}" ${current==b.id?'selected':''}>${b.title}</option>`).join('');
}
function buildReadCal(){
  const{year,month}=readCalView;
  document.getElementById('readCalLabel').textContent=`${MONTH_NAMES[month]} ${year}`;
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const offset=(firstDay+6)%7;
  const selBook=document.getElementById('readCalBookSelect').value;
  let html='';
  for(let i=0;i<offset;i++) html+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const key=dayKey(year,month,d);
    const ids=state.readHeatmap[key]||[];
    const isActive=selBook==='__all__'?ids.length>0:ids.includes(Number(selBook)||parseInt(selBook));
    const isToday=todayObj.getFullYear()===year&&todayObj.getMonth()===month&&todayObj.getDate()===d;
    html+=`<div class="cal-cell ${isActive?'active':''} ${isToday?'today':''}" style="${isActive?'background:var(--purple);color:#000;':''}" onclick="toggleReadDay('${key}')">${d}</div>`;
  }
  document.getElementById('readCalGrid').innerHTML=html;
}
async function toggleReadDay(key){
  const selBook=document.getElementById('readCalBookSelect').value;
  if(!state.readHeatmap[key]) state.readHeatmap[key]=[];
  if(selBook==='__all__'){
    const readingIds=state.books.filter(b=>b.status==='reading').map(b=>b.id);
    const alreadyAll=readingIds.every(id=>state.readHeatmap[key].includes(id));
    if(alreadyAll) state.readHeatmap[key]=state.readHeatmap[key].filter(id=>!readingIds.includes(id));
    else readingIds.forEach(id=>{if(!state.readHeatmap[key].includes(id)) state.readHeatmap[key].push(id);});
  } else {
    const bid=Number(selBook)||parseInt(selBook);
    const idx=state.readHeatmap[key].indexOf(bid);
    if(idx>-1) state.readHeatmap[key].splice(idx,1); else state.readHeatmap[key].push(bid);
  }
  if(!state.readHeatmap[key].length){delete state.readHeatmap[key];await sb.from('reading_heatmap').delete().eq('day_key',key);}
  else{await sb.from('reading_heatmap').upsert({day_key:key,book_ids:state.readHeatmap[key]});}
  buildReadCal();renderBooks();renderReadReports();showSaved();
}
function readCalPrev(){readCalView.month--;if(readCalView.month<0){readCalView.month=11;readCalView.year--;}buildReadCal();}
function readCalNext(){readCalView.month++;if(readCalView.month>11){readCalView.month=0;readCalView.year++;}buildReadCal();}

function readDaysInMonth(y,m){
  const prefix=`${y}-${String(m+1).padStart(2,'0')}-`;
  return Object.keys(state.readHeatmap).filter(k=>k.startsWith(prefix)&&state.readHeatmap[k]?.length).length;
}
function renderReadReports(){renderReadMonthly();renderReadYearly();}
function renderReadMonthly(){
  const el=document.getElementById('read-report-monthly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const months=[];
  for(let i=5;i>=0;i--){let mm=m-i,yy=y;if(mm<0){mm+=12;yy--;}months.push({y:yy,m:mm,label:MONTH_SHORT[mm]+(yy!==y?` '${String(yy).slice(2)}`:'')} );}
  const curr=readDaysInMonth(y,m);
  const prevM=m===0?11:m-1,prevY=m===0?y-1:y;const prev=readDaysInMonth(prevY,prevM);
  const mk=`${y}-${String(m+1).padStart(2,'0')}`;
  const finishedThisMonth=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(mk));
  const maxVal=Math.max(...months.map(mo=>readDaysInMonth(mo.y,mo.m)),1);
  const barData=months.map(mo=>({label:mo.label,value:readDaysInMonth(mo.y,mo.m),highlight:mo.y===y&&mo.m===m}));
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${MONTH_NAMES[m]} ${y} — Reading Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Days read</div><div class="stat-box-val" style="color:var(--purple)">${curr} ${deltaBadge(curr,prev)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last month</div><div class="stat-box-val" style="color:var(--muted)">${prev}</div></div>
      <div class="stat-box"><div class="stat-box-label">Books finished</div><div class="stat-box-val" style="color:var(--green)">${finishedThisMonth.length}</div></div>
      <div class="stat-box"><div class="stat-box-label">In progress</div><div class="stat-box-val" style="color:var(--blue)">${state.books.filter(b=>b.status==='reading').length}</div></div>
    </div>
    ${renderBarChart(barData,maxVal,null)}
    <div class="insight">${curr===0?'<strong>No reading days logged yet.</strong>':curr>prev?`<strong>Up ${curr-prev} days vs last month.</strong>`:curr<prev?`<strong>Down ${Math.abs(curr-prev)} days vs last month.</strong>`:` <strong>Same as last month (${curr} days).</strong>`}</div>
  </div>`;
}
function renderReadYearly(){
  const el=document.getElementById('read-report-yearly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const monthData=[];
  for(let mo=0;mo<=m;mo++) monthData.push({label:MONTH_SHORT[mo],value:readDaysInMonth(y,mo),highlight:mo===m});
  const total=monthData.reduce((s,mo)=>s+mo.value,0);
  const lastTotal=Array.from({length:m+1},(_,mo)=>readDaysInMonth(y-1,mo)).reduce((s,v)=>s+v,0);
  const finished=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(String(y)));
  const maxVal=Math.max(...monthData.map(mo=>mo.value),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${y} — Yearly Reading Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Days read ${y}</div><div class="stat-box-val" style="color:var(--purple)">${total} ${deltaBadge(total,lastTotal)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Same period ${y-1}</div><div class="stat-box-val" style="color:var(--muted)">${lastTotal}</div></div>
      <div class="stat-box"><div class="stat-box-label">Books finished</div><div class="stat-box-val" style="color:var(--green)">${finished.length}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(total/(m+1)).toFixed(1)}</div></div>
    </div>
    ${renderBarChart(monthData,maxVal,null)}
    <div class="insight">${total===0?'<strong>No reading logged yet this year.</strong>':total>lastTotal?`<strong>Ahead of last year by ${total-lastTotal} days.</strong>`:total<lastTotal?`<strong>Behind last year by ${lastTotal-total} days.</strong>`:' <strong>Tracking with last year.</strong>'}${total>0?` Average <strong>${(total/(m+1)).toFixed(1)} days/month</strong>.`:''}</div>
  </div>`;
}

// ─── PIANO ───
async function logPiano(){
  const mins=parseInt(document.getElementById('pianoMins').value);
  const note=document.getElementById('pianoNote').value.trim();
  if(!mins||mins<=0) return;
  const id=Date.now();
  const date=new Date().toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
  await sb.from('piano').insert({id,mins,note:note||'Practice session',date});
  state.piano.unshift({id,mins,note:note||'Practice session',date});
  document.getElementById('pianoMins').value='';document.getElementById('pianoNote').value='';
  renderPiano();updateOverview();showSaved();
}
async function deletePiano(id){
  await sb.from('piano').delete().eq('id',id);
  state.piano=state.piano.filter(p=>p.id!==id);
  renderPiano();updateOverview();showSaved();
}
function renderPiano(){
  const total=state.piano.reduce((s,p)=>s+p.mins,0);
  const pct=Math.min(100,Math.round((total/PIANO_GOAL)*100));
  document.getElementById('piano-mins').innerHTML=total+' <span style="font-size:16px;color:var(--muted)">min</span>';
  document.getElementById('piano-bar').style.width=pct+'%';
  document.getElementById('piano-pct').textContent=pct+'%';
  const log=document.getElementById('pianoLog');
  if(!state.piano.length){log.innerHTML='';return;}
  log.innerHTML=state.piano.slice(0,3).map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
      <span>${p.note} · <span style="color:var(--purple)">${p.mins}min</span> · ${p.date}</span>
      <button class="del-btn" onclick="deletePiano(${p.id})">×</button>
    </div>`).join('');
}

// ─── FITNESS REPORTS ───
let activeReport='monthly';
function switchReport(name){
  activeReport=name;
  document.querySelectorAll('.report-tab').forEach((t,i)=>t.classList.toggle('active',['monthly','quarterly','yearly'][i]===name));
  ['monthly','quarterly','yearly'].forEach(n=>{document.getElementById('report-'+n).style.display=n===name?'block':'none';});
  renderReports();
}
function workoutsInMonth(y,m){
  const prefix=`${y}-${String(m+1).padStart(2,'0')}-`;
  return Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
}
function renderReports(){renderMonthlyReport();renderQuarterlyReport();renderYearlyReport();}
function renderMonthlyReport(){
  const el=document.getElementById('report-monthly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const months=[];for(let i=5;i>=0;i--){let mm=m-i,yy=y;if(mm<0){mm+=12;yy--;}months.push({y:yy,m:mm,label:MONTH_SHORT[mm]+(yy!==y?` '${String(yy).slice(2)}`:'')} );}
  const currCount=workoutsInMonth(y,m);
  const prevM=m===0?11:m-1,prevY=m===0?y-1:y;const prevCount=workoutsInMonth(prevY,prevM);
  const goal=state.fitGoals[monthKey(y,m)];
  const goalPct=goal?Math.min(100,Math.round((currCount/goal)*100)):null;
  const maxVal=Math.max(...months.map(mo=>workoutsInMonth(mo.y,mo.m)),goal||0,1);
  const barData=months.map(mo=>({label:mo.label,value:workoutsInMonth(mo.y,mo.m),highlight:mo.y===y&&mo.m===m}));
  let nextGoal=goal?goal:12;if(goal&&currCount>=goal)nextGoal=goal+2;else if(goal&&currCount<goal*0.5)nextGoal=Math.max(4,goal-2);
  el.innerHTML=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;">${MONTH_NAMES[m]} ${y} — Fitness Report</div>
      ${goal?`<span class="pill" style="background:#1a1e2e;color:var(--blue)">Goal: ${goal} workouts</span>`:'<span style="font-size:12px;color:var(--muted)">No goal set</span>'}
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">This month</div><div class="stat-box-val" style="color:var(--blue)">${currCount} ${deltaBadge(currCount,prevCount)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last month</div><div class="stat-box-val" style="color:var(--muted)">${prevCount}</div></div>
      ${goal?`<div class="stat-box"><div class="stat-box-label">Goal progress</div><div class="stat-box-val" style="color:${goalPct>=100?'var(--green)':'var(--orange)'}">${goalPct}%</div></div>`:''}
      ${goal?`<div class="stat-box"><div class="stat-box-label">Remaining</div><div class="stat-box-val" style="color:var(--muted)">${Math.max(0,goal-currCount)}</div></div>`:''}
    </div>
    ${goal?`<div class="progress-wrap" style="margin-bottom:14px;"><div class="progress-label"><span>Monthly goal</span><span>${currCount}/${goal}</span></div><div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${goalPct}%;background:${goalPct>=100?'var(--green)':'var(--blue)'}"></div></div></div>`:''}
    ${renderBarChart(barData,maxVal,goal)}
    <div class="insight">${currCount===0?'<strong>No workouts logged yet this month.</strong>':currCount>prevCount?`<strong>Up ${currCount-prevCount} from last month.</strong>`:currCount<prevCount?`<strong>Down ${prevCount-currCount} from last month.</strong>`:` <strong>Same as last month (${currCount}).</strong>`} ${goal&&goalPct>=100?' 🎯 Goal smashed!':goal?' Push to hit your goal.':''}<br><strong>Suggested goal for next month:</strong> ${nextGoal} workouts.</div>
  </div>`;
}
function renderQuarterlyReport(){
  const el=document.getElementById('report-quarterly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();const currQ=Math.floor(m/3);
  const quarters=[];for(let i=3;i>=0;i--){let q=currQ-i,qy=y;if(q<0){q+=4;qy--;}const months=[q*3,q*3+1,q*3+2];const total=months.reduce((s,mo)=>s+workoutsInMonth(qy,mo),0);quarters.push({label:`Q${q+1} ${qy}`,total,highlight:q===currQ&&qy===y});}
  const curr=quarters[3],prev=quarters[2];const maxVal=Math.max(...quarters.map(q=>q.total),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">Q${currQ+1} ${y} — Quarterly Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">This quarter</div><div class="stat-box-val" style="color:var(--blue)">${curr.total} ${deltaBadge(curr.total,prev.total)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last quarter</div><div class="stat-box-val" style="color:var(--muted)">${prev.total}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(curr.total/3).toFixed(1)}</div></div>
    </div>
    ${renderBarChart(quarters.map(q=>({label:q.label,value:q.total,highlight:q.highlight})),maxVal,null)}
    <div class="insight">${curr.total===0?'<strong>No workouts logged this quarter.</strong>':curr.total>prev.total?`<strong>Up ${curr.total-prev.total} vs last quarter.</strong>`:curr.total<prev.total?`<strong>Down ${prev.total-curr.total} vs last quarter.</strong>`:` <strong>Matching last quarter.</strong>`}</div>
  </div>`;
}
function renderYearlyReport(){
  const el=document.getElementById('report-yearly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const monthData=[];for(let mo=0;mo<=m;mo++) monthData.push({label:MONTH_SHORT[mo],value:workoutsInMonth(y,mo),highlight:mo===m});
  const thisYearTotal=monthData.reduce((s,mo)=>s+mo.value,0);
  const lastYearTotal=Array.from({length:m+1},(_,mo)=>workoutsInMonth(y-1,mo)).reduce((s,v)=>s+v,0);
  const projected=m<11?Math.round((thisYearTotal/(m+1))*12):thisYearTotal;
  const maxVal=Math.max(...monthData.map(mo=>mo.value),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${y} — Yearly Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Total ${y}</div><div class="stat-box-val" style="color:var(--blue)">${thisYearTotal} ${deltaBadge(thisYearTotal,lastYearTotal)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Same period ${y-1}</div><div class="stat-box-val" style="color:var(--muted)">${lastYearTotal}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(thisYearTotal/(m+1)).toFixed(1)}</div></div>
      ${m<11?`<div class="stat-box"><div class="stat-box-label">Projected</div><div class="stat-box-val" style="color:var(--purple)">${projected}</div></div>`:''}
    </div>
    ${renderBarChart(monthData,maxVal,null)}
    <div class="insight">${thisYearTotal===0?'<strong>No workouts logged yet this year.</strong>':thisYearTotal>lastYearTotal?`<strong>Ahead of last year by ${thisYearTotal-lastYearTotal} workouts.</strong>`:thisYearTotal<lastYearTotal?`<strong>Behind last year by ${lastYearTotal-thisYearTotal} workouts.</strong>`:' <strong>Tracking exactly with last year.</strong>'}${m<11&&thisYearTotal>0?` On pace for <strong>~${projected} workouts</strong> this year.`:''}</div>
  </div>`;
}

// ─── OVERVIEW ───
function updateOverview(){
  const done=state.goals.filter(g=>g.done).length,total=state.goals.length;
  document.getElementById('ov-goals').innerHTML=`${done}<span style="font-size:18px;color:var(--muted)">/${total}</span>`;
  document.getElementById('ov-goal-bar').innerHTML=(state.goals.length?state.goals:[{}]).map(g=>`<div class="streak-seg ${g.done?'on':''}"></div>`).join('');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const prefix=monthKey(y,m)+'-';
  const monthCount=Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
  const goal=state.fitGoals[monthKey(y,m)];
  document.getElementById('ov-workouts').textContent=monthCount;
  document.getElementById('ov-workout-sub').textContent=goal?`of ${goal} goal`:'sessions this month';
  const now2=new Date();
  const curMk=monthKey(now2.getFullYear(),now2.getMonth());
  const curMkTxs=state.transactions.filter(t=>t.monthKey===curMk);
  const income=curMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=curMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  const balEl=document.getElementById('ov-balance');
  balEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  balEl.style.color=net>=0?'var(--green)':'var(--pink)';
  const reading=state.books.filter(b=>b.status==='reading');
  const ovBook=document.getElementById('ov-book');
  if(reading.length) ovBook.innerHTML=reading.slice(0,2).map(b=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:5px;height:5px;border-radius:50%;background:${b.color};flex-shrink:0;"></div><span style="color:var(--text);font-weight:500;font-size:13px;">${b.title}</span></div>`).join('')+(reading.length>2?`<div style="font-size:11px;color:var(--muted);">+${reading.length-2} more</div>`:'');
  else ovBook.innerHTML='<span style="font-style:italic;font-size:13px;">No books in progress</span>';
  const pianoTotal=state.piano.reduce((s,p)=>s+p.mins,0);
  const ovPiano=document.getElementById('ov-piano'),ovPianoBar=document.getElementById('ov-piano-bar');
  if(pianoTotal>0){ovPiano.textContent=pianoTotal+' min logged';ovPiano.style.color='var(--purple)';ovPianoBar.style.display='block';document.getElementById('ov-piano-fill').style.width=Math.min(100,(pianoTotal/PIANO_GOAL)*100)+'%';}
  else{ovPiano.textContent='No sessions logged';ovPiano.style.color='var(--muted)';ovPianoBar.style.display='none';}
  const streak=Object.values(state.fitnessHeatmap).filter(Boolean).length;
  document.getElementById('streakPill').textContent=`🔥 ${streak} day streak`;
}

// ─── SHARED HELPERS ───
function monthKey(y,m){return `${y}-${String(m+1).padStart(2,'0')}`;}
function monthKeyFromDate(dateStr){
  // Parse DD/MM/YY or DD/MM/YYYY
  try {
    const parts = dateStr.split('/');
    if(parts.length===3){
      const mm = parts[1].padStart(2,'0');
      const yy = parts[2].length===2 ? '20'+parts[2] : parts[2];
      return `${yy}-${mm}`;
    }
  } catch(e){}
  // Fallback to current month
  const n=new Date();
  return monthKey(n.getFullYear(),n.getMonth());
}
function dayKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function deltaBadge(curr,prev){if(prev===null||prev===undefined) return '';const diff=curr-prev;if(diff>0) return `<span class="delta up">▲ ${diff}</span>`;if(diff<0) return `<span class="delta down">▼ ${Math.abs(diff)}</span>`;return `<span class="delta flat">= same</span>`;}
function renderBarChart(data,maxVal,goalVal){
  const safeMax=maxVal||1;
  return `<div class="bar-chart">${data.map(d=>{const pct=Math.min(100,Math.round((d.value/safeMax)*100));const col=d.highlight?'var(--blue)':'var(--surface2)';return `<div class="bar-col"><div class="bar-val" style="color:${d.highlight?'var(--blue)':'var(--muted)'}">${d.value}</div><div class="bar-wrap"><div class="bar-fill" style="height:${pct}%;background:${col};border:${d.highlight?'1px solid var(--blue)':'1px solid var(--border)'}"></div></div><div class="bar-label">${d.label}</div></div>`;}).join('')}</div>`;
}

// ─── START ───
// ─── FINANCE ───

// ── State ──
const ACCT_LABELS = {'personal-credit':'Personal Credit','debit':'Debit','joint':'Joint (÷2)'};
const ACCT_COLORS = {
  'personal-credit':['var(--green-bg)','var(--green)'],
  'debit':['var(--blue-bg)','var(--blue)'],
  'joint':['var(--purple-bg)','var(--purple)']
};
const ASSET_CATS = DEFAULT_ASSET_CATEGORIES; // legacy alias
const INCOME_CATS = DEFAULT_INCOME_CATEGORIES; // legacy alias
let finTab = 'yearly';
let mvYear = todayObj.getFullYear(), mvMonth = todayObj.getMonth();
let mvAcctFilter = 'all';
let yrViewYear = todayObj.getFullYear();
let uploadAcct = 'personal-credit';
let pendingUploadTxs = [];
let merchantRules = loadMerchantRules();
let monthlyTxExpanded = false;
let monthlyTxSearch = '';
let uploadSearchTerm = '';

// ── Helpers ──
function effectiveAmount(t){ return t.acct==='joint'?t.amount*0.5:t.amount; }
function getCategories(){
  const base = [...(state.categories||[]), ...DEFAULT_CATEGORIES, ...Object.keys(state.budgets||{})];
  return [...new Set(base.filter(Boolean))].filter(c=>!isRemovedCategory(c));
}
function getCatColor(i){ return CAT_COLOR_PALETTE[i%CAT_COLOR_PALETTE.length]; }
function renderCatSelect(){
  const sel=document.getElementById('txCat');
  if(!sel) return;
  sel.innerHTML=getCategories().map(c=>`<option>${c}</option>`).join('');
}

// ── Tab switching ──
function switchFinTab(tab){
  finTab=tab;
  ['yearly','monthly','budget'].forEach(t=>{
    const el=document.getElementById('fin-view-'+t);
    if(el) el.style.display=t===tab?'block':'none';
    const btn=document.getElementById('ftab-'+t);
    if(btn) btn.classList.toggle('active',t===tab);
  });

  const monthlyActions=document.getElementById('monthlyActionButtons');
  if(monthlyActions) monthlyActions.style.display=tab==='monthly'?'flex':'none';
  const budgetAdd=document.getElementById('budgetAddCategoryCard');
  if(budgetAdd) budgetAdd.style.display=tab==='budget'?'block':'none';

  // Keep transaction/import controls contextual to Monthly only.
  const addForm=document.getElementById('addTxForm');
  if(addForm && tab!=='monthly') addForm.style.display='none';
  const uploadPanel=document.getElementById('uploadPanel');
  if(uploadPanel && tab!=='monthly') uploadPanel.style.display='none';

  if(tab==='yearly') renderYearly();
  if(tab==='monthly') renderMonthly();
  if(tab==='budget') renderBudgetView();
}

// ── Add transaction form ──
function toggleAddTxForm(){
  const f=document.getElementById('addTxForm');
  f.style.display=f.style.display==='none'?'block':'none';
}

async function addTransaction(){
  const desc=document.getElementById('txDesc').value.trim();
  const amount=parseFloat(document.getElementById('txAmount').value);
  const type=document.getElementById('txType').value;
  const cat=document.getElementById('txCat').value;
  const acct=document.getElementById('txAcct').value;
  if(!desc||isNaN(amount)||amount<=0) return;
  const now=new Date();
  const id=Date.now();
  const dd=String(now.getDate()).padStart(2,'0');
  const mm=String(now.getMonth()+1).padStart(2,'0');
  const yy=String(now.getFullYear()).slice(2);
  const date=`${dd}/${mm}/${yy}`;
  const mk=monthKey(now.getFullYear(),now.getMonth());
  const subType=type==='income'?'income':(acct==='debit'?'debit':'credit');
  const {error}=await sb.from('transactions').insert({
    id,description:desc,amount,type,sub_type:subType,cat,acct,date,month_key:mk
  });
  if(error){console.error('Save error:',error);alert('Could not save. Please try again.');return;}
  state.transactions.unshift({id,description:desc,amount,type,subType,cat,acct,date,monthKey:mk});
  document.getElementById('txDesc').value='';
  document.getElementById('txAmount').value='';
  document.getElementById('addTxForm').style.display='none';
  renderTotalCover(); renderMonthly(); renderYearly(); updateOverview(); showSaved();
}

async function deleteTransaction(id){
  await sb.from('transactions').delete().eq('id',id);
  state.transactions=state.transactions.filter(t=>String(t.id)!==String(id));
  renderTotalCover(); renderMonthly(); renderYearly(); updateOverview(); showSaved();
}

// ── TOTAL COVER CARD ──
function renderTotalCover(){
  const now=new Date();
  const mk=monthKey(now.getFullYear(),now.getMonth());
  const allExp=state.transactions.filter(t=>t.type==='expense'&&t.monthKey===mk);
  const pcExp=allExp.filter(t=>t.acct==='personal-credit').reduce((s,t)=>s+t.amount,0);
  const dbExp=allExp.filter(t=>t.acct==='debit').reduce((s,t)=>s+t.amount,0);
  const jShare=allExp.filter(t=>t.acct==='joint').reduce((s,t)=>s+t.amount*0.5,0);
  const total=pcExp+dbExp+jShare;
  const totalInc=state.transactions.filter(t=>t.type==='income'&&t.monthKey===mk).reduce((s,t)=>s+t.amount,0);
  const net=totalInc-total;
  document.getElementById('fin-total-cover').textContent='$'+total.toFixed(2);
  document.getElementById('fin-cover-breakdown').textContent=
    `Credit $${pcExp.toFixed(0)} + Debit $${dbExp.toFixed(0)} + Joint share $${jShare.toFixed(0)}`;
  document.getElementById('fin-total-income').textContent='$'+totalInc.toFixed(2);
  const netEl=document.getElementById('fin-total-net');
  netEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  netEl.style.color=net>=0?'var(--green)':'var(--pink)';
}

// ── YEARLY VIEW ──
let finChart=null;
function yrPrev(){ yrViewYear--; renderYearly(); }
function yrNext(){
  if(yrViewYear>=todayObj.getFullYear()) return;
  yrViewYear++; renderYearly();
}

function renderYearly(){
  const y=yrViewYear;
  const now=new Date();
  document.getElementById('yr-label').textContent=y;
  document.getElementById('yr-chart-label').textContent=y;
  document.getElementById('yr-table-label').textContent=y;
  const nextBtn=document.getElementById('yr-next-btn');
  if(nextBtn) nextBtn.style.opacity=y>=now.getFullYear()?'0.3':'1';

  // Build month data
  const maxM = y===now.getFullYear()?now.getMonth():11;
  const incomeArr=[], expArr=[], assetArr=[];
  for(let m=0;m<=11;m++){
    const mk=monthKey(y,m);
    const txs=state.transactions.filter(t=>t.monthKey===mk);
    incomeArr.push(txs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0));
    const allExp=txs.filter(t=>t.type==='expense');
    const assets=allExp.filter(t=>getCategoryType(t.cat)==='asset').reduce((s,t)=>s+effectiveAmount(t),0);
    const exp=allExp.reduce((s,t)=>s+effectiveAmount(t),0);
    expArr.push(exp); assetArr.push(assets);
  }

  const totalInc=incomeArr.slice(0,maxM+1).reduce((s,v)=>s+v,0);
  const totalExp=expArr.slice(0,maxM+1).reduce((s,v)=>s+v,0);
  const avg=maxM>=0?totalExp/(maxM+1):0;
  document.getElementById('yr-income').textContent='$'+totalInc.toFixed(0);
  document.getElementById('yr-income-sub').textContent=`Jan – ${MONTH_SHORT[maxM]} recorded`;
  document.getElementById('yr-expense').textContent='$'+totalExp.toFixed(0);
  document.getElementById('yr-avg').textContent='$'+avg.toFixed(0);
  document.getElementById('yr-avg-sub').textContent=`based on ${maxM+1} month${maxM>0?'s':''}`;

  // Chart
  const canvas=document.getElementById('finYearlyChart');
  if(canvas){
    if(finChart){finChart.destroy();finChart=null;}
    const ctx=canvas.getContext('2d');
    finChart=new Chart(ctx,{
      type:'line',
      data:{
        labels:MONTH_SHORT,
        datasets:[
          {label:'Income',data:incomeArr,borderColor:'#2a9d5c',backgroundColor:'rgba(42,157,92,0.07)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#2a9d5c',tension:0.3,fill:true},
          {label:'Expenses',data:expArr,borderColor:'#d04a7a',backgroundColor:'rgba(208,74,122,0.06)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#d04a7a',tension:0.3,fill:true},
          {label:'Assets',data:assetArr,borderColor:'#6a4fc8',borderWidth:2,pointRadius:3,pointBackgroundColor:'#6a4fc8',tension:0.3,borderDash:[5,3]},
        ]
      },
      options:{
        responsive:true,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': $'+c.parsed.y.toLocaleString()}}},
        scales:{
          x:{grid:{color:'rgba(216,224,236,0.5)'},ticks:{color:'#7a8fa8',font:{size:11}}},
          y:{grid:{color:'rgba(216,224,236,0.5)'},ticks:{color:'#7a8fa8',font:{size:11},callback:v=>'$'+v.toLocaleString()}}
        }
      }
    });
  }

  // Table
  renderYearlyTable(y, maxM, incomeArr, expArr);
}

function renderYearlyTable(y, maxM, incomeArr, expArr){
  const table=document.getElementById('fin-yearly-table');
  if(!table) return;
  const cats=getCategories();
  const now=new Date();
  const curM=y===now.getFullYear()?now.getMonth():-1;

  const th=(txt,cur)=>`<th style="padding:7px 8px;text-align:right;color:var(--muted);font-weight:600;font-size:11px;border-bottom:2px solid var(--border);white-space:nowrap;${cur?'background:rgba(58,123,213,0.06)':''}">${txt}</th>`;
  const td=(val,cur,color,click)=>`<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:500;${color?'color:'+color+';':''}${cur?'background:rgba(58,123,213,0.06)':''}${click?';cursor:pointer;color:var(--blue);':''}" ${click?`onclick="${click}"`:''}>${val}</td>`;
  const secRow=(label)=>`<tr><td colspan="15" style="padding:5px 8px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;background:var(--surface2);border-bottom:1px solid var(--border);">${label}</td></tr>`;

  let html=`<thead><tr>
    <th style="padding:7px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:11px;border-bottom:2px solid var(--border);min-width:120px;">Category</th>
    ${MONTH_SHORT.map((m,i)=>th(m,i===curM)).join('')}
    <th style="padding:7px 8px;text-align:right;color:var(--text);font-weight:700;font-size:11px;border-bottom:2px solid var(--border);">Total</th>
  </tr></thead><tbody>`;

  // Income row
  html+=secRow('Income');
  const incTotal=incomeArr.slice(0,maxM+1).reduce((s,v)=>s+v,0);
  html+=`<tr><td style="padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border);">💚 Income</td>
    ${MONTH_SHORT.map((m,i)=>{
      const v=incomeArr[i];
      const cur=i===curM;
      if(i>maxM) return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);color:var(--muted);${cur?'background:rgba(58,123,213,0.06)':''}">—</td>`;
      return td(v>0?'$'+v.toFixed(0):'$0',cur,'var(--green)',`yrDrill(${i},'${MONTH_SHORT[i]} ${y}')`);
    }).join('')}
    <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:var(--green);">$${incTotal.toFixed(0)}</td>
  </tr>`;

  getCategoriesByType('income').forEach(cat=>{
    const rowTotals=MONTH_SHORT.map((m,i)=>{
      const mk=monthKey(y,i);
      return state.transactions.filter(t=>t.monthKey===mk&&t.type==='income'&&t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);
    });
    const rowTotal=rowTotals.slice(0,maxM+1).reduce((s,v)=>s+v,0);
    if(rowTotal<=0) return;
    html+=`<tr><td style="padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border);color:var(--green);">${cat}</td>
      ${rowTotals.map((v,i)=>{
        const cur=i===curM;
        if(i>maxM) return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);color:var(--muted);${cur?'background:rgba(58,123,213,0.06)':''}">—</td>`;
        return td(v>0?'$'+v.toFixed(0):'—',cur,v>0?'var(--green)':'var(--muted)',v>0?`yrDrill(${i},'${MONTH_SHORT[i]} ${y}')`:null);
      }).join('')}
      <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:600;color:var(--green);">${rowTotal>0?'$'+rowTotal.toFixed(0):'—'}</td>
    </tr>`;
  });

  // Expense categories
  html+=secRow('Expenses');
  const expCats=getCategoriesByType('expense');
  let expTotals=new Array(12).fill(0);
  expCats.forEach(cat=>{
    const rowTotals=MONTH_SHORT.map((m,i)=>{
      const mk=monthKey(y,i);
      return state.transactions.filter(t=>t.monthKey===mk&&t.type==='expense'&&t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);
    });
    rowTotals.forEach((v,i)=>expTotals[i]+=v);
    const rowTotal=rowTotals.slice(0,maxM+1).reduce((s,v)=>s+v,0);
    html+=`<tr><td style="padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border);">${cat}</td>
      ${rowTotals.map((v,i)=>{
        const cur=i===curM;
        if(i>maxM) return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);color:var(--muted);${cur?'background:rgba(58,123,213,0.06)':''}">—</td>`;
        return td(v>0?'$'+v.toFixed(0):'—',cur,v>0?'var(--pink)':'var(--muted)',v>0?`yrDrill(${i},'${MONTH_SHORT[i]} ${y}')`:null);
      }).join('')}
      <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:600;">${rowTotal>0?'$'+rowTotal.toFixed(0):'—'}</td>
    </tr>`;
  });
  // Total expenses row
  const totalExpAll=expTotals.slice(0,maxM+1).reduce((s,v)=>s+v,0);
  html+=`<tr style="font-weight:700;border-top:2px solid var(--border);">
    <td style="padding:7px 8px;font-size:12px;border-bottom:2px solid var(--border);font-weight:700;">Total Expenses</td>
    ${expTotals.map((v,i)=>{
      const cur=i===curM;
      if(i>maxM) return `<td style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border);color:var(--muted);${cur?'background:rgba(58,123,213,0.06)':''}">—</td>`;
      return `<td style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:var(--pink);${cur?'background:rgba(58,123,213,0.06)':''}">$${v.toFixed(0)}</td>`;
    }).join('')}
    <td style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:var(--pink);">$${totalExpAll.toFixed(0)}</td>
  </tr>`;

  // Asset rows
  html+=secRow('Assets (contributions)');
  getCategoriesByType('asset').forEach(cat=>{
    const rowTotals=MONTH_SHORT.map((m,i)=>{
      const mk=monthKey(y,i);
      return state.transactions.filter(t=>t.monthKey===mk&&t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);
    });
    const rowTotal=rowTotals.slice(0,maxM+1).reduce((s,v)=>s+v,0);
    html+=`<tr><td style="padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border);color:var(--purple);">${cat}</td>
      ${rowTotals.map((v,i)=>{
        const cur=i===curM;
        if(i>maxM) return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);color:var(--muted);${cur?'background:rgba(58,123,213,0.06)':''}">—</td>`;
        return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:500;color:var(--purple);${cur?'background:rgba(58,123,213,0.06)':''}">$${v.toFixed(0)}</td>`;
      }).join('')}
      <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:var(--purple);">$${rowTotal.toFixed(0)}</td>
    </tr>`;
  });

  html+='</tbody>';
  table.innerHTML=html;
}

function yrDrill(monthIdx, label){
  const y=yrViewYear;
  const mk=monthKey(y,monthIdx);
  const txs=state.transactions.filter(t=>t.monthKey===mk);
  const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  document.getElementById('fin-drill-title').textContent=label;
  document.getElementById('fin-drill-stats').innerHTML=`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:600;">Income</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--green);">$${income.toFixed(0)}</div>
    </div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:600;">Expenses</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--pink);">$${expense.toFixed(0)}</div>
    </div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:600;">Net</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:${net>=0?'var(--green)':'var(--pink)'};">${net>=0?'$':'-$'}${Math.abs(net).toFixed(0)}</div>
    </div>`;
  // Category breakdown
  const expenses=txs.filter(t=>t.type==='expense');
  const byCat={};
  expenses.forEach(t=>{byCat[t.cat]=(byCat[t.cat]||0)+effectiveAmount(t);});
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const maxAmt=sorted[0]?.[1]||1;
  const colors=['var(--pink)','var(--orange)','var(--blue)','var(--green)','var(--purple)','#2a9d8f','#e9c46a','var(--muted)'];
  document.getElementById('fin-drill-cats').innerHTML=sorted.map(([cat,amt],i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="width:8px;height:8px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0;"></div>
      <span style="font-size:12px;width:150px;flex-shrink:0;">${cat}</span>
      <div style="flex:1;height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
        <div style="width:${Math.round((amt/maxAmt)*100)}%;height:100%;background:${colors[i%colors.length]};border-radius:99px;"></div>
      </div>
      <span style="font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:600;color:${colors[i%colors.length]};width:70px;text-align:right;">$${amt.toFixed(0)}</span>
    </div>`).join('');
  document.getElementById('fin-drill-card').style.display='block';
  document.getElementById('fin-drill-card').scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ── MONTHLY VIEW ──
function mvPrev(){ mvMonth--; if(mvMonth<0){mvMonth=11;mvYear--;} renderMonthly(); }
function mvNext(){
  const now=new Date();
  if(mvYear===now.getFullYear()&&mvMonth===now.getMonth()) return;
  mvMonth++; if(mvMonth>11){mvMonth=0;mvYear++;} renderMonthly();
}

function mvFilter(acct, btn){
  mvAcctFilter=acct;
  monthlyTxExpanded=false;
  document.querySelectorAll('.mv-filter-btn').forEach(b=>{
    b.style.background='var(--surface2)'; b.style.borderColor='var(--border)'; b.style.color='var(--muted)';
  });
  btn.style.background='var(--blue)'; btn.style.borderColor='var(--blue)'; btn.style.color='#fff';
  renderMonthly();
}

function toggleMonthlyTxList(){
  monthlyTxExpanded=!monthlyTxExpanded;
  const list=document.getElementById('mv-txlist');
  const btn=document.getElementById('mv-review-all-btn');
  if(list) list.classList.toggle('expanded', monthlyTxExpanded);
  if(btn) btn.textContent=monthlyTxExpanded?'Collapse':'Review all';
}

function renderMonthly(){
  const mk=monthKey(mvYear,mvMonth);
  const now=new Date();
  const isCurrentMonth=mvYear===now.getFullYear()&&mvMonth===now.getMonth();
  document.getElementById('mv-month-label').textContent=`${MONTH_NAMES[mvMonth]} ${mvYear}`;
  const nextBtn=document.getElementById('mv-next-btn');
  if(nextBtn) nextBtn.style.opacity=isCurrentMonth?'0.3':'1';
  document.getElementById('mv-filter-pill').textContent=mvAcctFilter==='all'?'All':ACCT_LABELS[mvAcctFilter]||mvAcctFilter;
  const mvSearchInput=document.getElementById('mvTxSearch'); if(mvSearchInput && mvSearchInput.value!==monthlyTxSearch) mvSearchInput.value=monthlyTxSearch;

  const allMkTxs=state.transactions.filter(t=>t.monthKey===mk);
  const accountFiltered=mvAcctFilter==='all'?allMkTxs:allMkTxs.filter(t=>t.acct===mvAcctFilter);
  const search=monthlyTxSearch;
  const filtered=search?accountFiltered.filter(t=>{
    const hay=[t.description||t.desc||'',t.cat||'',t.date||'',ACCT_LABELS[t.acct]||t.acct||'',t.type||''].join(' ').toLowerCase();
    return hay.includes(search);
  }):accountFiltered;

  const isAll=mvAcctFilter==='all';

  // Show/hide stat blocks
  document.getElementById('mv-stats-all').style.display=isAll?'grid':'none';
  document.getElementById('mv-stats-acct').style.display=isAll?'none':'block';

  if(isAll){
    // All accounts — show income, expense, net
    const income=allMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
    const expense=allMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
    const net=income-expense;
    document.getElementById('mv-income').textContent='$'+income.toFixed(2);
    document.getElementById('mv-income-sub').textContent='all accounts';
    document.getElementById('mv-expense').textContent='$'+expense.toFixed(2);
    document.getElementById('mv-expense-sub').textContent='personal + 50% joint';
    const netEl=document.getElementById('mv-net');
    netEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
    netEl.style.color=net>=0?'var(--green)':'var(--pink)';
    document.getElementById('mv-net-sub').textContent='combined net';
  } else {
    // Single account — expense only
    const acctLabel=document.getElementById('mv-acct-label');
    acctLabel.textContent=ACCT_LABELS[mvAcctFilter]+' — expenses only';
    const expense=filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
    const lastMk=monthKey(mvMonth===0?mvYear-1:mvYear,mvMonth===0?11:mvMonth-1);
    const lastExp=state.transactions.filter(t=>t.monthKey===lastMk&&t.acct===mvAcctFilter&&t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
    const diff=expense-lastExp;
    document.getElementById('mv-acct-expense').textContent='$'+expense.toFixed(2);
    const diffEl=document.getElementById('mv-acct-diff');
    diffEl.textContent=(diff>=0?'+$':'-$')+Math.abs(diff).toFixed(2)+' vs '+MONTH_SHORT[mvMonth===0?11:mvMonth-1];
    diffEl.style.color=diff<=0?'var(--green)':'var(--pink)';
  }

  // Category breakdown — expenses only for filtered set
  const expenses=filtered.filter(t=>t.type==='expense');
  const byCat={};
  expenses.forEach(t=>{byCat[t.cat]=(byCat[t.cat]||0)+effectiveAmount(t);});
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const maxAmt=sorted[0]?.[1]||1;
  const catEl=document.getElementById('mv-cats');
  catEl.innerHTML=sorted.length===0
    ?'<div style="color:var(--muted);font-size:13px;padding:8px 0;">No expenses for this selection.</div>'
    :sorted.map(([cat,amt],i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="width:8px;height:8px;border-radius:50%;background:${getCatColor(i)};flex-shrink:0;"></div>
        <span style="font-size:12px;width:130px;flex-shrink:0;">${cat}</span>
        <div style="flex:1;height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
          <div style="width:${Math.round((amt/maxAmt)*100)}%;height:100%;background:${getCatColor(i)};border-radius:99px;"></div>
        </div>
        <span style="font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:600;color:${getCatColor(i)};width:65px;text-align:right;">$${amt.toFixed(0)}</span>
      </div>`).join('');

  // Transaction list
  document.getElementById('mv-tx-count').textContent=filtered.length+' transaction'+(filtered.length!==1?'s':'')+(monthlyTxSearch?' found':'');
  const txEl=document.getElementById('mv-txlist');
  const reviewBtn=document.getElementById('mv-review-all-btn');
  if(txEl) txEl.classList.toggle('expanded', monthlyTxExpanded);
  if(reviewBtn){
    reviewBtn.style.display=filtered.length>5?'inline-flex':'none';
    reviewBtn.textContent=monthlyTxExpanded?'Collapse':'Review all';
  }
  txEl.innerHTML=filtered.length===0
    ?'<div style="color:var(--muted);font-size:13px;padding:8px 0;">No transactions for this selection.</div>'
    :[...filtered].sort((a,b)=>b.id-a.id).slice(0,50).map(t=>{
      const eff=effectiveAmount(t);
      const ac=ACCT_COLORS[t.acct]||['var(--surface2)','var(--muted)'];
      const desc=t.description||t.desc||'';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div style="flex:1;">
          <div style="font-weight:500;">${highlightSearchText(desc,monthlyTxSearch)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${t.cat} · ${t.date}
            <span style="font-size:10px;padding:2px 7px;border-radius:99px;font-weight:600;background:${ac[0]};color:${ac[1]};margin-left:4px;">${ACCT_LABELS[t.acct]||t.acct}</span>
            ${t.acct==='joint'?`<span style="font-size:10px;color:var(--muted);margin-left:3px;">full $${t.amount.toFixed(2)}</span>`:''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-family:'Space Grotesk',sans-serif;font-weight:600;color:${t.type==='income'?'var(--green)':'var(--pink)'};">${t.type==='income'?'+':'-'}$${eff.toFixed(2)}</span>
          <button data-txid="${t.id}" onclick="openEditTx(this.dataset.txid)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;font-size:11px;padding:2px 8px;">Edit</button>
          <button onclick="deleteTransaction(${t.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;">×</button>
        </div>
      </div>`;
    }).join('');

  // Insight
  if(isAll){
    const income=allMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
    const expense=allMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
    const lastMk=monthKey(mvMonth===0?mvYear-1:mvYear,mvMonth===0?11:mvMonth-1);
    const lastExp=state.transactions.filter(t=>t.monthKey===lastMk&&t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
    const diff=expense-lastExp;
    const ins=document.getElementById('mv-insight');
    ins.style.display='block';
    const mn=MONTH_SHORT[mvMonth], lmn=MONTH_SHORT[mvMonth===0?11:mvMonth-1];
    ins.innerHTML=expense===0?`<strong>No expenses logged for ${mn} yet.</strong>`
      :lastExp===0?`<strong>$${expense.toFixed(0)} in expenses for ${mn}.</strong>`
      :diff>0?`<strong>Up $${diff.toFixed(0)} vs ${lmn}.</strong> Check categories above for what drove the increase.`
      :diff<0?`<strong>Down $${Math.abs(diff).toFixed(0)} vs ${lmn}.</strong> Good discipline.`
      :`<strong>Same spend as ${lmn}.</strong>`;
  } else {
    document.getElementById('mv-insight').style.display='none';
  }
}

// ── UPLOAD ──
function toggleUploadPanel(){
  const p=document.getElementById('uploadPanel');
  if(!p) return;
  const opening = p.style.display==='none' || !p.style.display;
  p.style.display=opening?'block':'none';
  if(opening) p.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function selectUploadAcct(btn, acct){
  uploadAcct=acct;
  document.querySelectorAll('.upload-acct-btn').forEach(b=>{
    b.style.background='var(--surface2)'; b.style.borderColor='var(--border)'; b.style.color='var(--muted)';
  });
  btn.style.background='var(--blue-bg)'; btn.style.borderColor='var(--blue)'; btn.style.color='var(--blue)';
}

function handleStatementUpload(event){
  const file=event.target.files[0];
  if(!file) return;
  event.target.value='';
  if(!file.name.toLowerCase().endsWith('.csv')){
    openUploadModal();
    document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Please upload a CSV file.</span>';
    document.getElementById('uploadReviewList').innerHTML='';
    document.getElementById('confirmUploadBtn').style.display='none';
    return;
  }
  const panel=document.getElementById('uploadPanel'); if(panel) panel.style.display='none';
  openUploadModal();
  document.getElementById('uploadStatus').innerHTML='<span style="color:var(--blue);">📄 Reading your statement…</span>';
  document.getElementById('uploadReviewList').innerHTML='';
  document.getElementById('confirmUploadBtn').style.display='none';
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      const txs=parseCSV(e.target.result);
      if(!txs||txs===null){
        document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Could not read this CSV format.</span>';
        return;
      }
      if(!txs.length){
        document.getElementById('uploadStatus').innerHTML='<span style="color:var(--muted);">No transactions found in this file.</span>';
        return;
      }
      pendingUploadTxs=txs.map((t,i)=>{
        const row={...t,_id:i,acct:uploadAcct,keep:true,selected:false,rememberRule:false};
        const rule=merchantRules[getMerchantKey(row.description)];
        if(rule && rule.category){
          row.category=rule.category;
          row.ruleApplied=true;
        }
        row.duplicate=isPotentialDuplicate(row);
        return row;
      });
      uploadSearchTerm='';
      const searchInput=document.getElementById('uploadSearchInput'); if(searchInput) searchInput.value='';
      const searchWrap=document.getElementById('uploadSearchWrap'); if(searchWrap) searchWrap.style.display='block';
      renderUploadReview();
      const acctLabel=ACCT_LABELS[uploadAcct]||uploadAcct;
      const isJoint=uploadAcct==='joint';
      const duplicateCount=pendingUploadTxs.filter(t=>t.duplicate).length;
      const ruleCount=pendingUploadTxs.filter(t=>t.ruleApplied).length;
      document.getElementById('uploadStatus').innerHTML=
        `<div style="background:var(--green-bg);border:1px solid var(--green);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--green);margin-bottom:8px;">
          ✓ Found <strong>${txs.length} transactions</strong> — all tagged to <strong>${acctLabel}</strong>${isJoint?' · amounts will be halved (÷2)':''}.
        </div>
        <span style="font-size:12px;color:var(--muted);">Review all rows, batch edit where useful, and tick “remember” for merchants you want the system to learn.${ruleCount?` ${ruleCount} matched saved merchant rule${ruleCount>1?'s':''}.`:''}${duplicateCount?` ${duplicateCount} possible duplicate${duplicateCount>1?'s':''} flagged.`:''}</span>`;
      document.getElementById('confirmUploadBtn').style.display='block';
      document.getElementById('uploadSkipNote').style.display='block';
    }catch(err){
      console.error(err);
      document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Something went wrong. Please try again.</span>';
    }
  };
  reader.onerror=()=>{
    document.getElementById('uploadStatus').innerHTML='<span style="color:var(--pink);">⚠️ Could not read the file.</span>';
  };
  reader.readAsText(file);
}

function renderUploadReview(){
  const cats=getCategories();
  const list=document.getElementById('uploadReviewList');
  const selectedCount=pendingUploadTxs.filter(t=>t.selected).length;
  const duplicateCount=pendingUploadTxs.filter(t=>t.duplicate).length;
  const ruleCount=pendingUploadTxs.filter(t=>t.ruleApplied).length;
  list.innerHTML=`
    <div class="upload-tools">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label class="upload-mini-check"><input type="checkbox" onchange="toggleAllUploadSelect(this.checked)" ${selectedCount&&selectedCount===pendingUploadTxs.length?'checked':''}> Select all</label>
        <span class="card-sub">${selectedCount} selected</span>
        <select id="uploadBatchCat" class="upload-small-select">
          ${cats.map(c=>`<option>${c}</option>`).join('')}
        </select>
        <button class="small-link-btn" onclick="applyUploadBatchCategory()">Apply category</button>
        <button class="small-link-btn" onclick="clearUploadSelection()">Clear</button>
      </div>
      <div class="card-sub">${duplicateCount?`⚠️ ${duplicateCount} possible duplicate${duplicateCount>1?'s':''}`:'No duplicates flagged'}${ruleCount?` · ${ruleCount} rule match${ruleCount>1?'es':''}`:''}</div>
    </div>
    <div class="upload-review-table">
      <div class="upload-review-head">
        <div>Edit</div><div>Save</div><div>Description · Date</div><div style="text-align:right;">Amount</div><div>Category</div><div>Remember</div><div>Notes</div>
      </div>
      ${pendingUploadTxs.map(t=>`
      <div class="upload-review-row ${t.duplicate?'duplicate':''}">
        <input type="checkbox" ${t.selected?'checked':''} onchange="toggleUploadSelect(${t._id},this.checked)">
        <input type="checkbox" ${t.keep?'checked':''} onchange="toggleUploadRow(${t._id},this.checked)">
        <div>
          <div style="font-weight:500;">${highlightSearchText(t.description,uploadSearchTerm)}</div>
          <div style="font-size:11px;color:var(--muted);">${escapeHTML(t.date)}</div>
        </div>
        <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;text-align:right;color:${t.type==='income'?'var(--green)':'var(--pink)'};">${t.type==='income'?'+':'-'}$${parseFloat(t.amount).toFixed(2)}</div>
        <div class="upload-cat-cell">
          <select onchange="updateUploadRow(${t._id},'category',this.value)" class="upload-small-select">
            ${cats.map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}
          </select>
          <button class="upload-add-cat-btn" onclick="quickAddUploadCategory(${t._id})" title="Add a new category">+ Cat</button>
        </div>
        <label class="upload-mini-check" title="Save this merchant/category rule for future uploads"><input type="checkbox" ${t.rememberRule?'checked':''} onchange="updateUploadRow(${t._id},'rememberRule',this.checked)"> Rule</label>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${t.duplicate?'<span class="upload-warning-pill">Possible duplicate</span>':''}
          ${t.ruleApplied?'<span class="upload-rule-pill">Rule matched</span>':''}
        </div>
      </div>`).join('')}
    </div>`;
}

function toggleUploadRow(id,checked){
  const t=pendingUploadTxs.find(t=>t._id===id);
  if(t) t.keep=checked;
}

function toggleUploadSelect(id,checked){
  const t=pendingUploadTxs.find(t=>t._id===id);
  if(t) t.selected=checked;
  renderUploadReview();
}

function toggleAllUploadSelect(checked){
  pendingUploadTxs.forEach(t=>t.selected=checked);
  renderUploadReview();
}

function clearUploadSelection(){
  pendingUploadTxs.forEach(t=>t.selected=false);
  renderUploadReview();
}

function applyUploadBatchCategory(){
  const sel=document.getElementById('uploadBatchCat');
  const cat=sel ? sel.value : '';
  if(!cat) return;
  pendingUploadTxs.forEach(t=>{
    if(t.selected){
      t.category=cat;
      t.rememberRule=true;
      t.ruleApplied=false;
    }
  });
  renderUploadReview();
}

function updateUploadRow(id,field,val){
  const t=pendingUploadTxs.find(t=>t._id===id);
  if(!t) return;
  t[field]=val;
  if(field==='category'){
    t.rememberRule=true;
    t.ruleApplied=false;
    renderUploadReview();
  }
}

async function confirmUpload(){
  const btn=document.getElementById('confirmUploadBtn');
  btn.textContent='Saving…'; btn.disabled=true;
  const toSave=pendingUploadTxs.filter(t=>t.keep);
  let saved=0,failed=0,rulesSaved=0;
  for(const t of toSave){
    if(t.rememberRule){
      saveMerchantRule(t.description,t.category);
      rulesSaved++;
    }
    const id=Date.now()*1000+saved;
    const subType=t.type==='income'?'income':(t.acct==='debit'?'debit':'credit');
    const mk=monthKeyFromDate(t.date);
    const {error}=await sb.from('transactions').insert({
      id,description:t.description,amount:parseFloat(t.amount),
      type:t.type,sub_type:subType,cat:t.category,
      acct:t.acct,date:t.date,month_key:mk
    });
    if(error){console.error('Failed:',t.description,error);failed++;}
    else{
      state.transactions.unshift({
        id,description:t.description,amount:parseFloat(t.amount),
        type:t.type,subType,cat:t.category,
        acct:t.acct,date:t.date,monthKey:mk
      });
      saved++;
    }
    await new Promise(r=>setTimeout(r,2));
  }
  closeUploadModal();
  if(failed>0) alert(`${saved} saved. ${failed} failed — please try again.`);
  else if(rulesSaved>0) console.log(`${rulesSaved} merchant rule${rulesSaved>1?'s':''} saved.`);
  renderTotalCover(); renderMonthly(); renderYearly(); updateOverview(); showSaved();
}

function loadMerchantRules(){
  try{return JSON.parse(localStorage.getItem('myos_merchant_rules')||'{}');}
  catch(e){return {};}
}

function persistMerchantRules(){
  localStorage.setItem('myos_merchant_rules',JSON.stringify(merchantRules));
}

function saveMerchantRule(description,category){
  const key=getMerchantKey(description);
  if(!key||!category) return;
  merchantRules[key]={category,sample:description,updatedAt:new Date().toISOString()};
  persistMerchantRules();
}

function getMerchantKey(description){
  return String(description||'')
    .toLowerCase()
    .replace(/paypal \*/g,'paypal ')
    .replace(/\b(pos|eftpos|visa|mastercard|card|purchase|debit|credit|direct debit|payment)\b/g,' ')
    .replace(/\b(au|aus|australia|sydney|melbourne|brisbane|nsw|vic|qld|pty|ltd)\b/g,' ')
    .replace(/[0-9]+/g,' ')
    .replace(/[^a-z& ]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0,4)
    .join(' ');
}

function txComparableDescription(description){
  return String(description||'').toLowerCase().replace(/\s+/g,' ').trim();
}

function isPotentialDuplicate(t){
  const amt=parseFloat(t.amount).toFixed(2);
  const desc=txComparableDescription(t.description);
  return state.transactions.some(existing=>{
    const exAmt=parseFloat(existing.amount||0).toFixed(2);
    const exDesc=txComparableDescription(existing.description||existing.text||'');
    return existing.date===t.date && existing.acct===t.acct && exAmt===amt && exDesc===desc;
  });
}

function escapeHTML(value){
  return String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));
}

function openUploadModal(){document.getElementById('uploadModal').style.display='block';document.body.style.overflow='hidden';}
function closeUploadModal(){document.getElementById('uploadModal').style.display='none';document.body.style.overflow='';pendingUploadTxs=[];uploadSearchTerm='';const searchWrap=document.getElementById('uploadSearchWrap');if(searchWrap) searchWrap.style.display='none';const searchInput=document.getElementById('uploadSearchInput');if(searchInput) searchInput.value='';document.getElementById('confirmUploadBtn').textContent='✓ Save selected transactions';document.getElementById('confirmUploadBtn').disabled=false;}

// ── BUDGET & CATEGORIES ──
function renderBudgetView(){
  const cats=getCategories();
  const expCats=getCategoriesByType('expense');
  const incomeCats=getCategoriesByType('income');
  const assetCats=getCategoriesByType('asset');
  const now=new Date();
  const mk=monthKey(now.getFullYear(),now.getMonth());
  document.getElementById('budget-month-label').textContent=MONTH_NAMES[now.getMonth()]+' '+now.getFullYear();

  const budgetRowHTML=(cat,i)=>{
    const budget=state.budgets[cat]||0;
    const catType=getCategoryType(cat);
    const actual=state.transactions.filter(t=>t.monthKey===mk&&t.cat===cat&&(catType==='income'?t.type==='income':t.type==='expense')).reduce((s,t)=>s+effectiveAmount(t),0);
    const pct=budget?Math.min(100,Math.round((actual/budget)*100)):0;
    const over=actual>budget&&budget>0;
    const col=over?'var(--pink)':pct>80?'var(--orange)':getCatColor(i);
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="width:8px;height:8px;border-radius:50%;background:${getCatColor(i)};flex-shrink:0;"></div>
      <span style="flex:1;font-size:13px;">${cat}</span>
      <div style="display:flex;flex-direction:column;align-items:flex-end;width:150px;gap:2px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:11px;color:var(--muted);">$</span>
          <input type="number" value="${budget||''}" placeholder="0" min="0" step="10"
            style="width:80px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:5px 8px;color:var(--text);font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;outline:none;text-align:right;"
            onchange="setBudget('${cat}',this.value)">
          <span style="font-size:11px;color:var(--muted);">/mo</span>
        </div>
        ${actual>0&&budget>0?`<div style="width:100%;"><div style="height:3px;background:var(--border);border-radius:99px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${col};border-radius:99px;"></div></div><div style="font-size:10px;color:${col};text-align:right;margin-top:1px;">${over?'over budget':pct+'% of $'+budget}</div></div>`:''}
      </div>
      <button onclick="removeCategory('${cat}')" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;font-size:11px;padding:3px 8px;white-space:nowrap;">Remove</button>
    </div>`;
  };

  document.getElementById('budgetExpRows').innerHTML=expCats.map((c,i)=>budgetRowHTML(c,i)).join('');
  const incomeEl=document.getElementById('budgetIncomeRows'); if(incomeEl) incomeEl.innerHTML=incomeCats.map((c,i)=>budgetRowHTML(c,expCats.length+i)).join('') || '<div style="color:var(--muted);font-size:13px;">No income categories yet.</div>';
  const assetEl=document.getElementById('budgetAssetRows'); if(assetEl) assetEl.innerHTML=assetCats.map((c,i)=>budgetRowHTML(c,expCats.length+incomeCats.length+i)).join('') || '<div style="color:var(--muted);font-size:13px;">No asset categories yet.</div>';

  // Budget vs actual
  const hasBudgets=Object.keys(state.budgets).length>0;
  const actEl=document.getElementById('budgetActualRows');
  const insEl=document.getElementById('budgetInsight');
  if(!hasBudgets){actEl.innerHTML='<div style="color:var(--muted);font-size:13px;">Set budgets above to see comparisons.</div>';insEl.style.display='none';return;}
  let over=0,totalB=0,totalA=0;
  actEl.innerHTML=expCats.map((cat,i)=>{
    const b=state.budgets[cat]||0; if(!b) return '';
    const a=state.transactions.filter(t=>t.monthKey===mk&&t.type==='expense'&&t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);
    const pct=Math.min(100,Math.round((a/b)*100));
    if(a>b) over++;
    totalB+=b; totalA+=a;
    const col=a>b?'var(--pink)':pct>80?'var(--orange)':getCatColor(i);
    return `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="width:8px;height:8px;border-radius:50%;background:${getCatColor(i)};flex-shrink:0;"></div>
      <span style="font-size:12px;width:130px;flex-shrink:0;">${cat}</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
        <div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${col};border-radius:99px;"></div></div>
        <div style="font-size:11px;display:flex;justify-content:space-between;color:var(--muted);">
          <span style="${a>b?'color:var(--pink)':''}">$${a.toFixed(0)} spent</span><span>$${b} budget</span>
        </div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${col};width:50px;text-align:right;">${a>b?'▲ over':pct+'%'}</span>
    </div>`;
  }).filter(Boolean).join('');
  insEl.style.display='block';
  const rem=totalB-totalA;
  insEl.innerHTML=over>0
    ?`<strong>${over} categor${over>1?'ies':'y'} over budget.</strong> $${totalA.toFixed(0)} of $${totalB.toFixed(0)} used.`
    :`<strong>On track.</strong> $${totalA.toFixed(0)} of $${totalB.toFixed(0)} budget used (${Math.round((totalA/totalB)*100)}%). $${rem.toFixed(0)} remaining.`;
}

async function setBudget(cat,val){
  const v=parseFloat(val);
  if(!isNaN(v)&&v>0){await sb.from('budgets').upsert({cat,amount:v});state.budgets[cat]=v;}
  else{await sb.from('budgets').delete().eq('cat',cat);delete state.budgets[cat];}
  renderBudgetView();showSaved();
}


function normaliseCategoryName(value){
  return String(value||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
}
function categoryTokens(value){
  return normaliseCategoryName(value).split(' ').filter(w=>w.length>2 && !['and','the','for','with'].includes(w));
}
function categorySimilarityWarning(name){
  const n=normaliseCategoryName(name);
  if(!n) return '';
  const existing=getCategories();
  const exact=existing.find(c=>normaliseCategoryName(c)===n);
  if(exact) return `⚠️ “${escapeHTML(name)}” already exists as “${escapeHTML(exact)}”. You can still add it if you want a separate category.`;

  const synonymGroups=[
    ['transport','public transit','transit','train','bus','metro','uber','taxi','commute','parking','fuel','petrol'],
    ['food','dining','restaurant','cafe','coffee','groceries','grocery','supermarket'],
    ['shopping','clothes','clothing','fashion','retail'],
    ['subscription','subscriptions','membership','software','apps'],
    ['health','medical','chemist','pharmacy','doctor','dental'],
    ['utility','utilities','bills','electricity','gas','water','internet','phone'],
    ['saving','savings','asset','assets','investment','investments','etf','super'],
    ['income','salary','bonus','refund','reimbursement','dividend','interest']
  ];
  const group=synonymGroups.find(g=>g.some(term=>n.includes(term)));
  if(group){
    const match=existing.find(c=>{
      const cn=normaliseCategoryName(c);
      return c!==name && group.some(term=>cn.includes(term));
    });
    if(match) return `⚠️ This looks similar to “${escapeHTML(match)}”. Continue if you want both categories.`;
  }

  const newTokens=categoryTokens(name);
  const overlap=existing.find(c=>{
    const tokens=categoryTokens(c);
    return newTokens.length && tokens.length && newTokens.some(t=>tokens.includes(t));
  });
  if(overlap) return `⚠️ This may overlap with “${escapeHTML(overlap)}”. Continue if you want both categories.`;
  return '';
}
function ensureCategoryWarningEl(){
  let el=document.getElementById('newCatWarning');
  if(el) return el;
  const input=document.getElementById('newCatInput');
  if(!input) return null;
  el=document.createElement('div');
  el.id='newCatWarning';
  el.className='category-warning';
  el.style.display='none';
  const card=document.getElementById('budgetAddCategoryCard');
  if(card) card.appendChild(el);
  return el;
}
function checkCategoryWarning(){
  const input=document.getElementById('newCatInput');
  const el=ensureCategoryWarningEl();
  if(!input||!el) return;
  const msg=categorySimilarityWarning(input.value.trim());
  el.innerHTML=msg;
  el.style.display=msg?'block':'none';
}

async function addCategory(){
  const nameEl=document.getElementById('newCatInput');
  const budgetEl=document.getElementById('newCatBudget');
  const typeEl=document.getElementById('newCatType');
  const name=nameEl.value.trim();
  const budget=parseFloat(budgetEl.value)||0;
  const type=typeEl?typeEl.value:'expense';
  if(!name) return;

  const warning=categorySimilarityWarning(name);
  if(warning && !confirm(warning.replace(/^⚠️\s*/, '')+'\n\nContinue adding this category?')) return;

  restoreCategory(name);
  if(!state.categories.includes(name)) state.categories.push(name);
  setCategoryType(name,type);
  await sb.from('categories').upsert({name,sort_order:state.categories.length});
  if(budget>0){await sb.from('budgets').upsert({cat:name,amount:budget});state.budgets[name]=budget;}
  nameEl.value=''; budgetEl.value=''; if(typeEl) typeEl.value='expense';
  checkCategoryWarning();
  renderCatSelect(); renderBudgetView(); showSaved();
}


async function removeCategory(cat){
  if(!confirm(`Remove category "${cat}"? Existing transactions keep their label. Budget for this category will be deleted, and it will no longer appear in CSV/category dropdowns.`)) return;
  state.categories=state.categories.filter(c=>c!==cat);
  markCategoryRemoved(cat);
  delete state.budgets[cat];
  delete categoryTypes[cat]; saveCategoryTypes();
  await Promise.all([
    sb.from('categories').delete().eq('name',cat),
    sb.from('budgets').delete().eq('cat',cat)
  ]);
  renderCatSelect(); renderBudgetView(); renderMonthly(); renderYearly(); showSaved();
}


// ── EDIT TRANSACTION ──
let currentEditTxId=null;
function openEditTx(id){
  currentEditTxId=id;
  const t=state.transactions.find(t=>String(t.id)===String(id));
  if(!t) return;
  const desc=t.description||t.desc||'';
  const cats=getCategories();
  const overlay=document.createElement('div');
  overlay.id='editTxModal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(30,42,58,0.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.15);';
  const fStyle='width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:DM Sans,sans-serif;font-size:13px;outline:none;box-sizing:border-box;';
  const lStyle='font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:600;display:block;';
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;">Edit transaction</div>
      <button onclick="closeEditTx()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div><span style="${lStyle}">Description</span><input id="etDesc" value="${desc.replace(/"/g,'&quot;')}" style="${fStyle}"></div>
      <div><span style="${lStyle}">Amount</span><input id="etAmount" type="number" value="${t.amount}" min="0" step="0.01" style="${fStyle}"></div>
      <div><span style="${lStyle}">Type</span>
        <select id="etType" style="${fStyle}">
          <option value="expense" ${t.type==='expense'?'selected':''}>− Expense</option>
          <option value="income" ${t.type==='income'?'selected':''}>+ Income</option>
        </select>
      </div>
      <div><span style="${lStyle}">Category</span>
        <select id="etCat" style="${fStyle}">${cats.map(c=>`<option ${c===t.cat?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div><span style="${lStyle}">Account</span>
        <select id="etAcct" style="${fStyle}">
          <option value="personal-credit" ${t.acct==='personal-credit'?'selected':''}>💳 Personal Credit</option>
          <option value="debit" ${t.acct==='debit'?'selected':''}>💳 Debit</option>
          <option value="joint" ${t.acct==='joint'?'selected':''}>🤝 Joint (÷2)</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button onclick="saveEditTx()" style="flex:1;background:var(--blue);border:none;border-radius:10px;padding:11px;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;font-weight:500;">Save changes</button>
      <button onclick="closeEditTx()" style="background:none;border:1px solid var(--border);border-radius:10px;padding:11px 16px;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.body.style.overflow='hidden';
}

function closeEditTx(){
  const m=document.getElementById('editTxModal');
  if(m) m.remove();
  document.body.style.overflow='';
  currentEditTxId=null;
}

async function saveEditTx(){
  const id=currentEditTxId;
  const t=state.transactions.find(t=>String(t.id)===String(id));
  if(!t) return;
  const desc=document.getElementById('etDesc').value.trim();
  const amount=parseFloat(document.getElementById('etAmount').value);
  const type=document.getElementById('etType').value;
  const cat=document.getElementById('etCat').value;
  const acct=document.getElementById('etAcct').value;
  if(!desc||isNaN(amount)||amount<=0) return;
  const subType=type==='income'?'income':(acct==='debit'?'debit':'credit');
  t.description=desc; t.amount=amount; t.type=type; t.cat=cat; t.acct=acct; t.subType=subType;
  await sb.from('transactions').update({description:desc,amount,type,cat,acct,sub_type:subType}).eq('id',id);
  closeEditTx();
  renderTotalCover(); renderMonthly(); renderYearly(); updateOverview(); showSaved();
}

// ─── BOOKS / READING ───
async function addBook(){
  const title=document.getElementById('bookTitle').value.trim();
  const author=document.getElementById('bookAuthor').value.trim();
  const startDate=document.getElementById('bookStartDate').value;
  const status=document.getElementById('bookStatusInput').value;
  if(!title) return;
  const id=Date.now();
  const color=bookColors[state.books.length%bookColors.length];
  await sb.from('books').insert({id,title,author:author||'Unknown',color,status,start_date:startDate,end_date:status==='finished'?startDate:''});
  state.books.push({id,title,author:author||'Unknown',color,status,startDate,endDate:status==='finished'?startDate:''});
  document.getElementById('bookTitle').value='';document.getElementById('bookAuthor').value='';document.getElementById('bookStartDate').value='';
  renderBooks();updateReadCalBookSelect();buildReadCal();updateOverview();renderReadReports();showSaved();
}
async function deleteBook(id){
  await sb.from('books').delete().eq('id',id);
  await sb.from('reading_heatmap').delete().eq('day_key','placeholder');// handled below
  // remove book from all heatmap entries
  for(const key of Object.keys(state.readHeatmap)){
    state.readHeatmap[key]=state.readHeatmap[key].filter(bid=>bid!==id);
    if(!state.readHeatmap[key].length){delete state.readHeatmap[key];await sb.from('reading_heatmap').delete().eq('day_key',key);}
    else{await sb.from('reading_heatmap').upsert({day_key:key,book_ids:state.readHeatmap[key]});}
  }
  state.books=state.books.filter(b=>b.id!==id);
  renderBooks();updateReadCalBookSelect();buildReadCal();updateOverview();renderReadReports();showSaved();
}
async function setBookStatus(id,status){
  const b=state.books.find(b=>b.id===id);if(!b) return;
  b.status=status;
  if(status==='finished'&&!b.endDate) b.endDate=new Date().toISOString().slice(0,10);
  if(status==='reading') b.endDate='';
  await sb.from('books').update({status,end_date:b.endDate}).eq('id',id);
  renderBooks();updateOverview();renderReadReports();showSaved();
}
function renderBooks(){
  const list=document.getElementById('bookList');
  if(!state.books.length){list.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No books yet. Add one above.</div>';return;}
  const order={reading:0,paused:1,finished:2};
  const sorted=[...state.books].sort((a,b)=>(order[a.status]||0)-(order[b.status]||0));
  list.innerHTML=sorted.map(b=>{
    const daysRead=Object.values(state.readHeatmap).filter(ids=>ids.includes(b.id)).length;
    const startFmt=b.startDate?new Date(b.startDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
    const endFmt=b.endDate?new Date(b.endDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
    return `<div class="book-card" style="flex-wrap:wrap;gap:8px;">
      <div class="book-spine" style="background:${b.color};min-height:40px;"></div>
      <div style="flex:1;min-width:120px;">
        <div class="book-title">${b.title}</div><div class="book-author">${b.author}</div>
        <div class="book-dates">Started: ${startFmt}${b.status==='finished'?` · Finished: ${endFmt}`:''}${daysRead>0?`<span class="book-days"> · ${daysRead} days read</span>`:''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <select onchange="setBookStatus(${b.id},this.value)" style="font-size:11px;padding:3px 8px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text);">
          <option value="reading" ${b.status==='reading'?'selected':''}>📖 Reading</option>
          <option value="paused" ${b.status==='paused'?'selected':''}>⏸ Paused</option>
          <option value="finished" ${b.status==='finished'?'selected':''}>✅ Finished</option>
        </select>
        <button class="del-btn" style="margin:0;" onclick="deleteBook(${b.id})">×</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('read-active-count').textContent=state.books.filter(b=>b.status==='reading').length;
  document.getElementById('read-finished-count').textContent=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(String(todayObj.getFullYear()))).length;
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  document.getElementById('read-days-month').textContent=Object.keys(state.readHeatmap).filter(k=>k.startsWith(mk)&&state.readHeatmap[k]?.length).length;
}

// READING CALENDAR
// removed duplicate: // readCalView already declared above
// removed duplicate: // activeReadReport already declared above
function switchGrowth(tab){
  document.querySelectorAll('#panel-growth .report-tab').forEach((t,i)=>t.classList.toggle('active',['reading','piano'][i]===tab));
  document.getElementById('growth-reading').style.display=tab==='reading'?'block':'none';
  document.getElementById('growth-piano').style.display=tab==='piano'?'block':'none';
}
function switchReadReport(name){
  activeReadReport=name;
  document.getElementById('read-report-monthly').style.display=name==='monthly'?'block':'none';
  document.getElementById('read-report-yearly').style.display=name==='yearly'?'block':'none';
  document.querySelectorAll('#growth-reading .report-tabs:last-of-type .report-tab').forEach((t,i)=>t.classList.toggle('active',['monthly','yearly'][i]===name));
  renderReadReports();
}
function updateReadCalBookSelect(){
  const sel=document.getElementById('readCalBookSelect');
  const current=sel.value;
  sel.innerHTML='<option value="__all__">All books</option>'+state.books.map(b=>`<option value="${b.id}" ${current==b.id?'selected':''}>${b.title}</option>`).join('');
}
function buildReadCal(){
  const{year,month}=readCalView;
  document.getElementById('readCalLabel').textContent=`${MONTH_NAMES[month]} ${year}`;
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const offset=(firstDay+6)%7;
  const selBook=document.getElementById('readCalBookSelect').value;
  let html='';
  for(let i=0;i<offset;i++) html+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const key=dayKey(year,month,d);
    const ids=state.readHeatmap[key]||[];
    const isActive=selBook==='__all__'?ids.length>0:ids.includes(Number(selBook)||parseInt(selBook));
    const isToday=todayObj.getFullYear()===year&&todayObj.getMonth()===month&&todayObj.getDate()===d;
    html+=`<div class="cal-cell ${isActive?'active':''} ${isToday?'today':''}" style="${isActive?'background:var(--purple);color:#000;':''}" onclick="toggleReadDay('${key}')">${d}</div>`;
  }
  document.getElementById('readCalGrid').innerHTML=html;
}
async function toggleReadDay(key){
  const selBook=document.getElementById('readCalBookSelect').value;
  if(!state.readHeatmap[key]) state.readHeatmap[key]=[];
  if(selBook==='__all__'){
    const readingIds=state.books.filter(b=>b.status==='reading').map(b=>b.id);
    const alreadyAll=readingIds.every(id=>state.readHeatmap[key].includes(id));
    if(alreadyAll) state.readHeatmap[key]=state.readHeatmap[key].filter(id=>!readingIds.includes(id));
    else readingIds.forEach(id=>{if(!state.readHeatmap[key].includes(id)) state.readHeatmap[key].push(id);});
  } else {
    const bid=Number(selBook)||parseInt(selBook);
    const idx=state.readHeatmap[key].indexOf(bid);
    if(idx>-1) state.readHeatmap[key].splice(idx,1); else state.readHeatmap[key].push(bid);
  }
  if(!state.readHeatmap[key].length){delete state.readHeatmap[key];await sb.from('reading_heatmap').delete().eq('day_key',key);}
  else{await sb.from('reading_heatmap').upsert({day_key:key,book_ids:state.readHeatmap[key]});}
  buildReadCal();renderBooks();renderReadReports();showSaved();
}
function readCalPrev(){readCalView.month--;if(readCalView.month<0){readCalView.month=11;readCalView.year--;}buildReadCal();}
function readCalNext(){readCalView.month++;if(readCalView.month>11){readCalView.month=0;readCalView.year++;}buildReadCal();}

function readDaysInMonth(y,m){
  const prefix=`${y}-${String(m+1).padStart(2,'0')}-`;
  return Object.keys(state.readHeatmap).filter(k=>k.startsWith(prefix)&&state.readHeatmap[k]?.length).length;
}
function renderReadReports(){renderReadMonthly();renderReadYearly();}
function renderReadMonthly(){
  const el=document.getElementById('read-report-monthly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const months=[];
  for(let i=5;i>=0;i--){let mm=m-i,yy=y;if(mm<0){mm+=12;yy--;}months.push({y:yy,m:mm,label:MONTH_SHORT[mm]+(yy!==y?` '${String(yy).slice(2)}`:'')} );}
  const curr=readDaysInMonth(y,m);
  const prevM=m===0?11:m-1,prevY=m===0?y-1:y;const prev=readDaysInMonth(prevY,prevM);
  const mk=`${y}-${String(m+1).padStart(2,'0')}`;
  const finishedThisMonth=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(mk));
  const maxVal=Math.max(...months.map(mo=>readDaysInMonth(mo.y,mo.m)),1);
  const barData=months.map(mo=>({label:mo.label,value:readDaysInMonth(mo.y,mo.m),highlight:mo.y===y&&mo.m===m}));
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${MONTH_NAMES[m]} ${y} — Reading Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Days read</div><div class="stat-box-val" style="color:var(--purple)">${curr} ${deltaBadge(curr,prev)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last month</div><div class="stat-box-val" style="color:var(--muted)">${prev}</div></div>
      <div class="stat-box"><div class="stat-box-label">Books finished</div><div class="stat-box-val" style="color:var(--green)">${finishedThisMonth.length}</div></div>
      <div class="stat-box"><div class="stat-box-label">In progress</div><div class="stat-box-val" style="color:var(--blue)">${state.books.filter(b=>b.status==='reading').length}</div></div>
    </div>
    ${renderBarChart(barData,maxVal,null)}
    <div class="insight">${curr===0?'<strong>No reading days logged yet.</strong>':curr>prev?`<strong>Up ${curr-prev} days vs last month.</strong>`:curr<prev?`<strong>Down ${Math.abs(curr-prev)} days vs last month.</strong>`:` <strong>Same as last month (${curr} days).</strong>`}</div>
  </div>`;
}
function renderReadYearly(){
  const el=document.getElementById('read-report-yearly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const monthData=[];
  for(let mo=0;mo<=m;mo++) monthData.push({label:MONTH_SHORT[mo],value:readDaysInMonth(y,mo),highlight:mo===m});
  const total=monthData.reduce((s,mo)=>s+mo.value,0);
  const lastTotal=Array.from({length:m+1},(_,mo)=>readDaysInMonth(y-1,mo)).reduce((s,v)=>s+v,0);
  const finished=state.books.filter(b=>b.status==='finished'&&b.endDate&&b.endDate.startsWith(String(y)));
  const maxVal=Math.max(...monthData.map(mo=>mo.value),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${y} — Yearly Reading Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Days read ${y}</div><div class="stat-box-val" style="color:var(--purple)">${total} ${deltaBadge(total,lastTotal)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Same period ${y-1}</div><div class="stat-box-val" style="color:var(--muted)">${lastTotal}</div></div>
      <div class="stat-box"><div class="stat-box-label">Books finished</div><div class="stat-box-val" style="color:var(--green)">${finished.length}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(total/(m+1)).toFixed(1)}</div></div>
    </div>
    ${renderBarChart(monthData,maxVal,null)}
    <div class="insight">${total===0?'<strong>No reading logged yet this year.</strong>':total>lastTotal?`<strong>Ahead of last year by ${total-lastTotal} days.</strong>`:total<lastTotal?`<strong>Behind last year by ${lastTotal-total} days.</strong>`:' <strong>Tracking with last year.</strong>'}${total>0?` Average <strong>${(total/(m+1)).toFixed(1)} days/month</strong>.`:''}</div>
  </div>`;
}

// ─── PIANO ───
async function logPiano(){
  const mins=parseInt(document.getElementById('pianoMins').value);
  const note=document.getElementById('pianoNote').value.trim();
  if(!mins||mins<=0) return;
  const id=Date.now();
  const date=new Date().toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
  await sb.from('piano').insert({id,mins,note:note||'Practice session',date});
  state.piano.unshift({id,mins,note:note||'Practice session',date});
  document.getElementById('pianoMins').value='';document.getElementById('pianoNote').value='';
  renderPiano();updateOverview();showSaved();
}
async function deletePiano(id){
  await sb.from('piano').delete().eq('id',id);
  state.piano=state.piano.filter(p=>p.id!==id);
  renderPiano();updateOverview();showSaved();
}
function renderPiano(){
  const total=state.piano.reduce((s,p)=>s+p.mins,0);
  const pct=Math.min(100,Math.round((total/PIANO_GOAL)*100));
  document.getElementById('piano-mins').innerHTML=total+' <span style="font-size:16px;color:var(--muted)">min</span>';
  document.getElementById('piano-bar').style.width=pct+'%';
  document.getElementById('piano-pct').textContent=pct+'%';
  const log=document.getElementById('pianoLog');
  if(!state.piano.length){log.innerHTML='';return;}
  log.innerHTML=state.piano.slice(0,3).map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
      <span>${p.note} · <span style="color:var(--purple)">${p.mins}min</span> · ${p.date}</span>
      <button class="del-btn" onclick="deletePiano(${p.id})">×</button>
    </div>`).join('');
}

// ─── FITNESS REPORTS ───
// removed duplicate: let activeReport='monthly';
function switchReport(name){
  activeReport=name;
  document.querySelectorAll('.report-tab').forEach((t,i)=>t.classList.toggle('active',['monthly','quarterly','yearly'][i]===name));
  ['monthly','quarterly','yearly'].forEach(n=>{document.getElementById('report-'+n).style.display=n===name?'block':'none';});
  renderReports();
}
function workoutsInMonth(y,m){
  const prefix=`${y}-${String(m+1).padStart(2,'0')}-`;
  return Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
}
function renderReports(){renderMonthlyReport();renderQuarterlyReport();renderYearlyReport();}
function renderMonthlyReport(){
  const el=document.getElementById('report-monthly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const months=[];for(let i=5;i>=0;i--){let mm=m-i,yy=y;if(mm<0){mm+=12;yy--;}months.push({y:yy,m:mm,label:MONTH_SHORT[mm]+(yy!==y?` '${String(yy).slice(2)}`:'')} );}
  const currCount=workoutsInMonth(y,m);
  const prevM=m===0?11:m-1,prevY=m===0?y-1:y;const prevCount=workoutsInMonth(prevY,prevM);
  const goal=state.fitGoals[monthKey(y,m)];
  const goalPct=goal?Math.min(100,Math.round((currCount/goal)*100)):null;
  const maxVal=Math.max(...months.map(mo=>workoutsInMonth(mo.y,mo.m)),goal||0,1);
  const barData=months.map(mo=>({label:mo.label,value:workoutsInMonth(mo.y,mo.m),highlight:mo.y===y&&mo.m===m}));
  let nextGoal=goal?goal:12;if(goal&&currCount>=goal)nextGoal=goal+2;else if(goal&&currCount<goal*0.5)nextGoal=Math.max(4,goal-2);
  el.innerHTML=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;">${MONTH_NAMES[m]} ${y} — Fitness Report</div>
      ${goal?`<span class="pill" style="background:#1a1e2e;color:var(--blue)">Goal: ${goal} workouts</span>`:'<span style="font-size:12px;color:var(--muted)">No goal set</span>'}
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">This month</div><div class="stat-box-val" style="color:var(--blue)">${currCount} ${deltaBadge(currCount,prevCount)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last month</div><div class="stat-box-val" style="color:var(--muted)">${prevCount}</div></div>
      ${goal?`<div class="stat-box"><div class="stat-box-label">Goal progress</div><div class="stat-box-val" style="color:${goalPct>=100?'var(--green)':'var(--orange)'}">${goalPct}%</div></div>`:''}
      ${goal?`<div class="stat-box"><div class="stat-box-label">Remaining</div><div class="stat-box-val" style="color:var(--muted)">${Math.max(0,goal-currCount)}</div></div>`:''}
    </div>
    ${goal?`<div class="progress-wrap" style="margin-bottom:14px;"><div class="progress-label"><span>Monthly goal</span><span>${currCount}/${goal}</span></div><div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${goalPct}%;background:${goalPct>=100?'var(--green)':'var(--blue)'}"></div></div></div>`:''}
    ${renderBarChart(barData,maxVal,goal)}
    <div class="insight">${currCount===0?'<strong>No workouts logged yet this month.</strong>':currCount>prevCount?`<strong>Up ${currCount-prevCount} from last month.</strong>`:currCount<prevCount?`<strong>Down ${prevCount-currCount} from last month.</strong>`:` <strong>Same as last month (${currCount}).</strong>`} ${goal&&goalPct>=100?' 🎯 Goal smashed!':goal?' Push to hit your goal.':''}<br><strong>Suggested goal for next month:</strong> ${nextGoal} workouts.</div>
  </div>`;
}
function renderQuarterlyReport(){
  const el=document.getElementById('report-quarterly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();const currQ=Math.floor(m/3);
  const quarters=[];for(let i=3;i>=0;i--){let q=currQ-i,qy=y;if(q<0){q+=4;qy--;}const months=[q*3,q*3+1,q*3+2];const total=months.reduce((s,mo)=>s+workoutsInMonth(qy,mo),0);quarters.push({label:`Q${q+1} ${qy}`,total,highlight:q===currQ&&qy===y});}
  const curr=quarters[3],prev=quarters[2];const maxVal=Math.max(...quarters.map(q=>q.total),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">Q${currQ+1} ${y} — Quarterly Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">This quarter</div><div class="stat-box-val" style="color:var(--blue)">${curr.total} ${deltaBadge(curr.total,prev.total)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last quarter</div><div class="stat-box-val" style="color:var(--muted)">${prev.total}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(curr.total/3).toFixed(1)}</div></div>
    </div>
    ${renderBarChart(quarters.map(q=>({label:q.label,value:q.total,highlight:q.highlight})),maxVal,null)}
    <div class="insight">${curr.total===0?'<strong>No workouts logged this quarter.</strong>':curr.total>prev.total?`<strong>Up ${curr.total-prev.total} vs last quarter.</strong>`:curr.total<prev.total?`<strong>Down ${prev.total-curr.total} vs last quarter.</strong>`:` <strong>Matching last quarter.</strong>`}</div>
  </div>`;
}
function renderYearlyReport(){
  const el=document.getElementById('report-yearly');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const monthData=[];for(let mo=0;mo<=m;mo++) monthData.push({label:MONTH_SHORT[mo],value:workoutsInMonth(y,mo),highlight:mo===m});
  const thisYearTotal=monthData.reduce((s,mo)=>s+mo.value,0);
  const lastYearTotal=Array.from({length:m+1},(_,mo)=>workoutsInMonth(y-1,mo)).reduce((s,v)=>s+v,0);
  const projected=m<11?Math.round((thisYearTotal/(m+1))*12):thisYearTotal;
  const maxVal=Math.max(...monthData.map(mo=>mo.value),1);
  el.innerHTML=`<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${y} — Yearly Report</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Total ${y}</div><div class="stat-box-val" style="color:var(--blue)">${thisYearTotal} ${deltaBadge(thisYearTotal,lastYearTotal)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Same period ${y-1}</div><div class="stat-box-val" style="color:var(--muted)">${lastYearTotal}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly avg</div><div class="stat-box-val" style="color:var(--orange)">${(thisYearTotal/(m+1)).toFixed(1)}</div></div>
      ${m<11?`<div class="stat-box"><div class="stat-box-label">Projected</div><div class="stat-box-val" style="color:var(--purple)">${projected}</div></div>`:''}
    </div>
    ${renderBarChart(monthData,maxVal,null)}
    <div class="insight">${thisYearTotal===0?'<strong>No workouts logged yet this year.</strong>':thisYearTotal>lastYearTotal?`<strong>Ahead of last year by ${thisYearTotal-lastYearTotal} workouts.</strong>`:thisYearTotal<lastYearTotal?`<strong>Behind last year by ${lastYearTotal-thisYearTotal} workouts.</strong>`:' <strong>Tracking exactly with last year.</strong>'}${m<11&&thisYearTotal>0?` On pace for <strong>~${projected} workouts</strong> this year.`:''}</div>
  </div>`;
}

// ─── OVERVIEW ───
function updateOverview(){
  const done=state.goals.filter(g=>g.done).length,total=state.goals.length;
  document.getElementById('ov-goals').innerHTML=`${done}<span style="font-size:18px;color:var(--muted)">/${total}</span>`;
  document.getElementById('ov-goal-bar').innerHTML=(state.goals.length?state.goals:[{}]).map(g=>`<div class="streak-seg ${g.done?'on':''}"></div>`).join('');
  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const prefix=monthKey(y,m)+'-';
  const monthCount=Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
  const goal=state.fitGoals[monthKey(y,m)];
  document.getElementById('ov-workouts').textContent=monthCount;
  document.getElementById('ov-workout-sub').textContent=goal?`of ${goal} goal`:'sessions this month';
  const income=state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  const balEl=document.getElementById('ov-balance');
  balEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  balEl.style.color=net>=0?'var(--green)':'var(--pink)';
  const reading=state.books.filter(b=>b.status==='reading');
  const ovBook=document.getElementById('ov-book');
  if(reading.length) ovBook.innerHTML=reading.slice(0,2).map(b=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:5px;height:5px;border-radius:50%;background:${b.color};flex-shrink:0;"></div><span style="color:var(--text);font-weight:500;font-size:13px;">${b.title}</span></div>`).join('')+(reading.length>2?`<div style="font-size:11px;color:var(--muted);">+${reading.length-2} more</div>`:'');
  else ovBook.innerHTML='<span style="font-style:italic;font-size:13px;">No books in progress</span>';
  const pianoTotal=state.piano.reduce((s,p)=>s+p.mins,0);
  const ovPiano=document.getElementById('ov-piano'),ovPianoBar=document.getElementById('ov-piano-bar');
  if(pianoTotal>0){ovPiano.textContent=pianoTotal+' min logged';ovPiano.style.color='var(--purple)';ovPianoBar.style.display='block';document.getElementById('ov-piano-fill').style.width=Math.min(100,(pianoTotal/PIANO_GOAL)*100)+'%';}
  else{ovPiano.textContent='No sessions logged';ovPiano.style.color='var(--muted)';ovPianoBar.style.display='none';}
  const streak=Object.values(state.fitnessHeatmap).filter(Boolean).length;
  document.getElementById('streakPill').textContent=`🔥 ${streak} day streak`;
}

// ─── SHARED HELPERS ───
function monthKey(y,m){return `${y}-${String(m+1).padStart(2,'0')}`;}
function monthKeyFromDate(dateStr){
  // Parse DD/MM/YY or DD/MM/YYYY
  try {
    const parts = dateStr.split('/');
    if(parts.length===3){
      const mm = parts[1].padStart(2,'0');
      const yy = parts[2].length===2 ? '20'+parts[2] : parts[2];
      return `${yy}-${mm}`;
    }
  } catch(e){}
  // Fallback to current month
  const n=new Date();
  return monthKey(n.getFullYear(),n.getMonth());
}
function dayKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function deltaBadge(curr,prev){if(prev===null||prev===undefined) return '';const diff=curr-prev;if(diff>0) return `<span class="delta up">▲ ${diff}</span>`;if(diff<0) return `<span class="delta down">▼ ${Math.abs(diff)}</span>`;return `<span class="delta flat">= same</span>`;}
function renderBarChart(data,maxVal,goalVal){
  const safeMax=maxVal||1;
  return `<div class="bar-chart">${data.map(d=>{const pct=Math.min(100,Math.round((d.value/safeMax)*100));const col=d.highlight?'var(--blue)':'var(--surface2)';return `<div class="bar-col"><div class="bar-val" style="color:${d.highlight?'var(--blue)':'var(--muted)'}">${d.value}</div><div class="bar-wrap"><div class="bar-fill" style="height:${pct}%;background:${col};border:${d.highlight?'1px solid var(--blue)':'1px solid var(--border)'}"></div></div><div class="bar-label">${d.label}</div></div>`;}).join('')}</div>`;
}

// ─── START ───
// boot moved to end after Growth overrides are loaded.

// ─── CUSTOM GROWTH TRACKERS ───
// Lightweight customisation layer for Growth. Stored locally for now so this update does not require Supabase schema changes.
const GROWTH_TRACKER_KEY = 'myos_growth_trackers_v1';
let growthTrackers = loadGrowthTrackers();
let selectedGrowthTrackerId = growthTrackers[0]?.id || '';
const growthCalView = { year: todayObj.getFullYear(), month: todayObj.getMonth() };

function loadGrowthTrackers(){
  try {
    const raw = localStorage.getItem(GROWTH_TRACKER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e){
    console.warn('Could not load growth trackers', e);
    return [];
  }
}

function saveGrowthTrackers(){
  localStorage.setItem(GROWTH_TRACKER_KEY, JSON.stringify(growthTrackers));
}

function growthMonthKey(y, m){
  return `${y}-${String(m+1).padStart(2,'0')}`;
}

function growthTrackerById(id){
  return growthTrackers.find(t => String(t.id) === String(id));
}

function addGrowthTracker(){
  const nameInput = document.getElementById('growthItemName');
  const goalInput = document.getElementById('growthItemGoal');
  if(!nameInput) return;
  const name = nameInput.value.trim();
  const monthlyGoal = parseInt(goalInput?.value || '0', 10) || 0;
  if(!name) return;

  const exists = growthTrackers.some(t => t.name.toLowerCase() === name.toLowerCase());
  if(exists){
    alert('This growth item already exists.');
    return;
  }

  const tracker = {
    id: Date.now(),
    name,
    monthlyGoal,
    createdAt: new Date().toISOString(),
    logs: {}
  };
  growthTrackers.push(tracker);
  selectedGrowthTrackerId = tracker.id;
  nameInput.value = '';
  if(goalInput) goalInput.value = '';
  saveGrowthTrackers();
  renderGrowthTrackers();
  updateOverview();
  showSaved();
}

function deleteGrowthTracker(id){
  const tracker = growthTrackerById(id);
  if(!tracker) return;
  if(!confirm(`Delete "${tracker.name}" and its tracking history?`)) return;
  growthTrackers = growthTrackers.filter(t => String(t.id) !== String(id));
  selectedGrowthTrackerId = growthTrackers[0]?.id || '';
  saveGrowthTrackers();
  renderGrowthTrackers();
  updateOverview();
  showSaved();
}

function updateGrowthGoal(id, value){
  const tracker = growthTrackerById(id);
  if(!tracker) return;
  tracker.monthlyGoal = parseInt(value || '0', 10) || 0;
  saveGrowthTrackers();
  renderGrowthTrackers();
  showSaved();
}

function selectGrowthTracker(id){
  selectedGrowthTrackerId = id;
  renderGrowthTrackers();
}

function toggleGrowthDay(key){
  const tracker = growthTrackerById(selectedGrowthTrackerId);
  if(!tracker) return;
  tracker.logs = tracker.logs || {};
  if(tracker.logs[key]) delete tracker.logs[key];
  else tracker.logs[key] = true;
  saveGrowthTrackers();
  renderGrowthTrackers();
  showSaved();
}

function growthDaysForTracker(tracker, y, m){
  if(!tracker?.logs) return 0;
  const prefix = `${y}-${String(m+1).padStart(2,'0')}-`;
  return Object.keys(tracker.logs).filter(k => k.startsWith(prefix) && tracker.logs[k]).length;
}

function renderGrowthTrackerList(){
  const list = document.getElementById('growthTrackerList');
  if(!list) return;
  if(!growthTrackers.length){
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No custom growth items yet. Add one above.</div>';
    return;
  }
  list.innerHTML = growthTrackers.map(t => {
    const curr = growthDaysForTracker(t, growthCalView.year, growthCalView.month);
    const goal = t.monthlyGoal || 0;
    const pct = goal ? Math.min(100, Math.round((curr / goal) * 100)) : 0;
    const isSelected = String(t.id) === String(selectedGrowthTrackerId);
    return `<div class="growth-tracker-item ${isSelected?'active':''}" onclick="selectGrowthTracker('${t.id}')">
      <div style="flex:1;min-width:140px;">
        <div style="font-weight:600;font-size:13px;color:var(--text);">${escapeHtml(t.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${curr}${goal?` / ${goal}`:''} days this month</div>
        ${goal?`<div class="progress-bar" style="height:4px;margin-top:7px;"><div class="progress-fill" style="background:var(--purple);width:${pct}%"></div></div>`:''}
      </div>
      <input onclick="event.stopPropagation()" onchange="updateGrowthGoal('${t.id}', this.value)" value="${goal || ''}" type="number" min="1" placeholder="goal" class="growth-goal-input">
      <button onclick="event.stopPropagation();deleteGrowthTracker('${t.id}')" class="del-btn">×</button>
    </div>`;
  }).join('');
}

function renderGrowthTrackerSelect(){
  const sel = document.getElementById('growthTrackerSelect');
  if(!sel) return;
  if(!growthTrackers.length){
    sel.innerHTML = '<option value="">No items yet</option>';
    return;
  }
  if(!growthTrackerById(selectedGrowthTrackerId)) selectedGrowthTrackerId = growthTrackers[0].id;
  sel.innerHTML = growthTrackers.map(t => `<option value="${t.id}" ${String(t.id)===String(selectedGrowthTrackerId)?'selected':''}>${escapeHtml(t.name)}</option>`).join('');
}

function buildGrowthCal(){
  const label = document.getElementById('growthCalLabel');
  const grid = document.getElementById('growthCalGrid');
  if(!label || !grid) return;
  const {year, month} = growthCalView;
  label.textContent = `${MONTH_NAMES[month]} ${year}`;
  const tracker = growthTrackerById(selectedGrowthTrackerId);
  if(!tracker){
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:16px;text-align:center;border:1px dashed var(--border);border-radius:12px;">Add a growth item to start monthly tracking.</div>';
    return;
  }
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay + 6) % 7;
  let html = '';
  for(let i=0;i<offset;i++) html += '<div class="cal-cell empty"></div>';
  for(let d=1; d<=daysInMonth; d++){
    const key = dayKey(year, month, d);
    const isActive = !!tracker.logs?.[key];
    const isToday = todayObj.getFullYear()===year && todayObj.getMonth()===month && todayObj.getDate()===d;
    html += `<div class="cal-cell ${isActive?'active':''} ${isToday?'today':''}" style="${isActive?'background:var(--purple);color:#fff;':''}" onclick="toggleGrowthDay('${key}')">${d}</div>`;
  }
  grid.innerHTML = html;
}

function renderGrowthCustomReport(){
  const el = document.getElementById('growthCustomReport');
  if(!el) return;
  const tracker = growthTrackerById(selectedGrowthTrackerId);
  if(!tracker){
    el.innerHTML = '<div class="card"><div style="color:var(--muted);font-size:13px;">No custom growth item selected.</div></div>';
    return;
  }
  const y = growthCalView.year, m = growthCalView.month;
  const curr = growthDaysForTracker(tracker, y, m);
  const prevM = m===0 ? 11 : m-1;
  const prevY = m===0 ? y-1 : y;
  const prev = growthDaysForTracker(tracker, prevY, prevM);
  const goal = tracker.monthlyGoal || 0;
  const goalPct = goal ? Math.min(100, Math.round((curr / goal) * 100)) : null;
  const months = [];
  for(let i=5;i>=0;i--){
    let mm = m-i, yy = y;
    if(mm<0){ mm += 12; yy--; }
    months.push({ y:yy, m:mm, label:MONTH_SHORT[mm]+(yy!==y?` '${String(yy).slice(2)}`:''), value:growthDaysForTracker(tracker, yy, mm), highlight: yy===y && mm===m });
  }
  const maxVal = Math.max(...months.map(mo=>mo.value), goal || 1, 1);
  el.innerHTML = `<div class="card"><div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;">${escapeHtml(tracker.name)} — ${MONTH_NAMES[m]} ${y}</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-box-label">Days tracked</div><div class="stat-box-val" style="color:var(--purple)">${curr} ${deltaBadge(curr,prev)}</div></div>
      <div class="stat-box"><div class="stat-box-label">Last month</div><div class="stat-box-val" style="color:var(--muted)">${prev}</div></div>
      <div class="stat-box"><div class="stat-box-label">Monthly goal</div><div class="stat-box-val" style="color:var(--blue)">${goal || '—'}</div></div>
      <div class="stat-box"><div class="stat-box-label">Progress</div><div class="stat-box-val" style="color:var(--green)">${goalPct===null?'—':goalPct+'%'}</div></div>
    </div>
    ${renderBarChart(months,maxVal,goal || null)}
    <div class="insight">${goal?`<strong>${Math.max(goal-curr,0)} days left</strong> to reach this month’s goal.`:'Set a monthly goal if you want this tracker to show progress against target.'}</div>
  </div>`;
}

function renderGrowthTrackers(){
  renderGrowthTrackerList();
  renderGrowthTrackerSelect();
  buildGrowthCal();
  renderGrowthCustomReport();
}

function growthCalPrev(){
  growthCalView.month--;
  if(growthCalView.month<0){ growthCalView.month=11; growthCalView.year--; }
  renderGrowthTrackers();
}
function growthCalNext(){
  growthCalView.month++;
  if(growthCalView.month>11){ growthCalView.month=0; growthCalView.year++; }
  renderGrowthTrackers();
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

// Override Growth switcher to include Custom tab while preserving existing Reading/Piano sections.
function switchGrowth(tab){
  const tabs = ['reading','piano','custom'];
  document.querySelectorAll('#panel-growth > .report-tabs:first-child .report-tab').forEach((t,i)=>t.classList.toggle('active',tabs[i]===tab));
  const reading = document.getElementById('growth-reading');
  const piano = document.getElementById('growth-piano');
  const custom = document.getElementById('growth-custom');
  if(reading) reading.style.display = tab==='reading' ? 'block' : 'none';
  if(piano) piano.style.display = tab==='piano' ? 'block' : 'none';
  if(custom) custom.style.display = tab==='custom' ? 'block' : 'none';
  if(tab==='custom') renderGrowthTrackers();
}

// Render once after boot creates the DOM. Safe if called before the Growth tab is opened.
setTimeout(renderGrowthTrackers, 0);

// ─── GROWTH CLEANUP: Optional Book Log + Custom Items ───
// Book Log is no longer a forced default module for new users.
// It remains visible automatically when the user already has book/reading history.
// New users can enable it manually from the Custom tab.
const BOOK_LOG_ENABLED_KEY = 'myos_book_log_enabled_v1';

function renderPiano(){
  // Kept as a safe no-op so older saved code paths do not break if called.
}

function hasBookLogHistory(){
  const hasBooks = Array.isArray(state.books) && state.books.length > 0;
  const hasReadingDays = state.readHeatmap && Object.values(state.readHeatmap).some(ids => Array.isArray(ids) && ids.length > 0);
  return hasBooks || hasReadingDays;
}

function isBookLogEnabled(){
  return localStorage.getItem(BOOK_LOG_ENABLED_KEY) === 'true' || hasBookLogHistory();
}

function enableBookLogModule(){
  localStorage.setItem(BOOK_LOG_ENABLED_KEY, 'true');
  syncGrowthModuleVisibility();
  switchGrowth('reading');
  showSaved();
}

function syncGrowthModuleVisibility(){
  const enabled = isBookLogEnabled();
  const readingTab = document.getElementById('growthReadingTab');
  const customTab = document.getElementById('growthCustomTab');
  const readingPanel = document.getElementById('growth-reading');
  const customPanel = document.getElementById('growth-custom');
  const enableCard = document.getElementById('bookLogEnableCard');
  const overviewBookCard = document.getElementById('overviewBookCard');

  if(readingTab) readingTab.style.display = enabled ? '' : 'none';
  if(enableCard) enableCard.style.display = enabled ? 'none' : 'block';
  if(overviewBookCard) overviewBookCard.style.display = enabled ? '' : 'none';

  // If Book Log is not enabled, Custom should be the default visible Growth module.
  if(!enabled){
    if(readingPanel) readingPanel.style.display = 'none';
    if(customPanel) customPanel.style.display = 'block';
    if(readingTab) readingTab.classList.remove('active');
    if(customTab) customTab.classList.add('active');
  }
}

function switchGrowth(tab){
  const bookEnabled = isBookLogEnabled();
  if(tab === 'reading' && !bookEnabled) tab = 'custom';

  const readingTab = document.getElementById('growthReadingTab');
  const customTab = document.getElementById('growthCustomTab');
  const reading = document.getElementById('growth-reading');
  const custom = document.getElementById('growth-custom');

  if(readingTab){
    readingTab.style.display = bookEnabled ? '' : 'none';
    readingTab.classList.toggle('active', tab === 'reading' && bookEnabled);
  }
  if(customTab) customTab.classList.toggle('active', tab === 'custom');
  if(reading) reading.style.display = (tab === 'reading' && bookEnabled) ? 'block' : 'none';
  if(custom) custom.style.display = tab === 'custom' ? 'block' : 'none';

  syncGrowthModuleVisibility();
  if(tab === 'custom' && typeof renderGrowthTrackers === 'function') renderGrowthTrackers();
}

function updateOverview(){
  syncGrowthModuleVisibility();

  const done=state.goals.filter(g=>g.done).length,total=state.goals.length;
  document.getElementById('ov-goals').innerHTML=`${done}<span style="font-size:18px;color:var(--muted)">/${total}</span>`;
  document.getElementById('ov-goal-bar').innerHTML=(state.goals.length?state.goals:[{}]).map(g=>`<div class="streak-seg ${g.done?'on':''}"></div>`).join('');

  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const prefix=monthKey(y,m)+'-';
  const monthCount=Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
  const goal=state.fitGoals[monthKey(y,m)];
  document.getElementById('ov-workouts').textContent=monthCount;
  document.getElementById('ov-workout-sub').textContent=goal?`of ${goal} goal`:'sessions this month';

  const now2=new Date();
  const curMk=monthKey(now2.getFullYear(),now2.getMonth());
  const curMkTxs=state.transactions.filter(t=>t.monthKey===curMk);
  const income=curMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=curMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  const balEl=document.getElementById('ov-balance');
  balEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  balEl.style.color=net>=0?'var(--green)':'var(--pink)';

  const ovBook=document.getElementById('ov-book');
  if(ovBook && isBookLogEnabled()){
    const reading=state.books.filter(b=>b.status==='reading');
    if(reading.length) ovBook.innerHTML=reading.slice(0,2).map(b=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:5px;height:5px;border-radius:50%;background:${b.color};flex-shrink:0;"></div><span style="color:var(--text);font-weight:500;font-size:13px;">${b.title}</span></div>`).join('')+(reading.length>2?`<div style="font-size:11px;color:var(--muted);">+${reading.length-2} more</div>`:'');
    else ovBook.innerHTML='<span style="font-style:italic;font-size:13px;">No books in progress</span>';
  }

  const ovGrowth=document.getElementById('ov-growth-custom');
  if(ovGrowth){
    const trackers = (typeof growthTrackers !== 'undefined' && Array.isArray(growthTrackers)) ? growthTrackers : [];
    if(trackers.length){
      ovGrowth.innerHTML = trackers.slice(0,3).map(t=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:5px;height:5px;border-radius:50%;background:var(--purple);flex-shrink:0;"></div><span style="color:var(--text);font-weight:500;font-size:13px;">${escapeHtml(t.name)}</span></div>`).join('') + (trackers.length>3?`<div style="font-size:11px;color:var(--muted);">+${trackers.length-3} more</div>`:'');
    } else {
      ovGrowth.innerHTML='<span style="font-style:italic;font-size:13px;">Add Piano, 3D course, journaling or any custom item</span>';
    }
  }

  const streak=Object.values(state.fitnessHeatmap).filter(Boolean).length;
  document.getElementById('streakPill').textContent=`🔥 ${streak} day streak`;
}

// Make sure a brand-new user lands on Custom, while existing readers keep Book Log visible.
setTimeout(() => {
  syncGrowthModuleVisibility();
  if(!isBookLogEnabled()) switchGrowth('custom');
}, 0);



function myosUuid(){
  if(window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function isUuidLike(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

// ─── REBUILT GROWTH HABITS MODULE ───
// Fresh Growth area: user-created habits, monthly heatmaps, end-of-month review, continue/complete loop.
const GROWTH_GOALS_KEY_V2 = 'myos_growth_goals_v2';
let growthGoals = [];
let growthSelectedGoalId = growthGoals.find(g => g.status === 'active')?.id || growthGoals[0]?.id || '';
let growthOpenGoalId = growthSelectedGoalId || '';
const freshGrowthCalView = { year: todayObj.getFullYear(), month: todayObj.getMonth() };

function normaliseGrowthGoal(g){
  return {
    id: isUuidLike(g.id) ? String(g.id) : myosUuid(),
    name: g.name || 'Untitled habit',
    icon: g.icon || '✨',
    frequency: g.frequency || 'Daily',
    targetDays: Math.max(1, Math.min(31, parseInt(g.targetDays || 12, 10) || 12)),
    status: g.status || 'active',
    createdAt: g.createdAt || new Date().toISOString(),
    completedAt: g.completedAt || '',
    days: g.days || {},
    monthDecisions: g.monthDecisions || {}
  };
}
function loadFreshGrowthGoalsLocal(){
  try {
    const parsed = JSON.parse(localStorage.getItem(GROWTH_GOALS_KEY_V2) || '[]');
    return Array.isArray(parsed) ? parsed.map(normaliseGrowthGoal) : [];
  } catch(e){ return []; }
}
function growthGoalFromRow(row){
  if(row.goal && typeof row.goal === 'object') return normaliseGrowthGoal({...row.goal, id: row.id});
  return normaliseGrowthGoal({
    id: row.id,
    name: row.name,
    icon: row.icon,
    frequency: row.frequency || 'Daily',
    targetDays: row.target_days,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    days: row.days || {},
    monthDecisions: row.month_decisions || {}
  });
}
async function loadFreshGrowthGoalsFromSupabase(){
  try{
    const {data,error} = await sb.from('growth_goals').select('*').order('updated_at',{ascending:false});
    if(error){ console.warn('Growth Supabase load fallback:', error.message); growthGoals = loadFreshGrowthGoalsLocal().map(normaliseGrowthGoal); return; }
    if(data && data.length){
      growthGoals = data.map(growthGoalFromRow);
      localStorage.setItem(GROWTH_GOALS_KEY_V2, JSON.stringify(growthGoals));
    } else {
      growthGoals = loadFreshGrowthGoalsLocal().map(normaliseGrowthGoal);
      localStorage.setItem(GROWTH_GOALS_KEY_V2, JSON.stringify(growthGoals));
      if(growthGoals.length) syncFreshGrowthGoalsToSupabase();
    }
    growthSelectedGoalId = growthGoals.find(g => g.status === 'active')?.id || growthGoals[0]?.id || '';
    growthOpenGoalId = growthSelectedGoalId || '';
  }catch(e){ console.warn('Growth load failed:', e); growthGoals = loadFreshGrowthGoalsLocal().map(normaliseGrowthGoal); }
}
function syncFreshGrowthGoalsToSupabase(){
  if(!currentUser || !Array.isArray(growthGoals)) return;
  growthGoals = growthGoals.map(normaliseGrowthGoal);
  localStorage.setItem(GROWTH_GOALS_KEY_V2, JSON.stringify(growthGoals));
  const rows = growthGoals.map(g=>({
    id: String(g.id),
    user_id: currentUser.id,
    name: g.name,
    icon: g.icon,
    frequency: g.frequency || 'Daily',
    target_days: g.targetDays || 12,
    status: g.status || 'active',
    created_at: g.createdAt || new Date().toISOString(),
    completed_at: g.completedAt || null,
    days: g.days || {},
    month_decisions: g.monthDecisions || {},
    updated_at: new Date().toISOString()
  }));
  if(rows.length) sb.from('growth_goals').upsert(rows,{onConflict:'id'}).then(({error})=>{ if(error) console.warn('Growth sync failed:',error.message); });
}
function saveFreshGrowthGoals(){
  localStorage.setItem(GROWTH_GOALS_KEY_V2, JSON.stringify(growthGoals));
  syncFreshGrowthGoalsToSupabase();
}
function activeGrowthGoals(){ return growthGoals.filter(g => g.status !== 'complete'); }
function completedGrowthGoals(){ return growthGoals.filter(g => g.status === 'complete'); }
function freshMonthKey(y = freshGrowthCalView.year, m = freshGrowthCalView.month){ return monthKey(y, m); }
function getFreshSelectedGoal(){ return growthGoals.find(g => g.id === growthSelectedGoalId) || activeGrowthGoals()[0] || growthGoals[0] || null; }
function growthGoalDays(goal, mk = freshMonthKey()){
  if(!goal || !goal.days) return [];
  return Object.keys(goal.days).filter(k => k.startsWith(mk + '-') && goal.days[k]);
}
function uniqueGrowthDaysThisMonth(){
  const mk = monthKey(todayObj.getFullYear(), todayObj.getMonth());
  const days = new Set();
  activeGrowthGoals().forEach(g => growthGoalDays(g, mk).forEach(d => days.add(d)));
  return days.size;
}
function growthDaysInMonth(y = freshGrowthCalView.year, m = freshGrowthCalView.month){ return new Date(y, m + 1, 0).getDate(); }
function growthPct(goal, mk = freshMonthKey()){
  const days = growthGoalDays(goal, mk).length;
  const target = goal?.targetDays || growthDaysInMonth();
  return target ? Math.min(100, Math.round((days / target) * 100)) : 0;
}
function growthBestStreak(goal, y = freshGrowthCalView.year, m = freshGrowthCalView.month){
  const total = growthDaysInMonth(y, m);
  let best = 0, cur = 0;
  for(let d=1; d<=total; d++){
    const key = dayKey(y, m, d);
    if(goal?.days?.[key]){ cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}
function growthCreatedLabel(goal){
  try {
    const dt = new Date(goal.createdAt);
    return `${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
  } catch(e){ return ''; }
}
function growthMonthsRunning(goal){
  try {
    const start = new Date(goal.createdAt);
    const now = new Date(freshGrowthCalView.year, freshGrowthCalView.month, 1);
    return Math.max(1, (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth()) + 1);
  } catch(e){ return 1; }
}
function isGrowthMonthReadyToClose(y = freshGrowthCalView.year, m = freshGrowthCalView.month){
  const now = new Date();
  const selectedMonthStart = new Date(y, m, 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isPastMonth = selectedMonthStart < currentMonthStart;
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return isPastMonth || (isCurrentMonth && now.getDate() >= lastDay - 2);
}
function growthReviewableGoals(){
  const mk = freshMonthKey();
  if(!isGrowthMonthReadyToClose()) return [];
  return activeGrowthGoals().filter(g => !g.monthDecisions?.[mk]);
}
function growthGoalMonthData(goal, endY = freshGrowthCalView.year, endM = freshGrowthCalView.month, count = 12){
  const months = [];
  for(let i=count-1;i>=0;i--){
    let mm = endM - i, yy = endY;
    while(mm < 0){ mm += 12; yy--; }
    const mk = monthKey(yy, mm);
    const days = growthGoalDays(goal, mk).length;
    const target = goal?.targetDays || growthDaysInMonth(yy, mm);
    months.push({ y:yy, m:mm, mk, days, target, pct:target ? Math.min(100, Math.round(days/target*100)) : 0, label:MONTH_SHORT[mm] + (yy !== endY ? ` '${String(yy).slice(2)}` : ''), highlight:yy===endY && mm===endM });
  }
  return months;
}
function growthHasHistory(goal){
  const decisions = Object.values(goal.monthDecisions || {});
  const hasContinued = decisions.includes('continue');
  const loggedMonths = new Set(Object.keys(goal.days || {}).filter(k => goal.days[k]).map(k => k.slice(0,7)));
  return hasContinued || loggedMonths.size >= 2;
}

function openAddGrowthModal(){
  const modal = document.getElementById('growthAddModal');
  if(modal) modal.classList.add('open');
  setTimeout(()=>document.getElementById('growthGoalName')?.focus(), 50);
}
function closeAddGrowthModal(){ document.getElementById('growthAddModal')?.classList.remove('open'); }
function selectedGrowthEmoji(){ return document.querySelector('#growthEmojiPicker .growth-emoji-opt.selected')?.dataset.emoji || '✨'; }
function addGrowthGoal(){
  const nameEl = document.getElementById('growthGoalName');
  const targetEl = document.getElementById('growthGoalTarget');
  const frequencyEl = document.getElementById('growthGoalFrequency');
  const name = (nameEl?.value || '').trim();
  if(!name) return;
  const exists = growthGoals.some(g => g.name.toLowerCase() === name.toLowerCase() && g.status !== 'complete');
  if(exists && !confirm('This habit already exists. Add another one anyway?')) return;
  const target = Math.max(1, Math.min(31, parseInt(targetEl?.value || '12', 10) || 12));
  const goal = normaliseGrowthGoal({
    id: myosUuid(), name, icon:selectedGrowthEmoji(), frequency:frequencyEl?.value || 'Daily', targetDays:target, status:'active', createdAt:new Date().toISOString(), days:{}, monthDecisions:{}
  });
  growthGoals.unshift(goal);
  growthSelectedGoalId = goal.id;
  growthOpenGoalId = goal.id;
  if(nameEl) nameEl.value = '';
  if(targetEl) targetEl.value = '12';
  closeAddGrowthModal();
  saveFreshGrowthGoals(); renderGrowthTrackers(); updateOverview(); showSaved();
}
function selectGrowthGoal(id){ growthSelectedGoalId = id; growthOpenGoalId = id; renderGrowthTrackers(); }
function toggleGrowthCard(id){ growthOpenGoalId = growthOpenGoalId === id ? '' : id; growthSelectedGoalId = id; renderGrowthTrackers(); }
function toggleGrowthDay(key, id){
  const goal = growthGoals.find(g => g.id === id) || getFreshSelectedGoal();
  if(!goal || goal.status === 'complete') return;
  const keyDate = new Date(key + 'T00:00:00');
  const today = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
  if(keyDate > today) return;
  goal.days = goal.days || {};
  goal.days[key] = !goal.days[key];
  if(!goal.days[key]) delete goal.days[key];
  saveFreshGrowthGoals(); renderGrowthTrackers(); updateOverview(); showSaved();
}
function deleteGrowthGoal(id){
  if(!confirm('Delete this habit and its tracked days?')) return;
  growthGoals = growthGoals.filter(g => g.id !== id);
  if(growthSelectedGoalId === id) growthSelectedGoalId = activeGrowthGoals()[0]?.id || growthGoals[0]?.id || '';
  if(growthOpenGoalId === id) growthOpenGoalId = growthSelectedGoalId;
  if(currentUser) sb.from('growth_goals').delete().eq('id', String(id));
  saveFreshGrowthGoals(); renderGrowthTrackers(); updateOverview(); showSaved();
}
function markGrowthComplete(id){
  const goal = growthGoals.find(g => g.id === id);
  if(!goal) return;
  const mk = freshMonthKey();
  goal.status = 'complete';
  goal.completedAt = new Date().toISOString();
  goal.monthDecisions = goal.monthDecisions || {};
  goal.monthDecisions[mk] = 'complete';
  if(growthSelectedGoalId === id) growthSelectedGoalId = activeGrowthGoals()[0]?.id || growthGoals[0]?.id || '';
  if(growthOpenGoalId === id) growthOpenGoalId = growthSelectedGoalId;
  closeGrowthReport(); saveFreshGrowthGoals(); renderGrowthTrackers(); updateOverview(); showSaved();
}
function continueGrowthGoal(id){
  const goal = growthGoals.find(g => g.id === id);
  if(!goal) return;
  const mk = freshMonthKey();
  goal.monthDecisions = goal.monthDecisions || {};
  goal.monthDecisions[mk] = 'continue';
  closeGrowthReport(); saveFreshGrowthGoals(); renderGrowthTrackers(); showSaved();
}
function reopenGrowthGoal(id){
  const goal = growthGoals.find(g => g.id === id);
  if(!goal) return;
  goal.status = 'active'; goal.completedAt = '';
  growthSelectedGoalId = id; growthOpenGoalId = id;
  saveFreshGrowthGoals(); renderGrowthTrackers(); updateOverview(); showSaved();
}
function openFirstGrowthReport(){ const first = growthReviewableGoals()[0] || getFreshSelectedGoal(); if(first) openGrowthReport(first.id); }
function openGrowthReport(id){
  const goal = growthGoals.find(g => g.id === id);
  const el = document.getElementById('growthReportContent');
  if(!goal || !el) return;
  const mk = freshMonthKey();
  const days = growthGoalDays(goal, mk).length;
  const target = goal.targetDays || growthDaysInMonth();
  const pct = target ? Math.min(100, Math.round(days/target*100)) : 0;
  const months = growthGoalMonthData(goal, freshGrowthCalView.year, freshGrowthCalView.month, 3);
  const prev = months[months.length-2];
  const avg = Math.round(months.reduce((s,m)=>s+m.pct,0) / Math.max(1, months.filter(m=>m.days>0).length || months.length));
  const monthLabel = `${MONTH_NAMES[freshGrowthCalView.month]} ${freshGrowthCalView.year}`;
  const decision = goal.monthDecisions?.[mk];
  el.innerHTML = `<div class="growth-report-header">
      <div class="growth-report-icon-big">${escapeHtml(goal.icon || '✨')}</div>
      <div><div class="growth-report-heading">${escapeHtml(goal.name)} — ${monthLabel}</div><div class="growth-report-subhead">Month ${growthMonthsRunning(goal)} of this habit</div></div>
    </div>
    <div class="growth-report-big-stat"><div class="growth-report-pct-num">${pct}%</div><div class="growth-report-pct-label">${days} out of ${target} target days completed</div></div>
    <div class="growth-report-stats-row">
      <div class="growth-report-stat-box"><div class="growth-report-stat-val">🔥 ${growthBestStreak(goal)}</div><div class="growth-report-stat-lbl">Best streak</div></div>
      <div class="growth-report-stat-box"><div class="growth-report-stat-val" style="color:var(--green)">${prev ? prev.pct + '%' : '—'}</div><div class="growth-report-stat-lbl">Last month</div></div>
      <div class="growth-report-stat-box"><div class="growth-report-stat-val" style="color:var(--muted)">${avg ? avg + '%' : '—'}</div><div class="growth-report-stat-lbl">Recent avg</div></div>
    </div>
    ${decision ? `<div class="card-sub" style="margin-bottom:12px;">Decision recorded: <strong>${decision === 'continue' ? 'Continue next month' : 'Complete'}</strong>.</div>` : `<div class="growth-report-decision-label">What would you like to do?</div>
    <div class="growth-decision-btns">
      <div class="growth-decision-btn complete" onclick="markGrowthComplete('${goal.id}')"><div class="growth-decision-icon">✅</div><div class="growth-decision-title">Complete</div><div class="growth-decision-desc">Archive this habit as done</div></div>
      <div class="growth-decision-btn" onclick="continueGrowthGoal('${goal.id}')"><div class="growth-decision-icon">🔄</div><div class="growth-decision-title">Continue</div><div class="growth-decision-desc">Carry on into next month</div></div>
    </div>`}`;
  document.getElementById('growthReportModal')?.classList.add('open');
}
function closeGrowthReport(){ document.getElementById('growthReportModal')?.classList.remove('open'); }

function renderGrowthHeatmap(goal){
  const y = freshGrowthCalView.year, m = freshGrowthCalView.month;
  const today = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
  const firstDay = new Date(y, m, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const total = growthDaysInMonth(y, m);
  let html = ['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>`<div class="growth-heatmap-day-label">${d}</div>`).join('');
  for(let i=0;i<offset;i++) html += '<div class="growth-heatmap-cell empty"></div>';
  for(let d=1; d<=total; d++){
    const key = dayKey(y,m,d);
    const keyDate = new Date(y,m,d);
    const isFuture = keyDate > today;
    const done = !!goal.days?.[key];
    const isToday = todayObj.getFullYear()===y && todayObj.getMonth()===m && todayObj.getDate()===d;
    html += `<div class="growth-heatmap-cell ${done?'done':''} ${isToday?'today':''} ${isFuture?'future':''}" title="${MONTH_NAMES[m]} ${d}" ${isFuture?'':`onclick="toggleGrowthDay('${key}','${goal.id}')"`}>${d}</div>`;
  }
  return html;
}
function renderGrowthMonthHistory(goal){
  if(!growthHasHistory(goal)) return '';
  const months = growthGoalMonthData(goal, freshGrowthCalView.year, freshGrowthCalView.month, 6).filter(m => m.days > 0 || m.highlight || goal.monthDecisions?.[m.mk]);
  if(!months.length) return '';
  return `<div class="growth-month-history"><div class="growth-heatmap-title" style="margin-bottom:10px;">Month-by-month progress</div>${months.map(m=>`<div class="growth-history-row"><div class="growth-history-month">${m.label}</div><div class="growth-history-bar-bg"><div class="growth-history-bar-fill" style="width:${m.pct}%;${m.highlight?'background:var(--blue)':''}"></div></div><div class="growth-history-pct" ${m.highlight?'style="color:var(--blue)"':''}>${m.pct}%</div></div>`).join('')}</div>`;
}
function renderGrowthCard(goal){
  const mk = freshMonthKey();
  const days = growthGoalDays(goal, mk).length;
  const target = goal.targetDays || growthDaysInMonth();
  const pct = target ? Math.min(100, Math.round(days/target*100)) : 0;
  const missed = Math.max(0, Math.min(growthDaysInMonth(), new Date().getDate()) - days);
  const best = growthBestStreak(goal);
  const running = growthMonthsRunning(goal);
  const isOpen = growthOpenGoalId === goal.id;
  const canReport = isGrowthMonthReadyToClose() || goal.monthDecisions?.[mk];
  return `<div class="growth-habit-card ${isOpen?'open':''}" id="growth-card-${goal.id}">
    <div class="growth-habit-header" onclick="toggleGrowthCard('${goal.id}')">
      <div class="growth-habit-icon">${escapeHtml(goal.icon || '✨')}</div>
      <div class="growth-habit-title-block"><div class="growth-habit-name">${escapeHtml(goal.name)}</div><div class="growth-habit-meta">${escapeHtml(goal.frequency || 'Daily')} · Started ${growthCreatedLabel(goal)} ${running>1?`· <span class="growth-ongoing-badge">${running} months running</span>`:''}</div></div>
      <div class="growth-streak">🔥 ${best}</div><div class="growth-habit-pct">${pct}%</div><div class="growth-chevron">▼</div>
    </div>
    <div class="growth-habit-body">
      <div class="growth-body-grid">
        <div class="growth-heatmap-panel">
          <div class="growth-heatmap-head"><div class="growth-heatmap-title">${MONTH_NAMES[freshGrowthCalView.month]} ${freshGrowthCalView.year}</div></div>
          <div class="growth-heatmap">${renderGrowthHeatmap(goal)}</div>
        </div>
        <div class="growth-side-panel">
          <div class="growth-habit-stats"><div class="growth-stat-box"><div class="growth-stat-val">${days}</div><div class="growth-stat-lbl">days done</div></div><div class="growth-stat-box"><div class="growth-stat-val">${Math.max(0,target-days)}</div><div class="growth-stat-lbl">to target</div></div><div class="growth-stat-box"><div class="growth-stat-val">${best}</div><div class="growth-stat-lbl">best streak</div></div></div>
          ${renderGrowthMonthHistory(goal)}
          <div class="growth-habit-actions">${canReport?`<button class="growth-btn growth-btn-ghost growth-btn-sm" onclick="event.stopPropagation();openGrowthReport('${goal.id}')">📊 Monthly report</button>`:''}<button class="growth-btn growth-btn-ghost growth-btn-sm growth-danger" onclick="event.stopPropagation();deleteGrowthGoal('${goal.id}')">🗑 Delete</button></div>
        </div>
      </div>
    </div>
  </div>`;
}
function renderGrowthTrackers(){
  growthGoals = growthGoals.map(normaliseGrowthGoal);
  const active = activeGrowthGoals();
  const completed = completedGrowthGoals();
  if(!growthSelectedGoalId && active.length) growthSelectedGoalId = active[0].id;
  if(!growthOpenGoalId && active.length) growthOpenGoalId = active[0].id;
  const activeCount = document.getElementById('growth-active-count'); if(activeCount) activeCount.textContent = active.length;
  const monthDays = document.getElementById('growth-month-days'); if(monthDays) monthDays.textContent = uniqueGrowthDaysThisMonth();
  const completeCount = document.getElementById('growth-complete-count'); if(completeCount) completeCount.textContent = completed.length;
  const empty = document.getElementById('growthEmptyState'); if(empty) empty.style.display = growthGoals.length ? 'none' : 'block';
  const list = document.getElementById('growthHabitList'); if(list) list.innerHTML = active.map(renderGrowthCard).join('');
  const completedSection = document.getElementById('growthCompletedSection');
  const completedList = document.getElementById('growthCompletedList');
  if(completedSection && completedList){
    completedSection.style.display = completed.length ? 'block' : 'none';
    completedList.innerHTML = completed.map(g => {
      const allDays = Object.keys(g.days || {}).filter(k => g.days[k]).length;
      const months = new Set(Object.keys(g.days || {}).filter(k => g.days[k]).map(k => k.slice(0,7))).size;
      return `<div class="growth-completed-card"><div style="font-size:22px">${escapeHtml(g.icon || '✨')}</div><div class="growth-completed-info"><div class="growth-completed-name">${escapeHtml(g.name)}</div><div class="growth-completed-detail">Completed ${g.completedAt ? new Date(g.completedAt).toLocaleDateString('en-AU',{month:'short',year:'numeric'}) : ''} · ${allDays} tracked days · ${months} month${months===1?'':'s'}</div></div><button class="growth-btn growth-btn-ghost growth-btn-sm" onclick="reopenGrowthGoal('${g.id}')">Reopen</button><div class="growth-completed-badge">✓ DONE</div></div>`;
    }).join('');
  }
  renderGrowthEomBanner();
}
function renderGrowthEomBanner(){
  const banner = document.getElementById('growthEomBanner');
  if(!banner) return;
  const reviewable = growthReviewableGoals();
  if(!reviewable.length){ banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const title = document.getElementById('growthEomTitle');
  const sub = document.getElementById('growthEomSub');
  if(title) title.textContent = `${MONTH_NAMES[freshGrowthCalView.month]} is wrapping up — review your habits`;
  if(sub) sub.textContent = `${reviewable.length} habit${reviewable.length===1?'':'s'} ready for end-of-month review. Decide to complete or carry on.`;
}

// Modal helpers/listeners
function setupGrowthUiListeners(){
  document.querySelectorAll('.growth-modal-overlay').forEach(el => {
    if(el.dataset.ready) return;
    el.dataset.ready = '1';
    el.addEventListener('click', e => { if(e.target === el) el.classList.remove('open'); });
  });
  document.querySelectorAll('.growth-emoji-opt').forEach(opt => {
    if(opt.dataset.ready) return;
    opt.dataset.ready = '1';
    opt.addEventListener('click', () => {
      opt.closest('.growth-emoji-picker').querySelectorAll('.growth-emoji-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
  const input = document.getElementById('growthGoalName');
  if(input && !input.dataset.ready){ input.dataset.ready='1'; input.addEventListener('keydown', e => { if(e.key === 'Enter') addGrowthGoal(); }); }
}

// Legacy no-op overrides so old Reading/Piano modules do not appear.
function renderBooks(){}
function updateReadCalBookSelect(){}
function buildReadCal(){}
function renderReadReports(){}
function renderPiano(){}
function switchGrowth(){ renderGrowthTrackers(); }

function updateOverview(){
  const done=state.goals.filter(g=>g.done).length,total=state.goals.length;
  const ovGoals = document.getElementById('ov-goals');
  if(ovGoals) ovGoals.innerHTML=`${done}<span style="font-size:18px;color:var(--muted)">/${total}</span>`;
  const ovGoalBar = document.getElementById('ov-goal-bar');
  if(ovGoalBar) ovGoalBar.innerHTML=(state.goals.length?state.goals:[{}]).map(g=>`<div class="streak-seg ${g.done?'on':''}"></div>`).join('');

  const y=todayObj.getFullYear(),m=todayObj.getMonth();
  const prefix=monthKey(y,m)+'-';
  const monthCount=Object.keys(state.fitnessHeatmap).filter(k=>k.startsWith(prefix)&&state.fitnessHeatmap[k]).length;
  const goal=state.fitGoals[monthKey(y,m)];
  const ovWorkouts = document.getElementById('ov-workouts');
  if(ovWorkouts) ovWorkouts.textContent=monthCount;
  const ovWorkoutSub = document.getElementById('ov-workout-sub');
  if(ovWorkoutSub) ovWorkoutSub.textContent=goal?`of ${goal} goal`:'sessions this month';

  const curMk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  const curMkTxs=state.transactions.filter(t=>t.monthKey===curMk);
  const income=curMkTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=curMkTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  const balEl=document.getElementById('ov-balance');
  if(balEl){ balEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2); balEl.style.color=net>=0?'var(--green)':'var(--pink)'; }

  const focus = document.getElementById('ov-growth-focus');
  if(focus){
    const active = activeGrowthGoals();
    focus.innerHTML = active.length ? active.slice(0,3).map(g=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><span>${escapeHtml(g.icon || '✨')}</span><span style="color:var(--text);font-weight:500;font-size:13px;">${escapeHtml(g.name)}</span></div>`).join('') + (active.length>3?`<div style="font-size:11px;color:var(--muted);">+${active.length-3} more</div>`:'') : '<span style="font-style:italic;font-size:13px;">No growth habits yet</span>';
  }
  const growthMonth = document.getElementById('ov-growth-month');
  if(growthMonth){
    const days = uniqueGrowthDaysThisMonth();
    const active = activeGrowthGoals().length;
    growthMonth.innerHTML = days ? `<strong style="color:var(--purple);font-size:16px;">${days}</strong> day${days===1?'':'s'} tracked across ${active} active habit${active===1?'':'s'}` : '<span style="font-style:italic;font-size:13px;">No days tracked yet</span>';
  }
  const streak=Object.values(state.fitnessHeatmap).filter(Boolean).length;
  const streakPill = document.getElementById('streakPill');
  if(streakPill) streakPill.textContent=`🔥 ${streak} day streak`;
}

// Boot after all overrides are loaded.
const originalBoot = boot;
boot = async function(){
  await originalBoot();
  setupGrowthUiListeners();
  renderGrowthTrackers();
  updateOverview();
};
boot();


// ─── WORK TAB: MEETING LOG ───
let workViewYear = todayObj.getFullYear();
let workViewMonth = todayObj.getMonth();
let workSelectedDate = dayKey(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
let workEditingMeetingId = '';

function workDateKeyFromInput(v){ return v || workSelectedDate || dayKey(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate()); }
function workWeekdayLabel(dateKey){
  if(!dateKey) return '';
  const d=new Date(dateKey+'T00:00:00');
  if(Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU',{weekday:'short'});
}
function workDueLabel(f){
  if(!f?.due_date) return 'No due date';
  return `${workWeekdayLabel(f.due_date)} · ${f.due_date}`;
}
function workMeetingDateKey(m){ return m.meeting_date || m.date || ''; }
function workMeetingTitle(m){ return escapeHtml(m.title || 'Untitled meeting'); }
function workMeetingProject(m){ return escapeHtml(m.project || m.topic || ''); }
function workMeetingPeople(m){ return escapeHtml(m.people || ''); }
function workActiveFollowupStatuses(){ return ['Open','Waiting','Carry next week']; }
function workIsActiveFollowupStatus(status){ return workActiveFollowupStatuses().includes(status || 'Open'); }
function syncWorkViewToDate(dateKey){
  if(!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
  const [y,m]=dateKey.split('-').map(Number);
  workViewYear=y; workViewMonth=m-1;
}
function workStatusClass(status){
  const s=String(status||'Open').toLowerCase();
  if(s.includes('wait')||s.includes('carry')) return 'waiting';
  if(s.includes('done')) return 'done';
  if(s.includes('drop')) return 'dropped';
  return '';
}
function normaliseWorkMeeting(m){
  return {
    id: isUuidLike(m.id) ? String(m.id) : myosUuid(),
    title: m.title || 'Untitled meeting',
    meeting_date: m.meeting_date || m.date || workSelectedDate,
    project: m.project || '',
    people: m.people || '',
    meeting_type: m.meeting_type || m.type || 'Meeting',
    note_html: m.note_html || '',
    textboxes: Array.isArray(m.textboxes) ? m.textboxes : [],
    followups: Array.isArray(m.followups) ? m.followups.map(f=>({
      text: f.text || '',
      status: f.status || 'Open',
      due_date: f.due_date || f.date || '',
      weekday: f.weekday || workWeekdayLabel(f.due_date || f.date || '')
    })) : [],
    created_at: m.created_at || new Date().toISOString(),
    updated_at: m.updated_at || new Date().toISOString()
  };
}

async function loadWorkMeetings(){
  try{
    const {data,error}=await sb.from('work_meetings').select('*').order('meeting_date',{ascending:false});
    if(error){ console.warn('Work meetings load failed:', error.message); state.workMeetings=[]; return; }
    state.workMeetings=(data||[]).map(normaliseWorkMeeting);
  }catch(e){ console.warn('Work meetings load failed:', e); state.workMeetings=[]; }
}

function renderWorkTab(){
  if(!document.getElementById('panel-work')) return;
  renderWorkSummary(); renderWorkCalendar(); renderWorkSelectedDay(); renderWorkWeeklyReview(false);
}
function renderWorkSummary(){
  const mk=monthKey(workViewYear, workViewMonth);
  const meetings=(state.workMeetings||[]).filter(m=>workMeetingDateKey(m).startsWith(mk));
  const followups=meetings.flatMap(m=>(m.followups||[])).filter(f=>workIsActiveFollowupStatus(f.status));
  const wc=document.getElementById('work-meeting-count'); if(wc) wc.textContent=meetings.length;
  const fc=document.getElementById('work-followup-count'); if(fc) fc.textContent=followups.length;
  const nc=document.getElementById('work-note-count'); if(nc) nc.textContent=meetings.filter(m=>stripHtml(m.note_html||'').trim() || (m.textboxes||[]).length).length;
}
function stripHtml(html){ const div=document.createElement('div'); div.innerHTML=html||''; return div.textContent||div.innerText||''; }
function workPrevMonth(){ workViewMonth--; if(workViewMonth<0){workViewMonth=11;workViewYear--;} renderWorkTab(); }
function workNextMonth(){ workViewMonth++; if(workViewMonth>11){workViewMonth=0;workViewYear++;} renderWorkTab(); }
function renderWorkCalendar(){
  const el=document.getElementById('work-calendar'); if(!el) return;
  const label=document.getElementById('work-month-label'); if(label) label.textContent=`${MONTH_NAMES[workViewMonth]} ${workViewYear}`;
  const first=new Date(workViewYear,workViewMonth,1); const days=new Date(workViewYear,workViewMonth+1,0).getDate();
  const start=(first.getDay()+6)%7;
  const labels=['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>`<div class="work-cal-label">${d}</div>`).join('');
  let html=labels;
  for(let i=0;i<start;i++) html+='<div class="work-day empty"></div>';
  for(let d=1;d<=days;d++){
    const key=dayKey(workViewYear,workViewMonth,d);
    const meetings=(state.workMeetings||[]).filter(m=>workMeetingDateKey(m)===key);
    const pills=meetings.slice(0,2).map(m=>`<span class="work-event-pill">${workMeetingTitle(m)}</span>`).join('')+(meetings.length>2?`<span class="work-event-pill more">+${meetings.length-2} more</span>`:'');
    html+=`<div class="work-day ${key===workSelectedDate?'selected':''}" onclick="selectWorkDate('${key}')"><div class="work-day-num">${d}</div>${pills}</div>`;
  }
  el.innerHTML=html;
}
function selectWorkDate(key){ workSelectedDate=key; renderWorkCalendar(); renderWorkSelectedDay(); }
function renderWorkSelectedDay(){
  const title=document.getElementById('work-selected-title'); if(title) title.textContent=`Selected day — ${workSelectedDate}`;
  const list=document.getElementById('work-day-meetings'); if(!list) return;
  const meetings=(state.workMeetings||[]).filter(m=>workMeetingDateKey(m)===workSelectedDate).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  if(!meetings.length){ list.innerHTML=`<div class="card-sub">No meetings logged for this date.</div><button class="btn btn-ghost btn-small" onclick="openAddWorkMeetingModal('${workSelectedDate}')">＋ Log meeting for this day</button>`; return; }
  list.innerHTML=meetings.map(m=>{
    const open=(m.followups||[]).filter(f=>workIsActiveFollowupStatus(f.status)).length;
    return `<div class="work-meeting-item"><div class="work-meeting-head"><div><div class="work-meeting-title">${workMeetingTitle(m)}</div><div class="work-meeting-meta">${workMeetingProject(m)}${workMeetingPeople(m)?' · '+workMeetingPeople(m):''}</div></div><span class="work-note-type">${escapeHtml(m.meeting_type||'Meeting')}</span></div><div class="card-sub">${open?`${open} open follow-up${open===1?'':'s'}`:'No open follow-ups'}</div><div class="work-meeting-actions"><button class="btn btn-ghost btn-small" onclick="openWorkMeeting('${m.id}')">Open →</button><button class="btn btn-ghost btn-small" onclick="deleteWorkMeeting('${m.id}')">Delete</button></div></div>`;
  }).join('');
}
let workReviewActiveTab = 'meetings';
function workWeekData(){
  const now=new Date();
  const day=(now.getDay()+6)%7;
  const monday=new Date(now); monday.setDate(now.getDate()-day); monday.setHours(0,0,0,0);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  const inWeek=(m)=>{ const dt=new Date(workMeetingDateKey(m)+'T00:00:00'); return dt>=monday && dt<=sunday; };
  const meetings=(state.workMeetings||[]).filter(inWeek).sort((a,b)=>String(workMeetingDateKey(a)).localeCompare(String(workMeetingDateKey(b))));
  const followups=meetings.flatMap(m=>(m.followups||[]).map((f,i)=>({
    ...f,
    index:i,
    meetingId:m.id,
    meeting:m.title,
    project:m.project || '',
    meetingDate:workMeetingDateKey(m),
    due_date:f.due_date || '',
    weekday:f.weekday || workWeekdayLabel(f.due_date || '')
  }))).filter(f=>workIsActiveFollowupStatus(f.status));
  const carry=followups.filter(f=>(f.status||'')==='Carry next week');
  return {meetings, followups, carry};
}
function renderWorkWeeklyReview(tab='meetings'){
  const el=document.getElementById('work-weekly-review'); if(!el) return;
  if(typeof tab === 'boolean') tab = workReviewActiveTab || 'meetings';
  workReviewActiveTab = tab || 'meetings';
  const {meetings, followups, carry}=workWeekData();
  el.className='work-review-shell';
  const active=(name)=>workReviewActiveTab===name?'active':'';
  const content=renderWorkReviewContent(workReviewActiveTab, meetings, followups, carry);
  el.innerHTML=`
    <div class="work-review-tabs">
      <button class="work-review-tab ${active('meetings')}" onclick="renderWorkWeeklyReview('meetings')">
        <div class="work-review-count" style="color:var(--blue)">${meetings.length}</div>
        <h4>Meetings logged</h4>
        <p>Review what happened this week.</p>
      </button>
      <button class="work-review-tab ${active('followups')}" onclick="renderWorkWeeklyReview('followups')">
        <div class="work-review-count" style="color:var(--orange)">${followups.length}</div>
        <h4>Open follow-ups</h4>
        <p>Decide done, waiting, carry or drop.</p>
      </button>
      <button class="work-review-tab ${active('focus')}" onclick="renderWorkWeeklyReview('focus')">
        <div class="work-review-count" style="color:var(--purple)">${carry.length || Math.min(followups.length,3)}</div>
        <h4>Next week focus</h4>
        <p>Choose what needs attention next.</p>
      </button>
    </div>
    <div class="work-review-content">${content}</div>`;
}
function renderWorkReviewContent(tab, meetings, followups, carry){
  if(tab==='followups'){
    if(!followups.length) return '<div class="card-sub">No open follow-ups this week. Nice clean loop.</div>';
    return `<div class="work-review-list">${followups.map(f=>`
      <div class="work-review-item touch-friendly">
        <div class="work-review-main">
          <div style="font-weight:700;">${escapeHtml(f.text||'Follow-up')} <span class="work-status-pill ${workStatusClass(f.status)}">${escapeHtml(f.status||'Open')}</span></div>
          <div class="work-review-meta">${escapeHtml(f.meeting||'Meeting')} · ${escapeHtml(f.project||'')} · Meeting ${escapeHtml(f.meetingDate||'')} · Due ${escapeHtml(workDueLabel(f))}</div>
        </div>
        <div class="work-review-actions">
          <button class="mini-action done" onclick="workUpdateFollowupStatus('${f.meetingId}',${f.index},'Done')">Done</button>
          <button class="mini-action wait" onclick="workUpdateFollowupStatus('${f.meetingId}',${f.index},'Waiting')">Waiting</button>
          <button class="mini-action carry" onclick="workUpdateFollowupStatus('${f.meetingId}',${f.index},'Carry next week')">Carry</button>
          <button class="mini-action drop" onclick="workUpdateFollowupStatus('${f.meetingId}',${f.index},'Dropped')">Drop</button>
        </div>
      </div>`).join('')}</div>`;
  }
  if(tab==='focus'){
    const focusItems=(carry.length?carry:followups.slice(0,3));
    const focusList=focusItems.length ? focusItems.map(f=>`<li><strong>${escapeHtml(f.text||'Follow-up')}</strong><br><span>${escapeHtml(f.meeting||'Meeting')} · ${escapeHtml(f.status||'Open')} · Due ${escapeHtml(workDueLabel(f))}</span></li>`).join('') : '<li>No focus items selected yet.</li>';
    return `<div class="work-focus-grid">
      <div class="work-focus-box"><h4>Suggested next week focus</h4><ul>${focusList}</ul></div>
      <div class="work-focus-box"><h4>Your reflection</h4><textarea class="work-review-note" placeholder="What needs to move next week? What can wait?"></textarea></div>
    </div>`;
  }
  if(!meetings.length) return '<div class="card-sub">No meetings logged this week yet.</div>';
  return `<div class="work-review-list">${meetings.map(m=>{
    const open=(m.followups||[]).filter(f=>workIsActiveFollowupStatus(f.status)).length;
    const note=stripHtml(m.note_html||'').trim();
    return `<div class="work-review-item touch-friendly">
      <div class="work-review-dot" style="background:var(--blue)"></div>
      <div class="work-review-main">
        <div class="work-review-title">${workMeetingTitle(m)}</div>
        <div class="work-review-meta">${escapeHtml(workMeetingDateKey(m))}${workMeetingProject(m)?' · '+workMeetingProject(m):''}${workMeetingPeople(m)?' · '+workMeetingPeople(m):''}</div>
        <div class="card-sub" style="margin-top:5px">${note?escapeHtml(note.slice(0,120))+(note.length>120?'…':''):'No note summary yet.'}</div>
      </div>
      <div class="work-review-actions"><button class="btn btn-ghost btn-small" onclick="openWorkMeeting('${m.id}')">Open →</button>${open?`<span class="work-status-pill waiting">${open} open</span>`:''}</div>
    </div>`;
  }).join('')}</div>`;
}
function openAddWorkMeetingModal(dateKey=''){
  workEditingMeetingId='';
  document.getElementById('work-modal-title').textContent='Add meeting';
  document.getElementById('workMeetingId').value='';
  document.getElementById('workMeetingTitle').value='';
  document.getElementById('workMeetingDate').value=workDateKeyFromInput(dateKey);
  document.getElementById('workMeetingProject').value='';
  document.getElementById('workMeetingPeople').value='';
  document.getElementById('workMeetingType').value='Meeting';
  document.getElementById('workNoteEditor').innerHTML='';
  document.querySelectorAll('#workPaperArea .floating-textbox').forEach(b=>b.remove());
  document.getElementById('workFollowRows').innerHTML='';
  workAddFollowupRow('', 'Open', '');
  document.getElementById('workMeetingModal').classList.add('open');
  setTimeout(()=>document.getElementById('workMeetingTitle')?.focus(),50);
}
function openWorkMeeting(id){
  const m=(state.workMeetings||[]).find(x=>String(x.id)===String(id)); if(!m) return;
  workEditingMeetingId=String(id);
  document.getElementById('work-modal-title').textContent='Edit meeting';
  document.getElementById('workMeetingId').value=m.id;
  document.getElementById('workMeetingTitle').value=m.title||'';
  document.getElementById('workMeetingDate').value=workMeetingDateKey(m);
  document.getElementById('workMeetingProject').value=m.project||'';
  document.getElementById('workMeetingPeople').value=m.people||'';
  document.getElementById('workMeetingType').value=m.meeting_type||'Meeting';
  document.getElementById('workNoteEditor').innerHTML=m.note_html||'';
  const paper=document.getElementById('workPaperArea'); paper.querySelectorAll('.floating-textbox').forEach(b=>b.remove());
  (m.textboxes||[]).forEach(tb=>workCreateTextbox(tb.html||'Text box', tb.left||40, tb.top||120, tb.width||180, tb.height||80));
  document.getElementById('workFollowRows').innerHTML='';
  (m.followups&&m.followups.length?m.followups:[{text:'',status:'Open',due_date:''}]).forEach(f=>workAddFollowupRow(f.text||'', f.status||'Open', f.due_date||''));
  document.getElementById('workMeetingModal').classList.add('open');
}
function closeWorkMeetingModal(){ document.getElementById('workMeetingModal')?.classList.remove('open'); }
function workClearNote(){
  const editor=document.getElementById('workNoteEditor');
  const boxes=[...document.querySelectorAll('#workPaperArea .floating-textbox')];
  const hasNote=!!(editor?.textContent||'').trim() || boxes.length>0;
  if(!hasNote) return;
  if(!confirm('Clear the meeting note and text boxes? Follow-ups will stay.')) return;
  if(editor) editor.innerHTML='';
  boxes.forEach(b=>b.remove());
}
function workAddFollowupRow(text='', status='Open', dueDate=''){
  const wrap=document.getElementById('workFollowRows'); if(!wrap) return;
  const row=document.createElement('div'); row.className='follow-row';
  const weekday=workWeekdayLabel(dueDate);
  row.innerHTML=`<input class="input work-follow-text" value="${escapeAttr(text)}" placeholder="Follow-up item"><select class="input work-follow-status"><option value="Open" ${status==='Open'?'selected':''}>Open →</option><option value="Waiting" ${status==='Waiting'?'selected':''}>Waiting</option><option value="Carry next week" ${status==='Carry next week'?'selected':''}>Carry next week</option><option value="Done" ${status==='Done'?'selected':''}>Done</option><option value="Dropped" ${status==='Dropped'?'selected':''}>Dropped</option></select><input class="input work-follow-date" type="date" value="${escapeAttr(dueDate)}" onchange="workRefreshFollowupWeekday(this)"><div class="work-follow-weekday">${weekday||'No date'}</div><button class="btn btn-ghost btn-small" onclick="this.closest('.follow-row').remove()">Remove</button>`;
  wrap.appendChild(row);
}
function workRefreshFollowupWeekday(input){
  const row=input.closest('.follow-row');
  const label=row?.querySelector('.work-follow-weekday');
  if(label) label.textContent=workWeekdayLabel(input.value)||'No date';
}
function escapeAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function collectWorkFollowups(){ return [...document.querySelectorAll('#workFollowRows .follow-row')].map(r=>{
  const dueDate=r.querySelector('.work-follow-date')?.value||'';
  return {
    text:r.querySelector('.work-follow-text')?.value.trim()||'',
    status:r.querySelector('.work-follow-status')?.value||'Open',
    due_date:dueDate,
    weekday:workWeekdayLabel(dueDate)
  };
}).filter(f=>f.text); }
function collectWorkTextboxes(){ return [...document.querySelectorAll('#workPaperArea .floating-textbox')].map(b=>({left:parseFloat(b.style.left)||0, top:parseFloat(b.style.top)||0, width:parseFloat(b.style.width)||b.offsetWidth||180, height:parseFloat(b.style.height)||b.offsetHeight||80, html:b.querySelector('.textbox-content')?.innerHTML||b.innerHTML||''})); }
async function saveWorkMeeting(){
  const title=document.getElementById('workMeetingTitle').value.trim();
  const date=document.getElementById('workMeetingDate').value;
  if(!title||!date){ alert('Meeting title and date are required.'); return; }
  if(!currentUser?.id){ alert('Please log in again before saving a meeting.'); return; }

  const payload={
    user_id: currentUser.id,
    title,
    meeting_date: date,
    project: document.getElementById('workMeetingProject').value.trim(),
    people: document.getElementById('workMeetingPeople').value.trim(),
    meeting_type: document.getElementById('workMeetingType').value,
    note_html: document.getElementById('workNoteEditor').innerHTML,
    textboxes: collectWorkTextboxes(),
    followups: collectWorkFollowups(),
    updated_at: new Date().toISOString()
  };

  let data, error;
  if(workEditingMeetingId){
    ({data,error}=await sb.from('work_meetings')
      .update(payload)
      .eq('id', String(workEditingMeetingId))
      .eq('user_id', currentUser.id)
      .select()
      .single());
  } else {
    ({data,error}=await sb.from('work_meetings')
      .insert(payload)
      .select()
      .single());
  }

  if(error){ console.error(error); alert('Could not save meeting: '+error.message); return; }
  const saved=normaliseWorkMeeting(data || payload);
  const existing=state.workMeetings.findIndex(m=>String(m.id)===String(saved.id));
  if(existing>=0) state.workMeetings[existing]=saved; else state.workMeetings.unshift(saved);
  workSelectedDate=date; syncWorkViewToDate(date); workEditingMeetingId=''; closeWorkMeetingModal(); renderWorkTab(); showSaved();
}
async function deleteWorkMeeting(id){
  if(!confirm('Delete this meeting?')) return;
  const {error}=await sb.from('work_meetings').delete().eq('id',String(id));
  if(error){ console.error(error); alert('Could not delete meeting: '+error.message); return; }
  state.workMeetings=state.workMeetings.filter(m=>String(m.id)!==String(id)); renderWorkTab(); showSaved();
}
function workGetNoteSelectionRange(){ const editor=document.getElementById('workNoteEditor'); const sel=window.getSelection(); if(!sel||sel.rangeCount===0||sel.toString().trim()==='') return null; const range=sel.getRangeAt(0); if(!editor||!editor.contains(range.commonAncestorContainer)) return null; return range; }
function workHighlightSelection(){ const range=workGetNoteSelectionRange(); if(!range){ alert('Select text inside the meeting note first, then tap Highlight.'); return; } const mark=document.createElement('mark'); mark.className='note-highlight'; try{ const selected=range.extractContents(); mark.appendChild(selected); range.insertNode(mark); window.getSelection().removeAllRanges(); }catch(e){ console.warn(e); } }
function workRemoveHighlight(){ const editor=document.getElementById('workNoteEditor'); const sel=window.getSelection(); if(sel&&sel.rangeCount>0&&sel.toString().trim()!==''){ const range=sel.getRangeAt(0); [...editor.querySelectorAll('.note-highlight')].forEach(mark=>{ if(range.intersectsNode(mark)) workUnwrapHighlight(mark); }); sel.removeAllRanges(); return; } alert('Select highlighted text first, then tap Remove highlight.'); }
function workUnwrapHighlight(mark){ const p=mark.parentNode; while(mark.firstChild) p.insertBefore(mark.firstChild,mark); p.removeChild(mark); p.normalize(); }
function workAddTextbox(){ workCreateTextbox('New movable note', 40 + Math.random()*80, 120 + Math.random()*70, 180, 80); }
function workCreateTextbox(html,left,top,width=180,height=80){
  const paper=document.getElementById('workPaperArea');
  const box=document.createElement('div');
  box.className='floating-textbox';
  box.style.left=left+'px';
  box.style.top=top+'px';
  box.style.width=width+'px';
  box.style.height=height+'px';
  box.innerHTML=`<div class="drag-handle" contenteditable="false">move</div><div class="textbox-content" contenteditable="true">${html}</div><div class="resize-handle" contenteditable="false" title="Resize"></div>`;
  paper.appendChild(box);
  workMakeDraggable(box);
  workMakeResizable(box);
  return box;
}
function workMakeDraggable(box){
  const handle=box.querySelector('.drag-handle');
  let startX,startY,startLeft,startTop,dragging=false;
  handle.addEventListener('pointerdown',e=>{
    e.preventDefault(); e.stopPropagation(); dragging=true;
    handle.setPointerCapture?.(e.pointerId);
    startX=e.clientX; startY=e.clientY; startLeft=parseFloat(box.style.left)||0; startTop=parseFloat(box.style.top)||0;
  });
  handle.addEventListener('pointermove',e=>{
    if(!dragging) return;
    const parent=box.parentElement.getBoundingClientRect();
    let left=startLeft+(e.clientX-startX); let top=startTop+(e.clientY-startY);
    left=Math.max(0,Math.min(left,parent.width-box.offsetWidth));
    top=Math.max(26,Math.min(top,parent.height-box.offsetHeight));
    box.style.left=left+'px'; box.style.top=top+'px';
  });
  const stop=e=>{ dragging=false; try{handle.releasePointerCapture?.(e.pointerId);}catch{} };
  handle.addEventListener('pointerup',stop); handle.addEventListener('pointercancel',stop);
}
function workMakeResizable(box){
  const handle=box.querySelector('.resize-handle'); if(!handle) return;
  let startX,startY,startW,startH,resizing=false;
  handle.addEventListener('pointerdown',e=>{
    e.preventDefault(); e.stopPropagation(); resizing=true;
    handle.setPointerCapture?.(e.pointerId);
    startX=e.clientX; startY=e.clientY; startW=box.offsetWidth; startH=box.offsetHeight;
  });
  handle.addEventListener('pointermove',e=>{
    if(!resizing) return;
    const parent=box.parentElement.getBoundingClientRect();
    const left=parseFloat(box.style.left)||0; const top=parseFloat(box.style.top)||0;
    let w=startW+(e.clientX-startX); let h=startH+(e.clientY-startY);
    w=Math.max(150,Math.min(w,parent.width-left));
    h=Math.max(52,Math.min(h,parent.height-top));
    box.style.width=w+'px'; box.style.height=h+'px';
  });
  const stop=e=>{ resizing=false; try{handle.releasePointerCapture?.(e.pointerId);}catch{} };
  handle.addEventListener('pointerup',stop); handle.addEventListener('pointercancel',stop);
}
async function workUpdateFollowupStatus(meetingId,index,status){
  const meeting=(state.workMeetings||[]).find(m=>String(m.id)===String(meetingId));
  if(!meeting || !meeting.followups || !meeting.followups[index]) return;
  meeting.followups[index].status=status;
  const {error}=await sb.from('work_meetings').update({followups:meeting.followups, updated_at:new Date().toISOString()}).eq('id',String(meetingId)).eq('user_id',currentUser.id);
  if(error){ console.error(error); alert('Could not update follow-up: '+error.message); return; }
  renderWorkSummary(); renderWorkCalendar(); renderWorkSelectedDay(); renderWorkWeeklyReview('followups'); showSaved();
}

// ─── ASSISTANT OVERVIEW + CLOSE-OFF SYSTEM OVERRIDES ───
state.dailyCloseoffs = state.dailyCloseoffs || [];
state.weeklyReviews = state.weeklyReviews || [];
state.monthlyReviews = state.monthlyReviews || [];
let assistantQueueTab = 'open';
let weeklyReviewTab = 'closed';
let dailyEnergy = 'Medium';

const __assistantOrigLoadAppData = loadAppData;
loadAppData = async function(){
  await __assistantOrigLoadAppData();
  await loadReviewData();
  renderAssistantOverview();
};

switchTab = function(name){
  const tabs=['overview','finance','growth','work'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',tabs[i]===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById('panel-'+name);
  if(panel) panel.classList.add('active');
  if(name==='overview'){ updateOverview(); renderAssistantOverview(); }
  if(name==='finance'){ renderTotalCover(); switchFinTab(finTab); }
  if(name==='growth'){ renderGrowthTrackers(); buildCalendar?.(); updateFitGoalDisplay?.(); renderWorkouts?.(); }
  if(name==='work'){ renderWorkTab(); }
};

async function loadReviewData(){
  if(!currentUser?.id) return;
  const safeFetch = async (table, orderCol='created_at') => {
    try{
      const {data,error}=await sb.from(table).select('*').order(orderCol,{ascending:false});
      if(error){ console.warn(`${table} not available yet:`, error.message); return []; }
      return data || [];
    }catch(e){ console.warn(`${table} load failed:`, e); return []; }
  };
  state.dailyCloseoffs = await safeFetch('daily_closeoffs','close_date');
  state.weeklyReviews = await safeFetch('weekly_reviews','week_start');
  state.monthlyReviews = await safeFetch('monthly_reviews','month_key');
}

updateOverview = function(){
  renderAssistantOverview();
  const streak=Object.values(state.fitnessHeatmap||{}).filter(Boolean).length;
  const streakPill = document.getElementById('streakPill');
  if(streakPill) streakPill.textContent=`🔥 ${streak} day streak`;
};

function assistantWeekBounds(date=new Date()){
  const d=new Date(date);
  const day=(d.getDay()+6)%7;
  const monday=new Date(d); monday.setDate(d.getDate()-day); monday.setHours(0,0,0,0);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  return {monday,sunday,weekStart:monday.toISOString().slice(0,10)};
}
function assistantThisWeekMeetings(){
  const {monday,sunday}=assistantWeekBounds();
  return (state.workMeetings||[]).filter(m=>{ const dt=new Date((m.meeting_date||'')+'T00:00:00'); return dt>=monday && dt<=sunday; });
}
function assistantAllFollowups(){
  return (state.workMeetings||[]).flatMap(m=>(m.followups||[]).map((f,i)=>({...f,index:i,meetingId:m.id,meeting:m.title||'Meeting',project:m.project||'',meetingDate:m.meeting_date||''})));
}
function assistantIsClosed(f){ const s=String(f.status||'Open').toLowerCase(); return !!f.moved_to_monday || s.includes('done') || s.includes('drop') || s.includes('closed'); }
function assistantOpenItems(){ return assistantAllFollowups().filter(f=>!assistantIsClosed(f)); }
function assistantDueSoonItems(){ const now=new Date(); now.setHours(0,0,0,0); const soon=new Date(now); soon.setDate(now.getDate()+7); return assistantOpenItems().filter(f=>{ if(!f.due_date) return false; const d=new Date(f.due_date+'T00:00:00'); return d>=now && d<=soon; }); }
function assistantWaitingItems(){ return assistantOpenItems().filter(f=>String(f.status||'').toLowerCase().includes('wait')); }
function assistantClosedThisWeek(){ return assistantThisWeekMeetings().flatMap(m=>m.followups||[]).filter(f=>assistantIsClosed(f)).length; }
function assistantGrowthItems(){ const active=typeof activeGrowthGoals==='function' ? activeGrowthGoals() : []; return active.map(g=>({title:g.name, meta:`Growth · ${g.target_days||g.targetDays||12} target days`, note:'Ask: what did this habit give me?'})); }
function esc(v){ return typeof escapeHtml==='function' ? escapeHtml(v) : String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function setText(id, value){ const el=document.getElementById(id); if(el) el.textContent=value; }
function val(id){ return document.getElementById(id)?.value || ''; }
function setVal(id,v){ const el=document.getElementById(id); if(el) el.value=v; }
function assistantItemHtml(item, opts={}){
  const color=opts.color||'var(--orange)';
  const title=esc(item.text||item.title||'Open item');
  const meta=esc(item.meta || [item.meeting, item.project, item.due_date?`Due ${item.due_date}`:''].filter(Boolean).join(' · '));
  return `<div class="loop-item"><div class="dot" style="background:${color}"></div><div class="item-main"><div class="item-title">${title}</div><div class="item-meta">${meta}</div><div class="item-actions"><button class="mini-action done" onclick="assistantMarkDone('${item.meetingId||''}',${Number.isInteger(item.index)?item.index:-1})">Done</button><button class="mini-action carry" onclick="assistantMoveToMonday('${item.meetingId||''}',${Number.isInteger(item.index)?item.index:-1})">Move to monday</button><button class="mini-action wait" onclick="assistantMarkWaiting('${item.meetingId||''}',${Number.isInteger(item.index)?item.index:-1})">Not now</button><button class="mini-action drop" onclick="assistantDropItem('${item.meetingId||''}',${Number.isInteger(item.index)?item.index:-1})">No longer needed</button></div></div></div>`;
}
function renderAssistantOverview(){
  if(!document.getElementById('panel-overview')) return;
  const open=assistantOpenItems(), due=assistantDueSoonItems(), waiting=assistantWaitingItems(), growth=assistantGrowthItems(), closed=assistantClosedThisWeek(), meetings=assistantThisWeekMeetings();
  const reflect=meetings.filter(m=>{ const r=workParseReflection(m); return r.feeling && r.feeling!=='Clear / settled'; }).length + growth.length;
  [['assistantOpenCount',open.length],['assistantClosedCount',closed],['assistantReflectCount',reflect],['queueOpenCount',open.length],['queueDueCount',due.length],['queueWaitingCount',waiting.length],['queueGrowthCount',growth.length],['weeklyClosedCount',closed],['weeklyOpenCount',open.length],['weeklyGrowthCount',reflect],['weeklyNextCount',Math.min(open.length+growth.length,4)],['monthlyOpenCount',open.length],['monthlyWeekCount',state.weeklyReviews?.length||0],['monthlyGrowthCount',growth.length],['monthlyImproveCount',reflect]].forEach(([id,v])=>setText(id,v));
  const focus=document.getElementById('assistantTodayFocus'); if(focus) focus.textContent=open[0]?.text || growth[0]?.title || 'Use today to close one meaningful loop.';
  const top=document.getElementById('assistantTopItems'); if(top) top.innerHTML=(open.slice(0,2).map(i=>assistantItemHtml(i)).join('') || '<div class="card-sub">No urgent open loops. Keep today light and clear.</div>');
  const handover=document.getElementById('assistantHandoverList'); if(handover) handover.innerHTML=`<div class="loop-item"><div class="dot" style="background:var(--orange)"></div><div class="item-main"><div class="item-title">${open.length} item${open.length===1?'':'s'} still carried in My OS.</div><div class="item-meta">Review these before switching off.</div></div></div><div class="loop-item"><div class="dot" style="background:var(--green)"></div><div class="item-main"><div class="item-title">${closed} action${closed===1?'':'s'} moved, closed or dropped this week.</div><div class="item-meta">These are no longer mental load.</div></div></div><div class="loop-item"><div class="dot" style="background:var(--purple)"></div><div class="item-main"><div class="item-title">Growth check-in: ${growth.length || 0} active experiment${growth.length===1?'':'s'}.</div><div class="item-meta">Ask what each one gave you, not just the number.</div></div></div>`;
  renderAssistantQueue(assistantQueueTab); renderWeeklyReview(weeklyReviewTab); renderMonthlyReviewVisibility();
}
function switchAssistantQueue(type, btn){ assistantQueueTab=type; document.querySelectorAll('.queue-tab').forEach(t=>t.classList.remove('active')); if(btn) btn.classList.add('active'); renderAssistantQueue(type); }
function renderAssistantQueue(type='open'){
  const el=document.getElementById('assistantQueueContent'); if(!el) return;
  const open=assistantOpenItems(), due=assistantDueSoonItems(), waiting=assistantWaitingItems(), growth=assistantGrowthItems();
  if(type==='due') el.innerHTML=(due.map(i=>assistantItemHtml(i,{color:'var(--blue)'})).join('') || '<div class="card-sub">Nothing due soon.</div>');
  else if(type==='waiting') el.innerHTML=(waiting.map(i=>assistantItemHtml(i,{color:'var(--green)'})).join('') || '<div class="card-sub">Nothing waiting right now.</div>');
  else if(type==='growth') el.innerHTML=(growth.map(g=>`<div class="loop-item"><div class="dot" style="background:var(--purple)"></div><div class="item-main"><div class="item-title">${esc(g.title)}</div><div class="item-meta">${esc(g.meta)}</div><div class="item-actions"><button class="mini-action carry">Continue</button><button class="mini-action wait">Adjust</button><button class="mini-action drop">Pause</button></div></div></div>`).join('') || '<div class="card-sub">No active growth experiments.</div>');
  else el.innerHTML=(open.map(i=>assistantItemHtml(i)).join('') || '<div class="card-sub">No open loops. Nice.</div>');
}
function switchWeekly(type, btn){ weeklyReviewTab=type; document.querySelectorAll('.weekly-tab').forEach(t=>t.classList.remove('active')); if(btn) btn.classList.add('active'); renderWeeklyReview(type); }
function latestWeeklyValue(key){ const {weekStart}=assistantWeekBounds(); const row=(state.weeklyReviews||[]).find(r=>r.week_start===weekStart); return row?.[key] || ''; }
function renderWeeklyReview(type='closed'){
  const el=document.getElementById('weeklyContent'); if(!el) return;
  const open=assistantOpenItems(), closed=assistantClosedThisWeek(), meetings=assistantThisWeekMeetings();
  const feelings=meetings.map(m=>workParseReflection(m).feeling).filter(Boolean), improves=meetings.map(m=>workParseReflection(m).improve).filter(Boolean);
  if(type==='open') el.innerHTML=`<div class="review-columns"><div class="review-box"><h4>Open items to decide</h4><div class="loop-list">${open.map(i=>assistantItemHtml(i)).join('') || '<div class="card-sub">No open items.</div>'}</div></div><div class="review-box"><h4>My decision notes</h4><textarea class="textarea" id="weeklyOpenNotes" placeholder="What should stay open, move to monday.com, be parked, or removed?">${esc(latestWeeklyValue('open_notes'))}</textarea></div></div>`;
  else if(type==='growth') el.innerHTML=`<div class="review-columns"><div class="review-box"><h4>Mood + improvement patterns</h4><ul>${feelings.slice(0,5).map(f=>`<li>Feeling after meeting: ${esc(f)}</li>`).join('') || '<li>No meeting mood data yet.</li>'}${improves.slice(0,5).map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div><div class="review-box"><h4>My reflection notes</h4><textarea class="textarea" id="weeklyMoodNotes" placeholder="How was my mood this week? What kept showing up? What do I want to improve?">${esc(latestWeeklyValue('mood_notes'))}</textarea><div class="decision-row"><button class="chip active">Continue</button><button class="chip">Adjust</button><button class="chip">Pause</button><button class="chip">Complete</button></div></div></div>`;
  else if(type==='next') el.innerHTML=`<div class="review-columns"><div class="review-box"><h4>Suggested next week focus</h4><ul>${open.slice(0,4).map(i=>`<li>${esc(i.text||i.title)}</li>`).join('') || '<li>Keep the week light and intentional.</li>'}</ul></div><div class="review-box"><h4>My weekly close-off</h4><textarea class="textarea" id="weeklyNextNotes" placeholder="Write your final weekly review here. This will be summarised in monthly review.">${esc(latestWeeklyValue('next_notes'))}</textarea></div></div>`;
  else el.innerHTML=`<div class="review-columns"><div class="review-box"><h4>System summary</h4><ul><li>${closed} work action${closed===1?'':'s'} moved, closed or dropped</li><li>${meetings.length} meeting close-off${meetings.length===1?'':'s'} this week</li><li>${open.length} item${open.length===1?'':'s'} still open</li></ul></div><div class="review-box"><h4>My weekly notes</h4><textarea class="textarea" id="weeklyClosedNotes" placeholder="What felt properly closed this week? What gave me relief? What should I acknowledge?">${esc(latestWeeklyValue('closed_notes'))}</textarea></div></div>`;
}
function setDailyEnergy(btn){ document.querySelectorAll('.energy-row .chip').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); dailyEnergy=btn.dataset.energy||btn.textContent.trim()||'Medium'; }
async function saveDailyCloseoff(){ if(!currentUser?.id){ alert('Please log in again.'); return; } const close_date=new Date().toISOString().slice(0,10); const payload={user_id:currentUser.id,close_date,energy:dailyEnergy,still_open:val('dailyStillOpen'),let_go:val('dailyLetGo'),tomorrow_first_move:val('dailyTomorrowMove'),updated_at:new Date().toISOString()}; const {data,error}=await sb.from('daily_closeoffs').upsert(payload,{onConflict:'user_id,close_date'}).select().single(); if(error){ console.error(error); alert('Could not save daily close-off: '+error.message); return; } const idx=state.dailyCloseoffs.findIndex(r=>r.close_date===close_date); if(idx>=0) state.dailyCloseoffs[idx]=data; else state.dailyCloseoffs.unshift(data); showSaved(); renderAssistantOverview(); }
async function saveWeeklyReview(){ if(!currentUser?.id){ alert('Please log in again.'); return; } const {weekStart}=assistantWeekBounds(); const payload={user_id:currentUser.id,week_start:weekStart,closed_notes:val('weeklyClosedNotes'),open_notes:val('weeklyOpenNotes'),mood_notes:val('weeklyMoodNotes'),next_notes:val('weeklyNextNotes'),summary_json:{open_count:assistantOpenItems().length,closed_count:assistantClosedThisWeek(),meeting_count:assistantThisWeekMeetings().length},updated_at:new Date().toISOString()}; const {data,error}=await sb.from('weekly_reviews').upsert(payload,{onConflict:'user_id,week_start'}).select().single(); if(error){ console.error(error); alert('Could not save weekly review: '+error.message); return; } const idx=state.weeklyReviews.findIndex(r=>r.week_start===weekStart); if(idx>=0) state.weeklyReviews[idx]=data; else state.weeklyReviews.unshift(data); showSaved(); renderAssistantOverview(); }
async function saveMonthlyReview(){ if(!currentUser?.id){ alert('Please log in again.'); return; } const month_key=monthKey(todayObj.getFullYear(), todayObj.getMonth()); const payload={user_id:currentUser.id,month_key,notes:val('monthlyNotes'),summary_json:{open_count:assistantOpenItems().length,weekly_count:state.weeklyReviews?.length||0,growth_count:assistantGrowthItems().length},updated_at:new Date().toISOString()}; const {data,error}=await sb.from('monthly_reviews').upsert(payload,{onConflict:'user_id,month_key'}).select().single(); if(error){ console.error(error); alert('Could not save monthly review: '+error.message); return; } const idx=state.monthlyReviews.findIndex(r=>r.month_key===month_key); if(idx>=0) state.monthlyReviews[idx]=data; else state.monthlyReviews.unshift(data); showSaved(); renderAssistantOverview(); }
function renderMonthlyReviewVisibility(){ const card=document.getElementById('monthlyReviewCard'); if(!card) return; const d=todayObj.getDate(); card.style.display=(d>=25 || d<=3) ? 'block' : 'none'; const title=document.getElementById('monthlyReviewTitle'); if(title) title.textContent=`${MONTH_NAMES[todayObj.getMonth()]} review will be ready soon.`; }
async function assistantUpdateFollowup(meetingId, index, patch){ const m=(state.workMeetings||[]).find(x=>String(x.id)===String(meetingId)); if(!m || index<0 || !m.followups?.[index]) return; m.followups[index]={...m.followups[index],...patch}; const {error}=await sb.from('work_meetings').update({followups:m.followups,updated_at:new Date().toISOString()}).eq('id',meetingId).eq('user_id',currentUser.id); if(error){ console.error(error); alert('Could not update item: '+error.message); return; } renderAssistantOverview(); renderWorkTab(); showSaved(); }
function assistantMarkDone(id,i){ assistantUpdateFollowup(id,i,{status:'Done'}); }
function assistantMoveToMonday(id,i){ assistantUpdateFollowup(id,i,{moved_to_monday:true,status:'Done'}); }
function assistantMarkWaiting(id,i){ assistantUpdateFollowup(id,i,{status:'Waiting'}); }
function assistantDropItem(id,i){ assistantUpdateFollowup(id,i,{status:'Dropped'}); }

function workParseReflection(m){ if(!m?.note_html) return {}; try{ const obj=JSON.parse(m.note_html); return obj && typeof obj==='object' ? obj : {what_happened:stripHtml(m.note_html||'')}; } catch{ return {what_happened:stripHtml(m.note_html||'')}; } }
function collectWorkReflection(){ return {what_happened:val('workWhatHappened'),key_takeaway:val('workKeyTakeaway'),feeling:val('workMeetingFeeling'),improve:val('workImproveNext'),remember:val('workRememberPersonally')}; }
function workSetReflectionFields(m={}){ const r=workParseReflection(m); setVal('workWhatHappened',r.what_happened||''); setVal('workKeyTakeaway',r.key_takeaway||''); setVal('workMeetingFeeling',r.feeling||'Still carrying open loops'); setVal('workImproveNext',r.improve||''); setVal('workRememberPersonally',r.remember||''); }
workIsActiveFollowupStatus = function(status, f={}){ if(f.moved_to_monday) return false; return ['Open','Waiting','Carry next week'].includes(status || 'Open'); };
normaliseWorkMeeting = function(m){ return {id:isUuidLike(m.id)?String(m.id):myosUuid(),title:m.title||'Untitled meeting',meeting_date:m.meeting_date||m.date||workSelectedDate,project:m.project||'',people:m.people||'',meeting_type:m.meeting_type||m.type||'Meeting',note_html:m.note_html||'',textboxes:[],followups:Array.isArray(m.followups)?m.followups.map(f=>({text:f.text||'',status:f.status||'Open',due_date:f.due_date||f.date||'',weekday:f.weekday||workWeekdayLabel(f.due_date||f.date||''),moved_to_monday:!!f.moved_to_monday})):[],created_at:m.created_at||new Date().toISOString(),updated_at:m.updated_at||new Date().toISOString()}; };
renderWorkSummary = function(){ const {monday,sunday}=assistantWeekBounds(); const meetings=(state.workMeetings||[]).filter(m=>{ const dt=new Date((m.meeting_date||'')+'T00:00:00'); return dt>=monday && dt<=sunday; }); const all=meetings.flatMap(m=>m.followups||[]); setText('work-meeting-count',meetings.length); setText('work-monday-count',all.filter(f=>assistantIsClosed(f)).length); setText('work-followup-count',all.filter(f=>!assistantIsClosed(f)).length); };
renderWorkCalendar = function(){ const el=document.getElementById('work-calendar'); if(!el) return; const label=document.getElementById('work-month-label'); if(label) label.textContent=`${MONTH_NAMES[workViewMonth]} ${workViewYear}`; const first=new Date(workViewYear,workViewMonth,1); const days=new Date(workViewYear,workViewMonth+1,0).getDate(); const start=(first.getDay()+6)%7; let html=['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>`<div class="work-cal-label">${d}</div>`).join(''); for(let i=0;i<start;i++) html+='<div class="work-day empty"></div>'; for(let d=1;d<=days;d++){ const key=dayKey(workViewYear,workViewMonth,d); const meetings=(state.workMeetings||[]).filter(m=>workMeetingDateKey(m)===key); const pills=meetings.slice(0,2).map(m=>{ const open=(m.followups||[]).some(f=>!assistantIsClosed(f)); return `<span class="work-event-pill ${open?'open':'closed'}">${workMeetingTitle(m)}${open?'':' ✓'}</span>`; }).join('')+(meetings.length>2?`<span class="work-event-pill more">+${meetings.length-2} more</span>`:''); html+=`<div class="work-day ${key===workSelectedDate?'selected':''}" onclick="selectWorkDate('${key}')"><div class="work-day-num">${d}</div>${pills}</div>`; } el.innerHTML=html; };
openAddWorkMeetingModal = function(dateKey=''){ workEditingMeetingId=''; setText('work-modal-title','Meeting close-off'); setVal('workMeetingId',''); setVal('workMeetingTitle',''); setVal('workMeetingDate',workDateKeyFromInput(dateKey)); setVal('workMeetingProject',''); setVal('workMeetingPeople',''); setVal('workMeetingType','Meeting'); workSetReflectionFields({}); document.getElementById('workFollowRows').innerHTML=''; workAddFollowupRow('', 'Open', '', false); document.getElementById('workMeetingModal').classList.add('open'); setTimeout(()=>document.getElementById('workMeetingTitle')?.focus(),50); };
openWorkMeeting = function(id){ const m=(state.workMeetings||[]).find(x=>String(x.id)===String(id)); if(!m) return; workEditingMeetingId=String(id); setText('work-modal-title','Edit close-off'); setVal('workMeetingId',m.id); setVal('workMeetingTitle',m.title||''); setVal('workMeetingDate',workMeetingDateKey(m)); setVal('workMeetingProject',m.project||''); setVal('workMeetingPeople',m.people||''); setVal('workMeetingType',m.meeting_type||'Meeting'); workSetReflectionFields(m); document.getElementById('workFollowRows').innerHTML=''; (m.followups?.length?m.followups:[{text:'',status:'Open',due_date:'',moved_to_monday:false}]).forEach(f=>workAddFollowupRow(f.text||'',f.status||'Open',f.due_date||'',!!f.moved_to_monday)); document.getElementById('workMeetingModal').classList.add('open'); };
workAddFollowupRow = function(text='', status='Open', dueDate='', moved=false){ const wrap=document.getElementById('workFollowRows'); if(!wrap) return; const row=document.createElement('div'); row.className='follow-row'; const weekday=workWeekdayLabel(dueDate); row.innerHTML=`<input class="input work-follow-text" value="${escapeAttr(text)}" placeholder="Action item"><select class="input work-follow-status"><option value="Open" ${status==='Open'?'selected':''}>Open</option><option value="Waiting" ${status==='Waiting'?'selected':''}>Waiting</option><option value="Carry next week" ${status==='Carry next week'?'selected':''}>Carry next week</option><option value="Done" ${status==='Done'?'selected':''}>Done</option><option value="Dropped" ${status==='Dropped'?'selected':''}>Dropped</option></select><input class="input work-follow-date" type="date" value="${escapeAttr(dueDate)}" onchange="workRefreshFollowupWeekday(this)"><div class="work-follow-weekday">${weekday||'No date'}</div><label class="checkbox-card"><input type="checkbox" class="work-follow-monday" ${moved?'checked':''}> Moved to monday.com</label><button class="btn btn-ghost btn-small" onclick="this.closest('.follow-row').remove()">Remove</button>`; wrap.appendChild(row); };
collectWorkFollowups = function(){ return [...document.querySelectorAll('#workFollowRows .follow-row')].map(r=>{ const dueDate=r.querySelector('.work-follow-date')?.value||''; return {text:r.querySelector('.work-follow-text')?.value.trim()||'',status:r.querySelector('.work-follow-status')?.value||'Open',due_date:dueDate,weekday:workWeekdayLabel(dueDate),moved_to_monday:!!r.querySelector('.work-follow-monday')?.checked}; }).filter(f=>f.text); };
saveWorkMeeting = async function(){ const title=val('workMeetingTitle').trim(); const date=val('workMeetingDate'); if(!title||!date){ alert('Meeting title and date are required.'); return; } if(!currentUser?.id){ alert('Please log in again before saving.'); return; } const payload={user_id:currentUser.id,title,meeting_date:date,project:val('workMeetingProject').trim(),people:val('workMeetingPeople').trim(),meeting_type:val('workMeetingType')||'Meeting',note_html:JSON.stringify(collectWorkReflection()),textboxes:[],followups:collectWorkFollowups(),updated_at:new Date().toISOString()}; let data,error; if(workEditingMeetingId){ ({data,error}=await sb.from('work_meetings').update(payload).eq('id',String(workEditingMeetingId)).eq('user_id',currentUser.id).select().single()); } else { ({data,error}=await sb.from('work_meetings').insert(payload).select().single()); } if(error){ console.error(error); alert('Could not save meeting close-off: '+error.message); return; } const saved=normaliseWorkMeeting(data||payload); const existing=state.workMeetings.findIndex(m=>String(m.id)===String(saved.id)); if(existing>=0) state.workMeetings[existing]=saved; else state.workMeetings.unshift(saved); workSelectedDate=date; syncWorkViewToDate(date); workEditingMeetingId=''; closeWorkMeetingModal(); renderWorkTab(); renderAssistantOverview(); showSaved(); };
renderWorkWeeklyReview = function(){ const el=document.getElementById('work-weekly-review'); if(el) el.innerHTML=''; };

renderWorkSelectedDay = function(){
  const title=document.getElementById('work-selected-title'); if(title) title.textContent=`Selected day — ${workSelectedDate}`;
  const list=document.getElementById('work-day-meetings'); if(!list) return;
  const meetings=(state.workMeetings||[]).filter(m=>workMeetingDateKey(m)===workSelectedDate).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  if(!meetings.length){ list.innerHTML=`<div class="card-sub">No meeting close-offs for this date.</div><button class="btn btn-ghost btn-small" onclick="openAddWorkMeetingModal('${workSelectedDate}')">＋ Close off meeting for this day</button>`; return; }
  list.innerHTML=meetings.map(m=>{
    const open=(m.followups||[]).filter(f=>!assistantIsClosed(f)).length;
    const moved=(m.followups||[]).filter(f=>assistantIsClosed(f)).length;
    const r=workParseReflection(m);
    return `<div class="work-meeting-item"><div class="work-meeting-head"><div><div class="work-meeting-title">${workMeetingTitle(m)}</div><div class="work-meeting-meta">${workMeetingProject(m)}${workMeetingPeople(m)?' · '+workMeetingPeople(m):''}</div></div><span class="work-note-type">${open?'Open':'Closed'}</span></div><div class="card-sub">${moved} moved/closed · ${open} kept in My OS${r.feeling?` · ${esc(r.feeling)}`:''}</div><div class="work-meeting-actions"><button class="btn btn-ghost btn-small" onclick="openWorkMeeting('${m.id}')">Open →</button><button class="btn btn-ghost btn-small" onclick="deleteWorkMeeting('${m.id}')">Delete</button></div></div>`;
  }).join('');
};
