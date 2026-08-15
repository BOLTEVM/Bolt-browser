/**
 * High-Leverage Risk Manager & Liquidation Guard
 */

/**
 * Calculates the liquidation price based on leverage and trade direction.
 * Standard maintenance margin requirement assumed at 0.5% (common for high leverage).
 * @param {number} entryPrice - Entry price of position
 * @param {number} leverage - Leverage (20x - 1000x)
 * @param {string} side - 'LONG' or 'SHORT'
 * @returns {number} Liquidation price
 */
function calculateLiquidationPrice(entryPrice, leverage, side) {
  const mm = 0.005; // 0.5% Maintenance Margin
  const directionMultiplier = side === 'LONG' ? 1 : -1;

  // Formula: LiqPrice = EntryPrice * (1 - (1 / Leverage) + MM) for Longs
  // Formula: LiqPrice = EntryPrice * (1 + (1 / Leverage) - MM) for Shorts
  const factor = 1 - (1 / leverage * directionMultiplier) + (mm * directionMultiplier);
  return parseFloat((entryPrice * factor).toFixed(2));
}

/**
 * Validates if the position is approaching liquidation (safety buffer of 1.5% distance to liq price)
 * @param {object} position - Active position object
 * @param {number} currentPrice - Current market price
 * @returns {boolean} True if stop loss/liquidation trigger is reached
 */
function checkLiquidationGuard(position, currentPrice) {
  const liqPrice = calculateLiquidationPrice(position.entryPrice, position.leverage, position.side);
  
  if (position.side === 'LONG') {
    // If current price drops near or below the liquidation threshold (e.g. 1.2x of distance to liquidation)
    const safetyThreshold = liqPrice * 1.015; // 1.5% safety buffer
    return currentPrice <= safetyThreshold;
  } else {
    const safetyThreshold = liqPrice * 0.985; // 1.5% safety buffer
    return currentPrice >= safetyThreshold;
  }
}

/**
 * Calculates current margin ratio
 * @param {object} position - Active position object
 * @param {number} currentPrice - Current price
 * @returns {number} Margin ratio percentage (0 to 100)
 */
function getMarginRatio(position, currentPrice) {
  const liqPrice = calculateLiquidationPrice(position.entryPrice, position.leverage, position.side);
  const totalSpan = Math.abs(position.entryPrice - liqPrice);
  const remainingSpan = Math.abs(currentPrice - liqPrice);

  if (position.side === 'LONG' && currentPrice <= liqPrice) return 0;
  if (position.side === 'SHORT' && currentPrice >= liqPrice) return 0;

  return parseFloat(((remainingSpan / totalSpan) * 100).toFixed(2));
}

module.exports = {
  calculateLiquidationPrice,
  checkLiquidationGuard,
  getMarginRatio,
};
