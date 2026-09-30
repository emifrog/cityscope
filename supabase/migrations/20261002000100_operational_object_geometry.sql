-- =============================================================================
-- Sprint 2 — operational objects placed on the map (MAP-02).
--
--   * an object is placed somewhere: on the map (geom, WGS 84) or on a plan (local_geom);
--   * its geometry is the one its type expects: a hydrant is a point, a fire lane a line,
--     an aerial ladder area a polygon (checked for both map and plan positions);
--   * key types of the global catalogue describe their properties (JSON Schema subset,
--     validated by the application: packages/domain/src/objects.ts). Types without
--     declared properties accept none.
-- =============================================================================

alter table app.operational_object
  add constraint operational_object_position_check check (geom is not null or local_geom is not null);

create function app.tg_operational_object_geometry_kind() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_expected text;
begin
  select geometry_kind into v_kind from app.object_type where id = new.object_type_id;
  v_expected := case v_kind when 'point' then 'ST_Point' when 'line' then 'ST_LineString' else 'ST_Polygon' end;
  if new.geom is not null and extensions.st_geometrytype(new.geom) <> v_expected then
    raise exception 'geometry % does not match object type kind %', extensions.st_geometrytype(new.geom), v_kind
      using errcode = '23514', constraint = 'operational_object_geometry_kind';
  end if;
  if new.local_geom is not null and extensions.st_geometrytype(new.local_geom) <> v_expected then
    raise exception 'plan geometry % does not match object type kind %', extensions.st_geometrytype(new.local_geom), v_kind
      using errcode = '23514', constraint = 'operational_object_geometry_kind';
  end if;
  return new;
end
$$;

create trigger operational_object_geometry_kind
before insert or update of geom, local_geom, object_type_id on app.operational_object
for each row execute function app.tg_operational_object_geometry_kind();

-- Typed properties of the most used exterior and risk objects (global catalogue).
update app.object_type set properties_schema = s.schema::jsonb
from (values
  ('PEI', '{"type": "object", "properties": {
      "numero": {"type": "string", "title": "Numéro", "maxLength": 40},
      "nature": {"type": "string", "title": "Nature", "oneOf": [
        {"const": "poteau", "title": "Poteau d’incendie"}, {"const": "bouche", "title": "Bouche d’incendie"},
        {"const": "point_aspiration", "title": "Point d’aspiration"}, {"const": "citerne", "title": "Citerne"}]},
      "debit_m3h": {"type": "number", "title": "Débit", "unit": "m³/h", "minimum": 0, "maximum": 2000},
      "pression_bar": {"type": "number", "title": "Pression statique", "unit": "bar", "minimum": 0, "maximum": 25},
      "date_controle": {"type": "string", "title": "Dernier contrôle", "format": "date"}}}'),
  ('RESERVE_INCENDIE', '{"type": "object", "properties": {
      "numero": {"type": "string", "title": "Numéro", "maxLength": 40},
      "capacite_m3": {"type": "number", "title": "Capacité", "unit": "m³", "minimum": 0, "maximum": 100000},
      "aire_aspiration": {"type": "boolean", "title": "Aire d’aspiration aménagée"}}}'),
  ('PORTAIL', '{"type": "object", "properties": {
      "ouverture": {"type": "string", "title": "Moyen d’ouverture", "maxLength": 200},
      "largeur_m": {"type": "number", "title": "Largeur", "unit": "m", "minimum": 0, "maximum": 50}}}'),
  ('BOITE_A_CLES', '{"type": "object", "properties": {
      "emplacement": {"type": "string", "title": "Emplacement", "maxLength": 200},
      "contenu": {"type": "string", "title": "Contenu", "maxLength": 200}}}'),
  ('VOIE_ENGINS', '{"type": "object", "properties": {
      "largeur_m": {"type": "number", "title": "Largeur utilisable", "unit": "m", "minimum": 0, "maximum": 50},
      "hauteur_libre_m": {"type": "number", "title": "Hauteur libre", "unit": "m", "minimum": 0, "maximum": 50},
      "force_portante_t": {"type": "number", "title": "Force portante", "unit": "t", "minimum": 0, "maximum": 200}}}'),
  ('AIRE_EPA', '{"type": "object", "properties": {
      "longueur_m": {"type": "number", "title": "Longueur", "unit": "m", "minimum": 0, "maximum": 100},
      "largeur_m": {"type": "number", "title": "Largeur", "unit": "m", "minimum": 0, "maximum": 50}}}'),
  ('COLONNE_SECHE', '{"type": "object", "properties": {
      "emplacement_raccord": {"type": "string", "title": "Raccord d’alimentation", "maxLength": 200},
      "diametre_mm": {"type": "integer", "title": "Diamètre", "unit": "mm", "minimum": 0, "maximum": 500}}}'),
  ('COLONNE_HUMIDE', '{"type": "object", "properties": {
      "emplacement_raccord": {"type": "string", "title": "Raccord d’alimentation", "maxLength": 200},
      "diametre_mm": {"type": "integer", "title": "Diamètre", "unit": "mm", "minimum": 0, "maximum": 500}}}'),
  ('STOCKAGE_O2', '{"type": "object", "properties": {
      "quantite": {"type": "number", "title": "Quantité", "minimum": 0},
      "unite": {"type": "string", "title": "Unité", "oneOf": [
        {"const": "bouteilles", "title": "bouteilles"}, {"const": "kg", "title": "kg"}, {"const": "m3", "title": "m³"},
        {"const": "litres", "title": "litres"}]}}}'),
  ('STOCKAGE_GPL', '{"type": "object", "properties": {
      "quantite": {"type": "number", "title": "Quantité", "minimum": 0},
      "unite": {"type": "string", "title": "Unité", "oneOf": [
        {"const": "bouteilles", "title": "bouteilles"}, {"const": "kg", "title": "kg"}, {"const": "m3", "title": "m³"},
        {"const": "litres", "title": "litres"}]}}}')
) as s (code, schema)
where app.object_type.code = s.code and app.object_type.tenant_id is null;

-- Routines are never executable by PUBLIC (explicit grants only).
revoke all on all routines in schema app from public;
