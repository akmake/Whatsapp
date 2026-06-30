package com.example.app.data.remote

import com.example.app.data.remote.dto.AccountDto
import com.example.app.data.remote.dto.AudienceDto
import com.example.app.data.remote.dto.JobDto
import com.example.app.data.remote.dto.JobStartDto
import com.example.app.data.remote.dto.LoginRequest
import com.example.app.data.remote.dto.LoginResponse
import com.example.app.data.remote.dto.MeResponse
import com.example.app.data.remote.dto.StatsDto
import com.example.app.data.remote.dto.StatusDto
import com.example.app.data.remote.dto.ViewerDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @GET("btb/{id}")
    suspend fun account(@Path("id") id: String): AccountDto

    @GET("btb/{id}/stats")
    suspend fun stats(@Path("id") id: String): StatsDto

    @GET("btb/{id}/statuses")
    suspend fun statuses(@Path("id") id: String, @Query("limit") limit: Int = 50): List<StatusDto>

    @GET("btb/{id}/statuses/{statusId}/viewers")
    suspend fun statusViewers(@Path("id") id: String, @Path("statusId") statusId: String): List<ViewerDto>

    @GET("btb/{id}/top-viewers")
    suspend fun topViewers(@Path("id") id: String, @Query("limit") limit: Int = 100): List<ViewerDto>

    @GET("btb/{id}/audience")
    suspend fun audience(@Path("id") id: String): AudienceDto

    @Multipart
    @POST("btb/{id}/status")
    suspend fun uploadStatus(
        @Path("id") id: String,
        @Part("type") type: RequestBody,
        @Part("caption") caption: RequestBody,
        @Part("bgColor") bgColor: RequestBody,
        @Part("font") font: RequestBody,
        @Part file: MultipartBody.Part?,
    ): JobStartDto

    @GET("btb/{id}/status-job/{jobId}")
    suspend fun statusJob(@Path("id") id: String, @Path("jobId") jobId: String): JobDto
}
