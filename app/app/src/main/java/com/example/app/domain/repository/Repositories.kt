package com.example.app.domain.repository

import com.example.app.domain.model.Account
import com.example.app.domain.model.Stats
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.UserInfo
import com.example.app.domain.model.Viewer
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    fun isLoggedIn(): Flow<Boolean>
    suspend fun savedAccountId(): String?
    suspend fun savedName(): String?
    suspend fun login(email: String, password: String): Result<UserInfo>
    suspend fun logout()
}

interface BtbRepository {
    suspend fun account(id: String): Account
    suspend fun stats(id: String): Stats
    suspend fun statuses(id: String): List<StatusItem>
    suspend fun statusViewers(id: String, statusId: String): List<Viewer>
    suspend fun topViewers(id: String): List<Viewer>
    /** מעלה (תמונה/וידאו/טקסט) וממתין לסיום העבודה ברקע. מחזיר מספר הסטטוסים שפורסמו. */
    suspend fun uploadAndAwait(
        id: String,
        type: String,
        caption: String,
        bgColor: String,
        font: Int,
        videoQuality: String,
        bytes: ByteArray?,
        fileName: String?,
        mime: String?,
    ): Result<Int>
}
