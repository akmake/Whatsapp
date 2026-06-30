package com.example.app.ui.dashboard

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.app.domain.model.Account
import com.example.app.domain.model.Stats
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.Viewer
import com.example.app.domain.repository.AuthRepository
import com.example.app.domain.repository.BtbRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.Job
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val authRepo: AuthRepository,
    private val btbRepo: BtbRepository,
) : ViewModel() {

    private var accountId: String? = null
    private var refreshJob: Job? = null

    var account by mutableStateOf<Account?>(null); private set
    var stats by mutableStateOf<Stats?>(null); private set
    var statuses by mutableStateOf<List<StatusItem>>(emptyList()); private set
    var followers by mutableStateOf<List<Viewer>>(emptyList()); private set
    var loading by mutableStateOf(true); private set
    var error by mutableStateOf<String?>(null); private set

    var selStatus by mutableStateOf<StatusItem?>(null); private set
    var selViewers by mutableStateOf<List<Viewer>?>(null); private set

    fun refresh() {
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            if (accountId.isNullOrBlank()) accountId = authRepo.savedAccountId()
            val id = accountId
            if (id.isNullOrBlank()) {
                loading = false
                error = "אין חשבון משויך — פנה למנהל"
                return@launch
            }
            try {
                coroutineScope {
                    val accountCall = async { btbRepo.account(id) }
                    val statsCall = async { btbRepo.stats(id) }
                    val statusesCall = async { btbRepo.statuses(id) }
                    val followersCall = async { btbRepo.topViewers(id) }
                    account = accountCall.await()
                    stats = statsCall.await()
                    statuses = statusesCall.await()
                    followers = followersCall.await()
                }
                selStatus?.let { selected ->
                    selStatus = statuses.firstOrNull { it.id == selected.id } ?: selected
                }
                error = null
            } catch (e: Exception) {
                error = "שגיאה בטעינת הנתונים — משוך לרענון"
            } finally {
                loading = false
            }
        }
    }

    fun openViewers(s: StatusItem) {
        selStatus = s
        selViewers = null
        val id = accountId ?: return
        viewModelScope.launch {
            selViewers = try { btbRepo.statusViewers(id, s.id) } catch (e: Exception) { emptyList() }
        }
    }

    fun closeViewers() {
        selStatus = null
        selViewers = null
    }

    fun logout() {
        viewModelScope.launch { authRepo.logout() }
    }
}
