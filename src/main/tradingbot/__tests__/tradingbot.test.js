const riskManager = require('../risk-manager');
const btcHighLev = require('../btc-high-lev');

describe('Monad LeverUp Trading Bot Logic', () => {
  describe('Risk Manager & Liquidation Math', () => {
    test('calculates correct liquidation price for 100x Long', () => {
      const entryPrice = 100000;
      const leverage = 100;
      const side = 'LONG';

      // factor = 1 - (1/100) + 0.005 = 1 - 0.01 + 0.005 = 0.995
      const expectedLiq = 100000 * 0.995;
      expect(riskManager.calculateLiquidationPrice(entryPrice, leverage, side)).toBe(expectedLiq);
    });

    test('calculates correct liquidation price for 1000x Long', () => {
      const entryPrice = 100000;
      const leverage = 1000;
      const side = 'LONG';

      // factor = 1 - (1/1000) + 0.005 = 1 - 0.001 + 0.005 = 1.004
      // Note: for 1000x, maintenance margin (0.5%) exceeds leverage span (0.1%),
      // meaning entry is extremely close to liquidation limit.
      const expectedLiq = 100000 * 1.004;
      expect(riskManager.calculateLiquidationPrice(entryPrice, leverage, side)).toBe(expectedLiq);
    });

    test('liquidation guard triggers on safety margin buffer', () => {
      const position = {
        entryPrice: 100000,
        leverage: 100,
        side: 'LONG',
      };

      const liqPrice = riskManager.calculateLiquidationPrice(position.entryPrice, position.leverage, position.side);
      // Liq price is 99500. Safety buffer (1.5%) is 99500 * 1.015 = 100992.5
      
      // Price is safe
      expect(riskManager.checkLiquidationGuard(position, 102000)).toBe(false);
      
      // Price enters danger zone (below 100992.5)
      expect(riskManager.checkLiquidationGuard(position, 100500)).toBe(true);
    });
  });

  describe('Bitcoin High-Leverage Strategy Indicators', () => {
    test('tick momentum evaluates LONG on rising ticks', () => {
      const risingTicks = [98000, 98100, 98200, 98300, 98400];
      expect(btcHighLev.evaluateTickMomentum(risingTicks)).toBe('LONG');
    });

    test('tick momentum evaluates SHORT on falling ticks', () => {
      const fallingTicks = [98400, 98300, 98200, 98100, 98000];
      expect(btcHighLev.evaluateTickMomentum(fallingTicks)).toBe('SHORT');
    });

    test('tick momentum returns null on flat ticks', () => {
      const flatTicks = [98000, 98000, 98000, 98000, 98000];
      expect(btcHighLev.evaluateTickMomentum(flatTicks)).toBeNull();
    });
  });
});
