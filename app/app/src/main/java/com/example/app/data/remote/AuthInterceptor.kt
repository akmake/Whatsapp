package com.example.app.data.remote

import com.example.app.data.local.TokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * מצרף Authorization: Bearer <token> לכל בקשה.
 * אם השרת מחזיר 401/403 (token פג / לקוח הושבת) — מנקה את ה-token,
 * וה-Gate יחזיר אוטומטית למסך הכניסה.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenStore.token() }
        val request = chain.request().newBuilder().apply {
            if (!token.isNullOrBlank()) addHeader("Authorization", "Bearer $token")
        }.build()

        val response = chain.proceed(request)

        // אם היה לנו token והוא נדחה — מנתקים (לא על בקשת ה-login עצמה)
        if ((response.code == 401 || response.code == 403) &&
            !token.isNullOrBlank() &&
            !request.url.encodedPath.endsWith("/auth/login")
        ) {
            runBlocking { tokenStore.clear() }
        }
        return response
    }
}
