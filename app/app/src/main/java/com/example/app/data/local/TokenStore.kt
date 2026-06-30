package com.example.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "btb_auth")

/** שמירת ה-token והחשבון על המכשיר — כך הלקוח נשאר מחובר "לתמיד". */
@Singleton
class TokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val keyToken = stringPreferencesKey("token")
    private val keyAccount = stringPreferencesKey("account_id")
    private val keyName = stringPreferencesKey("name")

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[keyToken] }

    suspend fun token(): String? = context.dataStore.data.first()[keyToken]
    suspend fun accountId(): String? = context.dataStore.data.first()[keyAccount]
    suspend fun name(): String? = context.dataStore.data.first()[keyName]

    suspend fun save(token: String, accountId: String?, name: String?) {
        context.dataStore.edit {
            it[keyToken] = token
            if (!accountId.isNullOrBlank()) it[keyAccount] = accountId else it.remove(keyAccount)
            if (!name.isNullOrBlank()) it[keyName] = name else it.remove(keyName)
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
