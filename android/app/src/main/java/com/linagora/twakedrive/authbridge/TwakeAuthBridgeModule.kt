package com.linagora.twakedrive.authbridge

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.linagora.twakedrive.fileprovider.EncryptedCredentialStore
import com.linagora.twakedrive.fileprovider.SessionStore
import okhttp3.OkHttpClient
import org.json.JSONObject

class TwakeAuthBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val session by lazy {
        SessionStore(EncryptedCredentialStore(reactApplicationContext), OkHttpClient())
    }

    override fun getName(): String = "TwakeAuthBridge"

    @ReactMethod
    fun syncSession(json: String, promise: Promise) {
        try {
            val o = JSONObject(json)
            session.saveSession(
                o.getString("uri"),
                o.getString("clientId"),
                o.getString("clientSecret"),
                o.getString("refreshToken")
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SYNC_SESSION", e)
        }
    }

    @ReactMethod
    fun clearSession(promise: Promise) {
        try {
            session.clear()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_CLEAR_SESSION", e)
        }
    }
}
