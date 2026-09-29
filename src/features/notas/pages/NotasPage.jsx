// src/features/notas/pages/NotasPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { notasApi } from '../services/notasService';
import { ImportarNotaFlow } from '../components/ImportarNotaFlow';

export function NotasPage() {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tabActivo, setTabActivo] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [importar, setImportar] = useState(false);

  const ROL = localStorage.getItem('user_rol') || 'admin';
  const ADMIN_ID = localStorage.getItem('user_id') || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const cargarNotas = async () => {
    setLoading(true);
    try {
      const data = await notasApi.fetchNotas();
      setNotas(data);
    } catch (err) {
      console.error(err);
      setError('Error al cargar notas desde Supabase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarNotas();
  }, []);

  const kpis = useMemo(() => ({
    pendientes: notas.filter((n) => n.estado === 'pendiente').length,
    enPreparacion: notas.filter((n) => n.estado === 'preparacion').length,
    completadas: notas.filter((n) => n.estado === 'completa').length,
  }), [notas]);

  const notasFiltradas = useMemo(() => {
    let lista = notas;
    if (tabActivo === 'pendientes') {
      lista = lista.filter((n) => n.estado === 'pendiente' || n.estado === 'preparacion');
    } else {
      lista = lista.filter((n) => n.estado === 'completa');
    }

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter((n) => n.numeroNota.toLowerCase().includes(q) || n.nombreCliente.toLowerCase().includes(q));
    }
    return lista;
  }, [notas, tabActivo, busqueda]);

  if (importar) {
    return (
      <ImportarNotaFlow
        adminId={ADMIN_ID}
        onVolver={() => setImportar(false)}
        onCreada={(notaId) => {
          setImportar(false);
          cargarNotas();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-sky-400">NV Preparación y Control</h1>
        {ROL === 'admin' && (
          <button
            onClick={() => setImportar(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition-all"
          >
            + Importar NV (PDF)
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">PENDIENTES</p>
            <p className="text-2xl font-bold text-amber-400">{kpis.pendientes}</p>
          </div>
          <span className="text-2xl">⏳</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">EN PREPARACIÓN</p>
            <p className="text-2xl font-bold text-sky-400">{kpis.enPreparacion}</p>
          </div>
          <span className="text-2xl">📦</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">COMPLETADAS</p>
            <p className="text-2xl font-bold text-emerald-400">{kpis.completadas}</p>
          </div>
          <span className="text-2xl">✓</span>
        </div>
      </div>

      {/* Filtros y Tabs */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setTabActivo('pendientes')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              tabActivo === 'pendientes' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pendientes ({kpis.pendientes + kpis.enPreparacion})
          </button>
          <button
            onClick={() => setTabActivo('completas')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              tabActivo === 'completas' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Completadas ({kpis.completadas})
          </button>
        </div>

        <input
          type="search"
          placeholder="Buscar por N° NV o cliente..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="px-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500 w-full sm:w-72"
        />
      </div>

      {/* Grid de Tarjetas de Notas de Venta */}
      {loading ? (
        <p className="text-slate-400 text-center py-8">Cargando Notas de Venta...</p>
      ) : error ? (
        <p className="text-rose-400 text-center py-8">{error}</p>
      ) : notasFiltradas.length === 0 ? (
        <p className="text-slate-500 text-center py-12 italic">No hay notas de venta registradas en esta vista.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notasFiltradas.map((nota) => (
            <div key={nota.notaId} className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-lg text-white">{nota.numeroNota}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    nota.estado === 'completa' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    nota.estado === 'preparacion' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' :
                    'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {nota.estado}
                  </span>
                </div>
                <p className="text-sm text-slate-300 font-medium mb-4">{nota.nombreCliente}</p>
              </div>

              <div className="pt-4 border-t border-slate-700/60 flex justify-between items-center text-xs text-slate-400">
                <span>📦 {nota.productosCompletos}/{nota.totalProductos} ítems</span>
                <span className="font-mono text-slate-500">
                  {new Date(nota.creadoEn).toLocaleDateString('es-CL')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}