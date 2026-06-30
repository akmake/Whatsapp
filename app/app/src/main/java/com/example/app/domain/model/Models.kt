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
)

data class Viewer(
    val jid: String,
    val phone: String?,
    val name: String?,
    val pushName: String?,
    val viewedAt: String?,
    val statusesViewed: Int?,
)
