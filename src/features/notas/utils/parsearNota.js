import * as pdfjsLib from 'pdfjs-dist';

// Configuración del Worker para Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const REGEX_NV = /N[°º]\s*de\s*NV[:\s]*(\d+)/i;
const REGEX_CLIENTE = /Nombre[:\s]+(.+?)(?:R\.U\.T|$)/im;
const REGEX_RUT = /R\.U\.T\.?[:\s]*([\d.\-kK]+)/i;
const REGEX_OC = /N[°º]\s*OC[:\s]*(\d+)/i;

function agruparFilas(items, tolerance = 4) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const filas = [];
  for (const item of sorted) {
    const fila = filas.find((f) => Math.abs(f[0].y - item.y) <= tolerance);
    if (fila) {
      fila.push(item);
      fila.sort((a, b) => a.x - b.x);
    } else {
      filas.push([item]);
    }
  }
  return filas;
}

export async function parsearNota(file) {
  const errores = [];
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  let todosItems = [];
  let textoPlano = '';

  try {
    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        todosItems.push({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] });
      }
    }
    const ordenados = [...todosItems].sort((a, b) => b.y - a.y || a.x - b.x);
    textoPlano = ordenados.map((it) => it.str).join(' ');
  } catch {
    errores.push('No se pudo leer el PDF. Verifica que el archivo no esté dañado.');
    return { numeroNota: null, nombreCliente: null, rutCliente: null, numeroOc: null, productos: [], errores };
  }

  // Extracción de metadatos
  const matchNv = textoPlano.match(REGEX_NV);
  const numeroNota = matchNv ? matchNv[1] : null;
  if (!numeroNota) errores.push('No se encontró el número de NV. Ingrésalo manualmente.');

  const matchCliente = textoPlano.match(REGEX_CLIENTE);
  const nombreCliente = matchCliente ? matchCliente[1].trim() : null;
  if (!nombreCliente) errores.push('No se encontró el nombre del cliente. Ingrésalo manualmente.');

  const matchRut = textoPlano.match(REGEX_RUT);
  const rutCliente = matchRut ? matchRut[1].trim() : null;
  if (!rutCliente) errores.push('No se encontró el RUT del cliente. Ingrésalo manualmente.');

  const matchOc = textoPlano.match(REGEX_OC);
  const numeroOc = matchOc ? matchOc[1] : null;

  // Extracción Columnar de Productos
  const HEADER_CANT = /^Cantidad$/i;
  const HEADER_COD = /^C[oó]d(i[gó]o)?$/i;
  const HEADER_DESC = /^Descripci[oó]n$/i;
  const HEADER_PRECIO = /^(Precio|P\.?\s*Unit(ario)?|Valor|Total|Importe|Neto)$/i;
  const FIN_TABLA = /^(Sub\s*Total|Condici[oó]n|En\s+efectivo|Descuento\s+1)$/i;

  const filas = agruparFilas(todosItems);
  let headerFila = null;
  let headerIdx = -1;

  for (let i = 0; i < filas.length; i++) {
    const strs = filas[i].map((it) => it.str);
    if (strs.some((s) => HEADER_CANT.test(s)) && strs.some((s) => HEADER_COD.test(s))) {
      headerFila = filas[i];
      headerIdx = i;
      break;
    }
  }

  if (!headerFila || headerIdx === -1) {
    const productos = extraerProductosTextoPlano(textoPlano);
    return { numeroNota, nombreCliente, rutCliente, numeroOc, productos, errores, _textoDebug: textoPlano };
  }

  const xCant = headerFila.find((it) => HEADER_CANT.test(it.str))?.x ?? 0;
  const xCod = headerFila.find((it) => HEADER_COD.test(it.str))?.x ?? 0;
  const xDesc = headerFila.find((it) => HEADER_DESC.test(it.str))?.x ?? 0;
  const xPrecio = headerFila
    .filter((it) => HEADER_PRECIO.test(it.str) && it.x > xDesc)
    .sort((a, b) => a.x - b.x)[0]?.x ?? Infinity;

  const MARGEN = 12;
  const productos = [];
  const vistos = new Set();

  for (let i = headerIdx + 1; i < filas.length; i++) {
    const fila = filas[i];
    const strs = fila.map((it) => it.str);

    if (strs.some((s) => FIN_TABLA.test(s))) break;

    const cantItems = fila.filter((it) => it.x < xCod - MARGEN && it.x >= xCant - MARGEN);
    const codItems = fila.filter((it) => it.x >= xCod - MARGEN && it.x < xDesc - MARGEN);

    if (cantItems.length === 0 || codItems.length === 0) continue;

    let cantStr = cantItems.map((it) => it.str).join('').replace(/\.$/, '').trim();
    if (/,\d{2}$/.test(cantStr)) continue;
    cantStr = cantStr.replace(/,/g, '');
    const cantidad = parseInt(cantStr, 10);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

    const ES_PRECIO = /^\$?\d{1,3}(\.\d{3})+([,]\d+)?$\vert{}^\$?\d+[,]\d{2}$/;
    const codigoProducto = codItems
      .filter((it) => !ES_PRECIO.test(it.str.trim()))
      .map((it) => it.str.trim()).join('').trim();
    if (!codigoProducto) continue;

    const descItems = fila.filter((it) => it.x >= xDesc - MARGEN && it.x < xPrecio - MARGEN);
    const descripcion = descItems.map((it) => it.str).join(' ').trim() || codigoProducto;

    const clave = `${codigoProducto}-${cantidad}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    productos.push({ cantidad, codigoProducto, descripcion });
  }

  if (productos.length === 0) {
    const fallback = extraerProductosTextoPlano(textoPlano);
    if (fallback.length > 0) return { numeroNota, nombreCliente, rutCliente, numeroOc, productos: fallback, errores, _textoDebug: textoPlano };
    errores.push('No se encontraron productos en la tabla. Revisa el archivo PDF.');
  }

  return { numeroNota, nombreCliente, rutCliente, numeroOc, productos, errores, _textoDebug: textoPlano };
}

function extraerProductosTextoPlano(texto) {
  const REGEX_PROD = /(\d+)\.?\s+([A-Za-z0-9][A-Za-z0-9\/\-\.]{2,})\s+(.+?)\s+[\d,.]+\s+[\d,.]+(?=\s|$)/g;
  const INICIO = /Cantidad\s+C[oó]d/i;
  const FIN = /Sub\s*Total|Condici[oó]n de Pago/i;
  const inicio = INICIO.exec(texto);
  const fin = FIN.exec(texto);
  const cuerpo = inicio
    ? texto.slice(inicio.index + inicio[0].length, fin ? fin.index : undefined)
    : texto;

  const productos = [];
  const vistos = new Set();
  let match;
  while ((match = REGEX_PROD.exec(cuerpo)) !== null) {
    const cantidad = parseInt(match[1], 10);
    const codigoProducto = match[2].trim();
    const descripcion = match[3].trim();
    const clave = `${codigoProducto}-${cantidad}`;
    if (vistos.has(clave) || cantidad <= 0) continue;
    vistos.add(clave);
    productos.push({ cantidad, codigoProducto, descripcion });
  }
  return productos;
}