// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reports_dao.dart';

// ignore_for_file: type=lint
mixin _$ReportsDaoMixin on DatabaseAccessor<AppDatabase> {
  $FieldReportsTable get fieldReports => attachedDatabase.fieldReports;
  $FieldReportPhotosTable get fieldReportPhotos =>
      attachedDatabase.fieldReportPhotos;
  ReportsDaoManager get managers => ReportsDaoManager(this);
}

class ReportsDaoManager {
  final _$ReportsDaoMixin _db;
  ReportsDaoManager(this._db);
  $$FieldReportsTableTableManager get fieldReports =>
      $$FieldReportsTableTableManager(_db.attachedDatabase, _db.fieldReports);
  $$FieldReportPhotosTableTableManager get fieldReportPhotos =>
      $$FieldReportPhotosTableTableManager(
        _db.attachedDatabase,
        _db.fieldReportPhotos,
      );
}
