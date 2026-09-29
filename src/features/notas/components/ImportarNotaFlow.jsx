// src/features/notas/components/ImportarNotaFlow.jsx
import { useState, useRef } from 'react';
import { parsearNota } from '../utils/parsearNota';
import { productosApi, notasApi } from '../services/notasService';
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput';

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

  function normalizarCodigo(codigo) {
    if (!codigo) return '';
    const str = String(codigo).trim();
    return /^\d+$/.test(str) ? String(parseInt(str, 10)) : str;
  }

  // ── Paso 1: Parsear PDF y consultar productos ─────────────────────────────

  async function handleProcesar() {
    if (!archivoPDF) return;
    setErrorUI(null);
    setErroresParseo([]);
    setProcesando(true);

    try {
      const resultado = await parsearNota(archivoPDF);

      const errores = resultado.errores || [];
      const productosRaw = resultado.productos || resultado.items || [];
      const debugText = resultado._textoDebug || null;

      if (errores.length > 0) setErroresParseo(errores);

      if (productosRaw.length === 0 && debugText) {
        setTextoDebug(debugText);
      } else {
        setTextoDebug(null);
      }

      setNumeroNota(resultado.numeroNota || resultado.header?.numeroNota || '');
      setNombreCliente(resultado.nombreCliente || resultado.header?.nombreCliente || '');
      setRutCliente(resultado.rutCliente || resultado.header?.rutCliente || '');
      setNumeroOc(resultado.numeroOc || resultado.header?.numeroOc || '');

      // Filtrar filas basura
      const productosValidos = productosRaw.filter((p) => {
        const cod = (p.codigoProducto || p.sku || '').toString().trim();
        const desc = (p.descripcion || p.nombre || '').toString().toUpperCase();
        return (
          cod.length > 0 &&
          cod !== '19' &&
          !desc.includes('TOTAL') &&
          !desc.includes('PÁGINA')
        );
      });

      const filasBase = productosValidos.map((p) => ({
        codigoProducto: p.codigoProducto || p.sku || '',
        descripcion: p.descripcion || p.nombre || 'Sin descripción',
        cantidad: p.cantidad || p.cant || 1,
        cantidadEditable: p.cantidad || p.cant || 1,
        estado: 'buscando',
        productoId: null,
        skuEncontrado: null,
        nombreEnDB: null,
      }));

      setFilas(filasBase);
      setPaso('preview');

      // Consultar productos en DB
      const resoluciones = await Promise.allSettled(
        productosValidos.map((p) => {
          const codClean = normalizarCodigo(p.codigoProducto || p.sku);
          return productosApi.getBySku
            ? productosApi.getBySku(codClean)
            : Promise.reject('Método getBySku no definido');
        })
      );

      setFilas(
        filasBase.map((fila, i) => {
          const res = resoluciones[i];
          if (res.status === 'fulfilled' && res.value) {
            return {
              ...fila,
              estado: 'encontrado',
              productoId: res.value.id || res.value.id_producto || null,
              skuEncontrado: res.value.sku,
              nombreEnDB: res.value.nombre,
            };
          }
          return { ...fila, estado: 'no_encontrado' };
        })
      );
    } catch (err) {
      console.error('Error al procesar PDF:', err);
      setErrorUI('Error al procesar el archivo PDF. Asegúrate de que tenga el formato correcto.');
    } finally {
      setProcesando(false);
    }
  }

  function actualizarCantidad(idx, valor) {
    const n = parseInt(valor, 10);
    if (isNaN(n) || n < 1) return;
    setFilas((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, cantidadEditable: n } : f))
    );
  }

  function eliminarFila(idx) {
    setFilas((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Paso 2: Crear nota ────────────────────────────────────────────────────

  async function handleCrear() {
    setErrorUI(null);

    if (!numeroNota.trim()) {
      setErrorUI('El número de Nota de Venta es obligatorio.');
      return;
    }
    if (!nombreCliente.trim()) {
      setErrorUI('El nombre del cliente es obligatorio.');
      return;
    }
    if (!rutCliente.trim()) {
      setErrorUI('El RUT del cliente es obligatorio.');
      return;
    }

    const filasValidas = filas.filter(
      (f) => f.estado === 'encontrado' && f.productoId
    );
    if (filasValidas.length === 0) {
      setErrorUI('No hay productos vinculados con el catálogo para registrar la nota.');
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
        archivoNombre: archivoPDF ? archivoPDF.name : '',
        comentarioDespacho: comentarioDespacho.trim() || undefined,
        productos: filasValidas.map((f) => ({
          productoId: f.productoId,
          cantidadSolicitada: f.cantidadEditable,
        })),
      });

      onCreada(resultado?.notaId || resultado?.id_nv || resultado?.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setErrorUI(msg);
    } finally {
      setCreando(false);
    }
  }

  const totalEncontrados = filas.filter((f) => f.estado === 'encontrado').length;
  const totalNoEncontrados = filas.filter((f) => f.estado === 'no_encontrado').length;
  const buscandoAun = filas.some((f) => f.estado === 'buscando');

  return (
      <div className="w-full min-h-screen bg-slate-950 p-6 text-slate-100">
        <div className="max-w-7xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver
        </button>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Importar Nota de Venta
        </h2>
      </div>

      {/* ── Paso 1: Upload ── */}
      {paso === 'upload' && (
        <div className="max-w-xl mx-auto py-8">
          <div className="mb-6 text-center">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Documento Nota de Venta (PDF) <span className="text-rose-400">*</span>
            </label>
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setArchivoPDF(e.target.files?.[0] ?? null)}
            />
            <div
              onClick={() => pdfRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                archivoPDF
                  ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300'
                  : 'border-slate-700 hover:border-sky-500 bg-slate-800/40 hover:bg-slate-800/80 text-slate-400'
              }`}
            >
              <div className="p-3 bg-slate-800 rounded-full border border-slate-700">
                <svg className="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              {archivoPDF ? (
                <span className="font-semibold text-sm text-emerald-400 truncate max-w-xs">
                  {archivoPDF.name}
                </span>
              ) : (
                <div className="text-center">
                  <span className="text-sm font-medium text-slate-200 block">Haz clic para seleccionar el PDF</span>
                  <span className="text-xs text-slate-500">Solo archivos en formato .pdf</span>
                </div>
              )}
            </div>
          </div>

          {errorUI && (
            <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-sm">
              {errorUI}
            </div>
          )}

          <button
            onClick={handleProcesar}
            disabled={!archivoPDF || procesando}
            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl transition shadow-lg shadow-sky-950/50 flex items-center justify-center gap-2"
          >
            {procesando ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando Documento...
              </>
            ) : (
              'Procesar Nota de Venta'
            )}
          </button>
        </div>
      )}

      {/* ── Paso 2: Preview ── */}
      {paso === 'preview' && (
        <div className="space-y-6">
          {/* Metadata Cabecera */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                N° Nota de Venta <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={numeroNota}
                onKeyDown={onlyNumbersKeyDown}
                onPaste={onlyNumbersPaste}
                onChange={(e) => setNumeroNota(e.target.value)}
                placeholder="12345"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Cliente <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                RUT Cliente <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={rutCliente}
                onChange={(e) => setRutCliente(e.target.value)}
                placeholder="12.345.678-9"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                N° OC <span className="text-slate-500 lowercase">(opcional)</span>
              </label>
              <input
                type="text"
                value={numeroOc}
                onKeyDown={onlyNumbersKeyDown}
                onPaste={onlyNumbersPaste}
                onChange={(e) => setNumeroOc(e.target.value)}
                placeholder="—"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Comentario de Despacho
              </label>
              <textarea
                rows={2}
                value={comentarioDespacho}
                onChange={(e) => setComentarioDespacho(e.target.value)}
                placeholder="Indicaciones para despacho o recepción..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>
          </div>

          {erroresParseo.length > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-700/50 rounded-xl text-amber-200 text-xs space-y-1">
              {erroresParseo.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}

          {textoDebug && (
            <details className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
              <summary className="cursor-pointer font-medium text-slate-300">Texto detectado en el PDF</summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-500">{textoDebug}</pre>
            </details>
          )}

          {/* Lista de productos */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-300">
                Productos Identificados ({filas.length})
              </h3>
              <div className="flex gap-2 text-xs">
                <span className="text-emerald-400 font-medium">{totalEncontrados} listos</span>
                {totalNoEncontrados > 0 && (
                  <span className="text-rose-400 font-medium">• {totalNoEncontrados} sin catálogo</span>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filas.map((fila, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800/60 border border-slate-700/70 p-3 rounded-xl flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-200 truncate">
                      {fila.nombreEnDB || fila.descripcion}
                    </p>
                    <code className="text-xs text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      SKU: {fila.codigoProducto}
                    </code>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-medium">Cant:</span>
                      <input
                        type="text"
                        value={fila.cantidadEditable}
                        onKeyDown={onlyNumbersKeyDown}
                        onPaste={onlyNumbersPaste}
                        onChange={(e) => actualizarCantidad(idx, e.target.value)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-sm font-bold text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="w-28 text-right">
                      {fila.estado === 'buscando' && (
                        <span className="inline-flex items-center text-xs text-amber-400 bg-amber-950/40 px-2 py-1 rounded border border-amber-800/40">
                          Buscando...
                        </span>
                      )}
                      {fila.estado === 'encontrado' && (
                        <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-800/40 font-medium">
                          ✓ Encontrado
                        </span>
                      )}
                      {fila.estado === 'no_encontrado' && (
                        <span className="inline-flex items-center text-xs text-rose-400 bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-800/40 font-medium">
                          Sin Catálogo
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => eliminarFila(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                      title="Eliminar producto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorUI && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-sm">
              {errorUI}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setPaso('upload')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition"
            >
              ← Cambiar archivo
            </button>
            <button
              onClick={handleCrear}
              disabled={creando || buscandoAun || totalEncontrados === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-950/50 flex items-center gap-2 text-sm"
            >
              {creando ? 'Guardando Nota...' : `Crear Nota de Venta (${totalEncontrados})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}