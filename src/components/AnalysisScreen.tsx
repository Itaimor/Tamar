import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, AlertTriangle, Shield } from "lucide-react";

const triggerFoods = [
  { name: "Garlic", risk: 85, color: "risk-high" },
  { name: "Onions", risk: 78, color: "risk-high" },
  { name: "Milk", risk: 72, color: "risk-high" },
  { name: "Apples", risk: 60, color: "risk-medium" },
  { name: "Bread (Wheat)", risk: 55, color: "risk-medium" },
  { name: "Broccoli", risk: 48, color: "risk-medium" },
  { name: "Beans", risk: 42, color: "risk-medium" },
  { name: "Cheese", risk: 35, color: "risk-medium" },
  { name: "Eggs", risk: 15, color: "risk-low" },
  { name: "Rice", risk: 8, color: "risk-low" },
];

const monthlyData = [
  { day: "W1", painFree: 5, flareUp: 2 },
  { day: "W2", painFree: 4, flareUp: 3 },
  { day: "W3", painFree: 6, flareUp: 1 },
  { day: "W4", painFree: 5, flareUp: 2 },
];

const getRiskColor = (risk: number) => {
  if (risk >= 60) return "bg-risk-high";
  if (risk >= 30) return "bg-warning";
  return "bg-safe";
};

const getRiskBg = (risk: number) => {
  if (risk >= 60) return "bg-risk-high/15";
  if (risk >= 30) return "bg-warning/15";
  return "bg-safe/15";
};

const AnalysisScreen = () => {
  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personalized trigger report</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: TrendingUp, label: "Tracked Meals", value: "147", color: "text-primary" },
          { icon: AlertTriangle, label: "Triggers Found", value: "10", color: "text-risk-high" },
          { icon: Shield, label: "Safe Foods", value: "23", color: "text-safe" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="tamar-card text-center">
            <Icon size={18} className={`mx-auto mb-1 ${color}`} strokeWidth={1.5} />
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Monthly summary chart */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="tamar-card">
        <h3 className="text-sm font-semibold text-foreground mb-3">Monthly Summary</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="painFreeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(122, 39%, 49%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(122, 39%, 49%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="flareGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
              <Tooltip />
              <Area type="monotone" dataKey="painFree" stroke="hsl(122, 39%, 49%)" fill="url(#painFreeGrad)" strokeWidth={2} name="Pain-Free Days" />
              <Area type="monotone" dataKey="flareUp" stroke="hsl(0, 72%, 51%)" fill="url(#flareGrad)" strokeWidth={2} name="Flare-Up Days" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-[10px] text-muted-foreground">Pain-Free</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
            <span className="text-[10px] text-muted-foreground">Flare-Up</span>
          </div>
        </div>
      </motion.div>

      {/* Top 10 Trigger Foods */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Top 10 Trigger Foods</h3>
        <div className="space-y-2.5">
          {triggerFoods.map((food, i) => (
            <motion.div
              key={food.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
              <span className="text-sm text-foreground w-28 truncate">{food.name}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${getRiskColor(food.risk)}`}
                  style={{ width: `${food.risk}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground w-10 text-right">{food.risk}%</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalysisScreen;
