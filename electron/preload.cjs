/**
 * electron/preload.cjs
 *
 * The renderer's whole view of the system: `window.mecha`. CommonJS because a
 * sandboxed preload cannot be an ES module.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mecha', {
	setDirty: dirty => ipcRenderer.invoke('app:set-dirty', dirty),
	setTitle: title => ipcRenderer.invoke('app:set-title', title),
	about: () => ipcRenderer.invoke('app:about'),

	openProject: () => ipcRenderer.invoke('project:open'),
	saveProject: request => ipcRenderer.invoke('project:save', request),

	pickAsset: kind => ipcRenderer.invoke('asset:pick', kind),
	readAsset: path => ipcRenderer.invoke('asset:read', path),

	pickExportPath: request => ipcRenderer.invoke('export:pick', request),
	exportBegin: options => ipcRenderer.invoke('export:begin', options),
	exportFrame: (id, frame) => ipcRenderer.invoke('export:frame', id, frame),
	exportEnd: id => ipcRenderer.invoke('export:end', id),
	exportCancel: id => ipcRenderer.invoke('export:cancel', id),

	reveal: path => ipcRenderer.invoke('shell:reveal', path)
});
