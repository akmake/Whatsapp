package com.example.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// פלטת BTB — תואם לאתר
val Navy = Color(0xFF1F3A5F)
val BlueAccent = Color(0xFF3B82F6)
val AppBg = Color(0xFFF3F4F6)   // gray-100/50
val Ink = Color(0xFF111B21)
val Muted = Color(0xFF8696A0)
val CardBorder = Color(0xFFF0F1F2)
val Green = Color(0xFF15803D)
val GreenBg = Color(0xFFDCFCE7)
val RedInk = Color(0xFFDC2626)
val Amber = Color(0xFFB45309)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    secondary = BlueAccent,
    onSecondary = Color.White,
    background = AppBg,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
)

@Composable
fun BtbTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = Typography(),
        content = content,
    )
}
