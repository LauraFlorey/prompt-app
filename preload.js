const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDataPath:  ()     => ipcRenderer.invoke('pf:getDataPath'),
    setDataPath:  (p)    => ipcRenderer.invoke('pf:setDataPath', p),
    chooseFolder: ()     => ipcRenderer.invoke('pf:chooseFolder'),
    readData:     ()     => ipcRenderer.invoke('pf:readData'),
    writeData:    (data) => ipcRenderer.invoke('pf:writeData', data),
    getStorageInfo: ()   => ipcRenderer.invoke('pf:getStorageInfo'),
    isElectron: true
});
