package com.example.app.data.remote.dto

import com.squareup.moshi.Json

// ─── auth ─────────────────────────────────────────────────────────
data class LoginRequest(val email: String, val password: String)

data class UserDto(
    @Json(name = "_id") val id: String?,
    val email: String?,
    val role: String?,
    val btbAccountId: String?,
    val name: String?,
)

data class LoginResponse(
    val status: String?,
    val token: String?,
    val data: UserData?,
)

data class MeResponse(val status: String?, val data: UserData?)
data class UserData(val user: UserDto?)

// ─── account / stats ──────────────────────────────────────────────
data class ClientLoginDto(val email: String?, val active: Boolean?)

data class AccountDto(
    @Json(name = "_id") val id: String?,
    val name: String?,
    val phone: String?,
    val active: Boolean?,
    val targetFollowers: Int?,
    val createdAt: String?,
    val waStatus: String?,
    val client: ClientLoginDto?,
)

data class StatsDto(
    val totalStatuses: Int?,
    val uniqueViewers: Int?,
    val totalViews: Int?,
    val targetFollowers: Int?,
    val targetReached: Boolean?,
    val waStatus: String?,
)

// ─── statuses / viewers ───────────────────────────────────────────
data class StatusDto(
    @Json(name = "_id") val id: String?,
    val msgId: String?,
    val postedAt: String?,
    val mediaType: String?,
    val caption: String?,
    val thumbnail: String?,
    val bgColor: String?,
    val viewsCount: Int?,
    val mediaProbe: MediaProbeDto?,
)

data class MediaProbeDto(
    val original: MediaSpecDto?,
    val sent: MediaSpecDto?,
    val roundtrip: MediaSpecDto?,
    val originalBytes: Long?,
    val sentBytes: Long?,
    val roundtripBytes: Long?,
)

data class MediaSpecDto(
    val kind: String?,
    val format: String?,
    val width: Int?,
    val height: Int?,
    val durationSec: Double?,
    val totalBitrate: String?,
    val video: VideoSpecDto?,
)

data class VideoSpecDto(
    val codec: String?,
    val profile: String?,
    val width: Int?,
    val height: Int?,
    val pixFmt: String?,
    val fps: String?,
    val bitrate: String?,
    val colorRange: String?,
    val colorSpace: String?,
    val colorTransfer: String?,
    val colorPrimaries: String?,
    val bitsPerRawSample: Any?,
    val hdr: Boolean?,
)

data class ViewerDto(
    val viewerJid: String?,
    val phone: String?,
    val name: String?,
    val pushName: String?,
    val viewedAt: String?,
    val receiptType: String?,
    val statusesViewed: Int?,
)

// ─── upload job ───────────────────────────────────────────────────
data class JobStartDto(val jobId: String?)
data class JobResultDto(val count: Int?, val recipients: Int?)
data class JobDto(val status: String?, val result: JobResultDto?, val error: String?)

data class AudienceDto(val count: Int?)
