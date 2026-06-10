const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { pathToFileURL } = require("node:url");

function nativeFilePath(filePath) {
  const match = String(filePath).match(/^\/mnt\/([A-Za-z])\/(.+)$/);
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}`;
  }
  return String(filePath);
}

contextBridge.exposeInMainWorld("codexDesktop", {
  invoke(command, args) {
    return ipcRenderer.invoke("desktop:invoke", command, args ?? {});
  },
  fileUrl(filePath) {
    return pathToFileURL(nativeFilePath(filePath)).toString();
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
});
