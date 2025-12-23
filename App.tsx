import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, BarChart3, LayoutDashboard, Settings, Download, Upload, Zap, ArrowLeft, FileText, Check } from 'lucide-react';
import { SimulationEngine } from './services/simulation';
import { SimulationCanvas } from './components/SimulationCanvas';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { LandingPage } from './components/LandingPage';
import { ModelDocs } from './components/ModelDocs';
import { SimulationConfig, StationState, HistoricalDataPoint, MicroDataPoint } from './types';
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
  // Sim
  numChargers: 4,
  arrivalRate: 0.10, // ~1 truck every 10 ticks
  simulationSpeed: 100,
};

export default function App() {
  const [viewState, setViewState] = useState<'landing' | 'app' | 'docs'>('landing');
  const [activeTab, setActiveTab] = useState<'twin' | 'analytics' | 'lab'>('twin');
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  
  // Simulation State
  const engineRef = useRef<SimulationEngine | null>(null);
  const [fifoState, setFifoState] = useState<StationState | null>(null);
  const [sirqState, setSirqState] = useState<StationState | null>(null);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [microHistory, setMicroHistory] = useState<MicroDataPoint[]>([]);
  
  // Animation Control Refs
  const requestRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(isRunning);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initSimulation = useCallback(() => {
    engineRef.current = new SimulationEngine(config);
    const result = engineRef.current.tick(); // Initial tick
    setFifoState(result.fifo);
    setSirqState(result.sirq);
    setHistory([]);
    setMicroHistory([]);
  }, [config]);

  // Initial setup
  useEffect(() => {
    initSimulation();
  }, [initSimulation]);

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
        microHistory: microHistory
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
                  setConfig(json.config);
                  setHistory(json.history);
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
    <div className="h-screen w-screen bg-slate-100 flex flex-col text-slate-900 overflow-hidden">
      
      {/* Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button 
             onClick={() => setViewState('landing')}
             className="mr-2 p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
              <ArrowLeft size={20} />
          </button>
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Zap size={20} fill="currentColor" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">SIRQ <span className="font-light text-slate-500">Simulator</span></h1>
            <p className="text-[10px] text-slate-500 font-medium">Research Build v1.0.6 (Scientific Analytics)</p>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
          {[
            { id: 'twin', label: 'Digital Twin', icon: LayoutDashboard },
            { id: 'analytics', label: 'Analytics (RQs)', icon: BarChart3 },
            { id: 'lab', label: 'Lab Config', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === tab.id ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
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
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-200 transition-all text-sm"
                title="Import Dataset"
            >
                {importStatus ? <Check size={16} className="text-emerald-600" /> : <Upload size={16} />}
                <span className="hidden sm:inline">{importStatus || "Import"}</span>
            </button>

            <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-200 transition-all text-sm"
                title="Export Dataset"
            >
                <Download size={16} />
                <span className="hidden sm:inline">Export</span>
            </button>
            
            <div className="w-px h-6 bg-slate-200 mx-1"></div>

             <button 
                onClick={() => setViewState('docs')}
                className="flex items-center gap-2 px-3 py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-all text-sm font-medium"
            >
                <FileText size={16} />
                Docs
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* Controls Overlay (Only visible in Twin Mode) */}
        {activeTab === 'twin' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsRunning(!isRunning)}
                    className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        isRunning ? "bg-amber-100 text-amber-600 hover:bg-amber-200" : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    )}
                >
                    {isRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={handleReset} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                    <RotateCcw size={18} />
                </button>
                </div>
                <div className="w-px h-6 bg-slate-300 mx-2" />
                <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                    <span className="tabular-nums">Tick: {engineRef.current?.tickCount || 0}</span>
                    <span className="tabular-nums">Sim Time: {(engineRef.current?.tickCount || 0 / 60).toFixed(1)}h</span>
                </div>
            </div>
        )}

        {/* Tab Content */}
        <div className="h-full w-full p-6">
            
            {/* DIGITAL TWIN TAB */}
            {activeTab === 'twin' && fifoState && sirqState && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full pb-10">
                  <SimulationCanvas title="Control Group (FIFO)" state={fifoState} />
                  <SimulationCanvas title="Experimental (SIRQ)" state={sirqState} />
              </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === 'analytics' && (
               <div className="h-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                   <AnalyticsPanel data={history} microData={microHistory} />
               </div>
            )}

             {/* LAB TAB */}
             {activeTab === 'lab' && (
               <div className="max-w-4xl mx-auto h-full overflow-y-auto pb-20">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                     <h2 className="text-2xl font-bold mb-6 text-slate-800">Experiment Configuration</h2>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         
                         {/* Infrastructure */}
                         <div className="space-y-6">
                            <h3 className="font-semibold text-slate-500 uppercase text-xs tracking-wider">Infrastructure</h3>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Chargers per Station</label>
                                <input 
                                    type="range" min="1" max="10" 
                                    value={config.numChargers}
                                    onChange={(e) => setConfig({...config, numChargers: parseInt(e.target.value)})}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 font-bold mt-1">{config.numChargers} Units</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Traffic (Arrival Rate)</label>
                                <input 
                                    type="range" min="1" max="50" 
                                    value={config.arrivalRate * 100}
                                    onChange={(e) => setConfig({...config, arrivalRate: parseInt(e.target.value) / 100})}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 font-bold mt-1">{(config.arrivalRate * 100).toFixed(1)}% / min</div>
                            </div>
                         </div>

                         {/* Economics */}
                         <div className="space-y-6">
                            <h3 className="font-semibold text-slate-500 uppercase text-xs tracking-wider">Economics (SIRQ)</h3>
                             
                             <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                 <div>
                                     <span className="block text-sm font-medium text-slate-900">Smart Pricing</span>
                                     <span className="block text-[10px] text-slate-500">Utilization-based surge</span>
                                 </div>
                                 <button 
                                    onClick={() => setConfig({...config, smartPricing: !config.smartPricing})}
                                    className={clsx("w-9 h-5 rounded-full transition-colors relative", config.smartPricing ? "bg-indigo-600" : "bg-slate-300")}
                                 >
                                     <span className={clsx("absolute top-1 w-3 h-3 bg-white rounded-full transition-transform", config.smartPricing ? "left-5" : "left-1")} />
                                 </button>
                             </div>

                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Preemption Premium</label>
                                <input 
                                    type="range" min="100" max="200" step="10"
                                    value={config.preemptionPremium * 100}
                                    onChange={(e) => setConfig({...config, preemptionPremium: parseInt(e.target.value) / 100})}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-right text-xs text-indigo-600 font-bold mt-1">{config.preemptionPremium}x Bid</div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Multiplier required for a high-priority agent to swap with an incumbent charger.
                                </p>
                             </div>
                         </div>
                     </div>

                     <div className="mt-8 pt-6 border-t border-slate-100">
                         <h3 className="font-semibold text-slate-500 uppercase text-xs tracking-wider mb-4">Traffic Mix Proportions</h3>
                         <div className="flex gap-4">
                             <div className="flex-1 p-3 rounded bg-red-50 border border-red-100 text-center">
                                 <div className="text-xs text-red-500 font-bold mb-1">Critical (High VOT)</div>
                                 <div className="text-xl font-bold text-red-700">{(config.probCritical * 100).toFixed(0)}%</div>
                             </div>
                             <div className="flex-1 p-3 rounded bg-blue-50 border border-blue-100 text-center">
                                 <div className="text-xs text-blue-500 font-bold mb-1">Standard</div>
                                 <div className="text-xl font-bold text-blue-700">{(config.probStandard * 100).toFixed(0)}%</div>
                             </div>
                             <div className="flex-1 p-3 rounded bg-slate-50 border border-slate-200 text-center">
                                 <div className="text-xs text-slate-500 font-bold mb-1">Economy</div>
                                 <div className="text-xl font-bold text-slate-700">{(config.probEconomy * 100).toFixed(0)}%</div>
                             </div>
                         </div>
                     </div>

                     <div className="mt-8">
                        <button 
                            onClick={handleReset}
                            className="w-full py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-sm"
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