"""Paso 1 de la migracion: lee el export del Google Sheet (migracion/sheet.xlsx) y
lo normaliza a migracion/datos.json (todo texto/numeros simples, fechas en
'YYYY-MM-DD HH:MM:SS' hora de Asuncion). No toca la base.

    python scripts/migracion/exportar.py
"""
import datetime
import json
import re

import openpyxl

ENTRADA = 'migracion/sheet.xlsx'
SALIDA = 'migracion/datos.json'


def filas(wb, nombre):
    it = wb[nombre].iter_rows(values_only=True)
    cab = list(next(it))
    salida = []
    for r in it:
        d = {cab[i]: v for i, v in enumerate(r) if i < len(cab) and cab[i]}
        if any(v not in (None, '') for v in d.values()):
            salida.append(d)
    return salida


def txt(v):
    """Celda -> texto. Enteros guardados como numero pierden el '.0'; fechas -> dd/mm/aaaa."""
    if v is None or v == '':
        return None
    if isinstance(v, datetime.datetime):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip() or None


def fecha(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d %H:%M:%S')
    return None


def numero(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r'-?\d+(?:[.,]\d+)?', str(v))
    return float(m.group(0).replace(',', '.')) if m else None


def porcentaje_o_texto(v):
    # OBS con formato 0%: el Sheet guarda 0.1 y muestra "10%"
    if isinstance(v, float) and not float(v).is_integer():
        return f'{round(v * 100):g}%'
    return txt(v)


wb = openpyxl.load_workbook(ENTRADA, data_only=True)

clientes = [
    {
        'codigo': txt(c['Codigo']),
        'razon_social': txt(c['RazonSocial']),
        'nombre_fantasia': txt(c['NombreFantasia']),
        'ciudad': txt(c['Ciudad']),
        'zona': txt(c['Zona']),
        'lat': numero(c['Lat']),
        'lng': numero(c['Lng']),
    }
    for c in filas(wb, 'Clientes')
]

ROLES = {'Admin': 'admin', 'AdminL': 'supervisor', 'User': 'vendedor'}
usuarios = []
for u in filas(wb, 'Usuarios'):
    creado = u['FechaCreacion']
    if isinstance(creado, datetime.datetime):
        creado = creado.strftime('%Y-%m-%d %H:%M:%S')
    else:
        # 'Tue May 19 2026 16:30:00 GMT-0400 (...)' -> hora local escrita en el texto
        m = re.search(r'([A-Z][a-z]{2}) (\d{1,2}) (\d{4}) (\d{2}:\d{2}:\d{2})', str(creado or ''))
        creado = None
        if m:
            creado = datetime.datetime.strptime(' '.join(m.groups()), '%b %d %Y %H:%M:%S').strftime('%Y-%m-%d %H:%M:%S')
    usuarios.append({
        'legacy_id': u['ID'],
        'username': str(u['Username']).strip().lower(),
        'rol_original': u['Rol'],
        'rol': ROLES.get(u['Rol'], 'vendedor'),
        'activo': bool(u['Activo']),
        'creado': creado,
        'foto_url': u['FotoUrl'],
    })

pedidos = []
for p in filas(wb, 'Pedidos'):
    orden = p['N° Orden']
    pedidos.append({
        'legacy_id': p['ID'],
        'creado': fecha(p['Fecha Carga']),
        'cliente_nombre': txt(p['Cliente']),
        'cliente_codigo': txt(p['Código Cliente']),
        'ruc': txt(p['RUC']),
        'nro_orden': txt(orden),
        'nro_pedido': txt(p['N° Pedido']),
        'entrega': txt(p['Entrega']),
        'direccion': txt(p['Dirección']),
        'ciudad': txt(p['Ciudad']),
        'zona': txt(p['Zona']),
        'forma_pago': txt(p['Forma Pago']),
        'tipo': txt(p['Tipo']),
        'marca': txt(p['Marca']),
        'total_pares': None if numero(p['Total Pares']) is None else int(numero(p['Total Pares'])),
        'total_precio': None if numero(p['Total Precio']) is None else int(numero(p['Total Precio'])),
        'imagen_drive': txt(p['Imagen']),
        'usuario': txt(p['Usuario']),
        'obs': porcentaje_o_texto(p['OBS']),
    })

informes = []
for i in filas(wb, 'Informes'):
    informes.append({
        'legacy_id': i['ID'],
        'creado': fecha(i['Fecha']),
        'cliente_nombre': txt(i['Cliente']),
        'cliente_codigo': txt(i['Código Cliente']),
        'ciudad': txt(i['Ciudad']),
        'zona': txt(i['Zona']),
        'comentario': txt(i['Comentario']),
        'lat': numero(i['Latitud']),
        'lng': numero(i['Longitud']),
        'usuario': txt(i['Usuario']),
    })

with open(SALIDA, 'w', encoding='utf-8') as f:
    json.dump({'clientes': clientes, 'usuarios': usuarios, 'pedidos': pedidos, 'informes': informes}, f, ensure_ascii=False, indent=1)
print({k: len(v) for k, v in {'clientes': clientes, 'usuarios': usuarios, 'pedidos': pedidos, 'informes': informes}.items()})
