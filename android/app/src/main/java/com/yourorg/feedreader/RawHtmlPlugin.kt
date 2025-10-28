package com.yourorg.feedreader

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "RawHtml")
class RawHtmlPlugin : Plugin() {
    private val client = OkHttpClient()

    init {
        android.util.Log.d("RawHtmlPlugin", "RawHtmlPlugin initialized!")
    }

    @PluginMethod
    fun fetchRawHtml(call: PluginCall) {
        android.util.Log.d("RawHtmlPlugin", "fetchRawHtml called with url: ${call.getString("url")}")
        val url = call.getString("url") ?: run {
            call.reject("Missing url")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val req = Request.Builder().url(url).header("User-Agent", "FeedReader/1.0").build()
                val res: Response = client.newCall(req).execute()
                val body = res.body?.string() ?: ""
                val ret = JSObject()
                ret.put("html", body)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Fetch failed", e)
            }
        }
    }
}
