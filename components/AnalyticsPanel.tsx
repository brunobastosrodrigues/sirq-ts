import React, { useState, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, ZAxis, ComposedChart
} from 'recharts';
import { HistoricalDataPoint, MicroDataPoint, AgentType } from '../types';
import { clsx } from 'clsx';
import { Download } from 'lucide-react';

interface AnalyticsPanelProps {
  data: HistoricalDataPoint[];
  microData: MicroDataPoint[];
}

// Reusable Chart Container with Save Functionality
const ChartContainer: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; id: string }> = ({ title, subtitle, children, id }) => {
    const downloadChart = () => {
        const svg = document.querySelector(`#${id} svg`);
        if (!svg) return;
        
        // Serialize SVG XML
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svg);
        
        // Add namespace
        if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if(!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)){
            source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        // Add explicit white background for PNG conversion
        const bgRect = `<rect width="100%" height="100%" fill="white"/>`;
        source = source.replace('>', `>${bgRect}`);

        const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
        
        // Create canvas to convert to PNG
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const image = new Image();
        
        image.onload = function() {
            canvas.width = image.width;
            canvas.height = image.height;
            context?.drawImage(image, 0, 0);
            const pngUrl = canvas.toDataURL('image/png');
            
            const downloadLink = document.createElement("a");
            downloadLink.href = pngUrl;
            downloadLink.download = `${title.replace(/\s+/g, '_')}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        };
        image.src = url;
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col h-80" id={id}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
                </div>
                <button onClick={downloadChart} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors" title="Save as PNG">
                    <Download size={14} />
                </button>
            </div>
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    {children as any}
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ data, microData }) => {
  const [activeTab, setActiveTab] = useState<'efficiency' | 'reliability' | 'equity' | 'sensitivity'>('efficiency');

  // Sub-sample data for performance
  const displayData = data.length > 200 ? data.filter((_, i) => i % 5 === 0) : data;
  
  // Filter MicroData for Scatter Plots
  const scatterData = microData
    .filter(d => d.strategy === 'SIRQ')
    .slice(-300);

  const heatMapData = data.filter((_, i) => i % 10 === 0).map(d => ({
      x: d.utilization * 100, // Load %
      y: d.surgeMultiplier, // Price
      z: d.sirqWaitCritical, // Performance (Color)
      amt: d.sirqRevenue
  }));

  // Helper for Lorenz Curve
  const calculateLorenzData = () => {
      const waits = microData.filter(d => d.strategy === 'SIRQ').map(d => d.waitTime).sort((a, b) => a - b);
      if (waits.length === 0) return [];
      const totalWait = waits.reduce((a, b) => a + b, 0);
      let cumWait = 0;
      return waits.map((w, i) => {
          cumWait += w;
          return {
              percentPop: ((i + 1) / waits.length) * 100,
              percentWait: (cumWait / totalWait) * 100,
              perfectLine: ((i + 1) / waits.length) * 100
          };
      }).filter((_, i) => i % Math.max(1, Math.floor(waits.length / 50)) === 0);
  };
  const lorenzData = calculateLorenzData();

  const commonChartProps = {
      margin: { top: 10, right: 30, left: 20, bottom: 20 }
  };

  const renderEfficiency = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Allocative Efficiency (Revenue)" id="chart-rev">
            <AreaChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} tickFormatter={(val) => `$${val}`} label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, '']} />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="sirqRevenue" name="SIRQ Revenue" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
              <Area type="monotone" dataKey="fifoRevenue" name="FIFO Revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
            </AreaChart>
        </ChartContainer>

        <ChartContainer title="Station Utilization" id="chart-util">
            <LineChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} unit="%" tickFormatter={(val) => `${(val * 100).toFixed(0)}`} label={{ value: 'Load (%)', angle: -90, position: 'insideLeft', offset: 0 }}/>
              <Tooltip formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Utilization']} />
              <Line type="monotone" dataKey="utilization" name="Station Load" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
        </ChartContainer>

        <ChartContainer title="Bidding Rationality" subtitle="Value of Time vs Willingness to Pay" id="chart-bid">
            <ScatterChart {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="vot" name="Value of Time" unit="$/hr" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Value of Time ($/hr)', position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="bid" name="Bid Amount" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Bid ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend verticalAlign="top" height={36} />
              <Scatter name="SIRQ Transactions" data={scatterData} fill="#4f46e5" fillOpacity={0.6} />
            </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Queue Length Over Time" id="chart-queue">
             <AreaChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis width={60} label={{ value: 'Vehicles', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip />
                <Area type="step" dataKey="queueLength" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="Vehicles in Queue" />
             </AreaChart>
        </ChartContainer>
    </div>
  );

  const renderReliability = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ChartContainer title="Critical Wait Times" subtitle="Comparing SIRQ vs FIFO for High Priority" id="chart-wait">
            <LineChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Wait (ticks)', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="sirqWaitCritical" name="SIRQ Critical" stroke="#4f46e5" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="fifoWaitCritical" name="FIFO Critical" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Critical Failure Rate" subtitle="% of Critical Cargo that balked/timed out" id="chart-fail">
            <LineChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis unit="%" width={60} tickFormatter={(val) => `${(val * 100).toFixed(0)}`} label={{ value: 'Failure Rate (%)', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Rate']} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="sirqFailureRate" stroke="#4f46e5" strokeWidth={2} name="SIRQ Failures" dot={false} />
                <Line type="monotone" dataKey="fifoFailureRate" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" name="FIFO Failures" dot={false} />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Preemption Events" subtitle="Count of successful auctions displacing non-criticals" id="chart-preempt">
            <LineChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis allowDecimals={false} width={60} label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip />
                <Line type="step" dataKey="preemptions" stroke="#f97316" strokeWidth={2} name="Total Preemptions" dot={false} />
            </LineChart>
      </ChartContainer>
    </div>
  );

  const renderEquity = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ChartContainer title="Subsidy Pool (Robin Hood)" subtitle="Surplus revenue available for redistribution" id="chart-subsidy">
            <AreaChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} tickFormatter={(val) => `$${val}`} label={{ value: 'Pool ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip />
              <Area type="monotone" dataKey="subsidyPool" name="Accumulated Subsidy ($)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
            </AreaChart>
      </ChartContainer>

      <ChartContainer title="Wait Time Inequality (Gini)" subtitle="0 = Equality, 1 = Max Inequality" id="chart-gini">
            <LineChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis domain={[0, 1]} stroke="#94a3b8" width={60} tick={{fontSize: 10}} label={{ value: 'Gini Coeff', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip />
              <Line type="monotone" dataKey="giniCoefficient" name="Gini Coeff" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Lorenz Curve (Wait Time)" subtitle="Cumulative Share of Wait Time" id="chart-lorenz">
            <LineChart data={lorenzData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="percentPop" unit="%" label={{ value: '% of Agents', position: 'insideBottom', offset: -10 }} />
                <YAxis unit="%" width={60} label={{ value: '% of Total Wait', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip />
                <Line type="monotone" dataKey="percentWait" stroke="#f59e0b" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="perfectLine" stroke="#94a3b8" strokeDasharray="5 5" dot={false} name="Perfect Equality" />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Economy vs Critical Wait" subtitle="Gap in service levels" id="chart-gap">
            <LineChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis label={{ value: 'Wait (ticks)', angle: -90, position: 'insideLeft', offset: 0 }} width={60} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="sirqWaitEconomy" stroke="#94a3b8" dot={false} name="Economy" />
                <Line type="monotone" dataKey="sirqWaitCritical" stroke="#ef4444" dot={false} name="Critical" />
            </LineChart>
      </ChartContainer>
    </div>
  );

  const renderSensitivity = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Sensitivity: Load vs Wait vs Price" subtitle="Bubble Size = Critical Wait Time" id="chart-heat">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name="Station Utilization" unit="%" domain={[0, 100]} label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10 }} />
                <YAxis type="number" dataKey="y" name="Surge Multiplier" unit="x" domain={[1, 'auto']} width={60} label={{ value: 'Surge (x)', angle: -90, position: 'insideLeft', offset: 0 }} />
                <ZAxis type="number" dataKey="z" range={[50, 400]} name="Wait Time" unit="m" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="System State" data={heatMapData} fill="#8884d8" fillOpacity={0.6} />
            </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Price vs Demand (Queue)" id="chart-price-demand">
             <ComposedChart data={displayData} {...commonChartProps}>
                 <XAxis dataKey="tick" label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                 <YAxis yAxisId="left" width={60} label={{ value: 'Price ($/kWh)', angle: -90, position: 'insideLeft', offset: 0 }} />
                 <YAxis yAxisId="right" orientation="right" width={60} label={{ value: 'Queue Length', angle: 90, position: 'insideRight', offset: 0 }} />
                 <Tooltip />
                 <Legend verticalAlign="top" height={36} />
                 <Line yAxisId="left" type="monotone" dataKey="price" stroke="#10b981" dot={false} name="Price" />
                 <Area yAxisId="right" type="monotone" dataKey="queueLength" fill="#6366f1" stroke="#6366f1" fillOpacity={0.2} name="Queue" />
             </ComposedChart>
        </ChartContainer>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
       <div className="flex gap-2 p-4 border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm overflow-x-auto">
          {[
              { id: 'efficiency', label: '1. Efficiency' },
              { id: 'reliability', label: '2. Reliability (Critical)' },
              { id: 'equity', label: '3. Equity (Policy)' },
              { id: 'sensitivity', label: '4. Sensitivity Lab' }
          ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
                    activeTab === tab.id 
                    ? "bg-indigo-600 text-white shadow-md" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                  {tab.label}
              </button>
          ))}
       </div>
       
       <div className="flex-1 overflow-y-auto p-6 pb-20">
           {activeTab === 'efficiency' && renderEfficiency()}
           {activeTab === 'reliability' && renderReliability()}
           {activeTab === 'equity' && renderEquity()}
           {activeTab === 'sensitivity' && renderSensitivity()}
       </div>
    </div>
  );
};