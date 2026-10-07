import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

/// Plus grand côté décodé d'un fond de plan (CAP-02) : assez pour zoomer sur
/// un détail, sans dépasser la texture d'un GPU de tablette.
const planMaxSide = 4096;

/// Plus grand côté décodé d'une photo affichée en plein écran.
const photoMaxSide = 2560;

/// Image installée décodée au plus à [maxSide] pixels sur son plus grand côté,
/// jamais agrandie (CAP-02) : un plan de 12 000 pixels ne réserve pas 500 Mo
/// de mémoire.
ImageProvider boundedImage(Uint8List bytes, {required int maxSide}) =>
    ResizeImage(
      MemoryImage(bytes),
      width: maxSide,
      height: maxSide,
      policy: ResizeImagePolicy.fit,
      allowUpscaling: false,
    );
