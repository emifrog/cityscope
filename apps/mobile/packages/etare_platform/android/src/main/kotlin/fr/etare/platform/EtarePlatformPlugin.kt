package fr.etare.platform

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.WindowManager
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.Executors

/**
 * Android services of the OPS application (SEC-05, CAP-02):
 * - the terminal key, an ECDSA P-256 key of the Android Keystore that never leaves it
 *   (StrongBox when the tablet has one, the trusted environment otherwise);
 * - the monotonic clock (time since boot, deep sleep included) and the boot count;
 * - the free space of a volume;
 * - FLAG_SECURE: no screenshot, no preview in the recent applications.
 */
class EtarePlatformPlugin : FlutterPlugin, MethodCallHandler, ActivityAware {
  private lateinit var channel: MethodChannel
  private var context: Context? = null
  private var activity: Activity? = null

  /** Applied to the activity as soon as it attaches: protected until the policy says otherwise. */
  private var secureWindow = true

  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    context = binding.applicationContext
    channel = MethodChannel(binding.binaryMessenger, CHANNEL)
    channel.setMethodCallHandler(this)
  }

  override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    channel.setMethodCallHandler(null)
    context = null
    worker.shutdown()
  }

  override fun onMethodCall(call: MethodCall, result: Result) {
    when (call.method) {
      "monotonicTime" -> result.success(monotonicTime())
      "availableBytes" -> result.success(StatFs(call.argument<String>("path")).availableBytes)
      "setSecureWindow" -> {
        secureWindow = call.argument<Boolean>("secure") ?: true
        applySecureWindow()
        result.success(null)
      }
      // Keystore operations can take a second with StrongBox: never on the main thread.
      "createDeviceKey", "devicePublicKey", "signWithDeviceKey", "deleteDeviceKey", "deviceKeySecurity" ->
        worker.execute {
          try {
            val value = keystoreCall(call)
            main.post { result.success(value) }
          } catch (error: Exception) {
            main.post { result.error("KEYSTORE", error.javaClass.simpleName + ": " + error.message, null) }
          }
        }
      else -> result.notImplemented()
    }
  }

  private fun monotonicTime(): Map<String, Long> {
    val resolver = context?.contentResolver
    val bootCount =
      if (resolver == null) -1L else Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT, -1).toLong()
    return mapOf("elapsedMs" to SystemClock.elapsedRealtime(), "bootCount" to bootCount)
  }

  private fun keystoreCall(call: MethodCall): Any? {
    val alias = call.argument<String>("alias") ?: throw IllegalArgumentException("alias")
    val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    return when (call.method) {
      "createDeviceKey" -> {
        if (!keyStore.containsAlias(alias)) generate(alias)
        publicKey(keyStore, alias)
      }
      "devicePublicKey" -> if (keyStore.containsAlias(alias)) publicKey(keyStore, alias) else null
      "signWithDeviceKey" -> {
        val key = keyStore.getKey(alias, null) as? PrivateKey ?: throw IllegalStateException("no key $alias")
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(key)
        signature.update((call.argument<String>("text") ?: "").toByteArray(Charsets.UTF_8))
        Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
      }
      "deleteDeviceKey" -> {
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        null
      }
      "deviceKeySecurity" -> {
        val key = keyStore.getKey(alias, null) as? PrivateKey ?: return null
        val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          when (info.securityLevel) {
            KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
            KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
            KeyProperties.SECURITY_LEVEL_SOFTWARE -> "software"
            else -> "unknown"
          }
        } else {
          @Suppress("DEPRECATION")
          if (info.isInsideSecureHardware) "tee" else "software"
        }
      }
      else -> null
    }
  }

  /** P-256 for signing with SHA-256 only; StrongBox first, the trusted environment otherwise. */
  private fun generate(alias: String) {
    fun spec(strongBox: Boolean): KeyGenParameterSpec {
      val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
      if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setIsStrongBoxBacked(true)
      return builder.build()
    }
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    try {
      generator.initialize(spec(strongBox = true))
      generator.generateKeyPair()
    } catch (unavailable: Exception) {
      // No StrongBox on this tablet (StrongBoxUnavailableException, wrapped or not): the trusted environment.
      generator.initialize(spec(strongBox = false))
      generator.generateKeyPair()
    }
  }

  /** SubjectPublicKeyInfo (DER), base64: what the server stores and verifies with. */
  private fun publicKey(keyStore: KeyStore, alias: String): String =
    Base64.encodeToString(keyStore.getCertificate(alias).publicKey.encoded, Base64.NO_WRAP)

  private fun applySecureWindow() {
    val current = activity ?: return
    current.runOnUiThread {
      if (secureWindow) {
        current.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      } else {
        current.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
    }
  }

  override fun onAttachedToActivity(binding: ActivityPluginBinding) {
    activity = binding.activity
    applySecureWindow()
  }

  override fun onDetachedFromActivityForConfigChanges() {
    activity = null
  }

  override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
    activity = binding.activity
    applySecureWindow()
  }

  override fun onDetachedFromActivity() {
    activity = null
  }

  private companion object {
    const val CHANNEL = "fr.etare.platform"
    const val KEYSTORE = "AndroidKeyStore"
  }
}
