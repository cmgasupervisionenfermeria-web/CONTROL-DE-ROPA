/**
 * Control de Ropa Hospitalaria — CMGA (versión 3: lavandería propia y ropa quirúrgica)
 * Backend Google Apps Script + Google Sheets · Gerencia de Enfermería
 *
 * Hojas que crea automáticamente (un registro por fila: resumen legible + datos completos en JSON):
 *   Ropa sucia, Lavados, Resurtidos, Conteos fisicos, Bajas, Altas, Esterilizaciones, Salidas de bultos
 *   Configuracion -> prendas, servicios, stock autorizado, bultos y parámetros
 * Las hojas de la versión anterior (Envios, Recepciones, Ajustes, Conteos, Surtidos, Config) no se tocan.
 *
 * Para actualizar: Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar (conserva la URL)
 */

var HOJAS = {
  sucia: 'Ropa sucia', lavados: 'Lavados', surtidos: 'Resurtidos', conteos: 'Conteos fisicos',
  bajas: 'Bajas', altas: 'Altas', esteril: 'Esterilizaciones', usos: 'Salidas de bultos'
};
var COLECCIONES = Object.keys(HOJAS);
var ENCABEZADO = ['id', 'folio', 'fecha', 'hora', 'ubicación / servicio', 'total', 'resumen', 'datos (JSON)', 'actualizado'];
var HOJA_CONFIG = 'Configuracion';

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getAll';
  try {
    if (action === 'getAll') return json_({ ok: true, data: leerTodo_() });
    if (action === 'ping') return json_({ ok: true, version: 3, ts: new Date().toISOString() });
    return json_({ ok: false, error: 'Acción no reconocida: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'upsert') { upsert_(body.col, body.rec); return json_({ ok: true, id: body.rec.id }); }
    if (body.action === 'delete') { borrar_(body.col, body.id); return json_({ ok: true }); }
    if (body.action === 'saveConfig') { guardarConfig_(body.config); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Acción no reconocida: ' + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function leerTodo_() {
  var out = { config: leerConfig_() };
  COLECCIONES.forEach(function (col) {
    var sh = hoja_(HOJAS[col]);
    var last = sh.getLastRow(), lista = [];
    if (last > 1) {
      sh.getRange(2, 1, last - 1, ENCABEZADO.length).getValues().forEach(function (r) {
        if (!r[0]) return;
        try { lista.push(JSON.parse(r[7])); } catch (x) { /* fila dañada: se omite */ }
      });
    }
    out[col] = lista;
  });
  return out;
}

function leerConfig_() {
  var sh = hoja_(HOJA_CONFIG);
  if (sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 2).getValue();
  if (!v) return null;
  try { return JSON.parse(v); } catch (x) { return null; }
}

function upsert_(col, rec) {
  if (!HOJAS[col]) throw new Error('Colección inválida: ' + col);
  if (!rec || !rec.id) throw new Error('Registro sin id');
  var sh = hoja_(HOJAS[col]);
  var fila = [
    rec.id, texto_(rec.folio), texto_(rec.fecha), texto_(rec.hora),
    rec.origen || rec.destino || rec.servicio || rec.ubic || rec.ciclo || rec.sala || '',
    total_(rec.items), resumen_(rec), JSON.stringify(rec),
    texto_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'))
  ];
  var n = buscarFila_(sh, rec.id);
  if (n) sh.getRange(n, 1, 1, fila.length).setValues([fila]);
  else sh.appendRow(fila);
}

function borrar_(col, id) {
  if (!HOJAS[col]) throw new Error('Colección inválida: ' + col);
  var sh = hoja_(HOJAS[col]);
  var n = buscarFila_(sh, id);
  if (n) sh.deleteRow(n);
}

function guardarConfig_(config) {
  hoja_(HOJA_CONFIG).getRange(2, 1, 1, 3).setValues([[
    'config', JSON.stringify(config),
    texto_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'))
  ]]);
}

function hoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    var enc = nombre === HOJA_CONFIG ? ['clave', 'valor (JSON)', 'actualizado'] : ENCABEZADO;
    sh.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#1B3A6B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function buscarFila_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function total_(items) {
  var t = 0;
  Object.keys(items || {}).forEach(function (k) {
    var v = items[k];
    t += (v && typeof v === 'object') ? (Number(v.e) || 0) : (Number(v) || 0);
  });
  return t;
}

function resumen_(rec) {
  var it = rec.items || {};
  return Object.keys(it).map(function (k) {
    var v = it[k];
    return k + ': ' + ((v && typeof v === 'object') ? ('había ' + (v.c || 0) + ', entregado ' + (v.e || 0)) : v);
  }).join(' · ');
}

/** Antepone apóstrofo para que Sheets no convierta fechas, horas ni folios. */
function texto_(v) { return v === '' || v === null || v === undefined ? '' : "'" + String(v); }

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** Ejecutar una vez desde el editor para crear todas las hojas de la versión 3. */
function inicializarHojas() {
  COLECCIONES.forEach(function (c) { hoja_(HOJAS[c]); });
  hoja_(HOJA_CONFIG);
}
