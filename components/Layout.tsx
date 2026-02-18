import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  config: { school: string; subject: string; level: string };
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, config, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
    { id: 'examine', icon: 'fa-file-lines', label: 'Examine' },
    { id: 'ingestion', icon: 'fa-camera', label: 'Mark' },
    { id: 'blueprint', icon: 'fa-map', label: 'Blueprint' },
    { id: 'analysis', icon: 'fa-brain', label: 'AI Analysis' },
    { id: 'remediation', icon: 'fa-wand-magic-sparkles', label: 'Remediation' },
  ];

  const mobileItems = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dash' },
    { id: 'examine', icon: 'fa-file-lines', label: 'Exam' },
    { id: 'ingestion', icon: 'fa-camera', label: 'Mark' },
    { id: 'analysis', icon: 'fa-brain', label: 'AI' },
    { id: 'remediation', icon: 'fa-wand-magic-sparkles', label: 'Fix' },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-transparent">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 glass-dark border-r border-white/5 flex-col shrink-0">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <i className="fa-solid fa-graduation-cap text-white text-xl"></i>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Edu-Metric <span className="text-indigo-400">AI</span>
          </h1>
        </div>

        {/* School / Config info */}
        <div className="px-4 pb-4">
          <div className="glass rounded-xl p-3 space-y-1">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-school text-indigo-400 text-xs"></i>
              <span className="text-xs font-semibold text-slate-300">{config.school}</span>
            </div>
            <div className="flex items-center space-x-2 text-[10px] text-slate-500">
              <span className="px-2 py-0.5 bg-indigo-600/15 text-indigo-400 rounded-full font-bold">{config.subject}</span>
              <span className="px-2 py-0.5 bg-purple-600/15 text-purple-400 rounded-full font-bold">{config.level}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <i className={`fa-solid ${item.icon} w-5`}></i>
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="glass p-3 rounded-xl flex items-center space-x-3">
            <div className="w-9 h-9 bg-indigo-600/20 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-user text-indigo-400 text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">Admin</p>
              <p className="text-[10px] text-slate-500 truncate">{config.school}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 transition-all duration-200 text-xs font-semibold"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="relative p-4 md:p-8 safe-pb animate-slide-up">
          {/* Mobile Header */}
          <header className="flex md:hidden items-center justify-between mb-6 pt-2">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
                <i className="fa-solid fa-graduation-cap text-white text-sm"></i>
              </div>
              <div>
                <h1 className="text-lg font-black text-white leading-tight">Edu-Metric</h1>
                <p className="text-[9px] text-slate-500 font-bold">{config.subject} • {config.level}</p>
              </div>
            </div>
            <button onClick={onLogout} className="w-8 h-8 rounded-full glass flex items-center justify-center">
              <i className="fa-solid fa-right-from-bracket text-slate-400 text-xs"></i>
            </button>
          </header>
          
          {children}
        </div>
        
        <footer className="py-6 text-center text-[10px] text-slate-600 font-medium border-t border-white/5 mx-8 mt-auto">
          <p>
            &copy; {new Date().getFullYear()} @KISII SCHOOL SCIENCE AND ENGINEERING DEP. <span className="text-indigo-900/50">|</span> Galvaniy Technologies
          </p>
        </footer>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-dark border-t border-white/10 z-50 px-2 py-3 flex items-center justify-around" style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-inset-bottom))' }}>
        {mobileItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center space-y-1 transition-all duration-200 ${
              activeTab === item.id ? 'text-indigo-400 scale-110' : 'text-slate-500'
            }`}
          >
            <i className={`fa-solid ${item.icon} text-lg`}></i>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
