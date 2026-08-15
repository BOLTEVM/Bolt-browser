/**
 * High-Leverage Bitcoin Perpetual Trading Strategies (20x - 1000x)
 */

/**
 * Evaluates 100x–1000x ultra-leverage micro-scalping (Tick Momentum)
 * @param {Array} priceTicks - Historical price ticks
 * @returns {string|null} 'LONG', 'SHORT', or null
 */
function evaluateTickMomentum(priceTicks) {
  if (priceTicks.length < 5) return null;

  // Take the last 5 ticks to calculate short term momentum
  const recent = priceTicks.slice(-5);
  let ups = 0;
  let downs = 0;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i] > recent[i - 1]) ups++;
    if (recent[i] < recent[i - 1]) downs++;
  }

  // Strong momentum indicator
  if (ups >= 3 && recent[4] > recent[0]) {
    return 'LONG';
  }
  if (downs >= 3 && recent[4] < recent[0]) {
    return 'SHORT';
  }

  return null;
}

/**
 * Evaluates 20x–50x Volatility Breakout strategy
 * @param {Array} prices - Array of historical prices
 * @returns {string|null} 'LONG', 'SHORT', or null
 */
function evaluateBreakout(prices) {
  if (prices.length < 20) return null;

  // Simple Bollinger Band calculation
  const period = 20;
  const sliced = prices.slice(-period);
  const sum = sliced.reduce((a, b) => a + b, 0);
  const mean = sum / period;

  const variance = sliced.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upperBand = mean + 2 * stdDev;
  const lowerBand = mean - 2 * stdDev;
  const currentPrice = prices[prices.length - 1];

  if (currentPrice > upperBand) {
    return 'LONG'; // Breakout above resistance
  }
  if (currentPrice < lowerBand) {
    return 'SHORT'; // Breakout below support
  }

  return null;
}

module.exports = {
  evaluateTickMomentum,
  evaluateBreakout,
};
