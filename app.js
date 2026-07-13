// 1. STATE INITIALIZATION
let state = {
  phone: '',
  securityPin: '',
  isOnboarded: false,
  bankBalance: 0,
  cashBalance: 0,
  startingInvestments: 0,
  splitwiseBalance: 0,
  investmentTarget: 15000,
  transactions: []
};

// Global sync state tracker
let syncPending = false;

// 2. STATE PERSISTENCE & API SYNC
function loadState() {
  const savedState = localStorage.getItem('blingy_state');
  if (savedState) {
    try {
      state = JSON.parse(savedState);
      // Compatibility fallback checks
      if (!state.transactions) state.transactions = [];
      if (state.bankBalance === undefined) state.bankBalance = 0;
      if (state.cashBalance === undefined) state.cashBalance = 0;
      if (state.startingInvestments === undefined) state.startingInvestments = 0;
      if (state.splitwiseBalance === undefined) state.splitwiseBalance = 0;
      if (state.investmentTarget === undefined) state.investmentTarget = 15000;
      if (state.isOnboarded === undefined) state.isOnboarded = false;
      if (state.phone === undefined) state.phone = '';
      if (state.securityPin === undefined) state.securityPin = '';
    } catch (e) {
      console.error("Failed to parse saved state, resetting...", e);
      resetToDefault();
    }
  } else {
    resetToDefault();
  }
}

function saveState() {
  localStorage.setItem('blingy_state', JSON.stringify(state));
  syncStateToCloud();
}

function resetToDefault() {
  state = {
    phone: '',
    securityPin: '',
    isOnboarded: false,
    bankBalance: 0,
    cashBalance: 0,
    startingInvestments: 0,
    splitwiseBalance: 0,
    investmentTarget: 15000,
    transactions: []
  };
  localStorage.setItem('blingy_state', JSON.stringify(state));
  updateSyncBubble("offline");
}

function syncStateToCloud() {
  if (!state.phone) {
    updateSyncBubble("offline");
    return;
  }

  updateSyncBubble("pending");
  syncPending = true;

  fetch('/api/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(state)
  })
  .then(res => {
    if (!res.ok) throw new Error("Sync server returned status " + res.status);
    return res.json();
  })
  .then(() => {
    updateSyncBubble("synced");
    syncPending = false;
  })
  .catch(err => {
    console.error("Cloud sync failed:", err);
    updateSyncBubble("offline");
    syncPending = false;
  });
}

function updateSyncBubble(status) {
  const bubble = document.getElementById('sync-status-bubble');
  if (!bubble) return;

  bubble.className = "sync-status";
  if (status === "synced") {
    bubble.textContent = "Synced ✓";
    bubble.classList.add("synced");
  } else if (status === "pending") {
    bubble.textContent = "Syncing... 🔄";
    bubble.classList.add("pending");
  } else {
    bubble.textContent = "Offline / Local";
    bubble.classList.add("offline");
  }
}

// 3. FINANCIAL CALCULATIONS ENGINE
function getFinancialCalculations() {
  let currentBank = Number(state.bankBalance || 0);
  let currentCash = Number(state.cashBalance || 0);
  let totalInvested = Number(state.startingInvestments || 0);
  let netSplitwiseBal = Number(state.splitwiseBalance || 0);
  
  let monthlyInvested = 0;
  let totalExpenses = 0;
  
  const categorySpends = {
    Food: 0,
    Travel: 0,
    Shopping: 0,
    Bills: 0,
    Others: 0
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  state.transactions.forEach(tx => {
    const amt = Number(tx.amount || 0);
    const txDate = new Date(tx.date);
    const isThisMonth = txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;

    if (tx.type === 'expense') {
      totalExpenses += amt;
      const cat = tx.category || 'Others';
      if (categorySpends[cat] !== undefined) {
        categorySpends[cat] += amt;
      } else {
        categorySpends['Others'] += amt;
      }

      if (tx.payMode === 'bank') {
        currentBank -= amt;
      } else if (tx.payMode === 'cash') {
        currentCash -= amt;
      } else if (tx.payMode === 'splitwise') {
        netSplitwiseBal -= amt; // Incurred expense unpaid (splitwise debt)
      }
    } 
    else if (tx.type === 'income') {
      if (tx.incomeDest === 'bank') {
        currentBank += amt;
      } else if (tx.incomeDest === 'cash') {
        currentCash += amt;
      }
    } 
    else if (tx.type === 'investment') {
      totalInvested += amt;
      if (isThisMonth) {
        monthlyInvested += amt;
      }

      if (tx.investSource === 'bank') {
        currentBank -= amt;
      } else if (tx.investSource === 'cash') {
        currentCash -= amt;
      }
    } 
    else if (tx.type === 'settlement') {
      if (tx.settlementDirection === 'paid') {
        netSplitwiseBal += amt; // You paid friend: reduces debt / increases credit
        if (tx.settlementSource === 'bank') {
          currentBank -= amt;
        } else if (tx.settlementSource === 'cash') {
          currentCash -= amt;
        }
      } else if (tx.settlementDirection === 'received') {
        netSplitwiseBal -= amt; // Friend paid you: reduces credit / increases debt
        if (tx.settlementSource === 'bank') {
          currentBank += amt;
        } else if (tx.settlementSource === 'cash') {
          currentCash += amt;
        }
      }
    }
  });

  const netWorth = currentBank + currentCash + totalInvested + netSplitwiseBal;

  return {
    currentBank,
    currentCash,
    totalInvested,
    netSplitwiseBal,
    monthlyInvested,
    totalExpenses,
    categorySpends,
    netWorth
  };
}

// Helper formatting functions
function formatINR(val) {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(absVal);
  return isNegative ? `-${formatted}` : formatted;
}

// 4. UI RENDERING & VIEWS
const views = ['dashboard-view', 'log-view', 'history-view', 'settings-view'];

function switchView(targetViewId) {
  // Update nav tabs active styling
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.getAttribute('data-target') === targetViewId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Switch view containers
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) {
      if (v === targetViewId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });

  // Trigger screen-specific content updates
  if (targetViewId === 'dashboard-view') {
    updateDashboardView();
  } else if (targetViewId === 'history-view') {
    renderHistoryView();
  } else if (targetViewId === 'settings-view') {
    updateSettingsView();
  }
}

function updateDashboardView() {
  const calcs = getFinancialCalculations();

  // Net Worth Card
  const netWorthEl = document.getElementById('dash-net-worth');
  netWorthEl.textContent = formatINR(calcs.netWorth);
  if (calcs.netWorth > 0) {
    netWorthEl.style.color = '#1B8C3A';
  } else if (calcs.netWorth < 0) {
    netWorthEl.style.color = '#D62828';
  } else {
    netWorthEl.style.color = '';
  }

  // Account Stats
  document.getElementById('dash-bank-bal').textContent = formatINR(calcs.currentBank);
  document.getElementById('dash-cash-bal').textContent = formatINR(calcs.currentCash);

  // Splitwise Card
  const swBalEl = document.getElementById('dash-splitwise-bal');
  const swSummaryEl = document.getElementById('dash-splitwise-summary');
  const swSettleBtn = document.getElementById('dash-settle-shortcut');
  
  swBalEl.textContent = formatINR(calcs.netSplitwiseBal);
  
  if (calcs.netSplitwiseBal > 0) {
    swBalEl.style.color = '#1B8C3A';
    swSummaryEl.textContent = `Friends owe you ${formatINR(calcs.netSplitwiseBal)} net.`;
    swSettleBtn.style.display = 'block';
    swSettleBtn.textContent = "Collect 💵";
  } else if (calcs.netSplitwiseBal < 0) {
    swBalEl.style.color = '#D62828';
    swSummaryEl.textContent = `You owe friends ${formatINR(Math.abs(calcs.netSplitwiseBal))} net.`;
    swSettleBtn.style.display = 'block';
    swSettleBtn.textContent = "Pay Back 💸";
  } else {
    swBalEl.style.color = '';
    swSummaryEl.textContent = "All settled up! 🤝";
    swSettleBtn.style.display = 'none';
  }

  // Investments Progress
  const target = state.investmentTarget || 15000;
  const pct = Math.min(100, Math.max(0, (calcs.monthlyInvested / target) * 100));
  
  document.getElementById('invest-ratio-text').textContent = `${formatINR(calcs.monthlyInvested)} / ${formatINR(target)}`;
  document.getElementById('invest-pct').textContent = `${Math.round(pct)}%`;
  document.getElementById('invest-progress-bar').style.width = `${pct}%`;

  let progressComment = "";
  if (pct === 0) {
    progressComment = "😴 No investments logged this month.";
  } else if (pct < 33) {
    progressComment = "🌱 Off to a starting crawl. Compound interest is waiting!";
  } else if (pct < 67) {
    progressComment = "🚀 Steady progress! Keep feeding the savings engine.";
  } else if (pct < 100) {
    progressComment = "🔥 Almost at your target! Push a bit more.";
  } else {
    progressComment = "👑 Target crushed! You're an investment champ.";
  }
  document.getElementById('invest-progress-comment').textContent = progressComment;

  // Category Donut Chart
  renderCategoryDonutChart(calcs.totalExpenses, calcs.categorySpends);
}

function renderCategoryDonutChart(total, categories) {
  const chartSvg = document.getElementById('dash-pie-chart');
  const legendContainer = document.getElementById('chart-legend');
  if (!chartSvg || !legendContainer) return;

  // Clear previous slices and legends
  chartSvg.innerHTML = '<circle cx="100" cy="100" r="70" class="chart-ring-bg"></circle>';
  legendContainer.innerHTML = '';

  const catColors = {
    Food: '#FFDE4D',
    Travel: '#A2D2FF',
    Shopping: '#FFAAA6',
    Bills: '#E8C5E5',
    Others: '#C8E6C9'
  };

  const catEmojis = {
    Food: '🍔',
    Travel: '🚗',
    Shopping: '🛍️',
    Bills: '🔌',
    Others: '📦'
  };

  if (total === 0) {
    legendContainer.innerHTML = '<div style="font-weight:700; font-size:0.85rem; color:var(--gray-dark);">No expenses logged yet!</div>';
    return;
  }

  let accumulatedAngle = 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius; // ~439.8

  Object.keys(categories).forEach(cat => {
    const amt = categories[cat];
    if (amt <= 0) return;

    const pct = amt / total;
    const strokeDash = pct * circumference;
    const strokeOffset = circumference - strokeDash;
    
    // Draw SVG slice
    const slice = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    slice.setAttribute('cx', '100');
    slice.setAttribute('cy', '100');
    slice.setAttribute('r', radius.toString());
    slice.setAttribute('class', 'chart-slice');
    slice.style.stroke = catColors[cat] || '#ccc';
    slice.style.strokeDasharray = `${strokeDash} ${circumference}`;
    slice.style.transform = `rotate(${accumulatedAngle}deg)`;
    slice.style.transformOrigin = 'center';
    
    chartSvg.appendChild(slice);
    accumulatedAngle += pct * 360;

    // Draw Legend
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-color" style="background-color: ${catColors[cat]}"></span>
      <span>${catEmojis[cat]} ${cat}: ${formatINR(amt)} (${Math.round(pct * 100)}%)</span>
    `;
    legendContainer.appendChild(legendItem);
  });
}

function renderHistoryView() {
  const filterType = document.getElementById('filter-tx-type').value;
  const filterCat = document.getElementById('filter-tx-cat').value;
  const container = document.getElementById('history-transactions-list');
  
  if (!container) return;
  container.innerHTML = '';

  let filtered = [...state.transactions];

  if (filterType !== 'all') {
    filtered = filtered.filter(tx => tx.type === filterType);
  }
  if (filterCat !== 'all') {
    filtered = filtered.filter(tx => tx.type === 'expense' && tx.category === filterCat);
  }

  // Sort transactions by date descending, then timestamp ID descending
  filtered.sort((a, b) => {
    const diff = new Date(b.date) - new Date(a.date);
    if (diff !== 0) return diff;
    return Number(b.id) - Number(a.id);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center; font-weight:800; color:var(--gray-dark); padding:var(--space-md);">No matching activities found.</div>';
    return;
  }

  filtered.forEach(tx => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    let txClass = '';
    let sign = '';
    let detailsStr = '';

    if (tx.type === 'expense') {
      txClass = 'expense';
      sign = '-';
      const payLabels = { bank: '🏦 Bank', cash: '💵 Cash', splitwise: '👥 Splitwise Unpaid' };
      detailsStr = `Paid via ${payLabels[tx.payMode]}`;
    } 
    else if (tx.type === 'income') {
      txClass = 'income';
      sign = '+';
      const destLabels = { bank: '🏦 Bank', cash: '💵 Cash' };
      detailsStr = `Deposited to ${destLabels[tx.incomeDest]}`;
    } 
    else if (tx.type === 'investment') {
      txClass = 'investment';
      sign = '-';
      const srcLabels = { bank: '🏦 Bank', cash: '💵 Cash' };
      detailsStr = `Funded by ${srcLabels[tx.investSource]}`;
    } 
    else if (tx.type === 'settlement') {
      txClass = 'settlement';
      const srcLabels = { bank: '🏦 Bank', cash: '💵 Cash' };
      if (tx.settlementDirection === 'paid') {
        sign = '-';
        detailsStr = `You paid friend using ${srcLabels[tx.settlementSource]}`;
      } else {
        sign = '+';
        detailsStr = `Friend settled you using ${srcLabels[tx.settlementSource]}`;
      }
    }

    const txEmojis = { expense: '💸', income: '💰', investment: '📈', settlement: '🤝' };
    const dateFormatted = new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    item.innerHTML = `
      <div class="transaction-item-info">
        <div class="tx-cat-date">${txEmojis[tx.type]} ${tx.type === 'expense' ? tx.category : tx.type} • ${dateFormatted}</div>
        <div class="tx-desc">${tx.desc}</div>
        <div class="tx-details">${detailsStr}</div>
      </div>
      <div style="display:flex; align-items:center;">
        <span class="transaction-item-amt ${txClass}">${sign}${formatINR(tx.amount)}</span>
        <span class="tx-delete-btn" onclick="deleteTransaction('${tx.id}')">❌</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function deleteTransaction(id) {
  if (confirm("Delete this transaction activity?")) {
    state.transactions = state.transactions.filter(tx => tx.id !== id);
    saveState();
    renderHistoryView();
    showToast("Activity deleted successfully!", "warning");
  }
}

function updateSettingsView() {
  document.getElementById('settings-profile-phone').textContent = `Phone: ${state.phone || 'Local Only'}`;
}

// 5. TOAST NOTIFICATION SYSTEM
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const emojis = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '🚨' };
  toast.innerHTML = `<span>${emojis[type]}</span><span>${message}</span>`;
  
  container.appendChild(toast);

  // Automatically remove toast after 3 seconds
  setTimeout(() => {
    toast.style.animation = "fadeIn 0.2s reverse ease-in";
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// 6. EVENT LISTENERS SETUP
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  checkOnboardingStatus();

  // Onboarding Tab Mode switcher
  let onboardingMode = 'onboard';
  const toggleOnboard = document.getElementById('toggle-onboard-mode');
  const toggleSync = document.getElementById('toggle-sync-mode');
  const onboardFinancials = document.getElementById('onboard-financials-fields');
  const onboardDescText = document.getElementById('onboarding-desc-text');
  const onboardSubmitBtn = document.getElementById('onboard-submit-btn');

  const bankInput = document.getElementById('onboard-bank');
  const cashInput = document.getElementById('onboard-cash');
  const investInput = document.getElementById('onboard-invest');
  const swInput = document.getElementById('onboard-sw-net');

  if (toggleOnboard && toggleSync) {
    toggleOnboard.addEventListener('click', () => {
      toggleOnboard.classList.add('active');
      toggleSync.classList.remove('active');
      if (onboardFinancials) onboardFinancials.style.display = 'block';
      if (onboardDescText) onboardDescText.textContent = "Welcome! Let's log your starting financial balances to initialize your profile.";
      if (onboardSubmitBtn) onboardSubmitBtn.textContent = "Let's Roll! 🚀";

      if (bankInput) bankInput.required = true;
      if (cashInput) cashInput.required = true;
      if (investInput) investInput.required = true;
      if (swInput) swInput.required = true;

      onboardingMode = 'onboard';
    });

    toggleSync.addEventListener('click', () => {
      toggleSync.classList.add('active');
      toggleOnboard.classList.remove('active');
      if (onboardFinancials) onboardFinancials.style.display = 'none';
      if (onboardDescText) onboardDescText.textContent = "Enter your Phone Number and PIN (if set) to sync your profile from Supabase.";
      if (onboardSubmitBtn) onboardSubmitBtn.textContent = "Sync Profile 📲";

      if (bankInput) bankInput.required = false;
      if (cashInput) cashInput.required = false;
      if (investInput) investInput.required = false;
      if (swInput) swInput.required = false;

      onboardingMode = 'sync';
    });
  }

  // Onboarding/Sync Form Submit Handler
  const onboardingForm = document.getElementById('onboarding-form');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const phone = document.getElementById('onboard-phone').value.trim();
      const pin = document.getElementById('onboard-pin').value || '';

      if (!phone) {
        showToast("Phone number is required!", "error");
        return;
      }

      if (onboardingMode === 'sync') {
        showToast("Syncing profile from cloud... 🔄", "info");
        
        fetch(`/api/state?phone=${encodeURIComponent(phone)}`)
          .then(res => {
            if (res.status === 404) throw new Error("User not found");
            if (!res.ok) throw new Error("Sync failed");
            return res.json();
          })
          .then(parsedState => {
            // Secure sync password pin validation (if configured)
            if (parsedState.securityPin && parsedState.securityPin !== pin) {
              showToast("Incorrect security PIN password! ⚠️", "error");
              return;
            }

            state = parsedState;
            state.isOnboarded = true;
            
            saveState();
            checkOnboardingStatus();
            updateDashboardView();
            showToast("Profile synced successfully! 📲🔓", "success");
          })
          .catch(err => {
            if (err.message === "User not found") {
              showToast("No profile found with that phone number! ⚠️", "error");
            } else {
              showToast("Sync failed. Check if local proxy server is running! ⚠️", "error");
              console.error(err);
            }
          });
      } else {
        // First Time Onboard Mode
        const bank = Number(bankInput.value || 0);
        const cash = Number(cashInput.value || 0);
        const invest = Number(investInput.value || 0);
        const swNet = Number(swInput.value || 0);

        state.phone = phone;
        state.securityPin = pin;
        state.bankBalance = bank;
        state.cashBalance = cash;
        state.startingInvestments = invest;
        state.splitwiseBalance = swNet;
        state.transactions = [];
        state.isOnboarded = true;

        saveState();
        checkOnboardingStatus();
        updateDashboardView();
        showToast("Account onboarded successfully! 🚀", "success");
      }
    });
  }

  function checkOnboardingStatus() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
      if (state.isOnboarded) {
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
      }
    }
  }

  // Sticky Bottom Nav Tab click routing
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target');
      switchView(target);
    });
  });

  // 7. TRANSACTION LOGGING VIEW LOGIC
  const activityTypeOptions = document.querySelectorAll('#activity-type-selector .option-btn');
  
  // Transaction fields groups containers
  const txExpenseFields = document.getElementById('tx-expense-fields');
  const txIncomeFields = document.getElementById('tx-income-fields');
  const txInvestmentFields = document.getElementById('tx-investment-fields');
  const txSettlementFields = document.getElementById('tx-settlement-fields');

  let activeActivityType = 'expense';

  activityTypeOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      activityTypeOptions.forEach(btn => btn.classList.remove('active'));
      const targetType = e.currentTarget.getAttribute('data-type');
      e.currentTarget.classList.add('active');
      activeActivityType = targetType;

      // Toggle form field groups
      txExpenseFields.style.display = targetType === 'expense' ? 'block' : 'none';
      txIncomeFields.style.display = targetType === 'income' ? 'block' : 'none';
      txInvestmentFields.style.display = targetType === 'investment' ? 'block' : 'none';
      txSettlementFields.style.display = targetType === 'settlement' ? 'block' : 'none';
    });
  });

  // Expense Mode Payment selector toggle
  const paymodeOptions = document.querySelectorAll('#tx-expense-paymode .option-btn');
  const unpaidSplitTip = document.getElementById('unpaid-split-tip');
  let selectedPaymode = 'bank';

  paymodeOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      paymodeOptions.forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedPaymode = e.currentTarget.getAttribute('data-mode');

      // Show tip if Splitwise mode is active
      unpaidSplitTip.style.display = selectedPaymode === 'splitwise' ? 'block' : 'none';
    });
  });

  // Income Destination selector toggle
  const incomeDestOptions = document.querySelectorAll('#tx-income-dest .option-btn');
  let selectedIncomeDest = 'bank';
  incomeDestOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      incomeDestOptions.forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedIncomeDest = e.currentTarget.getAttribute('data-mode');
    });
  });

  // Investment Source selector toggle
  const investSourceOptions = document.querySelectorAll('#tx-investment-source .option-btn');
  let selectedInvestSource = 'bank';
  investSourceOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      investSourceOptions.forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedInvestSource = e.currentTarget.getAttribute('data-mode');
    });
  });

  // Settlement Options selectors toggle
  const settleDirectionOptions = document.querySelectorAll('#tx-settlement-direction .option-btn');
  const settlementSourceBlock = document.getElementById('settlement-source-label').parentNode;
  const settleSourceOptions = document.querySelectorAll('#tx-settlement-source .option-btn');
  
  let selectedSettleDirection = 'paid';
  let selectedSettleSource = 'bank';

  settleDirectionOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      settleDirectionOptions.forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedSettleDirection = e.currentTarget.getAttribute('data-mode');

      if (selectedSettleDirection === 'paid') {
        document.getElementById('settlement-source-label').textContent = "Account Used";
      } else {
        document.getElementById('settlement-source-label').textContent = "Deposit Into";
      }
    });
  });

  settleSourceOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      settleSourceOptions.forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedSettleSource = e.currentTarget.getAttribute('data-mode');
    });
  });

  // Pre-fill today's date
  const txDateInput = document.getElementById('tx-date');
  if (txDateInput) {
    txDateInput.value = new Date().toISOString().split('T')[0];
  }

  // Handle Transaction Form Submit
  const txForm = document.getElementById('transaction-form');
  if (txForm) {
    txForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amt = Number(document.getElementById('tx-amount').value);
      const desc = document.getElementById('tx-desc').value.trim();
      const date = document.getElementById('tx-date').value;

      if (!amt || amt <= 0 || !desc || !date) {
        showToast("Please enter all required transaction fields!", "error");
        return;
      }

      const tx = {
        id: Date.now().toString(),
        type: activeActivityType,
        amount: amt,
        desc: desc,
        date: date
      };

      if (activeActivityType === 'expense') {
        tx.payMode = selectedPaymode;
        tx.category = document.getElementById('tx-expense-category').value;
      } 
      else if (activeActivityType === 'income') {
        tx.incomeDest = selectedIncomeDest;
      } 
      else if (activeActivityType === 'investment') {
        tx.investSource = selectedInvestSource;
      } 
      else if (activeActivityType === 'settlement') {
        tx.settlementDirection = selectedSettleDirection;
        tx.settlementSource = selectedSettleSource;
      }

      state.transactions.push(tx);
      saveState();

      // Reset transaction form fields
      txForm.reset();
      document.getElementById('tx-amount').value = '';
      document.getElementById('tx-desc').value = '';
      if (txDateInput) {
        txDateInput.value = new Date().toISOString().split('T')[0];
      }

      // Switch back to Dashboard view
      switchView('dashboard-view');
      showToast("Activity recorded successfully! 💾", "success");
    });
  }

  // Settle Shortcut Click handler on Dashboard
  const shortcutSettleBtn = document.getElementById('dash-settle-shortcut');
  if (shortcutSettleBtn) {
    shortcutSettleBtn.addEventListener('click', () => {
      switchView('log-view');
      
      // Auto select the 'Settle' segment tab
      const settleOptBtn = document.querySelector('#activity-type-selector [data-type="settlement"]');
      if (settleOptBtn) settleOptBtn.click();

      // Calculate current Splitwise standing
      const calcs = getFinancialCalculations();
      const amountToSettle = Math.abs(calcs.netSplitwiseBal);
      document.getElementById('tx-amount').value = amountToSettle;
      document.getElementById('tx-desc').value = calcs.netSplitwiseBal < 0 ? "Settle Splitwise Debt" : "Receive Splitwise Settlement";

      // Auto select Direction
      const directionPaidBtn = document.querySelector('#tx-settlement-direction [data-mode="paid"]');
      const directionReceivedBtn = document.querySelector('#tx-settlement-direction [data-mode="received"]');
      
      if (calcs.netSplitwiseBal < 0) {
        if (directionPaidBtn) directionPaidBtn.click();
      } else {
        if (directionReceivedBtn) directionReceivedBtn.click();
      }
    });
  }

  // 8. SETTINGS ACTIONS AND UTILITIES
  const btnSyncManual = document.getElementById('btn-cloud-sync-manual');
  if (btnSyncManual) {
    btnSyncManual.addEventListener('click', () => {
      if (!state.phone) {
        showToast("Please log in / sync profile first! ⚠️", "error");
        return;
      }
      syncStateToCloud();
      showToast("Manual cloud synchronization triggered... 🔄", "info");
    });
  }

  const btnExport = document.getElementById('btn-export-backup');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `blingy_backup_${state.phone || 'local'}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
      showToast("Export backup downloaded! 📥", "success");
    });
  }

  const importFile = document.getElementById('import-file-selector');
  if (importFile) {
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const imported = JSON.parse(evt.target.result);
          if (imported.isOnboarded === undefined) {
            throw new Error("Invalid backup file format");
          }
          state = imported;
          saveState();
          checkOnboardingStatus();
          updateDashboardView();
          showToast("Data backup imported successfully! 📤", "success");
        } catch (err) {
          showToast("Import failed. Check file format! ⚠️", "error");
          console.error(err);
        }
      };
      reader.readAsText(file);
    });
  }

  const btnClearLocal = document.getElementById('btn-clear-local');
  if (btnClearLocal) {
    btnClearLocal.addEventListener('click', () => {
      if (confirm("🚨 WARNING: This will delete ALL logged expenses, investments, Splitwise balances, and chat history. Are you sure?")) {
        resetToDefault();
        updateDashboardView();
        
        const onboardForm = document.getElementById('onboarding-form');
        if (onboardForm) onboardForm.reset();
        
        checkOnboardingStatus();
        switchView('dashboard-view');
        showToast("All local data cleared! Let's start fresh. 💸", "warning");
      }
    });
  }

  const btnSyncLogout = document.getElementById('btn-sync-logout');
  if (btnSyncLogout) {
    btnSyncLogout.addEventListener('click', () => {
      if (confirm("🚪 Are you sure you want to log out? This will disconnect your device profile and clear local memory! (Your synced profile is safe in the cloud database).")) {
        resetToDefault();
        updateDashboardView();

        const onboardForm = document.getElementById('onboarding-form');
        if (onboardForm) onboardForm.reset();

        checkOnboardingStatus();
        switchView('dashboard-view');
        showToast("Disconnected profile successfully! 🚪", "info");
      }
    });
  }

  // History filtering listeners
  const filterTypeSelect = document.getElementById('filter-tx-type');
  const filterCatSelect = document.getElementById('filter-tx-cat');
  if (filterTypeSelect) filterTypeSelect.addEventListener('change', renderHistoryView);
  if (filterCatSelect) filterCatSelect.addEventListener('change', renderHistoryView);

  // Initialize UI View
  updateDashboardView();
});
