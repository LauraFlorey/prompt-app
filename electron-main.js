const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE_NAME = 'promptforge-data.json';
const CONFIG_NAME = 'config.json';

// Keep a global reference of the window object
let mainWindow;

// ── Data path configuration ──────────────────────────────────────

function getDefaultDataPath() {
    return path.join(app.getPath('userData'), 'PromptForge');
}

function getConfigPath() {
    return path.join(app.getPath('userData'), CONFIG_NAME);
}

function readConfig() {
    try {
        const raw = fs.readFileSync(getConfigPath(), 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function writeConfig(config) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function getDataPath() {
    const config = readConfig();
    return config.dataPath || getDefaultDataPath();
}

function getDataFilePath() {
    return path.join(getDataPath(), FILE_NAME);
}

function ensureDataDir() {
    const dir = getDataPath();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function isWritable(dirPath) {
    try {
        const testFile = path.join(dirPath, '.pf_write_test');
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);
        return true;
    } catch {
        return false;
    }
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false,
            webSecurity: true
        },
        titleBarStyle: 'default',
        show: false // Don't show until ready
    });

    // Load the index.html file
    mainWindow.loadFile('index.html');

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Focus on window
        if (process.platform === 'darwin') {
            app.dock.show();
        }
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Create application menu
    createMenu();

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Prompt',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.executeJavaScript('if(window.app) window.app.clearForm();');
                    }
                },
                {
                    label: 'Save Prompt',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.executeJavaScript('if(window.app) window.app.savePromptToLibrary();');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Import Prompt Library',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            title: 'Import Prompt Library',
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });

                        if (!result.canceled && result.filePaths.length > 0) {
                            const fs = require('fs');
                            try {
                                const data = fs.readFileSync(result.filePaths[0], 'utf8');
                                const importedData = JSON.parse(data);
                                
                                mainWindow.webContents.executeJavaScript(`
                                    if(window.app && importedData) {
                                        if (Array.isArray(importedData)) {
                                            // Direct array import
                                            window.app.promptLibrary = importedData;
                                        } else if (importedData.promptLibrary) {
                                            // Full backup import
                                            window.app.promptLibrary = importedData.promptLibrary;
                                            if (importedData.srefLibrary) window.app.srefLibrary = importedData.srefLibrary;
                                            if (importedData.uploadedDocuments) window.app.uploadedDocuments = importedData.uploadedDocuments;
                                            if (importedData.manualInformation) window.app.manualInformation = importedData.manualInformation;
                                        }
                                        window.app.saveToLocalStorage('promptLibrary', window.app.promptLibrary);
                                        window.app.loadPromptLibrary();
                                        alert('Import successful!');
                                    }
                                `);
                            } catch (error) {
                                dialog.showErrorBox('Import Error', 'Failed to import file: ' + error.message);
                            }
                        }
                    }
                },
                {
                    label: 'Export Prompt Library',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: 'Export Prompt Library',
                            defaultPath: 'prompt-library.json',
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });

                        if (!result.canceled) {
                            mainWindow.webContents.executeJavaScript(`
                                if(window.app) {
                                    const data = JSON.stringify(window.app.promptLibrary, null, 2);
                                    const blob = new Blob([data], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = '${path.basename(result.filePath)}';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            `);
                        }
                    }
                },
                {
                    label: 'Export Style References',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: 'Export Style Reference Library',
                            defaultPath: 'sref-library.json',
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });

                        if (!result.canceled) {
                            mainWindow.webContents.executeJavaScript(`
                                if(window.app) {
                                    const data = JSON.stringify(window.app.srefLibrary, null, 2);
                                    const blob = new Blob([data], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = '${path.basename(result.filePath)}';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            `);
                        }
                    }
                },
                {
                    label: 'Export All Data',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: 'Export All App Data',
                            defaultPath: 'ai-prompt-generator-backup.json',
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });

                        if (!result.canceled) {
                            mainWindow.webContents.executeJavaScript(`
                                if(window.app) {
                                    const allData = {
                                        promptLibrary: window.app.promptLibrary,
                                        srefLibrary: window.app.srefLibrary,
                                        uploadedDocuments: window.app.uploadedDocuments,
                                        manualInformation: window.app.manualInformation,
                                        exportDate: new Date().toISOString(),
                                        version: '1.1.0'
                                    };
                                    const data = JSON.stringify(allData, null, 2);
                                    const blob = new Blob([data], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = '${path.basename(result.filePath)}';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            `);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectall' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Prompt Helper',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Prompt Helper',
                            message: 'Prompt Helper',
                            detail: 'Version 2.0.0\n\nA comprehensive tool for generating, managing, and optimizing prompts for various AI models.\n\nNew Features:\n• Local LLM integration for enhanced analysis\n• Advanced search and filtering\n• Improved mobile responsiveness\n• Dark mode support\n• Enhanced content analysis\n\nBuilt with Electron and Bootstrap 5.',
                            buttons: ['OK']
                        });
                    }
                },
                {
                    label: 'Learn More',
                    click: () => {
                        shell.openExternal('https://github.com');
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideothers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });

        // Window menu
        template[4].submenu = [
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ─────────────────────────────────────────────────

ipcMain.handle('pf:getDataPath', async () => {
    return getDataPath();
});

ipcMain.handle('pf:setDataPath', async (_event, newPath) => {
    try {
        if (!fs.existsSync(newPath)) {
            return { success: false, error: 'Path does not exist' };
        }
        if (!isWritable(newPath)) {
            return { success: false, error: 'Path is not writable' };
        }
        const config = readConfig();
        config.dataPath = newPath;
        writeConfig(config);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pf:chooseFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose PromptForge Data Folder',
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
    }
    const chosen = result.filePaths[0];
    const config = readConfig();
    config.dataPath = chosen;
    writeConfig(config);
    return { success: true, path: chosen };
});

ipcMain.handle('pf:readData', async () => {
    try {
        const filePath = getDataFilePath();
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('pf:readData error:', e.message);
        return null;
    }
});

ipcMain.handle('pf:writeData', async (_event, dataObject) => {
    try {
        ensureDataDir();
        const filePath = getDataFilePath();
        const tmpPath = filePath + '.tmp';
        const json = JSON.stringify(dataObject, null, 2);
        fs.writeFileSync(tmpPath, json, 'utf8');
        fs.renameSync(tmpPath, filePath);
        return { success: true };
    } catch (e) {
        console.error('pf:writeData error:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pf:getStorageInfo', async () => {
    const filePath = getDataFilePath();
    const exists = fs.existsSync(filePath);
    let fileSizeBytes = 0;
    let lastModified = null;
    if (exists) {
        const stat = fs.statSync(filePath);
        fileSizeBytes = stat.size;
        lastModified = stat.mtime.toISOString();
    }
    return {
        path: getDataPath(),
        exists,
        fileSizeBytes,
        lastModified
    };
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Security: Prevent navigation to external websites
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (navigationEvent, url) => {
        const parsedUrl = new URL(url);
        
        if (parsedUrl.origin !== 'file://') {
            navigationEvent.preventDefault();
        }
    });
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // In production, you should implement proper certificate validation
    event.preventDefault();
    callback(false);
});
