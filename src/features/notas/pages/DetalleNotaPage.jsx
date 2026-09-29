// src/features/notas/pages/DetalleNotaPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { detalleNotaApi } from '../services/detalleNotaService';

export function DetalleNotaPage() {
  const { id_nv } = useParams();
  const navigate = useNavigate();
  const scannerRef = useRef(null);

  const [nota, setNota] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorUI, setErrorUI] = useState(null);
  const [busquedaSku, setBusquedaSku] = useState('');
  const [mensajeScan, setMensajeScan] = useState(null);

  useEffect(() => {
    cargarNota();
  }, [id_nv]);

  // Mantiene el foco en el campo de escaneo para lecturas continuas
  useEffect(() => {
    if (!loading && scannerRef.current) {
      scannerRef.current.focus();
    }
  }, [loading]);

  const cargarNota = async () => {
    setLoading(true);
    setErrorUI(null);
    try {
      const data = await detalleNotaApi.getNotaById(id_nv);
      setNota(data);

      const detalleFormateado = (data.notas_venta_detalle || []).map((d) => ({
        id_nv_detalle: d.id_nv_detalle,
        id_producto: d.id_producto,
        sku: d.productos?.sku || 'N/A',
        nombre: d.productos?.nombre || 'Producto sin nombre',
        ubicacion: d.productos?.ubicacion || 'Sin Ubicación',
        cant_solicitada: d.cant_solicitada || 0,
        cant_picked: d.cant_picked || 0,
        cant_validada: d.cant_validada || 0,
      }));

      setItems(detalleFormateado);
    } catch (err) {
      console.error(err);
      setErrorUI('Error al obtener la información de la Nota de Venta.');
    } finally {
      setLoading(false);
    }
  };

  // Manejador para escaneo mediante lector de código de barras
  const handleScanSubmit = (e) => {
    e.preventDefault();
    if (!busquedaSku.trim()) return;

    const skuLimpio = busquedaSku.trim().toUpperCase();
    const index = items.findIndex((i) => i.sku.toUpperCase() === skuLimpio);

    if (index !== -1) {
      const item = items[index];
      if (item.cant_picked < item.cant_solicitada) {
        modificarCantidad(index, 1);
        setMensajeScan({ tipo: 'exito', texto: `+1 a ${item.sku}` });
      } else {
        setMensajeScan({ tipo: 'alerta', texto: `SKU ${item.sku} ya completó la cantidad solicitada.` });
      }
    } else {
      setMensajeScan({ tipo: 'error', texto: `El SKU "${skuLimpio}" no pertenece a esta Nota.` });
    }

    setBusquedaSku('');
    setTimeout(() => setMensajeScan(null), 3000);
  };

  // Ajuste manual de cantidades
  const modificarCantidad = (index, delta) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      const nuevaCant = Math.max(0, Math.min(item.cant_solicitada, item.cant_picked + delta));
      item.cant_picked = nuevaCant;
      item.cant_validada = nuevaCant; // Asignación directa para flujo ágil
      copy[index] = item;
      return copy;
    });
  };

  // Marcar ítem completo
  const completarItem = (index) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        cant_picked: copy[index].cant_solicitada,
        cant_validada: copy[index].cant_solicitada,
      };
      return copy;
    });
  };

  const guardarAvance = async () => {
    setGuardando(true);
    setErrorUI(null);
    try {
      await detalleNotaApi.guardarAvancePicking(items);
      // Actualizar a estado 'EN_VALIDACION' si estaba 'PENDIENTE_PICKING'
      if (nota.estado === 'PENDIENTE_PICKING') {
        await detalleNotaApi.cambiarEstadoNota(id_nv, 'EN_VALIDACION');
        setNota((prev) => ({ ...prev, estado: 'EN_VALIDACION' }));
      }
      setMensajeScan({ tipo: 'exito', texto: 'Avance guardado correctamente en Supabase.' });
      setTimeout(() => setMensajeScan(null), 3000);
    } catch (err) {
      console.error(err);
      setErrorUI('Ocurrió un error al guardar el avance.');
    } finally {
      setGuardando(false);
    }
  };

  const finalizarPicking = async () => {
    setGuardando(true);
    setErrorUI(null);
    try {
      await detalleNotaApi.guardarAvancePicking(items);
      await detalleNotaApi.cambiarEstadoNota(id_nv, 'COMPLETADO');
      navigate('/notas');
    } catch (err) {
      console.error(err);
      setErrorUI('Ocurrió un error al finalizar la nota.');
      setGuardando(false);
    }
  };

  // Cálculo de totales para resumen y progreso
  const totalSolicitado = items.reduce((acc, i) => acc + i.cant_solicitada, 0);
  const totalPicked = items.reduce((acc, i) => acc + i.cant_picked, 0);
  const porcentaje = totalSolicitado > 0 ? Math.round((totalPicked / totalSolicitado) * 100) : 0;
  const estaCompleto = totalSolicitado > 0 && totalPicked === totalSolicitado;

  if (loading) {
    return <div className="min-h-screen bg-slate-900 text-slate-400 p-8 text-center">Cargando detalle de la Nota de Venta...</div>;
  }

  if (errorUI && !nota) {
    return (
      <div className="min-h-screen bg-slate-900 text-rose-400 p-8 text-center">
        <p className="mb-4">{errorUI}</p>
        <button onClick={() => navigate('/notas')} className="px-4 py-2 bg-slate-800 text-white rounded">
          ← Volver al listado
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 font-sans pb-24">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/notas')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-semibold"
          >
            ← Volver
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Nota NV: <span className="text-sky-400">{nota.numero_nv}</span>
            </h1>
            <p className="text-xs text-slate-400">Cliente: {nota.cliente_nombre} | RUT: {nota.rut_cliente}</p>
          </div>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
          nota.estado === 'COMPLETADO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
          nota.estado === 'EN_VALIDACION' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' :
          'bg-amber-500/20 text-amber-400 border-amber-500/30'
        }`}>
          {nota.estado}
        </span>
      </div>

      {/* Comentario de despacho */}
      {nota.comentario_despacho && (
        <div className="mb-6 p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
          💬 <strong>Observación de Despacho:</strong> {nota.comentario_despacho}
        </div>
      )}

      {/* Barra de progreso de Picking */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
        <div className="flex justify-between items-center text-xs font-bold mb-2">
          <span className="text-slate-300">Progreso del Picking</span>
          <span className="text-sky-400">{totalPicked} de {totalSolicitado} unidades ({porcentaje}%)</span>
        </div>
        <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-700">
          <div
            className={`h-full transition-all duration-300 ${estaCompleto ? 'bg-emerald-500' : 'bg-sky-500'}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      {/* Campo de escaneo por código de barras */}
      <form onSubmit={handleScanSubmit} className="mb-6">
        <div className="relative">
          <input
            ref={scannerRef}
            type="text"
            value={busquedaSku}
            onChange={(e) => setBusquedaSku(e.target.value)}
            placeholder="Escanear SKU o Código de Barras..."
            className="w-full pl-10 pr-4 py-3 bg-slate-800 border-2 border-sky-500/50 focus:border-sky-400 rounded-xl text-white font-mono placeholder:text-slate-500 text-sm focus:outline-none"
          />
          <span className="absolute left-3 top-3.5 text-slate-400">🔍</span>
        </div>
        {mensajeScan && (
          <p className={`mt-2 text-xs font-semibold ${
            mensajeScan.tipo === 'exito' ? 'text-emerald-400' :
            mensajeScan.tipo === 'alerta' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {mensajeScan.texto}
          </p>
        )}
      </form>

      {/* Lista de productos para picking */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const completado = item.cant_picked >= item.cant_solicitada;

          return (
            <div
              key={item.id_nv_detalle}
              className={`p-4 rounded-xl border transition-all ${
                completado
                  ? 'bg-emerald-950/10 border-emerald-500/40'
                  : item.cant_picked > 0
                  ? 'bg-sky-950/10 border-sky-500/40'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-900 border border-slate-700 text-sky-400 rounded">
                      {item.sku}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-900 border border-slate-700 text-amber-400 rounded">
                      📍 {item.ubicacion}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-white">{item.nombre}</h3>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                    <button
                      type="button"
                      onClick={() => modificarCantidad(idx, -1)}
                      disabled={item.cant_picked === 0}
                      className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-white font-bold"
                    >
                      -
                    </button>
                    <span className="w-16 text-center font-mono font-bold text-sm">
                      {item.cant_picked} / {item.cant_solicitada}
                    </span>
                    <button
                      type="button"
                      onClick={() => modificarCantidad(idx, 1)}
                      disabled={completado}
                      className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-white font-bold"
                    >
                      +
                    </button>
                  </div>

                  {!completado && (
                    <button
                      type="button"
                      onClick={() => completarItem(idx)}
                      className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded font-semibold"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de acciones inferior fijada */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur border-t border-slate-800 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-4">
          <button
            onClick={guardarAvance}
            disabled={guardando}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-slate-200 font-bold rounded-lg text-sm"
          >
            {guardando ? 'Guardando...' : 'Guardar Avance'}
          </button>

          <button
            onClick={finalizarPicking}
            disabled={guardando}
            className={`px-6 py-2.5 text-white font-bold rounded-lg text-sm transition-all ${
              estaCompleto
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950'
                : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {guardando ? 'Finalizando...' : estaCompleto ? '✓ Finalizar Nota' : 'Finalizar Parcial'}
          </button>
        </div>
      </div>
    </div>
  );
}