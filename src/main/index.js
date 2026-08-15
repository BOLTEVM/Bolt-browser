// Set app name early, before electron-log initializes (it uses app name for log path)
const { app } = require('electron');
const appName = process.platform === 'linux' ? 'Bolt' : 'Bolt';

// Suppress Electron security warnings in development (CSP handles security in production)
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

app.name = appName;
app.setName(appName);

const { version } = require('../../package.json');
const iconPath = app.isPackaged
  ? require('path').join(process.resourcesPath, 'assets', 'icon.png')
  : require('path').join(__dirname, '..', '..', 'assets', 'icon.png');

app.setAboutPanelOptions({
  applicationName: 'Bolt',
  applicationVersion: version,
  version: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
  copyright: '© 2025-2026 Bolt Team\nCopyleft — MPL-2.0',
  credits: 'A browser for the decentralized web\nSwarm · IPFS · ENS',
  website: 'https://Boltbrowser.eth.limo/',
  iconPath,
});

const log = require('./logger');

// Global error handlers - must be set up early
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, _promise) => {
  log.error('Unhandled rejection:', reason);
});

const { BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerBaseIpcHandlers } = require('./ipc-handlers');
const { registerRequestRewriter } = require('./request-rewriter');
const { registerSettingsIpc, loadSettings } = require('./settings-store');
const { registerBookmarksIpc } = require('./bookmarks-store');
const { registerHistoryIpc, closeDb: closeHistoryDb } = require('./history');
const { registerFaviconsIpc } = require('./favicons');
const { registerEnsIpc } = require('./ens-resolver');
const { registerBeeIpc, stopBee, startBee, setUseInjectedIdentity: setBeeInjectedIdentity } = require('./bee-manager');
const { registerIpfsIpc, stopIpfs, startIpfs, setUseInjectedIdentity: setIpfsInjectedIdentity } = require('./ipfs-manager');
const { registerRadicleIpc, stopRadicle, startRadicle, setUseInjectedIdentity: setRadicleInjectedIdentity } = require('./radicle-manager');
const { registerIdentityIpc, hasVault, isBeeIdentityInjected, isIpfsIdentityInjected, isRadicleIdentityInjected } = require('./identity-manager');
const { registerQuickUnlockIpc } = require('./quick-unlock');
const { registerWalletIpc } = require('./wallet/wallet-ipc');
const { registerChainRegistryIpc } = require('./chain-registry');
const { registerRpcManagerIpc } = require('./wallet/rpc-manager');
const { registerDappPermissionsIpc } = require('./wallet/dapp-permissions');
const { registerSwarmIpc } = require('./swarm/stamp-service');
const { registerPublishIpc } = require('./swarm/publish-service');
const { registerPublishHistoryIpc, closeDb: closePublishHistoryDb } = require('./swarm/publish-history');
const { registerSwarmPermissionsIpc } = require('./swarm/swarm-permissions');
const { registerSwarmProviderIpc } = require('./swarm/swarm-provider-ipc');
const { registerFeedStoreIpc } = require('./swarm/feed-store');
const { registerDSwarmIpc, getDSwarmManager } = require('./dswarm/dswarm-manager');
const { registerFreenetIpc, getFreenetManager } = require('./freenet-manager');
const { registerGithubBridgeIpc, cleanupTempDirs } = require('./github-bridge');
const { registerServiceRegistryIpc } = require('./service-registry');
const { createMainWindow, setWindowTitle, getMainWindows } = require('./windows/mainWindow');
const tradingBot = require('./tradingbot/tradingbot-service');
const { migrateUserData } = require('./migrate-user-data');
const { initUpdater } = require('./updater');
const { setupApplicationMenu, updateTabMenuItems } = require('./menu');
const { registerWebContentsHandlers } = require('./webcontents-setup');

app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

const crashDir = path.join(__dirname, 'crash-reports');
app.setPath('crashDumps', crashDir);

function allowInteractivePermissions(targetSession) {
  if (!targetSession || !targetSession.setPermissionRequestHandler) {
    return;
  }
  targetSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'pointerLock' || permission === 'fullscreen') {
      log.info(`[permissions] granting ${permission} for`, webContents.getURL());
      callback(true);
      return;
    }
    callback(false);
  });
}

function getUrlFromArgs(args) {
  if (!args || args.length < 2) return null;
  const startIndex = (args[1] === '.' || args[1] === './' || args[1] === '..') ? 2 : 1;
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      continue;
    }
    if (/^(https?|ipfs|ipns|bzz|bolt):\/\//i.test(arg)) {
      return arg;
    }
    if (arg.includes('.') && !arg.endsWith('.js') && !arg.endsWith('.json') && !arg.includes('/') && !arg.includes('\\')) {
      return `http://${arg}`;
    }
  }
  return null;
}

async function bootstrap() {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    log.info('[App] Another instance is already running. Quitting...');
    app.quit();
    return;
  }

  app.on('second-instance', (event, commandLine) => {
    log.info('[App] Second instance launch attempt. Command line:', commandLine);
    const windows = getMainWindows();
    if (windows.length > 0) {
      const myWindow = windows[0];
      if (myWindow.isMinimized()) myWindow.restore();
      myWindow.focus();

      const url = getUrlFromArgs(commandLine);
      if (url) {
        log.info(`[App] Opening new tab for URL from second instance: ${url}`);
        myWindow.webContents.send('tab:new-with-url', url);
      }
    } else {
      const url = getUrlFromArgs(commandLine);
      createMainWindow(url);
    }
  });

  // Migrate user data from old "Bolt Browser" directory if needed
  // This must run before any modules access userData
  migrateUserData();

  const defaultSession = session.defaultSession;
  await defaultSession.clearCache();

  // Load Boltows extension if enabled
  const settings = loadSettings();
  if (settings.enableBoltowsExtension) {
    const extensionPath = path.resolve(__dirname, '..', '..', '..', 'boltows', 'apps', 'extension', 'dist');
    if (fs.existsSync(extensionPath)) {
      try {
        const ext = await defaultSession.loadExtension(extensionPath, { allowFileAccess: true });
        log.info(`[App] Loaded Boltows wallet extension. ID: ${ext.id}`);
        global.boltowsExtensionId = ext.id;
      } catch (err) {
        log.error('[App] Failed to load Boltows wallet extension:', err);
      }
    } else {
      log.warn(`[App] Boltows wallet extension path does not exist: ${extensionPath}`);
    }
  }

  // Register Boltows extension ID query IPC
  ipcMain.handle('wallet:get-boltows-extension-id', () => {
    return global.boltowsExtensionId || null;
  });

  // Listen for dynamic settings update in the main process
  app.on('settings-updated', async (merged) => {
    const extensionPath = path.resolve(__dirname, '..', '..', '..', 'boltows', 'apps', 'extension', 'dist');
    if (merged.enableBoltowsExtension && !global.boltowsExtensionId) {
      if (fs.existsSync(extensionPath)) {
        try {
          const ext = await defaultSession.loadExtension(extensionPath, { allowFileAccess: true });
          log.info(`[App] Dynamically loaded Boltows extension: ${ext.id}`);
          global.boltowsExtensionId = ext.id;
        } catch (err) {
          log.error('[App] Failed to dynamically load Boltows extension:', err);
        }
      }
    } else if (!merged.enableBoltowsExtension && global.boltowsExtensionId) {
      try {
        await defaultSession.removeExtension(global.boltowsExtensionId);
        log.info(`[App] Dynamically removed Boltows extension: ${global.boltowsExtensionId}`);
        global.boltowsExtensionId = null;
      } catch (err) {
        log.error('[App] Failed to dynamically remove Boltows extension:', err);
      }
    }
  });

  registerBaseIpcHandlers({
    onSetTitle: setWindowTitle,
    onNewWindow: createMainWindow,
  });
  registerSettingsIpc();
  registerBookmarksIpc();
  registerHistoryIpc();
  registerFaviconsIpc();
  registerEnsIpc();
  registerBeeIpc();
  registerIpfsIpc();
  registerRadicleIpc();
  registerGithubBridgeIpc();
  registerServiceRegistryIpc();
  registerIdentityIpc();
  registerQuickUnlockIpc();
  registerWalletIpc();
  registerChainRegistryIpc();
  registerRpcManagerIpc();
  registerDappPermissionsIpc();
  registerSwarmIpc();
  registerPublishIpc();
  registerPublishHistoryIpc();
  registerSwarmPermissionsIpc();
  registerSwarmProviderIpc();
  registerFeedStoreIpc();
  registerDSwarmIpc();
  registerFreenetIpc();
  registerRequestRewriter(defaultSession);
  allowInteractivePermissions(defaultSession);

  // Trading bot IPC handlers
  ipcMain.handle('tradingbot:get-status', () => {
    return tradingBot.getStatus();
  });
  ipcMain.handle('tradingbot:start', (event, config) => {
    return tradingBot.start(config);
  });
  ipcMain.handle('tradingbot:stop', () => {
    return tradingBot.stop();
  });
  ipcMain.handle('tradingbot:update-config', (event, config) => {
    return tradingBot.updateConfig(config);
  });
  registerWebContentsHandlers();
  setupApplicationMenu();

  // Check identity vault and key status
  // Three scenarios:
  // 1. Vault exists + keys injected → use derived keys, start nodes
  // 2. No vault + keys exist → user skipped onboarding, use random keys, start nodes
  // 3. No vault + no keys → true first run, defer to onboarding wizard
  let vaultExists = false;
  let keysExist = false;
  try {
    vaultExists = await hasVault();
    keysExist = isBeeIdentityInjected() || isIpfsIdentityInjected() || isRadicleIdentityInjected();

    if (vaultExists) {
      log.info('[App] Identity vault found, enabling injected identity mode');
      setBeeInjectedIdentity(true);
      setIpfsInjectedIdentity(true);
      setRadicleInjectedIdentity(true);
    } else if (keysExist) {
      log.info('[App] No vault but keys exist - user previously skipped onboarding');
      // Don't enable injected identity mode - these are random keys, not derived
    } else {
      log.info('[App] No vault and no keys - waiting for onboarding');
    }
  } catch (err) {
    log.error('[App] Failed to check vault status:', err.message);
  }

  const settings = loadSettings();

  // Start nodes automatically if:
  // - Vault exists and keys are injected (completed onboarding), OR
  // - No vault but keys exist (skipped onboarding, using random keys)
  // If no vault AND no keys, defer to onboarding wizard (renderer handles this)
  if (vaultExists || keysExist) {
    if (settings.startBeeAtLaunch && isBeeIdentityInjected()) {
      startBee();
    }
    if (settings.startIpfsAtLaunch && isIpfsIdentityInjected()) {
      startIpfs();
    }
    if (settings.startRadicleAtLaunch && isRadicleIdentityInjected()) {
      startRadicle();
    }
  } else {
    log.info('[App] Deferring node startup until onboarding completes');
  }
  if (settings.enableRadicleIntegration && settings.startRadicleAtLaunch) {
    startRadicle();
  }

  const initialUrl = getUrlFromArgs(process.argv);
  const mainWindow = createMainWindow(initialUrl);

  // Initialize auto-updater (pass menu update callback)
  initUpdater(mainWindow, setupApplicationMenu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  updateTabMenuItems();
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // Note: Bee is stopped in 'before-quit' handler, not here,
  // so it keeps running on macOS when all windows are closed
});

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (isQuitting) return;

  event.preventDefault();
  isQuitting = true;

  // Close all DevTools first to prevent crashes during cleanup
  log.info('[App] Closing all DevTools...');
  for (const win of getMainWindows()) {
    try {
      win.webContents.send('devtools:close-all');
    } catch {
      // Window might already be closing
    }
  }

  // Small delay to allow DevTools to close
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Close all windows first, before winding down peers
  log.info('[App] Closing all windows...');
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    await Promise.all(
      allWindows.map((win) => {
        return new Promise((resolve) => {
          if (win.isDestroyed()) {
            resolve();
            return;
          }
          win.once('closed', resolve);
          win.destroy();
        });
      })
    );
  }
  log.info('[App] All windows closed');

  // Close history databases
  log.info('[App] Closing history databases...');
  closeHistoryDb();
  closePublishHistoryDb();

  // Clean up any GitHub bridge temp directories
  cleanupTempDirs();

  log.info('[App] Waiting for Bee, IPFS, Radicle, DSwarm, and Freenet to stop...');
  await Promise.all([stopBee(), stopIpfs(), stopRadicle(), getDSwarmManager().stop(), getFreenetManager().stop()]);
  log.info('[App] All processes stopped, quitting...');


  app.quit();
});

app.on('browser-window-created', () => {
  updateTabMenuItems();
});
