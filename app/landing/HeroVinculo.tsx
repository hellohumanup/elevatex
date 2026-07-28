'use client';

import React from 'react';
import { Network, ChevronRight, Activity, Cpu } from 'lucide-react';

export default function HeroVinculo() {
  return (
    <section className="relative w-full min-h-screen bg-slate-950 flex items-center justify-center overflow-hidden px-6 lg:px-12">
      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-900/10 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="relative z-10 max-w-5xl mx-auto text-center mt-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-800 backdrop-blur-sm mb-8">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Powered by ElevateX
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 tracking-tight leading-tight mb-8">
          La radiografía matemática <br className="hidden md:block" /> de tu organización.
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed">
          Vínculo utiliza algoritmos de Análisis de Redes Organizacionales (ONA) e Inteligencia Artificial para mapear la cohesión real de tus equipos. Descubre los líderes ocultos, elimina los silos y diseña estructuras basadas en datos, no en el organigrama.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <button className="group flex items-center gap-3 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition-all duration-300 hover:scale-105 shadow-[0_0_30px_-5px_rgba(6,182,212,0.4)]">
            <Cpu className="w-5 h-5" />
            Solicitar Acceso Anticipado
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg border border-slate-700 transition-all duration-300 hover:border-slate-500">
            <Network className="w-5 h-5 text-violet-400" />
            Ver métricas ONA
          </button>
        </div>
      </div>

      {/* Abstract Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none"></div>
    </section>
  );
}
