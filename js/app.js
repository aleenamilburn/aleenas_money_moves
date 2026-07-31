import {parseCsv, rowsToTransactions} from './csv.js';
import {createVaultRepository} from './services/vaultRepository.js';
import {createStateService} from './services/stateService.js';
import {
  upgradeStateWithMigration, money, monthLabel, availableMonths, availableWeeks, weekLabel,
  weekStats, reviewQueue, sortedBuckets, assignBucket, addTransactions, addBucket,
  updateBucket, reorderBucket, moveBucket, monthSummary, debtAccounts,
  rankedDestinations, addVisited, scriptureForMonth, bucketById
} from './state.js';

const seed = window.MONEY_MOVES_SEED;
const $ = id => document.getElementById(id);
const vaultRepository = createVaultRepository();
const stateService = createStateService({
  repository:vaultRepository,
  seed,
  migrate:input=>upgradeStateWithMigration(input,seed)
});
let state = null;
let activeKey = null;
let keyMeta = null;
let saveChain = Promise.resolve();
let inactivityTimer = null;
let lastActivity = Date.now();
let draggedBucketId = null;
let currentScreen = 'overview';
let setupState = seed;

function setMessage(id,message,isError=false) {
  const node=$(id);
  if (!node) return;
  node.textContent=message || '';
  node.style.color=isError?'var(--red)':'var(--muted)';
}

function showPanel(name) {
  $('setupPanel').classList.toggle('hidden',name!=='setup');
  $('unlockPanel').classList.toggle('hidden',name!=='unlock');
  $('lockLayer').classList.add('show');
  $('appShell').setAttribute('aria-hidden','true');
  setMessage('lockMessage','');
}

function enterApp() {
  $('lockLayer').classList.remove('show');
  $('appShell').setAttribute('aria-hidden','false');
  resetInactivity();
  renderAll();
}

function lockApp() {
  activeKey=null; keyMeta=null; state=null;
  clearTimeout(inactivityTimer);
  $('unlockPass').value='';
  showPanel('unlock');
}

function resetInactivity() {
  if (!state) return;
  lastActivity=Date.now();
  clearTimeout(inactivityTimer);
  inactivityTimer=setTimeout(lockApp,Number(state.preferences.lockMinutes||60)*60*1000);
}

async function persist() {
  if (!state || !activeKey || !keyMeta) return;
  const snapshot=JSON.parse(JSON.stringify(state));
  saveChain=saveChain.then(async()=>{ keyMeta=(await stateService.save(snapshot,activeKey,keyMeta)).meta; })
    .catch(error=>console.error('Save failed',error));
  await saveChain;
}

function humanCategory(value) {
  return String(value||'Uncategorized').replace(/_/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
}

function selectScreen(screen) {
  currentScreen=screen;
  document.querySelectorAll('.screen').forEach(node=>node.classList.toggle('active',node.id===`screen-${screen}`));
  document.querySelectorAll('.nav-item').forEach(node=>node.classList.toggle('active',node.dataset.screen===screen));
  const titles={overview:'Overview',review:'Weekly review',buckets:'Buckets & rules',travel:'Travel',debt:'Debt & goals',settings:'Settings & vault'};
  $('screenTitle').textContent=titles[screen]||'Money Moves';
  renderAll();
}

function renderMonthSelector() {
  const months=availableMonths(state);
  $('monthSelect').innerHTML=months.map(month=>`<option value="${month}">${monthLabel(month)}</option>`).join('');
  $('monthSelect').value=state.monthly.selectedMonth;
}

function renderOverview() {
  const summary=monthSummary(state);
  $('safeToSpend').textContent=money(summary.safeToSpend);
  $('cashFlow').textContent=money(summary.cashFlow);
  $('cashFlow').style.color=summary.cashFlow<0?'var(--red)':'var(--green)';
  $('cashFlowNote').textContent=`${money(summary.income)} posted income minus ${money(summary.spend)} spending`;
  $('netWorth').textContent=money(state.providerSnapshot.netWorth);
  $('netWorth').style.color=state.providerSnapshot.netWorth<0?'var(--red)':'var(--green)';
  $('snapshotAsOf').textContent=`Snapshot through ${state.providerSnapshot.asOf}`;
  const stats=weekStats(state);
  $('reviewPercent').textContent=`${stats.completion}%`;
  $('reviewMetricNote').textContent=`${stats.remaining} transaction${stats.remaining===1?'':'s'} left in ${weekLabel(state.review.selectedWeek)}`;

  const actuals=summary.actuals;
  const buckets=sortedBuckets(state,false);
  $('overviewBuckets').innerHTML=buckets.map(bucket=>{
    const actual=Number(actuals[bucket.id]||0);
    const target=Number(bucket.target||0);
    const pct=target>0?Math.min(actual/target*100,100):(actual>0?100:0);
    return `<div class="progress-row">
      <div class="name"><strong>${escapeHtml(bucket.name)}</strong><small>${escapeHtml(bucket.group)}${bucket.protected?' · protected':''}</small></div>
      <div class="bar"><i class="${target>0&&actual>target?'over':''}" style="width:${pct}%"></i></div>
      <div class="amount-pair"><strong>${money(actual)}</strong><small>of ${money(target)}</small></div>
    </div>`;
  }).join('');

  const verse=scriptureForMonth(state);
  $('scriptureCard').classList.toggle('hidden',!state.preferences.showScripture || !verse);
  if (verse) {
    $('scriptureText').textContent=`“${verse.text}”`;
    $('scriptureReference').textContent=verse.reference;
    $('scriptureTheme').textContent=verse.theme;
  }

  const debts=debtAccounts(state);
  const priority=debts.find(account=>account.utilization!==null) || debts[0];
  if (priority) {
    const util=priority.utilization;
    $('priorityCard').innerHTML=`<div class="priority"><strong>${escapeHtml(priority.name)}</strong>
      <span>${money(priority.balance)} balance${util!==null?` · ${util.toFixed(1)}% utilization`:''}</span>
      ${util!==null?`<div class="util-track"><i style="width:${Math.min(util,100)}%"></i></div>`:''}
      <small>${priority.apr?`${priority.apr.toFixed(2)}% purchase APR · `:''}Paying this card first reduces your highest known utilization.</small></div>`;
  } else $('priorityCard').innerHTML='<p>No credit accounts in this snapshot.</p>';

  $('coverageBadge').textContent=state.providerSnapshot.coverage;
  $('accountStrip').innerHTML=state.providerSnapshot.accounts.map(account=>`<div class="account-pill">
    <span>${escapeHtml(account.institution)} · ${account.kind==='credit'?'Credit':'Cash'}</span>
    <strong>${money(account.balance)}</strong><small>${escapeHtml(account.name)}</small>
  </div>`).join('');
}

function renderReview() {
  const weeks=availableWeeks(state);
  $('weekSelect').innerHTML=weeks.map(week=>`<option value="${week}">${weekLabel(week)}</option>`).join('');
  $('weekSelect').value=state.review.selectedWeek;
  const stats=weekStats(state);
  $('reviewRemaining').textContent=stats.remaining;
  $('reviewProgressText').textContent=`${stats.reviewed} of ${stats.total} complete`;
  $('reviewProgressBar').style.width=`${stats.completion}%`;
  const queue=reviewQueue(state);
  const tx=queue[0];
  $('transactionEmpty').classList.toggle('hidden',Boolean(tx));
  $('transactionBody').classList.toggle('hidden',!tx);
  if (tx) {
    $('transactionAmount').textContent=`${tx.flow==='inflow'?'+':''}${money(tx.amount)}`;
    $('transactionAmount').style.color=tx.flow==='inflow'?'var(--green)':'var(--lime)';
    $('transactionMerchant').textContent=tx.merchant;
    $('transactionMeta').textContent=`${tx.date} · ${tx.account} · ${humanCategory(tx.flow)}`;
    $('providerCategory').textContent=humanCategory(tx.providerCategory);
    $('providerConfidence').textContent=tx.providerConfidence?`${humanCategory(tx.providerConfidence)} provider confidence`:'No provider confidence supplied';
    $('rememberRule').checked=false;
    const buckets=sortedBuckets(state,true);
    const suggested=tx.bucketId;
    $('reviewBucketChoices').innerHTML=buckets.map(bucket=>`<button class="bucket-choice ${bucket.id===suggested?'suggested':''}" data-bucket="${bucket.id}">
      <span>${escapeHtml(bucket.name)}</span><small>${escapeHtml(bucket.group)}</small></button>`).join('');
    document.querySelectorAll('.bucket-choice').forEach(button=>button.addEventListener('click',async()=>{
      assignBucket(state,tx.id,button.dataset.bucket,$('rememberRule').checked);
      await persist(); renderAll();
    }));
  }
  $('ruleCount').textContent=state.review.merchantRules.length;
  $('ruleList').innerHTML=state.review.merchantRules.length
    ? state.review.merchantRules.map(rule=>{
      const bucket=bucketById(state,rule.bucketId);
      return `<div class="rule-item"><div><strong>${escapeHtml(rule.merchant)}</strong><small>${escapeHtml(bucket?.name||'Unknown bucket')}</small></div><span class="badge">Automatic suggestion</span></div>`;
    }).join('')
    : '<p>No merchant rules yet. Check “Always use this bucket” during review to create one.</p>';
}

function renderBuckets() {
  const summary=monthSummary(state);
  $('bucketBoard').innerHTML=sortedBuckets(state,true).map(bucket=>`<div class="bucket-card" draggable="${!bucket.system}" data-id="${bucket.id}">
    <div class="drag-handle" aria-hidden="true">${bucket.system?'•':'☰'}</div>
    <input class="bucket-name" data-id="${bucket.id}" value="${escapeAttr(bucket.name)}" ${bucket.system?'disabled':''}>
    <select class="bucket-group" data-id="${bucket.id}" ${bucket.system?'disabled':''}>
      ${['Needs','Wants','Goals','Money movement','System'].map(group=>`<option ${bucket.group===group?'selected':''}>${group}</option>`).join('')}
    </select>
    <input class="bucket-target" data-id="${bucket.id}" type="number" min="0" step="1" value="${Number(bucket.target||0)}" ${bucket.system?'disabled':''} title="Monthly target">
    <div class="bucket-moves"><button data-move="-1" data-id="${bucket.id}" aria-label="Move ${escapeAttr(bucket.name)} up">↑</button><button data-move="1" data-id="${bucket.id}" aria-label="Move ${escapeAttr(bucket.name)} down">↓</button></div>
  </div>`).join('');

  document.querySelectorAll('.bucket-name').forEach(input=>input.addEventListener('change',async()=>{updateBucket(state,input.dataset.id,{name:input.value});await persist();renderAll();}));
  document.querySelectorAll('.bucket-group').forEach(select=>select.addEventListener('change',async()=>{updateBucket(state,select.dataset.id,{group:select.value});await persist();renderAll();}));
  document.querySelectorAll('.bucket-target').forEach(input=>input.addEventListener('change',async()=>{updateBucket(state,input.dataset.id,{target:input.value});await persist();renderAll();}));
  document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',async()=>{moveBucket(state,button.dataset.id,Number(button.dataset.move));await persist();renderBuckets();renderOverview();}));
  document.querySelectorAll('.bucket-card[draggable="true"]').forEach(card=>{
    card.addEventListener('dragstart',()=>{draggedBucketId=card.dataset.id;card.classList.add('dragging');});
    card.addEventListener('dragend',()=>{draggedBucketId=null;card.classList.remove('dragging');});
    card.addEventListener('dragover',event=>event.preventDefault());
    card.addEventListener('drop',async event=>{event.preventDefault();if(draggedBucketId){reorderBucket(state,draggedBucketId,card.dataset.id);await persist();renderBuckets();}});
  });
}

function researchUrl(city,stateCode,kind) {
  const query={weather:`${city} ${stateCode} weather next month`,events:`${city} ${stateCode} events`,work:`${city} ${stateCode} coworking reliable wifi`}[kind];
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function renderTravel() {
  const ranked=rankedDestinations(state);
  $('travelCards').innerHTML=ranked.map((item,index)=>`<article class="travel-card">
    <div class="travel-rank"><span>#${index+1} for ${monthLabel(state.monthly.selectedMonth)}</span><span>${item.score} fit</span></div>
    <h2>${escapeHtml(item.city)}, ${escapeHtml(item.state)}</h2><p>${escapeHtml(item.why)}</p>
    <div class="travel-stats">
      <div class="travel-stat"><span>Non-flight estimate</span><strong>${money(item.est)}</strong></div>
      <div class="travel-stat"><span>Remote work</span><strong>${escapeHtml(item.work)}</strong></div>
      <div class="travel-stat"><span>Internet</span><strong>${escapeHtml(item.internet)}</strong></div>
      <div class="travel-stat"><span>30-minute access</span><strong>${escapeHtml(item.access)}</strong></div>
    </div>
    <div class="travel-actions">
      <button data-research="${researchUrl(item.city,item.state,'weather')}">Weather</button>
      <button data-research="${researchUrl(item.city,item.state,'events')}">Events</button>
      <button data-research="${researchUrl(item.city,item.state,'work')}">Work setup</button>
    </div>
  </article>`).join('');
  document.querySelectorAll('[data-research]').forEach(button=>button.addEventListener('click',()=>window.open(button.dataset.research,'_blank','noopener,noreferrer')));
  $('visitedList').innerHTML=state.travel.visited.length
    ? state.travel.visited.map(item=>`<button class="chip" data-remove-visited="${item.id}">${escapeHtml(item.city)}, ${escapeHtml(item.state)} ×</button>`).join('')
    : '<p>No visited cities added yet.</p>';
  document.querySelectorAll('[data-remove-visited]').forEach(button=>button.addEventListener('click',async()=>{
    state.travel.visited=state.travel.visited.filter(item=>item.id!==button.dataset.removeVisited);
    await persist();renderTravel();
  }));
}

function renderDebt() {
  const debts=debtAccounts(state);
  const knownLimit=debts.filter(item=>item.limit);
  const overallLimit=knownLimit.reduce((sum,item)=>sum+item.limit,0);
  const overallBalance=knownLimit.reduce((sum,item)=>sum+item.balance,0);
  const utilization=overallLimit?overallBalance/overallLimit*100:0;
  $('debtMetrics').innerHTML=[
    ['Credit-card debt',money(state.providerSnapshot.creditDebtTotal),'Current connected balances'],
    ['Known-limit utilization',`${utilization.toFixed(1)}%`,'Apple and Chase limits'],
    ['Cash snapshot',money(state.providerSnapshot.cashTotal),'Checking and savings'],
    ['Net worth',money(state.providerSnapshot.netWorth),'Connected cash minus card balances']
  ].map(([label,value,note])=>`<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');

  $('debtCards').innerHTML=debts.map((item,index)=>`<div class="debt-item">
    <div class="row"><strong>${index+1}. ${escapeHtml(item.name)}</strong><strong>${money(item.balance)}</strong></div>
    <small>${item.utilization!==null?`${item.utilization.toFixed(1)}% utilization`: 'Credit limit unavailable'}${item.apr?` · ${item.apr.toFixed(2)}% purchase APR`:''}${item.dueDate?` · due ${item.dueDate}`:''}</small>
  </div>`).join('');

  const goalIds=['travel','emergency','debt'];
  const summary=monthSummary(state);
  $('goalCards').innerHTML=goalIds.map(id=>{
    const bucket=bucketById(state,id);
    const actual=summary.actuals[id]||0;
    return `<div class="goal-item"><div class="row"><strong>${escapeHtml(bucket.name)}</strong><strong>${money(bucket.target)}</strong></div><small>${money(actual)} currently categorized this month · protected before safe-to-spend</small></div>`;
  }).join('');

  $('recurringTable').innerHTML=state.providerSnapshot.recurring.map(item=>`<div class="table-row">
    <div><strong>${escapeHtml(item.merchant)}</strong><small>${escapeHtml(item.kind)} · ${escapeHtml(item.frequency)}</small></div>
    <div><strong>${money(item.amount)}</strong><small>${item.nextDate}</small></div>
  </div>`).join('');
}

function renderSettings() {
  $('monthlyIncome').value=Number(state.preferences.monthlyIncome||0);
  $('showScripture').checked=Boolean(state.preferences.showScripture);
  $('lockMinutes').value=String(state.preferences.lockMinutes||60);
}

function renderAll() {
  if (!state) return;
  renderMonthSelector();
  const totalRemaining=state.review.transactions.filter(tx=>tx.reviewStatus!=='reviewed').length;
  $('navReviewCount').textContent=totalRemaining;
  renderOverview();
  renderReview();
  renderBuckets();
  renderTravel();
  renderDebt();
  renderSettings();
}

function escapeHtml(value) {
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function importSelectedFile(file) {
  if (!file) return;
  try {
    const rows=parseCsv(await file.text());
    const converted=rowsToTransactions(rows,state.review.importSettings);
    const result=addTransactions(state,converted.transactions,'csv');
    await persist();
    setMessage('importMessage',`${result.imported} imported · ${result.duplicates} duplicates skipped${converted.rejected.length?` · ${converted.rejected.length} rejected`:''}`);
    renderAll();
    selectScreen('review');
  } catch (error) {
    setMessage('importMessage',error.message||'Could not import this CSV.',true);
  } finally {
    $('csvFile').value='';
  }
}

function bindEvents() {
  $('createVault').addEventListener('click',async()=>{
    const pass=$('newPass').value, confirm=$('confirmPass').value;
    if (pass.length<12) return setMessage('lockMessage','Use at least 12 characters.',true);
    if (pass!==confirm) return setMessage('lockMessage','Passphrases do not match.',true);
    try {
      const created=await stateService.create(pass,setupState);
      state=created.state;
      activeKey=created.key;keyMeta=created.meta;
      $('newPass').value='';$('confirmPass').value='';
      enterApp();
    } catch(error){setMessage('lockMessage',error.message||'Could not create the vault.',true);}
  });
  $('unlockVault').addEventListener('click',async()=>{
    try {
      const result=await stateService.unlock($('unlockPass').value);
      state=result.state;activeKey=result.key;keyMeta=result.meta;
      $('unlockPass').value='';
      enterApp();
    } catch {setMessage('lockMessage','Incorrect passphrase or damaged vault.',true);}
  });
  $('unlockPass').addEventListener('keydown',event=>{if(event.key==='Enter')$('unlockVault').click();});
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>selectScreen(button.dataset.screen)));
  $('monthSelect').addEventListener('change',async()=>{state.monthly.selectedMonth=$('monthSelect').value;await persist();renderAll();});
  $('weekSelect').addEventListener('change',async()=>{state.review.selectedWeek=$('weekSelect').value;await persist();renderReview();});
  $('lockNow').addEventListener('click',lockApp);
  $('importCsv').addEventListener('click',()=>$('csvFile').click());
  $('settingsImport').addEventListener('click',()=>$('csvFile').click());
  $('csvFile').addEventListener('change',()=>importSelectedFile($('csvFile').files[0]));
  $('addBucketForm').addEventListener('submit',async event=>{
    event.preventDefault();
    try {
      addBucket(state,$('newBucketName').value,$('newBucketGroup').value,$('newBucketTarget').value);
      $('newBucketName').value='';$('newBucketTarget').value='';
      await persist();renderAll();
    } catch(error){alert(error.message);}
  });
  $('visitedForm').addEventListener('submit',async event=>{
    event.preventDefault();
    try {
      addVisited(state,$('visitedCity').value,$('visitedState').value);
      $('visitedCity').value='';$('visitedState').value='';
      await persist();renderTravel();
    } catch(error){alert(error.message);}
  });
  $('savePreferences').addEventListener('click',async()=>{
    state.preferences.monthlyIncome=Math.max(0,Number($('monthlyIncome').value)||0);
    state.preferences.showScripture=$('showScripture').checked;
    state.preferences.lockMinutes=Number($('lockMinutes').value)||60;
    await persist();resetInactivity();renderAll();
  });
  $('changePassphrase').addEventListener('click',async()=>{
    const current=prompt('Enter your current passphrase.');
    if (!current) return;
    const next=prompt('Enter a new passphrase with at least 12 characters.');
    if (!next) return;
    if (next.length<12) return alert('Use at least 12 characters.');
    const confirmNext=prompt('Enter the new passphrase again.');
    if (next!==confirmNext) return alert('The new passphrases do not match.');
    try {
      const result=await stateService.changePassphrase(state,current,next);
      state=result.state;activeKey=result.key;keyMeta=result.meta;
      alert('Passphrase changed.');
    } catch {alert('The current passphrase was incorrect.');}
  });
  $('exportBackup').addEventListener('click',()=>{
    try {
      const blob=new Blob([stateService.exportEncryptedBackup()],{type:'application/json'});
      const link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=`money-moves-backup-${new Date().toISOString().slice(0,10)}.json`;
      link.click();URL.revokeObjectURL(link.href);
    } catch(error){alert(error.message);}
  });
  $('restoreBackup').addEventListener('click',()=>$('restoreFile').click());
  $('restoreFile').addEventListener('change',async()=>{
    const file=$('restoreFile').files[0];$('restoreFile').value='';
    if (!file) return;
    const passphrase=prompt('Enter the passphrase for this encrypted backup.');
    if (!passphrase) return;
    try {
      const restored=await stateService.restore(await file.text(),passphrase);
      state=restored.state;activeKey=restored.key;keyMeta=restored.meta;
      renderAll();alert('Backup restored.');
    } catch {alert('The backup or passphrase could not be verified.');}
  });
  $('resetVault').addEventListener('click',()=>{
    if (!confirm('Erase the encrypted local vault from this browser? Export a backup first.')) return;
    stateService.clearCurrentVault();location.reload();
  });
  for (const eventName of ['pointerdown','keydown','touchstart','scroll']) {
    window.addEventListener(eventName,resetInactivity,{passive:true});
  }
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState==='visible' && state) {
      const timeout=Number(state.preferences.lockMinutes||60)*60*1000;
      if (Date.now()-lastActivity>=timeout) lockApp(); else resetInactivity();
    }
  });
}

function boot() {
  bindEvents();
  if (stateService.hasVault()) showPanel('unlock');
  else {
    const legacy=stateService.readLegacyState();
    if (legacy) {
      setupState=legacy;
    }
    showPanel('setup');
    if (legacy) setMessage('lockMessage','Your existing local data will be encrypted when you create this vault.');
  }
}
boot();
