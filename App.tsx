import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, BarChart3, LayoutDashboard, Settings, Download, Upload, Zap, ArrowLeft, FileText, Check, Moon, Sun } from 'lucide-react';
import { SimulationEngine } from './services/simulation';
import { SimulationCanvas } from './components/SimulationCanvas';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { LandingPage } from './components/LandingPage';
import { ModelDocs } from './components/ModelDocs';
import { SimulationConfig, StationState, HistoricalDataPoint, MicroDataPoint, AgentType, SimulationSnapshot } from './types';
import { clsx } from 'clsx';

const DEFAULT_CONFIG: SimulationConfig = {
  // Physics
  chargerPower: 150.0,
  batteryCapacity: 500.0,
  // Economics
  baseGridPrice: 0.50,
  baseServiceFee: 10.0,
  auctionIncrement: 5.0,
  preemptionPremium: 1.2,
  // Pricing
  smartPricing: true,
  surgeSensitivity: 0.5,
  maxPriceCap: 2.00,
  // Traffic
  probCritical: 0.20,
  probStandard: 0.60,
  probEconomy: 0.20,
  enableRushHours: true,
  rushHourMultiplier: 2.5,
  // Sim
  numChargers: 4,
  arrivalRate: 0.10, // ~1 truck every 10 ticks
  simulationSpeed: 100,
  
  // Profiles (Editable)
  profiles: {
    [AgentType.CRITICAL]: {
        minVot: 150.0, maxVot: 300.0, patience: 240, priceSensitivity: 0.1, maxPriceTolerance: 5.00
    },
    [AgentType.STANDARD]: {
        minVot: 50.0, maxVot: 80.0, patience: 120, priceSensitivity: 0.5, maxPriceTolerance: 1.50
    },
    [AgentType.ECONOMY]: {
        minVot: 15.0, maxVot: 30.0, patience: 45, priceSensitivity: 0.9, maxPriceTolerance: 0.80
    }
  }
};

export default function App() {
  const [viewState, setViewState] = useState<'landing' | 'app' | 'docs'>('landing');
  const [activeTab, setActiveTab] = useState<'twin' | 'analytics' | 'lab'>('twin');
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  
  // Simulation State
  const engineRef = useRef<SimulationEngine | null>(null);
  const [fifoState, setFifoState] = useState<StationState | null>(null);
  const [sirqState, setSirqState] = useState<StationState | null>(null);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [microHistory, setMicroHistory] = useState<MicroDataPoint[]>([]);
  const [currentSimTime, setCurrentSimTime] = useState<number>(0);
  const [trafficMultiplier, setTrafficMultiplier] = useState<number>(1.0);
  
  // Animation Control Refs
  const requestRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(isRunning);
  // Import flag to prevent auto-reset
  const isImportingRef = useRef(false);
  const pendingSnapshotRef = useRef<SimulationSnapshot | null>(null);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Dark Mode Effect ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const initSimulation = useCallback(() => {
    engineRef.current = new SimulationEngine(config);
    const result = engineRef.current.tick(); // Initial tick
    setFifoState(result.fifo);
    setSirqState(result.sirq);
    setCurrentSimTime(result.simTime);
    setTrafficMultiplier(result.trafficMultiplier);
    setHistory([]);
    setMicroHistory([]);
  }, [config]);

  // Initial setup & Config change handler
  useEffect(() => {
    if (isImportingRef.current) {
        isImportingRef.current = false;
        engineRef.current = new SimulationEngine(config);
        
        // Restore state if we have a pending snapshot from import
        if (pendingSnapshotRef.current) {
             engineRef.current.restoreSnapshot(pendingSnapshotRef.current);
             setFifoState(engineRef.current.fifoState);
             setSirqState(engineRef.current.sirqState);
             pendingSnapshotRef.current = null;
        }
        return;
    }
    initSimulation();
  }, [config, initSimulation]);

  const tick = useCallback(() => {
    if (!engineRef.current || !runningRef.current) return;
    
    // Run multiple logic ticks per frame if speed is high to simulate faster
    const steps = Math.ceil(config.simulationSpeed / 50); 
    
    let lastResult;
    let accumulatedMicro: MicroDataPoint[] = [];

    for (let i = 0; i < steps; i++) {
        const res = engineRef.current.tick();
        lastResult = res;
        accumulatedMicro.push(...res.microData);
    }

    if (lastResult) {
        setFifoState({ ...lastResult.fifo }); // Spread to trigger re-render
        setSirqState({ ...lastResult.sirq });
        setCurrentSimTime(lastResult.simTime);
        setTrafficMultiplier(lastResult.trafficMultiplier);
        setHistory(prev => [...prev, lastResult!.historical].slice(-500)); // Keep last 500
        
        // Keep last 1000 micro data points to avoid memory explosion but allow scatter plots
        if (accumulatedMicro.length > 0) {
            setMicroHistory(prev => [...prev, ...accumulatedMicro].slice(-1000));
        }
    }

    // Schedule next frame with throttle
    if (runningRef.current) {
        timeoutRef.current = setTimeout(() => {
             requestRef.current = requestAnimationFrame(tick);
        }, 1000 / 30); // Cap at 30fps
    }
  }, [config.simulationSpeed]);

  useEffect(() => {
    runningRef.current = isRunning;
    
    if (isRunning) {
      if (!engineRef.current) initSimulation();
      requestRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isRunning, tick, initSimulation]);

  const handleReset = () => {
    setIsRunning(false);
    setTimeout(() => initSimulation(), 50);
  };

  // --- EXPORT FUNCTIONALITY ---
  const handleExport = () => {
    const dataset = {
        metadata: {
            timestamp: new Date().toISOString(),
            version: "1.0.6",
            notes: "SIRQ Simulation Dataset"
        },
        config: config,
        history: history,
        microHistory: microHistory,
        // Save state snapshot for resuming
        snapshot: engineRef.current ? engineRef.current.getSnapshot() : null
    };

    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SIRQ_Dataset_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- IMPORT FUNCTIONALITY ---
  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const json = JSON.parse(e.target?.result as string);
              
              // Basic Validation
              if (json.config && Array.isArray(json.history)) {
                  setIsRunning(false);
                  
                  // Store snapshot for the useEffect to pick up
                  if (json.snapshot) {
                    pendingSnapshotRef.current = json.snapshot;
                  }

                  // CRITICAL: Set flag to prevent useEffect from wiping history when config updates
                  isImportingRef.current = true;
                  
                  // Batch updates
                  setConfig(json.config);
                  setHistory(json.history);
                  // Ensure microHistory is set, defaulting to empty if not present in older datasets
                  setMicroHistory(json.microHistory || []);
                  
                  setImportStatus("Import Successful!");
                  setActiveTab('analytics'); // Switch to view results
                  setTimeout(() => setImportStatus(null), 3000);
              } else {
                  alert("Invalid Dataset Format");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse JSON file.");
          }
      };
      reader.readAsText(file);
      // Reset input
      event.target.value = ''; 
  };

  if (viewState === 'docs') {
      return <ModelDocs onClose={() => setViewState('landing')} />;
  }

  if (viewState === 'landing') {
      return <LandingPage onStart={() => setViewState('app')} onOpenDocs={() => setViewState('docs')} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 overflow-hidden transition-colors duration-300">
      
      {/* Navbar */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0 z-10 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button 
             onClick={() => setViewState('landing')}
             className="mr-2 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
              <ArrowLeft size={20} />
          </button>
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/30">
            <Zap size={20} fill="currentColor" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">SIRQ</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Research Build v1.0.7</p>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700 hidden md:flex">
          {[
            { id: 'twin', label: 'Simulation', icon: LayoutDashboard },
            { id: 'analytics', label: 'Analytics (RQs)', icon: BarChart3 },
            { id: 'lab', label: 'Lab Config', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === tab.id
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile Tab Select - simplified */}
        <div className="md:hidden">
            <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as any)}
                className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-sm rounded border border-slate-200 dark:border-slate-700 px-2 py-1"
            >
                <option value="twin">Simulation</option>
                <option value="analytics">Analytics</option>
                <option value="lab">Lab Config</option>
            </select>
        </div>

        <div className="flex items-center gap-2">
            {/* Hidden File Input */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json" 
                onChange={handleFileChange}
            />
            
            <button 
                onClick={handleImportClick}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all text-sm"
                title="Import Dataset"
            >
                {importStatus ? <Check size={16} className="text-emerald-600" /> : <Upload size={16} />}
                <span className="hidden sm:inline">{importStatus || "Import"}</span>
            </button>

            <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all text-sm"
                title="Export Dataset"
            >
                <Download size={16} />
                <span className="hidden sm:inline">Export</span>
            </button>
            
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>

             <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex items-center justify-center w-9 h-9 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-all"
                title="Toggle Dark Mode"
            >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

             <button 
                onClick={() => setViewState('docs')}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-md transition-all text-sm font-medium"
            >
                <FileText size={16} />
                Docs
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* Controls Overlay (Only visible in Simulation Mode) */}
        {activeTab === 'twin' && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-xl rounded-full px-5 py-3 flex items-center gap-5 transition-all">
                <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsRunning(!isRunning)}
                    className={clsx(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md",
                        isRunning
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/70"
                            : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/70"
                    )}
                >
                    {isRunning ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={handleReset} className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all shadow-sm">
                    <RotateCcw size={20} />
                </button>
                </div>
                <div className="w-px h-8 bg-slate-300 dark:bg-slate-600 mx-1" />
                <div className="flex flex-col min-w-[120px]">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                           {String(Math.floor(currentSimTime / 60)).padStart(2, '0')}:{String(Math.floor(currentSimTime % 60)).padStart(2, '0')}
                        </span>
                        {/* Traffic Intensity Indicator */}
                        {config.enableRushHours && (
                             <div className="flex flex-col gap-0.5" title={`Traffic Intensity: ${trafficMultiplier.toFixed(1)}x`}>
                                 <div className={clsx("w-2 h-2 rounded-full", trafficMultiplier > 1.8 ? "bg-red-500 animate-pulse" : trafficMultiplier > 1.2 ? "bg-amber-500" : "bg-emerald-500")} />
                             </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        <span>Tick: {engineRef.current?.tickCount || 0}</span>
                        {trafficMultiplier > 1.1 && <span className="text-amber-600 dark:text-amber-400 font-bold uppercase">Rush Hour</span>}
                    </div>
                </div>
            </div>
        )}

        {/* Tab Content */}
        <div className="h-full w-full p-6">
            
            {/* DIGITAL TWIN / SIMULATION TAB */}
            {activeTab === 'twin' && fifoState && sirqState && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full pb-10">
                  <SimulationCanvas title="Control Group (FIFO)" state={fifoState} config={config} />
                  <SimulationCanvas title="Experimental (SIRQ)" state={sirqState} config={config} />
              </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === 'analytics' && (
               <div className="h-full bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                   <AnalyticsPanel data={history} microData={microHistory} />
               </div>
            )}

             {/* LAB TAB */}
             {activeTab === 'lab' && (
               <div className="max-w-4xl mx-auto h-full overflow-y-auto pb-20">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
                     <h2 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white">Experiment Configuration</h2>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         
                         {/* Infrastructure */}
                         <div className="space-y-6">
                            <h3 className="font-semibold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">Infrastructure</h3>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chargers per Station</label>
                                <input 
                                    type="range" min="1" max="10" 
                                    value={config.numChargers}
                                    onChange={(e) => setConfig({...config, numChargers: parseInt(e.target.value)})}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">{config.numChargers} Units</div>
                            </div>
                            
                            {/* Charger Specs */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Charger Power (kW)</label>
                                <input 
                                    type="number" 
                                    value={config.chargerPower}
                                    onChange={(e) => setConfig({...config, chargerPower: parseFloat(e.target.value)})}
                                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded px-2 py-1 text-sm dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Battery Capacity (kWh)</label>
                                <input 
                                    type="number" 
                                    value={config.batteryCapacity}
                                    onChange={(e) => setConfig({...config, batteryCapacity: parseFloat(e.target.value)})}
                                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded px-2 py-1 text-sm dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Base Traffic (Arrival Rate)</label>
                                <input 
                                    type="range" min="1" max="50" 
                                    value={config.arrivalRate * 100}
                                    onChange={(e) => setConfig({...config, arrivalRate: parseInt(e.target.value) / 100})}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">{(config.arrivalRate * 100).toFixed(1)}% / min</div>
                            </div>

                             {/* Rush Hour Toggle */}
                             <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 mt-4">
                                 <div>
                                     <span className="block text-sm font-medium text-slate-900 dark:text-white">Enable Rush Hours</span>
                                     <span className="block text-[10px] text-slate-500 dark:text-slate-400">Peaks at 08:00 & 17:30</span>
                                 </div>
                                 <button
                                    onClick={() => setConfig({...config, enableRushHours: !config.enableRushHours})}
                                    className={clsx("w-9 h-5 rounded-full transition-colors relative", config.enableRushHours ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600")}
                                 >
                                     <span className={clsx("absolute top-1 w-3 h-3 bg-white rounded-full transition-transform", config.enableRushHours ? "left-5" : "left-1")} />
                                 </button>
                             </div>
                         </div>

                         {/* Economics */}
                         <div className="space-y-6">
                            <h3 className="font-semibold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">Economics (SIRQ)</h3>
                             
                             <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                 <div>
                                     <span className="block text-sm font-medium text-slate-900 dark:text-white">Smart Pricing</span>
                                     <span className="block text-[10px] text-slate-500 dark:text-slate-400">Utilization-based surge</span>
                                 </div>
                                 <button 
                                    onClick={() => setConfig({...config, smartPricing: !config.smartPricing})}
                                    className={clsx("w-9 h-5 rounded-full transition-colors relative", config.smartPricing ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600")}
                                 >
                                     <span className={clsx("absolute top-1 w-3 h-3 bg-white rounded-full transition-transform", config.smartPricing ? "left-5" : "left-1")} />
                                 </button>
                             </div>

                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Preemption Premium</label>
                                <input 
                                    type="range" min="100" max="200" step="10"
                                    value={config.preemptionPremium * 100}
                                    onChange={(e) => setConfig({...config, preemptionPremium: parseInt(e.target.value) / 100})}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">{config.preemptionPremium}x Bid</div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Multiplier required for a high-priority agent to swap with an incumbent charger.
                                </p>
                             </div>
                         </div>
                     </div>

                     {/* Profile Config */}
                     <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                         <h3 className="font-semibold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider mb-4">Agent Profiles (Value of Time)</h3>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             {[AgentType.CRITICAL, AgentType.STANDARD, AgentType.ECONOMY].map(type => (
                                 <div key={type} className={clsx("p-4 rounded border text-center transition-colors",
                                    type === AgentType.CRITICAL ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900" :
                                    type === AgentType.STANDARD ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900" :
                                    "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700")}>
                                     <h4 className="font-bold text-xs uppercase mb-3 dark:text-slate-300">{type}</h4>
                                     <div className="space-y-2 text-left">
                                         <div>
                                             <label className="text-[10px] text-slate-500 dark:text-slate-400">Min VOT ($/hr)</label>
                                             <input type="number" 
                                                value={config.profiles[type].minVot}
                                                onChange={(e) => {
                                                    const newProfiles = {...config.profiles};
                                                    newProfiles[type].minVot = parseFloat(e.target.value);
                                                    setConfig({...config, profiles: newProfiles});
                                                }}
                                                className="w-full text-xs border rounded p-1 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                             />
                                         </div>
                                         <div>
                                             <label className="text-[10px] text-slate-500 dark:text-slate-400">Max VOT ($/hr)</label>
                                             <input type="number" 
                                                value={config.profiles[type].maxVot}
                                                onChange={(e) => {
                                                    const newProfiles = {...config.profiles};
                                                    newProfiles[type].maxVot = parseFloat(e.target.value);
                                                    setConfig({...config, profiles: newProfiles});
                                                }}
                                                className="w-full text-xs border rounded p-1 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                             />
                                         </div>
                                         <div>
                                             <label className="text-[10px] text-slate-500 dark:text-slate-400">Patience (min)</label>
                                             <input type="number" 
                                                value={config.profiles[type].patience}
                                                onChange={(e) => {
                                                    const newProfiles = {...config.profiles};
                                                    newProfiles[type].patience = parseFloat(e.target.value);
                                                    setConfig({...config, profiles: newProfiles});
                                                }}
                                                className="w-full text-xs border rounded p-1 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                             />
                                         </div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <div className="mt-8">
                        <button 
                            onClick={handleReset}
                            className="w-full py-3 bg-slate-900 dark:bg-indigo-600 text-white rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            Restart Simulation
                        </button>
                     </div>

                  </div>
               </div>
            )}

        </div>
      </main>
    </div>
  );
}