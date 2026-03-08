package com.alalouche.sunmibridge

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var jsBridge: SunmiJsBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        jsBridge = SunmiJsBridge(this)

        setupWebView()
        loadConfiguredUrl()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                Log.i(TAG, "WebView loaded: $url")
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                Log.e(TAG, "WebView error: ${error?.description}")
                super.onReceivedError(view, request, error)
            }
        }

        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(jsBridge, BRIDGE_NAME)
    }

    private fun loadConfiguredUrl() {
        val fromIntent = intent.getStringExtra("WEB_APP_URL")?.trim()
        val url = if (!fromIntent.isNullOrBlank()) fromIntent else BuildConfig.DEFAULT_WEB_APP_URL
        Log.i(TAG, "Loading web app URL: $url")
        webView.loadUrl(url)
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface(BRIDGE_NAME)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "SunmiBridgePoC"
        const val BRIDGE_NAME = "SunmiBridge"
    }
}
