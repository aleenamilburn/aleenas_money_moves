import {parseCsv, rowsToTransactions} from './csv.js';
import {createVaultRepository} from './services/vaultRepository.js';
import {createStateService} from './services/stateService.js';
import {
  listBuckets, createBucket, updateBucket as updateDomainBucket, reorderBucket as reorderDomainBucket,
  moveChildBucket, archiveBucket, restoreBucket, queryBucketDetail
} from './services/bucketService.js';
import {
  upgradeStateWithMigration, money, monthLabel, availableMonths, availableWeeks, weekLabel,
  weekStats, reviewQueue, sortedBuckets, assignBucket, addTransactions,
  monthSummary, debtAccounts,
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
let currentScreen = 'overview';
let setupState = seed;
let selectedBucketId = null;
let expandedBucketIds = new Set();
let bucketFilters = {from:'',to:'',accountId:'',reviewStatus:'',assignment:'',search:''};
let editingBucketId = null;
let movingChildId = null;
let archivingBucketId = null;

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
  saveChain=saveChain.catch(()=>{}).then(async()=>{ keyMeta=(await stateService.save(snapshot,activeKey,keyMeta)).meta; });
  try { await saveChain; }
  catch(error) { console.error('Save failed',error); throw error; }
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
  const includeArchived=$('showArchivedBuckets').checked;
  const parents=listBuckets(state,{includeArchived,parentId:null});
  const activeParents=listBuckets(state,{parentId:null});
  const selectedMonth=state.monthly.selectedMonth;
  const periodFilters={from:`${selectedMonth}-01`,to:`${selectedMonth}-31`};
  $('bucketBoard').innerHTML=parents.length ? parents.map(parent=>{
    const children=listBuckets(state,{includeArchived,parentId:parent.id});
    const expanded=expandedBucketIds.has(parent.id);
    const summary=queryBucketDetail(state,parent.id,periodFilters);
    const target=parent.targetCents/100;
    const remaining=Math.max(0,parent.targetCents-summary.rolledUpCents)/100;
    return `<article class="bucket-family ${parent.active?'':'archived'}" data-id="${parent.id}">
      <div class="bucket-card parent-bucket">
        <button class="icon-button" data-expand="${parent.id}" aria-expanded="${expanded}" aria-label="${expanded?'Collapse':'Expand'} ${escapeAttr(parent.name)}">${expanded?'▾':'▸'}</button>
        <div class="bucket-identity">${editingBucketId===parent.id?`<form class="bucket-rename-form" data-id="${parent.id}"><label>Bucket name<input name="name" value="${escapeAttr(parent.name)}" required></label><button>Save</button><button type="button" data-cancel-bucket-action>Cancel</button></form>`:`<strong>${escapeHtml(parent.name)}</strong><small>${escapeHtml(parent.group)} · ${children.length} child bucket${children.length===1?'':'s'}${parent.active?'':' · Archived'}</small>`}</div>
        <div class="bucket-total"><strong>${money(summary.rolledUpCents/100)}</strong><small>${money(summary.directCents/100)} direct · ${money(target)} target · ${money(remaining)} remaining</small></div>
        <div class="bucket-actions">
          <button data-detail="${parent.id}">View</button><button data-rename="${parent.id}">Rename</button>
          <button data-order="up" data-id="${parent.id}" aria-label="Move ${escapeAttr(parent.name)} up">↑</button><button data-order="down" data-id="${parent.id}" aria-label="Move ${escapeAttr(parent.name)} down">↓</button>
          ${parent.protected?'':parent.active?(archivingBucketId===parent.id?`<button data-confirm-archive="${parent.id}">Confirm archive</button><button data-cancel-bucket-action>Cancel</button>`:`<button data-request-archive="${parent.id}" aria-label="Archive ${escapeAttr(parent.name)}">Archive</button>`):`<button data-restore="${parent.id}" aria-label="Restore ${escapeAttr(parent.name)}">Restore</button>`}
        </div>
      </div>
      <div class="bucket-children ${expanded?'':'hidden'}">
        ${children.map(child=>{
          const childSummary=queryBucketDetail(state,child.id,periodFilters);
          return `<div class="bucket-card child-bucket"><span class="tree-line" aria-hidden="true">↳</span><div class="bucket-identity">${editingBucketId===child.id?`<form class="bucket-rename-form" data-id="${child.id}"><label>Bucket name<input name="name" value="${escapeAttr(child.name)}" required></label><button>Save</button><button type="button" data-cancel-bucket-action>Cancel</button></form>`:`<strong>${escapeHtml(child.name)}</strong><small>${child.active?'Child bucket':'Archived child'}</small>`}</div><div class="bucket-total"><strong>${money(childSummary.rolledUpCents/100)}</strong><small>${childSummary.transactionCount} transaction${childSummary.transactionCount===1?'':'s'} · ${money(child.targetCents/100)} target</small></div><div class="bucket-actions"><button data-detail="${child.id}">View</button><button data-rename="${child.id}">Rename</button><button data-order="up" data-id="${child.id}" aria-label="Move ${escapeAttr(child.name)} up">↑</button><button data-order="down" data-id="${child.id}" aria-label="Move ${escapeAttr(child.name)} down">↓</button>${movingChildId===child.id?`<label class="move-parent-label">Parent<select data-move-target="${child.id}">${activeParents.filter(item=>item.id!==child.parentId).map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></label><button data-confirm-move="${child.id}">Save move</button><button data-cancel-bucket-action>Cancel</button>`:`<button data-move-child="${child.id}">Move</button>`}${child.active?(archivingBucketId===child.id?`<button data-confirm-archive="${child.id}">Confirm archive</button><button data-cancel-bucket-action>Cancel</button>`:`<button data-request-archive="${child.id}" aria-label="Archive ${escapeAttr(child.name)}">Archive</button>`):`<button data-restore="${child.id}" aria-label="Restore ${escapeAttr(child.name)}">Restore</button>`}</div></div>`;
        }).join('')}
        ${parent.active?`<form class="child-bucket-form" data-parent="${parent.id}"><label>New child bucket<input name="name" required placeholder="Child bucket name"></label><label>Monthly target<input name="target" type="number" min="0" step="1" placeholder="0"></label><button>Add child</button></form>`:''}
      </div>
    </article>`;
  }).join('') : '<div class="panel"><p>No parent buckets yet.</p></div>';

  document.querySelectorAll('[data-expand]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.expand;expandedBucketIds.has(id)?expandedBucketIds.delete(id):expandedBucketIds.add(id);renderBuckets();}));
  document.querySelectorAll('[data-detail]').forEach(button=>button.addEventListener('click',()=>{selectedBucketId=button.dataset.detail;renderBucketDetail();$('bucketDetail').scrollIntoView({behavior:'smooth',block:'start'});}));
  document.querySelectorAll('[data-rename]').forEach(button=>button.addEventListener('click',()=>{editingBucketId=button.dataset.rename;movingChildId=null;archivingBucketId=null;renderBuckets();}));
  document.querySelectorAll('.bucket-rename-form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(form);editingBucketId=null;await performBucketChange(()=>updateDomainBucket(state,form.dataset.id,{name:data.get('name')}));}));
  document.querySelectorAll('[data-order]').forEach(button=>button.addEventListener('click',async()=>performBucketChange(()=>reorderDomainBucket(state,button.dataset.id,button.dataset.order))));
  document.querySelectorAll('[data-request-archive]').forEach(button=>button.addEventListener('click',()=>{archivingBucketId=button.dataset.requestArchive;editingBucketId=null;movingChildId=null;setMessage('bucketMessage','Archiving keeps all financial history and can be reversed.');renderBuckets();}));
  document.querySelectorAll('[data-confirm-archive]').forEach(button=>button.addEventListener('click',async()=>{archivingBucketId=null;await performBucketChange(()=>archiveBucket(state,button.dataset.confirmArchive));}));
  document.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',async()=>performBucketChange(()=>restoreBucket(state,button.dataset.restore))));
  document.querySelectorAll('[data-move-child]').forEach(button=>button.addEventListener('click',()=>{movingChildId=button.dataset.moveChild;editingBucketId=null;archivingBucketId=null;renderBuckets();}));
  document.querySelectorAll('[data-confirm-move]').forEach(button=>button.addEventListener('click',async()=>{const select=document.querySelector(`[data-move-target="${CSS.escape(button.dataset.confirmMove)}"]`);movingChildId=null;if(select?.value) await performBucketChange(()=>moveChildBucket(state,button.dataset.confirmMove,select.value));}));
  document.querySelectorAll('[data-cancel-bucket-action]').forEach(button=>button.addEventListener('click',()=>{editingBucketId=null;movingChildId=null;archivingBucketId=null;renderBuckets();}));
  document.querySelectorAll('.child-bucket-form').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    await performBucketChange(()=>createBucket(state,{parentId:form.dataset.parent,name:data.get('name'),target:data.get('target')}));
    expandedBucketIds.add(form.dataset.parent);
  }));
  renderBucketDetail();
}

async function performBucketChange(change) {
  const before=JSON.parse(JSON.stringify(state));
  try {
    change();
    await persist();
    setMessage('bucketMessage','Changes saved locally.');
    renderBuckets(); renderOverview(); renderReview();
  } catch(error) {
    state=before;
    setMessage('bucketMessage',error.message||'Could not update this bucket. No changes were saved.',true);
    renderBuckets(); renderOverview(); renderReview();
  }
}

function renderBucketDetail() {
  const node=$('bucketDetail');
  if (!selectedBucketId || !state.domain.buckets.some(item=>item.id===selectedBucketId)) { node.classList.add('hidden'); return; }
  const detail=queryBucketDetail(state,selectedBucketId,bucketFilters);
  const parent=detail.bucket.parentId ? state.domain.buckets.find(item=>item.id===detail.bucket.parentId) : null;
  node.classList.remove('hidden');
  node.innerHTML=`<div class="panel-head"><div><p class="eyebrow">BUCKET DETAIL</p><h2>${parent?`${escapeHtml(parent.name)} › `:''}${escapeHtml(detail.bucket.name)}${detail.bucket.active?'':' · Archived'}</h2><p>${detail.bucket.parentId?'Child bucket totals include only this child.':'Rolled-up totals include direct assignments and every child, including archived history.'}</p></div><button id="closeBucketDetail" aria-label="Close bucket detail">Close</button></div>
    <div class="bucket-metrics"><div><span>Rolled-up</span><strong>${money(detail.rolledUpCents/100)}</strong></div><div><span>Direct</span><strong>${money(detail.directCents/100)}</strong></div><div><span>Transactions</span><strong>${detail.transactionCount}</strong></div></div>
    ${detail.hasLegacyAggregate?`<p class="legacy-note">${money(detail.legacyAggregateCents/100)} exists only as a preserved V1 monthly aggregate. No transaction rows were fabricated.</p>`:''}
    ${detail.childTotals.length?`<div class="child-totals">${detail.childTotals.map(item=>`<button data-detail="${item.bucket.id}"><span>${escapeHtml(item.bucket.name)}${item.bucket.active?'':' (archived)'}</span><strong>${money(item.amountCents/100)}</strong></button>`).join('')}</div>`:''}
    <form id="bucketFilters" class="bucket-filters"><label>Search<input name="search" value="${escapeAttr(bucketFilters.search)}" placeholder="Merchant or transaction name"></label><label>From<input name="from" type="date" value="${escapeAttr(bucketFilters.from)}"></label><label>To<input name="to" type="date" value="${escapeAttr(bucketFilters.to)}"></label><label>Account<select name="accountId"><option value="">All accounts</option>${detail.accountOptions.map(item=>`<option value="${escapeAttr(item.id)}" ${bucketFilters.accountId===item.id?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><label>Review status<select name="reviewStatus"><option value="">Reviewed and unreviewed</option><option value="reviewed" ${bucketFilters.reviewStatus==='reviewed'?'selected':''}>Reviewed</option><option value="unreviewed" ${bucketFilters.reviewStatus==='unreviewed'?'selected':''}>Unreviewed</option></select></label><label>Assignment<select name="assignment"><option value="">Direct and child</option><option value="direct" ${bucketFilters.assignment==='direct'?'selected':''}>Direct only</option><option value="child" ${bucketFilters.assignment==='child'?'selected':''}>Child only</option></select></label><button>Apply filters</button><button type="button" id="clearBucketFilters">Clear</button></form>
    <div class="bucket-ledger" role="region" aria-label="${escapeAttr(detail.bucket.name)} transaction ledger"><table><thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Account</th><th>Bucket</th><th>Status</th><th>State</th><th>Country</th><th>Source</th></tr></thead><tbody>${detail.rows.length?detail.rows.map(row=>`<tr><td>${escapeHtml(row.date||'Unknown')}</td><td>${escapeHtml(row.merchant)}</td><td>${money(row.amountCents/100)}</td><td>${escapeHtml(row.accountName)}</td><td>${escapeHtml(row.assignedBucketName)}</td><td>${escapeHtml(row.reviewStatus)}</td><td>${row.locationRegion?escapeHtml(row.locationRegion):'—'}</td><td>${row.locationCountry?escapeHtml(row.locationCountry):'—'}</td><td><small>${escapeHtml(row.source)}</small></td></tr>`).join(''):'<tr><td colspan="9">No traceable transactions match these filters.</td></tr>'}</tbody></table></div>`;
  $('closeBucketDetail').addEventListener('click',()=>{selectedBucketId=null;renderBucketDetail();});
  node.querySelectorAll('[data-detail]').forEach(button=>button.addEventListener('click',()=>{selectedBucketId=button.dataset.detail;renderBucketDetail();}));
  $('bucketFilters').addEventListener('submit',event=>{event.preventDefault();bucketFilters=Object.fromEntries(new FormData(event.currentTarget));renderBucketDetail();});
  $('clearBucketFilters').addEventListener('click',()=>{bucketFilters={from:'',to:'',accountId:'',reviewStatus:'',assignment:'',search:''};renderBucketDetail();});
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
    await performBucketChange(()=>createBucket(state,{name:$('newBucketName').value,group:$('newBucketGroup').value,target:$('newBucketTarget').value}));
    $('newBucketName').value='';$('newBucketTarget').value='';
  });
  $('showArchivedBuckets').addEventListener('change',renderBuckets);
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
