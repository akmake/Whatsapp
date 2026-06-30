package com.example.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// WhatsApp-inspired palette. Names kept where older screens still reference them.
val WaGreen = Color(0xFF1DAA61)
val WaDarkGreen = Color(0xFF0B6B45)
val WaLightGreen = Color(0xFFD9FDD3)
val WaSurface = Color(0xFFFFFFFF)
val AppBg = Color(0xFFF7F8FA)
val Ink = Color(0xFF111B21)
val Muted = Color(0xFF667781)
val CardBorder = Color(0xFFE9EDEF)
val Navy = WaDarkGreen
val BlueAccent = WaGreen
val Green = Color(0xFF008069)
val GreenBg = Color(0xFFD9FDD3)
val RedInk = Color(0xFFEA0038)
val Amber = Color(0xFFB76E00)

private val LightColors = lightColorScheme(
    primary = WaGreen,
    onPrimary = Color.White,
    primaryContainer = WaLightGreen,
    onPrimaryContainer = Ink,
    secondary = WaDarkGreen,
    background = AppBg,
    onBackground = Ink,
    surface = WaSurface,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF0F2F5),
    onSurfaceVariant = Muted,
    outline = CardBorder,
    error = RedInk,
)

@Composable
fun BtbTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightColors, typography = Typography(), content = content)
}
