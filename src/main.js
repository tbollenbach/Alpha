const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocketServer = require('./core/websocketServer');
const updateChecker = require('./utils/updateChecker');

let mainWindow;
let wsServer;

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

app.whenReady().then(() => {
  // Start WebSocket server
  wsServer = new WebSocketServer();
  wsServer.start();

  createWindow();

  // Start update checker
  updateChecker.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (wsServer) {
      wsServer.stop();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  if (wsServer) {
    wsServer.stop();
  }
});

