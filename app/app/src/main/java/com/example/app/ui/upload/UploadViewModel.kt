package com.example.app.ui.upload

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.app.domain.repository.AuthRepository
import com.example.app.domain.repository.BtbRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@HiltViewModel
class UploadViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepo: AuthRepository,
    private val btbRepo: BtbRepository,
) : ViewModel() {

    var type by mutableStateOf("image")   // image | video | text
    var uri by mutableStateOf<Uri?>(null)
    var fileName by mutableStateOf<String?>(null)
    var caption by mutableStateOf("")
    var bgColor by mutableStateOf("#0B6B45")
    var font by mutableStateOf(0)
    var uploading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var doneCount by mutableStateOf<Int?>(null)

    fun updateType(t: String) {
        if (type != t) {
            uri = null
            fileName = null
            error = null
        }
        type = t
    }

    fun setFile(u: Uri?) {
        uri = u
        fileName = u?.let { queryName(it) }
    }

    fun submit() {
        if (type != "text" && uri == null) { error = "בחר תמונה או וידאו"; return }
        if (type == "text" && caption.isBlank()) { error = "הקלד טקסט"; return }
        viewModelScope.launch {
            uploading = true; error = null
            val accountId = authRepo.savedAccountId()
            if (accountId.isNullOrBlank()) { error = "אין חשבון משויך"; uploading = false; return@launch }

            var bytes: ByteArray? = null
            var mime: String? = null
            if (type != "text") {
                val u = uri!!
                val read = withContext(Dispatchers.IO) {
                    try {
                        val m = context.contentResolver.getType(u)
                        val b = context.contentResolver.openInputStream(u)?.use { it.readBytes() }
                        b to m
                    } catch (e: Exception) { null to null }
                }
                bytes = read.first; mime = read.second
                if (bytes == null) { error = "לא ניתן לקרוא את הקובץ"; uploading = false; return@launch }
            }

            val res = btbRepo.uploadAndAwait(accountId, type, caption, bgColor, font, bytes, fileName, mime)
            uploading = false
            res.onSuccess { doneCount = it }.onFailure { error = it.message ?: "ההעלאה נכשלה" }
        }
    }

    private fun queryName(u: Uri): String {
        return try {
            context.contentResolver.query(u, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
            } ?: u.lastPathSegment ?: "upload"
        } catch (e: Exception) {
            u.lastPathSegment ?: "upload"
        }
    }
}
