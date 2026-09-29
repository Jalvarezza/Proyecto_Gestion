// src/features/validacion/components/MesaValidacion.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { procesarEscaneoValidacion } from '../services/validationService';

export function MesaValidacion() {
  const [numeroNV, setNumeroNV] = useState('NV-1001');
  const [nvData, setNvData] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputBarcode, setInputBarcode] = useState('');
  const [mensajeState, setMensajeState] = useState({
    texto: 'Esperando escaneo de producto...',
    tipo: 'info', // 'success', 'error', 'warning', 'info'
  });

  const barcodeInputRef = useRef(null);
  
  // ID del validador logueado (UUID ficticio o desde tu contexto de Auth)
  const ID_VALIDADOR_ACTUAL = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

  // 1. Cargar la Nota de Venta y sus productos
  const cargarNotaVenta = async (nvBuscar) => {
    setLoading(true);
    try {
      const { data: nv, error: nvErr } = await supabase
        .from('notas_venta')
        .select('*')
        .eq('numero_nv', nvBuscar)
        .single();

      if (nvErr || !nv) {
        setMensajeState({ texto: `Nota de Venta ${nvBuscar} no encontrada.`, tipo: 'error' });
        setNvData(null);
        setDetalles([]);
        return;
      }

      const { data: det, error: detErr } = await supabase
        .from('notas_venta_detalle')
        .select(`
          id_nv_detalle,
          cant_solicitada,
          cant_validada,
          productos ( id_producto, sku, nombre, codigo_barras )
        `)
        .eq('id_nv', nv.id_nv);

      if (detErr) throw detErr;

      setNvData(nv);
      setDetalles(det || []);
      setMensajeState({ texto: `Nota de Venta ${nv.numero_nv} cargada. Lista para escanear.`, tipo: 'info' });
    } catch (err) {
      console.error(err);
      setMensajeState({ texto: 'Error al cargar la Nota de Venta.', tipo: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarNotaVenta(numeroNV);
  }, []);

  // Mantiene el foco en el campo de escaneo
  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [detalles, mensajeState]);

  // Reproductor de tonos sintéticos para feedback auditivo de bodega
  const playSound = (tipo) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (tipo === 'success') {
        osc.frequency.value = 880; // Tono agudo
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.2);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.value = 150; // Tono grave / alerta
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.log('Audio no soportado o bloqueado por el navegador');
    }
  };

  // 2. Manejo del evento de escaneo (Submit por ENTER)
  const handleScanSubmit = async (e) => {
    e.preventDefault();
    const codigo = inputBarcode.trim();
    if (!codigo) return;

    setInputBarcode('');

    const resultado = await procesarEscaneoValidacion(numeroNV, codigo, ID_VALIDADOR_ACTUAL);

    if (resultado.success) {
      playSound('success');
      setMensajeState({
        texto: resultado.message,
        tipo: 'success',
      });
    } else {
      playSound('error');
      const tipoAlerta = resultado.type === 'SOBRANTE' ? 'warning' : 'error';
      setMensajeState({
        texto: resultado.message,
        tipo: tipoAlerta,
      });
    }

    // Recargar datos actualizados de la NV
    await cargarNotaVenta(numeroNV);
  };

  // Clases CSS dinámicas para los estados de alerta
  const getAlertStyle = () => {
    switch (mensajeState.tipo) {
      case 'success': return 'bg-emerald-600 text-white animate-pulse';
      case 'error': return 'bg-rose-600 text-white animate-bounce';
      case 'warning': return 'bg-amber-500 text-slate-900';
      default: return 'bg-slate-700 text-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-sky-400">📦 Mesa de Validación de Salida</h1>
        <div className="flex gap-2">
          <input
            type="text"
            value={numeroNV}
            onChange={(e) => setNumeroNV(e.target.value)}
            placeholder="Buscar NV..."
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm"
          />
          <button
            onClick={() => cargarNotaVenta(numeroNV)}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded text-sm"
          >
            Cargar NV
          </button>
        </div>
      </header>

      {/* Banner de Feedback Dinámico para el Validador */}
      <div className={`p-6 rounded-xl mb-6 text-center font-bold text-xl transition-all shadow-lg ${getAlertStyle()}`}>
        {mensajeState.texto}
      </div>

      {/* Input de Lectura de Escáner */}
      <form onSubmit={handleScanSubmit} className="mb-6">
        <label className="block text-sm font-semibold mb-2 text-slate-400">
          ESCANEAR CÓDIGO DE BARRAS (Lector listo):
        </label>
        <input
          ref={barcodeInputRef}
          type="text"
          value={inputBarcode}
          onChange={(e) => setInputBarcode(e.target.value)}
          placeholder="Escanee aquí el producto..."
          className="w-full px-4 py-3 bg-slate-800 border-2 border-sky-500 rounded-lg text-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-400"
          autoFocus
        />
      </form>

      {/* Información de la NV */}
      {nvData && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm text-slate-400">Nota de Venta:</span>
              <h2 className="text-xl font-bold text-white">{nvData.numero_nv}</h2>
            </div>
            <div>
              <span className="text-sm text-slate-400">Cliente:</span>
              <p className="font-medium">{nvData.cliente_nombre}</p>
            </div>
            <div>
              <span className="text-sm text-slate-400">Estado:</span>
              <span className={`ml-2 px-3 py-1 rounded-full text-xs font-bold ${
                nvData.estado === 'VALIDADO_OK' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}>
                {nvData.estado}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Productos de la Nota de Venta */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-700 text-slate-400 text-sm">
              <th className="p-4">SKU / Producto</th>
              <th className="p-4">Código de Barras</th>
              <th className="p-4 text-center">Progreso</th>
              <th className="p-4 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {detalles.map((item) => {
              const completado = item.cant_validada >= item.cant_solicitada;
              const porcentaje = Math.min((item.cant_validada / item.cant_solicitada) * 100, 100);

              return (
                <tr key={item.id_nv_detalle} className={completado ? 'bg-emerald-950/10' : ''}>
                  <td className="p-4">
                    <p className="font-semibold text-white">{item.productos?.nombre}</p>
                    <p className="text-xs font-mono text-slate-400">{item.productos?.sku}</p>
                  </td>
                  <td className="p-4 font-mono text-slate-300 text-sm">
                    {item.productos?.codigo_barras}
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-bold text-lg">
                      {item.cant_validada} / {item.cant_solicitada}
                    </span>
                    <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          completado ? 'bg-emerald-500' : 'bg-sky-500'
                        }`}
                        style={{ width: `${porcentaje}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {completado ? (
                      <span className="text-emerald-400 font-bold text-sm">✓ OK</span>
                    ) : (
                      <span className="text-slate-400 text-sm">Pendiente</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}