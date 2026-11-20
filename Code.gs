/**
 * Control de Ropa Hospitalaria — CMGA
 * Backend Google Apps Script + Google Sheets
 * PRO-ENF-ROP-001 · Gerencia de Enfermería
 *
 * Hojas que crea automáticamente:
 *   Envios, Recepciones, Ajustes, Conteos, Surtidos -> un registro por fila (datos completos en JSON + resumen legible)
 *   Config                                 -> catálogo de prendas, servicios, dotación y parámetros
 *
 * Implementación: Implementar → Nueva implementación → Aplicación web
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 * Para actualizar: Implementar → Administrar implementaciones → ✏️ → Nueva versión (conserva la URL)
 */

var COLECCIONES = ['envios', 'recepciones', 'ajustes', 'conteos', 'surtidos'];
var HOJAS = { envios: 'Envios', recepciones: 'Recepciones', ajustes: 'Ajustes', conteos: 'Conteos', surtidos: 'Surtidos' };
var ENCABEZADO = ['id', 'folio', 'fecha', 'tipo / servicio', 'total piezas', 'resumen', 'datos (JSON)', 'actualizado'];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getAll';
  try {
    if (action === 'getAll') return json_({ ok: true, data: leerTodo_() });
    if (action === 'ping') return json_({ ok: true, ts: new Date().toISOString() });
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
    if (body.action === 'upsert') {
      var rec = body.rec;
      if (body.foto && body.foto.base64) rec.fotoNota = guardarFoto_(body.foto, rec);
      else if (rec && rec.fotoNota && rec.fotoNota.pendiente) rec.fotoNota = fotoExistente_(body.col, rec.id) || rec.fotoNota;
      upsert_(body.col, rec);
      return json_({ ok: true, rec: { id: rec.id, fotoNota: rec.fotoNota || null } });
    }
    if (body.action === 'delete') { borrar_(body.col, body.id); return json_({ ok: true }); }
    if (body.action === 'saveConfig') { guardarConfig_(body.config); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Acción no reconocida: ' + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- lectura ---------- */

function leerTodo_() {
  var out = { config: leerConfig_() };
  COLECCIONES.forEach(function (col) {
    var sh = hoja_(HOJAS[col]);
    var last = sh.getLastRow();
    var lista = [];
    if (last > 1) {
      var vals = sh.getRange(2, 1, last - 1, ENCABEZADO.length).getValues();
      vals.forEach(function (r) {
        if (!r[0]) return;
        try { lista.push(JSON.parse(r[6])); } catch (x) { /* fila dañada: se omite */ }
      });
    }
    out[col] = lista;
  });
  return out;
}

function leerConfig_() {
  var sh = hoja_('Config');
  if (sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 2).getValue();
  if (!v) return null;
  try { return JSON.parse(v); } catch (x) { return null; }
}

/* ---------- escritura ---------- */

function upsert_(col, rec) {
  if (COLECCIONES.indexOf(col) < 0) throw new Error('Colección inválida: ' + col);
  if (!rec || !rec.id) throw new Error('Registro sin id');
  var sh = hoja_(HOJAS[col]);
  var fila = [
    rec.id,
    comoTexto_(rec.folio || ''),
    comoTexto_(rec.fecha || ''),
    rec.servicioNombre || rec.tipo || '',
    totalPiezas_(rec),
    rec.resumen || '',
    JSON.stringify(rec),
    comoTexto_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'))
  ];
  var n = buscarFila_(sh, rec.id);
  if (n) sh.getRange(n, 1, 1, fila.length).setValues([fila]);
  else sh.appendRow(fila);
}

function borrar_(col, id) {
  if (COLECCIONES.indexOf(col) < 0) throw new Error('Colección inválida: ' + col);
  var sh = hoja_(HOJAS[col]);
  var n = buscarFila_(sh, id);
  if (n) sh.deleteRow(n);
}

function guardarConfig_(config) {
  var sh = hoja_('Config');
  sh.getRange(2, 1, 1, 3).setValues([[
    'config',
    JSON.stringify(config),
    comoTexto_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'))
  ]]);
}

/* ---------- fotos de notas (Google Drive) ---------- */

function guardarFoto_(foto, rec) {
  var carpeta = carpetaFotos_();
  var nombre = (rec.folio || rec.id) + '_' + (foto.nombre || 'nota.jpg');
  var blob = Utilities.newBlob(Utilities.base64Decode(foto.base64), foto.mime || 'image/jpeg', nombre);
  var f = carpeta.createFile(blob);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* política del dominio: queda privada */ }
  return { id: f.getId(), url: f.getUrl(), nombre: nombre };
}

function fotoExistente_(col, id) {
  var sh = hoja_(HOJAS[col]);
  var n = buscarFila_(sh, id);
  if (!n) return null;
  try { var r = JSON.parse(sh.getRange(n, 7).getValue()); return r.fotoNota && r.fotoNota.id ? r.fotoNota : null; } catch (e) { return null; }
}

function carpetaFotos_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_FOTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var c = DriveApp.createFolder('Control de Ropa CMGA - Fotos de notas');
  props.setProperty('CARPETA_FOTOS', c.getId());
  return c;
}

/** Ejecutar una vez desde el editor para autorizar el acceso a Drive y crear la carpeta de fotos. */
function autorizarDrive() {
  Logger.log('Carpeta de fotos: ' + carpetaFotos_().getUrl());
}

/* ---------- utilidades ---------- */

function hoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    if (nombre === 'Config') sh.getRange(1, 1, 1, 3).setValues([['clave', 'valor (JSON)', 'actualizado']]);
    else sh.getRange(1, 1, 1, ENCABEZADO.length).setValues([ENCABEZADO]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1B3A6B').setFontColor('#FFFFFF');
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

function totalPiezas_(rec) {
  var t = 0, it = rec.items || {};
  Object.keys(it).forEach(function (k) {
    var v = it[k];
    if (typeof v === 'number') t += v;
    else if (v && typeof v === 'object') Object.keys(v).forEach(function (s) { t += Number(v[s]) || 0; });
  });
  return t;
}

/** Antepone apóstrofo para que Sheets no convierta fechas/folios. */
function comoTexto_(v) {
  return v === '' || v === null || v === undefined ? '' : "'" + String(v);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecutar una vez desde el editor para crear todas las hojas. */
function inicializarHojas() {
  ['Envios', 'Recepciones', 'Ajustes', 'Conteos', 'Surtidos', 'Config'].forEach(hoja_);
}
