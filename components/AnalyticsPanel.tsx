import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, ZAxis, ComposedChart, ReferenceLine
} from 'recharts';
import { HistoricalDataPoint, MicroDataPoint, SimulationConfig } from '../types';
import { clsx } from 'clsx';
import { Download } from 'lucide-react';

interface AnalyticsPanelProps {
  data: HistoricalDataPoint[];
  microData: MicroDataPoint[];
  config: SimulationConfig;
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
        if(!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)){
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if(!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)){
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
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-80 transition-colors" id={id}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
                    {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
                </div>
                <button onClick={downloadChart} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Save as PNG">
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

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ data, microData, config }) => {
  const [activeTab, setActiveTab] = useState<'auction' | 'comparison' | 'efficiency' | 'financial' | 'reliability' | 'equity' | 'grid' | 'sensitivity'>('auction');

  // Sub-sample data for performance
  const displayData = data.length > 200 ? data.filter((_, i) => i % 5 === 0) : data;

  // Filter MicroData for Scatter Plots
  const scatterData = microData
    .filter(d => d.strategy === 'SIRQ')
    .slice(-300);

  // Vickrey auction data - showing bid vs clearing price
  const vickreyData = microData
    .filter(d => d.strategy === 'SIRQ' && d.savings > 0)
    .slice(-200);

  // Calculate Vickrey summary statistics
  const vickreySummary = (() => {
    const sirqData = microData.filter(d => d.strategy === 'SIRQ');
    if (sirqData.length === 0) return { avgSavings: 0, totalSavings: 0, avgBid: 0, avgClearing: 0, count: 0 };
    const totalSavings = sirqData.reduce((sum, d) => sum + d.savings, 0);
    const avgSavings = totalSavings / sirqData.length;
    const avgBid = sirqData.reduce((sum, d) => sum + d.bid, 0) / sirqData.length;
    const avgClearing = sirqData.reduce((sum, d) => sum + d.clearingPrice, 0) / sirqData.length;
    return { avgSavings, totalSavings, avgBid, avgClearing, count: sirqData.length };
  })();

  // Latest data point for comparison cards
  const latest = data[data.length - 1];

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

  // Summary card component
  const StatCard: React.FC<{ label: string; value: string; subtext?: string; color?: string }> = ({ label, value, subtext, color = 'indigo' }) => (
    <div className={`bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm`}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold text-${color}-600 dark:text-${color}-400 mt-1`}>{value}</div>
      {subtext && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</div>}
    </div>
  );

  const renderAuction = () => (
    <div className="space-y-6">
      {/* Vickrey Mechanism Explanation */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 p-6 rounded-xl border border-indigo-200 dark:border-indigo-800">
        <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-2">Vickrey (Second-Price) Auction</h3>
        <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
          SIRQ implements a second-price sealed-bid auction. The highest bidder wins but pays only the <strong>second-highest bid</strong>.
          This ensures <em>truthful bidding is the dominant strategy</em> (Theorem 1 in paper).
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Avg Bid" value={`$${vickreySummary.avgBid.toFixed(0)}`} subtext="What agents offered" />
          <StatCard label="Avg Clearing" value={`$${vickreySummary.avgClearing.toFixed(0)}`} subtext="What they paid" color="emerald" />
          <StatCard label="Avg Savings" value={`$${vickreySummary.avgSavings.toFixed(0)}`} subtext="Per transaction" color="amber" />
          <StatCard label="Total Savings" value={`$${vickreySummary.totalSavings.toFixed(0)}`} subtext={`${vickreySummary.count} transactions`} color="purple" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Bid vs Clearing Price" subtitle="Vickrey: winners pay 2nd-highest bid" id="chart-vickrey">
          <ScatterChart {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="bid" name="Bid" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Bid Amount ($)', position: 'insideBottom', offset: -10 }} />
            <YAxis type="number" dataKey="clearingPrice" name="Paid" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Clearing Price ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(val: number, name: string) => [`$${val.toFixed(0)}`, name]} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1000, y: 1000 }]} stroke="#94a3b8" strokeDasharray="5 5" label="First-Price" />
            <Scatter name="Transactions" data={vickreyData} fill="#4f46e5" fillOpacity={0.6} />
          </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Vickrey Savings by Agent Type" subtitle="Distance below diagonal = consumer surplus" id="chart-savings">
          <BarChart data={[
            { type: 'Critical', savings: microData.filter(d => d.strategy === 'SIRQ' && d.type === 'CRITICAL').reduce((s, d) => s + d.savings, 0) / Math.max(1, microData.filter(d => d.strategy === 'SIRQ' && d.type === 'CRITICAL').length) },
            { type: 'Standard', savings: microData.filter(d => d.strategy === 'SIRQ' && d.type === 'STANDARD').reduce((s, d) => s + d.savings, 0) / Math.max(1, microData.filter(d => d.strategy === 'SIRQ' && d.type === 'STANDARD').length) },
            { type: 'Economy', savings: microData.filter(d => d.strategy === 'SIRQ' && d.type === 'ECONOMY').reduce((s, d) => s + d.savings, 0) / Math.max(1, microData.filter(d => d.strategy === 'SIRQ' && d.type === 'ECONOMY').length) }
          ]} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="type" />
            <YAxis width={60} tickFormatter={(val) => `$${val}`} label={{ value: 'Avg Savings ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, 'Savings']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="savings" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>

        <ChartContainer title="Bidding Rationality" subtitle="Value of Time vs Willingness to Pay" id="chart-bid-rational">
            <ScatterChart {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="vot" name="Value of Time" unit="$/hr" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Value of Time ($/hr)', position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="bid" name="Bid Amount" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Bid ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend verticalAlign="top" height={36} />
              <Scatter name="SIRQ Transactions" data={scatterData} fill="#4f46e5" fillOpacity={0.6} />
            </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Incentive Compatibility" subtitle="Truthful bidding is optimal (no bid shading)" id="chart-ic">
          <LineChart data={displayData} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
            <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} tickFormatter={(val) => `$${val}`} label={{ value: 'Subsidy Pool ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, '']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Area type="monotone" dataKey="subsidyPool" name="Accumulated Surplus" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );

  const renderComparison = () => (
    <div className="space-y-6">
      {/* Strategy Overview */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Queue Management Strategies</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border-l-4 border-slate-400">
            <div className="font-bold text-slate-700 dark:text-slate-300">FIFO</div>
            <div className="text-slate-500 dark:text-slate-400 text-xs mt-1">First-In-First-Out. No priority, fair but inefficient for time-critical cargo.</div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border-l-4 border-indigo-500">
            <div className="font-bold text-indigo-700 dark:text-indigo-300">SIRQ (Ours)</div>
            <div className="text-indigo-600 dark:text-indigo-400 text-xs mt-1">Vickrey auction + dynamic pricing. Truthful bidding, efficient allocation.</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-950/50 rounded-lg border-l-4 border-amber-500">
            <div className="font-bold text-amber-700 dark:text-amber-300">Posted-Price</div>
            <div className="text-amber-600 dark:text-amber-400 text-xs mt-1">Fixed tier prices. Simple but doesn't adapt to demand.</div>
          </div>
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border-l-4 border-emerald-500">
            <div className="font-bold text-emerald-700 dark:text-emerald-300">Priority Queue</div>
            <div className="text-emerald-600 dark:text-emerald-400 text-xs mt-1">Strict type priority. Starves economy agents.</div>
          </div>
        </div>
      </div>

      {/* Comparison Metrics */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">FIFO Revenue</div>
            <div className="text-xl font-bold text-slate-600">${latest.fifoRevenue.toFixed(0)}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800">
            <div className="text-xs font-medium text-indigo-500">SIRQ Revenue</div>
            <div className="text-xl font-bold text-indigo-600">${latest.sirqRevenue.toFixed(0)}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="text-xs font-medium text-amber-500">Posted-Price Revenue</div>
            <div className="text-xl font-bold text-amber-600">${latest.postedPriceRevenue.toFixed(0)}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <div className="text-xs font-medium text-emerald-500">Priority Queue Revenue</div>
            <div className="text-xl font-bold text-emerald-600">${latest.priorityQueueRevenue.toFixed(0)}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Revenue Comparison (All Strategies)" id="chart-rev-all">
          <LineChart data={displayData} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
            <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} tickFormatter={(val) => `$${val}`} />
            <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, '']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey="fifoRevenue" name="FIFO" stroke="#94a3b8" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="sirqRevenue" name="SIRQ" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="postedPriceRevenue" name="Posted-Price" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="priorityQueueRevenue" name="Priority Queue" stroke="#10b981" strokeWidth={1} dot={false} />
          </LineChart>
        </ChartContainer>

        <ChartContainer title="Critical Wait Time (All Strategies)" id="chart-wait-all">
          <LineChart data={displayData} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
            <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Wait (ticks)', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey="fifoWaitCritical" name="FIFO" stroke="#94a3b8" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="sirqWaitCritical" name="SIRQ" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="postedPriceWaitCritical" name="Posted-Price" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="priorityQueueWaitCritical" name="Priority Queue" stroke="#10b981" strokeWidth={1} dot={false} />
          </LineChart>
        </ChartContainer>

        <ChartContainer title="Critical Failure Rate (All Strategies)" subtitle="% of critical cargo that balked/timed out" id="chart-fail-all">
          <LineChart data={displayData} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
            <YAxis unit="%" width={60} tickFormatter={(val) => `${(val * 100).toFixed(0)}`} />
            <Tooltip formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Rate']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey="fifoFailureRate" name="FIFO" stroke="#94a3b8" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="sirqFailureRate" name="SIRQ" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="postedPriceFailureRate" name="Posted-Price" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="priorityQueueFailureRate" name="Priority Queue" stroke="#10b981" strokeWidth={1} dot={false} />
          </LineChart>
        </ChartContainer>

        <ChartContainer title="Economy Wait Time (All Strategies)" subtitle="Fairness to low-priority users" id="chart-econ-all">
          <LineChart data={displayData} {...commonChartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} />
            <YAxis width={60} label={{ value: 'Wait (ticks)', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey="fifoWaitEconomy" name="FIFO" stroke="#94a3b8" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="sirqWaitEconomy" name="SIRQ" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="postedPriceWaitEconomy" name="Posted-Price" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="priorityQueueWaitEconomy" name="Priority Queue" stroke="#10b981" strokeWidth={1} dot={false} />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );

  const renderEfficiency = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Allocative Efficiency (Revenue)" id="chart-rev">
            <AreaChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis stroke="#94a3b8" tick={{fontSize: 10}} width={60} tickFormatter={(val) => `$${val}`} label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip formatter={(val: number) => [`$${val.toFixed(0)}`, '']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
              <Tooltip formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Utilization']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="utilization" name="Station Load" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
        </ChartContainer>

        <ChartContainer title="Bidding Rationality" subtitle="Value of Time vs Willingness to Pay" id="chart-bid">
            <ScatterChart {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="vot" name="Value of Time" unit="$/hr" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Value of Time ($/hr)', position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="bid" name="Bid Amount" unit="$" stroke="#94a3b8" tick={{fontSize: 10}} width={60} label={{ value: 'Bid ($)', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend verticalAlign="top" height={36} />
              <Scatter name="SIRQ Transactions" data={scatterData} fill="#4f46e5" fillOpacity={0.6} />
            </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Queue Length Over Time" id="chart-queue">
             <AreaChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis width={60} label={{ value: 'Vehicles', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="step" dataKey="queueLength" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="Vehicles in Queue" />
             </AreaChart>
        </ChartContainer>
    </div>
  );

  const renderFinancial = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Financial Performance" subtitle="Revenue vs Costs vs Penalties (SIRQ)" id="chart-fin-perf">
            <BarChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" />
                <YAxis width={60} label={{ value: '$', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="sirqRevenue" name="Revenue" stackId="a" fill="#4f46e5" />
                <Bar dataKey="sirqEnergyCost" name="Energy Cost" stackId="b" fill="#f59e0b" />
                <Bar dataKey="sirqDemandPenalty" name="Demand Penalty" stackId="b" fill="#ef4444" />
            </BarChart>
        </ChartContainer>

        <ChartContainer title="Lost Revenue (Churn)" subtitle="Balking Reasons (SIRQ)" id="chart-churn">
            <AreaChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" />
                <YAxis width={60} label={{ value: 'Vehicles', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" dataKey="sirqBalkedPrice" name="Price Balks" stackId="1" stroke="#f97316" fill="#f97316" />
                <Area type="monotone" dataKey="sirqBalkedWait" name="Wait Balks" stackId="1" stroke="#64748b" fill="#64748b" />
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
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
                <Tooltip formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Rate']} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Area type="monotone" dataKey="subsidyPool" name="Accumulated Subsidy ($)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
            </AreaChart>
      </ChartContainer>

      <ChartContainer title="Wait Time Inequality (Gini)" subtitle="0 = Equality, 1 = Max Inequality" id="chart-gini">
            <LineChart data={displayData} {...commonChartProps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="tick" stroke="#94a3b8" tick={{fontSize: 10}} label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
              <YAxis domain={[0, 1]} stroke="#94a3b8" width={60} tick={{fontSize: 10}} label={{ value: 'Gini Coeff', angle: -90, position: 'insideLeft', offset: 0 }} />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="giniCoefficient" name="Gini Coeff" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Lorenz Curve (Wait Time)" subtitle="Cumulative Share of Wait Time" id="chart-lorenz">
            <LineChart data={lorenzData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="percentPop" unit="%" label={{ value: '% of Agents', position: 'insideBottom', offset: -10 }} />
                <YAxis unit="%" width={60} label={{ value: '% of Total Wait', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="percentWait" stroke="#f59e0b" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="perfectLine" stroke="#94a3b8" strokeDasharray="5 5" dot={false} name="Perfect Equality" />
            </LineChart>
      </ChartContainer>

      <ChartContainer title="Economy vs Critical Wait" subtitle="Gap in service levels" id="chart-gap">
            <LineChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                <YAxis label={{ value: 'Wait (ticks)', angle: -90, position: 'insideLeft', offset: 0 }} width={60} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="sirqWaitEconomy" stroke="#94a3b8" dot={false} name="Economy" />
                <Line type="monotone" dataKey="sirqWaitCritical" stroke="#ef4444" dot={false} name="Critical" />
            </LineChart>
      </ChartContainer>
    </div>
  );

  const renderGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartContainer title="Grid Impact Analysis" subtitle="Load vs Transformer Limit (kW)" id="chart-grid-load">
             <AreaChart data={displayData} {...commonChartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tick" label={{ value: 'Time', position: 'insideBottom', offset: -10 }} />
                <YAxis width={60} label={{ value: 'Load (kW)', angle: -90, position: 'insideLeft', offset: 0 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" dataKey="sirqGridLoad" name="SIRQ Load" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} />
                <Area type="monotone" dataKey="fifoGridLoad" name="FIFO Load" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                {config.enableGridAwareness && (
                    <ReferenceLine y={config.transformerLimit} label="Limit" stroke="red" strokeDasharray="3 3" />
                )}
             </AreaChart>
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
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Scatter name="System State" data={heatMapData} fill="#8884d8" fillOpacity={0.6} />
            </ScatterChart>
        </ChartContainer>

        <ChartContainer title="Price vs Demand (Queue)" id="chart-price-demand">
             <ComposedChart data={displayData} {...commonChartProps}>
                 <XAxis dataKey="tick" label={{ value: 'Time (Ticks)', position: 'insideBottom', offset: -10 }} />
                 <YAxis yAxisId="left" width={60} label={{ value: 'Price ($/kWh)', angle: -90, position: 'insideLeft', offset: 0 }} />
                 <YAxis yAxisId="right" orientation="right" width={60} label={{ value: 'Queue Length', angle: 90, position: 'insideRight', offset: 0 }} />
                 <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 <Legend verticalAlign="top" height={36} />
                 <Line yAxisId="left" type="monotone" dataKey="price" stroke="#10b981" dot={false} name="Price" />
                 <Area yAxisId="right" type="monotone" dataKey="queueLength" fill="#6366f1" stroke="#6366f1" fillOpacity={0.2} name="Queue" />
             </ComposedChart>
        </ChartContainer>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
       <div className="flex gap-2 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm overflow-x-auto transition-colors">
          {[
              { id: 'auction', label: 'Vickrey Auction' },
              { id: 'comparison', label: 'Strategy Comparison' },
              { id: 'efficiency', label: 'Efficiency' },
              { id: 'financial', label: 'Financial' },
              { id: 'reliability', label: 'Reliability' },
              { id: 'equity', label: 'Equity' },
              { id: 'grid', label: 'Grid' },
              { id: 'sensitivity', label: 'Sensitivity' }
          ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={clsx(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
                    activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                  {tab.label}
              </button>
          ))}
       </div>

       <div className="flex-1 overflow-y-auto p-6 pb-20">
           {activeTab === 'auction' && renderAuction()}
           {activeTab === 'comparison' && renderComparison()}
           {activeTab === 'efficiency' && renderEfficiency()}
           {activeTab === 'financial' && renderFinancial()}
           {activeTab === 'reliability' && renderReliability()}
           {activeTab === 'equity' && renderEquity()}
           {activeTab === 'grid' && renderGrid()}
           {activeTab === 'sensitivity' && renderSensitivity()}
       </div>
    </div>
  );
};
