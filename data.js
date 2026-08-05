// Public, non-financial bootstrap state. Existing encrypted local and hosted vaults
// are never replaced by this file; it is used only when a signed-in user explicitly
// creates a new empty vault. Do not put account names, transaction data, balances,
 // categories, notes, or any user-derived fixture here because Vercel serves it to
// every visitor before authentication.
window.MONEY_MOVES_SEED = {
  schemaVersion: 3,
  app: {name:'Money Moves', version:'2.0.0'},
  preferences: {monthlyIncome:0, showScripture:true, lockMinutes:60},
  monthly: {selectedMonth:'', activeMonth:'', lastOpenedMonth:''},
  providerSnapshot: {
    asOf:null, averageMonthlyIncome:0, cashTotal:0, creditDebtTotal:0,
    netWorth:0, coverage:'No account data connected', accounts:[], recurring:[]
  },
  review: {
    selectedWeek:'',
    buckets:[],
    transactions:[],
    merchantRules:[],
    importSettings:{positiveMeansSpend:true, includeMoneyMovement:true}
  },
  travel: {visited:[], destinations:[]},
  scriptures: []
};
