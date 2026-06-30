package com.example.app.ui.dashboard

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.Viewer
import com.example.app.ui.common.rememberDataUrlBitmap
import com.example.app.ui.theme.*
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class MainTab { Home, Statuses, Audience }

@Composable
fun DashboardScreen(onUpload: () -> Unit, vm: DashboardViewModel = hiltViewModel()) {
    var tab by rememberSaveable { mutableStateOf(MainTab.Home) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) vm.refresh() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(
        containerColor = WaSurface,
        topBar = { AppHeader(vm, tab) },
        bottomBar = { BottomNavigation(tab) { tab = it } },
        floatingActionButton = {
            FloatingActionButton(onClick = onUpload, containerColor = WaGreen, contentColor = Color.White, shape = RoundedCornerShape(17.dp)) {
                Icon(Icons.Filled.Add, "העלאת סטטוס", Modifier.size(28.dp))
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                vm.loading && vm.account == null -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = WaGreen)
                tab == MainTab.Home -> HomeTab(vm)
                tab == MainTab.Statuses -> StatusesTab(vm)
                else -> AudienceTab(vm)
            }
        }
    }
    vm.selStatus?.let { ViewersDialog(it, vm.selViewers, vm::closeViewers) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppHeader(vm: DashboardViewModel, tab: MainTab) {
    TopAppBar(
        title = {
            Column {
                Text(when (tab) { MainTab.Home -> "BTB"; MainTab.Statuses -> "עדכונים"; MainTab.Audience -> "קהל" }, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
                if (tab == MainTab.Home) Text(vm.account?.name ?: "", color = Muted, fontSize = 12.sp, maxLines = 1)
            }
        },
        actions = {
            IconButton(onClick = vm::refresh) { Icon(Icons.Outlined.Refresh, "רענון", tint = Ink) }
            IconButton(onClick = vm::logout) { Icon(Icons.Outlined.Logout, "התנתקות", tint = Ink) }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = WaSurface),
    )
}

@Composable
private fun BottomNavigation(selected: MainTab, onSelect: (MainTab) -> Unit) {
    NavigationBar(containerColor = WaSurface, tonalElevation = 3.dp) {
        NavigationBarItem(selected = selected == MainTab.Home, onClick = { onSelect(MainTab.Home) }, icon = { Icon(Icons.Outlined.Home, null) }, label = { Text("בית") }, colors = navColors())
        NavigationBarItem(selected = selected == MainTab.Statuses, onClick = { onSelect(MainTab.Statuses) }, icon = { Icon(Icons.Outlined.DonutLarge, null) }, label = { Text("עדכונים") }, colors = navColors())
        NavigationBarItem(selected = selected == MainTab.Audience, onClick = { onSelect(MainTab.Audience) }, icon = { Icon(Icons.Outlined.Groups, null) }, label = { Text("קהל") }, colors = navColors())
    }
}

@Composable private fun navColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = WaDarkGreen, selectedTextColor = Ink, indicatorColor = WaLightGreen,
    unselectedIconColor = Muted, unselectedTextColor = Muted,
)

@Composable
private fun HomeTab(vm: DashboardViewModel) {
    val account = vm.account
    val stats = vm.stats
    val connected = account?.waStatus == "connected"
    val target = (stats?.targetFollowers ?: account?.targetFollowers ?: 1000).coerceAtLeast(1)
    val progress = ((stats?.uniqueViewers ?: 0).toFloat() / target).coerceIn(0f, 1f)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Surface(color = if (connected) WaLightGreen else Color(0xFFFFF1D6), shape = RoundedCornerShape(18.dp)) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).background(if (connected) WaGreen else Amber, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(if (connected) Icons.Outlined.Check else Icons.Outlined.LinkOff, null, tint = Color.White)
                    }
                    Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
                        Text(if (connected) "WhatsApp מחובר" else "WhatsApp לא מחובר", fontWeight = FontWeight.Bold, color = Ink)
                        Text(if (connected) account?.phone.orEmpty() else "יש לפנות למנהל לחיבור החשבון", color = Muted, fontSize = 13.sp)
                    }
                }
            }
        }
        vm.error?.let { message -> item { ErrorCard(message, vm::refresh) } }
        item { Text("סקירה", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.padding(top = 6.dp)) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BigMetric("צופים ייחודיים", stats?.uniqueViewers ?: 0, Icons.Outlined.People, Modifier.weight(1f))
                BigMetric("צפיות", stats?.totalViews ?: 0, Icons.Outlined.Visibility, Modifier.weight(1f))
            }
        }
        item {
            Surface(shape = RoundedCornerShape(18.dp), color = Color(0xFFF7F8FA), border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)) {
                Column(Modifier.padding(18.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("התקדמות ליעד", fontWeight = FontWeight.Bold, color = Ink)
                        Text("${stats?.uniqueViewers ?: 0} / $target", color = WaDarkGreen, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().padding(top = 14.dp).height(9.dp).clip(CircleShape), color = WaGreen, trackColor = CardBorder)
                    Text("${(progress * 100).toInt()}% מהיעד", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 9.dp))
                }
            }
        }
        item { Text("פעילות אחרונה", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.padding(top = 8.dp)) }
        if (vm.statuses.isEmpty()) item { EmptyState("אין עדיין סטטוסים", "הסטטוס הראשון שלך יופיע כאן") }
        else items(vm.statuses.take(3), key = { it.id }) { StatusRow(it) { vm.openViewers(it) } }
        item { Spacer(Modifier.height(78.dp)) }
    }
}

@Composable
private fun StatusesTab(vm: DashboardViewModel) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item {
            Surface(color = Color(0xFFF0F2F5), shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Search, null, tint = Muted)
                    Text("חיפוש בעדכונים", color = Muted, modifier = Modifier.padding(horizontal = 10.dp))
                }
            }
        }
        item { Text("הסטטוסים שלי", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.padding(vertical = 8.dp)) }
        if (vm.statuses.isEmpty()) item { EmptyState("אין סטטוסים", "לחץ על הכפתור הירוק כדי לפרסם") }
        else items(vm.statuses, key = { it.id }) { StatusRow(it) { vm.openViewers(it) } }
        item { Spacer(Modifier.height(78.dp)) }
    }
}

@Composable
private fun AudienceTab(vm: DashboardViewModel) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
        item { Text("גרעין העוקבים", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink) }
        item { Text("האנשים שמעורבים הכי הרבה בסטטוסים שלך", color = Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)) }
        if (vm.followers.isEmpty()) item { EmptyState("אין עדיין נתוני קהל", "לאחר צפיות בסטטוסים הקהל יופיע כאן") }
        else items(vm.followers, key = { it.jid }) { viewer -> ViewerRow(vm.followers.indexOf(viewer) + 1, viewer) }
        item { Spacer(Modifier.height(78.dp)) }
    }
}

@Composable
private fun BigMetric(label: String, value: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier) {
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = Color(0xFFF7F8FA), border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)) {
        Column(Modifier.padding(17.dp)) {
            Icon(icon, null, tint = WaGreen, modifier = Modifier.size(25.dp))
            Text(value.toString(), fontSize = 29.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.padding(top = 12.dp))
            Text(label, fontSize = 13.sp, color = Muted)
        }
    }
}

@Composable
private fun StatusRow(status: StatusItem, onClick: () -> Unit) {
    val bmp = rememberDataUrlBitmap(status.thumbnail)
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(66.dp).clip(CircleShape).background(if (status.mediaType == "text") parseColor(status.bgColor) else Color(0xFFF0F2F5)), contentAlignment = Alignment.Center) {
            if (bmp != null) Image(bmp, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Icon(when (status.mediaType) { "video" -> Icons.Outlined.Videocam; "image" -> Icons.Outlined.Image; else -> Icons.Outlined.TextFields }, null, tint = if (status.mediaType == "text") Color.White else Muted)
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(status.caption.ifBlank { when (status.mediaType) { "video" -> "סטטוס וידאו"; "image" -> "סטטוס תמונה"; else -> "סטטוס טקסט" } }, color = Ink, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(formatDate(status.postedAt), color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Outlined.Visibility, null, tint = WaGreen, modifier = Modifier.size(20.dp))
            Text(status.viewsCount.toString(), color = Muted, fontSize = 12.sp)
        }
    }
    HorizontalDivider(color = CardBorder, modifier = Modifier.padding(start = 80.dp))
}

@Composable
private fun ViewerRow(index: Int, viewer: Viewer) {
    val name = viewer.name ?: viewer.pushName ?: viewer.phone ?: "צופה לא מזוהה"
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(50.dp).background(avatarColor(index), CircleShape), contentAlignment = Alignment.Center) { Text(name.take(1), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 19.sp) }
        Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
            Text(name, color = Ink, fontWeight = FontWeight.SemiBold, maxLines = 1)
            viewer.phone?.let { Text(it, color = Muted, fontSize = 13.sp) }
        }
        Surface(color = WaLightGreen, shape = CircleShape) { Text("${viewer.statusesViewed ?: 0} צפיות", color = WaDarkGreen, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)) }
    }
}

@Composable private fun EmptyState(title: String, subtitle: String) = Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Box(Modifier.size(72.dp).background(Color(0xFFF0F2F5), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.DonutLarge, null, tint = Muted, modifier = Modifier.size(34.dp)) }
    Text(title, color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp))
    Text(subtitle, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
}

@Composable private fun ErrorCard(message: String, retry: () -> Unit) = Surface(color = Color(0xFFFFE8EC), shape = RoundedCornerShape(14.dp)) {
    Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Text(message, color = RedInk, fontSize = 13.sp, modifier = Modifier.weight(1f)); TextButton(onClick = retry) { Text("נסה שוב") } }
}

private fun formatDate(value: String?): String = try {
    OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("dd/MM/yyyy · HH:mm", Locale("he")))
} catch (_: Exception) { value ?: "תאריך לא זמין" }

private fun parseColor(value: String): Color = runCatching { Color(android.graphics.Color.parseColor(value.ifBlank { "#008069" })) }.getOrDefault(WaGreen)
private fun avatarColor(index: Int) = listOf(Color(0xFF53BDEB), Color(0xFF7F66FF), Color(0xFFE56B6F), Color(0xFF00A884))[index % 4]
