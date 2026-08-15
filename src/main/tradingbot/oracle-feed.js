/**
 * Low-Latency Oracle Price Feed (Pyth/Redstone Integration Client)
 */
const log = require('../logger');

let latestBtcPrice = 98500.0;
const priceHistory = [];

/**
 * Resolves the latest index price for the trading pair.
 * In production, this queries the Pyth HTTP/WebSocket benchmark endpoints on Monad.
 * @returns {Promise<number>} Latest asset price
 */
async function getLatestPrice() {
  // Simulate Pyth Oracle HTTP retrieval or cache lookup
  return parseFloat(latestBtcPrice.toFixed(2));
}

/**
 * Updates the local cached price (simulating real-time feed updates)
 * @param {number} nextPrice - The next price update
 */
function updateFeedPrice(nextPrice) {
  latestBtcPrice = nextPrice;
  priceHistory.push(nextPrice);
  if (priceHistory.length > 100) {
    priceHistory.shift();
  }
}

/**
 * Retrieves the cached history of tick prices
 * @returns {Array<number>} Price history ticks
 */
function getPriceHistory() {
  return priceHistory;
}

module.exports = {
  getLatestPrice,
  updateFeedPrice,
  getPriceHistory,
};
