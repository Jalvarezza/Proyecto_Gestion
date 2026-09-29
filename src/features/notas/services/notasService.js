// src/features/notas/services/notasService.js
import { supabase } from '../../../supabaseClient';

export const productosApi = {
  // Busca los productos por SKU en Supabase; si no existen, los registra automáticamente
  async buscarOcrearProductos(productos) {
    if (!productos || productos.length === 0) return [];

    const skus = productos.map((p) => p.codigoProducto);

    // 1. Consultar productos existentes
    const { data: existentes, error: errorSearch } = await supabase
      .from('productos')
      .select('id_producto, sku, nombre, ubicacion')
      .in('sku', skus);

    if (errorSearch) {
      console.error('Error al buscar productos:', errorSearch);
      throw errorSearch;
    }

    const mapaExistentes = new Map(
      (existentes || []).map((p) => [p.sku.toUpperCase(), p])
    );

    // 2. Identificar SKUs faltantes para crearlos
    const nuevosParaInsertar = [];
    for (const prod of productos) {
      const skuUpper = prod.codigoProducto.toUpperCase();
      if (!mapaExistentes.has(skuUpper)) {
        nuevosParaInsertar.push({
          sku: prod.codigoProducto,
          nombre: prod.descripcion || `Producto ${prod.codigoProducto}`,
          ubicacion: 'SIN_UBICACION',
        });
      }
    }

    // 3. Insertar automáticamente los SKUs nuevos
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

    // 4. Devuelve los ítems adjuntando su id_producto
    return productos.map((prod) => {
      const prodDB = mapaExistentes.get(prod.codigoProducto.toUpperCase());
      return {
        ...prod,
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
    // Garantizar que los productos existan y tengan id_producto
    const itemsConId = await productosApi.buscarOcrearProductos(items);

    // Insertar cabecera de Nota de Venta
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

    // Insertar detalle de la Nota de Venta
    if (itemsConId && itemsConId.length > 0) {
      const detalles = itemsConId.map((item) => ({
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