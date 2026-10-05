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
  static const VerificationMeta _requiredAppVersionMeta =
      const VerificationMeta('requiredAppVersion');
  @override
  late final GeneratedColumn<String> requiredAppVersion =
      GeneratedColumn<String>(
        'required_app_version',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _syncLeaseOwnerMeta = const VerificationMeta(
    'syncLeaseOwner',
  );
  @override
  late final GeneratedColumn<String> syncLeaseOwner = GeneratedColumn<String>(
    'sync_lease_owner',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _syncLeaseExpiresAtMeta =
      const VerificationMeta('syncLeaseExpiresAt');
  @override
  late final GeneratedColumn<DateTime> syncLeaseExpiresAt =
      GeneratedColumn<DateTime>(
        'sync_lease_expires_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
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
    requiredAppVersion,
    syncLeaseOwner,
    syncLeaseExpiresAt,
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
    if (data.containsKey('required_app_version')) {
      context.handle(
        _requiredAppVersionMeta,
        requiredAppVersion.isAcceptableOrUnknown(
          data['required_app_version']!,
          _requiredAppVersionMeta,
        ),
      );
    }
    if (data.containsKey('sync_lease_owner')) {
      context.handle(
        _syncLeaseOwnerMeta,
        syncLeaseOwner.isAcceptableOrUnknown(
          data['sync_lease_owner']!,
          _syncLeaseOwnerMeta,
        ),
      );
    }
    if (data.containsKey('sync_lease_expires_at')) {
      context.handle(
        _syncLeaseExpiresAtMeta,
        syncLeaseExpiresAt.isAcceptableOrUnknown(
          data['sync_lease_expires_at']!,
          _syncLeaseExpiresAtMeta,
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
      requiredAppVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}required_app_version'],
      ),
      syncLeaseOwner: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_lease_owner'],
      ),
      syncLeaseExpiresAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}sync_lease_expires_at'],
      ),
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

  /// Application trop ancienne pour le dernier contenu reçu (SYN-02) : version
  /// minimale exigée par le catalogue, ou chaîne vide quand un format plus
  /// récent ne dit pas laquelle. Null : application compatible.
  final String? requiredAppVersion;

  /// Synchronisation en cours (SYN-01) : moteur qui la mène (application ou
  /// tâche de fond) et fin de son bail. Une seule à la fois, même entre deux
  /// moteurs du même processus ; un bail échu est repris (arrêt brutal).
  final String? syncLeaseOwner;
  final DateTime? syncLeaseExpiresAt;
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
    this.requiredAppVersion,
    this.syncLeaseOwner,
    this.syncLeaseExpiresAt,
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
    if (!nullToAbsent || requiredAppVersion != null) {
      map['required_app_version'] = Variable<String>(requiredAppVersion);
    }
    if (!nullToAbsent || syncLeaseOwner != null) {
      map['sync_lease_owner'] = Variable<String>(syncLeaseOwner);
    }
    if (!nullToAbsent || syncLeaseExpiresAt != null) {
      map['sync_lease_expires_at'] = Variable<DateTime>(syncLeaseExpiresAt);
    }
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
      requiredAppVersion: requiredAppVersion == null && nullToAbsent
          ? const Value.absent()
          : Value(requiredAppVersion),
      syncLeaseOwner: syncLeaseOwner == null && nullToAbsent
          ? const Value.absent()
          : Value(syncLeaseOwner),
      syncLeaseExpiresAt: syncLeaseExpiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(syncLeaseExpiresAt),
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
      requiredAppVersion: serializer.fromJson<String?>(
        json['requiredAppVersion'],
      ),
      syncLeaseOwner: serializer.fromJson<String?>(json['syncLeaseOwner']),
      syncLeaseExpiresAt: serializer.fromJson<DateTime?>(
        json['syncLeaseExpiresAt'],
      ),
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
      'requiredAppVersion': serializer.toJson<String?>(requiredAppVersion),
      'syncLeaseOwner': serializer.toJson<String?>(syncLeaseOwner),
      'syncLeaseExpiresAt': serializer.toJson<DateTime?>(syncLeaseExpiresAt),
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
    Value<String?> requiredAppVersion = const Value.absent(),
    Value<String?> syncLeaseOwner = const Value.absent(),
    Value<DateTime?> syncLeaseExpiresAt = const Value.absent(),
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
    requiredAppVersion: requiredAppVersion.present
        ? requiredAppVersion.value
        : this.requiredAppVersion,
    syncLeaseOwner: syncLeaseOwner.present
        ? syncLeaseOwner.value
        : this.syncLeaseOwner,
    syncLeaseExpiresAt: syncLeaseExpiresAt.present
        ? syncLeaseExpiresAt.value
        : this.syncLeaseExpiresAt,
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
      requiredAppVersion: data.requiredAppVersion.present
          ? data.requiredAppVersion.value
          : this.requiredAppVersion,
      syncLeaseOwner: data.syncLeaseOwner.present
          ? data.syncLeaseOwner.value
          : this.syncLeaseOwner,
      syncLeaseExpiresAt: data.syncLeaseExpiresAt.present
          ? data.syncLeaseExpiresAt.value
          : this.syncLeaseExpiresAt,
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
          ..write('receiptPending: $receiptPending, ')
          ..write('requiredAppVersion: $requiredAppVersion, ')
          ..write('syncLeaseOwner: $syncLeaseOwner, ')
          ..write('syncLeaseExpiresAt: $syncLeaseExpiresAt')
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
    requiredAppVersion,
    syncLeaseOwner,
    syncLeaseExpiresAt,
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
          other.receiptPending == this.receiptPending &&
          other.requiredAppVersion == this.requiredAppVersion &&
          other.syncLeaseOwner == this.syncLeaseOwner &&
          other.syncLeaseExpiresAt == this.syncLeaseExpiresAt);
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
  final Value<String?> requiredAppVersion;
  final Value<String?> syncLeaseOwner;
  final Value<DateTime?> syncLeaseExpiresAt;
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
    this.requiredAppVersion = const Value.absent(),
    this.syncLeaseOwner = const Value.absent(),
    this.syncLeaseExpiresAt = const Value.absent(),
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
    this.requiredAppVersion = const Value.absent(),
    this.syncLeaseOwner = const Value.absent(),
    this.syncLeaseExpiresAt = const Value.absent(),
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
    Expression<String>? requiredAppVersion,
    Expression<String>? syncLeaseOwner,
    Expression<DateTime>? syncLeaseExpiresAt,
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
      if (requiredAppVersion != null)
        'required_app_version': requiredAppVersion,
      if (syncLeaseOwner != null) 'sync_lease_owner': syncLeaseOwner,
      if (syncLeaseExpiresAt != null)
        'sync_lease_expires_at': syncLeaseExpiresAt,
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
    Value<String?>? requiredAppVersion,
    Value<String?>? syncLeaseOwner,
    Value<DateTime?>? syncLeaseExpiresAt,
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
      requiredAppVersion: requiredAppVersion ?? this.requiredAppVersion,
      syncLeaseOwner: syncLeaseOwner ?? this.syncLeaseOwner,
      syncLeaseExpiresAt: syncLeaseExpiresAt ?? this.syncLeaseExpiresAt,
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
    if (requiredAppVersion.present) {
      map['required_app_version'] = Variable<String>(requiredAppVersion.value);
    }
    if (syncLeaseOwner.present) {
      map['sync_lease_owner'] = Variable<String>(syncLeaseOwner.value);
    }
    if (syncLeaseExpiresAt.present) {
      map['sync_lease_expires_at'] = Variable<DateTime>(
        syncLeaseExpiresAt.value,
      );
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
          ..write('receiptPending: $receiptPending, ')
          ..write('requiredAppVersion: $requiredAppVersion, ')
          ..write('syncLeaseOwner: $syncLeaseOwner, ')
          ..write('syncLeaseExpiresAt: $syncLeaseExpiresAt')
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

class $FieldReportsTable extends FieldReports
    with TableInfo<$FieldReportsTable, FieldReportRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FieldReportsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _clientReportIdMeta = const VerificationMeta(
    'clientReportId',
  );
  @override
  late final GeneratedColumn<String> clientReportId = GeneratedColumn<String>(
    'client_report_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _authorUserIdMeta = const VerificationMeta(
    'authorUserId',
  );
  @override
  late final GeneratedColumn<String> authorUserId = GeneratedColumn<String>(
    'author_user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tenantIdMeta = const VerificationMeta(
    'tenantId',
  );
  @override
  late final GeneratedColumn<String> tenantId = GeneratedColumn<String>(
    'tenant_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
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
  static const VerificationMeta _categoryMeta = const VerificationMeta(
    'category',
  );
  @override
  late final GeneratedColumn<String> category = GeneratedColumn<String>(
    'category',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _severityMeta = const VerificationMeta(
    'severity',
  );
  @override
  late final GeneratedColumn<String> severity = GeneratedColumn<String>(
    'severity',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _descriptionMeta = const VerificationMeta(
    'description',
  );
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
    'description',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _observedAtMeta = const VerificationMeta(
    'observedAt',
  );
  @override
  late final GeneratedColumn<String> observedAt = GeneratedColumn<String>(
    'observed_at',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _itemTypeMeta = const VerificationMeta(
    'itemType',
  );
  @override
  late final GeneratedColumn<String> itemType = GeneratedColumn<String>(
    'item_type',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _itemLabelMeta = const VerificationMeta(
    'itemLabel',
  );
  @override
  late final GeneratedColumn<String> itemLabel = GeneratedColumn<String>(
    'item_label',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _planRevisionIdMeta = const VerificationMeta(
    'planRevisionId',
  );
  @override
  late final GeneratedColumn<String> planRevisionId = GeneratedColumn<String>(
    'plan_revision_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _planTitleMeta = const VerificationMeta(
    'planTitle',
  );
  @override
  late final GeneratedColumn<String> planTitle = GeneratedColumn<String>(
    'plan_title',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _planXMeta = const VerificationMeta('planX');
  @override
  late final GeneratedColumn<double> planX = GeneratedColumn<double>(
    'plan_x',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _planYMeta = const VerificationMeta('planY');
  @override
  late final GeneratedColumn<double> planY = GeneratedColumn<double>(
    'plan_y',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _photoCountMeta = const VerificationMeta(
    'photoCount',
  );
  @override
  late final GeneratedColumn<int> photoCount = GeneratedColumn<int>(
    'photo_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _localStateMeta = const VerificationMeta(
    'localState',
  );
  @override
  late final GeneratedColumn<String> localState = GeneratedColumn<String>(
    'local_state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
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
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _nextAttemptAtMeta = const VerificationMeta(
    'nextAttemptAt',
  );
  @override
  late final GeneratedColumn<DateTime> nextAttemptAt =
      GeneratedColumn<DateTime>(
        'next_attempt_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _serverReportIdMeta = const VerificationMeta(
    'serverReportId',
  );
  @override
  late final GeneratedColumn<String> serverReportId = GeneratedColumn<String>(
    'server_report_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _contentHashMeta = const VerificationMeta(
    'contentHash',
  );
  @override
  late final GeneratedColumn<String> contentHash = GeneratedColumn<String>(
    'content_hash',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _receivedAtMeta = const VerificationMeta(
    'receivedAt',
  );
  @override
  late final GeneratedColumn<DateTime> receivedAt = GeneratedColumn<DateTime>(
    'received_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serverStatusMeta = const VerificationMeta(
    'serverStatus',
  );
  @override
  late final GeneratedColumn<String> serverStatus = GeneratedColumn<String>(
    'server_status',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _decisionCommentMeta = const VerificationMeta(
    'decisionComment',
  );
  @override
  late final GeneratedColumn<String> decisionComment = GeneratedColumn<String>(
    'decision_comment',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _decidedAtMeta = const VerificationMeta(
    'decidedAt',
  );
  @override
  late final GeneratedColumn<DateTime> decidedAt = GeneratedColumn<DateTime>(
    'decided_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _resolutionRevisionNoMeta =
      const VerificationMeta('resolutionRevisionNo');
  @override
  late final GeneratedColumn<int> resolutionRevisionNo = GeneratedColumn<int>(
    'resolution_revision_no',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _resolutionPublicationNumberMeta =
      const VerificationMeta('resolutionPublicationNumber');
  @override
  late final GeneratedColumn<int> resolutionPublicationNumber =
      GeneratedColumn<int>(
        'resolution_publication_number',
        aliasedName,
        true,
        type: DriftSqlType.int,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    clientReportId,
    authorUserId,
    tenantId,
    siteId,
    siteName,
    publicationId,
    publicationNumber,
    category,
    severity,
    description,
    observedAt,
    itemType,
    itemId,
    itemLabel,
    planRevisionId,
    planTitle,
    planX,
    planY,
    photoCount,
    localState,
    lastError,
    attempts,
    nextAttemptAt,
    serverReportId,
    contentHash,
    receivedAt,
    serverStatus,
    decisionComment,
    decidedAt,
    resolutionRevisionNo,
    resolutionPublicationNumber,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'field_report';
  @override
  VerificationContext validateIntegrity(
    Insertable<FieldReportRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_report_id')) {
      context.handle(
        _clientReportIdMeta,
        clientReportId.isAcceptableOrUnknown(
          data['client_report_id']!,
          _clientReportIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_clientReportIdMeta);
    }
    if (data.containsKey('author_user_id')) {
      context.handle(
        _authorUserIdMeta,
        authorUserId.isAcceptableOrUnknown(
          data['author_user_id']!,
          _authorUserIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_authorUserIdMeta);
    }
    if (data.containsKey('tenant_id')) {
      context.handle(
        _tenantIdMeta,
        tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tenantIdMeta);
    }
    if (data.containsKey('site_id')) {
      context.handle(
        _siteIdMeta,
        siteId.isAcceptableOrUnknown(data['site_id']!, _siteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_siteIdMeta);
    }
    if (data.containsKey('site_name')) {
      context.handle(
        _siteNameMeta,
        siteName.isAcceptableOrUnknown(data['site_name']!, _siteNameMeta),
      );
    } else if (isInserting) {
      context.missing(_siteNameMeta);
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
    if (data.containsKey('category')) {
      context.handle(
        _categoryMeta,
        category.isAcceptableOrUnknown(data['category']!, _categoryMeta),
      );
    } else if (isInserting) {
      context.missing(_categoryMeta);
    }
    if (data.containsKey('severity')) {
      context.handle(
        _severityMeta,
        severity.isAcceptableOrUnknown(data['severity']!, _severityMeta),
      );
    } else if (isInserting) {
      context.missing(_severityMeta);
    }
    if (data.containsKey('description')) {
      context.handle(
        _descriptionMeta,
        description.isAcceptableOrUnknown(
          data['description']!,
          _descriptionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_descriptionMeta);
    }
    if (data.containsKey('observed_at')) {
      context.handle(
        _observedAtMeta,
        observedAt.isAcceptableOrUnknown(data['observed_at']!, _observedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_observedAtMeta);
    }
    if (data.containsKey('item_type')) {
      context.handle(
        _itemTypeMeta,
        itemType.isAcceptableOrUnknown(data['item_type']!, _itemTypeMeta),
      );
    }
    if (data.containsKey('item_id')) {
      context.handle(
        _itemIdMeta,
        itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta),
      );
    }
    if (data.containsKey('item_label')) {
      context.handle(
        _itemLabelMeta,
        itemLabel.isAcceptableOrUnknown(data['item_label']!, _itemLabelMeta),
      );
    }
    if (data.containsKey('plan_revision_id')) {
      context.handle(
        _planRevisionIdMeta,
        planRevisionId.isAcceptableOrUnknown(
          data['plan_revision_id']!,
          _planRevisionIdMeta,
        ),
      );
    }
    if (data.containsKey('plan_title')) {
      context.handle(
        _planTitleMeta,
        planTitle.isAcceptableOrUnknown(data['plan_title']!, _planTitleMeta),
      );
    }
    if (data.containsKey('plan_x')) {
      context.handle(
        _planXMeta,
        planX.isAcceptableOrUnknown(data['plan_x']!, _planXMeta),
      );
    }
    if (data.containsKey('plan_y')) {
      context.handle(
        _planYMeta,
        planY.isAcceptableOrUnknown(data['plan_y']!, _planYMeta),
      );
    }
    if (data.containsKey('photo_count')) {
      context.handle(
        _photoCountMeta,
        photoCount.isAcceptableOrUnknown(data['photo_count']!, _photoCountMeta),
      );
    }
    if (data.containsKey('local_state')) {
      context.handle(
        _localStateMeta,
        localState.isAcceptableOrUnknown(data['local_state']!, _localStateMeta),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('next_attempt_at')) {
      context.handle(
        _nextAttemptAtMeta,
        nextAttemptAt.isAcceptableOrUnknown(
          data['next_attempt_at']!,
          _nextAttemptAtMeta,
        ),
      );
    }
    if (data.containsKey('server_report_id')) {
      context.handle(
        _serverReportIdMeta,
        serverReportId.isAcceptableOrUnknown(
          data['server_report_id']!,
          _serverReportIdMeta,
        ),
      );
    }
    if (data.containsKey('content_hash')) {
      context.handle(
        _contentHashMeta,
        contentHash.isAcceptableOrUnknown(
          data['content_hash']!,
          _contentHashMeta,
        ),
      );
    }
    if (data.containsKey('received_at')) {
      context.handle(
        _receivedAtMeta,
        receivedAt.isAcceptableOrUnknown(data['received_at']!, _receivedAtMeta),
      );
    }
    if (data.containsKey('server_status')) {
      context.handle(
        _serverStatusMeta,
        serverStatus.isAcceptableOrUnknown(
          data['server_status']!,
          _serverStatusMeta,
        ),
      );
    }
    if (data.containsKey('decision_comment')) {
      context.handle(
        _decisionCommentMeta,
        decisionComment.isAcceptableOrUnknown(
          data['decision_comment']!,
          _decisionCommentMeta,
        ),
      );
    }
    if (data.containsKey('decided_at')) {
      context.handle(
        _decidedAtMeta,
        decidedAt.isAcceptableOrUnknown(data['decided_at']!, _decidedAtMeta),
      );
    }
    if (data.containsKey('resolution_revision_no')) {
      context.handle(
        _resolutionRevisionNoMeta,
        resolutionRevisionNo.isAcceptableOrUnknown(
          data['resolution_revision_no']!,
          _resolutionRevisionNoMeta,
        ),
      );
    }
    if (data.containsKey('resolution_publication_number')) {
      context.handle(
        _resolutionPublicationNumberMeta,
        resolutionPublicationNumber.isAcceptableOrUnknown(
          data['resolution_publication_number']!,
          _resolutionPublicationNumberMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {clientReportId};
  @override
  FieldReportRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FieldReportRow(
      clientReportId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}client_report_id'],
      )!,
      authorUserId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}author_user_id'],
      )!,
      tenantId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tenant_id'],
      )!,
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      siteName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_name'],
      )!,
      publicationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}publication_id'],
      )!,
      publicationNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}publication_number'],
      )!,
      category: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category'],
      )!,
      severity: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}severity'],
      )!,
      description: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}description'],
      )!,
      observedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}observed_at'],
      )!,
      itemType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}item_type'],
      ),
      itemId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}item_id'],
      ),
      itemLabel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}item_label'],
      ),
      planRevisionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}plan_revision_id'],
      ),
      planTitle: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}plan_title'],
      ),
      planX: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}plan_x'],
      ),
      planY: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}plan_y'],
      ),
      photoCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}photo_count'],
      )!,
      localState: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}local_state'],
      )!,
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      nextAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}next_attempt_at'],
      ),
      serverReportId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_report_id'],
      ),
      contentHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content_hash'],
      ),
      receivedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}received_at'],
      ),
      serverStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_status'],
      ),
      decisionComment: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}decision_comment'],
      ),
      decidedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}decided_at'],
      ),
      resolutionRevisionNo: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}resolution_revision_no'],
      ),
      resolutionPublicationNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}resolution_publication_number'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $FieldReportsTable createAlias(String alias) {
    return $FieldReportsTable(attachedDatabase, alias);
  }
}

class FieldReportRow extends DataClass implements Insertable<FieldReportRow> {
  /// Identifiant attribué hors ligne : clé d'idempotence côté serveur.
  final String clientReportId;

  /// Sujet du jeton de l'auteur : seul lui voit et envoie ce signalement.
  final String authorUserId;
  final String tenantId;
  final String siteId;
  final String siteName;

  /// Version publiée consultée lors du constat.
  final String publicationId;
  final int publicationNumber;
  final String category;
  final String severity;
  final String description;

  /// Heure du constat, texte ISO 8601 exact (le corps renvoyé doit être identique).
  final String observedAt;
  final String? itemType;
  final String? itemId;
  final String? itemLabel;
  final String? planRevisionId;
  final String? planTitle;
  final double? planX;
  final double? planY;
  final int photoCount;

  /// `pending` (à transmettre ou photos en cours), `sent` (accusé et photos
  /// transmises), `error` (refusé : à supprimer ou à corriger).
  final String localState;
  final String? lastError;
  final int attempts;
  final DateTime? nextAttemptAt;
  final String? serverReportId;
  final String? contentHash;
  final DateTime? receivedAt;

  /// État d'instruction côté serveur (`new`, `triaged`, `resolved`, `rejected`).
  final String? serverStatus;
  final String? decisionComment;
  final DateTime? decidedAt;
  final int? resolutionRevisionNo;
  final int? resolutionPublicationNumber;
  final DateTime createdAt;
  const FieldReportRow({
    required this.clientReportId,
    required this.authorUserId,
    required this.tenantId,
    required this.siteId,
    required this.siteName,
    required this.publicationId,
    required this.publicationNumber,
    required this.category,
    required this.severity,
    required this.description,
    required this.observedAt,
    this.itemType,
    this.itemId,
    this.itemLabel,
    this.planRevisionId,
    this.planTitle,
    this.planX,
    this.planY,
    required this.photoCount,
    required this.localState,
    this.lastError,
    required this.attempts,
    this.nextAttemptAt,
    this.serverReportId,
    this.contentHash,
    this.receivedAt,
    this.serverStatus,
    this.decisionComment,
    this.decidedAt,
    this.resolutionRevisionNo,
    this.resolutionPublicationNumber,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['client_report_id'] = Variable<String>(clientReportId);
    map['author_user_id'] = Variable<String>(authorUserId);
    map['tenant_id'] = Variable<String>(tenantId);
    map['site_id'] = Variable<String>(siteId);
    map['site_name'] = Variable<String>(siteName);
    map['publication_id'] = Variable<String>(publicationId);
    map['publication_number'] = Variable<int>(publicationNumber);
    map['category'] = Variable<String>(category);
    map['severity'] = Variable<String>(severity);
    map['description'] = Variable<String>(description);
    map['observed_at'] = Variable<String>(observedAt);
    if (!nullToAbsent || itemType != null) {
      map['item_type'] = Variable<String>(itemType);
    }
    if (!nullToAbsent || itemId != null) {
      map['item_id'] = Variable<String>(itemId);
    }
    if (!nullToAbsent || itemLabel != null) {
      map['item_label'] = Variable<String>(itemLabel);
    }
    if (!nullToAbsent || planRevisionId != null) {
      map['plan_revision_id'] = Variable<String>(planRevisionId);
    }
    if (!nullToAbsent || planTitle != null) {
      map['plan_title'] = Variable<String>(planTitle);
    }
    if (!nullToAbsent || planX != null) {
      map['plan_x'] = Variable<double>(planX);
    }
    if (!nullToAbsent || planY != null) {
      map['plan_y'] = Variable<double>(planY);
    }
    map['photo_count'] = Variable<int>(photoCount);
    map['local_state'] = Variable<String>(localState);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || nextAttemptAt != null) {
      map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt);
    }
    if (!nullToAbsent || serverReportId != null) {
      map['server_report_id'] = Variable<String>(serverReportId);
    }
    if (!nullToAbsent || contentHash != null) {
      map['content_hash'] = Variable<String>(contentHash);
    }
    if (!nullToAbsent || receivedAt != null) {
      map['received_at'] = Variable<DateTime>(receivedAt);
    }
    if (!nullToAbsent || serverStatus != null) {
      map['server_status'] = Variable<String>(serverStatus);
    }
    if (!nullToAbsent || decisionComment != null) {
      map['decision_comment'] = Variable<String>(decisionComment);
    }
    if (!nullToAbsent || decidedAt != null) {
      map['decided_at'] = Variable<DateTime>(decidedAt);
    }
    if (!nullToAbsent || resolutionRevisionNo != null) {
      map['resolution_revision_no'] = Variable<int>(resolutionRevisionNo);
    }
    if (!nullToAbsent || resolutionPublicationNumber != null) {
      map['resolution_publication_number'] = Variable<int>(
        resolutionPublicationNumber,
      );
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  FieldReportsCompanion toCompanion(bool nullToAbsent) {
    return FieldReportsCompanion(
      clientReportId: Value(clientReportId),
      authorUserId: Value(authorUserId),
      tenantId: Value(tenantId),
      siteId: Value(siteId),
      siteName: Value(siteName),
      publicationId: Value(publicationId),
      publicationNumber: Value(publicationNumber),
      category: Value(category),
      severity: Value(severity),
      description: Value(description),
      observedAt: Value(observedAt),
      itemType: itemType == null && nullToAbsent
          ? const Value.absent()
          : Value(itemType),
      itemId: itemId == null && nullToAbsent
          ? const Value.absent()
          : Value(itemId),
      itemLabel: itemLabel == null && nullToAbsent
          ? const Value.absent()
          : Value(itemLabel),
      planRevisionId: planRevisionId == null && nullToAbsent
          ? const Value.absent()
          : Value(planRevisionId),
      planTitle: planTitle == null && nullToAbsent
          ? const Value.absent()
          : Value(planTitle),
      planX: planX == null && nullToAbsent
          ? const Value.absent()
          : Value(planX),
      planY: planY == null && nullToAbsent
          ? const Value.absent()
          : Value(planY),
      photoCount: Value(photoCount),
      localState: Value(localState),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      attempts: Value(attempts),
      nextAttemptAt: nextAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(nextAttemptAt),
      serverReportId: serverReportId == null && nullToAbsent
          ? const Value.absent()
          : Value(serverReportId),
      contentHash: contentHash == null && nullToAbsent
          ? const Value.absent()
          : Value(contentHash),
      receivedAt: receivedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(receivedAt),
      serverStatus: serverStatus == null && nullToAbsent
          ? const Value.absent()
          : Value(serverStatus),
      decisionComment: decisionComment == null && nullToAbsent
          ? const Value.absent()
          : Value(decisionComment),
      decidedAt: decidedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(decidedAt),
      resolutionRevisionNo: resolutionRevisionNo == null && nullToAbsent
          ? const Value.absent()
          : Value(resolutionRevisionNo),
      resolutionPublicationNumber:
          resolutionPublicationNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(resolutionPublicationNumber),
      createdAt: Value(createdAt),
    );
  }

  factory FieldReportRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FieldReportRow(
      clientReportId: serializer.fromJson<String>(json['clientReportId']),
      authorUserId: serializer.fromJson<String>(json['authorUserId']),
      tenantId: serializer.fromJson<String>(json['tenantId']),
      siteId: serializer.fromJson<String>(json['siteId']),
      siteName: serializer.fromJson<String>(json['siteName']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      publicationNumber: serializer.fromJson<int>(json['publicationNumber']),
      category: serializer.fromJson<String>(json['category']),
      severity: serializer.fromJson<String>(json['severity']),
      description: serializer.fromJson<String>(json['description']),
      observedAt: serializer.fromJson<String>(json['observedAt']),
      itemType: serializer.fromJson<String?>(json['itemType']),
      itemId: serializer.fromJson<String?>(json['itemId']),
      itemLabel: serializer.fromJson<String?>(json['itemLabel']),
      planRevisionId: serializer.fromJson<String?>(json['planRevisionId']),
      planTitle: serializer.fromJson<String?>(json['planTitle']),
      planX: serializer.fromJson<double?>(json['planX']),
      planY: serializer.fromJson<double?>(json['planY']),
      photoCount: serializer.fromJson<int>(json['photoCount']),
      localState: serializer.fromJson<String>(json['localState']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      attempts: serializer.fromJson<int>(json['attempts']),
      nextAttemptAt: serializer.fromJson<DateTime?>(json['nextAttemptAt']),
      serverReportId: serializer.fromJson<String?>(json['serverReportId']),
      contentHash: serializer.fromJson<String?>(json['contentHash']),
      receivedAt: serializer.fromJson<DateTime?>(json['receivedAt']),
      serverStatus: serializer.fromJson<String?>(json['serverStatus']),
      decisionComment: serializer.fromJson<String?>(json['decisionComment']),
      decidedAt: serializer.fromJson<DateTime?>(json['decidedAt']),
      resolutionRevisionNo: serializer.fromJson<int?>(
        json['resolutionRevisionNo'],
      ),
      resolutionPublicationNumber: serializer.fromJson<int?>(
        json['resolutionPublicationNumber'],
      ),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'clientReportId': serializer.toJson<String>(clientReportId),
      'authorUserId': serializer.toJson<String>(authorUserId),
      'tenantId': serializer.toJson<String>(tenantId),
      'siteId': serializer.toJson<String>(siteId),
      'siteName': serializer.toJson<String>(siteName),
      'publicationId': serializer.toJson<String>(publicationId),
      'publicationNumber': serializer.toJson<int>(publicationNumber),
      'category': serializer.toJson<String>(category),
      'severity': serializer.toJson<String>(severity),
      'description': serializer.toJson<String>(description),
      'observedAt': serializer.toJson<String>(observedAt),
      'itemType': serializer.toJson<String?>(itemType),
      'itemId': serializer.toJson<String?>(itemId),
      'itemLabel': serializer.toJson<String?>(itemLabel),
      'planRevisionId': serializer.toJson<String?>(planRevisionId),
      'planTitle': serializer.toJson<String?>(planTitle),
      'planX': serializer.toJson<double?>(planX),
      'planY': serializer.toJson<double?>(planY),
      'photoCount': serializer.toJson<int>(photoCount),
      'localState': serializer.toJson<String>(localState),
      'lastError': serializer.toJson<String?>(lastError),
      'attempts': serializer.toJson<int>(attempts),
      'nextAttemptAt': serializer.toJson<DateTime?>(nextAttemptAt),
      'serverReportId': serializer.toJson<String?>(serverReportId),
      'contentHash': serializer.toJson<String?>(contentHash),
      'receivedAt': serializer.toJson<DateTime?>(receivedAt),
      'serverStatus': serializer.toJson<String?>(serverStatus),
      'decisionComment': serializer.toJson<String?>(decisionComment),
      'decidedAt': serializer.toJson<DateTime?>(decidedAt),
      'resolutionRevisionNo': serializer.toJson<int?>(resolutionRevisionNo),
      'resolutionPublicationNumber': serializer.toJson<int?>(
        resolutionPublicationNumber,
      ),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  FieldReportRow copyWith({
    String? clientReportId,
    String? authorUserId,
    String? tenantId,
    String? siteId,
    String? siteName,
    String? publicationId,
    int? publicationNumber,
    String? category,
    String? severity,
    String? description,
    String? observedAt,
    Value<String?> itemType = const Value.absent(),
    Value<String?> itemId = const Value.absent(),
    Value<String?> itemLabel = const Value.absent(),
    Value<String?> planRevisionId = const Value.absent(),
    Value<String?> planTitle = const Value.absent(),
    Value<double?> planX = const Value.absent(),
    Value<double?> planY = const Value.absent(),
    int? photoCount,
    String? localState,
    Value<String?> lastError = const Value.absent(),
    int? attempts,
    Value<DateTime?> nextAttemptAt = const Value.absent(),
    Value<String?> serverReportId = const Value.absent(),
    Value<String?> contentHash = const Value.absent(),
    Value<DateTime?> receivedAt = const Value.absent(),
    Value<String?> serverStatus = const Value.absent(),
    Value<String?> decisionComment = const Value.absent(),
    Value<DateTime?> decidedAt = const Value.absent(),
    Value<int?> resolutionRevisionNo = const Value.absent(),
    Value<int?> resolutionPublicationNumber = const Value.absent(),
    DateTime? createdAt,
  }) => FieldReportRow(
    clientReportId: clientReportId ?? this.clientReportId,
    authorUserId: authorUserId ?? this.authorUserId,
    tenantId: tenantId ?? this.tenantId,
    siteId: siteId ?? this.siteId,
    siteName: siteName ?? this.siteName,
    publicationId: publicationId ?? this.publicationId,
    publicationNumber: publicationNumber ?? this.publicationNumber,
    category: category ?? this.category,
    severity: severity ?? this.severity,
    description: description ?? this.description,
    observedAt: observedAt ?? this.observedAt,
    itemType: itemType.present ? itemType.value : this.itemType,
    itemId: itemId.present ? itemId.value : this.itemId,
    itemLabel: itemLabel.present ? itemLabel.value : this.itemLabel,
    planRevisionId: planRevisionId.present
        ? planRevisionId.value
        : this.planRevisionId,
    planTitle: planTitle.present ? planTitle.value : this.planTitle,
    planX: planX.present ? planX.value : this.planX,
    planY: planY.present ? planY.value : this.planY,
    photoCount: photoCount ?? this.photoCount,
    localState: localState ?? this.localState,
    lastError: lastError.present ? lastError.value : this.lastError,
    attempts: attempts ?? this.attempts,
    nextAttemptAt: nextAttemptAt.present
        ? nextAttemptAt.value
        : this.nextAttemptAt,
    serverReportId: serverReportId.present
        ? serverReportId.value
        : this.serverReportId,
    contentHash: contentHash.present ? contentHash.value : this.contentHash,
    receivedAt: receivedAt.present ? receivedAt.value : this.receivedAt,
    serverStatus: serverStatus.present ? serverStatus.value : this.serverStatus,
    decisionComment: decisionComment.present
        ? decisionComment.value
        : this.decisionComment,
    decidedAt: decidedAt.present ? decidedAt.value : this.decidedAt,
    resolutionRevisionNo: resolutionRevisionNo.present
        ? resolutionRevisionNo.value
        : this.resolutionRevisionNo,
    resolutionPublicationNumber: resolutionPublicationNumber.present
        ? resolutionPublicationNumber.value
        : this.resolutionPublicationNumber,
    createdAt: createdAt ?? this.createdAt,
  );
  FieldReportRow copyWithCompanion(FieldReportsCompanion data) {
    return FieldReportRow(
      clientReportId: data.clientReportId.present
          ? data.clientReportId.value
          : this.clientReportId,
      authorUserId: data.authorUserId.present
          ? data.authorUserId.value
          : this.authorUserId,
      tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      siteName: data.siteName.present ? data.siteName.value : this.siteName,
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      publicationNumber: data.publicationNumber.present
          ? data.publicationNumber.value
          : this.publicationNumber,
      category: data.category.present ? data.category.value : this.category,
      severity: data.severity.present ? data.severity.value : this.severity,
      description: data.description.present
          ? data.description.value
          : this.description,
      observedAt: data.observedAt.present
          ? data.observedAt.value
          : this.observedAt,
      itemType: data.itemType.present ? data.itemType.value : this.itemType,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      itemLabel: data.itemLabel.present ? data.itemLabel.value : this.itemLabel,
      planRevisionId: data.planRevisionId.present
          ? data.planRevisionId.value
          : this.planRevisionId,
      planTitle: data.planTitle.present ? data.planTitle.value : this.planTitle,
      planX: data.planX.present ? data.planX.value : this.planX,
      planY: data.planY.present ? data.planY.value : this.planY,
      photoCount: data.photoCount.present
          ? data.photoCount.value
          : this.photoCount,
      localState: data.localState.present
          ? data.localState.value
          : this.localState,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      nextAttemptAt: data.nextAttemptAt.present
          ? data.nextAttemptAt.value
          : this.nextAttemptAt,
      serverReportId: data.serverReportId.present
          ? data.serverReportId.value
          : this.serverReportId,
      contentHash: data.contentHash.present
          ? data.contentHash.value
          : this.contentHash,
      receivedAt: data.receivedAt.present
          ? data.receivedAt.value
          : this.receivedAt,
      serverStatus: data.serverStatus.present
          ? data.serverStatus.value
          : this.serverStatus,
      decisionComment: data.decisionComment.present
          ? data.decisionComment.value
          : this.decisionComment,
      decidedAt: data.decidedAt.present ? data.decidedAt.value : this.decidedAt,
      resolutionRevisionNo: data.resolutionRevisionNo.present
          ? data.resolutionRevisionNo.value
          : this.resolutionRevisionNo,
      resolutionPublicationNumber: data.resolutionPublicationNumber.present
          ? data.resolutionPublicationNumber.value
          : this.resolutionPublicationNumber,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FieldReportRow(')
          ..write('clientReportId: $clientReportId, ')
          ..write('authorUserId: $authorUserId, ')
          ..write('tenantId: $tenantId, ')
          ..write('siteId: $siteId, ')
          ..write('siteName: $siteName, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('category: $category, ')
          ..write('severity: $severity, ')
          ..write('description: $description, ')
          ..write('observedAt: $observedAt, ')
          ..write('itemType: $itemType, ')
          ..write('itemId: $itemId, ')
          ..write('itemLabel: $itemLabel, ')
          ..write('planRevisionId: $planRevisionId, ')
          ..write('planTitle: $planTitle, ')
          ..write('planX: $planX, ')
          ..write('planY: $planY, ')
          ..write('photoCount: $photoCount, ')
          ..write('localState: $localState, ')
          ..write('lastError: $lastError, ')
          ..write('attempts: $attempts, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('serverReportId: $serverReportId, ')
          ..write('contentHash: $contentHash, ')
          ..write('receivedAt: $receivedAt, ')
          ..write('serverStatus: $serverStatus, ')
          ..write('decisionComment: $decisionComment, ')
          ..write('decidedAt: $decidedAt, ')
          ..write('resolutionRevisionNo: $resolutionRevisionNo, ')
          ..write('resolutionPublicationNumber: $resolutionPublicationNumber, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    clientReportId,
    authorUserId,
    tenantId,
    siteId,
    siteName,
    publicationId,
    publicationNumber,
    category,
    severity,
    description,
    observedAt,
    itemType,
    itemId,
    itemLabel,
    planRevisionId,
    planTitle,
    planX,
    planY,
    photoCount,
    localState,
    lastError,
    attempts,
    nextAttemptAt,
    serverReportId,
    contentHash,
    receivedAt,
    serverStatus,
    decisionComment,
    decidedAt,
    resolutionRevisionNo,
    resolutionPublicationNumber,
    createdAt,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FieldReportRow &&
          other.clientReportId == this.clientReportId &&
          other.authorUserId == this.authorUserId &&
          other.tenantId == this.tenantId &&
          other.siteId == this.siteId &&
          other.siteName == this.siteName &&
          other.publicationId == this.publicationId &&
          other.publicationNumber == this.publicationNumber &&
          other.category == this.category &&
          other.severity == this.severity &&
          other.description == this.description &&
          other.observedAt == this.observedAt &&
          other.itemType == this.itemType &&
          other.itemId == this.itemId &&
          other.itemLabel == this.itemLabel &&
          other.planRevisionId == this.planRevisionId &&
          other.planTitle == this.planTitle &&
          other.planX == this.planX &&
          other.planY == this.planY &&
          other.photoCount == this.photoCount &&
          other.localState == this.localState &&
          other.lastError == this.lastError &&
          other.attempts == this.attempts &&
          other.nextAttemptAt == this.nextAttemptAt &&
          other.serverReportId == this.serverReportId &&
          other.contentHash == this.contentHash &&
          other.receivedAt == this.receivedAt &&
          other.serverStatus == this.serverStatus &&
          other.decisionComment == this.decisionComment &&
          other.decidedAt == this.decidedAt &&
          other.resolutionRevisionNo == this.resolutionRevisionNo &&
          other.resolutionPublicationNumber ==
              this.resolutionPublicationNumber &&
          other.createdAt == this.createdAt);
}

class FieldReportsCompanion extends UpdateCompanion<FieldReportRow> {
  final Value<String> clientReportId;
  final Value<String> authorUserId;
  final Value<String> tenantId;
  final Value<String> siteId;
  final Value<String> siteName;
  final Value<String> publicationId;
  final Value<int> publicationNumber;
  final Value<String> category;
  final Value<String> severity;
  final Value<String> description;
  final Value<String> observedAt;
  final Value<String?> itemType;
  final Value<String?> itemId;
  final Value<String?> itemLabel;
  final Value<String?> planRevisionId;
  final Value<String?> planTitle;
  final Value<double?> planX;
  final Value<double?> planY;
  final Value<int> photoCount;
  final Value<String> localState;
  final Value<String?> lastError;
  final Value<int> attempts;
  final Value<DateTime?> nextAttemptAt;
  final Value<String?> serverReportId;
  final Value<String?> contentHash;
  final Value<DateTime?> receivedAt;
  final Value<String?> serverStatus;
  final Value<String?> decisionComment;
  final Value<DateTime?> decidedAt;
  final Value<int?> resolutionRevisionNo;
  final Value<int?> resolutionPublicationNumber;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const FieldReportsCompanion({
    this.clientReportId = const Value.absent(),
    this.authorUserId = const Value.absent(),
    this.tenantId = const Value.absent(),
    this.siteId = const Value.absent(),
    this.siteName = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.publicationNumber = const Value.absent(),
    this.category = const Value.absent(),
    this.severity = const Value.absent(),
    this.description = const Value.absent(),
    this.observedAt = const Value.absent(),
    this.itemType = const Value.absent(),
    this.itemId = const Value.absent(),
    this.itemLabel = const Value.absent(),
    this.planRevisionId = const Value.absent(),
    this.planTitle = const Value.absent(),
    this.planX = const Value.absent(),
    this.planY = const Value.absent(),
    this.photoCount = const Value.absent(),
    this.localState = const Value.absent(),
    this.lastError = const Value.absent(),
    this.attempts = const Value.absent(),
    this.nextAttemptAt = const Value.absent(),
    this.serverReportId = const Value.absent(),
    this.contentHash = const Value.absent(),
    this.receivedAt = const Value.absent(),
    this.serverStatus = const Value.absent(),
    this.decisionComment = const Value.absent(),
    this.decidedAt = const Value.absent(),
    this.resolutionRevisionNo = const Value.absent(),
    this.resolutionPublicationNumber = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FieldReportsCompanion.insert({
    required String clientReportId,
    required String authorUserId,
    required String tenantId,
    required String siteId,
    required String siteName,
    required String publicationId,
    required int publicationNumber,
    required String category,
    required String severity,
    required String description,
    required String observedAt,
    this.itemType = const Value.absent(),
    this.itemId = const Value.absent(),
    this.itemLabel = const Value.absent(),
    this.planRevisionId = const Value.absent(),
    this.planTitle = const Value.absent(),
    this.planX = const Value.absent(),
    this.planY = const Value.absent(),
    this.photoCount = const Value.absent(),
    this.localState = const Value.absent(),
    this.lastError = const Value.absent(),
    this.attempts = const Value.absent(),
    this.nextAttemptAt = const Value.absent(),
    this.serverReportId = const Value.absent(),
    this.contentHash = const Value.absent(),
    this.receivedAt = const Value.absent(),
    this.serverStatus = const Value.absent(),
    this.decisionComment = const Value.absent(),
    this.decidedAt = const Value.absent(),
    this.resolutionRevisionNo = const Value.absent(),
    this.resolutionPublicationNumber = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : clientReportId = Value(clientReportId),
       authorUserId = Value(authorUserId),
       tenantId = Value(tenantId),
       siteId = Value(siteId),
       siteName = Value(siteName),
       publicationId = Value(publicationId),
       publicationNumber = Value(publicationNumber),
       category = Value(category),
       severity = Value(severity),
       description = Value(description),
       observedAt = Value(observedAt),
       createdAt = Value(createdAt);
  static Insertable<FieldReportRow> custom({
    Expression<String>? clientReportId,
    Expression<String>? authorUserId,
    Expression<String>? tenantId,
    Expression<String>? siteId,
    Expression<String>? siteName,
    Expression<String>? publicationId,
    Expression<int>? publicationNumber,
    Expression<String>? category,
    Expression<String>? severity,
    Expression<String>? description,
    Expression<String>? observedAt,
    Expression<String>? itemType,
    Expression<String>? itemId,
    Expression<String>? itemLabel,
    Expression<String>? planRevisionId,
    Expression<String>? planTitle,
    Expression<double>? planX,
    Expression<double>? planY,
    Expression<int>? photoCount,
    Expression<String>? localState,
    Expression<String>? lastError,
    Expression<int>? attempts,
    Expression<DateTime>? nextAttemptAt,
    Expression<String>? serverReportId,
    Expression<String>? contentHash,
    Expression<DateTime>? receivedAt,
    Expression<String>? serverStatus,
    Expression<String>? decisionComment,
    Expression<DateTime>? decidedAt,
    Expression<int>? resolutionRevisionNo,
    Expression<int>? resolutionPublicationNumber,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (clientReportId != null) 'client_report_id': clientReportId,
      if (authorUserId != null) 'author_user_id': authorUserId,
      if (tenantId != null) 'tenant_id': tenantId,
      if (siteId != null) 'site_id': siteId,
      if (siteName != null) 'site_name': siteName,
      if (publicationId != null) 'publication_id': publicationId,
      if (publicationNumber != null) 'publication_number': publicationNumber,
      if (category != null) 'category': category,
      if (severity != null) 'severity': severity,
      if (description != null) 'description': description,
      if (observedAt != null) 'observed_at': observedAt,
      if (itemType != null) 'item_type': itemType,
      if (itemId != null) 'item_id': itemId,
      if (itemLabel != null) 'item_label': itemLabel,
      if (planRevisionId != null) 'plan_revision_id': planRevisionId,
      if (planTitle != null) 'plan_title': planTitle,
      if (planX != null) 'plan_x': planX,
      if (planY != null) 'plan_y': planY,
      if (photoCount != null) 'photo_count': photoCount,
      if (localState != null) 'local_state': localState,
      if (lastError != null) 'last_error': lastError,
      if (attempts != null) 'attempts': attempts,
      if (nextAttemptAt != null) 'next_attempt_at': nextAttemptAt,
      if (serverReportId != null) 'server_report_id': serverReportId,
      if (contentHash != null) 'content_hash': contentHash,
      if (receivedAt != null) 'received_at': receivedAt,
      if (serverStatus != null) 'server_status': serverStatus,
      if (decisionComment != null) 'decision_comment': decisionComment,
      if (decidedAt != null) 'decided_at': decidedAt,
      if (resolutionRevisionNo != null)
        'resolution_revision_no': resolutionRevisionNo,
      if (resolutionPublicationNumber != null)
        'resolution_publication_number': resolutionPublicationNumber,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FieldReportsCompanion copyWith({
    Value<String>? clientReportId,
    Value<String>? authorUserId,
    Value<String>? tenantId,
    Value<String>? siteId,
    Value<String>? siteName,
    Value<String>? publicationId,
    Value<int>? publicationNumber,
    Value<String>? category,
    Value<String>? severity,
    Value<String>? description,
    Value<String>? observedAt,
    Value<String?>? itemType,
    Value<String?>? itemId,
    Value<String?>? itemLabel,
    Value<String?>? planRevisionId,
    Value<String?>? planTitle,
    Value<double?>? planX,
    Value<double?>? planY,
    Value<int>? photoCount,
    Value<String>? localState,
    Value<String?>? lastError,
    Value<int>? attempts,
    Value<DateTime?>? nextAttemptAt,
    Value<String?>? serverReportId,
    Value<String?>? contentHash,
    Value<DateTime?>? receivedAt,
    Value<String?>? serverStatus,
    Value<String?>? decisionComment,
    Value<DateTime?>? decidedAt,
    Value<int?>? resolutionRevisionNo,
    Value<int?>? resolutionPublicationNumber,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return FieldReportsCompanion(
      clientReportId: clientReportId ?? this.clientReportId,
      authorUserId: authorUserId ?? this.authorUserId,
      tenantId: tenantId ?? this.tenantId,
      siteId: siteId ?? this.siteId,
      siteName: siteName ?? this.siteName,
      publicationId: publicationId ?? this.publicationId,
      publicationNumber: publicationNumber ?? this.publicationNumber,
      category: category ?? this.category,
      severity: severity ?? this.severity,
      description: description ?? this.description,
      observedAt: observedAt ?? this.observedAt,
      itemType: itemType ?? this.itemType,
      itemId: itemId ?? this.itemId,
      itemLabel: itemLabel ?? this.itemLabel,
      planRevisionId: planRevisionId ?? this.planRevisionId,
      planTitle: planTitle ?? this.planTitle,
      planX: planX ?? this.planX,
      planY: planY ?? this.planY,
      photoCount: photoCount ?? this.photoCount,
      localState: localState ?? this.localState,
      lastError: lastError ?? this.lastError,
      attempts: attempts ?? this.attempts,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      serverReportId: serverReportId ?? this.serverReportId,
      contentHash: contentHash ?? this.contentHash,
      receivedAt: receivedAt ?? this.receivedAt,
      serverStatus: serverStatus ?? this.serverStatus,
      decisionComment: decisionComment ?? this.decisionComment,
      decidedAt: decidedAt ?? this.decidedAt,
      resolutionRevisionNo: resolutionRevisionNo ?? this.resolutionRevisionNo,
      resolutionPublicationNumber:
          resolutionPublicationNumber ?? this.resolutionPublicationNumber,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (clientReportId.present) {
      map['client_report_id'] = Variable<String>(clientReportId.value);
    }
    if (authorUserId.present) {
      map['author_user_id'] = Variable<String>(authorUserId.value);
    }
    if (tenantId.present) {
      map['tenant_id'] = Variable<String>(tenantId.value);
    }
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (siteName.present) {
      map['site_name'] = Variable<String>(siteName.value);
    }
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (publicationNumber.present) {
      map['publication_number'] = Variable<int>(publicationNumber.value);
    }
    if (category.present) {
      map['category'] = Variable<String>(category.value);
    }
    if (severity.present) {
      map['severity'] = Variable<String>(severity.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (observedAt.present) {
      map['observed_at'] = Variable<String>(observedAt.value);
    }
    if (itemType.present) {
      map['item_type'] = Variable<String>(itemType.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<String>(itemId.value);
    }
    if (itemLabel.present) {
      map['item_label'] = Variable<String>(itemLabel.value);
    }
    if (planRevisionId.present) {
      map['plan_revision_id'] = Variable<String>(planRevisionId.value);
    }
    if (planTitle.present) {
      map['plan_title'] = Variable<String>(planTitle.value);
    }
    if (planX.present) {
      map['plan_x'] = Variable<double>(planX.value);
    }
    if (planY.present) {
      map['plan_y'] = Variable<double>(planY.value);
    }
    if (photoCount.present) {
      map['photo_count'] = Variable<int>(photoCount.value);
    }
    if (localState.present) {
      map['local_state'] = Variable<String>(localState.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (nextAttemptAt.present) {
      map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt.value);
    }
    if (serverReportId.present) {
      map['server_report_id'] = Variable<String>(serverReportId.value);
    }
    if (contentHash.present) {
      map['content_hash'] = Variable<String>(contentHash.value);
    }
    if (receivedAt.present) {
      map['received_at'] = Variable<DateTime>(receivedAt.value);
    }
    if (serverStatus.present) {
      map['server_status'] = Variable<String>(serverStatus.value);
    }
    if (decisionComment.present) {
      map['decision_comment'] = Variable<String>(decisionComment.value);
    }
    if (decidedAt.present) {
      map['decided_at'] = Variable<DateTime>(decidedAt.value);
    }
    if (resolutionRevisionNo.present) {
      map['resolution_revision_no'] = Variable<int>(resolutionRevisionNo.value);
    }
    if (resolutionPublicationNumber.present) {
      map['resolution_publication_number'] = Variable<int>(
        resolutionPublicationNumber.value,
      );
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FieldReportsCompanion(')
          ..write('clientReportId: $clientReportId, ')
          ..write('authorUserId: $authorUserId, ')
          ..write('tenantId: $tenantId, ')
          ..write('siteId: $siteId, ')
          ..write('siteName: $siteName, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('category: $category, ')
          ..write('severity: $severity, ')
          ..write('description: $description, ')
          ..write('observedAt: $observedAt, ')
          ..write('itemType: $itemType, ')
          ..write('itemId: $itemId, ')
          ..write('itemLabel: $itemLabel, ')
          ..write('planRevisionId: $planRevisionId, ')
          ..write('planTitle: $planTitle, ')
          ..write('planX: $planX, ')
          ..write('planY: $planY, ')
          ..write('photoCount: $photoCount, ')
          ..write('localState: $localState, ')
          ..write('lastError: $lastError, ')
          ..write('attempts: $attempts, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('serverReportId: $serverReportId, ')
          ..write('contentHash: $contentHash, ')
          ..write('receivedAt: $receivedAt, ')
          ..write('serverStatus: $serverStatus, ')
          ..write('decisionComment: $decisionComment, ')
          ..write('decidedAt: $decidedAt, ')
          ..write('resolutionRevisionNo: $resolutionRevisionNo, ')
          ..write('resolutionPublicationNumber: $resolutionPublicationNumber, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FieldReportPhotosTable extends FieldReportPhotos
    with TableInfo<$FieldReportPhotosTable, FieldReportPhotoRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FieldReportPhotosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _clientReportIdMeta = const VerificationMeta(
    'clientReportId',
  );
  @override
  late final GeneratedColumn<String> clientReportId = GeneratedColumn<String>(
    'client_report_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES field_report (client_report_id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _positionMeta = const VerificationMeta(
    'position',
  );
  @override
  late final GeneratedColumn<int> position = GeneratedColumn<int>(
    'position',
    aliasedName,
    false,
    type: DriftSqlType.int,
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
  static const VerificationMeta _mimeTypeMeta = const VerificationMeta(
    'mimeType',
  );
  @override
  late final GeneratedColumn<String> mimeType = GeneratedColumn<String>(
    'mime_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _filenameMeta = const VerificationMeta(
    'filename',
  );
  @override
  late final GeneratedColumn<String> filename = GeneratedColumn<String>(
    'filename',
    aliasedName,
    false,
    type: DriftSqlType.string,
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
  static const VerificationMeta _uploadedMeta = const VerificationMeta(
    'uploaded',
  );
  @override
  late final GeneratedColumn<bool> uploaded = GeneratedColumn<bool>(
    'uploaded',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("uploaded" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    clientReportId,
    position,
    sha256,
    mimeType,
    filename,
    content,
    uploaded,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'field_report_photo';
  @override
  VerificationContext validateIntegrity(
    Insertable<FieldReportPhotoRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_report_id')) {
      context.handle(
        _clientReportIdMeta,
        clientReportId.isAcceptableOrUnknown(
          data['client_report_id']!,
          _clientReportIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_clientReportIdMeta);
    }
    if (data.containsKey('position')) {
      context.handle(
        _positionMeta,
        position.isAcceptableOrUnknown(data['position']!, _positionMeta),
      );
    } else if (isInserting) {
      context.missing(_positionMeta);
    }
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('mime_type')) {
      context.handle(
        _mimeTypeMeta,
        mimeType.isAcceptableOrUnknown(data['mime_type']!, _mimeTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_mimeTypeMeta);
    }
    if (data.containsKey('filename')) {
      context.handle(
        _filenameMeta,
        filename.isAcceptableOrUnknown(data['filename']!, _filenameMeta),
      );
    } else if (isInserting) {
      context.missing(_filenameMeta);
    }
    if (data.containsKey('content')) {
      context.handle(
        _contentMeta,
        content.isAcceptableOrUnknown(data['content']!, _contentMeta),
      );
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('uploaded')) {
      context.handle(
        _uploadedMeta,
        uploaded.isAcceptableOrUnknown(data['uploaded']!, _uploadedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {clientReportId, position};
  @override
  FieldReportPhotoRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FieldReportPhotoRow(
      clientReportId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}client_report_id'],
      )!,
      position: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}position'],
      )!,
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      mimeType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}mime_type'],
      )!,
      filename: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}filename'],
      )!,
      content: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}content'],
      )!,
      uploaded: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}uploaded'],
      )!,
    );
  }

  @override
  $FieldReportPhotosTable createAlias(String alias) {
    return $FieldReportPhotosTable(attachedDatabase, alias);
  }
}

class FieldReportPhotoRow extends DataClass
    implements Insertable<FieldReportPhotoRow> {
  final String clientReportId;
  final int position;
  final String sha256;
  final String mimeType;
  final String filename;
  final Uint8List content;
  final bool uploaded;
  const FieldReportPhotoRow({
    required this.clientReportId,
    required this.position,
    required this.sha256,
    required this.mimeType,
    required this.filename,
    required this.content,
    required this.uploaded,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['client_report_id'] = Variable<String>(clientReportId);
    map['position'] = Variable<int>(position);
    map['sha256'] = Variable<String>(sha256);
    map['mime_type'] = Variable<String>(mimeType);
    map['filename'] = Variable<String>(filename);
    map['content'] = Variable<Uint8List>(content);
    map['uploaded'] = Variable<bool>(uploaded);
    return map;
  }

  FieldReportPhotosCompanion toCompanion(bool nullToAbsent) {
    return FieldReportPhotosCompanion(
      clientReportId: Value(clientReportId),
      position: Value(position),
      sha256: Value(sha256),
      mimeType: Value(mimeType),
      filename: Value(filename),
      content: Value(content),
      uploaded: Value(uploaded),
    );
  }

  factory FieldReportPhotoRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FieldReportPhotoRow(
      clientReportId: serializer.fromJson<String>(json['clientReportId']),
      position: serializer.fromJson<int>(json['position']),
      sha256: serializer.fromJson<String>(json['sha256']),
      mimeType: serializer.fromJson<String>(json['mimeType']),
      filename: serializer.fromJson<String>(json['filename']),
      content: serializer.fromJson<Uint8List>(json['content']),
      uploaded: serializer.fromJson<bool>(json['uploaded']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'clientReportId': serializer.toJson<String>(clientReportId),
      'position': serializer.toJson<int>(position),
      'sha256': serializer.toJson<String>(sha256),
      'mimeType': serializer.toJson<String>(mimeType),
      'filename': serializer.toJson<String>(filename),
      'content': serializer.toJson<Uint8List>(content),
      'uploaded': serializer.toJson<bool>(uploaded),
    };
  }

  FieldReportPhotoRow copyWith({
    String? clientReportId,
    int? position,
    String? sha256,
    String? mimeType,
    String? filename,
    Uint8List? content,
    bool? uploaded,
  }) => FieldReportPhotoRow(
    clientReportId: clientReportId ?? this.clientReportId,
    position: position ?? this.position,
    sha256: sha256 ?? this.sha256,
    mimeType: mimeType ?? this.mimeType,
    filename: filename ?? this.filename,
    content: content ?? this.content,
    uploaded: uploaded ?? this.uploaded,
  );
  FieldReportPhotoRow copyWithCompanion(FieldReportPhotosCompanion data) {
    return FieldReportPhotoRow(
      clientReportId: data.clientReportId.present
          ? data.clientReportId.value
          : this.clientReportId,
      position: data.position.present ? data.position.value : this.position,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      mimeType: data.mimeType.present ? data.mimeType.value : this.mimeType,
      filename: data.filename.present ? data.filename.value : this.filename,
      content: data.content.present ? data.content.value : this.content,
      uploaded: data.uploaded.present ? data.uploaded.value : this.uploaded,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FieldReportPhotoRow(')
          ..write('clientReportId: $clientReportId, ')
          ..write('position: $position, ')
          ..write('sha256: $sha256, ')
          ..write('mimeType: $mimeType, ')
          ..write('filename: $filename, ')
          ..write('content: $content, ')
          ..write('uploaded: $uploaded')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    clientReportId,
    position,
    sha256,
    mimeType,
    filename,
    $driftBlobEquality.hash(content),
    uploaded,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FieldReportPhotoRow &&
          other.clientReportId == this.clientReportId &&
          other.position == this.position &&
          other.sha256 == this.sha256 &&
          other.mimeType == this.mimeType &&
          other.filename == this.filename &&
          $driftBlobEquality.equals(other.content, this.content) &&
          other.uploaded == this.uploaded);
}

class FieldReportPhotosCompanion extends UpdateCompanion<FieldReportPhotoRow> {
  final Value<String> clientReportId;
  final Value<int> position;
  final Value<String> sha256;
  final Value<String> mimeType;
  final Value<String> filename;
  final Value<Uint8List> content;
  final Value<bool> uploaded;
  final Value<int> rowid;
  const FieldReportPhotosCompanion({
    this.clientReportId = const Value.absent(),
    this.position = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.mimeType = const Value.absent(),
    this.filename = const Value.absent(),
    this.content = const Value.absent(),
    this.uploaded = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FieldReportPhotosCompanion.insert({
    required String clientReportId,
    required int position,
    required String sha256,
    required String mimeType,
    required String filename,
    required Uint8List content,
    this.uploaded = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : clientReportId = Value(clientReportId),
       position = Value(position),
       sha256 = Value(sha256),
       mimeType = Value(mimeType),
       filename = Value(filename),
       content = Value(content);
  static Insertable<FieldReportPhotoRow> custom({
    Expression<String>? clientReportId,
    Expression<int>? position,
    Expression<String>? sha256,
    Expression<String>? mimeType,
    Expression<String>? filename,
    Expression<Uint8List>? content,
    Expression<bool>? uploaded,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (clientReportId != null) 'client_report_id': clientReportId,
      if (position != null) 'position': position,
      if (sha256 != null) 'sha256': sha256,
      if (mimeType != null) 'mime_type': mimeType,
      if (filename != null) 'filename': filename,
      if (content != null) 'content': content,
      if (uploaded != null) 'uploaded': uploaded,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FieldReportPhotosCompanion copyWith({
    Value<String>? clientReportId,
    Value<int>? position,
    Value<String>? sha256,
    Value<String>? mimeType,
    Value<String>? filename,
    Value<Uint8List>? content,
    Value<bool>? uploaded,
    Value<int>? rowid,
  }) {
    return FieldReportPhotosCompanion(
      clientReportId: clientReportId ?? this.clientReportId,
      position: position ?? this.position,
      sha256: sha256 ?? this.sha256,
      mimeType: mimeType ?? this.mimeType,
      filename: filename ?? this.filename,
      content: content ?? this.content,
      uploaded: uploaded ?? this.uploaded,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (clientReportId.present) {
      map['client_report_id'] = Variable<String>(clientReportId.value);
    }
    if (position.present) {
      map['position'] = Variable<int>(position.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (mimeType.present) {
      map['mime_type'] = Variable<String>(mimeType.value);
    }
    if (filename.present) {
      map['filename'] = Variable<String>(filename.value);
    }
    if (content.present) {
      map['content'] = Variable<Uint8List>(content.value);
    }
    if (uploaded.present) {
      map['uploaded'] = Variable<bool>(uploaded.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FieldReportPhotosCompanion(')
          ..write('clientReportId: $clientReportId, ')
          ..write('position: $position, ')
          ..write('sha256: $sha256, ')
          ..write('mimeType: $mimeType, ')
          ..write('filename: $filename, ')
          ..write('content: $content, ')
          ..write('uploaded: $uploaded, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OnDemandSitesTable extends OnDemandSites
    with TableInfo<$OnDemandSitesTable, OnDemandSiteRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OnDemandSitesTable(this.attachedDatabase, [this._alias]);
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
    publicationId,
    publicationNumber,
    manifestHash,
    siteName,
    etareNumber,
    sizeBytes,
    publishedAt,
    searchText,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'on_demand_sites';
  @override
  VerificationContext validateIntegrity(
    Insertable<OnDemandSiteRow> instance, {
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
    if (data.containsKey('site_name')) {
      context.handle(
        _siteNameMeta,
        siteName.isAcceptableOrUnknown(data['site_name']!, _siteNameMeta),
      );
    } else if (isInserting) {
      context.missing(_siteNameMeta);
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
    if (data.containsKey('size_bytes')) {
      context.handle(
        _sizeBytesMeta,
        sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
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
  OnDemandSiteRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OnDemandSiteRow(
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
      siteName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_name'],
      )!,
      etareNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}etare_number'],
      ),
      sizeBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}size_bytes'],
      )!,
      publishedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}published_at'],
      )!,
      searchText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}search_text'],
      )!,
    );
  }

  @override
  $OnDemandSitesTable createAlias(String alias) {
    return $OnDemandSitesTable(attachedDatabase, alias);
  }
}

class OnDemandSiteRow extends DataClass implements Insertable<OnDemandSiteRow> {
  final String siteId;
  final String publicationId;
  final int publicationNumber;
  final String manifestHash;
  final String siteName;
  final String? etareNumber;

  /// Taille des fichiers obligatoires annoncée par le catalogue.
  final int sizeBytes;
  final DateTime publishedAt;

  /// Nom et numéro ETARE normalisés pour la recherche locale.
  final String searchText;
  const OnDemandSiteRow({
    required this.siteId,
    required this.publicationId,
    required this.publicationNumber,
    required this.manifestHash,
    required this.siteName,
    this.etareNumber,
    required this.sizeBytes,
    required this.publishedAt,
    required this.searchText,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['publication_id'] = Variable<String>(publicationId);
    map['publication_number'] = Variable<int>(publicationNumber);
    map['manifest_hash'] = Variable<String>(manifestHash);
    map['site_name'] = Variable<String>(siteName);
    if (!nullToAbsent || etareNumber != null) {
      map['etare_number'] = Variable<String>(etareNumber);
    }
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['published_at'] = Variable<DateTime>(publishedAt);
    map['search_text'] = Variable<String>(searchText);
    return map;
  }

  OnDemandSitesCompanion toCompanion(bool nullToAbsent) {
    return OnDemandSitesCompanion(
      siteId: Value(siteId),
      publicationId: Value(publicationId),
      publicationNumber: Value(publicationNumber),
      manifestHash: Value(manifestHash),
      siteName: Value(siteName),
      etareNumber: etareNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(etareNumber),
      sizeBytes: Value(sizeBytes),
      publishedAt: Value(publishedAt),
      searchText: Value(searchText),
    );
  }

  factory OnDemandSiteRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OnDemandSiteRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      publicationNumber: serializer.fromJson<int>(json['publicationNumber']),
      manifestHash: serializer.fromJson<String>(json['manifestHash']),
      siteName: serializer.fromJson<String>(json['siteName']),
      etareNumber: serializer.fromJson<String?>(json['etareNumber']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      publishedAt: serializer.fromJson<DateTime>(json['publishedAt']),
      searchText: serializer.fromJson<String>(json['searchText']),
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
      'siteName': serializer.toJson<String>(siteName),
      'etareNumber': serializer.toJson<String?>(etareNumber),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'publishedAt': serializer.toJson<DateTime>(publishedAt),
      'searchText': serializer.toJson<String>(searchText),
    };
  }

  OnDemandSiteRow copyWith({
    String? siteId,
    String? publicationId,
    int? publicationNumber,
    String? manifestHash,
    String? siteName,
    Value<String?> etareNumber = const Value.absent(),
    int? sizeBytes,
    DateTime? publishedAt,
    String? searchText,
  }) => OnDemandSiteRow(
    siteId: siteId ?? this.siteId,
    publicationId: publicationId ?? this.publicationId,
    publicationNumber: publicationNumber ?? this.publicationNumber,
    manifestHash: manifestHash ?? this.manifestHash,
    siteName: siteName ?? this.siteName,
    etareNumber: etareNumber.present ? etareNumber.value : this.etareNumber,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    publishedAt: publishedAt ?? this.publishedAt,
    searchText: searchText ?? this.searchText,
  );
  OnDemandSiteRow copyWithCompanion(OnDemandSitesCompanion data) {
    return OnDemandSiteRow(
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
      siteName: data.siteName.present ? data.siteName.value : this.siteName,
      etareNumber: data.etareNumber.present
          ? data.etareNumber.value
          : this.etareNumber,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      publishedAt: data.publishedAt.present
          ? data.publishedAt.value
          : this.publishedAt,
      searchText: data.searchText.present
          ? data.searchText.value
          : this.searchText,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OnDemandSiteRow(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('siteName: $siteName, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('searchText: $searchText')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    siteId,
    publicationId,
    publicationNumber,
    manifestHash,
    siteName,
    etareNumber,
    sizeBytes,
    publishedAt,
    searchText,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OnDemandSiteRow &&
          other.siteId == this.siteId &&
          other.publicationId == this.publicationId &&
          other.publicationNumber == this.publicationNumber &&
          other.manifestHash == this.manifestHash &&
          other.siteName == this.siteName &&
          other.etareNumber == this.etareNumber &&
          other.sizeBytes == this.sizeBytes &&
          other.publishedAt == this.publishedAt &&
          other.searchText == this.searchText);
}

class OnDemandSitesCompanion extends UpdateCompanion<OnDemandSiteRow> {
  final Value<String> siteId;
  final Value<String> publicationId;
  final Value<int> publicationNumber;
  final Value<String> manifestHash;
  final Value<String> siteName;
  final Value<String?> etareNumber;
  final Value<int> sizeBytes;
  final Value<DateTime> publishedAt;
  final Value<String> searchText;
  final Value<int> rowid;
  const OnDemandSitesCompanion({
    this.siteId = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.publicationNumber = const Value.absent(),
    this.manifestHash = const Value.absent(),
    this.siteName = const Value.absent(),
    this.etareNumber = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.publishedAt = const Value.absent(),
    this.searchText = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OnDemandSitesCompanion.insert({
    required String siteId,
    required String publicationId,
    required int publicationNumber,
    required String manifestHash,
    required String siteName,
    this.etareNumber = const Value.absent(),
    required int sizeBytes,
    required DateTime publishedAt,
    required String searchText,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       publicationId = Value(publicationId),
       publicationNumber = Value(publicationNumber),
       manifestHash = Value(manifestHash),
       siteName = Value(siteName),
       sizeBytes = Value(sizeBytes),
       publishedAt = Value(publishedAt),
       searchText = Value(searchText);
  static Insertable<OnDemandSiteRow> custom({
    Expression<String>? siteId,
    Expression<String>? publicationId,
    Expression<int>? publicationNumber,
    Expression<String>? manifestHash,
    Expression<String>? siteName,
    Expression<String>? etareNumber,
    Expression<int>? sizeBytes,
    Expression<DateTime>? publishedAt,
    Expression<String>? searchText,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (publicationId != null) 'publication_id': publicationId,
      if (publicationNumber != null) 'publication_number': publicationNumber,
      if (manifestHash != null) 'manifest_hash': manifestHash,
      if (siteName != null) 'site_name': siteName,
      if (etareNumber != null) 'etare_number': etareNumber,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (publishedAt != null) 'published_at': publishedAt,
      if (searchText != null) 'search_text': searchText,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OnDemandSitesCompanion copyWith({
    Value<String>? siteId,
    Value<String>? publicationId,
    Value<int>? publicationNumber,
    Value<String>? manifestHash,
    Value<String>? siteName,
    Value<String?>? etareNumber,
    Value<int>? sizeBytes,
    Value<DateTime>? publishedAt,
    Value<String>? searchText,
    Value<int>? rowid,
  }) {
    return OnDemandSitesCompanion(
      siteId: siteId ?? this.siteId,
      publicationId: publicationId ?? this.publicationId,
      publicationNumber: publicationNumber ?? this.publicationNumber,
      manifestHash: manifestHash ?? this.manifestHash,
      siteName: siteName ?? this.siteName,
      etareNumber: etareNumber ?? this.etareNumber,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      publishedAt: publishedAt ?? this.publishedAt,
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
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (publicationNumber.present) {
      map['publication_number'] = Variable<int>(publicationNumber.value);
    }
    if (manifestHash.present) {
      map['manifest_hash'] = Variable<String>(manifestHash.value);
    }
    if (siteName.present) {
      map['site_name'] = Variable<String>(siteName.value);
    }
    if (etareNumber.present) {
      map['etare_number'] = Variable<String>(etareNumber.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (publishedAt.present) {
      map['published_at'] = Variable<DateTime>(publishedAt.value);
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
    return (StringBuffer('OnDemandSitesCompanion(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('siteName: $siteName, ')
          ..write('etareNumber: $etareNumber, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('searchText: $searchText, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SensitiveSitesTable extends SensitiveSites
    with TableInfo<$SensitiveSitesTable, SensitiveSiteRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SensitiveSitesTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
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
  static const VerificationMeta _openedAtMeta = const VerificationMeta(
    'openedAt',
  );
  @override
  late final GeneratedColumn<DateTime> openedAt = GeneratedColumn<DateTime>(
    'opened_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _expiresAtMeta = const VerificationMeta(
    'expiresAt',
  );
  @override
  late final GeneratedColumn<DateTime> expiresAt = GeneratedColumn<DateTime>(
    'expires_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _wrappedKeyMeta = const VerificationMeta(
    'wrappedKey',
  );
  @override
  late final GeneratedColumn<Uint8List> wrappedKey = GeneratedColumn<Uint8List>(
    'wrapped_key',
    aliasedName,
    false,
    type: DriftSqlType.blob,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataCipherMeta = const VerificationMeta(
    'dataCipher',
  );
  @override
  late final GeneratedColumn<Uint8List> dataCipher = GeneratedColumn<Uint8List>(
    'data_cipher',
    aliasedName,
    false,
    type: DriftSqlType.blob,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    siteId,
    publicationId,
    publicationNumber,
    userId,
    siteName,
    openedAt,
    expiresAt,
    wrappedKey,
    dataCipher,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sensitive_sites';
  @override
  VerificationContext validateIntegrity(
    Insertable<SensitiveSiteRow> instance, {
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
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('site_name')) {
      context.handle(
        _siteNameMeta,
        siteName.isAcceptableOrUnknown(data['site_name']!, _siteNameMeta),
      );
    } else if (isInserting) {
      context.missing(_siteNameMeta);
    }
    if (data.containsKey('opened_at')) {
      context.handle(
        _openedAtMeta,
        openedAt.isAcceptableOrUnknown(data['opened_at']!, _openedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_openedAtMeta);
    }
    if (data.containsKey('expires_at')) {
      context.handle(
        _expiresAtMeta,
        expiresAt.isAcceptableOrUnknown(data['expires_at']!, _expiresAtMeta),
      );
    } else if (isInserting) {
      context.missing(_expiresAtMeta);
    }
    if (data.containsKey('wrapped_key')) {
      context.handle(
        _wrappedKeyMeta,
        wrappedKey.isAcceptableOrUnknown(data['wrapped_key']!, _wrappedKeyMeta),
      );
    } else if (isInserting) {
      context.missing(_wrappedKeyMeta);
    }
    if (data.containsKey('data_cipher')) {
      context.handle(
        _dataCipherMeta,
        dataCipher.isAcceptableOrUnknown(data['data_cipher']!, _dataCipherMeta),
      );
    } else if (isInserting) {
      context.missing(_dataCipherMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siteId};
  @override
  SensitiveSiteRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SensitiveSiteRow(
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
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      siteName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_name'],
      )!,
      openedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}opened_at'],
      )!,
      expiresAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}expires_at'],
      )!,
      wrappedKey: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}wrapped_key'],
      )!,
      dataCipher: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}data_cipher'],
      )!,
    );
  }

  @override
  $SensitiveSitesTable createAlias(String alias) {
    return $SensitiveSitesTable(attachedDatabase, alias);
  }
}

class SensitiveSiteRow extends DataClass
    implements Insertable<SensitiveSiteRow> {
  final String siteId;
  final String publicationId;
  final int publicationNumber;

  /// Agent qui l'a ouvert (sujet de son jeton) : lui seul peut le rouvrir.
  final String userId;
  final String siteName;
  final DateTime openedAt;
  final DateTime expiresAt;

  /// Clé du site chiffrée par la clé du code (nonce, chiffré, étiquette).
  final Uint8List wrappedKey;

  /// Fichier de données vérifié (data/site.json), chiffré par la clé du site.
  final Uint8List dataCipher;
  const SensitiveSiteRow({
    required this.siteId,
    required this.publicationId,
    required this.publicationNumber,
    required this.userId,
    required this.siteName,
    required this.openedAt,
    required this.expiresAt,
    required this.wrappedKey,
    required this.dataCipher,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['publication_id'] = Variable<String>(publicationId);
    map['publication_number'] = Variable<int>(publicationNumber);
    map['user_id'] = Variable<String>(userId);
    map['site_name'] = Variable<String>(siteName);
    map['opened_at'] = Variable<DateTime>(openedAt);
    map['expires_at'] = Variable<DateTime>(expiresAt);
    map['wrapped_key'] = Variable<Uint8List>(wrappedKey);
    map['data_cipher'] = Variable<Uint8List>(dataCipher);
    return map;
  }

  SensitiveSitesCompanion toCompanion(bool nullToAbsent) {
    return SensitiveSitesCompanion(
      siteId: Value(siteId),
      publicationId: Value(publicationId),
      publicationNumber: Value(publicationNumber),
      userId: Value(userId),
      siteName: Value(siteName),
      openedAt: Value(openedAt),
      expiresAt: Value(expiresAt),
      wrappedKey: Value(wrappedKey),
      dataCipher: Value(dataCipher),
    );
  }

  factory SensitiveSiteRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SensitiveSiteRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      publicationNumber: serializer.fromJson<int>(json['publicationNumber']),
      userId: serializer.fromJson<String>(json['userId']),
      siteName: serializer.fromJson<String>(json['siteName']),
      openedAt: serializer.fromJson<DateTime>(json['openedAt']),
      expiresAt: serializer.fromJson<DateTime>(json['expiresAt']),
      wrappedKey: serializer.fromJson<Uint8List>(json['wrappedKey']),
      dataCipher: serializer.fromJson<Uint8List>(json['dataCipher']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siteId': serializer.toJson<String>(siteId),
      'publicationId': serializer.toJson<String>(publicationId),
      'publicationNumber': serializer.toJson<int>(publicationNumber),
      'userId': serializer.toJson<String>(userId),
      'siteName': serializer.toJson<String>(siteName),
      'openedAt': serializer.toJson<DateTime>(openedAt),
      'expiresAt': serializer.toJson<DateTime>(expiresAt),
      'wrappedKey': serializer.toJson<Uint8List>(wrappedKey),
      'dataCipher': serializer.toJson<Uint8List>(dataCipher),
    };
  }

  SensitiveSiteRow copyWith({
    String? siteId,
    String? publicationId,
    int? publicationNumber,
    String? userId,
    String? siteName,
    DateTime? openedAt,
    DateTime? expiresAt,
    Uint8List? wrappedKey,
    Uint8List? dataCipher,
  }) => SensitiveSiteRow(
    siteId: siteId ?? this.siteId,
    publicationId: publicationId ?? this.publicationId,
    publicationNumber: publicationNumber ?? this.publicationNumber,
    userId: userId ?? this.userId,
    siteName: siteName ?? this.siteName,
    openedAt: openedAt ?? this.openedAt,
    expiresAt: expiresAt ?? this.expiresAt,
    wrappedKey: wrappedKey ?? this.wrappedKey,
    dataCipher: dataCipher ?? this.dataCipher,
  );
  SensitiveSiteRow copyWithCompanion(SensitiveSitesCompanion data) {
    return SensitiveSiteRow(
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      publicationNumber: data.publicationNumber.present
          ? data.publicationNumber.value
          : this.publicationNumber,
      userId: data.userId.present ? data.userId.value : this.userId,
      siteName: data.siteName.present ? data.siteName.value : this.siteName,
      openedAt: data.openedAt.present ? data.openedAt.value : this.openedAt,
      expiresAt: data.expiresAt.present ? data.expiresAt.value : this.expiresAt,
      wrappedKey: data.wrappedKey.present
          ? data.wrappedKey.value
          : this.wrappedKey,
      dataCipher: data.dataCipher.present
          ? data.dataCipher.value
          : this.dataCipher,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SensitiveSiteRow(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('userId: $userId, ')
          ..write('siteName: $siteName, ')
          ..write('openedAt: $openedAt, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('wrappedKey: $wrappedKey, ')
          ..write('dataCipher: $dataCipher')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    siteId,
    publicationId,
    publicationNumber,
    userId,
    siteName,
    openedAt,
    expiresAt,
    $driftBlobEquality.hash(wrappedKey),
    $driftBlobEquality.hash(dataCipher),
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SensitiveSiteRow &&
          other.siteId == this.siteId &&
          other.publicationId == this.publicationId &&
          other.publicationNumber == this.publicationNumber &&
          other.userId == this.userId &&
          other.siteName == this.siteName &&
          other.openedAt == this.openedAt &&
          other.expiresAt == this.expiresAt &&
          $driftBlobEquality.equals(other.wrappedKey, this.wrappedKey) &&
          $driftBlobEquality.equals(other.dataCipher, this.dataCipher));
}

class SensitiveSitesCompanion extends UpdateCompanion<SensitiveSiteRow> {
  final Value<String> siteId;
  final Value<String> publicationId;
  final Value<int> publicationNumber;
  final Value<String> userId;
  final Value<String> siteName;
  final Value<DateTime> openedAt;
  final Value<DateTime> expiresAt;
  final Value<Uint8List> wrappedKey;
  final Value<Uint8List> dataCipher;
  final Value<int> rowid;
  const SensitiveSitesCompanion({
    this.siteId = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.publicationNumber = const Value.absent(),
    this.userId = const Value.absent(),
    this.siteName = const Value.absent(),
    this.openedAt = const Value.absent(),
    this.expiresAt = const Value.absent(),
    this.wrappedKey = const Value.absent(),
    this.dataCipher = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SensitiveSitesCompanion.insert({
    required String siteId,
    required String publicationId,
    required int publicationNumber,
    required String userId,
    required String siteName,
    required DateTime openedAt,
    required DateTime expiresAt,
    required Uint8List wrappedKey,
    required Uint8List dataCipher,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       publicationId = Value(publicationId),
       publicationNumber = Value(publicationNumber),
       userId = Value(userId),
       siteName = Value(siteName),
       openedAt = Value(openedAt),
       expiresAt = Value(expiresAt),
       wrappedKey = Value(wrappedKey),
       dataCipher = Value(dataCipher);
  static Insertable<SensitiveSiteRow> custom({
    Expression<String>? siteId,
    Expression<String>? publicationId,
    Expression<int>? publicationNumber,
    Expression<String>? userId,
    Expression<String>? siteName,
    Expression<DateTime>? openedAt,
    Expression<DateTime>? expiresAt,
    Expression<Uint8List>? wrappedKey,
    Expression<Uint8List>? dataCipher,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (publicationId != null) 'publication_id': publicationId,
      if (publicationNumber != null) 'publication_number': publicationNumber,
      if (userId != null) 'user_id': userId,
      if (siteName != null) 'site_name': siteName,
      if (openedAt != null) 'opened_at': openedAt,
      if (expiresAt != null) 'expires_at': expiresAt,
      if (wrappedKey != null) 'wrapped_key': wrappedKey,
      if (dataCipher != null) 'data_cipher': dataCipher,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SensitiveSitesCompanion copyWith({
    Value<String>? siteId,
    Value<String>? publicationId,
    Value<int>? publicationNumber,
    Value<String>? userId,
    Value<String>? siteName,
    Value<DateTime>? openedAt,
    Value<DateTime>? expiresAt,
    Value<Uint8List>? wrappedKey,
    Value<Uint8List>? dataCipher,
    Value<int>? rowid,
  }) {
    return SensitiveSitesCompanion(
      siteId: siteId ?? this.siteId,
      publicationId: publicationId ?? this.publicationId,
      publicationNumber: publicationNumber ?? this.publicationNumber,
      userId: userId ?? this.userId,
      siteName: siteName ?? this.siteName,
      openedAt: openedAt ?? this.openedAt,
      expiresAt: expiresAt ?? this.expiresAt,
      wrappedKey: wrappedKey ?? this.wrappedKey,
      dataCipher: dataCipher ?? this.dataCipher,
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
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (siteName.present) {
      map['site_name'] = Variable<String>(siteName.value);
    }
    if (openedAt.present) {
      map['opened_at'] = Variable<DateTime>(openedAt.value);
    }
    if (expiresAt.present) {
      map['expires_at'] = Variable<DateTime>(expiresAt.value);
    }
    if (wrappedKey.present) {
      map['wrapped_key'] = Variable<Uint8List>(wrappedKey.value);
    }
    if (dataCipher.present) {
      map['data_cipher'] = Variable<Uint8List>(dataCipher.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SensitiveSitesCompanion(')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('publicationNumber: $publicationNumber, ')
          ..write('userId: $userId, ')
          ..write('siteName: $siteName, ')
          ..write('openedAt: $openedAt, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('wrappedKey: $wrappedKey, ')
          ..write('dataCipher: $dataCipher, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SensitiveFilesTable extends SensitiveFiles
    with TableInfo<$SensitiveFilesTable, SensitiveFileRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SensitiveFilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
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
  static const VerificationMeta _pathMeta = const VerificationMeta('path');
  @override
  late final GeneratedColumn<String> path = GeneratedColumn<String>(
    'path',
    aliasedName,
    false,
    type: DriftSqlType.string,
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
  static const VerificationMeta _cipherMeta = const VerificationMeta('cipher');
  @override
  late final GeneratedColumn<Uint8List> cipher = GeneratedColumn<Uint8List>(
    'cipher',
    aliasedName,
    false,
    type: DriftSqlType.blob,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    siteId,
    sha256,
    path,
    mediaType,
    cipher,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sensitive_files';
  @override
  VerificationContext validateIntegrity(
    Insertable<SensitiveFileRow> instance, {
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
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('path')) {
      context.handle(
        _pathMeta,
        path.isAcceptableOrUnknown(data['path']!, _pathMeta),
      );
    } else if (isInserting) {
      context.missing(_pathMeta);
    }
    if (data.containsKey('media_type')) {
      context.handle(
        _mediaTypeMeta,
        mediaType.isAcceptableOrUnknown(data['media_type']!, _mediaTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_mediaTypeMeta);
    }
    if (data.containsKey('cipher')) {
      context.handle(
        _cipherMeta,
        cipher.isAcceptableOrUnknown(data['cipher']!, _cipherMeta),
      );
    } else if (isInserting) {
      context.missing(_cipherMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {siteId, sha256};
  @override
  SensitiveFileRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SensitiveFileRow(
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      path: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}path'],
      )!,
      mediaType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}media_type'],
      )!,
      cipher: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}cipher'],
      )!,
    );
  }

  @override
  $SensitiveFilesTable createAlias(String alias) {
    return $SensitiveFilesTable(attachedDatabase, alias);
  }
}

class SensitiveFileRow extends DataClass
    implements Insertable<SensitiveFileRow> {
  final String siteId;
  final String sha256;
  final String path;
  final String mediaType;
  final Uint8List cipher;
  const SensitiveFileRow({
    required this.siteId,
    required this.sha256,
    required this.path,
    required this.mediaType,
    required this.cipher,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['site_id'] = Variable<String>(siteId);
    map['sha256'] = Variable<String>(sha256);
    map['path'] = Variable<String>(path);
    map['media_type'] = Variable<String>(mediaType);
    map['cipher'] = Variable<Uint8List>(cipher);
    return map;
  }

  SensitiveFilesCompanion toCompanion(bool nullToAbsent) {
    return SensitiveFilesCompanion(
      siteId: Value(siteId),
      sha256: Value(sha256),
      path: Value(path),
      mediaType: Value(mediaType),
      cipher: Value(cipher),
    );
  }

  factory SensitiveFileRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SensitiveFileRow(
      siteId: serializer.fromJson<String>(json['siteId']),
      sha256: serializer.fromJson<String>(json['sha256']),
      path: serializer.fromJson<String>(json['path']),
      mediaType: serializer.fromJson<String>(json['mediaType']),
      cipher: serializer.fromJson<Uint8List>(json['cipher']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'siteId': serializer.toJson<String>(siteId),
      'sha256': serializer.toJson<String>(sha256),
      'path': serializer.toJson<String>(path),
      'mediaType': serializer.toJson<String>(mediaType),
      'cipher': serializer.toJson<Uint8List>(cipher),
    };
  }

  SensitiveFileRow copyWith({
    String? siteId,
    String? sha256,
    String? path,
    String? mediaType,
    Uint8List? cipher,
  }) => SensitiveFileRow(
    siteId: siteId ?? this.siteId,
    sha256: sha256 ?? this.sha256,
    path: path ?? this.path,
    mediaType: mediaType ?? this.mediaType,
    cipher: cipher ?? this.cipher,
  );
  SensitiveFileRow copyWithCompanion(SensitiveFilesCompanion data) {
    return SensitiveFileRow(
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      path: data.path.present ? data.path.value : this.path,
      mediaType: data.mediaType.present ? data.mediaType.value : this.mediaType,
      cipher: data.cipher.present ? data.cipher.value : this.cipher,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SensitiveFileRow(')
          ..write('siteId: $siteId, ')
          ..write('sha256: $sha256, ')
          ..write('path: $path, ')
          ..write('mediaType: $mediaType, ')
          ..write('cipher: $cipher')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    siteId,
    sha256,
    path,
    mediaType,
    $driftBlobEquality.hash(cipher),
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SensitiveFileRow &&
          other.siteId == this.siteId &&
          other.sha256 == this.sha256 &&
          other.path == this.path &&
          other.mediaType == this.mediaType &&
          $driftBlobEquality.equals(other.cipher, this.cipher));
}

class SensitiveFilesCompanion extends UpdateCompanion<SensitiveFileRow> {
  final Value<String> siteId;
  final Value<String> sha256;
  final Value<String> path;
  final Value<String> mediaType;
  final Value<Uint8List> cipher;
  final Value<int> rowid;
  const SensitiveFilesCompanion({
    this.siteId = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.path = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.cipher = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SensitiveFilesCompanion.insert({
    required String siteId,
    required String sha256,
    required String path,
    required String mediaType,
    required Uint8List cipher,
    this.rowid = const Value.absent(),
  }) : siteId = Value(siteId),
       sha256 = Value(sha256),
       path = Value(path),
       mediaType = Value(mediaType),
       cipher = Value(cipher);
  static Insertable<SensitiveFileRow> custom({
    Expression<String>? siteId,
    Expression<String>? sha256,
    Expression<String>? path,
    Expression<String>? mediaType,
    Expression<Uint8List>? cipher,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (siteId != null) 'site_id': siteId,
      if (sha256 != null) 'sha256': sha256,
      if (path != null) 'path': path,
      if (mediaType != null) 'media_type': mediaType,
      if (cipher != null) 'cipher': cipher,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SensitiveFilesCompanion copyWith({
    Value<String>? siteId,
    Value<String>? sha256,
    Value<String>? path,
    Value<String>? mediaType,
    Value<Uint8List>? cipher,
    Value<int>? rowid,
  }) {
    return SensitiveFilesCompanion(
      siteId: siteId ?? this.siteId,
      sha256: sha256 ?? this.sha256,
      path: path ?? this.path,
      mediaType: mediaType ?? this.mediaType,
      cipher: cipher ?? this.cipher,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (path.present) {
      map['path'] = Variable<String>(path.value);
    }
    if (mediaType.present) {
      map['media_type'] = Variable<String>(mediaType.value);
    }
    if (cipher.present) {
      map['cipher'] = Variable<Uint8List>(cipher.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SensitiveFilesCompanion(')
          ..write('siteId: $siteId, ')
          ..write('sha256: $sha256, ')
          ..write('path: $path, ')
          ..write('mediaType: $mediaType, ')
          ..write('cipher: $cipher, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AccessEventOutboxTable extends AccessEventOutbox
    with TableInfo<$AccessEventOutboxTable, AccessEventRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AccessEventOutboxTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _clientEventIdMeta = const VerificationMeta(
    'clientEventId',
  );
  @override
  late final GeneratedColumn<String> clientEventId = GeneratedColumn<String>(
    'client_event_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
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
  static const VerificationMeta _occurredAtMeta = const VerificationMeta(
    'occurredAt',
  );
  @override
  late final GeneratedColumn<DateTime> occurredAt = GeneratedColumn<DateTime>(
    'occurred_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    clientEventId,
    userId,
    siteId,
    publicationId,
    occurredAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'access_event_outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<AccessEventRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_event_id')) {
      context.handle(
        _clientEventIdMeta,
        clientEventId.isAcceptableOrUnknown(
          data['client_event_id']!,
          _clientEventIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_clientEventIdMeta);
    }
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
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
    if (data.containsKey('occurred_at')) {
      context.handle(
        _occurredAtMeta,
        occurredAt.isAcceptableOrUnknown(data['occurred_at']!, _occurredAtMeta),
      );
    } else if (isInserting) {
      context.missing(_occurredAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {clientEventId};
  @override
  AccessEventRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AccessEventRow(
      clientEventId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}client_event_id'],
      )!,
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      siteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}site_id'],
      )!,
      publicationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}publication_id'],
      )!,
      occurredAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}occurred_at'],
      )!,
    );
  }

  @override
  $AccessEventOutboxTable createAlias(String alias) {
    return $AccessEventOutboxTable(attachedDatabase, alias);
  }
}

class AccessEventRow extends DataClass implements Insertable<AccessEventRow> {
  final String clientEventId;
  final String userId;
  final String siteId;
  final String publicationId;
  final DateTime occurredAt;
  const AccessEventRow({
    required this.clientEventId,
    required this.userId,
    required this.siteId,
    required this.publicationId,
    required this.occurredAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['client_event_id'] = Variable<String>(clientEventId);
    map['user_id'] = Variable<String>(userId);
    map['site_id'] = Variable<String>(siteId);
    map['publication_id'] = Variable<String>(publicationId);
    map['occurred_at'] = Variable<DateTime>(occurredAt);
    return map;
  }

  AccessEventOutboxCompanion toCompanion(bool nullToAbsent) {
    return AccessEventOutboxCompanion(
      clientEventId: Value(clientEventId),
      userId: Value(userId),
      siteId: Value(siteId),
      publicationId: Value(publicationId),
      occurredAt: Value(occurredAt),
    );
  }

  factory AccessEventRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AccessEventRow(
      clientEventId: serializer.fromJson<String>(json['clientEventId']),
      userId: serializer.fromJson<String>(json['userId']),
      siteId: serializer.fromJson<String>(json['siteId']),
      publicationId: serializer.fromJson<String>(json['publicationId']),
      occurredAt: serializer.fromJson<DateTime>(json['occurredAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'clientEventId': serializer.toJson<String>(clientEventId),
      'userId': serializer.toJson<String>(userId),
      'siteId': serializer.toJson<String>(siteId),
      'publicationId': serializer.toJson<String>(publicationId),
      'occurredAt': serializer.toJson<DateTime>(occurredAt),
    };
  }

  AccessEventRow copyWith({
    String? clientEventId,
    String? userId,
    String? siteId,
    String? publicationId,
    DateTime? occurredAt,
  }) => AccessEventRow(
    clientEventId: clientEventId ?? this.clientEventId,
    userId: userId ?? this.userId,
    siteId: siteId ?? this.siteId,
    publicationId: publicationId ?? this.publicationId,
    occurredAt: occurredAt ?? this.occurredAt,
  );
  AccessEventRow copyWithCompanion(AccessEventOutboxCompanion data) {
    return AccessEventRow(
      clientEventId: data.clientEventId.present
          ? data.clientEventId.value
          : this.clientEventId,
      userId: data.userId.present ? data.userId.value : this.userId,
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      publicationId: data.publicationId.present
          ? data.publicationId.value
          : this.publicationId,
      occurredAt: data.occurredAt.present
          ? data.occurredAt.value
          : this.occurredAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AccessEventRow(')
          ..write('clientEventId: $clientEventId, ')
          ..write('userId: $userId, ')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('occurredAt: $occurredAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(clientEventId, userId, siteId, publicationId, occurredAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AccessEventRow &&
          other.clientEventId == this.clientEventId &&
          other.userId == this.userId &&
          other.siteId == this.siteId &&
          other.publicationId == this.publicationId &&
          other.occurredAt == this.occurredAt);
}

class AccessEventOutboxCompanion extends UpdateCompanion<AccessEventRow> {
  final Value<String> clientEventId;
  final Value<String> userId;
  final Value<String> siteId;
  final Value<String> publicationId;
  final Value<DateTime> occurredAt;
  final Value<int> rowid;
  const AccessEventOutboxCompanion({
    this.clientEventId = const Value.absent(),
    this.userId = const Value.absent(),
    this.siteId = const Value.absent(),
    this.publicationId = const Value.absent(),
    this.occurredAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AccessEventOutboxCompanion.insert({
    required String clientEventId,
    required String userId,
    required String siteId,
    required String publicationId,
    required DateTime occurredAt,
    this.rowid = const Value.absent(),
  }) : clientEventId = Value(clientEventId),
       userId = Value(userId),
       siteId = Value(siteId),
       publicationId = Value(publicationId),
       occurredAt = Value(occurredAt);
  static Insertable<AccessEventRow> custom({
    Expression<String>? clientEventId,
    Expression<String>? userId,
    Expression<String>? siteId,
    Expression<String>? publicationId,
    Expression<DateTime>? occurredAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (clientEventId != null) 'client_event_id': clientEventId,
      if (userId != null) 'user_id': userId,
      if (siteId != null) 'site_id': siteId,
      if (publicationId != null) 'publication_id': publicationId,
      if (occurredAt != null) 'occurred_at': occurredAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AccessEventOutboxCompanion copyWith({
    Value<String>? clientEventId,
    Value<String>? userId,
    Value<String>? siteId,
    Value<String>? publicationId,
    Value<DateTime>? occurredAt,
    Value<int>? rowid,
  }) {
    return AccessEventOutboxCompanion(
      clientEventId: clientEventId ?? this.clientEventId,
      userId: userId ?? this.userId,
      siteId: siteId ?? this.siteId,
      publicationId: publicationId ?? this.publicationId,
      occurredAt: occurredAt ?? this.occurredAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (clientEventId.present) {
      map['client_event_id'] = Variable<String>(clientEventId.value);
    }
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (publicationId.present) {
      map['publication_id'] = Variable<String>(publicationId.value);
    }
    if (occurredAt.present) {
      map['occurred_at'] = Variable<DateTime>(occurredAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AccessEventOutboxCompanion(')
          ..write('clientEventId: $clientEventId, ')
          ..write('userId: $userId, ')
          ..write('siteId: $siteId, ')
          ..write('publicationId: $publicationId, ')
          ..write('occurredAt: $occurredAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $InstalledBasemapsTable extends InstalledBasemaps
    with TableInfo<$InstalledBasemapsTable, InstalledBasemapRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $InstalledBasemapsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _packIdMeta = const VerificationMeta('packId');
  @override
  late final GeneratedColumn<String> packId = GeneratedColumn<String>(
    'pack_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sectorIdMeta = const VerificationMeta(
    'sectorId',
  );
  @override
  late final GeneratedColumn<String> sectorId = GeneratedColumn<String>(
    'sector_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sectorNameMeta = const VerificationMeta(
    'sectorName',
  );
  @override
  late final GeneratedColumn<String> sectorName = GeneratedColumn<String>(
    'sector_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _versionMeta = const VerificationMeta(
    'version',
  );
  @override
  late final GeneratedColumn<int> version = GeneratedColumn<int>(
    'version',
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
  static const VerificationMeta _totalBytesMeta = const VerificationMeta(
    'totalBytes',
  );
  @override
  late final GeneratedColumn<int> totalBytes = GeneratedColumn<int>(
    'total_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _builtAtMeta = const VerificationMeta(
    'builtAt',
  );
  @override
  late final GeneratedColumn<DateTime> builtAt = GeneratedColumn<DateTime>(
    'built_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _renewAfterMeta = const VerificationMeta(
    'renewAfter',
  );
  @override
  late final GeneratedColumn<DateTime> renewAfter = GeneratedColumn<DateTime>(
    'renew_after',
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
  static const VerificationMeta _signatureKeyIdMeta = const VerificationMeta(
    'signatureKeyId',
  );
  @override
  late final GeneratedColumn<String> signatureKeyId = GeneratedColumn<String>(
    'signature_key_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    packId,
    sectorId,
    sectorName,
    version,
    manifestHash,
    manifestText,
    totalBytes,
    builtAt,
    renewAfter,
    installedAt,
    signatureKeyId,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'installed_basemaps';
  @override
  VerificationContext validateIntegrity(
    Insertable<InstalledBasemapRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('pack_id')) {
      context.handle(
        _packIdMeta,
        packId.isAcceptableOrUnknown(data['pack_id']!, _packIdMeta),
      );
    } else if (isInserting) {
      context.missing(_packIdMeta);
    }
    if (data.containsKey('sector_id')) {
      context.handle(
        _sectorIdMeta,
        sectorId.isAcceptableOrUnknown(data['sector_id']!, _sectorIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sectorIdMeta);
    }
    if (data.containsKey('sector_name')) {
      context.handle(
        _sectorNameMeta,
        sectorName.isAcceptableOrUnknown(data['sector_name']!, _sectorNameMeta),
      );
    } else if (isInserting) {
      context.missing(_sectorNameMeta);
    }
    if (data.containsKey('version')) {
      context.handle(
        _versionMeta,
        version.isAcceptableOrUnknown(data['version']!, _versionMeta),
      );
    } else if (isInserting) {
      context.missing(_versionMeta);
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
    if (data.containsKey('total_bytes')) {
      context.handle(
        _totalBytesMeta,
        totalBytes.isAcceptableOrUnknown(data['total_bytes']!, _totalBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_totalBytesMeta);
    }
    if (data.containsKey('built_at')) {
      context.handle(
        _builtAtMeta,
        builtAt.isAcceptableOrUnknown(data['built_at']!, _builtAtMeta),
      );
    } else if (isInserting) {
      context.missing(_builtAtMeta);
    }
    if (data.containsKey('renew_after')) {
      context.handle(
        _renewAfterMeta,
        renewAfter.isAcceptableOrUnknown(data['renew_after']!, _renewAfterMeta),
      );
    } else if (isInserting) {
      context.missing(_renewAfterMeta);
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
    if (data.containsKey('signature_key_id')) {
      context.handle(
        _signatureKeyIdMeta,
        signatureKeyId.isAcceptableOrUnknown(
          data['signature_key_id']!,
          _signatureKeyIdMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {packId};
  @override
  InstalledBasemapRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return InstalledBasemapRow(
      packId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}pack_id'],
      )!,
      sectorId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sector_id'],
      )!,
      sectorName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sector_name'],
      )!,
      version: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}version'],
      )!,
      manifestHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}manifest_hash'],
      )!,
      manifestText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}manifest_text'],
      )!,
      totalBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}total_bytes'],
      )!,
      builtAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}built_at'],
      )!,
      renewAfter: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}renew_after'],
      )!,
      installedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}installed_at'],
      )!,
      signatureKeyId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signature_key_id'],
      ),
    );
  }

  @override
  $InstalledBasemapsTable createAlias(String alias) {
    return $InstalledBasemapsTable(attachedDatabase, alias);
  }
}

class InstalledBasemapRow extends DataClass
    implements Insertable<InstalledBasemapRow> {
  final String packId;
  final String sectorId;
  final String sectorName;
  final int version;
  final String manifestHash;

  /// Manifeste signé tel que reçu (emprise, source, fichiers).
  final String manifestText;
  final int totalBytes;
  final DateTime builtAt;

  /// Renouvellement semestriel prévu (date du fond, distincte de l'ETARE).
  final DateTime renewAfter;
  final DateTime installedAt;

  /// Clé qui a signé le manifeste installé (SEC-04) : révoquée, le manifeste
  /// est revérifié avec sa nouvelle signature. Null pour un fond installé
  /// avant la version 8 du schéma.
  final String? signatureKeyId;
  const InstalledBasemapRow({
    required this.packId,
    required this.sectorId,
    required this.sectorName,
    required this.version,
    required this.manifestHash,
    required this.manifestText,
    required this.totalBytes,
    required this.builtAt,
    required this.renewAfter,
    required this.installedAt,
    this.signatureKeyId,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['pack_id'] = Variable<String>(packId);
    map['sector_id'] = Variable<String>(sectorId);
    map['sector_name'] = Variable<String>(sectorName);
    map['version'] = Variable<int>(version);
    map['manifest_hash'] = Variable<String>(manifestHash);
    map['manifest_text'] = Variable<String>(manifestText);
    map['total_bytes'] = Variable<int>(totalBytes);
    map['built_at'] = Variable<DateTime>(builtAt);
    map['renew_after'] = Variable<DateTime>(renewAfter);
    map['installed_at'] = Variable<DateTime>(installedAt);
    if (!nullToAbsent || signatureKeyId != null) {
      map['signature_key_id'] = Variable<String>(signatureKeyId);
    }
    return map;
  }

  InstalledBasemapsCompanion toCompanion(bool nullToAbsent) {
    return InstalledBasemapsCompanion(
      packId: Value(packId),
      sectorId: Value(sectorId),
      sectorName: Value(sectorName),
      version: Value(version),
      manifestHash: Value(manifestHash),
      manifestText: Value(manifestText),
      totalBytes: Value(totalBytes),
      builtAt: Value(builtAt),
      renewAfter: Value(renewAfter),
      installedAt: Value(installedAt),
      signatureKeyId: signatureKeyId == null && nullToAbsent
          ? const Value.absent()
          : Value(signatureKeyId),
    );
  }

  factory InstalledBasemapRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return InstalledBasemapRow(
      packId: serializer.fromJson<String>(json['packId']),
      sectorId: serializer.fromJson<String>(json['sectorId']),
      sectorName: serializer.fromJson<String>(json['sectorName']),
      version: serializer.fromJson<int>(json['version']),
      manifestHash: serializer.fromJson<String>(json['manifestHash']),
      manifestText: serializer.fromJson<String>(json['manifestText']),
      totalBytes: serializer.fromJson<int>(json['totalBytes']),
      builtAt: serializer.fromJson<DateTime>(json['builtAt']),
      renewAfter: serializer.fromJson<DateTime>(json['renewAfter']),
      installedAt: serializer.fromJson<DateTime>(json['installedAt']),
      signatureKeyId: serializer.fromJson<String?>(json['signatureKeyId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'packId': serializer.toJson<String>(packId),
      'sectorId': serializer.toJson<String>(sectorId),
      'sectorName': serializer.toJson<String>(sectorName),
      'version': serializer.toJson<int>(version),
      'manifestHash': serializer.toJson<String>(manifestHash),
      'manifestText': serializer.toJson<String>(manifestText),
      'totalBytes': serializer.toJson<int>(totalBytes),
      'builtAt': serializer.toJson<DateTime>(builtAt),
      'renewAfter': serializer.toJson<DateTime>(renewAfter),
      'installedAt': serializer.toJson<DateTime>(installedAt),
      'signatureKeyId': serializer.toJson<String?>(signatureKeyId),
    };
  }

  InstalledBasemapRow copyWith({
    String? packId,
    String? sectorId,
    String? sectorName,
    int? version,
    String? manifestHash,
    String? manifestText,
    int? totalBytes,
    DateTime? builtAt,
    DateTime? renewAfter,
    DateTime? installedAt,
    Value<String?> signatureKeyId = const Value.absent(),
  }) => InstalledBasemapRow(
    packId: packId ?? this.packId,
    sectorId: sectorId ?? this.sectorId,
    sectorName: sectorName ?? this.sectorName,
    version: version ?? this.version,
    manifestHash: manifestHash ?? this.manifestHash,
    manifestText: manifestText ?? this.manifestText,
    totalBytes: totalBytes ?? this.totalBytes,
    builtAt: builtAt ?? this.builtAt,
    renewAfter: renewAfter ?? this.renewAfter,
    installedAt: installedAt ?? this.installedAt,
    signatureKeyId: signatureKeyId.present
        ? signatureKeyId.value
        : this.signatureKeyId,
  );
  InstalledBasemapRow copyWithCompanion(InstalledBasemapsCompanion data) {
    return InstalledBasemapRow(
      packId: data.packId.present ? data.packId.value : this.packId,
      sectorId: data.sectorId.present ? data.sectorId.value : this.sectorId,
      sectorName: data.sectorName.present
          ? data.sectorName.value
          : this.sectorName,
      version: data.version.present ? data.version.value : this.version,
      manifestHash: data.manifestHash.present
          ? data.manifestHash.value
          : this.manifestHash,
      manifestText: data.manifestText.present
          ? data.manifestText.value
          : this.manifestText,
      totalBytes: data.totalBytes.present
          ? data.totalBytes.value
          : this.totalBytes,
      builtAt: data.builtAt.present ? data.builtAt.value : this.builtAt,
      renewAfter: data.renewAfter.present
          ? data.renewAfter.value
          : this.renewAfter,
      installedAt: data.installedAt.present
          ? data.installedAt.value
          : this.installedAt,
      signatureKeyId: data.signatureKeyId.present
          ? data.signatureKeyId.value
          : this.signatureKeyId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('InstalledBasemapRow(')
          ..write('packId: $packId, ')
          ..write('sectorId: $sectorId, ')
          ..write('sectorName: $sectorName, ')
          ..write('version: $version, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('manifestText: $manifestText, ')
          ..write('totalBytes: $totalBytes, ')
          ..write('builtAt: $builtAt, ')
          ..write('renewAfter: $renewAfter, ')
          ..write('installedAt: $installedAt, ')
          ..write('signatureKeyId: $signatureKeyId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    packId,
    sectorId,
    sectorName,
    version,
    manifestHash,
    manifestText,
    totalBytes,
    builtAt,
    renewAfter,
    installedAt,
    signatureKeyId,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is InstalledBasemapRow &&
          other.packId == this.packId &&
          other.sectorId == this.sectorId &&
          other.sectorName == this.sectorName &&
          other.version == this.version &&
          other.manifestHash == this.manifestHash &&
          other.manifestText == this.manifestText &&
          other.totalBytes == this.totalBytes &&
          other.builtAt == this.builtAt &&
          other.renewAfter == this.renewAfter &&
          other.installedAt == this.installedAt &&
          other.signatureKeyId == this.signatureKeyId);
}

class InstalledBasemapsCompanion extends UpdateCompanion<InstalledBasemapRow> {
  final Value<String> packId;
  final Value<String> sectorId;
  final Value<String> sectorName;
  final Value<int> version;
  final Value<String> manifestHash;
  final Value<String> manifestText;
  final Value<int> totalBytes;
  final Value<DateTime> builtAt;
  final Value<DateTime> renewAfter;
  final Value<DateTime> installedAt;
  final Value<String?> signatureKeyId;
  final Value<int> rowid;
  const InstalledBasemapsCompanion({
    this.packId = const Value.absent(),
    this.sectorId = const Value.absent(),
    this.sectorName = const Value.absent(),
    this.version = const Value.absent(),
    this.manifestHash = const Value.absent(),
    this.manifestText = const Value.absent(),
    this.totalBytes = const Value.absent(),
    this.builtAt = const Value.absent(),
    this.renewAfter = const Value.absent(),
    this.installedAt = const Value.absent(),
    this.signatureKeyId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  InstalledBasemapsCompanion.insert({
    required String packId,
    required String sectorId,
    required String sectorName,
    required int version,
    required String manifestHash,
    required String manifestText,
    required int totalBytes,
    required DateTime builtAt,
    required DateTime renewAfter,
    required DateTime installedAt,
    this.signatureKeyId = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : packId = Value(packId),
       sectorId = Value(sectorId),
       sectorName = Value(sectorName),
       version = Value(version),
       manifestHash = Value(manifestHash),
       manifestText = Value(manifestText),
       totalBytes = Value(totalBytes),
       builtAt = Value(builtAt),
       renewAfter = Value(renewAfter),
       installedAt = Value(installedAt);
  static Insertable<InstalledBasemapRow> custom({
    Expression<String>? packId,
    Expression<String>? sectorId,
    Expression<String>? sectorName,
    Expression<int>? version,
    Expression<String>? manifestHash,
    Expression<String>? manifestText,
    Expression<int>? totalBytes,
    Expression<DateTime>? builtAt,
    Expression<DateTime>? renewAfter,
    Expression<DateTime>? installedAt,
    Expression<String>? signatureKeyId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (packId != null) 'pack_id': packId,
      if (sectorId != null) 'sector_id': sectorId,
      if (sectorName != null) 'sector_name': sectorName,
      if (version != null) 'version': version,
      if (manifestHash != null) 'manifest_hash': manifestHash,
      if (manifestText != null) 'manifest_text': manifestText,
      if (totalBytes != null) 'total_bytes': totalBytes,
      if (builtAt != null) 'built_at': builtAt,
      if (renewAfter != null) 'renew_after': renewAfter,
      if (installedAt != null) 'installed_at': installedAt,
      if (signatureKeyId != null) 'signature_key_id': signatureKeyId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  InstalledBasemapsCompanion copyWith({
    Value<String>? packId,
    Value<String>? sectorId,
    Value<String>? sectorName,
    Value<int>? version,
    Value<String>? manifestHash,
    Value<String>? manifestText,
    Value<int>? totalBytes,
    Value<DateTime>? builtAt,
    Value<DateTime>? renewAfter,
    Value<DateTime>? installedAt,
    Value<String?>? signatureKeyId,
    Value<int>? rowid,
  }) {
    return InstalledBasemapsCompanion(
      packId: packId ?? this.packId,
      sectorId: sectorId ?? this.sectorId,
      sectorName: sectorName ?? this.sectorName,
      version: version ?? this.version,
      manifestHash: manifestHash ?? this.manifestHash,
      manifestText: manifestText ?? this.manifestText,
      totalBytes: totalBytes ?? this.totalBytes,
      builtAt: builtAt ?? this.builtAt,
      renewAfter: renewAfter ?? this.renewAfter,
      installedAt: installedAt ?? this.installedAt,
      signatureKeyId: signatureKeyId ?? this.signatureKeyId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (packId.present) {
      map['pack_id'] = Variable<String>(packId.value);
    }
    if (sectorId.present) {
      map['sector_id'] = Variable<String>(sectorId.value);
    }
    if (sectorName.present) {
      map['sector_name'] = Variable<String>(sectorName.value);
    }
    if (version.present) {
      map['version'] = Variable<int>(version.value);
    }
    if (manifestHash.present) {
      map['manifest_hash'] = Variable<String>(manifestHash.value);
    }
    if (manifestText.present) {
      map['manifest_text'] = Variable<String>(manifestText.value);
    }
    if (totalBytes.present) {
      map['total_bytes'] = Variable<int>(totalBytes.value);
    }
    if (builtAt.present) {
      map['built_at'] = Variable<DateTime>(builtAt.value);
    }
    if (renewAfter.present) {
      map['renew_after'] = Variable<DateTime>(renewAfter.value);
    }
    if (installedAt.present) {
      map['installed_at'] = Variable<DateTime>(installedAt.value);
    }
    if (signatureKeyId.present) {
      map['signature_key_id'] = Variable<String>(signatureKeyId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('InstalledBasemapsCompanion(')
          ..write('packId: $packId, ')
          ..write('sectorId: $sectorId, ')
          ..write('sectorName: $sectorName, ')
          ..write('version: $version, ')
          ..write('manifestHash: $manifestHash, ')
          ..write('manifestText: $manifestText, ')
          ..write('totalBytes: $totalBytes, ')
          ..write('builtAt: $builtAt, ')
          ..write('renewAfter: $renewAfter, ')
          ..write('installedAt: $installedAt, ')
          ..write('signatureKeyId: $signatureKeyId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TrustedKeysetsTable extends TrustedKeysets
    with TableInfo<$TrustedKeysetsTable, TrustedKeysetRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TrustedKeysetsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sequenceMeta = const VerificationMeta(
    'sequence',
  );
  @override
  late final GeneratedColumn<int> sequence = GeneratedColumn<int>(
    'sequence',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _keysetTextMeta = const VerificationMeta(
    'keysetText',
  );
  @override
  late final GeneratedColumn<String> keysetText = GeneratedColumn<String>(
    'keyset_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _rootKeyIdMeta = const VerificationMeta(
    'rootKeyId',
  );
  @override
  late final GeneratedColumn<String> rootKeyId = GeneratedColumn<String>(
    'root_key_id',
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
  static const VerificationMeta _receivedAtMeta = const VerificationMeta(
    'receivedAt',
  );
  @override
  late final GeneratedColumn<DateTime> receivedAt = GeneratedColumn<DateTime>(
    'received_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    sequence,
    keysetText,
    rootKeyId,
    signature,
    receivedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'trusted_keyset';
  @override
  VerificationContext validateIntegrity(
    Insertable<TrustedKeysetRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('sequence')) {
      context.handle(
        _sequenceMeta,
        sequence.isAcceptableOrUnknown(data['sequence']!, _sequenceMeta),
      );
    } else if (isInserting) {
      context.missing(_sequenceMeta);
    }
    if (data.containsKey('keyset_text')) {
      context.handle(
        _keysetTextMeta,
        keysetText.isAcceptableOrUnknown(data['keyset_text']!, _keysetTextMeta),
      );
    } else if (isInserting) {
      context.missing(_keysetTextMeta);
    }
    if (data.containsKey('root_key_id')) {
      context.handle(
        _rootKeyIdMeta,
        rootKeyId.isAcceptableOrUnknown(data['root_key_id']!, _rootKeyIdMeta),
      );
    } else if (isInserting) {
      context.missing(_rootKeyIdMeta);
    }
    if (data.containsKey('signature')) {
      context.handle(
        _signatureMeta,
        signature.isAcceptableOrUnknown(data['signature']!, _signatureMeta),
      );
    } else if (isInserting) {
      context.missing(_signatureMeta);
    }
    if (data.containsKey('received_at')) {
      context.handle(
        _receivedAtMeta,
        receivedAt.isAcceptableOrUnknown(data['received_at']!, _receivedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_receivedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TrustedKeysetRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TrustedKeysetRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      sequence: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sequence'],
      )!,
      keysetText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}keyset_text'],
      )!,
      rootKeyId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}root_key_id'],
      )!,
      signature: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}signature'],
      )!,
      receivedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}received_at'],
      )!,
    );
  }

  @override
  $TrustedKeysetsTable createAlias(String alias) {
    return $TrustedKeysetsTable(attachedDatabase, alias);
  }
}

class TrustedKeysetRow extends DataClass
    implements Insertable<TrustedKeysetRow> {
  final int id;
  final int sequence;

  /// JSON canonique du jeu, octet pour octet celui qui a été signé.
  final String keysetText;
  final String rootKeyId;
  final String signature;
  final DateTime receivedAt;
  const TrustedKeysetRow({
    required this.id,
    required this.sequence,
    required this.keysetText,
    required this.rootKeyId,
    required this.signature,
    required this.receivedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['sequence'] = Variable<int>(sequence);
    map['keyset_text'] = Variable<String>(keysetText);
    map['root_key_id'] = Variable<String>(rootKeyId);
    map['signature'] = Variable<String>(signature);
    map['received_at'] = Variable<DateTime>(receivedAt);
    return map;
  }

  TrustedKeysetsCompanion toCompanion(bool nullToAbsent) {
    return TrustedKeysetsCompanion(
      id: Value(id),
      sequence: Value(sequence),
      keysetText: Value(keysetText),
      rootKeyId: Value(rootKeyId),
      signature: Value(signature),
      receivedAt: Value(receivedAt),
    );
  }

  factory TrustedKeysetRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TrustedKeysetRow(
      id: serializer.fromJson<int>(json['id']),
      sequence: serializer.fromJson<int>(json['sequence']),
      keysetText: serializer.fromJson<String>(json['keysetText']),
      rootKeyId: serializer.fromJson<String>(json['rootKeyId']),
      signature: serializer.fromJson<String>(json['signature']),
      receivedAt: serializer.fromJson<DateTime>(json['receivedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'sequence': serializer.toJson<int>(sequence),
      'keysetText': serializer.toJson<String>(keysetText),
      'rootKeyId': serializer.toJson<String>(rootKeyId),
      'signature': serializer.toJson<String>(signature),
      'receivedAt': serializer.toJson<DateTime>(receivedAt),
    };
  }

  TrustedKeysetRow copyWith({
    int? id,
    int? sequence,
    String? keysetText,
    String? rootKeyId,
    String? signature,
    DateTime? receivedAt,
  }) => TrustedKeysetRow(
    id: id ?? this.id,
    sequence: sequence ?? this.sequence,
    keysetText: keysetText ?? this.keysetText,
    rootKeyId: rootKeyId ?? this.rootKeyId,
    signature: signature ?? this.signature,
    receivedAt: receivedAt ?? this.receivedAt,
  );
  TrustedKeysetRow copyWithCompanion(TrustedKeysetsCompanion data) {
    return TrustedKeysetRow(
      id: data.id.present ? data.id.value : this.id,
      sequence: data.sequence.present ? data.sequence.value : this.sequence,
      keysetText: data.keysetText.present
          ? data.keysetText.value
          : this.keysetText,
      rootKeyId: data.rootKeyId.present ? data.rootKeyId.value : this.rootKeyId,
      signature: data.signature.present ? data.signature.value : this.signature,
      receivedAt: data.receivedAt.present
          ? data.receivedAt.value
          : this.receivedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TrustedKeysetRow(')
          ..write('id: $id, ')
          ..write('sequence: $sequence, ')
          ..write('keysetText: $keysetText, ')
          ..write('rootKeyId: $rootKeyId, ')
          ..write('signature: $signature, ')
          ..write('receivedAt: $receivedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, sequence, keysetText, rootKeyId, signature, receivedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TrustedKeysetRow &&
          other.id == this.id &&
          other.sequence == this.sequence &&
          other.keysetText == this.keysetText &&
          other.rootKeyId == this.rootKeyId &&
          other.signature == this.signature &&
          other.receivedAt == this.receivedAt);
}

class TrustedKeysetsCompanion extends UpdateCompanion<TrustedKeysetRow> {
  final Value<int> id;
  final Value<int> sequence;
  final Value<String> keysetText;
  final Value<String> rootKeyId;
  final Value<String> signature;
  final Value<DateTime> receivedAt;
  const TrustedKeysetsCompanion({
    this.id = const Value.absent(),
    this.sequence = const Value.absent(),
    this.keysetText = const Value.absent(),
    this.rootKeyId = const Value.absent(),
    this.signature = const Value.absent(),
    this.receivedAt = const Value.absent(),
  });
  TrustedKeysetsCompanion.insert({
    this.id = const Value.absent(),
    required int sequence,
    required String keysetText,
    required String rootKeyId,
    required String signature,
    required DateTime receivedAt,
  }) : sequence = Value(sequence),
       keysetText = Value(keysetText),
       rootKeyId = Value(rootKeyId),
       signature = Value(signature),
       receivedAt = Value(receivedAt);
  static Insertable<TrustedKeysetRow> custom({
    Expression<int>? id,
    Expression<int>? sequence,
    Expression<String>? keysetText,
    Expression<String>? rootKeyId,
    Expression<String>? signature,
    Expression<DateTime>? receivedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sequence != null) 'sequence': sequence,
      if (keysetText != null) 'keyset_text': keysetText,
      if (rootKeyId != null) 'root_key_id': rootKeyId,
      if (signature != null) 'signature': signature,
      if (receivedAt != null) 'received_at': receivedAt,
    });
  }

  TrustedKeysetsCompanion copyWith({
    Value<int>? id,
    Value<int>? sequence,
    Value<String>? keysetText,
    Value<String>? rootKeyId,
    Value<String>? signature,
    Value<DateTime>? receivedAt,
  }) {
    return TrustedKeysetsCompanion(
      id: id ?? this.id,
      sequence: sequence ?? this.sequence,
      keysetText: keysetText ?? this.keysetText,
      rootKeyId: rootKeyId ?? this.rootKeyId,
      signature: signature ?? this.signature,
      receivedAt: receivedAt ?? this.receivedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (sequence.present) {
      map['sequence'] = Variable<int>(sequence.value);
    }
    if (keysetText.present) {
      map['keyset_text'] = Variable<String>(keysetText.value);
    }
    if (rootKeyId.present) {
      map['root_key_id'] = Variable<String>(rootKeyId.value);
    }
    if (signature.present) {
      map['signature'] = Variable<String>(signature.value);
    }
    if (receivedAt.present) {
      map['received_at'] = Variable<DateTime>(receivedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TrustedKeysetsCompanion(')
          ..write('id: $id, ')
          ..write('sequence: $sequence, ')
          ..write('keysetText: $keysetText, ')
          ..write('rootKeyId: $rootKeyId, ')
          ..write('signature: $signature, ')
          ..write('receivedAt: $receivedAt')
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
  late final $FieldReportsTable fieldReports = $FieldReportsTable(this);
  late final $FieldReportPhotosTable fieldReportPhotos =
      $FieldReportPhotosTable(this);
  late final $OnDemandSitesTable onDemandSites = $OnDemandSitesTable(this);
  late final $SensitiveSitesTable sensitiveSites = $SensitiveSitesTable(this);
  late final $SensitiveFilesTable sensitiveFiles = $SensitiveFilesTable(this);
  late final $AccessEventOutboxTable accessEventOutbox =
      $AccessEventOutboxTable(this);
  late final $InstalledBasemapsTable installedBasemaps =
      $InstalledBasemapsTable(this);
  late final $TrustedKeysetsTable trustedKeysets = $TrustedKeysetsTable(this);
  late final LocalMetaDao localMetaDao = LocalMetaDao(this as AppDatabase);
  late final SyncStateDao syncStateDao = SyncStateDao(this as AppDatabase);
  late final OfflineDao offlineDao = OfflineDao(this as AppDatabase);
  late final ReportsDao reportsDao = ReportsDao(this as AppDatabase);
  late final SensitiveDao sensitiveDao = SensitiveDao(this as AppDatabase);
  late final BasemapDao basemapDao = BasemapDao(this as AppDatabase);
  late final TrustDao trustDao = TrustDao(this as AppDatabase);
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
    fieldReports,
    fieldReportPhotos,
    onDemandSites,
    sensitiveSites,
    sensitiveFiles,
    accessEventOutbox,
    installedBasemaps,
    trustedKeysets,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'field_report',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('field_report_photo', kind: UpdateKind.delete)],
    ),
  ]);
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
  Value<String?> requiredAppVersion,
  Value<String?> syncLeaseOwner,
  Value<DateTime?> syncLeaseExpiresAt,
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
  Value<String?> requiredAppVersion,
  Value<String?> syncLeaseOwner,
  Value<DateTime?> syncLeaseExpiresAt,
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

  ColumnFilters<String> get requiredAppVersion => $composableBuilder(
    column: $table.requiredAppVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncLeaseOwner => $composableBuilder(
    column: $table.syncLeaseOwner,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get syncLeaseExpiresAt => $composableBuilder(
    column: $table.syncLeaseExpiresAt,
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

  ColumnOrderings<String> get requiredAppVersion => $composableBuilder(
    column: $table.requiredAppVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncLeaseOwner => $composableBuilder(
    column: $table.syncLeaseOwner,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get syncLeaseExpiresAt => $composableBuilder(
    column: $table.syncLeaseExpiresAt,
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

  GeneratedColumn<String> get requiredAppVersion => $composableBuilder(
    column: $table.requiredAppVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncLeaseOwner => $composableBuilder(
    column: $table.syncLeaseOwner,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get syncLeaseExpiresAt => $composableBuilder(
    column: $table.syncLeaseExpiresAt,
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
                Value<String?> requiredAppVersion = const Value.absent(),
                Value<String?> syncLeaseOwner = const Value.absent(),
                Value<DateTime?> syncLeaseExpiresAt = const Value.absent(),
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
                requiredAppVersion: requiredAppVersion,
                syncLeaseOwner: syncLeaseOwner,
                syncLeaseExpiresAt: syncLeaseExpiresAt,
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
                Value<String?> requiredAppVersion = const Value.absent(),
                Value<String?> syncLeaseOwner = const Value.absent(),
                Value<DateTime?> syncLeaseExpiresAt = const Value.absent(),
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
                requiredAppVersion: requiredAppVersion,
                syncLeaseOwner: syncLeaseOwner,
                syncLeaseExpiresAt: syncLeaseExpiresAt,
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
typedef $$FieldReportsTableCreateCompanionBuilder =
    FieldReportsCompanion Function({
      required String clientReportId,
      required String authorUserId,
      required String tenantId,
      required String siteId,
      required String siteName,
      required String publicationId,
      required int publicationNumber,
      required String category,
      required String severity,
      required String description,
      required String observedAt,
      Value<String?> itemType,
      Value<String?> itemId,
      Value<String?> itemLabel,
      Value<String?> planRevisionId,
      Value<String?> planTitle,
      Value<double?> planX,
      Value<double?> planY,
      Value<int> photoCount,
      Value<String> localState,
      Value<String?> lastError,
      Value<int> attempts,
      Value<DateTime?> nextAttemptAt,
      Value<String?> serverReportId,
      Value<String?> contentHash,
      Value<DateTime?> receivedAt,
      Value<String?> serverStatus,
      Value<String?> decisionComment,
      Value<DateTime?> decidedAt,
      Value<int?> resolutionRevisionNo,
      Value<int?> resolutionPublicationNumber,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$FieldReportsTableUpdateCompanionBuilder =
    FieldReportsCompanion Function({
      Value<String> clientReportId,
      Value<String> authorUserId,
      Value<String> tenantId,
      Value<String> siteId,
      Value<String> siteName,
      Value<String> publicationId,
      Value<int> publicationNumber,
      Value<String> category,
      Value<String> severity,
      Value<String> description,
      Value<String> observedAt,
      Value<String?> itemType,
      Value<String?> itemId,
      Value<String?> itemLabel,
      Value<String?> planRevisionId,
      Value<String?> planTitle,
      Value<double?> planX,
      Value<double?> planY,
      Value<int> photoCount,
      Value<String> localState,
      Value<String?> lastError,
      Value<int> attempts,
      Value<DateTime?> nextAttemptAt,
      Value<String?> serverReportId,
      Value<String?> contentHash,
      Value<DateTime?> receivedAt,
      Value<String?> serverStatus,
      Value<String?> decisionComment,
      Value<DateTime?> decidedAt,
      Value<int?> resolutionRevisionNo,
      Value<int?> resolutionPublicationNumber,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

final class $$FieldReportsTableReferences
    extends BaseReferences<_$AppDatabase, $FieldReportsTable, FieldReportRow> {
  $$FieldReportsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$FieldReportPhotosTable, List<FieldReportPhotoRow>>
  _fieldReportPhotosRefsTable(
    _$AppDatabase db,
  ) => MultiTypedResultKey.fromTable(
    db.fieldReportPhotos,
    aliasName:
        'field_report__client_report_id__field_report_photo__client_report_id',
  );

  $$FieldReportPhotosTableProcessedTableManager get fieldReportPhotosRefs {
    final manager =
        $$FieldReportPhotosTableTableManager(
          $_db,
          $_db.fieldReportPhotos,
        ).filter(
          (f) => f.clientReportId.clientReportId.sqlEquals(
            $_itemColumn<String>('client_report_id')!,
          ),
        );

    final cache = $_typedResult.readTableOrNull(
      _fieldReportPhotosRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$FieldReportsTableFilterComposer
    extends Composer<_$AppDatabase, $FieldReportsTable> {
  $$FieldReportsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get clientReportId => $composableBuilder(
    column: $table.clientReportId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteName => $composableBuilder(
    column: $table.siteName,
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

  ColumnFilters<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get severity => $composableBuilder(
    column: $table.severity,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get observedAt => $composableBuilder(
    column: $table.observedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get itemType => $composableBuilder(
    column: $table.itemType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get itemId => $composableBuilder(
    column: $table.itemId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get itemLabel => $composableBuilder(
    column: $table.itemLabel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get planRevisionId => $composableBuilder(
    column: $table.planRevisionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get planTitle => $composableBuilder(
    column: $table.planTitle,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get planX => $composableBuilder(
    column: $table.planX,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get planY => $composableBuilder(
    column: $table.planY,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get photoCount => $composableBuilder(
    column: $table.photoCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get localState => $composableBuilder(
    column: $table.localState,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverReportId => $composableBuilder(
    column: $table.serverReportId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverStatus => $composableBuilder(
    column: $table.serverStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get decisionComment => $composableBuilder(
    column: $table.decisionComment,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get decidedAt => $composableBuilder(
    column: $table.decidedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get resolutionRevisionNo => $composableBuilder(
    column: $table.resolutionRevisionNo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get resolutionPublicationNumber => $composableBuilder(
    column: $table.resolutionPublicationNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> fieldReportPhotosRefs(
    Expression<bool> Function($$FieldReportPhotosTableFilterComposer f) f,
  ) {
    final $$FieldReportPhotosTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.clientReportId,
      referencedTable: $db.fieldReportPhotos,
      getReferencedColumn: (t) => t.clientReportId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FieldReportPhotosTableFilterComposer(
            $db: $db,
            $table: $db.fieldReportPhotos,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$FieldReportsTableOrderingComposer
    extends Composer<_$AppDatabase, $FieldReportsTable> {
  $$FieldReportsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get clientReportId => $composableBuilder(
    column: $table.clientReportId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteName => $composableBuilder(
    column: $table.siteName,
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

  ColumnOrderings<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get severity => $composableBuilder(
    column: $table.severity,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get observedAt => $composableBuilder(
    column: $table.observedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get itemType => $composableBuilder(
    column: $table.itemType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get itemId => $composableBuilder(
    column: $table.itemId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get itemLabel => $composableBuilder(
    column: $table.itemLabel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get planRevisionId => $composableBuilder(
    column: $table.planRevisionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get planTitle => $composableBuilder(
    column: $table.planTitle,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get planX => $composableBuilder(
    column: $table.planX,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get planY => $composableBuilder(
    column: $table.planY,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get photoCount => $composableBuilder(
    column: $table.photoCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get localState => $composableBuilder(
    column: $table.localState,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverReportId => $composableBuilder(
    column: $table.serverReportId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverStatus => $composableBuilder(
    column: $table.serverStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get decisionComment => $composableBuilder(
    column: $table.decisionComment,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get decidedAt => $composableBuilder(
    column: $table.decidedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get resolutionRevisionNo => $composableBuilder(
    column: $table.resolutionRevisionNo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get resolutionPublicationNumber => $composableBuilder(
    column: $table.resolutionPublicationNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$FieldReportsTableAnnotationComposer
    extends Composer<_$AppDatabase, $FieldReportsTable> {
  $$FieldReportsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get clientReportId => $composableBuilder(
    column: $table.clientReportId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get tenantId =>
      $composableBuilder(column: $table.tenantId, builder: (column) => column);

  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get siteName =>
      $composableBuilder(column: $table.siteName, builder: (column) => column);

  GeneratedColumn<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get publicationNumber => $composableBuilder(
    column: $table.publicationNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumn<String> get severity =>
      $composableBuilder(column: $table.severity, builder: (column) => column);

  GeneratedColumn<String> get description => $composableBuilder(
    column: $table.description,
    builder: (column) => column,
  );

  GeneratedColumn<String> get observedAt => $composableBuilder(
    column: $table.observedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get itemType =>
      $composableBuilder(column: $table.itemType, builder: (column) => column);

  GeneratedColumn<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => column);

  GeneratedColumn<String> get itemLabel =>
      $composableBuilder(column: $table.itemLabel, builder: (column) => column);

  GeneratedColumn<String> get planRevisionId => $composableBuilder(
    column: $table.planRevisionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get planTitle =>
      $composableBuilder(column: $table.planTitle, builder: (column) => column);

  GeneratedColumn<double> get planX =>
      $composableBuilder(column: $table.planX, builder: (column) => column);

  GeneratedColumn<double> get planY =>
      $composableBuilder(column: $table.planY, builder: (column) => column);

  GeneratedColumn<int> get photoCount => $composableBuilder(
    column: $table.photoCount,
    builder: (column) => column,
  );

  GeneratedColumn<String> get localState => $composableBuilder(
    column: $table.localState,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<DateTime> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get serverReportId => $composableBuilder(
    column: $table.serverReportId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get serverStatus => $composableBuilder(
    column: $table.serverStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get decisionComment => $composableBuilder(
    column: $table.decisionComment,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get decidedAt =>
      $composableBuilder(column: $table.decidedAt, builder: (column) => column);

  GeneratedColumn<int> get resolutionRevisionNo => $composableBuilder(
    column: $table.resolutionRevisionNo,
    builder: (column) => column,
  );

  GeneratedColumn<int> get resolutionPublicationNumber => $composableBuilder(
    column: $table.resolutionPublicationNumber,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  Expression<T> fieldReportPhotosRefs<T extends Object>(
    Expression<T> Function($$FieldReportPhotosTableAnnotationComposer a) f,
  ) {
    final $$FieldReportPhotosTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.clientReportId,
          referencedTable: $db.fieldReportPhotos,
          getReferencedColumn: (t) => t.clientReportId,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$FieldReportPhotosTableAnnotationComposer(
                $db: $db,
                $table: $db.fieldReportPhotos,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return f(composer);
  }
}

class $$FieldReportsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FieldReportsTable,
          FieldReportRow,
          $$FieldReportsTableFilterComposer,
          $$FieldReportsTableOrderingComposer,
          $$FieldReportsTableAnnotationComposer,
          $$FieldReportsTableCreateCompanionBuilder,
          $$FieldReportsTableUpdateCompanionBuilder,
          (FieldReportRow, $$FieldReportsTableReferences),
          FieldReportRow,
          PrefetchHooks Function({bool fieldReportPhotosRefs})
        > {
  $$FieldReportsTableTableManager(_$AppDatabase db, $FieldReportsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FieldReportsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FieldReportsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FieldReportsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> clientReportId = const Value.absent(),
                Value<String> authorUserId = const Value.absent(),
                Value<String> tenantId = const Value.absent(),
                Value<String> siteId = const Value.absent(),
                Value<String> siteName = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<int> publicationNumber = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> severity = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String> observedAt = const Value.absent(),
                Value<String?> itemType = const Value.absent(),
                Value<String?> itemId = const Value.absent(),
                Value<String?> itemLabel = const Value.absent(),
                Value<String?> planRevisionId = const Value.absent(),
                Value<String?> planTitle = const Value.absent(),
                Value<double?> planX = const Value.absent(),
                Value<double?> planY = const Value.absent(),
                Value<int> photoCount = const Value.absent(),
                Value<String> localState = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<DateTime?> nextAttemptAt = const Value.absent(),
                Value<String?> serverReportId = const Value.absent(),
                Value<String?> contentHash = const Value.absent(),
                Value<DateTime?> receivedAt = const Value.absent(),
                Value<String?> serverStatus = const Value.absent(),
                Value<String?> decisionComment = const Value.absent(),
                Value<DateTime?> decidedAt = const Value.absent(),
                Value<int?> resolutionRevisionNo = const Value.absent(),
                Value<int?> resolutionPublicationNumber = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FieldReportsCompanion(
                clientReportId: clientReportId,
                authorUserId: authorUserId,
                tenantId: tenantId,
                siteId: siteId,
                siteName: siteName,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                category: category,
                severity: severity,
                description: description,
                observedAt: observedAt,
                itemType: itemType,
                itemId: itemId,
                itemLabel: itemLabel,
                planRevisionId: planRevisionId,
                planTitle: planTitle,
                planX: planX,
                planY: planY,
                photoCount: photoCount,
                localState: localState,
                lastError: lastError,
                attempts: attempts,
                nextAttemptAt: nextAttemptAt,
                serverReportId: serverReportId,
                contentHash: contentHash,
                receivedAt: receivedAt,
                serverStatus: serverStatus,
                decisionComment: decisionComment,
                decidedAt: decidedAt,
                resolutionRevisionNo: resolutionRevisionNo,
                resolutionPublicationNumber: resolutionPublicationNumber,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String clientReportId,
                required String authorUserId,
                required String tenantId,
                required String siteId,
                required String siteName,
                required String publicationId,
                required int publicationNumber,
                required String category,
                required String severity,
                required String description,
                required String observedAt,
                Value<String?> itemType = const Value.absent(),
                Value<String?> itemId = const Value.absent(),
                Value<String?> itemLabel = const Value.absent(),
                Value<String?> planRevisionId = const Value.absent(),
                Value<String?> planTitle = const Value.absent(),
                Value<double?> planX = const Value.absent(),
                Value<double?> planY = const Value.absent(),
                Value<int> photoCount = const Value.absent(),
                Value<String> localState = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<DateTime?> nextAttemptAt = const Value.absent(),
                Value<String?> serverReportId = const Value.absent(),
                Value<String?> contentHash = const Value.absent(),
                Value<DateTime?> receivedAt = const Value.absent(),
                Value<String?> serverStatus = const Value.absent(),
                Value<String?> decisionComment = const Value.absent(),
                Value<DateTime?> decidedAt = const Value.absent(),
                Value<int?> resolutionRevisionNo = const Value.absent(),
                Value<int?> resolutionPublicationNumber = const Value.absent(),
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => FieldReportsCompanion.insert(
                clientReportId: clientReportId,
                authorUserId: authorUserId,
                tenantId: tenantId,
                siteId: siteId,
                siteName: siteName,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                category: category,
                severity: severity,
                description: description,
                observedAt: observedAt,
                itemType: itemType,
                itemId: itemId,
                itemLabel: itemLabel,
                planRevisionId: planRevisionId,
                planTitle: planTitle,
                planX: planX,
                planY: planY,
                photoCount: photoCount,
                localState: localState,
                lastError: lastError,
                attempts: attempts,
                nextAttemptAt: nextAttemptAt,
                serverReportId: serverReportId,
                contentHash: contentHash,
                receivedAt: receivedAt,
                serverStatus: serverStatus,
                decisionComment: decisionComment,
                decidedAt: decidedAt,
                resolutionRevisionNo: resolutionRevisionNo,
                resolutionPublicationNumber: resolutionPublicationNumber,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FieldReportsTable, FieldReportRow>(table),
                  $$FieldReportsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({fieldReportPhotosRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (fieldReportPhotosRefs) db.fieldReportPhotos,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (fieldReportPhotosRefs)
                    await $_getPrefetchedData<
                      FieldReportRow,
                      $FieldReportsTable,
                      FieldReportPhotoRow
                    >(
                      currentTable: table,
                      referencedTable: $$FieldReportsTableReferences
                          ._fieldReportPhotosRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$FieldReportsTableReferences(
                            db,
                            table,
                            p0,
                          ).fieldReportPhotosRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where(
                            (e) => e.clientReportId == item.clientReportId,
                          ),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$FieldReportsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FieldReportsTable,
      FieldReportRow,
      $$FieldReportsTableFilterComposer,
      $$FieldReportsTableOrderingComposer,
      $$FieldReportsTableAnnotationComposer,
      $$FieldReportsTableCreateCompanionBuilder,
      $$FieldReportsTableUpdateCompanionBuilder,
      (FieldReportRow, $$FieldReportsTableReferences),
      FieldReportRow,
      PrefetchHooks Function({bool fieldReportPhotosRefs})
    >;
typedef $$FieldReportPhotosTableCreateCompanionBuilder =
    FieldReportPhotosCompanion Function({
      required String clientReportId,
      required int position,
      required String sha256,
      required String mimeType,
      required String filename,
      required Uint8List content,
      Value<bool> uploaded,
      Value<int> rowid,
    });
typedef $$FieldReportPhotosTableUpdateCompanionBuilder =
    FieldReportPhotosCompanion Function({
      Value<String> clientReportId,
      Value<int> position,
      Value<String> sha256,
      Value<String> mimeType,
      Value<String> filename,
      Value<Uint8List> content,
      Value<bool> uploaded,
      Value<int> rowid,
    });

final class $$FieldReportPhotosTableReferences
    extends
        BaseReferences<
          _$AppDatabase,
          $FieldReportPhotosTable,
          FieldReportPhotoRow
        > {
  $$FieldReportPhotosTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $FieldReportsTable _clientReportIdTable(_$AppDatabase db) =>
      db.fieldReports.createAlias(
        'field_report_photo__client_report_id__field_report__client_report_id',
      );

  $$FieldReportsTableProcessedTableManager get clientReportId {
    final $_column = $_itemColumn<String>('client_report_id')!;

    final manager = $$FieldReportsTableTableManager(
      $_db,
      $_db.fieldReports,
    ).filter((f) => f.clientReportId.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_clientReportIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$FieldReportPhotosTableFilterComposer
    extends Composer<_$AppDatabase, $FieldReportPhotosTable> {
  $$FieldReportPhotosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get position => $composableBuilder(
    column: $table.position,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mimeType => $composableBuilder(
    column: $table.mimeType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get filename => $composableBuilder(
    column: $table.filename,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get uploaded => $composableBuilder(
    column: $table.uploaded,
    builder: (column) => ColumnFilters(column),
  );

  $$FieldReportsTableFilterComposer get clientReportId {
    final $$FieldReportsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.clientReportId,
      referencedTable: $db.fieldReports,
      getReferencedColumn: (t) => t.clientReportId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FieldReportsTableFilterComposer(
            $db: $db,
            $table: $db.fieldReports,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FieldReportPhotosTableOrderingComposer
    extends Composer<_$AppDatabase, $FieldReportPhotosTable> {
  $$FieldReportPhotosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get position => $composableBuilder(
    column: $table.position,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mimeType => $composableBuilder(
    column: $table.mimeType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get filename => $composableBuilder(
    column: $table.filename,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get uploaded => $composableBuilder(
    column: $table.uploaded,
    builder: (column) => ColumnOrderings(column),
  );

  $$FieldReportsTableOrderingComposer get clientReportId {
    final $$FieldReportsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.clientReportId,
      referencedTable: $db.fieldReports,
      getReferencedColumn: (t) => t.clientReportId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FieldReportsTableOrderingComposer(
            $db: $db,
            $table: $db.fieldReports,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FieldReportPhotosTableAnnotationComposer
    extends Composer<_$AppDatabase, $FieldReportPhotosTable> {
  $$FieldReportPhotosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get position =>
      $composableBuilder(column: $table.position, builder: (column) => column);

  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<String> get mimeType =>
      $composableBuilder(column: $table.mimeType, builder: (column) => column);

  GeneratedColumn<String> get filename =>
      $composableBuilder(column: $table.filename, builder: (column) => column);

  GeneratedColumn<Uint8List> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<bool> get uploaded =>
      $composableBuilder(column: $table.uploaded, builder: (column) => column);

  $$FieldReportsTableAnnotationComposer get clientReportId {
    final $$FieldReportsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.clientReportId,
      referencedTable: $db.fieldReports,
      getReferencedColumn: (t) => t.clientReportId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FieldReportsTableAnnotationComposer(
            $db: $db,
            $table: $db.fieldReports,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FieldReportPhotosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FieldReportPhotosTable,
          FieldReportPhotoRow,
          $$FieldReportPhotosTableFilterComposer,
          $$FieldReportPhotosTableOrderingComposer,
          $$FieldReportPhotosTableAnnotationComposer,
          $$FieldReportPhotosTableCreateCompanionBuilder,
          $$FieldReportPhotosTableUpdateCompanionBuilder,
          (FieldReportPhotoRow, $$FieldReportPhotosTableReferences),
          FieldReportPhotoRow,
          PrefetchHooks Function({bool clientReportId})
        > {
  $$FieldReportPhotosTableTableManager(
    _$AppDatabase db,
    $FieldReportPhotosTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FieldReportPhotosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FieldReportPhotosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FieldReportPhotosTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> clientReportId = const Value.absent(),
                Value<int> position = const Value.absent(),
                Value<String> sha256 = const Value.absent(),
                Value<String> mimeType = const Value.absent(),
                Value<String> filename = const Value.absent(),
                Value<Uint8List> content = const Value.absent(),
                Value<bool> uploaded = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FieldReportPhotosCompanion(
                clientReportId: clientReportId,
                position: position,
                sha256: sha256,
                mimeType: mimeType,
                filename: filename,
                content: content,
                uploaded: uploaded,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String clientReportId,
                required int position,
                required String sha256,
                required String mimeType,
                required String filename,
                required Uint8List content,
                Value<bool> uploaded = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FieldReportPhotosCompanion.insert(
                clientReportId: clientReportId,
                position: position,
                sha256: sha256,
                mimeType: mimeType,
                filename: filename,
                content: content,
                uploaded: uploaded,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FieldReportPhotosTable, FieldReportPhotoRow>(
                    table,
                  ),
                  $$FieldReportPhotosTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({clientReportId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (clientReportId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.clientReportId,
                        referencedTable: $$FieldReportPhotosTableReferences
                            ._clientReportIdTable(db),
                        referencedColumn: $$FieldReportPhotosTableReferences
                            ._clientReportIdTable(db)
                            .clientReportId,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$FieldReportPhotosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FieldReportPhotosTable,
      FieldReportPhotoRow,
      $$FieldReportPhotosTableFilterComposer,
      $$FieldReportPhotosTableOrderingComposer,
      $$FieldReportPhotosTableAnnotationComposer,
      $$FieldReportPhotosTableCreateCompanionBuilder,
      $$FieldReportPhotosTableUpdateCompanionBuilder,
      (FieldReportPhotoRow, $$FieldReportPhotosTableReferences),
      FieldReportPhotoRow,
      PrefetchHooks Function({bool clientReportId})
    >;
typedef $$OnDemandSitesTableCreateCompanionBuilder =
    OnDemandSitesCompanion Function({
      required String siteId,
      required String publicationId,
      required int publicationNumber,
      required String manifestHash,
      required String siteName,
      Value<String?> etareNumber,
      required int sizeBytes,
      required DateTime publishedAt,
      required String searchText,
      Value<int> rowid,
    });
typedef $$OnDemandSitesTableUpdateCompanionBuilder =
    OnDemandSitesCompanion Function({
      Value<String> siteId,
      Value<String> publicationId,
      Value<int> publicationNumber,
      Value<String> manifestHash,
      Value<String> siteName,
      Value<String?> etareNumber,
      Value<int> sizeBytes,
      Value<DateTime> publishedAt,
      Value<String> searchText,
      Value<int> rowid,
    });

class $$OnDemandSitesTableFilterComposer
    extends Composer<_$AppDatabase, $OnDemandSitesTable> {
  $$OnDemandSitesTableFilterComposer({
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

  ColumnFilters<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OnDemandSitesTableOrderingComposer
    extends Composer<_$AppDatabase, $OnDemandSitesTable> {
  $$OnDemandSitesTableOrderingComposer({
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

  ColumnOrderings<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OnDemandSitesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OnDemandSitesTable> {
  $$OnDemandSitesTableAnnotationComposer({
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

  GeneratedColumn<String> get siteName =>
      $composableBuilder(column: $table.siteName, builder: (column) => column);

  GeneratedColumn<String> get etareNumber => $composableBuilder(
    column: $table.etareNumber,
    builder: (column) => column,
  );

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get searchText => $composableBuilder(
    column: $table.searchText,
    builder: (column) => column,
  );
}

class $$OnDemandSitesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OnDemandSitesTable,
          OnDemandSiteRow,
          $$OnDemandSitesTableFilterComposer,
          $$OnDemandSitesTableOrderingComposer,
          $$OnDemandSitesTableAnnotationComposer,
          $$OnDemandSitesTableCreateCompanionBuilder,
          $$OnDemandSitesTableUpdateCompanionBuilder,
          (
            OnDemandSiteRow,
            BaseReferences<_$AppDatabase, $OnDemandSitesTable, OnDemandSiteRow>,
          ),
          OnDemandSiteRow,
          PrefetchHooks Function()
        > {
  $$OnDemandSitesTableTableManager(_$AppDatabase db, $OnDemandSitesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OnDemandSitesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OnDemandSitesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OnDemandSitesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<int> publicationNumber = const Value.absent(),
                Value<String> manifestHash = const Value.absent(),
                Value<String> siteName = const Value.absent(),
                Value<String?> etareNumber = const Value.absent(),
                Value<int> sizeBytes = const Value.absent(),
                Value<DateTime> publishedAt = const Value.absent(),
                Value<String> searchText = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OnDemandSitesCompanion(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                manifestHash: manifestHash,
                siteName: siteName,
                etareNumber: etareNumber,
                sizeBytes: sizeBytes,
                publishedAt: publishedAt,
                searchText: searchText,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String publicationId,
                required int publicationNumber,
                required String manifestHash,
                required String siteName,
                Value<String?> etareNumber = const Value.absent(),
                required int sizeBytes,
                required DateTime publishedAt,
                required String searchText,
                Value<int> rowid = const Value.absent(),
              }) => OnDemandSitesCompanion.insert(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                manifestHash: manifestHash,
                siteName: siteName,
                etareNumber: etareNumber,
                sizeBytes: sizeBytes,
                publishedAt: publishedAt,
                searchText: searchText,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OnDemandSitesTable, OnDemandSiteRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $OnDemandSitesTable,
                    OnDemandSiteRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OnDemandSitesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OnDemandSitesTable,
      OnDemandSiteRow,
      $$OnDemandSitesTableFilterComposer,
      $$OnDemandSitesTableOrderingComposer,
      $$OnDemandSitesTableAnnotationComposer,
      $$OnDemandSitesTableCreateCompanionBuilder,
      $$OnDemandSitesTableUpdateCompanionBuilder,
      (
        OnDemandSiteRow,
        BaseReferences<_$AppDatabase, $OnDemandSitesTable, OnDemandSiteRow>,
      ),
      OnDemandSiteRow,
      PrefetchHooks Function()
    >;
typedef $$SensitiveSitesTableCreateCompanionBuilder =
    SensitiveSitesCompanion Function({
      required String siteId,
      required String publicationId,
      required int publicationNumber,
      required String userId,
      required String siteName,
      required DateTime openedAt,
      required DateTime expiresAt,
      required Uint8List wrappedKey,
      required Uint8List dataCipher,
      Value<int> rowid,
    });
typedef $$SensitiveSitesTableUpdateCompanionBuilder =
    SensitiveSitesCompanion Function({
      Value<String> siteId,
      Value<String> publicationId,
      Value<int> publicationNumber,
      Value<String> userId,
      Value<String> siteName,
      Value<DateTime> openedAt,
      Value<DateTime> expiresAt,
      Value<Uint8List> wrappedKey,
      Value<Uint8List> dataCipher,
      Value<int> rowid,
    });

class $$SensitiveSitesTableFilterComposer
    extends Composer<_$AppDatabase, $SensitiveSitesTable> {
  $$SensitiveSitesTableFilterComposer({
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

  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get openedAt => $composableBuilder(
    column: $table.openedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get expiresAt => $composableBuilder(
    column: $table.expiresAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get wrappedKey => $composableBuilder(
    column: $table.wrappedKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get dataCipher => $composableBuilder(
    column: $table.dataCipher,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SensitiveSitesTableOrderingComposer
    extends Composer<_$AppDatabase, $SensitiveSitesTable> {
  $$SensitiveSitesTableOrderingComposer({
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

  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteName => $composableBuilder(
    column: $table.siteName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get openedAt => $composableBuilder(
    column: $table.openedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get expiresAt => $composableBuilder(
    column: $table.expiresAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get wrappedKey => $composableBuilder(
    column: $table.wrappedKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get dataCipher => $composableBuilder(
    column: $table.dataCipher,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SensitiveSitesTableAnnotationComposer
    extends Composer<_$AppDatabase, $SensitiveSitesTable> {
  $$SensitiveSitesTableAnnotationComposer({
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

  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get siteName =>
      $composableBuilder(column: $table.siteName, builder: (column) => column);

  GeneratedColumn<DateTime> get openedAt =>
      $composableBuilder(column: $table.openedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get expiresAt =>
      $composableBuilder(column: $table.expiresAt, builder: (column) => column);

  GeneratedColumn<Uint8List> get wrappedKey => $composableBuilder(
    column: $table.wrappedKey,
    builder: (column) => column,
  );

  GeneratedColumn<Uint8List> get dataCipher => $composableBuilder(
    column: $table.dataCipher,
    builder: (column) => column,
  );
}

class $$SensitiveSitesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SensitiveSitesTable,
          SensitiveSiteRow,
          $$SensitiveSitesTableFilterComposer,
          $$SensitiveSitesTableOrderingComposer,
          $$SensitiveSitesTableAnnotationComposer,
          $$SensitiveSitesTableCreateCompanionBuilder,
          $$SensitiveSitesTableUpdateCompanionBuilder,
          (
            SensitiveSiteRow,
            BaseReferences<
              _$AppDatabase,
              $SensitiveSitesTable,
              SensitiveSiteRow
            >,
          ),
          SensitiveSiteRow,
          PrefetchHooks Function()
        > {
  $$SensitiveSitesTableTableManager(
    _$AppDatabase db,
    $SensitiveSitesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SensitiveSitesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SensitiveSitesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SensitiveSitesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<int> publicationNumber = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> siteName = const Value.absent(),
                Value<DateTime> openedAt = const Value.absent(),
                Value<DateTime> expiresAt = const Value.absent(),
                Value<Uint8List> wrappedKey = const Value.absent(),
                Value<Uint8List> dataCipher = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SensitiveSitesCompanion(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                userId: userId,
                siteName: siteName,
                openedAt: openedAt,
                expiresAt: expiresAt,
                wrappedKey: wrappedKey,
                dataCipher: dataCipher,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String publicationId,
                required int publicationNumber,
                required String userId,
                required String siteName,
                required DateTime openedAt,
                required DateTime expiresAt,
                required Uint8List wrappedKey,
                required Uint8List dataCipher,
                Value<int> rowid = const Value.absent(),
              }) => SensitiveSitesCompanion.insert(
                siteId: siteId,
                publicationId: publicationId,
                publicationNumber: publicationNumber,
                userId: userId,
                siteName: siteName,
                openedAt: openedAt,
                expiresAt: expiresAt,
                wrappedKey: wrappedKey,
                dataCipher: dataCipher,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SensitiveSitesTable, SensitiveSiteRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SensitiveSitesTable,
                    SensitiveSiteRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SensitiveSitesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SensitiveSitesTable,
      SensitiveSiteRow,
      $$SensitiveSitesTableFilterComposer,
      $$SensitiveSitesTableOrderingComposer,
      $$SensitiveSitesTableAnnotationComposer,
      $$SensitiveSitesTableCreateCompanionBuilder,
      $$SensitiveSitesTableUpdateCompanionBuilder,
      (
        SensitiveSiteRow,
        BaseReferences<_$AppDatabase, $SensitiveSitesTable, SensitiveSiteRow>,
      ),
      SensitiveSiteRow,
      PrefetchHooks Function()
    >;
typedef $$SensitiveFilesTableCreateCompanionBuilder =
    SensitiveFilesCompanion Function({
      required String siteId,
      required String sha256,
      required String path,
      required String mediaType,
      required Uint8List cipher,
      Value<int> rowid,
    });
typedef $$SensitiveFilesTableUpdateCompanionBuilder =
    SensitiveFilesCompanion Function({
      Value<String> siteId,
      Value<String> sha256,
      Value<String> path,
      Value<String> mediaType,
      Value<Uint8List> cipher,
      Value<int> rowid,
    });

class $$SensitiveFilesTableFilterComposer
    extends Composer<_$AppDatabase, $SensitiveFilesTable> {
  $$SensitiveFilesTableFilterComposer({
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

  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get cipher => $composableBuilder(
    column: $table.cipher,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SensitiveFilesTableOrderingComposer
    extends Composer<_$AppDatabase, $SensitiveFilesTable> {
  $$SensitiveFilesTableOrderingComposer({
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

  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get cipher => $composableBuilder(
    column: $table.cipher,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SensitiveFilesTableAnnotationComposer
    extends Composer<_$AppDatabase, $SensitiveFilesTable> {
  $$SensitiveFilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<String> get path =>
      $composableBuilder(column: $table.path, builder: (column) => column);

  GeneratedColumn<String> get mediaType =>
      $composableBuilder(column: $table.mediaType, builder: (column) => column);

  GeneratedColumn<Uint8List> get cipher =>
      $composableBuilder(column: $table.cipher, builder: (column) => column);
}

class $$SensitiveFilesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SensitiveFilesTable,
          SensitiveFileRow,
          $$SensitiveFilesTableFilterComposer,
          $$SensitiveFilesTableOrderingComposer,
          $$SensitiveFilesTableAnnotationComposer,
          $$SensitiveFilesTableCreateCompanionBuilder,
          $$SensitiveFilesTableUpdateCompanionBuilder,
          (
            SensitiveFileRow,
            BaseReferences<
              _$AppDatabase,
              $SensitiveFilesTable,
              SensitiveFileRow
            >,
          ),
          SensitiveFileRow,
          PrefetchHooks Function()
        > {
  $$SensitiveFilesTableTableManager(
    _$AppDatabase db,
    $SensitiveFilesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SensitiveFilesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SensitiveFilesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SensitiveFilesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> siteId = const Value.absent(),
                Value<String> sha256 = const Value.absent(),
                Value<String> path = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<Uint8List> cipher = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SensitiveFilesCompanion(
                siteId: siteId,
                sha256: sha256,
                path: path,
                mediaType: mediaType,
                cipher: cipher,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String siteId,
                required String sha256,
                required String path,
                required String mediaType,
                required Uint8List cipher,
                Value<int> rowid = const Value.absent(),
              }) => SensitiveFilesCompanion.insert(
                siteId: siteId,
                sha256: sha256,
                path: path,
                mediaType: mediaType,
                cipher: cipher,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SensitiveFilesTable, SensitiveFileRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $SensitiveFilesTable,
                    SensitiveFileRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SensitiveFilesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SensitiveFilesTable,
      SensitiveFileRow,
      $$SensitiveFilesTableFilterComposer,
      $$SensitiveFilesTableOrderingComposer,
      $$SensitiveFilesTableAnnotationComposer,
      $$SensitiveFilesTableCreateCompanionBuilder,
      $$SensitiveFilesTableUpdateCompanionBuilder,
      (
        SensitiveFileRow,
        BaseReferences<_$AppDatabase, $SensitiveFilesTable, SensitiveFileRow>,
      ),
      SensitiveFileRow,
      PrefetchHooks Function()
    >;
typedef $$AccessEventOutboxTableCreateCompanionBuilder =
    AccessEventOutboxCompanion Function({
      required String clientEventId,
      required String userId,
      required String siteId,
      required String publicationId,
      required DateTime occurredAt,
      Value<int> rowid,
    });
typedef $$AccessEventOutboxTableUpdateCompanionBuilder =
    AccessEventOutboxCompanion Function({
      Value<String> clientEventId,
      Value<String> userId,
      Value<String> siteId,
      Value<String> publicationId,
      Value<DateTime> occurredAt,
      Value<int> rowid,
    });

class $$AccessEventOutboxTableFilterComposer
    extends Composer<_$AppDatabase, $AccessEventOutboxTable> {
  $$AccessEventOutboxTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get clientEventId => $composableBuilder(
    column: $table.clientEventId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get occurredAt => $composableBuilder(
    column: $table.occurredAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AccessEventOutboxTableOrderingComposer
    extends Composer<_$AppDatabase, $AccessEventOutboxTable> {
  $$AccessEventOutboxTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get clientEventId => $composableBuilder(
    column: $table.clientEventId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get occurredAt => $composableBuilder(
    column: $table.occurredAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AccessEventOutboxTableAnnotationComposer
    extends Composer<_$AppDatabase, $AccessEventOutboxTable> {
  $$AccessEventOutboxTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get clientEventId => $composableBuilder(
    column: $table.clientEventId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get publicationId => $composableBuilder(
    column: $table.publicationId,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get occurredAt => $composableBuilder(
    column: $table.occurredAt,
    builder: (column) => column,
  );
}

class $$AccessEventOutboxTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AccessEventOutboxTable,
          AccessEventRow,
          $$AccessEventOutboxTableFilterComposer,
          $$AccessEventOutboxTableOrderingComposer,
          $$AccessEventOutboxTableAnnotationComposer,
          $$AccessEventOutboxTableCreateCompanionBuilder,
          $$AccessEventOutboxTableUpdateCompanionBuilder,
          (
            AccessEventRow,
            BaseReferences<
              _$AppDatabase,
              $AccessEventOutboxTable,
              AccessEventRow
            >,
          ),
          AccessEventRow,
          PrefetchHooks Function()
        > {
  $$AccessEventOutboxTableTableManager(
    _$AppDatabase db,
    $AccessEventOutboxTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AccessEventOutboxTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AccessEventOutboxTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AccessEventOutboxTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> clientEventId = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> siteId = const Value.absent(),
                Value<String> publicationId = const Value.absent(),
                Value<DateTime> occurredAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AccessEventOutboxCompanion(
                clientEventId: clientEventId,
                userId: userId,
                siteId: siteId,
                publicationId: publicationId,
                occurredAt: occurredAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String clientEventId,
                required String userId,
                required String siteId,
                required String publicationId,
                required DateTime occurredAt,
                Value<int> rowid = const Value.absent(),
              }) => AccessEventOutboxCompanion.insert(
                clientEventId: clientEventId,
                userId: userId,
                siteId: siteId,
                publicationId: publicationId,
                occurredAt: occurredAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$AccessEventOutboxTable, AccessEventRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $AccessEventOutboxTable,
                    AccessEventRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AccessEventOutboxTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AccessEventOutboxTable,
      AccessEventRow,
      $$AccessEventOutboxTableFilterComposer,
      $$AccessEventOutboxTableOrderingComposer,
      $$AccessEventOutboxTableAnnotationComposer,
      $$AccessEventOutboxTableCreateCompanionBuilder,
      $$AccessEventOutboxTableUpdateCompanionBuilder,
      (
        AccessEventRow,
        BaseReferences<_$AppDatabase, $AccessEventOutboxTable, AccessEventRow>,
      ),
      AccessEventRow,
      PrefetchHooks Function()
    >;
typedef $$InstalledBasemapsTableCreateCompanionBuilder =
    InstalledBasemapsCompanion Function({
      required String packId,
      required String sectorId,
      required String sectorName,
      required int version,
      required String manifestHash,
      required String manifestText,
      required int totalBytes,
      required DateTime builtAt,
      required DateTime renewAfter,
      required DateTime installedAt,
      Value<String?> signatureKeyId,
      Value<int> rowid,
    });
typedef $$InstalledBasemapsTableUpdateCompanionBuilder =
    InstalledBasemapsCompanion Function({
      Value<String> packId,
      Value<String> sectorId,
      Value<String> sectorName,
      Value<int> version,
      Value<String> manifestHash,
      Value<String> manifestText,
      Value<int> totalBytes,
      Value<DateTime> builtAt,
      Value<DateTime> renewAfter,
      Value<DateTime> installedAt,
      Value<String?> signatureKeyId,
      Value<int> rowid,
    });

class $$InstalledBasemapsTableFilterComposer
    extends Composer<_$AppDatabase, $InstalledBasemapsTable> {
  $$InstalledBasemapsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get packId => $composableBuilder(
    column: $table.packId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sectorId => $composableBuilder(
    column: $table.sectorId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sectorName => $composableBuilder(
    column: $table.sectorName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get version => $composableBuilder(
    column: $table.version,
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

  ColumnFilters<int> get totalBytes => $composableBuilder(
    column: $table.totalBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get builtAt => $composableBuilder(
    column: $table.builtAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get renewAfter => $composableBuilder(
    column: $table.renewAfter,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => ColumnFilters(column),
  );
}

class $$InstalledBasemapsTableOrderingComposer
    extends Composer<_$AppDatabase, $InstalledBasemapsTable> {
  $$InstalledBasemapsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get packId => $composableBuilder(
    column: $table.packId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sectorId => $composableBuilder(
    column: $table.sectorId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sectorName => $composableBuilder(
    column: $table.sectorName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get version => $composableBuilder(
    column: $table.version,
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

  ColumnOrderings<int> get totalBytes => $composableBuilder(
    column: $table.totalBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get builtAt => $composableBuilder(
    column: $table.builtAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get renewAfter => $composableBuilder(
    column: $table.renewAfter,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$InstalledBasemapsTableAnnotationComposer
    extends Composer<_$AppDatabase, $InstalledBasemapsTable> {
  $$InstalledBasemapsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get packId =>
      $composableBuilder(column: $table.packId, builder: (column) => column);

  GeneratedColumn<String> get sectorId =>
      $composableBuilder(column: $table.sectorId, builder: (column) => column);

  GeneratedColumn<String> get sectorName => $composableBuilder(
    column: $table.sectorName,
    builder: (column) => column,
  );

  GeneratedColumn<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => column);

  GeneratedColumn<String> get manifestHash => $composableBuilder(
    column: $table.manifestHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get manifestText => $composableBuilder(
    column: $table.manifestText,
    builder: (column) => column,
  );

  GeneratedColumn<int> get totalBytes => $composableBuilder(
    column: $table.totalBytes,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get builtAt =>
      $composableBuilder(column: $table.builtAt, builder: (column) => column);

  GeneratedColumn<DateTime> get renewAfter => $composableBuilder(
    column: $table.renewAfter,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get installedAt => $composableBuilder(
    column: $table.installedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get signatureKeyId => $composableBuilder(
    column: $table.signatureKeyId,
    builder: (column) => column,
  );
}

class $$InstalledBasemapsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $InstalledBasemapsTable,
          InstalledBasemapRow,
          $$InstalledBasemapsTableFilterComposer,
          $$InstalledBasemapsTableOrderingComposer,
          $$InstalledBasemapsTableAnnotationComposer,
          $$InstalledBasemapsTableCreateCompanionBuilder,
          $$InstalledBasemapsTableUpdateCompanionBuilder,
          (
            InstalledBasemapRow,
            BaseReferences<
              _$AppDatabase,
              $InstalledBasemapsTable,
              InstalledBasemapRow
            >,
          ),
          InstalledBasemapRow,
          PrefetchHooks Function()
        > {
  $$InstalledBasemapsTableTableManager(
    _$AppDatabase db,
    $InstalledBasemapsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$InstalledBasemapsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$InstalledBasemapsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$InstalledBasemapsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> packId = const Value.absent(),
                Value<String> sectorId = const Value.absent(),
                Value<String> sectorName = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<String> manifestHash = const Value.absent(),
                Value<String> manifestText = const Value.absent(),
                Value<int> totalBytes = const Value.absent(),
                Value<DateTime> builtAt = const Value.absent(),
                Value<DateTime> renewAfter = const Value.absent(),
                Value<DateTime> installedAt = const Value.absent(),
                Value<String?> signatureKeyId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => InstalledBasemapsCompanion(
                packId: packId,
                sectorId: sectorId,
                sectorName: sectorName,
                version: version,
                manifestHash: manifestHash,
                manifestText: manifestText,
                totalBytes: totalBytes,
                builtAt: builtAt,
                renewAfter: renewAfter,
                installedAt: installedAt,
                signatureKeyId: signatureKeyId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String packId,
                required String sectorId,
                required String sectorName,
                required int version,
                required String manifestHash,
                required String manifestText,
                required int totalBytes,
                required DateTime builtAt,
                required DateTime renewAfter,
                required DateTime installedAt,
                Value<String?> signatureKeyId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => InstalledBasemapsCompanion.insert(
                packId: packId,
                sectorId: sectorId,
                sectorName: sectorName,
                version: version,
                manifestHash: manifestHash,
                manifestText: manifestText,
                totalBytes: totalBytes,
                builtAt: builtAt,
                renewAfter: renewAfter,
                installedAt: installedAt,
                signatureKeyId: signatureKeyId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$InstalledBasemapsTable, InstalledBasemapRow>(
                    table,
                  ),
                  BaseReferences<
                    _$AppDatabase,
                    $InstalledBasemapsTable,
                    InstalledBasemapRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$InstalledBasemapsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $InstalledBasemapsTable,
      InstalledBasemapRow,
      $$InstalledBasemapsTableFilterComposer,
      $$InstalledBasemapsTableOrderingComposer,
      $$InstalledBasemapsTableAnnotationComposer,
      $$InstalledBasemapsTableCreateCompanionBuilder,
      $$InstalledBasemapsTableUpdateCompanionBuilder,
      (
        InstalledBasemapRow,
        BaseReferences<
          _$AppDatabase,
          $InstalledBasemapsTable,
          InstalledBasemapRow
        >,
      ),
      InstalledBasemapRow,
      PrefetchHooks Function()
    >;
typedef $$TrustedKeysetsTableCreateCompanionBuilder =
    TrustedKeysetsCompanion Function({
      Value<int> id,
      required int sequence,
      required String keysetText,
      required String rootKeyId,
      required String signature,
      required DateTime receivedAt,
    });
typedef $$TrustedKeysetsTableUpdateCompanionBuilder =
    TrustedKeysetsCompanion Function({
      Value<int> id,
      Value<int> sequence,
      Value<String> keysetText,
      Value<String> rootKeyId,
      Value<String> signature,
      Value<DateTime> receivedAt,
    });

class $$TrustedKeysetsTableFilterComposer
    extends Composer<_$AppDatabase, $TrustedKeysetsTable> {
  $$TrustedKeysetsTableFilterComposer({
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

  ColumnFilters<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get keysetText => $composableBuilder(
    column: $table.keysetText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get rootKeyId => $composableBuilder(
    column: $table.rootKeyId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get signature => $composableBuilder(
    column: $table.signature,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TrustedKeysetsTableOrderingComposer
    extends Composer<_$AppDatabase, $TrustedKeysetsTable> {
  $$TrustedKeysetsTableOrderingComposer({
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

  ColumnOrderings<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get keysetText => $composableBuilder(
    column: $table.keysetText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get rootKeyId => $composableBuilder(
    column: $table.rootKeyId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get signature => $composableBuilder(
    column: $table.signature,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TrustedKeysetsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TrustedKeysetsTable> {
  $$TrustedKeysetsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get sequence =>
      $composableBuilder(column: $table.sequence, builder: (column) => column);

  GeneratedColumn<String> get keysetText => $composableBuilder(
    column: $table.keysetText,
    builder: (column) => column,
  );

  GeneratedColumn<String> get rootKeyId =>
      $composableBuilder(column: $table.rootKeyId, builder: (column) => column);

  GeneratedColumn<String> get signature =>
      $composableBuilder(column: $table.signature, builder: (column) => column);

  GeneratedColumn<DateTime> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => column,
  );
}

class $$TrustedKeysetsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TrustedKeysetsTable,
          TrustedKeysetRow,
          $$TrustedKeysetsTableFilterComposer,
          $$TrustedKeysetsTableOrderingComposer,
          $$TrustedKeysetsTableAnnotationComposer,
          $$TrustedKeysetsTableCreateCompanionBuilder,
          $$TrustedKeysetsTableUpdateCompanionBuilder,
          (
            TrustedKeysetRow,
            BaseReferences<
              _$AppDatabase,
              $TrustedKeysetsTable,
              TrustedKeysetRow
            >,
          ),
          TrustedKeysetRow,
          PrefetchHooks Function()
        > {
  $$TrustedKeysetsTableTableManager(
    _$AppDatabase db,
    $TrustedKeysetsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TrustedKeysetsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TrustedKeysetsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TrustedKeysetsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> sequence = const Value.absent(),
                Value<String> keysetText = const Value.absent(),
                Value<String> rootKeyId = const Value.absent(),
                Value<String> signature = const Value.absent(),
                Value<DateTime> receivedAt = const Value.absent(),
              }) => TrustedKeysetsCompanion(
                id: id,
                sequence: sequence,
                keysetText: keysetText,
                rootKeyId: rootKeyId,
                signature: signature,
                receivedAt: receivedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int sequence,
                required String keysetText,
                required String rootKeyId,
                required String signature,
                required DateTime receivedAt,
              }) => TrustedKeysetsCompanion.insert(
                id: id,
                sequence: sequence,
                keysetText: keysetText,
                rootKeyId: rootKeyId,
                signature: signature,
                receivedAt: receivedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$TrustedKeysetsTable, TrustedKeysetRow>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $TrustedKeysetsTable,
                    TrustedKeysetRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TrustedKeysetsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TrustedKeysetsTable,
      TrustedKeysetRow,
      $$TrustedKeysetsTableFilterComposer,
      $$TrustedKeysetsTableOrderingComposer,
      $$TrustedKeysetsTableAnnotationComposer,
      $$TrustedKeysetsTableCreateCompanionBuilder,
      $$TrustedKeysetsTableUpdateCompanionBuilder,
      (
        TrustedKeysetRow,
        BaseReferences<_$AppDatabase, $TrustedKeysetsTable, TrustedKeysetRow>,
      ),
      TrustedKeysetRow,
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
  $$FieldReportsTableTableManager get fieldReports =>
      $$FieldReportsTableTableManager(_db, _db.fieldReports);
  $$FieldReportPhotosTableTableManager get fieldReportPhotos =>
      $$FieldReportPhotosTableTableManager(_db, _db.fieldReportPhotos);
  $$OnDemandSitesTableTableManager get onDemandSites =>
      $$OnDemandSitesTableTableManager(_db, _db.onDemandSites);
  $$SensitiveSitesTableTableManager get sensitiveSites =>
      $$SensitiveSitesTableTableManager(_db, _db.sensitiveSites);
  $$SensitiveFilesTableTableManager get sensitiveFiles =>
      $$SensitiveFilesTableTableManager(_db, _db.sensitiveFiles);
  $$AccessEventOutboxTableTableManager get accessEventOutbox =>
      $$AccessEventOutboxTableTableManager(_db, _db.accessEventOutbox);
  $$InstalledBasemapsTableTableManager get installedBasemaps =>
      $$InstalledBasemapsTableTableManager(_db, _db.installedBasemaps);
  $$TrustedKeysetsTableTableManager get trustedKeysets =>
      $$TrustedKeysetsTableTableManager(_db, _db.trustedKeysets);
}
