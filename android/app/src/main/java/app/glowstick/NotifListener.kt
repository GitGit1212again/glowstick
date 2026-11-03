package app.glowstick

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures posted notifications into a small queue that the page pulls through the Glowstick bridge.
 * Only runs once the user grants Notification access in system settings. Nothing is sent anywhere;
 * the queue lives in this app's SharedPreferences and is trimmed to the newest 400 entries.
 */
class NotifListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val ex = sbn.notification.extras ?: return
            val title = ex.getCharSequence("android.title")?.toString() ?: ""
            val text = (ex.getCharSequence("android.bigText") ?: ex.getCharSequence("android.text"))?.toString() ?: ""
            if (title.isBlank() && text.isBlank()) return
            if (sbn.packageName == packageName) return
            if (sbn.isOngoing) return
            val appName = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString() } catch (e: Exception) { sbn.packageName }
            Store.push(this, JSONObject().apply {
                put("id", sbn.packageName + ":" + sbn.postTime + ":" + (title + text).hashCode())
                put("pkg", sbn.packageName)
                put("app", appName)
                put("title", title)
                put("text", text)
                put("time", sbn.postTime)
            })
            Store.countApp(this, sbn.packageName, appName)
        } catch (e: Exception) { }
    }

    object Store {
        private const val PREFS = "glowstick.notif"
        private const val MAX = 400

        private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        @Synchronized fun push(c: Context, o: JSONObject) {
            val arr = JSONArray(prefs(c).getString("queue", "[]"))
            arr.put(o)
            val trimmed = if (arr.length() > MAX) JSONArray().also { for (i in arr.length() - MAX until arr.length()) it.put(arr.get(i)) } else arr
            prefs(c).edit().putString("queue", trimmed.toString()).apply()
        }

        @Synchronized fun pull(c: Context): String = prefs(c).getString("queue", "[]") ?: "[]"

        @Synchronized fun ack(c: Context, idsJson: String) {
            val ids = HashSet<String>()
            val a = JSONArray(idsJson)
            for (i in 0 until a.length()) ids.add(a.getString(i))
            val arr = JSONArray(prefs(c).getString("queue", "[]"))
            val keep = JSONArray()
            for (i in 0 until arr.length()) { val o = arr.getJSONObject(i); if (!ids.contains(o.optString("id"))) keep.put(o) }
            prefs(c).edit().putString("queue", keep.toString()).apply()
        }

        @Synchronized fun countApp(c: Context, pkg: String, app: String) {
            val obj = JSONObject(prefs(c).getString("apps", "{}") ?: "{}")
            val e = obj.optJSONObject(pkg) ?: JSONObject().put("app", app).put("count", 0)
            e.put("count", e.optInt("count") + 1)
            obj.put(pkg, e)
            prefs(c).edit().putString("apps", obj.toString()).apply()
        }

        fun apps(c: Context): String {
            val obj = JSONObject(prefs(c).getString("apps", "{}") ?: "{}")
            val out = JSONArray()
            for (k in obj.keys()) { val e = obj.getJSONObject(k); out.put(JSONObject().put("pkg", k).put("app", e.optString("app")).put("count", e.optInt("count"))) }
            return out.toString()
        }

        fun hasAccess(c: Context): Boolean {
            val flat = Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners") ?: return false
            val me = ComponentName(c, NotifListener::class.java)
            return flat.split(":").any { ComponentName.unflattenFromString(it) == me }
        }
    }
}
