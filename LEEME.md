# Control de Ropa Hospitalaria · CMGA (versión 3: lavandería propia)

Archivos:

- `index.html`: la app (GitHub Pages).
- `Code.gs`: el backend en Google Apps Script, que guarda todo en Google Sheets.

La versión 3 crea hojas nuevas en la misma hoja de cálculo: Ropa sucia, Lavados, Resurtidos, Conteos fisicos, Bajas, Altas, Esterilizaciones, Salidas de bultos y Configuracion. Las hojas de la versión anterior (proveedor externo) se conservan sin cambios como histórico.

## Perfiles y PIN

| PIN | Perfil | Qué puede hacer |
| --- | --- | --- |
| `ROPA1` | Acceso general (Gerencia, Supervisión, Coordinación de Quirófano/CEyE) | Todo, incluidas las altas al inventario, los bultos esterilizados y las salidas a quirófano, el stock autorizado, la configuración, y corregir o eliminar registros |
| `LAV1` | Lavandería | Recibir ropa sucia, registrar ropa lavada, resurtir servicios, conteos físicos y bajas |

Sin PIN la app es de solo lectura.

## Circuito

1. **Ropa sucia:** los camilleros la llevan directo a la lavandería; se cuenta al recibirla, por servicio de origen. La ropa quirúrgica se registra con origen "Quirófano (ropa quirúrgica)".
2. **Lavado:** la ropa que pasa la revisión se registra como lavada, con destino al almacén central (ropa de cama y de paciente) o a CEyE (ropa quirúrgica en crudo). La que no sirve se registra como baja.
3. **Almacén central (en la lavandería):** desde ahí la lavandería resurte los gabinetes. En el resurtido se cuenta lo que hay en el gabinete y la app calcula lo que falta para completar el stock autorizado.
4. **CEyE:** al registrar bultos esterilizados, la app descuenta de la ropa en crudo las piezas de cada bulto, según su composición. Las salidas a quirófano descuentan bultos del anaquel.
5. **Inventario:** altas (compra inicial y reposiciones) − bajas, contra el inventario calculado (RT-ENF-ROP-001: 1,433 piezas; RT-ENF-ROP-002: 1,110 piezas).

## Arranque

1. Con `ROPA1`, registre en **Inventario → + Alta** la compra inicial: una alta al almacén central (ropa de cama y de paciente) y otra a CEyE (ropa quirúrgica).
2. Lleve la ropa a los servicios con **+ Resurtir servicio** (incluida la de las camas): así la app sabe que esas piezas están en los servicios.
3. Haga un **conteo de anaquel** en Quirófano / CEyE con los bultos estériles que haya.
4. Revise en **Configuración** la composición de los bultos cuando la Coordinación de Quirófano la valide.

## Actualizar el backend

Pegue `Code.gs` en el proyecto de Apps Script y vaya a Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar. La URL no cambia.
