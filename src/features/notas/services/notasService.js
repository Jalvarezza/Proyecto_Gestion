// src/features/notas/services/notasService.js
import { supabase } from '../../../supabaseClient';

export const productosApi = {
  // ── Buscar producto por SKU, Código de Barras o Código de Barras Alternativo ──
  async getBySku(codigo) {
    if (!codigo) return null;
    const codLimpio = String(codigo).trim();

    const { data, error } = await supabase
      .from('productos')
      .select('id_producto, sku, codigo_barras, codigo_barra_alternativo, nombre')
      .or(`sku.ilike.${codLimpio},codigo_barras.ilike.${codLimpio},codigo_barra_alternativo.ilike.${codLimpio}`)
      .maybeSingle();

    if (error) {
      console.error('Error al buscar producto:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id_producto,
      id_producto: data.id_producto,
      sku: data.sku,
      nombre: data.nombre,
    };
  },

  // ── Método existente: Buscar o crear en lote ──
  async buscarOcrearProductos(productos) {
    if (!productos || productos.length === 0) return [];

    const productosValidos = productos
      .map((p) => ({
        ...p,
        skuFinal: (p.codigoProducto || p.sku || p.codigo || '').toString().trim(),
      }))
      .filter((p) => p.skuFinal.length > 0);

    if (productosValidos.length === 0) return [];

    const skus = productosValidos.map((p) => p.skuFinal);

    const { data: existentes, error: errorSearch } = await supabase
      .from('productos')
      .select('id_producto, sku, nombre')
      .in('sku', skus);

    if (errorSearch) {
      console.error('Error al consultar productos:', errorSearch);
      throw errorSearch;
    }

    const mapaExistentes = new Map(
      (existentes || []).map((p) => [(p.sku || '').toUpperCase(), p])
    );

    const nuevosParaInsertar = [];
    for (const prod of productosValidos) {
      const skuUpper = prod.skuFinal.toUpperCase();
      if (!mapaExistentes.has(skuUpper)) {
        nuevosParaInsertar.push({
          sku: prod.skuFinal,
          nombre: prod.descripcion || prod.nombre || `Producto ${prod.skuFinal}`,
        });
        mapaExistentes.set(skuUpper, { sku: prod.skuFinal, id_producto: null });
      }
    }

    if (nuevosParaInsertar.length > 0) {
      const { data: insertados, error: errorInsert } = await supabase
        .from('productos')
        .insert(nuevosParaInsertar)
        .select();

      if (errorInsert) {
        console.error('Error al registrar productos nuevos:', errorInsert);
        throw errorInsert;
      }

      insertados?.forEach((p) => mapaExistentes.set(p.sku.toUpperCase(), p));
    }

    return productosValidos.map((prod) => {
      const prodDB = mapaExistentes.get(prod.skuFinal.toUpperCase());
      return {
        ...prod,
        codigoProducto: prod.skuFinal,
        id_producto: prodDB ? prodDB.id_producto : null,
      };
    });
  },
};

export const notasApi = {
async fetchNotas() {
    const { data, error } = await supabase
      .from('notas_venta')
      .select('*')
      .order('id_nv', { ascending: false });

    if (error) {
      console.error('Error de consulta en Supabase:', error.message);
      throw error;
    }

    if (!data) return [];

    return data.map((n) => ({
      notaId: String(n.id_nv),
      numeroNota: n.numero_nv || 'NV-Sin número',
      nombreCliente: n.cliente_nombre || 'Cliente sin nombre',
      rutCliente: n.rut_cliente || '',
      numeroOc: n.oc_cliente || n.numero_oc || '', // <-- Corregido: usando n.oc_cliente
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

  // ── Guardar Nota de Venta y sus detalles desde ImportarNotaFlow ──
  async crearNota(payload) {
    // 1. Insertar la cabecera en notas_venta
    const { data: notaInsertada, error: errorNota } = await supabase
      .from('notas_venta')
      .insert([
        {
          numero_nv: payload.numeroNota,
          cliente_nombre: payload.nombreCliente,
          rut_cliente: payload.rutCliente,
          oc_cliente: payload.oc_cliente || null,
          comentario_despacho: payload.comentarioDespacho || null,
          estado: 'PENDIENTE_PICKING',
          fecha_carga: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (errorNota) {
      console.error('Error al crear cabecera de la nota:', errorNota);
      throw new Error(errorNota.message || 'Error al guardar la nota de venta');
    }

    // 2. Insertar las filas de detalle en notas_venta_detalle
    if (payload.productos && payload.productos.length > 0) {
      const detalles = payload.productos.map((prod) => ({
        id_nv: notaInsertada.id_nv,
        id_producto: prod.productoId,
        cant_solicitada: prod.cantidadSolicitada,
        cant_picked: 0,
        cant_validada: 0,
      }));

      const { error: errorDetalle } = await supabase
        .from('notas_venta_detalle')
        .insert(detalles);

      if (errorDetalle) {
        console.error('Error al guardar el detalle de la nota:', errorDetalle);
        throw new Error(errorDetalle.message || 'Error al guardar los productos de la nota');
      }
    }

    return { notaId: notaInsertada.id_nv, id_nv: notaInsertada.id_nv };
  },

  async crearNotaConDetalle(notaHeader, items) {
    const itemsConId = await productosApi.buscarOcrearProductos(items);

    const { data: notaInsertada, error: errorNota } = await supabase
      .from('notas_venta')
      .insert([
        {
          numero_nv: notaHeader.numeroNota,
          cliente_nombre: notaHeader.nombreCliente,
          rut_cliente: notaHeader.rutCliente,
          oc_cliente: notaHeader.oc_cliente,
          estado: 'PENDIENTE_PICKING',
          fecha_carga: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (errorNota) throw errorNota;

    if (itemsConId && itemsConId.length > 0) {
      const detalles = itemsConId.map((item) => ({
        id_nv: notaInsertada.id_nv,
        id_producto: item.id_producto,
        cant_solicitada: item.cantidad || item.cant || 1,
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