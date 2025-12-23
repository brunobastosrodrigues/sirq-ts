import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { HistoricalDataPoint, MicroDataPoint, AgentType } from '../types';
import { clsx } from 'clsx';

interface AnalyticsPanelProps {
  data: HistoricalDataPoint[];
  microData: MicroDataPoint[];
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ data, microData }) => {
  const [activeTab, setActiveTab] = useState<'RQ1' | 'RQ2' | 'RQ3' | 'RQ4'>('RQ1');

  // Sub-sample data for performance
  const displayData = data.length > 200 ? data.filter((_, i) => i % 5 === 0) : data;
  
  // Filter MicroData for Scatter Plots (last 500 completed SIRQ transactions)
  const scatterData = microData
    .filter(d => d.strategy === 'SIRQ')
    .slice(-300);

  const renderRQ1 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ1: Cumulative Revenue (Efficiency)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} tickFormatter={(val) => `$${val}`} />
              <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, '']} />
              <Legend />
              <Area type="monotone" dataKey="sirqRevenue" name="SIRQ Revenue" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
              <Area type="monotone" dataKey="fifoRevenue" name="FIFO Revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ1: Opportunity Cost (Lost Demand)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sirqBalked" name="SIRQ Balked" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fifoBalked" name="FIFO Balked" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-2">Cumulative number of agents who left because Price > Tolerance.</p>
      </div>
    </div>
  );

  const renderRQ2 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ2: Critical Agent Reliability (Wait Time)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'min', angle: -90, position: 'insideLeft' }}/>
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sirqWaitCritical" name="SIRQ Critical Wait" stroke="#4f46e5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fifoWaitCritical" name="FIFO Critical Wait" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-2">
            Comparison of average wait times for High-Priority agents. Lower is better.
        </p>
      </div>
    </div>
  );

  const renderRQ3 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ3: Smart Price Dynamics</h3>
        <div className="h-64">
           <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: '$/kWh', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="step" dataKey="price" name="System Price" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ3: Bidding Rationality (VOT vs Bid)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="vot" name="Value of Time" unit="$/hr" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis type="number" dataKey="bid" name="Bid Amount" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter name="SIRQ Completed Agents" data={scatterData} fill="#4f46e5" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-2">
            Each dot is a completed transaction. Shows correlation between Agent Urgency (VOT) and Willingness to Pay.
        </p>
      </div>
    </div>
  );

  const renderRQ4 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">RQ4: The Equity Gap</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sirqWaitEconomy" name="SIRQ Economy Wait" stroke="#95a5a6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sirqWaitCritical" name="SIRQ Critical Wait" stroke="#ff4b4b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-2">
            Visualizing the gap between "Rich" (Critical) and "Poor" (Economy) service levels. Large gaps indicate gentrification.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
       <div className="flex gap-2 p-4 border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
          {['RQ1', 'RQ2', 'RQ3', 'RQ4'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={clsx(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    activeTab === tab 
                    ? "bg-indigo-600 text-white shadow-md" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                  {tab === 'RQ1' && 'RQ1: Efficiency'}
                  {tab === 'RQ2' && 'RQ2: Reliability'}
                  {tab === 'RQ3' && 'RQ3: Pricing'}
                  {tab === 'RQ4' && 'RQ4: Equity'}
              </button>
          ))}
       </div>
       
       <div className="flex-1 overflow-y-auto p-6 pb-20">
           {activeTab === 'RQ1' && renderRQ1()}
           {activeTab === 'RQ2' && renderRQ2()}
           {activeTab === 'RQ3' && renderRQ3()}
           {activeTab === 'RQ4' && renderRQ4()}
       </div>
    </div>
  );
};