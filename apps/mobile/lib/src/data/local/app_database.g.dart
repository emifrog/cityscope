// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $LocalMetaTable extends LocalMeta
    with TableInfo<$LocalMetaTable, LocalMetaEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocalMetaTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'local_meta';
  @override
  VerificationContext validateIntegrity(
    Insertable<LocalMetaEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  LocalMetaEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalMetaEntry(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $LocalMetaTable createAlias(String alias) {
    return $LocalMetaTable(attachedDatabase, alias);
  }
}

class LocalMetaEntry extends DataClass implements Insertable<LocalMetaEntry> {
  final String key;
  final String value;
  const LocalMetaEntry({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  LocalMetaCompanion toCompanion(bool nullToAbsent) {
    return LocalMetaCompanion(key: Value(key), value: Value(value));
  }

  factory LocalMetaEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalMetaEntry(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  LocalMetaEntry copyWith({String? key, String? value}) =>
      LocalMetaEntry(key: key ?? this.key, value: value ?? this.value);
  LocalMetaEntry copyWithCompanion(LocalMetaCompanion data) {
    return LocalMetaEntry(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalMetaEntry(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalMetaEntry &&
          other.key == this.key &&
          other.value == this.value);
}

class LocalMetaCompanion extends UpdateCompanion<LocalMetaEntry> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const LocalMetaCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocalMetaCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<LocalMetaEntry> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocalMetaCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return LocalMetaCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocalMetaCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncStateTable extends SyncState
    with TableInfo<$SyncStateTable, SyncStateRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _activeGenerationMeta = const VerificationMeta(
    'activeGeneration',
  );
  @override
  late final GeneratedColumn<int> activeGeneration = GeneratedColumn<int>(
    'active_generation',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastSyncAtMeta = const VerificationMeta(
    'lastSyncAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastSyncAt = GeneratedColumn<DateTime>(
    'last_sync_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('never'),
  );
  static const VerificationMeta _catalogGenerationMeta = const VerificationMeta(
    'catalogGeneration',
  );
  @override
  late final GeneratedColumn<int> catalogGeneration = GeneratedColumn<int>(
    'catalog_generation',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastAttemptAtMeta = const VerificationMeta(
    'lastAttemptAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastAttemptAt =
      GeneratedColumn<DateTime>(
        'last_attempt_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serverTimeMeta = const VerificationMeta(
    'serverTime',
  );
  @override
  late final GeneratedColumn<DateTime> serverTime = GeneratedColumn<DateTime>(
    'server_time',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _authorizedUserIdMeta = const VerificationMeta(
    'authorizedUserId',
  );
  @override
  late final GeneratedColumn<String> authorizedUserId = GeneratedColumn<String>(
    'authorized_user_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _authorizationExpiresAtMeta =
      const VerificationMeta('authorizationExpiresAt');
  @override
  late final GeneratedColumn<DateTime> authorizationExpiresAt =
      GeneratedColumn<DateTime>(
        'authorization_expires_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _receiptPendingMeta = const VerificationMeta(
    'receiptPending',
  );
  @override
  late final GeneratedColumn<bool> receiptPending = GeneratedColumn<bool>(
    'receipt_pending',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("receipt_pending" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    activeGeneration,
    lastSyncAt,
    status,
    catalogGeneration,
    lastAttemptAt,
    lastError,
    serverTime,
    authorizedUserId,
    authorizationExpiresAt,
    receiptPending,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_state';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncStateRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('active_generation')) {
      context.handle(
        _activeGenerationMeta,
        activeGeneration.isAcceptableOrUnknown(
          data['active_generation']!,
          _activeGenerationMeta,
        ),
      );
    }
    if (data.containsKey('last_sync_at')) {
      context.handle(
        _lastSyncAtMeta,
        lastSyncAt.isAcceptableOrUnknown(
          data['last_sync_at']!,
          _lastSyncAtMeta,
        ),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('catalog_generation')) {
      context.handle(
        _catalogGenerationMeta,
        catalogGeneration.isAcceptableOrUnknown(
          data['catalog_generation']!,
          _catalogGenerationMeta,
        ),
      );
    }
    if (data.containsKey('last_attempt_at')) {
      context.handle(
        _lastAttemptAtMeta,
        lastAttemptAt.isAcceptableOrUnknown(
          data['last_attempt_at']!,
          _lastAttemptAtMeta,
        ),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('server_time')) {
      context.handle(
        _serverTimeMeta,
        serverTime.isAcceptableOrUnknown(data['server_time']!, _serverTimeMeta),
      );
    }
    if (data.containsKey('authorized_user_id')) {
      context.handle(
        _authorizedUserIdMeta,
        authorizedUserId.isAcceptableOrUnknown(
          data['authorized_user_id']!,
          _authorizedUserIdMeta,
        ),
      );
    }
    if (data.containsKey('authorization_expires_at')) {
      context.handle(
        _authorizationExpiresAtMeta,
        authorizationExpiresAt.isAcceptableOrUnknown(
          data['authorization_expires_at']!,
          _authorizationExpiresAtMeta,
        ),
      );
    }
    if (data.containsKey('receipt_pending')) {
      context.handle(
        _receiptPendingMeta,
        receiptPending.isAcceptableOrUnknown(
          data['receipt_pending']!,
          _receiptPendingMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SyncStateRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncStateRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      activeGeneration: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}active_generation'],
      ),
      lastSyncAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_sync_at'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      catalogGeneration: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}catalog_generation'],
      ),
      lastAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_attempt_at'],
      ),
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      serverTime: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}server_time'],
      ),
      authorizedUserId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}authorized_user_id'],
      ),
      authorizationExpiresAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}authorization_expires_at'],
      ),
      receiptPending: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}receipt_pending'],
      )!,
    );
  }

  @override
  $SyncStateTable createAlias(String alias) {
    return $SyncStateTable(attachedDatabase, alias);
  }
}

class SyncStateRow extends DataClass implements Insertable<SyncStateRow> {
  final int id;

  /// Génération de catalogue entièrement installée (null = aucune).
  final int? activeGeneration;

  /// Horodatage (UTC) de la dernière synchronisation réussie.
  final DateTime? lastSyncAt;

  /// `never` | `idle` | `running` | `failed` (valeurs futures possibles).
  final String status;

  /// Plus haute génération de catalogue acceptée (refus du rejeu).
  final int? catalogGeneration;
  final DateTime? lastAttemptAt;
  final String? lastError;

  /// Heure du serveur au dernier catalogue accepté.
  final DateTime? serverTime;
  final String? authorizedUserId;
  final DateTime? authorizationExpiresAt;

  /// Accusé d'installation à renvoyer au prochain contact.
  final bool receiptPending;
  const SyncStateRow({
    required this.id,
    this.activeGeneration,
    this.lastSyncAt,
    required this.status,
    this.catalogGeneration,
    this.lastAttemptAt,
    this.lastError,
    this.serverTime,
    this.authorizedUserId,
    this.authorizationExpiresAt,
    required this.receiptPending,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    if (!nullToAbsent || activeGeneration != null) {
      map['active_generation'] = Variable<int>(activeGeneration);
    }
    if (!nullToAbsent || lastSyncAt != null) {
      map['last_sync_at'] = Variable<DateTime>(lastSyncAt);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || catalogGeneration != null) {
      map['catalog_generation'] = Variable<int>(catalogGeneration);
    }
    if (!nullToAbsent || lastAttemptAt != null) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
    }
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    if (!nullToAbsent || serverTime != null) {
      map['server_time'] = Variable<DateTime>(serverTime);
    }
    if (!nullToAbsent || authorizedUserId != null) {
      map['authorized_user_id'] = Variable<String>(authorizedUserId);
    }
    if (!nullToAbsent || authorizationExpiresAt != null) {
      map['authorization_expires_at'] = Variable<DateTime>(
        authorizationExpiresAt,
      );
    }
    map['receipt_pending'] = Variable<bool>(receiptPending);
    return map;
  }

  SyncStateCompanion toCompanion(bool nullToAbsent) {
    return SyncStateCompanion(
      id: Value(id),
      activeGeneration: activeGeneration == null && nullToAbsent
          ? const Value.absent()
          : Value(activeGeneration),
      lastSyncAt: lastSyncAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastSyncAt),
      status: Value(status),
      catalogGeneration: catalogGeneration == null && nullToAbsent
          ? const Value.absent()
          : Value(catalogGeneration),
      lastAttemptAt: lastAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAttemptAt),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      serverTime: serverTime == null && nullToAbsent
          ? const Value.absent()
          : Value(serverTime),
      authorizedUserId: authorizedUserId == null && nullToAbsent
          ? const Value.absent()
          : Value(authorizedUserId),
      authorizationExpiresAt: authorizationExpiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(authorizationExpiresAt),
      receiptPending: Value(receiptPending),
    );
  }

  factory SyncStateRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncStateRow(
      id: serializer.fromJson<int>(json['id']),
      activeGeneration: serializer.fromJson<int?>(json['activeGeneration']),
      lastSyncAt: serializer.fromJson<DateTime?>(json['lastSyncAt']),
      status: serializer.fromJson<String>(json['status']),
      catalogGeneration: serializer.fromJson<int?>(json['catalogGeneration']),
      lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      serverTime: serializer.fromJson<DateTime?>(json['serverTime']),
      authorizedUserId: serializer.fromJson<String?>(json['authorizedUserId']),
      authorizationExpiresAt: serializer.fromJson<DateTime?>(
        json['authorizationExpiresAt'],
      ),
      receiptPending: serializer.fromJson<bool>(json['receiptPending']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'activeGeneration': serializer.toJson<int?>(activeGeneration),
      'lastSyncAt': serializer.toJson<DateTime?>(lastSyncAt),
      'status': serializer.toJson<String>(status),
      'catalogGeneration': serializer.toJson<int?>(catalogGeneration),
      'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),
      'lastError': serializer.toJson<String?>(lastError),
      'serverTime': serializer.toJson<DateTime?>(serverTime),
      'authorizedUserId': serializer.toJson<String?>(authorizedUserId),
      'authorizationExpiresAt': serializer.toJson<DateTime?>(
        authorizationExpiresAt,
      ),
      'receiptPending': serializer.toJson<bool>(receiptPending),
    };
  }

  SyncStateRow copyWith({
    int? id,
    Value<int?> activeGeneration = const Value.absent(),
    Value<DateTime?> lastSyncAt = const Value.absent(),
    String? status,
    Value<int?> catalogGeneration = const Value.absent(),
    Value<DateTime?> lastAttemptAt = const Value.absent(),
    Value<String?> lastError = const Value.absent(),
    Value<DateTime?> serverTime = const Value.absent(),
    Value<String?> authorizedUserId = const Value.absent(),
    Value<DateTime?> authorizationExpiresAt = const Value.absent(),
    bool? receiptPending,
  }) => SyncStateRow(
    id: id ?? this.id,
    activeGeneration: activeGeneration.present
        ? activeGeneration.value
        : this.activeGeneration,
    lastSyncAt: lastSyncAt.present ? lastSyncAt.value : this.lastSyncAt,
    status: status ?? this.status,
    catalogGeneration: catalogGeneration.present
        ? catalogGeneration.value
        : this.catalogGeneration,
    lastAttemptAt: lastAttemptAt.present
        ? lastAttemptAt.value
        : this.lastAttemptAt,
    lastError: lastError.present ? lastError.value : this.lastError,
    serverTime: serverTime.present ? serverTime.value : this.serverTime,
    authorizedUserId: authorizedUserId.present
        ? authorizedUserId.value
        : this.authorizedUserId,
    authorizationExpiresAt: authorizationExpiresAt.present
        ? authorizationExpiresAt.value
        : this.authorizationExpiresAt,
    receiptPending: receiptPending ?? this.receiptPending,
  );
  SyncStateRow copyWithCompanion(SyncStateCompanion data) {
    return SyncStateRow(
      id: data.id.present ? data.id.value : this.id,
      activeGeneration: data.activeGeneration.present
          ? data.activeGeneration.value
          : this.activeGeneration,
      lastSyncAt: data.lastSyncAt.present
          ? data.lastSyncAt.value
          : this.lastSyncAt,
      status: data.status.present ? data.status.value : this.status,
      catalogGeneration: data.catalogGeneration.present
          ? data.catalogGeneration.value
          : this.catalogGeneration,
      lastAttemptAt: data.lastAttemptAt.present
          ? data.lastAttemptAt.value
          : this.lastAttemptAt,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      serverTime: data.serverTime.present
          ? data.serverTime.value
          : this.serverTime,
      authorizedUserId: data.authorizedUserId.present
          ? data.authorizedUserId.value
          : this.authorizedUserId,
      authorizationExpiresAt: data.authorizationExpiresAt.present
          ? data.authorizationExpiresAt.value
          : this.authorizationExpiresAt,
      receiptPending: data.receiptPending.present
          ? data.receiptPending.value
          : this.receiptPending,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateRow(')
          ..write('id: $id, ')
          ..write('activeGeneration: $activeGeneration, ')
          ..write('lastSyncAt: $lastSyncAt, ')
          ..write('status: $status, ')
          ..write('catalogGeneration: $catalogGeneration, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('lastError: $lastError, ')
          ..write('serverTime: $serverTime, ')
          ..write('authorizedUserId: $authorizedUserId, ')
          ..write('authorizationExpiresAt: $authorizationExpiresAt, ')
          ..write('receiptPending: $receiptPending')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    activeGeneration,
    lastSyncAt,
    status,
    catalogGeneration,
    lastAttemptAt,
    lastError,
    serverTime,
    authorizedUserId,
    authorizationExpiresAt,
    receiptPending,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncStateRow &&
          other.id == this.id &&
          other.activeGeneration == this.activeGeneration &&
          other.lastSyncAt == this.lastSyncAt &&
          other.status == this.status &&
          other.catalogGeneration == this.catalogGeneration &&
          other.lastAttemptAt == this.lastAttemptAt &&
          other.lastError == this.lastError &&
          other.serverTime == this.serverTime &&
          other.authorizedUserId == this.authorizedUserId &&
          other.authorizationExpiresAt == this.authorizationExpiresAt &&
          other.receiptPending == this.receiptPending);
}

class SyncStateCompanion extends UpdateCompanion<SyncStateRow> {
  final Value<int> id;
  final Value<int?> activeGeneration;
  final Value<DateTime?> lastSyncAt;
  final Value<String> status;
  final Value<int?> catalogGeneration;
  final Value<DateTime?> lastAttemptAt;
  final Value<String?> lastError;
  final Value<DateTime?> serverTime;
  final Value<String?> authorizedUserId;
  final Value<DateTime?> authorizationExpiresAt;
  final Value<bool> receiptPending;
  const SyncStateCompanion({
    this.id = const Value.absent(),
    this.activeGeneration = const Value.absent(),
    this.lastSyncAt = const Value.absent(),
    this.status = const Value.absent(),
    this.catalogGeneration = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.serverTime = const Value.absent(),
    this.authorizedUserId = const Value.absent(),
    this.authorizationExpiresAt = const Value.absent(),
    this.receiptPending = const Value.absent(),
  });
  SyncStateCompanion.insert({
    this.id = const Value.absent(),
    this.activeGeneration = const Value.absent(),
    this.lastSyncAt = const Value.absent(),
    this.status = const Value.absent(),
    this.catalogGeneration = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.serverTime = const Value.absent(),
    this.authorizedUserId = const Value.absent(),
    this.authorizationExpiresAt = const Value.absent(),
    this.receiptPending = const Value.absent(),
  });
  static Insertable<SyncStateRow> custom({
    Expression<int>? id,
    Expression<int>? activeGeneration,
    Expression<DateTime>? lastSyncAt,
    Expression<String>? status,
    Expression<int>? catalogGeneration,
    Expression<DateTime>? lastAttemptAt,
    Expression<String>? lastError,
    Expression<DateTime>? serverTime,
    Expression<String>? authorizedUserId,
    Expression<DateTime>? authorizationExpiresAt,
    Expression<bool>? receiptPending,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (activeGeneration != null) 'active_generation': activeGeneration,
      if (lastSyncAt != null) 'last_sync_at': lastSyncAt,
      if (status != null) 'status': status,
      if (catalogGeneration != null) 'catalog_generation': catalogGeneration,
      if (lastAttemptAt != null) 'last_attempt_at': lastAttemptAt,
      if (lastError != null) 'last_error': lastError,
      if (serverTime != null) 'server_time': serverTime,
      if (authorizedUserId != null) 'authorized_user_id': authorizedUserId,
      if (authorizationExpiresAt != null)
        'authorization_expires_at': authorizationExpiresAt,
      if (receiptPending != null) 'receipt_pending': receiptPending,
    });
  }

  SyncStateCompanion copyWith({
    Value<int>? id,
    Value<int?>? activeGeneration,
    Value<DateTime?>? lastSyncAt,
    Value<String>? status,
    Value<int?>? catalogGeneration,
    Value<DateTime?>? lastAttemptAt,
    Value<String?>? lastError,
    Value<DateTime?>? serverTime,
    Value<String?>? authorizedUserId,
    Value<DateTime?>? authorizationExpiresAt,
    Value<bool>? receiptPending,
  }) {
    return SyncStateCompanion(
      id: id ?? this.id,
      activeGeneration: activeGeneration ?? this.activeGeneration,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      status: status ?? this.status,
      catalogGeneration: catalogGeneration ?? this.catalogGeneration,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      lastError: lastError ?? this.lastError,
      serverTime: serverTime ?? this.serverTime,
      authorizedUserId: authorizedUserId ?? this.authorizedUserId,
      authorizationExpiresAt:
          authorizationExpiresAt ?? this.authorizationExpiresAt,
      receiptPending: receiptPending ?? this.receiptPending,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (activeGeneration.present) {
      map['active_generation'] = Variable<int>(activeGeneration.value);
    }
    if (lastSyncAt.present) {
      map['last_sync_at'] = Variable<DateTime>(lastSyncAt.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (catalogGeneration.present) {
      map['catalog_generation'] = Variable<int>(catalogGeneration.value);
    }
    if (lastAttemptAt.present) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (serverTime.present) {
      map['server_time'] = Variable<DateTime>(serverTime.value);
    }
    if (authorizedUserId.present) {
      map['authorized_user_id'] = Variable<String>(authorizedUserId.value);
    }
    if (authorizationExpiresAt.present) {
      map['authorization_expires_at'] = Variable<DateTime>(
        authorizationExpiresAt.value,
      );
    }
    if (receiptPending.present) {
      map['receipt_pending'] = Variable<bool>(receiptPending.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateCompanion(')
          ..write('id: $id, ')
          ..write('activeGeneration: $activeGeneration, ')
          ..write('lastSyncAt: $lastSyncAt, ')
          ..write('status: $status, ')
          ..write('catalogGeneration: $catalogGeneration, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('lastError: $lastError, ')
          ..write('serverTime: $serverTime, ')
          ..write('authorizedUserId: $authorizedUserId, ')
          ..write('authorizationExpiresAt: $authorizationExpiresAt, ')
          ..write('receiptPending: $receiptPending')
          ..write(')'))
        .toString();
  }
}

class $InstalledPublicationsTable extends InstalledPublications
    with TableInfo<$InstalledPublicationsTable, InstalledPublicationRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $InstalledPublicationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _publicationIdMeta = const VerificationMeta(
    'publicationId',
  );
  @override
  late final GeneratedColumn<String> publicationId = GeneratedColumn<String>(
    'publication_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _publicationNumberMeta = const VerificationMeta(
    'publicationNumber',
  );
  @override
  late final GeneratedColumn<int> publicationNumber = GeneratedColumn<int>(
    'publication_number',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _manifestHashMeta = const VerificationMeta(
    'manifestHash',
  );
  @override
  late final GeneratedColumn<String> manifestHash = GeneratedColumn<String>(
    'manifest_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _manifestTextMeta = const VerificationMeta(
    'manifestText',
  );
  @override
  late final GeneratedColumn<String> manifestText = GeneratedColumn<String>(
    'manifest_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _signatureKeyIdMeta = const VerificationMeta(
    'signatureKeyId',
  );
  @override
  late final GeneratedColumn<String> signatureKeyId = GeneratedColumn<String>(
    'signature_key_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _signatureMeta = const VerificationMeta(
    'signature',
  );
  @override
  late final GeneratedColumn<String> signature = GeneratedColumn<String>(
    'signature',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _etareNumberMeta = const VerificationMeta(
    'etareNumber',
  );
  @override
  late final GeneratedColumn<String> etareNumber = GeneratedColumn<String>(
    'etare_number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _siteNameMeta = const VerificationMeta(
    'siteName',
  );
  @override
  late final GeneratedColumn<String> siteName = GeneratedColumn<String>(
    'site_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _publishedAtMeta = const VerificationMeta(
    'publishedAt',
  );
  @override
  late final GeneratedColumn<DateTime> publishedAt = GeneratedColumn<DateTime>(
    'published_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _installedAtMeta = const VerificationMeta(
    'installedAt',
  );
  @override
  late final GeneratedColumn<DateTime> installedAt = GeneratedColumn<DateTime>(
    'installed_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    siteId,
    publicationId,
    publicationNumber,
    manifestHash,
    manifestText,
    signatureKeyId,
    signature,
    etareNumber,
    siteName,
    publishedAt,
    installedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'installed_publication';
  @override
  VerificationContext validateIntegrity(
    Insertable<InstalledPublicationRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('site_id')) {
      context.handle(
        _siteIdMeta,
        siteId.isAcceptableOrUnknown(data['site_id']!, _siteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_siteIdMeta);
    }
    if (data.containsKey('publication_id')) {
      context.handle(
        _publicationIdMeta,
        publicationId.isAcceptableOrUnknown(
          data['publication_id']!,
          _publicationIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publicationIdMeta);
    }
    if (data.containsKey('publication_number')) {
      context.handle(
        _publicationNumberMeta,
        publicationNumber.isAcceptableOrUnknown(
          data['publication_number']!,
          _publicationNumberMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publicationNumberMeta);
    }
    if (data.containsKey('manifest_hash')) {
      context.handle(
        _manifestHashMeta,
        manifestHash.isAcceptableOrUnknown(
          data['manifest_hash']!,
          _manifestHashMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_manifestHashMeta);
    }
    if (data.containsKey('manifest_text')) {
      context.handle(
        _manifestTextMeta,
        manifestText.isAcceptableOrUnknown(
          data['manifest_text']!,
          _manifestTextMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_manifestTextMeta);
    }
    if (data.containsKey('signature_key_id')) {
      context.handle(
        _signatureKeyIdMeta,
        signatureKeyId.isAcceptableOrUnknown(
          data['signature_key_id']!,
          _signatureKeyIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_signatureKeyIdMeta);
    }
    if (data.containsKey('signature')) {
      context.handle(
        _signatureMeta,
        signature.isAcceptableOrUnknown(data['signature']!, _signatureMeta),
      );
    } else if (isInserting) {
      context.missing(_signatureMeta);
    }
    if (data.containsKey('etare_number')) {
      context.handle(
        _etareNumberMeta,
        etareNumber.isAcceptableOrUnknown(
          data['etare_number']!,
          _etareNumberMeta,
        ),
      );
    }
    if (data.containsKey('site_name')) {
      context.handle(
        _siteNameMeta,
        siteName.isAcceptableOrUnknown(data['site_name']!, _siteNameMeta),
      );
    } else if (isInserting) {
      context.missing(_siteNameMeta);
    }
    if (data.containsKey('published_at')) {
      context.handle(
        _publishedAtMeta,
        publishedAt.isAcceptableOrUnknown(
          data['published_at']!,
          _publishedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publishedAtMeta);
    }
    if (data.containsKey('installed_at')) {
      context.handle(
        _installedAtMeta,
        installedAt.isAcceptableOrUnknown(
          data['installed_at']!,
          _installedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_installedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siteId};
  @override
  InstalledPublicationRow map(
    Map<String, dynamic> data, {
    String? tablePrefix,
  }) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return InstalledPublicationRow(
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      publicationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}publication_id'],
      )!,
      publicationNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}publication_number'],
      )!,
      manifestHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}manifest_hash'],
      )!,
      manifestText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}manifest_text'],
      )!,
      signatureKeyId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signature_key_id'],
      )!,
      signature: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signature'],
      )!,
      etareNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}etare_number'],
      ),
      siteName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_name'],
      )!,
      publishedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}published_at'],
      )!,
      installedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}installed_at'],
      )!,
    );
  }

  @override
  $InstalledPublicationsTable createAlias(String alias) {
    return $InstalledPublicationsTable(attachedDatabase, alias);
  }
}

class InstalledPublicationRow extends DataClass
    implements Insertable<InstalledPublicationRow> {
  final String siteId;
  final String publicationId;
  final int publicationNumber;
  final String manifestHash;

  /// JSON canonique du manifeste, octet pour octet celui qui a été signé.
  final String manifestText;
  final String signatureKeyId;
  final String signature;
  final String? etareNumber;
  final String siteName;
  final DateTime publishedAt;
  final DateTime installedAt;
  const InstalledPublicationRow({
    required this.siteId,
    required this.publicationId,
    required this.publicationNumber,
    required this.manifestHash,
    required this.manifestText,
    required this.signatureKeyId,
    required this.signature,
    this.etareNumber,
    required this.siteName,
    required this.publishedAt,
    required this.installedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['publication_id'] = Variable<String>(publicationId);
    map['publication_number'] = Variable<int>(publicationNumber);
    map['manifest_hash'] = Variable<String>(manifestHash);
    map['manifest_text'] = Variable<String>(manifestText);
    map['signature_key_id'] = Variable<String>(signatureKeyId);
    map['signature'] = Variable<String>(signature);
    if (!nullToAbsent || etareNumber != null) {
      map['etare_number'] = Variable<String>(etareNumber);
    }
    map['site_name'] = Variable<String>(siteName);
    map['published_at'] = Variable<DateTime>(publishedAt);
    map['installed_at'] = Variable<DateTime>(installedAt);
    return map;
  }

  InstalledPublicationsCompanion toCompanion(bool nullToAbsent) {
    return InstalledPublicationsCompanion(
      siteId: Value(siteId),
      publicationId: Value(publicationId),
      publicationNumber: Value(publicationNumber),
      manifestHash: Value(manifestHash),
      manifestText: Value(manifestText),
      signatureKeyId: Value(signatureKeyId),
      signature: Value(signature),
      etareNumber: etareNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(etareNumber),
      siteName: Value(siteName),
      publishedAt: Value(publishedAt),
      installedAt: Value(installedAt),
    );
  }

  factory InstalledPublicationRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return InstalledPublicationRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      publicationNumber: serializer.fromJson<int>(json['publicationNumber']),
      manifestHash: serializer.fromJson<String>(json['manifestHash']),
      manifestText: serializer.fromJson<String>(json['manifestText']),
      signatureKeyId: serializer.fromJson<String>(json['signatureKeyId']),
      signature: serializer.fromJson<String>(json['signature']),
      etareNumber: serializer.fromJson<String?>(json['etareNumber']),
      siteName: serializer.fromJson<String>(json['siteName']),
      publishedAt: serializer.fromJson<DateTime>(json['publishedAt']),
      installedAt: serializer.fromJson<DateTime>(json['installedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siteId': serializer.toJson<String>(siteId),
      'publicationId': serializer.toJson<String>(publicationId),
      'publicationNumber': serializer.toJson<int>(publicationNumber),
      'manifestHash': serializer.toJson<String>(manifestHash),
      'manifestText': serializer.toJson<String>(manifestText),
      'signatureKeyId': serializer.toJson<String>(signatureKeyId),
      'signature': serializer.toJson<String>(signature),
      'etareNumber': serializer.toJson<String?>(etareNumber),
      'siteName': serializer.toJson<String>(siteName),
      'publishedAt': serializer.toJson<DateTime>(publishedAt),
      'installedAt': serializer.toJson<DateTime>(installedAt),
    };
  }

  InstalledPublicationRow copyWith({
    String? siteId,
    String? publicationId,
    int? publicationNumber,
    String? manifestHash,
    String? manifestText,
    String? signatureKeyId,
    String? signature,
    Value<String?> etareNumber = const Value.absent(),
    String? siteName,
    DateTime? publishedAt,
    DateTime? installedAt,
  }) => InstalledPublicationRow(
    siteId: siteId ?? this.siteId,
    publicationId: publicationId ?? this.publicationId,
    publicationNumber: publicationNumber ?? this.publicationNumber,
    manifestHash: manifestHash ?? this.manifestHash,
    manifestText: manifestText ?? this.manifestText,
    signatureKeyId: signatureKeyId ?? this.signatureKeyId,
    signature: signature ?? this.signature,
    etareNumber: etareNumber.present ? etareNumber.value : this.etareNumber,
    siteName: siteName ?? this.siteName,
    publishedAt: publishedAt ?? this.publishedAt,
    installedAt: installedAt ?? this.installedAt,
  );
  InstalledPublicationRow copyWithCompanion(
    InstalledPublicationsCompanion data,
  ) {
    return InstalledPublicationRow(
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      publicationNumber: data.publicationNumber.present
          ? data.publicationNumber.value
          : this.publicationNumber,
      manifestHash: data.manifestHash.present
          ? data.manifestHash.value
          : this.manifestHash,
      manifestText: data.manifestText.present
          ? data.manifestText.value
          : this.manifestText,
      signatureKeyId: data.signatureKeyId.present
          ? data.signatureKeyId.value
          : this.signatureKeyId,
      signature: data.signature.present ? data.signature.value : this.signature,
      etareNumber: data.etareNumber.present
          ? data.etareNumber.value
          : this.etareNumber,
      siteName: data.siteName.present ? data.siteName.value : this.siteName,
      publishedAt: data.publishedAt.present
          ? data.publishedAt.value
          : this.publishedAt,
      installedAt: data.installedAt.present
          ? data.installedAt.value
          : this.installedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('InstalledPublicationRow(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('manifestText: $manifestText, ')
          ..write('signatureKeyId: $signatureKeyId, ')
          ..write('signature: $signature, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('siteName: $siteName, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('installedAt: $installedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    siteId,
    publicationId,
    publicationNumber,
    manifestHash,
    manifestText,
    signatureKeyId,
    signature,
    etareNumber,
    siteName,
    publishedAt,
    installedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is InstalledPublicationRow &&
          other.siteId == this.siteId &&
          other.publicationId == this.publicationId &&
          other.publicationNumber == this.publicationNumber &&
          other.manifestHash == this.manifestHash &&
          other.manifestText == this.manifestText &&
          other.signatureKeyId == this.signatureKeyId &&
          other.signature == this.signature &&
          other.etareNumber == this.etareNumber &&
          other.siteName == this.siteName &&
          other.publishedAt == this.publishedAt &&
          other.installedAt == this.installedAt);
}

class InstalledPublicationsCompanion
    extends UpdateCompanion<InstalledPublicationRow> {
  final Value<String> siteId;
  final Value<String> publicationId;
  final Value<int> publicationNumber;
  final Value<String> manifestHash;
  final Value<String> manifestText;
  final Value<String> signatureKeyId;
  final Value<String> signature;
  final Value<String?> etareNumber;
  final Value<String> siteName;
  final Value<DateTime> publishedAt;
  final Value<DateTime> installedAt;
  final Value<int> rowid;
  const InstalledPublicationsCompanion({
    this.siteId = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.publicationNumber = const Value.absent(),
    this.manifestHash = const Value.absent(),
    this.manifestText = const Value.absent(),
    this.signatureKeyId = const Value.absent(),
    this.signature = const Value.absent(),
    this.etareNumber = const Value.absent(),
    this.siteName = const Value.absent(),
    this.publishedAt = const Value.absent(),
    this.installedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  InstalledPublicationsCompanion.insert({
    required String siteId,
    required String publicationId,
    required int publicationNumber,
    required String manifestHash,
    required String manifestText,
    required String signatureKeyId,
    required String signature,
    this.etareNumber = const Value.absent(),
    required String siteName,
    required DateTime publishedAt,
    required DateTime installedAt,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       publicationId = Value(publicationId),
       publicationNumber = Value(publicationNumber),
       manifestHash = Value(manifestHash),
       manifestText = Value(manifestText),
       signatureKeyId = Value(signatureKeyId),
       signature = Value(signature),
       siteName = Value(siteName),
       publishedAt = Value(publishedAt),
       installedAt = Value(installedAt);
  static Insertable<InstalledPublicationRow> custom({
    Expression<String>? siteId,
    Expression<String>? publicationId,
    Expression<int>? publicationNumber,
    Expression<String>? manifestHash,
    Expression<String>? manifestText,
    Expression<String>? signatureKeyId,
    Expression<String>? signature,
    Expression<String>? etareNumber,
    Expression<String>? siteName,
    Expression<DateTime>? publishedAt,
    Expression<DateTime>? installedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (publicationId != null) 'publication_id': publicationId,
      if (publicationNumber != null) 'publication_number': publicationNumber,
      if (manifestHash != null) 'manifest_hash': manifestHash,
      if (manifestText != null) 'manifest_text': manifestText,
      if (signatureKeyId != null) 'signature_key_id': signatureKeyId,
      if (signature != null) 'signature': signature,
      if (etareNumber != null) 'etare_number': etareNumber,
      if (siteName != null) 'site_name': siteName,
      if (publishedAt != null) 'published_at': publishedAt,
      if (installedAt != null) 'installed_at': installedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  InstalledPublicationsCompanion copyWith({
    Value<String>? siteId,
    Value<String>? publicationId,
    Value<int>? publicationNumber,
    Value<String>? manifestHash,
    Value<String>? manifestText,
    Value<String>? signatureKeyId,
    Value<String>? signature,
    Value<String?>? etareNumber,
    Value<String>? siteName,
    Value<DateTime>? publishedAt,
    Value<DateTime>? installedAt,
    Value<int>? rowid,
  }) {
    return InstalledPublicationsCompanion(
      siteId: siteId ?? this.siteId,
      publicationId: publicationId ?? this.publicationId,
      publicationNumber: publicationNumber ?? this.publicationNumber,
      manifestHash: manifestHash ?? this.manifestHash,
      manifestText: manifestText ?? this.manifestText,
      signatureKeyId: signatureKeyId ?? this.signatureKeyId,
      signature: signature ?? this.signature,
      etareNumber: etareNumber ?? this.etareNumber,
      siteName: siteName ?? this.siteName,
      publishedAt: publishedAt ?? this.publishedAt,
      installedAt: installedAt ?? this.installedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (publicationNumber.present) {
      map['publication_number'] = Variable<int>(publicationNumber.value);
    }
    if (manifestHash.present) {
      map['manifest_hash'] = Variable<String>(manifestHash.value);
    }
    if (manifestText.present) {
      map['manifest_text'] = Variable<String>(manifestText.value);
    }
    if (signatureKeyId.present) {
      map['signature_key_id'] = Variable<String>(signatureKeyId.value);
    }
    if (signature.present) {
      map['signature'] = Variable<String>(signature.value);
    }
    if (etareNumber.present) {
      map['etare_number'] = Variable<String>(etareNumber.value);
    }
    if (siteName.present) {
      map['site_name'] = Variable<String>(siteName.value);
    }
    if (publishedAt.present) {
      map['published_at'] = Variable<DateTime>(publishedAt.value);
    }
    if (installedAt.present) {
      map['installed_at'] = Variable<DateTime>(installedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('InstalledPublicationsCompanion(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('manifestText: $manifestText, ')
          ..write('signatureKeyId: $signatureKeyId, ')
          ..write('signature: $signature, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('siteName: $siteName, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('installedAt: $installedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PublicationFilesTable extends PublicationFiles
    with TableInfo<$PublicationFilesTable, PublicationFileRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PublicationFilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _publicationIdMeta = const VerificationMeta(
    'publicationId',
  );
  @override
  late final GeneratedColumn<String> publicationId = GeneratedColumn<String>(
    'publication_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pathMeta = const VerificationMeta('path');
  @override
  late final GeneratedColumn<String> path = GeneratedColumn<String>(
    'path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
    'sha256',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sizeBytesMeta = const VerificationMeta(
    'sizeBytes',
  );
  @override
  late final GeneratedColumn<int> sizeBytes = GeneratedColumn<int>(
    'size_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _mediaTypeMeta = const VerificationMeta(
    'mediaType',
  );
  @override
  late final GeneratedColumn<String> mediaType = GeneratedColumn<String>(
    'media_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _requiredMeta = const VerificationMeta(
    'required',
  );
  @override
  late final GeneratedColumn<bool> required = GeneratedColumn<bool>(
    'required',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("required" IN (0, 1))',
    ),
  );
  @override
  List<GeneratedColumn> get $columns => [
    publicationId,
    path,
    sha256,
    sizeBytes,
    mediaType,
    required,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'publication_file';
  @override
  VerificationContext validateIntegrity(
    Insertable<PublicationFileRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('publication_id')) {
      context.handle(
        _publicationIdMeta,
        publicationId.isAcceptableOrUnknown(
          data['publication_id']!,
          _publicationIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publicationIdMeta);
    }
    if (data.containsKey('path')) {
      context.handle(
        _pathMeta,
        path.isAcceptableOrUnknown(data['path']!, _pathMeta),
      );
    } else if (isInserting) {
      context.missing(_pathMeta);
    }
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('size_bytes')) {
      context.handle(
        _sizeBytesMeta,
        sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
    }
    if (data.containsKey('media_type')) {
      context.handle(
        _mediaTypeMeta,
        mediaType.isAcceptableOrUnknown(data['media_type']!, _mediaTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_mediaTypeMeta);
    }
    if (data.containsKey('required')) {
      context.handle(
        _requiredMeta,
        required.isAcceptableOrUnknown(data['required']!, _requiredMeta),
      );
    } else if (isInserting) {
      context.missing(_requiredMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {publicationId, path};
  @override
  PublicationFileRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PublicationFileRow(
      publicationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}publication_id'],
      )!,
      path: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}path'],
      )!,
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      sizeBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}size_bytes'],
      )!,
      mediaType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}media_type'],
      )!,
      required: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}required'],
      )!,
    );
  }

  @override
  $PublicationFilesTable createAlias(String alias) {
    return $PublicationFilesTable(attachedDatabase, alias);
  }
}

class PublicationFileRow extends DataClass
    implements Insertable<PublicationFileRow> {
  final String publicationId;
  final String path;
  final String sha256;
  final int sizeBytes;
  final String mediaType;
  final bool required;
  const PublicationFileRow({
    required this.publicationId,
    required this.path,
    required this.sha256,
    required this.sizeBytes,
    required this.mediaType,
    required this.required,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['publication_id'] = Variable<String>(publicationId);
    map['path'] = Variable<String>(path);
    map['sha256'] = Variable<String>(sha256);
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['media_type'] = Variable<String>(mediaType);
    map['required'] = Variable<bool>(required);
    return map;
  }

  PublicationFilesCompanion toCompanion(bool nullToAbsent) {
    return PublicationFilesCompanion(
      publicationId: Value(publicationId),
      path: Value(path),
      sha256: Value(sha256),
      sizeBytes: Value(sizeBytes),
      mediaType: Value(mediaType),
      required: Value(required),
    );
  }

  factory PublicationFileRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PublicationFileRow(
      publicationId: serializer.fromJson<String>(json['publicationId']),
      path: serializer.fromJson<String>(json['path']),
      sha256: serializer.fromJson<String>(json['sha256']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      mediaType: serializer.fromJson<String>(json['mediaType']),
      required: serializer.fromJson<bool>(json['required']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'publicationId': serializer.toJson<String>(publicationId),
      'path': serializer.toJson<String>(path),
      'sha256': serializer.toJson<String>(sha256),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'mediaType': serializer.toJson<String>(mediaType),
      'required': serializer.toJson<bool>(required),
    };
  }

  PublicationFileRow copyWith({
    String? publicationId,
    String? path,
    String? sha256,
    int? sizeBytes,
    String? mediaType,
    bool? required,
  }) => PublicationFileRow(
    publicationId: publicationId ?? this.publicationId,
    path: path ?? this.path,
    sha256: sha256 ?? this.sha256,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    mediaType: mediaType ?? this.mediaType,
    required: required ?? this.required,
  );
  PublicationFileRow copyWithCompanion(PublicationFilesCompanion data) {
    return PublicationFileRow(
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      path: data.path.present ? data.path.value : this.path,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      mediaType: data.mediaType.present ? data.mediaType.value : this.mediaType,
      required: data.required.present ? data.required.value : this.required,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PublicationFileRow(')
          ..write('publicationId: $publicationId, ')
          ..write('path: $path, ')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('mediaType: $mediaType, ')
          ..write('required: $required')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(publicationId, path, sha256, sizeBytes, mediaType, required);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PublicationFileRow &&
          other.publicationId == this.publicationId &&
          other.path == this.path &&
          other.sha256 == this.sha256 &&
          other.sizeBytes == this.sizeBytes &&
          other.mediaType == this.mediaType &&
          other.required == this.required);
}

class PublicationFilesCompanion extends UpdateCompanion<PublicationFileRow> {
  final Value<String> publicationId;
  final Value<String> path;
  final Value<String> sha256;
  final Value<int> sizeBytes;
  final Value<String> mediaType;
  final Value<bool> required;
  final Value<int> rowid;
  const PublicationFilesCompanion({
    this.publicationId = const Value.absent(),
    this.path = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.required = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PublicationFilesCompanion.insert({
    required String publicationId,
    required String path,
    required String sha256,
    required int sizeBytes,
    required String mediaType,
    required bool required,
    this.rowid = const Value.absent(),
  }) : publicationId = Value(publicationId),
       path = Value(path),
       sha256 = Value(sha256),
       sizeBytes = Value(sizeBytes),
       mediaType = Value(mediaType),
       required = Value(required);
  static Insertable<PublicationFileRow> custom({
    Expression<String>? publicationId,
    Expression<String>? path,
    Expression<String>? sha256,
    Expression<int>? sizeBytes,
    Expression<String>? mediaType,
    Expression<bool>? required,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (publicationId != null) 'publication_id': publicationId,
      if (path != null) 'path': path,
      if (sha256 != null) 'sha256': sha256,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (mediaType != null) 'media_type': mediaType,
      if (required != null) 'required': required,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PublicationFilesCompanion copyWith({
    Value<String>? publicationId,
    Value<String>? path,
    Value<String>? sha256,
    Value<int>? sizeBytes,
    Value<String>? mediaType,
    Value<bool>? required,
    Value<int>? rowid,
  }) {
    return PublicationFilesCompanion(
      publicationId: publicationId ?? this.publicationId,
      path: path ?? this.path,
      sha256: sha256 ?? this.sha256,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      mediaType: mediaType ?? this.mediaType,
      required: required ?? this.required,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (path.present) {
      map['path'] = Variable<String>(path.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (mediaType.present) {
      map['media_type'] = Variable<String>(mediaType.value);
    }
    if (required.present) {
      map['required'] = Variable<bool>(required.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PublicationFilesCompanion(')
          ..write('publicationId: $publicationId, ')
          ..write('path: $path, ')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('mediaType: $mediaType, ')
          ..write('required: $required, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FileBlobsTable extends FileBlobs
    with TableInfo<$FileBlobsTable, FileBlobRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FileBlobsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
    'sha256',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sizeBytesMeta = const VerificationMeta(
    'sizeBytes',
  );
  @override
  late final GeneratedColumn<int> sizeBytes = GeneratedColumn<int>(
    'size_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _contentMeta = const VerificationMeta(
    'content',
  );
  @override
  late final GeneratedColumn<Uint8List> content = GeneratedColumn<Uint8List>(
    'content',
    aliasedName,
    false,
    type: DriftSqlType.blob,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _storedAtMeta = const VerificationMeta(
    'storedAt',
  );
  @override
  late final GeneratedColumn<DateTime> storedAt = GeneratedColumn<DateTime>(
    'stored_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [sha256, sizeBytes, content, storedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'file_blob';
  @override
  VerificationContext validateIntegrity(
    Insertable<FileBlobRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('size_bytes')) {
      context.handle(
        _sizeBytesMeta,
        sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
    }
    if (data.containsKey('content')) {
      context.handle(
        _contentMeta,
        content.isAcceptableOrUnknown(data['content']!, _contentMeta),
      );
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('stored_at')) {
      context.handle(
        _storedAtMeta,
        storedAt.isAcceptableOrUnknown(data['stored_at']!, _storedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_storedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {sha256};
  @override
  FileBlobRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FileBlobRow(
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      sizeBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}size_bytes'],
      )!,
      content: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}content'],
      )!,
      storedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}stored_at'],
      )!,
    );
  }

  @override
  $FileBlobsTable createAlias(String alias) {
    return $FileBlobsTable(attachedDatabase, alias);
  }
}

class FileBlobRow extends DataClass implements Insertable<FileBlobRow> {
  final String sha256;
  final int sizeBytes;
  final Uint8List content;
  final DateTime storedAt;
  const FileBlobRow({
    required this.sha256,
    required this.sizeBytes,
    required this.content,
    required this.storedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['sha256'] = Variable<String>(sha256);
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['content'] = Variable<Uint8List>(content);
    map['stored_at'] = Variable<DateTime>(storedAt);
    return map;
  }

  FileBlobsCompanion toCompanion(bool nullToAbsent) {
    return FileBlobsCompanion(
      sha256: Value(sha256),
      sizeBytes: Value(sizeBytes),
      content: Value(content),
      storedAt: Value(storedAt),
    );
  }

  factory FileBlobRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FileBlobRow(
      sha256: serializer.fromJson<String>(json['sha256']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      content: serializer.fromJson<Uint8List>(json['content']),
      storedAt: serializer.fromJson<DateTime>(json['storedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'sha256': serializer.toJson<String>(sha256),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'content': serializer.toJson<Uint8List>(content),
      'storedAt': serializer.toJson<DateTime>(storedAt),
    };
  }

  FileBlobRow copyWith({
    String? sha256,
    int? sizeBytes,
    Uint8List? content,
    DateTime? storedAt,
  }) => FileBlobRow(
    sha256: sha256 ?? this.sha256,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    content: content ?? this.content,
    storedAt: storedAt ?? this.storedAt,
  );
  FileBlobRow copyWithCompanion(FileBlobsCompanion data) {
    return FileBlobRow(
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      content: data.content.present ? data.content.value : this.content,
      storedAt: data.storedAt.present ? data.storedAt.value : this.storedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FileBlobRow(')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('content: $content, ')
          ..write('storedAt: $storedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    sha256,
    sizeBytes,
    $driftBlobEquality.hash(content),
    storedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FileBlobRow &&
          other.sha256 == this.sha256 &&
          other.sizeBytes == this.sizeBytes &&
          $driftBlobEquality.equals(other.content, this.content) &&
          other.storedAt == this.storedAt);
}

class FileBlobsCompanion extends UpdateCompanion<FileBlobRow> {
  final Value<String> sha256;
  final Value<int> sizeBytes;
  final Value<Uint8List> content;
  final Value<DateTime> storedAt;
  final Value<int> rowid;
  const FileBlobsCompanion({
    this.sha256 = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.content = const Value.absent(),
    this.storedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FileBlobsCompanion.insert({
    required String sha256,
    required int sizeBytes,
    required Uint8List content,
    required DateTime storedAt,
    this.rowid = const Value.absent(),
  }) : sha256 = Value(sha256),
       sizeBytes = Value(sizeBytes),
       content = Value(content),
       storedAt = Value(storedAt);
  static Insertable<FileBlobRow> custom({
    Expression<String>? sha256,
    Expression<int>? sizeBytes,
    Expression<Uint8List>? content,
    Expression<DateTime>? storedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (sha256 != null) 'sha256': sha256,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (content != null) 'content': content,
      if (storedAt != null) 'stored_at': storedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FileBlobsCompanion copyWith({
    Value<String>? sha256,
    Value<int>? sizeBytes,
    Value<Uint8List>? content,
    Value<DateTime>? storedAt,
    Value<int>? rowid,
  }) {
    return FileBlobsCompanion(
      sha256: sha256 ?? this.sha256,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      content: content ?? this.content,
      storedAt: storedAt ?? this.storedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (content.present) {
      map['content'] = Variable<Uint8List>(content.value);
    }
    if (storedAt.present) {
      map['stored_at'] = Variable<DateTime>(storedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FileBlobsCompanion(')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('content: $content, ')
          ..write('storedAt: $storedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SiteDataTable extends SiteData
    with TableInfo<$SiteDataTable, SiteDataRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SiteDataTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _publicationIdMeta = const VerificationMeta(
    'publicationId',
  );
  @override
  late final GeneratedColumn<String> publicationId = GeneratedColumn<String>(
    'publication_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataTextMeta = const VerificationMeta(
    'dataText',
  );
  @override
  late final GeneratedColumn<String> dataText = GeneratedColumn<String>(
    'data_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [siteId, publicationId, dataText];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'site_data';
  @override
  VerificationContext validateIntegrity(
    Insertable<SiteDataRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('site_id')) {
      context.handle(
        _siteIdMeta,
        siteId.isAcceptableOrUnknown(data['site_id']!, _siteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_siteIdMeta);
    }
    if (data.containsKey('publication_id')) {
      context.handle(
        _publicationIdMeta,
        publicationId.isAcceptableOrUnknown(
          data['publication_id']!,
          _publicationIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publicationIdMeta);
    }
    if (data.containsKey('data_text')) {
      context.handle(
        _dataTextMeta,
        dataText.isAcceptableOrUnknown(data['data_text']!, _dataTextMeta),
      );
    } else if (isInserting) {
      context.missing(_dataTextMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siteId};
  @override
  SiteDataRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SiteDataRow(
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      publicationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}publication_id'],
      )!,
      dataText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data_text'],
      )!,
    );
  }

  @override
  $SiteDataTable createAlias(String alias) {
    return $SiteDataTable(attachedDatabase, alias);
  }
}

class SiteDataRow extends DataClass implements Insertable<SiteDataRow> {
  final String siteId;
  final String publicationId;
  final String dataText;
  const SiteDataRow({
    required this.siteId,
    required this.publicationId,
    required this.dataText,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['publication_id'] = Variable<String>(publicationId);
    map['data_text'] = Variable<String>(dataText);
    return map;
  }

  SiteDataCompanion toCompanion(bool nullToAbsent) {
    return SiteDataCompanion(
      siteId: Value(siteId),
      publicationId: Value(publicationId),
      dataText: Value(dataText),
    );
  }

  factory SiteDataRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SiteDataRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      dataText: serializer.fromJson<String>(json['dataText']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siteId': serializer.toJson<String>(siteId),
      'publicationId': serializer.toJson<String>(publicationId),
      'dataText': serializer.toJson<String>(dataText),
    };
  }

  SiteDataRow copyWith({
    String? siteId,
    String? publicationId,
    String? dataText,
  }) => SiteDataRow(
    siteId: siteId ?? this.siteId,
    publicationId: publicationId ?? this.publicationId,
    dataText: dataText ?? this.dataText,
  );
  SiteDataRow copyWithCompanion(SiteDataCompanion data) {
    return SiteDataRow(
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      dataText: data.dataText.present ? data.dataText.value : this.dataText,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SiteDataRow(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('dataText: $dataText')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(siteId, publicationId, dataText);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SiteDataRow &&
          other.siteId == this.siteId &&
          other.publicationId == this.publicationId &&
          other.dataText == this.dataText);
}

class SiteDataCompanion extends UpdateCompanion<SiteDataRow> {
  final Value<String> siteId;
  final Value<String> publicationId;
  final Value<String> dataText;
  final Value<int> rowid;
  const SiteDataCompanion({
    this.siteId = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.dataText = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SiteDataCompanion.insert({
    required String siteId,
    required String publicationId,
    required String dataText,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       publicationId = Value(publicationId),
       dataText = Value(dataText);
  static Insertable<SiteDataRow> custom({
    Expression<String>? siteId,
    Expression<String>? publicationId,
    Expression<String>? dataText,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (publicationId != null) 'publication_id': publicationId,
      if (dataText != null) 'data_text': dataText,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SiteDataCompanion copyWith({
    Value<String>? siteId,
    Value<String>? publicationId,
    Value<String>? dataText,
    Value<int>? rowid,
  }) {
    return SiteDataCompanion(
      siteId: siteId ?? this.siteId,
      publicationId: publicationId ?? this.publicationId,
      dataText: dataText ?? this.dataText,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (dataText.present) {
      map['data_text'] = Variable<String>(dataText.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SiteDataCompanion(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('dataText: $dataText, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SiteSearchTable extends SiteSearch
    with TableInfo<$SiteSearchTable, SiteSearchRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SiteSearchTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _etareNumberMeta = const VerificationMeta(
    'etareNumber',
  );
  @override
  late final GeneratedColumn<String> etareNumber = GeneratedColumn<String>(
    'etare_number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _addressLabelMeta = const VerificationMeta(
    'addressLabel',
  );
  @override
  late final GeneratedColumn<String> addressLabel = GeneratedColumn<String>(
    'address_label',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cityMeta = const VerificationMeta('city');
  @override
  late final GeneratedColumn<String> city = GeneratedColumn<String>(
    'city',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _searchTextMeta = const VerificationMeta(
    'searchText',
  );
  @override
  late final GeneratedColumn<String> searchText = GeneratedColumn<String>(
    'search_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    siteId,
    name,
    etareNumber,
    addressLabel,
    city,
    searchText,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'site_search';
  @override
  VerificationContext validateIntegrity(
    Insertable<SiteSearchRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('site_id')) {
      context.handle(
        _siteIdMeta,
        siteId.isAcceptableOrUnknown(data['site_id']!, _siteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_siteIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('etare_number')) {
      context.handle(
        _etareNumberMeta,
        etareNumber.isAcceptableOrUnknown(
          data['etare_number']!,
          _etareNumberMeta,
        ),
      );
    }
    if (data.containsKey('address_label')) {
      context.handle(
        _addressLabelMeta,
        addressLabel.isAcceptableOrUnknown(
          data['address_label']!,
          _addressLabelMeta,
        ),
      );
    }
    if (data.containsKey('city')) {
      context.handle(
        _cityMeta,
        city.isAcceptableOrUnknown(data['city']!, _cityMeta),
      );
    }
    if (data.containsKey('search_text')) {
      context.handle(
        _searchTextMeta,
        searchText.isAcceptableOrUnknown(data['search_text']!, _searchTextMeta),
      );
    } else if (isInserting) {
      context.missing(_searchTextMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siteId};
  @override
  SiteSearchRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SiteSearchRow(
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      etareNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}etare_number'],
      ),
      addressLabel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}address_label'],
      ),
      city: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}city'],
      ),
      searchText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}search_text'],
      )!,
    );
  }

  @override
  $SiteSearchTable createAlias(String alias) {
    return $SiteSearchTable(attachedDatabase, alias);
  }
}

class SiteSearchRow extends DataClass implements Insertable<SiteSearchRow> {
  final String siteId;
  final String name;
  final String? etareNumber;
  final String? addressLabel;
  final String? city;

  /// Texte normalisé (minuscules, sans accents) sur lequel porte la recherche.
  final String searchText;
  const SiteSearchRow({
    required this.siteId,
    required this.name,
    this.etareNumber,
    this.addressLabel,
    this.city,
    required this.searchText,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || etareNumber != null) {
      map['etare_number'] = Variable<String>(etareNumber);
    }
    if (!nullToAbsent || addressLabel != null) {
      map['address_label'] = Variable<String>(addressLabel);
    }
    if (!nullToAbsent || city != null) {
      map['city'] = Variable<String>(city);
    }
    map['search_text'] = Variable<String>(searchText);
    return map;
  }

  SiteSearchCompanion toCompanion(bool nullToAbsent) {
    return SiteSearchCompanion(
      siteId: Value(siteId),
      name: Value(name),
      etareNumber: etareNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(etareNumber),
      addressLabel: addressLabel == null && nullToAbsent
          ? const Value.absent()
          : Value(addressLabel),
      city: city == null && nullToAbsent ? const Value.absent() : Value(city),
      searchText: Value(searchText),
    );
  }

  factory SiteSearchRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SiteSearchRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      name: serializer.fromJson<String>(json['name']),
      etareNumber: serializer.fromJson<String?>(json['etareNumber']),
      addressLabel: serializer.fromJson<String?>(json['addressLabel']),
      city: serializer.fromJson<String?>(json['city']),
      searchText: serializer.fromJson<String>(json['searchText']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siteId': serializer.toJson<String>(siteId),
      'name': serializer.toJson<String>(name),
      'etareNumber': serializer.toJson<String?>(etareNumber),
      'addressLabel': serializer.toJson<String?>(addressLabel),
      'city': serializer.toJson<String?>(city),
      'searchText': serializer.toJson<String>(searchText),
    };
  }

  SiteSearchRow copyWith({
    String? siteId,
    String? name,
    Value<String?> etareNumber = const Value.absent(),
    Value<String?> addressLabel = const Value.absent(),
    Value<String?> city = const Value.absent(),
    String? searchText,
  }) => SiteSearchRow(
    siteId: siteId ?? this.siteId,
    name: name ?? this.name,
    etareNumber: etareNumber.present ? etareNumber.value : this.etareNumber,
    addressLabel: addressLabel.present ? addressLabel.value : this.addressLabel,
    city: city.present ? city.value : this.city,
    searchText: searchText ?? this.searchText,
  );
  SiteSearchRow copyWithCompanion(SiteSearchCompanion data) {
    return SiteSearchRow(
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      name: data.name.present ? data.name.value : this.name,
      etareNumber: data.etareNumber.present
          ? data.etareNumber.value
          : this.etareNumber,
      addressLabel: data.addressLabel.present
          ? data.addressLabel.value
          : this.addressLabel,
      city: data.city.present ? data.city.value : this.city,
      searchText: data.searchText.present
          ? data.searchText.value
          : this.searchText,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SiteSearchRow(')
          ..write('siteId: $siteId, ')
          ..write('name: $name, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('addressLabel: $addressLabel, ')
          ..write('city: $city, ')
          ..write('searchText: $searchText')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(siteId, name, etareNumber, addressLabel, city, searchText);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SiteSearchRow &&
          other.siteId == this.siteId &&
          other.name == this.name &&
          other.etareNumber == this.etareNumber &&
          other.addressLabel == this.addressLabel &&
          other.city == this.city &&
          other.searchText == this.searchText);
}

class SiteSearchCompanion extends UpdateCompanion<SiteSearchRow> {
  final Value<String> siteId;
  final Value<String> name;
  final Value<String?> etareNumber;
  final Value<String?> addressLabel;
  final Value<String?> city;
  final Value<String> searchText;
  final Value<int> rowid;
  const SiteSearchCompanion({
    this.siteId = const Value.absent(),
    this.name = const Value.absent(),
    this.etareNumber = const Value.absent(),
    this.addressLabel = const Value.absent(),
    this.city = const Value.absent(),
    this.searchText = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SiteSearchCompanion.insert({
    required String siteId,
    required String name,
    this.etareNumber = const Value.absent(),
    this.addressLabel = const Value.absent(),
    this.city = const Value.absent(),
    required String searchText,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       name = Value(name),
       searchText = Value(searchText);
  static Insertable<SiteSearchRow> custom({
    Expression<String>? siteId,
    Expression<String>? name,
    Expression<String>? etareNumber,
    Expression<String>? addressLabel,
    Expression<String>? city,
    Expression<String>? searchText,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (name != null) 'name': name,
      if (etareNumber != null) 'etare_number': etareNumber,
      if (addressLabel != null) 'address_label': addressLabel,
      if (city != null) 'city': city,
      if (searchText != null) 'search_text': searchText,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SiteSearchCompanion copyWith({
    Value<String>? siteId,
    Value<String>? name,
    Value<String?>? etareNumber,
    Value<String?>? addressLabel,
    Value<String?>? city,
    Value<String>? searchText,
    Value<int>? rowid,
  }) {
    return SiteSearchCompanion(
      siteId: siteId ?? this.siteId,
      name: name ?? this.name,
      etareNumber: etareNumber ?? this.etareNumber,
      addressLabel: addressLabel ?? this.addressLabel,
      city: city ?? this.city,
      searchText: searchText ?? this.searchText,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (etareNumber.present) {
      map['etare_number'] = Variable<String>(etareNumber.value);
    }
    if (addressLabel.present) {
      map['address_label'] = Variable<String>(addressLabel.value);
    }
    if (city.present) {
      map['city'] = Variable<String>(city.value);
    }
    if (searchText.present) {
      map['search_text'] = Variable<String>(searchText.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SiteSearchCompanion(')
          ..write('siteId: $siteId, ')
          ..write('name: $name, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('addressLabel: $addressLabel, ')
          ..write('city: $city, ')
          ..write('searchText: $searchText, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $LocalMetaTable localMeta = $LocalMetaTable(this);
  late final $SyncStateTable syncState = $SyncStateTable(this);
  late final $InstalledPublicationsTable installedPublications =
      $InstalledPublicationsTable(this);
  late final $PublicationFilesTable publicationFiles = $PublicationFilesTable(
    this,
  );
  late final $FileBlobsTable fileBlobs = $FileBlobsTable(this);
  late final $SiteDataTable siteData = $SiteDataTable(this);
  late final $SiteSearchTable siteSearch = $SiteSearchTable(this);
  late final LocalMetaDao localMetaDao = LocalMetaDao(this as AppDatabase);
  late final SyncStateDao syncStateDao = SyncStateDao(this as AppDatabase);
  late final OfflineDao offlineDao = OfflineDao(this as AppDatabase);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    localMeta,
    syncState,
    installedPublications,
    publicationFiles,
    fileBlobs,
    siteData,
    siteSearch,
  ];
  @override
  DriftDatabaseOptions get options =>
      const DriftDatabaseOptions(storeDateTimeAsText: true);
}

typedef $$LocalMetaTableCreateCompanionBuilder = LocalMetaCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$LocalMetaTableUpdateCompanionBuilder = LocalMetaCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$LocalMetaTableFilterComposer
    extends Composer<_$AppDatabase, $LocalMetaTable> {
  $$LocalMetaTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LocalMetaTableOrderingComposer
    extends Composer<_$AppDatabase, $LocalMetaTable> {
  $$LocalMetaTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LocalMetaTableAnnotationComposer
    extends Composer<_$AppDatabase, $LocalMetaTable> {
  $$LocalMetaTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$LocalMetaTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LocalMetaTable,
          LocalMetaEntry,
          $$LocalMetaTableFilterComposer,
          $$LocalMetaTableOrderingComposer,
          $$LocalMetaTableAnnotationComposer,
          $$LocalMetaTableCreateCompanionBuilder,
          $$LocalMetaTableUpdateCompanionBuilder,
          (
            LocalMetaEntry,
            BaseReferences<_$AppDatabase, $LocalMetaTable, LocalMetaEntry>,
          ),
          LocalMetaEntry,
          PrefetchHooks Function()
        > {
  $$LocalMetaTableTableManager(_$AppDatabase db, $LocalMetaTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LocalMetaTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LocalMetaTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LocalMetaTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => LocalMetaCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) => LocalMetaCompanion.insert(key: key, value: value, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$LocalMetaTable, LocalMetaEntry>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $LocalMetaTable,
                    LocalMetaEntry
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocalMetaTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LocalMetaTable,
      LocalMetaEntry,
      $$LocalMetaTableFilterComposer,
      $$LocalMetaTableOrderingComposer,
      $$LocalMetaTableAnnotationComposer,
      $$LocalMetaTableCreateCompanionBuilder,
      $$LocalMetaTableUpdateCompanionBuilder,
      (
        LocalMetaEntry,
        BaseReferences<_$AppDatabase, $LocalMetaTable, LocalMetaEntry>,
      ),
      LocalMetaEntry,
      PrefetchHooks Function()
    >;
typedef $$SyncStateTableCreateCompanionBuilder = SyncStateCompanion Function({
  Value<int> id,
  Value<int?> activeGeneration,
  Value<DateTime?> lastSyncAt,
  Value<String> status,
  Value<int?> catalogGeneration,
  Value<DateTime?> lastAttemptAt,
  Value<String?> lastError,
  Value<DateTime?> serverTime,
  Value<String?> authorizedUserId,
  Value<DateTime?> authorizationExpiresAt,
  Value<bool> receiptPending,
});
typedef $$SyncStateTableUpdateCompanionBuilder = SyncStateCompanion Function({
  Value<int> id,
  Value<int?> activeGeneration,
  Value<DateTime?> lastSyncAt,
  Value<String> status,
  Value<int?> catalogGeneration,
  Value<DateTime?> lastAttemptAt,
  Value<String?> lastError,
  Value<DateTime?> serverTime,
  Value<String?> authorizedUserId,
  Value<DateTime?> authorizationExpiresAt,
  Value<bool> receiptPending,
});

class $$SyncStateTableFilterComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get activeGeneration => $composableBuilder(
    column: $table.activeGeneration,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastSyncAt => $composableBuilder(
    column: $table.lastSyncAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get catalogGeneration => $composableBuilder(
    column: $table.catalogGeneration,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get serverTime => $composableBuilder(
    column: $table.serverTime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get authorizedUserId => $composableBuilder(
    column: $table.authorizedUserId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get authorizationExpiresAt => $composableBuilder(
    column: $table.authorizationExpiresAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get receiptPending => $composableBuilder(
    column: $table.receiptPending,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncStateTableOrderingComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get activeGeneration => $composableBuilder(
    column: $table.activeGeneration,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastSyncAt => $composableBuilder(
    column: $table.lastSyncAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get catalogGeneration => $composableBuilder(
    column: $table.catalogGeneration,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get serverTime => $composableBuilder(
    column: $table.serverTime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get authorizedUserId => $composableBuilder(
    column: $table.authorizedUserId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get authorizationExpiresAt => $composableBuilder(
    column: $table.authorizationExpiresAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get receiptPending => $composableBuilder(
    column: $table.receiptPending,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncStateTableAnnotationComposer
    extends Composer<_$AppDatabase, $SyncStateTable> {
  $$SyncStateTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get activeGeneration => $composableBuilder(
    column: $table.activeGeneration,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get lastSyncAt => $composableBuilder(
    column: $table.lastSyncAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get catalogGeneration => $composableBuilder(
    column: $table.catalogGeneration,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<DateTime> get serverTime => $composableBuilder(
    column: $table.serverTime,
    builder: (column) => column,
  );

  GeneratedColumn<String> get authorizedUserId => $composableBuilder(
    column: $table.authorizedUserId,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get authorizationExpiresAt => $composableBuilder(
    column: $table.authorizationExpiresAt,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get receiptPending => $composableBuilder(
    column: $table.receiptPending,
    builder: (column) => column,
  );
}

class $$SyncStateTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SyncStateTable,
          SyncStateRow,
          $$SyncStateTableFilterComposer,
          $$SyncStateTableOrderingComposer,
          $$SyncStateTableAnnotationComposer,
          $$SyncStateTableCreateCompanionBuilder,
          $$SyncStateTableUpdateCompanionBuilder,
          (
            SyncStateRow,
            BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateRow>,
          ),
          SyncStateRow,
          PrefetchHooks Function()
        > {
  $$SyncStateTableTableManager(_$AppDatabase db, $SyncStateTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncStateTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncStateTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncStateTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int?> activeGeneration = const Value.absent(),
                Value<DateTime?> lastSyncAt = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int?> catalogGeneration = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<DateTime?> serverTime = const Value.absent(),
                Value<String?> authorizedUserId = const Value.absent(),
                Value<DateTime?> authorizationExpiresAt = const Value.absent(),
                Value<bool> receiptPending = const Value.absent(),
              }) => SyncStateCompanion(
                id: id,
                activeGeneration: activeGeneration,
                lastSyncAt: lastSyncAt,
                status: status,
                catalogGeneration: catalogGeneration,
                lastAttemptAt: lastAttemptAt,
                lastError: lastError,
                serverTime: serverTime,
                authorizedUserId: authorizedUserId,
                authorizationExpiresAt: authorizationExpiresAt,
                receiptPending: receiptPending,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int?> activeGeneration = const Value.absent(),
                Value<DateTime?> lastSyncAt = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int?> catalogGeneration = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<DateTime?> serverTime = const Value.absent(),
                Value<String?> authorizedUserId = const Value.absent(),
                Value<DateTime?> authorizationExpiresAt = const Value.absent(),
                Value<bool> receiptPending = const Value.absent(),
              }) => SyncStateCompanion.insert(
                id: id,
                activeGeneration: activeGeneration,
                lastSyncAt: lastSyncAt,
                status: status,
                catalogGeneration: catalogGeneration,
                lastAttemptAt: lastAttemptAt,
                lastError: lastError,
                serverTime: serverTime,
                authorizedUserId: authorizedUserId,
                authorizationExpiresAt: authorizationExpiresAt,
                receiptPending: receiptPending,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SyncStateTable, SyncStateRow>(table),
                  BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncStateTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SyncStateTable,
      SyncStateRow,
      $$SyncStateTableFilterComposer,
      $$SyncStateTableOrderingComposer,
      $$SyncStateTableAnnotationComposer,
      $$SyncStateTableCreateCompanionBuilder,
      $$SyncStateTableUpdateCompanionBuilder,
      (
        SyncStateRow,
        BaseReferences<_$AppDatabase, $SyncStateTable, SyncStateRow>,
      ),
      SyncStateRow,
      PrefetchHooks Function()
    >;
typedef $$InstalledPublicationsTableCreateCompanionBuilder =
    InstalledPublicationsCompanion Function({
      required String siteId,
      required String publicationId,
      required int publicationNumber,
      required String manifestHash,
      required String manifestText,
      required String signatureKeyId,
      required String signature,
      Value<String?> etareNumber,
      required String siteName,
      required DateTime publishedAt,
      required DateTime installedAt,
      Value<int> rowid,
    });
typedef $$InstalledPublicationsTableUpdateCompanionBuilder =
    InstalledPublicationsCompanion Function({
      Value<String> siteId,
      Value<String> publicationId,
      Value<int> publicationNumber,
      Value<String> manifestHash,
      Value<String> manifestText,
      Value<String> signatureKeyId,
      Value<String> signature,
      Value<String?> etareNumber,
      Value<String> siteName,
      Value<DateTime> publishedAt,
      Value<DateTime> installedAt,
      Value<int> rowid,
    });

class $$InstalledPublicationsTableFilterComposer
    extends Composer<_$AppDatabase, $InstalledPublicationsTable> {
  $$InstalledPublicationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get publicationNumber => $composableBuilder(
    column: $table.publicationNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get manifestHash => $composableBuilder(
    column: $table.manifestHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get manifestText => $composableBuilder(
    column: $table.manifestText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signature => $composableBuilder(
    column: $table.signature,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$InstalledPublicationsTableOrderingComposer
    extends Composer<_$AppDatabase, $InstalledPublicationsTable> {
  $$InstalledPublicationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get publicationNumber => $composableBuilder(
    column: $table.publicationNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get manifestHash => $composableBuilder(
    column: $table.manifestHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get manifestText => $composableBuilder(
    column: $table.manifestText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signature => $composableBuilder(
    column: $table.signature,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$InstalledPublicationsTableAnnotationComposer
    extends Composer<_$AppDatabase, $InstalledPublicationsTable> {
  $$InstalledPublicationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get publicationNumber => $composableBuilder(
    column: $table.publicationNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get manifestHash => $composableBuilder(
    column: $table.manifestHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get manifestText => $composableBuilder(
    column: $table.manifestText,
    builder: (column) => column,
  );

  GeneratedColumn<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get signature =>
      $composableBuilder(column: $table.signature, builder: (column) => column);

  GeneratedColumn<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get siteName =>
      $composableBuilder(column: $table.siteName, builder: (column) => column);

  GeneratedColumn<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => column,
  );
}

class $$InstalledPublicationsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $InstalledPublicationsTable,
          InstalledPublicationRow,
          $$InstalledPublicationsTableFilterComposer,
          $$InstalledPublicationsTableOrderingComposer,
          $$InstalledPublicationsTableAnnotationComposer,
          $$InstalledPublicationsTableCreateCompanionBuilder,
          $$InstalledPublicationsTableUpdateCompanionBuilder,
          (
            InstalledPublicationRow,
            BaseReferences<
              _$AppDatabase,
              $InstalledPublicationsTable,
              InstalledPublicationRow
            >,
          ),
          InstalledPublicationRow,
          PrefetchHooks Function()
        > {
  $$InstalledPublicationsTableTableManager(
    _$AppDatabase db,
    $InstalledPublicationsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$InstalledPublicationsTableFilterComposer(
                $db: db,
                $table: table,
              ),
          createOrderingComposer: () =>
              $$InstalledPublicationsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$InstalledPublicationsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<int> publicationNumber = const Value.absent(),
                Value<String> manifestHash = const Value.absent(),
                Value<String> manifestText = const Value.absent(),
                Value<String> signatureKeyId = const Value.absent(),
                Value<String> signature = const Value.absent(),
                Value<String?> etareNumber = const Value.absent(),
                Value<String> siteName = const Value.absent(),
                Value<DateTime> publishedAt = const Value.absent(),
                Value<DateTime> installedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => InstalledPublicationsCompanion(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                manifestHash: manifestHash,
                manifestText: manifestText,
                signatureKeyId: signatureKeyId,
                signature: signature,
                etareNumber: etareNumber,
                siteName: siteName,
                publishedAt: publishedAt,
                installedAt: installedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String publicationId,
                required int publicationNumber,
                required String manifestHash,
                required String manifestText,
                required String signatureKeyId,
                required String signature,
                Value<String?> etareNumber = const Value.absent(),
                required String siteName,
                required DateTime publishedAt,
                required DateTime installedAt,
                Value<int> rowid = const Value.absent(),
              }) => InstalledPublicationsCompanion.insert(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                manifestHash: manifestHash,
                manifestText: manifestText,
                signatureKeyId: signatureKeyId,
                signature: signature,
                etareNumber: etareNumber,
                siteName: siteName,
                publishedAt: publishedAt,
                installedAt: installedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<
                    $InstalledPublicationsTable,
                    InstalledPublicationRow
                  >(table),
                  BaseReferences<
                    _$AppDatabase,
                    $InstalledPublicationsTable,
                    InstalledPublicationRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$InstalledPublicationsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $InstalledPublicationsTable,
      InstalledPublicationRow,
      $$InstalledPublicationsTableFilterComposer,
      $$InstalledPublicationsTableOrderingComposer,
      $$InstalledPublicationsTableAnnotationComposer,
      $$InstalledPublicationsTableCreateCompanionBuilder,
      $$InstalledPublicationsTableUpdateCompanionBuilder,
      (
        InstalledPublicationRow,
        BaseReferences<
          _$AppDatabase,
          $InstalledPublicationsTable,
          InstalledPublicationRow
        >,
      ),
      InstalledPublicationRow,
      PrefetchHooks Function()
    >;
typedef $$PublicationFilesTableCreateCompanionBuilder =
    PublicationFilesCompanion Function({
      required String publicationId,
      required String path,
      required String sha256,
      required int sizeBytes,
      required String mediaType,
      required bool required,
      Value<int> rowid,
    });
typedef $$PublicationFilesTableUpdateCompanionBuilder =
    PublicationFilesCompanion Function({
      Value<String> publicationId,
      Value<String> path,
      Value<String> sha256,
      Value<int> sizeBytes,
      Value<String> mediaType,
      Value<bool> required,
      Value<int> rowid,
    });

class $$PublicationFilesTableFilterComposer
    extends Composer<_$AppDatabase, $PublicationFilesTable> {
  $$PublicationFilesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get required => $composableBuilder(
    column: $table.required,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PublicationFilesTableOrderingComposer
    extends Composer<_$AppDatabase, $PublicationFilesTable> {
  $$PublicationFilesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get required => $composableBuilder(
    column: $table.required,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PublicationFilesTableAnnotationComposer
    extends Composer<_$AppDatabase, $PublicationFilesTable> {
  $$PublicationFilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get path =>
      $composableBuilder(column: $table.path, builder: (column) => column);

  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<String> get mediaType =>
      $composableBuilder(column: $table.mediaType, builder: (column) => column);

  GeneratedColumn<bool> get required =>
      $composableBuilder(column: $table.required, builder: (column) => column);
}

class $$PublicationFilesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PublicationFilesTable,
          PublicationFileRow,
          $$PublicationFilesTableFilterComposer,
          $$PublicationFilesTableOrderingComposer,
          $$PublicationFilesTableAnnotationComposer,
          $$PublicationFilesTableCreateCompanionBuilder,
          $$PublicationFilesTableUpdateCompanionBuilder,
          (
            PublicationFileRow,
            BaseReferences<
              _$AppDatabase,
              $PublicationFilesTable,
              PublicationFileRow
            >,
          ),
          PublicationFileRow,
          PrefetchHooks Function()
        > {
  $$PublicationFilesTableTableManager(
    _$AppDatabase db,
    $PublicationFilesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PublicationFilesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PublicationFilesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PublicationFilesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> publicationId = const Value.absent(),
                Value<String> path = const Value.absent(),
                Value<String> sha256 = const Value.absent(),
                Value<int> sizeBytes = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<bool> required = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PublicationFilesCompanion(
                publicationId: publicationId,
                path: path,
                sha256: sha256,
                sizeBytes: sizeBytes,
                mediaType: mediaType,
                required: required,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String publicationId,
                required String path,
                required String sha256,
                required int sizeBytes,
                required String mediaType,
                required bool required,
                Value<int> rowid = const Value.absent(),
              }) => PublicationFilesCompanion.insert(
                publicationId: publicationId,
                path: path,
                sha256: sha256,
                sizeBytes: sizeBytes,
                mediaType: mediaType,
                required: required,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$PublicationFilesTable, PublicationFileRow>(
                    table,
                  ),
                  BaseReferences<
                    _$AppDatabase,
                    $PublicationFilesTable,
                    PublicationFileRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PublicationFilesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PublicationFilesTable,
      PublicationFileRow,
      $$PublicationFilesTableFilterComposer,
      $$PublicationFilesTableOrderingComposer,
      $$PublicationFilesTableAnnotationComposer,
      $$PublicationFilesTableCreateCompanionBuilder,
      $$PublicationFilesTableUpdateCompanionBuilder,
      (
        PublicationFileRow,
        BaseReferences<
          _$AppDatabase,
          $PublicationFilesTable,
          PublicationFileRow
        >,
      ),
      PublicationFileRow,
      PrefetchHooks Function()
    >;
typedef $$FileBlobsTableCreateCompanionBuilder = FileBlobsCompanion Function({
  required String sha256,
  required int sizeBytes,
  required Uint8List content,
  required DateTime storedAt,
  Value<int> rowid,
});
typedef $$FileBlobsTableUpdateCompanionBuilder = FileBlobsCompanion Function({
  Value<String> sha256,
  Value<int> sizeBytes,
  Value<Uint8List> content,
  Value<DateTime> storedAt,
  Value<int> rowid,
});

class $$FileBlobsTableFilterComposer
    extends Composer<_$AppDatabase, $FileBlobsTable> {
  $$FileBlobsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get storedAt => $composableBuilder(
    column: $table.storedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$FileBlobsTableOrderingComposer
    extends Composer<_$AppDatabase, $FileBlobsTable> {
  $$FileBlobsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get storedAt => $composableBuilder(
    column: $table.storedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$FileBlobsTableAnnotationComposer
    extends Composer<_$AppDatabase, $FileBlobsTable> {
  $$FileBlobsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<Uint8List> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<DateTime> get storedAt =>
      $composableBuilder(column: $table.storedAt, builder: (column) => column);
}

class $$FileBlobsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FileBlobsTable,
          FileBlobRow,
          $$FileBlobsTableFilterComposer,
          $$FileBlobsTableOrderingComposer,
          $$FileBlobsTableAnnotationComposer,
          $$FileBlobsTableCreateCompanionBuilder,
          $$FileBlobsTableUpdateCompanionBuilder,
          (
            FileBlobRow,
            BaseReferences<_$AppDatabase, $FileBlobsTable, FileBlobRow>,
          ),
          FileBlobRow,
          PrefetchHooks Function()
        > {
  $$FileBlobsTableTableManager(_$AppDatabase db, $FileBlobsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FileBlobsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FileBlobsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FileBlobsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> sha256 = const Value.absent(),
                Value<int> sizeBytes = const Value.absent(),
                Value<Uint8List> content = const Value.absent(),
                Value<DateTime> storedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FileBlobsCompanion(
                sha256: sha256,
                sizeBytes: sizeBytes,
                content: content,
                storedAt: storedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String sha256,
                required int sizeBytes,
                required Uint8List content,
                required DateTime storedAt,
                Value<int> rowid = const Value.absent(),
              }) => FileBlobsCompanion.insert(
                sha256: sha256,
                sizeBytes: sizeBytes,
                content: content,
                storedAt: storedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FileBlobsTable, FileBlobRow>(table),
                  BaseReferences<_$AppDatabase, $FileBlobsTable, FileBlobRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$FileBlobsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FileBlobsTable,
      FileBlobRow,
      $$FileBlobsTableFilterComposer,
      $$FileBlobsTableOrderingComposer,
      $$FileBlobsTableAnnotationComposer,
      $$FileBlobsTableCreateCompanionBuilder,
      $$FileBlobsTableUpdateCompanionBuilder,
      (
        FileBlobRow,
        BaseReferences<_$AppDatabase, $FileBlobsTable, FileBlobRow>,
      ),
      FileBlobRow,
      PrefetchHooks Function()
    >;
typedef $$SiteDataTableCreateCompanionBuilder = SiteDataCompanion Function({
  required String siteId,
  required String publicationId,
  required String dataText,
  Value<int> rowid,
});
typedef $$SiteDataTableUpdateCompanionBuilder = SiteDataCompanion Function({
  Value<String> siteId,
  Value<String> publicationId,
  Value<String> dataText,
  Value<int> rowid,
});

class $$SiteDataTableFilterComposer
    extends Composer<_$AppDatabase, $SiteDataTable> {
  $$SiteDataTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dataText => $composableBuilder(
    column: $table.dataText,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SiteDataTableOrderingComposer
    extends Composer<_$AppDatabase, $SiteDataTable> {
  $$SiteDataTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dataText => $composableBuilder(
    column: $table.dataText,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SiteDataTableAnnotationComposer
    extends Composer<_$AppDatabase, $SiteDataTable> {
  $$SiteDataTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get dataText =>
      $composableBuilder(column: $table.dataText, builder: (column) => column);
}

class $$SiteDataTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SiteDataTable,
          SiteDataRow,
          $$SiteDataTableFilterComposer,
          $$SiteDataTableOrderingComposer,
          $$SiteDataTableAnnotationComposer,
          $$SiteDataTableCreateCompanionBuilder,
          $$SiteDataTableUpdateCompanionBuilder,
          (
            SiteDataRow,
            BaseReferences<_$AppDatabase, $SiteDataTable, SiteDataRow>,
          ),
          SiteDataRow,
          PrefetchHooks Function()
        > {
  $$SiteDataTableTableManager(_$AppDatabase db, $SiteDataTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SiteDataTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SiteDataTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SiteDataTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<String> dataText = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SiteDataCompanion(
                siteId: siteId,
                publicationId: publicationId,
                dataText: dataText,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String publicationId,
                required String dataText,
                Value<int> rowid = const Value.absent(),
              }) => SiteDataCompanion.insert(
                siteId: siteId,
                publicationId: publicationId,
                dataText: dataText,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SiteDataTable, SiteDataRow>(table),
                  BaseReferences<_$AppDatabase, $SiteDataTable, SiteDataRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SiteDataTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SiteDataTable,
      SiteDataRow,
      $$SiteDataTableFilterComposer,
      $$SiteDataTableOrderingComposer,
      $$SiteDataTableAnnotationComposer,
      $$SiteDataTableCreateCompanionBuilder,
      $$SiteDataTableUpdateCompanionBuilder,
      (SiteDataRow, BaseReferences<_$AppDatabase, $SiteDataTable, SiteDataRow>),
      SiteDataRow,
      PrefetchHooks Function()
    >;
typedef $$SiteSearchTableCreateCompanionBuilder = SiteSearchCompanion Function({
  required String siteId,
  required String name,
  Value<String?> etareNumber,
  Value<String?> addressLabel,
  Value<String?> city,
  required String searchText,
  Value<int> rowid,
});
typedef $$SiteSearchTableUpdateCompanionBuilder = SiteSearchCompanion Function({
  Value<String> siteId,
  Value<String> name,
  Value<String?> etareNumber,
  Value<String?> addressLabel,
  Value<String?> city,
  Value<String> searchText,
  Value<int> rowid,
});

class $$SiteSearchTableFilterComposer
    extends Composer<_$AppDatabase, $SiteSearchTable> {
  $$SiteSearchTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get addressLabel => $composableBuilder(
    column: $table.addressLabel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get city => $composableBuilder(
    column: $table.city,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SiteSearchTableOrderingComposer
    extends Composer<_$AppDatabase, $SiteSearchTable> {
  $$SiteSearchTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get addressLabel => $composableBuilder(
    column: $table.addressLabel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get city => $composableBuilder(
    column: $table.city,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SiteSearchTableAnnotationComposer
    extends Composer<_$AppDatabase, $SiteSearchTable> {
  $$SiteSearchTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get addressLabel => $composableBuilder(
    column: $table.addressLabel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get city =>
      $composableBuilder(column: $table.city, builder: (column) => column);

  GeneratedColumn<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => column,
  );
}

class $$SiteSearchTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SiteSearchTable,
          SiteSearchRow,
          $$SiteSearchTableFilterComposer,
          $$SiteSearchTableOrderingComposer,
          $$SiteSearchTableAnnotationComposer,
          $$SiteSearchTableCreateCompanionBuilder,
          $$SiteSearchTableUpdateCompanionBuilder,
          (
            SiteSearchRow,
            BaseReferences<_$AppDatabase, $SiteSearchTable, SiteSearchRow>,
          ),
          SiteSearchRow,
          PrefetchHooks Function()
        > {
  $$SiteSearchTableTableManager(_$AppDatabase db, $SiteSearchTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SiteSearchTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SiteSearchTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SiteSearchTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> etareNumber = const Value.absent(),
                Value<String?> addressLabel = const Value.absent(),
                Value<String?> city = const Value.absent(),
                Value<String> searchText = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SiteSearchCompanion(
                siteId: siteId,
                name: name,
                etareNumber: etareNumber,
                addressLabel: addressLabel,
                city: city,
                searchText: searchText,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String name,
                Value<String?> etareNumber = const Value.absent(),
                Value<String?> addressLabel = const Value.absent(),
                Value<String?> city = const Value.absent(),
                required String searchText,
                Value<int> rowid = const Value.absent(),
              }) => SiteSearchCompanion.insert(
                siteId: siteId,
                name: name,
                etareNumber: etareNumber,
                addressLabel: addressLabel,
                city: city,
                searchText: searchText,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SiteSearchTable, SiteSearchRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SiteSearchTable,
                    SiteSearchRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SiteSearchTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SiteSearchTable,
      SiteSearchRow,
      $$SiteSearchTableFilterComposer,
      $$SiteSearchTableOrderingComposer,
      $$SiteSearchTableAnnotationComposer,
      $$SiteSearchTableCreateCompanionBuilder,
      $$SiteSearchTableUpdateCompanionBuilder,
      (
        SiteSearchRow,
        BaseReferences<_$AppDatabase, $SiteSearchTable, SiteSearchRow>,
      ),
      SiteSearchRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$LocalMetaTableTableManager get localMeta =>
      $$LocalMetaTableTableManager(_db, _db.localMeta);
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db, _db.syncState);
  $$InstalledPublicationsTableTableManager get installedPublications =>
      $$InstalledPublicationsTableTableManager(_db, _db.installedPublications);
  $$PublicationFilesTableTableManager get publicationFiles =>
      $$PublicationFilesTableTableManager(_db, _db.publicationFiles);
  $$FileBlobsTableTableManager get fileBlobs =>
      $$FileBlobsTableTableManager(_db, _db.fileBlobs);
  $$SiteDataTableTableManager get siteData =>
      $$SiteDataTableTableManager(_db, _db.siteData);
  $$SiteSearchTableTableManager get siteSearch =>
      $$SiteSearchTableTableManager(_db, _db.siteSearch);
}
