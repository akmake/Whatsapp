package com.example.app.domain.model

data class UserInfo(
    val id: String,
    val email: String,
    val role: String,
    val btbAccountId: String?,
    val name: String?,
)

data class Account(
    val id: String,
    val name: String,
    val phone: String,
    val waStatus: String,
    val targetFollowers: Int,
)

data class Stats(
    val totalStatuses: Int,
    val uniqueViewers: Int,
    val totalViews: Int,
    val targetFollowers: Int,
    val targetReached: Boolean,
    val waStatus: String,
)

data class StatusItem(
    val id: String,
    val msgId: String,
    val postedAt: String?,
    val mediaType: String,
    val caption: String,
    val thumbnail: String,
    val bgColor: String,
    val viewsCount: Int,
    val mediaProbe: MediaProbe?,
)

data class MediaProbe(
    val original: MediaSpec?,
    val sent: MediaSpec?,
    val roundtrip: MediaSpec?,
    val originalBytes: Long?,
    val sentBytes: Long?,
    val roundtripBytes: Long?,
)

data class MediaSpec(
    val kind: String,
    val format: String?,
    val width: Int?,
    val height: Int?,
    val durationSec: Double?,
    val totalBitrate: String?,
    val video: VideoSpec?,
)

data class VideoSpec(
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
    val bitsPerRawSample: String?,
    val hdr: Boolean?,
)

data class Viewer(
    val jid: String,
    val phone: String?,
    val name: String?,
    val pushName: String?,
    val viewedAt: String?,
    val statusesViewed: Int?,
)
