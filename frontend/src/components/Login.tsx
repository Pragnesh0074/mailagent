"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Shield, Sparkles, ArrowRight, Zap } from 'lucide-react';

export default function Login() {
  const handleLogin = () => {
    window.location.href = 'http://localhost:8000/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 overflow-hidden relative">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-xl relative z-10"
      >
        <div className="glass-card p-12 text-center relative overflow-hidden">
          {/* Decorative Ring */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-500/5 rounded-full -mt-32 blur-3xl" />
          
          <div className="mb-8 relative inline-block">
            <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20 transform -rotate-6 group hover:rotate-0 transition-transform duration-500">
              <Mail className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow-lg animate-bounce">
              <Sparkles className="w-3 h-3 text-black fill-black" />
            </div>
          </div>

          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter leading-tight">
            Meet your new <br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-violet-400 to-amber-400">
              AI MailAgent
            </span>
          </h1>
          
          <p className="text-zinc-400 text-lg mb-12 max-w-md mx-auto font-medium">
            Summarize, categorize, and draft replies to your emails with the power of Llama 3.3.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-12 text-left">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <Shield className="w-5 h-5 text-blue-400 mb-2" />
              <h4 className="text-white text-xs font-black uppercase tracking-widest mb-1">Secure</h4>
              <p className="text-zinc-500 text-xs leading-relaxed">Direct Gmail OAuth2 integration.</p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <Zap className="w-5 h-5 text-amber-400 mb-2" />
              <h4 className="text-white text-xs font-black uppercase tracking-widest mb-1">Instant</h4>
              <p className="text-zinc-500 text-xs leading-relaxed">Real-time AI summarization.</p>
            </div>
          </div>

          <button 
            onClick={handleLogin}
            className="group w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-blue-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-blue-500/40"
          >
            Connect with Google
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <p className="mt-8 text-zinc-600 text-[10px] font-black uppercase tracking-widest">
            By connecting, you agree to allow MailAgent to access your inbox.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
