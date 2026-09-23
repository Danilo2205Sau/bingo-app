CREATE OR REPLACE FUNCTION actualizar_contador_modalidad_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE modalidades
  SET boletas_vendidas = GREATEST(boletas_vendidas - 1, 0)
  WHERE id = (SELECT modalidad_id FROM cartones WHERE id = OLD.carton_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_descontar_ventas_modalidad ON venta_cartones;
CREATE TRIGGER trigger_descontar_ventas_modalidad
AFTER DELETE ON venta_cartones
FOR EACH ROW EXECUTE FUNCTION actualizar_contador_modalidad_delete();