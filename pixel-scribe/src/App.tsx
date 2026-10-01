import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { FolderSearch, Undo, Redo, ChevronDown, ChevronUp, Play, CheckCircle2, XCircle, ArrowRight, GripHorizontal, Settings, X, Save } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface FileTask {
  id: string;
  name?: string;
  status: "waiting" | "processing" | "completed" | "error" | "undone";
  progress: number;
  message: string;
  old_name?: string;
  new_name?: string;
  old_path?: string;
  new_path?: string;
}

interface CleanupTask {
  id: string;
  path: string;
  name: string;
  ignored: boolean;
  status: "pending" | "processing" | "completed" | "error" | "undone";
  newName?: string;
  newPath?: string;
}

const MAX_ITEMS = 5;

function trimName(name: string, maxLen = 18): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  if (base.length + ext.length <= maxLen) return name;
  return base.slice(0, maxLen - ext.length - 1) + "…" + ext;
}

function IndeterminateCheckbox({ checked, indeterminate, onChange, disabled }: { checked: boolean, indeterminate: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return <input type="checkbox" ref={ref} checked={checked} onChange={onChange} disabled={disabled} />;
}

function CircleProgress({ pct, status }: { pct: number; status: string }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  if (status === "error") return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#374151" strokeWidth="2.5" />
      <text x="14" y="19" textAnchor="middle" fontSize="12" fill="#ef4444">✕</text>
    </svg>
  );
  if (status === "completed") return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#22c55e" strokeWidth="2.5" />
      <text x="14" y="19" textAnchor="middle" fontSize="11" fill="#22c55e">✓</text>
    </svg>
  );
  if (status === "undone") return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#6b7280" strokeWidth="2.5" />
      <text x="14" y="19" textAnchor="middle" fontSize="12" fill="#9ca3af">↩</text>
    </svg>
  );

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="14" cy="14" r={r} fill="none" stroke="#1f2937" strokeWidth="2.5" />
      <motion.circle
        cx="14" cy="14" r={r}
        fill="none" stroke="#3b82f6" strokeWidth="2.5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ}` }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      />
    </svg>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [minimized, setMinimized] = useState(true);
  const [activeTab, setActiveTab] = useState<"live" | "cleanup">("live");
  const [cleanupFiles, setCleanupFiles] = useState<CleanupTask[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ apiKey: "", model: "meta/llama-3.2-11b-vision-instruct" });
  const [savingSettings, setSavingSettings] = useState(false);
  const appWindow = useRef(getCurrentWindow());

  useEffect(() => {
    const win = appWindow.current;
    win.setShadow(false).catch(console.error);
    invoke<string>("get_default_folder").then(setCurrentFolder).catch(console.error);
    invoke<[string, string]>("get_settings").then(([apiKey, model]) => {
      setSettings({ apiKey, model });
    }).catch(console.error);

    const unlistenP = listen<FileTask>("file-processing", (event) => {
      const payload = event.payload;
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === payload.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...payload };
          return next;
        }
        return [payload, ...prev].slice(0, MAX_ITEMS);
      });
    });
    return () => { unlistenP.then((f) => f()); };
  }, []);

  // auto-resize window
  useEffect(() => {
    const win = appWindow.current;
    
    if (minimized) {
      const timeout = setTimeout(() => {
        win.setSize(new LogicalSize(48, 48)).catch(console.error);
      }, 100);
      return () => clearTimeout(timeout);
    } else if (showSettings) {
      const timeout = setTimeout(() => {
        win.setSize(new LogicalSize(360, 260)).catch(console.error);
      }, 100);
      return () => clearTimeout(timeout);
    } else {
      let h = 44;
      if (activeTab === "live") {
        const rowCount = Math.max(1, tasks.length);
        h = Math.min(44 + rowCount * 46 + 16, 340);
      } else {
        const topActions = 52;
        const selectAll = cleanupFiles.length > 0 ? 32 : 0;
        
        let listHeight = 0;
        if (cleanupFiles.length === 0 && !isScanning) {
          listHeight = 60; // Empty state height
        } else {
          listHeight = Math.min(cleanupFiles.length * 36, 210);
        }
        
        const hasPending = cleanupFiles.some(f => f.status === "pending" && !f.ignored);
        const bottomActions = hasPending ? 64 : 0;
        h = 44 + topActions + selectAll + listHeight + bottomActions + 16; // padding buffer
      }
      
      const timeout = setTimeout(() => {
        win.setSize(new LogicalSize(360, h)).catch(console.error);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [tasks.length, cleanupFiles, minimized, activeTab, showSettings]);

  const handleUndo = async (task: FileTask) => {
    if (!task.old_path || !task.new_path) return;
    try {
      await invoke("rename_file", { oldPath: task.new_path, newPath: task.old_path });
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "undone", message: "Reverted" } : t));
    } catch (e) { console.error(e); }
  };

  const handleRedo = async (task: FileTask) => {
    if (!task.old_path || !task.new_path) return;
    try {
      await invoke("rename_file", { oldPath: task.old_path, newPath: task.new_path });
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "completed", message: "Renaming complete" } : t));
    } catch (e) { console.error(e); }
  };

  const scanFolders = async (folder?: string) => {
    let targetFolder = folder || currentFolder;
    if (!targetFolder) {
      try {
        targetFolder = await invoke<string>("get_default_folder");
        setCurrentFolder(targetFolder);
      } catch (e) {
        return;
      }
    }
    if (!targetFolder) return;
    setIsScanning(true);
    setMinimized(false);
    try {
      const files: string[] = await invoke("scan_folder", { folderPath: targetFolder });
      const newCleanup = files.map(file => ({
        id: file,
        path: file,
        name: file.split('/').pop() || file.split('\\').pop() || file,
        ignored: false,
        status: "pending" as const
      }));
      setCleanupFiles(newCleanup);
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleTabChange = (tab: "live" | "cleanup") => {
    setActiveTab(tab);
    if (tab === "cleanup" && cleanupFiles.length === 0 && !isScanning) {
      scanFolders();
    }
  };

  const processSingleFile = async (file: CleanupTask) => {
    if (file.status !== "pending") return;
    setCleanupFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: "processing" } : f));
    try {
      const newName: string = await invoke("process_image_command", { path: file.path });
      const parts = file.path.split(/[/\\]/);
      parts[parts.length - 1] = newName;
      const newPath = parts.join(file.path.includes('\\') ? '\\' : '/');
      setCleanupFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: "completed", newName, newPath } : f));
    } catch(e) {
      setCleanupFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: "error" } : f));
    }
  };

  const handleUndoCleanup = async (file: CleanupTask) => {
    if (!file.newPath) return;
    try {
      await invoke("rename_file", { oldPath: file.newPath, newPath: file.path });
      setCleanupFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, status: "undone" } : f));
    } catch (e) { console.error(e); }
  };

  const handleRedoCleanup = async (file: CleanupTask) => {
    if (!file.newPath) return;
    try {
      await invoke("rename_file", { oldPath: file.path, newPath: file.newPath });
      setCleanupFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, status: "completed" } : f));
    } catch (e) { console.error(e); }
  };

  const startBatchProcess = async () => {
    setIsBatching(true);
    
    // Process one by one
    for (let i = 0; i < cleanupFiles.length; i++) {
      const file = cleanupFiles[i];
      if (file.ignored || file.status !== "pending") continue;
      
      await processSingleFile(file);
    }
    
    setIsBatching(false);
  };

  const isDone = (s: string) => s === "completed" || s === "undone" || s === "error";
  const activeCount = tasks.filter((t) => !isDone(t.status)).length;
  const pendingCount = cleanupFiles.filter(f => f.status === "pending" && !f.ignored).length;

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await invoke("save_settings", { apiKey: settings.apiKey, model: settings.model });
      setShowSettings(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className={`widget ${minimized ? 'minimized' : ''}`} onClick={() => minimized && setMinimized(false)}>
      <div className="minimized-bubble" data-tauri-drag-region title="Click to expand, Drag to move">
        <div className="ps-logo" style={{ pointerEvents: 'none' }}>
          Ps
          {activeCount > 0 && <span className="ps-indicator pulsing" />}
        </div>
      </div>

      <div className="widget-header">
        <span className={`widget-dot ${activeCount > 0 ? "pulsing" : ""}`} />
        <span className="widget-title">PixelScribe</span>
        
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => handleTabChange('live')}
          >
            Live
          </button>
          <button 
            className={`tab-btn ${activeTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => handleTabChange('cleanup')}
          >
            Cleanup {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
        </div>

        <div className="drag-handle" data-tauri-drag-region title="Drag window">
          <GripHorizontal size={14} color="rgba(255,255,255,0.4)" style={{ pointerEvents: 'none' }} />
        </div>
        
        <span className="widget-settings-btn" onClick={() => { setShowSettings(s => !s); setMinimized(false); }} style={{cursor: 'pointer', padding: '4px', marginLeft: '4px', display: 'flex', alignItems: 'center'}} title="Settings">
          <Settings size={14} color={showSettings ? "#3b82f6" : "inherit"} />
        </span>

        <span className="widget-chevron" onClick={() => setMinimized((m) => !m)} style={{cursor: 'pointer', padding: '4px', marginLeft: '4px', display: 'flex', alignItems: 'center'}} title={minimized ? "Expand" : "Minimize"}>
          {minimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {!minimized && showSettings && (
          <motion.div
            key="settings-tab"
            className="settings-panel"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="settings-header">
              <h3>Settings</h3>
              <button className="icon-btn" onClick={() => setShowSettings(false)}><X size={16} /></button>
            </div>
            
            <div className="settings-body">
              <div className="form-group">
                <label>NVIDIA API Key</label>
                <input 
                  type="password" 
                  value={settings.apiKey} 
                  onChange={e => setSettings({...settings, apiKey: e.target.value})} 
                  placeholder="nvapi-..." 
                  className="settings-input"
                />
              </div>
              
              <div className="form-group">
                <label>Model</label>
                <input 
                  list="nvidia-models" 
                  value={settings.model} 
                  onChange={e => setSettings({...settings, model: e.target.value})} 
                  placeholder="e.g. meta/llama-3.2-11b-vision-instruct" 
                  className="settings-input"
                />
                <datalist id="nvidia-models">
                  <option value="meta/llama-3.2-11b-vision-instruct" />
                  <option value="meta/llama-3.2-90b-vision-instruct" />
                  <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" />
                  <option value="google/paligemma" />
                  <option value="moonshotai/kimi-k3" />
                </datalist>
              </div>
            </div>
            
            <div className="settings-footer">
              <button className="btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <div className="spinner-small" style={{borderLeftColor: '#fff', width: 12, height: 12}} /> : <Save size={14} />}
                <span>{savingSettings ? "Saving..." : "Save Settings"}</span>
              </button>
            </div>
          </motion.div>
        )}

        {!minimized && !showSettings && activeTab === "live" && (
          <motion.ul 
            key="live-tab"
            className="widget-feed"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence>
              {tasks.map((task) => (
                <motion.li 
                  key={task.id} 
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, height: 0, margin: 0, padding: 0 }}
                  transition={{ duration: 0.25, type: "spring", bounce: 0.3 }}
                  className={`widget-row s-${task.status}`}
                >
                  <AnimatePresence>
                    {!isDone(task.status) && (
                      <motion.div 
                        initial={{ opacity: 0, width: 0, scale: 0 }} 
                        animate={{ opacity: 1, width: 28, scale: 1 }} 
                        exit={{ opacity: 0, width: 0, scale: 0, margin: 0 }}
                      >
                        <CircleProgress pct={task.progress} status={task.status} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="widget-label">
                    {isDone(task.status) && task.old_name ? (
                      <span className="widget-names">
                        <span className="wn-old" style={task.status === "undone" ? { textDecoration: 'none', opacity: 0.8 } : undefined}>{trimName(task.old_name)}</span>
                        <span className="wn-arr">{task.status === "undone" ? "←" : "→"}</span>
                        <span className="wn-new" style={task.status === "undone" ? { textDecoration: 'line-through', opacity: 0.5, color: 'inherit' } : undefined}>{trimName(task.new_name ?? "")}</span>
                      </span>
                    ) : (
                      <span className="widget-msg">
                        {task.name ? trimName(task.name, 26) : task.message}
                      </span>
                    )}
                  </div>
                  <div className="widget-actions">
                    {task.status === "completed" && (
                      <button className="wa-btn" title="Undo rename" onClick={() => handleUndo(task)}>
                        <Undo size={12} />
                      </button>
                    )}
                    {task.status === "undone" && (
                      <button className="wa-btn redo" title="Redo rename" onClick={() => handleRedo(task)}>
                        <Redo size={12} />
                      </button>
                    )}
                    {task.status === "error" && <XCircle size={14} color="#ef4444" title="Error renaming" />}
                  </div>
                </motion.li>
              ))}
              {tasks.length === 0 && (
                <motion.li 
                  key="empty-live"
                  layout
                  className="widget-row" 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, height: 0, margin: 0, padding: 0 }}
                  transition={{ duration: 0.25, type: "spring", bounce: 0.3 }}
                >
                  <div className="widget-label">
                    <span className="widget-msg">Watching for new downloads...</span>
                  </div>
                </motion.li>
              )}
            </AnimatePresence>
          </motion.ul>
        )}

        {!minimized && !showSettings && activeTab === "cleanup" && (
          <motion.div 
            key="cleanup-tab"
            className="cleanup-feed"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <div className="cleanup-actions-top">
              <div 
                className="current-folder-display" 
                onClick={async () => {
                  if (isScanning || isBatching) return;
                  const folder = await open({ directory: true });
                  if (folder && typeof folder === "string") {
                    setCurrentFolder(folder);
                    scanFolders(folder);
                  }
                }}
                style={{
                  cursor: (isScanning || isBatching) ? "default" : "pointer",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.8)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  boxSizing: "border-box",
                  opacity: (isScanning || isBatching) ? 0.5 : 1
                }}
                title="Click to select folder"
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isScanning ? "Scanning..." : (currentFolder || "Select folder...")}
                </span>
                <FolderSearch size={14} style={{ flexShrink: 0, marginLeft: '8px', opacity: 0.7 }} />
              </div>
            </div>
            
            {cleanupFiles.length > 0 && (
              (() => {
                const pending = cleanupFiles.filter(f => f.status === "pending");
                const selectedCount = pending.filter(f => !f.ignored).length;
                const totalPending = pending.length;
                const isAllSelected = totalPending > 0 && selectedCount === totalPending;
                const isIndeterminate = totalPending > 0 && selectedCount > 0 && selectedCount < totalPending;
                
                return (
                  <div className="cleanup-list-header" style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 2px 10px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                    <div className="checkbox-wrap" style={{ marginRight: '10px' }}>
                      <IndeterminateCheckbox 
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCleanupFiles(prev => prev.map(f => f.status === "pending" ? { ...f, ignored: !checked } : f));
                        }}
                        disabled={isBatching || totalPending === 0}
                      />
                    </div>
                    <span>{isAllSelected ? "Unselect All" : "Select All"}</span>
                  </div>
                );
              })()
            )}

            <ul className="widget-feed scrollable">
              <AnimatePresence>
                {cleanupFiles.map(file => (
                  <motion.li 
                    key={file.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`widget-row ${file.ignored ? 'ignored' : ''}`}
                  >
                    <AnimatePresence>
                      {file.status === "pending" && (
                        <motion.div 
                          className="checkbox-wrap"
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0, margin: 0, padding: 0 }}
                        >
                          <input 
                            type="checkbox" 
                            checked={!file.ignored}
                            onChange={() => {
                              if (file.status === "pending") {
                                setCleanupFiles(prev => prev.map(f => f.id === file.id ? { ...f, ignored: !f.ignored } : f));
                              }
                            }}
                            disabled={file.status !== "pending"}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="widget-label">
                      {(file.status === "completed" || file.status === "undone") && file.newName ? (
                        <span className="widget-names">
                          <span className="wn-old">{trimName(file.name)}</span>
                          <span className="wn-arr">→</span>
                          <motion.span 
                            className="wn-new"
                            style={{ textDecoration: file.status === "undone" ? "line-through" : "none", opacity: file.status === "undone" ? 0.5 : 1 }}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: file.status === "undone" ? 0.5 : 1, x: 0 }}
                          >
                            {trimName(file.newName, 30)}
                          </motion.span>
                        </span>
                      ) : (
                        <span className="widget-msg" title={file.path}>{trimName(file.name, 30)}</span>
                      )}
                    </div>
                    <div className="widget-actions">
                      {file.status === "pending" && (
                        <button 
                          className="wa-btn hover-only" 
                          title="Rename this image" 
                          onClick={() => processSingleFile(file)}
                          disabled={isBatching}
                        >
                          <ArrowRight size={12} />
                        </button>
                      )}
                      {file.status === "processing" && <div className="spinner-small" />}
                      {file.status === "completed" && (
                        <button className="wa-btn" title="Undo rename" onClick={() => handleUndoCleanup(file)}>
                          <Undo size={12} />
                        </button>
                      )}
                      {file.status === "undone" && (
                        <button className="wa-btn redo" title="Redo rename" onClick={() => handleRedoCleanup(file)}>
                          <Redo size={12} />
                        </button>
                      )}
                      {file.status === "error" && <XCircle size={14} color="#ef4444" title="Error renaming" />}
                    </div>
                  </motion.li>
                ))}
                {cleanupFiles.length === 0 && !isScanning && (
                  <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    No images found.
                  </motion.div>
                )}
              </AnimatePresence>
            </ul>
            
            {cleanupFiles.some(f => f.status === "pending" && !f.ignored) && (
              <div className="cleanup-actions-bottom">
                <button className="btn-primary" onClick={startBatchProcess} disabled={isBatching}>
                  <Play size={14} /> 
                  {isBatching ? "Processing..." : `Start Renaming (${pendingCount})`}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
