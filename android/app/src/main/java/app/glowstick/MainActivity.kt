package app.glowstick

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.Manifest
import android.content.pm.PackageManager
import android.telephony.SmsManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.util.Base64
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Glowstick: one WebView showing the bundled app (assets/app/index.html) from the fake origin
 * https://glowstick.local so localStorage persists. No INTERNET permission: nothing leaves the phone.
 * window.Glowstick is the bridge the page uses for notification capture and saving exports.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF070410.toInt())
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.setSupportZoom(false)
        s.textZoom = 100
        web.addJavascriptInterface(Bridge(), "Glowstick")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.host != HOST) return null
                return serve(u.path ?: "/")
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: Exception) {}
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                val i = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                try { startActivityForResult(Intent.createChooser(i, "Choose file"), REQ_FILE) } catch (e: Exception) { fileCb = null; return false }
                return true
            }
            // Debug builds only: page console output can include whatever the page logs, so release builds drop it.
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.d("GlowstickJS", "${m.message()} @${m.lineNumber()}")
                return true
            }
        }
        if (savedInstanceState == null) web.loadUrl("https://$HOST/app/index.html") else web.restoreState(savedInstanceState)
        offerHomeScreenIcon()
    }

    /** First launch: ask the launcher to pin an icon on the home screen (system dialog, one tap). */
    private fun offerHomeScreenIcon() {
        val prefs = getSharedPreferences("glowstick.app", MODE_PRIVATE)
        if (prefs.getBoolean("pinAsked", false)) return
        prefs.edit().putBoolean("pinAsked", true).apply()
        try {
            val sm = getSystemService(ShortcutManager::class.java) ?: return
            if (!sm.isRequestPinShortcutSupported) return
            val launch = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val info = ShortcutInfo.Builder(this, "glowstick.main").setShortLabel("Glowstick").setLongLabel("Glowstick").setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher)).setIntent(launch).build()
            web.postDelayed({ try { sm.requestPinShortcut(info, null) } catch (e: Exception) {} }, 1500)
        } catch (e: Exception) { }
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null) }
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            val cb = fileCb ?: return; fileCb = null
            val u = data?.data
            cb.onReceiveValue(if (u == null) null else arrayOf(u))
        }
    }

    /** Serve an asset. HTML pages get the download shim injected. */
    private fun serve(path: String): WebResourceResponse {
        var p = path.trimStart('/')
        if (p.isEmpty() || p.endsWith("/")) p += "index.html"
        val ext = p.substringAfterLast('.', "").lowercase()
        val mime = MIME[ext] ?: "application/octet-stream"
        val headers = hashMapOf("Cache-Control" to "no-store")
        return try {
            if (ext == "html" || ext == "htm") {
                val html = assets.open(p).bufferedReader().readText()
                val patched = html.replaceFirst(Regex("(?i)<head[^>]*>"), "$0<script>$SHIM</script>")
                val r = WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(patched.toByteArray()))
                r.responseHeaders = headers; r
            } else {
                val enc = if (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")) "utf-8" else null
                val r = WebResourceResponse(mime, enc, assets.open(p))
                r.responseHeaders = headers; r
            }
        } catch (e: Exception) {
            val r = WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream("not found: $p".toByteArray()))
            r.setStatusCodeAndReasonPhrase(404, "Not Found"); r.responseHeaders = headers; r
        }
    }

    /** window.Glowstick in the page. */
    inner class Bridge {
        @JavascriptInterface fun toast(s: String) { runOnUiThread { Toast.makeText(this@MainActivity, s, Toast.LENGTH_SHORT).show() } }
        @JavascriptInterface fun hasAccess(): String = if (NotifListener.Store.hasAccess(this@MainActivity)) "1" else "0"
        @JavascriptInterface fun openAccess() {
            runOnUiThread { try { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) } catch (e: Exception) { toast("Open Settings → Notifications → Notification access") } }
        }
        @JavascriptInterface fun pull(): String = NotifListener.Store.pull(this@MainActivity)
        @JavascriptInterface fun ack(idsJson: String) { try { NotifListener.Store.ack(this@MainActivity, idsJson) } catch (e: Exception) {} }
        @JavascriptInterface fun apps(): String = NotifListener.Store.apps(this@MainActivity)

        /** "1" when this build's manifest declares SEND_SMS at all (personal flavor). The store flavor answers "0",
         *  and the page then never offers "Send automatically". */
        @JavascriptInterface fun smsSupported(): String = if (smsDeclared()) "1" else "0"
        @JavascriptInterface fun hasSms(): String = if (smsDeclared() && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) "1" else "0"
        @JavascriptInterface fun requestSms() {
            if (!smsDeclared()) return
            runOnUiThread { try { ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.SEND_SMS), REQ_SMS) } catch (e: Exception) {} }
        }
        /** Sends silently when permitted; returns "1" on success so the page can fall back to the composer otherwise.
         *  Never throws: without the permission (denied, revoked, or not in this flavor's manifest) it returns "0".
         *  The message body is never logged. */
        @JavascriptInterface fun sendSms(number: String, text: String): String {
            if (hasSms() != "1") return "0"
            return try {
                val sm = if (Build.VERSION.SDK_INT >= 31) getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
                val parts = sm.divideMessage(text)
                sm.sendMultipartTextMessage(number, null, parts, null, null)
                "1"
            } catch (e: Exception) { toast("Text failed; opening the composer instead"); "0" }
        }

        @JavascriptInterface fun saveFile(name: String, base64: String, mime: String): String {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val safe = name.replace(Regex("[^A-Za-z0-9._ -]"), "_")
            return try {
                if (Build.VERSION.SDK_INT >= 29) {
                    val cv = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, if (mime.isBlank()) "application/octet-stream" else mime)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: throw Exception("insert failed")
                    contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS); dir.mkdirs()
                    FileOutputStream(File(dir, safe)).use { it.write(bytes) }
                }
                toast("Saved to Downloads/$safe"); "Downloads/$safe"
            } catch (e: Exception) { toast("Save failed: ${e.message}"); "" }
        }
    }

    /** True only if SEND_SMS is in this APK's merged manifest (personal flavor). Requesting or checking a permission
     *  that is not declared is pointless (always denied), so every SMS path is gated on this. */
    private fun smsDeclared(): Boolean = try {
        val info = if (Build.VERSION.SDK_INT >= 33) packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
                   else @Suppress("DEPRECATION") packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
        info.requestedPermissions?.contains(Manifest.permission.SEND_SMS) == true
    } catch (e: Exception) { false }

    companion object {
        const val HOST = "glowstick.local"
        const val REQ_FILE = 11
        const val REQ_SMS = 12
        val MIME = mapOf("html" to "text/html", "htm" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript", "css" to "text/css",
            "json" to "application/json", "png" to "image/png", "svg" to "image/svg+xml", "woff2" to "font/woff2", "txt" to "text/plain", "csv" to "text/csv")
        // Routes <a download> clicks (blob:/data: URLs) to Downloads via the bridge.
        const val SHIM = """(function(){if(!window.Glowstick)return;
function b64(buf){var u=new Uint8Array(buf),s='',CH=0x8000;for(var i=0;i<u.length;i+=CH)s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));return btoa(s)}
function saveBlob(blob,name){blob.arrayBuffer().then(function(ab){Glowstick.saveFile(name||'download',b64(ab),blob.type||'')})}
var origClick=HTMLAnchorElement.prototype.click;
function intercept(a){if(!a||!a.hasAttribute||!a.hasAttribute('download'))return false;var href=a.getAttribute('href')||'';if(!/^(blob:|data:)/.test(href))return false;
var name=a.getAttribute('download')||'download';fetch(href).then(function(r){return r.blob()}).then(function(b){saveBlob(b,name)}).catch(function(e){Glowstick.toast('Save failed: '+e)});return true}
HTMLAnchorElement.prototype.click=function(){if(intercept(this))return;return origClick.apply(this,arguments)};
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[download]');if(a&&intercept(a)){ev.preventDefault();ev.stopPropagation()}},true);
})();"""
    }
}
