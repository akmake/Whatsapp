package com.example.app.data.repository

import com.example.app.data.local.TokenStore
import com.example.app.data.remote.ApiService
import com.example.app.data.remote.dto.LoginRequest
import com.example.app.data.remote.dto.UserDto
import com.example.app.domain.model.UserInfo
import com.example.app.domain.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: ApiService,
    private val store: TokenStore,
) : AuthRepository {

    override fun isLoggedIn(): Flow<Boolean> = store.tokenFlow.map { !it.isNullOrBlank() }

    override suspend fun savedAccountId(): String? = store.accountId()
    override suspend fun savedName(): String? = store.name()

    override suspend fun login(email: String, password: String): Result<UserInfo> {
        return try {
            val res = api.login(LoginRequest(email.trim(), password))
            val user = res.data?.user
            val token = res.token
            if (token.isNullOrBlank() || user?.id == null) {
                Result.failure(Exception("תגובת שרת לא תקינה"))
            } else {
                store.save(token, user.btbAccountId, user.name)
                Result.success(user.toModel())
            }
        } catch (e: retrofit2.HttpException) {
            Result.failure(Exception(if (e.code() == 401) "אימייל או סיסמה שגויים" else "שגיאת שרת (${e.code()})"))
        } catch (e: Exception) {
            Result.failure(Exception("בעיית תקשורת — בדוק את החיבור לאינטרנט"))
        }
    }

    override suspend fun logout() = store.clear()
}

fun UserDto.toModel() = UserInfo(
    id = id.orEmpty(),
    email = email.orEmpty(),
    role = role.orEmpty(),
    btbAccountId = btbAccountId,
    name = name,
)
