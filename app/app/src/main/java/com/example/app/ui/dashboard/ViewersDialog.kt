package com.example.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.app.domain.model.StatusItem
import com.example.app.domain.model.Viewer
import com.example.app.ui.theme.Ink
import com.example.app.ui.theme.Muted
import com.example.app.ui.theme.Navy

private fun viewerName(v: Viewer) = v.name ?: v.pushName ?: v.phone ?: "לא זוהה"

@Composable
fun ViewersDialog(status: StatusItem, viewers: List<Viewer>?, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        Column(
            Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(16.dp)).padding(16.dp),
        ) {
            Text("צפו בסטטוס", color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("👁 ${status.viewsCount} צפיות", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))

            Box(Modifier.padding(top = 12.dp).heightIn(max = 360.dp)) {
                when {
                    viewers == null ->
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Navy)
                        }
                    viewers.isEmpty() ->
                        Text("אין צפיות מתועדות לסטטוס זה.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                    else ->
                        Column(Modifier.verticalScroll(rememberScrollState())) {
                            viewers.forEachIndexed { i, v ->
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("${i + 1}", color = Color(0xFFCBD5E1), fontSize = 12.sp, modifier = Modifier.width(24.dp))
                                        Text(viewerName(v), color = Ink, fontSize = 14.sp)
                                    }
                                }
                            }
                        }
                }
            }

            TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) {
                Text("סגור", color = Navy, fontWeight = FontWeight.Bold)
            }
        }
    }
}
