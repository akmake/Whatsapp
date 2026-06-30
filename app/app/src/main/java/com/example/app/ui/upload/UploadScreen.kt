package com.example.app.ui.upload

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.app.ui.theme.AppBg
import com.example.app.ui.theme.BlueAccent
import com.example.app.ui.theme.CardBorder
import com.example.app.ui.theme.Ink
import com.example.app.ui.theme.Muted
import com.example.app.ui.theme.Navy
import com.example.app.ui.theme.RedInk

private val TABS = listOf("image" to "תמונה", "video" to "ווידאו", "text" to "טקסט")

@Composable
fun UploadScreen(onDone: () -> Unit, vm: UploadViewModel = hiltViewModel()) {
    // סיום מוצלח → חזרה לדשבורד (שיתרענן)
    LaunchedEffect(vm.doneCount) { if (vm.doneCount != null) onDone() }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        vm.setFile(uri)
    }

    Column(Modifier.fillMaxSize().background(AppBg).padding(16.dp)) {
        // top bar
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onDone) { Text("ביטול", color = Muted) }
            Text("העלאת סטטוס", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
        }

        // type tabs
        Row(
            Modifier.fillMaxWidth().padding(top = 12.dp).background(Color(0xFFEDEFF2), RoundedCornerShape(10.dp)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            TABS.forEach { (id, label) ->
                val active = vm.type == id
                Box(
                    Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                        .background(if (active) Color.White else Color.Transparent)
                        .clickable { vm.updateType(id) }.padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, color = if (active) Ink else Muted, fontSize = 14.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }

        // preview / picker
        Box(
            Modifier.fillMaxWidth().padding(top = 16.dp).aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(14.dp)).background(Color(0xFF111827)),
            contentAlignment = Alignment.Center,
        ) {
            when {
                vm.type == "text" -> Box(Modifier.fillMaxSize().background(Navy).padding(20.dp), contentAlignment = Alignment.Center) {
                    Text(vm.caption.ifBlank { "הקלד טקסט…" }, color = Color.White, fontSize = 18.sp)
                }
                vm.uri != null -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (vm.type == "video") "🎬" else "🖼️", fontSize = 44.sp)
                    Text(vm.fileName ?: "נבחר קובץ", color = Color.White, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                    TextButton(onClick = { picker.launch(if (vm.type == "video") "video/*" else "image/*") }) {
                        Text("החלף קובץ", color = BlueAccent)
                    }
                }
                else -> Column(
                    Modifier.clickable { picker.launch(if (vm.type == "video") "video/*" else "image/*") },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(if (vm.type == "video") "🎬" else "🖼️", fontSize = 44.sp)
                    Text("בחר ${if (vm.type == "video") "ווידאו" else "תמונה"}", color = Color(0xFF9CA3AF), fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        // caption / text
        OutlinedTextField(
            value = vm.caption,
            onValueChange = { vm.caption = it },
            label = { Text(if (vm.type == "text") "הטקסט שלך" else "כיתוב (יופיע מתחת לסטטוס)") },
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        )

        vm.error?.let { Text(it, color = RedInk, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp)) }

        Box(Modifier.weight(1f))

        Button(
            onClick = { vm.submit() },
            enabled = !vm.uploading,
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Navy),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (vm.uploading) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(20.dp).aspectRatio(1f))
            } else {
                Text("פרסם", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        if (vm.uploading) {
            Text(
                if (vm.type == "video") "מעבד ומעלה ווידאו — עשוי לקחת מספר שניות…" else "מעלה…",
                color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp).align(Alignment.CenterHorizontally),
            )
        }
    }
}
