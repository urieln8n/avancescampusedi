-- Panel del taller de Avancés Campus
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT, email TEXT, lugar TEXT,
  vehiculo TEXT, modelo TEXT, notas TEXT, creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY, cliente_id TEXT REFERENCES clientes(id), trabajo TEXT, colores TEXT, estructura TEXT,
  montaje TEXT, carril TEXT, medidas TEXT DEFAULT '{}', fase TEXT NOT NULL DEFAULT 'nuevo', fecha_entrega TEXT,
  precio REAL DEFAULT 0, notas TEXT, origen TEXT, historial TEXT DEFAULT '[]', archivado INTEGER DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now')), actualizado TEXT
);
CREATE TABLE IF NOT EXISTS cobros (
  id TEXT PRIMARY KEY, pedido_id TEXT REFERENCES pedidos(id), fecha TEXT NOT NULL, importe REAL NOT NULL,
  metodo TEXT, concepto TEXT
);
CREATE TABLE IF NOT EXISTS materiales (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, categoria TEXT, unidad TEXT DEFAULT 'm', stock REAL DEFAULT 0,
  minimo REAL DEFAULT 0, coste REAL DEFAULT 0, proveedor TEXT, notas TEXT
);
CREATE TABLE IF NOT EXISTS movimientos (
  id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES materiales(id), fecha TEXT NOT NULL,
  tipo TEXT NOT NULL, cantidad REAL NOT NULL, coste_unit REAL DEFAULT 0, pedido_id TEXT, nota TEXT
);
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY, fecha TEXT NOT NULL, concepto TEXT NOT NULL, categoria TEXT, importe REAL NOT NULL,
  proveedor TEXT, pedido_id TEXT, movimiento_id TEXT
);
CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT);
CREATE INDEX IF NOT EXISTS ix_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_cobros_pedido ON cobros(pedido_id);
CREATE INDEX IF NOT EXISTS ix_mov_material ON movimientos(material_id);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha ON gastos(fecha);
