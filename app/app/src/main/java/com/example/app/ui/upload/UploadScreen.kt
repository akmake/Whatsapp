package com.example.app.ui.upload

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.example.app.ui.theme.*
import kotlinx.coroutines.delay

private val textColors = listOf("#0B6B45", "#7F66FF", "#C94C4C", "#245A7A", "#B76E00", "#111B21")

@Composable
fun UploadScreen(onDone: () -> Unit, vm: UploadViewModel = hiltViewModel()) {
    var discardDialog by remember { mutableStateOf(false) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> uri?.let { vm.updateType("image"); vm.setFile(it) } }
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> uri?.let { vm.updateType("video"); vm.setFile(it) } }

    LaunchedEffect(vm.doneCount) {
        if (vm.doneCount != null) { delay(1100); onDone() }
    }

    fun requestClose() {
        if (vm.uri != null || vm.caption.isNotBlank()) discardDialog = true else onDone()
    }
    BackHandler(onBack = ::requestClose)

    when {
        vm.type == "text" -> TextStatusEditor(vm, ::requestClose)
        vm.uri != null -> MediaStatusEditor(
            vm = vm,
            onClose = ::requestClose,
            onReplace = { if (vm.type == "video") videoPicker.launch("video/*") else imagePicker.launch("image/*") },
        )
        else -> StatusTypePicker(
            onClose = onDone,
            onImage = { imagePicker.launch("image/*") },
            onVideo = { videoPicker.launch("video/*") },
            onText = { vm.updateType("text") },
        )
    }

    if (discardDialog) {
        AlertDialog(
            onDismissRequest = { discardDialog = false },
            title = { Text("לצאת מהסטטוס?") },
            text = { Text("השינויים שביצעת לא יישמרו.") },
            confirmButton = { TextButton(onClick = onDone) { Text("יציאה", color = RedInk) } },
            dismissButton = { TextButton(onClick = { discardDialog = false }) { Text("המשך עריכה") } },
        )
    }

    if (vm.uploading || vm.doneCount != null) UploadOverlay(done = vm.doneCount != null, count = vm.doneCount)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatusTypePicker(onClose: () -> Unit, onImage: () -> Unit, onVideo: () -> Unit, onText: () -> Unit) {
    Scaffold(
        containerColor = WaSurface,
        topBar = {
            TopAppBar(
                title = { Text("סטטוס חדש", color = Ink, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "סגור") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = WaSurface),
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp)) {
            Text("מה תרצו לשתף?", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 18.dp))
            Text("בחרו סוג סטטוס והתחילו ליצור", color = Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 5.dp, bottom = 26.dp))
            CreateOption(Icons.Outlined.AddPhotoAlternate, "תמונה", "בחירה מהגלריה", Color(0xFF53BDEB), onImage)
            CreateOption(Icons.Outlined.Videocam, "וידאו", "בחירת סרטון מהמכשיר", Color(0xFF7F66FF), onVideo)
            CreateOption(Icons.Outlined.EditNote, "טקסט", "כתיבת עדכון צבעוני", WaGreen, onText)
            Spacer(Modifier.weight(1f))
            Text("הסטטוס יפורסם לאנשי הקשר המחוברים לחשבון", color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp))
        }
    }
}

@Composable
private fun CreateOption(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, color: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(18.dp))
            .background(Color(0xFFF7F8FA)).clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(54.dp).background(color, CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 15.dp)) {
            Text(title, color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 2.dp))
        }
        Icon(Icons.Outlined.ChevronLeft, null, tint = Muted)
    }
}

@Composable
private fun MediaStatusEditor(vm: UploadViewModel, onClose: () -> Unit, onReplace: () -> Unit) {
    val focus = LocalFocusManager.current
    Box(Modifier.fillMaxSize().background(Color(0xFF0B141A)).navigationBarsPadding()) {
        if (vm.type == "image") {
            AsyncImage(model = vm.uri, contentDescription = "תצוגה מקדימה", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
        } else {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Outlined.PlayCircle, null, tint = Color.White, modifier = Modifier.size(88.dp))
                Text(vm.fileName ?: "הווידאו מוכן לפרסום", color = Color.White, fontSize = 14.sp, modifier = Modifier.padding(18.dp))
            }
        }

        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            DarkIconButton(onClose) { Icon(Icons.Outlined.Close, "סגור", tint = Color.White) }
            DarkIconButton(onReplace) { Icon(Icons.Outlined.Collections, "החלפת מדיה", tint = Color.White) }
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().imePadding().background(Color(0xB30B141A)).padding(horizontal = 12.dp, vertical = 10.dp)) {
            vm.error?.let { Text(it, color = Color(0xFFFF8A9D), fontSize = 13.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) }
            Row(verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(
                    value = vm.caption, onValueChange = { vm.caption = it },
                    placeholder = { Text("הוספת כיתוב…", color = Color(0xFFB9C2C7)) },
                    maxLines = 4, shape = RoundedCornerShape(25.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                        focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                        focusedContainerColor = Color(0xFF202C33), unfocusedContainerColor = Color(0xFF202C33),
                    ),
                    modifier = Modifier.weight(1f),
                )
                SendButton(enabled = !vm.uploading) { focus.clearFocus(); vm.submit() }
            }
        }
    }
}

@Composable
private fun TextStatusEditor(vm: UploadViewModel, onClose: () -> Unit) {
    val focusRequester = remember { FocusRequester() }
    val bg = Color(android.graphics.Color.parseColor(vm.bgColor))
    val fontStyle = when (vm.font % 3) {
        1 -> TextStyle(fontSize = 29.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Serif)
        2 -> TextStyle(fontSize = 27.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace)
        else -> TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.SansSerif)
    }
    LaunchedEffect(Unit) { delay(250); focusRequester.requestFocus() }

    Box(Modifier.fillMaxSize().background(bg).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            DarkIconButton(onClose) { Icon(Icons.Outlined.Close, "סגור", tint = Color.White) }
            Row {
                DarkIconButton({ vm.font = (vm.font + 1) % 3 }) { Text("T", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold) }
                DarkIconButton({
                    val index = textColors.indexOf(vm.bgColor).let { if (it < 0) 0 else it }
                    vm.bgColor = textColors[(index + 1) % textColors.size]
                }) { Icon(Icons.Outlined.Palette, "החלפת צבע", tint = Color.White) }
            }
        }

        BasicTextField(
            value = vm.caption, onValueChange = { vm.caption = it },
            textStyle = fontStyle.copy(color = Color.White, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(Color.White),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
            keyboardActions = KeyboardActions(),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.Center) {
                    if (vm.caption.isBlank()) Text("כתבו סטטוס", color = Color.White.copy(alpha = .65f), style = fontStyle)
                    inner()
                }
            },
            modifier = Modifier.align(Alignment.Center).fillMaxWidth().padding(horizontal = 28.dp, vertical = 90.dp).focusRequester(focusRequester),
        )

        vm.error?.let { Text(it, color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.BottomStart).padding(start = 18.dp, bottom = 80.dp)) }
        SendButton(enabled = vm.caption.isNotBlank() && !vm.uploading, modifier = Modifier.align(Alignment.BottomEnd).padding(18.dp)) { vm.submit() }
    }
}

@Composable
private fun DarkIconButton(onClick: () -> Unit, content: @Composable () -> Unit) {
    Surface(onClick = onClick, color = Color(0x66000000), shape = CircleShape, modifier = Modifier.size(44.dp)) {
        Box(contentAlignment = Alignment.Center, content = { content() })
    }
}

@Composable
private fun SendButton(enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    FloatingActionButton(
        onClick = { if (enabled) onClick() }, modifier = modifier.padding(start = 10.dp).size(54.dp),
        containerColor = if (enabled) WaGreen else Color(0xFF50626B), contentColor = Color.White,
    ) { Icon(Icons.Filled.Send, "פרסום", modifier = Modifier.size(23.dp)) }
}

@Composable
private fun UploadOverlay(done: Boolean, count: Int?) {
    Box(Modifier.fillMaxSize().background(Color(0x99000000)), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(24.dp), color = WaSurface) {
            Column(Modifier.padding(horizontal = 34.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (done) {
                    Box(Modifier.size(58.dp).background(WaLightGreen, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Check, null, tint = WaDarkGreen, modifier = Modifier.size(32.dp)) }
                    Text("הסטטוס פורסם", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp))
                    if ((count ?: 0) > 1) Text("פורסמו $count חלקים", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                } else {
                    CircularProgressIndicator(color = WaGreen)
                    Text("מפרסם את הסטטוס…", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
                    Text("בווידאו ארוך זה עשוי לקחת מעט זמן", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}
