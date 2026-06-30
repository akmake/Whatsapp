package com.example.app.ui.common

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.app.ui.theme.CardBorder
import com.example.app.ui.theme.Ink
import com.example.app.ui.theme.Muted

/** ממיר data:image/...;base64,XXXX ל-ImageBitmap (thumbnail של סטטוס). */
fun decodeDataUrl(dataUrl: String?): ImageBitmap? {
    if (dataUrl.isNullOrBlank() || !dataUrl.startsWith("data:")) return null
    return try {
        val base64 = dataUrl.substringAfter(",", "")
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (e: Exception) {
        null
    }
}

@Composable
fun rememberDataUrlBitmap(dataUrl: String?): ImageBitmap? =
    remember(dataUrl) { decodeDataUrl(dataUrl) }

@Composable
fun MetricCard(label: String, value: String, sub: String? = null, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(label, color = Muted, fontSize = 12.sp)
            Text(value, color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            if (!sub.isNullOrBlank()) Text(sub, color = Muted, fontSize = 11.sp)
        }
    }
}
