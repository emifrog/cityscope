import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

/// Polices des libellés de la carte (glyphes PBF de Noto Sans, licence OFL
/// 1.1, `assets/map/glyphs/`) : embarquées dans l'application, copiées une
/// fois dans son dossier pour que le moteur de carte les lise par `file://`.
/// Une carte qui appelle encore un serveur n'est pas hors ligne (ADR-024).
const mapFonts = ['NotoSans-Regular', 'NotoSans-Medium', 'NotoSans-Italic'];
const _glyphRanges = ['0-255', '256-511', '8192-8447'];

/// Version des glyphes copiés : la changer recopie les fichiers.
const _glyphsVersion = 'v1';

/// Copie les glyphes embarqués dans [root] (si ce n'est pas déjà fait) et
/// renvoie leur dossier.
Future<Directory> installMapGlyphs(
  Directory root, {
  AssetBundle? bundle,
}) async {
  final assets = bundle ?? rootBundle;
  final directory = Directory(p.join(root.path, 'map-glyphs', _glyphsVersion));
  final done = File(p.join(directory.path, '.complete'));
  if (await done.exists()) return directory;
  for (final font in mapFonts) {
    final folder = Directory(p.join(directory.path, font));
    await folder.create(recursive: true);
    for (final range in _glyphRanges) {
      final data = await assets.load('assets/map/glyphs/$font/$range.pbf');
      await File(p.join(folder.path, '$range.pbf'))
          .writeAsBytes(data.buffer.asUint8List(), flush: true);
    }
  }
  await done.writeAsString('ok', flush: true);
  return directory;
}

/// Chemin `file://` d'un dossier, quel que soit le système (barres obliques).
String _fileUrlPath(String path) {
  final normalized = path.replaceAll(r'\', '/');
  return normalized.startsWith('/') ? normalized : '/$normalized';
}

/// Style d'un fond installé : ses fichiers et les glyphes de l'application
/// remplacent les marqueurs posés par le serveur.
Future<String> resolveBasemapStyle({
  required Directory basemap,
  required Directory glyphs,
}) async {
  final style = await File(p.join(basemap.path, 'style.json')).readAsString();
  return style
      .replaceAll('{{BASEMAP_DIR}}', _fileUrlPath(basemap.path))
      .replaceAll('{{GLYPHS_DIR}}', _fileUrlPath(glyphs.path));
}

/// Style sans fond : un aplat, les sites restent placés et nommés.
String blankMapStyle({required Directory glyphs}) => jsonEncode({
  'version': 8,
  'name': 'FireScape — sans fond',
  'glyphs': 'file://${_fileUrlPath(glyphs.path)}/{fontstack}/{range}.pbf',
  'sources': <String, Object?>{},
  'layers': [
    {
      'id': 'arriere-plan',
      'type': 'background',
      'paint': {'background-color': '#eceff1'},
    },
  ],
});
