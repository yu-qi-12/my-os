// ─── SUPABASE INIT ───
const SUPABASE_URL = 'https://vuovbkbdxjxsiuflbrdn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1b3Zia2JkeGp4c2l1ZmxicmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTkyMjQsImV4cCI6MjA5NDkzNTIyNH0.z5ta4K_bDHD6xkWQ44AZuQg1JMR0N6Vmpza6ZOCscus';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── LOCAL STATE (loaded from Supabase on boot) ───
const state = {
  goals: [], workouts: [], fitnessHeatmap: {}, fitGoals: {},
  transactions: [], budgets: {}, books: [], readHeatmap: {}, piano: [],
  categories: []
};
let pendingUploadTxs = []; // transactions awaiting review from PDF upload

const todayObj = new Date();
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PIANO_GOAL = 90;
const bookColors = ['var(--green)','var(--blue)','var(--orange)','var(--pink)','var(--purple)'];
// Categories — loaded from state, with defaults
const DEFAULT_CATEGORIES = ['Food & Dining','Transport','Health & Medical','Entertainment','Utilities & Bills','Shopping','Subscriptions','Other'];
const CAT_COLOR_PALETTE = ['var(--green)','var(--blue)','var(--orange)','var(--pink)','var(--purple)','#2a9d8f','#e9c46a','var(--muted)','#e76f51','#457b9d','#a8dadc','#6d6875'];
function getCategories(){ return state.categories && state.categories.length ? state.categories : [...DEFAULT_CATEGORIES]; }
function getCatColor(i){ return CAT_COLOR_PALETTE[i % CAT_COLOR_PALETTE.length]; }
// Legacy aliases
const CATEGORIES = DEFAULT_CATEGORIES;
const CAT_COLORS = CAT_COLOR_PALETTE;
const catColors = {life:{bg:'#1a2a1a',color:'var(--green)'},fitness:{bg:'#1a1e2e',color:'var(--blue)'},finance:{bg:'#2e2a1a',color:'var(--orange)'},growth:{bg:'#2a1a2e',color:'var(--purple)'},career:{bg:'#2e1a1a',color:'var(--pink)'}};
const catLabels = {life:'🌱 Life',fitness:'💪 Fitness',finance:'💰 Finance',growth:'📚 Growth',career:'💼 Career'};

// ─── SAVE INDICATOR ───
let saveTimer = null;
function showSaved(){
  const p = document.getElementById('savePill');
  p.classList.remove('hidden');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>p.classList.add('hidden'), 1800);
}

// ─── BOOT: LOAD ALL DATA ───
async function boot(){
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
  } catch(e){ console.error('Boot error:', e); }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('dateDisplay').textContent = todayObj.toLocaleDateString('en-AU',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  renderGoals(); renderWorkouts(); buildCalendar(); updateFitGoalDisplay();
  renderCatSelect(); renderFinance(); renderTotalCover(); renderBudgetView(); renderCatManager();
  renderBooks(); updateReadCalBookSelect(); buildReadCal(); renderReadReports();
  renderPiano(); updateOverview(); renderReports();
}

// ─── TABS ───
function switchTab(name){
  const tabs=['overview','goals','fitness','finance','growth'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',tabs[i]===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  if(name==='overview'){ updateOverview(); renderReports(); }
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
let activeAcct='personal', activeSubAcct='credit';
function switchAcct(acct){
  activeAcct=acct;
  document.querySelectorAll('.acct-tab').forEach((t,i)=>t.classList.toggle('active',['personal','joint','budget'][i]===acct));
  const accountsView=document.getElementById('fin-view-accounts');
  const budgetView=document.getElementById('fin-view-budget');
  const subTabs=document.getElementById('fin-personal-subtabs');
  const catsView=document.getElementById('fin-view-categories');
  if(acct==='budget'){accountsView.style.display='none';budgetView.style.display='none';catsView.style.display='none';budgetView.style.display='block';renderBudgetView();}
  else if(acct==='categories'){accountsView.style.display='none';budgetView.style.display='none';catsView.style.display='block';renderCatManager();}
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
  const mk=monthKey(now.getFullYear(),now.getMonth());
  const date=now.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  await sb.from('transactions').insert({id,description:desc,amount,type,sub_type:subType,cat,acct:activeAcct,date,month_key:mk});
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
  await sb.from('categories').insert({name,sort_order:state.categories.length});
  input.value='';
  renderCatManager(); renderCatSelect(); renderBudgetView(); showSaved();
}

async function deleteCategory(cat){
  if(!confirm(`Delete category "${cat}"? Existing transactions will keep their label, and any budget set for this category will be removed.`)) return;
  state.categories=state.categories.filter(c=>c!==cat);
  delete state.budgets[cat];
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
  { keywords: ['salary','payroll','pay','wage','income','deposit','transfer in','reimbursement','refund','cashback','interest earned','dividend'], cat: 'Other', type: 'income' },
];

function guessCategory(description, amount, type){
  const desc = description.toLowerCase();
  for(const rule of CAT_RULES){
    if(rule.keywords.some(k=>desc.includes(k))){
      return rule.cat;
    }
  }
  return 'Other';
}

function guessType(description, amount){
  const desc = description.toLowerCase();
  const incomeKeywords = ['salary','payroll','pay','wage','income','deposit','reimbursement','refund','cashback','interest','dividend','credit'];
  if(incomeKeywords.some(k=>desc.includes(k))) return 'income';
  return 'expense';
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
    const descType = guessType(desc, amount);
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
  // Try to parse various date formats and return "DD Mon"
  try {
    const d = new Date(raw);
    if(!isNaN(d)) return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  } catch(e){}
  return raw;
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
        <option value="expense" ${t.type==='expense'?'selected':''}>− Expense</option>
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

async function confirmUpload(){
  const btn=document.getElementById('confirmUploadBtn');
  btn.textContent='Saving…'; btn.disabled=true;
  const toSave=pendingUploadTxs.filter(t=>t.keep);
  const now=new Date();
  const mk=monthKey(now.getFullYear(),now.getMonth());
  for(const t of toSave){
    const id=Date.now()+Math.random();
    const subType=t.type==='income'?'income':(t.subType||'credit');
    await sb.from('transactions').insert({
      id,description:t.description,amount:parseFloat(t.amount),
      type:t.type,sub_type:subType,cat:t.category,
      acct:t.acct,date:t.date,month_key:mk
    });
    state.transactions.unshift({
      id,description:t.description,amount:parseFloat(t.amount),
      type:t.type,subType,cat:t.category,
      acct:t.acct,date:t.date,monthKey:mk
    });
  }
  closeUploadModal();
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
function renderFinance(){
  const isJoint=activeAcct==='joint';
  let txs;
  if(isJoint) txs=state.transactions.filter(t=>t.acct==='joint');
  else if(activeSubAcct==='income') txs=state.transactions.filter(t=>t.acct==='personal'&&t.type==='income');
  else txs=state.transactions.filter(t=>t.acct==='personal'&&t.subType===activeSubAcct);
  const allTxs=[...state.transactions.filter(t=>t.acct==='personal'),...state.transactions.filter(t=>t.acct==='joint')];
  const income=allTxs.filter(t=>t.type==='income').reduce((s,t)=>s+effectiveAmount(t),0);
  const expense=allTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+effectiveAmount(t),0);
  const net=income-expense;
  document.getElementById('fin-income').textContent='$'+income.toFixed(2);
  document.getElementById('fin-income-sub').textContent='all accounts';
  document.getElementById('fin-expense').textContent='$'+expense.toFixed(2);
  document.getElementById('fin-expense-sub').textContent='personal + 50% joint';
  const netEl=document.getElementById('fin-net');
  netEl.textContent=(net>=0?'$':'-$')+Math.abs(net).toFixed(2);
  netEl.style.color=net>=0?'var(--green)':'var(--pink)';
  document.getElementById('fin-net-sub').textContent='combined net';
  const mk=monthKey(todayObj.getFullYear(),todayObj.getMonth());
  document.getElementById('fin-cat-month').textContent=MONTH_SHORT[todayObj.getMonth()];
  const expenses=txs.filter(t=>t.type==='expense'&&t.monthKey===mk);
  const catEl=document.getElementById('fin-cat-breakdown');
  if(!expenses.length){catEl.innerHTML='<div style="color:var(--muted);font-size:13px;">No expenses this month.</div>';}
  else{
    const cats=getCategories();
    const byCat=cats.map((cat,i)=>{const sum=expenses.filter(t=>t.cat===cat).reduce((s,t)=>s+effectiveAmount(t),0);return{cat,sum,color:getCatColor(i)};}).filter(c=>c.sum>0).sort((a,b)=>b.sum-a.sum);
    const maxCat=byCat[0]?.sum||1;
    catEl.innerHTML=byCat.map(c=>`<div class="cat-row"><div class="cat-dot" style="background:${c.color}"></div><div class="cat-name">${c.cat}</div><div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${Math.round((c.sum/maxCat)*100)}%;background:${c.color}"></div></div><div class="cat-amount" style="color:${c.color}">$${c.sum.toFixed(0)}${isJoint?'<span class="split-note">½</span>':''}</div></div>`).join('');
  }
  const now2=new Date();const lastDate=new Date(now2.getFullYear(),now2.getMonth()-1,1);
  const lastKey=monthKey(lastDate.getFullYear(),lastDate.getMonth());
  const mn=MONTH_SHORT[now2.getMonth()],lmn=MONTH_SHORT[lastDate.getMonth()];
  const thisE=txs.filter(t=>t.type==='expense'&&t.monthKey===mk).reduce((s,t)=>s+effectiveAmount(t),0);
  const lastE=txs.filter(t=>t.type==='expense'&&t.monthKey===lastKey).reduce((s,t)=>s+effectiveAmount(t),0);
  const diff=thisE-lastE;
  document.getElementById('fin-monthly-review').innerHTML=`
    <div class="stat-row" style="margin-bottom:10px;">
      <div class="stat-box"><div class="stat-box-label">${mn} spend</div><div class="stat-box-val" style="color:var(--pink);font-size:18px;">$${thisE.toFixed(0)}</div></div>
      <div class="stat-box"><div class="stat-box-label">${lmn} spend</div><div class="stat-box-val" style="color:var(--muted);font-size:18px;">$${lastE.toFixed(0)}</div></div>
    </div>
    <div class="insight" style="margin-top:0;">${thisE===0?'<strong>No expenses logged yet.</strong>':diff>0?`<strong>Up $${diff.toFixed(0)} vs ${lmn}.</strong>`:diff<0?`<strong>Down $${Math.abs(diff).toFixed(0)} vs ${lmn}.</strong> Good.`:`<strong>Same as ${lmn}.</strong>`}</div>`;
  const list=document.getElementById('transactionList');
  if(!txs.length){list.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No transactions yet.</div>';return;}
  list.innerHTML=txs.slice(0,15).map(t=>{
    const desc=t.description||t.desc||t.text||'';
    const eff=effectiveAmount(t);
    return `<div class="finance-row">
      <div style="flex:1;"><div>${desc}${t.acct==='joint'?'<span class="split-note">½</span>':''}</div><div class="cat">${t.cat} · ${t.date}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-right:8px;">
        <div class="amount ${t.type}">${t.type==='income'?'+':'-'}$${eff.toFixed(2)}</div>
        ${t.acct==='joint'?`<div style="font-size:10px;color:var(--muted);">total $${t.amount.toFixed(2)}</div>`:''}
      </div>
      <button class="del-btn" onclick="deleteTransaction(${t.id})">×</button>
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
function dayKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function deltaBadge(curr,prev){if(prev===null||prev===undefined) return '';const diff=curr-prev;if(diff>0) return `<span class="delta up">▲ ${diff}</span>`;if(diff<0) return `<span class="delta down">▼ ${Math.abs(diff)}</span>`;return `<span class="delta flat">= same</span>`;}
function renderBarChart(data,maxVal,goalVal){
  const safeMax=maxVal||1;
  return `<div class="bar-chart">${data.map(d=>{const pct=Math.min(100,Math.round((d.value/safeMax)*100));const col=d.highlight?'var(--blue)':'var(--surface2)';return `<div class="bar-col"><div class="bar-val" style="color:${d.highlight?'var(--blue)':'var(--muted)'}">${d.value}</div><div class="bar-wrap"><div class="bar-fill" style="height:${pct}%;background:${col};border:${d.highlight?'1px solid var(--blue)':'1px solid var(--border)'}"></div></div><div class="bar-label">${d.label}</div></div>`;}).join('')}</div>`;
}

// ─── START ───
boot();
