package com.example.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.Viewer
import com.example.app.domain.model.MediaSpec
import com.example.app.ui.theme.*

private fun viewerName(v: Viewer) = v.name ?: v.pushName ?: v.phone ?: "צופה לא מזוהה"

@Composable
fun ViewersDialog(status: StatusItem, viewers: List<Viewer>?, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        Surface(shape = RoundedCornerShape(24.dp), color = WaSurface, modifier = Modifier.fillMaxWidth().heightIn(max = 650.dp)) {
            Column {
                Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 18.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("פרטי הסטטוס", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        Text("כל המידע, בלי חיתוכים", color = Muted, fontSize = 12.sp)
                    }
                    IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "סגור") }
                }
                HorizontalDivider(color = CardBorder)
                LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp)) {
                    item {
                        Text("תוכן", color = Muted, fontSize = 12.sp)
                        Text(status.caption.ifBlank { "ללא כיתוב" }, color = Ink, fontSize = 15.sp, modifier = Modifier.padding(top = 4.dp))
                        Text("סוג: ${status.mediaType}  •  מזהה: ${status.msgId.ifBlank { status.id }}", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                        Row(Modifier.padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Visibility, null, tint = WaGreen)
                            Text("${status.viewsCount} צפיות", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
                        }
                        status.mediaProbe?.let { MediaQualityTable(it) }
                        Text("מי צפה", color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
                    }
                    when {
                        viewers == null -> item { Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = WaGreen) } }
                        viewers.isEmpty() -> item { Text("אין עדיין צפיות מתועדות.", color = Muted, modifier = Modifier.padding(vertical = 20.dp)) }
                        else -> itemsIndexed(viewers) { index, viewer ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(42.dp).background(WaLightGreen, CircleShape), contentAlignment = Alignment.Center) { Text(viewerName(viewer).take(1), color = WaDarkGreen, fontWeight = FontWeight.Bold) }
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(viewerName(viewer), color = Ink, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(viewer.phone ?: viewer.jid, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Text("${index + 1}", color = Muted, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaQualityTable(probe: com.example.app.domain.model.MediaProbe) {
    val stages = listOf(
        Triple("מקור", probe.original, probe.originalBytes),
        Triple("נשלח", probe.sent, probe.sentBytes),
        Triple("WhatsApp", probe.roundtrip, probe.roundtripBytes),
    )
    val video = stages.any { it.second?.kind == "video" }
    val rows: List<Pair<String, (MediaSpec?) -> String?>> = if (video) listOf(
        "קודק" to { p -> p?.video?.codec?.let { "$it ${p.video.profile.orEmpty()}".trim() } },
        "רזולוציה" to { p -> p?.video?.let { v -> if (v.width != null && v.height != null) "${v.width}×${v.height}" else null } },
        "FPS" to { p -> p?.video?.fps?.let(::formatFps) },
        "Bitrate" to { p -> p?.video?.bitrate ?: p?.totalBitrate },
        "צבע" to { p -> p?.video?.let { v -> listOfNotNull(v.colorSpace, v.colorTransfer).joinToString("/").ifBlank { null } } },
        "משך" to { p -> p?.durationSec?.let { "%.1fs".format(it) } },
    ) else listOf(
        "פורמט" to { p -> p?.format },
        "רזולוציה" to { p -> if (p?.width != null && p.height != null) "${p.width}×${p.height}" else null },
    )

    Column(Modifier.fillMaxWidth().padding(bottom = 20.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFFF7F8FA))) {
        Text("בדיקת איכות — מה WhatsApp שינתה", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(12.dp))
        HorizontalDivider(color = CardBorder)
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("", modifier = Modifier.weight(.85f))
            stages.forEach { Text(it.first, color = Muted, fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f)) }
        }
        rows.forEach { (label, value) ->
            HorizontalDivider(color = CardBorder.copy(alpha = .65f))
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = Muted, fontSize = 10.sp, modifier = Modifier.weight(.85f))
                stages.forEach { stage ->
                    Text(value(stage.second) ?: if (stage.first == "WhatsApp") "…" else "—", color = Ink, fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 2, modifier = Modifier.weight(1f))
                }
            }
        }
        HorizontalDivider(color = CardBorder)
        Row(Modifier.fillMaxWidth().padding(vertical = 9.dp, horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("גודל", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(.85f))
            stages.forEach { stage ->
                Text(stage.third?.let(::formatBytes) ?: if (stage.first == "WhatsApp") "…" else "—", color = Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
    }
}

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> "%.2f MB".format(bytes / 1024.0 / 1024.0)
    bytes >= 1024L -> "%.1f KB".format(bytes / 1024.0)
    else -> "$bytes B"
}

private fun formatFps(value: String): String {
    val parts = value.split('/')
    val n = parts.getOrNull(0)?.toDoubleOrNull() ?: return value
    val d = parts.getOrNull(1)?.toDoubleOrNull() ?: return value
    return if (d != 0.0) "%.0f".format(n / d) else value
}
