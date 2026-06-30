package com.example.app.data.repository

import com.example.app.data.remote.ApiService
import com.example.app.domain.model.Account
import com.example.app.domain.model.MediaProbe
import com.example.app.domain.model.MediaSpec
import com.example.app.domain.model.Stats
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.VideoSpec
import com.example.app.domain.model.Viewer
import com.example.app.domain.repository.BtbRepository
import kotlinx.coroutines.delay
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BtbRepositoryImpl @Inject constructor(
    private val api: ApiService,
) : BtbRepository {

    override suspend fun account(id: String): Account {
        val a = api.account(id)
        return Account(
            id = a.id.orEmpty(),
            name = a.name.orEmpty(),
            phone = a.phone.orEmpty(),
            waStatus = a.waStatus ?: "disconnected",
            targetFollowers = a.targetFollowers ?: 1000,
        )
    }

    override suspend fun stats(id: String): Stats {
        val s = api.stats(id)
        return Stats(
            totalStatuses = s.totalStatuses ?: 0,
            uniqueViewers = s.uniqueViewers ?: 0,
            totalViews = s.totalViews ?: 0,
            targetFollowers = s.targetFollowers ?: 1000,
            targetReached = s.targetReached ?: false,
            waStatus = s.waStatus ?: "disconnected",
        )
    }

    override suspend fun statuses(id: String): List<StatusItem> =
        api.statuses(id).map {
            StatusItem(
                id = it.id.orEmpty(),
                msgId = it.msgId.orEmpty(),
                postedAt = it.postedAt,
                mediaType = it.mediaType ?: "unknown",
                caption = it.caption.orEmpty(),
                thumbnail = it.thumbnail.orEmpty(),
                bgColor = it.bgColor.orEmpty(),
                viewsCount = it.viewsCount ?: 0,
                mediaProbe = it.mediaProbe?.let { p ->
                    MediaProbe(
                        original = p.original?.toModel(), sent = p.sent?.toModel(), roundtrip = p.roundtrip?.toModel(),
                        originalBytes = p.originalBytes, sentBytes = p.sentBytes, roundtripBytes = p.roundtripBytes,
                    )
                },
            )
        }

    override suspend fun statusViewers(id: String, statusId: String): List<Viewer> =
        api.statusViewers(id, statusId).map { it.toViewer() }

    override suspend fun topViewers(id: String): List<Viewer> =
        api.topViewers(id).map { it.toViewer() }

    override suspend fun uploadAndAwait(
        id: String,
        type: String,
        caption: String,
        bgColor: String,
        font: Int,
        videoQuality: String,
        bytes: ByteArray?,
        fileName: String?,
        mime: String?,
    ): Result<Int> {
        return try {
            val text = "text/plain".toMediaTypeOrNull()
            val typeBody = type.toRequestBody(text)
            val captionBody = caption.toRequestBody(text)
            val bgBody = bgColor.toRequestBody(text)
            val fontBody = font.toString().toRequestBody(text)
            val videoQualityBody = videoQuality.toRequestBody(text)
            val filePart = bytes?.let {
                val body = it.toRequestBody((mime ?: "application/octet-stream").toMediaTypeOrNull(), 0, it.size)
                MultipartBody.Part.createFormData("file", fileName ?: "upload", body)
            }
            val start = api.uploadStatus(id, typeBody, captionBody, bgBody, fontBody, videoQualityBody, filePart)
            val jobId = start.jobId ?: return Result.failure(Exception("לא התקבל מזהה עבודה מהשרת"))

            val deadline = System.currentTimeMillis() + 600_000 // עד 10 דקות לוידאו כבד
            while (System.currentTimeMillis() < deadline) {
                delay(2500)
                val job = api.statusJob(id, jobId)
                when (job.status) {
                    "done" -> return Result.success(job.result?.count ?: 0)
                    "error" -> return Result.failure(Exception(job.error ?: "ההעלאה נכשלה"))
                    "notfound" -> return Result.failure(Exception("ההעלאה אבדה (השרת אותחל?)"))
                }
            }
            Result.failure(Exception("ההעלאה לוקחת יותר מדי זמן — נסה קובץ קצר/קל יותר"))
        } catch (e: Exception) {
            Result.failure(Exception("שגיאה בהעלאה: ${e.message ?: "תקשורת"}"))
        }
    }
}

private fun com.example.app.data.remote.dto.ViewerDto.toViewer() = Viewer(
    jid = viewerJid.orEmpty(),
    phone = phone,
    name = name,
    pushName = pushName,
    viewedAt = viewedAt,
    statusesViewed = statusesViewed,
)

private fun com.example.app.data.remote.dto.MediaSpecDto.toModel() = MediaSpec(
    kind = kind.orEmpty(), format = format, width = width, height = height,
    durationSec = durationSec, totalBitrate = totalBitrate,
    video = video?.let { v ->
        VideoSpec(
            codec = v.codec, profile = v.profile, width = v.width, height = v.height,
            pixFmt = v.pixFmt, fps = v.fps, bitrate = v.bitrate,
            colorRange = v.colorRange, colorSpace = v.colorSpace,
            colorTransfer = v.colorTransfer, colorPrimaries = v.colorPrimaries,
            bitsPerRawSample = v.bitsPerRawSample?.toString(), hdr = v.hdr,
        )
    },
)
