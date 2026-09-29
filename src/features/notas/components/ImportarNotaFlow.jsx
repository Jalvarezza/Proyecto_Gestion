// src/features/notas/components/ImportarNotaFlow.jsx
import React, { useState, useRef } from 'react';
import { parsearNota } from '../utils/parsearNota';
import { productosApi, notasApi } from '../services/notasService';

export function ImportarNotaFlow({ adminId, onVolver, onCreada }) {
  const pdfRef = useRef(null);

  const [archivoPDF, setArchivoPDF] = useState(null);
  const [paso, setPaso] = useState('upload'); // 'upload' | 'preview'
  const [procesando, setProcesando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorUI, setErrorUI] = useState(null);
  const [erroresParseo, setErroresParseo] = useState([]);

  const [numeroNota, setNumeroNota] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [rutCliente, setRutCliente] = useState('');
  const [numeroOc, setNumeroOc] = useState('');
  const [comentarioDespacho, setComentarioDespacho] = useState('');
  const [filas, setFilas] = useState([]);
  const [textoDebug, setTextoDebug] = useState(null);

  async function handleProcesar() {
    if (!archivoPDF) return;
    setErrorUI(null);
    setErroresParseo([]);
    setProcesando(true);

    const resultado = await parsearNota(archivoPDF);

    if (resultado.errores.length > 0) setErroresParseo(resultado.errores);
    if (resultado.productos.length === 0 && resultado._textoDebug) {
      setTextoDebug(resultado._textoDebug);
    } else {
      setTextoDebug(null);
    }

    setNumeroNota(resultado.numeroNota ?? '');
    setNombreCliente(resultado.nombreCliente ?? '');
    setRutCliente(resultado.rutCliente ?? '');
    setNumeroOc(resultado.numeroOc ?? '');

    const filasBase = resultado.productos.map((p) => ({
      codigoProducto: p.codigoProducto,
      descripcion: p.descripcion,
      cantidad: p.cantidad,
      cantidadEditable: p.cantidad,
      estado: 'buscando',
      productoId: null,
      skuEncontrado: null,
      nombreEnDB: null,
    }));

    setFilas(filasBase);
    setPaso('preview');

    function normalizarCodigo(codigo) {
      return /^\d+$/.test(codigo) ? String(parseInt(codigo, 10)) : codigo;
    }

    const resoluciones = await Promise.allSettled(
      resultado.productos.map((p) => productosApi.getBySku(normalizarCodigo(p.codigoProducto)))
    );

    setFilas(filasBase.map((fila, i) => {
      const res = resoluciones[i];
      if (res.status === 'fulfilled' && res.value) {
        return {
          ...fila,
          estado: 'encontrado',
          productoId: res.value.id,
          skuEncontrado: res.value.sku,
          nombreEnDB: res.value.nombre,
        };
      }
      return { ...fila, estado: 'no_encontrado' };
    }));

    setProcesando(false);
  }

  async function handleCrear() {
    setErrorUI(null);

    if (!numeroNota.trim()) { setErrorUI('El número de NV es obligatorio.'); return; }
    if (!nombreCliente.trim()) { setErrorUI('El nombre del cliente es obligatorio.'); return; }
    if (!rutCliente.trim()) { setErrorUI('El RUT del cliente es obligatorio.'); return; }

    const filasValidas = filas.filter((f) => f.estado === 'encontrado' && f.productoId);
    if (filasValidas.length === 0) {
      setErrorUI('No hay productos encontrados en el catálogo para asociar a esta nota.');
      return;
    }

    setCreando(true);
    try {
      const resultado = await notasApi.crearNota({
        adminId,
        numeroNota: numeroNota.trim(),
        nombreCliente: nombreCliente.trim(),
        rutCliente: rutCliente.trim(),
        numeroOc: numeroOc.trim() || undefined,
        archivoNombre: archivoPDF.name,
        comentarioDespacho: comentarioDespacho.trim() || undefined,
        productos: filasValidas.map((f) => ({
          productoId: f.productoId,
          cantidadSolicitada: f.cantidadEditable,
        })),
      });

      onCreada(resultado.notaId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión con Supabase';
      setErrorUI(msg);
    } finally {
      setCreando(false);
    }
  }

  const totalEncontrados = filas.filter((f) => f.estado === 'encontrado').length;
  const totalNoEncontrados = filas.filter((f) => f.estado === 'no_encontrado').length;
  const buscandoAun = filas.some((f) => f.estado === 'buscando');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-800">
        <button
          onClick={onVolver}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-semibold"
        >
          ← Volver
        </button>
        <h2 className="text-xl font-bold text-white">Nueva Nota de Venta (Importación PDF)</h2>
      </div>

      {/* Paso 1: Carga de Archivo */}
      {paso === 'upload' && (
        <div className="max-w-xl mx-auto bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl">
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Seleccionar archivo PDF de Nota de Venta <span className="text-rose-400">*</span>
          </label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => setArchivoPDF(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => pdfRef.current?.click()}
            className={`w-full py-12 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all ${
              archivoPDF
                ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400'
                : 'border-slate-600 bg-slate-900/50 hover:border-sky-500 text-slate-400'
            }`}
          >
            <span className="text-3xl mb-2">{archivoPDF ? '📄' : '📎'}</span>
            <span className="font-semibold text-sm">
              {archivoPDF ? archivoPDF.name : 'Haga clic para examinar su documento PDF'}
            </span>
          </button>

          <button
            onClick={handleProcesar}
            disabled={!archivoPDF || procesando}
            className="w-full mt-6 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm"
          >
            {procesando ? 'Procesando y extrayendo datos...' : 'Procesar PDF'}
          </button>
        </div>
      )}

      {/* Paso 2: Previsualización y Edición */}
      {paso === 'preview' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">N° NOTA DE VENTA *</label>
              <input
                type="text"
                value={numeroNota}
                onChange={(e) => setNumeroNota(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">CLIENTE *</label>
              <input
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">RUT CLIENTE *</label>
              <input
                type="text"
                value={rutCliente}
                onChange={(e) => setRutCliente(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">N° OC (OPCIONAL)</label>
              <input
                type="text"
                value={numeroOc}
                onChange={(e) => setNumeroOc(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1">OBSERVACIÓN DE DESPACHO</label>
              <textarea
                rows={2}
                value={comentarioDespacho}
                onChange={(e) => setComentarioDespacho(e.target.value)}
                placeholder="Ej: Despachar antes del mediodía..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white"
              />
            </div>
          </div>

          {erroresParseo.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/50 p-4 rounded-lg text-amber-300 text-xs space-y-1">
              {erroresParseo.map((e, i) => <p key={i}>⚠️ {e}</p>)}
            </div>
          )}

          {/* Tabla de Productos Extraídos */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-950/40 border-b border-slate-700 font-bold text-sm text-slate-300">
              Productos Detectados ({filas.length})
            </div>
            <div className="divide-y divide-slate-700/50">
              {filas.map((fila, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-white">{fila.descripcion}</p>
                    <p className="text-xs font-mono text-slate-400">SKU en PDF: {fila.codigoProducto}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm bg-slate-900 px-3 py-1 rounded border border-slate-700">
                      Cant: {fila.cantidad}
                    </span>
                    {fila.estado === 'buscando' && <span className="text-xs text-slate-400">Verificando...</span>}
                    {fila.estado === 'encontrado' && <span className="text-emerald-400 text-xs font-bold">✓ Registrado ({fila.skuEncontrado})</span>}
                    {fila.estado === 'no_encontrado' && <span className="bg-rose-500/20 text-rose-300 text-xs px-2 py-0.5 rounded border border-rose-500/40 font-bold">No en catálogo</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorUI && <div className="p-3 bg-rose-600/30 border border-rose-500 text-rose-300 rounded text-xs">{errorUI}</div>}

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => setPaso('upload')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-semibold"
            >
              ← Cambiar archivo
            </button>
            <button
              onClick={handleCrear}
              disabled={creando || buscandoAun || totalEncontrados === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm"
            >
              {creando ? 'Creando Nota...' : `Crear Nota de Venta (${totalEncontrados} válidos)`}
            </button>
          </div>

          {totalNoEncontrados > 0 && (
            <p className="text-xs text-amber-400 text-center">
              * Los {totalNoEncontrados} productos no registrados en el catálogo serán omitidos al guardar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}