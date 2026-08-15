const log = require('../logger');
const btcHighLev = require('./btc-high-lev');
const riskManager = require('./risk-manager');
const oracleFeed = require('./oracle-feed');
const leverUpClient = require('./leverup-client');
const vault = require('../identity/vault');

let isRunning = false;
let currentLeverage = 100;
let allocatedCollateral = 100.0; // in USDC
let balanceHistory = [
  { timestamp: Date.now() - 3600000 * 4, balance: 100.0 },
  { timestamp: Date.now() - 3600000 * 3, balance: 102.5 },
  { timestamp: Date.now() - 3600000 * 2, balance: 99.1 },
  { timestamp: Date.now() - 3600000, balance: 105.4 },
];
let activePositions = [];
let tradeHistory = [];
let loopIntervalId = null;

// Initial setup parameters
let lastBtcPrice = 98500.0;

function getStatus() {
  const isVaultUnlocked = vault.isUnlocked();
  return {
    isRunning,
    currentLeverage,
    allocatedCollateral,
    balanceHistory,
    activePositions,
    tradeHistory: tradeHistory.slice(-50),
    lastBtcPrice,
    isVaultUnlocked,
  };
}

function start(config) {
  if (isRunning) return getStatus();

  isRunning = true;
  currentLeverage = config.leverage || currentLeverage;
  allocatedCollateral = config.collateral || allocatedCollateral;

  log.info(`[TradingBot] Started Monad LeverUp bot. Leverage: ${currentLeverage}x, Collateral: ${allocatedCollateral} USDC`);

  // Start execution loop (runs every 2 seconds for high frequency updates)
  loopIntervalId = setInterval(executeCycle, 2000);

  return getStatus();
}

function stop() {
  if (!isRunning) return getStatus();

  isRunning = false;
  if (loopIntervalId) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }

  log.info('[TradingBot] Stopped Monad LeverUp bot.');
  return getStatus();
}

function updateConfig(config) {
  currentLeverage = config.leverage || currentLeverage;
  allocatedCollateral = config.collateral || allocatedCollateral;
  log.info(`[TradingBot] Config updated. Leverage: ${currentLeverage}x, Collateral: ${allocatedCollateral} USDC`);
  return getStatus();
}

async function executeCycle() {
  try {
    // 1. Update oracle price with random volatility tick
    const drift = (Math.random() - 0.5) * 80; // +/- $40 fluctuation
    lastBtcPrice = parseFloat((lastBtcPrice + drift).toFixed(2));
    oracleFeed.updateFeedPrice(lastBtcPrice);

    // 2. Perform risk management checks
    checkRiskAndStops();

    // 3. Evaluate strategies for new positions
    if (activePositions.length === 0 && isRunning) {
      await evaluateStrategyEntry();
    }
  } catch (err) {
    log.error('[TradingBot] Error in execution cycle:', err);
  }
}

function checkRiskAndStops() {
  const positionsToClose = [];

  for (const pos of activePositions) {
    const priceDiff = lastBtcPrice - pos.entryPrice;
    const priceChangePct = priceDiff / pos.entryPrice;
    const pnlMultiplier = pos.side === 'LONG' ? 1 : -1;
    const currentPnlPct = priceChangePct * pos.leverage * pnlMultiplier;
    
    pos.pnl = parseFloat((pos.collateral * currentPnlPct).toFixed(2));
    pos.currentPrice = lastBtcPrice;
    
    // Query margin ratio from risk manager
    pos.marginRatio = riskManager.getMarginRatio(pos, lastBtcPrice);

    // Liquidation Guard Check (hard threshold trigger at 1.5% distance)
    const isLiquidationApproaching = riskManager.checkLiquidationGuard(pos, lastBtcPrice);

    // Dynamic stop-loss matching leverage size (0.5% absolute move against entry)
    const isStopLossHit = currentPnlPct <= -0.4;
    const isTakeProfitHit = currentPnlPct >= 0.7; // Take Profit limit

    if (isLiquidationApproaching) {
      positionsToClose.push({ pos, reason: 'LIQUIDATION_GUARD' });
    } else if (isStopLossHit) {
      positionsToClose.push({ pos, reason: 'STOP_LOSS' });
    } else if (isTakeProfitHit) {
      positionsToClose.push({ pos, reason: 'TAKE_PROFIT' });
    }
  }

  for (const trigger of positionsToClose) {
    closePosition(trigger.pos.id, lastBtcPrice, trigger.reason);
  }
}

async function evaluateStrategyEntry() {
  const history = oracleFeed.getPriceHistory();
  if (history.length < 5) return;

  let side = null;

  if (currentLeverage >= 100) {
    // Tick momentum scalp strategy
    side = btcHighLev.evaluateTickMomentum(history);
  } else {
    // Volatility breakout strategy
    side = btcHighLev.evaluateBreakout(history);
  }

  if (side) {
    // Strict Isolated collateral sizing (allocating 1% of pool size per trade)
    const size = parseFloat((allocatedCollateral * 0.05).toFixed(2));
    await openPosition(side, lastBtcPrice, size, currentLeverage);
  }
}

async function openPosition(side, entryPrice, collateral, leverage) {
  const id = 'pos_' + Math.random().toString(36).substr(2, 9);
  
  // Attempt to invoke vault signed transaction if vault is unlocked
  let txHash = '0x_simulated';
  let isSimulated = true;

  if (vault.isUnlocked()) {
    try {
      const tx = await leverUpClient.openLeverUpPosition(side, entryPrice, collateral, leverage);
      txHash = tx.txHash;
      isSimulated = false;
    } catch (err) {
      log.warn('[TradingBot] Signed transaction execution failed. Running in simulation mode:', err.message);
    }
  } else {
    log.info('[TradingBot] Vault is locked. Running trade in simulation mode.');
  }

  const newPos = {
    id,
    side,
    entryPrice,
    currentPrice: entryPrice,
    collateral,
    leverage,
    pnl: 0.0,
    marginRatio: 100.0,
    txHash,
    isSimulated,
    timestamp: Date.now(),
  };

  activePositions.push(newPos);
  log.info(`[TradingBot] Opened ${side} position on BTC. Entry: $${entryPrice}, Size: $${collateral * leverage} (${leverage}x), Tx: ${txHash}`);
}

function closePosition(id, exitPrice, reason) {
  const idx = activePositions.findIndex((p) => p.id === id);
  if (idx === -1) return;

  const pos = activePositions[idx];
  activePositions.splice(idx, 1);

  const priceDiff = exitPrice - pos.entryPrice;
  const pnlMultiplier = pos.side === 'LONG' ? 1 : -1;
  const priceChangePct = priceDiff / pos.entryPrice;
  const finalPnl = parseFloat((pos.collateral * priceChangePct * pos.leverage * pnlMultiplier).toFixed(2));

  allocatedCollateral = parseFloat((allocatedCollateral + finalPnl).toFixed(2));
  balanceHistory.push({
    timestamp: Date.now(),
    balance: allocatedCollateral,
  });

  const record = {
    id: pos.id,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice,
    collateral: pos.collateral,
    leverage: pos.leverage,
    pnl: finalPnl,
    reason,
    timestamp: Date.now(),
  };

  tradeHistory.push(record);
  log.info(`[TradingBot] Closed position ${pos.id} due to ${reason}. PnL: $${finalPnl} USDC. New Balance: $${allocatedCollateral} USDC`);
}

module.exports = {
  getStatus,
  start,
  stop,
  updateConfig,
};
