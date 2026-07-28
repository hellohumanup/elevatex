'use client';

import React from 'react';
import { Layers, UserX, Unplug, ArrowRight } from 'lucide-react';

export default function PainSectionVinculo() {
  const problems = [
    {
      icon: <Layers className="w-6 h-6 text-violet-400" />,
      title: 'Silos Estructurales Invisibles',
      description: 'El organigrama tradicional miente. Las áreas de tu empresa se comunican un 40% menos de lo que crees, duplicando esfuerzos y estrangulando la velocidad de ejecución en proyectos críticos.'
    },
    {
      icon: <UserX className="w-6 h-6 text-cyan-400" />,
      title: 'Rotación Silenciosa y Desgaste',
      description: 'El talento clave no se va de un día para otro; se desconecta meses antes. Sin métricas de fricción relacional, es imposible anticipar el burnout y la pérdida de tus mayores activos humanos.'
    },
    {
      icon: <Unplug className="w-6 h-6 text-purple-400" />,
      title: 'Fragmentación en Equipos Híbridos',
      description: 'La distancia física ha debilitado los puentes informales de innovación. Las interacciones casuales que generaban ideas han desaparecido, aislando a las personas en redes atomizadas.'
    }
  ];

  return (
    <section className="relative w-full bg-slate-950 py-24 px-6 lg:px-12 border-t border-slate-900">
      <div className="max-w-6xl mx-auto">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-3">
            El coste del punto ciego organizacional
          </h2>
          <p className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Gestionar una organización a ciegas destruye el rendimiento. Tu empresa sufre fugas de valor que un Excel no puede detectar.
          </p>
        </div>

        {/* Problems Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {problems.map((problem, index) => (
            <div 
              key={index} 
              className="group relative p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-all duration-300 backdrop-blur-sm flex flex-col justify-between hover:bg-slate-900/60"
            >
              <div>
                {/* Icon Container */}
                <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center border border-slate-800 mb-6 group-hover:scale-105 transition-transform duration-300">
                  {problem.icon}
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-bold text-slate-100 mb-4 tracking-tight">
                  {problem.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  {problem.description}
                </p>
              </div>

              {/* Decorative Subtle Line and Interactive Indicator */}
              <div className="pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-cyan-400 transition-colors duration-300">
                <span>Impacto en la rentabilidad</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
