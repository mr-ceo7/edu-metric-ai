import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (config: { school: string; subject: string; level: string }) => void;
  onDemoLogin?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onDemoLogin }) => {
  const [password, setPassword] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [level, setLevel] = useState('Form 4');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin') {
      onLogin({ school: 'Kisii School', subject, level });
    } else {
      setError('Invalid password');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const subjects = [
    'Mathematics', 'English', 'Kiswahili', 'Physics', 'Chemistry',
    'Biology', 'History', 'Geography', 'CRE', 'Business Studies',
    'Computer Studies', 'Agriculture'
  ];

  const levels = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600/20 rounded-2xl mb-6 border border-indigo-500/30 animate-pulse-glow">
            <i className="fa-solid fa-graduation-cap text-indigo-400 text-3xl"></i>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Edu-Metric <span className="text-indigo-400">AI</span>
          </h1>
          <p className="text-slate-500 mt-2 text-sm">Kisii School • Exam Analytics Platform</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className={`glass-card shadow-2xl space-y-6 ${isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
          {/* Subject selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block ml-1">
              Subject
            </label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3.5 text-white font-semibold appearance-none cursor-pointer focus:border-indigo-500/50 focus:outline-none transition-colors"
            >
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Level selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block ml-1">
              Level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {levels.map(l => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                    level === l
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-105'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-white/5'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block ml-1">
              Admin Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password"
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3.5 text-white font-semibold placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
              />
              <i className="fa-solid fa-lock absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm"></i>
            </div>
            {error && (
              <p className="text-rose-400 text-xs font-semibold ml-1 animate-fade-in">
                <i className="fa-solid fa-circle-exclamation mr-1"></i>{error}
              </p>
            )}
          </div>

          {/* Login button */}
          <button
            type="submit"
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-black text-base shadow-xl shadow-indigo-500/20 transition-all duration-200 active:scale-[0.98] flex items-center justify-center space-x-2"
          >
            <i className="fa-solid fa-right-to-bracket"></i>
            <span>Access Platform</span>
          </button>

          {onDemoLogin && (
            <button
              type="button"
              onClick={onDemoLogin}
              className="w-full py-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center space-x-2 group"
            >
              <i className="fa-solid fa-play group-hover:scale-110 transition-transform"></i>
              <span>Launch KSEF Demo Mode</span>
            </button>
          )}

          <p className="text-center text-slate-600 text-[11px]">
            Powered by  Galvaniy AI
          </p>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-4px); }
        }
      `}</style>
    </div>
  );
};

export default LoginScreen;
