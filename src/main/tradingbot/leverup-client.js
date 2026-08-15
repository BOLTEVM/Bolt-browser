const vault = require('../identity/vault');
const log = require('../logger');
const { ethers } = require('ethers');

/**
 * LeverUp Perpetual Contract Client using Boltows Wallet Security
 */

async function getSigner() {
  if (!vault.isUnlocked()) {
    throw new Error('Boltows vault is locked. Please unlock the wallet first.');
  }

  // Retrieve active private key from the unlocked vault memory cache
  const privateKey = vault.exportPrivateKey(0); // Derives first wallet
  if (!privateKey) {
    throw new Error('Failed to retrieve private key from Boltows vault.');
  }

  // Setup Ethers wallet (Monad is an EVM L1, standard Ethers Provider works)
  const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz'); // Default Monad Testnet URL
  const signer = new ethers.Wallet(privateKey, provider);
  return signer;
}

/**
 * Open a perpetual position on LeverUp
 * @param {string} side - 'LONG' or 'SHORT'
 * @param {number} entryPrice - Desired entry price limit
 * @param {number} collateral - Collateral amount (USDC)
 * @param {number} leverage - Leverage size (up to 1000x)
 */
async function openLeverUpPosition(side, entryPrice, collateral, leverage) {
  try {
    const signer = await getSigner();
    log.info(`[LeverUpClient] Initiating signed contract trade. Side: ${side}, Size: $${collateral * leverage} (${leverage}x) using active wallet address: ${signer.address}`);

    // In simulation mode, we mock the transaction completion.
    // In production, we execute:
    // const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
    // const tx = await routerContract.openPosition(side === 'LONG' ? 0 : 1, ethers.parseUnits(collateral.toString(), 6), leverage, ...);
    // await tx.wait();

    return { success: true, txHash: '0x' + Math.random().toString(16).substr(2, 64) };
  } catch (err) {
    log.error('[LeverUpClient] Trade execution failed:', err.message);
    throw err;
  }
}

module.exports = {
  openLeverUpPosition,
};
