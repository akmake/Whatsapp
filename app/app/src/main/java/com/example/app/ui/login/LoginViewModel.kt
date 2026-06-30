package com.example.app.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepo: AuthRepository,
) : ViewModel() {

    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    fun submit() {
        if (email.isBlank() || password.isBlank()) {
            error = "יש להזין אימייל וסיסמה"
            return
        }
        viewModelScope.launch {
            loading = true
            error = null
            val result = authRepo.login(email, password)
            loading = false
            result.onFailure { error = it.message ?: "שגיאה בהתחברות" }
            // בהצלחה — tokenFlow מתעדכן וה-Gate מעביר אוטומטית לדשבורד
        }
    }
}
