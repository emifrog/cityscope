import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Signature de release (EXP-04, ADR-030) : clé détenue par l'exploitant, jamais dans le dépôt.
// Propriétés lues dans le fichier désigné par ETARE_ANDROID_SIGNING, sinon dans
// android/key.properties (ignoré par git) : storeFile, storePassword, keyAlias, keyPassword.
val signingFile = System.getenv("ETARE_ANDROID_SIGNING")?.let { file(it) }
    ?: rootProject.file("key.properties")
val signing = Properties().apply {
    if (signingFile.isFile) signingFile.inputStream().use { load(it) }
}
val hasReleaseKey = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .all { !signing.getProperty(it).isNullOrBlank() }

android {
    // Identifiant définitif (EXP-04) : il ne change plus, une tablette ne met à jour que
    // l'application de même identifiant et de même clé.
    namespace = "fr.etare.ops"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "fr.etare.ops"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Production et préproduction s'installent côte à côte sur une même tablette.
    flavorDimensions += "environment"
    productFlavors {
        create("prod") {
            dimension = "environment"
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-preprod"
        }
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Jamais la clé de debug : sans clé de release, la construction s'arrête (plus bas).
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else null
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

// Une release non signée, ou signée par la clé de debug, ne doit jamais sortir.
tasks.configureEach {
    if (name.startsWith("package") && name.endsWith("Release")) {
        doFirst {
            if (!hasReleaseKey) {
                throw GradleException(
                    "Clé de signature de release absente : définissez ETARE_ANDROID_SIGNING " +
                        "(fichier de propriétés hors dépôt), voir docs/exploitation/livraison-mobile.md.",
                )
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
