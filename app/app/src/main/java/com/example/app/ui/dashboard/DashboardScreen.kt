package com.example.app.ui.dashboard

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.Viewer
import com.example.app.ui.common.MetricCard
import com.example.app.ui.common.rememberDataUrlBitmap
import com.example.app.ui.theme.AppBg
import com.example.app.ui.theme.BlueAccent
import com.example.app.ui.theme.CardBorder
import com.example.app.ui.theme.Green
import com.example.app.ui.theme.GreenBg
import com.example.app.ui.theme.Ink
import com.example.app.ui.theme.Muted
import com.example.app.ui.theme.Navy

private fun mediaIcon(t: String) = when (t) {
    "image" -> "🖼️"; "video" -> "🎬"; "text" -> "📝"; else -> "🕓"
}

private fun viewerLabel(v: Viewer) = v.name ?: v.pushName ?: v.phone ?: "לא זוהה"

@Composable
fun DashboardScreen(onUpload: () -> Unit, vm: DashboardViewModel = hiltViewModel()) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refresh() }
    val account = vm.account
    val stats = vm.stats
    val connected = account?.waStatus == "connected"
    val target = (stats?.targetFollowers ?: account?.targetFollowers ?: 1000).coerceAtLeast(1)
    val pct = if (stats != null) ((stats.uniqueViewers.toFloat() / target) * 100).toInt().coerceIn(0, 100) else 0

    Box(Modifier.fillMaxSize().background(AppBg)) {
        if (vm.loading && account == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Navy)
            return@Box
        }

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        ) {
            // ── header ──
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(account?.name ?: "—", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(account?.phone ?: "", color = Muted, fontSize = 13.sp)
                }
                StatusBadge(account?.waStatus ?: "disconnected")
                TextButton(onClick = { vm.logout() }) { Text("התנתק", color = Muted) }
            }

            if (!connected) {
                Text(
                    "ממתין לחיבור הוואטסאפ ע״י המנהל",
                    color = com.example.app.ui.theme.Amber, fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            vm.error?.let {
                Text(it, color = com.example.app.ui.theme.RedInk, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
            }

            // ── upload button ──
            if (connected) {
                Button(
                    onClick = onUpload,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BlueAccent),
                    modifier = Modifier.fillMaxWidth().height(46.dp).padding(top = 14.dp),
                ) { Text("＋ העלה סטטוס", color = Color.White, fontWeight = FontWeight.Bold) }
            }

            // ── metrics ──
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCard("סטטוסים", "${stats?.totalStatuses ?: "—"}", modifier = Modifier.weight(1f))
                MetricCard("צופים ייחודיים", "${stats?.uniqueViewers ?: "—"}", "יעד: $target", modifier = Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCard("סך צפיות", "${stats?.totalViews ?: "—"}", modifier = Modifier.weight(1f))
                MetricCard("התקדמות ליעד", "$pct%", if (stats?.targetReached == true) "🎯 היעד הושג!" else null, modifier = Modifier.weight(1f))
            }

            // progress
            Box(
                Modifier.fillMaxWidth().padding(top = 14.dp).height(10.dp)
                    .clip(RoundedCornerShape(50)).background(Color(0xFFE5E7EB)),
            ) {
                Box(Modifier.fillMaxWidth(pct / 100f).height(10.dp).clip(RoundedCornerShape(50)).background(BlueAccent))
            }

            // ── statuses ──
            SectionTitle("סטטוסים — לחץ לצפייה במי שצפה")
            if (vm.statuses.isEmpty()) {
                EmptyCard("עדיין אין סטטוסים. העלה סטטוס וצפה כאן.")
            } else {
                vm.statuses.chunked(3).forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { s ->
                            Box(Modifier.weight(1f)) { StatusCard(s) { vm.openViewers(s) } }
                        }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }

            // ── followers ──
            SectionTitle("גרעין העוקבים")
            Column(
                Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(vertical = 4.dp),
            ) {
                if (vm.followers.isEmpty()) {
                    Text("עדיין אין צפיות מתועדות.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                } else {
                    vm.followers.forEachIndexed { i, v ->
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("${i + 1}", color = Color(0xFFCBD5E1), fontSize = 12.sp, modifier = Modifier.width(24.dp))
                            Text(viewerLabel(v), color = Ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            Text("${v.statusesViewed ?: 0}", color = Navy, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    vm.selStatus?.let { ViewersDialog(it, vm.selViewers, vm::closeViewers) }
}

@Composable
private fun StatusBadge(status: String) {
    val (label, bg, fg) = when (status) {
        "connected" -> Triple("מחובר", GreenBg, Green)
        "connecting", "waiting_qr" -> Triple("מתחבר…", Color(0xFFFEF9C3), Color(0xFFA16207))
        else -> Triple("מנותק", Color(0xFFFEE2E2), com.example.app.ui.theme.RedInk)
    }
    Box(Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 4.dp)) {
        Text(label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, color = Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 22.dp, bottom = 10.dp))
}

@Composable
private fun EmptyCard(t: String) {
    Box(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(28.dp), contentAlignment = Alignment.Center) {
        Text(t, color = Muted, fontSize = 13.sp)
    }
}

@Composable
private fun StatusCard(s: StatusItem, onClick: () -> Unit) {
    val bmp = rememberDataUrlBitmap(s.thumbnail)
    Column(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).clickable { onClick() },
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f).background(Color(0xFFF1F1F1)), contentAlignment = Alignment.Center) {
            if (bmp != null) {
                Image(bitmap = bmp, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else if (s.mediaType == "text") {
                val c = runCatching { Color(android.graphics.Color.parseColor(s.bgColor.ifBlank { "#1F3A5F" })) }.getOrDefault(Navy)
                Box(Modifier.fillMaxSize().background(c).padding(8.dp), contentAlignment = Alignment.Center) {
                    Text(s.caption.ifBlank { "טקסט" }, color = Color.White, fontSize = 11.sp)
                }
            } else {
                Text(mediaIcon(s.mediaType), fontSize = 32.sp)
            }
            // views overlay
            Box(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xB3000000))))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Text("👁 ${s.viewsCount}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
