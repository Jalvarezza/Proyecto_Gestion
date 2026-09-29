// src/features/notas/services/notasService.js
import { supabase } from '../../../supabaseClient';

export const notasApi = {
  async fetchNotas() {
    const { data, error } = await supabase
      .from('notas_venta')
      .select('*')
      .order('id_nv', { ascending: false });

    if (error) {
      console.error('Error de consulta en Supabase:', error.message, error.details);
      throw error;
    }

    if (!data) return [];

    return data.map((n) => ({
      notaId: String(n.id_nv),
      numeroNota: n.numero_nv || 'NV-Sin número',
      nombreCliente: n.cliente_nombre || 'Cliente sin nombre',
      rutCliente: n.rut_cliente || '',
      numeroOc: n.numero_oc || '',
      estado:
        n.estado === 'PENDIENTE_PICKING'
          ? 'pendiente'
          : n.estado === 'EN_VALIDACION'
          ? 'preparacion'
          : 'completa',
      creadoEn: n.fecha_carga || new Date().toISOString(),
      totalProductos: 0,
      productosCompletos: 0,
    }));
  },

  async crearNotaConDetalle(notaHeader, items) {
    const { data: notaInsertada, error: errorNota } = await supabase
      .from('notas_venta')
      .insert([
        {
          numero_nv: notaHeader.numeroNota,
          cliente_nombre: notaHeader.nombreCliente,
          rut_cliente: notaHeader.rutCliente,
          numero_oc: notaHeader.numeroOc,
          estado: 'PENDIENTE_PICKING',
          fecha_carga: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (errorNota) throw errorNota;

    if (items && items.length > 0) {
      const detalles = items.map((item) => ({
        id_nv: notaInsertada.id_nv,
        id_producto: item.id_producto,
        cant_solicitada: item.cantidad,
        cant_picked: 0,
        cant_validada: 0,
      }));

      const { error: errorDetalle } = await supabase
        .from('notas_venta_detalle')
        .insert(detalles);

      if (errorDetalle) throw errorDetalle;
    }

    return notaInsertada;
  },
};