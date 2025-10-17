const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocketServer = require('./core/websocketServer');
const ComputeAgent = require('./modules/computeAgent');
const updateChecker = require('./utils/updateChecker');

let mainWindow;
let wsServer;
let computeAgent;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#2c2f33',
    icon: path.join(__dirname, '../public/icon.png')
  });

  mainWindow.loadFile('src/ui/index.html');

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Check if running in agent mode
  const agentConfigPath = path.join(__dirname, '../agentConfig.json');
  let isAgentMode = false;
  
  try {
    const agentConfig = JSON.parse(fs.readFileSync(agentConfigPath, 'utf8'));
    isAgentMode = agentConfig.enabled && agentConfig.mode === 'agent';
  } catch (error) {
    // No agent config, run in normal mode
  }

  if (isAgentMode) {
    // Run as compute agent (helper node)
    console.log('Starting in Agent Mode...');
    computeAgent = new ComputeAgent();
    await computeAgent.start();
    
    // Create minimal status window
    createAgentWindow();
  } else {
    // Run as normal (coordinator + UI)
    console.log('Starting in Coordinator Mode...');
    
    // Start WebSocket server with coordinator
    wsServer = new WebSocketServer();
    wsServer.start();

    createWindow();

    // Start update checker
    updateChecker.start();

    // Also start compute agent to contribute this machine's resources
    console.log('Starting local compute agent...');
    computeAgent = new ComputeAgent();
    await computeAgent.start();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isAgentMode) {
        createAgentWindow();
      } else {
        createWindow();
      }
    }
  });
});

function createAgentWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#2c2f33',
    icon: path.join(__dirname, '../public/icon.png')
  });

  mainWindow.loadFile('src/ui/agent.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (wsServer) {
      wsServer.stop();
    }
    if (computeAgent) {
      computeAgent.stop();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  if (wsServer) {
    wsServer.stop();
  }
  if (computeAgent) {
    computeAgent.stop();
  }
});

