import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:image_picker/image_picker.dart';

/// Photo refusée avant tout enregistrement (type ou taille).
final class PhotoRefused implements Exception {
  const PhotoRefused(this.message);

  final String message;

  @override
  String toString() => message;
}

enum PhotoSource { camera, gallery }

/// Prise d'une photo de signalement : compressée, vérifiée, puis rangée dans
/// la base chiffrée ; null si l'agent annule.
// ignore: one_member_abstracts
abstract interface class PhotoPicker {
  Future<NewReportPhoto?> pick(PhotoSource source, {required int position});
}

/// Appareil photo du système ou sélecteur de photos (image_picker). La copie
/// temporaire laissée par le système est supprimée aussitôt lue : la photo
/// n'est conservée que dans la base chiffrée.
final class SystemPhotoPicker implements PhotoPicker {
  SystemPhotoPicker([ImagePicker? picker]) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<NewReportPhoto?> pick(
    PhotoSource source, {
    required int position,
  }) async {
    final file = await _picker.pickImage(
      source: source == PhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      // Compressée à la prise : envoyée plus vite au retour du réseau.
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 80,
    );
    if (file == null) return null;
    try {
      return photoFromBytes(await file.readAsBytes(), position: position);
    } finally {
      try {
        await File(file.path).delete();
      } on FileSystemException {
        // Copie déjà retirée par le système.
      }
    }
  }
}

/// Vérifie et décrit une photo comme le serveur la contrôlera.
NewReportPhoto photoFromBytes(Uint8List bytes, {required int position}) {
  final mimeType = detectImageMime(bytes);
  if (mimeType == null) {
    throw const PhotoRefused('Une photo est une image PNG, JPEG ou WebP.');
  }
  if (bytes.length > maxReportPhotoBytes) {
    throw const PhotoRefused('Photo trop volumineuse (15 Mo au plus).');
  }
  return NewReportPhoto(
    sha256: sha256.convert(bytes).toString(),
    mimeType: mimeType,
    filename: 'photo-${position + 1}.${extensionOfImage(mimeType)}',
    content: bytes,
  );
}
